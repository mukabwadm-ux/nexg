-- Reservations in API events (20270338000100): the booking engine's changes,
-- recorded by rpc_api_reservation_events_ingest, become reservation.* events
-- for the merchant's live endpoints. A resend, an older version or a repeat
-- sends nothing; history older than a day is recorded without an event; events
-- NexG cannot use are still accepted so the engine stops sending them.

begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create temp table t_m on commit drop as
  select m.id from public.merchant m
  where m.deleted_at is null
  order by m.id limit 1;
create temp table t_quiet on commit drop as
  select m.id from public.merchant m
  where m.deleted_at is null and m.id <> (select id from t_m)
    and not exists (select 1 from public.api_webhook_endpoint e
                    where e.merchant_id = m.id and e.environment = 'live' and e.enabled)
  order by m.id limit 1;

insert into public.api_webhook_endpoint (merchant_id, environment, url, secret_ref, secret_prefix)
select id, 'live', 'https://hooks.partner.co.ke/reservations', 'api_webhook:reservation-test',
       'whsec_rtest1'
from t_m;

-- A summary as the engine sends it (apps/booking-engine/src/api-reservations.ts).
create function pg_temp.summary(p_id text, p_status text, p_stage text, p_version int)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'kind', 'reservation', 'status', p_status, 'stage', p_stage,
    'offering', jsonb_build_object('id', 'off-1', 'name', 'JKIA to Westlands', 'model', 'TRANSFER'),
    'starts_at', '2030-01-02T06:00:00.000Z', 'ends_at', '2030-01-02T07:00:00.000Z',
    'quantity', 2, 'payment_state', 'awaiting_payment', 'version', p_version,
    'updated_at', '2030-01-01T00:00:00.000Z');
$$;

create function pg_temp.event(p_key text, p_merchant text, p_reservation jsonb,
                              p_at timestamptz default now(), p_type text default 'booking.created')
returns jsonb language sql as $$
  select jsonb_build_object(
    'event_key', p_key, 'event_type', p_type, 'business_id', p_merchant,
    'record_id', p_reservation ->> 'id', 'occurred_at', p_at, 'reservation', p_reservation);
$$;

create function pg_temp.ingest(p_events jsonb) returns jsonb language sql as $$
  select public.rpc_api_reservation_events_ingest(p_events);
$$;

create function pg_temp.events(p_type text) returns bigint language sql as $$
  select count(*) from public.api_webhook_event e
  where e.merchant_id = (select id from t_m) and e.type = p_type;
$$;

-- ═══════════════════════════════════════════════════════════════ who may call it

select ok(not has_function_privilege('anon', 'public.rpc_api_reservation_events_ingest(jsonb)', 'execute'),
  'anon cannot record engine events');
select ok(not has_function_privilege('authenticated', 'public.rpc_api_reservation_events_ingest(jsonb)', 'execute'),
  'a signed-in user cannot record engine events');
select ok(has_function_privilege('service_role', 'public.rpc_api_reservation_events_ingest(jsonb)', 'execute'),
  'the API (service role) can');
select ok((select relrowsecurity from pg_class where oid = 'public.api_reservation_state'::regclass),
  'reservation states have row-level security');
select ok((select relrowsecurity from pg_class where oid = 'public.api_booking_engine_event'::regclass),
  'engine events have row-level security');
select ok(not has_table_privilege('authenticated', 'public.api_reservation_state', 'select'),
  'a signed-in user cannot read reservation states');

-- ═══════════════════════════════════════════════════════════════ the event types

select lives_ok(
  $$ insert into public.api_webhook_event (merchant_id, environment, type, body)
     select id, 'live', 'reservation.updated', '{}'::jsonb from t_m $$,
  'reservation.updated is an event type');
delete from public.api_webhook_event where merchant_id = (select id from t_m);
select throws_ok(
  $$ insert into public.api_webhook_event (merchant_id, environment, type, body)
     select id, 'live', 'reservation.moved', '{}'::jsonb from t_m $$,
  '23514', null, 'an unknown event type is refused');

-- ═══════════════════════════════════════════════════════════════ a new reservation

select is(
  pg_temp.ingest(jsonb_build_array(pg_temp.event('ev-1', (select id::text from t_m),
    pg_temp.summary('res-1', 'requested', 'held', 1)))),
  '{"accepted": ["ev-1"]}'::jsonb,
  'the engine is told the event was accepted');
select is(pg_temp.events('reservation.created'), 1::bigint, 'reservation.created is queued');
select is(
  (select body -> 'data' -> 'reservation' ->> 'id' from public.api_webhook_event
   where merchant_id = (select id from t_m) and type = 'reservation.created'),
  'res-1', 'the event carries the reservation''s summary');
select is(
  (select count(*) from public.api_webhook_delivery d
   join public.api_webhook_event e on e.id = d.event_id
   where e.merchant_id = (select id from t_m) and e.type = 'reservation.created' and d.state = 'queued'),
  1::bigint, 'one delivery is queued for the merchant''s live endpoint');
select is(
  (select status || '/' || stage || '/' || version from public.api_reservation_state
   where merchant_id = (select id from t_m) and reservation_id = 'res-1'),
  'requested/held/1', 'the reservation''s last status is kept');
select is((select outcome from public.api_booking_engine_event where event_key = 'ev-1'), 'queued',
  'the engine event is remembered as queued');

select is(
  pg_temp.ingest(jsonb_build_array(pg_temp.event('ev-1', (select id::text from t_m),
    pg_temp.summary('res-1', 'requested', 'held', 1)))),
  '{"accepted": ["ev-1"]}'::jsonb,
  'a resend is accepted again');
select is(pg_temp.events('reservation.created'), 1::bigint, 'and sends nothing new');

-- ═══════════════════════════════════════════════════════════════ changes

select pg_temp.ingest(jsonb_build_array(pg_temp.event('ev-2', (select id::text from t_m),
  pg_temp.summary('res-1', 'confirmed', 'confirmed', 2), now(), 'booking.paid')));
select is(pg_temp.events('reservation.status_changed'), 1::bigint,
  'a new status sends reservation.status_changed');
select is(
  (select body -> 'data' ->> 'previous_status' from public.api_webhook_event
   where merchant_id = (select id from t_m) and type = 'reservation.status_changed'),
  'requested', 'with the status it changed from');

select pg_temp.ingest(jsonb_build_array(pg_temp.event('ev-3', (select id::text from t_m),
  jsonb_set(pg_temp.summary('res-1', 'confirmed', 'confirmed', 3), '{starts_at}',
            '"2030-01-02T08:00:00.000Z"'), now(), 'booking.reschedule')));
select is(pg_temp.events('reservation.updated'), 1::bigint,
  'another change in the same status sends reservation.updated');

select pg_temp.ingest(jsonb_build_array(pg_temp.event('ev-4', (select id::text from t_m),
  pg_temp.summary('res-1', 'cancelled', 'cancelled', 2), now(), 'booking.cancel')));
select is((select outcome from public.api_booking_engine_event where event_key = 'ev-4'), 'stale',
  'an older version is stale');
select is(pg_temp.events('reservation.status_changed'), 1::bigint, 'and sends nothing');
select is(
  (select status from public.api_reservation_state
   where merchant_id = (select id from t_m) and reservation_id = 'res-1'),
  'confirmed', 'and does not move the reservation back');

-- ═══════════════════════════════════════════════════════════════ history and strangers

select pg_temp.ingest(jsonb_build_array(pg_temp.event('ev-5', (select id::text from t_m),
  pg_temp.summary('res-old', 'completed', 'completed', 4), now() - interval '3 days')));
select is((select outcome from public.api_booking_engine_event where event_key = 'ev-5'), 'recorded',
  'a change older than a day is recorded');
select is(pg_temp.events('reservation.created'), 1::bigint, 'without an event');
select is(
  (select status from public.api_reservation_state
   where merchant_id = (select id from t_m) and reservation_id = 'res-old'),
  'completed', 'but its status is kept');

select pg_temp.ingest(jsonb_build_array(pg_temp.event('ev-6', (select id::text from t_quiet),
  pg_temp.summary('res-quiet', 'requested', 'held', 1))));
select is((select outcome from public.api_booking_engine_event where event_key = 'ev-6'), 'recorded',
  'a merchant with no live endpoint gets no event');

select is(
  pg_temp.ingest(jsonb_build_array(
    pg_temp.event('ev-7', gen_random_uuid()::text, pg_temp.summary('res-x', 'requested', 'held', 1)),
    pg_temp.event('ev-8', 'not-a-merchant', pg_temp.summary('res-y', 'requested', 'held', 1)),
    pg_temp.event('ev-9', (select id::text from t_m), null, now(), 'booking.resource.created'),
    pg_temp.event('ev-10', (select id::text from t_m), pg_temp.summary('res-z', 'lost', 'held', 1)),
    pg_temp.event('bad key!', (select id::text from t_m), pg_temp.summary('res-w', 'requested', 'held', 1)))),
  '{"accepted": ["ev-7", "ev-8", "ev-9", "ev-10"]}'::jsonb,
  'events NexG cannot use are accepted (except one without a usable key)');
select is(
  (select string_agg(outcome, ',' order by event_key) from public.api_booking_engine_event
   where event_key in ('ev-7', 'ev-8', 'ev-9', 'ev-10')),
  'malformed,unknown_merchant,unknown_merchant,not_a_reservation',
  'and remembered with why');
select is(
  (select count(*) from public.api_reservation_state
   where reservation_id in ('res-x', 'res-y', 'res-z', 'res-w')),
  0::bigint, 'none of them becomes a reservation state');

-- ═══════════════════════════════════════════════════════════════ limits and upkeep

select throws_ok($$ select pg_temp.ingest('[]'::jsonb) $$, '22023', null,
  'an empty batch is refused');
select throws_ok(
  $$ select pg_temp.ingest((select jsonb_agg(pg_temp.event('k' || n, (select id::text from t_m), null))
                            from generate_series(1, 101) n)) $$,
  '22023', null, 'more than 100 events is refused');

insert into public.api_booking_engine_event (event_key, event_type, outcome, received_at)
values ('ev-ancient', 'booking.created', 'recorded', now() - interval '31 days');
select pg_temp.ingest(jsonb_build_array(pg_temp.event('ev-11', (select id::text from t_m), null)));
select ok(not exists (select 1 from public.api_booking_engine_event where event_key = 'ev-ancient'),
  'engine events older than 30 days are forgotten');

select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
