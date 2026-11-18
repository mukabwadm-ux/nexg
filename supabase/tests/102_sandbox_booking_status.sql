-- Test bookings that move (20270104080100): a test key with merchant_write
-- moves its merchant's test booking forward, or to cancelled, and each change
-- of status sends booking.status_changed to the test endpoints; a booking only
-- moves forward and stops at completed or cancelled; live keys, keys without
-- merchant_write and other merchants' keys are refused; the merchant's owner
-- makes and moves test bookings from the developer console, a manager cannot;
-- and nothing here is open to the public.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create temp table t_m on commit drop as
  select m.id from public.merchant m
  where m.status = 'live' and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t_other on commit drop as
  select m.id from public.merchant m
  where m.id <> (select id from t_m)
  order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;
grant select on t_m, t_other to authenticated;
grant select, insert on t to authenticated;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
values
  ((select id from t_m), encode(sha256(convert_to('nexg_test_moves-key-00000000000000000', 'UTF8')), 'hex'),
   'nexg_test_mov1', '{public_read,merchant_read,merchant_write}', 600, 'test'),
  ((select id from t_m), encode(sha256(convert_to('nexg_test_moves-reader-0000000000000', 'UTF8')), 'hex'),
   'nexg_test_mov2', '{public_read,merchant_read}', 600, 'test'),
  ((select id from t_m), encode(sha256(convert_to('moves-live-key-000000000000000000000', 'UTF8')), 'hex'),
   'moveslv1', '{public_read,merchant_read,merchant_write}', 600, 'live'),
  ((select id from t_other), encode(sha256(convert_to('nexg_test_moves-other-00000000000000', 'UTF8')), 'hex'),
   'nexg_test_mov3', '{public_read,merchant_read,merchant_write}', 600, 'test');

-- A test endpoint, so events have somewhere to go. Nothing is sent here.
insert into public.api_webhook_endpoint (merchant_id, environment, url, secret_ref, secret_prefix)
select id, 'test', 'https://hooks.partner.co.ke/nexg/moves', 'api_webhook:moves-test', 'whsec_moves1'
from t_m;

insert into t values ('a', public.rpc_order_place_api_test(
  'nexg_test_moves-key-00000000000000000', 'moves-idem-00000000000000000001',
  '{"service":"venue_booking","quantity":1}'::jsonb));
insert into t values ('b', public.rpc_order_place_api_test(
  'nexg_test_moves-key-00000000000000000', 'moves-idem-00000000000000000002',
  '{"service":"venue_booking","quantity":1}'::jsonb));
insert into t values ('c', public.rpc_order_place_api_test(
  'nexg_test_moves-key-00000000000000000', 'moves-idem-00000000000000000003',
  '{"service":"venue_booking","quantity":1}'::jsonb));
insert into t values ('d', public.rpc_order_place_api_test(
  'nexg_test_moves-key-00000000000000000', 'moves-idem-00000000000000000004',
  '{"service":"venue_booking","quantity":1}'::jsonb));

-- ═══════════════════════════════════════════════════════════════ the rules

select is(public.fn_api_test_order_next('placed'),
  array['confirmed', 'in_progress', 'completed', 'cancelled'],
  'a requested test booking may move to any later status, or be cancelled');

select is(public.fn_api_test_order_next('picked_up'),
  array['completed', 'cancelled'],
  'one in progress may complete or be cancelled');

select is(
  cardinality(public.fn_api_test_order_next('delivered'))
    + cardinality(public.fn_api_test_order_next('cancelled')),
  0,
  'completed and cancelled are final');

-- ═══════════════════════════════════════════════════════════════ with a test key

insert into t values ('a1', public.rpc_order_status_api_test(
  'nexg_test_moves-key-00000000000000000',
  (select (v ->> 'order_id')::uuid from t where k = 'a'), 'confirmed'));

select is(
  (select concat_ws('|', v ->> 'ok', v #>> '{order,status}', v #>> '{order,stage}',
     v ->> 'previous_status', (v #>> '{order,reference}' like 'TEST-%')::text)
   from t where k = 'a1'),
  'true|confirmed|confirmed|requested|true',
  'a test key moves its test booking from requested to confirmed');

select is(
  (select concat_ws('|', ev.environment, ev.body #>> '{data,booking,status}',
     ev.body #>> '{data,booking,stage}', ev.body #>> '{data,previous_status}',
     ev.body #>> '{data,previous_stage}',
     (select count(*) from public.api_webhook_delivery d where d.event_id = ev.id)::text)
   from public.api_webhook_event ev
   where ev.type = 'booking.status_changed'
     and ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'a')),
  'test|confirmed|confirmed|requested|placed|1',
  'the move sends booking.status_changed to the test endpoint, with the status before and after');

select is(
  (select ev.body #> '{data,booking}' from public.api_webhook_event ev
   where ev.type = 'booking.status_changed'
     and ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'a')),
  public.fn_api_test_order_object((select (v ->> 'order_id')::uuid from t where k = 'a')),
  'the event carries the booking as GET /v1/orders/{id} returns it');

select throws_ok(
  $$select public.rpc_order_status_api_test('nexg_test_moves-key-00000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'a'), 'confirmed')$$,
  '22023', 'This test booking is already confirmed.',
  'moving to the status it already has is refused');

select lives_ok(
  $$select public.rpc_order_status_api_test('nexg_test_moves-key-00000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'a'), 'in_progress')$$,
  'then on to in_progress');

select throws_ok(
  $$select public.rpc_order_status_api_test('nexg_test_moves-key-00000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'a'), 'confirmed')$$,
  '22023', 'A test booking only moves forward. From in_progress it can go to completed, cancelled.',
  'it never moves back');

select is(
  public.rpc_order_status_api_test('nexg_test_moves-key-00000000000000000',
    (select (v ->> 'order_id')::uuid from t where k = 'a'), 'cancelled') #>> '{order,stage}',
  'cancelled',
  'a booking in progress can still be cancelled');

select throws_ok(
  $$select public.rpc_order_status_api_test('nexg_test_moves-key-00000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'a'), 'completed')$$,
  '22023', 'This test booking is cancelled, so it cannot move again.',
  'cancelled is final');

select is(
  public.rpc_order_status_api_test('nexg_test_moves-key-00000000000000000',
    (select (v ->> 'order_id')::uuid from t where k = 'b'), ' Completed ') #>> '{order,stage}',
  'delivered',
  'a booking may skip ahead to completed; the status is read without case or spaces');

select is(
  (select count(*) from public.api_webhook_event ev
   where ev.type = 'booking.status_changed'
     and ev.booking_id in (select (v ->> 'order_id')::uuid from t where k in ('a', 'b'))),
  4::bigint,
  'every move wrote one event: three for the first booking, one for the second');

select throws_ok(
  $$select public.rpc_order_status_api_test('nexg_test_moves-key-00000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'b'), 'shipped')$$,
  '22023', 'Move a test booking to confirmed, in_progress, completed or cancelled.',
  'an unknown status is refused');

-- ═══════════════════════════════════════════════════════════════ refusals

select throws_ok(
  $$select public.rpc_order_status_api_test('moves-live-key-000000000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'c'), 'confirmed')$$,
  '42501', 'Only a test key moves bookings. Real bookings move as the merchant and NexG work on them.',
  'a live key is refused');

select throws_ok(
  $$select public.rpc_order_status_api_test('nexg_test_moves-reader-0000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'c'), 'confirmed')$$,
  '42501', 'This key cannot move test bookings: it needs merchant_write.',
  'a key without merchant_write is refused');

select throws_ok(
  $$select public.rpc_order_status_api_test('nexg_test_moves-other-00000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'c'), 'confirmed')$$,
  'P0002', 'That order does not exist.',
  'another merchant''s key cannot find the booking: the same answer as an id that does not exist');

select throws_ok(
  $$select public.rpc_order_status_api_test('not-a-key-at-all',
      (select (v ->> 'order_id')::uuid from t where k = 'c'), 'confirmed')$$,
  '42501', 'That API key is not valid.',
  'an unknown key is refused');

-- Straight on the table: events follow the shared status, as for live orders.
update public.api_test_order set stage = 'confirmed'
 where id = (select (v ->> 'order_id')::uuid from t where k = 'd');
update public.api_test_order set stage = 'preparing'
 where id = (select (v ->> 'order_id')::uuid from t where k = 'd');

select is(
  (select string_agg(ev.type, ',' order by ev.created_at) from public.api_webhook_event ev
   where ev.type <> 'booking.created'
     and ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'd')),
  'booking.status_changed,booking.stage_changed',
  'a stage change inside the same status sends booking.stage_changed (20270105030100), not a status change');

-- ═══════════════════════════════════════════════════════════════ the developer console

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000', 'cc100000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'moves.owner@test.local', '', now(), now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cc100000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'moves.manager@test.local', '', now(), now(), now(),
   '', '', '', '', '', '', '', '');
insert into public.merchant_user (merchant_id, user_id, role)
values
  ((select id from t_m), 'cc100000-0000-4000-8000-000000000001', 'owner'),
  ((select id from t_m), 'cc100000-0000-4000-8000-000000000002', 'manager');
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('cc200000-0000-4000-8000-000000000001', 'cc100000-0000-4000-8000-000000000001', now(), now()),
       ('cc200000-0000-4000-8000-000000000002', 'cc100000-0000-4000-8000-000000000002', now(), now());
insert into public.merchant_application_session_activity (session_id, user_id, last_activity_at)
values ('cc200000-0000-4000-8000-000000000001', 'cc100000-0000-4000-8000-000000000001', now()),
       ('cc200000-0000-4000-8000-000000000002', 'cc100000-0000-4000-8000-000000000002', now());

insert into t values ('count', to_jsonb((select count(*) from public.api_test_order
                                         where merchant_id = (select id from t_m))));

select set_config('request.jwt.claims',
  '{"sub":"cc100000-0000-4000-8000-000000000001","role":"authenticated",'
  || '"session_id":"cc200000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;

select is(
  jsonb_array_length(public.rpc_api_test_orders()),
  (select (v #>> '{}')::integer from t where k = 'count'),
  'the owner sees every test booking of the merchant');

select is(
  (select x -> 'next' from jsonb_array_elements(public.rpc_api_test_orders()) x
   where x ->> 'order_id' = (select v ->> 'order_id' from t where k = 'c')),
  '["confirmed", "in_progress", "completed", "cancelled"]'::jsonb,
  'each with the statuses it may move to');

insert into t values ('s', public.rpc_api_test_order_sample((select id from t_m), 'airport_transfer'));

select is(
  (select concat_ws('|', v ->> 'service', v ->> 'status', v ->> 'quantity', v ->> 'pickup_label',
     v ->> 'dropoff_label', (v ->> 'reference' like 'TEST-%')::text, ((v ->> 'total_cents')::bigint > 0)::text)
   from t where k = 's'),
  'airport_transfer|requested|1|Sample pickup|Sample drop-off|true|true',
  'the owner makes a sample test booking from the console');

select throws_ok(
  $$select public.rpc_api_test_order_sample((select id from t_m), 'courier')$$,
  '22023', 'A test booking was just made. Wait a few seconds.',
  'one sample booking every few seconds');

select is(
  public.rpc_api_test_order_move((select (v ->> 'order_id')::uuid from t where k = 's'), 'confirmed')
    #>> '{order,status}',
  'confirmed',
  'the owner moves it on from the console');

-- A session that is not current is refused.
select set_config('request.jwt.claims',
  '{"sub":"cc100000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select throws_ok(
  $$select public.rpc_api_test_orders()$$,
  '42501', 'A current signed-in account session is required.',
  'the console needs a current signed-in session');

-- A manager of the same merchant.
select set_config('request.jwt.claims',
  '{"sub":"cc100000-0000-4000-8000-000000000002","role":"authenticated",'
  || '"session_id":"cc200000-0000-4000-8000-000000000002","is_anonymous":false}', true);

select throws_ok(
  $$select public.rpc_api_test_order_move((select (v ->> 'order_id')::uuid from t where k = 's'), 'completed')$$,
  'P0002', 'No such test booking.',
  'a manager cannot move the merchant''s test bookings');

select throws_ok(
  $$select public.rpc_api_test_order_sample((select id from t_m), 'courier')$$,
  '42501', 'Test bookings are made by the merchant''s owner.',
  'nor make one');

select is(public.rpc_api_test_orders(), '[]'::jsonb, 'nor see them');

reset role;

select is(
  (select string_agg(ev.type || ':' || ev.environment, ',' order by ev.created_at)
   from public.api_webhook_event ev
   where ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 's')),
  'booking.created:test,booking.status_changed:test',
  'the console''s booking sent booking.created, then booking.status_changed, to the test endpoint');

-- ═══════════════════════════════════════════════════════════════ who may call what

select ok(
  not has_function_privilege('anon', 'public.rpc_api_test_orders(integer)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_api_test_order_sample(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_api_test_order_move(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_order_status_api_test(text, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.rpc_order_status_api_test(text, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_api_test_order_move(uuid, uuid, text)', 'execute')
  and has_function_privilege('service_role', 'public.rpc_order_status_api_test(text, uuid, text)', 'execute'),
  'the API''s function is the server''s alone, and nothing here is open to the public');

select is(
  (select count(*) from public.fn_wiring_check() w
   where w.finding ~ '(test_order|order_status_api_test)'),
  0::bigint,
  'the wiring check finds nothing in the new functions');

select * from finish();
rollback;
