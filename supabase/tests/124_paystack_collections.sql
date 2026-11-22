-- Paystack collections: only Paystack's signed word, or a verify answer the
-- server fetched with the secret key, pays an order; test money stays out of
-- the books and away from real shops.

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create function pg_temp.ps_sign(p_body text, p_key text default 'sk_test_ci_only_0123456789abcdef') returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_key, 'UTF8'), 'sha512'), 'hex')
$$;

create function pg_temp.ps_event(p_event text, p_reference text, p_id bigint, p_amount bigint,
                                 p_status text default 'success', p_currency text default 'KES') returns text
language sql as $$
  select jsonb_build_object('event', p_event,
    'data', jsonb_build_object('id', p_id, 'reference', p_reference, 'status', p_status,
      'amount', p_amount, 'currency', p_currency, 'channel', 'card', 'fees', 4350,
      'gateway_response', case when p_status = 'success' then 'Approved' else 'Declined' end))::text
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c1230000-0000-4000-8000-000000000021', 'authenticated',
        'authenticated', 'paystack.guest@example.com', '', now(), now(), now()),
       ('00000000-0000-0000-0000-000000000000', 'c1230000-0000-4000-8000-000000000022', 'authenticated',
        'authenticated', 'someone.else@example.com', '', now(), now(), now());
insert into public.guest (id, phone, name, user_id)
values ('c1230000-0000-4000-8000-000000000001', '+254700012301', '[Paystack guest]',
        'c1230000-0000-4000-8000-000000000021');

-- Two shops: the first takes test payments, the second is a real shop.
with shops as (
  select m.id as merchant_id, m.city_id, b.id as branch_id,
         row_number() over (order by m.id) as n
    from public.merchant m
    join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
   where m.city_id is not null
), orders(id, reference, shop) as (
  values ('c1230000-0000-4000-8000-000000000011'::uuid, 'PS-TEST-PAID', 1),
         ('c1230000-0000-4000-8000-000000000012'::uuid, 'PS-TEST-SHORT', 1),
         ('c1230000-0000-4000-8000-000000000013'::uuid, 'PS-REAL-SHOP', 2),
         ('c1230000-0000-4000-8000-000000000014'::uuid, 'PS-LIVE-PAID', 2)
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select o.id, o.reference, 'c1230000-0000-4000-8000-000000000001', s.merchant_id, s.branch_id,
  s.city_id, 'web', '[Fixture address]', 'confirmed', 'mpesa_stk', 'pending',
  150000, 0, 0, 150000, 'KES'
from orders o join shops s on s.n = o.shop;

update public.merchant set accepts_test_payments = true
 where id = (select merchant_id from public.order where reference = 'PS-TEST-PAID');
update public.merchant set accepts_test_payments = false
 where id = (select merchant_id from public.order where reference = 'PS-REAL-SHOP');

select ok((select count(*) from public.order where reference like 'PS-%') = 4
          and (select count(distinct merchant_id) from public.order where reference like 'PS-%') = 2,
  'fixtures: four orders across a test shop and a real shop');

-- The guest, paying.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1230000-0000-4000-8000-000000000021","role":"authenticated"}', true);

select set_config('t.ref_paid', public.rpc_payment_begin_order('c1230000-0000-4000-8000-000000000011') ->> 'reference', true);
select set_config('t.ref_short', public.rpc_payment_begin_order('c1230000-0000-4000-8000-000000000012') ->> 'reference', true);
select set_config('t.ref_real', public.rpc_payment_begin_order('c1230000-0000-4000-8000-000000000013') ->> 'reference', true);
select set_config('t.ref_live', public.rpc_payment_begin_order('c1230000-0000-4000-8000-000000000014') ->> 'reference', true);

select is(public.rpc_order_payment_state('c1230000-0000-4000-8000-000000000011') ->> 'status',
  'unpaid', 'a begun payment with no try yet is unpaid');

select throws_ok(
  format($$select public.rpc_payment_paystack_attempt(%L, 'card', null, 'sk_test_wrong')$$, current_setting('t.ref_paid')),
  '42501', null, 'starting a Paystack try needs the server''s Paystack key');
select throws_ok(
  format($$select public.rpc_payment_paystack_attempt(%L, 'card', null, 'sk_test_ci_only_0123456789abcdef')$$, current_setting('t.ref_real')),
  '22023', null, 'test keys are refused for a real shop');
select throws_ok(
  format($$select public.rpc_payment_paystack_attempt(%L, 'mpesa', '0712345678', 'sk_test_ci_only_0123456789abcdef')$$, current_setting('t.ref_paid')),
  '22023', null, 'a phone prompt needs a +254 number');

select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref_paid'), 'card', null, 'sk_test_ci_only_0123456789abcdef') ->> 'attempt_reference',
  current_setting('t.ref_paid') || '-1', 'a card try gets its own Paystack reference');
select is(
  public.rpc_payment_paystack_opened(current_setting('t.ref_paid') || '-1', 'acc_ci',
    'https://checkout.paystack.com/ci-page', null, 'sk_test_ci_only_0123456789abcdef') ->> 'outcome',
  'opened', 'the checkout page is recorded');
select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref_paid'), 'card', null, 'sk_test_ci_only_0123456789abcdef') ->> 'authorization_url',
  'https://checkout.paystack.com/ci-page', 'a second tap reuses the open page instead of opening another');
select is(public.rpc_order_payment_state('c1230000-0000-4000-8000-000000000011') ->> 'status',
  'pending', 'with a page open the order shows pending');

-- An M-Pesa prompt, then a double tap.
select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref_short'), 'mpesa', '+254712345678', 'sk_test_ci_only_0123456789abcdef') ->> 'attempt_reference',
  current_setting('t.ref_short') || '-1', 'an M-Pesa try is opened');
select public.rpc_payment_paystack_opened(current_setting('t.ref_short') || '-1', null, null, null,
  'sk_test_ci_only_0123456789abcdef');
select ok(
  (public.rpc_payment_paystack_attempt(current_setting('t.ref_short'), 'mpesa', '+254712345678', 'sk_test_ci_only_0123456789abcdef') ->> 'retry_after_seconds')::int > 0,
  'a second tap within three minutes sends no second prompt');

-- Live keys for the real shop.
select is(
  public.rpc_payment_paystack_attempt(current_setting('t.ref_live'), 'card', null, 'sk_live_ci_only_0123456789abcdef') ->> 'is_test',
  'false', 'live keys work for a real shop');
select public.rpc_payment_paystack_opened(current_setting('t.ref_live') || '-1', 'acc_live',
  'https://checkout.paystack.com/ci-live', null, 'sk_live_ci_only_0123456789abcdef');
reset role;

select is(
  (select provider || ':' || state::text || ':' || is_test from public.payment where reference = current_setting('t.ref_paid')),
  'paystack:authorised:true', 'the payment now waits on Paystack, in test mode');

-- Signed events.
select set_config('t.paid_body', pg_temp.ps_event('charge.success', current_setting('t.ref_paid') || '-1', 9001, 150000), true);
select set_config('t.paid_sig', pg_temp.ps_sign(current_setting('t.paid_body')), true);
select set_config('t.live_signed_test', pg_temp.ps_sign(current_setting('t.paid_body'), 'sk_live_ci_only_0123456789abcdef'), true);
select set_config('t.short_body', pg_temp.ps_event('charge.success', current_setting('t.ref_short') || '-1', 9002, 100000), true);
select set_config('t.short_sig', pg_temp.ps_sign(current_setting('t.short_body')), true);
select set_config('t.usd_body', pg_temp.ps_event('charge.success', current_setting('t.ref_paid') || '-1', 9003, 150000, 'success', 'USD'), true);
select set_config('t.usd_sig', pg_temp.ps_sign(current_setting('t.usd_body')), true);
select set_config('t.other_body', pg_temp.ps_event('transfer.success', current_setting('t.ref_paid') || '-1', 9004, 150000), true);
select set_config('t.other_sig', pg_temp.ps_sign(current_setting('t.other_body')), true);

-- Paystack calls in, as anyone on the internet could.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.rpc_payment_paystack_webhook(current_setting('t.paid_body'), repeat('ab', 64))$$,
  '42501', null, 'a forged signature is refused');
select throws_ok(
  $$select public.rpc_payment_paystack_webhook(current_setting('t.paid_body') || ' ', current_setting('t.paid_sig'))$$,
  '42501', null, 'a body changed after signing is refused');
select is(
  public.rpc_payment_paystack_webhook(current_setting('t.paid_body'), current_setting('t.live_signed_test')) ->> 'reason',
  'mode_mismatch', 'a live-signed event cannot pay a test payment');
select is(
  public.rpc_payment_paystack_webhook(current_setting('t.other_body'), current_setting('t.other_sig')) ->> 'ignored',
  'true', 'events other than charges change nothing');
select is(
  public.rpc_payment_paystack_webhook(current_setting('t.usd_body'), current_setting('t.usd_sig')) ->> 'reason',
  'currency_mismatch', 'a payment in another currency does not settle a KES order');
select is(
  public.rpc_payment_paystack_webhook(current_setting('t.paid_body'), current_setting('t.paid_sig')) ->> 'state',
  'paid', 'Paystack''s signed success settles the payment');
select is(
  public.rpc_payment_paystack_webhook(current_setting('t.paid_body'), current_setting('t.paid_sig')) ->> 'duplicate',
  'true', 'the same event a second time does nothing');
select is(
  public.rpc_payment_paystack_webhook(current_setting('t.short_body'), current_setting('t.short_sig')) ->> 'reason',
  'amount_mismatch', 'Paystack settling less than was asked is refused');
select throws_ok(
  $$select count(*) from public.paystack_attempt$$,
  '42501', null, 'the attempts table cannot be read with the public key');
reset role;

select is((select payment_status::text from public.order where reference = 'PS-TEST-PAID'),
  'paid', 'the order is paid');
select is((select provider_fee_cents from public.payment where reference = current_setting('t.ref_paid')),
  4350::bigint, 'Paystack''s fee is recorded on the payment');
select is((select count(*)::int from public.order_event e join public.order o on o.id = e.order_id
            where o.reference = 'PS-TEST-PAID' and e.kind = 'paid'),
  1, 'the order is marked paid once');
select is((select count(*)::int from ledger.transaction
            where idempotency_key = 'sale:c1230000-0000-4000-8000-000000000011'),
  0, 'a test payment posts nothing to the ledger');

-- A second success on another try, for a payment already paid.
update public.paystack_attempt set outcome = null where reference = current_setting('t.ref_paid') || '-1';
insert into public.paystack_attempt (payment_id, reference, channel, is_test, opened_at)
select id, reference || '-9', 'card', true, now() from public.payment where reference = current_setting('t.ref_paid');
select set_config('t.again_body', pg_temp.ps_event('charge.success', current_setting('t.ref_paid') || '-9', 9005, 150000), true);
select is(
  public.rpc_payment_paystack_webhook(current_setting('t.again_body'), pg_temp.ps_sign(current_setting('t.again_body'))) ->> 'reason',
  'already_paid_other_attempt', 'money taken twice is not applied twice');
select is((select count(*)::int from audit.audit_event
            where action = 'payment.paystack_unmatched' and target_id =
              (select id from public.payment where reference = current_setting('t.ref_paid'))),
  1, 'and Finance is told');

-- The worker, asking Paystack about the live payment whose webhook is late.
update public.paystack_attempt set opened_at = now() - interval '10 minutes'
 where reference = current_setting('t.ref_live') || '-1';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select * from public.rpc_payment_paystack_due('not-a-key')$$,
  '42501', null, 'listing late attempts needs a Paystack key');
select ok(
  exists (select 1 from public.rpc_payment_paystack_due('sk_live_ci_only_0123456789abcdef')
           where attempt_reference = current_setting('t.ref_live') || '-1'),
  'the late live attempt is due a check');
select throws_ok(
  format($$select public.rpc_payment_paystack_verified(%L, %L, 'not-a-key')$$,
    current_setting('t.ref_live') || '-1',
    jsonb_build_object('status', true, 'data', pg_temp.ps_event('charge.success', current_setting('t.ref_live') || '-1', 9006, 150000)::jsonb -> 'data')::text),
  '42501', null, 'a verify answer needs the server''s Paystack key');
select is(
  public.rpc_payment_paystack_verified(current_setting('t.ref_live') || '-1',
    jsonb_build_object('status', true, 'data', pg_temp.ps_event('charge.success', current_setting('t.ref_live') || '-1', 9006, 150000)::jsonb -> 'data')::text,
    'sk_live_ci_only_0123456789abcdef') ->> 'state',
  'paid', 'Paystack''s verify answer settles a payment whose webhook never came');
reset role;

select is(
  (select sum(e.debit) from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key = 'sale:c1230000-0000-4000-8000-000000000014'
      and e.account_code = 'cash.card_processor_receivable')::bigint,
  150000::bigint, 'a live Paystack payment is held at the processor in the ledger');

-- Someone else cannot read the order's payment.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1230000-0000-4000-8000-000000000022","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_order_payment_state('c1230000-0000-4000-8000-000000000011')$$,
  '42501', null, 'another customer cannot read the order''s payment');
reset role;

select * from finish();
rollback;
