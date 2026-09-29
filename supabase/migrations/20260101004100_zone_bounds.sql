-- The coverage map, without a map provider.
--
-- The artboards show a styled street map with a draggable pin, which needs a
-- Google Maps Platform key this project does not have yet. Rather than ship a
-- grey box, the flow draws the thing the merchant actually needs to see: our
-- zones, and where their pin falls relative to them. It is a coverage
-- diagram, not a street map, and it is drawn from the real polygons — so when
-- it says a pin is outside every zone, that is the same answer the database
-- gives.
--
-- A view rather than raw polygons because PostgREST would hand the browser
-- EWKB, and because the rectangle is all the diagram needs.

create or replace view public.zone_bounds
with (security_invoker = true)
as
select
  z.id,
  z.city_id,
  z.name,
  z.tier,
  z.eta_min,
  z.eta_max,
  z.cod_allowed,
  extensions.st_xmin(z.polygon::extensions.geometry) as west,
  extensions.st_ymin(z.polygon::extensions.geometry) as south,
  extensions.st_xmax(z.polygon::extensions.geometry) as east,
  extensions.st_ymax(z.polygon::extensions.geometry) as north
from public.zone z
where z.active;

comment on view public.zone_bounds is
  'Each active zone as a bounding box, for drawing the coverage diagram in the onboarding flow. security_invoker, so the zone policy still decides who sees what.';

grant select on public.zone_bounds to anon, authenticated;
