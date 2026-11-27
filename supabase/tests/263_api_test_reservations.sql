-- Test reservations (20270339000100): a test key makes, reads, accepts,
-- declines, gives a driver to and moves sandbox reservations, under the live
-- rules, with reservation.* events to the merchant's test endpoints. A live
-- key, another merchant's key and a key without the scope are refused.

begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

create temp table t_m on commit drop as
  select m.id from public.merchant m where m.deleted_at is null order by m.id limit 1;
create temp table t_other on commit drop as
  select m.id from public.merchant m
  where m.deleted_at is null and m.id <> (select id from t_m) order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
select id, encode(sha256(convert_to('nexg_test_sandbox-res-0000000000000', 'UTF8')), 'hex'),
       'nexg_test_res1', '{public_read,merchant_read,merchant_write}', 600, 'test'
from t_m;
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
select id, encode(sha256(convert_to('nexg_test_sandbox-read-00000000000', 'UTF8')), 'hex'),
       'nexg_test_res2', '{public_read,merchant_read}', 600, 'test'
from t_m;
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select id, encode(sha256(convert_to('sandbox-live-key-0000000000000000', 'UTF8')), 'hex'),
       'sbxlive1', '{public_read,merchant_read,merchant_write}', 600
from t_m;
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
select id, encode(sha256(convert_to('nexg_test_sandbox-other-0000000000', 'UTF8')), 'hex'),
       'nexg_test_res3', '{public_read,merchant_read,merchant_write}', 600, 'test'
from t_other;

insert into public.api_webhook_endpoint (merchant_id, environment, url, secret_ref, secret_prefix)
select id, 'test', 'https://hooks.partner.co.ke/sandbox', 'api_webhook:sandbox-test', 'whsec_sbx001'
from t_m;

create function pg_temp.k() returns text language sql as $$ select 'nexg_test_sandbox-res-0000000000000' $$;
create function pg_temp.made(p_name text) returns uuid language sql as $$
  select (v -> 'reservation' ->> 'id')::uuid from t where k = p_name
$$;
create function pg_temp.events(p_type text) returns bigint language sql as $$
  select count(*) from public.api_webhook_event e
  where e.merchant_id = (select id from t_m) and e.environment = 'test' and e.type = p_type
$$;

-- ═══════════════════════════════════════════════════════════════ who may call

select ok(not has_function_privilege('anon', 'public.rpc_reservation_create_api_test(text, jsonb)', 'execute'),
  'anon cannot make test reservations');
select ok(not has_function_privilege('authenticated', 'public.rpc_reservation_act_api_test(text, uuid, text, jsonb)', 'execute'),
  'a signed-in user cannot act on them');
select ok(has_function_privilege('service_role', 'public.rpc_reservation_move_api_test(text, uuid, text)', 'execute'),
  'the API (service role) can');
select ok((select relrowsecurity from pg_class where oid = 'public.api_test_reservation'::regclass),
  'test reservations have row-level security');

-- ═══════════════════════════════════════════════════════════════ making them

insert into t values ('plain', public.rpc_reservation_create_api_test(pg_temp.k(), '{}'::jsonb));
select is(t.v -> 'reservation' ->> 'status', 'requested', 'a new one is requested') from t where k = 'plain';
select is(t.v -> 'reservation' -> 'offering' ->> 'name', 'Test transfer', 'a transfer by default') from t where k = 'plain';
select is(t.v -> 'reservation' ->> 'guest_name', 'Test Guest', 'under the name Test Guest') from t where k = 'plain';
select is(t.v -> 'reservation' ->> 'payment_state', 'not_required', 'nothing to pay by default') from t where k = 'plain';
select ok((t.v -> 'reservation' ->> 'starts_at')::timestamptz > now(), 'for later') from t where k = 'plain';
select is(pg_temp.events('reservation.created'), 1::bigint, 'reservation.created goes to the test endpoint');
select ok(
  (select not (e.body -> 'data' -> 'reservation' ? 'guest_name') from public.api_webhook_event e
   where e.merchant_id = (select id from t_m) and e.type = 'reservation.created'),
  'the event carries the summary, without the name');

insert into t values ('paid', public.rpc_reservation_create_api_test(pg_temp.k(),
  '{"total_cents": 450000, "guest_name": "Amina", "trip": {"pickup_area": "JKIA", "pickup_address": null, "dropoff_area": "Westlands", "dropoff_address": null}}'));
select is(t.v -> 'reservation' ->> 'payment_state', 'awaiting_payment', 'a price makes it wait for payment') from t where k = 'paid';
select is(t.v -> 'reservation' -> 'trip' ->> 'pickup_area', 'JKIA', 'the trip is kept') from t where k = 'paid';

select throws_ok(
  $$ select public.rpc_reservation_create_api_test('sandbox-live-key-0000000000000000', '{}') $$,
  '42501', null, 'a live key makes no test reservation');
select throws_ok(
  $$ select public.rpc_reservation_create_api_test('nexg_test_sandbox-read-00000000000', '{}') $$,
  '42501', null, 'a key without merchant_write makes none');
select throws_ok(
  $$ select public.rpc_reservation_create_api_test(pg_temp.k(), '{"phone": "0700000000"}') $$,
  '22023', null, 'an unknown field is refused');
select throws_ok(
  $$ select public.rpc_reservation_create_api_test(pg_temp.k(), '{"quantity": 0}') $$,
  '22023', null, 'a quantity out of range is refused');

-- ═══════════════════════════════════════════════════════════════ reading them

select is(
  jsonb_array_length(public.rpc_reservation_read_api_test(pg_temp.k()) -> 'items'),
  2, 'the test key lists its test reservations');
select is(
  public.rpc_reservation_read_api_test(pg_temp.k(), pg_temp.made('plain')) -> 'items' -> 0 ->> 'id',
  pg_temp.made('plain')::text, 'and reads one by id');
select ok(
  (public.rpc_reservation_read_api_test(pg_temp.k(), null, 1) -> 'next_cursor') <> 'null'::jsonb,
  'a page of one says there is more');
select throws_ok(
  format($$ select public.rpc_reservation_read_api_test('nexg_test_sandbox-other-0000000000', %L) $$,
         pg_temp.made('plain')),
  'P0002', null, 'another merchant''s test key cannot read it');
select throws_ok(
  $$ select public.rpc_reservation_read_api_test('sandbox-live-key-0000000000000000') $$,
  '42501', null, 'a live key reads no test reservations');

-- ═══════════════════════════════════════════════════════════════ accept, decline, driver

select throws_ok(
  format($$ select public.rpc_reservation_act_api_test(%L, %L, 'accept', '{"expected_version": 7}') $$,
         pg_temp.k(), pg_temp.made('plain')),
  'P0005', null, 'accepting needs the current version');
insert into t values ('accepted', public.rpc_reservation_act_api_test(pg_temp.k(), pg_temp.made('plain'),
  'accept', '{"expected_version": 1}'));
select is(t.v -> 'reservation' ->> 'status', 'confirmed', 'accepting confirms it') from t where k = 'accepted';
select is((t.v -> 'reservation' ->> 'version')::int, 2, 'and moves its version on') from t where k = 'accepted';
select is(
  (select e.body -> 'data' ->> 'previous_status' from public.api_webhook_event e
   where e.merchant_id = (select id from t_m) and e.type = 'reservation.status_changed'),
  'requested', 'reservation.status_changed says where it came from');
select throws_ok(
  format($$ select public.rpc_reservation_act_api_test(%L, %L, 'accept', '{"expected_version": 1}') $$,
         pg_temp.k(), pg_temp.made('paid')),
  'P0005', null, 'one waiting for payment is not accepted');
select throws_ok(
  format($$ select public.rpc_reservation_act_api_test(%L, %L, 'decline', '{"expected_version": 2}') $$,
         pg_temp.k(), pg_temp.made('plain')),
  'P0005', null, 'a confirmed one is not declined');
insert into t values ('declined', public.rpc_reservation_act_api_test(pg_temp.k(), pg_temp.made('paid'),
  'decline', '{"expected_version": 1}'));
select is(t.v -> 'reservation' ->> 'status', 'cancelled', 'a waiting, unpaid one is declined') from t where k = 'declined';

select throws_ok(
  format($$ select public.rpc_reservation_act_api_test(%L, %L, 'driver',
           '{"expected_version": 2, "driver": {"first_name": "Juma", "vehicle": "Noah", "phone": "0700"}}') $$,
         pg_temp.k(), pg_temp.made('plain')),
  '22023', null, 'a driver with a phone number is refused');
insert into t values ('driven', public.rpc_reservation_act_api_test(pg_temp.k(), pg_temp.made('plain'),
  'driver', '{"expected_version": 2, "driver": {"first_name": "Juma", "vehicle": "White Toyota Noah", "plate": "kda  123a"}}'));
select is(t.v -> 'reservation' -> 'driver' ->> 'plate', 'KDA 123A', 'the plate is kept in capitals') from t where k = 'driven';
select is(pg_temp.events('reservation.updated'), 1::bigint, 'setting a driver sends reservation.updated');
select is(
  public.rpc_reservation_act_api_test(pg_temp.k(), pg_temp.made('plain'), 'driver',
    '{"expected_version": 3, "driver": null}') -> 'reservation' -> 'driver',
  'null'::jsonb, 'driver: null clears it');

-- ═══════════════════════════════════════════════════════════════ moving them

select is(
  public.rpc_reservation_move_api_test(pg_temp.k(), pg_temp.made('plain'), 'in_progress')
    -> 'reservation' ->> 'status',
  'in_progress', 'a test reservation moves forward');
select throws_ok(
  format($$ select public.rpc_reservation_move_api_test(%L, %L, 'confirmed') $$,
         pg_temp.k(), pg_temp.made('plain')),
  'P0005', null, 'not backwards');
insert into t values ('topay', public.rpc_reservation_create_api_test(pg_temp.k(), '{"total_cents": 9900}'));
select is(
  (public.rpc_reservation_move_api_test(pg_temp.k(), pg_temp.made('topay'), 'confirmed')
    -> 'reservation' ->> 'paid_cents')::bigint,
  9900::bigint, 'confirming one that waits for payment counts it paid');
select throws_ok(
  format($$ select public.rpc_reservation_move_api_test(%L, %L, 'cancelled') $$,
         pg_temp.k(), pg_temp.made('declined')),
  'P0005', null, 'a cancelled one stays cancelled');
select throws_ok(
  format($$ select public.rpc_reservation_move_api_test('sandbox-live-key-0000000000000000', %L, 'completed') $$,
         pg_temp.made('plain')),
  '42501', null, 'a live key moves no test reservation');

select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
