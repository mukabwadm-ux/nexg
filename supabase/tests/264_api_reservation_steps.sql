-- Reservations through the API, part 4 (20270344000200): a test key's
-- remaining steps on test reservations, the driver notice to a NexG customer
-- from the booking engine's events, and a sample reservation event from the
-- developer console to a test endpoint only.

begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

create temp table t_m on commit drop as
  select m.id from public.merchant m where m.deleted_at is null order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;
grant select on t_m to authenticated;
grant select, insert on t to authenticated;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
select id, encode(sha256(convert_to('nexg_test_steps-key-0000000000000', 'UTF8')), 'hex'),
       'nexg_test_stp1', '{public_read,merchant_read,merchant_write}', 600, 'test'
from t_m;
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select id, encode(sha256(convert_to('steps-live-key-00000000000000000', 'UTF8')), 'hex'),
       'stplive1', '{public_read,merchant_read,merchant_write}', 600
from t_m;

create function pg_temp.k() returns text language sql as $$ select 'nexg_test_steps-key-0000000000000' $$;
create function pg_temp.id(p_name text) returns uuid language sql as $$
  select (v -> 'reservation' ->> 'id')::uuid from t where k = p_name
$$;
create function pg_temp.step(p_name text, p_step text, p_input jsonb) returns jsonb language sql as $$
  select public.rpc_reservation_step_api_test(pg_temp.k(), pg_temp.id(p_name), p_step, p_input)
$$;
create function pg_temp.events() returns bigint language sql as $$
  select count(*) from public.api_webhook_event e
  where e.merchant_id = (select id from t_m) and e.environment = 'test'
$$;

-- ═══════════════════════════════════════════════════════════════ who may call

select ok(not has_function_privilege('authenticated',
  'public.rpc_reservation_step_api_test(text, uuid, text, jsonb)', 'execute'),
  'a signed-in user cannot take sandbox steps');
select ok(has_function_privilege('service_role',
  'public.rpc_reservation_step_api_test(text, uuid, text, jsonb)', 'execute'),
  'the API (service role) can');
select ok(not has_function_privilege('anon', 'public.rpc_api_webhook_sample(uuid, text)', 'execute'),
  'anon cannot send sample events');
select ok(not has_function_privilege('authenticated',
  'public.fn_api_reservation_driver_notice(uuid, text, integer, jsonb, jsonb)', 'execute'),
  'nobody signed in can send a driver notice');

-- ═══════════════════════════════════════════════════════════════ the steps

-- A paid transfer, confirmed: version 2.
insert into t values ('trip', public.rpc_reservation_create_api_test(pg_temp.k(),
  '{"total_cents": 450000, "starts_at": "2030-01-05T06:30:00+03:00", "ends_at": "2030-01-05T07:30:00+03:00"}'));
insert into t values ('trip2', public.rpc_reservation_move_api_test(pg_temp.k(), pg_temp.id('trip'), 'confirmed'));

select throws_ok($$ select pg_temp.step('trip', 'reschedule',
    '{"expected_version": 1, "starts_at": "2030-01-06T06:30:00+03:00"}') $$,
  'P0005', null, 'a stale version is refused');
select throws_ok($$ select pg_temp.step('trip', 'reschedule',
    '{"expected_version": 2, "starts_at": "2020-01-06T06:30:00+03:00"}') $$,
  '22023', 'Move it to a time that has not passed.', 'a time that has passed is refused');
insert into t values ('moved', pg_temp.step('trip', 'reschedule',
  '{"expected_version": 2, "starts_at": "2030-01-06T08:00:00+03:00"}'));
select ok((v -> 'reservation' ->> 'starts_at')::timestamptz = '2030-01-06T08:00:00+03:00'
          and (v -> 'reservation' ->> 'ends_at')::timestamptz = '2030-01-06T09:00:00+03:00'
          and (v -> 'reservation' ->> 'version')::int = 3,
  'a reschedule moves the start and keeps the length') from t where k = 'moved';

select throws_ok($$ select pg_temp.step('trip', 'location', '{"latitude": -1.3192, "longitude": 36.9278}') $$,
  'P0005', 'Set a driver on this reservation first.', 'no position without a driver');
insert into t values ('driver', public.rpc_reservation_act_api_test(pg_temp.k(), pg_temp.id('trip'), 'driver',
  '{"expected_version": 3, "driver": {"first_name": "Juma", "vehicle": "White Toyota Noah", "plate": "KDA 123A"}}'));

insert into t values ('events_before_location', to_jsonb(pg_temp.events()));
insert into t values ('here', pg_temp.step('trip', 'location', '{"latitude": -1.3192, "longitude": 36.9278}'));
select is((v -> 'reservation' -> 'driver' -> 'location' ->> 'latitude')::numeric, -1.3192,
  'the driver''s position shows on the reservation') from t where k = 'here';
select is((v -> 'reservation' ->> 'version')::int, 4, 'a position changes no version') from t where k = 'here';
select is(pg_temp.events(), (select (v #>> '{}')::bigint from t where k = 'events_before_location'),
  'and sends no event');
insert into t values ('late', pg_temp.step('trip', 'location',
  jsonb_build_object('latitude', -1.2, 'longitude', 36.8, 'at', now() - interval '10 minutes')));
select is((v -> 'reservation' -> 'driver' -> 'location' ->> 'latitude')::numeric, -1.3192,
  'an older position that arrives late is ignored') from t where k = 'late';
select throws_ok(format($$ select pg_temp.step('trip', 'location', %L::jsonb) $$,
    jsonb_build_object('latitude', -1.2, 'longitude', 36.8, 'at', now() - interval '40 minutes')),
  '22023', null, 'a position over 30 minutes old is refused');
select throws_ok($$ select pg_temp.step('trip', 'location', '{"latitude": 91, "longitude": 36.9}') $$,
  '22023', null, 'and one off the map');

insert into t values ('started', pg_temp.step('trip', 'start', '{"expected_version": 4}'));
select is(v -> 'reservation' ->> 'status', 'in_progress', 'start puts it under way') from t where k = 'started';
select throws_ok($$ select pg_temp.step('trip', 'complete', '{"expected_version": 5}') $$,
  '22023', null, 'completing needs a note');
insert into t values ('done', pg_temp.step('trip', 'complete',
  '{"expected_version": 5, "note": "Dropped at the hotel at 10:42"}'));
select ok(v -> 'reservation' ->> 'status' = 'completed'
          and v -> 'reservation' -> 'driver' -> 'location' = 'null'::jsonb
          and v -> 'reservation' -> 'driver' ->> 'first_name' = 'Juma',
  'complete finishes it and drops the position, keeping the driver') from t where k = 'done';
select throws_ok($$ select pg_temp.step('trip', 'cancel', '{"expected_version": 6, "reason": "Late"}') $$,
  'P0005', null, 'a finished booking cannot be cancelled');

insert into t values ('paid', public.rpc_reservation_create_api_test(pg_temp.k(), '{"total_cents": 300000}'));
insert into t values ('paid2', public.rpc_reservation_move_api_test(pg_temp.k(), pg_temp.id('paid'), 'confirmed'));
select throws_ok($$ select pg_temp.step('paid', 'cancel', '{"expected_version": 2}') $$,
  '22023', null, 'cancelling needs a reason for the customer');
insert into t values ('paid_cancelled', pg_temp.step('paid', 'cancel',
  '{"expected_version": 2, "reason": "The vehicle broke down."}'));
select ok(v -> 'reservation' ->> 'status' = 'cancelled'
          and v -> 'reservation' ->> 'refund_state' = 'review_required',
  'a paid booking cancelled flags its refund for review') from t where k = 'paid_cancelled';
insert into t values ('free', public.rpc_reservation_create_api_test(pg_temp.k(), '{}'::jsonb));
insert into t values ('free_cancelled', pg_temp.step('free', 'cancel',
  '{"expected_version": 1, "reason": "Asked to cancel."}'));
select ok(v -> 'reservation' -> 'refund_state' = 'null'::jsonb,
  'an unpaid one has no refund to review') from t where k = 'free_cancelled';

-- A waiting one would accept: only the missing version stops it.
insert into t values ('fresh', public.rpc_reservation_create_api_test(pg_temp.k(), '{}'::jsonb));
select throws_ok($$ select public.rpc_reservation_act_api_test(pg_temp.k(), pg_temp.id('fresh'), 'accept', '{}'::jsonb) $$,
  'P0005', null, 'an action without expected_version is refused');
select throws_ok($$ select pg_temp.step('free', 'teleport', '{}'::jsonb) $$,
  '22023', null, 'an unknown step is refused');
select throws_ok($$ select pg_temp.step('paid', 'start', '{"expected_version": 3, "phone": "+254700000000"}') $$,
  '22023', null, 'a field the step does not take is refused');
select throws_ok($$ select public.rpc_reservation_step_api_test('steps-live-key-00000000000000000',
    pg_temp.id('free'), 'start', '{"expected_version": 2}') $$,
  '42501', null, 'a live key never reaches the sandbox');

-- ═══════════════════════════════════════════════════════════════ the driver notice

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', 'c9400000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'driver.customer@test.local', '', now(), now(), now(),
  '', '', '', '', '', '', '', '');
insert into public.customer_engine_booking (user_id, merchant_id, engine_booking_id, customer_token)
select 'c9400000-0000-4000-8000-000000000001', id, 'res_drv_1', 'customer-token-0123456789abcdef' from t_m;

create function pg_temp.driver_event(p_key text, p_id text, p_status text, p_version int) returns jsonb
language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'event_key', p_key,
    'event_type', 'booking.driver_assigned',
    'business_id', (select id from t_m),
    'record_id', p_id,
    'occurred_at', now(),
    'reservation', jsonb_build_object(
      'id', p_id, 'kind', 'reservation', 'status', p_status, 'stage', p_status,
      'offering', jsonb_build_object('id', 'off_1', 'name', 'Airport transfer', 'model', 'TRANSFER'),
      'starts_at', '2030-01-05T06:30:00+03:00', 'ends_at', '2030-01-05T07:30:00+03:00',
      'quantity', 1, 'payment_state', 'paid', 'version', p_version, 'updated_at', now()),
    'driver', jsonb_build_object('first_name', 'Juma', 'vehicle', 'White Toyota Noah',
                                 'plate', 'KDA 123A')))
$$;
create function pg_temp.bells() returns bigint language sql as $$
  select count(*) from public.user_notification n
  where n.user_id = 'c9400000-0000-4000-8000-000000000001' and n.kind = 'booking.driver_assigned'
$$;

select lives_ok($$ select public.rpc_api_reservation_events_ingest(pg_temp.driver_event('drv-evt-1', 'res_drv_1', 'confirmed', 4)) $$,
  'the engine reports a driver set on a customer''s booking');
select ok(exists (select 1 from public.user_notification n
                  where n.user_id = 'c9400000-0000-4000-8000-000000000001'
                    and n.kind = 'booking.driver_assigned'
                    and n.title = 'Your driver is Juma'
                    and n.body like 'Juma is your driver: White Toyota Noah, plate KDA 123A, for Airport transfer on % at 06:30.%'),
  'the customer is told who is coming, in what and when');
select ok(exists (select 1 from public.notification_log l
                  where l.template = 'bell_booking.driver_assigned'
                    and l.recipient = 'driver.customer@test.local'),
  'by email too');
select lives_ok($$ select public.rpc_api_reservation_events_ingest(pg_temp.driver_event('drv-evt-1', 'res_drv_1', 'confirmed', 4)) $$,
  'the same event sent again');
select is(pg_temp.bells(), 1::bigint, 'tells the customer only once');
select lives_ok($$ select public.rpc_api_reservation_events_ingest(pg_temp.driver_event('drv-evt-2', 'res_drv_1', 'cancelled', 5)) $$,
  'a driver event for a cancelled booking');
select is(pg_temp.bells(), 1::bigint, 'tells nobody');
select is(public.fn_api_reservation_driver_notice((select id from t_m), 'res_by_phone', 1,
    '{}'::jsonb, '{"first_name": "Juma", "vehicle": "Van"}'::jsonb), 0,
  'a booking the business entered itself has no NexG customer to tell');

-- ═══════════════════════════════════════════════════════════════ a sample from the console

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', 'c9400000-0000-4000-8000-000000000002',
  'authenticated', 'authenticated', 'steps.owner@test.local', '', now(), now(), now(),
  '', '', '', '', '', '', '', '');
insert into public.merchant_user (merchant_id, user_id, role)
select id, 'c9400000-0000-4000-8000-000000000002', 'owner' from t_m;
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('c9500000-0000-4000-8000-000000000001', 'c9400000-0000-4000-8000-000000000002', now(), now());
insert into public.merchant_application_session_activity (session_id, user_id, last_activity_at)
values ('c9500000-0000-4000-8000-000000000001', 'c9400000-0000-4000-8000-000000000002', now());

insert into public.api_webhook_endpoint (merchant_id, environment, url, secret_ref, secret_prefix)
select id, 'live', 'https://hooks.partner.co.ke/steps/live', 'api_webhook:steps-live', 'whsec_stp001' from t_m;
insert into public.api_webhook_endpoint (merchant_id, environment, url, secret_ref, secret_prefix)
select id, 'test', 'https://hooks.partner.co.ke/steps/test', 'api_webhook:steps-test', 'whsec_stp002' from t_m;
insert into public.api_webhook_endpoint (merchant_id, environment, url, secret_ref, secret_prefix)
select id, 'test', 'https://hooks.partner.co.ke/steps/other', 'api_webhook:steps-other', 'whsec_stp003' from t_m;
insert into t
select 'endpoint:' || split_part(e.url, '/', 5), to_jsonb(e.id)
from public.api_webhook_endpoint e
where e.url like 'https://hooks.partner.co.ke/steps/%';
create function pg_temp.endpoint(p_name text) returns uuid language sql as $$
  select (v #>> '{}')::uuid from t where k = 'endpoint:' || p_name
$$;

select set_config('request.jwt.claims',
  '{"sub":"c9400000-0000-4000-8000-000000000002","role":"authenticated",'
  || '"session_id":"c9500000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;
select throws_ok($$ select public.rpc_api_webhook_sample(pg_temp.endpoint('live'), 'reservation.created') $$,
  '22023', null, 'a live endpoint never gets a sample booking');
select throws_ok($$ select public.rpc_api_webhook_sample(pg_temp.endpoint('test'), 'booking.created') $$,
  '22023', null, 'only reservation events have samples');
insert into t values ('sample', to_jsonb(public.rpc_api_webhook_sample(
  pg_temp.endpoint('test'), 'reservation.status_changed')));
select throws_ok($$ select public.rpc_api_webhook_sample(pg_temp.endpoint('test'), 'reservation.created') $$,
  '22023', 'A test event was just sent. Wait a few seconds.', 'samples cannot be sent back to back');
reset role;

select ok(exists (select 1 from public.api_webhook_event e
                  where e.id = (select (v #>> '{}')::uuid from t where k = 'sample')
                    and e.environment = 'test' and e.type = 'reservation.status_changed'
                    and e.body -> 'data' ->> 'previous_status' = 'requested'
                    and e.body -> 'data' -> 'reservation' ->> 'status' = 'confirmed'
                    and not (e.body -> 'data' -> 'reservation' ? 'guest_name')),
  'the sample is a real-shaped event about a confirmed test reservation');
select is((select count(*) from public.api_webhook_delivery d
           where d.event_id = (select (v #>> '{}')::uuid from t where k = 'sample')),
  1::bigint, 'sent to the chosen endpoint only');

select * from finish();
rollback;
