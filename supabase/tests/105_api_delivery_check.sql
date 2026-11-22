-- "Can you deliver here?": rpc_delivery_check, behind POST /v1/delivery/check.
--
-- What this has to get right:
--
--   * a trip inside a zone is deliverable, with that zone's ETA and the
--     rate-card fee (base for the first km, per km for each further one)
--   * a drop-off in no zone but inside a live city's radius is deliverable,
--     with no ETA rather than a borrowed one
--   * a paused zone stops deliveries into it, not collections from it
--   * an inactive zone refuses, and is not named
--   * a trip past the city's maximum distance is refused, and lasting
--     reasons are reported before a pause
--   * visitors may call it, and it only reads

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

/* Testville: a live city far from every real one, with three square zones
   around its centre (lat 5, lng 20). Alpha is live, Bravo is live but
   paused, Charlie is switched off. No city settings, so the global rate
   card applies: KES 80 base, KES 25 per further km, 15 km at most. */
insert into public.city (slug, name, country, currency, timezone, status, centre, max_radius_km)
select 'testville', 'Testville', country, currency, timezone, 'live',
       extensions.st_setsrid(extensions.st_makepoint(20.0, 5.0), 4326)::extensions.geography, 30
  from public.city where slug = 'nairobi';

insert into public.zone (city_id, name, tier, polygon, eta_min, eta_max, active)
select c.id, z.name, z.tier::public.zone_tier, extensions.st_geogfromtext(z.wkt), z.eta_min, z.eta_max, z.active
  from public.city c,
       (values
         ('Alpha', 'core',
          'SRID=4326;POLYGON((19.97 4.97, 20.035 4.97, 20.035 5.03, 19.97 5.03, 19.97 4.97))', 20, 35, true),
         ('Bravo', 'core',
          'SRID=4326;POLYGON((20.05 4.98, 20.09 4.98, 20.09 5.02, 20.05 5.02, 20.05 4.98))', 25, 40, true),
         ('Charlie', 'trial',
          'SRID=4326;POLYGON((19.90 4.98, 19.94 4.98, 19.94 5.02, 19.90 5.02, 19.90 4.98))', 30, 50, false)
       ) as z(name, tier, wkt, eta_min, eta_max, active)
 where c.slug = 'testville';

insert into dispatch.zone_health (zone_id, paused, paused_reason)
select z.id, true, 'Heavy rain'
  from public.zone z join public.city c on c.id = z.city_id
 where c.slug = 'testville' and z.name = 'Bravo';

/* Points, as (lat, lng): the centre is in Alpha; 'alpha' is 3.2 km east
   inside it; 'city' is 8.8 km north in no zone; 'bravo' 7.8 km east and
   'charlie' 8.9 km west in those zones; 'north' 22.1 km north, inside the
   city's 30 km radius but past 15 km; 'outside' 110.9 km east, beyond it. */
create temp table r (k text primary key, j jsonb);
insert into r (k, j) values
  ('alpha',           public.rpc_delivery_check(5.0, 20.0,  5.0,  20.029)),
  ('city',            public.rpc_delivery_check(5.0, 20.0,  5.08, 20.0)),
  ('bravo',           public.rpc_delivery_check(5.0, 20.0,  5.0,  20.07)),
  ('from_bravo',      public.rpc_delivery_check(5.0, 20.07, 5.0,  20.0)),
  ('charlie',         public.rpc_delivery_check(5.0, 20.0,  5.0,  19.92)),
  ('from_charlie',    public.rpc_delivery_check(5.0, 19.92, 5.0,  20.0)),
  ('north',           public.rpc_delivery_check(5.0, 20.0,  5.2,  20.0)),
  ('outside',         public.rpc_delivery_check(5.0, 20.0,  5.0,  21.0)),
  ('from_outside',    public.rpc_delivery_check(5.0, 21.0,  5.0,  20.0)),
  ('outside_to_bravo', public.rpc_delivery_check(5.0, 21.0, 5.0,  20.07)),
  ('north_to_bravo',  public.rpc_delivery_check(5.2, 20.0,  5.0,  20.07)),
  ('same_spot',       public.rpc_delivery_check(5.0, 20.0,  5.0,  20.0)),
  /* Nairobi CBD to 5 km east, on the zones the migrations draw. */
  ('nairobi',         public.rpc_delivery_check(-1.2864, 36.8172, -1.2864, 36.8622));

-- ════════════════════════════════════════ deliverable

select is(
  (select concat_ws('|', j ->> 'deliverable', coalesce(j ->> 'reason', 'none'),
          j ->> 'city_slug', j -> 'pickup' ->> 'zone_name', j -> 'dropoff' ->> 'zone_name',
          j ->> 'distance_km', j ->> 'max_distance_km', j ->> 'eta_min', j ->> 'eta_max',
          j ->> 'delivery_fee_cents', j ->> 'currency')
     from r where k = 'alpha'),
  'true|none|testville|Alpha|Alpha|3.2|15|20|35|15500|KES',
  'A 3.2 km trip inside a zone is deliverable, with the zone''s ETA and 80 + 3 × 25 = KES 155.');

select is(
  (select concat_ws('|', j ->> 'deliverable', coalesce(j -> 'dropoff' ->> 'zone_id', 'none'),
          j -> 'dropoff' ->> 'served', coalesce(j ->> 'eta_min', 'none'),
          coalesce(j ->> 'eta_max', 'none'), j ->> 'distance_km', j ->> 'delivery_fee_cents')
     from r where k = 'city'),
  'true|none|true|none|none|8.8|28000',
  'A drop-off in no zone inside the city''s radius is deliverable, with no ETA, at 80 + 8 × 25.');

select is(
  (select concat_ws('|', j ->> 'distance_km', j ->> 'delivery_fee_cents') from r where k = 'same_spot'),
  '0.0|8000',
  'A trip of no distance costs the base fee.');

select is(
  (select concat_ws('|', j ->> 'deliverable', j ->> 'city_slug', j ->> 'delivery_fee_cents',
          (j ->> 'eta_min' is not null)::text)
     from r where k = 'nairobi'),
  'true|nairobi|18000|true',
  'Nairobi CBD to 5 km east is deliverable on the real zones, with an ETA, at 80 + 4 × 25.');

-- ════════════════════════════════════════ a pause

select is(
  (select concat_ws('|', j ->> 'deliverable', j ->> 'reason', j -> 'dropoff' ->> 'served',
          j -> 'dropoff' ->> 'paused', j -> 'dropoff' ->> 'zone_name',
          coalesce(j ->> 'eta_min', 'none'), coalesce(j ->> 'delivery_fee_cents', 'none'))
     from r where k = 'bravo'),
  'false|dropoff_paused|true|true|Bravo|none|none',
  'A drop-off in a paused zone is served but paused: not deliverable, no ETA, no fee.');

select is(
  (select j ->> 'message' from r where k = 'bravo'),
  'Deliveries into Bravo are paused right now · Heavy rain.',
  'And it says so, with the reason staff gave.');

select is(
  (select concat_ws('|', j ->> 'deliverable', j -> 'pickup' ->> 'zone_name',
          j -> 'dropoff' ->> 'zone_name', j ->> 'distance_km', j ->> 'delivery_fee_cents',
          j ->> 'eta_min', j ->> 'eta_max')
     from r where k = 'from_bravo'),
  'true|Bravo|Alpha|7.8|25500|20|35',
  'A pickup in a paused zone is collected: the pause stops deliveries into it, nothing else.');

-- ════════════════════════════════════════ not served

select is(
  (select concat_ws('|', j ->> 'deliverable', j ->> 'reason', j -> 'dropoff' ->> 'served',
          coalesce(j -> 'dropoff' ->> 'zone_id', 'none'), coalesce(j -> 'dropoff' ->> 'zone_name', 'none'))
     from r where k = 'charlie'),
  'false|dropoff_not_served|false|none|none',
  'A drop-off in a switched-off zone is refused, and the zone is not named.');

select is(
  (select concat_ws('|', j ->> 'deliverable', j ->> 'reason', coalesce(j ->> 'city_slug', 'none'),
          coalesce(j ->> 'max_distance_km', 'none'), coalesce(j -> 'pickup' ->> 'zone_name', 'none'))
     from r where k = 'from_charlie'),
  'false|pickup_not_served|none|none|none',
  'A pickup in a switched-off zone is refused too.');

select is(
  (select concat_ws('|', j ->> 'deliverable', j ->> 'reason', j -> 'dropoff' ->> 'served', j ->> 'message')
     from r where k = 'outside'),
  'false|dropoff_not_served|false|The drop-off is outside the areas NexG delivers in.',
  'A drop-off beyond every city''s radius is refused.');

select is(
  (select concat_ws('|', j ->> 'deliverable', j ->> 'reason', j -> 'pickup' ->> 'served',
          coalesce(j ->> 'city_slug', 'none'), j ->> 'distance_km')
     from r where k = 'from_outside'),
  'false|pickup_not_served|false|none|110.9',
  'So is a pickup there, and the distance is still given.');

-- ════════════════════════════════════════ too far

select is(
  (select concat_ws('|', j ->> 'deliverable', j ->> 'reason', j ->> 'distance_km',
          j ->> 'max_distance_km', coalesce(j ->> 'delivery_fee_cents', 'none'),
          coalesce(j ->> 'eta_min', 'none'))
     from r where k = 'north'),
  'false|too_far|22.1|15|none|none',
  'A 22.1 km trip inside the city''s radius is past the 15 km maximum and refused.');

select is(
  (select j ->> 'message' from r where k = 'north'),
  'The pickup and the drop-off are 22.1 km apart in a straight line. NexG delivers up to 15 km in Testville.',
  'And it says how far, and how far NexG goes.');

select is(
  (select string_agg(j ->> 'reason', ',' order by k) from r
    where k in ('north_to_bravo', 'outside_to_bravo')),
  'too_far,pickup_not_served',
  'A lasting reason is reported before a pause: too far, or a pickup NexG does not serve.');

-- ════════════════════════════════════════ what it refuses to read

select throws_ok(
  $$ select public.rpc_delivery_check(91, 20, 5, 20) $$,
  '22023', null,
  'A latitude past 90 is refused.');

select throws_ok(
  $$ select public.rpc_delivery_check(5, 20, 5, 'NaN'::double precision) $$,
  '22023', null,
  'So is a coordinate that is not a number.');

select throws_ok(
  $$ select public.rpc_delivery_check(5, null, 5, 20) $$,
  '22023', null,
  'And a missing one.');

-- ════════════════════════════════════════ who may call it

select ok(
  has_function_privilege('anon',
    'public.rpc_delivery_check(double precision, double precision, double precision, double precision)',
    'execute'),
  'Visitors may call it: the API answers without a key.');

set local role anon;
select is(
  (select concat_ws('|', j ->> 'deliverable', j ->> 'delivery_fee_cents')
     from (select public.rpc_delivery_check(5.0, 20.0, 5.0, 20.029) as j) a),
  'true|15500',
  'Called by a visitor, it gives the same answer: it reads zones and pauses for them.');
reset role;

select is(
  (select provolatile::text from pg_proc
    where oid = 'public.rpc_delivery_check(double precision, double precision, double precision, double precision)'::regprocedure),
  's',
  'It is stable: it reads and never writes.');

select is_empty(
  $$ select 1 from public.fn_wiring_check() where finding like '%rpc_delivery_check%' $$,
  'The wiring check has nothing to say about it.');

select * from finish();
rollback;
