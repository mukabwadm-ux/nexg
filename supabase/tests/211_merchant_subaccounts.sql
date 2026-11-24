-- Merchants paid by Paystack sub-accounts: a second Finance person switches
-- one on; checkout then splits the merchant's share (items less commission)
-- to it and NexG keeps the rest and the fee; the books show the merchant paid,
-- so the payout run never pays it again; a refund Finance puts on the merchant
-- is taken from their next sales.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

delete from vault.secrets where name in ('paystack_test_secret_key', 'paystack_live_secret_key');
select vault.create_secret('sk_test_ci_only_0123456789abcdef', 'paystack_test_secret_key');
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create function pg_temp.ps_sign(p_body text, p_key text default 'sk_live_ci_only_0123456789abcdef') returns text
language sql as $$
  select encode(extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_key, 'UTF8'), 'sha512'), 'hex')
$$;
create function pg_temp.ps_paid(p_reference text, p_id bigint, p_amount bigint,
                                p_subaccount text default 'ACCT_ci2110001') returns text
language sql as $$
  select jsonb_build_object('event', 'charge.success',
    'data', jsonb_build_object('id', p_id, 'reference', p_reference, 'status', 'success',
      'amount', p_amount, 'currency', 'KES', 'channel', 'card', 'fees', 4350,
      'gateway_response', 'Approved',
      'subaccount', case when p_subaccount is null then '{}'::jsonb
                         else jsonb_build_object('subaccount_code', p_subaccount) end))::text
$$;
create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
create function pg_temp.hint_of(p_sql text) returns text language plpgsql as $$
declare v_state text;
begin
  execute p_sql;
  return 'done';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate;
  return v_state;
end
$$;
/* The merchant's payable balance on one order's ledger lines. */
create function pg_temp.owed_on(p_order uuid) returns bigint language sql as $$
  select coalesce(sum(e.credit - e.debit), 0)::bigint
    from ledger.entry e join ledger.transaction t on t.id = e.transaction_id
   where t.order_id = p_order and e.account_code like 'payable.merchant:%'
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2110000-0000-4000-8000-000000000021', 'authenticated',
   'authenticated', 'split.guest@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2110000-0000-4000-8000-000000000006', 'authenticated',
   'authenticated', 'finance211a@test.local', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2110000-0000-4000-8000-000000000007', 'authenticated',
   'authenticated', 'finance211b@test.local', '', now(), now(), now());
insert into public.guest (id, phone, name, user_id)
values ('c2110000-0000-4000-8000-000000000001', '+254700021101', '[Split guest]',
        'c2110000-0000-4000-8000-000000000021');

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2110000-0000-4000-8000-0000000000b1', 'c2110000-0000-4000-8000-000000000006', 'finance211a@test.local', 'Finance 211 A'),
  ('c2110000-0000-4000-8000-0000000000b2', 'c2110000-0000-4000-8000-000000000007', 'finance211b@test.local', 'Finance 211 B');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select s.id, r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       case when s.id = 'c2110000-0000-4000-8000-0000000000b1'::uuid
            then 'c2110000-0000-4000-8000-0000000000b2'::uuid
            else 'c2110000-0000-4000-8000-0000000000b1'::uuid end
  from public.staff_user s, public.role r
 where r.key = 'finance'
   and s.id in ('c2110000-0000-4000-8000-0000000000b1', 'c2110000-0000-4000-8000-0000000000b2');

-- A real shop (paid live) and a test shop. Each order: items 1,500 less 300 commission.
with shops as (
  select m.id as merchant_id, m.city_id, b.id as branch_id, row_number() over (order by m.id) as n
    from public.merchant m
    join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
   where m.city_id is not null and m.deleted_at is null
), orders(id, reference, shop) as (
  values ('c2110000-0000-4000-8000-000000000011'::uuid, 'SPLIT-211-1', 2),
         ('c2110000-0000-4000-8000-000000000012'::uuid, 'SPLIT-211-2', 2),
         ('c2110000-0000-4000-8000-000000000013'::uuid, 'SPLIT-211-3', 2),
         ('c2110000-0000-4000-8000-000000000014'::uuid, 'SPLIT-211-T', 1)
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, commission_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select o.id, o.reference, 'c2110000-0000-4000-8000-000000000001', s.merchant_id, s.branch_id,
  s.city_id, 'web', '[Fixture address]', 'confirmed', 'mpesa_stk', 'pending',
  150000, 30000, 0, 0, 150000, 'KES'
from orders o join shops s on s.n = o.shop;

update public.merchant set accepts_test_payments = false
 where id = (select merchant_id from public.order where reference = 'SPLIT-211-1');
update public.merchant set accepts_test_payments = true
 where id = (select merchant_id from public.order where reference = 'SPLIT-211-T');

create temp table t (k text primary key, v text) on commit drop;
grant select, insert on t to authenticated, anon;
insert into t select 'm', merchant_id::text from public.order where reference = 'SPLIT-211-1';

-- ── 1. Finance records it, a second person switches it on

set local role authenticated;
select pg_temp.as_user('c2110000-0000-4000-8000-000000000021');
select is(pg_temp.hint_of(format(
  $$select public.rpc_merchant_subaccount_request(%L, false, 'ACCT_ci2110001', 'auto', '{}')$$,
  (select v from t where k = 'm'))), '42501', 'A customer cannot record a sub-account.');

select pg_temp.as_user('c2110000-0000-4000-8000-000000000006');
insert into t select 'sub', public.rpc_merchant_subaccount_request((select v::uuid from t where k = 'm'), false,
  'ACCT_ci2110001', 'auto', '{"business_name": "[Shop 211]", "account_last4": "1234"}', 'Made in the dashboard') ->> 'id';
select is(pg_temp.hint_of(format($$select public.rpc_merchant_subaccount_decide(%L, true)$$,
  (select v from t where k = 'sub'))), '42501', 'The person who recorded it cannot switch it on.');

select pg_temp.as_user('c2110000-0000-4000-8000-000000000007');
select is(pg_temp.hint_of(format($$select public.rpc_merchant_subaccount_decide(%L, true)$$,
  (select v from t where k = 'sub'))), '22023', 'Not without their own look-up in Paystack.');
select is(public.rpc_merchant_subaccount_decide((select v::uuid from t where k = 'sub'), true, null,
  '{"subaccount_code": "ACCT_ci2110001", "test": false, "business_name": "[Shop 211]"}') ->> 'status',
  'active', 'A second Finance person switches it on, on their own look-up.');

-- ── 2. checkout splits it

select pg_temp.as_user('c2110000-0000-4000-8000-000000000021');
insert into t select 'ref1', public.rpc_payment_begin_order('c2110000-0000-4000-8000-000000000011') ->> 'reference';
insert into t select 'try1', public.rpc_payment_paystack_attempt((select v from t where k = 'ref1'), 'card', null,
  'sk_live_ci_only_0123456789abcdef')::text;
select is((select v::jsonb -> 'split' from t where k = 'try1'),
  '{"subaccount": "ACCT_ci2110001", "transaction_charge": 30000, "bearer": "account"}'::jsonb,
  'The merchant''s share goes to its sub-account; NexG keeps its commission and pays the fee.');
select public.rpc_payment_paystack_opened((select v from t where k = 'ref1') || '-1', 'acc_ci',
  'https://checkout.paystack.com/ci-211', null, 'sk_live_ci_only_0123456789abcdef');

insert into t select 'reft', public.rpc_payment_begin_order('c2110000-0000-4000-8000-000000000014') ->> 'reference';
select is(public.rpc_payment_paystack_attempt((select v from t where k = 'reft'), 'card', null,
  'sk_test_ci_only_0123456789abcdef') -> 'split', null,
  'A merchant with no sub-account is not split: the payout run pays it.');
reset role;

-- ── 3. the books

insert into t select 'paid1', pg_temp.ps_paid((select v from t where k = 'ref1') || '-1', 921101, 150000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.rpc_payment_paystack_webhook((select v from t where k = 'paid1'),
  pg_temp.ps_sign((select v from t where k = 'paid1'))) ->> 'state', 'paid', 'Paystack''s signed success pays the order.');
reset role;

select is(pg_temp.owed_on('c2110000-0000-4000-8000-000000000011'), 0::bigint,
  'Paystack paid the merchant directly, so nothing on the order is left owed to them.');
select is((select sum(e.credit) from ledger.entry e join ledger.transaction x on x.id = e.transaction_id
            where x.idempotency_key like 'split:%' and x.order_id = 'c2110000-0000-4000-8000-000000000011'
              and e.account_code = 'cash.card_processor_receivable')::bigint,
  120000::bigint, 'Their share leaves NexG''s Paystack balance as it is paid.');
select is((select coalesce(sum(e.credit - e.debit), 0)::bigint
            from public.fn_settlement_owed(now() - interval '30 days', now() + interval '1 day') o
            join ledger.entry e on e.id = any (o.entry_ids)
            join ledger.transaction x on x.id = e.transaction_id
           where o.party_id = (select v::uuid from t where k = 'm')
             and x.order_id = 'c2110000-0000-4000-8000-000000000011'),
  0::bigint, 'The payout run would pay nothing more for it.');

-- ── 4. a refund Finance puts on the merchant

insert into public.refund (id, order_id, amount_cents, method, reason_code, reason_text,
                           requested_by, approved_by, status)
values ('c2110000-0000-4000-8000-0000000000f1', 'c2110000-0000-4000-8000-000000000011', 50000, 'original',
        'missing_item', '[Two items missing]', 'c2110000-0000-4000-8000-0000000000b1',
        'c2110000-0000-4000-8000-0000000000b2', 'approved');
update public.refund set status = 'issued', issued_at = now(), provider_ref = '[NXR-ci211]'
 where id = 'c2110000-0000-4000-8000-0000000000f1';

set local role authenticated;
select pg_temp.as_user('c2110000-0000-4000-8000-000000000007');
select is(jsonb_array_length(public.rpc_merchant_split_overview((select v::uuid from t where k = 'm')) -> 'refundsToDecide'),
  1, 'The refund waits for Finance to say who carries it.');
select is(pg_temp.hint_of($$select public.rpc_merchant_recovery_decide('c2110000-0000-4000-8000-0000000000f1', 'next_sales', 200000)$$),
  '22023', 'The merchant never carries more than they were paid for the order.');
select is(public.rpc_merchant_recovery_decide('c2110000-0000-4000-8000-0000000000f1', 'next_sales', 40000,
  'Shop forgot the items') ->> 'method', 'next_sales', 'Finance takes KES 400 from their next sales.');
reset role;
select is(public.fn_merchant_recovery_due((select v::uuid from t where k = 'm'), false), 40000::bigint,
  'KES 400 is owed back.');

-- ── 5. taken from the next sale

set local role authenticated;
select pg_temp.as_user('c2110000-0000-4000-8000-000000000021');
insert into t select 'ref2', public.rpc_payment_begin_order('c2110000-0000-4000-8000-000000000012') ->> 'reference';
insert into t select 'try2', public.rpc_payment_paystack_attempt((select v from t where k = 'ref2'), 'card', null,
  'sk_live_ci_only_0123456789abcdef')::text;
select is(((select v::jsonb from t where k = 'try2') #>> '{split,transaction_charge}')::bigint, 70000::bigint,
  'NexG keeps its commission plus the KES 400 owed back.');
select public.rpc_payment_paystack_opened((select v from t where k = 'ref2') || '-1', 'acc_ci2',
  'https://checkout.paystack.com/ci-211b', null, 'sk_live_ci_only_0123456789abcdef');
reset role;
insert into t select 'paid2', pg_temp.ps_paid((select v from t where k = 'ref2') || '-1', 921102, 150000);
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select public.rpc_payment_paystack_webhook((select v from t where k = 'paid2'), pg_temp.ps_sign((select v from t where k = 'paid2')));
reset role;

select is((select state from public.merchant_recovery where refund_id = 'c2110000-0000-4000-8000-0000000000f1'),
  'recovered', 'Once that order is paid, the refund is recovered.');
select is((select coalesce(sum(e.debit - e.credit), 0) from ledger.entry e
            where e.account_code = 'receivable.merchant:' || (select v from t where k = 'm'))::bigint,
  0::bigint, 'and nothing is left owed to NexG.');
select is(pg_temp.owed_on('c2110000-0000-4000-8000-000000000012'), 0::bigint,
  'The second order is paid out in full to the merchant too, less what came back.');

-- ── 5b. a refund Paystack took from the merchant's sub-account (the usual case)

insert into public.refund (id, order_id, amount_cents, method, reason_code, reason_text,
                           requested_by, approved_by, status)
values ('c2110000-0000-4000-8000-0000000000f2', 'c2110000-0000-4000-8000-000000000012', 30000, 'original',
        'missing_item', '[One item missing]', 'c2110000-0000-4000-8000-0000000000b1',
        'c2110000-0000-4000-8000-0000000000b2', 'approved');
update public.refund set status = 'issued', issued_at = now(), provider_ref = '[NXR-ci211b]'
 where id = 'c2110000-0000-4000-8000-0000000000f2';

set local role authenticated;
select pg_temp.as_user('c2110000-0000-4000-8000-000000000007');
select is(public.rpc_merchant_recovery_decide('c2110000-0000-4000-8000-0000000000f2', 'paystack', 30000)
  ->> 'method', 'paystack', 'Finance records that Paystack took KES 300 from the sub-account.');
reset role;
select is((select state || ':' || recovered_cents from public.merchant_recovery
            where refund_id = 'c2110000-0000-4000-8000-0000000000f2'),
  'by_paystack:30000', 'It is settled at once.');
select is((select coalesce(sum(e.debit), 0) from ledger.entry e
             join ledger.transaction x on x.id = e.transaction_id
            where x.kind = 'merchant_refund_by_paystack'
              and x.order_id = 'c2110000-0000-4000-8000-000000000012'
              and e.account_code = 'cash.card_processor_receivable')::bigint,
  30000::bigint, 'and that part stays in NexG''s Paystack balance, with nothing owed by the merchant.');

-- ── 6. paused

set local role authenticated;
select pg_temp.as_user('c2110000-0000-4000-8000-000000000006');
select public.rpc_merchant_subaccount_pause((select v::uuid from t where k = 'sub'), true, 'Bank details changing');
select pg_temp.as_user('c2110000-0000-4000-8000-000000000021');
insert into t select 'ref3', public.rpc_payment_begin_order('c2110000-0000-4000-8000-000000000013') ->> 'reference';
select is(public.rpc_payment_paystack_attempt((select v from t where k = 'ref3'), 'card', null,
  'sk_live_ci_only_0123456789abcdef') -> 'split', null,
  'Paused: new orders are not split and go to the payout run.');
select is(pg_temp.hint_of(format($$select public.rpc_merchant_split_overview(%L)$$, (select v from t where k = 'm'))),
  '42501', 'A customer cannot read a shop''s Paystack payouts.');
reset role;

select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical' and finding ~ '(subaccount|merchant_recovery|split_settled|split_overview)'),
  0, 'The wiring check finds nothing wrong with merchant sub-accounts.');

select * from finish();
rollback;
