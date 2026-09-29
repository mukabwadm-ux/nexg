-- Delivery zones — the thing that decides whether a merchant can be listed.
--
-- Up to now a branch was an address string and a merchant team member worked
-- out on the phone whether we could reach it. The onboarding flow asks that
-- question on screen, in front of the merchant, the moment they drop the pin:
-- inside a zone they continue, outside it they join a waitlist. That is a
-- database answer, not a UI one (ground rule 5), so the geometry lives here.
--
-- The polygons below are approximations drawn around the usual understanding
-- of each Nairobi neighbourhood. They are good enough to tell Westlands from
-- Kitengela, which is what the flow asks of them, and not good enough to
-- settle a dispute about which side of a road a building is on. Replacing
-- them with surveyed boundaries changes no code.

create extension if not exists postgis with schema extensions;

create type public.zone_tier as enum ('core', 'extended', 'trial');

create table public.zone (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.city (id) on delete cascade,
  name text not null,
  tier public.zone_tier not null,
  polygon extensions.geography(Polygon, 4326) not null,
  /* What a guest is told, and therefore what the merchant is shown. */
  eta_min integer not null,
  eta_max integer not null,
  /*
   * Cash on delivery is a rider carrying money through an area at night. It
   * is allowed where we have the density to make that routine and not where
   * we do not.
   */
  cod_allowed boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint zone_eta_is_a_range check (eta_min > 0 and eta_max >= eta_min),
  unique (city_id, name)
);

create index zone_polygon_idx on public.zone using gist (polygon);
create index zone_city_idx on public.zone (city_id, tier) where active;

create trigger zone_set_updated_at
  before update on public.zone
  for each row execute function public.tg_set_updated_at();

comment on table public.zone is
  'Where NexG delivers. A merchant outside every active zone cannot be listed and is offered the waitlist instead.';
comment on column public.zone.polygon is
  'Approximate neighbourhood boundary, accurate enough to place a pin in the right area and not to resolve a boundary dispute.';

-- --------------------------------------------------------------- lookups

/*
 * Which zone is this pin in? Security definer because the applicant asking is
 * anonymous, and because the answer ("yes, we cover you") is the one piece of
 * zone information they are entitled to before they have an account.
 */
create or replace function public.zone_for_point(p_lng double precision, p_lat double precision)
returns table (
  id uuid,
  city_id uuid,
  name text,
  tier public.zone_tier,
  eta_min integer,
  eta_max integer,
  cod_allowed boolean
)
language sql
security definer
stable
set search_path = ''
as $$
  select z.id, z.city_id, z.name, z.tier, z.eta_min, z.eta_max, z.cod_allowed
  from public.zone z
  where z.active
    and extensions.st_covers(
      z.polygon,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
    )
  /* Core before extended before trial, so an overlap resolves to the better
     promise rather than to whichever row was inserted first. */
  order by z.tier, z.eta_max
  limit 1;
$$;

comment on function public.zone_for_point is
  'The zone covering a pin, best tier first, or no row when we do not deliver there.';

/*
 * The neighbour names in "guests in Kilimani, Westlands and Parklands can
 * order from you". Same city, same tier, excluding the zone itself.
 */
create or replace function public.neighbourhoods_for_zone(p_zone_id uuid)
returns text[]
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce(array_agg(o.name order by o.name), '{}')
  from public.zone z
  join public.zone o
    on o.city_id = z.city_id and o.tier = z.tier and o.id <> z.id and o.active
  where z.id = p_zone_id;
$$;

/*
 * How far the nearest zone is, in kilometres, for the "9 km outside our zone"
 * line on the out-of-zone screen. Rounded, because a metre-accurate distance
 * from an approximate polygon would be a false precision.
 */
create or replace function public.distance_to_nearest_zone(
  p_lng double precision,
  p_lat double precision
)
returns table (km integer, zone_name text, city_name text, city_id uuid)
language sql
security definer
stable
set search_path = ''
as $$
  select
    greatest(1, round(
      extensions.st_distance(
        z.polygon,
        extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
      ) / 1000
    )::integer),
    z.name,
    c.name,
    c.id
  from public.zone z
  join public.city c on c.id = z.city_id
  where z.active
  /* Plain distance rather than the <-> index operator: an operator cannot be
     schema-qualified, and this function runs with an empty search_path.
     Six zones per city makes the index moot anyway. */
  order by extensions.st_distance(
    z.polygon,
    extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
  )
  limit 1;
$$;

grant execute on function public.zone_for_point(double precision, double precision)
  to anon, authenticated, service_role;
grant execute on function public.neighbourhoods_for_zone(uuid)
  to anon, authenticated, service_role;
grant execute on function public.distance_to_nearest_zone(double precision, double precision)
  to anon, authenticated, service_role;

-- ------------------------------------------------------------------- RLS

alter table public.zone enable row level security;

/* Readable before sign-in: the pin has to be judged while the applicant is
   still anonymous. Nothing here is sensitive — it is our coverage map. */
create policy zone_read_public on public.zone
  for select to anon, authenticated
  using (active);

create policy zone_write_staff on public.zone
  for all to authenticated
  using (authz.can_manage_merchants(city_id))
  with check (authz.can_manage_merchants(city_id));

-- ------------------------------------------------------------------ seed
--
-- Six Nairobi zones. Rectangles, because a rectangle is honest about being an
-- approximation in a way a hand-drawn many-sided polygon is not.

insert into public.zone (city_id, name, tier, polygon, eta_min, eta_max, cod_allowed)
select
  c.id,
  z.name,
  z.tier::public.zone_tier,
  extensions.st_makeenvelope(z.w, z.s, z.e, z.n, 4326)::extensions.geography,
  z.eta_min,
  z.eta_max,
  z.cod
from public.city c
cross join (values
  ('Kilimani',   'core',     36.765, -1.300, 36.800, -1.270, 20, 30, true),
  ('Westlands',  'core',     36.795, -1.275, 36.830, -1.245, 25, 35, true),
  ('CBD',        'core',     36.805, -1.300, 36.840, -1.272, 20, 30, true),
  ('Karen',      'extended', 36.680, -1.345, 36.765, -1.270, 35, 50, false),
  ('Langata',    'extended', 36.760, -1.360, 36.830, -1.300, 35, 50, false),
  ('Runda',      'trial',    36.760, -1.235, 36.810, -1.195, 40, 60, false)
) as z(name, tier, w, s, e, n, eta_min, eta_max, cod)
where c.slug = 'nairobi'
on conflict (city_id, name) do nothing;
