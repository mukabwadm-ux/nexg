-- The sandbox cinema (20270317000200): a ticketing system of its own that
-- answers like a real one, and the whole path from its programme to a
-- confirmed booking recorded on NexG's side.
begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c1510000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'filmgoer151@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, subcategory, contact_name,
                             contact_phone, contact_email, city_id, status, explore_visible,
                             accepting_orders, went_live_at, accepts_test_payments)
select 'c1510000-0000-4000-8000-00000000000a', '[Legal 151] Ltd', '[Test Cinema 151]', 'experiences', 'cinemas',
       '[Contact]', '+254700015100', 'cinema151@example.test', c.id, 'live', true, true,
       now() - interval '30 days', true
from public.city c where c.slug = 'nairobi';

insert into public.connector_connection (id, adapter_id, merchant_id, environment, state)
values ('c1510000-0000-4000-8000-0000000000c1', 'sandbox-cinema', 'c1510000-0000-4000-8000-00000000000a',
        'sandbox', 'operational');

create function pg_temp.sbx(p_op text, p_args jsonb default '{}'::jsonb) returns jsonb language sql as $f$
  select public.sandbox_cinema('c1510000-0000-4000-8000-0000000000c1', p_op, p_args)
$f$;

create function pg_temp.taken(p_ref text) returns jsonb language sql as $f$
  select pg_temp.sbx('seat_map', jsonb_build_object('showingRef', p_ref)) -> 'taken'
$f$;

/* The first free standard seats of a showing, rows B to E. */
create function pg_temp.free(p_ref text, p_n int, p_skip int default 0) returns jsonb language sql as $f$
  with taken as (select pg_temp.taken(p_ref) as t)
  select jsonb_agg(code order by r, n) from (
    select r, n, r || n as code from taken, unnest(array['B', 'C', 'D', 'E']) r, generate_series(2, 9) n
     where not (taken.t ? (r || n))
     order by r, n offset p_skip limit p_n) x
$f$;

-- ─────────────────────────────────────────────────────── who may call it

select is(public.sandbox_cinema(gen_random_uuid(), 'programme', '{}') ->> 'error', 'unknown_tenant',
  'It answers only for a connection made with the sandbox adapter.');
select ok(not has_function_privilege('anon', 'public.sandbox_cinema(uuid, text, jsonb)', 'execute'),
  'Nobody signed out can call it.');
select ok(not has_function_privilege('authenticated', 'public.sandbox_cinema(uuid, text, jsonb)', 'execute'),
  'No customer can call it: only NexG''s server, with the service role.');

-- ─────────────────────────────────────────────────────── its programme

select set_config('t.programme', pg_temp.sbx('programme', jsonb_build_object('from', now(), 'days', 7))::text, true);
select is(jsonb_array_length(current_setting('t.programme')::jsonb -> 'films'), 3, 'Three films.');
select is(jsonb_array_length(current_setting('t.programme')::jsonb -> 'screens'), 2, 'Two screens.');
select ok(jsonb_array_length(current_setting('t.programme')::jsonb -> 'showings') between 30 and 42,
  'Three showings a day on each screen for the week, from now.');
select is(pg_temp.sbx('programme', jsonb_build_object('from', now(), 'days', 7)) -> 'showings',
  current_setting('t.programme')::jsonb -> 'showings', 'The same programme every time it is asked.');

select set_config('t.applied',
  public.cinema_sync_apply('c1510000-0000-4000-8000-0000000000c1', current_setting('t.programme')::jsonb)::text, true);
select is((current_setting('t.applied')::jsonb ->> 'showings')::int,
  jsonb_array_length(current_setting('t.programme')::jsonb -> 'showings'),
  'NexG saves every showing the sandbox gives it.');

-- A showing at least a day away, to hold seats on.
select set_config('t.ref', (
  select s ->> 'ref' from jsonb_array_elements(current_setting('t.programme')::jsonb -> 'showings') s
   where (s ->> 'startsAt')::timestamptz > now() + interval '1 day'
   order by (s ->> 'startsAt')::timestamptz limit 1), true);
select set_config('t.ref2', (
  select s ->> 'ref' from jsonb_array_elements(current_setting('t.programme')::jsonb -> 'showings') s
   where (s ->> 'startsAt')::timestamptz > now() + interval '2 days'
   order by (s ->> 'startsAt')::timestamptz limit 1), true);

-- ─────────────────────────────────────────────────────── seats

select is(jsonb_typeof(pg_temp.taken(current_setting('t.ref'))), 'array', 'Its seat map lists the seats taken.');
select ok(jsonb_array_length(pg_temp.taken(current_setting('t.ref'))) > 0, 'Its box office has sold some already.');
select is(pg_temp.taken(current_setting('t.ref')), pg_temp.taken(current_setting('t.ref')),
  'The same seats every time it is asked.');

select set_config('t.seats', pg_temp.free(current_setting('t.ref'), 2)::text, true);
select set_config('t.request', gen_random_uuid()::text, true);
select set_config('t.hold', pg_temp.sbx('hold', jsonb_build_object('showingRef', current_setting('t.ref'),
  'seats', current_setting('t.seats')::jsonb, 'requestId', current_setting('t.request'), 'ttlSeconds', 420))::text, true);

select is((current_setting('t.hold')::jsonb ->> 'totalMinor')::bigint, 130000::bigint,
  'Two standard seats hold for KES 1,300.');
select is(pg_temp.sbx('hold', jsonb_build_object('showingRef', current_setting('t.ref'),
  'seats', current_setting('t.seats')::jsonb, 'requestId', current_setting('t.request'))) ->> 'holdRef',
  current_setting('t.hold')::jsonb ->> 'holdRef', 'Asking again with the same request gives the same hold.');
select is(pg_temp.sbx('hold', jsonb_build_object('showingRef', current_setting('t.ref'),
  'seats', jsonb_build_array(current_setting('t.seats')::jsonb ->> 0), 'requestId', gen_random_uuid())),
  jsonb_build_object('ok', false, 'error', 'seat_taken', 'seats', jsonb_build_array(current_setting('t.seats')::jsonb ->> 0)),
  'Someone else asking for a held seat is told which seat is taken.');
select is(pg_temp.sbx('hold', jsonb_build_object('showingRef', current_setting('t.ref'),
  'seats', '["Z1"]'::jsonb, 'requestId', gen_random_uuid())) ->> 'error', 'invalid_seats',
  'A seat the screen does not have is refused.');
select ok(pg_temp.taken(current_setting('t.ref')) @> current_setting('t.seats')::jsonb,
  'Held seats show as taken.');
select is((pg_temp.sbx('extend', jsonb_build_object('holdRef', current_setting('t.hold')::jsonb ->> 'holdRef',
  'until', now() + interval '1 hour')) ->> 'expiresAt')::timestamptz,
  (select created_at + interval '20 minutes' from cinema_sandbox.hold
    where ref = current_setting('t.hold')::jsonb ->> 'holdRef'),
  'A hold extends to 20 minutes from when it was made, no further.');

-- ─────────────────────────────────────────────────────── the whole path, recorded by NexG

select set_config('t.showing', (select id::text from cinema.showing
  where connection_id = 'c1510000-0000-4000-8000-0000000000c1' and source_ref = current_setting('t.ref')), true);
select set_config('t.nexg', public.cinema_record_hold(current_setting('t.showing')::uuid,
  'c1510000-0000-4000-8000-000000000001', current_setting('t.request')::uuid,
  array(select jsonb_array_elements_text(current_setting('t.seats')::jsonb)),
  current_setting('t.hold')::jsonb -> 'lines', 130000, current_setting('t.hold')::jsonb ->> 'holdRef',
  now() + interval '20 minutes')::text, true);
select is(current_setting('t.nexg')::jsonb ->> 'state', 'held', 'NexG records the sandbox''s hold.');
select is(public.cinema_record_paying((current_setting('t.nexg')::jsonb ->> 'holdId')::uuid,
  now() + interval '20 minutes') ->> 'state', 'paying', 'Payment starts.');
select is(public.cinema_payment_settled((current_setting('t.nexg')::jsonb ->> 'holdId')::uuid, 'T151-PAY') ->> 'state',
  'confirming', 'The payment arrives, and confirming is queued.');

select set_config('t.booking', pg_temp.sbx('confirm', jsonb_build_object(
  'holdRef', current_setting('t.hold')::jsonb ->> 'holdRef',
  'requestId', 'confirm:' || current_setting('t.request'), 'paymentRef', 'T151-PAY'))::text, true);
select is(jsonb_array_length(current_setting('t.booking')::jsonb -> 'tickets'), 2, 'The sandbox books two tickets.');
select is(pg_temp.sbx('confirm', jsonb_build_object('holdRef', current_setting('t.hold')::jsonb ->> 'holdRef',
  'requestId', 'confirm:' || current_setting('t.request'))) ->> 'bookingRef',
  current_setting('t.booking')::jsonb ->> 'bookingRef', 'Confirming again with the same request books nothing new.');
select is(pg_temp.sbx('lookup', jsonb_build_object('requestId', 'confirm:' || current_setting('t.request'))) ->> 'bookingRef',
  current_setting('t.booking')::jsonb ->> 'bookingRef', 'After a timeout, the booking is found by its request.');
select is(public.cinema_record_confirm((current_setting('t.nexg')::jsonb ->> 'holdId')::uuid,
  current_setting('t.booking')::jsonb ->> 'bookingRef', current_setting('t.booking')::jsonb -> 'tickets') ->> 'state',
  'confirmed', 'NexG records the confirmed booking with its tickets.');

-- ─────────────────────────────────────────────────────── cancelling

select is(pg_temp.sbx('cancel', jsonb_build_object('bookingRef', current_setting('t.booking')::jsonb ->> 'bookingRef')) ->> 'cancelled',
  'true', 'A booking a day away cancels.');
select ok(pg_temp.sbx('lookup', jsonb_build_object('requestId', 'confirm:' || current_setting('t.request'))) @> '{"cancelled": true}',
  'And is then known to be cancelled.');
select ok(not (pg_temp.taken(current_setting('t.ref')) @> current_setting('t.seats')::jsonb),
  'Its seats are free again.');
select is(pg_temp.sbx('cancel', jsonb_build_object('bookingRef', current_setting('t.booking')::jsonb ->> 'bookingRef')) ->> 'ok',
  'true', 'Cancelling again is answered the same.');

-- Too close to the start to cancel.
select set_config('t.r2', gen_random_uuid()::text, true);
select set_config('t.h2', pg_temp.sbx('hold', jsonb_build_object('showingRef', current_setting('t.ref2'),
  'seats', pg_temp.free(current_setting('t.ref2'), 1), 'requestId', current_setting('t.r2')))::text, true);
select set_config('t.b2', pg_temp.sbx('confirm', jsonb_build_object('holdRef', current_setting('t.h2')::jsonb ->> 'holdRef',
  'requestId', 'confirm:' || current_setting('t.r2')))::text, true);
update cinema_sandbox.showing set starts_at = now() + interval '20 minutes'
 where tenant = 'c1510000-0000-4000-8000-0000000000c1' and ref = current_setting('t.ref2');
select is(pg_temp.sbx('cancel', jsonb_build_object('bookingRef', current_setting('t.b2')::jsonb ->> 'bookingRef')) ->> 'error',
  'cancel_window_closed', 'Within 30 minutes of the start, a booking no longer cancels.');

-- ─────────────────────────────────────────────────────── releasing, and its faults

select set_config('t.r3', gen_random_uuid()::text, true);
select set_config('t.s3', pg_temp.free(current_setting('t.ref'), 1)::text, true);
select set_config('t.h3', pg_temp.sbx('hold', jsonb_build_object('showingRef', current_setting('t.ref'),
  'seats', current_setting('t.s3')::jsonb, 'requestId', current_setting('t.r3')))::text, true);
select pg_temp.sbx('release', jsonb_build_object('holdRef', current_setting('t.h3')::jsonb ->> 'holdRef'));
select ok(not (pg_temp.taken(current_setting('t.ref')) @> current_setting('t.s3')::jsonb), 'A released seat is free again.');
select is(pg_temp.sbx('confirm', jsonb_build_object('holdRef', current_setting('t.h3')::jsonb ->> 'holdRef',
  'requestId', 'confirm:' || current_setting('t.r3'))) ->> 'error', 'hold_expired', 'A released hold does not book.');

select pg_temp.sbx('set_fault', '{"mode": "down", "remaining": 1}');
select ok((pg_temp.sbx('fault') ->> 'down')::boolean, 'Told to be down, it is down for the next call...');
select ok(not (pg_temp.sbx('fault') ->> 'down')::boolean, '...and then answers again.');

select pg_temp.sbx('set_fault', '{"mode": "seat_taken", "remaining": 1}');
select set_config('t.s4', pg_temp.free(current_setting('t.ref'), 2)::text, true);
select is(pg_temp.sbx('hold', jsonb_build_object('showingRef', current_setting('t.ref'),
  'seats', current_setting('t.s4')::jsonb, 'requestId', gen_random_uuid())) -> 'seats',
  jsonb_build_array(current_setting('t.s4')::jsonb ->> 0), 'A seat sold at the box office mid-checkout is named.');

select set_config('t.r5', gen_random_uuid()::text, true);
select set_config('t.h5', pg_temp.sbx('hold', jsonb_build_object('showingRef', current_setting('t.ref'),
  'seats', pg_temp.free(current_setting('t.ref'), 1), 'requestId', current_setting('t.r5')))::text, true);
select pg_temp.sbx('set_fault', '{"mode": "confirm_refused", "remaining": 1}');
select is(pg_temp.sbx('confirm', jsonb_build_object('holdRef', current_setting('t.h5')::jsonb ->> 'holdRef',
  'requestId', 'confirm:' || current_setting('t.r5'))) ->> 'error', 'seat_lost',
  'Told to refuse, it refuses the booking for good.');

select pg_temp.sbx('cancel_showing', jsonb_build_object('showingRef', current_setting('t.ref')));
select is(pg_temp.sbx('seat_map', jsonb_build_object('showingRef', current_setting('t.ref'))) ->> 'error', 'showing_closed',
  'A showing the cinema cancels is no longer on sale.');
select is(pg_temp.sbx('confirm', jsonb_build_object('holdRef', current_setting('t.h5')::jsonb ->> 'holdRef',
  'requestId', 'confirm:' || current_setting('t.r5'))) ->> 'error', 'showing_closed',
  'A payment that arrives after the showing was cancelled books nothing.');

select * from finish();
rollback;
