-- Rider milestones (20270105030100): every stage change of a live booking
-- sends one event, booking.status_changed or booking.stage_changed; a rider
-- taking its delivery job sends booking.rider_assigned, and again for a new
-- rider, but not for a release or the same rider; the sandbox sends the same,
-- moving a test booking by stage and assigning a test rider to rides and
-- couriers only, forward only, by test key or from the console; and nothing
-- here is open to the public.

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
grant select on t_m to authenticated;
grant select, insert on t to authenticated;

insert into settings.definition (key, "group", scope_kind, value_type, unit, label)
values ('fees.service.airport_transfer', 'fees', 'city', 'money', 'KES', 'Airport transfer, a passenger')
on conflict (key) do nothing;
insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, reason)
select 'fees.service.airport_transfer', 'city', city_id, to_jsonb(2500), 'active',
       now() - interval '1 minute', 'rider milestones'
from t_m;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
values
  ((select id from t_m), encode(sha256(convert_to('riders-live-key-00000000000000000000', 'UTF8')), 'hex'),
   'ridliv01', '{public_read,merchant_read,merchant_write}', 600, 'live'),
  ((select id from t_m), encode(sha256(convert_to('nexg_test_riders-key-0000000000000000', 'UTF8')), 'hex'),
   'nexg_test_rid1', '{public_read,merchant_read,merchant_write}', 600, 'test');

insert into public.api_webhook_endpoint (merchant_id, environment, url, secret_ref, secret_prefix)
select id, env, 'https://hooks.partner.co.ke/nexg/riders-' || env, 'api_webhook:riders-' || env, 'whsec_rider1'
from t_m cross join (values ('live'), ('test')) e(env);

set constraints api_webhook_order_event, dispatch.api_webhook_rider_event immediate;

insert into t values ('ride', public.rpc_order_place_api(
  'riders-live-key-00000000000000000000', 'riders-idem-0000000000000000001',
  '{"service":"airport_transfer","quantity":2,"pickup_label":"JKIA Terminal 1A","pickup_lat":-1.3192,
    "pickup_lng":36.9278,"dropoff_label":"Westlands","dropoff_lat":-1.2648,"dropoff_lng":36.8027}'::jsonb));

-- ═══════════════════════════════════════════════════════════════ live stages

select ok(
  (select pg_get_constraintdef(c.oid) like '%booking.stage_changed%'
      and pg_get_constraintdef(c.oid) like '%booking.rider_assigned%'
   from pg_constraint c
   where c.conrelid = 'public.api_webhook_event'::regclass and c.conname = 'api_webhook_event_type_check'),
  'events may be booking.stage_changed and booking.rider_assigned');

update public.order set stage = 'confirmed' where id = (select (v ->> 'order_id')::uuid from t where k = 'ride');
update public.order set stage = 'picked_up' where id = (select (v ->> 'order_id')::uuid from t where k = 'ride');
update public.order set stage = 'arriving' where id = (select (v ->> 'order_id')::uuid from t where k = 'ride');
update public.order set stage = 'arriving' where id = (select (v ->> 'order_id')::uuid from t where k = 'ride');

select is(
  (select string_agg(ev.type || ':' || coalesce(ev.body #>> '{data,previous_stage}', '-')
                     || '>' || (ev.body #>> '{data,booking,stage}'), ',' order by ev.created_at)
   from public.api_webhook_event ev
   where ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'ride')
     and ev.type <> 'booking.created'),
  'booking.status_changed:placed>confirmed,booking.status_changed:confirmed>picked_up,booking.stage_changed:picked_up>arriving',
  'every stage change sends one event: a status change, or a stage change inside a status; setting the same stage sends none');

select is(
  (select ev.body #>> '{data,booking,status}' || '|' || coalesce(ev.body #>> '{data,previous_status}', 'none')
   from public.api_webhook_event ev
   where ev.type = 'booking.stage_changed'
     and ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'ride')),
  'in_progress|none',
  'booking.stage_changed carries the booking at its status, and no previous_status');

-- ═══════════════════════════════════════════════════════════════ live riders

insert into t values ('riders', (select jsonb_agg(id order by id) from (select id from public.rider order by id limit 2) r));

insert into dispatch.job (order_id, city_id, pickup_label, dropoff_label)
select (select (v ->> 'order_id')::uuid from t where k = 'ride'), city_id, 'JKIA Terminal 1A', 'Westlands' from t_m;

select is(
  (select count(*) from public.api_webhook_event
   where type = 'booking.rider_assigned'
     and booking_id = (select (v ->> 'order_id')::uuid from t where k = 'ride')),
  0::bigint,
  'a job waiting for a rider sends nothing');

update dispatch.job
   set state = 'assigned', assigned_at = now(), assigned_rider_id = (select (v ->> 0)::uuid from t where k = 'riders')
 where order_id = (select (v ->> 'order_id')::uuid from t where k = 'ride');

select is(
  (select concat_ws('|', ev.environment, ((ev.body #>> '{data,booking,order_id}') = (select v ->> 'order_id' from t where k = 'ride'))::text,
     ((ev.body #>> '{data,assigned_at}') is not null)::text, (ev.body -> 'data' ? 'rider')::text,
     (select count(*) from public.api_webhook_delivery d where d.event_id = ev.id)::text)
   from public.api_webhook_event ev
   where ev.type = 'booking.rider_assigned'
     and ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'ride')),
  'live|true|true|false|1',
  'a rider taking the job sends booking.rider_assigned to the live endpoint, with the booking and the time, and nothing about the rider');

update dispatch.job set assigned_at = now()
 where order_id = (select (v ->> 'order_id')::uuid from t where k = 'ride');
update dispatch.job set state = 'queued', assigned_at = null, assigned_rider_id = null
 where order_id = (select (v ->> 'order_id')::uuid from t where k = 'ride');

select is(
  (select count(*) from public.api_webhook_event
   where type = 'booking.rider_assigned'
     and booking_id = (select (v ->> 'order_id')::uuid from t where k = 'ride')),
  1::bigint,
  'the same rider again, or a release back to the queue, sends nothing');

update dispatch.job
   set state = 'assigned', assigned_at = now(), assigned_rider_id = (select (v ->> 1)::uuid from t where k = 'riders')
 where order_id = (select (v ->> 'order_id')::uuid from t where k = 'ride');

select is(
  (select count(*) from public.api_webhook_event
   where type = 'booking.rider_assigned'
     and booking_id = (select (v ->> 'order_id')::uuid from t where k = 'ride')),
  2::bigint,
  'the next rider sends booking.rider_assigned again');

-- ═══════════════════════════════════════════════════════════════ the sandbox

insert into t values ('test_ride', public.rpc_order_place_api_test(
  'nexg_test_riders-key-0000000000000000', 'riders-idem-0000000000000000002',
  '{"service":"airport_transfer","quantity":1,"pickup_label":"JKIA","pickup_lat":-1.3192,
    "pickup_lng":36.9278,"dropoff_label":"Westlands","dropoff_lat":-1.2648,"dropoff_lng":36.8027}'::jsonb));
insert into t values ('test_venue', public.rpc_order_place_api_test(
  'nexg_test_riders-key-0000000000000000', 'riders-idem-0000000000000000003',
  '{"service":"venue_booking","quantity":1}'::jsonb));

insert into t values ('s1', public.rpc_order_stage_api_test('nexg_test_riders-key-0000000000000000',
  (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'preparing'));

select is(
  (select concat_ws('|', v ->> 'ok', v #>> '{order,stage}', v #>> '{order,status}', v ->> 'previous_status',
     v ->> 'previous_stage') from t where k = 's1'),
  'true|preparing|confirmed|requested|placed',
  'a test key moves its test booking to a stage, and is told the status and stage before');

select lives_ok(
  $$select public.rpc_order_stage_api_test('nexg_test_riders-key-0000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'ready')$$,
  'on to ready, inside the same status');

select throws_ok(
  $$select public.rpc_order_stage_api_test('nexg_test_riders-key-0000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'ready')$$,
  '22023', 'This test booking is already at ready.',
  'moving to the stage it has is refused');

select throws_ok(
  $$select public.rpc_order_stage_api_test('nexg_test_riders-key-0000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'confirmed')$$,
  '22023', 'A test booking only moves forward. From ready it can go to picked_up, arriving, delivered, cancelled.',
  'and so is moving back');

select throws_ok(
  $$select public.rpc_order_stage_api_test('nexg_test_riders-key-0000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'flying')$$,
  '22023', 'Move a test booking to confirmed, preparing, ready, picked_up, arriving, delivered or cancelled.',
  'an unknown stage is refused');

insert into t values ('rider', public.rpc_order_rider_api_test('nexg_test_riders-key-0000000000000000',
  (select (v ->> 'order_id')::uuid from t where k = 'test_ride')));

select is(
  (select concat_ws('|', v ->> 'ok', ((v ->> 'assigned_at') is not null)::text, v #>> '{order,stage}') from t where k = 'rider'),
  'true|true|ready',
  'a test key gives its test ride a test rider');

select lives_ok(
  $$select public.rpc_order_stage_api_test('nexg_test_riders-key-0000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'picked_up')$$,
  'then picked up');
select lives_ok(
  $$select public.rpc_order_stage_api_test('nexg_test_riders-key-0000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'arriving')$$,
  'arriving');
select lives_ok(
  $$select public.rpc_order_stage_api_test('nexg_test_riders-key-0000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_ride'), 'delivered')$$,
  'and delivered');

select is(
  (select string_agg(ev.type || '>' || (ev.body #>> '{data,booking,stage}'), ',' order by ev.created_at)
   from public.api_webhook_event ev
   where ev.environment = 'test'
     and ev.booking_id = (select (v ->> 'order_id')::uuid from t where k = 'test_ride')),
  'booking.created>placed,booking.status_changed>preparing,booking.stage_changed>ready,'
  || 'booking.rider_assigned>ready,booking.status_changed>picked_up,booking.stage_changed>arriving,'
  || 'booking.status_changed>delivered',
  'the sandbox sends the same events a live ride does, to the test endpoint');

select throws_ok(
  $$select public.rpc_order_rider_api_test('nexg_test_riders-key-0000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_ride'))$$,
  '22023', 'This test booking is completed, so it needs no rider.',
  'a completed booking gets no rider');

select throws_ok(
  $$select public.rpc_order_rider_api_test('nexg_test_riders-key-0000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_venue'))$$,
  '22023', 'Only a ride or a courier has a rider.',
  'a venue booking has no rider');

select throws_ok(
  $$select public.rpc_order_rider_api_test('riders-live-key-00000000000000000000',
      (select (v ->> 'order_id')::uuid from t where k = 'test_venue'))$$,
  '42501', 'Only a test key moves bookings. Real bookings move as the merchant and NexG work on them.',
  'a live key cannot assign a test rider');

-- ═══════════════════════════════════════════════════════════════ the console

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', 'cd100000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'riders.owner@test.local', '', now(), now(), now(),
  '', '', '', '', '', '', '', '');
insert into public.merchant_user (merchant_id, user_id, role)
values ((select id from t_m), 'cd100000-0000-4000-8000-000000000001', 'owner');
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('cd200000-0000-4000-8000-000000000001', 'cd100000-0000-4000-8000-000000000001', now(), now());
insert into public.merchant_application_session_activity (session_id, user_id, last_activity_at)
values ('cd200000-0000-4000-8000-000000000001', 'cd100000-0000-4000-8000-000000000001', now());

insert into t values ('console_ride', public.rpc_order_place_api_test(
  'nexg_test_riders-key-0000000000000000', 'riders-idem-0000000000000000004',
  '{"service":"courier","quantity":1,"pickup_label":"Shop","pickup_lat":-1.29,
    "pickup_lng":36.82,"dropoff_label":"Home","dropoff_lat":-1.27,"dropoff_lng":36.80}'::jsonb));

select set_config('request.jwt.claims',
  '{"sub":"cd100000-0000-4000-8000-000000000001","role":"authenticated",'
  || '"session_id":"cd200000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;

select is(
  public.rpc_api_test_order_rider((select (v ->> 'order_id')::uuid from t where k = 'console_ride'))
    #>> '{order,reference}' like 'TEST-%',
  true,
  'the owner assigns a test rider from the console');

select is(
  public.rpc_api_test_order_stage((select (v ->> 'order_id')::uuid from t where k = 'console_ride'), 'picked_up')
    #>> '{order,stage}',
  'picked_up',
  'and moves the booking by stage');

select is(
  (select concat_ws('|', x ->> 'kind', ((x ->> 'rider_assigned_at') is not null)::text, x ->> 'stage')
   from jsonb_array_elements(public.rpc_api_test_orders()) x
   where x ->> 'order_id' = (select v ->> 'order_id' from t where k = 'console_ride')),
  'courier|true|picked_up',
  'the console''s list says each booking''s kind and whether it has a test rider');

reset role;

-- ═══════════════════════════════════════════════════════════════ who may call what

select ok(
  not has_function_privilege('anon', 'public.rpc_api_test_order_stage(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_api_test_order_rider(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_order_stage_api_test(text, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.rpc_order_stage_api_test(text, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.rpc_order_rider_api_test(text, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_api_sandbox_key(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_api_webhook_rider_event()', 'execute')
  and has_function_privilege('service_role', 'public.rpc_order_rider_api_test(text, uuid)', 'execute'),
  'the API''s functions are the server''s alone, and nothing here is open to the public');

select is(
  (select count(*) from public.fn_wiring_check() w
   where w.finding ~ '(test_order|_api_test|rider_event|sandbox_key|webhook_order_event)'),
  0::bigint,
  'the wiring check finds nothing in the new or changed functions');

select * from finish();
rollback;
