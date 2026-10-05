-- What a dispatcher can do, and what it costs.
--
-- Every one of these states its consequence before it happens,
-- because the screen's promise is that an intervention is judged
-- against the rules in force — and a dispatcher cannot weigh
-- boosting against widening without knowing that a boost is rider
-- pay and a widen is five more riders.
--
-- Two invariants run through all of them:
--
--   * A boost is rider pay. It is never added to what the guest is
--     charged, and the order totals are not touched by any function
--     in this file.
--   * Moving the ETA tells the guest. Past a threshold it also
--     offers them a free cancellation, because a delay somebody
--     only discovers by waiting is the one that loses them.

create or replace function dispatch.fn_require(p_city_id uuid, p_what text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare v_me uuid := authz.staff_id();
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not authz.works_live_ops(p_city_id) then
    raise exception 'You cannot % in that city.' , p_what using errcode = '42501';
  end if;
  return v_me;
end;
$$;

-- ═══════════════ the numbers these actions are not allowed to invent
--
-- Registered, deliberately without values. Each one is a figure
-- somebody owns: a cap on rider pay, a promise of a free
-- cancellation, what a rider is owed for a wasted ride. Until the
-- owner publishes it the action refuses and says who publishes it,
-- which is the honest failure. A default here would be this file
-- quietly deciding what NexG pays people.

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, sort)
values
  ('dispatch.boost_max', 'dispatch', 'city', 'money', 'KES',
   'Most a dispatcher may boost',
   'The ceiling on a single boost. Without it a dispatcher can type any number into rider pay.',
   true, false, 'finance+ops_manager', array['dispatch','live_ops','finance'], 206),

  ('guest.free_cancel_delay_min', 'dispatch', 'city', 'int', 'minutes',
   'Delay that earns a free cancellation',
   'Past this much lateness the guest is offered their money back for walking away. Unset means no such offer is made — never guessed.',
   false, false, 'finance+ops_manager', array['live_ops','orders','finance'], 207),

  ('fees.cancellation_after_pickup', 'fees', 'city', 'money', 'KES',
   'Owed to a rider on a cancelled pickup',
   'A rider who already collected the order rode for nothing. This is what they keep.',
   true, false, 'finance+ops_manager', array['live_ops','orders','finance','riders'], 170),

  ('fees.merchant_cancel_compensation', 'fees', 'city', 'money', 'KES',
   'Owed to a merchant on a cancelled order',
   'A merchant who already confirmed and cooked. This is what they keep.',
   true, false, 'finance+ops_manager', array['live_ops','orders','finance','merchants'], 171),

  ('finance.cancel_two_person_threshold', 'fees', 'city', 'money', 'KES',
   'Cancellation that needs a second person',
   'Order totals at or above this go to the approvals queue instead of being cancelled on the spot. Unset means no cancellation is held back.',
   true, false, 'finance+ops_manager', array['live_ops','orders','finance'], 172)
on conflict (key) do nothing;

-- ═══════════════════════════════════════ boost and retry

create or replace function dispatch.rpc_boost_retry(
  p_job_id uuid, p_boost_cents bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j dispatch.job;
  v_me uuid;
  v_default bigint;
  v_max bigint;
  v_boost bigint;
  v_offered integer;
begin
  select * into j from dispatch.job where id = p_job_id;
  if not found then raise exception 'No such job.'; end if;
  v_me := dispatch.fn_require(j.city_id, 'boost an offer');

  if j.state in ('assigned', 'manual_assigned', 'completed', 'cancelled') then
    raise exception 'That job is already %.', j.state;
  end if;

  v_default := settings.fn_int('dispatch.boost_fee', j.city_id);
  v_max := settings.fn_int('dispatch.boost_max', j.city_id);
  v_boost := coalesce(p_boost_cents, v_default);

  /*
   * No boost is set for this city, so there is no number to add.
   * Inventing one would be paying a rider an amount nobody agreed
   * and billing it to the city's rider pay.
   */
  if v_boost is null then
    raise exception 'No boost amount is set for this city. Finance publishes it on Settings → Fees & dispatch, and until they do there is no figure to add to a rider''s pay.';
  end if;

  if v_max is not null and v_boost > v_max then
    raise exception 'That is above the cap of % for this city.', v_max;
  end if;

  /* Once per round. Two boosts in one round is a number nobody
     decided on reaching a rider. */
  if exists (select 1 from dispatch.action a
             where a.job_id = p_job_id and a.kind = 'boost_retry'
               and (a.params ->> 'round')::int = j.round) then
    raise exception 'This round has already been boosted. Let it run, or widen the radius.';
  end if;

  update dispatch.job set boost_cents = boost_cents + v_boost where id = p_job_id;

  insert into dispatch.action (job_id, kind, params, actor_id)
  values (p_job_id, 'boost_retry',
          jsonb_build_object('boost_cents', v_boost, 'round', j.round), v_me);

  v_offered := dispatch.fn_offer_round(p_job_id);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'dispatch.boosted', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => j.order_id,
    p_target_label => (select reference from public.order where id = j.order_id),
    p_city_id => j.city_id, p_severity => 'notice',
    p_after => jsonb_build_object('amount_cents', v_boost, 'currency', 'KES',
                                  'total_boost_cents', j.boost_cents + v_boost));

  return jsonb_build_object('ok', true, 'offered', v_offered,
    'message', case when v_offered = 0
      then 'Boosted, but nobody new is eligible. Widening the radius is the next thing.'
      else 'Boosted. ' || v_offered || ' rider' || case when v_offered = 1 then '' else 's' end
           || ' asked again — this goes on their pay, not the guest''s bill.' end);
end;
$$;

-- ════════════════════════════════════════ widen the radius

/*
 * How many more riders a wider radius would actually reach. Shown
 * before confirming, because "widen to 5 km" meaning "+0 riders" is
 * a click that wastes thirty seconds somebody does not have.
 */
create or replace function dispatch.fn_widen_preview(p_job_id uuid, p_radius_km numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j dispatch.job;
  v_now integer;
  v_then integer;
begin
  select * into j from dispatch.job where id = p_job_id;
  if not found then return jsonb_build_object('ok', false); end if;

  select count(*) into v_now from dispatch.fn_candidates(p_job_id, false);

  select count(*) into v_then
  from dispatch.fn_candidates(p_job_id, true) c
  where c.skip_reason = 'out_of_radius' and c.distance_km <= p_radius_km;

  return jsonb_build_object(
    'ok', true, 'eligible_now', v_now, 'newly_eligible', v_then,
    'message', case when v_then = 0
      then 'Nobody new inside ' || p_radius_km || ' km. Boosting, or telling the guest, is the next thing.'
      else '+' || v_then || ' rider' || case when v_then = 1 then '' else 's' end
           || ' inside ' || p_radius_km || ' km.' end);
end;
$$;

create or replace function dispatch.rpc_widen_radius(p_job_id uuid, p_radius_km numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j dispatch.job;
  v_me uuid;
  v_steps numeric[] := array[3, 5, 8];
  v_offered integer;
begin
  select * into j from dispatch.job where id = p_job_id;
  if not found then raise exception 'No such job.'; end if;
  v_me := dispatch.fn_require(j.city_id, 'widen a search');

  if j.state in ('assigned', 'manual_assigned', 'completed', 'cancelled') then
    raise exception 'That job is already %.', j.state;
  end if;
  if p_radius_km <= coalesce(j.radius_km, 3) then
    raise exception 'That is not wider than the % km already being searched.', j.radius_km;
  end if;
  if not (p_radius_km = any (v_steps)) then
    raise exception 'The steps are %, so that a rider is never sent somewhere nobody decided was reasonable.',
      array_to_string(v_steps, ' → ');
  end if;

  update dispatch.job set radius_km = p_radius_km where id = p_job_id;

  insert into dispatch.action (job_id, kind, params, actor_id)
  values (p_job_id, 'widen_radius',
          jsonb_build_object('from_km', j.radius_km, 'to_km', p_radius_km), v_me);

  v_offered := dispatch.fn_offer_round(p_job_id);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'dispatch.radius_widened', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => j.order_id,
    p_target_label => (select reference from public.order where id = j.order_id),
    p_city_id => j.city_id,
    p_before => jsonb_build_object('radius_km', j.radius_km),
    p_after => jsonb_build_object('radius_km', p_radius_km, 'offered', v_offered));

  return jsonb_build_object('ok', true, 'offered', v_offered,
    'message', 'Searching ' || p_radius_km || ' km. ' || v_offered || ' asked.');
end;
$$;

-- ═══════════════════════════════════ ask one rider directly

create or replace function dispatch.rpc_assign_manual(
  p_job_id uuid, p_rider_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j dispatch.job;
  v_me uuid;
  v_window integer := 60;
  v_rank integer;
  v_offer uuid;
  c record;
begin
  select * into j from dispatch.job where id = p_job_id;
  if not found then raise exception 'No such job.'; end if;
  v_me := dispatch.fn_require(j.city_id, 'assign a rider');

  if j.state in ('assigned', 'manual_assigned') then
    raise exception 'Somebody is already on this one.';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why you are picking this rider. The cascade had its reasons; this overrides them.';
  end if;

  select * into c from dispatch.fn_candidates(p_job_id, true) x
   where x.rider_id = p_rider_id;

  if c.rider_id is null then
    raise exception 'That rider is not online in this city.';
  end if;

  /*
   * A dispatcher may override distance and cooldown; they may not
   * override cash or vehicle. Those two are the ones where the
   * override produces a delivery that cannot physically happen or
   * money that goes missing.
   */
  if c.skip_reason in ('wrong_vehicle', 'cash_over_cap') then
    raise exception 'Cannot: %. That is not a judgement call — the order either does not fit the vehicle or the rider is already holding the cash cap.',
      c.note;
  end if;

  select coalesce(max(rank), 0) + 1 into v_rank
    from dispatch.offer where job_id = p_job_id and round = j.round;

  insert into dispatch.offer (
    job_id, round, rank, rider_id, distance_km, eta_min,
    expires_at, outcome, direct, note)
  values (
    p_job_id, j.round, v_rank, p_rider_id, c.distance_km, c.eta_min,
    now() + make_interval(secs => v_window), 'pending', true,
    'dispatcher asked · ' || p_reason)
  returning id into v_offer;

  insert into dispatch.action (job_id, kind, params, actor_id, reason)
  values (p_job_id, 'assign_manual',
          jsonb_build_object('rider_id', p_rider_id, 'offer_id', v_offer,
                             'window_s', v_window), v_me, p_reason);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'dispatch.manual_assigned', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => j.order_id,
    p_target_label => (select reference from public.order where id = j.order_id),
    p_city_id => j.city_id, p_reason => p_reason,
    p_after => jsonb_build_object('rider_id', p_rider_id, 'overrode', c.skip_reason));

  return jsonb_build_object('ok', true, 'offer_id', v_offer, 'window_s', v_window,
    'message', 'Asked ' || c.name || ' directly. They have ' || v_window
      || ' seconds, and they can still say no.');
end;
$$;

-- ═════════════════════════════════════ tell the guest

create or replace function dispatch.rpc_tell_guest_delay(
  p_order_id uuid, p_minutes integer, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_me uuid;
  v_free_cancel integer;
  v_offers_cancel boolean;
  v_recipient text;
  v_provider text;
  v_queued boolean;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  v_me := dispatch.fn_require(o.city_id, 'message a guest');

  if coalesce(p_minutes, 0) <= 0 then
    raise exception 'How many minutes?';
  end if;

  /*
   * If nobody has published the threshold, we do not guess one.
   * Offering a free cancellation is a refund promise, and a
   * refund promise invented by a default is one Finance never
   * agreed to.
   */
  v_free_cancel := settings.fn_int('guest.free_cancel_delay_min', o.city_id)::int;
  v_offers_cancel := v_free_cancel is not null and p_minutes >= v_free_cancel;

  select g.phone into v_recipient from public.guest g where g.id = o.guest_id;

  select i.status into v_provider from public.integration i where i.key = 'sms';
  v_queued := coalesce(v_provider, 'to_do') = 'connected';

  update public.order
     set promised_delivery_at = coalesce(promised_delivery_at, eta_at, now())
                                + make_interval(mins => p_minutes),
         eta_at = coalesce(eta_at, now()) + make_interval(mins => p_minutes),
         delay_notified_at = now(),
         delay_minutes_total = delay_minutes_total + p_minutes
   where id = p_order_id;

  insert into public.notification_log (channel, recipient, template, payload, status)
  values ('sms', coalesce(v_recipient, 'unknown'), 'guest_delay_notice',
          jsonb_build_object('order', o.reference, 'minutes', p_minutes,
                             'free_cancel', v_offers_cancel, 'note', p_note),
          case when v_queued and v_recipient is not null then 'queued' else 'skipped' end);

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (p_order_id, 'delay_notice_sent', 'Guest told about a delay',
          '+' || p_minutes || ' min'
            || case when v_offers_cancel then ' · offered a free cancellation' else '' end
            || coalesce(' · ' || p_note, ''),
          'staff', v_me,
          jsonb_build_object('minutes', p_minutes, 'free_cancel', v_offers_cancel));

  insert into dispatch.action (job_id, kind, params, actor_id, reason)
  select j.id, 'tell_guest_delay',
         jsonb_build_object('minutes', p_minutes, 'free_cancel', v_offers_cancel),
         v_me, p_note
    from dispatch.job j where j.order_id = p_order_id
     and j.state not in ('completed', 'cancelled');

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'order.delay_notified', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => p_order_id,
    p_target_label => o.reference, p_city_id => o.city_id,
    p_after => jsonb_build_object('minutes', p_minutes, 'free_cancel', v_offers_cancel));

  return jsonb_build_object('ok', true, 'free_cancel', v_offers_cancel, 'queued', v_queued,
    'message', case
      when v_recipient is null then 'Recorded on the order, but we have no number for this guest.'
      when not v_queued then 'Recorded. No SMS provider is connected, so nothing went out.'
      when v_offers_cancel then 'Queued: +' || p_minutes
        || ' min, with a free cancellation offered. Nothing drains the queue yet.'
      else 'Queued: +' || p_minutes || ' min. Nothing drains the queue yet.' end);
end;
$$;

-- ══════════════════════════════════════════════ cancel

/*
 * What cancelling costs, before it is done.
 *
 * Who is owed what depends entirely on how far the order got, and a
 * dispatcher cancelling at 20:45 cannot be expected to hold that in
 * their head. Compensation figures that are not set come back null
 * and the preview says so rather than implying zero.
 */
create or replace function dispatch.fn_cancel_preview(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_rider_comp bigint;
  v_merchant_comp bigint;
  v_threshold bigint;
begin
  select * into o from public.order where id = p_order_id;
  if not found then return jsonb_build_object('ok', false); end if;

  v_rider_comp := settings.fn_int('fees.cancellation_after_pickup', o.city_id);
  v_merchant_comp := settings.fn_int('fees.merchant_cancel_compensation', o.city_id);
  v_threshold := settings.fn_int('finance.cancel_two_person_threshold', o.city_id);

  return jsonb_build_object(
    'ok', true,
    'stage', o.stage,
    'guest_refund_cents', case
      when o.payment_status in ('paid', 'authorised') then o.total_cents
      else 0 end,
    'guest_paid', o.payment_status in ('paid', 'authorised'),
    /* Null is not zero. A rider who rode to a merchant is owed
       something; if nobody has set what, the screen says so. */
    'rider_compensation_cents', case when o.picked_up_at is not null then v_rider_comp end,
    'rider_compensation_set', o.picked_up_at is null or v_rider_comp is not null,
    'merchant_compensation_cents', case when o.confirmed_at is not null then v_merchant_comp end,
    'merchant_compensation_set', o.confirmed_at is null or v_merchant_comp is not null,
    'needs_second_person',
      v_threshold is not null and o.total_cents >= v_threshold,
    'threshold_cents', v_threshold);
end;
$$;

create or replace function dispatch.rpc_cancel(
  p_order_id uuid, p_reason_code text, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_me uuid;
  v_preview jsonb;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  v_me := dispatch.fn_require(o.city_id, 'cancel an order');

  if o.stage in ('delivered', 'cancelled', 'refunded') then
    raise exception 'That order is already %.', o.stage;
  end if;
  if coalesce(trim(p_reason_code), '') = '' then
    raise exception 'Pick a reason. The guest is told it, and so is the merchant.';
  end if;

  v_preview := dispatch.fn_cancel_preview(p_order_id);

  /* Above the threshold it is a two-person decision, and the
     approval queue is where that lives. */
  if (v_preview ->> 'needs_second_person')::boolean then
    insert into public.approval_request
      (kind, target_type, target_id, city_id, requested_by, reason, payload)
    values ('order_cancel', 'order', p_order_id, o.city_id, v_me,
            p_reason_code || ' · ' || coalesce(p_note, ''), v_preview);

    return jsonb_build_object('ok', true, 'awaiting_approval', true,
      'message', 'This one is over the threshold, so it needs a second person. It is in the approvals queue.');
  end if;

  update public.order
     set stage = 'cancelled', cancelled_at = now(), cancelled_by = v_me,
         cancel_reason_code = p_reason_code, cancel_note = p_note
   where id = p_order_id;

  update dispatch.job
     set state = 'cancelled', ended_at = now(), end_reason = p_reason_code
   where order_id = p_order_id and state not in ('completed', 'cancelled');

  update dispatch.offer set outcome = 'withdrawn', responded_at = now()
   where outcome = 'pending'
     and job_id in (select id from dispatch.job where order_id = p_order_id);

  insert into dispatch.action (job_id, kind, params, actor_id, reason)
  select j.id, 'cancel', v_preview, v_me, p_reason_code || coalesce(' · ' || p_note, '')
    from dispatch.job j where j.order_id = p_order_id;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (p_order_id, 'cancelled', 'Cancelled',
          p_reason_code || coalesce(' · ' || p_note, ''), 'staff', v_me, v_preview);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'order.cancelled', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => p_order_id,
    p_target_label => o.reference, p_reason => p_reason_code || ' · ' || coalesce(p_note, ''),
    p_city_id => o.city_id, p_severity => 'high',
    p_before => jsonb_build_object('stage', o.stage),
    p_after => v_preview || jsonb_build_object('amount_cents', o.total_cents, 'currency', o.currency));

  return jsonb_build_object('ok', true, 'preview', v_preview,
    'message', 'Cancelled. ' || case
      when (v_preview ->> 'guest_paid')::boolean
        then 'The guest is owed KES ' || ((v_preview ->> 'guest_refund_cents')::bigint / 100)
             || ' — issue it from the order.'
      else 'The guest had not paid.' end);
end;
$$;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('dispatch.boosted', 'live_ops', 'notice', false, false, true, 'A rider offer was boosted'),
  ('dispatch.radius_widened', 'live_ops', 'info', false, false, false, 'The search radius was widened'),
  ('dispatch.manual_assigned', 'live_ops', 'notice', false, false, false, 'A dispatcher picked a rider directly'),
  ('dispatch.escalated', 'live_ops', 'notice', false, false, false, 'A cascade ran out and went to the desk'),
  ('order.delay_notified', 'live_ops', 'info', false, false, false, 'A guest was told about a delay'),
  ('order.cancelled', 'live_ops', 'high', false, false, true, 'An order was cancelled')
on conflict (action) do nothing;

grant execute on function dispatch.fn_require(uuid, text) to authenticated;
grant execute on function dispatch.rpc_boost_retry(uuid, bigint) to authenticated;
grant execute on function dispatch.fn_widen_preview(uuid, numeric) to authenticated;
grant execute on function dispatch.rpc_widen_radius(uuid, numeric) to authenticated;
grant execute on function dispatch.rpc_assign_manual(uuid, uuid, text) to authenticated;
grant execute on function dispatch.rpc_tell_guest_delay(uuid, integer, text) to authenticated;
grant execute on function dispatch.fn_cancel_preview(uuid) to authenticated;
grant execute on function dispatch.rpc_cancel(uuid, text, text) to authenticated;
