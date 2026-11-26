-- NexG cancels a paid stay with a full refund (20270328000100): staff only, a
-- repeat changes nothing, a refund the policy made partial stays as it is, and
-- the stay shows refunded only on Paystack's processed notice, shaped exactly as
-- Paystack documents it (the transaction reference, a processor's refund
-- reference or none, the amount as a string, no refund id). A notice that fits
-- no single refund changes nothing and is audited. The guest's refund receipt
-- is for the amount going back, paid the way the stay was paid. A pending or
-- processing notice that fits twice only because of a failed earlier try is
-- ignored quietly; a processed one matched past such a try asks a person, once.
--
-- Money by hand: the test home is KES 5,000 a night, so two nights are
-- KES 10,000 (1,000,000 cents); the real home is KES 7,000 a night, so two
-- nights are KES 14,000 (1,400,000 cents), and half of that is KES 7,000
-- (700,000 cents).

begin;
create extension if not exists pgtap with schema extensions;
select plan(64);
-- Property review (20270323000100): the homes in this file count as reviewed and approved.
alter table public.property alter column review_status set default 'approved';

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to authenticated, anon;

create function pg_temp.ps_sign(p_body text, p_key text) returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_key, 'UTF8'), 'sha512'), 'hex')
$$;
/* Paystack's signed message, as it arrives, signed with the test or live key. */
create function pg_temp.send(p_body text, p_mode text) returns jsonb
language sql as $$
  select public.rpc_payment_paystack_webhook(p_body, pg_temp.ps_sign(p_body,
    case when p_mode = 'test' then 'sk_test_ci_only_0123456789abcdef'
         else 'sk_live_ci_only_0123456789abcdef' end))
$$;
create function pg_temp.ps_paid(p_reference text, p_id bigint, p_amount bigint) returns text
language sql as $$
  select jsonb_build_object('event', 'charge.success',
    'data', jsonb_build_object('id', p_id, 'reference', p_reference, 'status', 'success',
      'amount', p_amount, 'currency', 'KES', 'channel', 'card', 'fees', 4350,
      'gateway_response', 'Approved'))::text
$$;
/* Paystack's documented refund.pending, .processing, .processed and .failed:
   no id, no reference of ours, the amount a string. */
create function pg_temp.notice(p_event text, p_transaction text, p_refund_reference text,
                               p_amount text, p_domain text) returns text
language sql as $$
  select jsonb_build_object('event', p_event,
    'data', jsonb_build_object('status', split_part(p_event, '.', 2),
      'transaction_reference', p_transaction, 'refund_reference', p_refund_reference,
      'amount', p_amount, 'currency', 'KES', 'processor', 'mpgs_zen',
      'customer', jsonb_build_object('first_name', 'Test', 'last_name', 'Guest',
                                     'email', 'guest243@example.test'),
      'integration', 412829, 'domain', p_domain))::text
$$;
/* Paystack's documented refund.needs-attention: an id (a string), a transfer's
   reference, the amount a number. */
create function pg_temp.attention(p_transaction text, p_id text, p_amount bigint, p_domain text) returns text
language sql as $$
  select jsonb_build_object('event', 'refund.needs-attention',
    'data', jsonb_build_object('status', 'needs-attention', 'id', p_id,
      'transaction_reference', p_transaction, 'refund_reference', 'TRF_7jn17u9vkqm91efk',
      'amount', p_amount, 'currency', 'KES', 'customer_note', 'Refund for transaction',
      'merchant_note', 'Account details needed',
      'customer', jsonb_build_object('first_name', 'Test', 'last_name', 'Guest',
                                     'email', 'guest243@example.test'),
      'integration', 412829, 'domain', p_domain))::text
$$;
create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
/* What a repeat must not change: the row itself (ctid moves on any update),
   its updated_at, and the audit entries about it. Read as the setup role. */
create function pg_temp.snap(p_stay uuid) returns text language sql as $$
  select s.ctid::text || '|' || s.updated_at::text || '|'
         || (select count(*) from audit.audit_event e where e.target_id = s.id)::text
    from public.stay s where s.id = p_stay
$$;
/* A stay's refund: Paystack's side, the stay's side and the payment. */
create function pg_temp.refund_of(p_stay uuid) returns text language sql as $$
  select coalesce((select r.state from public.paystack_refund r
                    where r.kind = 'stay' and r.stay_id = s.id), '-')
         || ':' || (s.refunded_at is not null)::text || ':' || p.state::text
    from public.stay s join public.payment p on p.reference = s.payment_reference
   where s.id = p_stay
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd2430000-0000-4000-8000-000000000001', 'authenticated',
   'authenticated', 'guest243a@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2430000-0000-4000-8000-000000000002', 'authenticated',
   'authenticated', 'guest243b@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2430000-0000-4000-8000-000000000031', 'authenticated',
   'authenticated', 'host243@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2430000-0000-4000-8000-0000000000aa', 'authenticated',
   'authenticated', 'partners243@test.local', '', now(), false, now(), now());
insert into public.staff_user (id, user_id, email, display_name)
values ('d2430000-0000-4000-8000-0000000000b1', 'd2430000-0000-4000-8000-0000000000aa',
        'partners243@test.local', 'Partnerships 243');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
values ('d2430000-0000-4000-8000-0000000000b1', (select id from public.role where key = 'partnerships'),
        (select id from public.city where slug = 'nairobi'), 'd2430000-0000-4000-8000-0000000000b1');

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d2431000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 243]', '+254700024300',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.host_user (host_id, user_id, role, units)
values ('d2431000-0000-4000-8000-00000000000a', 'd2430000-0000-4000-8000-000000000031', 'owner', null);
-- The real home gives only half back under its policy.
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, cancellation_terms)
values
  ('d2432000-0000-4000-8000-00000000000a', 'd2431000-0000-4000-8000-00000000000a', 'block-243', '[Block 243]',
   'apartment_block', 'Kilimani', (select id from public.city where slug = 'nairobi'), true, now(),
   public.fn_cancellation_policy('{"preset":"custom","tiers":[{"days_before":0,"refund_pct":50}]}')),
  ('d2432000-0000-4000-8000-00000000000b', 'd2431000-0000-4000-8000-00000000000a', 'block-243-test',
   '[Test block 243]', 'apartment_block', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), true, now(), null);
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values
  ('d2433000-0000-4000-8000-00000000000a', 'd2431000-0000-4000-8000-00000000000a',
   'd2432000-0000-4000-8000-00000000000a', 'A', 'A', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 3, 7000),
  ('d2433000-0000-4000-8000-00000000000b', 'd2431000-0000-4000-8000-00000000000a',
   'd2432000-0000-4000-8000-00000000000b', 'T', 'T', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 3, 5000);

-- Guest A: a test stay (held as the apps hold it) and a real one.
set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-000000000001');
insert into t select 'quote', public.rpc_native_stay_quote('d2432000-0000-4000-8000-00000000000b',
  'd2433000-0000-4000-8000-00000000000b', current_date + 30, current_date + 32, 1, 0) ->> 'quoteId';
insert into t select 'stayT', public.rpc_native_stay_hold((select v::uuid from t where k = 'quote'), 'Amina') ->> 'stayId';
insert into t select 'stayL', public.rpc_stay_hold('d2433000-0000-4000-8000-00000000000a',
  current_date + 30, current_date + 32, '{"first_name":"Amina"}'::jsonb) ->> 'stay_id';
insert into t select 'payT', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stayT')) ->> 'reference';
insert into t select 'payL', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stayL')) ->> 'reference';
-- Guest B: a real stay to cancel under its policy, and one left unpaid.
select pg_temp.as_user('d2430000-0000-4000-8000-000000000002');
insert into t select 'stayP', public.rpc_stay_hold('d2433000-0000-4000-8000-00000000000a',
  current_date + 40, current_date + 42, '{"first_name":"Brian"}'::jsonb) ->> 'stay_id';
insert into t select 'stayH', public.rpc_stay_hold('d2433000-0000-4000-8000-00000000000a',
  current_date + 50, current_date + 52, '{"first_name":"Brian"}'::jsonb) ->> 'stay_id';
insert into t select 'payP', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stayP')) ->> 'reference';
reset role;

update public.property set accepts_test_payments = true where id = 'd2432000-0000-4000-8000-00000000000b';

set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-000000000001');
select public.rpc_payment_paystack_attempt((select v from t where k = 'payT'), 'card', null,
  'sk_test_ci_only_0123456789abcdef');
select public.rpc_payment_paystack_opened((select v from t where k = 'payT') || '-1', 'acc_ci243t',
  'https://checkout.paystack.com/ci-243t', null, 'sk_test_ci_only_0123456789abcdef');
select public.rpc_payment_paystack_attempt((select v from t where k = 'payL'), 'card', null,
  'sk_live_ci_only_0123456789abcdef');
select public.rpc_payment_paystack_opened((select v from t where k = 'payL') || '-1', 'acc_ci243l',
  'https://checkout.paystack.com/ci-243l', null, 'sk_live_ci_only_0123456789abcdef');
select pg_temp.as_user('d2430000-0000-4000-8000-000000000002');
select public.rpc_payment_paystack_attempt((select v from t where k = 'payP'), 'card', null,
  'sk_live_ci_only_0123456789abcdef');
select public.rpc_payment_paystack_opened((select v from t where k = 'payP') || '-1', 'acc_ci243p',
  'https://checkout.paystack.com/ci-243p', null, 'sk_live_ci_only_0123456789abcdef');
reset role;

insert into t select 'txnT', (select v from t where k = 'payT') || '-1';
insert into t select 'txnL', (select v from t where k = 'payL') || '-1';
insert into t select 'txnP', (select v from t where k = 'payP') || '-1';
insert into t select 'paidT', pg_temp.ps_paid((select v from t where k = 'txnT'), 2430001, 1000000);
insert into t select 'paidL', pg_temp.ps_paid((select v from t where k = 'txnL'), 2430002, 1400000);
insert into t select 'paidP', pg_temp.ps_paid((select v from t where k = 'txnP'), 2430003, 1400000);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.send((select v from t where k = 'paidT'), 'test');
select pg_temp.send((select v from t where k = 'paidL'), 'live');
select pg_temp.send((select v from t where k = 'paidP'), 'live');
reset role;

select is(
  (select string_agg(s.status::text || ':' || s.paid_kes, ' ' order by s.check_in, s.paid_kes)
     from public.stay s where s.host_id = 'd2431000-0000-4000-8000-00000000000a' and s.status <> 'held'),
  'booked:10000 booked:14000 booked:14000',
  'Fixtures: three stays paid through Paystack''s signed success.');

set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-000000000001');
select is(
  (select (x ->> 'status') || ':' || (x ->> 'refunded') || ':' || (x ->> 'cancelledAfterBooking')
     from public.rpc_native_stay_status((select v::uuid from t where k = 'quote')) x),
  'booked:false:false', 'A booked stay is neither refunded nor cancelled after booking.');

-- ──────────────────────────────────────────────────── 1. who may

select throws_ok(
  format($$select public.rpc_stay_cancel_refund_full(%L, 'Mine')$$, (select v from t where k = 'stayT')),
  '42501', 'Hospitality staff only.', 'The guest cannot cancel with a full refund.');
select throws_ok(
  $$select * from public.rpc_stay_paid_bookings()$$,
  '42501', 'Hospitality staff only.', 'Nor read the paid bookings.');
select pg_temp.as_user('d2430000-0000-4000-8000-000000000031');
select throws_ok(
  format($$select public.rpc_stay_cancel_refund_full(%L, 'Double booked')$$, (select v from t where k = 'stayT')),
  '42501', 'Hospitality staff only.', 'Nor can the host.');
reset role;
select ok(
  not has_function_privilege('anon', 'public.rpc_stay_cancel_refund_full(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rpc_stay_paid_bookings()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rpc_stay_refunds(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rpc_stay_guest_stays(integer)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_paystack_refund_apply(text, jsonb, text)', 'EXECUTE'),
  'The public key reaches none of it, and no account applies a refund notice itself.');

set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-0000000000aa');
select throws_ok(
  format($$select public.rpc_stay_cancel_refund_full(%L, '   ')$$, (select v from t where k = 'stayT')),
  '22023', 'Say why this stay is being cancelled.', 'A reason is required.');
select throws_ok(
  format($$select public.rpc_stay_cancel_refund_full(%L, 'Not paid')$$, (select v from t where k = 'stayH')),
  '22023', 'Only a stay booked and paid through NexG can be cancelled and refunded here.',
  'An unpaid hold has nothing to refund.');
select is(
  (select string_agg(concat_ws(':', x.property, x.guest_first_name, x.status, x.paid_kes, x.provider,
                               x.is_test::text, (x.paid_at is not null)::text), ' | '
                     order by x.paid_kes desc, x.guest_first_name)
     from public.rpc_stay_paid_bookings() x where x.host = '[Host 243]'),
  '[Block 243]:Amina:booked:14000:paystack:false:true | [Block 243]:Brian:booked:14000:paystack:false:true | [Test block 243]:Amina:booked:10000:paystack:true:true',
  'Staff see the paid bookings, with how each was paid.');

-- ──────────────────────────────────────────────────── 2. cancel in full, once

insert into t select 'cancelT', public.rpc_stay_cancel_refund_full(
  (select v::uuid from t where k = 'stayT'), '  The home flooded  ')::text;
select is(
  (select v::jsonb - 'refund_due_at' from t where k = 'cancelT'),
  '{"ok": true, "changed": true, "status": "cancelled", "paid_kes": 10000, "refund_kes": 10000,
    "refunded_at": null, "provider": "paystack", "is_test": true, "paystack_refund_state": null,
    "message": "Cancelled. KES 10,000 is due back to the guest."}'::jsonb,
  'Staff cancel the test stay; everything paid is due back.');
reset role;
select is(
  (select concat_ws(':', status::text, refund_amount_kes, cancellation_fee_kes,
                    (refund_due_at is not null)::text, (refunded_at is null)::text)
     from public.stay where id = (select v::uuid from t where k = 'stayT')),
  'cancelled:10000:0:true:true', 'The stay shows a refund due, not refunded.');
select is(
  (select count(*) || ':' || min(e.reason) || ':' || min(e.severity::text)
     from audit.audit_event e
    where e.action = 'stay.cancel_refund_full' and e.target_id = (select v::uuid from t where k = 'stayT')),
  '1:The home flooded:high', 'It is audited once, with the reason.');

update public.stay set updated_at = now() - interval '1 day' where id = (select v::uuid from t where k = 'stayT');
insert into t select 'snapT', pg_temp.snap((select v::uuid from t where k = 'stayT'));
set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-0000000000aa');
select is(
  (select (x ->> 'changed') || ':' || (x ->> 'message')
     from public.rpc_stay_cancel_refund_full((select v::uuid from t where k = 'stayT'), 'Pressed again') x),
  'false:This stay is already cancelled and its full refund is due. Nothing was changed.',
  'A second press says so.');
reset role;
select is(pg_temp.snap((select v::uuid from t where k = 'stayT')), (select v from t where k = 'snapT'),
  'and changes nothing: the row, its updated_at and its audit entries are as they were.');

set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-0000000000aa');
select is(
  (select concat_ws(':', x ->> 'changed', x ->> 'refund_kes', x ->> 'provider', x ->> 'is_test')
     from public.rpc_stay_cancel_refund_full((select v::uuid from t where k = 'stayL'), 'Host double booked') x),
  'true:14000:paystack:false', 'A full refund of the real stay, whatever its policy says.');
reset role;
select is(
  (select concat_ws(':', status::text, refund_amount_kes, cancellation_fee_kes,
                    cancellation_terms #>> '{tiers,0,refund_pct}')
     from public.stay where id = (select v::uuid from t where k = 'stayL')),
  'cancelled:14000:0:50', 'KES 14,000 back and no fee, though the policy gives 50%.');
select is(
  (select coalesce(sum(e.credit), 0)::bigint from ledger.entry e
     join ledger.transaction x on x.id = e.transaction_id
    where x.kind = 'stay_cancelled_refund_due' and x.related ->> 'stay_id' = (select v from t where k = 'stayL')
      and e.account_code = 'refunds_pending'),
  1400000::bigint, 'The books hold KES 14,000 as a refund due.');

-- A refund the policy made partial.
set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-0000000000aa');
select public.rpc_stay_cancel((select v::uuid from t where k = 'stayP'), 'The guest cannot travel');
reset role;
update public.stay set updated_at = now() - interval '1 day' where id = (select v::uuid from t where k = 'stayP');
insert into t select 'snapP', pg_temp.snap((select v::uuid from t where k = 'stayP'));
set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-0000000000aa');
select is(
  (select concat_ws(':', x ->> 'changed', x ->> 'refund_kes', x ->> 'message')
     from public.rpc_stay_cancel_refund_full((select v::uuid from t where k = 'stayP'), 'Give it all back') x),
  'false:7000:This stay was already cancelled with a refund of KES 7,000 of the KES 14,000 paid. That refund stays as it is. Nothing was changed.',
  'A refund the policy made partial is not raised.');
select is(
  (select count(*)::int from public.rpc_stay_paid_bookings() x where x.host = '[Host 243]'),
  0, 'Cancelled stays leave the paid bookings.');
reset role;
select is(
  pg_temp.snap((select v::uuid from t where k = 'stayP')) || '#'
    || (select concat_ws(':', refund_amount_kes, cancellation_fee_kes)
          from public.stay where id = (select v::uuid from t where k = 'stayP')),
  (select v from t where k = 'snapP') || '#7000:7000', 'and nothing about it changed.');

set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-000000000002');
select is(
  (select concat_ws(':', x ->> 'refundDue', x ->> 'refunded', x ->> 'refundKes')
     from jsonb_array_elements(public.rpc_stay_guest_stays() -> 'stays') x
    where x ->> 'id' = (select v from t where k = 'stayP')),
  'true:false:7000', 'The guest''s list shows KES 7,000 due, not yet refunded.');

-- ──────────────────────────────────────────────────── 3. a test refund, as Paystack documents it

select pg_temp.as_user('d2430000-0000-4000-8000-0000000000aa');
insert into t select 'refT', public.rpc_paystack_refund_open('stay', (select v::uuid from t where k = 'stayT'),
  'sk_test_ci_only_0123456789abcdef') ->> 'reference';
select is(
  public.rpc_paystack_refund_answered((select v from t where k = 'refT'),
    jsonb_build_object('status', true, 'message', 'Refund has been queued for processing',
      'data', jsonb_build_object('id', 3018284, 'status', 'pending', 'amount', 1000000,
        'reference', (select v from t where k = 'refT'),
        'transaction', jsonb_build_object('id', 2430001, 'reference', (select v from t where k = 'txnT'))))::text,
    'sk_test_ci_only_0123456789abcdef') ->> 'state',
  'pending', 'Paystack accepts the refund request.');
select is(
  (select concat_ws(':', x.provider, x.is_test::text, x.paystack_state, x.refund_kes,
                    (x.paystack_reference = (select v from t where k = 'refT'))::text)
     from public.rpc_stay_refunds('due') x where x.stay_id = (select v::uuid from t where k = 'stayT')),
  'paystack:true:pending:10000:true', 'The queue says how it was paid and where Paystack is.');
reset role;
select is(pg_temp.refund_of((select v::uuid from t where k = 'stayT')), 'pending:false:paid',
  'Accepted is not refunded.');

insert into t values
  ('pendT', pg_temp.notice('refund.pending', (select v from t where k = 'txnT'), null, '1000000', 'test')),
  ('shortT', pg_temp.notice('refund.processed', (select v from t where k = 'txnT'), '132013318360', '999999', 'test')),
  ('strayT', pg_temp.notice('refund.processed', 'T000000_243_unknown', '132013318360', '1000000', 'test')),
  ('doneT', pg_temp.notice('refund.processed', (select v from t where k = 'txnT'), '132013318360', '1000000', 'test'));

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'pendT'), 'test'),
  '{"ok": true, "state": "pending"}'::jsonb,
  'The documented refund.pending (no id, no reference, a string amount) finds the refund.');
select is(pg_temp.send((select v from t where k = 'shortT'), 'test') ->> 'reason', 'unknown_refund',
  'A processed notice for another amount matches nothing.');
select is(pg_temp.send((select v from t where k = 'strayT'), 'test') ->> 'reason', 'unknown_refund',
  'Nor one for an unknown transaction.');
select is(pg_temp.send((select v from t where k = 'doneT'), 'live') ->> 'reason', 'unknown_refund',
  'Nor a live-signed one for a test payment.');
reset role;
select is(pg_temp.refund_of((select v::uuid from t where k = 'stayT')), 'pending:false:paid',
  'None of them changed anything.');
select is(
  (select string_agg(concat_ws(':', e.after ->> 'why', e.after ->> 'amount', e.after ->> 'mode',
                               e.severity::text), '|' order by e.id)
     from audit.audit_event e
    where e.action = 'payment.paystack_refund_unmatched'
      and e.after ->> 'transaction' in ((select v from t where k = 'txnT'), 'T000000_243_unknown')),
  'unknown_refund:999999:test:high|unknown_refund:1000000:test:high|unknown_refund:1000000:live:high',
  'Each unmatched notice is audited for a person.');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'doneT'), 'test'),
  '{"ok": true, "state": "processed"}'::jsonb, 'The documented refund.processed marks it processed.');
reset role;
select is(
  (select pg_temp.refund_of(s.id) || ':' || (s.refund_reference = (select v from t where k = 'refT'))::text
          || ':' || s.refund_note
     from public.stay s where s.id = (select v::uuid from t where k = 'stayT')),
  'processed:true:reversed:true:Refunded through Paystack',
  'The stay is refunded under our reference and its payment reversed.');
select is(
  (select concat_ws(':', r.total_cents, r.lines #>> '{0,amount_cents}', r.method,
                    (r.method_ref = (select v from t where k = 'refT'))::text)
     from public.receipt r
    where r.source_type = 'stay_refund' and r.source_id = (select v::uuid from t where k = 'stayT')),
  '1000000:1000000:Card:true',
  'A full Paystack refund''s receipt is for the KES 10,000 sent back, paid by card, not M-Pesa.');
select is(
  (select count(*)::int from ledger.transaction x
    where x.related ->> 'stay_id' = (select v from t where k = 'stayT')),
  0, 'A test stay posts nothing to the ledger.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'doneT'), 'test') ->> 'duplicate', 'true',
  'The same notice again changes nothing.');
set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-000000000001');
select is(
  (select concat_ws(':', x ->> 'status', x ->> 'paymentStatus', x ->> 'refundDue', x ->> 'refunded',
                    x ->> 'cancelledAfterBooking')
     from public.rpc_native_stay_status((select v::uuid from t where k = 'quote')) x),
  'cancelled:paid:true:true:true', 'The apps are told NexG cancelled it and the money went back.');

-- ──────────────────────────────────────────────────── 4. a real refund: by reference, id and transaction

select pg_temp.as_user('d2430000-0000-4000-8000-0000000000aa');
insert into t select 'refL', public.rpc_paystack_refund_open('stay', (select v::uuid from t where k = 'stayL'),
  'sk_live_ci_only_0123456789abcdef') ->> 'reference';
select public.rpc_paystack_refund_answered((select v from t where k = 'refL'),
  '{"status": true, "data": {"id": 3018290, "status": "pending", "amount": 1400000}}',
  'sk_live_ci_only_0123456789abcdef');
reset role;

insert into t values
  ('oursShort', pg_temp.notice('refund.processed', (select v from t where k = 'txnL'),
     (select v from t where k = 'refL'), '1', 'live')),
  ('oursUnknown', pg_temp.notice('refund.processed', (select v from t where k = 'txnL'),
     'NXR-00000000000000000000000000000000', '1400000', 'live')),
  ('otherId', pg_temp.attention((select v from t where k = 'txnL'), '999999', 1400000, 'live')),
  ('attnL', pg_temp.attention('88bfa94509eb96aa9785641c26cc57cc', '3018290', 1400000, 'live')),
  ('pendL', pg_temp.notice('refund.pending', (select v from t where k = 'txnL'), null, '1400000', 'live')),
  ('doneL', pg_temp.notice('refund.processed', (select v from t where k = 'txnL'), '132013318361', '1400000', 'live'));

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'oursShort'), 'live') ->> 'reason', 'amount_mismatch',
  'A string amount is checked too.');
select is(pg_temp.send((select v from t where k = 'oursUnknown'), 'live') ->> 'reason', 'unknown_refund',
  'A reference of ours that we do not know never falls back to the transaction.');
select is(pg_temp.send((select v from t where k = 'otherId'), 'live') ->> 'reason', 'unknown_refund',
  'Another Paystack refund id on the same transaction is another refund.');
reset role;
select is(pg_temp.refund_of((select v::uuid from t where k = 'stayL')), 'pending:false:paid',
  'None of them changed anything.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'attnL'), 'live') ->> 'state', 'needs-attention',
  'needs-attention finds the refund by Paystack''s id.');
select is(pg_temp.send((select v from t where k = 'pendL'), 'live') ->> 'ignored', 'true',
  'A late pending is ignored.');
reset role;
select is(
  pg_temp.refund_of((select v::uuid from t where k = 'stayL')) || ':'
    || (select count(*) from audit.audit_event e
         where e.action = 'payment.paystack_refund_failed'
           and e.target_id = (select p.id from public.payment p
                               where p.reference = (select v from t where k = 'payL'))),
  'needs-attention:false:paid:1', 'It still needs attention, and a person was told once.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'doneL'), 'live') ->> 'state', 'processed',
  'Paystack processes it after all.');
reset role;
select is(pg_temp.refund_of((select v::uuid from t where k = 'stayL')), 'processed:true:reversed',
  'The real stay is refunded and its payment reversed.');
select is(
  (select count(distinct x.id) || ':'
          || coalesce(sum(e.debit) filter (where e.account_code = 'refunds_pending'), 0) || ':'
          || coalesce(sum(e.credit) filter (where e.account_code <> 'refunds_pending'), 0)
     from ledger.transaction x join ledger.entry e on e.transaction_id = x.id
    where x.kind = 'stay_refunded' and x.related ->> 'stay_id' = (select v from t where k = 'stayL')),
  '1:1400000:1400000', 'The books post stay_refunded for KES 14,000, once.');
set local role authenticated;
select pg_temp.as_user('d2430000-0000-4000-8000-000000000001');
select is(
  (select concat_ws(':', x ->> 'refundDue', x ->> 'refunded', x ->> 'refundKes')
     from jsonb_array_elements(public.rpc_stay_guest_stays() -> 'stays') x
    where x ->> 'id' = (select v from t where k = 'stayL')),
  'true:true:14000', 'The guest''s list shows KES 14,000 refunded.');
select pg_temp.as_user('d2430000-0000-4000-8000-0000000000aa');
select is(
  (select concat_ws(':', x.provider, x.is_test::text, x.paystack_state)
     from public.rpc_stay_refunds('refunded') x where x.stay_id = (select v::uuid from t where k = 'stayL')),
  'paystack:false:processed', 'The queue shows it processed.');
select is(
  (select concat_ws(':', x ->> 'changed', x ->> 'paystack_refund_state', x ->> 'message')
     from public.rpc_stay_cancel_refund_full((select v::uuid from t where k = 'stayL'), 'Once more') x),
  'false:processed:This stay''s refund is already recorded. Nothing was changed.',
  'Cancelling a refunded stay changes nothing.');
reset role;

-- ──────────────────────────────────────────────────── 5. two refunds of the same amount

-- Rows set up directly: the partial stay's refund and another of KES 7,000 on the same payment.
insert into public.paystack_refund (kind, stay_id, payment_id, reference, amount_cents, is_test, state)
select x.kind, x.stay_id, p.id, x.reference, 700000, false, 'pending'
  from public.payment p,
       (values ('stay', (select v::uuid from t where k = 'stayP'), 'NXR-243aaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
               ('booking', null::uuid, 'NXR-243bbbbbbbbbbbbbbbbbbbbbbbbbbbbb')) as x(kind, stay_id, reference)
 where p.reference = (select v from t where k = 'payP');

insert into t values
  ('doneP', pg_temp.notice('refund.processed', (select v from t where k = 'txnP'), '132013318362', '700000', 'live')),
  ('failP', pg_temp.notice('refund.failed', (select v from t where k = 'txnP'), 'TRF_9vgfawjnoz58uxy', '700000', 'live')),
  ('pendP', pg_temp.notice('refund.pending', (select v from t where k = 'txnP'), null, '700000', 'live')),
  ('procP', pg_temp.notice('refund.processing', (select v from t where k = 'txnP'), null, '700000', 'live'));

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'doneP'), 'live') ->> 'reason', 'ambiguous_refund',
  'Two equal open refunds: a processed notice picks neither.');
reset role;
update public.paystack_refund set state = 'failed' where reference = 'NXR-243bbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'pendP'), 'live'),
  '{"ok": true, "ignored": true, "status": "pending"}'::jsonb,
  'With one equal try failed, a pending notice is ignored quietly.');
select is(pg_temp.send((select v from t where k = 'procP'), 'live'),
  '{"ok": true, "ignored": true, "status": "processing"}'::jsonb,
  'So is a processing one.');
reset role;
select is(
  (select string_agg(r.kind || ':' || r.state, ' ' order by r.reference) from public.paystack_refund r
    where r.reference in ('NXR-243aaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'NXR-243bbbbbbbbbbbbbbbbbbbbbbbbbbbbb'))
  || ' ' || (select count(*) from audit.audit_event e
              where e.action = 'payment.paystack_refund_unmatched'
                and e.after ->> 'transaction' = (select v from t where k = 'txnP')),
  'stay:pending booking:failed 1', 'They changed nothing and raised no alert.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'failP'), 'live') ->> 'reason', 'ambiguous_refund',
  'A late failed notice cannot hit the other try.');
reset role;
update public.paystack_refund set state = 'processed' where reference = 'NXR-243bbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'doneP'), 'live') ->> 'reason', 'ambiguous_refund',
  'A processed refund counts, so its redelivery cannot land on the equal one.');
reset role;
select is(
  (select string_agg(r.kind || ':' || r.state, ' ' order by r.reference) from public.paystack_refund r
    where r.reference in ('NXR-243aaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'NXR-243bbbbbbbbbbbbbbbbbbbbbbbbbbbbb'))
  || ' ' || (select (s.refunded_at is null)::text from public.stay s
              where s.id = (select v::uuid from t where k = 'stayP'))
  || ' ' || (select count(*) from audit.audit_event e
              where e.action = 'payment.paystack_refund_unmatched' and e.after ->> 'why' = 'ambiguous_refund'
                and e.after ->> 'transaction' = (select v from t where k = 'txnP')),
  'stay:pending booking:processed true 3', 'Nothing moved, and all three were audited.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'pendP'), 'live') ->> 'reason', 'ambiguous_refund',
  'With neither failed, a pending notice is still one for a person.');
reset role;
update public.paystack_refund set state = 'failed' where reference = 'NXR-243bbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'doneP'), 'live') ->> 'state', 'processed',
  'With the other one failed, exactly one refund fits.');
reset role;
select is(
  (select string_agg(r.kind || ':' || r.state, ' ' order by r.reference) from public.paystack_refund r
    where r.reference in ('NXR-243aaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'NXR-243bbbbbbbbbbbbbbbbbbbbbbbbbbbbb'))
  || ' ' || (select (s.refunded_at is not null)::text from public.stay s
              where s.id = (select v::uuid from t where k = 'stayP')),
  'stay:processed booking:failed true', 'The partial stay is refunded.');
select is(
  (select concat_ws(':', r.total_cents, r.lines #>> '{0,amount_cents}', r.method,
                    (r.method_ref = 'NXR-243aaaaaaaaaaaaaaaaaaaaaaaaaaaaa')::text)
     from public.receipt r
    where r.source_type = 'stay_refund' and r.source_id = (select v::uuid from t where k = 'stayP')),
  '700000:700000:Card:true',
  'A partial refund''s receipt is for the KES 7,000 sent back, not the KES 14,000 paid.');
-- That notice named only the transaction, and an equal try is marked failed.
select is(
  (select concat_ws(':', count(*), min(e.severity::text), min(m.review_state))
     from audit.audit_event e left join audit.event_meta m on m.event_id = e.id
    where e.action = 'payment.paystack_refund_after_failed_try'
      and e.after ->> 'reference' = 'NXR-243aaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  '1:high:needs_review', 'It may have been the failed try: a person is asked to check.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.send((select v from t where k = 'doneP'), 'live') ->> 'duplicate', 'true',
  'The other notice of that amount lands on the processed refund.');
reset role;
select is(
  (select count(*)::int from audit.audit_event e
    where e.action = 'payment.paystack_refund_after_failed_try'
      and e.after ->> 'reference' = 'NXR-243aaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  1, 'The person is asked once.');

-- ──────────────────────────────────────────────────── 6. the audit actions

select results_eq(
  $$select action collate "C", module, default_severity::text, needs_review, money
      from audit.action_registry
     where action in ('stay.cancel_refund_full', 'payment.paystack_refund_unmatched',
                      'payment.paystack_paid_after_close', 'payment.paystack_after_close_failed',
                      'payment.paystack_refund_after_failed_try')
     order by 1$$,
  $$values
    ('payment.paystack_after_close_failed' collate "C", 'orders', 'high', true, true),
    ('payment.paystack_paid_after_close', 'orders', 'high', true, true),
    ('payment.paystack_refund_after_failed_try', 'orders', 'high', true, true),
    ('payment.paystack_refund_unmatched', 'orders', 'high', true, true),
    ('stay.cancel_refund_full', 'hotels', 'high', false, true)$$,
  'The five new actions are registered.');

select * from finish();
rollback;
