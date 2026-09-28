-- Activation and go-live — spec section 3.3.
--
-- These are the only two code paths that can put a rider on the road or a
-- merchant in front of customers. Both check the caller's role for that city,
-- require every applicable document verified, and write the audit event in the
-- same transaction as the status change (ground rule 4).

create or replace function public.rpc_activate_rider(p_rider_id uuid, p_reason text default null)
returns public.rider
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_staff uuid;
  v_required int;
  v_verified int;
begin
  select * into v_rider from public.rider where id = p_rider_id for update;
  if v_rider.id is null then
    raise exception 'No rider with id %', p_rider_id using errcode = 'no_data_found';
  end if;

  v_staff := authz.staff_id();
  if v_staff is null or not authz.can_manage_riders(v_rider.city_id) then
    raise exception 'You need rider_ops or super_admin for this city to activate a rider.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_rider.status = 'active' then
    return v_rider;
  end if;

  -- A motorised rider without a plate cannot be activated (section 5.2).
  if v_rider.vehicle <> 'bicycle'
     and (v_rider.plate_no is null or length(trim(v_rider.plate_no)) = 0) then
    raise exception 'This rider has no plate number, which is required for a %.', v_rider.vehicle
      using errcode = 'check_violation';
  end if;

  select
    count(*),
    count(*) filter (
      where exists (
        select 1 from public.document d
        where d.owner_type = 'rider'
          and d.owner_id = p_rider_id
          and d.requirement_id = q.id
          and d.superseded_at is null
          and d.status = 'verified'
      )
    )
  into v_required, v_verified
  from public.fn_rider_required_docs(p_rider_id) q;

  if v_verified < v_required then
    raise exception
      'This rider has % of % required documents verified.', v_verified, v_required
      using errcode = 'check_violation';
  end if;

  update public.rider
  set status = 'active',
      status_reason = p_reason,
      activated_by = v_staff,
      activated_at = now()
  where id = p_rider_id
  returning * into v_rider;

  perform audit.log(
    p_actor_type => 'staff',
    p_actor_id => v_staff,
    p_module => 'rider',
    p_action => 'rider.activated',
    p_target_type => 'rider',
    p_target_id => p_rider_id,
    p_before => jsonb_build_object('status', 'under_review'),
    p_after => jsonb_build_object('status', 'active'),
    p_reason => p_reason,
    p_severity => 'notice',
    p_city_id => v_rider.city_id
  );

  return v_rider;
end;
$$;

comment on function public.rpc_activate_rider is
  'The only way a rider reaches active. Requires rider_ops or super_admin for the city, a plate for motorised vehicles, and every required document verified.';

-- ------------------------------------------------------------------ go live

create or replace function public.rpc_merchant_go_live(p_merchant_id uuid, p_reason text default null)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_staff uuid;
  v_required int;
  v_verified int;
  v_branches int;
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
    p_before => jsonb_build_object('status', 'under_review'),
    p_after => jsonb_build_object('status', 'live'),
    p_reason => p_reason,
    p_severity => 'notice',
    p_city_id => v_merchant.city_id
  );

  return v_merchant;
end;
$$;

comment on function public.rpc_merchant_go_live is
  'The only way a merchant reaches live, and therefore the only way one becomes publicly visible.';

-- --------------------------------------------------------- document review
--
-- Verify and reject are RPCs for the same reason: the status change, the
-- recompute and the audit event have to happen together or not at all.

create or replace function public.rpc_document_verify(p_document_id uuid)
returns public.document
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.document;
  v_staff uuid;
  v_city uuid;
  v_allowed boolean;
begin
  select * into v_doc from public.document where id = p_document_id for update;
  if v_doc.id is null then
    raise exception 'No document with id %', p_document_id using errcode = 'no_data_found';
  end if;

  select city, allowed into v_city, v_allowed from authz.document_review_scope(v_doc);

  v_staff := authz.staff_id();
  if v_staff is null or not v_allowed then
    raise exception 'You do not have document review rights for this partner''s city.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.document
  set status = 'verified',
      reviewed_by = v_staff,
      reviewed_at = now(),
      rejection_reason = null
  where id = p_document_id
  returning * into v_doc;

  perform audit.log(
    p_actor_type => 'staff',
    p_actor_id => v_staff,
    p_module => v_doc.owner_type::text,
    p_action => 'document.verified',
    p_target_type => 'document',
    p_target_id => p_document_id,
    p_after => jsonb_build_object('status', 'verified'),
    p_severity => 'notice',
    p_city_id => v_city
  );

  return v_doc;
end;
$$;

create or replace function public.rpc_document_reject(p_document_id uuid, p_reason text)
returns public.document
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.document;
  v_staff uuid;
  v_city uuid;
  v_allowed boolean;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A rejection needs a reason the applicant can act on.'
      using errcode = 'check_violation';
  end if;

  select * into v_doc from public.document where id = p_document_id for update;
  if v_doc.id is null then
    raise exception 'No document with id %', p_document_id using errcode = 'no_data_found';
  end if;

  select city, allowed into v_city, v_allowed from authz.document_review_scope(v_doc);

  v_staff := authz.staff_id();
  if v_staff is null or not v_allowed then
    raise exception 'You do not have document review rights for this partner''s city.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.document
  set status = 'rejected',
      reviewed_by = v_staff,
      reviewed_at = now(),
      rejection_reason = p_reason
  where id = p_document_id
  returning * into v_doc;

  perform audit.log(
    p_actor_type => 'staff',
    p_actor_id => v_staff,
    p_module => v_doc.owner_type::text,
    p_action => 'document.rejected',
    p_target_type => 'document',
    p_target_id => p_document_id,
    p_after => jsonb_build_object('status', 'rejected'),
    p_reason => p_reason,
    p_severity => 'notice',
    p_city_id => v_city
  );

  return v_doc;
end;
$$;

grant execute on function public.rpc_activate_rider(uuid, text) to authenticated, service_role;
grant execute on function public.rpc_merchant_go_live(uuid, text) to authenticated, service_role;
grant execute on function public.rpc_document_verify(uuid) to authenticated, service_role;
grant execute on function public.rpc_document_reject(uuid, text) to authenticated, service_role;
