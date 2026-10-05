-- Live, without anybody pressing anything.
--
-- The live screens were built to be correct, not instant: they
-- render on the server and refresh when a dispatcher acts. That is
-- fine for the Orders table and wrong for the cascade, where the
-- thing a person is watching is a twenty-second countdown and a
-- row that changes under them.
--
-- Polling would be the easy answer and the wrong one. A console
-- open on six desks, re-fetching every two seconds, is six
-- requests a second against the database for a city that gets an
-- order a minute — and it still shows a stale screen for up to two
-- seconds at the moment it matters most.
--
-- So: Postgres tells the browser. These tables go into the
-- Realtime publication, the console subscribes to the few rows it
-- is showing, and a change arrives in the time it takes to cross
-- the network.
--
-- Row security still applies. Realtime checks the same policies
-- for each subscriber that a query would, so a dispatcher in
-- Mombasa is not sent Nairobi's rider movements — the thing that
-- would make this a leak rather than a feature.

/*
 * Replica identity full, so an update carries the old row as well
 * as the new one. Without it a subscriber watching "offers on this
 * job" cannot tell that a row which just stopped matching used to
 * match, and a cascade row would freeze on screen at the moment it
 * was answered.
 */
alter table public.order replica identity full;
alter table public.order_event replica identity full;
alter table dispatch.job replica identity full;
alter table dispatch.offer replica identity full;
alter table dispatch.zone_health replica identity full;
alter table public.rider replica identity full;

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'public.order',
    'public.order_event',
    'dispatch.job',
    'dispatch.offer',
    'dispatch.zone_health'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname || '.' || tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %s', t);
    end if;
  end loop;
end
$$;

/*
 * `public.rider` is deliberately *not* published.
 *
 * It carries every rider's live position, and a publication is the
 * one place where "we only ever select the columns we need" stops
 * being true — the whole row goes onto the wire and policies decide
 * who may receive it. Rider locations are the most sensitive thing
 * in this database, and the live screen refetches them on a timer
 * instead. A minute-old dot is an acceptable price; a broadcast of
 * where every rider is, is not.
 */

-- ════════════════════════════ geometry the map can draw

/*
 * Zones as GeoJSON.
 *
 * The map needs outlines, and PostGIS geography does not survive
 * the trip through PostgREST as anything a browser can draw. This
 * is the one conversion, done in the database where the geometry
 * actually is.
 *
 * Simplified to about ten metres: a zone boundary drawn to the
 * centimetre is several hundred kilobytes of coordinates that
 * render as exactly the same line on a phone.
 */
create or replace view public.console_zone_shape_v
with (security_invoker = true) as
select
  z.id as zone_id,
  z.name,
  z.city_id,
  z.tier::text as tier,
  z.active,
  z.cod_allowed,
  z.eta_min,
  z.eta_max,
  extensions.st_asgeojson(
    extensions.st_simplifypreservetopology(z.polygon::extensions.geometry, 0.0001)
  )::jsonb as shape,
  extensions.st_y(extensions.st_centroid(z.polygon::extensions.geometry)) as centre_lat,
  extensions.st_x(extensions.st_centroid(z.polygon::extensions.geometry)) as centre_lng,
  coalesce(h.state, 'ok') as state,
  coalesce(h.paused, false) as paused
from public.zone z
left join dispatch.zone_health h on h.zone_id = z.id
where z.polygon is not null;

comment on view public.console_zone_shape_v is
  'Zone outlines as GeoJSON, simplified to roughly ten metres — a boundary drawn to the centimetre is hundreds of kilobytes that render as the same line.';

/* Where a city's map should open. */
create or replace view public.city_bounds_v
with (security_invoker = true) as
select
  c.id as city_id,
  c.name,
  extensions.st_ymin(e.box) as south,
  extensions.st_ymax(e.box) as north,
  extensions.st_xmin(e.box) as west,
  extensions.st_xmax(e.box) as east
from public.city c
cross join lateral (
  select extensions.st_extent(z.polygon::extensions.geometry) as box
    from public.zone z where z.city_id = c.id and z.polygon is not null
) e
where e.box is not null;

grant select on public.console_zone_shape_v, public.city_bounds_v to authenticated;
