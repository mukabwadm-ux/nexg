-- Who is paid through Paystack and what waits for a second person
-- (20270329000100, rpc_finance_paystack_payees and _approvals): every
-- merchant's and host's sub-account, rider transfers, how each city's riders
-- are paid, and the four waiting lists with each decide function's own rule on
-- who may decide. A commission is listed only to those its own read allows.

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

delete from public.rider_payout_worker;

create temp table t (k text primary key, v jsonb) on commit drop;
grant select, insert on t to authenticated, anon;

create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
/* The element of one list with this id. */
create function pg_temp.one(p_doc text, p_list text, p_id text) returns jsonb language sql as $$
  select x from t, jsonb_array_elements(t.v -> p_list) x where t.k = p_doc and x ->> 'id' = p_id
$$;
/* "code:can_decide" for this file's sub-accounts in one list, by code. */
create function pg_temp.codes(p_doc text, p_list text) returns text language sql as $$
  select string_agg((x ->> 'code') || ':' || (x ->> 'can_decide'), ' ' order by x ->> 'code')
    from t, jsonb_array_elements(t.v -> p_list) x
   where t.k = p_doc and x ->> 'code' like 'ACCT\_ci248%'
$$;

set local session_replication_role = replica;
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
       now(), false, now(), now()
  from (values
    ('e2480000-0000-4000-8000-000000000001', 'finance248a@test.local'),
    ('e2480000-0000-4000-8000-000000000002', 'finance248b@test.local'),
    ('e2480000-0000-4000-8000-000000000003', 'ops248@test.local'),
    ('e2480000-0000-4000-8000-000000000004', 'partners248@test.local'),
    ('e2480000-0000-4000-8000-000000000005', 'guest248@example.test')) as u (id, email);
insert into public.staff_user (id, user_id, email, display_name) values
  ('e2480000-0000-4000-8000-0000000000b1', 'e2480000-0000-4000-8000-000000000001', 'finance248a@test.local', 'Finance 248 A'),
  ('e2480000-0000-4000-8000-0000000000b2', 'e2480000-0000-4000-8000-000000000002', 'finance248b@test.local', 'Finance 248 B'),
  ('e2480000-0000-4000-8000-0000000000b3', 'e2480000-0000-4000-8000-000000000003', 'ops248@test.local', 'Ops 248'),
  ('e2480000-0000-4000-8000-0000000000b4', 'e2480000-0000-4000-8000-000000000004', 'partners248@test.local', 'Partnerships 248');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select g.staff::uuid, r.id, null, g.staff::uuid
  from (values
    ('e2480000-0000-4000-8000-0000000000b1', 'finance'),
    ('e2480000-0000-4000-8000-0000000000b2', 'finance'),
    ('e2480000-0000-4000-8000-0000000000b3', 'ops_manager'),
    ('e2480000-0000-4000-8000-0000000000b4', 'partnerships')) as g (staff, role_key)
  join public.role r on r.key = g.role_key;

insert into public.city (id, slug, name, country, currency, timezone, status, sort)
values ('e2480000-0000-4000-8000-0000000000c1', 'psk-city-248', '[City 248]', 'Kenya', 'KES',
        'Africa/Nairobi', 'live', 999);
insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
                             contact_email, city_id, accepts_test_payments)
values
  ('e2480000-0000-4000-8000-0000000000d1', '[Shop 248 A Ltd]', '[Shop 248 A]', 'restaurant', '[Contact]',
   '+254700024801', 'shop248a@example.test', 'e2480000-0000-4000-8000-0000000000c1', true),
  ('e2480000-0000-4000-8000-0000000000d2', '[Shop 248 B Ltd]', '[Shop 248 B]', 'restaurant', '[Contact]',
   '+254700024802', 'shop248b@example.test', 'e2480000-0000-4000-8000-0000000000c1', false);
insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('e2480000-0000-4000-8000-0000000000e1', 'multi_unit', '[Host 248]', '+254700024803',
        'e2480000-0000-4000-8000-0000000000c1', 'live', now(), now());

-- Two Ops managers for one city each: Nairobi, and this file's city.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
       now(), false, now(), now()
  from (values
    ('e2480000-0000-4000-8000-000000000006', 'opsfar248@test.local'),
    ('e2480000-0000-4000-8000-000000000007', 'opsnear248@test.local')) as u (id, email);
insert into public.staff_user (id, user_id, email, display_name) values
  ('e2480000-0000-4000-8000-0000000000b6', 'e2480000-0000-4000-8000-000000000006', 'opsfar248@test.local', 'Ops 248 Nairobi'),
  ('e2480000-0000-4000-8000-0000000000b7', 'e2480000-0000-4000-8000-000000000007', 'opsnear248@test.local', 'Ops 248 City');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select g.staff::uuid, r.id, g.city_id, g.staff::uuid
  from (values
    ('e2480000-0000-4000-8000-0000000000b6', (select id from public.city where slug = 'nairobi')),
    ('e2480000-0000-4000-8000-0000000000b7', 'e2480000-0000-4000-8000-0000000000c1'::uuid)) as g (staff, city_id)
  join public.role r on r.key = 'ops_manager';

-- 1: waiting, asked by A. 2: in use. 3: waiting, requester no longer on record.
insert into public.merchant_paystack_subaccount
  (id, merchant_id, is_test, subaccount_code, schedule, paystack_details, status, note,
   requested_by, decided_by, decided_at)
values
  ('e2481000-0000-4000-8000-000000000001', 'e2480000-0000-4000-8000-0000000000d2', false, 'ACCT_ci2480001',
   'weekly', '{"business_name": "[Shop 248 B]", "account_last4": "4321", "other": "left out"}', 'pending',
   'Made in the dashboard', 'e2480000-0000-4000-8000-0000000000b1', null, null),
  ('e2481000-0000-4000-8000-000000000002', 'e2480000-0000-4000-8000-0000000000d1', true, 'ACCT_ci2480002',
   'auto', '{}', 'active', null, 'e2480000-0000-4000-8000-0000000000b1',
   'e2480000-0000-4000-8000-0000000000b2', now()),
  ('e2481000-0000-4000-8000-000000000003', 'e2480000-0000-4000-8000-0000000000d1', false, 'ACCT_ci2480003',
   'manual', '{}', 'pending', null, null, null, null);
-- 4: waiting, asked by B. 5: paused.
insert into public.host_paystack_subaccount
  (id, host_id, is_test, subaccount_code, schedule, paystack_details, status,
   requested_by, decided_by, decided_at)
values
  ('e2481000-0000-4000-8000-000000000004', 'e2480000-0000-4000-8000-0000000000e1', false, 'ACCT_ci2480004',
   'monthly', '{}', 'pending', 'e2480000-0000-4000-8000-0000000000b2', null, null),
  ('e2481000-0000-4000-8000-000000000005', 'e2480000-0000-4000-8000-0000000000e1', true, 'ACCT_ci2480005',
   'auto', '{}', 'paused', 'e2480000-0000-4000-8000-0000000000b2',
   'e2480000-0000-4000-8000-0000000000b1', now());

insert into public.merchant_commission_term
  (id, merchant_id, own_delivery_pct, nexg_delivery_pct, starts_on, reason, terms_ref, status,
   requested_by, decided_at)
values
  ('e2482000-0000-4000-8000-000000000001', 'e2480000-0000-4000-8000-0000000000d2', 12, 15, '2031-01-01',
   'Agreed for a year', 'Email 248', 'pending', 'e2480000-0000-4000-8000-0000000000b1', null),
  ('e2482000-0000-4000-8000-000000000002', 'e2480000-0000-4000-8000-0000000000d2', 18, 20, '2030-01-01',
   'Last year''s', null, 'approved', 'e2480000-0000-4000-8000-0000000000b1', now());
insert into public.host_commission_term
  (id, host_id, pct, starts_on, reason, status, requested_by)
values
  ('e2482000-0000-4000-8000-000000000003', 'e2480000-0000-4000-8000-0000000000e1', 10, '2031-01-01',
   'Ten percent agreed', 'pending', 'e2480000-0000-4000-8000-0000000000b2');

-- One test rider and two real ones; one suspended and one who has left are not counted.
insert into public.rider (id, first_name, last_name, phone, city_id, vehicle, plate_no, status,
                          activated_at, accepts_test_payouts, offboarded_at)
select r.id::uuid, '[' || r.first || ']', '[Rider ' || r.last || ']', r.phone,
       'e2480000-0000-4000-8000-0000000000c1', 'motorbike', r.plate, r.status::public.rider_status,
       case when r.status = 'active' then now() end, r.test, case when r.left_us then now() end
  from (values
    ('e2483000-0000-4000-8000-000000000001', 'Test', 'One', '+254700024811', 'PLATE248A', 'active', true, false),
    ('e2483000-0000-4000-8000-000000000002', 'Real', 'Two', '+254700024812', 'PLATE248B', 'active', false, false),
    ('e2483000-0000-4000-8000-000000000003', 'Real', 'Three', '+254700024813', 'PLATE248C', 'active', false, false),
    ('e2483000-0000-4000-8000-000000000004', 'Real', 'Four', '+254700024814', 'PLATE248D', 'suspended', false, false),
    ('e2483000-0000-4000-8000-000000000005', 'Real', 'Five', '+254700024815', 'PLATE248E', 'active', false, true))
    as r (id, first, last, phone, plate, status, test, left_us);
insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, activated_at, reason)
values
  ('payouts.rider.mode', 'city', 'e2480000-0000-4000-8000-0000000000c1', '"daily"', 'active',
   now() - interval '1 minute', now() - interval '1 minute', '[test 250]'),
  ('payouts.rider.automatic_from', 'city', 'e2480000-0000-4000-8000-0000000000c1', '"2020-01-01"', 'active',
   now() - interval '1 minute', now() - interval '1 minute', '[test 250]');
insert into public.paystack_transfer
  (id, reference, kind, party_type, party_id, source_id, amount_cents, is_test, destination, state,
   fee_cents, fee_paid_by)
values
  ('e2484000-0000-4000-8000-000000000001', 'NXT-ci248t1abcd', 'rider_payout', 'rider',
   'e2483000-0000-4000-8000-000000000002', gen_random_uuid(), 90000, false, '+254700024812', 'pending',
   0, 'nexg');
set local session_replication_role = origin;

-- ──────────────────────────────────────────────────── who may

select ok(
  not has_function_privilege('anon', 'public.rpc_finance_paystack_payees()', 'execute')
  and not has_function_privilege('anon', 'public.rpc_finance_paystack_approvals()', 'execute'),
  'The anonymous key reads neither.');

set local role authenticated;
select pg_temp.as_user('e2480000-0000-4000-8000-000000000005');
select throws_ok($$select public.rpc_finance_paystack_payees()$$,
  '42501', 'Only people who reach Finance can see this.', 'A customer cannot see who is paid.');
select pg_temp.as_user('e2480000-0000-4000-8000-000000000004');
select throws_ok($$select public.rpc_finance_paystack_approvals()$$,
  '42501', null, 'Nor can staff without Finance see what waits.');

select pg_temp.as_user('e2480000-0000-4000-8000-000000000001');
insert into t select 'pa', public.rpc_finance_paystack_payees();
insert into t select 'aa', public.rpc_finance_paystack_approvals();
select pg_temp.as_user('e2480000-0000-4000-8000-000000000002');
insert into t select 'pb', public.rpc_finance_paystack_payees();
insert into t select 'ab', public.rpc_finance_paystack_approvals();
select pg_temp.as_user('e2480000-0000-4000-8000-000000000003');
insert into t select 'po', public.rpc_finance_paystack_payees();
insert into t select 'ao', public.rpc_finance_paystack_approvals();
select pg_temp.as_user('e2480000-0000-4000-8000-000000000006');
insert into t select 'afar', public.rpc_finance_paystack_approvals();
select throws_ok(
  $$select public.rpc_merchant_commission_read('e2480000-0000-4000-8000-0000000000d2')$$,
  '42501', 'Not your merchant.', 'Another city''s Ops manager cannot read this merchant''s commission.');
select throws_ok(
  $$select public.rpc_host_commission_read('e2480000-0000-4000-8000-0000000000e1')$$,
  '42501', 'Not your host account.', 'Nor this host''s.');
select pg_temp.as_user('e2480000-0000-4000-8000-000000000007');
insert into t select 'anear', public.rpc_finance_paystack_approvals();
reset role;

-- ──────────────────────────────────────────────────── who is paid

select is(
  pg_temp.one('pb', 'merchants', 'e2481000-0000-4000-8000-000000000001') - 'requested_at' - 'decided_at',
  '{"id": "e2481000-0000-4000-8000-000000000001", "party_id": "e2480000-0000-4000-8000-0000000000d2",
    "name": "[Shop 248 B]", "test": false, "code": "ACCT_ci2480001", "schedule": "weekly",
    "status": "pending", "requested_by": "Finance 248 A", "decided_by": null, "can_decide": true}'::jsonb,
  'A waiting merchant sub-account, which a second Finance person may decide.');
select is(pg_temp.codes('pa', 'merchants'),
  'ACCT_ci2480001:false ACCT_ci2480002:false ACCT_ci2480003:false',
  'The requester decides none of these, and nobody decides one in use.');
select is(pg_temp.codes('pb', 'merchants'),
  'ACCT_ci2480001:true ACCT_ci2480002:false ACCT_ci2480003:false',
  'Nor one whose requester is not on record.');
select is(
  (select (x ->> 'status') || ' ' || (x ->> 'test') || ' ' || (x ->> 'decided_by')
     from pg_temp.one('pa', 'hosts', 'e2481000-0000-4000-8000-000000000005') x),
  'paused true Finance 248 A', 'A host''s paused test sub-account, and who decided it.');
select is(pg_temp.codes('pa', 'hosts') || ' | ' || pg_temp.codes('pb', 'hosts'),
  'ACCT_ci2480004:true ACCT_ci2480005:false | ACCT_ci2480004:false ACCT_ci2480005:false',
  'A host sub-account follows the same two-person rule.');
select is(pg_temp.codes('po', 'merchants') || ' | ' || pg_temp.codes('po', 'hosts'),
  'ACCT_ci2480001:false ACCT_ci2480002:false ACCT_ci2480003:false | ACCT_ci2480004:false ACCT_ci2480005:false',
  'View-only Finance sees every sub-account and decides none.');
select is(
  pg_temp.one('pa', 'rider_transfers', 'e2484000-0000-4000-8000-000000000001') - 'created_at',
  '{"id": "e2484000-0000-4000-8000-000000000001", "reference": "NXT-ci248t1abcd", "kind": "rider_payout",
    "rider_id": "e2483000-0000-4000-8000-000000000002", "rider_name": "[Real] [Rider Two]",
    "amount_cents": 90000, "fee_cents": 0, "fee_paid_by": "nexg", "test": false, "state": "pending",
    "failure_reason": null, "completed_at": null}'::jsonb,
  'A rider transfer, by the rider''s name.');
select is(
  (select x from t, jsonb_array_elements(t.v -> 'rider_cities') x
    where t.k = 'pa' and x ->> 'city_id' = 'e2480000-0000-4000-8000-0000000000c1'),
  '{"city_id": "e2480000-0000-4000-8000-0000000000c1", "city": "[City 248]", "rule_mode": "daily",
    "automatic_from": "2020-01-01", "riders": 3, "test_riders": 1,
    "modes": {"run": 2, "immediate": 0, "daily": 1, "weekly": 0, "monthly": 0}}'::jsonb,
  'In a daily city with real money off, only the test rider is paid daily.');
select is(
  (select jsonb_build_object('live', v -> 'rider_automatic_live', 'seen', v -> 'live_worker_seen_at')
     from t where k = 'pa'),
  '{"live": false, "seen": null}'::jsonb, 'Real automatic payouts are off and no live worker has run.');

-- ──────────────────────────────────────────────────── what waits

select is(pg_temp.codes('ab', 'merchant_subaccounts'), 'ACCT_ci2480001:true ACCT_ci2480003:false',
  'Only waiting merchant sub-accounts, with who may decide them.');
select is(
  pg_temp.one('ab', 'merchant_subaccounts', 'e2481000-0000-4000-8000-000000000001') - 'requested_at',
  '{"id": "e2481000-0000-4000-8000-000000000001", "merchant_id": "e2480000-0000-4000-8000-0000000000d2",
    "name": "[Shop 248 B]", "test": false, "code": "ACCT_ci2480001", "schedule": "weekly",
    "details": {"business_name": "[Shop 248 B]", "settlement_bank": null, "account_last4": "4321",
                "paystack_schedule": null, "active": null},
    "note": "Made in the dashboard", "requested_by": "Finance 248 A", "can_decide": true}'::jsonb,
  'With what Paystack said it pays out to, and nothing else from the record.');
select is(pg_temp.codes('aa', 'merchant_subaccounts'), 'ACCT_ci2480001:false ACCT_ci2480003:false',
  'The requester may decide neither.');
select is(
  pg_temp.codes('aa', 'host_subaccounts') || ' | ' || pg_temp.codes('ab', 'host_subaccounts'),
  'ACCT_ci2480004:true | ACCT_ci2480004:false', 'Only the waiting host sub-account.');
select is(
  pg_temp.one('ab', 'merchant_commissions', 'e2482000-0000-4000-8000-000000000001') - 'requested_at',
  '{"id": "e2482000-0000-4000-8000-000000000001", "merchant_id": "e2480000-0000-4000-8000-0000000000d2",
    "name": "[Shop 248 B]", "own_delivery_pct": 12, "nexg_delivery_pct": 15, "starts_on": "2031-01-01",
    "ends_on": null, "reason": "Agreed for a year", "terms_ref": "Email 248",
    "requested_by": "Finance 248 A", "can_decide": true}'::jsonb,
  'A waiting merchant commission.');
select is(
  (pg_temp.one('aa', 'merchant_commissions', 'e2482000-0000-4000-8000-000000000001') ->> 'can_decide')
  || ' ' ||
  (pg_temp.one('ao', 'merchant_commissions', 'e2482000-0000-4000-8000-000000000001') ->> 'can_decide'),
  'false true', 'Not its requester; an Ops manager may.');
select is(
  (select count(*)::int from t, jsonb_array_elements(t.v -> 'merchant_commissions') x
    where t.k = 'ab' and x ->> 'merchant_id' = 'e2480000-0000-4000-8000-0000000000d2'),
  1, 'An approved commission is not waiting.');
select is(
  pg_temp.one('aa', 'host_commissions', 'e2482000-0000-4000-8000-000000000003') - 'requested_at',
  '{"id": "e2482000-0000-4000-8000-000000000003", "host_id": "e2480000-0000-4000-8000-0000000000e1",
    "name": "[Host 248]", "pct": 10, "starts_on": "2031-01-01", "ends_on": null,
    "reason": "Ten percent agreed", "terms_ref": null, "requested_by": "Finance 248 B",
    "can_decide": true}'::jsonb,
  'A waiting host commission.');
select is(
  (pg_temp.one('ab', 'host_commissions', 'e2482000-0000-4000-8000-000000000003') ->> 'can_decide')
  || ' ' ||
  (pg_temp.one('ao', 'host_commissions', 'e2482000-0000-4000-8000-000000000003') ->> 'can_decide'),
  'false false', 'Only full Finance who did not ask may decide it.');
select is(
  pg_temp.codes('ao', 'merchant_subaccounts') || ' | ' || pg_temp.codes('ao', 'host_subaccounts'),
  'ACCT_ci2480001:false ACCT_ci2480003:false | ACCT_ci2480004:false',
  'An Ops manager switches on no sub-account.');

select is(
  (select count(*)::int
     from t, jsonb_array_elements((t.v -> 'merchant_commissions') || (t.v -> 'host_commissions')) x
    where t.k = 'afar' and x ->> 'id' like 'e2482000-%')
  || ' ' || pg_temp.codes('afar', 'merchant_subaccounts'),
  '0 ACCT_ci2480001:false ACCT_ci2480003:false',
  'So this list shows them neither rate; sub-accounts stay listed for everyone who reaches Finance.');
select is(
  (select string_agg(x ->> 'id', ' ' order by x ->> 'id')
     from t, jsonb_array_elements((t.v -> 'merchant_commissions') || (t.v -> 'host_commissions')) x
    where t.k = 'anear' and x ->> 'id' like 'e2482000-%'),
  'e2482000-0000-4000-8000-000000000001 e2482000-0000-4000-8000-000000000003',
  'The city''s own Ops manager sees both rates.');

set local role authenticated;
select pg_temp.as_user('e2480000-0000-4000-8000-000000000002');
select public.rpc_merchant_subaccount_decide('e2481000-0000-4000-8000-000000000001', false, 'Wrong code');
insert into t select 'after', public.rpc_finance_paystack_approvals();
reset role;
select is(pg_temp.codes('after', 'merchant_subaccounts'), 'ACCT_ci2480003:false',
  'Once the decide function has taken it, it no longer waits.');

select * from finish();
rollback;
