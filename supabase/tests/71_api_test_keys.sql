-- Test keys and the sandbox (20261217000100).
--
-- A test key's booking is an api_test_order row and never an order; the live
-- and sandbox functions refuse each other's keys; both refuse the same bad
-- bookings with the same words; test keys spend from a bucket of their own;
-- and a merchant owner can issue a test key, which says what it is.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- A live merchant that may operate, with airport transfers priced in its city.
create temp table t_m on commit drop as
  select m.id, m.city_id from public.merchant m
  where m.status = 'live' and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
grant select on t_m to authenticated;

insert into settings.definition (key, "group", scope_kind, value_type, unit, label)
values ('fees.service.airport_transfer', 'fees', 'city', 'money', 'KES', 'Airport transfer, per passenger')
on conflict (key) do nothing;
insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, reason)
select 'fees.service.airport_transfer', 'city', city_id, to_jsonb(2500), 'active',
       now() - interval '1 minute', 'test keys'
from t_m;

-- One live key and one test key for the merchant. The test key's low limit
-- must not slow the live one.
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select id, encode(sha256(convert_to('live-key-for-the-sandbox-test-000000', 'UTF8')), 'hex'),
       'livekey1', '{public_read,merchant_read,merchant_write}', 600
from t_m;
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
select id, encode(sha256(convert_to('nexg_test_key-for-the-sandbox-test-0000', 'UTF8')), 'hex'),
       'nexg_test_key1', '{public_read,merchant_read,merchant_write}', 10, 'test'
from t_m;

delete from public.api_rate_bucket where principal like 'merchant:' || (select id from t_m)::text || '%';
create temp table t_before on commit drop as select count(*) as orders from public."order";

-- The SQLSTATE and message a booking function answers with, or 'accepted'.
create function pg_temp.refusal(p_fn text, p_key text, p_payload jsonb) returns text
language plpgsql as $$
begin
  execute format('select public.%I($1, $2, $3)', p_fn)
    using p_key, 'parity-' || md5(random()::text), p_payload;
  return 'accepted';
exception when others then
  return sqlstate || ': ' || sqlerrm;
end
$$;

-- Every page of test bookings, following next_cursor, as one list of ids.
create function pg_temp.all_test_pages(p_limit integer) returns uuid[] language plpgsql as $$
declare
  v_page jsonb;
  v_ids uuid[] := '{}';
  v_at timestamptz;
  v_id uuid;
begin
  for guard in 1..50 loop
    v_page := public.rpc_order_read_api_test('nexg_test_key-for-the-sandbox-test-0000', null, p_limit, v_at, v_id);
    v_ids := v_ids || array(select (e ->> 'order_id')::uuid from jsonb_array_elements(v_page -> 'items') e);
    exit when jsonb_typeof(v_page -> 'next_cursor') is distinct from 'object';
    v_at := (v_page -> 'next_cursor' ->> 'created_at')::timestamptz;
    v_id := (v_page -> 'next_cursor' ->> 'id')::uuid;
  end loop;
  return v_ids;
end
$$;

-- ── the key kind ─────────────────────────────────────────────────────────
select is((select environment from public.api_key where key_prefix = 'livekey1'), 'live',
  'a key made without a kind is a live key');
select is((select environment from public.fn_api_key_lookup('nexg_test_key-for-the-sandbox-test-0000')), 'test',
  'the lookup says which kind a key is');

-- ── booking in the sandbox ───────────────────────────────────────────────
select lives_ok($$
  select public.rpc_order_place_api_test('nexg_test_key-for-the-sandbox-test-0000', 'sandbox-booking-key-0001',
    '{"service":"airport_transfer","quantity":2,"pickup_label":"JKIA Terminal 1A","pickup_lat":-1.3192,
      "pickup_lng":36.9278,"dropoff_label":"Westlands","dropoff_lat":-1.2648,"dropoff_lng":36.8027}')
$$, 'a test key books in the sandbox');

select is((select count(*) from public."order"), (select orders from t_before),
  'a test booking makes no order');

select is(
  (select price_source || ':' || total_cents from public.api_test_order
   where merchant_id = (select id from t_m) and service = 'airport_transfer'),
  'settings:' || (public.fn_price_api_service((select city_id from t_m),
    (select s from public.api_service s where s.code = 'airport_transfer'), 2) ->> 'total_cents'),
  'a priced service costs what NexG''s settings say');

select matches(
  (select reference from public.api_test_order
   where merchant_id = (select id from t_m) and service = 'airport_transfer'),
  '^TEST-[0-9]{6}-[0-9A-F]{6}$',
  'a test booking''s reference says TEST');

select is(
  (public.rpc_order_place_api_test('nexg_test_key-for-the-sandbox-test-0000', 'sandbox-booking-key-0001',
     '{"service":"courier"}') ->> 'order_id')::uuid,
  (select id from public.api_test_order where merchant_id = (select id from t_m) and service = 'airport_transfer'),
  'the same idempotency key returns the first booking, whatever the body');

select is((select count(*)::int from public.api_test_order where merchant_id = (select id from t_m)), 1,
  'and books nothing new');

select is(
  (public.rpc_order_place_api_test('nexg_test_key-for-the-sandbox-test-0000', 'sandbox-booking-key-0002',
     '{"service":"courier","quantity":3,"pickup_label":"Shop","pickup_lat":-1.30,"pickup_lng":36.80,
       "dropoff_label":"Office","dropoff_lat":-1.26,"dropoff_lng":36.80}') ->> 'total_cents')::bigint,
  300000::bigint,
  'an unpriced service gets the sample price, KES 1,000 a unit');

select is(
  (public.rpc_order_place_api_test('nexg_test_key-for-the-sandbox-test-0000', 'sandbox-booking-key-0003',
     '{"service":"venue_booking","quantity":4}') ->> 'total_cents')::bigint,
  100000::bigint,
  'an unpriced flat service gets one sample price');

-- ── the two never cross ──────────────────────────────────────────────────
select throws_ok($$
  select public.rpc_order_place_api('nexg_test_key-for-the-sandbox-test-0000', 'sandbox-booking-key-0004',
    '{"service":"airport_transfer"}')
$$, '42501', 'A test key books in the sandbox, never for real.', 'the live booking function refuses a test key');

select throws_ok($$
  select public.rpc_order_place_api_test('live-key-for-the-sandbox-test-000000', 'sandbox-booking-key-0005',
    '{"service":"airport_transfer"}')
$$, '42501', 'A live key books for real, not in the sandbox.', 'the sandbox refuses a live key');

select throws_ok($$ select public.rpc_order_read_api('nexg_test_key-for-the-sandbox-test-0000') $$,
  '42501', 'A test key reads test bookings, never real orders.', 'the live order read refuses a test key');

select throws_ok($$ select public.rpc_order_read_api_test('live-key-for-the-sandbox-test-000000') $$,
  '42501', 'A live key reads real orders, not test bookings.', 'the sandbox read refuses a live key');

-- ── reading test bookings ────────────────────────────────────────────────
select is(jsonb_array_length(public.rpc_order_read_api_test('nexg_test_key-for-the-sandbox-test-0000') -> 'items'), 3,
  'the sandbox lists the merchant''s three test bookings');

select is(
  (select array_agg(x order by x) from unnest(pg_temp.all_test_pages(1)) x),
  (select array_agg(id order by id) from public.api_test_order where merchant_id = (select id from t_m)),
  'paging one at a time returns each test booking once');

select is(
  public.rpc_order_read_api_test('nexg_test_key-for-the-sandbox-test-0000',
    (select id from public.api_test_order where merchant_id = (select id from t_m) and service = 'courier'))
    -> 'items' -> 0 ->> 'service',
  'courier',
  'one test booking reads by id');

-- ── the sandbox refuses what live refuses, in the same words ─────────────
select is(
  pg_temp.refusal('rpc_order_place_api', 'live-key-for-the-sandbox-test-000000', '{"service":"helicopter"}')
  || ' | ' || pg_temp.refusal('rpc_order_place_api_test', 'nexg_test_key-for-the-sandbox-test-0000', '{"service":"helicopter"}'),
  '22023: That service is not one we offer. | 22023: That service is not one we offer.',
  'both refuse a service NexG does not offer');

select is(
  pg_temp.refusal('rpc_order_place_api', 'live-key-for-the-sandbox-test-000000', '{"service":"venue_booking","quantity":61}')
  || ' | ' || pg_temp.refusal('rpc_order_place_api_test', 'nexg_test_key-for-the-sandbox-test-0000', '{"service":"venue_booking","quantity":61}'),
  '22023: How many are we moving? | 22023: How many are we moving?',
  'both refuse more than 60');

select is(
  pg_temp.refusal('rpc_order_place_api', 'live-key-for-the-sandbox-test-000000',
    '{"service":"airport_transfer","dropoff_label":"B","dropoff_lat":-1.26,"dropoff_lng":36.8}')
  || ' | ' || pg_temp.refusal('rpc_order_place_api_test', 'nexg_test_key-for-the-sandbox-test-0000',
    '{"service":"airport_transfer","dropoff_label":"B","dropoff_lat":-1.26,"dropoff_lng":36.8}'),
  '22023: Where are we collecting from? | 22023: Where are we collecting from?',
  'both refuse a ride with no pickup');

select is(
  pg_temp.refusal('rpc_order_place_api', 'live-key-for-the-sandbox-test-000000',
    '{"service":"airport_transfer","pickup_label":"A","dropoff_label":"B","dropoff_lat":-1.26,"dropoff_lng":36.8}')
  || ' | ' || pg_temp.refusal('rpc_order_place_api_test', 'nexg_test_key-for-the-sandbox-test-0000',
    '{"service":"airport_transfer","pickup_label":"A","dropoff_label":"B","dropoff_lat":-1.26,"dropoff_lng":36.8}'),
  '22023: Give the pickup point as a latitude and longitude. | 22023: Give the pickup point as a latitude and longitude.',
  'both refuse a ride with no pickup point');

select is(
  pg_temp.refusal('rpc_order_place_api', 'live-key-for-the-sandbox-test-000000',
    '{"service":"venue_booking","scheduled_for":"2026-01-01T08:00:00+03:00"}')
  || ' | ' || pg_temp.refusal('rpc_order_place_api_test', 'nexg_test_key-for-the-sandbox-test-0000',
    '{"service":"venue_booking","scheduled_for":"2026-01-01T08:00:00+03:00"}'),
  '22023: That time has already passed. | 22023: That time has already passed.',
  'both refuse a time that has passed');

-- ── rate limits ──────────────────────────────────────────────────────────
select is(
  (select remaining from public.fn_api_request_spend('nexg_test_key-for-the-sandbox-test-0000', null, 'public_read')),
  9,
  'a test key spends from its own bucket, filled at the test keys'' limit');

select ok(
  exists (select 1 from public.api_rate_bucket where principal = 'merchant:' || (select id from t_m)::text || ':test'),
  'that bucket is the merchant''s :test bucket');

select is(
  (select remaining from public.fn_api_request_spend('live-key-for-the-sandbox-test-000000', null, 'public_read')),
  (select greatest(5, least(min(rate_limit), 600)) - 1 from public.api_key
   where merchant_id = (select id from t_m) and environment = 'live' and state = 'active'
     and (expires_at is null or expires_at > now())),
  'the live bucket is untouched by the test key''s low limit');

-- ── issuing a test key, as the merchant's owner ──────────────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', 'c7100000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'test.keys.owner@test.local', '', now(), now(), now(),
  '', '', '', '', '', '', '', '');
insert into public.merchant_user (merchant_id, user_id, role)
select id, 'c7100000-0000-4000-8000-000000000001', 'owner' from t_m;
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('c7200000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', now(), now());
insert into public.merchant_application_session_activity (session_id, user_id, last_activity_at)
values ('c7200000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', now());

select set_config('request.jwt.claims',
  '{"sub":"c7100000-0000-4000-8000-000000000001","role":"authenticated",'
  || '"session_id":"c7200000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;

select is(
  (select left(raw_key, 10) || '|' || (key_prefix ~ '^nexg_test_[0-9a-f]{4}$')::text
   from public.fn_api_key_issue((select id from t_m), '{public_read,merchant_read,merchant_write}',
     60, null, null, null, 'test')),
  'nexg_test_|true',
  'an owner issues a test key that says what it is');

select is(
  (select length(raw_key) || '|' || length(key_prefix)
   from public.fn_api_key_issue((select id from t_m), '{public_read}', 60)),
  '64|8',
  'a key issued without a kind is live, as before');

select throws_ok($$
  select * from public.fn_api_key_issue((select id from t_m), '{public_read}', 60, null, null, null, 'staging')
$$, '22023', 'Invalid credential policy.', 'only live and test keys exist');

reset role;

-- Row security does not cover TRUNCATE, so the table grants nothing but the staff read.
select ok(
  not has_table_privilege('anon', 'public.api_test_order', 'select,insert,update,delete,truncate,references,trigger')
  and not has_table_privilege('authenticated', 'public.api_test_order', 'insert,update,delete,truncate,references,trigger')
  and has_table_privilege('authenticated', 'public.api_test_order', 'select'),
  'the sandbox table grants nothing but the staff read');

select * from finish();
rollback;
