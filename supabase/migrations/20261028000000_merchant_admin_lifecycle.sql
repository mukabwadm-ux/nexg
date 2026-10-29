alter table public.merchant
  add column deactivated_at timestamptz,
  add column deactivated_by uuid references public.staff_user (id) on delete set null,
  add column deactivation_reason text,
  add column deactivation_state jsonb,
  add constraint merchant_deactivation_state_consistent check (
    (deactivated_at is null) = (deactivation_state is null)
  );

create index merchant_deactivated_idx
  on public.merchant (deactivated_at)
  where deactivated_at is not null;

comment on column public.merchant.deactivated_at is
  'When staff deactivated this merchant. The previous status is retained so reactivation restores it safely.';

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
  then
    raise exception 'That is not yours to set.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create or replace function public.rpc_merchant_set_deactivated(
  p_merchant_id uuid,
  p_deactivated boolean,
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
  v_prior_status public.partner_status;
  v_expected_status public.partner_status;
  v_prior_reason text;
  v_unassigned_scope_allowed boolean;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_staff is null then
    raise exception 'Only staff can change a merchant’s activation.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_deactivated is null then
    raise exception 'Choose whether to deactivate or reactivate the merchant.'
      using errcode = 'check_violation';
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

  if p_deactivated then
    if v_merchant.deactivated_at is not null then
      raise exception 'That business is already deactivated.'
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
        accepting_orders = case
          when v_merchant.status = 'live' then false
          else v_merchant.accepting_orders
        end,
        concierge_pick = case
          when v_merchant.status = 'live' then false
          else v_merchant.concierge_pick
        end,
        deactivated_at = now(),
        deactivated_by = v_staff,
        deactivation_reason = v_reason,
        deactivation_state = jsonb_build_object(
          'status', v_merchant.status,
          'status_reason', v_merchant.status_reason
        )
    where id = p_merchant_id;

    perform audit.log(
      p_actor_type => 'staff'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.deactivated',
      p_target_type => 'merchant',
      p_target_id => p_merchant_id,
      p_before => jsonb_build_object('status', v_merchant.status),
      p_after => jsonb_build_object('status', case
        when v_merchant.status = 'live' then 'paused'
        else v_merchant.status::text
      end),
      p_reason => v_reason,
      p_city_id => v_merchant.city_id
    );

    return jsonb_build_object('ok', true, 'message', 'Merchant deactivated.');
  end if;

  if v_merchant.deactivated_at is null or v_merchant.deactivation_state is null then
    raise exception 'That business is not deactivated.'
      using errcode = 'check_violation';
  end if;

  v_prior_status := (v_merchant.deactivation_state ->> 'status')::public.partner_status;
  v_expected_status := case
    when v_prior_status = 'live' then 'paused'::public.partner_status
    else v_prior_status
  end;
  v_prior_reason := v_merchant.deactivation_state ->> 'status_reason';

  if v_merchant.status <> v_expected_status then
    raise exception 'The merchant status changed while deactivated. Resolve that status before reactivating.'
      using errcode = 'check_violation';
  end if;

  update public.merchant
  set status = v_prior_status,
      status_reason = v_prior_reason,
      deactivated_at = null,
      deactivated_by = null,
      deactivation_reason = null,
      deactivation_state = null
  where id = p_merchant_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.reactivated',
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_before => jsonb_build_object('status', v_merchant.status),
    p_after => jsonb_build_object('status', v_prior_status),
    p_reason => v_reason,
    p_city_id => v_merchant.city_id
  );

  return jsonb_build_object('ok', true, 'message', 'Merchant reactivated.');
end;
$$;

create or replace function public.rpc_merchant_delete_draft(
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
begin
  if v_staff is null then
    raise exception 'Only staff can delete a merchant draft.'
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

  if v_merchant.status <> 'applied'
     or v_merchant.submitted_at is not null
     or v_merchant.went_live_at is not null then
    raise exception 'Only an unsubmitted draft can be permanently deleted. Deactivate this merchant instead.'
      using errcode = 'check_violation';
  end if;

  if p_confirmation_name is distinct from v_merchant.trading_name then
    raise exception 'The confirmation name does not match the merchant.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.order o where o.merchant_id = p_merchant_id)
     or exists (
       select 1 from public.api_idempotency ai
       where ai.merchant_id = p_merchant_id and ai.order_id is not null
     ) then
    raise exception 'This draft has order history and cannot be deleted. Deactivate it instead.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.payment p where p.merchant_id = p_merchant_id)
     or exists (
       select 1 from public.merchant_statement ms
       where ms.merchant_id = p_merchant_id
     )
     or exists (
       select 1 from ledger.account a
       where a.party_type = 'merchant' and a.party_id = p_merchant_id
     )
     or exists (
       select 1 from public.rider_settlement_line sl
       where sl.paid_to_merchant_id = p_merchant_id
     )
     or exists (
       select 1 from public.featured_booking fb
       where fb.merchant_id = p_merchant_id
     ) then
    raise exception 'This draft has financial or paid-placement history and cannot be deleted. Deactivate it instead.'
      using errcode = 'check_violation';
  end if;

  if exists (
       select 1 from public.document d
       where d.owner_type = 'merchant' and d.owner_id = p_merchant_id
     )
     or exists (
       select 1 from public.document_request dr
       where dr.owner_type = 'merchant' and dr.owner_id = p_merchant_id
     )
     or exists (
       select 1 from public.catalogue_item ci
       where ci.merchant_id = p_merchant_id and ci.photo_path is not null
     )
     or exists (
       select 1 from storage.objects o
       where o.bucket_id = 'partner-documents'
         and o.name like 'merchant/' || p_merchant_id::text || '/%'
     )
     or exists (
       select 1 from storage.objects o
       where o.bucket_id = 'catalogue-images'
         and o.name like p_merchant_id::text || '/%'
     )
     or v_merchant.cover_photo_path is not null then
    raise exception 'This draft has compliance files or uploaded images that must be retained. Deactivate it instead.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.approval_request r
    where r.target_type = 'merchant' and r.target_id = p_merchant_id
  ) then
    raise exception 'This draft has an approval history and cannot be deleted. Deactivate it instead.'
      using errcode = 'check_violation';
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.draft_deleted',
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_before => jsonb_build_object(
      'trading_name', v_merchant.trading_name,
      'status', v_merchant.status,
      'submitted_at', v_merchant.submitted_at
    ),
    p_reason => v_reason,
    p_city_id => v_merchant.city_id
  );

  delete from public.merchant where id = p_merchant_id;

  return jsonb_build_object('ok', true, 'message', 'Draft permanently deleted.');
end;
$$;

revoke all on function public.rpc_merchant_set_deactivated(uuid, boolean, text)
  from public, anon;
revoke all on function public.rpc_merchant_delete_draft(uuid, text, text)
  from public, anon;
grant execute on function public.rpc_merchant_set_deactivated(uuid, boolean, text)
  to authenticated, service_role;
grant execute on function public.rpc_merchant_delete_draft(uuid, text, text)
  to authenticated, service_role;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('merchant.deactivated', 'merchants', 'notice', false, false, false, '{}', 'merchant deactivated'),
  ('merchant.reactivated', 'merchants', 'info', false, false, false, '{}', 'merchant reactivated'),
  ('merchant.draft_deleted', 'merchants', 'high', true, false, false, '{}', 'unsubmitted merchant draft permanently deleted')
on conflict (action) do nothing;
