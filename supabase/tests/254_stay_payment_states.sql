-- Stay payments through Paystack (20270330000300): the stay screen reads
-- pending only while money may still come; an unfinished payment ends once
-- Paystack has said it is unpaid, or after two hours with the case raised; money
-- that does not match is held, never failed and never asked for again; a stay is
-- paid one way at a time and once; a payment arriving after the nights had gone
-- is in the guest's list; and a repeat changes nothing.
--
-- Money by hand: the home is KES 7,000 a night, so each two-night stay is
-- KES 14,000 (1,400,000 cents). Times inside one test run are all the same
-- now(), so ages are set by moving a row's times back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(66);
-- Property review (20270323000100): the homes in this file count as reviewed and approved.
alter table public.property alter column review_status set default 'approved';

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to authenticated, anon;

create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
create function pg_temp.guest() returns void language sql as $$
  select pg_temp.as_user('d2540000-0000-4000-8000-000000000001')
$$;
create function pg_temp.stay(n integer) returns uuid language sql immutable as $$
  select ('d2545000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.checkout(n integer) returns uuid language sql immutable as $$
  select ('d2546000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.k(p_key text) returns text language sql as $$
  select v from t where k = p_key
$$;
/* A two-night hold made as the apps make it, without the two-holds limit.
   Run as the setup role. */
create function pg_temp.hold(n integer, p_status text default 'held') returns void
language sql as $$
  insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, guest_user_id,
    party_adults, party_children, check_in, check_out, source, status, hold_expires_at,
    rate_kes, quote_total_kes)
  values (pg_temp.stay(n), 'd2541000-0000-4000-8000-00000000000a', 'd2542000-0000-4000-8000-00000000000a',
    'd2543000-0000-4000-8000-00000000000a', 'Amina', 'd2540000-0000-4000-8000-000000000001', 1, 0,
    now() + make_interval(days => 10 * n), now() + make_interval(days => 10 * n + 2), 'nexg', p_status,
    now() + interval '15 minutes', 7000, 14000);
  insert into public.native_stay_checkout (id, guest_user_id, property_id, unit_id, check_in, check_out,
    adults, children, nightly_minor, total_minor, expires_at, stay_id)
  values (pg_temp.checkout(n), 'd2540000-0000-4000-8000-000000000001', 'd2542000-0000-4000-8000-00000000000a',
    'd2543000-0000-4000-8000-00000000000a', current_date + 10 * n, current_date + 10 * n + 2, 1, 0,
    700000, 1400000, now() + interval '10 minutes', pg_temp.stay(n));
$$;
/* The guest opens the stay's payment; its reference is kept as r<n>. */
create function pg_temp.begin_pay(n integer) returns void language sql as $$
  insert into t select 'r' || n, public.rpc_payment_begin_stay(pg_temp.stay(n)) ->> 'reference'
$$;
create function pg_temp.try(n integer, p_channel text, p_phone text default null) returns jsonb
language sql as $$
  select public.rpc_payment_paystack_attempt(pg_temp.k('r' || n), p_channel, p_phone,
    'sk_live_ci_only_0123456789abcdef')
$$;
/* Paystack took the try: a card page (p_url), or a prompt sent (null). */
create function pg_temp.opened(p_attempt text, p_url text default null, p_failure text default null)
returns jsonb language sql as $$
  select public.rpc_payment_paystack_opened(p_attempt, null, p_url, p_failure,
    'sk_live_ci_only_0123456789abcdef')
$$;
/* Paystack's verify answer. */
create function pg_temp.verified(p_attempt text, p_status text) returns jsonb language sql as $$
  select public.rpc_payment_paystack_verified(p_attempt,
    jsonb_build_object('status', true, 'data',
      jsonb_build_object('reference', p_attempt, 'status', p_status))::text,
    'sk_live_ci_only_0123456789abcdef')
$$;
/* Paystack's signed success, as the webhook receives it. */
create function pg_temp.success(p_attempt text, p_id bigint, p_amount bigint,
                                p_requested bigint default null, p_currency text default 'KES')
returns jsonb language plpgsql as $$
declare
  v_body text;
begin
  v_body := jsonb_build_object('event', 'charge.success', 'data', jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'reference', p_attempt, 'status', 'success', 'amount', p_amount,
    'requested_amount', p_requested, 'currency', p_currency, 'channel', 'card', 'fees', 50000)))::text;
  return public.rpc_payment_paystack_webhook(v_body, encode(extensions.hmac(
    convert_to(v_body, 'UTF8'), convert_to('sk_live_ci_only_0123456789abcdef', 'UTF8'), 'sha512'), 'hex'));
end
$$;
/* What the apps are told (as the guest). */
create function pg_temp.told(n integer) returns text language sql as $$
  select public.rpc_native_stay_status(pg_temp.checkout(n)) ->> 'paymentStatus'
$$;
/* The setup role's helpers. */
create function pg_temp.end_hold(n integer) returns void language sql as $$
  update public.stay set hold_expires_at = now() - interval '1 minute' where id = pg_temp.stay(n);
  update public.payment set expires_at = now() - interval '1 minute' where stay_id = pg_temp.stay(n);
$$;
create function pg_temp.pay_id(n integer) returns uuid language sql as $$
  select id from public.payment where reference = pg_temp.k('r' || n)
$$;
create function pg_temp.pay(n integer) returns text language sql as $$
  select state::text || ':' || (held_for_review_at is not null)::text
    from public.payment where reference = pg_temp.k('r' || n)
$$;
create function pg_temp.audits(p_action text, p_target uuid) returns integer language sql as $$
  select count(*)::int from audit.audit_event where action = p_action and target_id = p_target
$$;
create function pg_temp.tries(n integer) returns integer language sql as $$
  select count(*)::int from public.paystack_attempt where payment_id = pg_temp.pay_id(n)
$$;
/* What a repeat must not change: the payment, its tries and its audit entries. */
create function pg_temp.snap(n integer) returns text language sql as $$
  select p.ctid::text || '|'
         || coalesce((select string_agg(a.ctid::text, ' ' order by a.reference)
                        from public.paystack_attempt a where a.payment_id = p.id), '-')
         || '|' || (select count(*) from audit.audit_event e where e.target_id = p.id)::text
    from public.payment p where p.reference = pg_temp.k('r' || n)
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'd2540000-0000-4000-8000-000000000001', 'authenticated',
   'authenticated', 'guest254a@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2540000-0000-4000-8000-000000000002', 'authenticated',
   'authenticated', 'guest254b@example.test', '', now(), false, now(), now());
insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d2541000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 254]', '+254700025400',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d2542000-0000-4000-8000-00000000000a', 'd2541000-0000-4000-8000-00000000000a', 'block-254',
        '[Block 254]', 'apartment_block', 'Kilimani', (select id from public.city where slug = 'nairobi'),
        true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes, wifi_name)
values ('d2543000-0000-4000-8000-00000000000a', 'd2541000-0000-4000-8000-00000000000a',
        'd2542000-0000-4000-8000-00000000000a', 'A', 'A', '[Address]', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 3, 7000, 'Net254');

select pg_temp.hold(n) from generate_series(1, 12) n;
select pg_temp.hold(13, 'cancelled');

-- ════════════════════════════ 1. a card: refused to open, then left unfinished

set local role authenticated;
select pg_temp.guest();
select pg_temp.begin_pay(1);
select is(pg_temp.told(1), 'unpaid', 'A payment opened with nothing tried yet is unpaid, not pending.');
select pg_temp.try(1, 'card');
select pg_temp.opened(pg_temp.k('r1') || '-1', null, 'No card page was opened.');
select is(pg_temp.told(1), 'failed', 'A card page that never opened reads failed, not pending.');
select is(public.rpc_stay_payment_state(pg_temp.stay(1)) ->> 'status', 'failed',
  'The payment screen says the same.');
select is(pg_temp.try(1, 'card') ->> 'attempt_reference', pg_temp.k('r1') || '-2',
  'After a failed try another one starts.');
select pg_temp.opened(pg_temp.k('r1') || '-2', 'https://checkout.paystack.com/ci-254a');
select is(
  (select concat_ws(':', x ->> 'status', x ->> 'attempt_reference' = pg_temp.k('r1') || '-2',
                    x ->> 'authorization_url')
     from public.rpc_stay_payment_state(pg_temp.stay(1)) x),
  'pending:t:https://checkout.paystack.com/ci-254a',
  'The open page speaks, not the failed try before it.');
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'channel', x ->> 'attempt_reference' = pg_temp.k('r1') || '-2',
                    x ->> 'authorization_url', (x ? 'retry_after_seconds')::text)
     from pg_temp.try(1, 'mpesa', '+254712345678') x),
  'true:card:t:https://checkout.paystack.com/ci-254a:false',
  'With a card page open, M-Pesa is not started: the page is handed back.');
select is(
  public.rpc_payment_paystack_attempt(pg_temp.k('r1'), 'card', null,
    'sk_live_ci_only_0123456789abcdef', true) ->> 'reused',
  'true', 'Nor a second card page, even to save the card.');
reset role;
select is(pg_temp.tries(1), 2, 'No third try was made.');

set local role authenticated;
select pg_temp.guest();
select pg_temp.verified(pg_temp.k('r1') || '-2', 'abandoned');
select is(pg_temp.told(1), 'pending', 'An abandoned answer while the hold lasts ends nothing.');
reset role;
select is((select provider_status from public.paystack_attempt where reference = pg_temp.k('r1') || '-2'),
  'abandoned', 'What Paystack answered is kept on the try.');
select public.cron_expire_stay_payments();
select is(pg_temp.pay(1), 'authorised:false', 'A payment is not closed while its hold lasts.');

select pg_temp.end_hold(1);
select public.cron_expire_stay_payments();
select is(pg_temp.pay(1), 'authorised:false',
  'Nor on an answer given soon after the try began, with the page perhaps still in use.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(1), 'pending', 'It reads pending until Paystack has been asked late enough.');
reset role;

update public.paystack_attempt set created_at = now() - interval '26 minutes'
 where payment_id = pg_temp.pay_id(1);
select public.cron_expire_stay_payments();
select is(
  (select state::text || ':' || failure_reason from public.payment where id = pg_temp.pay_id(1)),
  'abandoned:not paid before the hold ran out',
  'Asked 25 minutes or more after the try began and still unpaid: it is closed.');
select is(pg_temp.audits('payment.stay_expired', pg_temp.pay_id(1)), 1, 'The closing is audited.');
insert into t select 'snap1', pg_temp.snap(1);
select public.cron_expire_stay_payments();
select is(pg_temp.snap(1), pg_temp.k('snap1'), 'A second run changes nothing.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(1), 'failed', 'The apps are told it failed, so they are no longer locked.');
select is(public.rpc_stay_payment_state(pg_temp.stay(1)) ->> 'status', 'unpaid',
  'The payment screen shows nothing in progress.');

-- The card page is paid after all.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.success(pg_temp.k('r1') || '-2', 2540001, 1400000) ->> 'state', 'paid',
  'A success arriving after the closing is still recorded.');
reset role;
select is((select status::text || ':' || paid_kes from public.stay where id = pg_temp.stay(1)),
  'booked:14000', 'With the nights still free, the stay is booked.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(1), 'paid', 'And reads paid.');

-- ════════════════════════════ 2. paid after the nights had gone

select pg_temp.begin_pay(2);
select pg_temp.try(2, 'mpesa', '+254712345678');
select pg_temp.opened(pg_temp.k('r2') || '-1');
reset role;
update public.stay set hold_expires_at = now() - interval '1 minute' where id = pg_temp.stay(2);
select public.fn_stay_release_expired_holds();
insert into public.stay (id, host_id, unit_id, check_in, check_out, source, status)
select 'd2545000-0000-4000-8000-0000000000e2', host_id, unit_id, check_in, check_out, 'entered', 'booked'
  from public.stay where id = pg_temp.stay(2);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.success(pg_temp.k('r2') || '-1', 2540002, 1400000);
set local role authenticated;
select pg_temp.guest();
select is(
  (select concat_ws(':', x ->> 'status', x ->> 'paymentStatus', x ->> 'refundDue',
                    x ->> 'cancelledAfterBooking')
     from public.rpc_native_stay_status(pg_temp.checkout(2)) x),
  'cancelled:paid:true:false', 'Money for nights that had gone reads paid with a refund due.');
select is(
  (select concat_ws(':', x ->> 'status', x ->> 'refundDue', x ->> 'refunded', x ->> 'refundKes',
                    coalesce(x ->> 'handoff', '-'), coalesce(x ->> 'wifi_name', '-'))
     from jsonb_array_elements(public.rpc_stay_guest_stays() -> 'stays') x
    where x ->> 'id' = pg_temp.stay(2)::text),
  'cancelled:true:false:14000:-:-',
  'The stay is in the guest''s list with its refund due, with no way in and no Wi-Fi.');
select ok(
  not exists (select 1 from jsonb_array_elements(public.rpc_stay_guest_stays() -> 'stays') x
               where x ->> 'id' = pg_temp.stay(13)::text),
  'A hold that lapsed unpaid is still not listed.');

-- ════════════════════════════ 3. a phone prompt, and asking Paystack

select pg_temp.begin_pay(3);
select pg_temp.try(3, 'mpesa', '+254712345678');
select pg_temp.opened(pg_temp.k('r3') || '-1');
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'channel', x ->> 'retry_after_seconds')
     from pg_temp.try(3, 'card') x),
  'true:mpesa:180', 'While a prompt waits, no card page is opened.');
reset role;
update public.paystack_attempt set opened_at = now() - interval '2 minutes'
 where reference = pg_temp.k('r3') || '-1';
set local role authenticated;
select pg_temp.guest();
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'channel', x ->> 'retry_after_seconds')
     from pg_temp.try(3, 'mpesa', '+254722000000') x),
  'true:mpesa:60', 'Nor a prompt to another number while the first could still be approved.');
select is(
  public.rpc_stay_payment_check_claim(pg_temp.stay(3)),
  jsonb_build_array(jsonb_build_object('attempt_reference', pg_temp.k('r3') || '-1', 'is_test', false)),
  'A try sent ten seconds ago or more is due a question.');
select is(public.rpc_stay_payment_check_claim(pg_temp.stay(3)), '[]'::jsonb,
  'Asked just now, it is not handed out again.');
select pg_temp.as_user('d2540000-0000-4000-8000-000000000002');
select throws_ok(
  format($$select public.rpc_stay_payment_check_claim(%L)$$, pg_temp.stay(3)),
  '42501', 'That stay is not yours.', 'Nobody else can ask about it.');
select pg_temp.guest();
select pg_temp.verified(pg_temp.k('r3') || '-1', 'failed');
select is(pg_temp.told(3), 'failed', 'Paystack saying the prompt failed reads failed at once.');
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'attempt_reference' = pg_temp.k('r3') || '-2')
     from pg_temp.try(3, 'card') x),
  'false:t', 'And another way to pay may start.');

-- ════════════════════════════ 4. less than asked: held

select pg_temp.begin_pay(4);
select pg_temp.try(4, 'mpesa', '+254712345678');
select pg_temp.opened(pg_temp.k('r4') || '-1');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.success(pg_temp.k('r4') || '-1', 2540004, 1000000, 1400000),
  '{"ok": false, "reason": "amount_mismatch", "held": true}'::jsonb,
  'Less than asked is held.');
reset role;
select is(pg_temp.pay(4), 'authorised:true', 'The payment is not failed.');
select is(
  (select concat_ws(':', status::text, coalesce(paid_kes::text, '-')) from public.stay
    where id = pg_temp.stay(4)),
  'held:-', 'Nothing is booked on it.');
select is(pg_temp.audits('payment.amount_mismatch', pg_temp.pay_id(4)), 1, 'A person is told.');
insert into t select 'snap4', pg_temp.snap(4);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.success(pg_temp.k('r4') || '-1', 2540004, 1000000, 1400000);
reset role;
select is(pg_temp.snap(4), pg_temp.k('snap4'), 'The same notice again changes nothing.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(4), 'pending', 'The apps are told it is pending.');
select is(
  public.rpc_stay_payment_state(pg_temp.stay(4)),
  jsonb_build_object('status', 'pending', 'reference', pg_temp.k('r4'), 'is_test', false),
  'The payment screen too.');
select throws_ok(
  format($$select public.rpc_payment_begin_stay(%L)$$, pg_temp.stay(4)),
  '22023', 'We have received money for this booking and are checking it. Do not pay again.',
  'The guest is not asked to pay again.');
select throws_ok(
  $$select pg_temp.try(4, 'card')$$,
  '22023', 'We have received money for this and are checking it. Do not pay again.',
  'Nor can another try be started.');
reset role;
select pg_temp.end_hold(4);
select public.cron_expire_stay_payments();
select is(pg_temp.pay(4), 'authorised:true', 'Held money is never closed by the clock.');

-- ════════════════════════════ 5. fees on top, and other mismatches

set local role authenticated;
select pg_temp.guest();
select pg_temp.begin_pay(5);
select pg_temp.try(5, 'card');
select pg_temp.opened(pg_temp.k('r5') || '-1', 'https://checkout.paystack.com/ci-254e');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.success(pg_temp.k('r5') || '-1', 2540005, 1450000, 1400000) ->> 'state', 'paid',
  'Fees charged on top of what was asked still pay the stay.');
select is(pg_temp.success(pg_temp.k('r5') || '-1', 2540005, 1450000, 1400000) ->> 'duplicate', 'true',
  'Once.');
reset role;
select is(
  (select concat_ws(':', s.status::text, s.paid_kes, p.amount_cents)
     from public.stay s join public.payment p on p.reference = s.payment_reference
    where s.id = pg_temp.stay(5)),
  'booked:14000:1400000', 'For the price, not the amount with fees.');
select is(
  (select count(*) || ':' || min(after ->> 'charged_cents') from audit.audit_event
    where action = 'payment.paystack_over_paid' and target_id = pg_temp.pay_id(5)),
  '1:1450000', 'And the extra is raised once.');

set local role authenticated;
select pg_temp.guest();
select pg_temp.begin_pay(6);
select pg_temp.try(6, 'card');
select pg_temp.opened(pg_temp.k('r6') || '-1', 'https://checkout.paystack.com/ci-254f');
select pg_temp.begin_pay(7);
select pg_temp.try(7, 'card');
select pg_temp.opened(pg_temp.k('r7') || '-1', 'https://checkout.paystack.com/ci-254g');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.success(pg_temp.k('r6') || '-1', 2540006, 1500000) ->> 'held', 'true',
  'More than asked with nothing to say what was asked is held.');
select is(pg_temp.success(pg_temp.k('r7') || '-1', 2540007, 1400000, null, 'USD') ->> 'reason',
  'currency_mismatch', 'Another currency is refused as before.');
reset role;
select is(pg_temp.pay(7), 'authorised:true', 'But the money is held, not forgotten.');

-- ════════════════════════════ 6. a stay is paid once

insert into public.payment (reference, intent, stay_id, city_id, amount_cents, currency, created_by, created_via)
select ref, 'stay', pg_temp.stay(n), (select id from public.city where slug = 'nairobi'), 1400000, 'KES',
       'd2540000-0000-4000-8000-000000000001', 'guest_checkout'
  from (values ('NXP-254-AGAIN', 2), ('NXP-254-SECOND', 5)) v(ref, n);
-- The clash that cancelled stay 2 is gone: a second payment must still not book it.
update public.stay set status = 'cancelled' where id = 'd2545000-0000-4000-8000-0000000000e2';
update public.stay set status = 'in_stay' where id = pg_temp.stay(5);
select public.rpc_payment_webhook('test.settled', ref, 'test:' || ref, true, '{}'::jsonb, true,
         'TEST-' || ref, 1400000, 'card')
  from (values ('NXP-254-AGAIN'), ('NXP-254-SECOND')) v(ref);
select is(
  (select status::text || ':' || (payment_reference = pg_temp.k('r5'))::text from public.stay
    where id = pg_temp.stay(5)),
  'in_stay:true', 'A second payment leaves a stay in progress as it is.');
select is(
  (select status::text || ':' || (payment_reference = pg_temp.k('r2'))::text from public.stay
    where id = pg_temp.stay(2)),
  'cancelled:true', 'And does not book a stay already due a refund.');
select is(
  pg_temp.audits('stay.payment_not_applied', pg_temp.stay(5))
    + pg_temp.audits('stay.payment_not_applied', pg_temp.stay(2)),
  2, 'Each is raised for a person to refund.');

-- ════════════════════════════ 7. how the others end

set local role authenticated;
select pg_temp.guest();
-- 8: a prompt Paystack never answers about.
select pg_temp.begin_pay(8);
select pg_temp.try(8, 'mpesa', '+254712345678');
select pg_temp.opened(pg_temp.k('r8') || '-1');
reset role;
select pg_temp.end_hold(8);
select public.cron_expire_stay_payments();
select is(pg_temp.pay(8), 'authorised:false', 'With no answer it waits.');
update public.paystack_attempt
   set created_at = now() - interval '121 minutes', opened_at = now() - interval '121 minutes'
 where reference = pg_temp.k('r8') || '-1';
select public.cron_expire_stay_payments();
select is(
  pg_temp.pay(8) || ':' || pg_temp.audits('payment.stay_unconfirmed', pg_temp.pay_id(8)),
  'abandoned:false:1', 'Not past two hours: closed, and raised for a person.');
select ok(
  exists (select 1 from public.rpc_payment_paystack_due('sk_live_ci_only_0123456789abcdef')
           where attempt_reference = pg_temp.k('r8') || '-1'),
  'The sweep still asks about a closed stay payment.');
update public.paystack_attempt set checked_at = now() - interval '10 minutes'
 where reference = pg_temp.k('r8') || '-1';
select ok(
  not exists (select 1 from public.rpc_payment_paystack_due('sk_live_ci_only_0123456789abcdef')
               where attempt_reference = pg_temp.k('r8') || '-1'),
  'Though only every half hour.');

-- 9: a prompt Paystack calls abandoned after its three minutes.
set local role authenticated;
select pg_temp.guest();
select pg_temp.begin_pay(9);
select pg_temp.try(9, 'mpesa', '+254712345678');
select pg_temp.opened(pg_temp.k('r9') || '-1');
reset role;
update public.paystack_attempt set created_at = now() - interval '6 minutes'
 where reference = pg_temp.k('r9') || '-1';
set local role authenticated;
select pg_temp.guest();
select pg_temp.verified(pg_temp.k('r9') || '-1', 'abandoned');
select is(pg_temp.told(9), 'failed',
  'Asked five minutes on and called abandoned, the prompt reads failed while the hold still lasts.');
reset role;
select pg_temp.end_hold(9);
select public.cron_expire_stay_payments();
select is(
  pg_temp.pay(9) || ':' || pg_temp.audits('payment.stay_expired', pg_temp.pay_id(9)),
  'abandoned:false:1', 'A prompt is closed on an answer five minutes after it began.');

-- 10: Paystack called it successful, but it was never applied.
set local role authenticated;
select pg_temp.guest();
select pg_temp.begin_pay(10);
select pg_temp.try(10, 'card');
select pg_temp.opened(pg_temp.k('r10') || '-1', 'https://checkout.paystack.com/ci-254j');
reset role;
update public.paystack_attempt set provider_status = 'success' where reference = pg_temp.k('r10') || '-1';
select pg_temp.end_hold(10);
select public.cron_expire_stay_payments();
select is(
  pg_temp.pay(10) || ':' || pg_temp.audits('payment.stay_unconfirmed', pg_temp.pay_id(10)),
  'authorised:true:1', 'It is held for a person, never closed.');

-- 11: nothing was ever tried. 12: a card try never recorded.
set local role authenticated;
select pg_temp.guest();
select pg_temp.begin_pay(11);
select pg_temp.begin_pay(12);
select pg_temp.try(12, 'card');
reset role;
update public.paystack_attempt set created_at = now() - interval '2 minutes'
 where reference = pg_temp.k('r12') || '-1';
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(12), 'unpaid', 'A card try that never got a page is not pending.');
reset role;
select pg_temp.end_hold(11);
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(11), 'failed', 'Out of time with nothing tried reads failed.');
reset role;
select public.cron_expire_stay_payments();
select is(pg_temp.pay(11), 'abandoned:false', 'And is closed.');

-- ════════════════════════════ 8. an order reads held money the same way

insert into public.guest (id, phone, name, user_id)
values ('d2547000-0000-4000-8000-000000000001', '+254700025401', '[Guest 254]',
        'd2540000-0000-4000-8000-000000000002');
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select 'd2547000-0000-4000-8000-000000000011', 'PS254-HELD', 'd2547000-0000-4000-8000-000000000001',
       m.id, b.id, m.city_id, 'web', '[Fixture address]', 'confirmed', 'mpesa_stk', 'pending',
       150000, 0, 0, 150000, 'KES'
  from public.merchant m
  join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
 where m.city_id is not null
 order by m.id limit 1;
set local role authenticated;
select pg_temp.as_user('d2540000-0000-4000-8000-000000000002');
insert into t select 'order', public.rpc_payment_begin_order('d2547000-0000-4000-8000-000000000011') ->> 'reference';
select public.rpc_payment_paystack_attempt(pg_temp.k('order'), 'card', null, 'sk_live_ci_only_0123456789abcdef');
select pg_temp.opened(pg_temp.k('order') || '-1', 'https://checkout.paystack.com/ci-254o');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.success(pg_temp.k('order') || '-1', 2540100, 100000);
set local role authenticated;
select pg_temp.as_user('d2540000-0000-4000-8000-000000000002');
select is(public.rpc_order_payment_state('d2547000-0000-4000-8000-000000000011') ->> 'status',
  'pending', 'An order paid short reads pending, not unpaid or failed.');
select throws_ok(
  $$select public.rpc_payment_paystack_attempt(pg_temp.k('order'), 'card', null,
      'sk_live_ci_only_0123456789abcdef')$$,
  '22023', 'We have received money for this and are checking it. Do not pay again.',
  'And takes no further try.');
reset role;

-- ════════════════════════════ 9. grants and the register

select ok(
  not has_function_privilege('anon', 'public.rpc_stay_payment_check_claim(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cron_expire_stay_payments()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.cron_expire_stay_payments()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_paystack_apply(text, text, jsonb, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_native_stay_checkout_view(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.rpc_stay_payment_check_claim(uuid)', 'EXECUTE'),
  'The public key reaches nothing new, and no account closes or applies a payment itself.');
select is(
  (select count(*)::int from audit.action_registry
    where action in ('payment.paystack_over_paid', 'stay.payment_not_applied',
                     'payment.stay_expired', 'payment.stay_unconfirmed') and money),
  4, 'The new actions are registered.');
select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
