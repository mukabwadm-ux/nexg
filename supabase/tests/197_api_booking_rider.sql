-- API bookings show their rider (20270311000100): once a rider takes the
-- delivery job, a merchant's system reads the rider's first name, vehicle and
-- plate, and where the rider is from pickup until delivery, in GET
-- /v1/orders and in every webhook event; never a phone number or surname.
-- The sandbox answers a made-up test rider in the same shape.

begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures below set order stages directly; the stage guard (20270221000100) allows that only when asked.
select set_config('nexg.order_stage_any', 'on', true);
select plan(25);

create temp table t_m on commit drop as
  select m.id, m.city_id from public.merchant m
  where m.status = 'live' and m.explore_visible and m.deleted_at is null
    and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;

insert into settings.definition (key, "group", scope_kind, value_type, unit, label)
values ('fees.service.airport_transfer', 'fees', 'city', 'money', 'KES', 'Airport transfer, a passenger')
on conflict (key) do nothing;
insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, reason)
select 'fees.service.airport_transfer', 'city', city_id, to_jsonb(2500), 'active',
       now() - interval '1 minute', 'booking rider'
from t_m;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
values
  ((select id from t_m), encode(sha256(convert_to('booking-rider-live-key-0000000000000', 'UTF8')), 'hex'),
   'brdliv01', '{public_read,merchant_read,merchant_write}', 600, 'live'),
  ((select id from t_m), encode(sha256(convert_to('nexg_test_booking-rider-key-00000000', 'UTF8')), 'hex'),
   'nexg_test_brd1', '{public_read,merchant_read,merchant_write}', 600, 'test');

insert into public.api_webhook_endpoint (merchant_id, environment, url, secret_ref, secret_prefix)
select id, env, 'https://hooks.partner.co.ke/nexg/booking-rider-' || env, 'api_webhook:booking-rider-' || env, 'whsec_brider1'
from t_m cross join (values ('live'), ('test')) e(env);

-- Live API bookings need NexG's approval (20270302000200).
insert into public.api_booking_access (merchant_id, enabled, monthly_limit_cents)
select id, true, 100000000 from t_m
on conflict (merchant_id) do nothing;

set constraints api_webhook_order_event, dispatch.api_webhook_rider_event immediate;

insert into t values ('ride', public.rpc_order_place_api(
  'booking-rider-live-key-0000000000000', 'booking-rider-idem-00000000000001',
  '{"service":"airport_transfer","quantity":1,"pickup_label":"JKIA Terminal 1A","pickup_lat":-1.3192,
    "pickup_lng":36.9278,"dropoff_label":"Westlands","dropoff_lat":-1.2648,"dropoff_lng":36.8027}'::jsonb));
insert into t values ('riders', (select jsonb_agg(id order by id)
  from (select id from public.rider where vehicle <> 'bicycle' order by id limit 2) r));
insert into t values ('bike', (select to_jsonb(id) from public.rider where vehicle = 'bicycle' order by id limit 1));

-- The rider of the live ride, as GET /v1/orders/{id} answers it.
create function pg_temp.ride_rider() returns jsonb language sql as $$
  select public.rpc_order_read_api('booking-rider-live-key-0000000000000',
    (select (v ->> 'order_id')::uuid from t where k = 'ride')) #> '{items,0,rider}'
$$;
create function pg_temp.ride_id() returns uuid language sql as $$
  select (v ->> 'order_id')::uuid from t where k = 'ride'
$$;
create function pg_temp.rider_id(n integer) returns uuid language sql as $$
  select (v ->> n)::uuid from t where k = 'riders'
$$;
create function pg_temp.point(lat double precision, lng double precision) returns extensions.geography
language sql as $$
  select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
$$;

-- ═══════════════════════════════════════════════════════════════ access

select ok(
  not has_function_privilege('anon', 'public.fn_api_booking_rider(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_api_booking_rider(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.fn_api_test_booking_rider(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_api_test_booking_rider(uuid)', 'execute'),
  'the rider helpers are not open to signed-in or anonymous callers');

select is(
  (select concat_ws('|', module, default_severity, money::text) from audit.action_registry
   where action = 'api.order_placed'),
  'orders|notice|true',
  'the audit action a live API booking writes is registered');

-- ═══════════════════════════════════════════════════════════════ no rider yet

select is(pg_temp.ride_rider(), 'null'::jsonb, 'a booking without a delivery job answers rider: null');

insert into dispatch.job (order_id, city_id, pickup_label, dropoff_label)
select pg_temp.ride_id(), city_id, 'JKIA Terminal 1A', 'Westlands' from t_m;

select is(pg_temp.ride_rider(), 'null'::jsonb, 'a job still looking for a rider shows nobody');

-- ═══════════════════════════════════════════════════════════════ a rider takes it

update public.order set stage = 'confirmed' where id = pg_temp.ride_id();
-- A fresh position, sent after the rider takes the job.
update public.rider
   set last_location = pg_temp.point(-1.2833, 36.8217), last_location_at = now() + interval '30 seconds'
 where id = pg_temp.rider_id(0);
update dispatch.job
   set state = 'assigned', assigned_at = now(), assigned_rider_id = pg_temp.rider_id(0)
 where order_id = pg_temp.ride_id();

select is(
  (select string_agg(k, ',' order by k) from jsonb_object_keys(pg_temp.ride_rider()) k),
  'assigned_at,first_name,location,plate,vehicle',
  'a rider who took the job: first name, vehicle, plate, when and where, and nothing else');

select is(
  pg_temp.ride_rider() - 'assigned_at' - 'location',
  (select jsonb_build_object('first_name', trim(r.first_name), 'vehicle', r.vehicle,
     'plate', nullif(trim(r.plate_no), ''))
   from public.rider r where r.id = pg_temp.rider_id(0)),
  'the first name, vehicle and plate are the rider''s own');

select ok(
  (select not exists (
     select 1 from jsonb_each_text(pg_temp.ride_rider()) e
     where e.value in (r.phone, r.last_name, coalesce(r.email, '-')))
   from public.rider r where r.id = pg_temp.rider_id(0)),
  'never the rider''s phone number, surname or email');

select is(pg_temp.ride_rider() -> 'location', 'null'::jsonb,
  'before pickup there is no location, even with a fresh position');

select is(
  (select ev.body #>> '{data,booking,rider,first_name}'
   from public.api_webhook_event ev
   where ev.type = 'booking.rider_assigned' and ev.booking_id = pg_temp.ride_id()),
  (select trim(first_name) from public.rider where id = pg_temp.rider_id(0)),
  'booking.rider_assigned says who took the job');

-- ═══════════════════════════════════════════════════════════════ pickup to delivery

update public.order set stage = 'picked_up' where id = pg_temp.ride_id();

select is(
  pg_temp.ride_rider() -> 'location',
  jsonb_build_object('latitude', -1.2833, 'longitude', 36.8217, 'at', now() + interval '30 seconds'),
  'from pickup: where the rider last was, and when the app sent it');

select is(
  (select ev.body #> '{data,booking,rider,location,latitude}'
   from public.api_webhook_event ev
   where ev.type = 'booking.status_changed' and ev.booking_id = pg_temp.ride_id()
     and ev.body #>> '{data,booking,stage}' = 'picked_up'),
  '-1.2833'::jsonb,
  'the picked_up event carries the location');

update public.rider set last_location_at = now() - interval '1 minute' where id = pg_temp.rider_id(0);

select is(pg_temp.ride_rider() -> 'location', 'null'::jsonb,
  'a position sent before the rider took this job is not shown');

-- The job passes to another rider, whose app sends a position.
update public.rider
   set last_location = pg_temp.point(-1.27, 36.81), last_location_at = now() + interval '40 seconds'
 where id = pg_temp.rider_id(1);
update dispatch.job
   set assigned_at = now() + interval '10 seconds', assigned_rider_id = pg_temp.rider_id(1)
 where order_id = pg_temp.ride_id();

select is(
  (select concat_ws('|', pg_temp.ride_rider() ->> 'first_name', pg_temp.ride_rider() #>> '{location,latitude}')),
  (select trim(first_name) || '|-1.270000' from public.rider where id = pg_temp.rider_id(1)),
  'a job passed to another rider shows the new rider and their position');

update public.order set stage = 'arriving' where id = pg_temp.ride_id();

select is(pg_temp.ride_rider() #>> '{location,longitude}', '36.810000',
  'arriving: still located');

select is(
  (select jsonb_typeof(x -> 'rider') || '|' || (x #>> '{rider,location,latitude}')
   from jsonb_array_elements(
     public.rpc_order_read_api('booking-rider-live-key-0000000000000') -> 'items') x
   where (x ->> 'order_id')::uuid = pg_temp.ride_id()),
  'object|-1.270000',
  'the list of orders answers the rider too');

update public.order set stage = 'delivered', handed_to = 'guest' where id = pg_temp.ride_id();
update dispatch.job set state = 'completed', ended_at = now() + interval '1 minute'
 where order_id = pg_temp.ride_id();

select is(
  concat_ws('|',
    (pg_temp.ride_rider() ->> 'first_name' = (select trim(first_name) from public.rider where id = pg_temp.rider_id(1)))::text,
    jsonb_typeof(pg_temp.ride_rider() -> 'location')),
  'true|null',
  'after delivery the rider stays on the booking and the location stops');

update dispatch.job set state = 'cancelled' where order_id = pg_temp.ride_id();

select is(pg_temp.ride_rider(), 'null'::jsonb, 'a cancelled job shows no rider');

update dispatch.job set state = 'assigned', assigned_rider_id = (select (v #>> '{}')::uuid from t where k = 'bike')
 where order_id = pg_temp.ride_id();

select is(
  concat_ws('|', pg_temp.ride_rider() ->> 'vehicle', coalesce(pg_temp.ride_rider() ->> 'plate', 'none')),
  'bicycle|none',
  'a bicycle has no plate');

-- ═══════════════════════════════════════════════════════════════ the sandbox

insert into t values ('test_ride', public.rpc_order_place_api_test(
  'nexg_test_booking-rider-key-00000000', 'booking-rider-idem-00000000000002',
  '{"service":"airport_transfer","quantity":1,"pickup_label":"JKIA","pickup_lat":-1.3192,
    "pickup_lng":36.9278,"dropoff_label":"Westlands","dropoff_lat":-1.2648,"dropoff_lng":36.8027}'::jsonb));

create function pg_temp.test_rider() returns jsonb language sql as $$
  select public.rpc_order_read_api_test('nexg_test_booking-rider-key-00000000',
    (select (v ->> 'order_id')::uuid from t where k = 'test_ride')) #> '{items,0,rider}'
$$;

select is(pg_temp.test_rider(), 'null'::jsonb, 'a test booking has no rider until one is assigned');

select lives_ok(
  $$select public.rpc_order_stage_api_test('nexg_test_booking-rider-key-00000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'ready')$$,
  'the test ride is ready');

insert into t values ('test_assign', public.rpc_order_rider_api_test('nexg_test_booking-rider-key-00000000',
  (select (v ->> 'order_id')::uuid from t where k = 'test_ride')));

select is(
  (select (v #> '{order,rider}') - 'assigned_at' from t where k = 'test_assign'),
  '{"first_name":"Test","vehicle":"motorbike","plate":"KTEST 001","location":null}'::jsonb,
  'a test rider is a made-up rider in the live shape, with no location before pickup');

select public.rpc_order_stage_api_test('nexg_test_booking-rider-key-00000000',
  (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'picked_up');

select is((pg_temp.test_rider() -> 'location') - 'at', '{"latitude":-1.3192,"longitude":36.9278}'::jsonb,
  'picked up: the test rider is at the pickup point');

select is(
  (select ev.body #> '{data,booking,rider,location,latitude}'
   from public.api_webhook_event ev
   where ev.environment = 'test' and ev.type = 'booking.status_changed'
     and ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'test_ride')
     and ev.body #>> '{data,booking,stage}' = 'picked_up'),
  '-1.3192'::jsonb,
  'the sandbox events carry the test rider too');

select public.rpc_order_stage_api_test('nexg_test_booking-rider-key-00000000',
  (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'arriving');

select is((pg_temp.test_rider() -> 'location') - 'at', '{"latitude":-1.2648,"longitude":36.8027}'::jsonb,
  'arriving: at the drop-off point');

select public.rpc_order_stage_api_test('nexg_test_booking-rider-key-00000000',
  (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'cancelled');

select is(pg_temp.test_rider(), 'null'::jsonb, 'a cancelled test booking shows no rider');

select * from finish();
rollback;
