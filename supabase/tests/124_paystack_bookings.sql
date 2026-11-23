-- Paystack for bookings: a payment is opened only by the server (the Paystack
-- key is the proof, the amount comes from the booking engine), only for the
-- customer's own booking; paid by Paystack's word; settled in the engine once,
-- or kept for a refund when the engine refuses.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');

create function pg_temp.ps_sign(p_body text) returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'),
                convert_to('sk_test_ci_only_0123456789abcdef', 'UTF8'), 'sha512'), 'hex')
$$;
create function pg_temp.ps_paid(p_reference text, p_id bigint, p_amount bigint) returns text
language sql as $$
  select jsonb_build_object('event', 'charge.success',
    'data', jsonb_build_object('id', p_id, 'reference', p_reference, 'status', 'success',
      'amount', p_amount, 'currency', 'KES', 'channel', 'mobile_money', 'fees', 750))::text
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c1240000-0000-4000-8000-0000000000b1', 'authenticated',
        'authenticated', 'booker@example.com', '', now(), now(), now()),
       ('00000000-0000-0000-0000-000000000000', 'c1240000-0000-4000-8000-0000000000b2', 'authenticated',
        'authenticated', 'stranger@example.com', '', now(), now(), now());

insert into public.customer_engine_booking (id, user_id, merchant_id, engine_booking_id, customer_token,
  customer_ref, title, status, total_cents, amount_due_cents)
select 'c1240000-0000-4000-8000-0000000000e1', 'c1240000-0000-4000-8000-0000000000b1', m.id, 'bk_ci_1',
       'customer-token-long-enough-for-ci', 'account_c1240000-0000-4000-8000-0000000000b1',
       '[Braids]', 'held', 150000, 150000
  from public.merchant m where m.city_id is not null order by m.id limit 1;
update public.merchant set accepts_test_payments = true
 where id = (select merchant_id from public.customer_engine_booking where id = 'c1240000-0000-4000-8000-0000000000e1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1240000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_payment_begin_engine_booking('c1240000-0000-4000-8000-0000000000e1', 50000, 'deposit', null, 'not-a-key')$$,
  '42501', null, 'only the server, holding the Paystack key, opens a booking payment');

select set_config('t.ref',
  public.rpc_payment_begin_engine_booking('c1240000-0000-4000-8000-0000000000e1', 50000, 'deposit',
    now() + interval '15 minutes', 'sk_test_ci_only_0123456789abcdef') ->> 'reference', true);
select is(
  public.rpc_payment_begin_engine_booking('c1240000-0000-4000-8000-0000000000e1', 50000, 'deposit',
    now() + interval '15 minutes', 'sk_test_ci_only_0123456789abcdef') ->> 'reference',
  current_setting('t.ref'), 'the same step and amount reuses the live payment');
select set_config('t.ref_full',
  public.rpc_payment_begin_engine_booking('c1240000-0000-4000-8000-0000000000e1', 150000, 'full',
    now() + interval '15 minutes', 'sk_test_ci_only_0123456789abcdef') ->> 'reference', true);
select isnt(current_setting('t.ref_full'), current_setting('t.ref'), 'paying in full instead opens a new payment');
select set_config('t.ref',
  public.rpc_payment_begin_engine_booking('c1240000-0000-4000-8000-0000000000e1', 50000, 'deposit',
    now() + interval '15 minutes', 'sk_test_ci_only_0123456789abcdef') ->> 'reference', true);

select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref'), 'mpesa', '+254712345678',
    'sk_test_ci_only_0123456789abcdef') ->> 'attempt_reference',
  current_setting('t.ref') || '-1', 'a booking payment takes a Paystack try like an order');
select public.rpc_payment_paystack_opened(current_setting('t.ref') || '-1', null, null, null,
  'sk_test_ci_only_0123456789abcdef');
reset role;

select is((select count(*)::int from public.payment
            where customer_engine_booking_id = 'c1240000-0000-4000-8000-0000000000e1'
              and state in ('pending', 'authorised')),
  1, 'one live payment per booking at a time');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select public.rpc_payment_begin_engine_booking('c1240000-0000-4000-8000-0000000000e1', 1, 'full', null, 'sk_test_ci_only_0123456789abcdef')$$,
  '42501', null, 'the public key cannot open a booking payment');
select set_config('t.body', pg_temp.ps_paid(current_setting('t.ref') || '-1', 8101, 50000), true);
select is(public.rpc_payment_paystack_webhook(current_setting('t.body'), pg_temp.ps_sign(current_setting('t.body'))) ->> 'state',
  'paid', 'Paystack''s signed word pays the deposit');
select ok(exists (select 1 from public.rpc_payment_engine_due('sk_test_ci_only_0123456789abcdef')
                   where reference = current_setting('t.ref') and amount_cents = 50000 and is_test),
  'the paid deposit waits to be settled in the booking engine');
select throws_ok($$select * from public.rpc_payment_engine_due('not-a-key')$$, '42501', null,
  'listing payments to settle needs the Paystack key');
select is(public.rpc_payment_engine_settled(current_setting('t.ref'), true, null,
            'sk_test_ci_only_0123456789abcdef') ->> 'settled',
  'true', 'the engine''s acceptance is recorded');
select ok(not exists (select 1 from public.rpc_payment_engine_due('sk_test_ci_only_0123456789abcdef')
                       where reference = current_setting('t.ref')),
  'and it is not settled twice');
reset role;

-- The customer's screen, then the balance.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1240000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is(public.rpc_engine_booking_payment_state('c1240000-0000-4000-8000-0000000000e1') ->> 'step',
  'deposit', 'the customer sees the deposit paid');
select throws_ok(
  $$select public.rpc_payment_begin_engine_booking('c1240000-0000-4000-8000-0000000000e1', 50000, 'deposit', null, 'sk_test_ci_only_0123456789abcdef')$$,
  '22023', null, 'the deposit is not taken twice');
select set_config('t.bal',
  public.rpc_payment_begin_engine_booking('c1240000-0000-4000-8000-0000000000e1', 100000, 'balance',
    null, 'sk_test_ci_only_0123456789abcdef') ->> 'reference', true);
select ok(current_setting('t.bal') <> '', 'the balance can be paid later');

select set_config('request.jwt.claims', '{"sub":"c1240000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_engine_booking_payment_state('c1240000-0000-4000-8000-0000000000e1')$$,
  '42501', null, 'another customer cannot read the booking''s payment');
reset role;

-- A paid payment the engine refuses is kept for a refund.
update public.payment set state = 'paid', paid_at = now(), provider_ref = '8102'
 where reference = current_setting('t.bal');
select is(public.rpc_payment_engine_settled(current_setting('t.bal'), false, 'hold_expired',
            'sk_test_ci_only_0123456789abcdef') ->> 'refund_due',
  'true', 'a refusal from the engine is marked for a refund, and Finance is told');

select * from finish();
rollback;
