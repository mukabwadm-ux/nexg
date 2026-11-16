-- Nobody can mark a payment authorised by knowing its reference.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select hasnt_function('public', 'rpc_payment_authorised', array['text', 'text', 'text'],
  'rpc_payment_authorised no longer exists.');

select is(
  (select count(*)::int from public.wiring_anon_allow where function_name = 'rpc_payment_authorised'),
  0, 'Its allow-list row, which claimed a check that did not exist, is gone.');

-- A pending payment, as a guest's checkout leaves it.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c0650000-0000-4000-8000-000000000021', 'authenticated',
        'authenticated', 'pay.guest65@example.test', '', now(), now(), now());
insert into public.guest (id, phone, name, user_id)
values ('c0650000-0000-4000-8000-000000000001', '+254700006501', '[Guest 65]',
        'c0650000-0000-4000-8000-000000000021');

with merchant_fixture as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m join public.merchant_branch b on b.merchant_id = m.id
   where m.city_id is not null order by m.id, b.id limit 1
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select 'c0650000-0000-4000-8000-000000000011', 'PAY-STEP-65', 'c0650000-0000-4000-8000-000000000001',
  m.merchant_id, m.branch_id, m.city_id, 'web', '[Fixture address]', 'placed', 'mpesa_stk', 'pending',
  150000, 0, 0, 150000, 'KES'
from merchant_fixture m;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0650000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select set_config('t.ref', public.rpc_payment_begin_order('c0650000-0000-4000-8000-000000000011') ->> 'reference', true);
reset role;

-- A stranger holding that reference, as anyone who saw the /pay link would.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  format($$select public.rpc_payment_authorised(%L, 'attacker-ref', 'https://pay.example.invalid/')$$,
         current_setting('t.ref')),
  '42883', null, 'The old call no longer reaches anything.');
reset role;

select is(
  (select state::text || ':' || coalesce(authorization_url, '-')
     from public.payment where reference = current_setting('t.ref')),
  'pending:-', 'The payment is still pending, with no link planted on it.');

select * from finish();
rollback;
