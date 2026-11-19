-- Guests book once they pay; nothing is confirmed unpaid; the customer shows
-- a booking code and the business checks it; app bookings are forgotten by
-- the booking engine when the account goes (20270111000600, 20270111000700).

begin;
create extension if not exists pgtap with schema extensions;
select plan(58);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', null, null, true, now(), now()),      -- a guest
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'owner113@example.test', now(), false, now(), now()),  -- the business
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'host113@example.test', now(), false, now(), now()),   -- the host
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'amina113@example.test', now(), false, now(), now()),  -- a customer
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'other113@example.test', now(), false, now(), now());  -- another business

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1130000-0000-4000-8000-00000000000a', '[Legal 113] Ltd', '[Salon 113]', 'restaurant',
        '[Contact]', '+254700011300', 'salon113@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days'),
       ('c1130000-0000-4000-8000-00000000000b', '[Legal 113b] Ltd', '[Other 113]', 'restaurant',
        '[Contact]', '+254700011301', 'other113b@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role) values
  ('c1130000-0000-4000-8000-00000000000a', 'c1130000-0000-4000-8000-000000000002', 'owner'),
  ('c1130000-0000-4000-8000-00000000000b', 'c1130000-0000-4000-8000-000000000005', 'owner');
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
select 'c1130000-0000-4000-8000-00000000000a', d, '00:00', '00:00' from generate_series(0, 6) d;
insert into public.bookable_resource (id, merchant_id, model, name, price_cents, duration_minutes,
                                      instant_confirm, active)
values ('c1130000-0000-4000-8000-0000000000b1', 'c1130000-0000-4000-8000-00000000000a', 'exclusive',
        '[Chair 113]', 100000, 60, true, true),
       ('c1130000-0000-4000-8000-0000000000b2', 'c1130000-0000-4000-8000-00000000000a', 'exclusive',
        '[Free chat 113]', 0, 30, true, true);

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('c1130000-0000-4000-8000-0000000000c0', 'multi_unit', '[Host 113]', '+254700113000',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.host_user (host_id, user_id, role)
values ('c1130000-0000-4000-8000-0000000000c0', 'c1130000-0000-4000-8000-000000000003', 'owner');
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('c1130000-0000-4000-8000-0000000000c1', 'c1130000-0000-4000-8000-0000000000c0',
        'block-113', '[Block 113]', 'apartment_block', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('c1130000-0000-4000-8000-0000000000c2', 'c1130000-0000-4000-8000-0000000000c0',
        'c1130000-0000-4000-8000-0000000000c1', 'A', 'A', '[Address]', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 2, 7000);

create temporary table t (k text primary key, v text);
grant all on t to authenticated;

-- ═════════════════════════════════════════ a guest books a time

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);

select throws_ok(
  $$select public.rpc_booking_create('c1130000-0000-4000-8000-0000000000b1',
      (current_date + 2)::timestamptz + interval '10 hours')$$,
  '22023', 'Add the name to book under',
  'A guest gives the name to book under.');

insert into t select 'b1', (public.rpc_booking_create('c1130000-0000-4000-8000-0000000000b1',
  (current_date + 2)::timestamptz + interval '10 hours', p_guest_name => '  Wanjiru   Kamau ')).id::text;
reset role;

select is((select status::text from public.booking where id = (select v::uuid from t where k = 'b1')),
  'pending', 'A guest can book; the booking waits for payment, even where the business confirms at once.');
select ok((select payment_due_by between now() + interval '14 minutes' and now() + interval '16 minutes'
             from public.booking where id = (select v::uuid from t where k = 'b1')),
  'It must be paid within 15 minutes.');
select is((select guest_name from public.booking where id = (select v::uuid from t where k = 'b1')),
  'Wanjiru Kamau', 'The name is kept tidy.');
insert into t select 'ref', code from public.reservation_code where booking_id = (select v::uuid from t where k = 'b1');
select matches((select v from t where k = 'ref'), '^[A-HJKMNP-Z2-9]{6}$', 'The customer booking has a six-character code.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
insert into t select 'b2', (public.rpc_booking_create('c1130000-0000-4000-8000-0000000000b1',
  (current_date + 3)::timestamptz + interval '10 hours', p_guest_name => 'Wanjiru')).id::text;
select throws_ok(
  $$select public.rpc_booking_create('c1130000-0000-4000-8000-0000000000b1',
      (current_date + 4)::timestamptz + interval '10 hours', p_guest_name => 'Wanjiru')$$,
  '22023', 'You already have two bookings waiting for payment. Pay for or cancel one first.',
  'A session cannot sit on more than two unpaid bookings.');
select is(public.rpc_my_booking_code((select v::uuid from t where k = 'b1')), null,
  'Before it is paid, the guest has no code to show.');
select is((select (x ->> 'awaiting_payment')::boolean from jsonb_array_elements(public.rpc_my_bookings()) x
            where x ->> 'id' = (select v from t where k = 'b1')),
  true, 'The guest''s list says the booking is waiting for payment.');
select throws_ok($$select public.fn_booking_mark_paid((select v::uuid from t where k = 'b1'), 100000, 'X')$$,
  '42501', null, 'A customer cannot mark their own booking paid.');

-- A free booking has nothing to pay.
insert into t select 'free', (public.rpc_booking_create('c1130000-0000-4000-8000-0000000000b2',
  (current_date + 5)::timestamptz + interval '10 hours', p_guest_name => 'Wanjiru')).id::text;
reset role;
select is((select status::text from public.booking where id = (select v::uuid from t where k = 'free')),
  'confirmed', 'A free booking is confirmed as before.');

-- ═════════════════════════════════════════ the business cannot confirm it unpaid

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_booking_set_status((select v::uuid from t where k = 'b1'), 'confirmed')$$,
  '22023', 'This booking is not paid yet. It is confirmed when the customer pays.',
  'The business cannot confirm an unpaid customer booking.');
select is(public.rpc_merchant_booking_check_in((select v from t where k = 'ref')) ->> 'reason',
  'not_paid', 'Nor check the customer in before they pay.');
select throws_ok($$select count(*) from public.reservation_code$$, '42501', null,
  'The business cannot read the codes.');
reset role;

-- ═════════════════════════════════════════ the payment plugs in

select is(public.fn_booking_mark_paid((select v::uuid from t where k = 'b1'), 5000, 'PAY-113-1') ->> 'reason',
  'amount_mismatch', 'A wrong amount does not confirm it.');
select is(public.fn_booking_mark_paid((select v::uuid from t where k = 'b1'), 100000, 'PAY-113-1') ->> 'ok',
  'true', 'The exact amount, in time, does.');
select is((select status::text || ' ' || paid_cents::text || ' ' || (payment_due_by is null)::text
             from public.booking where id = (select v::uuid from t where k = 'b1')),
  'confirmed 100000 true', 'Paid, the booking is confirmed.');
select is(public.fn_booking_mark_paid((select v::uuid from t where k = 'b1'), 100000, 'PAY-113-1') ->> 'reason',
  'already_paid', 'The same payment twice changes nothing.');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
select is(public.rpc_my_booking_code((select v::uuid from t where k = 'b1')), (select v from t where k = 'ref'),
  'Paid, the guest sees the code to show.');
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(public.rpc_my_booking_code((select v::uuid from t where k = 'b1')), null,
  'Nobody else gets it.');
reset role;

-- The second booking is never paid; its deadline passes.
update public.booking set payment_due_by = now() - interval '1 minute'
 where id = (select v::uuid from t where k = 'b2');
select cmp_ok(public.fn_booking_release_stale('c1130000-0000-4000-8000-0000000000b1'), '>=', 1,
  'An unpaid booking past its deadline is released.');
select is((select status::text from public.booking where id = (select v::uuid from t where k = 'b2')),
  'cancelled', 'And its time is free again.');
select is(public.fn_booking_mark_paid((select v::uuid from t where k = 'b2'), 100000, 'PAY-113-2') ->> 'reason',
  'hold_expired', 'A payment that lands after that is refused, for a refund.');
select is((select count(*)::int from audit.audit_event
            where action = 'booking.payment_late' and target_id = (select v::uuid from t where k = 'b2')),
  1, 'And it is logged so staff refund it.');

-- ═════════════════════════════════════════ the code at the counter


set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is(public.rpc_merchant_booking_by_code((select v from t where k = 'ref')) ->> 'reason',
  'not_found', 'Another business cannot look the code up.');

select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.rpc_merchant_booking_by_code(
            lower(substr((select v from t where k = 'ref'), 1, 3) || '-' || substr((select v from t where k = 'ref'), 4)))
          -> 'booking' ->> 'reservation_name',
  'Wanjiru Kamau', 'The business finds it as typed, in any case and with a dash.');
select is(public.rpc_merchant_booking_check_in((select v from t where k = 'ref'), 'Achieng') ->> 'reason',
  'name_mismatch', 'A different name is caught.');
select is(public.rpc_merchant_booking_check_in((select v from t where k = 'ref'), 'wanjiru kamau') ->> 'ok',
  'true', 'The right code and name check the customer in.');
select is(public.rpc_merchant_booking_check_in((select v from t where k = 'ref')) ->> 'reason',
  'used', 'A used code stops working.');
-- Eight more wrong codes make ten wrong attempts by this person (one name, nine codes).
select count(public.rpc_merchant_booking_by_code('ZZZZZ' || chr(64 + g))) from generate_series(1, 8) g;
select is(public.rpc_merchant_booking_by_code('ZZZZZY') ->> 'reason', 'not_found', 'The ninth wrong code still answers.');
select is(public.rpc_merchant_booking_by_code((select v from t where k = 'ref')) ->> 'reason',
  'too_many_attempts', 'After ten wrong attempts in 15 minutes, even a right code waits.');

select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
select is(public.rpc_my_booking_code((select v::uuid from t where k = 'b1')), null,
  'Once used, the customer has no code to show.');
reset role;
select ok((select checked_in_at is not null and checked_in_by = 'c1130000-0000-4000-8000-000000000002'
             from public.booking where id = (select v::uuid from t where k = 'b1')),
  'The check-in is recorded, with who did it.');

-- ═════════════════════════════════════════ a guest holds a stay and pays

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
select throws_ok(
  $$select public.rpc_stay_hold('c1130000-0000-4000-8000-0000000000c2', current_date + 10, current_date + 12)$$,
  '22023', 'Add the name to book under.', 'A guest gives the name to book under for a stay too.');
insert into t select 'stay', public.rpc_stay_hold('c1130000-0000-4000-8000-0000000000c2',
  current_date + 10, current_date + 12, '{"first_name":"Wanjiru"}')::text;
reset role;
insert into t select 'scode', code from public.reservation_code
 where stay_id = (select (v::jsonb ->> 'stay_id')::uuid from t where k = 'stay');
select matches((select v from t where k = 'scode'), '^[A-HJKMNP-Z2-9]{6}$', 'The stay has a six-character code.');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
select is(public.rpc_my_stay_code((select (v::jsonb ->> 'stay_id')::uuid from t where k = 'stay')), null,
  'Held and unpaid, the guest has no code yet.');
select is(public.rpc_payment_begin_stay((select (v::jsonb ->> 'stay_id')::uuid from t where k = 'stay')) ->> 'ok',
  'true', 'A guest can pay for the stay; no email is needed.');
select is(public.rpc_stay_checkout_status((select (v::jsonb ->> 'stay_id')::uuid from t where k = 'stay')) ->> 'booking_code',
  null, 'Their checkout shows no code before payment.');

select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.rpc_host_stay_check_in((select v from t where k = 'scode')) ->> 'reason',
  'not_paid', 'The host cannot check in an unpaid stay.');
reset role;

-- The payment settles (what the M-Pesa callback does), and the stay is booked.
update public.stay set status = 'booked', paid_kes = 14000, hold_expires_at = null, confirmed_at = now()
 where id = (select (v::jsonb ->> 'stay_id')::uuid from t where k = 'stay');
update public.stay set check_in = now() - interval '1 hour'
 where id = (select (v::jsonb ->> 'stay_id')::uuid from t where k = 'stay');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
select is(public.rpc_my_stay_code((select (v::jsonb ->> 'stay_id')::uuid from t where k = 'stay')),
  (select v from t where k = 'scode'), 'Paid, the guest sees the stay code.');
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is(public.rpc_host_stay_by_code((select v from t where k = 'scode')) ->> 'reason',
  'not_found', 'Someone who is not the host cannot look it up.');
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.rpc_host_stay_by_code(lower((select v from t where k = 'scode'))) -> 'stay' ->> 'paid',
  'true', 'The host finds the paid stay by its code.');
select is(public.rpc_host_stay_check_in((select v from t where k = 'scode'), 'WANJIRU') -> 'stay' ->> 'status',
  'in_stay', 'The code and name check the guest in.');
select is(public.rpc_host_stay_check_in((select v from t where k = 'scode')) ->> 'reason',
  'used', 'The stay code then stops working.');
reset role;

-- ═════════════════════════════════════════ test payments (20270111000800)

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000004","role":"authenticated"}', true);
insert into t select 'sim', (public.rpc_booking_create('c1130000-0000-4000-8000-0000000000b1',
  (current_date + 6)::timestamptz + interval '10 hours', p_guest_name => 'Amina')).id::text;
select throws_ok($$select public.rpc_booking_pay_simulated((select v::uuid from t where k = 'sim'))$$,
  '42501', 'Test payments are switched off.', 'Test payments are off unless switched on.');
reset role;

insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, reason)
select 'payments.simulated_bookings', 'city', id, to_jsonb(true), 'active', now() - interval '1 minute', 'test 116'
  from public.city where slug = 'nairobi';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok($$select public.rpc_booking_pay_simulated((select v::uuid from t where k = 'sim'))$$,
  '42501', 'That booking is not yours.', 'Nobody can test-pay someone else''s booking.');
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is(public.rpc_booking_pay_simulated((select v::uuid from t where k = 'sim')) ->> 'ok',
  'true', 'Switched on, the customer confirms with a test payment.');
select matches(public.rpc_my_booking_code((select v::uuid from t where k = 'sim')), '^[A-HJKMNP-Z2-9]{6}$',
  'And gets their code.');
reset role;
select is((select status::text || ' ' || paid_simulated::text || ' ' || left(payment_reference, 4)
             from public.booking where id = (select v::uuid from t where k = 'sim')),
  'confirmed true SIM-', 'It is confirmed, but marked as a test payment.');
insert into t select 'simcode', code from public.reservation_code where booking_id = (select v::uuid from t where k = 'sim');
-- The business's lock-out from the wrong codes above has run out.
update public.reservation_code_attempt set at = now() - interval '16 minutes'
 where actor = 'c1130000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.rpc_merchant_booking_by_code((select v from t where k = 'simcode')) -> 'booking' ->> 'test_payment',
  'true', 'The business sees it was a test payment.');
reset role;

-- ═════════════════════════════════════════ app bookings and erasure

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$
  insert into public.customer_engine_booking (merchant_id, engine_booking_id, customer_token, customer_ref)
  values ('c1130000-0000-4000-8000-00000000000a', 'bk_113_forged', 'tok_113_private_value_123456',
          'account_c1130000-0000-4000-8000-000000000005')
$$, '23514', null, 'A saved booking cannot carry someone else''s reference.');
select lives_ok($$
  insert into public.customer_engine_booking
    (merchant_id, engine_booking_id, customer_token, customer_ref, booking_code, reservation_name,
     payment_state, amount_due_cents, hold_expires_at)
  values ('c1130000-0000-4000-8000-00000000000a', 'bk_113_one', 'tok_113_private_value_123456',
          'account_c1130000-0000-4000-8000-000000000004', 'K7QM4X', 'Amina', 'awaiting_payment',
          150000, now() + interval '15 minutes'),
         ('c1130000-0000-4000-8000-00000000000b', 'bk_113_two', 'tok_113_private_value_654321',
          'account_c1130000-0000-4000-8000-000000000004', 'P3RT8W', 'Amina', 'provider_verified',
          0, null)
$$, 'Her app bookings keep the code, name and what is left to pay.');
select is(public.rpc_my_engine_booking_code('c1130000-0000-4000-8000-00000000000a', 'bk_113_one'), null,
  'Unpaid, the app booking has no code to show.');
select lives_ok($$
  update public.customer_engine_booking set payment_state = 'provider_verified', amount_due_cents = 0,
         status = 'confirmed'
   where engine_booking_id = 'bk_113_one'
$$, 'The payment state is refreshed after the engine answers.');
select is(public.rpc_my_engine_booking_code('c1130000-0000-4000-8000-00000000000a', 'bk_113_one'), 'K7QM4X',
  'Paid and confirmed, she sees its code.');
-- The engine already forgot her at the second business (the app asked before deleting).
update public.customer_engine_booking set forgotten_at = now() where engine_booking_id = 'bk_113_two';
select throws_ok($$select count(*) from public.engine_booking_erasure$$, '42501', null,
  'Customers cannot see the erasure queue.');
reset role;

-- She deletes her account.
delete from auth.users where id = 'c1130000-0000-4000-8000-000000000004';
select is((select count(*)::int from public.customer_engine_booking
            where customer_ref = 'account_c1130000-0000-4000-8000-000000000004'),
  0, 'Her saved bookings go with the account.');
select is((select string_agg(merchant_id::text || ' ' || customer_ref, ',') from public.engine_booking_erasure
            where customer_ref = 'account_c1130000-0000-4000-8000-000000000004'),
  'c1130000-0000-4000-8000-00000000000a account_c1130000-0000-4000-8000-000000000004',
  'The engine erasure is queued for the business that has not forgotten her yet.');
select is((select count(*)::int from public.fn_engine_booking_erasure_next(5)
            where customer_ref = 'account_c1130000-0000-4000-8000-000000000004'),
  1, 'The website''s worker picks it up.');

select * from finish();
rollback;
