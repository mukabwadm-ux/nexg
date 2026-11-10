-- M-Pesa prompts: every prompt counts, a second one cannot charge twice unseen,
-- an early failure does not fail a payment another prompt can still settle.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

delete from vault.secrets where name = 'daraja_callback_secret';
select vault.create_secret('ci-only-daraja-prompt-token', 'daraja_callback_secret');

insert into public.guest (id, phone, name)
values ('c0540000-0000-4000-8000-000000000001', '+254700005401', '[Prompt guest]');

with merchant_fixture as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m join public.merchant_branch b on b.merchant_id = m.id
   where m.city_id is not null order by m.id, b.id limit 1
), orders(id, reference) as (
  values ('c0540000-0000-4000-8000-000000000011'::uuid, 'PROMPT-ORDER-RESEND'),
         ('c0540000-0000-4000-8000-000000000012'::uuid, 'PROMPT-ORDER-TWICE'),
         ('c0540000-0000-4000-8000-000000000013'::uuid, 'PROMPT-ORDER-FAIL'),
         ('c0540000-0000-4000-8000-000000000014'::uuid, 'PROMPT-ORDER-SILENT')
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select o.id, o.reference, 'c0540000-0000-4000-8000-000000000001', m.merchant_id, m.branch_id,
  m.city_id, 'web', '[Fixture address]', 'confirmed', 'mpesa_stk', 'pending',
  50000, 0, 0, 50000, 'KES'
from orders o cross join merchant_fixture m;

insert into public.payment (reference, intent, order_id, city_id, amount_cents, provider,
  state, created_by, created_via)
select replace(o.reference, 'PROMPT-ORDER-', 'PROMPT-PAY-'), 'order', o.id, o.city_id, 50000, 'mpesa',
  'pending', 'c0540000-0000-4000-8000-000000000021', 'guest_checkout'
from public.order o where o.reference like 'PROMPT-ORDER-%';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0540000-0000-4000-8000-000000000021","role":"authenticated"}', true);

-- 1. Sent, then sent again: both prompts are kept.
select public.rpc_payment_mpesa_sent('PROMPT-PAY-RESEND', 'resend-a', 'm-a', '254700005401', 'ci-only-daraja-prompt-token');
select public.rpc_payment_mpesa_sent('PROMPT-PAY-RESEND', 'resend-b', 'm-b', '254700005401', 'ci-only-daraja-prompt-token');
reset role;

select is(
  (select count(*)::int from public.payment_prompt pr join public.payment p on p.id = pr.payment_id
    where p.reference = 'PROMPT-PAY-RESEND'),
  2, 'Sending the prompt again keeps both prompts.');

set local role authenticated;
select is(
  (public.rpc_payment_mpesa_prompt_wait('PROMPT-PAY-RESEND') ->> 'ok')::boolean,
  false, 'A third prompt cannot go out within a minute of the last.');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
-- The first prompt times out while the second is still on the phone.
select is(
  public.rpc_payment_mpesa_callback('resend-a', 1037, 'DS timeout user cannot be reached',
    'ci-only-daraja-prompt-token', '{}') ->> 'superseded',
  'true', 'An early failure does not fail a payment another prompt can still settle.');
reset role;
select is((select state::text from public.payment where reference = 'PROMPT-PAY-RESEND'),
  'authorised', 'The payment is still waiting on the second prompt.');
set local role anon;
-- The guest answers the second prompt.
select is(
  public.rpc_payment_mpesa_callback('resend-b', 0, 'paid', 'ci-only-daraja-prompt-token', '{}', 500,
    'RCPT-B', '254700005401') ->> 'state',
  'paid', 'Answering the second prompt settles the payment.');
reset role;

select is((select payment_status::text from public.order where reference = 'PROMPT-ORDER-RESEND'),
  'paid', 'The order is paid.');

-- 2. Both prompts answered: the second payment is recorded for a refund.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0540000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select public.rpc_payment_mpesa_sent('PROMPT-PAY-TWICE', 'twice-a', 'm', '254700005401', 'ci-only-daraja-prompt-token');
select public.rpc_payment_mpesa_sent('PROMPT-PAY-TWICE', 'twice-b', 'm', '254700005401', 'ci-only-daraja-prompt-token');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_mpesa_callback('twice-a', 0, 'paid', 'ci-only-daraja-prompt-token', '{}', 500, 'RCPT-1', null);
select is(
  public.rpc_payment_mpesa_callback('twice-b', 0, 'paid', 'ci-only-daraja-prompt-token', '{}', 500, 'RCPT-2', null)
    ->> 'double_payment',
  'true', 'Paying a second prompt is caught as a double payment.');
select is(
  public.rpc_payment_mpesa_callback('twice-b', 0, 'paid', 'ci-only-daraja-prompt-token', '{}', 500, 'RCPT-2', null)
    ->> 'duplicate',
  'true', 'Safaricom repeating that callback changes nothing.');
reset role;

select is(
  (select outcome || ' ' || receipt from public.payment_prompt where checkout_request_id = 'twice-b'),
  'duplicate RCPT-2', 'The second payment is kept, with its receipt, for a refund.');
select is((select provider_receipt from public.payment where reference = 'PROMPT-PAY-TWICE'),
  'RCPT-1', 'The payment keeps the receipt that settled it.');

-- 3. The only prompt is declined: the payment fails and the order says so.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0540000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select public.rpc_payment_mpesa_sent('PROMPT-PAY-FAIL', 'fail-a', 'm', '254700005401', 'ci-only-daraja-prompt-token');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_mpesa_callback('fail-a', 1032, 'Request cancelled by user', 'ci-only-daraja-prompt-token', '{}');
reset role;

select is(
  (select state::text || ' · ' || failure_reason from public.payment where reference = 'PROMPT-PAY-FAIL'),
  'failed · Request cancelled by user', 'A declined prompt fails the payment, with M-Pesa''s reason.');
select is(
  (select title from public.order_event e join public.order o on o.id = e.order_id
    where o.reference = 'PROMPT-ORDER-FAIL' and e.kind = 'payment_failed'),
  'Payment not completed', 'The failed attempt is on the order''s timeline.');

-- 4. No callback: after 45 seconds the prompt is handed out to be queried, once.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0540000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select public.rpc_payment_mpesa_sent('PROMPT-PAY-SILENT', 'silent-a', 'm', '254700005401', 'ci-only-daraja-prompt-token');
reset role;
update public.payment_prompt set sent_at = now() - interval '2 minutes' where checkout_request_id = 'silent-a';

set local role authenticated;
select is(
  (select string_agg(checkout_request_id, ',') from public.rpc_payment_mpesa_open_prompts('PROMPT-PAY-SILENT')),
  'silent-a', 'A prompt with no answer is handed out to ask M-Pesa about.');
select is(
  (select count(*)::int from public.rpc_payment_mpesa_open_prompts('PROMPT-PAY-SILENT')),
  0, 'It is not asked about again straight away.');
reset role;

select * from finish();
rollback;
