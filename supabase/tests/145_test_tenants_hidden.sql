-- Test tenants (20270228000300): a shop or home marked accepts_test_payments
-- is seen and used only by payment_reviewer accounts and staff, and never
-- takes live money.
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);
-- Property review (20270323000100): the homes in this file count as reviewed and approved.
alter table public.property alter column review_status set default 'approved';

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1450000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'ordinary145@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1450000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'reviewer145@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1450000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'staff145@example.test', now(), false, now(), now());

insert into public.payment_reviewer (user_id, note)
values ('c1450000-0000-4000-8000-000000000002', 'Apple review account (test 145)');
insert into public.staff_user (id, user_id, email, display_name)
values ('c1450000-0000-4000-8000-0000000000f3', 'c1450000-0000-4000-8000-000000000003',
        'staff145@example.test', 'Staff 145');

-- A test shop and a real shop, both live and on Explore.
insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, explore_visible,
                             accepting_orders, went_live_at, accepts_test_payments)
select v.id, v.legal, v.trading, 'restaurant', '[Contact]', v.phone, v.email, c.id, 'live', true,
       true, now() - interval '30 days', v.test
from public.city c
cross join (values
  ('c1450000-0000-4000-8000-00000000000a'::uuid, '[Legal 145 test] Ltd', '[Test Cafe 145]',
   '+254700014500', 'test145@example.test', true),
  ('c1450000-0000-4000-8000-00000000000b'::uuid, '[Legal 145 real] Ltd', '[Real Cafe 145]',
   '+254700014501', 'real145@example.test', false)
) as v(id, legal, trading, phone, email, test)
where c.slug = 'nairobi';
insert into public.merchant_branch (id, merchant_id, name, is_primary)
values ('c1450000-0000-4000-8000-0000000000ba', 'c1450000-0000-4000-8000-00000000000a', '[Main]', true),
       ('c1450000-0000-4000-8000-0000000000bb', 'c1450000-0000-4000-8000-00000000000b', '[Main]', true);
insert into public.guest (id, phone, name, user_id)
values ('c1450000-0000-4000-8000-0000000000e1', '+254700014510', '[Guest 145]',
        'c1450000-0000-4000-8000-000000000001');

-- A test home and a real one.
insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('c1451000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 145]', '+254700014520',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, accepts_test_payments)
select v.id, 'c1451000-0000-4000-8000-00000000000a', v.slug, v.name, 'apartment_block', 'Kilimani',
       (select id from public.city where slug = 'nairobi'), true, now(), v.test
from (values
  ('c1452000-0000-4000-8000-00000000000a'::uuid, 'test-home-145', '[Test Home 145]', true),
  ('c1452000-0000-4000-8000-00000000000b'::uuid, 'real-home-145', '[Real Home 145]', false)
) as v(id, slug, name, test);
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
select v.id, 'c1451000-0000-4000-8000-00000000000a', v.property_id, v.name, v.name, '[Address]', 'Kilimani',
       (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 3, 7000
from (values
  ('c1453000-0000-4000-8000-00000000000a'::uuid, 'c1452000-0000-4000-8000-00000000000a'::uuid, 'A'),
  ('c1453000-0000-4000-8000-00000000000b'::uuid, 'c1452000-0000-4000-8000-00000000000b'::uuid, 'B')
) as v(id, property_id, name);

create function pg_temp.as_user(p_user uuid) returns void language sql as $f$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$f$;

create function pg_temp.place(p_id uuid, p_merchant uuid, p_branch uuid, p_method text) returns void
language sql as $f$
  insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
    dropoff_label, stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
  values (p_id, 'T145-' || left(p_id::text, 8) || right(p_id::text, 4),
    'c1450000-0000-4000-8000-0000000000e1', p_merchant, p_branch,
    (select id from public.city where slug = 'nairobi'), 'web', '[Fixture address]', 'confirmed',
    p_method::public.order_payment_method, 'pending', 150000, 0, 0, 150000, 'KES');
$f$;

-- ─────────────────────────────────────────────────────────── who sees them

set local role anon;
select ok(not exists (select 1 from public.merchant_public where id = 'c1450000-0000-4000-8000-00000000000a'),
  'Signed out: the test shop is not listed.');
select is((select is_test from public.merchant_public where id = 'c1450000-0000-4000-8000-00000000000b'),
  false, 'Signed out: the real shop is, marked not a test.');
select throws_ok($$select public.rpc_sees_test_tenants()$$, '42501', null,
  'Signed out, the check cannot even be asked.');
reset role;

set local role authenticated;
select pg_temp.as_user('c1450000-0000-4000-8000-000000000001');
select ok(not exists (select 1 from public.merchant_public where id = 'c1450000-0000-4000-8000-00000000000a'),
  'An ordinary customer does not see the test shop.');
select ok(not exists (select 1 from public.property_public where id = 'c1452000-0000-4000-8000-00000000000a'),
  'Nor the test home.');
select ok(not exists (select 1 from public.property_unit_public where property_id = 'c1452000-0000-4000-8000-00000000000a'),
  'Nor its units.');
select ok(exists (select 1 from public.property_public where id = 'c1452000-0000-4000-8000-00000000000b'),
  'The real home is listed.');
select is(public.rpc_sees_test_tenants(), false, 'An ordinary customer is not a reviewer.');

select pg_temp.as_user('c1450000-0000-4000-8000-000000000002');
select is((select is_test from public.merchant_public where id = 'c1450000-0000-4000-8000-00000000000a'),
  true, 'A reviewer sees the test shop, marked a test.');
select is((select is_test from public.property_public where id = 'c1452000-0000-4000-8000-00000000000a'),
  true, 'And the test home.');
select is(public.rpc_sees_test_tenants(), true, 'The check says yes for a reviewer.');

select pg_temp.as_user('c1450000-0000-4000-8000-000000000003');
select ok(exists (select 1 from public.merchant_public where id = 'c1450000-0000-4000-8000-00000000000a'),
  'Staff see the test shop.');
select is(public.rpc_sees_test_tenants(), true, 'The check says yes for staff.');
reset role;

-- ───────────────────────────────────────────── who may order there, and how

select pg_temp.as_user('c1450000-0000-4000-8000-000000000001');
select throws_ok(
  $$select pg_temp.place('c1450000-0000-4000-8000-0000000000d1', 'c1450000-0000-4000-8000-00000000000a',
      'c1450000-0000-4000-8000-0000000000ba', 'card')$$,
  '22023', 'This merchant is not taking orders.',
  'An ordinary customer cannot order from a test shop, and is told only that it takes no orders.');
select lives_ok(
  $$select pg_temp.place('c1450000-0000-4000-8000-0000000000d2', 'c1450000-0000-4000-8000-00000000000b',
      'c1450000-0000-4000-8000-0000000000bb', 'cash_on_delivery')$$,
  'A real shop is untouched.');

select pg_temp.as_user('c1450000-0000-4000-8000-000000000002');
select lives_ok(
  $$select pg_temp.place('c1450000-0000-4000-8000-0000000000d3', 'c1450000-0000-4000-8000-00000000000a',
      'c1450000-0000-4000-8000-0000000000ba', 'card')$$,
  'A reviewer can order from a test shop by card.');
select throws_ok(
  $$select pg_temp.place('c1450000-0000-4000-8000-0000000000d4', 'c1450000-0000-4000-8000-00000000000a',
      'c1450000-0000-4000-8000-0000000000ba', 'cash_on_delivery')$$,
  '22023', 'A test shop takes test card or M-Pesa payments only.',
  'Not with cash: no real money reaches a test shop.');

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok(
  $$select pg_temp.place('c1450000-0000-4000-8000-0000000000d5', 'c1450000-0000-4000-8000-00000000000a',
      'c1450000-0000-4000-8000-0000000000ba', 'mpesa_stk')$$,
  'Trusted server code may place one.');

-- ─────────────────────────────────────────────────────── paying a test shop

select throws_ok(
  $$insert into public.payment (reference, intent, order_id, merchant_id, amount_cents, created_via, provider)
    values ('T145-PAY-MPESA', 'order', 'c1450000-0000-4000-8000-0000000000d3',
            'c1450000-0000-4000-8000-00000000000a', 150000, 'guest_checkout', 'mpesa')$$,
  '22023', 'Test shops and homes take Paystack test payments only.',
  'M-Pesa straight to a test shop is refused.');
select throws_ok(
  $$insert into public.payment (reference, intent, order_id, merchant_id, amount_cents, created_via, provider, is_test)
    values ('T145-PAY-LIVE', 'order', 'c1450000-0000-4000-8000-0000000000d3',
            'c1450000-0000-4000-8000-00000000000a', 150000, 'guest_checkout', 'paystack', false)$$,
  '22023', 'Test shops and homes take Paystack test payments only.',
  'So is live Paystack.');
select lives_ok(
  $$insert into public.payment (reference, intent, order_id, merchant_id, amount_cents, created_via, provider, is_test)
    values ('T145-PAY-TEST', 'order', 'c1450000-0000-4000-8000-0000000000d3',
            'c1450000-0000-4000-8000-00000000000a', 150000, 'guest_checkout', 'paystack', true)$$,
  'A Paystack test payment goes through.');
select lives_ok(
  $$insert into public.payment (reference, intent, order_id, merchant_id, amount_cents, created_via, provider)
    values ('T145-PAY-REAL', 'order', 'c1450000-0000-4000-8000-0000000000d2',
            'c1450000-0000-4000-8000-00000000000b', 150000, 'guest_checkout', 'mpesa')$$,
  'A real shop still takes M-Pesa.');
select throws_ok(
  $$update public.payment set provider = 'mpesa', is_test = false where reference = 'T145-PAY-TEST'$$,
  '22023', 'Test shops and homes take Paystack test payments only.',
  'A test payment cannot be turned into a live one afterwards.');

-- ─────────────────────────────────────────────────────── staying at a test home

set local role authenticated;
select pg_temp.as_user('c1450000-0000-4000-8000-000000000001');
select throws_like(
  $$select public.rpc_native_stay_hold((public.rpc_native_stay_quote('c1452000-0000-4000-8000-00000000000a',
      'c1453000-0000-4000-8000-00000000000a', current_date + 30, current_date + 32, 1, 0) ->> 'quoteId')::uuid, 'Amina')$$,
  '%',
  'An ordinary customer cannot hold a stay at a test home.');
reset role;

select * from finish();
rollback;
