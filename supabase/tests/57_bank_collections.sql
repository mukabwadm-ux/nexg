-- Bank collections: only a correctly signed, fresh, matching bank event pays an order.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

delete from vault.secrets where name = 'bank_webhook_secret';
select vault.create_secret('ci-only-bank-webhook-secret-0123456789', 'bank_webhook_secret');

create function pg_temp.bank_sign(p_body text, p_age_seconds int default 0) returns text
language sql as $$
  select 't=' || t || ',v1=' || encode(extensions.hmac(convert_to(t || '.' || p_body, 'UTF8'),
           convert_to('ci-only-bank-webhook-secret-0123456789', 'UTF8'), 'sha256'), 'hex')
  from (select (extract(epoch from now())::bigint - p_age_seconds)::text as t) s
$$;

create function pg_temp.bank_event(p_event text, p_reference text, p_collection text, p_status text,
                                   p_amount bigint, p_currency text default 'KES') returns text
language sql as $$
  select jsonb_build_object('id', p_event, 'type', 'collection.' || p_status, 'livemode', false,
    'data', jsonb_build_object('id', p_collection, 'merchant_reference', p_reference,
      'status', p_status, 'amount', p_amount, 'currency', p_currency,
      'bank_reference', 'SBXTEST', 'failure_reason',
      case when p_status = 'failed' then 'The bank declined the payment: insufficient funds.' end))::text
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c0570000-0000-4000-8000-000000000021', 'authenticated',
        'authenticated', 'bank.guest@example.com', '', now(), now(), now());
insert into public.guest (id, phone, name, user_id)
values ('c0570000-0000-4000-8000-000000000001', '+254700005701', '[Bank guest]',
        'c0570000-0000-4000-8000-000000000021');

with merchant_fixture as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m join public.merchant_branch b on b.merchant_id = m.id
   where m.city_id is not null order by m.id, b.id limit 1
), orders(id, reference) as (
  values ('c0570000-0000-4000-8000-000000000011'::uuid, 'BANK-ORDER-PAID'),
         ('c0570000-0000-4000-8000-000000000012'::uuid, 'BANK-ORDER-SHORT'),
         ('c0570000-0000-4000-8000-000000000013'::uuid, 'BANK-ORDER-DECLINED')
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select o.id, o.reference, 'c0570000-0000-4000-8000-000000000001', m.merchant_id, m.branch_id,
  m.city_id, 'web', '[Fixture address]', 'confirmed', 'bank_transfer', 'pending',
  250000, 0, 0, 250000, 'KES'
from orders o cross join merchant_fixture m;

-- The guest begins paying all three by bank.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0570000-0000-4000-8000-000000000021","role":"authenticated"}', true);

select set_config('t.ref_paid', public.rpc_payment_begin_order('c0570000-0000-4000-8000-000000000011') ->> 'reference', true);
select set_config('t.ref_short', public.rpc_payment_begin_order('c0570000-0000-4000-8000-000000000012') ->> 'reference', true);
select set_config('t.ref_declined', public.rpc_payment_begin_order('c0570000-0000-4000-8000-000000000013') ->> 'reference', true);

select ok(current_setting('t.ref_paid') <> '', 'an order chosen for bank payment can begin a payment');

select throws_ok(
  format($$select public.rpc_payment_bank_started(%L, 'bank_sandbox', 'col_paid', 'http://bank.test/checkout/col_paid', 'not-the-secret')$$,
         current_setting('t.ref_paid')),
  '42501', null,
  'opening a collection needs the server''s bank secret');

select throws_ok(
  format($$select public.rpc_payment_bank_started(%L, 'card_provider', 'col_paid', 'http://bank.test/checkout/col_paid', 'ci-only-bank-webhook-secret-0123456789')$$,
         current_setting('t.ref_paid')),
  '22023', null,
  'only bank providers can be recorded this way');

select is(
  public.rpc_payment_bank_started(current_setting('t.ref_paid'), 'bank_sandbox', 'col_paid',
    'http://bank.test/checkout/col_paid', 'ci-only-bank-webhook-secret-0123456789') ->> 'ok',
  'true', 'the collection is recorded against the payment');
select public.rpc_payment_bank_started(current_setting('t.ref_short'), 'bank_sandbox', 'col_short',
  'http://bank.test/checkout/col_short', 'ci-only-bank-webhook-secret-0123456789');
select public.rpc_payment_bank_started(current_setting('t.ref_declined'), 'bank_sandbox', 'col_declined',
  'http://bank.test/checkout/col_declined', 'ci-only-bank-webhook-secret-0123456789');
reset role;

select is(
  (select provider || ':' || state::text || ':' || channel from public.payment where reference = current_setting('t.ref_paid')),
  'bank_sandbox:authorised:bank', 'the payment now waits on the bank');

-- Events, signed here as the bank would sign them.
select set_config('t.paid_body', pg_temp.bank_event('evt_paid', current_setting('t.ref_paid'), 'col_paid', 'succeeded', 250000), true);
select set_config('t.paid_sig', pg_temp.bank_sign(current_setting('t.paid_body')), true);
select set_config('t.stale_sig', pg_temp.bank_sign(current_setting('t.paid_body'), 600), true);
select set_config('t.forged_sig', 't=' || extract(epoch from now())::bigint || ',v1=' || repeat('ab', 32), true);
select set_config('t.pending_body', pg_temp.bank_event('evt_pending', current_setting('t.ref_paid'), 'col_paid', 'processing', 250000), true);
select set_config('t.pending_sig', pg_temp.bank_sign(current_setting('t.pending_body')), true);
select set_config('t.usd_body', pg_temp.bank_event('evt_usd', current_setting('t.ref_paid'), 'col_paid', 'succeeded', 250000, 'USD'), true);
select set_config('t.usd_sig', pg_temp.bank_sign(current_setting('t.usd_body')), true);
select set_config('t.short_body', pg_temp.bank_event('evt_short', current_setting('t.ref_short'), 'col_short', 'succeeded', 100000), true);
select set_config('t.short_sig', pg_temp.bank_sign(current_setting('t.short_body')), true);
select set_config('t.declined_body', pg_temp.bank_event('evt_declined', current_setting('t.ref_declined'), 'col_declined', 'failed', 250000), true);
select set_config('t.declined_sig', pg_temp.bank_sign(current_setting('t.declined_body')), true);
select set_config('t.stray_body', pg_temp.bank_event('evt_stray', current_setting('t.ref_paid'), 'col_old', 'succeeded', 250000), true);
select set_config('t.stray_sig', pg_temp.bank_sign(current_setting('t.stray_body')), true);

-- The bank calls in, as anyone on the internet could.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.paid_body'), current_setting('t.forged_sig'))$$,
  '42501', null, 'a forged signature is refused');
select throws_ok(
  $$select public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.paid_body') || ' ', current_setting('t.paid_sig'))$$,
  '42501', null, 'a body changed after signing is refused');
select throws_ok(
  $$select public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.paid_body'), current_setting('t.stale_sig'))$$,
  '42501', null, 'an event signed ten minutes ago is refused');
select is(
  public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.pending_body'), current_setting('t.pending_sig')) ->> 'ignored',
  'true', 'a still-processing event changes nothing');
select is(
  public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.usd_body'), current_setting('t.usd_sig')) ->> 'reason',
  'currency_mismatch', 'a payment in another currency does not settle a KES order');
select is(
  public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.paid_body'), current_setting('t.paid_sig')) ->> 'state',
  'paid', 'the bank''s signed success settles the payment');
select is(
  public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.paid_body'), current_setting('t.paid_sig')) ->> 'duplicate',
  'true', 'the same event a second time does nothing');
select is(
  public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.short_body'), current_setting('t.short_sig')) ->> 'reason',
  'amount_mismatch', 'a bank settling less than was asked is refused');
select is(
  public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.declined_body'), current_setting('t.declined_sig')) ->> 'state',
  'failed', 'a declined collection fails the payment');
select is(
  public.rpc_payment_bank_webhook('bank_sandbox', current_setting('t.stray_body'), current_setting('t.stray_sig')) ->> 'reason',
  'collection_mismatch', 'money on a collection the payment no longer uses does not settle it');
reset role;

select is((select payment_status::text from public.order where reference = 'BANK-ORDER-PAID'),
  'paid', 'the order is paid');
select is((select provider_receipt from public.payment where reference = current_setting('t.ref_paid')),
  'SBXTEST', 'the bank''s own reference is kept on the payment');
select is((select state::text from public.payment where reference = current_setting('t.ref_short')),
  'failed', 'the short payment is failed, not paid');
select is((select failure_reason from public.payment where reference = current_setting('t.ref_declined')),
  'The bank declined the payment: insufficient funds.', 'the bank''s reason is kept for the guest');
select is(
  (select count(*)::int from public.payment_event
    where provider = 'bank_sandbox' and dedupe_key = 'bank:evt_stray' and not handled),
  1, 'the stray payment is kept, unhandled, for finance');

select is(
  (select count(*)::int from pg_trigger t join pg_proc f on f.oid = t.tgfoid
    where t.tgdeferrable and not t.tgisinternal and not f.prosecdef),
  0, 'deferred checks run as their owner, so a provider callback can commit a paid payment');

select * from finish();
rollback;
