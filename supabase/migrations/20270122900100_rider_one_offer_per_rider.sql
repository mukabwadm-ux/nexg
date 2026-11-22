-- One rider, one offer: a rider standing where two delivery zones overlap was
-- listed once per zone by dispatch.fn_riders_now, so the round sent them two
-- (or more) offers for the same order, and declining one left the other open.
--
-- Found by the Rider app's end-to-end run on a local database (19 Nov 2026):
-- Nairobi's seed has overlapping zones (CBD inside wider ones), and a rider in
-- the CBD got one offer per zone for every order.
--
-- Now each rider gets one zone: the smallest active zone they are in (the most
-- specific), then any zone, by id when equal. Live operations' rider list
-- (dispatch.fn_riders_live reads this function) shows each rider once too.
-- Nothing else changes: same columns, same callers, same grants.
--
-- Rollback: re-run section 1 of 20270115000200_rider_offers_and_location.sql.

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
  left join lateral (
    select z.id, z.name
      from public.zone z
     where r.last_location is not null
       and z.city_id = r.city_id
       and extensions.st_intersects(z.polygon, r.last_location)
     order by z.active desc, extensions.st_area(z.polygon) asc, z.id
     limit 1
  ) z on true
  where r.city_id = p_city_id
    and r.status = 'active'
    and r.offboarded_at is null
$fn$;

comment on function dispatch.fn_riders_now(uuid) is
  'Every active rider in a city, right now, once each (in their smallest active zone). No caller check: internal to the dispatch round. People use fn_riders_live.';

revoke execute on function dispatch.fn_riders_now(uuid) from public, anon, authenticated;
grant execute on function dispatch.fn_riders_now(uuid) to service_role;
