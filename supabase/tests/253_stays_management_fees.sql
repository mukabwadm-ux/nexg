-- Stays management fees (20270331000600): last month's invoice per host, one
-- line per property past its free trial; raising again changes nothing; the
-- payout run takes the fee from the host's line (all of it, or what the share
-- covers, the rest carried to the next run), never paying a negative amount;
-- the deduction is booked when the run is approved; a host paid by a Paystack
-- sub-account is left due and emailed, and Finance records their M-Pesa payment.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

/* No minimum payout, so nothing rolls; the fee rule as configured by default. */
delete from settings.version where key in ('settlement.minimum_payout',
  'stays.management_fee_kes', 'stays.trial_months');

/* Last month, and its first moment in Nairobi. */
insert into t values
  ('m0', (date_trunc('month', (now() at time zone 'Africa/Nairobi')::date) - interval '1 month')::date::text);
insert into t values
  ('m0_at', (((select v::date from t where k = 'm0')::timestamp) at time zone 'Africa/Nairobi')::text);

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('c2530000-0000-4000-8000-0000000000a1'::uuid, 'fin.253@test.local'),
  ('c2530000-0000-4000-8000-0000000000a2'::uuid, 'ops.253@test.local'),
  ('c2530000-0000-4000-8000-0000000000a3'::uuid, 'stranger.253@example.test')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2530000-0000-4000-8000-0000000000b1', 'c2530000-0000-4000-8000-0000000000a1', 'fin.253@test.local', 'Finance 253'),
  ('c2530000-0000-4000-8000-0000000000b2', 'c2530000-0000-4000-8000-0000000000a2', 'ops.253@test.local', 'Ops 253');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from (values
  ('c2530000-0000-4000-8000-0000000000b1'::uuid, 'finance'),
  ('c2530000-0000-4000-8000-0000000000b2'::uuid, 'ops_manager')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

-- ------------------------------------------------------- hosts and properties

insert into public.host (id, display_name, contact_name, email, phone, city_id, status, verified_at, went_live_at)
select h.id, h.name, h.name, h.email, h.phone, c.id, 'live', now(), now()
from (values
  ('c2530000-0000-4000-8000-0000000000c1'::uuid, '[Host 253 Full]', 'full253@example.test', '+254700025301'),
  ('c2530000-0000-4000-8000-0000000000c2'::uuid, '[Host 253 Partial]', 'partial253@example.test', '+254700025302'),
  ('c2530000-0000-4000-8000-0000000000c3'::uuid, '[Host 253 Split]', 'split253@example.test', '+254700025303'),
  ('c2530000-0000-4000-8000-0000000000c4'::uuid, '[Host 253 Trial]', 'trial253@example.test', '+254700025304')
) as h (id, name, email, phone)
cross join (select id from public.city where slug = 'nairobi') c;

/* Long past its trial, or listed three days before the month (trial still
   running on the 1st), or a sample. */
insert into public.property (id, host_id, slug, name, city_id, listed, listed_at, review_status, is_sample)
select p.id, p.host_id, 'p253-' || right(p.id::text, 2), p.name, c.id, true,
       (select v::timestamptz from t where k = 'm0_at') + p.offset_at, 'approved', p.sample
from (values
  ('c2530000-0000-4000-8000-0000000000d1'::uuid, 'c2530000-0000-4000-8000-0000000000c1'::uuid, '[Full One 253]', interval '-90 days', false),
  ('c2530000-0000-4000-8000-0000000000d2'::uuid, 'c2530000-0000-4000-8000-0000000000c1'::uuid, '[Full New 253]', interval '-3 days', false),
  ('c2530000-0000-4000-8000-0000000000d3'::uuid, 'c2530000-0000-4000-8000-0000000000c2'::uuid, '[Partial One 253]', interval '-60 days', false),
  ('c2530000-0000-4000-8000-0000000000d4'::uuid, 'c2530000-0000-4000-8000-0000000000c2'::uuid, '[Partial Two 253]', interval '-31 days', false),
  ('c2530000-0000-4000-8000-0000000000d5'::uuid, 'c2530000-0000-4000-8000-0000000000c3'::uuid, '[Split One 253]', interval '-120 days', false),
  ('c2530000-0000-4000-8000-0000000000d6'::uuid, 'c2530000-0000-4000-8000-0000000000c4'::uuid, '[Trial One 253]', interval '-10 days', false),
  ('c2530000-0000-4000-8000-0000000000d7'::uuid, 'c2530000-0000-4000-8000-0000000000c4'::uuid, '[Sample 253]', interval '-200 days', true)
) as p (id, host_id, name, offset_at, sample)
cross join (select id from public.city where slug = 'nairobi') c;

/* The split host is paid by an active live Paystack sub-account. */
insert into public.host_paystack_subaccount (host_id, is_test, subaccount_code, schedule, status)
values ('c2530000-0000-4000-8000-0000000000c3', false, 'ACCT_test253split', 'auto', 'active');

/* What the full and partial hosts earned this hour. */
do $$
begin
  perform ledger.post('stay_paid', 'tap:253:stay:c1', jsonb_build_array(
    jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', 500000),
    jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
                       'party_id', 'c2530000-0000-4000-8000-0000000000c1', 'credit', 500000)));
  perform ledger.post('stay_paid', 'tap:253:stay:c2', jsonb_build_array(
    jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', 150000),
    jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
                       'party_id', 'c2530000-0000-4000-8000-0000000000c2', 'credit', 150000)));
end
$$;

insert into t values
  ('from', (now() - interval '1 hour')::text),
  ('to', (now() + interval '1 hour')::text),
  ('from2', (now() + interval '7 days')::text),
  ('to2', (now() + interval '7 days 2 hours')::text);
/* Any run this database already has for those weeks is set aside for the test. */
delete from public.fin_settlement_run
 where reference in ('RUN-' || to_char(now() - interval '1 hour', 'IYYY-"W"IW'),
                     'RUN-' || to_char(now() + interval '7 days', 'IYYY-"W"IW'));

-- ══════════════════════════════════════════════════════════════════ wiring

select ok(
  not has_function_privilege('anon', 'public.rpc_console_stays_fee_raise(date)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_stays_fee_raise(date, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_stays_fee_apply_run(uuid)', 'execute')
  and not has_table_privilege('authenticated', 'public.stays_fee_settlement', 'select'),
  'The fee functions and table are reached only through the console RPCs');

select ok(exists (select 1 from cron.job where jobname = 'stays-management-fee-invoices'
                   and schedule = '0 3 1 * *'),
  'A monthly job raises last month''s invoices on the 1st at 06:00 Nairobi');

-- ══════════════════════════════════════════════════════════════ raising

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_console_stays_fee_raise((select v::date from t where k = 'm0')) $$,
  '42501', null, 'A stranger cannot raise invoices');

select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_console_stays_fee_raise((now() at time zone 'Africa/Nairobi')::date) $$,
  '22023', 'A month can be invoiced once it has ended.', 'This month cannot be invoiced yet');

select ok((public.rpc_console_stays_fee_raise((select v::date from t where k = 'm0')) ->> 'raised')::int >= 3,
  'Hospitality staff raise last month''s invoices');

reset role;

select is(
  (select jsonb_build_object('total', total, 'status', status, 'lines', jsonb_array_length(lines),
            'label', lines -> 0 ->> 'label', 'months', (lines -> 0 ->> 'months')::int)
     from public.host_invoice where host_id = 'c2530000-0000-4000-8000-0000000000c1'
      and period = (select v::date from t where k = 'm0')),
  '{"total": 100000, "status": "due", "lines": 1, "label": "[Full One 253]", "months": 1}'::jsonb,
  'One line per property past its trial: KES 1,000, the property still in its trial is free');

select is(
  (select total from public.host_invoice where host_id = 'c2530000-0000-4000-8000-0000000000c2'
      and period = (select v::date from t where k = 'm0')),
  200000::bigint, 'Two properties past their trial are KES 2,000');

select is(
  (select count(*)::int from public.host_invoice where host_id = 'c2530000-0000-4000-8000-0000000000c4'),
  0, 'A host whose only properties are in trial or samples gets no invoice');

select is(
  (select count(*)::int from ledger.entry e join ledger.transaction x on x.id = e.transaction_id
    where x.idempotency_key = 'host_invoice:' || (select id from public.host_invoice
            where host_id = 'c2530000-0000-4000-8000-0000000000c1' and period = (select v::date from t where k = 'm0'))
      and e.account_code = 'revenue.stays_management_fee' and e.credit = 100000),
  1, 'The invoice is revenue on the management fee account, not packages');

select ok(
  exists (select 1 from public.notification_log where template = 'host_management_fee'
           and recipient = 'split253@example.test' and (payload ->> 'subaccount')::boolean)
  and exists (select 1 from public.notification_log where template = 'host_management_fee'
           and recipient = 'full253@example.test' and not (payload ->> 'subaccount')::boolean),
  'Each host is emailed, the split host told to pay by M-Pesa');

insert into t select 'invoices', count(*)::text from public.host_invoice;
insert into t select 'emails', count(*)::text from public.notification_log where template = 'host_management_fee';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((public.rpc_console_stays_fee_raise((select v::date from t where k = 'm0')) ->> 'raised')::int, 0,
  'Raising the same month again raises nothing');
reset role;
select ok(
  (select count(*) from public.host_invoice)::text = (select v from t where k = 'invoices')
  and (select count(*) from public.notification_log where template = 'host_management_fee')::text
      = (select v from t where k = 'emails'),
  'and sends nothing again');

select ok((select count(*) from audit.audit_event where action = 'stays.fee_invoices_raised'
            and after ->> 'month' = (select v from t where k = 'm0')) >= 2,
  'Each raise is audited');

-- ═══════════════════════════════════════════════ the run takes the fee

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into t (k, v) select 'run', public.rpc_settlement_build(
  (select v::timestamptz from t where k = 'from'), (select v::timestamptz from t where k = 'to')) ->> 'run_id';
reset role;

select is(
  (select jsonb_build_object('gross', gross_cents, 'adj', adjustment_cents, 'net', net_cents,
            'label', adjustments -> 0 ->> 'label')
     from public.fin_settlement_line where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'c2530000-0000-4000-8000-0000000000c1'),
  jsonb_build_object('gross', 500000, 'adj', -100000, 'net', 400000,
    'label', 'Management fee · ' || to_char((select v::date from t where k = 'm0'), 'Mon YYYY')),
  'A host whose share covers the fee is paid the share less the fee');

select is(
  (select jsonb_build_object('gross', gross_cents, 'adj', adjustment_cents, 'net', net_cents)
     from public.fin_settlement_line where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'c2530000-0000-4000-8000-0000000000c2'),
  '{"gross": 150000, "adj": -150000, "net": 0}'::jsonb,
  'A share smaller than the fee is all taken, and the payout is zero, not negative');

select ok(
  (select bool_and((c ->> 'ok')::boolean) from public.fin_settlement_run r,
          jsonb_array_elements(r.checks) c
    where r.id = (select v::uuid from t where k = 'run') and c ->> 'key' in ('ledger_equality', 'nothing_negative')),
  'The run still re-sums to the ledger and pays nothing negative');

select is(
  (select (totals ->> 'adjustments_cents')::bigint <= -250000 from public.fin_settlement_run
    where id = (select v::uuid from t where k = 'run')),
  true, 'The run''s totals carry the fees as adjustments');

select is(
  (select status::text from public.host_invoice where host_id = 'c2530000-0000-4000-8000-0000000000c1'
      and period = (select v::date from t where k = 'm0')),
  'due', 'Nothing is booked while the run can still change');

/* A rebuild takes the fee once, not twice. */
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$ select public.rpc_settlement_build(
  (select v::timestamptz from t where k = 'from'), (select v::timestamptz from t where k = 'to')) $$,
  'The run can be rebuilt');
reset role;
select is(
  (select count(*)::int from public.stays_fee_settlement s
     join public.host_invoice i on i.id = s.invoice_id
    where i.host_id in ('c2530000-0000-4000-8000-0000000000c1', 'c2530000-0000-4000-8000-0000000000c2')),
  2, 'and after a rebuild each host has one deduction waiting, not two');

/* Both signatures in: the deductions are booked. */
select set_config('nexg.settlement_transition', (select v from t where k = 'run'), true);
update public.fin_settlement_run set state = 'approved_2' where id = (select v::uuid from t where k = 'run');
select set_config('nexg.settlement_transition', '', true);

select is(
  (select jsonb_build_object('status', status, 'paid', paid_at is not null)
     from public.host_invoice where host_id = 'c2530000-0000-4000-8000-0000000000c1'
      and period = (select v::date from t where k = 'm0')),
  '{"status": "paid", "paid": true}'::jsonb,
  'Once the run is approved, the covered invoice is paid');

select ok(exists (select 1 from public.receipt where source_type = 'host_invoice'
                   and source_id = (select id from public.host_invoice where host_id = 'c2530000-0000-4000-8000-0000000000c1'
                                      and period = (select v::date from t where k = 'm0'))
                   and total_cents = 100000),
  'and the host has a receipt for KES 1,000');

select is(
  (select coalesce(sum(e.credit - e.debit), 0) from ledger.entry e
    where e.account_code = ledger.fn_account('receivable.host', 'host', 'c2530000-0000-4000-8000-0000000000c1')),
  0::numeric, 'The host''s receivable is cleared by the deduction');

select ok(
  (select bool_and(exists (select 1 from public.fin_settled_entry fs where fs.entry_id = e.id))
     from ledger.entry e
    where e.account_code = ledger.fn_account('stay.host_share', 'host', 'c2530000-0000-4000-8000-0000000000c1')
      and e.debit > 0),
  'The share given up is claimed, so no later run counts it again');

select is(
  (select status::text from public.host_invoice where host_id = 'c2530000-0000-4000-8000-0000000000c2'
      and period = (select v::date from t where k = 'm0')),
  'due', 'A part-paid invoice stays due');

-- ═══════════════════════════════════════ the rest carries to the next run

do $$
begin
  perform ledger.post('stay_paid', 'tap:253:stay:c2b', jsonb_build_array(
    jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', 100000),
    jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
                       'party_id', 'c2530000-0000-4000-8000-0000000000c2', 'credit', 100000)),
    p_effective_at => now() + interval '7 days 1 hour');
end
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into t (k, v) select 'run2', public.rpc_settlement_build(
  (select v::timestamptz from t where k = 'from2'), (select v::timestamptz from t where k = 'to2')) ->> 'run_id';
reset role;

select is(
  (select jsonb_build_object('gross', gross_cents, 'adj', adjustment_cents, 'net', net_cents)
     from public.fin_settlement_line where run_id = (select v::uuid from t where k = 'run2')
      and party_id = 'c2530000-0000-4000-8000-0000000000c2'),
  '{"gross": 100000, "adj": -50000, "net": 50000}'::jsonb,
  'The next run takes only what is still owed');

-- ═════════════════════════════════════════ the sub-account host pays by M-Pesa

select is(
  (select count(*)::int from public.fin_settlement_line where party_id = 'c2530000-0000-4000-8000-0000000000c3'),
  0, 'The split host has no payout line to take the fee from');

insert into t select 'inv_split', id::text from public.host_invoice
 where host_id = 'c2530000-0000-4000-8000-0000000000c3';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select throws_ok(
  format($$ select public.rpc_console_stays_fee_payment(%L, 1000, 'QK12ABC345') $$,
    (select v::uuid from t where k = 'inv_split')),
  '42501', null, 'Only Finance records a payment');

select set_config('request.jwt.claims', '{"sub":"c2530000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok(
  format($$ select public.rpc_console_stays_fee_payment(%L, 1500, 'QK12ABC345') $$,
    (select v::uuid from t where k = 'inv_split')),
  '22023', null, 'A payment over what is outstanding is refused');

select is(
  (public.rpc_console_stays_fee_payment(
    (select v::uuid from t where k = 'inv_split'),
    1000, 'qk12abc345') ->> 'status'),
  'paid', 'Finance records the host''s M-Pesa payment and the invoice is paid');

select is(
  (select jsonb_build_object('invoiced', k -> 'invoiced_kes', 'mpesa', k -> 'mpesa_kes',
            'split_row', (select x ->> 'subaccount' from jsonb_array_elements(r -> 'invoices') x
                           where x ->> 'host_id' = 'c2530000-0000-4000-8000-0000000000c3'))
     from (select public.rpc_console_stays_fee_invoices((select v::date from t where k = 'm0'),
             (now() at time zone 'Africa/Nairobi')::date) as r) q,
          lateral (select q.r -> 'kpis' as k) kk)
    - 'invoiced',
  '{"mpesa": 1000.0, "split_row": "true"}'::jsonb,
  'The Management Fees tab reads invoiced and collected, and marks the split host');

reset role;

select * from finish();
rollback;
