-- The ledger, tested against the ways money goes missing.
--
-- Not "can I post a transaction" — that is the easy half. These
-- are the failures that would not announce themselves:
--
--   * a transaction that does not balance, committing anyway
--   * a retry that pays twice
--   * an entry edited after a statement quoted it
--   * a reversal that does not actually reverse
--   * shillings added to cents
--   * an order that took money and left no trace

begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

create temp table t (k text primary key, v text);
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t to authenticated;

insert into t (k, v) values
  ('merchant', (select id::text from public.merchant limit 1)),
  ('rider', (select id::text from public.rider where status = 'active' limit 1));

-- ══════════════════════════ 1. a transaction balances or it does not exist

select lives_ok(
  $$select ledger.post('payment_captured', 'tap:balanced',
      jsonb_build_array(
        jsonb_build_object('account','cash.mpesa_paybill','debit',100000),
        jsonb_build_object('account','revenue.commission','credit',100000)))$$,
  'A balanced transaction posts.');

select throws_matching(
  $$select ledger.post('payment_captured', 'tap:unbalanced',
      jsonb_build_array(
        jsonb_build_object('account','cash.mpesa_paybill','debit',100000),
        jsonb_build_object('account','revenue.commission','credit',99999)))$$,
  'does not balance',
  'One out of a thousand shillings is refused.');

select throws_matching(
  $$select ledger.post('write_off', 'tap:one_leg',
      jsonb_build_array(jsonb_build_object('account','expense.write_off','debit',100)))$$,
  'at least two entries',
  'A one-legged transaction is refused.');

select is(
  (select count(*)::int from ledger.transaction where idempotency_key = 'tap:unbalanced'),
  0,
  'And the refused one left nothing behind.');

-- ════════════════════════════════ 2. a retry is not a second payment

select is(
  (select ledger.post('payment_captured', 'tap:balanced',
     jsonb_build_array(
       jsonb_build_object('account','cash.mpesa_paybill','debit',100000),
       jsonb_build_object('account','revenue.commission','credit',100000)))),
  (select id from ledger.transaction where idempotency_key = 'tap:balanced'),
  'Posting the same key again returns the same transaction.');

select is(
  (select count(*)::int from ledger.transaction where idempotency_key = 'tap:balanced'),
  1,
  'There is still one of it.');

select is(
  (select count(*)::int from ledger.entry e
     join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key = 'tap:balanced'),
  2,
  'And two entries, not four — which is what a double payment would look like.');

-- ═══════════════════════════════════════ 3. nothing is edited

select throws_matching(
  $$update ledger.entry set debit = 1
     where transaction_id = (select id from ledger.transaction where idempotency_key='tap:balanced')$$,
  'append-only',
  'An entry cannot be edited.');

select throws_matching(
  $$delete from ledger.transaction where idempotency_key = 'tap:balanced'$$,
  'append-only',
  'Nor deleted — a statement that quoted it has to stay true.');

-- ═══════════════════════════════════ 4. a reversal actually reverses

select lives_ok(
  $$select ledger.reverse(
      (select id from ledger.transaction where idempotency_key='tap:balanced'),
      'correction', 'posted to the wrong account')$$,
  'A transaction can be reversed.');

select is(
  (select coalesce(sum(debit) - sum(credit), 0) from ledger.entry e
     join ledger.transaction tx on tx.id = e.transaction_id
    where tx.idempotency_key in ('tap:balanced', 'reversal:' ||
      (select id::text from ledger.transaction where idempotency_key='tap:balanced'))
      and e.account_code = 'cash.mpesa_paybill')::bigint,
  0::bigint,
  'And nets the account back to nothing.');

select throws_matching(
  $$select ledger.reverse(
      (select id from ledger.transaction where idempotency_key='tap:balanced'),
      'correction', 'again')$$,
  'already been reversed',
  'A reversal happens once.');

select throws_matching(
  $$select ledger.reverse(
      (select id from ledger.transaction where idempotency_key='tap:balanced'), 'correction', '')$$,
  'Say why',
  'And never without a reason — that is the first thing an auditor asks about.');

-- ═════════════════════════════════════════ 5. units

select is(ledger.from_kes(1400), 140000::bigint,
  'A thousand four hundred shillings is a hundred and forty thousand cents.');
select is(ledger.from_kes(0.5), 50::bigint, 'Halves survive.');
select is(ledger.from_kes(null), 0::bigint, 'And nothing is nothing, not null.');

-- ════════════════════════════ 6. an order posts, and it balances

insert into public.guest (id, phone, name)
values ('ba000000-0000-4000-8000-000000000001','+254700000931','[Guest]')
on conflict (id) do nothing;

/*
 * Dated into a week of its own. The ledger stamps an entry with
 * when the order happened, and a run is built over a window — so
 * a test that used this week would collide with whatever run
 * this database already has for it.
 */
insert into public.order
  (id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label,
   stage, payment_method, payment_status, subtotal_cents, delivery_fee_cents,
   service_fee_cents, total_cents, commission_cents, currency, placed_at, delivered_at)
select 'bb000000-0000-4000-8000-000000000001', 'LEDGER-TEST-1',
  'ba000000-0000-4000-8000-000000000001', m.id, b.id, m.city_id, 'web', '[Somewhere]',
  'confirmed', 'card', 'pending', 100000, 25000, 5000, 130000, 18000, 'KES',
  timestamptz '2026-02-03 12:00+03', timestamptz '2026-02-03 13:00+03'
from public.merchant m
join public.merchant_branch b on b.merchant_id = m.id
where m.id = (select v::uuid from t where k='merchant') limit 1
on conflict (id) do nothing;

select is(
  (select count(*)::int from ledger.transaction
    where order_id = 'bb000000-0000-4000-8000-000000000001'),
  0,
  'An unpaid order has no ledger entries — nothing has moved.');

update public.order set payment_status = 'paid'
 where id = 'bb000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from ledger.transaction
    where order_id = 'bb000000-0000-4000-8000-000000000001' and kind = 'order_sale_recognised'),
  1,
  'Paying it posts the sale, with nobody having to remember to.');

select is(
  (select sum(debit) - sum(credit) from ledger.entry e
     join ledger.transaction tx on tx.id = e.transaction_id
    where tx.order_id = 'bb000000-0000-4000-8000-000000000001')::bigint,
  0::bigint,
  'And it balances.');

select is(
  (select sum(credit) from ledger.entry e
     join ledger.transaction tx on tx.id = e.transaction_id
    where tx.order_id = 'bb000000-0000-4000-8000-000000000001'
      and e.account_code like 'payable.merchant:%')::bigint,
  82000::bigint,
  'The merchant is owed the items less commission: 1,000 − 180 = 820.');

select is(
  (select sum(credit) from ledger.entry e
     join ledger.transaction tx on tx.id = e.transaction_id
    where tx.order_id = 'bb000000-0000-4000-8000-000000000001'
      and e.account_code like 'revenue.%')::bigint,
  48000::bigint,
  'And ours is 180 commission + 250 delivery + 50 service = 480.');

select is(
  (select merchant_net_cents from public.order_money_v
    where order_id = 'bb000000-0000-4000-8000-000000000001'),
  82000::bigint,
  'Which is what the order money view says too, because it reads the same entries.');

select is(
  (select money_state from public.order_money_v
    where order_id = 'bb000000-0000-4000-8000-000000000001'),
  'paid',
  'And one money story, derived rather than stored.');

-- ════════════════════════ 7. settling it, and not settling it twice

/*
 * The invariants run first, as the cron does every five
 * minutes. On a database where they have never run,
 * `fn_outbound_blocked` reports every question as unanswered and
 * the run cannot be checked — which is the intended behaviour: a
 * check that has not run is not a check that passed.
 */
select ok((public.fn_run_invariants() ->> 'ok')::boolean,
  'All nine invariants answer zero before anything is settled.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into t (k, v) select 'run',
  (public.rpc_settlement_build(
     timestamptz '2026-02-02 00:00+03', timestamptz '2026-02-09 00:00+03') ->> 'run_id');

select isnt((select v from t where k = 'run'), null, 'A run builds.');

select ok(
  (select count(*) from public.fin_settlement_line
    where run_id = (select v::uuid from t where k='run')) > 0,
  'With lines on it.');

select is(
  (select count(*)::int from public.fin_run_line_v
    where run_id = (select v::uuid from t where k='run') and not verifies),
  0,
  'Every line re-sums to exactly the entries it claims.');

/*
 * The one that matters most. A second run over the same period
 * must find nothing left to pay, because the first claimed it.
 */
select is(
  (select count(*)::int from public.fin_settled_entry s1
    where exists (select 1 from public.fin_settled_entry s2
                   where s2.entry_id = s1.entry_id and s2.line_id <> s1.line_id)),
  0,
  'No ledger entry is claimed by two settlement lines.');

select is(
  (public.rpc_settlement_build(
     timestamptz '2026-02-02 00:00+03', timestamptz '2026-02-09 00:00+03') ->> 'ok')::boolean,
  true,
  'Rebuilding a built run is allowed — it releases and reselects.');

-- ═══════════════════════ 8. the state machine has no side door

/*
 * Two locks, and they fail differently on purpose. A console
 * user has no UPDATE grant at all, so they never reach the
 * trigger; the trigger is there for the privileged writer — a
 * migration, a future function, somebody at a psql prompt.
 */
select throws_matching(
  format($$update public.fin_settlement_run set state = 'approved_2' where id = %L$$,
         (select v from t where k='run')),
  'permission denied',
  'A signed-in user cannot write to a settlement run at all.');

reset role;
select throws_matching(
  format($$update public.fin_settlement_run set state = 'approved_2' where id = %L$$,
         (select v from t where k='run')),
  'is changed by fn_settlement_transition',
  'And even the owner cannot set a state by hand — there is one door.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_matching(
  format($$select public.fn_settlement_transition(%L, 'approved_1')$$,
         (select v from t where k='run')),
  'cannot go from built to approved_1',
  'Nor can a run skip its checks on the way to approval.');

select lives_ok(
  format($$select public.fn_settlement_transition(%L, 'checked')$$, (select v from t where k='run')),
  'Checked, once the checks pass.');

select lives_ok(
  format($$select public.fn_settlement_transition(%L, 'approved_1')$$, (select v from t where k='run')),
  'And one signature goes on.');

select throws_matching(
  format($$select public.fn_settlement_transition(%L, 'approved_2')$$, (select v from t where k='run')),
  'approved this run already',
  'The same person cannot be both approvers.');

select throws_matching(
  format($$select public.fn_settlement_transition(%L, 'files_generated')$$,
         (select v from t where k='run')),
  'cannot go from approved_1 to files_generated',
  'And nothing is generated on one signature.');

select * from finish();
rollback;
