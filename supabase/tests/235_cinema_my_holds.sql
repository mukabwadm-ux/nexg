-- A customer's own cinema holds and bookings (rpc_my_cinema_holds): every
-- state, newest first, paged, in the shape of the single read, and nobody
-- else's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2350000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'filmgoer235@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2350000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'other235@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, subcategory, contact_name,
                             contact_phone, contact_email, city_id, status, explore_visible,
                             accepting_orders, went_live_at)
select 'c2350000-0000-4000-8000-00000000000a', '[Legal 235] Ltd', '[Cinema 235]', 'experiences', 'cinemas',
       '[Contact]', '+254700023500', 'cinema235@example.test', c.id, 'live', true, true, now() - interval '30 days'
from public.city c where c.slug = 'nairobi';

insert into public.connector_connection (id, adapter_id, merchant_id, environment, state)
values ('c2350000-0000-4000-8000-0000000000c1', 'sandbox-cinema', 'c2350000-0000-4000-8000-00000000000a',
        'sandbox', 'operational');

create function pg_temp.showing(p_ref text, p_hours numeric) returns jsonb language sql as $f$
  select jsonb_build_object('ref', p_ref, 'filmRef', 'F1', 'screenRef', 'S1',
    'startsAt', now() + interval '1 day' + make_interval(secs => p_hours * 3600),
    'endsAt', now() + interval '1 day' + make_interval(secs => (p_hours + 2) * 3600),
    'format', '2D', 'status', 'on_sale', 'prices', jsonb_build_object('standardMinor', 65000))
$f$;

select public.cinema_sync_apply('c2350000-0000-4000-8000-0000000000c1', jsonb_build_object(
  'window', jsonb_build_object('from', now(), 'to', now() + interval '7 days'),
  'films', jsonb_build_array(jsonb_build_object('ref', 'F1', 'title', 'The Long Rains 235', 'runtimeMinutes', 120,
                                                'releaseDate', '2026-10-01')),
  'screens', jsonb_build_array(jsonb_build_object('ref', 'S1', 'name', 'Screen 1', 'rows', jsonb_build_array(
    jsonb_build_object('label', 'A', 'position', 1, 'seats', jsonb_build_array(
      jsonb_build_object('code', 'A1', 'column', 1, 'number', 1, 'type', 'standard'),
      jsonb_build_object('code', 'A2', 'column', 2, 'number', 2, 'type', 'standard'),
      jsonb_build_object('code', 'A3', 'column', 3, 'number', 3, 'type', 'standard')))))),
  'showings', jsonb_build_array(pg_temp.showing('SH1', 0), pg_temp.showing('SH2', 3), pg_temp.showing('SH3', 6))));

create function pg_temp.showing_id(p_ref text) returns uuid language sql security definer as $f$
  select id from cinema.showing where connection_id = 'c2350000-0000-4000-8000-0000000000c1' and source_ref = p_ref
$f$;

/* A hold for the first customer, n-th in time (1 = oldest). */
create function pg_temp.hold(p_n int, p_showing text, p_seat text) returns uuid language plpgsql as $f$
declare v_id uuid;
begin
  v_id := (public.cinema_record_hold(pg_temp.showing_id(p_showing), 'c2350000-0000-4000-8000-000000000001',
             ('c2350000-0000-4000-8000-0000000000d' || p_n)::uuid, array[p_seat], '[]'::jsonb, 65000,
             'SBX-235-' || p_n, now() + interval '7 minutes') ->> 'holdId')::uuid;
  update cinema.hold set created_at = now() - make_interval(mins => 100 - p_n) where id = v_id;
  perform set_config('t.h' || p_n, v_id::text, true);
  return v_id;
end;
$f$;

-- Eight holds, one in each state, oldest first.
select pg_temp.hold(1, 'SH1', 'A1');                                                       -- held
select public.cinema_record_paying(pg_temp.hold(2, 'SH1', 'A2'), now() + interval '15 minutes');  -- paying
select public.cinema_payment_settled(pg_temp.hold(3, 'SH2', 'A1'), 'PS-235-3');            -- confirming
select public.cinema_payment_settled(pg_temp.hold(4, 'SH2', 'A2'), 'PS-235-4');
select public.cinema_record_confirm(current_setting('t.h4')::uuid, 'SBX-B-235-4',
  '[{"seat": "A2", "ticketRef": "T-235-4"}]'::jsonb);                                      -- confirmed
select public.cinema_record_hold_ended(pg_temp.hold(5, 'SH2', 'A3'), 'released');          -- released
select public.cinema_record_hold_ended(pg_temp.hold(6, 'SH3', 'A1'), 'expired');           -- expired
select public.cinema_payment_settled(pg_temp.hold(7, 'SH3', 'A2'), 'PS-235-7');
select public.cinema_record_confirm_failed(current_setting('t.h7')::uuid, 'seat_lost', true);   -- refund_due
select public.cinema_payment_settled(pg_temp.hold(8, 'SH3', 'A3'), 'PS-235-8');
select public.cinema_record_confirm_failed(current_setting('t.h8')::uuid, 'seat_lost', true);
select public.cinema_record_refunded(current_setting('t.h8')::uuid, 'RF-235-8');           -- refunded

-- ─────────────────────────────────────────────────────── who may call it

select ok(not has_function_privilege('anon', 'public.rpc_my_cinema_holds(integer, timestamptz, uuid)', 'execute'),
  'Nobody signed out can call it.');
select ok(has_function_privilege('authenticated', 'public.rpc_my_cinema_holds(integer, timestamptz, uuid)', 'execute'),
  'A signed-in customer, guests included, can.');

set local role anon;
select throws_ok($$select public.rpc_my_cinema_holds()$$, '42501', null, 'Signed out, it is refused.');
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.rpc_my_cinema_holds()$$, '42501', 'Sign in to see your tickets.',
  'A token with nobody in it is refused too.');
reset role;

-- ─────────────────────────────────────────────────────── the customer's own

select set_config('request.jwt.claims', '{"sub":"c2350000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select set_config('t.all', public.rpc_my_cinema_holds(50)::text, true);
select is(jsonb_array_length(current_setting('t.all')::jsonb -> 'holds'), 8, 'All eight of the customer''s holds.');
select is((select string_agg(x ->> 'state', ',' order by x ->> 'state')
             from jsonb_array_elements(current_setting('t.all')::jsonb -> 'holds') x),
  'confirmed,confirming,expired,held,paying,refund_due,refunded,released',
  'In every state the contract names.');
select is((select string_agg(x ->> 'holdId', ',' order by o) from jsonb_array_elements(current_setting('t.all')::jsonb -> 'holds')
             with ordinality as e(x, o)),
  concat_ws(',', current_setting('t.h8'), current_setting('t.h7'), current_setting('t.h6'), current_setting('t.h5'),
                 current_setting('t.h4'), current_setting('t.h3'), current_setting('t.h2'), current_setting('t.h1')),
  'Newest first.');
select is((select x from jsonb_array_elements(current_setting('t.all')::jsonb -> 'holds') x
            where x ->> 'holdId' = current_setting('t.h4')),
  public.rpc_my_cinema_hold(current_setting('t.h4')::uuid),
  'Each one is exactly what the single read gives, so the app reuses its view.');
select is((select x -> 'tickets' -> 0 ->> 'ticketRef' from jsonb_array_elements(current_setting('t.all')::jsonb -> 'holds') x
            where x ->> 'holdId' = current_setting('t.h4')), 'T-235-4', 'A booking carries its tickets.');
select is(current_setting('t.all')::jsonb -> 'next', 'null'::jsonb, 'Nothing older: no next page.');

-- Paging, three at a time.
select set_config('t.p1', public.rpc_my_cinema_holds(3)::text, true);
select set_config('t.p2', public.rpc_my_cinema_holds(3, (current_setting('t.p1')::jsonb -> 'next' ->> 'before')::timestamptz,
  (current_setting('t.p1')::jsonb -> 'next' ->> 'beforeId')::uuid)::text, true);
select set_config('t.p3', public.rpc_my_cinema_holds(3, (current_setting('t.p2')::jsonb -> 'next' ->> 'before')::timestamptz,
  (current_setting('t.p2')::jsonb -> 'next' ->> 'beforeId')::uuid)::text, true);
select is((select string_agg(x ->> 'holdId', ',' order by p, o) from (
            select 1 p, x, o from jsonb_array_elements(current_setting('t.p1')::jsonb -> 'holds') with ordinality e(x, o)
            union all select 2, x, o from jsonb_array_elements(current_setting('t.p2')::jsonb -> 'holds') with ordinality e(x, o)
            union all select 3, x, o from jsonb_array_elements(current_setting('t.p3')::jsonb -> 'holds') with ordinality e(x, o)) pages),
  (select string_agg(x ->> 'holdId', ',' order by o)
     from jsonb_array_elements(current_setting('t.all')::jsonb -> 'holds') with ordinality e(x, o)),
  'Three pages of three, three and two give all eight, in order, none twice.');
select is(current_setting('t.p3')::jsonb -> 'next', 'null'::jsonb, 'The last page says there is no next.');
select is(jsonb_array_length(public.rpc_my_cinema_holds(0) -> 'holds'), 1, 'A page holds at least one.');
select throws_ok($$select public.rpc_my_cinema_holds(3, now(), null)$$, '22023',
  'A page cursor needs both its time and its id.', 'Half a cursor is refused.');
reset role;

-- ─────────────────────────────────────────────────────── nobody else's

select set_config('request.jwt.claims', '{"sub":"c2350000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is(public.rpc_my_cinema_holds(50) -> 'holds', '[]'::jsonb, 'Another customer sees none of them.');
select is(public.rpc_my_cinema_holds(3, (current_setting('t.p1')::jsonb -> 'next' ->> 'before')::timestamptz,
  (current_setting('t.p1')::jsonb -> 'next' ->> 'beforeId')::uuid) -> 'holds', '[]'::jsonb,
  'Not even with the first customer''s cursor.');
reset role;

select * from finish();
rollback;
