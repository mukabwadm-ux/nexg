-- Cinema tickets say what kind of code their barcode is: the sandbox cinema
-- answers 'qr', and NexG returns each ticket's format as the cinema gave it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c2380000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'filmgoer238@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, subcategory, contact_name,
                             contact_phone, contact_email, city_id, status, explore_visible,
                             accepting_orders, went_live_at, accepts_test_payments)
select 'c2380000-0000-4000-8000-00000000000a', '[Legal 238] Ltd', '[Test Cinema 238]', 'experiences', 'cinemas',
       '[Contact]', '+254700023800', 'cinema238@example.test', c.id, 'live', true, true,
       now() - interval '30 days', true
from public.city c where c.slug = 'nairobi';

insert into public.connector_connection (id, adapter_id, merchant_id, environment, state)
values ('c2380000-0000-4000-8000-0000000000c1', 'sandbox-cinema', 'c2380000-0000-4000-8000-00000000000a',
        'sandbox', 'operational');

create function pg_temp.sbx(p_op text, p_args jsonb default '{}'::jsonb) returns jsonb language sql as $f$
  select public.sandbox_cinema('c2380000-0000-4000-8000-0000000000c1', p_op, p_args)
$f$;

-- ─────────────────────────────────────────────────────── the sandbox answers QR

select set_config('t.programme', pg_temp.sbx('programme', jsonb_build_object('from', now(), 'days', 7))::text, true);
select set_config('t.ref', (
  select s ->> 'ref' from jsonb_array_elements(current_setting('t.programme')::jsonb -> 'showings') s
   where (s ->> 'startsAt')::timestamptz > now() + interval '1 day'
   order by (s ->> 'startsAt')::timestamptz limit 1), true);
select set_config('t.seats', (
  with taken as (select pg_temp.sbx('seat_map', jsonb_build_object('showingRef', current_setting('t.ref'))) -> 'taken' t)
  select jsonb_agg(code order by r, n) from (
    select r, n, r || n as code from taken, unnest(array['B', 'C', 'D', 'E']) r, generate_series(2, 9) n
     where not (taken.t ? (r || n)) order by r, n limit 2) x)::text, true);
select set_config('t.request', gen_random_uuid()::text, true);
select set_config('t.hold', pg_temp.sbx('hold', jsonb_build_object('showingRef', current_setting('t.ref'),
  'seats', current_setting('t.seats')::jsonb, 'requestId', current_setting('t.request')))::text, true);
select set_config('t.booking', pg_temp.sbx('confirm', jsonb_build_object(
  'holdRef', current_setting('t.hold')::jsonb ->> 'holdRef',
  'requestId', 'confirm:' || current_setting('t.request'), 'paymentRef', 'T238-PAY'))::text, true);

select is((select count(*)::int from jsonb_array_elements(current_setting('t.booking')::jsonb -> 'tickets') t
            where t ->> 'barcodeFormat' = 'qr' and t ->> 'barcode' is not null), 2,
  'The sandbox cinema says each of its barcodes is a QR code.');
select is((select count(*)::int from jsonb_array_elements(
             pg_temp.sbx('lookup', jsonb_build_object('requestId', 'confirm:' || current_setting('t.request'))) -> 'tickets') t
            where t ->> 'barcodeFormat' = 'qr'), 2,
  'And says so again when the booking is looked up.');

-- ─────────────────────────────────────────────────────── tickets already issued

select is(cinema_sandbox.with_qr_format(
  '[{"seat": "A1", "barcode": "X"}, {"seat": "A2", "barcode": "Y", "barcodeFormat": "code128"}, {"seat": "A3"}]'::jsonb),
  '[{"seat": "A1", "barcode": "X", "barcodeFormat": "qr"}, {"seat": "A2", "barcode": "Y", "barcodeFormat": "code128"}, {"seat": "A3"}]'::jsonb,
  'A sandbox ticket with a barcode and no format gets QR; a stated format or no barcode is left as it is.');
select is(cinema_sandbox.with_qr_format('{"not": "an array"}'::jsonb), '{"not": "an array"}'::jsonb,
  'Anything that is not a list of tickets is left alone.');
select ok(not exists (select 1 from cinema_sandbox.booking b, jsonb_array_elements(b.tickets) t
                       where t ? 'barcode' and not t ? 'barcodeFormat'),
  'No sandbox ticket is left without its format.');

-- ─────────────────────────────────────────────────────── NexG returns the format as the cinema gave it

select public.cinema_sync_apply('c2380000-0000-4000-8000-0000000000c1', current_setting('t.programme')::jsonb);
select set_config('t.showing', (select id::text from cinema.showing
  where connection_id = 'c2380000-0000-4000-8000-0000000000c1' and source_ref = current_setting('t.ref')), true);
select set_config('t.nexg', public.cinema_record_hold(current_setting('t.showing')::uuid,
  'c2380000-0000-4000-8000-000000000001', current_setting('t.request')::uuid,
  array(select jsonb_array_elements_text(current_setting('t.seats')::jsonb)),
  current_setting('t.hold')::jsonb -> 'lines', 130000, current_setting('t.hold')::jsonb ->> 'holdRef',
  now() + interval '20 minutes') ->> 'holdId', true);
select public.cinema_payment_settled(current_setting('t.nexg')::uuid, 'T238-PAY');
select public.cinema_record_confirm(current_setting('t.nexg')::uuid, 'B-238',
  '[{"seat": "B2", "ticketRef": "B-238-B2", "barcode": "P1", "barcodeFormat": "pdf417"},
    {"seat": "B3", "ticketRef": "B-238-B3", "barcode": "P2"}]'::jsonb);

select set_config('request.jwt.claims', '{"sub":"c2380000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(public.rpc_my_cinema_hold(current_setting('t.nexg')::uuid) -> 'tickets' -> 0 ->> 'barcodeFormat', 'pdf417',
  'The customer''s ticket carries the format the cinema gave.');
select ok(not (public.rpc_my_cinema_hold(current_setting('t.nexg')::uuid) -> 'tickets' -> 1 ? 'barcodeFormat'),
  'A ticket the cinema gave no format for has none (the app draws QR).');
select is((select x -> 'tickets' -> 0 ->> 'barcodeFormat' from jsonb_array_elements(public.rpc_my_cinema_holds(50) -> 'holds') x
            where x ->> 'holdId' = current_setting('t.nexg')), 'pdf417',
  'The list of the customer''s tickets carries it too.');
reset role;

select * from finish();
rollback;
