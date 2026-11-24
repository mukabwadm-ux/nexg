-- Customers (20270307000100): who may read and act, what counts as spend,
-- guest orders under their phone, the profile, and the audited actions.

begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;

-- Staff: customer care, view only, someone in Merchants, and a customer.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', u.confirmed, false,
       now() - u.age, now()
from (values
  ('c1950000-0000-4000-8000-0000000000a1'::uuid, 'care195@test.local', now(), interval '1 year'),
  ('c1950000-0000-4000-8000-0000000000a2'::uuid, 'viewer195@test.local', now(), interval '1 year'),
  ('c1950000-0000-4000-8000-0000000000a3'::uuid, 'merchops195@test.local', now(), interval '1 year'),
  ('c1950000-0000-4000-8000-0000000000c1'::uuid, 'amina195@example.test', now(), interval '200 days'),
  ('c1950000-0000-4000-8000-0000000000c3'::uuid, 'new195@example.test', null::timestamptz, interval '1 day')
) as u (id, email, confirmed, age);
update auth.users set raw_user_meta_data = '{"first_name":"Amina","last_name":"Wanjiru"}'
where id = 'c1950000-0000-4000-8000-0000000000c1';
update auth.users set raw_user_meta_data = '{"first_name":"Brand","last_name":"New"}'
where id = 'c1950000-0000-4000-8000-0000000000c3';

insert into public.staff_user (id, user_id, email, display_name) values
  ('c1950000-0000-4000-8000-0000000000b1', 'c1950000-0000-4000-8000-0000000000a1', 'care195@test.local', 'Care 195'),
  ('c1950000-0000-4000-8000-0000000000b2', 'c1950000-0000-4000-8000-0000000000a2', 'viewer195@test.local', 'Viewer 195'),
  ('c1950000-0000-4000-8000-0000000000b3', 'c1950000-0000-4000-8000-0000000000a3', 'merchops195@test.local', 'Merch 195');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select s.id, r.id, null, '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from (values
  ('c1950000-0000-4000-8000-0000000000b1'::uuid, 'customer_care'),
  ('c1950000-0000-4000-8000-0000000000b2'::uuid, 'customer_viewer'),
  ('c1950000-0000-4000-8000-0000000000b3'::uuid, 'merchant_ops')
) as s (id, role_key)
join public.role r on r.key = s.role_key;

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email,
                             city_id, status, went_live_at, explore_visible)
values ('c1950000-0000-4000-8000-0000000000d1', 'Cust195 Kitchen Ltd', 'Cust195 Kitchen', 'restaurants_food', 'Owner',
        '+254712019501', 'kitchen195@shop.example', (select id from public.city where slug = 'nairobi'), 'live',
        now() - interval '90 days', true);
insert into public.bookable_resource (id, merchant_id, name)
values ('c1950000-0000-4000-8000-0000000000d2', 'c1950000-0000-4000-8000-0000000000d1', 'Table 1');

-- Amina has an account and a guest row. The guest without an account
-- ordered signed out from 0711 195 002.
insert into public.guest (id, user_id, phone, name, created_at) values
  ('c1950000-0000-4000-8000-0000000000e1', 'c1950000-0000-4000-8000-0000000000c1', '+254711195001', null, now() - interval '200 days'),
  ('c1950000-0000-4000-8000-0000000000e2', null, '+254711195002', 'Walk-in Otieno', now() - interval '20 days');

-- Amina: two paid orders and a cancelled one; 200 refunded on the first.
-- The guest: one paid order, and a table booking paid by phone (07 format).
insert into public.order (id, reference, guest_id, merchant_id, city_id, channel, dropoff_label, stage, payment_method,
                          payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency,
                          placed_at, cancelled_at, cancel_reason_code)
select o.id, o.ref, o.guest, 'c1950000-0000-4000-8000-0000000000d1', (select id from public.city where slug = 'nairobi'),
       'web', 'Kilimani', o.stage::public.order_stage, 'mpesa_stk', o.pay::public.order_payment_status, o.total, 0, 0, o.total,
       'KES', now() - o.ago, case when o.stage = 'cancelled' then now() - o.ago end,
       case when o.stage = 'cancelled' then 'guest_cancelled' end
from (values
  ('c1950000-0000-4000-8000-000000000101'::uuid, 'C195-1', 'c1950000-0000-4000-8000-0000000000e1'::uuid, 'confirmed', 'partially_refunded', 100000, interval '40 days'),
  ('c1950000-0000-4000-8000-000000000102', 'C195-2', 'c1950000-0000-4000-8000-0000000000e1', 'confirmed', 'paid', 50000, interval '5 days'),
  ('c1950000-0000-4000-8000-000000000103', 'C195-3', 'c1950000-0000-4000-8000-0000000000e1', 'cancelled', 'failed', 70000, interval '4 days'),
  ('c1950000-0000-4000-8000-000000000104', 'C195-4', 'c1950000-0000-4000-8000-0000000000e2', 'confirmed', 'paid', 40000, interval '10 days')
) as o (id, ref, guest, stage, pay, total, ago);

insert into public.refund (order_id, amount_cents, method, reason_code, reason_text, status, issued_at)
values ('c1950000-0000-4000-8000-000000000101', 20000, 'original', 'missing_item', 'One drink missing', 'issued', now() - interval '39 days');

insert into public.payment (reference, intent, order_id, guest_id, amount_cents, state, failure_reason, created_via, provider)
values ('PAY-C195-3', 'order', 'c1950000-0000-4000-8000-000000000103', 'c1950000-0000-4000-8000-0000000000e1',
        70000, 'failed', 'Insufficient funds', 'guest_checkout', 'mpesa');

alter table public.booking disable trigger booking_hours_guard;
insert into public.booking (merchant_id, resource_id, starts_at, ends_at, held_during, status, guest_user_id,
                            guest_name, guest_phone, total_cents, paid_cents, paid_at, created_at)
values ('c1950000-0000-4000-8000-0000000000d1', 'c1950000-0000-4000-8000-0000000000d2',
        now() + interval '1 day', now() + interval '1 day 1 hour',
        tstzrange(now() + interval '1 day', now() + interval '1 day 1 hour'), 'confirmed', null,
        'Otieno', '0711195002', 10000, 10000, now() - interval '2 days', now() - interval '2 days');

-- Amina's paid stay: KES 3,000.
insert into public.stay (host_id, check_in, check_out, status, guest_user_id, paid_kes, created_at)
values ((select id from public.host order by created_at limit 1),
        now() + interval '10 days', now() + interval '12 days', 'booked',
        'c1950000-0000-4000-8000-0000000000c1', 3000, now() - interval '3 days');

set local role authenticated;

-- ─────────────────────────────────────────────────────────── who may read
select pg_temp.as_user('c1950000-0000-4000-8000-0000000000a3');
select throws_ok($$ select public.rpc_customer_list() $$, '42501', null,
  'staff without Customers cannot list customers');
select throws_ok($$ select public.rpc_customer_profile('c1950000-0000-4000-8000-0000000000e1') $$, '42501', null,
  'staff without Customers cannot open a profile');

select pg_temp.as_user('c1950000-0000-4000-8000-0000000000c1');
select throws_ok($$ select public.rpc_customer_list() $$, '42501', null,
  'a customer cannot list customers');

-- ─────────────────────────────────────────────────────────────── the list
select pg_temp.as_user('c1950000-0000-4000-8000-0000000000a2');
insert into t (k, v) select 'list', public.rpc_customer_list(null, 'all', 'all', 'recent', 1, 100)::text;

create function pg_temp.row_of(p_id text) returns jsonb language sql as $f$
  select r from jsonb_array_elements((select v::jsonb from t where k = 'list') -> 'rows') r where r ->> 'id' = p_id
$f$;

select is((select v::jsonb ->> 'level' from t where k = 'list'), 'view', 'the view-only role reads at view level');
select is((pg_temp.row_of('c1950000-0000-4000-8000-0000000000e1') ->> 'spend')::bigint, 430000::bigint,
  'spend is paid orders and stays less the refund (1,000 + 500 + 3,000 - 200)');
select is((pg_temp.row_of('c1950000-0000-4000-8000-0000000000e1') ->> 'purchases')::integer, 3,
  'the failed, cancelled order is not a purchase');
select is(pg_temp.row_of('c1950000-0000-4000-8000-0000000000e1') ->> 'name', 'Amina Wanjiru',
  'the name comes from the account when the guest row has none');
select is((pg_temp.row_of('c1950000-0000-4000-8000-0000000000e2') ->> 'spend')::bigint, 50000::bigint,
  'a guest''s booking made with the same phone in another format counts');
select is((pg_temp.row_of('c1950000-0000-4000-8000-0000000000e2') ->> 'has_account')::boolean, false,
  'the guest without an account is listed under their phone');
select is((pg_temp.row_of('c1950000-0000-4000-8000-0000000000c3') ->> 'purchases')::integer, 0,
  'an account that never ordered is listed by its account id');
select is(pg_temp.row_of('c1950000-0000-4000-8000-0000000000a1'), null,
  'staff accounts are not customers');

select is(
  (select count(*)::integer from jsonb_array_elements(public.rpc_customer_list('0711 195 002') -> 'rows')),
  1, 'search finds a customer by phone in local format');
select is(
  (select count(*)::integer from jsonb_array_elements(public.rpc_customer_list('amina') -> 'rows')
    r where r ->> 'id' = 'c1950000-0000-4000-8000-0000000000e1'),
  1, 'search finds a customer by name');
select is(
  (select count(*)::integer from jsonb_array_elements(public.rpc_customer_list(null, 'guest', 'all', 'recent', 1, 100) -> 'rows')
    r where r ->> 'id' = 'c1950000-0000-4000-8000-0000000000e1'),
  0, 'the guests filter leaves out account holders');

-- ──────────────────────────────────────────────────────────── the profile
insert into t (k, v) select 'p', public.rpc_customer_profile('c1950000-0000-4000-8000-0000000000c1')::text;
select is((select v::jsonb -> 'customer' ->> 'id' from t where k = 'p'), 'c1950000-0000-4000-8000-0000000000e1',
  'opening by account id finds the guest row behind it');
select is((select (v::jsonb -> 'stats' ->> 'gross')::bigint from t where k = 'p'), 450000::bigint,
  'gross is everything paid');
select is((select (v::jsonb -> 'stats' ->> 'refunded')::bigint from t where k = 'p'), 20000::bigint,
  'the issued refund is counted');
select is((select jsonb_array_length(v::jsonb -> 'orders') from t where k = 'p'), 3,
  'every order is listed, the cancelled one too');
select ok((select exists (select 1 from jsonb_array_elements(v::jsonb -> 'transactions') x
            where x ->> 'kind' = 'payment' and x ->> 'state' = 'failed') from t where k = 'p'),
  'the failed payment is in the timeline');
select is((select v::jsonb -> 'customer' ->> 'email' from t where k = 'p'), 'amina195@example.test',
  'contact details are shown in full');
reset role;
select is((select count(*)::integer from audit.audit_event
            where action = 'customer.profile_viewed' and target_id = 'c1950000-0000-4000-8000-0000000000e1'),
  1, 'opening the profile is recorded');
set local role authenticated;

-- ────────────────────────────────────────────────────────────── actions
select pg_temp.as_user('c1950000-0000-4000-8000-0000000000a2');
select throws_ok($$ select public.rpc_customer_note_add('c1950000-0000-4000-8000-0000000000e1', 'Called about a refund') $$,
  '42501', null, 'view-only staff cannot add a note');

select pg_temp.as_user('c1950000-0000-4000-8000-0000000000a1');
select throws_ok($$ select public.rpc_customer_set_suspended('c1950000-0000-4000-8000-0000000000e1', true, '  ') $$,
  '22023', null, 'suspending needs a reason');
select lives_ok($$ select public.rpc_customer_set_suspended('c1950000-0000-4000-8000-0000000000e1', true, 'Chargebacks on three orders') $$,
  'customer care can suspend with a reason');
reset role;
select is((select blocked from public.guest where id = 'c1950000-0000-4000-8000-0000000000e1'), true,
  'a suspended customer is blocked, which order checkout refuses');
set local role authenticated;
select pg_temp.as_user('c1950000-0000-4000-8000-0000000000a1');
select public.rpc_customer_set_suspended('c1950000-0000-4000-8000-0000000000e1', false, 'Bank confirmed the payments');
select public.rpc_customer_set_vip('c1950000-0000-4000-8000-0000000000e1', true, 'Corporate account');
reset role;
select is(
  (select array[blocked, vip] from public.guest where id = 'c1950000-0000-4000-8000-0000000000e1')
    || (select lifted_at is not null from public.guest_block where guest_id = 'c1950000-0000-4000-8000-0000000000e1'),
  array[false, true, true], 'reactivating lifts the block and VIP is set');
set local role authenticated;
select pg_temp.as_user('c1950000-0000-4000-8000-0000000000a1');

-- A note on an account with no guest row yet makes the row.
select public.rpc_customer_note_add('c1950000-0000-4000-8000-0000000000c3', 'Asked us to resend the sign-up email');
select is((select jsonb_array_length(public.rpc_customer_profile('c1950000-0000-4000-8000-0000000000c3') -> 'notes')), 1,
  'the note shows on the profile of an account that never ordered');
select is((public.rpc_customer_verification_resend('c1950000-0000-4000-8000-0000000000c3', 'Customer asked on chat') ->> 'email'),
  'new195@example.test', 'the verification email can be resent to an unverified account');
select throws_ok($$ select public.rpc_customer_verification_resend('c1950000-0000-4000-8000-0000000000e1', 'Asked again') $$,
  '22023', null, 'an account already verified is not sent another');
reset role;

select is(
  (select count(*)::integer from public.fn_wiring_check() w where w.finding ~ 'customer'),
  0, 'the wiring check has nothing to say about the customer functions');

select * from finish();
rollback;
