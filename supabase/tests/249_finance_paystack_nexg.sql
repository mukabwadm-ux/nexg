-- NexG's own money on the Finance Paystack screen (20270330000200,
-- rpc_finance_nexg): earnings from the ledger by account for Nairobi days, VAT
-- apart, Paystack's fees, and the Paystack money not yet on the books.
--
-- Worked by hand, March 2001, in cents:
--   commission   earned 100,000; refunded 30,000 (a second refund of 4,000 was
--                reversed); carried by merchants 20,000 + 5,000 = 25,000;
--                net 100,000 - 30,000 + 25,000 = 95,000
--   delivery     earned 10,000; net 10,000
--   stays        earned 10,000; refunded 3,000; net 7,000
--   VAT          16,000 + 1,600 + 1,600 - 480 = 18,720
--   transfer fee 2,000
--   collection fees 1,500 + 2,900 + 1,200 = 5,600; one payment with no fee
--   not on the books: bookings 2 (200,000 + 50,000 = 250,000; 50,000 back),
--                cinema 1 (80,000; 30,000 back)
--   Paystack receivable, all time, moves by 116,000 + 11,600 + 11,600 + 20,000
--                + 999 + 777 - 2,000 = 158,976

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create temp table t (k text primary key, v jsonb) on commit drop;
grant select, insert on t to authenticated, anon;

create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
create function pg_temp.dr(p_account text, p_cents bigint) returns jsonb language sql as $$
  select jsonb_build_object('account', p_account, 'debit', p_cents)
$$;
create function pg_temp.cr(p_account text, p_cents bigint) returns jsonb language sql as $$
  select jsonb_build_object('account', p_account, 'credit', p_cents)
$$;
create function pg_temp.post(p_kind text, p_key text, p_at timestamptz, p_entries jsonb,
                             p_reverses uuid default null) returns uuid
language sql as $$
  select ledger.post(p_kind => p_kind, p_idempotency_key => 'test247:' || p_key,
    p_entries => p_entries, p_effective_at => p_at, p_actor_label => '[Test]',
    p_reversal_of => p_reverses)
$$;
/* One revenue account's line, without its chart name. */
create function pg_temp.line(p_report jsonb, p_account text) returns jsonb language sql as $$
  select x - 'name' from jsonb_array_elements(p_report -> 'revenue') x where x ->> 'account' = p_account
$$;
create function pg_temp.accounts(p_report jsonb) returns text language sql as $$
  select string_agg(x ->> 'account', ' ' order by n)
    from jsonb_array_elements(p_report -> 'revenue') with ordinality as r (x, n)
$$;

set local session_replication_role = replica;
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
       now(), false, now(), now()
  from (values
    ('e2470000-0000-4000-8000-000000000001', 'finance247@test.local'),
    ('e2470000-0000-4000-8000-000000000002', 'ops247@test.local'),
    ('e2470000-0000-4000-8000-000000000003', 'partners247@test.local'),
    ('e2470000-0000-4000-8000-000000000004', 'guest247@example.test')) as u (id, email);
insert into public.staff_user (id, user_id, email, display_name) values
  ('e2470000-0000-4000-8000-0000000000b1', 'e2470000-0000-4000-8000-000000000001', 'finance247@test.local', 'Finance 247'),
  ('e2470000-0000-4000-8000-0000000000b2', 'e2470000-0000-4000-8000-000000000002', 'ops247@test.local', 'Ops 247'),
  ('e2470000-0000-4000-8000-0000000000b3', 'e2470000-0000-4000-8000-000000000003', 'partners247@test.local', 'Partnerships 247');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select g.staff::uuid, r.id, null, g.staff::uuid
  from (values
    ('e2470000-0000-4000-8000-0000000000b1', 'finance'),
    ('e2470000-0000-4000-8000-0000000000b2', 'ops_manager'),
    ('e2470000-0000-4000-8000-0000000000b3', 'partnerships')) as g (staff, role_key)
  join public.role r on r.key = g.role_key;
set local session_replication_role = origin;

-- ──────────────────────────────────────────────────── who may

select ok(not has_function_privilege('anon', 'public.rpc_finance_nexg(date, date)', 'execute'),
  'The anonymous key cannot read NexG''s money.');

set local role authenticated;
select pg_temp.as_user('e2470000-0000-4000-8000-000000000004');
select throws_ok($$select public.rpc_finance_nexg('2001-03-01', '2001-03-31')$$,
  '42501', 'Only people who reach Finance can see this.', 'A customer cannot.');
select pg_temp.as_user('e2470000-0000-4000-8000-000000000003');
select throws_ok($$select public.rpc_finance_nexg('2001-03-01', '2001-03-31')$$,
  '42501', null, 'Nor staff who do not reach Finance.');
select pg_temp.as_user('e2470000-0000-4000-8000-000000000002');
select lives_ok($$select public.rpc_finance_nexg('2001-03-01', '2001-03-31')$$,
  'Someone who may view Finance can.');
select pg_temp.as_user('e2470000-0000-4000-8000-000000000001');
select throws_ok($$select public.rpc_finance_nexg('2001-03-31', '2001-03-01')$$,
  '22023', null, 'A period ends on or after its first day.');

insert into t select 'before', public.rpc_finance_nexg('2001-03-01', '2001-03-31');
select is((select v - 'receivable_ledger_cents' from t where k = 'before'),
  '{"from": "2001-03-01", "to": "2001-03-31", "revenue": [], "vat_cents": 0,
    "transfer_fees_cents": 0, "collection_fees_cents": 0, "fee_unknown_count": 0,
    "off_books": {"booking": {"count": 0, "collected_cents": 0, "refunded_cents": 0},
                  "cinema": {"count": 0, "collected_cents": 0, "refunded_cents": 0}}}'::jsonb,
  'A period with nothing in it is zeros.');
reset role;

-- ──────────────────────────────────────────────────── the books

select pg_temp.post('order_sale_recognised', 'sale', '2001-03-01 00:30:00+03', jsonb_build_array(
  pg_temp.dr('cash.card_processor_receivable', 116000),
  pg_temp.cr('revenue.commission', 100000), pg_temp.cr('tax.vat_output', 16000)));
select pg_temp.post('order_sale_recognised', 'delivery', '2001-03-31 23:30:00+03', jsonb_build_array(
  pg_temp.dr('cash.card_processor_receivable', 11600),
  pg_temp.cr('revenue.delivery_fee', 10000), pg_temp.cr('tax.vat_output', 1600)));
select pg_temp.post('stay_paid', 'stay', '2001-03-10 12:00:00+03', jsonb_build_array(
  pg_temp.dr('cash.card_processor_receivable', 11600),
  pg_temp.cr('revenue.stay_commission', 10000), pg_temp.cr('tax.vat_output', 1600)));
select pg_temp.post('stay_cancelled_refund_due', 'stayback', '2001-03-11 12:00:00+03', jsonb_build_array(
  pg_temp.dr('revenue.stay_commission', 3000), pg_temp.dr('tax.vat_output', 480),
  pg_temp.cr('refunds_pending', 3480)));
select pg_temp.post('refund_approved', 'refund', '2001-03-12 12:00:00+03', jsonb_build_array(
  pg_temp.dr('revenue.commission', 30000), pg_temp.cr('refunds_pending', 30000)));
select pg_temp.post('merchant_refund_by_paystack', 'bypaystack', '2001-03-13 12:00:00+03', jsonb_build_array(
  pg_temp.dr('cash.card_processor_receivable', 20000), pg_temp.cr('revenue.commission', 20000)));
select pg_temp.post('merchant_refund_recovery', 'recovery', '2001-03-14 12:00:00+03', jsonb_build_array(
  jsonb_build_object('account', 'receivable.merchant', 'party_type', 'merchant',
                     'party_id', 'e2470000-0000-4000-8000-0000000000d1', 'debit', 5000),
  pg_temp.cr('revenue.commission', 5000)));
insert into t select 'wrong', to_jsonb(pg_temp.post('refund_approved', 'wrong',
  '2001-03-15 12:00:00+03', jsonb_build_array(
    pg_temp.dr('revenue.commission', 4000), pg_temp.cr('refunds_pending', 4000))));
select pg_temp.post('correction', 'unwrong', '2001-03-16 12:00:00+03', jsonb_build_array(
  pg_temp.dr('refunds_pending', 4000), pg_temp.cr('revenue.commission', 4000)),
  (select (v #>> '{}')::uuid from t where k = 'wrong'));
select pg_temp.post('payout_fee', 'fee', '2001-03-17 12:00:00+03', jsonb_build_array(
  pg_temp.dr('expense.provider_fees', 2000), pg_temp.cr('cash.card_processor_receivable', 2000)));
-- Just outside March in Nairobi, on both sides.
select pg_temp.post('order_sale_recognised', 'april', '2001-04-01 00:30:00+03', jsonb_build_array(
  pg_temp.dr('cash.card_processor_receivable', 999), pg_temp.cr('revenue.commission', 999)));
select pg_temp.post('order_sale_recognised', 'february', '2001-02-28 23:30:00+03', jsonb_build_array(
  pg_temp.dr('cash.card_processor_receivable', 777), pg_temp.cr('revenue.commission', 777)));

set local session_replication_role = replica;
insert into public.payment (id, reference, intent, order_id, cinema_hold_id, amount_cents, provider,
                            provider_ref, state, paid_at, provider_fee_cents, is_test, created_via)
select p.id::uuid, p.reference, p.intent::public.payment_intent,
       case when p.intent = 'order' then gen_random_uuid() end,
       case when p.intent = 'cinema' then gen_random_uuid() end,
       p.amount, p.provider, p.provider_ref, p.state::public.payment_state, p.paid_at::timestamptz,
       p.fee, p.test, 'guest_checkout'
  from (values
    ('e2470000-0000-4000-8000-0000000000f1', 'NXP247-1', 'order', 100000, 'paystack', '247001', 'paid', '2001-03-15 12:00+03', 1500, false),
    ('e2470000-0000-4000-8000-0000000000f2', 'NXP247-2', 'booking', 200000, 'paystack', '247002', 'paid', '2001-03-15 12:00+03', 2900, false),
    ('e2470000-0000-4000-8000-0000000000f3', 'NXP247-3', 'booking', 50000, 'paystack', '247003', 'reversed', '2001-03-15 12:00+03', null, false),
    ('e2470000-0000-4000-8000-0000000000f4', 'NXP247-4', 'cinema', 80000, 'paystack', '247004', 'paid', '2001-03-15 12:00+03', 1200, false),
    ('e2470000-0000-4000-8000-0000000000f5', 'NXP247-5', 'booking', 999999, 'paystack', '247005', 'paid', '2001-03-15 12:00+03', 999, true),
    ('e2470000-0000-4000-8000-0000000000f6', 'NXP247-6', 'booking', 7777, 'mpesa', '247006', 'paid', '2001-03-15 12:00+03', 77, false),
    ('e2470000-0000-4000-8000-0000000000f7', 'NXP247-7', 'booking', 5555, 'paystack', '247007', 'paid', '2001-04-01 00:30+03', 55, false),
    ('e2470000-0000-4000-8000-0000000000f8', 'NXP247-8', 'booking', 4444, 'paystack', '247008', 'failed', null, null, false))
    as p (id, reference, intent, amount, provider, provider_ref, state, paid_at, fee, test);
insert into public.paystack_refund (kind, payment_id, reference, amount_cents, is_test, state)
values
  ('booking', 'e2470000-0000-4000-8000-0000000000f3', 'NXR-ci247-booking-done', 50000, false, 'processed'),
  ('booking', 'e2470000-0000-4000-8000-0000000000f2', 'NXR-ci247-booking-wait', 20000, false, 'pending'),
  ('cinema', 'e2470000-0000-4000-8000-0000000000f4', 'NXR-ci247-cinema-fail', 10000, false, 'failed'),
  ('cinema', 'e2470000-0000-4000-8000-0000000000f4', 'NXR-ci247-cinema-done', 30000, false, 'processed');
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.as_user('e2470000-0000-4000-8000-000000000001');
insert into t select 'march', public.rpc_finance_nexg('2001-03-01', '2001-03-31');
insert into t select 'april', public.rpc_finance_nexg('2001-04-01', '2001-04-30');
insert into t select 'lastday', public.rpc_finance_nexg('2001-03-31', '2001-03-31');
reset role;

select is((select pg_temp.accounts(v) from t where k = 'march'),
  'revenue.commission revenue.delivery_fee revenue.stay_commission',
  'The accounts with entries, by code.');
select is((select pg_temp.line(v, 'revenue.commission') from t where k = 'march'),
  '{"account": "revenue.commission", "earned_cents": 100000, "refunded_cents": 30000,
    "recovered_cents": 25000, "net_cents": 95000}'::jsonb,
  'Commission: earned, refunded (a reversed refund counts for nothing), recovered and net.');
select is((select pg_temp.line(v, 'revenue.delivery_fee') from t where k = 'march'),
  '{"account": "revenue.delivery_fee", "earned_cents": 10000, "refunded_cents": 0,
    "recovered_cents": 0, "net_cents": 10000}'::jsonb,
  'Delivery fees, from the last half hour of March in Nairobi.');
select is((select pg_temp.line(v, 'revenue.stay_commission') from t where k = 'march'),
  '{"account": "revenue.stay_commission", "earned_cents": 10000, "refunded_cents": 3000,
    "recovered_cents": 0, "net_cents": 7000}'::jsonb,
  'Stay commission less what a cancelled stay took back.');
select is((select v ->> 'vat_cents' from t where k = 'march'), '18720', 'VAT is apart.');
select is((select v ->> 'transfer_fees_cents' from t where k = 'march'), '2000',
  'Paystack''s transfer fees.');
select is((select (v ->> 'collection_fees_cents') || ' ' || (v ->> 'fee_unknown_count')
             from t where k = 'march'),
  '5600 1', 'Paystack''s fees on live payments, and how many have none on record.');
select is((select v -> 'off_books' from t where k = 'march'),
  '{"booking": {"count": 2, "collected_cents": 250000, "refunded_cents": 50000},
    "cinema": {"count": 1, "collected_cents": 80000, "refunded_cents": 30000}}'::jsonb,
  'Booking and cinema money not on the books: live Paystack only, with what was processed back.');
select is(
  (select (m.v ->> 'receivable_ledger_cents')::bigint - (b.v ->> 'receivable_ledger_cents')::bigint
     from t m, t b where m.k = 'march' and b.k = 'before'),
  158976::bigint, 'The ledger''s Paystack receivable is all time.');
select is((select pg_temp.line(v, 'revenue.commission') ->> 'net_cents' from t where k = 'april'), '999',
  'The first half hour of April in Nairobi belongs to April.');
select is((select pg_temp.accounts(v) from t where k = 'lastday'), 'revenue.delivery_fee',
  'One day is that Nairobi day alone.');
select ok(
  (select bool_and(coalesce(x ->> 'name', '') <> '') from t, jsonb_array_elements(v -> 'revenue') x
    where k = 'march'),
  'Every account is named.');

select * from finish();
rollback;
