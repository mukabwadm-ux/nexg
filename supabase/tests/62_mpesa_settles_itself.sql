-- M-Pesa that settles itself: the worker's list of prompts to ask about,
-- refused callbacks written down, Paybill payments, money held to send
-- back, refunds sent by M-Pesa, and unpaid orders held back from merchants
-- and closed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

delete from vault.secrets where name in ('daraja_callback_secret', 'payments_worker_url');
select vault.create_secret('ci-only-daraja-settle-token', 'daraja_callback_secret');

-- ─────────────────────────────────────────── people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0620000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'ops@settle.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0620000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'approver@settle.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0620000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'guest@settle.test', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c0620000-0000-4000-8000-000000000011', 'c0620000-0000-4000-8000-000000000001', 'ops@settle.test', 'Ops Settle'),
  ('c0620000-0000-4000-8000-000000000012', 'c0620000-0000-4000-8000-000000000002', 'approver@settle.test', 'Approver Settle');

insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
select 'c0620000-0000-4000-8000-000000000011', r.id,
       (select id from public.staff_user
         where id not in ('c0620000-0000-4000-8000-000000000011', 'c0620000-0000-4000-8000-000000000012')
         limit 1),
       'c0620000-0000-4000-8000-000000000012'
  from public.role r where r.key = 'ops_manager';

insert into public.guest (id, phone, name)
values ('c0620000-0000-4000-8000-000000000021', '+254700006201', '[Settle guest]');

-- ─────────────────────────────────────────── one order per story

with merchant_fixture as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m join public.merchant_branch b on b.merchant_id = m.id
   where m.city_id is not null order by m.id, b.id limit 1
), orders(id, reference, method, status, stage) as (
  values
    ('c0620000-0000-4000-8000-000000000101'::uuid, 'NX-261106-9101', 'mpesa_stk', 'pending', 'placed'),     -- Paybill pays it
    ('c0620000-0000-4000-8000-000000000102'::uuid, 'NX-261106-9102', 'mpesa_stk', 'pending', 'placed'),     -- Paybill pays the wrong amount
    ('c0620000-0000-4000-8000-000000000103'::uuid, 'NX-261106-9103', 'mpesa_stk', 'paid', 'placed'),        -- Paybill pays an order that owes nothing
    ('c0620000-0000-4000-8000-000000000104'::uuid, 'NX-261106-9104', 'mpesa_stk', 'pending', 'placed'),     -- Paybill reports a prompt's money
    ('c0620000-0000-4000-8000-000000000105'::uuid, 'NX-261106-9105', 'mpesa_stk', 'pending', 'placed'),     -- paid twice
    ('c0620000-0000-4000-8000-000000000106'::uuid, 'NX-261106-9106', 'mpesa_stk', 'pending', 'cancelled'),  -- paid after it closed
    ('c0620000-0000-4000-8000-000000000107'::uuid, 'NX-261106-9107', 'mpesa_stk', 'paid', 'placed'),        -- refund sent by M-Pesa
    ('c0620000-0000-4000-8000-000000000108'::uuid, 'NX-261106-9108', 'mpesa_stk', 'paid', 'placed'),        -- refund M-Pesa refuses
    ('c0620000-0000-4000-8000-000000000109'::uuid, 'NX-261106-9109', 'mpesa_stk', 'paid', 'placed'),        -- refund without a clear answer
    ('c0620000-0000-4000-8000-000000000110'::uuid, 'NX-261106-9110', 'mpesa_stk', 'pending', 'placed'),     -- expires
    ('c0620000-0000-4000-8000-000000000111'::uuid, 'NX-261106-9111', 'mpesa_stk', 'pending', 'placed'),     -- a prompt M-Pesa never answered
    ('c0620000-0000-4000-8000-000000000112'::uuid, 'NX-261106-9112', 'mpesa_stk', 'pending', 'placed'),     -- a prompt ten minutes old
    ('c0620000-0000-4000-8000-000000000113'::uuid, 'NX-261106-9113', 'cash_on_delivery', 'pending', 'placed') -- cash: still to cook
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status, cancel_reason_code,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select o.id, o.reference, 'c0620000-0000-4000-8000-000000000021', m.merchant_id, m.branch_id,
  m.city_id, 'web', '[Fixture address]', o.stage::public.order_stage,
  o.method::public.order_payment_method, o.status::public.order_payment_status,
  case when o.stage = 'cancelled' then 'test' end,
  50000, 0, 0, 50000, 'KES'
from orders o cross join merchant_fixture m;

update public.order set placed_at = now() - interval '40 minutes'
 where reference in ('NX-261106-9110', 'NX-261106-9111', 'NX-261106-9112');

insert into public.payment (reference, intent, order_id, city_id, amount_cents, provider, state,
  provider_ref, provider_receipt, payer_phone, paid_at, created_by, created_via)
select 'SETTLE-PAY-' || right(o.reference, 4), 'order', o.id, o.city_id, 50000, 'mpesa',
  case when o.reference in ('NX-261106-9105', 'NX-261106-9107', 'NX-261106-9108', 'NX-261106-9109')
       then 'paid' when o.reference = 'NX-261106-9110' then 'failed'
       else 'authorised' end::public.payment_state,
  case when o.reference in ('NX-261106-9105', 'NX-261106-9107', 'NX-261106-9108', 'NX-261106-9109')
       then 'paid-prompt-' || right(o.reference, 4) end,
  case when o.reference in ('NX-261106-9105', 'NX-261106-9107', 'NX-261106-9108', 'NX-261106-9109')
       then 'RCPT' || right(o.reference, 4) end,
  case when o.reference in ('NX-261106-9105', 'NX-261106-9107', 'NX-261106-9109')
       then '254700006201' end,
  case when o.reference in ('NX-261106-9105', 'NX-261106-9107', 'NX-261106-9108', 'NX-261106-9109')
       then now() end,
  'c0620000-0000-4000-8000-000000000003', 'guest_checkout'
from public.order o
where o.reference in ('NX-261106-9104', 'NX-261106-9105', 'NX-261106-9106', 'NX-261106-9107',
                      'NX-261106-9108', 'NX-261106-9109', 'NX-261106-9110', 'NX-261106-9111',
                      'NX-261106-9112');

insert into public.payment_prompt (payment_id, checkout_request_id, phone, sent_at, resolved_at,
  resolved_via, outcome, result_code)
select p.id, x.checkout, '254700006201', now() - x.age,
       case when x.resolved then now() - x.age + interval '1 minute' end,
       case when x.resolved then 'query' end,
       case when x.resolved then 'failed' end,
       case when x.resolved then 1037 end
  from (values
    ('SETTLE-PAY-9104', 'settle-prompt-9104', interval '1 minute', false),
    ('SETTLE-PAY-9105', 'twice-b', interval '2 minutes', false),
    ('SETTLE-PAY-9105', 'twice-c', interval '2 minutes', false),
    ('SETTLE-PAY-9106', 'closed-a', interval '1 minute', false),
    ('SETTLE-PAY-9110', 'expire-a', interval '35 minutes', true),
    ('SETTLE-PAY-9111', 'open-a', interval '35 minutes', false),
    ('SETTLE-PAY-9112', 'recent-a', interval '10 minutes', true),
    ('SETTLE-PAY-9111', 'fresh-a', interval '10 seconds', false)
  ) as x(reference, checkout, age, resolved)
  join public.payment p on p.reference = x.reference;

-- As rpc_payment_mpesa_sent leaves it: a payment waiting on M-Pesa names its latest prompt.
update public.payment p
   set provider_ref = (select pr.checkout_request_id from public.payment_prompt pr
                        where pr.payment_id = p.id order by pr.sent_at desc limit 1)
 where p.reference like 'SETTLE-PAY-%' and p.state <> 'paid' and p.provider_ref is null
   and exists (select 1 from public.payment_prompt pr where pr.payment_id = p.id);

-- ═══════════════════════════════════════ merchants: nothing to cook until paid

select is((select what_now from public.merchant_orders_v where reference = 'NX-261106-9101'),
  'awaiting_payment', 'An unpaid M-Pesa order reads as waiting for payment, not to cook.');
select is((select what_now from public.merchant_orders_v where reference = 'NX-261106-9113'),
  'to_cook', 'A cash order is still to cook.');

create temp table open_before as
  select merchant_id, orders_open from public.merchant_home_v
   where merchant_id = (select merchant_id from public.order where reference = 'NX-261106-9101');
insert into public.order (reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select 'NX-261106-9199', guest_id, merchant_id, branch_id, city_id, 'web', '[Fixture address]',
  'placed', 'mpesa_stk', 'pending', 50000, 0, 0, 50000, 'KES'
  from public.order where reference = 'NX-261106-9101';
select is((select h.orders_open from public.merchant_home_v h join open_before b using (merchant_id)),
  (select orders_open from open_before),
  'An unpaid M-Pesa order does not count as an open order.');

-- ═══════════════════════════════════════ 1. the worker's list

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok($$select * from public.rpc_payment_mpesa_due_prompts('wrong-token')$$,
  '42501', null, 'The worker list needs the Daraja token.');

create temp table due_first as
  select * from public.rpc_payment_mpesa_due_prompts('ci-only-daraja-settle-token', null, 50);
select ok(exists (select 1 from due_first where checkout_request_id = 'open-a'),
  'A prompt with no answer after 35 minutes is due a question.');
select ok(not exists (select 1 from due_first where checkout_request_id = 'fresh-a'),
  'A prompt ten seconds old is not asked about yet.');
select ok(not exists (select 1 from public.rpc_payment_mpesa_due_prompts('ci-only-daraja-settle-token', null, 50)
                       where checkout_request_id = 'open-a'),
  'A prompt just asked about is not handed out again at once.');
reset role;

select is((select query_attempts from public.payment_prompt where checkout_request_id = 'open-a'),
  1, 'Each question is counted.');

-- ═══════════════════════════════════════ staff: "Check with M-Pesa"

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0620000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.rpc_payment_mpesa_check_now('SETTLE-PAY-9111')$$,
  '42501', null, 'A customer cannot make NexG ask M-Pesa.');

select set_config('request.jwt.claims',
  '{"sub":"c0620000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((public.rpc_payment_mpesa_check_now('SETTLE-PAY-9111') ->> 'open')::int, 2,
  'Staff can ask about a payment with prompts waiting.');
reset role;

select is((select last_queried_at from public.payment_prompt where checkout_request_id = 'open-a'),
  null, 'Asking now clears the wait, so the worker asks at once.');

-- ═══════════════════════════════════════ refused callbacks are written down

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_mpesa_callback_rejected('not-a-prompt-of-ours', 'wrong_token');
select public.rpc_payment_mpesa_callback_rejected('open-a', 'wrong_token');
select public.rpc_payment_mpesa_callback_rejected('open-a', 'wrong_token');
select public.rpc_payment_mpesa_callback_rejected('open-a', 'anything-else');
reset role;

select is((select count(*)::int from public.payment_event
            where event = 'mpesa.stk.rejected' and dedupe_key like 'rejected:open-a:%'),
  1, 'A refused callback for our prompt is written down once.');
select is((select count(*)::int from public.payment_event
            where dedupe_key like 'rejected:not-a-prompt-of-ours%'),
  0, 'A callback for a prompt NexG never sent is not stored.');
select is((select state::text from public.payment where reference = 'SETTLE-PAY-9111'),
  'authorised', 'A refused callback changes no payment.');

-- ═══════════════════════════════════════ 4. Paybill payments

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select public.rpc_payment_mpesa_paybill('wrong-token', 'PB0000001', 500, 'NX2611069101')$$,
  '42501', null, 'A Paybill confirmation needs the Daraja token.');

select is(
  public.rpc_payment_mpesa_paybill('ci-only-daraja-settle-token', 'PB9101AAAA', 500, 'nx-261106-9101',
    '254700006201', '{}') ->> 'state',
  'paid', 'Paybill money with the order number as the account pays the order, dashes or not.');
select is(
  public.rpc_payment_mpesa_paybill('ci-only-daraja-settle-token', 'PB9101AAAA', 500, 'NX2611069101')
    ->> 'duplicate',
  'true', 'The same Paybill payment reported twice counts once.');
select is(
  (public.rpc_payment_mpesa_paybill('ci-only-daraja-settle-token', 'PB9102AAAA', 400, 'NX2611069102')
    ->> 'amount_mismatch')::boolean,
  true, 'Paybill money that is not the amount owed is kept for Finance.');
select is(
  (public.rpc_payment_mpesa_paybill('ci-only-daraja-settle-token', 'PBUNKNOWN1', 500, 'MY HOUSE 4')
    ->> 'matched')::boolean,
  false, 'Paybill money naming no order is kept for Finance.');
select ok(
  (public.rpc_payment_mpesa_paybill('ci-only-daraja-settle-token', 'PB9103AAAA', 500, 'NX2611069103',
    '254700006201') ->> 'payout_id') is not null,
  'Paybill money for an order that owes nothing is held to send back.');
select is(
  public.rpc_payment_mpesa_paybill('ci-only-daraja-settle-token', 'PB9104AAAA', 500, 'NX2611069104',
    '254700006201') ->> 'matched',
  'prompt', 'Paybill money arriving while that order''s prompt waits is the prompt''s own payment.');
reset role;

select is((select payment_status::text from public.order where reference = 'NX-261106-9101'),
  'paid', 'The order Paybill paid is paid.');
select is((select provider_receipt from public.payment p join public.order o on o.id = p.order_id
            where o.reference = 'NX-261106-9101' and p.state = 'paid'),
  'PB9101AAAA', 'Its payment carries the M-Pesa receipt.');
select is((select payment_status::text from public.order where reference = 'NX-261106-9102'),
  'pending', 'The wrong amount pays nothing.');
select is((select handled from public.payment_event where dedupe_key = 'paybill:PBUNKNOWN1'),
  false, 'Unmatched Paybill money is left unhandled, for a person.');
select is((select state from public.mpesa_payout p join public.order o on o.id = p.order_id
            where o.reference = 'NX-261106-9103'),
  'held', 'Money for an order that owes nothing waits for one click to go back.');
select is((select outcome || ':' || receipt from public.payment_prompt
            where checkout_request_id = 'settle-prompt-9104'),
  'paid:PB9104AAAA', 'The waiting prompt is settled with the Paybill receipt.');

-- ═══════════════════════════════════════ money that is not kept

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (public.rpc_payment_mpesa_callback('twice-b', 0, 'paid', 'ci-only-daraja-settle-token', '{}', 500,
    'RCPT-TWICE-B', '254700006201') ->> 'double_payment')::boolean,
  true, 'A second prompt paid after the payment settled is a double payment.');
select is(
  (public.rpc_payment_mpesa_callback('twice-c', 0, 'paid', 'ci-only-daraja-settle-token', '{}', 500,
    'RCPT9105', '254700006201') ->> 'double_payment'),
  null, 'The same receipt reported by another prompt is the same money, not a second payment.');
select is(
  (public.rpc_payment_mpesa_callback('closed-a', 0, 'paid', 'ci-only-daraja-settle-token', '{}', 500,
    'RCPT-CLOSED', '254700006201') ->> 'after_close')::boolean,
  true, 'Money for a prompt paid after its order closed is not settled.');
reset role;

select is((select count(*)::int from public.mpesa_payout p join public.order o on o.id = p.order_id
            where o.reference = 'NX-261106-9105' and p.state = 'held' and p.phone = '254700006201'),
  1, 'The double payment is held to send back to the number that paid.');
select is((select state::text from public.payment where reference = 'SETTLE-PAY-9106'),
  'authorised', 'The closed order''s payment is not marked paid.');
select is((select count(*)::int from public.mpesa_payout p join public.order o on o.id = p.order_id
            where o.reference = 'NX-261106-9106' and p.purpose = 'return_excess'),
  1, 'The money paid after closing is held to send back.');

-- ═══════════════════════════════════════ 3. refunds by M-Pesa

insert into public.refund (id, order_id, amount_cents, method, reason_code, reason_text, status)
select x.id, o.id, x.amount, x.method, 'goodwill', '[Fixture refund]', 'approved'
  from (values
    ('c0620000-0000-4000-8000-000000000207'::uuid, 'NX-261106-9107', 50000::bigint, 'original'),
    ('c0620000-0000-4000-8000-000000000208'::uuid, 'NX-261106-9108', 20000::bigint, 'mpesa_b2c'),
    ('c0620000-0000-4000-8000-000000000209'::uuid, 'NX-261106-9109', 20000::bigint, 'original')
  ) as x(id, reference, amount, method)
  join public.order o on o.reference = x.reference;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0620000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_refund_issued('c0620000-0000-4000-8000-000000000207', 'FAKE-REF')$$,
  '42501', null, 'A customer cannot mark a refund as sent.');
select throws_ok(
  $$select public.rpc_refund_send_mpesa('c0620000-0000-4000-8000-000000000207')$$,
  '42501', null, 'A customer cannot send a refund.');

select set_config('request.jwt.claims',
  '{"sub":"c0620000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((public.rpc_refund_send_mpesa('c0620000-0000-4000-8000-000000000207') ->> 'ok')::boolean,
  true, 'Staff queue an approved refund to go back by M-Pesa.');
select throws_like(
  $$select public.rpc_refund_send_mpesa('c0620000-0000-4000-8000-000000000207')$$,
  '%already on its way%', 'A refund cannot be queued twice.');
select throws_like(
  $$select public.rpc_refund_issued('c0620000-0000-4000-8000-000000000207', 'BY-HAND-1')$$,
  '%going out by M-Pesa%', 'A refund on its way by M-Pesa cannot also be recorded by hand.');
select throws_like(
  $$select public.rpc_refund_send_mpesa('c0620000-0000-4000-8000-000000000207', '0711000000')$$,
  '%number that paid%', 'A refund cannot be sent to a number other than the one that paid.');
reset role;

select is((select phone from public.mpesa_payout where refund_id = 'c0620000-0000-4000-8000-000000000207'),
  '254700006201', 'It goes back to the number that paid.');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select count(*)::int from public.rpc_mpesa_payout_claim('ci-only-daraja-settle-token', 5)),
  1, 'The worker takes the queued payout once.');
select is((select count(*)::int from public.rpc_mpesa_payout_claim('ci-only-daraja-settle-token', 5)),
  0, 'A payout already taken is not taken again.');
reset role;
-- The worker's and Safaricom's answers, named by the payout's originator id.
select is(
  public.rpc_mpesa_payout_outcome('ci-only-daraja-settle-token',
    (select originator_id from public.mpesa_payout where refund_id = 'c0620000-0000-4000-8000-000000000207'),
    'accepted', 'conv-9107', 'Accept the service request successfully.') ->> 'state',
  'accepted', 'Safaricom accepting the request is recorded.');
select is(
  public.rpc_mpesa_payout_result('ci-only-daraja-settle-token',
    (select originator_id from public.mpesa_payout where refund_id = 'c0620000-0000-4000-8000-000000000207'),
    'conv-9107', 0, 'The service request is processed successfully.', 'RFND9107AA', 500, '{}') ->> 'state',
  'sent', 'Safaricom''s result marks the payout sent.');

select is((select status || ':' || provider_ref from public.refund
            where id = 'c0620000-0000-4000-8000-000000000207'),
  'issued:RFND9107AA', 'The refund is issued with the M-Pesa receipt.');
select is((select payment_status::text from public.order where reference = 'NX-261106-9107'),
  'refunded', 'The order reads as refunded, as for a refund recorded by hand.');

-- Refused by M-Pesa: nothing moved, so it can go again. M-Pesa never said
-- which number paid this order, so staff give one.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0620000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((public.rpc_refund_send_mpesa('c0620000-0000-4000-8000-000000000208', '0711000000') ->> 'ok')::boolean,
  true, 'A number is accepted when M-Pesa never said which one paid.');
reset role;
select public.rpc_mpesa_payout_claim('ci-only-daraja-settle-token', 5);
select is(
  public.rpc_mpesa_payout_outcome('ci-only-daraja-settle-token',
    (select originator_id from public.mpesa_payout where refund_id = 'c0620000-0000-4000-8000-000000000208'),
    'refused', null, 'The initiator information is invalid.') ->> 'state',
  'failed', 'A refused payout is failed, with nothing moved.');
select is((select status from public.refund where id = 'c0620000-0000-4000-8000-000000000208'),
  'approved', 'Its refund is still approved, to send again or by hand.');

-- No clear answer: a person reads the statement first.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0620000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_refund_send_mpesa('c0620000-0000-4000-8000-000000000209');
reset role;
select public.rpc_mpesa_payout_claim('ci-only-daraja-settle-token', 5);
select is(
  public.rpc_mpesa_payout_outcome('ci-only-daraja-settle-token',
    (select originator_id from public.mpesa_payout where refund_id = 'c0620000-0000-4000-8000-000000000209'),
    'unknown', null, 'The connection to M-Pesa dropped.') ->> 'state',
  'uncertain', 'A payout without a clear answer is uncertain.');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0620000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_like(
  $$select public.rpc_refund_send_mpesa('c0620000-0000-4000-8000-000000000209')$$,
  '%already on its way%', 'An uncertain refund cannot be sent again before the statement is read.');
select is(
  public.rpc_mpesa_payout_resolve(
    (select id from public.mpesa_payout where refund_id = 'c0620000-0000-4000-8000-000000000209'),
    false, null, 'Statement shows no payout to that number.') ->> 'state',
  'failed', 'Staff who find nothing on the statement free it to send again.');
reset role;

-- ═══════════════════════════════════════ 2. unpaid M-Pesa orders close

select ok((public.cron_expire_unpaid_mpesa_orders() ->> 'ok')::boolean, 'The expiry runs.');
select is((select stage::text || '/' || cancel_reason_code from public.order where reference = 'NX-261106-9110'),
  'cancelled/unpaid', 'An M-Pesa order unpaid after 30 minutes, every prompt answered, is closed.');
select is((select state::text from public.payment where reference = 'SETTLE-PAY-9110'),
  'abandoned', 'Its payment is marked abandoned.');
select is((select stage::text from public.order where reference = 'NX-261106-9111'),
  'placed', 'An order with a prompt M-Pesa never answered stays open: it could still be money.');
select is((select stage::text from public.order where reference = 'NX-261106-9112'),
  'placed', 'An order with a prompt sent in the last 30 minutes stays open.');

select * from finish();
rollback;
