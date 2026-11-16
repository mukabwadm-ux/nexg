-- Approved new-form merchants can go live.
--
-- Since c4338f3, approving an application takes the merchant live, and Take
-- live on the merchant record is the manual switch. Both call
-- rpc_merchant_go_live. But the application write guard from
-- 20261102000100 refused every write to a merchant row with an application
-- that set status 'live' or accepting_orders ("Use application commands;
-- operational activation is not available"), a placeholder for publication
-- work that was never built. So every real applicant stayed under review:
-- approval reported "not live" and Take live failed. The same rule refused
-- every later write to a live application merchant's row (the Discovery
-- switch, featured, deactivate, delete, busy mode).
--
-- The guard now:
--   * still requires the captured identity (business name, contact, category
--     and first activity) to mirror the application, so no older definer RPC
--     can overwrite it;
--   * lets a merchant become live, or start taking orders, only while its
--     current revision is the approved one: approval is the go-live decision;
--   * lets a merchant that is already live stay live, and one already taking
--     orders keep taking them, while a later edit waits for review, so staff
--     can still pause, hide, deactivate or delete it.
--
-- rpc_merchant_go_live says plainly when the application is not approved,
-- instead of surfacing the guard's message, and audits the real status it
-- left rather than a fixed 'under_review'.

create function authz.merchant_application_row_write_allowed(p_new jsonb, p_old jsonb)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from public.merchant_application a where a.merchant_id=(p_new->>'id')::uuid)
    or exists(select 1 from public.merchant_application a
      where a.merchant_id=(p_new->>'id')::uuid
        and p_new->>'trading_name'=a.payload#>>'{business,name}'
        and p_new->>'contact_name'=trim((a.payload#>>'{business,firstName}')||' '||(a.payload#>>'{business,lastName}'))
        and p_new->>'contact_phone'=a.payload#>>'{business,phone}'
        and nullif(p_new->>'contact_email','') is not distinct from nullif(a.payload#>>'{business,email}','')
        and p_new->>'category' is not distinct from nullif(a.payload->>'categoryId','')
        and p_new->>'subcategory' is not distinct from a.payload#>>'{subcategories,0}'
        and ((a.review_state='approved' and a.approved_revision=a.revision
              and a.submitted_revision=a.revision)
          or ((p_new->>'status'<>'live' or p_old->>'status'='live')
            and (not coalesce((p_new->>'accepting_orders')::boolean,false)
              or coalesce((p_old->>'accepting_orders')::boolean,false)))));
$$;

comment on function authz.merchant_application_row_write_allowed(jsonb, jsonb) is
  'Whether a merchant row write is allowed: always without an application; with one, the captured identity must mirror it, and becoming live or starting to take orders needs the current revision approved.';

alter function authz.merchant_application_row_write_allowed(jsonb, jsonb) set statement_timeout = '5s';
alter function authz.merchant_application_row_write_allowed(jsonb, jsonb) set lock_timeout = '2s';
revoke all on function authz.merchant_application_row_write_allowed(jsonb, jsonb) from public;
grant execute on function authz.merchant_application_row_write_allowed(jsonb, jsonb) to authenticated;

create or replace function public.tg_merchant_application_write_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not authz.merchant_application_row_write_allowed(to_jsonb(new), to_jsonb(old)) then
    raise exception 'Use application commands; operational activation is not available.' using errcode='42501';
  end if;
  if (new.payout_account is distinct from old.payout_account or new.payout_rail is distinct from old.payout_rail)
    and authz.merchant_application_has_capture(new.id) then
    raise exception 'Use the private payout declaration command.' using errcode='42501';
  end if;
  if (new.resume_token_hash is not null or new.resume_token_expires_at is not null)
    and authz.merchant_application_has_capture(new.id) then
    raise exception 'Resume this application through the existing signed-in account.' using errcode='42501';
  end if;
  return new;
end;
$$;

-- The one-argument form could not tell becoming live from staying live.
drop function authz.merchant_application_row_write_allowed(jsonb);

create or replace function public.rpc_merchant_go_live(p_merchant_id uuid, p_reason text default null)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_before public.partner_status;
  v_staff uuid;
  v_required int;
  v_verified int;
  v_branches int;
  v_review text;
begin
  select * into v_merchant from public.merchant where id = p_merchant_id for update;
  if v_merchant.id is null then
    raise exception 'No merchant with id %', p_merchant_id using errcode = 'no_data_found';
  end if;

  v_staff := authz.staff_id();
  if v_staff is null or not authz.can_manage_merchants(v_merchant.city_id) then
    raise exception 'You need merchant_ops or super_admin for this city to take a merchant live.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_merchant.status = 'live' then
    return v_merchant;
  end if;

  -- A new-form merchant goes live on the approval of its current revision.
  select a.review_state into v_review
  from public.merchant_application a
  where a.merchant_id = p_merchant_id
    and not (a.review_state = 'approved' and a.approved_revision = a.revision
             and a.submitted_revision = a.revision);

  if found then
    raise exception 'Approve this merchant''s application first (Merchants › Applications). Its current review state is %.',
      case when v_review = 'approved' then 'a newer revision waiting for review'
        else replace(v_review, '_', ' ') end
      using errcode = 'check_violation';
  end if;

  -- public.merchant_public exposes the primary branch; going live without one
  -- would publish a merchant nobody can be sent to.
  select count(*) into v_branches
  from public.merchant_branch b
  where b.merchant_id = p_merchant_id and b.is_primary;

  if v_branches = 0 then
    raise exception 'This merchant has no primary branch, so there is nowhere to send a rider.'
      using errcode = 'check_violation';
  end if;

  select
    count(*),
    count(*) filter (
      where exists (
        select 1 from public.document d
        where d.owner_type = 'merchant'
          and d.owner_id = p_merchant_id
          and d.requirement_id = q.id
          and d.superseded_at is null
          and d.status = 'verified'
      )
    )
  into v_required, v_verified
  from public.fn_merchant_required_docs(p_merchant_id) q;

  if v_verified < v_required then
    raise exception
      'This merchant has % of % required documents verified.', v_verified, v_required
      using errcode = 'check_violation';
  end if;

  v_before := v_merchant.status;

  update public.merchant
  set status = 'live',
      status_reason = p_reason,
      went_live_by = v_staff,
      went_live_at = now()
  where id = p_merchant_id
  returning * into v_merchant;

  perform audit.log(
    p_actor_type => 'staff',
    p_actor_id => v_staff,
    p_module => 'merchant',
    p_action => 'merchant.went_live',
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_before => jsonb_build_object('status', v_before),
    p_after => jsonb_build_object('status', 'live'),
    p_reason => p_reason,
    p_severity => 'notice',
    p_city_id => v_merchant.city_id
  );

  return v_merchant;
end;
$$;

comment on function public.rpc_merchant_go_live is
  'The only way a merchant reaches live, and therefore the only way one becomes publicly visible. A merchant with an application needs its current revision approved.';
