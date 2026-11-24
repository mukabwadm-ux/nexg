-- Recent categories count bookings and stays too (20270227000300).

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1480000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'customer148@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1480000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'other148@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values
  ('c1480000-0000-4000-8000-00000000000a', '[Legal 148] Ltd', '[Salon 148]', 'beauty',
   '[Contact]', '+254700014800', 'salon148@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days'),
  ('c1480000-0000-4000-8000-00000000000b', '[Legal 148b] Ltd', '[Tours 148]', 'experiences',
   '[Contact]', '+254700014801', 'tours148@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.bookable_resource (id, merchant_id, name)
values ('c1480000-0000-4000-8000-0000000000a1', 'c1480000-0000-4000-8000-00000000000a', 'Chair 1');

-- The shop has no hours on file; the booking hours check is not what is tested here.
alter table public.booking disable trigger booking_hours_guard;

-- A salon booking on the website, a cancelled one, an app booking through the
-- engine, and a stay; then the other account's booking.
insert into public.booking (merchant_id, resource_id, starts_at, ends_at, held_during, status, guest_user_id, created_at)
values
  ('c1480000-0000-4000-8000-00000000000a', 'c1480000-0000-4000-8000-0000000000a1',
   now() + interval '1 day', now() + interval '1 day 1 hour',
   tstzrange(now() + interval '1 day', now() + interval '1 day 1 hour'), 'confirmed',
   'c1480000-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('c1480000-0000-4000-8000-00000000000a', 'c1480000-0000-4000-8000-0000000000a1',
   now() + interval '2 days', now() + interval '2 days 1 hour',
   tstzrange(now() + interval '2 days', now() + interval '2 days 1 hour'), 'cancelled',
   'c1480000-0000-4000-8000-000000000001', now() - interval '1 day');
insert into public.customer_engine_booking (user_id, merchant_id, engine_booking_id, customer_token, status, created_at)
values ('c1480000-0000-4000-8000-000000000001', 'c1480000-0000-4000-8000-00000000000b',
        'eng-148', 'token-148-0123456789', 'confirmed', now() - interval '2 days');
insert into public.stay (host_id, check_in, check_out, status, guest_user_id, created_at)
values ((select id from public.host order by created_at limit 1),
        now() + interval '10 days', now() + interval '12 days', 'booked',
        'c1480000-0000-4000-8000-000000000001', now() - interval '1 hour');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1480000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('t.cats', public.rpc_my_recent_categories()::text, true);

select is(
  (select jsonb_agg(c ->> 'category') from jsonb_array_elements(current_setting('t.cats')::jsonb) c),
  '["stays", "experiences", "beauty"]'::jsonb,
  'Stays, app bookings and website bookings all count, most recent first.');
select is(
  (select jsonb_build_array((c ->> 'count')::int, (c ->> 'bookings')::int, (c ->> 'orders')::int)
     from jsonb_array_elements(current_setting('t.cats')::jsonb) c where c ->> 'category' = 'beauty'),
  '[1, 1, 0]'::jsonb, 'A cancelled booking does not count.');
select is(
  (select (c ->> 'stays')::int from jsonb_array_elements(current_setting('t.cats')::jsonb) c
    where c ->> 'category' = 'stays'),
  1, 'A stay counts under "stays".');
select is(
  (select c -> 'last_ordered_at' from jsonb_array_elements(current_setting('t.cats')::jsonb) c
    where c ->> 'category' = 'experiences'),
  'null'::jsonb, 'last_ordered_at is null where there are only bookings.');
select is(jsonb_array_length(public.rpc_my_recent_categories(2)), 2, 'The limit is respected.');

select set_config('request.jwt.claims',
  '{"sub":"c1480000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.rpc_my_recent_categories(), '[]'::jsonb,
  'Another account sees none of these.');
reset role;

select * from finish();
rollback;
