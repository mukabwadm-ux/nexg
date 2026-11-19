-- Bookings made from the app: each customer keeps the engine booking id and its
-- private token, sees only their own, can't rewrite whose or which booking it
-- is, and loses them with the account.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1120000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'amina112@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1120000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'other112@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, went_live_at)
values ('c1120000-0000-4000-8000-00000000000a', '[Legal 112] Ltd', '[Salon 112]', 'restaurant',
        '[Contact]', '+254700011200', 'salon112@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', now() - interval '30 days');

-- ── signed out

set local role anon;
select throws_ok($$select count(*) from public.customer_engine_booking$$, '42501', null,
  'Signed out, nobody reads the list.');
reset role;

-- ── Amina books from the app; the bridge saves it as her

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1120000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  insert into public.customer_engine_booking
    (merchant_id, engine_booking_id, customer_token, offering_id, title, status, starts_at, ends_at, total_cents)
  values ('c1120000-0000-4000-8000-00000000000a', 'bk_112_one', 'tok_112_private_value_123456',
          'off_112_cut', 'Haircut', 'confirmed', now() + interval '1 day',
          now() + interval '1 day 1 hour', 150000)
$$, 'Her booking is saved.');
select is((select user_id::text from public.customer_engine_booking where engine_booking_id = 'bk_112_one'),
  'c1120000-0000-4000-8000-000000000001', 'It is hers without saying so.');
select is((select customer_token from public.customer_engine_booking where engine_booking_id = 'bk_112_one'),
  'tok_112_private_value_123456', 'She can read its private token back, on any device.');

select throws_ok($$
  insert into public.customer_engine_booking (merchant_id, engine_booking_id, customer_token)
  values ('c1120000-0000-4000-8000-00000000000a', 'bad id!', 'tok_112_private_value_123456')
$$, '23514', null, 'A malformed booking id is refused.');

select lives_ok($$
  update public.customer_engine_booking set status = 'cancelled', updated_at = now()
   where engine_booking_id = 'bk_112_one'
$$, 'A change in the engine refreshes her summary.');
select throws_ok($$
  update public.customer_engine_booking set customer_token = 'tok_someone_elses_value_00'
   where engine_booking_id = 'bk_112_one'
$$, '42501', null, 'But the token can''t be swapped.');
select throws_ok($$
  update public.customer_engine_booking set user_id = 'c1120000-0000-4000-8000-000000000002'
   where engine_booking_id = 'bk_112_one'
$$, '42501', null, 'Nor given to someone else.');

-- ── somebody else

select set_config('request.jwt.claims',
  '{"sub":"c1120000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.customer_engine_booking), 0,
  'Another customer sees none of hers.');
select throws_ok($$
  insert into public.customer_engine_booking (user_id, merchant_id, engine_booking_id, customer_token)
  values ('c1120000-0000-4000-8000-000000000001', 'c1120000-0000-4000-8000-00000000000a',
          'bk_112_fake', 'tok_112_private_value_999999')
$$, '42501', null, 'Nor can they save a booking in her name.');
reset role;

select is((select status from public.customer_engine_booking where engine_booking_id = 'bk_112_one'),
  'cancelled', 'Her row is as she left it.');

-- ── her account goes, and the list with it

delete from auth.users where id = 'c1120000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.customer_engine_booking
            where engine_booking_id = 'bk_112_one'), 0,
  'Deleting her account deletes her saved bookings.');

select * from finish();
rollback;
