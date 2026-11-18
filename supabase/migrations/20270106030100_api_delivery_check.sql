-- The API's "can you deliver here?" check.
--
-- One call with a pickup and a drop-off answers what a partner asks before
-- it offers NexG delivery: can NexG take this trip, how long does it usually
-- take, and what does it cost? POST /v1/delivery/check calls this.
--
-- It asks what checkout asks, with the functions checkout uses:
--
-- - the drop-off must be somewhere NexG delivers (fn_zone_serviceable: a
--   live, unpaused zone, or inside the radius of a live city);
-- - the pickup must be somewhere NexG collects from: the same, except that
--   a pause stops deliveries into a zone and nothing else, so a shop in a
--   paused zone keeps selling to the rest of the city, as it does at
--   checkout;
-- - the trip must be within the pickup city's maximum distance
--   (fees.delivery.max_km), in a straight line.
--
-- The fee is the approved rate card, fn_delivery_price_per_km: a base for
-- the first kilometre and a rate for each further commenced kilometre, the
-- price Explore shows. Web checkout still charges by band (fn_delivery_band
-- and fees.delivery.band_N), which agrees with the rate card only at 3, 6,
-- 8 and 15 km; moving checkout to the rate card is a separate change.
--
-- The ETA is the drop-off zone's. A drop-off served by the city's radius
-- rather than a drawn zone has none, rather than one borrowed from a zone
-- it is not in.
--
-- Everything it returns is already public: coverage, live zone names and
-- pause notices (rpc_coverage_lookup), and the rate card
-- (rpc_delivery_rate). So it needs no key, as GET /v1/zones needs none.

create or replace function public.rpc_delivery_check(
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pickup extensions.geography;
  v_dropoff extensions.geography;
  v_pick jsonb;
  v_drop jsonb;
  v_pick_zone public.zone;
  v_drop_zone public.zone;
  v_pick_served boolean;
  v_drop_served boolean;
  v_drop_paused boolean;
  v_city public.city;
  v_km numeric;
  v_price jsonb;
  v_reason text;
  v_message text;
begin
  /* NaN and infinity fall outside both ranges, so they are refused too. */
  if p_pickup_lat is null or p_pickup_lng is null
     or p_dropoff_lat is null or p_dropoff_lng is null
     or p_pickup_lat not between -90 and 90 or p_dropoff_lat not between -90 and 90
     or p_pickup_lng not between -180 and 180 or p_dropoff_lng not between -180 and 180 then
    raise exception 'The pickup and the drop-off each need a latitude from -90 to 90 and a longitude from -180 to 180.'
      using errcode = '22023';
  end if;

  v_pickup := extensions.st_setsrid(
    extensions.st_makepoint(p_pickup_lng, p_pickup_lat), 4326)::extensions.geography;
  v_dropoff := extensions.st_setsrid(
    extensions.st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::extensions.geography;
  v_km := round((extensions.st_distance(v_pickup, v_dropoff) / 1000)::numeric, 1);

  /* The live zone at each end, if any. An inactive zone is staff saying
     "not here", and its name is not published, so it is not named. */
  v_pick := public.fn_zone_serviceable(v_pickup);
  select * into v_pick_zone from public.zone z
   where z.id = nullif(v_pick ->> 'zone_id', '')::uuid and z.active;

  v_drop := public.fn_zone_serviceable(v_dropoff);
  select * into v_drop_zone from public.zone z
   where z.id = nullif(v_drop ->> 'zone_id', '')::uuid and z.active;

  /* fn_zone_serviceable refuses a live zone only while it is paused. A
     paused zone still collects, and a drop-off in one is served but
     paused: we deliver there, just not this minute. */
  v_pick_served := (v_pick ->> 'ok')::boolean or v_pick_zone.id is not null;
  v_drop_served := (v_drop ->> 'ok')::boolean or v_drop_zone.id is not null;
  v_drop_paused := not (v_drop ->> 'ok')::boolean and v_drop_zone.id is not null;

  /* The pickup's city prices the trip, as the shop's city does at checkout. */
  if v_pick_served then
    select * into v_city from public.city c where c.id = (v_pick ->> 'city_id')::uuid;
    v_price := public.fn_delivery_price_per_km(v_city.id, v_pickup, v_dropoff);
  end if;

  /* Lasting reasons first: there is no point waiting for a pause to lift
     on a trip that is too long anyway. */
  if not v_pick_served then
    v_reason := 'pickup_not_served';
    v_message := 'The pickup is outside the areas NexG delivers in.';
  elsif not v_drop_served then
    v_reason := 'dropoff_not_served';
    v_message := 'The drop-off is outside the areas NexG delivers in.';
  elsif not (v_price ->> 'ok')::boolean then
    v_reason := 'too_far';
    v_message := 'The pickup and the drop-off are ' || v_km || ' km apart in a straight line. '
      || 'NexG delivers up to ' || (v_price ->> 'max_km') || ' km in ' || v_city.name || '.';
  elsif v_drop_paused then
    v_reason := 'dropoff_paused';
    v_message := 'Deliveries into ' || v_drop_zone.name || ' are paused right now'
      || coalesce(' · ' || (select h.paused_reason from dispatch.zone_health h
                             where h.zone_id = v_drop_zone.id), '') || '.';
  end if;

  return jsonb_build_object(
    'deliverable', v_reason is null,
    'reason', v_reason,
    'message', v_message,
    'city_slug', v_city.slug,
    'city_name', v_city.name,
    'pickup', jsonb_build_object(
      'served', v_pick_served,
      'zone_id', v_pick_zone.id,
      'zone_name', v_pick_zone.name),
    'dropoff', jsonb_build_object(
      'served', v_drop_served,
      'zone_id', v_drop_zone.id,
      'zone_name', v_drop_zone.name,
      'paused', v_drop_paused),
    'distance_km', v_km,
    'max_distance_km', (v_price ->> 'max_km')::integer,
    'eta_min', case when v_reason is null then v_drop_zone.eta_min end,
    'eta_max', case when v_reason is null then v_drop_zone.eta_max end,
    'delivery_fee_cents',
      case when v_reason is null then (v_price ->> 'delivery_fee_cents')::bigint end,
    'currency', 'KES');
end;
$$;

comment on function public.rpc_delivery_check(double precision, double precision, double precision, double precision) is
  'Can NexG deliver from this pickup to this drop-off: yes or why not, the city, each end''s live zone, the straight-line distance and the maximum, the drop-off zone''s ETA and the rate-card fee. Public answers only. Behind POST /v1/delivery/check.';

revoke execute on function public.rpc_delivery_check(double precision, double precision, double precision, double precision)
  from public;
grant execute on function public.rpc_delivery_check(double precision, double precision, double precision, double precision)
  to anon, authenticated, service_role;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_delivery_check',
   'The API answers "can you deliver here?" without a key, as it lists zones without one.',
   'Read-only: coverage, live zone names, pause notices, ETAs and the public rate card, all of which visitors already see.')
on conflict (function_name) do nothing;
