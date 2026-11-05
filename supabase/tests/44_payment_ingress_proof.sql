-- Real role grants and settlement behavior. Provider keys here are synthetic,
-- and both the Vault entries and the financial fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

delete from vault.secrets where name in ('daraja_callback_secret', 'paystack_secret_key');

insert into public.guest (id, phone, name)
values ('c0440000-0000-4000-8000-000000000001', '+254700004421', '[Payment proof guest]');

with merchant_fixture as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m join public.merchant_branch b on b.merchant_id = m.id
    where m.city_id is not null order by m.id, b.id limit 1
), orders(id, reference, amount_cents) as (
  values ('c0440000-0000-4000-8000-000000000011'::uuid, 'PROOF-ORDER-MPESA-OK', 10001),
         ('c0440000-0000-4000-8000-000000000012'::uuid, 'PROOF-ORDER-MPESA-WRONG', 10000),
         ('c0440000-0000-4000-8000-000000000013'::uuid, 'PROOF-ORDER-PAYSTACK-OK', 13000),
         ('c0440000-0000-4000-8000-000000000014'::uuid, 'PROOF-ORDER-PAYSTACK-WRONG', 13000)
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select o.id, o.reference, 'c0440000-0000-4000-8000-000000000001', m.merchant_id, m.branch_id,
  m.city_id, 'web', '[Fixture address]', 'confirmed', 'card', 'pending',
  o.amount_cents, 0, 0, o.amount_cents, 'KES'
from orders o cross join merchant_fixture m;

insert into public.payment (reference, intent, order_id, city_id, amount_cents, provider, provider_ref,
  state, created_by, created_via)
select x.reference, 'order', o.id, o.city_id, o.total_cents, x.provider, x.provider_ref,
  x.state::public.payment_state, 'c0440000-0000-4000-8000-000000000021', 'guest_checkout'
from (values
  ('PROOF-ORDER-MPESA-OK', 'PROOF-MPESA-OK', 'paystack', null, 'pending'),
  ('PROOF-ORDER-MPESA-WRONG', 'PROOF-MPESA-WRONG', 'mpesa', 'proof-mpesa-wrong', 'authorised'),
  ('PROOF-ORDER-PAYSTACK-OK', 'PROOF-PAYSTACK-OK', 'paystack', null, 'pending'),
  ('PROOF-ORDER-PAYSTACK-WRONG', 'PROOF-PAYSTACK-WRONG', 'paystack', null, 'pending')
) as x(order_reference, reference, provider, provider_ref, state)
join public.order o on o.reference = x.order_reference;

with paystack_event(kind, body) as (values
  ('valid', '{"event":"charge.success", "data":{"reference":"PROOF-PAYSTACK-OK","status":"success","amount":13000,"id":"proof-paystack-valid","channel":"card"}}'),
  ('missing', '{"event":"charge.success","data":{"reference":"PROOF-PAYSTACK-OK","status":"success","id":"proof-paystack-valid"}}'),
  ('wrong', '{"event":"charge.success","data":{"reference":"PROOF-PAYSTACK-WRONG","status":"success","amount":12999,"id":"proof-paystack-wrong"}}'),
  ('mpesa', '{"event":"charge.success","data":{"reference":"PROOF-MPESA-OK","status":"success","amount":10001,"id":"proof-paystack-mpesa"}}')
)
select set_config('t.paystack.' || kind || '_body', body, true),
  set_config('t.paystack.' || kind || '_signature',
    encode(extensions.hmac(convert_to(body,'UTF8'), convert_to('ci-only-paystack-test-key','UTF8'),'sha512'), 'hex'), true)
from paystack_event;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.rpc_payment_webhook('charge.success','PROOF-PAYSTACK-OK','forged-proof',true,'{}',true,'forged',13000,'card')$$,
  '42501', null, 'An anonymous caller cannot assert its own signature through the worker');
select throws_ok($$select public.fn_tax_issue_order_compliant('c0440000-0000-4000-8000-000000000011')$$,
  '42501', null, 'Anon cannot issue a tax document through the internal helper');
select throws_ok($$select public.rpc_payment_paystack_webhook(current_setting('t.paystack.valid_body'),current_setting('t.paystack.valid_signature'))$$,
  '42501', null, 'A valid signature still requires a configured Vault key');
reset role;

select ok(to_regprocedure('public.rpc_payment_mpesa_callback(text,integer,text,boolean,jsonb,numeric,text,text)') is null,
  'The old boolean-proof Daraja signature is unavailable');
select ok(to_regprocedure('public.rpc_payment_mpesa_sent(text,text,text,text)') is null,
  'The old Daraja prompt write without server proof is unavailable');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c0440000-0000-4000-8000-000000000021","role":"authenticated"}',true);
select throws_ok($$select public.rpc_payment_webhook('charge.success','PROOF-PAYSTACK-OK','forged-auth-proof',true,'{}',true,'forged',13000,'card')$$,
  '42501', null, 'A signed-in caller cannot reach the raw settlement worker either');
select throws_ok($$select public.fn_tax_issue_order_compliant('c0440000-0000-4000-8000-000000000011')$$,
  '42501', null, 'A signed-in caller cannot issue an arbitrary tax document');
select is(public.rpc_payment_mpesa_ready('ci-only-daraja-test-token'), false,
  'The start route is unready before Vault configuration');
reset role;

select vault.create_secret('ci-only-daraja-test-token','daraja_callback_secret');
select vault.create_secret('ci-only-paystack-test-key','paystack_secret_key');

set local role authenticated;
select is(public.rpc_payment_mpesa_ready('ci-only-daraja-test-token'), true,
  'The start route can send a prompt with matching Vault configuration');
select throws_ok($$select public.rpc_payment_mpesa_sent('PROOF-MPESA-OK','proof-mpesa-ok','request','+254700004422','wrong')$$,
  '42501', null, 'An owner cannot bind a provider request without the server token');
select set_config('request.jwt.claims','{"sub":"c0440000-0000-4000-8000-000000000022","role":"authenticated"}',true);
select throws_ok($$select public.rpc_payment_mpesa_sent('PROOF-MPESA-OK','proof-mpesa-ok','request','+254700004422','ci-only-daraja-test-token')$$,
  '42501', null, 'The server token does not bypass payment ownership');
select set_config('request.jwt.claims','{"sub":"c0440000-0000-4000-8000-000000000021","role":"authenticated"}',true);
select is(public.rpc_payment_mpesa_sent('PROOF-MPESA-OK','proof-mpesa-ok','request','+254700004422','ci-only-daraja-test-token')->>'ok', 'true',
  'The owner can record the server-verified provider prompt');
reset role;

set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
select throws_ok($$select public.rpc_payment_mpesa_callback('proof-mpesa-ok',0,'paid','wrong','{}',101,'forged','+254700004422')$$,
  '42501', null, 'A forged direct Daraja call cannot settle payment');
select is(public.rpc_payment_mpesa_callback('proof-mpesa-ok',0,'paid','ci-only-daraja-test-token','{}')->>'reason',
  'invalid_amount', 'Daraja success without an amount is refused');
select is(public.rpc_payment_mpesa_callback('proof-mpesa-wrong',0,'paid','ci-only-daraja-test-token','{}',99)->>'reason',
  'amount_mismatch', 'Daraja checks the amount actually requested');
select is(public.rpc_payment_mpesa_callback('proof-mpesa-ok',0,'paid','ci-only-daraja-test-token','{}',101,'fixture-mpesa-receipt')->>'state',
  'paid', 'A verified whole-shilling Daraja payment settles the original amount');
select is(public.rpc_payment_mpesa_callback('proof-mpesa-ok',0,'paid','ci-only-daraja-test-token','{}',101,'replacement-receipt')->>'duplicate',
  'true', 'A retry cannot settle a Daraja payment again');
select throws_ok($$select public.rpc_payment_paystack_webhook(current_setting('t.paystack.valid_body') || ' ',current_setting('t.paystack.valid_signature'))$$,
  '42501', null, 'Any modification to Paystack raw body invalidates its HMAC');
select is(public.rpc_payment_paystack_webhook(current_setting('t.paystack.missing_body'),current_setting('t.paystack.missing_signature'))->>'reason',
  'invalid_amount', 'Paystack success without an amount is refused');
select is(public.rpc_payment_paystack_webhook(current_setting('t.paystack.mpesa_body'),current_setting('t.paystack.mpesa_signature'))->>'reason',
  'unknown_reference', 'A correctly signed Paystack event cannot target an M-Pesa payment');
select is(public.rpc_payment_paystack_webhook(current_setting('t.paystack.wrong_body'),current_setting('t.paystack.wrong_signature'))->>'reason',
  'amount_mismatch', 'Paystack checks that the signed amount matches the expected amount');
select is(public.rpc_payment_paystack_webhook(current_setting('t.paystack.valid_body'),current_setting('t.paystack.valid_signature'))->>'state',
  'paid', 'The verified Paystack callback settles the payment');
select is(public.rpc_payment_paystack_webhook(current_setting('t.paystack.valid_body'),current_setting('t.paystack.valid_signature'))->>'duplicate',
  'true', 'The Paystack body digest makes retries idempotent');
reset role;

select is((select count(*)::int from public.order where reference like 'PROOF-ORDER-%' and payment_status='paid'),
  2, 'Only the two matched provider callbacks mark an order paid');
select is((select count(*)::int from public.payment where reference in ('PROOF-MPESA-WRONG','PROOF-PAYSTACK-WRONG') and state='failed'),
  2, 'Both mismatches leave their payments failed');
select is((select provider_receipt from public.payment where reference='PROOF-MPESA-OK'),
  'fixture-mpesa-receipt', 'A duplicate does not overwrite the original receipt');
select is((select count(*)::int from public.payment_event where dedupe_key in ('forged-proof','forged-auth-proof')),
  0, 'Denied direct writes leave no settlement events');
select is((select count(*)::int from audit.audit_event a join public.payment p on a.target_id=p.id
  where p.reference='PROOF-MPESA-OK' and a.action in ('payment.mpesa_prompt_sent','payment.mpesa_result_recorded')),
  2, 'The verified prompt and first callback leave separate audit records');

select * from finish();
rollback;
