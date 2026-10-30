alter table public.merchant
  add column deleted_at timestamptz,
  add column deleted_until timestamptz,
  add column deleted_by uuid references public.staff_user (id) on delete set null,
  add column deletion_reason text,
  add column deletion_state jsonb,
  add column deleted_anonymized_at timestamptz,
  add constraint merchant_deleted_window_consistent check (
    (deleted_at is null) = (deleted_until is null)
  ),
  add constraint merchant_deletion_state_consistent check (
    (deleted_at is null) = (deletion_state is null)
  ),
  add constraint merchant_deleted_is_hidden check (
    deleted_at is null or (
      status <> 'live'
      and not accepting_orders
      and not featured
      and not explore_visible
      and not concierge_pick
    )
  );

create index merchant_deleted_retention_idx
  on public.merchant (deleted_until)
  where deleted_at is not null;

comment on column public.merchant.deleted_until is
  'End of the 90-day Deleted-tab recovery window. Expired profiles are anonymized by cron_merchant_deleted_retention; financial and audit records remain.';

insert into public.retention_rule (key, subject, retain_for, basis, anonymise)
values (
  'merchant_deleted',
  'Deleted merchant profiles',
  interval '90 days',
  'Recoverable merchant profile window; financial and audit history remains available for its retention period.',
  true
)
on conflict (key) do nothing;

create or replace function public.tg_merchant_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if authz.can_manage_merchants(coalesce(old.city_id, new.city_id)) then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.status_reason is distinct from old.status_reason
     or new.featured is distinct from old.featured
     or new.went_live_by is distinct from old.went_live_by
     or new.went_live_at is distinct from old.went_live_at
     or new.settlement_account is distinct from old.settlement_account
     or new.submitted_at is distinct from old.submitted_at
     or new.waitlisted_at is distinct from old.waitlisted_at
     or new.credentials_sent_at is distinct from old.credentials_sent_at
     or new.password_set_at is distinct from old.password_set_at
     or new.payout_name_lookup is distinct from old.payout_name_lookup
     or new.requires_ops_mapping is distinct from old.requires_ops_mapping
     or new.resume_token_hash is distinct from old.resume_token_hash
     or new.resume_token_expires_at is distinct from old.resume_token_expires_at
     or new.phone_code_hash is distinct from old.phone_code_hash
     or new.phone_code_expires_at is distinct from old.phone_code_expires_at
     or new.phone_code_attempts is distinct from old.phone_code_attempts
     or new.phone_verified_at is distinct from old.phone_verified_at
     or new.deactivated_at is distinct from old.deactivated_at
     or new.deactivated_by is distinct from old.deactivated_by
     or new.deactivation_reason is distinct from old.deactivation_reason
     or new.deactivation_state is distinct from old.deactivation_state
     or new.deleted_at is distinct from old.deleted_at
     or new.deleted_until is distinct from old.deleted_until
     or new.deleted_by is distinct from old.deleted_by
     or new.deletion_reason is distinct from old.deletion_reason
     or new.deletion_state is distinct from old.deletion_state
     or new.deleted_anonymized_at is distinct from old.deleted_anonymized_at
  then
    raise exception 'That is not yours to set.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create or replace function authz.is_merchant_member(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant_user mu
    join public.merchant m on m.id = mu.merchant_id
    where mu.merchant_id = p_merchant_id
      and mu.user_id = (select auth.uid())
      and m.deleted_at is null
  )
$$;

grant execute on function authz.is_merchant_member(uuid) to anon, authenticated, service_role;

create or replace function public.tg_merchant_block_deleted_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.merchant m
    where m.id = new.merchant_id
      and m.deleted_at is not null
  ) then
    raise exception 'Deleted merchants cannot add team members or invitations.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_merchant_block_deleted_membership()
  from public, anon, authenticated;

create trigger merchant_user_block_deleted_membership
  before insert or update on public.merchant_user
  for each row execute function public.tg_merchant_block_deleted_membership();

create trigger merchant_invite_block_deleted_membership
  before insert or update on public.merchant_invite
  for each row execute function public.tg_merchant_block_deleted_membership();

create or replace function public.fn_merchant_is_live(p_merchant_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant m
    where m.id = p_merchant_id
      and m.status = 'live'
      and m.deleted_at is null
  );
$$;

create or replace view public.merchant_public
with (security_invoker = false)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.category_other,
  m.cover_photo_path,
  m.featured,
  c.slug as city_slug,
  c.name as city_name,
  b.name as branch_name,
  b.address_text as branch_address,
  b.latitude as branch_latitude,
  b.longitude as branch_longitude,
  m.went_live_at as listed_at,
  m.explore_visible,
  m.concierge_pick,
  m.accepting_orders,
  m.busy_mode_until,
  m.closed_early_at,
  m.pay_on_delivery as pay_on_delivery_enabled,
  m.pay_on_delivery_cap_kes,
  m.prep_minutes,
  m.parent_merchant_id,
  (select h.opens from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as opens_today,
  (select h.closes from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closes_today,
  (select h.closed from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closed_today,
  case when m.health_band = 'green' then 'green' end as health_badge,
  m.subcategory,
  coalesce(
    (select active_zone.id from public.zone active_zone where active_zone.id = b.zone_id and active_zone.active),
    (select z.id from public.zone_for_point(b.longitude, b.latitude) z)
  ) as zone_id
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where m.status = 'live'
  and m.deleted_at is null;

grant select on public.merchant_public to anon, authenticated;

create or replace view public.console_merchant_directory_v
with (security_invoker = true)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.status,
  m.featured,
  m.concierge_pick,
  m.accepting_orders,
  m.explore_visible,
  m.health_band,
  m.health_score,
  m.payout_hold,
  m.parent_merchant_id,
  c.name as city_name,
  c.slug as city_slug,
  b.name as branch_name,
  m.went_live_at,
  m.submitted_at,
  m.created_at,
  s.orders_30d,
  s.on_time_ready_pct,
  null::bigint as gmv_30d_kes,
  (select count(*) from public.dispute d
    where d.merchant_id = m.id and d.status in ('open', 'awaiting_merchant')) as open_disputes,
  m.deactivated_at,
  m.deleted_at
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
left join lateral (
  select h.orders_30d, h.on_time_ready_pct
  from public.merchant_health_snapshot h
  where h.merchant_id = m.id
  order by h.as_of desc
  limit 1
) s on true
where m.deactivated_at is null
  and m.deleted_at is null;

grant select on public.console_merchant_directory_v to authenticated;

create or replace view public.console_merchant_deactivated_v
with (security_invoker = true)
as
select
  m.id,
  m.trading_name,
  m.status,
  c.name as city_name,
  m.deactivated_at,
  m.deactivation_reason
from public.merchant m
left join public.city c on c.id = m.city_id
where m.deactivated_at is not null
  and m.deleted_at is null;

grant select on public.console_merchant_deactivated_v to authenticated;

create or replace view public.console_merchant_deleted_v
with (security_invoker = true)
as
select
  m.id,
  m.trading_name,
  m.status,
  c.name as city_name,
  m.deleted_at,
  m.deleted_until,
  m.deletion_reason
from public.merchant m
left join public.city c on c.id = m.city_id
where m.deleted_at is not null
  and m.deleted_until > now();

grant select on public.console_merchant_deleted_v to authenticated;

create or replace function public.rpc_merchant_console_counts(p_city_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total',         count(*),
    'live',          count(*) filter (where status = 'live'),
    'paused',        count(*) filter (where status = 'paused'),
    'under_review',  count(*) filter (where status = 'under_review'),
    'suspended',     count(*) filter (where status = 'suspended'),
    'featured',      count(*) filter (where featured),
    'applications',  count(*) filter (where status in ('applied', 'documents_pending', 'under_review')),
    'onboarding',    count(*) filter (where status in ('applied', 'documents_pending', 'under_review')),
    'open_disputes', (select count(*) from public.dispute where status in ('open', 'awaiting_merchant')),
    'pending_edits', (select count(*) from public.catalogue_edit_request where status = 'pending'),
    'expiring_docs', (
      select count(*) from public.document d
      where d.status = 'verified' and d.superseded_at is null
        and d.expires_at is not null
        and d.expires_at between current_date and current_date + 30
    )
  )
  from public.merchant m
  where m.deactivated_at is null
    and m.deleted_at is null
    and (p_city_id is null or m.city_id = p_city_id)
$$;

grant execute on function public.rpc_merchant_console_counts(uuid) to authenticated;

create or replace function public.rpc_merchant_soft_delete(
  p_merchant_id uuid,
  p_confirmation_name text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_staff uuid := authz.staff_id();
  v_unassigned_scope_allowed boolean;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_retention interval;
begin
  if v_staff is null then
    raise exception 'Only staff can delete a merchant.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_reason is null or length(v_reason) > 500 then
    raise exception 'Enter a reason of 1 to 500 characters.'
      using errcode = 'check_violation';
  end if;

  select retain_for into v_retention
  from public.retention_rule
  where key = 'merchant_deleted';

  if v_retention is null or v_retention <= interval '0' then
    raise exception 'Merchant deletion retention is not configured.'
      using errcode = 'check_violation';
  end if;

  select * into v_merchant
  from public.merchant
  where id = p_merchant_id
  for update;

  if v_merchant.id is null then
    raise exception 'That business does not exist.' using errcode = 'no_data_found';
  end if;

  if v_merchant.city_id is null then
    select exists (
      select 1
      from public.role_grant rg
      join public.role r on r.id = rg.role_id
      where rg.staff_user_id = v_staff
        and rg.city_id is null
        and rg.revoked_at is null
        and (rg.expires_at is null or rg.expires_at > now())
        and r.key in ('merchant_ops', 'super_admin')
    ) into v_unassigned_scope_allowed;
  end if;

  if (v_merchant.city_id is null and not coalesce(v_unassigned_scope_allowed, false))
     or (
       v_merchant.city_id is not null
       and not authz.can_manage_merchants(v_merchant.city_id)
     ) then
    raise exception 'You cannot change that business.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_merchant.deleted_at is not null then
    raise exception 'That business is already in Deleted.'
      using errcode = 'check_violation';
  end if;

  if coalesce(v_merchant.trading_name, v_merchant.legal_name, '') = ''
     or p_confirmation_name is distinct from coalesce(v_merchant.trading_name, v_merchant.legal_name) then
    raise exception 'The confirmation name does not match the merchant.'
      using errcode = 'check_violation';
  end if;

  update public.merchant
  set status = case
        when v_merchant.status = 'live' then 'paused'::public.partner_status
        else v_merchant.status
      end,
      status_reason = case
        when v_merchant.status = 'live' then v_reason
        else v_merchant.status_reason
      end,
      accepting_orders = false,
      featured = false,
      explore_visible = false,
      concierge_pick = false,
      deleted_at = now(),
      deleted_until = now() + v_retention,
      deleted_by = v_staff,
      deletion_reason = v_reason,
      deletion_state = jsonb_build_object(
        'status', v_merchant.status,
        'status_reason', v_merchant.status_reason,
        'deactivated_at', v_merchant.deactivated_at,
        'deactivated_by', v_merchant.deactivated_by,
        'deactivation_reason', v_merchant.deactivation_reason,
        'deactivation_state', v_merchant.deactivation_state,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'user_id', mu.user_id,
            'role', mu.role,
            'branches', mu.branches,
            'caps', mu.caps
          ))
          from public.merchant_user mu
          where mu.merchant_id = p_merchant_id
        ), '[]'::jsonb)
      )
  where id = p_merchant_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.deleted',
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_before => jsonb_build_object('status', v_merchant.status),
    p_after => jsonb_build_object(
      'deleted_until', now() + v_retention,
      'status', case when v_merchant.status = 'live' then 'paused' else v_merchant.status::text end
    ),
    p_reason => v_reason,
    p_city_id => v_merchant.city_id
  );

  delete from public.merchant_user
  where merchant_id = p_merchant_id;

  delete from public.merchant_invite
  where merchant_id = p_merchant_id;

  return jsonb_build_object(
    'ok', true,
    'message', 'Merchant moved to Deleted for '
      || (extract(epoch from v_retention) / 86400)::integer
      || ' days. Linked financial and audit records are retained.'
  );
end;
$$;

create or replace function public.rpc_merchant_restore_deleted(
  p_merchant_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_staff uuid := authz.staff_id();
  v_unassigned_scope_allowed boolean;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_prior_status public.partner_status;
  v_member jsonb;
begin
  if v_staff is null then
    raise exception 'Only staff can restore a deleted merchant.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_reason is null or length(v_reason) > 500 then
    raise exception 'Enter a reason of 1 to 500 characters.'
      using errcode = 'check_violation';
  end if;

  select * into v_merchant
  from public.merchant
  where id = p_merchant_id
  for update;

  if v_merchant.id is null then
    raise exception 'That business does not exist.' using errcode = 'no_data_found';
  end if;

  if v_merchant.city_id is null then
    select exists (
      select 1
      from public.role_grant rg
      join public.role r on r.id = rg.role_id
      where rg.staff_user_id = v_staff
        and rg.city_id is null
        and rg.revoked_at is null
        and (rg.expires_at is null or rg.expires_at > now())
        and r.key in ('merchant_ops', 'super_admin')
    ) into v_unassigned_scope_allowed;
  end if;

  if (v_merchant.city_id is null and not coalesce(v_unassigned_scope_allowed, false))
     or (
       v_merchant.city_id is not null
       and not authz.can_manage_merchants(v_merchant.city_id)
     ) then
    raise exception 'You cannot change that business.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_merchant.deleted_at is null or v_merchant.deletion_state is null then
    raise exception 'That business is not in Deleted.'
      using errcode = 'check_violation';
  end if;

  if v_merchant.deleted_until <= now() or v_merchant.deleted_anonymized_at is not null then
    raise exception 'The 90-day recovery window has expired. This merchant can no longer be restored.'
      using errcode = 'check_violation';
  end if;

  v_prior_status := (v_merchant.deletion_state ->> 'status')::public.partner_status;

  update public.merchant
  set status = case
        when v_prior_status = 'live' then 'paused'::public.partner_status
        else v_prior_status
      end,
      status_reason = v_merchant.deletion_state ->> 'status_reason',
      accepting_orders = false,
      featured = false,
      explore_visible = false,
      concierge_pick = false,
      deactivated_at = (v_merchant.deletion_state ->> 'deactivated_at')::timestamptz,
      deactivated_by = (v_merchant.deletion_state ->> 'deactivated_by')::uuid,
      deactivation_reason = v_merchant.deletion_state ->> 'deactivation_reason',
      deactivation_state = nullif(
        v_merchant.deletion_state -> 'deactivation_state',
        'null'::jsonb
      ),
      deleted_at = null,
      deleted_until = null,
      deleted_by = null,
      deletion_reason = null,
      deletion_state = null
  where id = p_merchant_id;

  for v_member in
    select value
    from jsonb_array_elements(coalesce(v_merchant.deletion_state -> 'members', '[]'::jsonb))
  loop
    if exists (
      select 1
      from auth.users u
      where u.id = (v_member ->> 'user_id')::uuid
    ) then
      insert into public.merchant_user (merchant_id, user_id, role, branches, caps)
      values (
        p_merchant_id,
        (v_member ->> 'user_id')::uuid,
        (v_member ->> 'role')::public.merchant_user_role,
        case
          when jsonb_typeof(v_member -> 'branches') = 'array'
            then array(
              select jsonb_array_elements_text(v_member -> 'branches')::uuid
            )
          else null
        end,
        coalesce(nullif(v_member -> 'caps', 'null'::jsonb), '{}'::jsonb)
      )
      on conflict (merchant_id, user_id) do update
        set role = excluded.role,
            branches = excluded.branches,
            caps = excluded.caps;
    end if;
  end loop;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.restored',
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_before => jsonb_build_object('status', v_merchant.status),
    p_after => jsonb_build_object(
      'status', case when v_prior_status = 'live' then 'paused' else v_prior_status::text end
    ),
    p_reason => v_reason,
    p_city_id => v_merchant.city_id
  );

  return jsonb_build_object(
    'ok', true,
    'message', 'Merchant restored. Order intake and public visibility remain off until staff review.'
  );
end;
$$;

create or replace function public.cron_merchant_deleted_retention()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_anonymise boolean;
begin
  select anonymise into v_anonymise
  from public.retention_rule
  where key = 'merchant_deleted';

  if not found then
    raise exception 'Merchant deletion retention is not configured.';
  end if;

  if not v_anonymise then
    return 0;
  end if;

  select coalesce(array_agg(stale.id), '{}'::uuid[])
    into v_ids
  from (
    select m.id
    from public.merchant m
    where m.deleted_until <= now()
      and m.deleted_at is not null
      and m.deleted_anonymized_at is null
    order by m.deleted_until
    limit 500
    for update skip locked
  ) stale;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  update public.merchant m
  set legal_name = 'Deleted merchant ' || left(replace(m.id::text, '-', ''), 12),
      trading_name = 'Deleted merchant ' || left(replace(m.id::text, '-', ''), 12),
      contact_name = 'Deleted',
      contact_phone = '+10000000',
      contact_email = 'deleted+' || m.id::text || '@retained.invalid',
      category_other = null,
      cover_photo_path = null,
      settlement_account = null,
      payout_account = null,
      payout_name_lookup = null,
      payout_rail = null,
      kra_pin = null,
      landmark = null,
      source_url = null,
      answers = '{}'::jsonb,
      status_reason = null,
      deletion_reason = null,
      deactivated_at = null,
      deactivated_by = null,
      deactivation_reason = null,
      deactivation_state = null,
      deletion_state = jsonb_build_object('status', m.status),
      deleted_anonymized_at = now()
  where m.id = any(v_ids);

  delete from public.merchant_user mu
  where mu.merchant_id = any(v_ids);

  perform audit.log(
    p_actor_type => 'system'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.retention_anonymized',
    p_target_type => 'merchant',
    p_target_id => id,
    p_after => jsonb_build_object('deleted_anonymized_at', now())
  )
  from unnest(v_ids) as expired(id);

  return cardinality(v_ids);
end;
$$;

revoke all on function public.rpc_merchant_soft_delete(uuid, text, text)
  from public, anon;
revoke all on function public.rpc_merchant_restore_deleted(uuid, text)
  from public, anon;
revoke all on function public.cron_merchant_deleted_retention()
  from public, anon, authenticated;
grant execute on function public.rpc_merchant_soft_delete(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.rpc_merchant_restore_deleted(uuid, text)
  to authenticated, service_role;
grant execute on function public.cron_merchant_deleted_retention()
  to service_role;

revoke all on function public.rpc_merchant_delete_draft(uuid, text, text)
  from public, anon, authenticated, service_role;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('merchant.deleted', 'merchants', 'high', true, false, false, '{}', 'merchant moved to the 90-day deleted retention period'),
  ('merchant.restored', 'merchants', 'notice', false, false, false, '{}', 'merchant restored during the 90-day retention period'),
  ('merchant.retention_anonymized', 'merchants', 'high', true, false, false, '{}', 'merchant profile anonymized after the retention period')
on conflict (action) do nothing;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'merchant-deleted-retention-daily',
      '5 23 * * *',
      $schedule$select public.cron_merchant_deleted_retention()$schedule$
    );
  else
    raise notice 'pg_cron is not installed; deleted merchant profiles will need manual retention processing.';
  end if;
end;
$$;
