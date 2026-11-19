-- Riders can be found, see their offers, and the shop's "ready" reaches them.
--
-- 1. The rider search found nobody unless staff started it. Marking an order
--    ready (rpc_merchant_order_step, 20270109000300) starts dispatch in the
--    shop's session, and the minute cron runs with no session at all. Both
--    reach dispatch.fn_candidates -> dispatch.fn_riders_live, which returns
--    riders only to live operations (authz.works_live_ops). So every round
--    they ran saw no riders and the job escalated as "no_eligible_riders".
--    Now the round reads riders through internal copies with no caller check
--    (dispatch.fn_riders_now, dispatch.fn_candidates_now), which nobody but
--    the database owner and service role may call. The live screen keeps
--    fn_riders_live and fn_candidates, unchanged in what they return and
--    still for live operations only. fn_offer_round is no longer callable
--    by signed-in accounts (it never needed to be; its callers run as owner).
--
-- 2. Nothing wrote a rider's position (rider.last_location), so dispatch had
--    no distance to rank by. rpc_rider_location_ping(lat, lng, observed_at)
--    lets the Rider app send it while the rider is online or on a trip.
--    A rider whose position is older than dispatch.location_fresh_s
--    (default 120 s, 20270110000100) is skipped as 'location_stale'.
--
-- 3. A rider could not read their own offers (dispatch.offer is readable only
--    through dispatch.job, which is live operations' and merchants'; the
--    dispatch schema is not in the API). rpc_my_rider_offers() returns the
--    signed-in rider's pending offers. They answer with the existing
--    rpc_dispatch_offer_respond.
--
-- Rollback: re-run dispatch.fn_riders_live from 20260101014700,
-- dispatch.fn_candidates from 20260101013500 and dispatch.fn_offer_round from
-- 20261223000600; grant execute on dispatch.fn_offer_round(uuid) to
-- authenticated; then drop function public.rpc_my_rider_offers(),
-- public.rpc_rider_location_ping(double precision, double precision, timestamptz),
-- dispatch.fn_candidates_now(uuid, boolean), dispatch.fn_riders_now(uuid).

-- ═══════════════════════════════════════════════ 1. riders, right now, for the round

create or replace function dispatch.fn_riders_now(p_city_id uuid)
returns table (
  rider_id uuid,
  name text,
  phone text,
  vehicle text,
  plate_no text,
  presence text,
  presence_since timestamptz,
  point extensions.geography,
  last_seen_at timestamptz,
  zone_id uuid,
  zone_name text,
  current_order_reference text,
  cash_on_hand_cents bigint,
  cash_cap_cents bigint,
  offers_paused boolean,
  offers_paused_reason text,
  cooldown_until timestamptz,
  cooldown_reason text,
  alcohol_eligible boolean,
  large_items_eligible boolean,
  max_km integer,
  health_band text,
  top_decile boolean
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    r.id,
    nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
    r.phone,
    r.vehicle::text,
    r.plate_no,
    r.presence::text,
    r.presence_changed_at,
    r.last_location,
    coalesce(r.last_location_at, r.last_seen_at),
    z.id,
    z.name,
    r.current_order_reference,
    /* Shillings on the rider record, cents everywhere an order is
       involved. Converted here, once. */
    r.cash_on_hand * 100,
    coalesce(r.cash_cap, settings.fn_int('dispatch.rider_cash_cap', r.city_id)) * 100,
    not coalesce(r.can_receive_offers, true),
    r.offers_paused_reason,
    r.cooldown_until,
    r.cooldown_reason,
    coalesce(r.alcohol_eligible, false),
    coalesce(r.large_items_eligible, false),
    r.bike_max_km,
    r.health_band::text,
    coalesce(r.top_decile, false)
  from public.rider r
  left join public.zone z
    on z.city_id = r.city_id
   and r.last_location is not null
   and extensions.st_intersects(z.polygon, r.last_location)
  where r.city_id = p_city_id
    and r.status = 'active'
    and r.offboarded_at is null
$fn$;

comment on function dispatch.fn_riders_now(uuid) is
  'Every active rider in a city, right now. No caller check: internal to the dispatch round. People use fn_riders_live.';

revoke execute on function dispatch.fn_riders_now(uuid) from public, anon, authenticated;
grant execute on function dispatch.fn_riders_now(uuid) to service_role;

create or replace function dispatch.fn_riders_live(p_city_id uuid)
returns table (
  rider_id uuid,
  name text,
  phone text,
  vehicle text,
  plate_no text,
  presence text,
  presence_since timestamptz,
  point extensions.geography,
  last_seen_at timestamptz,
  zone_id uuid,
  zone_name text,
  current_order_reference text,
  cash_on_hand_cents bigint,
  cash_cap_cents bigint,
  offers_paused boolean,
  offers_paused_reason text,
  cooldown_until timestamptz,
  cooldown_reason text,
  alcohol_eligible boolean,
  large_items_eligible boolean,
  max_km integer,
  health_band text,
  top_decile boolean
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select * from dispatch.fn_riders_now(p_city_id) where authz.works_live_ops(p_city_id)
$fn$;

comment on function dispatch.fn_riders_live(uuid) is
  'A rider, right now, for live operations in that city. Reads dispatch.fn_riders_now.';

-- ═══════════════════════════════════════════════ 2. who could take this job

create or replace function dispatch.fn_candidates_now(
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
as $fn$
  with j as (
    select * from dispatch.job where id = p_job_id
  ),
  ord as (
    select o.payment_method, o.total_cents
      from public.order o join j on o.id = j.order_id
  ),
  stacking as (
    select coalesce(settings.fn_bool('dispatch.stacking', (select city_id from j)), false) as allowed
  ),
  fresh as (
    select coalesce(settings.fn_int('dispatch.location_fresh_s', (select city_id from j)), 120) as s
  ),
  near as (
    select
      l.*,
      /* Straight-line distance. The Routes matrix would be better
         and costs money per call; this ranks the shortlist, and the
         console asks Routes only for the few it displays. */
      round((extensions.st_distance(l.point, j.pickup_point) / 1000.0)::numeric, 2) as km
    from j, dispatch.fn_riders_now(j.city_id) l
    where l.presence in ('online', 'on_trip')
      and l.point is not null
      and j.pickup_point is not null
  )
  select
    n.rider_id,
    n.name,
    n.vehicle,
    n.plate_no,
    n.km,
    /* Twenty km/h through Nairobi traffic, plus two minutes to get
       moving. Rough, and honestly rough — the console replaces it
       with Routes for the handful it displays. */
    greatest(1, ceil(n.km / 20.0 * 60.0 + 2))::integer,
    n.cash_on_hand_cents,
    n.presence,
    s.skip_reason is null,
    s.skip_reason,
    coalesce(
      case s.skip_reason
        when 'offers_paused' then 'offers paused'
          || coalesce(' · ' || n.offers_paused_reason, '')
        when 'on_cooldown' then 'on cooldown until '
          || to_char(n.cooldown_until at time zone 'Africa/Nairobi', 'HH24:MI')
          || coalesce(' · ' || n.cooldown_reason, '')
        when 'location_stale' then 'position too old'
          || coalesce(' · last sent ' || to_char(n.last_seen_at at time zone 'Africa/Nairobi', 'HH24:MI'), '')
        when 'wrong_vehicle' then 'needs '
          || array_to_string(j.vehicle_requirements, ' + ') || ' · rides ' || n.vehicle
        when 'not_alcohol_eligible' then 'not cleared for alcohol'
        when 'not_large_item_eligible' then 'not cleared for large items'
        when 'cash_over_cap' then 'this order puts them over their cash cap'
        when 'stacking_not_allowed' then 'already on ' || coalesce(n.current_order_reference, 'a trip')
        when 'beyond_their_max_km' then round(n.km + coalesce(j.distance_km, 0), 1)
          || ' km in all · further than the ' || n.max_km || ' km they ride'
        when 'out_of_radius' then 'outside ' || j.radius_km || ' km'
        when 'already_offered' then 'already asked this round'
        else s.skip_reason::text
      end,
      /* An eligible rider gets the line that helps rank them. */
      nullif(concat_ws(' · ',
        case when n.top_decile then 'top decile' end,
        case when n.health_band = 'amber' then 'amber health'
             when n.health_band = 'red' then 'red health' end,
        case when n.presence = 'on_trip'
             then 'finishing ' || coalesce(n.current_order_reference, 'a trip') end
      ), '')) as note
  from near n
  cross join j
  cross join stacking st
  cross join fresh fr
  left join ord on true
  cross join lateral (
    select (
      case
        when n.offers_paused then 'offers_paused'
        when n.cooldown_until is not null and n.cooldown_until > now() then 'on_cooldown'
        /* Where they were is not where they are. Distance from an old
           position would rank them wrongly, so they wait for a fresh one. */
        when n.last_seen_at is null
             or n.last_seen_at < now() - make_interval(secs => fr.s::int) then 'location_stale'

        /* Vehicle and clearance are physical facts about what this
           rider can carry. A dispatcher cannot override them, so
           they rank above anything that is a judgement call. */
        when 'alcohol' = any (j.vehicle_requirements) and not n.alcohol_eligible
          then 'not_alcohol_eligible'
        when 'large_items' = any (j.vehicle_requirements) and not n.large_items_eligible
          then 'not_large_item_eligible'
        when exists (
          select 1 from unnest(j.vehicle_requirements) req
           where req in ('motorbike', 'bicycle', 'car', 'tuktuk') and req <> n.vehicle)
          then 'wrong_vehicle'

        /* Cash on delivery against a rider already near their cap
           is how money goes missing. The rider's own cap wins over
           the city's, because it is the one Finance set for them. */
        when ord.payment_method = 'cash_on_delivery'
             and n.cash_cap_cents is not null
             and coalesce(n.cash_on_hand_cents, 0) + coalesce(ord.total_cents, 0) > n.cash_cap_cents
          then 'cash_over_cap'

        when n.presence = 'on_trip' and not st.allowed then 'stacking_not_allowed'
        /* The whole ride, not just the leg to the merchant. A
           rider who told us they do 2 km is not being sent on a
           1 km pickup and a 4 km drop. */
        when n.max_km is not null
             and n.km + coalesce(j.distance_km, 0) > n.max_km then 'beyond_their_max_km'
        when n.km > coalesce(j.radius_km, 3) then 'out_of_radius'
        when exists (select 1 from dispatch.offer ofr
                     where ofr.job_id = j.id and ofr.rider_id = n.rider_id
                       and ofr.round = j.round)
          then 'already_offered'
      end
    )::dispatch.skip_reason as skip_reason
  ) s
  where p_include_ineligible or s.skip_reason is null
  order by s.skip_reason is not null, n.km
$fn$;

comment on function dispatch.fn_candidates_now(uuid, boolean) is
  'The eligible riders for a job, with a reason for everybody excluded. No caller check: internal to the dispatch round. People use fn_candidates.';

revoke execute on function dispatch.fn_candidates_now(uuid, boolean) from public, anon, authenticated;
grant execute on function dispatch.fn_candidates_now(uuid, boolean) to service_role;

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
as $fn$
  select c.* from dispatch.fn_candidates_now(p_job_id, p_include_ineligible) c
   where authz.works_live_ops((select j.city_id from dispatch.job j where j.id = p_job_id))
$fn$;

comment on function dispatch.fn_candidates(uuid, boolean) is
  'The candidate list for live operations in the job''s city. Reads dispatch.fn_candidates_now.';

-- ═══════════════════════════════════════════════ 3. one round, from the internal list

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
  /* The job first, as rpc_offer_respond takes it: a round and an answer to
     the same job go one after the other. */
  select * into j from dispatch.job where id = p_job_id for update;
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

  for c in select * from dispatch.fn_candidates_now(p_job_id, true) loop
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

revoke execute on function dispatch.fn_offer_round(uuid) from public, anon, authenticated;
grant execute on function dispatch.fn_offer_round(uuid) to service_role;

-- ═══════════════════════════════════════════════ 4. the rider reports where they are

/*
 * The Rider app sends its position while the rider is working (online or
 * on a trip), so dispatch measures distance from where they are now.
 *
 * Offline, nothing is stored: a rider who has stopped working is not
 * tracked. Old, future or out-of-order points are refused or ignored, so a
 * late network retry cannot move a rider backwards. One point every five
 * seconds is plenty; closer ones are ignored.
 *
 * The existing fraud trigger (20270105000100) still checks each new point
 * for an impossible jump.
 */
create or replace function public.rpc_rider_location_ping(
  p_latitude double precision,
  p_longitude double precision,
  p_observed_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  r public.rider;
  v_now timestamptz := clock_timestamp();
  v_at timestamptz := coalesce(p_observed_at, clock_timestamp());
  v_fresh integer;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
     or (p_latitude = 0 and p_longitude = 0) then
    raise exception 'That is not a position.' using errcode = '22023', hint = 'bad_position';
  end if;
  if v_at > v_now + interval '10 seconds' then
    raise exception 'That position is from the future.' using errcode = '22023', hint = 'bad_time';
  end if;

  select * into r from public.rider where id = v_rider for update;

  if r.presence not in ('online', 'on_trip') then
    return jsonb_build_object('contractVersion', '1', 'ok', false, 'reason', 'offline',
      'message', 'You are offline, so your position is not sent.');
  end if;

  if v_at < v_now - interval '2 minutes' then
    return jsonb_build_object('contractVersion', '1', 'ok', false, 'reason', 'too_old',
      'message', 'That position is too old to use.');
  end if;

  v_fresh := coalesce(settings.fn_int('dispatch.location_fresh_s', r.city_id), 120)::int;

  if r.last_location_at is not null and v_at < r.last_location_at + interval '5 seconds' then
    return jsonb_build_object('contractVersion', '1', 'ok', true, 'ignored', true,
      'at', r.last_location_at, 'freshForSeconds', v_fresh);
  end if;

  update public.rider
     set last_location = extensions.st_setsrid(
           extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
         last_location_at = v_at,
         last_seen_at = v_now
   where id = v_rider;

  return jsonb_build_object('contractVersion', '1', 'ok', true,
    'at', v_at, 'freshForSeconds', v_fresh);
end;
$$;

comment on function public.rpc_rider_location_ping(double precision, double precision, timestamptz) is
  'The Rider app reports where the rider is, only while online or on a trip, so dispatch offers jobs from where they are now.';

revoke execute on function public.rpc_rider_location_ping(double precision, double precision, timestamptz)
  from public, anon;
grant execute on function public.rpc_rider_location_ping(double precision, double precision, timestamptz)
  to authenticated;

-- Not audited per point: a ping arrives every few seconds, and an audit row
-- for each would keep the rider's movements as a history. The rider record
-- keeps only the latest point; going online and offline is audited already.
insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_rider_location_ping',
   'Latest position only, every few seconds while working. A per-point audit row would keep a movement history.',
   '20270110000200_rider_offers_and_location')
on conflict do nothing;

-- ═══════════════════════════════════════════════ 5. the rider sees their offers

/*
 * The offers waiting for this rider's answer, newest first, with what they
 * need to decide: where to collect, roughly where it goes, how far, what to
 * collect in cash, and how long they have. They answer with
 * rpc_dispatch_offer_respond(offerId, accept, declineReason).
 *
 * The drop-off is its label and the trip distance only. The exact pin comes
 * with the job once they accept (as the shop's pin is public, it is given).
 *
 * No pay figure: nothing in the backend works one out per job yet
 * (rider_earning is written after the fact). The app shows it as unknown.
 */
create or replace function public.rpc_my_rider_offers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rider uuid := dispatch.maps_rider_actor();
  v_offers jsonb;
begin
  select coalesce(jsonb_agg(x.offer order by x.offered_at desc), '[]'::jsonb)
    into v_offers
    from (
      select ofr.offered_at, jsonb_build_object(
        'offerId', ofr.id,
        'jobId', j.id,
        'orderId', o.id,
        'orderReference', o.reference,
        'round', ofr.round,
        'offeredAt', ofr.offered_at,
        'expiresAt', ofr.expires_at,
        'direct', ofr.direct,
        'toPickupKm', ofr.distance_km,
        'toPickupMinutes', ofr.eta_min,
        'tripKm', j.distance_km,
        'needs', to_jsonb(j.vehicle_requirements),
        'category', m.category::text,
        'pickup', jsonb_build_object(
          'name', j.pickup_label,
          'address', b.address_text,
          'latitude', case when j.pickup_point is not null
                           then extensions.st_y(j.pickup_point::extensions.geometry) end,
          'longitude', case when j.pickup_point is not null
                            then extensions.st_x(j.pickup_point::extensions.geometry) end),
        'dropoff', jsonb_build_object('label', j.dropoff_label),
        'itemCount', (select coalesce(sum(i.quantity), 0)::int from public.order_item i
                       where i.order_id = o.id and i.removed_at is null),
        'payment', jsonb_build_object(
          'method', o.payment_method::text,
          'status', o.payment_status::text,
          'collectCents', case when o.payment_method = 'cash_on_delivery' then o.total_cents end,
          'currency', o.currency)
      ) as offer
      from dispatch.offer ofr
      join dispatch.job j on j.id = ofr.job_id
      join public.order o on o.id = j.order_id
      left join public.merchant m on m.id = o.merchant_id
      left join public.merchant_branch b on b.id = o.branch_id
     where ofr.rider_id = v_rider
       and ofr.outcome = 'pending'
       and ofr.expires_at > now()
       and j.state = 'offering'
     order by ofr.offered_at desc
     limit 20
    ) x;

  return jsonb_build_object('contractVersion', '1', 'riderId', v_rider, 'offers', v_offers);
end;
$$;

comment on function public.rpc_my_rider_offers() is
  'The dispatch offers waiting for the signed-in rider''s answer. Answer with rpc_dispatch_offer_respond.';

revoke execute on function public.rpc_my_rider_offers() from public, anon;
grant execute on function public.rpc_my_rider_offers() to authenticated;
