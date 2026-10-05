-- Presence lives on the rider, not beside them.
--
-- `dispatch.rider_presence_live` was a second place to learn where
-- a rider is. `public.rider` already carries presence, last
-- location, cash on hand, cooldown, whether offers are paused and
-- what they are cleared to carry — and the rider console has been
-- writing all of it since that module was built.
--
-- Two tables would have meant the live map and the rider's own
-- record could disagree about whether someone is working, with no
-- way for a dispatcher to tell which was lying. So the second one
-- goes, and the cascade reads the first.
--
-- The exclusion reasons get much better as a side effect. The old
-- version knew about distance, vehicle, cash and stacking. The
-- rider record also knows that offers are paused with a reason,
-- that someone is on a cooldown until a specific time, that they
-- are not cleared for alcohol, and the furthest they said they
-- ride. All four were being ignored — which means the cascade was
-- offering jobs to riders who should never have seen them.

/* `drop policy if exists` still needs the table to exist. */
do $drop$
begin
  if to_regclass('dispatch.rider_presence_live') is not null then
    drop policy if exists presence_read on dispatch.rider_presence_live;
  end if;
end
$drop$;

drop table if exists dispatch.rider_presence_live cascade;

/*
 * One shape for "a rider, right now", so the map, the nearest-free
 * list and the candidate list cannot describe the same person
 * differently.
 *
 * Definer, with the live-ops grant checked inside: rider positions
 * are the most sensitive thing on this screen, and a function
 * cannot carry a row policy of its own.
 */
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
    r.cash_on_hand,
    coalesce(r.cash_cap, settings.fn_int('dispatch.rider_cash_cap', r.city_id)),
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
    and authz.works_live_ops(p_city_id)
$fn$;

comment on function dispatch.fn_riders_live is
  'A rider, right now, read from the rider record rather than a copy of it — so the live map and the rider console cannot disagree about whether someone is working.';

-- ════════════════════════════════ who could take this job

/*
 * The eligible list, with a reason for everybody excluded.
 *
 * The exclusions are the valuable half. "outside 3 km", "cash on
 * hand at the cap", "offers paused · bike in for repair", "on
 * cooldown until 20:40" is what a dispatcher reads to choose
 * between widening, boosting and asking somebody by hand. A list
 * that merely omitted them would leave the screen unable to
 * explain itself.
 *
 * Order matters: the first reason that applies is the one shown,
 * so they run hardest-first. A rider whose offers are paused is not
 * described as "out of radius".
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
  near as (
    select
      l.*,
      /* Straight-line distance. The Routes matrix would be better
         and costs money per call; this ranks the shortlist, and the
         console asks Routes only for the few it displays. */
      round((extensions.st_distance(l.point, j.pickup_point) / 1000.0)::numeric, 2) as km
    from j, dispatch.fn_riders_live(j.city_id) l
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
  left join ord on true
  cross join lateral (
    select (
      case
        when n.offers_paused then 'offers_paused'
        when n.cooldown_until is not null and n.cooldown_until > now() then 'on_cooldown'

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

comment on function dispatch.fn_candidates is
  'Who could take this job, and for everybody who could not, why. The exclusions are the half a dispatcher reads to choose between widening, boosting and asking somebody directly.';

grant execute on function dispatch.fn_riders_live(uuid) to authenticated;
grant execute on function dispatch.fn_candidates(uuid, boolean) to authenticated;
