-- Riders' payout modes: nothing changes until Finance switches a city; test
-- keys only "pay" test riders and post nothing; real money only once Finance
-- switches it on; each payout claims what it pays, so nothing is paid twice
-- (by a second sweep, by the payout run, or by an early cash-out); the fee,
-- the cap and Paystack's word decide the rest.

begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create function pg_temp.ps_sign(p_body text, p_key text default 'sk_test_ci_only_0123456789abcdef') returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_key, 'UTF8'), 'sha512'), 'hex')
$$;
create function pg_temp.transfer_event(p_event text, p_reference text, p_amount bigint) returns text
language sql as $$
  select jsonb_build_object('event', p_event,
    'data', jsonb_build_object('reference', p_reference, 'amount', p_amount, 'currency', 'KES',
      'transfer_code', 'TRF_ci127', 'status', split_part(p_event, '.', 2)))::text
$$;
create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
create function pg_temp.hint_of(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin
  execute p_sql;
  return 'done';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return coalesce(nullif(v_hint, ''), sqlerrm);
end
$$;
/* A rule made live, for Nairobi or for every city, as an approved change would be. */
create function pg_temp.rule(p_key text, p_value jsonb) returns void language plpgsql as $$
declare v_city uuid := (select id from public.city where slug = 'nairobi');
        v_scope text := (select scope_kind::text from settings.definition where key = p_key);
begin
  update settings.version set status = 'superseded', superseded_at = now()
   where key = p_key and status = 'active'
     and (v_scope = 'global' or scope_city_id = v_city);
  insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, activated_at, reason)
  values (p_key, v_scope::settings.scope_kind, case when v_scope = 'city' then v_city end, p_value, 'active',
          now() - interval '1 minute', now() - interval '1 minute', '[payout modes test]');
end
$$;
/* 900 owed to a rider in the ledger. */
create function pg_temp.owe(p_rider uuid, p_key text) returns void language sql as $$
  select ledger.post(
    p_kind => 'rider_pay_recognised',
    p_idempotency_key => 'rider_pay:' || p_key,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'expense.rider_pay', 'debit', 90000),
      jsonb_build_object('account', 'payable.rider', 'party_type', 'rider',
        'party_id', p_rider, 'credit', 90000, 'memo', p_key)),
    p_effective_at => now() - interval '3 days',
    p_city_id => (select id from public.city where slug = 'nairobi'),
    p_actor_label => '[Test]');
$$;
create function pg_temp.due(p_key text) returns jsonb language sql as $$
  select public.rpc_rider_payouts_due(p_key, 8)
$$;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1270000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'testrider127a@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1270000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'rider127b@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1270000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider127c@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1270000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'testrider127d@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1270000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'finance127@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1270000-0000-4000-8000-000000000007',
   'authenticated', 'authenticated', 'approver127@test.local', now(), false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c1270000-0000-4000-8000-0000000000b1', 'c1270000-0000-4000-8000-000000000006', 'finance127@test.local', 'Finance 127'),
  ('c1270000-0000-4000-8000-0000000000b2', 'c1270000-0000-4000-8000-000000000007', 'approver127@test.local', 'Approver 127');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c1270000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c1270000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'finance';

/* A: a test rider. B, C: real riders. D: a test rider who pays the fee. */
insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at, payout_msisdn, accepts_test_payouts)
values
  ('c1270000-0000-4000-8000-0000000000a1', 'c1270000-0000-4000-8000-000000000001', '[Test]', '[Rider A]',
   '+254700012701', (select id from public.city where slug = 'nairobi'), 'motorbike', '[PLATE127A]',
   'active', 'offline', now(), '+254700012701', true),
  ('c1270000-0000-4000-8000-0000000000a2', 'c1270000-0000-4000-8000-000000000002', '[Real]', '[Rider B]',
   '+254700012702', (select id from public.city where slug = 'nairobi'), 'motorbike', '[PLATE127B]',
   'active', 'offline', now(), '+254700012702', false),
  ('c1270000-0000-4000-8000-0000000000a3', 'c1270000-0000-4000-8000-000000000003', '[Real]', '[Rider C]',
   '+254700012703', (select id from public.city where slug = 'nairobi'), 'motorbike', '[PLATE127C]',
   'active', 'offline', now(), '+254700012703', false),
  ('c1270000-0000-4000-8000-0000000000a4', 'c1270000-0000-4000-8000-000000000004', '[Test]', '[Rider D]',
   '+254700012704', (select id from public.city where slug = 'nairobi'), 'motorbike', '[PLATE127D]',
   'active', 'offline', now(), '+254700012704', true);

select pg_temp.owe('c1270000-0000-4000-8000-0000000000a1', '[MODES-127-A]');
select pg_temp.owe('c1270000-0000-4000-8000-0000000000a2', '[MODES-127-B]');
select pg_temp.owe('c1270000-0000-4000-8000-0000000000a3', '[MODES-127-C]');

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to authenticated, anon;

-- ── 1. nothing changes until Finance switches a city

select is(public.fn_rider_payout_mode('c1270000-0000-4000-8000-0000000000a1'), 'run',
  'By default every rider is on the payout run.');
select is((select array_agg(key order by sort) from (select distinct key, sort from public.payout_rules_v
            where party = 'rider' and key like 'payouts.rider.%' and sort < 20) x),
  array['payouts.rider.mode', 'payouts.rider.automatic_from', 'payouts.rider.weekday',
        'payouts.rider.monthly_day', 'payouts.rider.pay_hour', 'payouts.rider.hold_hours',
        'payouts.rider.immediate_gap_hours'],
  'The Payout rules screen lists how and when riders are paid.');

select pg_temp.rule('payouts.rider.mode', '"immediate"'::jsonb);
select is(public.fn_rider_payout_mode('c1270000-0000-4000-8000-0000000000a1'), 'run',
  'A mode without a start day pays nobody automatically.');
select pg_temp.rule('payouts.rider.automatic_from', '"2020-01-01"'::jsonb);
select pg_temp.rule('payouts.rider.hold_hours', '0'::jsonb);
select pg_temp.rule('payouts.rider.minimum_kes', '100'::jsonb);

select is(public.fn_rider_payout_mode('c1270000-0000-4000-8000-0000000000a1'), 'immediate',
  'With a start day, a test rider is paid automatically (test money only).');
select is(public.fn_rider_payout_mode('c1270000-0000-4000-8000-0000000000a2'), 'run',
  'A real rider stays on the run until Finance switches real money on.');

-- ── 2. test keys: a test rider, once, nothing in the ledger

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.rpc_rider_payouts_due('not-a-key', 8)$$, '42501', null,
  'The worker''s call needs a Paystack key.');
insert into t select 'due1', pg_temp.due('sk_test_ci_only_0123456789abcdef')::text;
select is(jsonb_array_length((select v::jsonb from t where k = 'due1') -> 'items'), 1,
  'Test keys open one payout: the test rider''s, not the real riders''.');
select is(((select v::jsonb from t where k = 'due1') -> 'items' -> 0 ->> 'amount_cents')::bigint, 90000::bigint,
  'It sends what the rider is owed.');
insert into t select 'ref_a', (select v::jsonb from t where k = 'due1') -> 'items' -> 0 ->> 'reference';
select is(jsonb_array_length(pg_temp.due('sk_test_ci_only_0123456789abcdef') -> 'items'), 0,
  'A second sweep opens nothing more: one payout at a time.');

select is(public.rpc_paystack_transfer_answered_worker((select v from t where k = 'ref_a'), 'recipient',
            '{"status": true, "data": {"recipient_code": "RCP_ci127a"}}', false,
            'sk_test_ci_only_0123456789abcdef') ->> 'recipient_code',
  'RCP_ci127a', 'The worker records the M-Pesa recipient.');
select is(public.rpc_paystack_transfer_answered_worker((select v from t where k = 'ref_a'), 'transfer',
            '{"status": false, "message": "Internal error"}', false,
            'sk_test_ci_only_0123456789abcdef') ->> 'state',
  'pending', 'An error from Paystack is not a failure: the money may have gone, so it waits for Paystack''s word.');
insert into t select 'ok_a', pg_temp.transfer_event('transfer.success', (select v from t where k = 'ref_a'), 90000);
select is(public.rpc_payment_paystack_webhook((select v from t where k = 'ok_a'),
            pg_temp.ps_sign((select v from t where k = 'ok_a'))) ->> 'state',
  'success', 'Paystack''s signed transfer.success pays it.');
reset role;

select is((select state from public.rider_payout where rider_id = 'c1270000-0000-4000-8000-0000000000a1'),
  'paid', 'The payout is paid.');
select is((select count(*)::int from ledger.transaction where idempotency_key like 'payout_%'),
  0, 'Test money posts nothing to the ledger.');
select is((select count(*)::int from public.rider_adjustment
            where rider_id = 'c1270000-0000-4000-8000-0000000000a1' and kind = 'scheduled_payout'),
  0, 'Test money is not real pay: the rider''s real figures are untouched.');

-- ── 3. real money, once Finance switches it on

select pg_temp.rule('payouts.rider.automatic_live', 'true'::jsonb);
select is(public.fn_rider_payout_mode('c1270000-0000-4000-8000-0000000000a2'), 'run',
  'Real money switched on, but no worker on live keys yet: real riders stay on the payout run.');
select pg_temp.rule('payouts.rider.auto_max_kes', '500'::jsonb);

/* The ledger's checks have not run here, so money may not leave yet. */
delete from public.fin_invariant_check;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.due('sk_live_ci_only_0123456789abcdef') ->> 'paused', 'outbound_blocked',
  'Real money does not leave while the ledger''s checks stop outbound payments.');
reset role;
select is(public.fn_rider_payout_mode('c1270000-0000-4000-8000-0000000000a2'), 'immediate',
  'Once the worker runs on live keys, real riders are paid automatically.');
update public.fin_invariant set enabled = false;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
insert into t select 'due2', pg_temp.due('sk_live_ci_only_0123456789abcdef')::text;
reset role;
select is(((select v::jsonb from t where k = 'due2') ->> 'held')::int, 2,
  'Above the largest automatic payout, both real riders wait for Finance.');

select pg_temp.rule('payouts.rider.auto_max_kes', '50000'::jsonb);
set local role authenticated;
select pg_temp.as_user('c1270000-0000-4000-8000-000000000006');
insert into t select 'ref_b', public.rpc_paystack_transfer_open('rider_payout',
  (select id from public.rider_payout where rider_id = 'c1270000-0000-4000-8000-0000000000a2'),
  'sk_live_ci_only_0123456789abcdef') ->> 'reference';
select ok((select v from t where k = 'ref_b') like 'NXT-%', 'Finance releases a held payout.');
select is(public.rpc_finance_rider_payout_cancel(
            (select id from public.rider_payout where rider_id = 'c1270000-0000-4000-8000-0000000000a3'),
            'Pay with the run') ->> 'state',
  'cancelled', 'or cancels one.');
reset role;

select is(public.fn_rider_payout_owed('c1270000-0000-4000-8000-0000000000a2'), 0::bigint,
  'Once sent, nothing is left for another payout to pay.');
select is(public.fn_rider_payout_owed('c1270000-0000-4000-8000-0000000000a3'), 90000::bigint,
  'A cancelled payout gives back what it claimed.');
select is((select count(*)::int from public.fn_settlement_owed(now() - interval '30 days', now() + interval '1 day')
            where party_id = 'c1270000-0000-4000-8000-0000000000a2'),
  0, 'The payout run does not see what an automatic payout paid.');

set local role authenticated;
select pg_temp.as_user('c1270000-0000-4000-8000-000000000002');
select is(pg_temp.hint_of($$select public.rpc_rider_payout_request(200)$$), 'payout_open',
  'No early cash-out while a payout is on its way.');
reset role;

-- A failure gives the money back; a late success takes it again.
insert into t select 'fail_b', pg_temp.transfer_event('transfer.failed', (select v from t where k = 'ref_b'), 90000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'fail_b'),
  pg_temp.ps_sign((select v from t where k = 'fail_b'), 'sk_live_ci_only_0123456789abcdef'));
reset role;
select is(public.fn_rider_payout_owed('c1270000-0000-4000-8000-0000000000a2'), 90000::bigint,
  'A failed payout is the rider''s again, for the next payout.');
insert into t select 'late_b', pg_temp.transfer_event('transfer.success', (select v from t where k = 'ref_b'), 90000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'late_b'),
  pg_temp.ps_sign((select v from t where k = 'late_b'), 'sk_live_ci_only_0123456789abcdef'));
reset role;
select is(public.fn_rider_payout_owed('c1270000-0000-4000-8000-0000000000a2'), 0::bigint,
  'Paid after all: the money leaves the rider''s balance again, so it is not paid twice.');
select is((select state from public.rider_payout where rider_id = 'c1270000-0000-4000-8000-0000000000a2'),
  'paid', 'and the payout is paid.');

-- ── 4. the rider pays the fee

select pg_temp.rule('payouts.rider.fee_paid_by', '"rider"'::jsonb);
select pg_temp.owe('c1270000-0000-4000-8000-0000000000a4', '[MODES-127-D]');
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.due('sk_test_ci_only_0123456789abcdef');
reset role;
select is((select hold_reason from public.rider_payout where rider_id = 'c1270000-0000-4000-8000-0000000000a4'),
  'the riders'' transfer fee is not set · Finance releases it',
  'Riders pay the fee but no fee is set: it waits for Finance rather than guessing.');
select pg_temp.rule('payouts.rider.transfer_fee_kes', '30'::jsonb);
set local role authenticated;
select pg_temp.as_user('c1270000-0000-4000-8000-000000000006');
select public.rpc_paystack_transfer_open('rider_payout',
  (select id from public.rider_payout where rider_id = 'c1270000-0000-4000-8000-0000000000a4'),
  'sk_test_ci_only_0123456789abcdef');
reset role;
select is((select amount_cents || ' · ' || ledger_cents from public.paystack_transfer
            where kind = 'rider_payout' and party_id = 'c1270000-0000-4000-8000-0000000000a4'),
  '87000 · 90000', 'The fee comes off what is sent; the whole amount leaves the rider''s balance.');

-- ── 5. the schedule

select is(public.fn_rider_payout_slot(
            '{"mode": "weekly", "weekday": "friday", "payHour": 9, "monthlyDay": 1}'::jsonb,
            '2026-11-25 12:00:00+03'::timestamptz),
  '2026-11-20 09:00:00+03'::timestamptz, 'Weekly on Friday at 09:00: on a Wednesday, the last payout was Friday.');
select is(public.fn_rider_payout_next(
            '{"mode": "monthly", "weekday": "friday", "payHour": 9, "monthlyDay": 28}'::jsonb,
            '2026-11-25 12:00:00+03'::timestamptz),
  '2026-11-28 09:00:00+03'::timestamptz, 'Monthly on the 28th: the next one is this month''s.');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical' and finding ~ '(rider_payout|paystack_transfer|tg_rider_payout)'),
  0, 'The wiring check finds nothing wrong with rider payouts.');

select * from finish();
rollback;
