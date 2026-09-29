-- Where a city is, so a coordinate can be turned into one.
--
-- Zones exist only for Nairobi, so zone_for_point answers for Nairobi and
-- returns nothing everywhere else — which would tell a guest in Mombasa
-- that NexG has never heard of them. A city needs a location of its own.
--
-- These are published geographic coordinates of city centres, not business
-- figures: they are facts about where places are, and they are the same
-- whoever looks them up.

alter table public.city
  add column if not exists centre extensions.geography(Point, 4326);

update public.city set centre =
  extensions.st_setsrid(extensions.st_makepoint(v.lng, v.lat), 4326)::extensions.geography
from (values
  ('nairobi',        36.8172,  -1.2864),
  ('mombasa',        39.6682,  -4.0435),
  ('kisumu',         34.7680,  -0.0917),
  ('nakuru',         36.0800,  -0.3031),
  ('eldoret',        35.2698,   0.5143),
  ('kampala',        32.5825,   0.3476),
  ('entebbe',        32.4637,   0.0512),
  ('dar-es-salaam',  39.2083,  -6.7924),
  ('arusha',         36.6830,  -3.3869),
  ('zanzibar',       39.2026,  -6.1659),
  ('kigali',         30.0619,  -1.9441)
) as v(slug, lng, lat)
where public.city.slug = v.slug;

create index if not exists city_centre_idx on public.city using gist (centre);

comment on column public.city.centre is
  'The city centre, used to answer "which of our cities is this person in" when they are outside every mapped zone.';

/*
 * Which city a coordinate belongs to.
 *
 * A zone is the better answer where one exists — it is a real delivery
 * boundary someone drew — so it is tried first. Otherwise the nearest
 * centre, with the distance returned rather than swallowed, because "your
 * nearest city is Mombasa, 340 km away" and "you are in Mombasa" are
 * different facts and the caller has to be able to tell them apart.
 *
 * Returns the city whatever its status. A guest in Kigali should be told
 * NexG is not open in Kigali yet — not shown Nairobi as though it were
 * theirs.
 */
create or replace function public.fn_city_for_point(
  p_lng double precision,
  p_lat double precision
)
returns table (
  id uuid,
  slug text,
  name text,
  status public.city_status,
  distance_m double precision,
  inside_a_zone boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with here as (
    select extensions.st_setsrid(
             extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  ),
  in_zone as (
    select c.id, c.slug, c.name, c.status, 0::double precision as distance_m, true as inside
    from here, public.zone z
    join public.city c on c.id = z.city_id
    where z.active and extensions.st_covers(z.polygon, here.g)
    limit 1
  ),
  nearest as (
    select c.id, c.slug, c.name, c.status,
           extensions.st_distance(c.centre, here.g) as distance_m, false as inside
    from here, public.city c
    where c.centre is not null
    /* st_distance, not <->. The KNN operator is not schema-qualifiable
       and this function runs with an empty search_path, so `<->` does not
       resolve — the same trap the zones migration hit. */
    order by extensions.st_distance(c.centre, here.g)
    limit 1
  )
  select * from in_zone
  union all
  select * from nearest where not exists (select 1 from in_zone)
$$;

comment on function public.fn_city_for_point is
  'The NexG city a coordinate falls in, or the nearest one with its distance. Returns waitlist cities too — telling somebody we are not open where they are beats showing them a city they are not in.';

grant execute on function public.fn_city_for_point(double precision, double precision)
  to anon, authenticated;
