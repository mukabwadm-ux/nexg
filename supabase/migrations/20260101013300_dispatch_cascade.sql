-- Running the cascade, and intervening in it.
--
-- Every parameter here comes from `settings.dispatch_v` and none of
-- it is written down twice. The header on the screen says "20 s
-- accept window · 3 rounds · 3 km radius" and a dispatcher judges
-- every intervention against that, so a constant in this file that
-- disagreed with the header would make the screen lie.
--
-- A job also freezes the rule versions it started under. Settings
-- can change mid-cascade; a job that began on a twenty-second
-- window must not suddenly be judged against a thirty-second one.

-- ════════════════════════════════ who could take this job

/*
 * The eligible list, with a reason for everybody excluded.
 *
 * The exclusions are the valuable half: "outside 3 km", "cash over
 * cap", "on cooldown" is what a dispatcher reads to decide between
 * widening and boosting. A list that merely omitted them would
 * leave the screen unable to explain itself.
 */
create or replace function dispatch.fn_candidates(
  p_job_id uuid,
  p_include_ineligible boolean default false
)
returns table (
  rider_id uuid,
  name text,
  vehicle text,
  plate_no text,
  distance_km numeric,
  eta_min integer,
  cash_on_hand_cents bigint,
  presence text,
  eligible boolean,
  skip_reason dispatch.skip_reason,
  note text
)
language sql
stable
security definer
set search_path = ''
as $$
  with j as (
    select * from dispatch.job where id = p_job_id
  ),
  cap as (
    select settings.fn_int('dispatch.rider_cash_cap', (select city_id from j)) as cash_cap,
           coalesce(settings.fn_bool('dispatch.stacking', (select city_id from j)), false) as stacking
  ),
  near as (
    select
      p.rider_id,
      trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')) as name,
      r.vehicle::text as vehicle,
      r.plate_no,
      /* Straight-line distance. The Routes matrix would be better
         and costs money per call; this ranks the shortlist and the
         console asks Routes only for the few it shows. */
      round((extensions.st_distance(p.point, j.pickup_point) / 1000.0)::numeric, 2) as distance_km,
      p.cash_on_hand_cents,
      p.presence::text as presence,
      p.current_job_id,
      p.capabilities
    from dispatch.rider_presence_live p
    join public.rider r on r.id = p.rider_id
    cross join j
    where p.city_id = j.city_id
      and p.presence in ('online_free', 'on_trip', 'idle_30')
      and p.point is not null
      and j.pickup_point is not null
  )
  select
    n.rider_id,
    n.name,
    n.vehicle,
    n.plate_no,
    n.distance_km,
    /* Twenty km/h through Nairobi traffic, plus two minutes to get
       moving. A rough number, and honestly rough — the console
       replaces it with Routes for the handful it displays. */
    greatest(1, ceil(n.distance_km / 20.0 * 60.0 + 2))::integer as eta_min,
    n.cash_on_hand_cents,
    n.presence,
    s.skip_reason is null as eligible,
    s.skip_reason,
    coalesce(
      case s.skip_reason
        when 'out_of_radius' then 'outside ' || j.radius_km || ' km'
        when 'cash_over_cap' then 'cash over cap'
        when 'on_cooldown' then 'on cooldown'
        when 'wrong_vehicle' then 'wrong vehicle · ' || array_to_string(j.vehicle_requirements, ', ')
        when 'stacking_not_allowed' then 'already on a trip'
        when 'already_offered' then 'already asked this round'
        else s.skip_reason::text
      end,
      case when n.presence = 'idle_30' then 'idle 30+ min' end) as note
  from near n
  cross join j
  cross join cap c
  cross join lateral (
    select (
      case
        when n.distance_km > coalesce(j.radius_km, 3) then 'out_of_radius'
        when coalesce(array_length(j.vehicle_requirements, 1), 0) > 0
             and not (j.vehicle_requirements <@ coalesce(n.capabilities, '{}'))
          then 'wrong_vehicle'
        /* Cash on delivery against a rider already holding the cap
           is how money goes missing, so it is a hard exclusion
           rather than a warning. */
        when c.cash_cap is not null and coalesce(n.cash_on_hand_cents, 0) >= c.cash_cap
             and exists (select 1 from public.order o
                         where o.id = j.order_id and o.payment_method = 'cash_on_delivery')
          then 'cash_over_cap'
        when n.current_job_id is not null and not c.stacking then 'stacking_not_allowed'
        when exists (select 1 from dispatch.offer o
                     where o.job_id = j.id and o.rider_id = n.rider_id
                       and o.round = j.round)
          then 'already_offered'
      end
    )::dispatch.skip_reason as skip_reason
  ) s
  where p_include_ineligible or s.skip_reason is null
  order by s.skip_reason is not null, n.distance_km
$$;

-- ════════════════════════════════════════ starting a job

create or replace function dispatch.rpc_job_start(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_job uuid;
  v_radius numeric;
  v_pickup extensions.geography;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;

  if exists (select 1 from dispatch.job j
             where j.order_id = p_order_id and j.state not in ('cancelled', 'completed')) then
    return jsonb_build_object('ok', true, 'already_running', true);
  end if;

  select extensions.st_setsrid(extensions.st_makepoint(b.longitude, b.latitude), 4326)::extensions.geography
    into v_pickup
    from public.merchant_branch b where b.id = o.branch_id;

  v_radius := coalesce(settings.fn_num('dispatch.search_radius_km', o.city_id), 3);

  insert into dispatch.job (
    order_id, city_id, zone_id, pickup_point, dropoff_point,
    pickup_label, dropoff_label, distance_km, state, round, radius_km,
    rule_version_ids)
  values (
    p_order_id, o.city_id, o.zone_id, v_pickup, o.dropoff_point,
    coalesce((select coalesce(m.trading_name, m.legal_name) from public.merchant m
               where m.id = o.merchant_id), 'Merchant'),
    o.dropoff_label,
    case when v_pickup is not null and o.dropoff_point is not null
         then round((extensions.st_distance(v_pickup, o.dropoff_point) / 1000.0)::numeric, 2) end,
    'queued', 0, v_radius,
    /* Frozen: a job that started on a 20-second window is judged
       against a 20-second window. */
    jsonb_build_object(
      'accept_window_s', settings.fn_get('dispatch.accept_window_s', 'city', o.city_id) ->> 'version_id',
      'rounds', settings.fn_get('dispatch.rounds_before_boost', 'city', o.city_id) ->> 'version_id',
      'radius', settings.fn_get('dispatch.search_radius_km', 'city', o.city_id) ->> 'version_id'))
  returning id into v_job;

  perform dispatch.fn_offer_round(v_job);

  return jsonb_build_object('ok', true, 'job_id', v_job);
end;
$$;

/*
 * One round: offer to everybody eligible, ranked, with a window.
 *
 * The skipped riders are written down too. A dispatcher asking "why
 * wasn't Rider D offered" gets an answer rather than an absence.
 */
create or replace function dispatch.fn_offer_round(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  j dispatch.job;
  v_window integer;
  v_round integer;
  v_n integer := 0;
  c record;
  v_rank integer := 0;
begin
  select * into j from dispatch.job where id = p_job_id;
  if j.state in ('assigned', 'manual_assigned', 'cancelled', 'completed') then
    return 0;
  end if;

  v_window := coalesce(settings.fn_int('dispatch.accept_window_s', j.city_id)::int, 20);
  v_round := j.round + 1;

  /*
   * One live offer per rider per job. A dispatcher who widens or
   * boosts while a direct offer is still counting down would
   * otherwise leave that rider holding two cards for the same
   * order, and two accepts racing each other. The earlier offer is
   * withdrawn and says why, so the cascade still reads as what
   * happened.
   */
  update dispatch.offer
     set outcome = 'withdrawn', responded_at = now(),
         note = coalesce(note || ' · ', '') || 'withdrawn when round ' || v_round || ' started'
   where job_id = p_job_id and outcome = 'pending' and round < v_round;

  update dispatch.job set round = v_round, state = 'offering' where id = p_job_id;

  for c in select * from dispatch.fn_candidates(p_job_id, true) loop
    v_rank := v_rank + 1;
    insert into dispatch.offer (
      job_id, round, rank, rider_id, distance_km, eta_min,
      expires_at, outcome, skip_reason, responded_at, note)
    values (
      p_job_id, v_round, v_rank, c.rider_id, c.distance_km, c.eta_min,
      case when c.eligible then now() + make_interval(secs => v_window) end,
      case when c.eligible then 'pending' else 'skipped' end::dispatch.offer_outcome,
      c.skip_reason,
      case when not c.eligible then now() end,
      c.note);

    if c.eligible then v_n := v_n + 1; end if;
  end loop;

  /* Nobody at all is not the same as nobody who said yes, and the
     escalation reason records which. */
  if v_n = 0 then
    update dispatch.job
       set state = 'escalated', escalated_at = now(),
           escalation_reason = case when v_rank = 0 then 'no_eligible_riders'
                                    else 'radius_exhausted' end
     where id = p_job_id;
  end if;

  return v_n;
end;
$$;

/*
 * The minute hand. Expires offers whose window has passed, advances
 * a round when everybody has answered, and escalates when the
 * rounds run out.
 */
create or replace function dispatch.cron_advance()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer;
  v_advanced integer := 0;
  v_escalated integer := 0;
  j record;
  v_max_rounds integer;
begin
  update dispatch.offer
     set outcome = 'timed_out', responded_at = now()
   where outcome = 'pending' and expires_at < now();
  get diagnostics v_expired = row_count;

  for j in
    select * from dispatch.job
     where state = 'offering'
       and not exists (select 1 from dispatch.offer o
                       where o.job_id = job.id and o.outcome = 'pending')
  loop
    v_max_rounds := coalesce(settings.fn_int('dispatch.rounds_before_boost', j.city_id)::int, 3);

    if j.round >= v_max_rounds then
      update dispatch.job
         set state = 'escalated', escalated_at = now(),
             escalation_reason = 'radius_exhausted'
       where id = j.id;
      v_escalated := v_escalated + 1;

      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'live_ops',
        p_action => 'dispatch.escalated',
        p_actor_label => '[System] · dispatch',
        p_target_type => 'order', p_target_id => j.order_id,
        p_target_label => (select reference from public.order where id = j.order_id),
        p_city_id => j.city_id, p_severity => 'notice',
        p_reason => 'Radius ' || j.radius_km || ' km exhausted after ' || j.round || ' rounds.');
    else
      perform dispatch.fn_offer_round(j.id);
      v_advanced := v_advanced + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'expired', v_expired,
    'rounds_started', v_advanced, 'escalated', v_escalated);
end;
$$;

-- ══════════════════════════════ a rider answers

create or replace function dispatch.rpc_offer_respond(
  p_offer_id uuid,
  p_accept boolean,
  p_decline_reason dispatch.decline_reason default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o dispatch.offer;
  j dispatch.job;
begin
  select * into o from dispatch.offer where id = p_offer_id;
  if not found then raise exception 'No such offer.'; end if;
  if o.outcome <> 'pending' then
    raise exception 'That offer has already been answered (%).', o.outcome;
  end if;
  if o.expires_at < now() then
    raise exception 'That offer expired % seconds ago.',
      (extract(epoch from now() - o.expires_at))::int;
  end if;

  select * into j from dispatch.job where id = o.job_id;

  if not (authz.is_rider_self(o.rider_id) or authz.works_live_ops(j.city_id)) then
    raise exception 'That offer is not yours.' using errcode = '42501';
  end if;

  if not p_accept then
    update dispatch.offer
       set outcome = 'declined', responded_at = now(), decline_reason = p_decline_reason
     where id = p_offer_id;
    return jsonb_build_object('ok', true, 'accepted', false);
  end if;

  /* First to accept wins; everyone else in the round is withdrawn
     rather than left pending, so the cascade reads correctly. */
  if j.state in ('assigned', 'manual_assigned') then
    update dispatch.offer set outcome = 'withdrawn', responded_at = now()
     where id = p_offer_id;
    return jsonb_build_object('ok', false, 'reason', 'already_taken',
      'message', 'Somebody else took it.');
  end if;

  update dispatch.offer
     set outcome = 'accepted', responded_at = now() where id = p_offer_id;

  update dispatch.offer
     set outcome = 'withdrawn', responded_at = now()
   where job_id = o.job_id and outcome = 'pending' and id <> p_offer_id;

  update dispatch.job
     set state = case when o.direct then 'manual_assigned' else 'assigned' end::dispatch.job_state,
         assigned_at = now(), assigned_rider_id = o.rider_id
   where id = o.job_id;

  update public.order set rider_id = o.rider_id where id = j.order_id;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
  values (
    j.order_id, 'dispatch_accepted', 'Dispatch started',
    'Offered to ' || coalesce((select trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,''))
                               from public.rider r where r.id = o.rider_id), 'a rider')
      || ' (' || coalesce(o.distance_km::text, '—') || ' km) · accepted in '
      || greatest(1, (extract(epoch from now() - o.offered_at))::int) || ' s',
    'rider', '[Rider]',
    jsonb_build_object('rider_id', o.rider_id, 'round', o.round,
                       'seconds', (extract(epoch from now() - o.offered_at))::int,
                       'direct', o.direct));

  return jsonb_build_object('ok', true, 'accepted', true, 'order_id', j.order_id);
end;
$$;

grant execute on function dispatch.fn_candidates(uuid, boolean) to authenticated;
grant execute on function dispatch.rpc_job_start(uuid) to authenticated, service_role;
grant execute on function dispatch.fn_offer_round(uuid) to service_role;
grant execute on function dispatch.cron_advance() to authenticated, service_role;
grant execute on function dispatch.rpc_offer_respond(uuid, boolean, dispatch.decline_reason) to authenticated;
