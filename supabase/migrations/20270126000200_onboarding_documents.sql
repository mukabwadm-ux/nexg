-- Merchant documents while onboarding (owner's request, 20 Nov 2026).
--
--   * Owner or director ID: no longer asked for.
--   * Business permit: every merchant, every category, needed to go live.
--   * Food handler certificate: restaurants and groceries, needed to go live.
--   * Menu and price list, business registration certificate and KRA PIN
--     certificate: still on the merchant's Documents list, but optional while
--     onboarding (essential = false): they can be added after going live.
--
-- "Needed to go live" is document_requirement.essential. fn_merchant_go_live_missing
-- (20270124000100) counted every required document; it now counts the essential
-- ones only, so the optional ones never hold a merchant back. Uploaded copies of
-- the owner ID stay on file.
--
-- Rollback: restore the rows' required / essential / applies_when as left by
-- 20270110410100, and fn_merchant_go_live_missing from 20270124000100.

update public.document_requirement
set required = false, essential = false
where owner_type = 'merchant' and kind = 'owner_id';

update public.document_requirement
set required = true, essential = true, applies_when = '{}'::jsonb,
    why_text = 'Your county business permit to trade · needed to go live'
where owner_type = 'merchant' and kind = 'business_permit';

update public.document_requirement
set required = true, essential = true,
    applies_when = '{"category": ["restaurants_food", "groceries_essentials", "restaurant", "supermarket", "bar_liquor"]}'::jsonb
where owner_type = 'merchant' and kind = 'food_handler_cert';

update public.document_requirement
set required = true, essential = false
where owner_type = 'merchant' and kind in ('menu_price_list', 'business_registration_cert', 'kra_pin');

create or replace function public.fn_merchant_go_live_missing(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  a public.merchant_application;
  v_items jsonb := '[]'::jsonb;
  v_category text;
  v_details int;
  v_agreement public.merchant_agreement;
  v_to_upload int;
  v_to_check int;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;
  select * into a from public.merchant_application where merchant_id = p_merchant_id;

  if a.merchant_id is not null then
    if not (a.review_state = 'approved' and a.approved_revision = a.revision
            and a.submitted_revision = a.revision) then
      v_items := v_items || jsonb_build_object('key', 'application', 'who', 'nexg',
        'label', 'NexG approves your application');
    end if;

    v_category := public.fn_merchant_onboarding_category(p_merchant_id);
    v_details := jsonb_array_length(public.fn_merchant_onboarding_missing_for(
      v_category,
      coalesce((select oa.answers from public.merchant_onboarding_answer oa
                where oa.merchant_id = p_merchant_id), '{}'::jsonb)));
    if v_details > 0 then
      v_items := v_items || jsonb_build_object('key', 'onboarding_details', 'who', 'merchant',
        'label', 'Onboarding details', 'count', v_details);
    end if;

    if not exists (
      select 1 from public.merchant_agreement_party p
      where p.merchant_id = p_merchant_id
        and nullif(trim(coalesce(p.registration_number, '')), '') is not null
    ) then
      v_items := v_items || jsonb_build_object('key', 'agreement_details', 'who', 'merchant',
        'label', 'Your details for the agreement');
    end if;

    v_agreement := public.fn_merchant_agreement_for_category(public.fn_merchant_agreement_category(p_merchant_id));
    if v_agreement.id is not null and not exists (
      select 1 from public.merchant_agreement_acceptance x
      where x.merchant_id = p_merchant_id and x.agreement_id = v_agreement.id
        and x.version = v_agreement.version
    ) then
      v_items := v_items || jsonb_build_object('key', 'agreement', 'who', 'merchant',
        'label', 'Read and accept the merchant agreement');
    end if;
  end if;

  if not exists (select 1 from public.merchant_branch b
                 where b.merchant_id = p_merchant_id and b.is_primary) then
    v_items := v_items || jsonb_build_object('key', 'branch', 'who', 'merchant',
      'label', 'Your business location');
  end if;

  /* An essential required document is the merchant's to do while it has no current
     upload or the last one was rejected or expired; NexG's while it waits to
     be checked. */
  select
    count(*) filter (where d.status is null or d.status in ('rejected', 'expired')),
    count(*) filter (where d.status = 'uploaded')
  into v_to_upload, v_to_check
  from public.fn_merchant_required_docs(p_merchant_id) q
  left join lateral (
    select doc.status::text as status
    from public.document doc
    where doc.owner_type = 'merchant' and doc.owner_id = p_merchant_id
      and doc.requirement_id = q.id and doc.superseded_at is null
    order by doc.created_at desc
    limit 1
  ) d on true
  where q.essential;

  if v_to_upload > 0 then
    v_items := v_items || jsonb_build_object('key', 'documents', 'who', 'merchant',
      'label', 'Documents to upload', 'count', v_to_upload);
  end if;
  if v_to_check > 0 then
    v_items := v_items || jsonb_build_object('key', 'documents_review', 'who', 'nexg',
      'label', 'NexG checks your documents', 'count', v_to_check);
  end if;

  return v_items;
end;
$$;

revoke all on function public.fn_merchant_go_live_missing(uuid) from public, anon, authenticated;
grant execute on function public.fn_merchant_go_live_missing(uuid) to service_role;
