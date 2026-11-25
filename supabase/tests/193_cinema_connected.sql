-- Cinemas connected to their own ticketing system (20270304000200): the cache
-- of what the system said, a hold's life on it, and the worker's checks.
begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1500000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'filmgoer150@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1500000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'other150@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1500000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'cinemaowner150@example.test', now(), false, now(), now());

-- Cinema A (real, connected for these tests) and cinema B (a test cinema).
insert into public.merchant (id, legal_name, trading_name, category, subcategory, contact_name,
                             contact_phone, contact_email, city_id, status, explore_visible,
                             accepting_orders, went_live_at, accepts_test_payments)
select v.id, v.legal, v.trading, 'experiences', 'cinemas', '[Contact]', v.phone, v.email, c.id, 'live', true,
       true, now() - interval '30 days', v.test
from public.city c
cross join (values
  ('c1500000-0000-4000-8000-00000000000a'::uuid, '[Legal 150 A] Ltd', '[Cinema 150 A]',
   '+254700015000', 'cinemaa150@example.test', false),
  ('c1500000-0000-4000-8000-00000000000b'::uuid, '[Legal 150 B] Ltd', '[Test Cinema 150 B]',
   '+254700015001', 'cinemab150@example.test', true)
) as v(id, legal, trading, phone, email, test)
where c.slug = 'nairobi';
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1500000-0000-4000-8000-00000000000a', 'c1500000-0000-4000-8000-000000000003', 'owner'),
       ('c1500000-0000-4000-8000-00000000000b', 'c1500000-0000-4000-8000-000000000003', 'owner');

insert into public.connector_connection (id, adapter_id, merchant_id, environment, state)
values ('c1500000-0000-4000-8000-0000000000c1', 'sandbox-cinema', 'c1500000-0000-4000-8000-00000000000a',
        'sandbox', 'operational');

create function pg_temp.programme(p_showings jsonb, p_films jsonb default null) returns jsonb language sql as $f$
  select jsonb_build_object(
    'window', jsonb_build_object('from', now(), 'to', now() + interval '7 days'),
    'films', coalesce(p_films, jsonb_build_array(jsonb_build_object(
      'ref', 'F1', 'title', 'The Long Rains', 'runtimeMinutes', 120, 'releaseDate', '2026-10-01',
      'classification', 'PG', 'externalIds', jsonb_build_object('imdb', 'tt0150001')))),
    'screens', jsonb_build_array(jsonb_build_object(
      'ref', 'S1', 'name', 'Screen 1', 'layoutVersion', 'v1',
      'rows', jsonb_build_array(jsonb_build_object('label', 'A', 'position', 1, 'seats', jsonb_build_array(
        jsonb_build_object('code', 'A1', 'column', 1, 'number', 1, 'type', 'standard'),
        jsonb_build_object('code', 'A2', 'column', 2, 'number', 2, 'type', 'standard'),
        jsonb_build_object('code', 'A3', 'column', 3, 'number', 3, 'type', 'vip')))))),
    'showings', p_showings)
$f$;

create function pg_temp.showing(p_ref text, p_hours numeric, p_status text default 'on_sale',
                                p_vip boolean default true) returns jsonb language sql as $f$
  select jsonb_build_object('ref', p_ref, 'filmRef', 'F1', 'screenRef', 'S1',
    'startsAt', now() + interval '1 day' + make_interval(secs => p_hours * 3600),
    'endsAt', now() + interval '1 day' + make_interval(secs => (p_hours + 2) * 3600),
    'format', '2D', 'status', p_status,
    'prices', case when p_vip then jsonb_build_object('standardMinor', 65000, 'vipMinor', 90000)
                   else jsonb_build_object('standardMinor', 65000) end)
$f$;

create function pg_temp.showing_id(p_ref text) returns uuid language sql security definer as $f$
  select id from cinema.showing where connection_id = 'c1500000-0000-4000-8000-0000000000c1' and source_ref = p_ref
$f$;

-- ─────────────────────────────────────────────────────── applying a programme

select set_config('t.sync1', public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c1',
  pg_temp.programme(jsonb_build_array(
    pg_temp.showing('SH1', 0), pg_temp.showing('SH2', 3),
    pg_temp.showing('SH3', 1),                         -- overlaps SH1 on screen 1
    pg_temp.showing('SH4', 6, 'on_sale', false))))::text, true);  -- no VIP price

select is((current_setting('t.sync1')::jsonb ->> 'showings')::int, 3, 'Three showings saved; the overlapping one is not.');
select ok(current_setting('t.sync1')::jsonb -> 'refused' @> '[{"ref": "SH3", "reason": "It overlaps another showing on the same screen."}]',
  'The overlap is refused and named.');
select is((select status from cinema.showing where id = pg_temp.showing_id('SH4')), 'draft',
  'A showing with a seat type left unpriced is not on sale.');
select is((select count(*)::int from cinema.seat s join cinema.screen sc on sc.id = s.screen_id
            where sc.connection_id = 'c1500000-0000-4000-8000-0000000000c1'), 3, 'The screen arrived with its three seats.');

-- Sending it again changes nothing.
select public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c1',
  pg_temp.programme(jsonb_build_array(pg_temp.showing('SH1', 0), pg_temp.showing('SH2', 3),
    pg_temp.showing('SH3', 1), pg_temp.showing('SH4', 6, 'on_sale', false))));
select is((select count(*)::int from cinema.showing where connection_id = 'c1500000-0000-4000-8000-0000000000c1'), 3,
  'A re-send adds no showing.');
select is((select count(*)::int from cinema.film_source where connection_id = 'c1500000-0000-4000-8000-0000000000c1'), 1,
  'Nor a film.');
select is((select status from cinema.showing where id = pg_temp.showing_id('SH1')), 'on_sale', 'And leaves SH1 on sale.');

-- One film across cinemas.
insert into public.connector_connection (id, adapter_id, merchant_id, environment, state)
values ('c1500000-0000-4000-8000-0000000000c2', 'sandbox-cinema', 'c1500000-0000-4000-8000-00000000000b',
        'sandbox', 'operational');
select public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c2', jsonb_build_object(
  'window', jsonb_build_object('from', now(), 'to', now() + interval '7 days'),
  'films', jsonb_build_array(
    jsonb_build_object('ref', 'B-1', 'title', 'Long Rains (Imax)', 'externalIds', jsonb_build_object('imdb', 'tt0150001')),
    jsonb_build_object('ref', 'B-2', 'title', 'the long rains', 'runtimeMinutes', 120, 'releaseDate', '2026-12-25'),
    jsonb_build_object('ref', 'B-3', 'title', 'The Long Rains')),
  'screens', '[]'::jsonb, 'showings', '[]'::jsonb));
select is((select film_id from cinema.film_source where connection_id = 'c1500000-0000-4000-8000-0000000000c2' and source_ref = 'B-1'),
          (select film_id from cinema.film_source where connection_id = 'c1500000-0000-4000-8000-0000000000c1' and source_ref = 'F1'),
  'The same external film id is the same NexG film, whatever its title.');
select is((select (film_id = (select film_id from cinema.film_source where connection_id = 'c1500000-0000-4000-8000-0000000000c1' and source_ref = 'F1'))
             || ':' || needs_review
             from cinema.film_source where connection_id = 'c1500000-0000-4000-8000-0000000000c2' and source_ref = 'B-2'),
  'true:true', 'Title, year and runtime together match too, flagged for a person to check.');
select isnt((select film_id from cinema.film_source where connection_id = 'c1500000-0000-4000-8000-0000000000c2' and source_ref = 'B-3'),
            (select film_id from cinema.film_source where connection_id = 'c1500000-0000-4000-8000-0000000000c1' and source_ref = 'F1'),
  'A title alone never merges two films.');

-- ─────────────────────────────────────────────────────── a hold's life

select set_config('t.h1', public.cinema_record_hold(pg_temp.showing_id('SH1'), 'c1500000-0000-4000-8000-000000000001',
  'c1500000-0000-4000-8000-0000000000d1', array['A2', 'A1'], '[{"seat": "A1", "priceMinor": 65000}]'::jsonb,
  130000, 'SBX-H-1', now() + interval '7 minutes') ->> 'holdId', true);
select is((select state from cinema.hold where id = current_setting('t.h1')::uuid), 'held', 'Seats held on the cinema''s system are recorded.');
select is(public.cinema_record_hold(pg_temp.showing_id('SH1'), 'c1500000-0000-4000-8000-000000000001',
  'c1500000-0000-4000-8000-0000000000d1', array['A1', 'A2'], '[]'::jsonb, 130000, 'SBX-H-1-again',
  now() + interval '7 minutes') ->> 'holdId', current_setting('t.h1'),
  'The same request returns the same hold.');
select is(public.cinema_record_paying(current_setting('t.h1')::uuid, now() + interval '15 minutes') ->> 'state', 'paying',
  'Paying, with the hold extended.');
select is(public.cinema_payment_settled(current_setting('t.h1')::uuid, 'PS-150-1') ->> 'state', 'confirming',
  'Paid: confirming with the cinema.');
select is(public.cinema_record_confirm_failed(current_setting('t.h1')::uuid, 'timeout', false) ->> 'state', 'confirming',
  'One failed confirm is retried, not refunded.');
select is((select confirm_attempts from cinema.hold where id = current_setting('t.h1')::uuid), 1, 'The attempt is counted.');
select is(public.cinema_record_confirm(current_setting('t.h1')::uuid, 'SBX-B-1',
  '[{"seat": "A1", "ticketRef": "T1"}, {"seat": "A2", "ticketRef": "T2"}]'::jsonb) -> 'tickets' -> 1 ->> 'ticketRef', 'T2',
  'Confirmed with the cinema''s booking and its tickets.');
select is((select confirmation_ref from cinema.hold where id = current_setting('t.h1')::uuid), 'SBX-B-1',
  'The booking reference is kept.');
select is(public.cinema_record_cancelled(current_setting('t.h1')::uuid, 'customer_cancelled') ->> 'message',
  'Cancelled. Your KES 1,300 is being refunded.', 'A cancelled booking becomes a refund, said plainly.');
select is(public.cinema_record_refunded(current_setting('t.h1')::uuid, 'RF-150-1') ->> 'state', 'refunded', 'And then refunded.');

-- A confirm the cinema refuses for good becomes a refund at once.
select set_config('t.h2', public.cinema_record_hold(pg_temp.showing_id('SH2'), 'c1500000-0000-4000-8000-000000000001',
  'c1500000-0000-4000-8000-0000000000d2', array['A3'], '[]'::jsonb, 90000, 'SBX-H-2', now() + interval '7 minutes') ->> 'holdId', true);
select public.cinema_payment_settled(current_setting('t.h2')::uuid, 'PS-150-2');
select ok(public.cinema_record_confirm_failed(current_setting('t.h2')::uuid, 'seat_lost', true) ->> 'message'
            like '[Cinema 150 A] couldn''t confirm your seats. Your KES 900 is being refunded%',
  'A refused confirm is refunded in full, and the customer is told.');

-- ─────────────────────────────────────────────────────── the old path, the reads

select set_config('request.jwt.claims', '{"sub":"c1500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  format($$select public.rpc_cinema_hold_seats(%L, array['A1'], 65000, gen_random_uuid())$$, pg_temp.showing_id('SH1')),
  '22023', 'Hold these seats through the cinema checkout.',
  'The in-database hold refuses a connected cinema.');
select is(public.rpc_my_cinema_hold(current_setting('t.h1')::uuid) ->> 'bookingRef', 'SBX-B-1',
  'The customer reads their own booking.');
select is((public.rpc_cinema_programme((now() at time zone 'Africa/Nairobi')::date, 7,
            'c1500000-0000-4000-8000-00000000000a') -> 'showings' -> 0 ->> 'syncedAt') is not null, true,
  'The programme says when each showing was last synced.');
reset role;

select public.cinema_record_snapshot(pg_temp.showing_id('SH2'), array['A1'], now());
set local role authenticated;
select is(public.rpc_cinema_seat_map(pg_temp.showing_id('SH2')) -> 'taken', '["A1"]'::jsonb,
  'The seat map shows the cinema''s last answer.');
select is(public.rpc_cinema_seat_map(pg_temp.showing_id('SH2')) ->> 'live', 'false', 'And says it is not live.');

select set_config('request.jwt.claims', '{"sub":"c1500000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.rpc_my_cinema_hold(%L)$$, current_setting('t.h1')), 'P0002', 'Seat hold not found.',
  'Nobody else reads it.');
select throws_ok($$select public.rpc_cinema_connection('c1500000-0000-4000-8000-00000000000a')$$, '42501', 'Not your cinema.',
  'Nor another cinema''s connection.');

select set_config('request.jwt.claims', '{"sub":"c1500000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.rpc_cinema_connection('c1500000-0000-4000-8000-00000000000a') ->> 'connected', 'true',
  'The cinema sees its connection.');
select is(jsonb_array_length(public.rpc_cinema_bookings_for_merchant('c1500000-0000-4000-8000-00000000000a')), 2,
  'And its bookings through NexG.');
reset role;

-- Connecting: the sandbox is for test cinemas only.
update public.connector_connection set state = 'disconnected' where id = 'c1500000-0000-4000-8000-0000000000c1';
select set_config('request.jwt.claims', '{"sub":"c1500000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.rpc_cinema_connect('c1500000-0000-4000-8000-00000000000a', 'sandbox-cinema')$$,
  '22023', 'The sandbox cinema is for test cinemas only.', 'A real cinema cannot use the sandbox.');
select is(public.rpc_cinema_pause('c1500000-0000-4000-8000-00000000000b', true) ->> 'paused', 'true',
  'A test cinema''s sales on NexG can be paused.');
reset role;
update public.connector_connection set state = 'operational' where id = 'c1500000-0000-4000-8000-0000000000c1';

-- ─────────────────────────────────────────────────────── the worker

select set_config('t.h3', public.cinema_record_hold(pg_temp.showing_id('SH2'), 'c1500000-0000-4000-8000-000000000002',
  'c1500000-0000-4000-8000-0000000000d3', array['A2'], '[]'::jsonb, 65000, 'SBX-H-3', now() - interval '1 minute') ->> 'holdId', true);
select ok(public.cinema_due_work(50) -> 'expiries' @> to_jsonb(array[current_setting('t.h3')]),
  'An expired hold is handed to the worker to release on the cinema''s system.');

select set_config('t.h4', public.cinema_record_hold(pg_temp.showing_id('SH2'), 'c1500000-0000-4000-8000-000000000002',
  'c1500000-0000-4000-8000-0000000000d4', array['A2'], '[]'::jsonb, 65000, 'SBX-H-4', now() + interval '7 minutes') ->> 'holdId', true);
select public.cinema_payment_settled(current_setting('t.h4')::uuid, 'PS-150-4');
update cinema.hold set settled_at = now() - interval '16 minutes' where id = current_setting('t.h4')::uuid;
select public.cinema_due_work(50);
select is((select state || ':' || refund_reason from cinema.hold where id = current_setting('t.h4')::uuid), 'refund_due:confirm_refused',
  'Paid and not booked within 15 minutes: refunded, never kept.');

update cinema.sync_state set last_sync_at = now() - interval '7 hours'
 where connection_id = 'c1500000-0000-4000-8000-0000000000c1';
select public.cinema_due_work(50);
select is((select status from cinema.showing where id = pg_temp.showing_id('SH2')), 'closed',
  'A cinema whose system stopped syncing for 6 hours has its showings closed on NexG.');

-- A showing the cinema cancels: unpaid holds released, paid ones refunded.
update public.connector_connection set state = 'operational' where id = 'c1500000-0000-4000-8000-0000000000c1';
select set_config('t.h5', public.cinema_record_hold(pg_temp.showing_id('SH1'), 'c1500000-0000-4000-8000-000000000002',
  'c1500000-0000-4000-8000-0000000000d5', array['A3'], '[]'::jsonb, 90000, 'SBX-H-5', now() + interval '7 minutes') ->> 'holdId', true);
select public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c1',
  pg_temp.programme(jsonb_build_array(pg_temp.showing('SH1', 0, 'cancelled'))));
select is((select state from cinema.hold where id = current_setting('t.h5')::uuid), 'released',
  'A showing the cinema cancels releases its unpaid holds.');
select is(public.cinema_payment_settled(current_setting('t.h5')::uuid, 'PS-150-5') ->> 'state', 'refund_due',
  'A payment that lands after the cinema cancelled the showing is refunded, never confirmed.');
select is((select status || ':' || in_latest_sync from cinema.showing where id = pg_temp.showing_id('SH4')), 'draft:false',
  'A showing left out of a sync is kept, marked not in the latest programme.');

-- ─────────────────────────────────────────────────────── what the review found

-- Two showings that swap places on one screen are both taken.
select public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c1',
  pg_temp.programme(jsonb_build_array(pg_temp.showing('SH5', 10), pg_temp.showing('SH6', 13))));
select set_config('t.swap', public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c1',
  pg_temp.programme(jsonb_build_array(pg_temp.showing('SH5', 13), pg_temp.showing('SH6', 10))))::text, true);
select is(jsonb_array_length(current_setting('t.swap')::jsonb -> 'refused'), 0,
  'Two showings that swap places on a screen refuse nothing.');
select is((select string_agg(status, ',' order by source_ref) from cinema.showing
            where id in (pg_temp.showing_id('SH5'), pg_temp.showing_id('SH6'))), 'on_sale,on_sale',
  'And both stay on sale, at their new times.');

-- A film NexG cannot take is refused on its own; the rest arrives.
select set_config('t.badfilm', public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c1', pg_temp.programme(
  jsonb_build_array(pg_temp.showing('SH5', 13), pg_temp.showing('SH6', 10),
                    jsonb_set(pg_temp.showing('SH7', 20), '{filmRef}', '"F9"')),
  jsonb_build_array(
    jsonb_build_object('ref', 'F1', 'title', 'The Long Rains', 'runtimeMinutes', 120, 'releaseDate', '2026-10-01',
                       'classification', 'PG', 'externalIds', jsonb_build_object('imdb', 'tt0150001')),
    jsonb_build_object('ref', 'F9', 'title', 'Broken', 'runtimeMinutes', 'abc'))))::text, true);
select ok(current_setting('t.badfilm')::jsonb -> 'refused' @> '[{"ref": "F9", "kind": "film"}]',
  'A film NexG cannot take is refused on its own, with the reason.');
select ok(current_setting('t.badfilm')::jsonb -> 'refused' @> '[{"ref": "SH7"}]', 'So is the showing that needs it.');
select is((current_setting('t.badfilm')::jsonb ->> 'showings')::int, 2, 'The rest of the programme still arrives.');

-- A screen entered before the cinema connected is adopted, not duplicated.
insert into cinema.screen (id, merchant_id, name)
values ('c1500000-0000-4000-8000-0000000000e9', 'c1500000-0000-4000-8000-00000000000a', 'Screen 9');
select public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c1', jsonb_set(
  pg_temp.programme(jsonb_build_array(pg_temp.showing('SH5', 13), pg_temp.showing('SH6', 10))), '{screens}',
  (pg_temp.programme('[]'::jsonb) -> 'screens') || jsonb_build_array(jsonb_build_object(
    'ref', 'S9', 'name', 'Screen 9', 'rows', jsonb_build_array(jsonb_build_object('label', 'A', 'position', 1,
      'seats', jsonb_build_array(jsonb_build_object('code', 'A1', 'column', 1, 'number', 1, 'type', 'standard'))))))));
select is((select connection_id::text || ':' || source_ref from cinema.screen
            where id = 'c1500000-0000-4000-8000-0000000000e9'), 'c1500000-0000-4000-8000-0000000000c1:S9',
  'A screen of the same name, entered before the cinema connected, is adopted rather than clashing.');

-- A booking found after NexG stopped waiting is honoured, not refunded.
select is(public.cinema_record_confirm(current_setting('t.h4')::uuid, 'SBX-B-4-LATE', '[]'::jsonb) ->> 'state',
  'confirmed', 'A booking the cinema made after NexG stopped waiting is confirmed, not refunded.');

-- Cancelling is written down first, and asked again until the cinema answers.
select is(public.cinema_record_cancel_requested(current_setting('t.h4')::uuid) ->> 'message',
  'Cancelling with [Cinema 150 A]…', 'A cancel is written down before the cinema is asked.');
update cinema.hold set cancel_next_at = now() - interval '1 second' where id = current_setting('t.h4')::uuid;
select ok(public.cinema_due_work(50) -> 'cancels' @> to_jsonb(array[current_setting('t.h4')]),
  'A cancel the cinema has not answered is handed to the worker to ask again.');
select is(public.cinema_record_cancel_failed(current_setting('t.h4')::uuid, 'Too close to the start.', true) ->> 'state',
  'confirmed', 'Refused for good by the cinema: the booking stands.');
select is((select cancel_requested_at from cinema.hold where id = current_setting('t.h4')::uuid), null,
  'And the request is dropped.');

-- A payment that lands once sales have closed is refunded.
select public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c1', pg_temp.programme(jsonb_build_array(
  pg_temp.showing('SH5', 13), pg_temp.showing('SH6', 10), pg_temp.showing('SH8', -23.9))));
select set_config('t.h6', public.cinema_record_hold(pg_temp.showing_id('SH8'), 'c1500000-0000-4000-8000-000000000001',
  'c1500000-0000-4000-8000-0000000000d6', array['A1'], '[]'::jsonb, 65000, 'SBX-H-6', now() + interval '3 minutes')
  ->> 'holdId', true);
select public.cinema_payment_settled(current_setting('t.h6')::uuid, 'PS-150-6');
select is((select state || ':' || refund_reason from cinema.hold where id = current_setting('t.h6')::uuid),
  'refund_due:paid_too_late', 'A payment that arrives after sales closed is refunded, not booked.');

-- A connected cinema stops selling 20 minutes before the start.
select public.cinema_sync_apply('c1500000-0000-4000-8000-0000000000c1', pg_temp.programme(jsonb_build_array(
  pg_temp.showing('SH5', 13), pg_temp.showing('SH6', 10), pg_temp.showing('SH8', -23.9, 'cancelled'),
  pg_temp.showing('SH9', -23.75))));
select ok(not (public.rpc_cinema_programme((now() at time zone 'Africa/Nairobi')::date, 7, 'c1500000-0000-4000-8000-00000000000a') -> 'showings'
               @> jsonb_build_array(jsonb_build_object('id', pg_temp.showing_id('SH9')))),
  'A connected cinema''s showing 15 minutes away is no longer offered: there is no time left to pay.');
select ok(public.rpc_cinema_programme((now() at time zone 'Africa/Nairobi')::date, 7, 'c1500000-0000-4000-8000-00000000000a') -> 'showings'
          @> jsonb_build_array(jsonb_build_object('id', pg_temp.showing_id('SH5'))),
  'Later showings are.');

-- A customer holds seats for at most three showings at a time.
select public.cinema_record_hold(pg_temp.showing_id('SH5'), 'c1500000-0000-4000-8000-000000000003', gen_random_uuid(), array['A1'], '[]'::jsonb,
  65000, 'SBX-L-1', now() + interval '7 minutes');
select public.cinema_record_hold(pg_temp.showing_id('SH5'), 'c1500000-0000-4000-8000-000000000003', gen_random_uuid(), array['A2'], '[]'::jsonb,
  65000, 'SBX-L-2', now() + interval '7 minutes');
select public.cinema_record_hold(pg_temp.showing_id('SH6'), 'c1500000-0000-4000-8000-000000000003', gen_random_uuid(), array['A1'], '[]'::jsonb,
  65000, 'SBX-L-3', now() + interval '7 minutes');
select throws_ok(format($$select public.cinema_record_hold(%L, 'c1500000-0000-4000-8000-000000000003', gen_random_uuid(), array['A3'], '[]'::jsonb,
  90000, 'SBX-L-4', now() + interval '7 minutes')$$, pg_temp.showing_id('SH6')),
  'P0001', 'You already have seats held for three showings. Pay for them or let them go first.',
  'A fourth live hold is refused.');
select is(jsonb_array_length(public.cinema_active_holds('c1500000-0000-4000-8000-000000000003')), 3, 'The customer''s live holds are listed.');
select is(public.cinema_hold_for_request('c1500000-0000-4000-8000-000000000001', 'c1500000-0000-4000-8000-0000000000d1') ->> 'holdId',
  current_setting('t.h1'), 'A retry finds the hold NexG already has.');

-- Pausing and resuming.
select set_config('request.jwt.claims', '{"sub":"c1500000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select public.rpc_cinema_pause('c1500000-0000-4000-8000-00000000000a', true);
select public.rpc_cinema_pause('c1500000-0000-4000-8000-00000000000a', false);
reset role;
select is((select (last_sync_at is null) || ':' || (stale_closed_at is not null) from cinema.sync_state
            where connection_id = 'c1500000-0000-4000-8000-0000000000c1'), 'true:true',
  'Resuming asks for a sync at once, without a false "stopped syncing".');
select ok(public.cinema_due_work(50) -> 'syncs' @> jsonb_build_array(jsonb_build_object('connectionId', 'c1500000-0000-4000-8000-0000000000c1')),
  'And the worker syncs it next.');
update public.connector_connection set state = 'draft' where id = 'c1500000-0000-4000-8000-0000000000c2';
set local role authenticated;
select throws_ok($$select public.rpc_cinema_pause('c1500000-0000-4000-8000-00000000000b', true)$$,
  '22023', 'Finish connecting the ticketing system first.',
  'A connection still being set up cannot be paused, nor resumed into selling.');
reset role;

select * from finish();
rollback;
