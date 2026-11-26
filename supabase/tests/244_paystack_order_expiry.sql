-- Unpaid orders and Paystack (20270328000100): an order with a Paystack try
-- still in progress is not closed under the customer; an abandoned one still
-- closes after thirty minutes, and one that had a Paystack try is not told
-- nothing was charged. Paystack money arriving after an order closed is written
-- on the order and audited for a person to refund; nothing else moves.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to anon;

create function pg_temp.ps_sign(p_body text) returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'),
    convert_to('sk_test_ci_only_0123456789abcdef', 'UTF8'), 'sha512'), 'hex')
$$;
create function pg_temp.ps_paid(p_reference text, p_id bigint, p_amount bigint) returns text
language sql as $$
  select jsonb_build_object('event', 'charge.success',
    'data', jsonb_build_object('id', p_id, 'reference', p_reference, 'status', 'success',
      'amount', p_amount, 'currency', 'KES', 'channel', 'mobile_money', 'fees', 2250,
      'gateway_response', 'Approved'))::text
$$;
/* One story's order: its stage and why it closed. Read as the setup role. */
create function pg_temp.story(p_letter text) returns text language sql as $$
  select o.stage::text || coalesce('/' || o.cancel_reason_code, '')
    from public.order o where o.reference = 'PX244-' || p_letter
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c2440000-0000-4000-8000-000000000021', 'authenticated',
        'authenticated', 'expiry244@example.test', '', now(), now(), now());
insert into public.guest (id, phone, name, user_id)
values ('c2440000-0000-4000-8000-000000000001', '+254700024401', '[Expiry guest]',
        'c2440000-0000-4000-8000-000000000021');

-- One unpaid M-Pesa order of KES 1,500 per story, placed 40 minutes ago.
with shop as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m
    join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
   where m.city_id is not null order by m.id limit 1
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select ('c2440000-0000-4000-8000-0000000000' || x.n)::uuid, 'PX244-' || x.letter,
       'c2440000-0000-4000-8000-000000000001', s.merchant_id, s.branch_id, s.city_id, 'web',
       '[Fixture address]', 'placed', 'mpesa_stk', 'pending', 150000, 0, 0, 150000, 'KES'
  from shop s,
       (values ('a', '11'), ('b', '12'), ('c', '13'), ('d', '14'),
               ('e', '15'), ('f', '16'), ('g', '17'), ('h', '18')) as x(letter, n);
update public.order set placed_at = now() - interval '40 minutes' where reference like 'PX244-%';
update public.order set placed_at = now() - interval '190 minutes' where reference = 'PX244-e';

/* f has a payment nobody tried; the others have a Paystack payment, waiting
   ('authorised' once its try opened). */
insert into public.payment (reference, intent, order_id, merchant_id, city_id, amount_cents, currency,
  created_by, created_via, provider, is_test, state)
select 'NXP-244-' || right(o.reference, 1), 'order', o.id, o.merchant_id, o.city_id, 150000, 'KES',
       'c2440000-0000-4000-8000-000000000021', 'guest_checkout',
       case when o.reference = 'PX244-f' then 'unassigned' else 'paystack' end,
       o.reference <> 'PX244-f',
       (case when o.reference in ('PX244-a', 'PX244-b', 'PX244-c', 'PX244-e', 'PX244-g')
             then 'authorised' else 'pending' end)::public.payment_state
  from public.order o where o.reference like 'PX244-%';

insert into public.paystack_attempt (payment_id, reference, channel, is_test, created_at, opened_at,
  checked_at, outcome, failure_reason)
select p.id, p.reference || '-1', 'mpesa', true, now() - x.started, now() - x.opened,
       now() - x.checked, x.outcome, case when x.outcome = 'failed' then 'Declined' end
  from (values
    -- a: started five minutes ago.
    ('a', interval '5 minutes', interval '5 minutes', null::interval, null::text),
    -- b: opened forty minutes ago, never asked about.
    ('b', interval '40 minutes', interval '40 minutes', null, null),
    -- c: opened forty minutes ago, asked five minutes ago, still no outcome.
    ('c', interval '40 minutes', interval '40 minutes', interval '5 minutes', null),
    -- d: refused five minutes ago.
    ('d', interval '5 minutes', null, interval '5 minutes', 'failed'),
    -- e: opened three hours ago, never asked about.
    ('e', interval '3 hours', interval '3 hours', null, null),
    -- g: opened forty minutes ago, asked only ten minutes after it started.
    ('g', interval '40 minutes', interval '40 minutes', interval '30 minutes', null),
    -- h: started forty minutes ago and never opened.
    ('h', interval '40 minutes', null, null, null)
  ) as x(letter, started, opened, checked, outcome)
  join public.payment p on p.reference = 'NXP-244-' || x.letter;

-- ═══════════════════════════════════════════════ 1. what closes

select ok((public.cron_expire_unpaid_mpesa_orders() ->> 'ok')::boolean, 'The expiry runs.');
select is(pg_temp.story('a'), 'placed', 'a: a try started five minutes ago keeps the order open.');
select is(pg_temp.story('b'), 'placed',
  'b: an opened try Paystack has not been asked about keeps it open, within two hours.');
select is(pg_temp.story('c'), 'cancelled/unpaid',
  'c: asked near the end of its window and still unpaid, it closes.');
select is(pg_temp.story('d'), 'cancelled/unpaid', 'd: a refused try never holds the order.');
select is(pg_temp.story('e'), 'cancelled/unpaid', 'e: after two hours an unanswered try holds nothing.');
select is(pg_temp.story('f'), 'cancelled/unpaid', 'f: with no try at all it closes as before.');
select is(pg_temp.story('g'), 'placed', 'g: a check early in the window is not enough to close it.');
select is(pg_temp.story('h'), 'cancelled/unpaid', 'h: an old try that never opened holds nothing.');
select is(
  (select string_agg(right(p.reference, 1) || ':' || p.state::text, ' ' order by p.reference)
     from public.payment p where p.reference like 'NXP-244-%'),
  'a:authorised b:authorised c:abandoned d:abandoned e:abandoned f:abandoned g:authorised h:abandoned',
  'Closed orders abandon their payments; open ones keep theirs.');
select is(
  (select o.cancel_note || '|' || e.detail
     from public.order o join public.order_event e on e.order_id = o.id and e.kind = 'unpaid_expired'
    where o.reference = 'PX244-c'),
  'No payment was confirmed in time.|No payment was confirmed in time, so the order was closed. A payment that arrives later is to be refunded.',
  'c had a Paystack try: nothing says M-Pesa had no payment or that nothing was charged.');
select is(
  (select o.cancel_note || '|' || e.detail
     from public.order o join public.order_event e on e.order_id = o.id and e.kind = 'unpaid_expired'
    where o.reference = 'PX244-f'),
  'Not paid by M-Pesa within 30 minutes. Nothing was charged.|M-Pesa had no payment for this order 30 minutes after it was placed. Nothing was charged.',
  'f had none: its wording is as before.');

-- The sweep asks about b and g near the end of their windows.
update public.paystack_attempt set checked_at = created_at + interval '26 minutes'
 where reference = 'NXP-244-b-1';
update public.paystack_attempt set checked_at = created_at + interval '25 minutes'
 where reference = 'NXP-244-g-1';
select public.cron_expire_unpaid_mpesa_orders();
select is(pg_temp.story('b') || ' ' || pg_temp.story('g') || ' ' || pg_temp.story('a'),
  'cancelled/unpaid cancelled/unpaid placed',
  'Once asked at 25 minutes or later they close; the young try still holds its order.');

-- ═══════════════════════════════════════════════ 2. money arriving after the order closed

insert into t values ('paidC', pg_temp.ps_paid('NXP-244-c-1', 2440003, 150000)),
                     ('paidA', pg_temp.ps_paid('NXP-244-a-1', 2440001, 150000));

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.rpc_payment_paystack_webhook((select v from t where k = 'paidC'),
            pg_temp.ps_sign((select v from t where k = 'paidC'))) ->> 'state',
  'paid', 'Paystack''s signed success still settles the abandoned payment.');
reset role;
select is(
  (select pg_temp.story('c') || ' ' || o.payment_status::text from public.order o where o.reference = 'PX244-c'),
  'cancelled/unpaid paid', 'The order stays closed and shows the money.');
select is(
  (select count(*) || '|' || min(e.title) || '|' || min(e.detail)
     from public.order_event e join public.order o on o.id = e.order_id
    where o.reference = 'PX244-c' and e.kind = 'money_to_return'),
  '1|Money to send back|KES 1,500.00 · The payment arrived after this order closed. It is to be refunded.',
  'The order says the money is to be sent back.');
select is(
  (select count(*) || ':' || min(e.severity::text) || ':' || min(e.after ->> 'amount_cents')
     from audit.audit_event e
    where e.action = 'payment.paystack_paid_after_close'
      and e.target_id = (select id from public.order where reference = 'PX244-c')),
  '1:high:150000', 'and a person is told.');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'paidC'),
  pg_temp.ps_sign((select v from t where k = 'paidC')));
select public.rpc_payment_paystack_webhook((select v from t where k = 'paidA'),
  pg_temp.ps_sign((select v from t where k = 'paidA')));
reset role;
select is(
  (select count(*) from public.order_event e join public.order o on o.id = e.order_id
    where o.reference = 'PX244-c' and e.kind = 'money_to_return') || ':'
  || (select count(*) from audit.audit_event e
       where e.action = 'payment.paystack_paid_after_close'
         and e.target_id = (select id from public.order where reference = 'PX244-c')),
  '1:1', 'The same success again adds nothing.');
select is(
  (select pg_temp.story('a') || ' ' || o.payment_status::text || ' '
          || (select count(*) from public.order_event e
               where e.order_id = o.id and e.kind = 'money_to_return')
     from public.order o where o.reference = 'PX244-a'),
  'placed paid 0', 'An order paid while still open is not marked for a refund.');
select is(
  (select count(*)::int from audit.audit_event e
    where e.action = 'payment.paystack_after_close_failed'),
  0, 'The check for a closed order never failed.');
select ok(
  not has_function_privilege('anon', 'public.tg_payment_paystack_after_close()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.tg_payment_paystack_after_close()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.cron_expire_unpaid_mpesa_orders()', 'EXECUTE'),
  'No account calls the expiry or the trigger.');

select * from finish();
rollback;
