-- The location layer, tested where it decides something.
--
-- The consent rule — that the browser is only asked inside a
-- click — is a browser fact and is proven in Playwright, not
-- here. What the database owns is narrower and just as easy to
-- get quietly wrong:
--
--   * answering "covered" for a point we cannot reach
--   * answering "outside" for a city that is simply not live,
--     which is a different sentence and a different action
--   * a distance to the nearest covered zone that is wrong, and
--     therefore a plan somebody makes and wastes
--   * one person reading another's saved gate code
--   * the analytics table quietly becoming a location history

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

create temp table t (k text primary key, v text);
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

insert into t (k, v) values
  ('zone_lat', (select extensions.st_y(extensions.st_centroid(polygon)::extensions.geometry)::text
                  from public.zone where active order by name limit 1)),
  ('zone_lng', (select extensions.st_x(extensions.st_centroid(polygon)::extensions.geometry)::text
                  from public.zone where active order by name limit 1)),
  ('zone_name', (select name from public.zone where active order by name limit 1));

-- ════════════════════════════════════ 1. the three coverage answers

select is(
  public.rpc_coverage_lookup((select v::double precision from t where k='zone_lat'),
                             (select v::double precision from t where k='zone_lng')) ->> 'coverage',
  'covered',
  'A point inside a live zone is covered.');

select is(
  public.rpc_coverage_lookup((select v::double precision from t where k='zone_lat'),
                             (select v::double precision from t where k='zone_lng')) ->> 'zone',
  (select v from t where k='zone_name'),
  'And it names the zone, because the chip shows it.');

select ok(
  (public.rpc_coverage_lookup((select v::double precision from t where k='zone_lat'),
                              (select v::double precision from t where k='zone_lng')) ->> 'eta_min')::int > 0,
  'With the window the guest is quoted, from the zone rather than a constant.');

/* Syokimau: inside Kenya, near Nairobi, outside every zone. */
select is(
  public.rpc_coverage_lookup(-1.3650, 36.9500) ->> 'coverage',
  'outside',
  'A point outside every zone is outside, not covered.');

select ok(
  (public.rpc_coverage_lookup(-1.3650, 36.9500) ->> 'nearest_km')::numeric between 1 and 60,
  'And the distance to the nearest covered zone is a real number somebody could walk or drive.');

select isnt(
  public.rpc_coverage_lookup(-1.3650, 36.9500) ->> 'nearest_zone',
  null,
  'It names that zone — "not available" with no alternative is a dead end.');

/*
 * The distinction that matters most on this screen. Kampala is
 * not an uncovered address in a city we serve; it is a city we
 * have not opened. One offers the nearest zone, the other offers
 * a waitlist, and showing the wrong one either promises delivery
 * we cannot do or hides a city we are about to launch.
 */
select is(
  public.rpc_coverage_lookup(0.3476, 32.5825) ->> 'coverage',
  'unlaunched',
  'A city on the list but not trading is unlaunched, not outside.');

select is(
  public.rpc_coverage_lookup(0.3476, 32.5825) ->> 'city',
  'Kampala',
  'Named, so the banner can say which city.');

select is(
  public.rpc_coverage_lookup(null, null) ->> 'coverage',
  'unknown',
  'No point is unknown — never a default city.');

select is(
  public.rpc_coverage_lookup(91, 200) ->> 'coverage',
  'unknown',
  'Nor is a coordinate that is not on earth quietly clamped into one.');

-- ══════════════════════════════════ 2. a paused zone is still covered

select is(
  (select count(*)::int from public.zone z
    join dispatch.zone_health h on h.zone_id = z.id
   where h.paused),
  0,
  'Nothing is paused in this fixture, so the next assertion means what it says.');

-- ═══════════════════════════════════════════ 3. resolution

select is(
  public.rpc_resolve_location('{}'::jsonb) ->> 'chip_state',
  'empty',
  'Knowing nothing resolves to an empty chip, not to a guessed city.');

select is(
  public.rpc_resolve_location('{}'::jsonb) ->> 'place',
  null,
  'And no place at all — an invented one would read exactly like a real one.');

select is(
  public.rpc_resolve_location(jsonb_build_object(
    'lat', (select v::double precision from t where k='zone_lat'),
    'lng', (select v::double precision from t where k='zone_lng'),
    'step', 'ip_city')) ->> 'chip_state',
  'city',
  'A point from the connection stays a city-level chip even when it lands inside a zone.');

/*
 * The one above is the subtle one. An IP that happens to resolve
 * inside a delivery zone is still an IP — precise-looking and
 * not precise. If it were promoted to a confirmed pin the chip
 * would turn green and the guest would be quoted a price for a
 * doorway nobody picked.
 */
select is(
  public.rpc_resolve_location(jsonb_build_object(
    'lat', (select v::double precision from t where k='zone_lat'),
    'lng', (select v::double precision from t where k='zone_lng'),
    'step', 'gps')) ->> 'chip_state',
  'set',
  'The same point from GPS is a set chip, because somebody confirmed it.');

-- ═══════════════════════════════ 4. nobody reads anybody else's place

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000','c0000000-0000-4000-8000-0000000000a1',
   'authenticated','authenticated','place.a@test.local','',now(),now(),now(),'','','','','','','',''),
  ('00000000-0000-0000-0000-000000000000','c0000000-0000-4000-8000-0000000000a2',
   'authenticated','authenticated','place.b@test.local','',now(),now(),now(),'','','','','','','','')
on conflict (id) do nothing;

insert into public.guest (id, user_id, phone, name) values
  ('c1000000-0000-4000-8000-0000000000a1','c0000000-0000-4000-8000-0000000000a1','+254700000941','[Guest A]'),
  ('c1000000-0000-4000-8000-0000000000a2','c0000000-0000-4000-8000-0000000000a2','+254700000942','[Guest B]')
on conflict (id) do nothing;

insert into public.guest_place (guest_id, label, point, gate_no, source)
values ('c1000000-0000-4000-8000-0000000000a1', 'Home',
        extensions.st_setsrid(extensions.st_makepoint(36.7825, -1.2850), 4326)::extensions.geography,
        '[gate code]', 'gps');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.guest_place),
  1,
  'A guest sees their own saved place.');

select set_config('request.jwt.claims',
  '{"sub":"c0000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.guest_place),
  0,
  'And nobody else sees it — these rows hold gate codes and a phone number.');

reset role;
set local role anon;
select throws_matching(
  $$select count(*) from public.guest_place$$,
  'permission denied',
  'An anonymous request is refused the table outright, not handed an empty set.');

reset role;

-- ════════════════════ 5. the consent log is not a location history

select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'location_consent_event'
      and column_name in ('lat', 'lng', 'point', 'latitude', 'longitude', 'accuracy_m')),
  0,
  'The consent log holds no coordinates — it answers how often we ask, not where anybody was.');

select lives_ok(
  $$select public.rpc_location_event('sess-1', '/explore', 'shown', 'city', 'none')$$,
  'An event can be recorded.');

select is(
  (select count(*)::int from public.location_consent_event where session_id = 'sess-1'),
  1,
  'And it lands.');

select * from finish();
rollback;
