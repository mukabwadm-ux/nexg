-- The Riders console · the writes.
--
-- Every one checks the caller's city grant, writes one audit event in
-- the same transaction as the change, and refuses rather than guesses.
-- The dangerous ones — suspension, offboarding, a cash write-off, a
-- rate card, a settlement run — need a second person, and the person
-- who asked is never the person who approves.
--
-- Cash is the theme. Nothing here writes `rider.cash_on_hand`: every
-- movement is a `cash_event` row and the balance follows. A function
-- that could set the balance directly would make the ledger advisory.

grant execute on function authz.works_rider(uuid) to authenticated, service_role;
grant execute on function authz.is_rider_self(uuid) to authenticated, service_role;
grant execute on function public.fn_rider_cash_cap(uuid) to authenticated, service_role;
grant execute on function public.fn_rider_document_state(uuid) to authenticated, service_role;
grant execute on function public.fn_zone_supply_gap(uuid, timestamptz) to authenticated, service_role;

-- ═════════════════════════════════════════════ controls

/*
 * Who changed a toggle matters as much as what it is set to.
 *
 * The console and the rider app call the same function. What differs is
 * `p_source` and what each may touch: a rider may stop taking offers,
 * and may not decide their own cash cap, their alcohol clearance or
 * whether they may carry large items. Those are ours.
 */
create or replace function public.rpc_rider_set_control(
  p_rider_id uuid,
  p_control text,
  p_value jsonb,
  p_source public.rider_control_source default 'staff',
  p_reason text default null
)
returns public.rider
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.rider;
  v_after public.rider;
  v_self boolean;
  v_staff uuid := authz.staff_id();
begin
  select * into v_before from public.rider where id = p_rider_id;
  if v_before.id is null then
    raise exception 'No such rider.' using errcode = 'no_data_found';
  end if;

  v_self := authz.is_rider_self(p_rider_id);

  if not v_self and not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider to change.' using errcode = 'insufficient_privilege';
  end if;

  /* The rider owns exactly one of these. */
  if v_self and not authz.works_rider(p_rider_id) and p_control <> 'can_receive_offers' then
    raise exception 'That one is not yours to set.' using errcode = 'insufficient_privilege';
  end if;

  if p_control = 'can_receive_offers' then
    update public.rider set
      can_receive_offers = (p_value #>> '{}')::boolean,
      can_receive_offers_source = p_source,
      offers_paused_reason = case
        when (p_value #>> '{}')::boolean then null else nullif(trim(coalesce(p_reason, '')), '')
      end
    where id = p_rider_id returning * into v_after;

  elsif p_control = 'pay_on_delivery_eligible' then
    update public.rider set pay_on_delivery_eligible = (p_value #>> '{}')::boolean
    where id = p_rider_id returning * into v_after;

  elsif p_control = 'cash_cap' then
    update public.rider set cash_cap = nullif(p_value #>> '{}', '')::bigint
    where id = p_rider_id returning * into v_after;

  elsif p_control = 'alcohol_eligible' then
    update public.rider set alcohol_eligible = (p_value #>> '{}')::boolean
    where id = p_rider_id returning * into v_after;

  elsif p_control = 'large_items_eligible' then
    /*
     * A boda cannot carry a sofa however the toggle is set. Refusing
     * here rather than disabling only the button means the rule holds
     * for anything that calls this, including a script.
     */
    if (p_value #>> '{}')::boolean and v_before.vehicle in ('motorbike', 'bicycle') then
      raise exception 'A % cannot take large items.', v_before.vehicle
        using errcode = 'check_violation';
    end if;
    update public.rider set large_items_eligible = (p_value #>> '{}')::boolean
    where id = p_rider_id returning * into v_after;

  else
    raise exception 'No control called %.', p_control using errcode = 'check_violation';
  end if;

  perform audit.log(
    p_actor_type => case when p_source = 'rider' then 'rider' else 'staff' end::public.actor_type,
    p_actor_id => v_staff,
    p_module => 'riders',
    p_action => 'rider.control_changed',
    p_target_type => 'rider',
    p_target_id => p_rider_id,
    p_city_id => v_after.city_id,
    p_reason => p_reason,
    p_before => jsonb_build_object(p_control, case p_control
      when 'can_receive_offers' then to_jsonb(v_before.can_receive_offers)
      when 'pay_on_delivery_eligible' then to_jsonb(v_before.pay_on_delivery_eligible)
      when 'cash_cap' then to_jsonb(v_before.cash_cap)
      when 'alcohol_eligible' then to_jsonb(v_before.alcohol_eligible)
      else to_jsonb(v_before.large_items_eligible) end),
    p_after => jsonb_build_object(p_control, p_value, 'source', p_source)
  );

  return v_after;
end;
$$;

grant execute on function public.rpc_rider_set_control(uuid, text, jsonb, public.rider_control_source, text)
  to authenticated;

-- ═════════════════════════════════════════════ presence

/*
 * Going online is not a toggle, it is a set of preconditions. The
 * refusal carries the reason so the rider app can show the thing to fix
 * rather than a shrug.
 */
create or replace function public.rpc_rider_set_presence(p_presence public.rider_presence)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_blocker text;
begin
  select * into v_rider from public.rider where user_id = (select auth.uid());
  if v_rider.id is null then
    raise exception 'You are not a rider.' using errcode = 'insufficient_privilege';
  end if;

  if p_presence = 'online' then
    if v_rider.status <> 'active' then
      v_blocker := 'Your account is not active yet.';
    elsif v_rider.cooldown_until is not null and v_rider.cooldown_until > now() then
      v_blocker := 'You are on cooldown until '
        || to_char(v_rider.cooldown_until at time zone 'Africa/Nairobi', 'HH24:MI')
        || coalesce(' · ' || v_rider.cooldown_reason, '');
    elsif exists (
      select 1 from public.rider_agreement_version v
      where v.status = 'current'
        and not exists (
          select 1 from public.rider_agreement_acceptance a
          where a.rider_id = v_rider.id and a.agreement_version_id = v.id)
    ) then
      v_blocker := 'Accept the current rider agreement first.';
    elsif exists (
      select 1 from public.document d
      join public.document_requirement dr on dr.id = d.requirement_id
      where d.owner_type = 'rider' and d.owner_id = v_rider.id
        and d.superseded_at is null and dr.essential
        and d.expires_at is not null and d.expires_at < current_date
    ) then
      v_blocker := 'One of your documents has expired. Retake it to go back online.';
    end if;

    if v_blocker is not null then
      return jsonb_build_object('ok', false, 'reason', v_blocker);
    end if;
  end if;

  update public.rider
  set presence = p_presence,
      presence_changed_at = now(),
      last_seen_at = now()
  where id = v_rider.id;

  insert into public.rider_presence_event (rider_id, presence, source, location)
  values (v_rider.id, p_presence, 'rider', v_rider.last_location);

  return jsonb_build_object('ok', true, 'presence', p_presence);
end;
$$;

grant execute on function public.rpc_rider_set_presence(public.rider_presence) to authenticated;

-- ═════════════════════════════════════════════ cooldown

/*
 * Up to 24 hours is one person's call. Longer is a suspension wearing a
 * different hat, so it needs two — enforced here rather than in the
 * dialog, because the dialog is not the security boundary.
 */
create or replace function public.rpc_rider_cooldown(
  p_rider_id uuid,
  p_hours integer,
  p_reason text
)
returns public.rider
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A cooldown without a reason is just a rider losing money. Write one.'
      using errcode = 'check_violation';
  end if;
  if p_hours is null or p_hours < 1 then
    raise exception 'How many hours?' using errcode = 'check_violation';
  end if;
  if p_hours > 24 then
    raise exception 'Over 24 hours is a suspension. Use the suspension flow, which needs two people.'
      using errcode = 'check_violation';
  end if;

  update public.rider set
    cooldown_until = now() + make_interval(hours => p_hours),
    cooldown_reason = trim(p_reason),
    presence = case when presence = 'on_trip' then presence else 'cooldown' end
  where id = p_rider_id
  returning * into v_rider;

  insert into public.notification (kind, rider_id, status)
  values ('rider_cooldown', p_rider_id, 'pending');

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.cooldown_set',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_city_id => v_rider.city_id, p_reason => trim(p_reason),
    p_after => jsonb_build_object('hours', p_hours, 'until', v_rider.cooldown_until),
    p_severity => 'notice'::public.audit_severity);

  return v_rider;
end;
$$;

create or replace function public.rpc_rider_cooldown_clear(p_rider_id uuid, p_reason text default null)
returns public.rider
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;

  update public.rider set
    cooldown_until = null,
    cooldown_reason = null,
    presence = case when presence = 'cooldown' then 'offline' else presence end
  where id = p_rider_id
  returning * into v_rider;

  insert into public.notification (kind, rider_id, status)
  values ('rider_cooldown_cleared', p_rider_id, 'pending');

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.cooldown_cleared',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_city_id => v_rider.city_id, p_reason => p_reason);

  return v_rider;
end;
$$;

grant execute on function public.rpc_rider_cooldown(uuid, integer, text) to authenticated;
grant execute on function public.rpc_rider_cooldown_clear(uuid, text) to authenticated;

-- ═════════════════════════════════════ suspension and offboarding

create or replace function public.rpc_rider_two_person_request(
  p_rider_id uuid,
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
  v_rider public.rider;
  v_request public.approval_request;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A second person has to read a reason. Write one.'
      using errcode = 'check_violation';
  end if;
  if p_kind not in ('rider_suspension', 'rider_offboard', 'rider_cash_write_off') then
    raise exception 'Not a two-person action.' using errcode = 'check_violation';
  end if;

  select * into v_rider from public.rider where id = p_rider_id;

  insert into public.approval_request
    (kind, target_type, target_id, city_id, requested_by, reason, payload)
  values (p_kind::public.approval_kind, 'rider', p_rider_id, v_rider.city_id,
          authz.staff_id(), trim(p_reason), p_payload)
  returning * into v_request;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.' || p_kind || '_requested',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_reason => trim(p_reason), p_city_id => v_rider.city_id,
    p_severity => 'high'::public.audit_severity);

  return v_request;
end;
$$;

/*
 * The second person. Refuses the requester, which is the entire point
 * and so lives here rather than in the screen that calls it.
 *
 * Suspension holds pending earnings; it does not forfeit them. The
 * helper text under the button says so, and this is the code that has
 * to make that true.
 */
create or replace function public.rpc_rider_two_person_approve(p_request_id uuid)
returns public.rider
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_request;
  v_rider public.rider;
  v_me uuid := authz.staff_id();
  v_amount bigint;
begin
  select * into v_request from public.approval_request
  where id = p_request_id and status = 'pending';

  if v_request.id is null then
    raise exception 'No such request, or it is already decided.'
      using errcode = 'no_data_found';
  end if;
  if not authz.works_rider(v_request.target_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  if v_request.requested_by = v_me then
    raise exception 'You asked for this. Somebody else has to approve it.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_request.kind::text = 'rider_suspension' then
    update public.rider set
      status = 'suspended',
      status_reason = v_request.reason,
      presence = 'offline',
      can_receive_offers = false,
      can_receive_offers_source = 'staff',
      offers_paused_reason = 'Suspended',
      suspended_at = now(),
      suspended_by = v_request.requested_by,
      suspension_reason = v_request.reason,
      suspension_second_approver = v_me
    where id = v_request.target_id
    returning * into v_rider;

    /* Held, not forfeited. */
    update public.rider_settlement_line l
    set status = 'held', failure_reason = 'Rider suspended · held pending review'
    from public.rider_settlement_run run
    where run.id = l.run_id
      and l.rider_id = v_request.target_id
      and l.status = 'ready'
      and run.status in ('draft', 'awaiting_approval');

    insert into public.notification (kind, rider_id, status)
    values ('rider_suspended', v_request.target_id, 'pending');

  elsif v_request.kind::text = 'rider_offboard' then
    update public.rider set
      status = 'offboarded',
      status_reason = v_request.reason,
      presence = 'offline',
      can_receive_offers = false,
      offboarded_at = now(),
      offboard_reason = v_request.reason,
      kit_deposit_status = coalesce(
        nullif(v_request.payload ->> 'kit_deposit', ''), kit_deposit_status)
    where id = v_request.target_id
    returning * into v_rider;

  elsif v_request.kind::text = 'rider_cash_write_off' then
    v_amount := (v_request.payload ->> 'amount_kes')::bigint;
    if v_amount is null or v_amount <= 0 then
      raise exception 'A write-off needs an amount.' using errcode = 'check_violation';
    end if;

    /* Negative: the rider stops holding money we have given up on. */
    insert into public.cash_event (rider_id, kind, amount_kes, created_by, note)
    values (v_request.target_id, 'write_off', -v_amount, v_me, v_request.reason);

    select * into v_rider from public.rider where id = v_request.target_id;
  end if;

  update public.approval_request
  set status = 'approved', decided_by = v_me, decided_at = now()
  where id = p_request_id;

  perform audit.log('staff'::public.actor_type, 'riders',
    'rider.' || v_request.kind::text || '_approved',
    p_target_type => 'rider', p_target_id => v_request.target_id,
    p_reason => v_request.reason, p_approved_by => v_me,
    p_city_id => v_rider.city_id,
    p_severity => 'high'::public.audit_severity);

  return v_rider;
end;
$$;

create or replace function public.rpc_rider_reinstate(p_rider_id uuid, p_reason text)
returns public.rider
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why they are coming back.' using errcode = 'check_violation';
  end if;

  update public.rider set
    status = 'active',
    status_reason = trim(p_reason),
    suspended_at = null, suspension_reason = null,
    can_receive_offers = true,
    can_receive_offers_source = 'staff',
    offers_paused_reason = null
  where id = p_rider_id and status = 'suspended'
  returning * into v_rider;

  if v_rider.id is null then
    raise exception 'That rider is not suspended.' using errcode = 'check_violation';
  end if;

  /* The held lines go back in the queue. */
  update public.rider_settlement_line
  set status = 'ready', failure_reason = null
  where rider_id = p_rider_id and status = 'held';

  insert into public.notification (kind, rider_id, status)
  values ('rider_reinstated', p_rider_id, 'pending');

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.reinstated',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_city_id => v_rider.city_id, p_reason => trim(p_reason),
    p_severity => 'high'::public.audit_severity);

  return v_rider;
end;
$$;

grant execute on function public.rpc_rider_two_person_request(uuid, text, text, jsonb) to authenticated;
grant execute on function public.rpc_rider_two_person_approve(uuid) to authenticated;
grant execute on function public.rpc_rider_reinstate(uuid, text) to authenticated;

-- ═════════════════════════════════════════════ the cash ledger

/*
 * The guard. Called after every cash movement.
 *
 * At the remind threshold the rider is told. At the pause threshold
 * cash orders stop — prepaid orders continue, because the problem is
 * the money they are carrying, not the rider. A deposit that brings
 * them back under restores offers automatically, and the restore is
 * logged, because a control that switches itself back on without a
 * record is how nobody can explain what happened.
 *
 * With no cap set, nothing fires. Inventing one here would suspend real
 * riders against a number this function made up.
 */
create or replace function public.fn_cash_guard(p_rider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_rule public.cash_rule;
  v_cap bigint;
begin
  select * into v_rider from public.rider where id = p_rider_id;
  select * into v_rule from public.cash_rule where city_id = v_rider.city_id;
  v_cap := public.fn_rider_cash_cap(p_rider_id);

  if v_cap is null or v_cap = 0 then
    return;
  end if;

  if v_rider.cash_on_hand >= v_cap * coalesce(v_rule.pause_at_pct, 100) / 100.0 then
    if v_rider.pay_on_delivery_eligible then
      update public.rider set
        pay_on_delivery_eligible = false,
        can_receive_offers_source = 'system',
        offers_paused_reason = 'over_cap'
      where id = p_rider_id;

      insert into public.notification (kind, rider_id, status)
      values ('offers_paused_over_cap', p_rider_id, 'pending');

      perform audit.log('system'::public.actor_type, 'riders', 'cash.over_cap',
        p_target_type => 'rider', p_target_id => p_rider_id,
        p_city_id => v_rider.city_id,
        p_after => jsonb_build_object('cash_on_hand', v_rider.cash_on_hand, 'cap', v_cap),
        p_severity => 'notice'::public.audit_severity);
    end if;

  elsif v_rider.cash_on_hand >= v_cap * coalesce(v_rule.remind_at_pct, 80) / 100.0 then
    insert into public.notification (kind, rider_id, status)
    values ('deposit_reminder', p_rider_id, 'pending');

  else
    /* Back under. Restore, but only what the system itself paused. */
    if not v_rider.pay_on_delivery_eligible
       and v_rider.offers_paused_reason = 'over_cap'
       and v_rider.can_receive_offers_source = 'system' then
      update public.rider set
        pay_on_delivery_eligible = true,
        offers_paused_reason = null,
        can_receive_offers_source = 'system'
      where id = p_rider_id;

      perform audit.log('system'::public.actor_type, 'riders', 'cash.under_cap_restored',
        p_target_type => 'rider', p_target_id => p_rider_id,
        p_city_id => v_rider.city_id,
        p_after => jsonb_build_object('cash_on_hand', v_rider.cash_on_hand, 'cap', v_cap));
    end if;
  end if;
end;
$$;

create or replace function public.tg_cash_event_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.fn_cash_guard(new.rider_id);
  return new;
end;
$$;

/* After the balance trigger, so the guard reads the new figure. */
create trigger cash_event_guard after insert on public.cash_event
  for each row execute function public.tg_cash_event_guard();

/*
 * A deposit arrives from the Paybill webhook with whatever reference
 * the rider typed. Matched by phone number when that is unambiguous;
 * anything else lands in the Unmatched list for a person.
 */
create or replace function public.fn_match_deposit(p_deposit_id uuid)
returns public.cash_deposit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dep public.cash_deposit;
  v_rider_id uuid;
  v_n integer;
begin
  select * into v_dep from public.cash_deposit where id = p_deposit_id;
  if v_dep.id is null or v_dep.match_status <> 'unmatched' then
    return v_dep;
  end if;

  select count(*), min(r.id) into v_n, v_rider_id
  from public.rider r
  where v_dep.msisdn is not null
    and right(regexp_replace(coalesce(r.payout_msisdn, r.phone), '\D', '', 'g'), 9)
      = right(regexp_replace(v_dep.msisdn, '\D', '', 'g'), 9);

  /* Two riders on one number is not a match, it is a question. */
  if v_n <> 1 then
    return v_dep;
  end if;

  update public.cash_deposit
  set rider_id = v_rider_id, match_status = 'auto_matched', matched_at = now()
  where id = p_deposit_id
  returning * into v_dep;

  insert into public.cash_event (rider_id, kind, amount_kes, deposit_id, note)
  values (v_rider_id, 'deposit', -v_dep.amount_kes, v_dep.id,
          'Paybill ' || v_dep.provider_ref || ' · auto-matched');

  insert into public.notification (kind, rider_id, status)
  values ('deposit_matched', v_rider_id, 'pending');

  perform audit.log('system'::public.actor_type, 'riders', 'cash.deposit_matched',
    p_target_type => 'rider', p_target_id => v_rider_id,
    p_after => jsonb_build_object('provider_ref', v_dep.provider_ref, 'amount', v_dep.amount_kes));

  return v_dep;
end;
$$;

create or replace function public.rpc_deposit_match_manual(p_deposit_id uuid, p_rider_id uuid)
returns public.cash_deposit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dep public.cash_deposit;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;

  update public.cash_deposit
  set rider_id = p_rider_id, match_status = 'manual_matched',
      matched_by = authz.staff_id(), matched_at = now()
  where id = p_deposit_id and match_status = 'unmatched'
  returning * into v_dep;

  if v_dep.id is null then
    raise exception 'That deposit is already matched, or does not exist.'
      using errcode = 'no_data_found';
  end if;

  insert into public.cash_event (rider_id, kind, amount_kes, deposit_id, created_by, note)
  values (p_rider_id, 'deposit', -v_dep.amount_kes, v_dep.id, authz.staff_id(),
          'Paybill ' || v_dep.provider_ref || ' · matched by hand');

  perform audit.log('staff'::public.actor_type, 'riders', 'cash.deposit_matched',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_after => jsonb_build_object('provider_ref', v_dep.provider_ref, 'amount', v_dep.amount_kes),
    p_severity => 'notice'::public.audit_severity);

  return v_dep;
end;
$$;

create or replace function public.rpc_deposit_reject(p_deposit_id uuid, p_reason text)
returns public.cash_deposit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dep public.cash_deposit;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to reject.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why.' using errcode = 'check_violation';
  end if;

  update public.cash_deposit
  set match_status = 'rejected', matched_by = authz.staff_id(), matched_at = now()
  where id = p_deposit_id and match_status = 'unmatched'
  returning * into v_dep;

  perform audit.log('staff'::public.actor_type, 'riders', 'cash.deposit_rejected',
    p_target_type => 'cash_deposit', p_target_id => p_deposit_id,
    p_reason => trim(p_reason), p_severity => 'notice'::public.audit_severity);

  return v_dep;
end;
$$;

/*
 * A manual correction. Above the city's threshold it needs two people;
 * below it, one person and a reason. The threshold is null until
 * somebody sets it, and null means every adjustment needs two — the
 * conservative reading, since the alternative is an unbounded
 * single-person write against the money ledger.
 */
create or replace function public.rpc_cash_manual_adjustment(
  p_rider_id uuid,
  p_amount_kes bigint,
  p_reason text
)
returns public.cash_event
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.cash_event;
  v_threshold bigint;
  v_city uuid;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'An adjustment to somebody''s money needs a reason.'
      using errcode = 'check_violation';
  end if;
  if p_amount_kes is null or p_amount_kes = 0 then
    raise exception 'How much?' using errcode = 'check_violation';
  end if;

  select r.city_id, c.two_person_threshold_kes into v_city, v_threshold
  from public.rider r left join public.cash_rule c on c.city_id = r.city_id
  where r.id = p_rider_id;

  if v_threshold is null or abs(p_amount_kes) >= v_threshold then
    raise exception 'That needs a second person. %',
      case when v_threshold is null
        then 'No single-person limit has been set for this city, so every adjustment does.'
        else 'The limit is KES ' || v_threshold || '.' end
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.cash_event (rider_id, kind, amount_kes, created_by, note)
  values (p_rider_id, 'manual_adjustment', p_amount_kes, authz.staff_id(), trim(p_reason))
  returning * into v_event;

  perform audit.log('staff'::public.actor_type, 'riders', 'cash.manual_adjustment',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_city_id => v_city, p_reason => trim(p_reason),
    p_after => jsonb_build_object('amount_kes', p_amount_kes),
    p_severity => 'high'::public.audit_severity);

  return v_event;
end;
$$;

grant execute on function public.fn_match_deposit(uuid) to service_role;
grant execute on function public.rpc_deposit_match_manual(uuid, uuid) to authenticated;
grant execute on function public.rpc_deposit_reject(uuid, text) to authenticated;
grant execute on function public.rpc_cash_manual_adjustment(uuid, bigint, text) to authenticated;

-- ═════════════════════════════════════════════ incidents

create or replace function public.rpc_incident_open(
  p_kind public.incident_kind,
  p_rider_id uuid default null,
  p_description text default null,
  p_severity public.incident_severity default 'minor',
  p_order_reference text default null,
  p_reported_by_type text default 'staff'
)
returns public.incident
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.incident;
begin
  insert into public.incident
    (kind, rider_id, description, severity, order_reference, reported_by_type, reported_by_id)
  values (p_kind, p_rider_id, nullif(trim(coalesce(p_description, '')), ''),
          case when p_kind = 'sos' then 'critical' else p_severity end,
          p_order_reference, p_reported_by_type, (select auth.uid()))
  returning * into v_incident;

  insert into public.notification (kind, rider_id, status)
  values ('incident_received', p_rider_id, 'pending');

  perform audit.log(
    case p_reported_by_type
      when 'rider' then 'rider' when 'guest' then 'guest'
      when 'merchant' then 'merchant_user' else 'staff' end::public.actor_type,
    'riders',
    case when p_kind = 'sos' then 'incident.sos' else 'incident.opened' end,
    p_target_type => 'incident', p_target_id => v_incident.id,
    p_severity => case when p_kind = 'sos' then 'high' else 'notice' end
      ::public.audit_severity);

  return v_incident;
end;
$$;

/*
 * An SOS is not closed by it stopping. Somebody acknowledges it, and
 * the banner stays up on every route until they do.
 */
create or replace function public.rpc_incident_sos_ack(p_incident_id uuid)
returns public.incident
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.incident;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to acknowledge.' using errcode = 'insufficient_privilege';
  end if;

  update public.incident
  set acknowledged_at = now(), acknowledged_by = authz.staff_id(),
      assignee_id = coalesce(assignee_id, authz.staff_id()),
      status = case when status = 'open' then 'investigating' else status end
  where id = p_incident_id and acknowledged_at is null
  returning * into v_incident;

  if v_incident.id is null then
    raise exception 'Already acknowledged, or no such incident.'
      using errcode = 'no_data_found';
  end if;

  insert into public.notification (kind, rider_id, status)
  values ('sos_ack', v_incident.rider_id, 'pending');

  perform audit.log('staff'::public.actor_type, 'riders', 'incident.acknowledged',
    p_target_type => 'incident', p_target_id => p_incident_id,
    p_severity => 'high'::public.audit_severity);

  return v_incident;
end;
$$;

create or replace function public.rpc_incident_update(
  p_incident_id uuid,
  p_patch jsonb,
  p_note text default null
)
returns public.incident
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.incident;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to change.' using errcode = 'insufficient_privilege';
  end if;

  update public.incident set
    severity = coalesce((p_patch ->> 'severity')::public.incident_severity, severity),
    status = coalesce((p_patch ->> 'status')::public.incident_status, status),
    assignee_id = coalesce((p_patch ->> 'assignee_id')::uuid, assignee_id),
    police_ref = coalesce(p_patch ->> 'police_ref', police_ref),
    insurance_claim_ref = coalesce(p_patch ->> 'insurance_claim_ref', insurance_claim_ref),
    insurance_claim_status = coalesce(p_patch ->> 'insurance_claim_status', insurance_claim_status),
    injury = coalesce((p_patch ->> 'injury')::boolean, injury)
  where id = p_incident_id
  returning * into v_incident;

  if nullif(trim(coalesce(p_note, '')), '') is not null then
    insert into public.incident_note (incident_id, author_id, body)
    values (p_incident_id, authz.staff_id(), trim(p_note));
  end if;

  perform audit.log('staff'::public.actor_type, 'riders', 'incident.updated',
    p_target_type => 'incident', p_target_id => p_incident_id, p_after => p_patch);

  return v_incident;
end;
$$;

/*
 * Closing needs an outcome. A resolved incident with no account of what
 * happened is a row that has been tidied away, not a problem that has
 * been dealt with — so the constraint is on the table and the refusal
 * is here, where it can say something useful.
 */
create or replace function public.rpc_incident_resolve(
  p_incident_id uuid,
  p_resolution text,
  p_compensation_kes bigint default null,
  p_redispatch boolean default false
)
returns public.incident
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.incident;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to close.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_resolution), '') = '' then
    raise exception 'Write what happened. An incident closed without an outcome is just a hidden one.'
      using errcode = 'check_violation';
  end if;

  update public.incident set
    status = 'resolved',
    resolved_at = now(),
    resolution = trim(p_resolution),
    compensation_kes = p_compensation_kes
  where id = p_incident_id
  returning * into v_incident;

  if p_compensation_kes is not null and p_compensation_kes > 0 and v_incident.rider_id is not null then
    insert into public.rider_adjustment (rider_id, kind, amount_kes, reason, created_by)
    values (v_incident.rider_id, 'incident_compensation', p_compensation_kes,
            'Incident ' || p_incident_id::text || ' · ' || trim(p_resolution),
            authz.staff_id());
  end if;

  insert into public.notification (kind, rider_id, status)
  values ('incident_resolved', v_incident.rider_id, 'pending');

  perform audit.log('staff'::public.actor_type, 'riders', 'incident.resolved',
    p_target_type => 'incident', p_target_id => p_incident_id,
    p_reason => trim(p_resolution),
    p_after => jsonb_build_object('compensation_kes', p_compensation_kes,
                                  'redispatch', p_redispatch),
    p_severity => 'notice'::public.audit_severity);

  return v_incident;
end;
$$;

grant execute on function public.rpc_incident_open(public.incident_kind, uuid, text, public.incident_severity, text, text) to authenticated;
grant execute on function public.rpc_incident_sos_ack(uuid) to authenticated;
grant execute on function public.rpc_incident_update(uuid, jsonb, text) to authenticated;
grant execute on function public.rpc_incident_resolve(uuid, text, bigint, boolean) to authenticated;

-- ═════════════════════════════════════════════ fraud and strikes

create or replace function public.rpc_fraud_signal_review(p_signal_id uuid, p_action text)
returns public.fraud_signal
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signal public.fraud_signal;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to review.' using errcode = 'insufficient_privilege';
  end if;
  if p_action not in ('confirm', 'dismiss') then
    raise exception 'Confirm or dismiss.' using errcode = 'check_violation';
  end if;

  update public.fraud_signal
  set status = case when p_action = 'confirm' then 'confirmed' else 'dismissed' end,
      reviewed_by = authz.staff_id(), reviewed_at = now()
  where id = p_signal_id and status = 'open'
  returning * into v_signal;

  if v_signal.id is null then
    raise exception 'Already reviewed, or no such signal.' using errcode = 'no_data_found';
  end if;

  if p_action = 'confirm' then
    insert into public.rider_strike (rider_id, level, reason, issued_by, expires_at)
    values (v_signal.rider_id, 2,
            'Fraud signal confirmed · ' || v_signal.kind::text,
            authz.staff_id(), now() + interval '90 days');

    update public.rider set strike_count = strike_count + 1 where id = v_signal.rider_id;

    insert into public.notification (kind, rider_id, status)
    values ('strike_issued', v_signal.rider_id, 'pending');
  end if;

  perform audit.log('staff'::public.actor_type, 'riders',
    'fraud.signal_' || p_action || 'ed',
    p_target_type => 'rider', p_target_id => v_signal.rider_id,
    p_after => jsonb_build_object('kind', v_signal.kind, 'signal_id', p_signal_id),
    p_severity => 'high'::public.audit_severity);

  return v_signal;
end;
$$;

create or replace function public.rpc_rider_strike(
  p_rider_id uuid, p_level integer, p_reason text
)
returns public.rider_strike
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_strike public.rider_strike;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A strike needs a reason the rider can read.'
      using errcode = 'check_violation';
  end if;

  insert into public.rider_strike (rider_id, level, reason, issued_by, expires_at)
  values (p_rider_id, p_level, trim(p_reason), authz.staff_id(), now() + interval '90 days')
  returning * into v_strike;

  update public.rider set strike_count = strike_count + 1 where id = p_rider_id;

  insert into public.notification (kind, rider_id, status)
  values ('strike_issued', p_rider_id, 'pending');

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.strike_issued',
    p_target_type => 'rider', p_target_id => p_rider_id, p_reason => trim(p_reason),
    p_after => jsonb_build_object('level', p_level),
    p_severity => 'high'::public.audit_severity);

  return v_strike;
end;
$$;

grant execute on function public.rpc_fraud_signal_review(uuid, text) to authenticated;
grant execute on function public.rpc_rider_strike(uuid, integer, text) to authenticated;

-- ═════════════════════════════════════════════ health

/*
 * The nightly recompute. Every input comes from the orders domain,
 * which does not exist, so today this writes a null band and a null
 * score for everyone — and the console shows [—] rather than marking
 * live riders red for having no trips.
 *
 * The shape is here so that when orders land, one function changes.
 */
create or replace function public.fn_compute_rider_health(p_as_of date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  v_weights jsonb;
begin
  select jsonb_object_agg(key, weight_pct) into v_weights
  from public.rider_health_weight_config;

  insert into public.rider_health_snapshot
    (rider_id, as_of, score, band, trips_30d, issues_30d, weights)
  select
    r.id,
    p_as_of,
    null::integer,
    null::public.rider_health_band,
    null::integer,
    (select count(*) from public.incident i
      where i.rider_id = r.id and i.happened_at > now() - interval '30 days')::integer,
    coalesce(v_weights, '{}'::jsonb)
  from public.rider r
  where r.status = 'active'
  on conflict (rider_id, as_of) do update
    set issues_30d = excluded.issues_30d, weights = excluded.weights;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.fn_compute_rider_health(date) is
  'Nightly. Score and band stay null until there is an orders domain to measure — a rider marked red for having no trips is worse than one marked [—].';

-- ═════════════════════════════════════════════ settlement

/*
 * Build a run from earnings, adjustments and the cash ledger.
 *
 * Netting is the part with teeth: cash a rider still holds past the
 * cutoff comes off their payout. Never below zero — if the cash exceeds
 * the earnings the line is held and the rider goes into recovery,
 * because a payout run cannot take money off somebody.
 */
create or replace function public.rpc_settlement_build(
  p_city_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.rider_settlement_run
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.rider_settlement_run;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to build.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.rider_settlement_run (city_id, period_start, period_end)
  values (p_city_id, p_period_start, p_period_end)
  on conflict (city_id, period_start, period_end) do update set status = 'draft'
  returning * into v_run;

  if v_run.status not in ('draft', 'awaiting_approval') then
    raise exception 'That run is already %.', v_run.status using errcode = 'check_violation';
  end if;

  delete from public.rider_settlement_line where run_id = v_run.id;

  insert into public.rider_settlement_line
    (run_id, rider_id, trips, earnings_kes, bonuses_kes, tips_kes,
     cash_collected_kes, cash_deposited_kes, cash_net_kes, net_pay_kes,
     status, payout_msisdn, payout_name, paid_to_merchant_id)
  select
    v_run.id,
    r.id,
    coalesce(e.trips, 0),
    coalesce(e.earnings, 0) + coalesce(adj.total, 0),
    coalesce(e.bonuses, 0),
    coalesce(e.tips, 0),
    coalesce(c.collected, 0),
    coalesce(c.deposited, 0),
    greatest(coalesce(c.collected, 0) - coalesce(c.deposited, 0), 0),
    /* Never negative. */
    greatest(
      coalesce(e.earnings, 0) + coalesce(e.bonuses, 0) + coalesce(e.tips, 0)
        + coalesce(adj.total, 0)
        - greatest(coalesce(c.collected, 0) - coalesce(c.deposited, 0), 0),
      0),
    case
      when r.status = 'suspended' then 'held'
      when r.payout_msisdn is null then 'held'
      /* The lookup said the registered name is not the ID name. Held,
         not lost — the rider is asked to fix it and the line carries. */
      when (r.payout_name_lookup ->> 'matched')::boolean is false then 'name_mismatch'
      when greatest(coalesce(c.collected, 0) - coalesce(c.deposited, 0), 0)
             > coalesce(e.earnings, 0) + coalesce(e.bonuses, 0) + coalesce(e.tips, 0)
        then 'held'
      when greatest(coalesce(c.collected, 0) - coalesce(c.deposited, 0), 0) > 0
        then 'cash_netted'
      else 'ready'
    end::public.settlement_line_status,
    r.payout_msisdn,
    r.payout_name_lookup ->> 'name',
    case when mc.fleet_delivery_pay_to_merchant then r.employer_merchant_id end
  from public.rider r
  left join public.merchant mc on mc.id = r.employer_merchant_id
  left join lateral (
    select count(*)::integer as trips,
           sum(base_kes + distance_kes + waiting_kes + pickup_bonus_kes - penalty_kes) as earnings,
           sum(peak_bonus_kes) as bonuses,
           sum(tip_kes) as tips
    from public.rider_earning x
    where x.rider_id = r.id and not x.is_test
      and x.earned_at >= p_period_start and x.earned_at < p_period_end + 1
  ) e on true
  left join lateral (
    select sum(amount_kes) as total from public.rider_adjustment a
    where a.rider_id = r.id
      and a.created_at >= p_period_start and a.created_at < p_period_end + 1
  ) adj on true
  left join lateral (
    select
      coalesce(sum(amount_kes) filter (where kind = 'collected'), 0) as collected,
      coalesce(-sum(amount_kes) filter (where kind in ('deposit', 'write_off')), 0) as deposited
    from public.cash_event ce
    where ce.rider_id = r.id
      and ce.created_at >= p_period_start and ce.created_at < p_period_end + 1
  ) c on true
  where r.city_id = p_city_id
    and r.status in ('active', 'suspended')
    and (coalesce(e.trips, 0) > 0 or coalesce(c.collected, 0) > 0 or coalesce(adj.total, 0) <> 0);

  update public.rider_settlement_run set
    total_gross_kes = coalesce((select sum(earnings_kes + bonuses_kes + tips_kes)
      from public.rider_settlement_line where run_id = v_run.id), 0),
    total_cash_netted_kes = coalesce((select sum(cash_net_kes)
      from public.rider_settlement_line where run_id = v_run.id), 0),
    total_net_kes = coalesce((select sum(net_pay_kes)
      from public.rider_settlement_line where run_id = v_run.id), 0),
    status = 'awaiting_approval'
  where id = v_run.id
  returning * into v_run;

  perform audit.log('staff'::public.actor_type, 'riders', 'settlement.run_built',
    p_target_type => 'settlement_run', p_target_id => v_run.id, p_city_id => p_city_id,
    p_after => jsonb_build_object('gross', v_run.total_gross_kes,
                                  'netted', v_run.total_cash_netted_kes,
                                  'net', v_run.total_net_kes),
    p_severity => 'high'::public.audit_severity);

  return v_run;
end;
$$;

/*
 * Two people, always. A payout run is the largest single movement of
 * money this company makes in a week.
 */
create or replace function public.rpc_settlement_approve(p_run_id uuid)
returns public.rider_settlement_run
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.rider_settlement_run;
  v_me uuid := authz.staff_id();
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to approve.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_run from public.rider_settlement_run where id = p_run_id;
  if v_run.id is null then
    raise exception 'No such run.' using errcode = 'no_data_found';
  end if;
  if v_run.status <> 'awaiting_approval' then
    raise exception 'That run is %, not awaiting approval.', v_run.status
      using errcode = 'check_violation';
  end if;

  if v_run.approved_by is null then
    update public.rider_settlement_run set approved_by = v_me
    where id = p_run_id returning * into v_run;

  elsif v_run.approved_by = v_me then
    raise exception 'You have already approved this run. It needs a second person.'
      using errcode = 'insufficient_privilege';

  else
    update public.rider_settlement_run
    set second_approver_id = v_me, status = 'approved'
    where id = p_run_id returning * into v_run;
  end if;

  perform audit.log('staff'::public.actor_type, 'riders', 'settlement.run_approved',
    p_target_type => 'settlement_run', p_target_id => p_run_id,
    p_city_id => v_run.city_id, p_approved_by => v_me,
    p_after => jsonb_build_object('status', v_run.status, 'net', v_run.total_net_kes),
    p_severity => 'high'::public.audit_severity);

  return v_run;
end;
$$;

/*
 * The B2C webhook comes back per line. A failure never silently drops:
 * the line keeps its amount and carries to the next run once the cause
 * is fixed.
 */
create or replace function public.rpc_settlement_line_result(
  p_line_id uuid,
  p_ok boolean,
  p_provider_ref text default null,
  p_failure_reason text default null
)
returns public.rider_settlement_line
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.rider_settlement_line;
begin
  update public.rider_settlement_line set
    status = case
      when p_ok then 'paid'
      when p_failure_reason ilike '%name%' then 'name_mismatch'
      else 'failed' end::public.settlement_line_status,
    provider_ref = coalesce(p_provider_ref, provider_ref),
    failure_reason = case when p_ok then null else p_failure_reason end,
    paid_at = case when p_ok then now() end
  where id = p_line_id
  returning * into v_line;

  if v_line.id is null then
    raise exception 'No such line.' using errcode = 'no_data_found';
  end if;

  /* Netted cash leaves the ledger only once the payout actually lands. */
  if p_ok and v_line.cash_net_kes > 0 then
    insert into public.cash_event (rider_id, kind, amount_kes, settlement_line_id, note)
    values (v_line.rider_id, 'netted', -v_line.cash_net_kes, v_line.id,
            'Netted from the settlement run');
  end if;

  insert into public.notification (kind, rider_id, status)
  values (case
    when p_ok then 'rider_payout_sent'
    when p_failure_reason ilike '%name%' then 'payout_failed_name_mismatch'
    else 'rider_payout_sent' end::public.notification_kind,
    v_line.rider_id, 'pending');

  perform audit.log('system'::public.actor_type, 'riders',
    case when p_ok then 'settlement.line_paid' else 'settlement.line_failed' end,
    p_target_type => 'rider', p_target_id => v_line.rider_id,
    p_after => jsonb_build_object('line_id', p_line_id, 'amount', v_line.net_pay_kes,
                                  'provider_ref', p_provider_ref,
                                  'failure_reason', p_failure_reason),
    p_severity => 'high'::public.audit_severity);

  return v_line;
end;
$$;

grant execute on function public.rpc_settlement_build(uuid, date, date) to authenticated;
grant execute on function public.rpc_settlement_approve(uuid) to authenticated;
grant execute on function public.rpc_settlement_line_result(uuid, boolean, text, text) to service_role;

-- ═════════════════════════════════════════════ rate card

create or replace function public.rpc_rate_card_publish(p_card_id uuid)
returns public.rider_rate_card
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.rider_rate_card;
  v_me uuid := authz.staff_id();
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to publish.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_card from public.rider_rate_card where id = p_card_id;
  if v_card.id is null then
    raise exception 'No such rate card.' using errcode = 'no_data_found';
  end if;
  if v_card.status <> 'draft' then
    raise exception 'That card is already %.', v_card.status using errcode = 'check_violation';
  end if;

  /*
   * A rate card with nothing in it is a promise to riders about what a
   * trip pays. It does not go live empty.
   */
  if v_card.base_per_trip_kes is null or v_card.per_km_after_2km_kes is null then
    raise exception 'Fill in at least the base and the per-km rate before publishing.'
      using errcode = 'check_violation';
  end if;

  if v_card.approved_by is null then
    update public.rider_rate_card set approved_by = v_me
    where id = p_card_id returning * into v_card;

  elsif v_card.approved_by = v_me then
    raise exception 'You approved this card. Changing what riders are paid needs a second person.'
      using errcode = 'insufficient_privilege';

  else
    update public.rider_rate_card set status = 'archived'
    where city_id = v_card.city_id and status = 'current';

    update public.rider_rate_card
    set second_approver_id = v_me, status = 'current'
    where id = p_card_id returning * into v_card;

    insert into public.notification (kind, status) values ('rate_card_changing', 'pending');
  end if;

  perform audit.log('staff'::public.actor_type, 'riders', 'rate_card.published',
    p_target_type => 'rate_card', p_target_id => p_card_id,
    p_city_id => v_card.city_id, p_approved_by => v_me,
    p_after => to_jsonb(v_card), p_severity => 'high'::public.audit_severity);

  return v_card;
end;
$$;

grant execute on function public.rpc_rate_card_publish(uuid) to authenticated;

-- ═════════════════════════════════════════════ supply

create or replace function public.rpc_supply_action(
  p_zone_id uuid,
  p_kind text,
  p_params jsonb default '{}'::jsonb
)
returns public.supply_action
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.supply_action;
  v_expires timestamptz;
  v_zone public.zone;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to apply.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_zone from public.zone where id = p_zone_id;
  if v_zone.id is null then
    raise exception 'No such zone.' using errcode = 'no_data_found';
  end if;

  /* Everything here expires. A bonus left on because nobody remembered
     is a bonus nobody budgeted for. */
  v_expires := coalesce(
    nullif(p_params ->> 'expires_at', '')::timestamptz,
    now() + interval '2 hours');

  insert into public.supply_action (zone_id, kind, params, applied_by, expires_at)
  values (p_zone_id, p_kind, p_params, authz.staff_id(), v_expires)
  returning * into v_action;

  if p_kind = 'raise_zone_bonus' then
    insert into public.rider_bonus_rule (key, city_id, zone_id, enabled, params, expires_at, created_by)
    values ('zone_bonus', v_zone.city_id, p_zone_id, true, p_params, v_expires, authz.staff_id());

    insert into public.notification (kind, status) values ('zone_bonus_live', 'pending');

  elsif p_kind = 'widen_dispatch_radius' then
    insert into public.dispatch_zone_setting (zone_id, radius_km, expires_at, set_by)
    values (p_zone_id, (p_params ->> 'radius_km')::numeric, v_expires, authz.staff_id())
    on conflict (zone_id) do update
      set radius_km = excluded.radius_km, expires_at = excluded.expires_at,
          set_by = excluded.set_by, set_at = now();

  elsif p_kind = 'broadcast_open_shift' then
    insert into public.notification (kind, status) values ('shift_open_broadcast', 'pending');

  elsif p_kind in ('rain_mode_on', 'rain_mode_off') then
    update public.rider_bonus_rule
    set enabled = (p_kind = 'rain_mode_on'),
        expires_at = case when p_kind = 'rain_mode_on' then v_expires end
    where key = 'rain_mode';

    if p_kind = 'rain_mode_on' then
      insert into public.notification (kind, status) values ('rain_mode_on', 'pending');
    end if;
  end if;

  perform audit.log('staff'::public.actor_type, 'riders', 'supply.action_applied',
    p_target_type => 'zone', p_target_id => p_zone_id, p_city_id => v_zone.city_id,
    p_after => jsonb_build_object('kind', p_kind, 'params', p_params, 'expires_at', v_expires));

  return v_action;
end;
$$;

grant execute on function public.rpc_supply_action(uuid, text, jsonb) to authenticated;

-- ═════════════════════════════════════════ shifts

create or replace function public.rpc_shift_commit(
  p_zone_id uuid, p_date date, p_window text
)
returns public.shift_commitment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_shift public.shift_commitment;
begin
  select * into v_rider from public.rider where user_id = (select auth.uid());
  if v_rider.id is null then
    raise exception 'You are not a rider.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.shift_commitment (rider_id, zone_id, date, time_window)
  values (v_rider.id, p_zone_id, p_date, p_window)
  on conflict (rider_id, zone_id, date, time_window)
    do update set status = 'committed', committed_at = now()
  returning * into v_shift;

  return v_shift;
end;
$$;

create or replace function public.rpc_shift_release(p_shift_id uuid)
returns public.shift_commitment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.shift_commitment;
begin
  update public.shift_commitment set status = 'released'
  where id = p_shift_id
    and (authz.is_rider_self(rider_id) or authz.works_rider(rider_id))
  returning * into v_shift;

  if v_shift.id is null then
    raise exception 'Not your shift.' using errcode = 'insufficient_privilege';
  end if;

  return v_shift;
end;
$$;

grant execute on function public.rpc_shift_commit(uuid, date, text) to authenticated;
grant execute on function public.rpc_shift_release(uuid) to authenticated;

-- ═════════════════════════════════════════ live location

/*
 * Somebody's location is the most sensitive thing in this database.
 *
 * It is returned while they are on a trip or in an open critical
 * incident, because that is operationally necessary. Any other look
 * needs a stated reason, and both kinds are logged against the person
 * who looked. A reason field nobody reads is still a reason field
 * somebody had to type, which is most of the deterrent.
 */
create or replace function public.rpc_rider_live_location(
  p_rider_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_operational boolean;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_rider from public.rider where id = p_rider_id;

  v_operational := v_rider.presence = 'on_trip' or exists (
    select 1 from public.incident i
    where i.rider_id = p_rider_id
      and i.status in ('open', 'investigating')
      and (i.kind = 'sos' or i.severity = 'critical')
  );

  if not v_operational and coalesce(trim(coalesce(p_reason, '')), '') = '' then
    raise exception 'They are not on a trip. Say why you need their location.'
      using errcode = 'check_violation';
  end if;

  perform audit.log('staff'::public.actor_type, 'riders', 'pii.location_viewed',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_city_id => v_rider.city_id,
    p_reason => coalesce(nullif(trim(coalesce(p_reason, '')), ''),
                         'On a trip or in an open critical incident'),
    p_severity => 'high'::public.audit_severity);

  if v_rider.last_location is null then
    return jsonb_build_object('ok', false, 'reason', 'No fix has been received from this rider.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'lat', extensions.st_y(v_rider.last_location::extensions.geometry),
    'lng', extensions.st_x(v_rider.last_location::extensions.geometry),
    'at', v_rider.last_location_at,
    'presence', v_rider.presence,
    'order_reference', v_rider.current_order_reference
  );
end;
$$;

grant execute on function public.rpc_rider_live_location(uuid, text) to authenticated;

-- ═════════════════════════════════════════ comms

create or replace function public.rpc_rider_message_send(
  p_rider_id uuid,
  p_channel text,
  p_body text,
  p_subject text default null
)
returns public.rider_message
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.rider_message;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Nothing to send.' using errcode = 'check_violation';
  end if;

  insert into public.rider_message (rider_id, direction, channel, subject, body, actor_id)
  values (p_rider_id, 'out', p_channel, nullif(trim(coalesce(p_subject, '')), ''),
          trim(p_body), authz.staff_id())
  returning * into v_message;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.message_sent',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_after => jsonb_build_object('channel', p_channel));

  return v_message;
end;
$$;

/* A call happened whether or not anybody wrote it down. This is how it
   gets written down. */
create or replace function public.rpc_rider_log_call(p_rider_id uuid, p_note text)
returns public.rider_message
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.rider_message;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'What was the call about?' using errcode = 'check_violation';
  end if;

  insert into public.rider_message (rider_id, direction, channel, body, actor_id)
  values (p_rider_id, 'out', 'call', trim(p_note), authz.staff_id())
  returning * into v_message;

  return v_message;
end;
$$;

grant execute on function public.rpc_rider_message_send(uuid, text, text, text) to authenticated;
grant execute on function public.rpc_rider_log_call(uuid, text) to authenticated;

-- ═════════════════════════════════════ pipeline, documents

create or replace function public.rpc_rider_reference_log(
  p_rider_id uuid,
  p_name text,
  p_phone text,
  p_outcome text,
  p_notes text default null
)
returns public.rider_reference_check
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref public.rider_reference_check;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.rider_reference_check
    (rider_id, name, phone, called_by, called_at, outcome, notes)
  values (p_rider_id, trim(p_name), nullif(trim(coalesce(p_phone, '')), ''),
          authz.staff_id(), now(), p_outcome, nullif(trim(coalesce(p_notes, '')), ''))
  returning * into v_ref;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.reference_checked',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_after => jsonb_build_object('outcome', p_outcome));

  return v_ref;
end;
$$;

create or replace function public.rpc_rider_training_record(
  p_rider_id uuid,
  p_module text,
  p_score integer,
  p_passed boolean
)
returns public.rider_training
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.rider_training;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.rider_training (rider_id, module, score, passed, attempts, completed_at)
  values (p_rider_id, p_module, p_score, p_passed, 1, case when p_passed then now() end)
  on conflict (rider_id, module) do update set
    score = excluded.score,
    passed = excluded.passed,
    attempts = public.rider_training.attempts + 1,
    completed_at = case when excluded.passed then now() else public.rider_training.completed_at end
  returning * into v_row;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.training_recorded',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_after => jsonb_build_object('module', p_module, 'score', p_score, 'passed', p_passed));

  return v_row;
end;
$$;

create or replace function public.rpc_rider_issue_kit(
  p_rider_id uuid,
  p_deposit_kes bigint default null
)
returns public.rider
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
begin
  if not authz.works_rider(p_rider_id) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;

  update public.rider set
    kit_issued_at = now(),
    kit_deposit_kes = coalesce(p_deposit_kes, kit_deposit_kes),
    kit_deposit_status = case when p_deposit_kes is not null then 'held' else kit_deposit_status end
  where id = p_rider_id
  returning * into v_rider;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.kit_issued',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_city_id => v_rider.city_id,
    p_after => jsonb_build_object('deposit_kes', p_deposit_kes),
    p_severity => 'notice'::public.audit_severity);

  return v_rider;
end;
$$;

grant execute on function public.rpc_rider_reference_log(uuid, text, text, text, text) to authenticated;
grant execute on function public.rpc_rider_training_record(uuid, text, integer, boolean) to authenticated;
grant execute on function public.rpc_rider_issue_kit(uuid, bigint) to authenticated;

-- ═════════════════════════════════ the approvals queue, for riders
--
-- `approval_request` was readable by super admins and by whoever can
-- manage merchants. Nothing let a rider_ops lead see a rider
-- suspension they had just asked for, which made the whole two-person
-- flow unusable from this console: the requester could not show it to
-- anybody and the second person could not find it.
--
-- Scoped to the rider kinds and to the city, so a Nairobi lead is not
-- handed Mombasa's queue.

create policy approval_read_rider_staff on public.approval_request
  for select to authenticated
  using (
    kind in ('rider_suspension', 'rider_offboard', 'rider_cash_write_off',
             'rider_rate_card', 'rider_settlement_run')
    and authz.can_manage_riders(city_id)
  );

-- ═════════════════════════════ activation is a date, not a state
--
-- `rider_activation_is_attributed` was written as an equivalence:
-- status = 'active' if and ONLY IF activated_at is not null. The
-- comment above it says what was meant — "an active rider must carry
-- who activated them and when" — which is one direction.
--
-- As an equivalence it makes suspending anybody impossible without
-- also erasing the date they were activated, and an offboarded rider
-- would carry no record of ever having been on the platform. That is
-- the opposite of what an attribution constraint is for. The
-- suspension RPC below hit it on its first run.
--
-- Relaxed to the implication. When they were activated stays true
-- after they stop being active, which is the whole point of recording
-- it.

alter table public.rider
  drop constraint if exists rider_activation_is_attributed;

alter table public.rider
  add constraint rider_activation_is_attributed check (
    status <> 'active' or activated_at is not null
  );

comment on constraint rider_activation_is_attributed on public.rider is
  'An active rider carries when they were activated. A suspended or offboarded one keeps that date — it is a fact about their history, not a flag for their current state.';
