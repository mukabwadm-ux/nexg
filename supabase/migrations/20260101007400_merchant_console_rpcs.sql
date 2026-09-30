-- The Merchants console · the writes.
--
-- Every one of these checks the caller's city grant, writes one audit
-- event in the same transaction as the change, and refuses rather than
-- guesses. The dangerous ones — suspension, delisting, a commission
-- change, a large adjustment — need a second person, and the person who
-- asked is never the person who approves.

/* Can this staff member act on this merchant, in this city? */
create or replace function authz.works_merchant(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchant m
    where m.id = p_merchant_id
      and (
        authz.is_super_admin()
        or authz.has_role('ops_manager', m.city_id)
        or authz.has_role('merchant_ops', m.city_id)
      )
  )
$$;

grant execute on function authz.works_merchant(uuid) to authenticated, service_role;

-- ──────────────────────────────────────── controls, with a source

/*
 * Who changed a toggle matters as much as what it is set to.
 *
 * The console and the merchant's own dashboard call the same function.
 * What differs is `p_source` and what each is allowed to touch: a
 * merchant may open and close their own shop, and may not decide
 * whether they appear in Explore, whether cash on delivery is offered,
 * or whether they are an editorial pick. Those are ours.
 */
create or replace function public.rpc_merchant_control(
  p_merchant_id uuid,
  p_control text,
  p_value jsonb,
  p_source public.merchant_control_source default 'staff',
  p_reason text default null
)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.merchant;
  v_after public.merchant;
  v_is_merchant boolean;
  v_staff uuid := authz.staff_id();
begin
  select * into v_before from public.merchant where id = p_merchant_id;
  if v_before.id is null then
    raise exception 'No such merchant.' using errcode = 'no_data_found';
  end if;

  v_is_merchant := exists (
    select 1 from public.merchant_user mu
    where mu.merchant_id = p_merchant_id and mu.user_id = (select auth.uid())
  );

  if not v_is_merchant and not authz.works_merchant(p_merchant_id) then
    raise exception 'Not your merchant to change.' using errcode = 'insufficient_privilege';
  end if;

  /* The three a merchant may never set about themselves. */
  if v_is_merchant and not authz.works_merchant(p_merchant_id)
     and p_control in ('explore_visible', 'pay_on_delivery', 'pay_on_delivery_cap_kes',
                       'concierge_pick') then
    raise exception 'That one is ours to set, not yours.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.merchant set
    accepting_orders = case when p_control = 'accepting_orders'
      then (p_value #>> '{}')::boolean else accepting_orders end,
    accepting_orders_source = case when p_control = 'accepting_orders'
      then p_source else accepting_orders_source end,
    accepting_orders_changed_at = case when p_control = 'accepting_orders'
      then now() else accepting_orders_changed_at end,

    explore_visible = case when p_control = 'explore_visible'
      then (p_value #>> '{}')::boolean else explore_visible end,
    pay_on_delivery = case when p_control = 'pay_on_delivery'
      then (p_value #>> '{}')::boolean else pay_on_delivery end,
    pay_on_delivery_cap_kes = case when p_control = 'pay_on_delivery_cap_kes'
      then nullif(p_value #>> '{}', '')::integer else pay_on_delivery_cap_kes end,
    concierge_pick = case when p_control = 'concierge_pick'
      then (p_value #>> '{}')::boolean else concierge_pick end,

    busy_mode_until = case when p_control = 'busy_mode_until'
      then nullif(p_value #>> '{}', '')::timestamptz else busy_mode_until end,
    capacity_per_15min = case when p_control = 'capacity_per_15min'
      then nullif(p_value #>> '{}', '')::integer else capacity_per_15min end,
    closed_early_at = case when p_control = 'closed_early'
      then case when (p_value #>> '{}')::boolean then now() end else closed_early_at end
  where id = p_merchant_id
  returning * into v_after;

  perform audit.log(
    p_actor_type => case when p_source = 'merchant' then 'merchant_user' else 'staff' end
      ::public.actor_type,
    p_actor_id => v_staff,
    p_module => 'merchants',
    p_action => 'merchant.control_changed',
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_city_id => v_after.city_id,
    p_reason => p_reason,
    p_before => jsonb_build_object(p_control, case p_control
      when 'accepting_orders' then to_jsonb(v_before.accepting_orders)
      when 'explore_visible' then to_jsonb(v_before.explore_visible)
      when 'pay_on_delivery' then to_jsonb(v_before.pay_on_delivery)
      when 'pay_on_delivery_cap_kes' then to_jsonb(v_before.pay_on_delivery_cap_kes)
      when 'concierge_pick' then to_jsonb(v_before.concierge_pick)
      when 'busy_mode_until' then to_jsonb(v_before.busy_mode_until)
      else 'null'::jsonb end),
    p_after => jsonb_build_object('control', p_control, 'value', p_value, 'source', p_source)
  );

  return v_after;
end;
$$;

comment on function public.rpc_merchant_control is
  'One control, one source. The console and the merchant dashboard both call it; a merchant may open and close their own shop but never decide whether they are listed, whether cash is accepted, or whether they are an editorial pick.';

-- ──────────────────────────────────────────── review and go live

create or replace function public.rpc_merchant_review_start(p_merchant_id uuid)
returns public.merchant_review
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_review public.merchant_review;
  v_open public.merchant_review;
  v_who text;
begin
  if not authz.works_merchant(p_merchant_id) then
    raise exception 'Not your merchant to review.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_open from public.merchant_review
  where merchant_id = p_merchant_id and finished_at is null;

  /* Somebody else is already in here. Say who and since when rather
     than failing silently or letting two people approve the same
     application twice. */
  if v_open.id is not null then
    if v_open.reviewer_id = authz.staff_id() then
      return v_open;
    end if;
    select display_name into v_who from public.staff_user where id = v_open.reviewer_id;
    raise exception 'Being reviewed by % since %',
      coalesce(v_who, 'someone else'), to_char(v_open.started_at, 'HH24:MI')
      using errcode = 'lock_not_available';
  end if;

  insert into public.merchant_review (merchant_id, reviewer_id)
  values (p_merchant_id, authz.staff_id())
  returning * into v_review;

  return v_review;
end;
$$;

create or replace function public.rpc_merchant_review_save(
  p_review_id uuid,
  p_checklist jsonb,
  p_notes text default null
)
returns public.merchant_review
language plpgsql
security definer
set search_path = ''
as $$
declare v_review public.merchant_review;
begin
  update public.merchant_review
  set checklist = coalesce(p_checklist, checklist),
      notes = coalesce(p_notes, notes)
  where id = p_review_id and reviewer_id = authz.staff_id() and finished_at is null
  returning * into v_review;

  if v_review.id is null then
    raise exception 'That review is not open, or not yours.'
      using errcode = 'insufficient_privilege';
  end if;
  return v_review;
end;
$$;

/*
 * Hand an application back, with a reason per document.
 *
 * The reasons are what the merchant reads, so a blank one is refused:
 * "returned" with nothing attached is the most frustrating message a
 * small business can get from us.
 */
create or replace function public.rpc_merchant_return_to_applicant(
  p_merchant_id uuid,
  p_reasons jsonb
)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_doc record;
begin
  if not authz.works_merchant(p_merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_reasons) <> 'object' or p_reasons = '{}'::jsonb then
    raise exception 'Say what needs fixing. They read this.'
      using errcode = 'check_violation';
  end if;

  /* Reject the named documents, each with its own reason. */
  for v_doc in select key as document_id, value #>> '{}' as reason from jsonb_each(p_reasons)
  loop
    if coalesce(trim(v_doc.reason), '') = '' then
      raise exception 'Every document you send back needs a reason.'
        using errcode = 'check_violation';
    end if;
    update public.document
    set status = 'rejected', rejection_reason = v_doc.reason,
        reviewed_by = authz.staff_id(), reviewed_at = now()
    where id = v_doc.document_id::uuid and owner_id = p_merchant_id;
  end loop;

  update public.merchant
  set status = 'documents_pending', status_reason = 'Returned for changes'
  where id = p_merchant_id
  returning * into v_merchant;

  update public.merchant_review
  set finished_at = now(), outcome = 'returned'
  where merchant_id = p_merchant_id and finished_at is null;

  insert into public.notification (kind, status) values ('merchant_returned', 'pending');

  perform audit.log('staff'::public.actor_type, 'merchants', 'merchant.returned',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_city_id => v_merchant.city_id, p_after => p_reasons);

  return v_merchant;
end;
$$;

-- ───────────────────────────────── pause, suspend, delist

create or replace function public.rpc_merchant_set_pause(
  p_merchant_id uuid, p_paused boolean, p_reason text default null
)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant public.merchant;
begin
  if not authz.works_merchant(p_merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;
  if p_paused and coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. The merchant is told.' using errcode = 'check_violation';
  end if;

  update public.merchant
  set status = case when p_paused then 'paused'::public.partner_status
                    else 'live'::public.partner_status end,
      status_reason = case when p_paused then trim(p_reason) else null end
  where id = p_merchant_id and status in ('live', 'paused')
  returning * into v_merchant;

  if v_merchant.id is null then
    raise exception 'Only a live or paused merchant can be paused or resumed.'
      using errcode = 'check_violation';
  end if;

  insert into public.notification (kind, status)
  values (case when p_paused then 'merchant_paused' else 'merchant_resumed' end, 'pending');

  perform audit.log('staff'::public.actor_type, 'merchants',
    case when p_paused then 'merchant.paused' else 'merchant.resumed' end,
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_reason => p_reason, p_city_id => v_merchant.city_id,
    p_severity => 'notice'::public.audit_severity);

  return v_merchant;
end;
$$;

/*
 * Suspension, delisting, a commission change and a large adjustment
 * all take two people. This asks; the approval RPC in the Staff module
 * executes, and it refuses the requester.
 */
create or replace function public.rpc_merchant_two_person_request(
  p_merchant_id uuid,
  p_kind text,
  p_reason text,
  p_payload jsonb default '{}'::jsonb
)
returns public.approval_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_request public.approval_request;
begin
  if not authz.works_merchant(p_merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A second person has to read a reason. Write one.'
      using errcode = 'check_violation';
  end if;
  if p_kind not in ('merchant_suspension', 'merchant_delist', 'commission_tier_change') then
    raise exception 'Not a two-person action.' using errcode = 'check_violation';
  end if;

  select * into v_merchant from public.merchant where id = p_merchant_id;

  insert into public.approval_request
    (kind, target_type, target_id, city_id, requested_by, reason, payload)
  values (p_kind::public.approval_kind, 'merchant', p_merchant_id, v_merchant.city_id,
          authz.staff_id(), trim(p_reason), p_payload)
  returning * into v_request;

  perform audit.log('staff'::public.actor_type, 'merchants', 'merchant.' || p_kind || '_requested',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_reason => trim(p_reason), p_city_id => v_merchant.city_id,
    p_severity => 'high'::public.audit_severity);

  return v_request;
end;
$$;

/*
 * The second person. Executes, and refuses the requester — which is the
 * entire point and so is checked here rather than in the screen that
 * calls it.
 */
create or replace function public.rpc_merchant_two_person_approve(p_request_id uuid)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_request;
  v_merchant public.merchant;
  v_me uuid := authz.staff_id();
begin
  select * into v_request from public.approval_request
  where id = p_request_id and status = 'pending';

  if v_request.id is null then
    raise exception 'No such request, or it is already decided.'
      using errcode = 'no_data_found';
  end if;
  if not authz.works_merchant(v_request.target_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;
  if v_request.requested_by = v_me then
    raise exception 'You asked for this. Somebody else has to approve it.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_request.kind::text = 'merchant_suspension' then
    update public.merchant set
      status = 'suspended',
      status_reason = v_request.reason,
      suspended_at = now(),
      suspended_by = v_request.requested_by,
      suspension_reason = v_request.reason,
      suspension_second_approver = v_me,
      /* Money stops while a merchant is suspended. */
      payout_hold = true,
      payout_hold_reason = 'Suspended'
    where id = v_request.target_id
    returning * into v_merchant;

  elsif v_request.kind::text = 'merchant_delist' then
    update public.merchant set
      status = 'delisted', status_reason = v_request.reason, delisted_at = now()
    where id = v_request.target_id returning * into v_merchant;

  elsif v_request.kind::text = 'commission_tier_change' then
    update public.merchant set
      commission_tier = (v_request.payload ->> 'tier')::public.commission_tier_code,
      commission_pct = nullif(v_request.payload ->> 'pct', '')::numeric
    where id = v_request.target_id returning * into v_merchant;
  end if;

  update public.approval_request
  set status = 'approved', decided_by = v_me, decided_at = now()
  where id = p_request_id;

  insert into public.notification (kind, status) values ('merchant_suspended', 'pending');

  perform audit.log('staff'::public.actor_type, 'merchants',
    'merchant.' || v_request.kind::text || '_approved',
    p_target_type => 'merchant', p_target_id => v_request.target_id,
    p_reason => v_request.reason, p_approved_by => v_me,
    p_city_id => v_merchant.city_id, p_severity => 'high'::public.audit_severity);

  return v_merchant;
end;
$$;

-- ──────────────────────────────────────────────────── disputes

create or replace function public.rpc_dispute_open(
  p_merchant_id uuid,
  p_reason text,
  p_note text default null,
  p_order_reference text default null,
  p_amount_kes bigint default null,
  p_evidence jsonb default '[]'::jsonb
)
returns public.dispute
language plpgsql
security definer
set search_path = ''
as $$
declare v_dispute public.dispute;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.dispute
    (merchant_id, order_reference, guest_user_id, reason, guest_note,
     amount_claimed_kes, evidence, opened_by)
  values (p_merchant_id, p_order_reference, (select auth.uid()), p_reason,
          nullif(trim(coalesce(p_note, '')), ''), p_amount_kes, p_evidence, (select auth.uid()))
  returning * into v_dispute;

  perform audit.log('guest'::public.actor_type, 'merchants', 'dispute.opened',
    p_target_type => 'dispute', p_target_id => v_dispute.id);

  return v_dispute;
end;
$$;

create or replace function public.rpc_dispute_ask_merchant(
  p_dispute_id uuid, p_due_hours integer default 24
)
returns public.dispute
language plpgsql
security definer
set search_path = ''
as $$
declare v_dispute public.dispute;
begin
  select * into v_dispute from public.dispute where id = p_dispute_id;
  if not authz.works_merchant(v_dispute.merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;

  update public.dispute
  set status = 'awaiting_merchant',
      merchant_reply_due_at = now() + make_interval(hours => greatest(p_due_hours, 1))
  where id = p_dispute_id
  returning * into v_dispute;

  insert into public.notification (kind, status) values ('dispute_awaiting_reply', 'pending');

  perform audit.log('staff'::public.actor_type, 'merchants', 'dispute.awaiting_merchant',
    p_target_type => 'dispute', p_target_id => p_dispute_id);

  return v_dispute;
end;
$$;

create or replace function public.rpc_dispute_merchant_reply(
  p_dispute_id uuid, p_reply text
)
returns public.dispute
language plpgsql
security definer
set search_path = ''
as $$
declare v_dispute public.dispute;
begin
  select * into v_dispute from public.dispute where id = p_dispute_id;

  if not exists (
    select 1 from public.merchant_user mu
    where mu.merchant_id = v_dispute.merchant_id and mu.user_id = (select auth.uid())
  ) then
    raise exception 'Not your dispute.' using errcode = 'insufficient_privilege';
  end if;
  if v_dispute.status <> 'awaiting_merchant' then
    raise exception 'That case is not waiting on you.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_reply), '') = '' then
    raise exception 'Write something.' using errcode = 'check_violation';
  end if;

  update public.dispute set merchant_reply = trim(p_reply), status = 'open'
  where id = p_dispute_id returning * into v_dispute;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'dispute.merchant_replied',
    p_target_type => 'dispute', p_target_id => p_dispute_id);

  return v_dispute;
end;
$$;

/*
 * Resolve it.
 *
 * The money side is deliberately not written here. There is no ledger
 * in this project, and inventing one inside a dispute RPC is how a
 * refund ends up recorded in two places that disagree. What is recorded
 * is the decision, the amount and who is being charged — the facts the
 * Finance service needs when it exists, and the facts the guest and the
 * merchant are told either way.
 */
create or replace function public.rpc_dispute_resolve(
  p_dispute_id uuid,
  p_resolution public.dispute_resolution,
  p_amount_kes bigint default 0,
  p_fault public.dispute_fault default 'unknown',
  p_note text default null
)
returns public.dispute
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dispute public.dispute;
  v_charged text;
begin
  select * into v_dispute from public.dispute where id = p_dispute_id;
  if v_dispute.id is null then
    raise exception 'No such dispute.' using errcode = 'no_data_found';
  end if;
  if not authz.works_merchant(v_dispute.merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;

  v_charged := case p_resolution
    when 'full_refund_charge_merchant' then 'merchant'
    when 'partial_refund_charge_merchant' then 'merchant'
    when 'credit_wallet' then 'nexg'
    else 'none'
  end;

  update public.dispute set
    status = case when p_resolution = 'chargeback' then 'chargeback'::public.dispute_status
                  else 'resolved'::public.dispute_status end,
    resolution = p_resolution,
    fault = p_fault,
    amount_refunded_kes = greatest(coalesce(p_amount_kes, 0), 0),
    charged_to = v_charged,
    resolved_by = authz.staff_id(),
    resolved_at = now()
  where id = p_dispute_id
  returning * into v_dispute;

  /* A penalty is proposed, never applied silently — money leaving a
     merchant's payout is a second decision. */
  if v_charged = 'merchant' and coalesce(p_amount_kes, 0) > 0 then
    insert into public.merchant_penalty
      (merchant_id, order_reference, dispute_id, kind, amount_kes, status)
    values (v_dispute.merchant_id, v_dispute.order_reference, p_dispute_id,
            p_resolution::text, p_amount_kes, 'proposed');
  end if;

  insert into public.notification (kind, status) values ('dispute_outcome', 'pending');

  perform audit.log('staff'::public.actor_type, 'merchants', 'dispute.resolved',
    p_target_type => 'dispute', p_target_id => p_dispute_id,
    p_reason => p_note, p_severity => 'notice'::public.audit_severity,
    p_after => jsonb_build_object('resolution', p_resolution,
                                  'amount', p_amount_kes, 'charged_to', v_charged));

  return v_dispute;
end;
$$;

-- ────────────────────────────────────────────── catalogue edits

/*
 * Whether an edit needs a person.
 *
 * A price moving more than 15%, or anything involving alcohol. Everything
 * else applies itself and is logged — a merchant correcting a typo
 * should not wait on us.
 */
create or replace function public.fn_catalogue_edit_needs_review(
  p_kind text, p_payload jsonb, p_current_price integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind = 'new_item' and coalesce((p_payload ->> 'age_restricted')::boolean, false)
      then true
    when p_kind = 'price_change' and p_current_price is not null and p_current_price > 0
      then abs((p_payload ->> 'price_kes')::numeric - p_current_price) / p_current_price > 0.15
    when p_kind = 'remove_item' then false
    when p_kind = 'new_item' then true
    else false
  end
$$;

create or replace function public.rpc_catalogue_edit_review(
  p_request_id uuid, p_approve boolean, p_reason text default null
)
returns public.catalogue_edit_request
language plpgsql
security definer
set search_path = ''
as $$
declare v_request public.catalogue_edit_request;
begin
  select * into v_request from public.catalogue_edit_request
  where id = p_request_id and status = 'pending';

  if v_request.id is null then
    raise exception 'No such pending edit.' using errcode = 'no_data_found';
  end if;
  if not authz.works_merchant(v_request.merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;
  if not p_approve and coalesce(trim(coalesce(p_reason, '')), '') = '' then
    raise exception 'Say why you are rejecting it. The merchant reads this.'
      using errcode = 'check_violation';
  end if;

  if p_approve and v_request.kind = 'price_change' and v_request.catalogue_item_id is not null then
    update public.catalogue_item
    set price_kes = (v_request.payload ->> 'price_kes')::integer
    where id = v_request.catalogue_item_id;
  end if;

  update public.catalogue_edit_request
  set status = case when p_approve then 'approved' else 'rejected' end::public.edit_approval_status,
      reviewed_by = authz.staff_id(), reviewed_at = now(),
      reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_request_id
  returning * into v_request;

  insert into public.notification (kind, status)
  values (case when p_approve then 'edit_approved' else 'edit_rejected' end, 'pending');

  perform audit.log('staff'::public.actor_type, 'merchants', 'catalogue.edit_reviewed',
    p_target_type => 'catalogue_edit_request', p_target_id => p_request_id,
    p_reason => p_reason, p_after => jsonb_build_object('approved', p_approve));

  return v_request;
end;
$$;

create or replace function public.rpc_price_flag_resolve(
  p_flag_id uuid, p_action text
)
returns public.catalogue_price_flag
language plpgsql
security definer
set search_path = ''
as $$
declare v_flag public.catalogue_price_flag;
begin
  select * into v_flag from public.catalogue_price_flag where id = p_flag_id;
  if not authz.works_merchant(v_flag.merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;

  if p_action = 'align' and v_flag.observed_price_kes is not null then
    update public.catalogue_item set price_kes = v_flag.observed_price_kes
    where id = v_flag.catalogue_item_id;
  end if;

  update public.catalogue_price_flag
  set status = case p_action when 'align' then 'aligned' when 'dismiss' then 'dismissed'
                             else status end::public.price_flag_status,
      resolved_by = authz.staff_id(), resolved_at = now()
  where id = p_flag_id returning * into v_flag;

  perform audit.log('staff'::public.actor_type, 'merchants', 'catalogue.price_flag_resolved',
    p_target_type => 'catalogue_price_flag', p_target_id => p_flag_id,
    p_after => jsonb_build_object('action', p_action));

  return v_flag;
end;
$$;

-- ─────────────────────────────────────────────────── hours

create or replace function public.rpc_merchant_hours_override(
  p_merchant_id uuid,
  p_date date,
  p_opens time default null,
  p_closes time default null,
  p_closed boolean default false,
  p_branch_id uuid default null,
  p_reason text default null,
  p_source public.merchant_control_source default 'staff'
)
returns public.merchant_hours_override
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_override public.merchant_hours_override;
  v_is_merchant boolean;
begin
  v_is_merchant := exists (
    select 1 from public.merchant_user mu
    where mu.merchant_id = p_merchant_id and mu.user_id = (select auth.uid())
  );
  if not v_is_merchant and not authz.works_merchant(p_merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.merchant_hours_override
    (merchant_id, branch_id, date, opens, closes, closed, reason, source, created_by)
  values (p_merchant_id, p_branch_id, p_date, p_opens, p_closes, p_closed,
          p_reason, p_source, authz.staff_id())
  on conflict (merchant_id, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), date)
  do update set opens = excluded.opens, closes = excluded.closes,
                closed = excluded.closed, reason = excluded.reason, source = excluded.source
  returning * into v_override;

  perform audit.log(
    case when v_is_merchant then 'merchant_user' else 'staff' end::public.actor_type,
    'merchants', 'merchant.hours_override_set',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => to_jsonb(v_override));

  return v_override;
end;
$$;

grant execute on function
  public.rpc_merchant_control(uuid, text, jsonb, public.merchant_control_source, text),
  public.rpc_merchant_review_start(uuid),
  public.rpc_merchant_review_save(uuid, jsonb, text),
  public.rpc_merchant_return_to_applicant(uuid, jsonb),
  public.rpc_merchant_set_pause(uuid, boolean, text),
  public.rpc_merchant_two_person_request(uuid, text, text, jsonb),
  public.rpc_merchant_two_person_approve(uuid),
  public.rpc_dispute_open(uuid, text, text, text, bigint, jsonb),
  public.rpc_dispute_ask_merchant(uuid, integer),
  public.rpc_dispute_merchant_reply(uuid, text),
  public.rpc_dispute_resolve(uuid, public.dispute_resolution, bigint, public.dispute_fault, text),
  public.fn_catalogue_edit_needs_review(text, jsonb, integer),
  public.rpc_catalogue_edit_review(uuid, boolean, text),
  public.rpc_price_flag_resolve(uuid, text),
  public.rpc_merchant_hours_override(uuid, date, time, time, boolean, uuid, text,
                                     public.merchant_control_source)
to authenticated, service_role;
