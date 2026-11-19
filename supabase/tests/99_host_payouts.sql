-- Hosts are paid in the weekly run.
--
-- A host's stay shares and referral rewards are paid together, on one line,
-- to payout details Finance has verified. Hospitality staff declare them;
-- somebody with full Finance, not the declarer, verifies them. A host without
-- verified details is held; a paused host is held whatever their details.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

/* No minimum payout, so nothing here rolls to next week. */
delete from settings.version where key = 'settlement.minimum_payout';

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('b8b80000-0000-4000-8000-0000000000a1'::uuid, 'fin.one.hp@test.local'),
  ('b8b80000-0000-4000-8000-0000000000a2'::uuid, 'partners.hp@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('b8b80000-0000-4000-8000-0000000000b1', 'b8b80000-0000-4000-8000-0000000000a1',
   'fin.one.hp@test.local', 'Finance One HP'),
  ('b8b80000-0000-4000-8000-0000000000b2', 'b8b80000-0000-4000-8000-0000000000a2',
   'partners.hp@test.local', 'Partnerships HP');

/* Finance grants need a second approver. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a',
       case when g.role_key = 'finance' then '00000000-0000-4000-8000-00000000000b'::uuid end
from (values
  ('b8b80000-0000-4000-8000-0000000000b1'::uuid, 'finance'),
  ('b8b80000-0000-4000-8000-0000000000b2'::uuid, 'partnerships')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

-- ------------------------------------------------------------------- hosts

insert into public.host (id, display_name, phone, city_id, status, verified_at, went_live_at)
select h.id, h.name, h.phone, c.id, h.status::public.host_status, now(), now()
from (values
  ('b8b80000-0000-4000-8000-0000000000c1'::uuid, 'Test Host Paid HP', '+254700200001', 'live'),
  ('b8b80000-0000-4000-8000-0000000000c2'::uuid, 'Test Host Unset HP', '+254700200002', 'live'),
  ('b8b80000-0000-4000-8000-0000000000c3'::uuid, 'Test Host Paused HP', '+254700200003', 'paused')
) as h (id, name, phone, status)
cross join (select id from public.city where slug = 'nairobi') c;

/* What each host is owed, posted now: stay shares on stay.host_share, a
   referral reward on payable.host_credit. */
do $$
begin
  perform ledger.post('stay_paid', 'tap:hp:stay:c1', jsonb_build_array(
    jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', 1700000),
    jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
                       'party_id', 'b8b80000-0000-4000-8000-0000000000c1', 'credit', 1700000)));
  perform ledger.post('host_referral_credited', 'tap:hp:reward:c1', jsonb_build_array(
    jsonb_build_object('account', 'expense.referral_reward', 'debit', 300000),
    jsonb_build_object('account', 'payable.host_credit', 'party_type', 'host',
                       'party_id', 'b8b80000-0000-4000-8000-0000000000c1', 'credit', 300000)));
  perform ledger.post('stay_paid', 'tap:hp:stay:c2', jsonb_build_array(
    jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', 500000),
    jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
                       'party_id', 'b8b80000-0000-4000-8000-0000000000c2', 'credit', 500000)));
  perform ledger.post('stay_paid', 'tap:hp:stay:c3', jsonb_build_array(
    jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', 400000),
    jsonb_build_object('account', 'stay.host_share', 'party_type', 'host',
                       'party_id', 'b8b80000-0000-4000-8000-0000000000c3', 'credit', 400000)));
end
$$;

/* A run window around now. Any run this database already has for the week
   is set aside for the test. */
insert into t values
  ('from', (now() - interval '1 hour')::text),
  ('to', (now() + interval '1 hour')::text);
delete from public.fin_settlement_run
 where reference = 'RUN-' || to_char(now() - interval '1 hour', 'IYYY-"W"IW')
    or (period_start = now() - interval '1 hour' and period_end = now() + interval '1 hour');

-- ══════════════════════════════════════════════════════════════════ wiring

select ok(
  not has_function_privilege('anon', 'public.rpc_host_payout_declare(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_host_payout_verify(uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_host_payouts()', 'execute')
  and not has_table_privilege('authenticated', 'public.host_payout', 'select')
  and not has_table_privilege('authenticated', 'public.host_payout', 'insert'),
  'Host payout details are reached only through their functions, and never anonymously');

-- ══════════════════════════════════════════════════════════════ declaring

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b8b80000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_host_payout_declare('b8b80000-0000-4000-8000-0000000000c1',
      '{"rail": "mpesa_phone", "phoneNumber": "0712 345 678", "accountName": "Test Host"}')$$,
  '42501', 'Only hospitality staff can declare payout details.',
  'Finance cannot declare where a host is paid');

select set_config('request.jwt.claims',
  '{"sub":"b8b80000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_host_payout_declare('b8b80000-0000-4000-8000-0000000000c1',
      '{"rail": "mpesa_phone", "phoneNumber": "12345", "accountName": "Test Host"}')$$,
  '22023', 'Enter a Kenyan M-PESA number, such as 0712 345 678.',
  'A number that is not a Kenyan M-PESA number is refused');

select is(
  (select jsonb_build_object('masked', r ->> 'destination_masked', 'version', (r ->> 'version')::int)
     from (select public.rpc_host_payout_declare('b8b80000-0000-4000-8000-0000000000c1',
             '{"rail": "mpesa_phone", "phoneNumber": "0712 345 678", "accountName": "Test Host"}') as r) x),
  '{"masked": "•••• 5678", "version": 1}'::jsonb,
  'Hospitality staff declare where a host is paid');

select lives_ok(
  $$select public.rpc_host_payout_declare('b8b80000-0000-4000-8000-0000000000c3',
      '{"rail": "bank", "bankName": "Equity Bank", "accountName": "Paused Host", "accountNumber": "0123456789012"}')$$,
  'and for a host paid by bank');

reset role;

select is(
  (select after ->> 'destination' from audit.audit_event
    where action = 'host.payout_declared'
      and target_id = 'b8b80000-0000-4000-8000-0000000000c1'
    order by id desc limit 1),
  '•••• 5678',
  'The audit log records the destination masked, not the number');

-- ════════════════════════════════════════════ a run before anything is verified

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b8b80000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into t (k, v) select 'run', public.rpc_settlement_build(
  (select v::timestamptz from t where k = 'from'), (select v::timestamptz from t where k = 'to'))
  ->> 'run_id';

reset role;

select is(
  (select party_label || ' · ' || state || ' · ' || hold_reason || ' · ' || net_cents
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'b8b80000-0000-4000-8000-0000000000c1'),
  'Test Host Paid HP · held_kyc · payout details not yet verified by Finance · 2000000',
  'The run names the host, pays stays and rewards on one line, and holds it until Finance verifies');

select is(
  (select party_label || ' · ' || state || ' · ' || hold_reason || ' · ' || net_cents
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'b8b80000-0000-4000-8000-0000000000c2'),
  'Test Host Unset HP · held_kyc · no payout details on file · 500000',
  'A host with no payout details is held');

select is(
  (select party_label || ' · ' || state || ' · ' || hold_reason || ' · ' || net_cents
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'run')
      and party_id = 'b8b80000-0000-4000-8000-0000000000c3'),
  'Test Host Paused HP · held_suspended · the host is paused · 400000',
  'A paused host is held, whatever their details');

select is(
  (select count(*)::int from public.fin_run_line_v
    where run_id = (select v::uuid from t where k = 'run') and not verifies),
  0,
  'Every line, hosts included, re-sums to exactly the entries it claims');

-- ═══════════════════════════════════════════════════════════════ verifying

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b8b80000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_host_payout_verify('b8b80000-0000-4000-8000-0000000000c1', 1)$$,
  '42501', 'Only people with full Finance access can do this.',
  'Hospitality staff cannot verify the details they declared');

select is(
  (select jsonb_build_object('masked', x ->> 'destination_masked', 'account', x -> 'account',
                             'verified', x -> 'verified')
     from jsonb_array_elements(public.rpc_host_payouts()) x
    where x ->> 'host_id' = 'b8b80000-0000-4000-8000-0000000000c1'),
  '{"masked": "•••• 5678", "account": null, "verified": false}'::jsonb,
  'and see the destination masked, never the number');

select set_config('request.jwt.claims',
  '{"sub":"b8b80000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  (select x -> 'account' ->> 'phoneNumber'
     from jsonb_array_elements(public.rpc_host_payouts()) x
    where x ->> 'host_id' = 'b8b80000-0000-4000-8000-0000000000c1'),
  '+254712345678',
  'Finance sees the number it is verifying');

select lives_ok(
  $$select public.rpc_host_payout_verify('b8b80000-0000-4000-8000-0000000000c1', 1)$$,
  'Finance verifies the host''s details');

insert into t (k, v) select 'rebuilt', public.rpc_settlement_build(
  (select v::timestamptz from t where k = 'from'), (select v::timestamptz from t where k = 'to'))
  ->> 'run_id';

reset role;

select is(
  (select party_label || ' · ' || state || ' · ' || rail || ' · ' || destination_masked || ' · ' || net_cents
     from public.fin_settlement_line
    where run_id = (select v::uuid from t where k = 'rebuilt')
      and party_id = 'b8b80000-0000-4000-8000-0000000000c1'),
  'Test Host Paid HP · ready · mpesa_b2c · •••• 5678 · 2000000',
  'Rebuilt, the run pays the host KES 20,000 to their verified M-PESA number');

do $$ begin perform public.fn_fin_build_party_owed(); end $$;

select ok(
  exists (select 1 from public.fin_settled_entry s
            join ledger.entry e on e.id = s.entry_id
           where s.run_id = (select v::uuid from t where k = 'rebuilt')
             and e.account_code = 'stay.host_share:b8b80000-0000-4000-8000-0000000000c1')
  and not exists (select 1 from public.fin_party_owed
                   where party_id = 'b8b80000-0000-4000-8000-0000000000c1'),
  'The run claims the stay share, so the owed list no longer counts it');

-- ═══════════════════════════════════════════════════════ declaring again

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b8b80000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select lives_ok(
  $$select public.rpc_host_payout_declare('b8b80000-0000-4000-8000-0000000000c1',
      '{"rail": "mpesa_till", "tillNumber": "5123456"}')$$,
  'Hospitality staff change where the host is paid');

select is(
  (select jsonb_build_object('version', (x ->> 'version')::int, 'verified', x -> 'verified')
     from jsonb_array_elements(public.rpc_host_payouts()) x
    where x ->> 'host_id' = 'b8b80000-0000-4000-8000-0000000000c1'),
  '{"version": 2, "verified": false}'::jsonb,
  'New details clear the verification, so Finance checks again');

reset role;

select is(
  (select rail from public.payout_rail where party = 'host_credits'),
  'mpesa_b2b_bank',
  'Settings says hosts are paid out, not credited against invoices');

select * from finish();
rollback;
