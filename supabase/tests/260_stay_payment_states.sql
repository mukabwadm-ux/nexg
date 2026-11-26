-- Stay payments through Paystack (20270335000100): a card page closed
-- unfinished says so and is the page handed back; the stay screens read pending
-- only while money may still come; an unfinished payment ends once Paystack,
-- asked late enough, says it is unpaid, or after two hours with the case raised
-- and nothing saying money did not arrive; a webhook that cannot say whether a
-- larger amount is fees waits for Paystack's verify answer; other mismatches are
-- as before; a waiting phone prompt is handed back; a paid stay takes no other
-- payment; money for nights that had gone is in the guest's list; orders pay as
-- before; and a repeat changes nothing.
--
-- Money by hand: the home is KES 7,000 a night, so each two-night stay is
-- KES 14,000 (1,400,000 cents). Times inside one test run are all the same
-- now(), so ages are set by moving a row's times back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(80);
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
  select pg_temp.as_user('d2600000-0000-4000-8000-000000000001')
$$;
create function pg_temp.stay(n integer) returns uuid language sql immutable as $$
  select ('d2605000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.checkout(n integer) returns uuid language sql immutable as $$
  select ('d2606000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
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
  values (pg_temp.stay(n), 'd2601000-0000-4000-8000-00000000000a', 'd2602000-0000-4000-8000-00000000000a',
    'd2603000-0000-4000-8000-00000000000a', 'Amina', 'd2600000-0000-4000-8000-000000000001', 1, 0,
    now() + make_interval(days => 10 * n), now() + make_interval(days => 10 * n + 2), 'nexg', p_status,
    now() + interval '15 minutes', 7000, 14000);
  insert into public.native_stay_checkout (id, guest_user_id, property_id, unit_id, check_in, check_out,
    adults, children, nightly_minor, total_minor, expires_at, stay_id)
  values (pg_temp.checkout(n), 'd2600000-0000-4000-8000-000000000001', 'd2602000-0000-4000-8000-00000000000a',
    'd2603000-0000-4000-8000-00000000000a', current_date + 10 * n, current_date + 10 * n + 2, 1, 0,
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
/* A first try, whole: a card page opened, or an M-Pesa prompt sent. */
create function pg_temp.card_page(n integer) returns void language sql as $$
  select pg_temp.begin_pay(n);
  select pg_temp.try(n, 'card');
  select pg_temp.opened(pg_temp.k('r' || n) || '-1', 'https://checkout.paystack.com/ci-260-' || n);
$$;
create function pg_temp.prompt(n integer) returns void language sql as $$
  select pg_temp.begin_pay(n);
  select pg_temp.try(n, 'mpesa', '+254712345678');
  select pg_temp.opened(pg_temp.k('r' || n) || '-1');
$$;
/* Paystack's verify answer. */
create function pg_temp.verified(p_attempt text, p_status text, p_amount bigint default null,
  p_requested bigint default null, p_id bigint default null, p_currency text default 'KES')
returns jsonb language sql as $$
  select public.rpc_payment_paystack_verified(p_attempt,
    jsonb_build_object('status', true, 'data', jsonb_strip_nulls(jsonb_build_object(
      'id', p_id, 'reference', p_attempt, 'status', p_status, 'amount', p_amount,
      'requested_amount', p_requested, 'currency', p_currency, 'channel', 'card')))::text,
    'sk_live_ci_only_0123456789abcdef')
$$;
/* Paystack's signed success, as the webhook receives it. */
create function pg_temp.success(p_attempt text, p_id bigint, p_amount bigint,
                                p_requested bigint default null)
returns jsonb language plpgsql as $$
declare
  v_body text;
begin
  v_body := jsonb_build_object('event', 'charge.success', 'data', jsonb_strip_nulls(jsonb_build_object(
    'id', p_id, 'reference', p_attempt, 'status', 'success', 'amount', p_amount,
    'requested_amount', p_requested, 'currency', 'KES', 'channel', 'card', 'fees', 50000)))::text;
  return public.rpc_payment_paystack_webhook(v_body, encode(extensions.hmac(
    convert_to(v_body, 'UTF8'), convert_to('sk_live_ci_only_0123456789abcdef', 'UTF8'), 'sha512'), 'hex'));
end
$$;
/* What the apps are told (as the guest): paymentStatus and lastTry. */
create function pg_temp.told(n integer) returns text language sql as $$
  select concat_ws(':', x ->> 'paymentStatus', coalesce(x ->> 'lastTry', '-'))
    from public.rpc_native_stay_status(pg_temp.checkout(n)) x
$$;
/* The setup role's helpers. */
create function pg_temp.end_hold(n integer) returns void language sql as $$
  update public.stay set hold_expires_at = now() - interval '1 minute' where id = pg_temp.stay(n);
  update public.payment set expires_at = now() - interval '1 minute' where stay_id = pg_temp.stay(n);
$$;
create function pg_temp.age(n integer, p_age interval) returns void language sql as $$
  update public.paystack_attempt set created_at = now() - p_age,
         opened_at = case when opened_at is not null then now() - p_age end
   where reference like pg_temp.k('r' || n) || '-%';
$$;
create function pg_temp.pay_id(n integer) returns uuid language sql as $$
  select id from public.payment where reference = pg_temp.k('r' || n)
$$;
create function pg_temp.pay(n integer) returns text language sql as $$
  select state::text from public.payment where reference = pg_temp.k('r' || n)
$$;
create function pg_temp.try_row(p_attempt text) returns text language sql as $$
  select concat_ws(':', coalesce(outcome, '-'), coalesce(provider_status, '-'))
    from public.paystack_attempt where reference = p_attempt
$$;
create function pg_temp.audits(p_action text, p_target uuid) returns integer language sql as $$
  select count(*)::int from audit.audit_event where action = p_action and target_id = p_target
$$;
create function pg_temp.tries(n integer) returns integer language sql as $$
  select count(*)::int from public.paystack_attempt where payment_id = pg_temp.pay_id(n)
$$;
create function pg_temp.due(p_attempt text) returns boolean language sql as $$
  select exists (select 1 from public.rpc_payment_paystack_due('sk_live_ci_only_0123456789abcdef')
                  where attempt_reference = p_attempt)
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
  ('00000000-0000-0000-0000-000000000000', 'd2600000-0000-4000-8000-000000000001', 'authenticated',
   'authenticated', 'guest260a@example.test', '', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd2600000-0000-4000-8000-000000000002', 'authenticated',
   'authenticated', 'guest260b@example.test', '', now(), false, now(), now());
insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d2601000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 260]', '+254700026000',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d2602000-0000-4000-8000-00000000000a', 'd2601000-0000-4000-8000-00000000000a', 'block-260',
        '[Block 260]', 'apartment_block', 'Kilimani', (select id from public.city where slug = 'nairobi'),
        true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes, wifi_name)
values ('d2603000-0000-4000-8000-00000000000a', 'd2601000-0000-4000-8000-00000000000a',
        'd2602000-0000-4000-8000-00000000000a', 'A', 'A', '[Address]', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 3, 7000, 'Net260');

select pg_temp.hold(n) from generate_series(1, 15) n;
select pg_temp.hold(16, 'cancelled');

-- ════════════════════════════ 1. a card page that failed to open, then closed unfinished

set local role authenticated;
select pg_temp.guest();
select pg_temp.begin_pay(1);
select is(pg_temp.told(1), 'unpaid:-', 'A payment opened with nothing tried yet is unpaid, not pending.');
select pg_temp.try(1, 'card');
select pg_temp.opened(pg_temp.k('r1') || '-1', null, 'No card page was opened.');
select is(pg_temp.told(1), 'failed:-', 'A card page that never opened reads failed, not pending.');
select is(pg_temp.try(1, 'card') ->> 'attempt_reference', pg_temp.k('r1') || '-2',
  'After a failed try another one starts.');
select pg_temp.opened(pg_temp.k('r1') || '-2', 'https://checkout.paystack.com/ci-260a');
select is(pg_temp.told(1), 'pending:-', 'An open page nobody has asked about is pending, with nothing more said.');
select pg_temp.verified(pg_temp.k('r1') || '-2', 'abandoned');
select is(pg_temp.told(1), 'pending:not_completed',
  'Paystack calling the page abandoned while the hold lasts: still pending, and not completed.');
select is(
  (select concat_ws(':', x ->> 'payment_state', x ->> 'payment_status', x ->> 'last_try')
     from public.rpc_stay_checkout_status(pg_temp.stay(1)) x),
  'authorised:pending:not_completed', 'The website is told the same.');
reset role;
update public.paystack_attempt set opened_at = now() - interval '40 minutes'
 where reference = pg_temp.k('r1') || '-2';
set local role authenticated;
select pg_temp.guest();
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'channel', x ->> 'attempt_reference' = pg_temp.k('r1') || '-2',
                    x ->> 'authorization_url')
     from public.rpc_payment_paystack_attempt(pg_temp.k('r1'), 'card', null,
            'sk_live_ci_only_0123456789abcdef', true) x),
  'true:card:t:https://checkout.paystack.com/ci-260a',
  'Paying by card again hands back the same page, however long ago and whether or not the card is to be saved.');
select pg_temp.verified(pg_temp.k('r1') || '-2', 'failed');
select is(pg_temp.try_row(pg_temp.k('r1') || '-2'), '-:failed',
  'Called failed while the hold lasts, the try is left open.');
select is(pg_temp.told(1), 'pending:not_completed', 'Nothing is marked failed.');
select is(pg_temp.try(1, 'card') ->> 'attempt_reference', pg_temp.k('r1') || '-2',
  'And the same page is handed back.');
reset role;
select is(pg_temp.tries(1), 2, 'No third try was made.');
select public.cron_expire_stay_payments();
select is(pg_temp.pay(1), 'authorised', 'A payment is not closed while its hold lasts.');
set local role authenticated;
select pg_temp.guest();
select pg_temp.verified(pg_temp.k('r1') || '-2', 'abandoned');
reset role;
select pg_temp.end_hold(1);
select public.cron_expire_stay_payments();
select is(pg_temp.pay(1), 'authorised',
  'Nor on an answer given soon after the try began, with the page perhaps still in use.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(1), 'pending:-', 'Once the hold is over nothing is said about going back.');
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
select is(pg_temp.told(1), 'failed:-', 'The apps are told it failed, so they stop waiting.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.success(pg_temp.k('r1') || '-2', 2600001, 1400000, 1400000) ->> 'state', 'paid',
  'A success arriving after the closing is still recorded.');
reset role;
select is((select status::text || ':' || paid_kes from public.stay where id = pg_temp.stay(1)),
  'booked:14000', 'With the nights still free, the stay is booked.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(1), 'paid:-', 'And reads paid.');
select is(
  public.rpc_stay_payment_return(pg_temp.k('r1')),
  jsonb_build_object('stay_id', pg_temp.stay(1), 'property_slug', 'block-260'),
  'The guest coming back from Paystack is told which stay the reference pays.');
select pg_temp.as_user('d2600000-0000-4000-8000-000000000002');
select is(public.rpc_stay_payment_return(pg_temp.k('r1')), null, 'Nobody else is.');

-- ════════════════════════════ 2. paid after the nights had gone

select pg_temp.guest();
select pg_temp.prompt(2);
reset role;
update public.stay set hold_expires_at = now() - interval '1 minute' where id = pg_temp.stay(2);
select public.fn_stay_release_expired_holds();
insert into public.stay (id, host_id, unit_id, check_in, check_out, source, status)
select 'd2605000-0000-4000-8000-0000000000e2', host_id, unit_id, check_in, check_out, 'entered', 'booked'
  from public.stay where id = pg_temp.stay(2);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.success(pg_temp.k('r2') || '-1', 2600002, 1400000);
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
               where x ->> 'id' = pg_temp.stay(16)::text),
  'A hold that lapsed unpaid is still not listed.');

-- ════════════════════════════ 3. a phone prompt, and asking Paystack

select pg_temp.prompt(3);
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'channel', x ->> 'same_request', x ->> 'retry_after_seconds')
     from pg_temp.try(3, 'airtel', '+254712345678') x),
  'true:mpesa:false:180', 'While a prompt waits, asking for Airtel Money hands it back.');
reset role;
update public.paystack_attempt set opened_at = now() - interval '2 minutes'
 where reference = pg_temp.k('r3') || '-1';
set local role authenticated;
select pg_temp.guest();
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'channel', x ->> 'same_request', x ->> 'retry_after_seconds')
     from pg_temp.try(3, 'mpesa', '+254722000000') x),
  'true:mpesa:false:60', 'So does another number, for the whole three minutes.');
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'same_request')
     from pg_temp.try(3, 'mpesa', '+254712345678') x),
  'true:true', 'The same number is told it is the same request.');
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'channel') from pg_temp.try(3, 'card') x),
  'false:card', 'Card is not held back.');
select pg_temp.opened(pg_temp.k('r3') || '-2', null, 'No card page was opened.');
select is(
  public.rpc_stay_payment_check_claim(pg_temp.stay(3)),
  jsonb_build_array(jsonb_build_object('attempt_reference', pg_temp.k('r3') || '-1', 'is_test', false)),
  'A try sent ten seconds ago or more is due a question.');
select is(public.rpc_stay_payment_check_claim(pg_temp.stay(3)), '[]'::jsonb,
  'Asked just now, it is not handed out again.');
select pg_temp.as_user('d2600000-0000-4000-8000-000000000002');
select throws_ok(
  format($$select public.rpc_stay_payment_check_claim(%L)$$, pg_temp.stay(3)),
  '42501', 'That stay is not yours.', 'Nobody else can ask about it.');
select pg_temp.guest();
select pg_temp.verified(pg_temp.k('r3') || '-1', 'failed');
select is(pg_temp.told(3), 'failed:-', 'Paystack saying the prompt failed reads failed at once.');
select is(
  (select concat_ws(':', x ->> 'reused', x ->> 'attempt_reference' = pg_temp.k('r3') || '-3')
     from pg_temp.try(3, 'mpesa', '+254712345678') x),
  'false:t', 'And a new prompt may go.');

-- ════════════════════════════ 4. a webhook that cannot say, then the verify answer

select pg_temp.card_page(4);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.success(pg_temp.k('r4') || '-1', 2600004, 1450000),
  '{"ok": false, "reason": "awaiting_verify"}'::jsonb,
  'More than asked, with nothing saying what was asked: not decided on the webhook.');
reset role;
select is((select count(*)::int from public.payment_event where dedupe_key = 'paystack:2600004'), 0,
  'Nothing is recorded under the transaction.');
select is(pg_temp.pay(4) || ':' || pg_temp.try_row(pg_temp.k('r4') || '-1'), 'authorised:-:awaiting_verify',
  'The payment stands, and the try waits for Paystack.');
select ok(pg_temp.due(pg_temp.k('r4') || '-1'), 'The sweep asks about it at once.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(4), 'pending:-', 'The guest reads pending, and is not told to go back to the page.');
select throws_ok(
  $$select pg_temp.try(4, 'card')$$,
  '22023', 'We have received your payment and are confirming it. Do not pay again.',
  'No other try starts.');
reset role;
select pg_temp.end_hold(4);
select public.cron_expire_stay_payments();
select is(pg_temp.pay(4), 'authorised', 'It is never closed while it waits.');
set local role authenticated;
select pg_temp.guest();
select is(
  public.rpc_stay_payment_check_claim(pg_temp.stay(4)) #>> '{0,attempt_reference}',
  pg_temp.k('r4') || '-1', 'A status read asks about it straight away.');
select is(pg_temp.verified(pg_temp.k('r4') || '-1', 'success', 1450000, 1400000, 2600004) ->> 'state',
  'paid', 'Paystack''s verify answer, carrying what was asked, pays it.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.success(pg_temp.k('r4') || '-1', 2600004, 1450000) ->> 'duplicate', 'true',
  'The webhook again changes nothing.');
reset role;
select is(
  (select concat_ws(':', s.status::text, s.paid_kes, p.amount_cents)
     from public.stay s join public.payment p on p.reference = s.payment_reference
    where s.id = pg_temp.stay(4)),
  'booked:14000:1400000', 'Booked for the price, not the amount with fees.');
select is(
  (select count(*) || ':' || min(after ->> 'charged_cents') from audit.audit_event
    where action = 'payment.paystack_over_paid' and target_id = pg_temp.pay_id(4)),
  '1:1450000', 'And the extra is raised once.');

-- ════════════════════════════ 5. other mismatches are as before

set local role authenticated;
select pg_temp.guest();
select pg_temp.card_page(5);
select pg_temp.card_page(6);
select pg_temp.card_page(7);
select pg_temp.card_page(15);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.success(pg_temp.k('r5') || '-1', 2600005, 1450000);
select is(pg_temp.verified(pg_temp.k('r5') || '-1', 'success', 1450000, null, 2600005) ->> 'reason',
  'amount_mismatch', 'A verify answer that does not say what was asked either: refused, as before.');
select is(pg_temp.success(pg_temp.k('r6') || '-1', 2600006, 1450000, 1400000) ->> 'state', 'paid',
  'A webhook that does say pays at once.');
select is(pg_temp.success(pg_temp.k('r7') || '-1', 2600007, 1000000, 1400000) ->> 'reason',
  'amount_mismatch', 'Less than asked is refused, as before.');
select is(pg_temp.success(pg_temp.k('r15') || '-1', 2600015, 1500000, 1500000) ->> 'reason',
  'amount_mismatch', 'So is more, asked for as something else.');
reset role;
select is(pg_temp.pay(5) || ':' || pg_temp.pay(7) || ':' || pg_temp.pay(15), 'failed:failed:failed',
  'Each of those payments is failed, as before.');

-- ════════════════════════════ 6. how the others end

-- 8: Paystack never answers.
set local role authenticated;
select pg_temp.guest();
select pg_temp.prompt(8);
reset role;
select pg_temp.end_hold(8);
select public.cron_expire_stay_payments();
select is(pg_temp.pay(8), 'authorised', 'With no answer it waits.');
select pg_temp.age(8, interval '121 minutes');
select public.cron_expire_stay_payments();
select is(
  pg_temp.pay(8) || ':' || pg_temp.audits('payment.stay_unconfirmed', pg_temp.pay_id(8)),
  'abandoned:1', 'Not past two hours: closed, and raised for a person.');
select ok(pg_temp.due(pg_temp.k('r8') || '-1'), 'The sweep still asks about a closed stay payment.');
update public.paystack_attempt set checked_at = now() - interval '10 minutes'
 where reference = pg_temp.k('r8') || '-1';
select ok(not pg_temp.due(pg_temp.k('r8') || '-1'), 'Though only every half hour.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(8), 'pending:-', 'With no answer, nothing says the money did not arrive.');
select is(
  (select concat_ws(':', x ->> 'payment_state', x ->> 'payment_status')
     from public.rpc_stay_checkout_status(pg_temp.stay(8)) x),
  'abandoned:pending', 'Nor does the website.');
select is(
  public.rpc_stay_payment_check_claim(pg_temp.stay(8)) #>> '{0,attempt_reference}',
  pg_temp.k('r8') || '-1', 'The status read still asks about it.');
select pg_temp.verified(pg_temp.k('r8') || '-1', 'abandoned');
select is(pg_temp.told(8), 'failed:-', 'Once Paystack answers, it reads failed.');

-- 9: a prompt Paystack calls abandoned after its three minutes.
select pg_temp.prompt(9);
reset role;
select pg_temp.age(9, interval '6 minutes');
set local role authenticated;
select pg_temp.guest();
select pg_temp.verified(pg_temp.k('r9') || '-1', 'abandoned');
select is(pg_temp.told(9), 'pending:-', 'While the hold lasts it stays pending.');
reset role;
select pg_temp.end_hold(9);
select public.cron_expire_stay_payments();
select is(
  pg_temp.pay(9) || ':' || pg_temp.audits('payment.stay_expired', pg_temp.pay_id(9)),
  'abandoned:1', 'After the hold, an answer five minutes after it began closes it.');

-- 10: Paystack called it successful, but it could not be applied.
set local role authenticated;
select pg_temp.guest();
select pg_temp.card_page(10);
select pg_temp.verified(pg_temp.k('r10') || '-1', 'success', 1400000, null, 2600010, 'USD');
reset role;
select pg_temp.end_hold(10);
select public.cron_expire_stay_payments();
select is(
  pg_temp.pay(10) || ':' || pg_temp.audits('payment.stay_unconfirmed', pg_temp.pay_id(10)),
  'authorised:0', 'It is not closed.');
select pg_temp.age(10, interval '121 minutes');
select public.cron_expire_stay_payments();
select public.cron_expire_stay_payments();
select is(
  pg_temp.pay(10) || ':' || pg_temp.audits('payment.stay_unconfirmed', pg_temp.pay_id(10)),
  'authorised:1', 'After two hours it is raised, once, and left open.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(10), 'pending:-', 'And reads pending.');

-- 11: nothing was ever tried. 12: a card try never recorded.
select pg_temp.begin_pay(11);
select pg_temp.begin_pay(12);
select pg_temp.try(12, 'card');
reset role;
select pg_temp.age(12, interval '2 minutes');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(12), 'unpaid:-', 'A card try that never got a page is not pending.');
reset role;
select pg_temp.end_hold(11);
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(11), 'failed:-', 'Out of time with nothing tried reads failed.');
reset role;
select public.cron_expire_stay_payments();
select is(pg_temp.pay(11), 'abandoned', 'And is closed.');

-- 14: stuck from before this change: asked, but the answer was not kept.
set local role authenticated;
select pg_temp.guest();
select pg_temp.card_page(14);
reset role;
select pg_temp.age(14, interval '30 minutes');
update public.paystack_attempt set checked_at = now() - interval '2 minutes'
 where reference = pg_temp.k('r14') || '-1';
select pg_temp.end_hold(14);
select public.cron_expire_stay_payments();
select is(pg_temp.pay(14), 'authorised', 'It is not closed without a kept answer.');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.verified(pg_temp.k('r14') || '-1', 'abandoned');
reset role;
select public.cron_expire_stay_payments();
select is(pg_temp.pay(14), 'abandoned', 'The next answer closes it.');
set local role authenticated;
select pg_temp.guest();
select is(pg_temp.told(14), 'failed:-', 'And the guest stops waiting.');

-- ════════════════════════════ 7. a paid stay takes no other payment

reset role;
insert into public.payment (reference, intent, stay_id, city_id, amount_cents, currency, created_by,
                            created_via, state, provider_ref, paid_at)
values ('NXP-260-PAID', 'stay', pg_temp.stay(13), (select id from public.city where slug = 'nairobi'),
        1400000, 'KES', 'd2600000-0000-4000-8000-000000000001', 'guest_checkout', 'paid', 'TEST-260', now());
set local role authenticated;
select pg_temp.guest();
select throws_ok(
  format($$select public.rpc_payment_begin_stay(%L)$$, pg_temp.stay(13)),
  '22023', 'This stay has already been paid for. Do not pay again.',
  'A held stay with a paid payment opens no other.');

-- ════════════════════════════ 8. an order pays as before

reset role;
insert into public.guest (id, phone, name, user_id)
values ('d2607000-0000-4000-8000-000000000001', '+254700026001', '[Guest 260]',
        'd2600000-0000-4000-8000-000000000002');
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select 'd2607000-0000-4000-8000-000000000011', 'PS260-ORDER', 'd2607000-0000-4000-8000-000000000001',
       m.id, b.id, m.city_id, 'web', '[Fixture address]', 'confirmed', 'mpesa_stk', 'pending',
       150000, 0, 0, 150000, 'KES'
  from public.merchant m
  join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
 where m.city_id is not null
 order by m.id limit 1;
set local role authenticated;
select pg_temp.as_user('d2600000-0000-4000-8000-000000000002');
insert into t select 'order', public.rpc_payment_begin_order('d2607000-0000-4000-8000-000000000011') ->> 'reference';
select public.rpc_payment_paystack_attempt(pg_temp.k('order'), 'card', null, 'sk_live_ci_only_0123456789abcdef');
select pg_temp.opened(pg_temp.k('order') || '-1', 'https://checkout.paystack.com/ci-260o');
reset role;
update public.paystack_attempt set opened_at = now() - interval '31 minutes'
 where reference = pg_temp.k('order') || '-1';
set local role authenticated;
select pg_temp.as_user('d2600000-0000-4000-8000-000000000002');
select is(
  public.rpc_payment_paystack_attempt(pg_temp.k('order'), 'card', null,
    'sk_live_ci_only_0123456789abcdef') ->> 'reused',
  'false', 'An order''s card page older than half an hour is not handed back.');
select public.rpc_payment_paystack_attempt(pg_temp.k('order'), 'mpesa', '+254712345678',
  'sk_live_ci_only_0123456789abcdef');
select pg_temp.opened(pg_temp.k('order') || '-3');
reset role;
update public.paystack_attempt set opened_at = now() - interval '2 minutes'
 where reference = pg_temp.k('order') || '-3';
set local role authenticated;
select pg_temp.as_user('d2600000-0000-4000-8000-000000000002');
select is(
  public.rpc_payment_paystack_attempt(pg_temp.k('order'), 'mpesa', '+254722000000',
    'sk_live_ci_only_0123456789abcdef') ->> 'reused',
  'false', 'An order''s prompt may still go to another number after a minute.');
select pg_temp.verified(pg_temp.k('order') || '-1', 'failed');
reset role;
select is(pg_temp.try_row(pg_temp.k('order') || '-1'), 'failed:failed',
  'An order''s card page called failed is ended, as before.');

-- ════════════════════════════ 9. grants and the register

select ok(
  not has_function_privilege('anon', 'public.rpc_stay_payment_check_claim(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rpc_stay_payment_return(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cron_expire_stay_payments()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.rpc_stay_checkout_status(uuid)', 'EXECUTE'),
  'The public key reaches none of it.');
select ok(
  not has_function_privilege('authenticated', 'public.cron_expire_stay_payments()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_paystack_apply(text, text, jsonb, jsonb)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_native_stay_checkout_view(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_stay_payment_status(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_stay_last_try(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated',
        'public.fn_paystack_try_unpaid(public.paystack_attempt)', 'EXECUTE'),
  'No account closes or applies a payment, or reads another''s stay through a helper.');
select ok(
  has_function_privilege('authenticated', 'public.rpc_stay_payment_check_claim(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.rpc_stay_payment_return(text)', 'EXECUTE'),
  'A guest''s session may ask about its own.');
select is(
  (select count(*)::int from audit.action_registry
    where action in ('payment.paystack_over_paid', 'payment.stay_expired', 'payment.stay_unconfirmed')
      and money),
  3, 'The new actions are registered.');
select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
