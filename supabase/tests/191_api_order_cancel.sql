-- Cancelling an API booking through the API (20270302000100): the key's
-- merchant cancels its own API booking free of charge until a rider is
-- assigned; after that, or once under way or paid, it is refused (P0004).
-- Cancelling twice answers the same. Another merchant's booking, a website
-- order and a sandbox booking answer like missing ones (P0002). A test key
-- cancels sandbox bookings under the same rule. Only the server may call it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

create temp table t_m on commit drop as
  select m.id, m.city_id from public.merchant m
  where m.status = 'live' and m.explore_visible and m.deleted_at is null
    and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t_other on commit drop as
  select m.id from public.merchant m
  where m.id <> (select id from t_m) and m.status = 'live'
    and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;

-- A flat service with a price, so the booking function can book it.
insert into settings.definition (key, "group", scope_kind, value_type, unit, label)
values ('fees.service.venue_booking', 'fees', 'city', 'money', 'KES', 'Venue booking, flat')
on conflict (key) do nothing;
insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, reason)
select 'fees.service.venue_booking', 'city', city_id, to_jsonb(15000), 'active',
       now() - interval '1 minute', 'api cancel test'
from t_m;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
values
  ((select id from t_m), encode(sha256(convert_to('cancel-live-key-000000000000000000000', 'UTF8')), 'hex'),
   'cnclive1', '{public_read,merchant_read,merchant_write}', 600, 'live'),
  ((select id from t_m), encode(sha256(convert_to('cancel-reader-key-0000000000000000000', 'UTF8')), 'hex'),
   'cnclrea1', '{public_read,merchant_read}', 600, 'live'),
  ((select id from t_m), encode(sha256(convert_to('nexg_test_cancel-key-0000000000000000', 'UTF8')), 'hex'),
   'nexg_test_cnc1', '{public_read,merchant_read,merchant_write}', 600, 'test'),
  ((select id from t_other), encode(sha256(convert_to('cancel-other-key-00000000000000000000', 'UTF8')), 'hex'),
   'cncloth1', '{public_read,merchant_read,merchant_write}', 600, 'live');

-- Live bookings need NexG's approval (20270302000200).
insert into public.api_booking_access (merchant_id, enabled, monthly_limit_cents)
select id, true, 100000000 from t_m;

-- Four real bookings, and two sandbox ones.
insert into t
select 'order_' || n, public.rpc_order_place_api('cancel-live-key-000000000000000000000',
  'cancel-test-order-' || n || '-0000000000', '{"service":"venue_booking","quantity":1}'::jsonb)
from generate_series(1, 4) n;
insert into t
select 'sandbox_' || n, public.rpc_order_place_api_test('nexg_test_cancel-key-0000000000000000',
  'cancel-test-sandbox-' || n || '-000000000', '{"service":"venue_booking","quantity":1}'::jsonb)
from generate_series(1, 2) n;

create temp table o on commit drop as
  select k, (v ->> 'order_id')::uuid as id from t
  where k like 'order_%' or k like 'sandbox_%';

-- ═══════════════════════════════════════════════════════════════ a cancellation

insert into t values ('cancel_1', public.rpc_order_cancel_api('cancel-live-key-000000000000000000000',
  (select id from o where k = 'order_1'), 'The event moved to next month.'));

select is(
  (select concat_ws('|', v ->> 'ok', v ->> 'cancelled', v ->> 'previous_status', v #>> '{order,status}')
     from t where k = 'cancel_1'),
  'true|true|requested|cancelled',
  'the merchant cancels its own API booking before a rider is assigned');

select is(
  (select concat_ws('|', stage::text, cancel_reason_code, cancel_note)
     from public.order where id = (select id from o where k = 'order_1')),
  'cancelled|merchant_api|The event moved to next month.',
  'the order is cancelled with the reason given');

select is(
  (select concat_ws('|', e.title, e.actor_label) from public.order_event e
    where e.order_id = (select id from o where k = 'order_1') and e.kind = 'api_cancelled'),
  'Cancelled through the API|API key cnclive1',
  'the order history says it was cancelled through the API, and by which key');

select is(
  (select concat_ws('|', l.module, l.after ->> 'key_prefix', l.after ->> 'previous_status')
     from audit.audit_event l
    where l.action = 'order.api_cancelled' and l.target_id = (select id from o where k = 'order_1')),
  'orders|cnclive1|requested',
  'and it is audited');

select is(
  (select concat_ws('|', v ->> 'ok', v ->> 'cancelled', v ->> 'previous_status')
     from (select public.rpc_order_cancel_api('cancel-live-key-000000000000000000000',
             (select id from o where k = 'order_1')) as v) x),
  'true|false|cancelled',
  'cancelling again answers the same, and changes nothing');

select is(
  (select count(*)::integer from public.order_event e
    where e.order_id = (select id from o where k = 'order_1') and e.kind = 'api_cancelled'),
  1,
  'so the history has one cancellation');

-- ═══════════════════════════════════════════════════════════════ too late

insert into dispatch.job (order_id, city_id, pickup_label, dropoff_label, state, assigned_rider_id, assigned_at)
select (select id from o where k = 'order_2'), (select city_id from t_m), 'Pickup', 'Drop-off', 'assigned',
       (select r.id from public.rider r order by r.id limit 1), now();

select throws_ok(
  $$select public.rpc_order_cancel_api('cancel-live-key-000000000000000000000',
      (select id from o where k = 'order_2'))$$,
  'P0004', 'A rider has taken this booking, so it can no longer be cancelled through the API. Contact NexG support.',
  'once a rider is assigned, the API refuses');

select is(
  (select stage::text from public.order where id = (select id from o where k = 'order_2')),
  'placed',
  'and the booking is untouched');

update dispatch.job set state = 'cancelled', ended_at = now()
 where order_id = (select id from o where k = 'order_2');
select is(
  public.rpc_order_cancel_api('cancel-live-key-000000000000000000000',
    (select id from o where k = 'order_2')) ->> 'cancelled',
  'true',
  'a rider''s job that was itself cancelled does not count');

select set_config('nexg.order_stage_any', 'on', true);
update public.order set stage = 'picked_up' where id = (select id from o where k = 'order_3');
select set_config('nexg.order_stage_any', 'off', true);

select throws_ok(
  $$select public.rpc_order_cancel_api('cancel-live-key-000000000000000000000',
      (select id from o where k = 'order_3'))$$,
  'P0004', 'This booking is already in progress, so it can no longer be cancelled.',
  'a booking under way is refused');

-- ═══════════════════════════════════════════════════════════════ not yours

select throws_ok(
  $$select public.rpc_order_cancel_api('cancel-other-key-00000000000000000000',
      (select id from o where k = 'order_4'))$$,
  'P0002', 'That order does not exist.',
  'another merchant''s booking answers like a missing one');

update public.order set channel = 'web' where id = (select id from o where k = 'order_4');
select throws_ok(
  $$select public.rpc_order_cancel_api('cancel-live-key-000000000000000000000',
      (select id from o where k = 'order_4'))$$,
  'P0002', 'That order does not exist.',
  'an order that was not booked through the API is never reachable');

select throws_ok(
  $$select public.rpc_order_cancel_api('cancel-live-key-000000000000000000000',
      (select id from o where k = 'sandbox_1'))$$,
  'P0002', 'That order does not exist.',
  'a live key does not reach sandbox bookings');

select throws_ok(
  $$select public.rpc_order_cancel_api('cancel-reader-key-0000000000000000000',
      (select id from o where k = 'order_4'))$$,
  '42501', 'This key cannot cancel bookings: it needs merchant_write.',
  'a key without merchant_write is refused');

select throws_ok(
  $$select public.rpc_order_cancel_api('no-such-key', (select id from o where k = 'order_4'))$$,
  '42501', 'That API key is not valid.',
  'an unknown key is refused');

-- ═══════════════════════════════════════════════════════════════ the sandbox

select is(
  (select concat_ws('|', v ->> 'ok', v ->> 'cancelled', v ->> 'previous_status', v #>> '{order,status}')
     from (select public.rpc_order_cancel_api('nexg_test_cancel-key-0000000000000000',
             (select id from o where k = 'sandbox_1')) as v) x),
  'true|true|requested|cancelled',
  'a test key cancels a sandbox booking');

select is(
  (select stage from public.api_test_order where id = (select id from o where k = 'sandbox_1')),
  'cancelled',
  'and the sandbox booking is cancelled');

update public.api_test_order set rider_assigned_at = now()
 where id = (select id from o where k = 'sandbox_2');
select throws_ok(
  $$select public.rpc_order_cancel_api('nexg_test_cancel-key-0000000000000000',
      (select id from o where k = 'sandbox_2'))$$,
  'P0004', null,
  'a sandbox booking with a test rider is refused too');

select throws_ok(
  $$select public.rpc_order_cancel_api('nexg_test_cancel-key-0000000000000000',
      (select id from o where k = 'order_4'))$$,
  'P0002', 'That order does not exist.',
  'a test key never reaches a real order');

-- ═══════════════════════════════════════════════════════════════ access

select ok(
  not has_function_privilege('anon', 'public.rpc_order_cancel_api(text, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.rpc_order_cancel_api(text, uuid, text)', 'execute')
  and has_function_privilege('service_role', 'public.rpc_order_cancel_api(text, uuid, text)', 'execute'),
  'only the server may call it');

select is_empty(
  $$ select 1 from public.fn_wiring_check() where finding like '%rpc_order_cancel_api%' $$,
  'the wiring check has nothing to say about it');

select is(
  (select concat_ws('|', actor, to_stage::text, call) from public.order_step_rule
    where actor = 'system' and step = 'api_cancel'),
  'system|cancelled|rpc_order_cancel_api',
  'the stage rules record the path');

select * from finish();
rollback;
