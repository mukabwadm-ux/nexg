-- Hosts enter their own payout details.
--
-- The host's owner declares where they are paid; any member sees it masked,
-- never the full number or the KRA PIN; Finance verifies it as before;
-- declaring again clears the verification, holds waiting lines in runs that
-- have no payment files yet, and tells Finance about runs whose files are
-- already made without changing them; a staff member who owns a host cannot
-- verify their own declaration.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

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

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('d2130000-0000-4000-8000-0000000000a1'::uuid, 'owner.hp213@test.local'),
  ('d2130000-0000-4000-8000-0000000000a2'::uuid, 'manager.hp213@test.local'),
  ('d2130000-0000-4000-8000-0000000000a3'::uuid, 'stranger.hp213@test.local'),
  ('d2130000-0000-4000-8000-0000000000a4'::uuid, 'fin.hp213@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('d2130000-0000-4000-8000-0000000000b4', 'd2130000-0000-4000-8000-0000000000a4',
   'fin.hp213@test.local', 'Finance HP213');

/* Finance grants need a second approver. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'd2130000-0000-4000-8000-0000000000b4', r.id, null,
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from public.role r where r.key = 'finance';

insert into public.host (id, display_name, phone, city_id, status, verified_at, went_live_at)
select 'd2130000-0000-4000-8000-0000000000c1', 'Test Host HP213', '+254700213001', c.id,
       'live'::public.host_status, now(), now()
from public.city c where c.slug = 'nairobi';

insert into public.host_user (host_id, user_id, role, units) values
  ('d2130000-0000-4000-8000-0000000000c1', 'd2130000-0000-4000-8000-0000000000a1', 'owner', null),
  ('d2130000-0000-4000-8000-0000000000c1', 'd2130000-0000-4000-8000-0000000000a2', 'manager', null);

-- ══════════════════════════════════════════════════════════════════ wiring

select ok(
  not has_function_privilege('anon', 'public.rpc_host_payout_declare_mine(uuid, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_host_payout_mine(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.rpc_host_payout_declare_mine(uuid, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.rpc_host_payout_mine(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.tg_host_payout_one_declarer()', 'execute'),
  'Hosts reach their payout details only through the two functions, never anonymously');

-- ══════════════════════════════════════════════════════════════ who may

set local role authenticated;

select pg_temp.as_user('d2130000-0000-4000-8000-0000000000a3');
select is(pg_temp.hint_of($$select public.rpc_host_payout_declare_mine('d2130000-0000-4000-8000-0000000000c1',
  '{"rail": "mpesa_phone", "phoneNumber": "0712 345 678", "accountName": "Stranger"}')$$),
  '42501', 'A stranger cannot say where a host is paid');
select is(pg_temp.hint_of($$select public.rpc_host_payout_mine('d2130000-0000-4000-8000-0000000000c1')$$),
  '42501', 'and cannot see where a host is paid');

select pg_temp.as_user('d2130000-0000-4000-8000-0000000000a2');
select is(pg_temp.hint_of($$select public.rpc_host_payout_declare_mine('d2130000-0000-4000-8000-0000000000c1',
  '{"rail": "mpesa_phone", "phoneNumber": "0712 345 678", "accountName": "Manager"}')$$),
  '42501', 'A manager cannot change where the host is paid; only the owner can');

select pg_temp.as_user('d2130000-0000-4000-8000-0000000000a1');
select is(pg_temp.hint_of($$select public.rpc_host_payout_declare_mine('d2130000-0000-4000-8000-0000000000c1',
  '{"rail": "bank", "bankName": "Equity Bank", "accountName": "Test Host", "accountNumber": "0123456789012", "kraPin": "A12345B"}')$$),
  '22023', 'A KRA PIN in the wrong shape is refused');

-- ═══════════════════════════════════════════════════════ the owner declares

insert into t select 'bank', public.rpc_host_payout_declare_mine('d2130000-0000-4000-8000-0000000000c1',
  '{"rail": "bank", "bankName": "Equity Bank", "accountName": "Test Host", "accountNumber": "0123456789012", "kraPin": "a123456789b"}')::text;

select is(
  (select jsonb_build_object(
     'ok', r -> 'ok', 'rail', r -> 'payout' -> 'rail',
     'masked', r -> 'payout' -> 'destination_masked',
     'account_name', r -> 'payout' -> 'account_name', 'bank_name', r -> 'payout' -> 'bank_name',
     'kra_pin_set', r -> 'payout' -> 'kra_pin_set', 'version', r -> 'payout' -> 'version',
     'verified', r -> 'payout' -> 'verified')
     from (select v::jsonb as r from t where k = 'bank') x),
  '{"ok": true, "rail": "bank", "masked": "Equity Bank •••• 9012", "account_name": "Test Host",
    "bank_name": "Equity Bank", "kra_pin_set": true, "version": 1, "verified": false}'::jsonb,
  'The owner declares a bank account and gets it back masked, not yet checked');

select ok(
  (select v !~* '0123456789012|A123456789B' from t where k = 'bank'),
  'The answer never holds the full account number or the KRA PIN');

insert into t select 'phone', public.rpc_host_payout_declare_mine('d2130000-0000-4000-8000-0000000000c1',
  '{"rail": "mpesa_phone", "phoneNumber": "0712 345 678", "accountName": "Test Host"}')::text;

select is(
  (select jsonb_build_object(
     'masked', r -> 'payout' -> 'destination_masked', 'version', r -> 'payout' -> 'version',
     'kra_pin_set', r -> 'payout' -> 'kra_pin_set', 'verified', r -> 'payout' -> 'verified')
     from (select v::jsonb as r from t where k = 'phone') x),
  '{"masked": "•••• 5678", "version": 2, "kra_pin_set": true, "verified": false}'::jsonb,
  'Changing to an M-PESA number moves the version on and keeps the KRA PIN when it is left out');

select ok(
  (public.rpc_host_payout_mine('d2130000-0000-4000-8000-0000000000c1')::text
     || (select v from t where k = 'phone')) !~* '712345678|0123456789012|A123456789B',
  'Neither the read nor the answer holds the full phone number, account number or KRA PIN');

reset role;

select is(
  (select jsonb_build_object('declared_by', declared_by, 'declared_by_user', declared_by_user,
                             'kra_pin', kra_pin)
     from public.host_payout where host_id = 'd2130000-0000-4000-8000-0000000000c1'),
  '{"declared_by": null, "declared_by_user": "d2130000-0000-4000-8000-0000000000a1",
    "kra_pin": "A123456789B"}'::jsonb,
  'The row names the host''s sign-in as the declarer and keeps the PIN in capitals');

-- ═══════════════════════════════════════════════════════ Finance verifies

set local role authenticated;
select pg_temp.as_user('d2130000-0000-4000-8000-0000000000a4');

select lives_ok(
  $$select public.rpc_host_payout_verify('d2130000-0000-4000-8000-0000000000c1', 2)$$,
  'Finance verifies the details the host declared');

select pg_temp.as_user('d2130000-0000-4000-8000-0000000000a2');

select is(
  (select jsonb_build_object('verified', r -> 'payout' -> 'verified', 'note', r -> 'payout' -> 'status_note')
     from (select public.rpc_host_payout_mine('d2130000-0000-4000-8000-0000000000c1') as r) x),
  '{"verified": true, "note": "NexG has checked these details. Payouts go here."}'::jsonb,
  'Any member of the host then sees the details are checked');

-- ═══════════════════════════════════════════════════ declaring again

reset role;

/* Built after Finance verified: a draft run with one line waiting, one
   cash_netted and one already paid; and a run whose payment files are
   already made, with one line waiting. Inserted at files_generated directly:
   the one-door trigger guards updates only. */
insert into public.fin_settlement_run (id, reference, period_start, period_end, cutoff_at, pay_date, state)
values ('d2130000-0000-4000-8000-0000000000e1', 'RUN-T213',
        '2001-01-01 00:00+03', '2001-01-08 00:00+03', '2001-01-07 00:00+03', '2001-01-13', 'draft'),
       ('d2130000-0000-4000-8000-0000000000e2', 'RUN-T213F',
        '2000-12-25 00:00+03', '2001-01-01 00:00+03', '2000-12-31 00:00+03', '2001-01-06', 'files_generated');
insert into public.fin_settlement_line
  (run_id, party_type, party_id, party_label, rail, destination_masked, gross_cents, net_cents, state)
values
  ('d2130000-0000-4000-8000-0000000000e1', 'host', 'd2130000-0000-4000-8000-0000000000c1',
   'Test Host HP213', 'mpesa_b2c', '•••• 5678', 100000, 100000, 'ready'),
  ('d2130000-0000-4000-8000-0000000000e1', 'host', 'd2130000-0000-4000-8000-0000000000c1',
   'Test Host HP213', 'mpesa_b2c', '•••• 5678', 50000, 50000, 'cash_netted'),
  ('d2130000-0000-4000-8000-0000000000e1', 'host', 'd2130000-0000-4000-8000-0000000000c1',
   'Test Host HP213', 'mpesa_b2c', '•••• 5678', 200000, 200000, 'paid'),
  ('d2130000-0000-4000-8000-0000000000e2', 'host', 'd2130000-0000-4000-8000-0000000000c1',
   'Test Host HP213', 'mpesa_b2c', '•••• 5678', 300000, 300000, 'ready');

set local role authenticated;
select pg_temp.as_user('d2130000-0000-4000-8000-0000000000a1');

insert into t select 'till', public.rpc_host_payout_declare_mine('d2130000-0000-4000-8000-0000000000c1',
  '{"rail": "mpesa_till", "tillNumber": "5123456"}')::text;

select ok(
  (select r -> 'payout' ->> 'verified' = 'false'
          and r ->> 'note' like '% 1 payout not yet sent will wait until NexG has checked your new details.%'
          and r ->> 'note' like '%A payment to your old details was already being prepared, so it still goes there.%'
          and r -> 'payout' ->> 'status_note' like 'NexG is checking these details.%'
          and r -> 'payout' ->> 'status_note' like '%paid in NexG''s weekly payout run.'
     from (select v::jsonb as r from t where k = 'till') x),
  'Declaring again clears the check, says which payouts wait and which still go to the old details, and that a till is paid in the weekly run');

reset role;

select is(
  (select string_agg(r.reference || ':' || l.state::text || ':' || l.net_cents, ',' order by r.reference, l.net_cents)
     from public.fin_settlement_line l join public.fin_settlement_run r on r.id = l.run_id
    where l.run_id in ('d2130000-0000-4000-8000-0000000000e1', 'd2130000-0000-4000-8000-0000000000e2')),
  'RUN-T213:cash_netted:50000,RUN-T213:held_kyc:100000,RUN-T213:paid:200000,RUN-T213F:ready:300000',
  'Before payment files, the waiting line is held and cash_netted and paid lines are left alone; once files are made, nothing changes');

select ok(
  (select count(*) = 1
          and bool_and(severity = 'high')
          and bool_and(after -> 'runs' @> '[{"reference": "RUN-T213F", "run_state": "files_generated"}]'::jsonb)
          and bool_and(not (after -> 'runs' @> '[{"reference": "RUN-T213"}]'::jsonb))
          and bool_and(after::text !~* '5123456')
     from audit.audit_event
    where action = 'host.payout_changed_during_run'
      and target_id = 'd2130000-0000-4000-8000-0000000000c1'),
  'Finance is told, at high severity, about the run whose payment file was already made, and only that one');

set local role authenticated;
select pg_temp.as_user('d2130000-0000-4000-8000-0000000000a1');

select is(
  (public.rpc_host_payout_declare_mine('d2130000-0000-4000-8000-0000000000c1',
     '{"rail": "mpesa_till", "tillNumber": "5123456", "kraPin": null}') -> 'payout' -> 'kra_pin_set'),
  'false'::jsonb,
  'An explicit empty KRA PIN clears it');

reset role;

-- ═══════════════════════════════════════ a staff member who owns a host

/* The Finance user also owns a second host. */
insert into public.host (id, display_name, phone, city_id, status, verified_at, went_live_at)
select 'd2130000-0000-4000-8000-0000000000c2', 'Staff Host HP213', '+254700213002', c.id,
       'live'::public.host_status, now(), now()
from public.city c where c.slug = 'nairobi';
insert into public.host_user (host_id, user_id, role, units) values
  ('d2130000-0000-4000-8000-0000000000c2', 'd2130000-0000-4000-8000-0000000000a4', 'owner', null);

set local role authenticated;
select pg_temp.as_user('d2130000-0000-4000-8000-0000000000a4');

select lives_ok(
  $$select public.rpc_host_payout_declare_mine('d2130000-0000-4000-8000-0000000000c2',
      '{"rail": "mpesa_phone", "phoneNumber": "0722 000 213", "accountName": "Staff Host"}')$$,
  'A staff member who owns a host declares its payout details as its owner');

select is(pg_temp.hint_of($$select public.rpc_host_payout_verify('d2130000-0000-4000-8000-0000000000c2', 1)$$),
  '42501', 'and cannot then verify them alone, as with a staff declaration');

reset role;

select is(
  (select jsonb_build_object('declared_by', declared_by, 'declared_by_user', declared_by_user,
                             'verified', verified_version is not null)
     from public.host_payout where host_id = 'd2130000-0000-4000-8000-0000000000c2'),
  '{"declared_by": "d2130000-0000-4000-8000-0000000000b4",
    "declared_by_user": "d2130000-0000-4000-8000-0000000000a4", "verified": false}'::jsonb,
  'The row names both the staff member and their sign-in, so the self-verify check sees them');

-- ═══════════════════════════════════════════════════════════════ the trail

select ok(
  (select count(*) = 4
          and bool_and(actor_type = 'host_user')
          and bool_and((coalesce(before::text, '') || coalesce(after::text, ''))
                       !~* '0123456789012|712345678|5123456|A123456789B')
     from audit.audit_event
    where action = 'host.payout_declared_by_host'
      and target_id = 'd2130000-0000-4000-8000-0000000000c1'),
  'Every host declaration is logged as the host, with the destination masked and no PIN');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where finding ~ '(host_payout_declare_mine|host_payout_mine|host_payout_one_declarer|public\.host_payout\M)'),
  0, 'The wiring check finds nothing wrong with the host''s payout functions');

select * from finish();
rollback;
