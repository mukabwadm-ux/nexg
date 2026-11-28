-- Commission agreed with one merchant (20270306000100): two optional rates
-- that override the preset between two dates, asked for by one member of
-- staff and approved by another, audited with the rate before and after;
-- pricing and the agreement read the term first; history is never
-- recomputed; the merchant sees its own approved terms only.

begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;
create function pg_temp.today() returns date language sql as $f$
  select (now() at time zone 'Africa/Nairobi')::date
$f$;
create function pg_temp.rate(p_merchant text, p_days integer default 0) returns numeric language sql as $f$
  select (public.fn_merchant_commission(p_merchant::uuid, now() + make_interval(days => p_days)) ->> 'pct')::numeric
$f$;
create function pg_temp.price(p_merchant text) returns jsonb language sql as $f$
  select public.fn_price_order(m.city_id, m.category::text, 100000, 1::smallint, now(), m.id)
  from public.merchant m where m.id = p_merchant::uuid
$f$;
create function pg_temp.term(p_merchant text, p_status text) returns uuid language sql security definer as $f$
  select id from public.merchant_commission_term where merchant_id = p_merchant::uuid and status = p_status
$f$;
create function pg_temp.approval(p_merchant text) returns uuid language sql security definer as $f$
  select id from public.approval_request where target_id = p_merchant::uuid and status = 'pending'
$f$;
create function pg_temp.pending(p_merchant text) returns uuid language sql security definer as $f$
  select id from public.merchant_commission_term where merchant_id = p_merchant::uuid and status = 'pending'
$f$;

-- ------------------------------------------------------------------ fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), now(), now()
from (values
  ('a1960000-0000-4000-8000-0000000000a1'::uuid, 'ops196@test.local'),
  ('a1960000-0000-4000-8000-0000000000a2'::uuid, 'finance196@test.local'),
  ('a1960000-0000-4000-8000-0000000000a3'::uuid, 'ops2.196@test.local'),
  ('a1960000-0000-4000-8000-0000000000a4'::uuid, 'owner196@test.local'),
  ('a1960000-0000-4000-8000-0000000000a5'::uuid, 'stranger196@test.local'),
  ('a1960000-0000-4000-8000-0000000000a6'::uuid, 'opsmanager196@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('a1960000-0000-4000-8000-0000000000b1', 'a1960000-0000-4000-8000-0000000000a1', 'ops196@test.local', 'Ops 196'),
  ('a1960000-0000-4000-8000-0000000000b2', 'a1960000-0000-4000-8000-0000000000a2', 'finance196@test.local', 'Finance 196'),
  ('a1960000-0000-4000-8000-0000000000b3', 'a1960000-0000-4000-8000-0000000000a3', 'ops2.196@test.local', 'Ops Two 196'),
  ('a1960000-0000-4000-8000-0000000000b6', 'a1960000-0000-4000-8000-0000000000a6', 'opsmanager196@test.local', 'Ops Manager 196');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select x.staff, r.id, null, '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from (values
  ('a1960000-0000-4000-8000-0000000000b1'::uuid, 'merchant_ops'),
  ('a1960000-0000-4000-8000-0000000000b2'::uuid, 'finance'),
  ('a1960000-0000-4000-8000-0000000000b3'::uuid, 'merchant_ops'),
  ('a1960000-0000-4000-8000-0000000000b6'::uuid, 'ops_manager')
) as x (staff, role)
join public.role r on r.key = x.role;

/* A kitchen NexG riders deliver for, a salon with its own riders, and a shop
   with an old undated negotiated rate. */
insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status, went_live_at, has_own_riders, commission_pct)
select x.id, x.trading || ' Limited', x.trading, x.category::public.merchant_category, 'Owner',
  x.phone, x.email, (select id from public.city where slug = 'nairobi'), 'live', now(), x.own, x.pct
from (values
  ('a1960000-0000-4000-8000-0000000000c1'::uuid, 'Kitchen 196', 'restaurants_food',
   '+254712196001', 'kitchen196@shop.example', false, null::numeric),
  ('a1960000-0000-4000-8000-0000000000c2'::uuid, 'Salon 196', 'beauty',
   '+254712196002', 'salon196@shop.example', true, null),
  ('a1960000-0000-4000-8000-0000000000c3'::uuid, 'Shop 196', 'groceries_essentials',
   '+254712196003', 'shop196@shop.example', false, 10)
) as x (id, trading, category, phone, email, own, pct);

insert into public.merchant_user (merchant_id, user_id, role) values
  ('a1960000-0000-4000-8000-0000000000c1', 'a1960000-0000-4000-8000-0000000000a4', 'owner');

-- ------------------------------------------------------------------ the preset

select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c1'), 28::numeric,
  'with no term, a merchant NexG riders deliver for is charged the NexG-delivery preset');
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c2'), 15::numeric,
  'with no term, a merchant with its own riders is charged its category rate (Beauty, 15% since 20270345000100)');
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c3'), 10::numeric,
  'an old undated negotiated rate still applies when the merchant has no term');
select is(public.fn_merchant_commission('a1960000-0000-4000-8000-0000000000c3') ->> 'basis', 'negotiated',
  'and says it is negotiated');

-- ------------------------------------------------------------------ asking

set local role authenticated;
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a1');

select throws_ok(
  $$select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
      12, 20, pg_temp.today() - 1, null, 'Backdated', null)$$,
  '22023', null, 'a term cannot start before today');
select throws_ok(
  $$select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
      12, 20, pg_temp.today() + 5, pg_temp.today() + 4, 'Ends first', null)$$,
  '22023', null, 'the end cannot be before the start');
select throws_ok(
  $$select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
      101, 20, pg_temp.today(), null, 'Too much', null)$$,
  '22023', null, 'a rate over 100% is refused');
select throws_ok(
  $$select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
      9.555, 20, pg_temp.today(), null, 'Too precise', null)$$,
  '22023', null, 'a rate with more than two decimals is refused');
select throws_ok(
  $$select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
      9.5, 20, pg_temp.today(), null, '   ', null)$$,
  '22023', null, 'a request needs a reason');

select is(
  public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
    9.5, 20, pg_temp.today(), null, 'Agreed at the 20 Nov meeting', 'NXG-AGR-196') #>> '{terms,0,status}',
  'pending', 'merchant ops asks for 9.5% / 20% from today; it waits');

select throws_ok(
  $$select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
      8, 18, pg_temp.today(), null, 'Another', null)$$,
  '23505', null, 'only one request waits at a time');

reset role;
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c1'), 28::numeric,
  'a waiting request changes nothing');
select is((select count(*)::int from audit.audit_event
            where action = 'merchant.commission_requested'
              and target_id = 'a1960000-0000-4000-8000-0000000000c1'
              and (before #>> '{charged,pct}')::numeric = 28
              and (after ->> 'nexg_delivery_pct')::numeric = 20), 1,
  'the request is audited with the rate charged before and the rates asked for');

-- ------------------------------------------------------------------ deciding

set local role authenticated;
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a1');
select throws_ok(
  format('select public.rpc_merchant_commission_decide(%L, true, null)',
    pg_temp.pending('a1960000-0000-4000-8000-0000000000c1')),
  '42501', null, 'the requester cannot approve their own request');

select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a3');
select throws_ok(
  format('select public.rpc_merchant_commission_decide(%L, true, null)',
    pg_temp.pending('a1960000-0000-4000-8000-0000000000c1')),
  '42501', null, 'merchant ops cannot approve a commission');
select is(public.rpc_merchant_commission_read('a1960000-0000-4000-8000-0000000000c1') ->> 'can_decide',
  'false', 'and the card says so');

select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a2');
select is(public.rpc_merchant_commission_read('a1960000-0000-4000-8000-0000000000c1') ->> 'can_decide',
  'true', 'Finance can decide');
select is((
  public.rpc_merchant_commission_decide(pg_temp.pending('a1960000-0000-4000-8000-0000000000c1'),
    true, 'Matches the signed letter') #>> '{charged_now,pct}')::numeric,
  20::numeric, 'Finance approves; the merchant is charged 20% now');

reset role;
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c1'), 20::numeric,
  'the agreed NexG-delivery rate applies to a merchant NexG riders deliver for');
select is((pg_temp.price('a1960000-0000-4000-8000-0000000000c1') ->> 'commission_cents')::bigint, 20000::bigint,
  'pricing charges 20% of a KES 1,000 basket');
select is(pg_temp.price('a1960000-0000-4000-8000-0000000000c1') #>> '{pricing_version_ids,commission_term}',
  (select id::text from public.merchant_commission_term
    where merchant_id = 'a1960000-0000-4000-8000-0000000000c1' and status = 'approved'),
  'the order records which term priced it');
update public.merchant set has_own_riders = true where id = 'a1960000-0000-4000-8000-0000000000c1';
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c1'), 9.5::numeric,
  'with its own riders, the agreed own-delivery rate applies');
select is((pg_temp.price('a1960000-0000-4000-8000-0000000000c1') ->> 'service_fee_cents')::bigint, 4000::bigint,
  'a rate under the standard 14% gives the guest the reduced service fee, as before');
update public.merchant set has_own_riders = false where id = 'a1960000-0000-4000-8000-0000000000c1';
select is((public.fn_merchant_agreement_commission('a1960000-0000-4000-8000-0000000000c1') ->> 'pct')::numeric,
  20::numeric, 'the agreement states the agreed rate');
select is(public.fn_merchant_agreement_commission('a1960000-0000-4000-8000-0000000000c1') ->> 'basis',
  'negotiated', 'as negotiated');
select is((select count(*)::int from audit.audit_event
            where action = 'merchant.commission_approved'
              and target_id = 'a1960000-0000-4000-8000-0000000000c1'
              and (before #>> '{charged,pct}')::numeric = 28
              and (after #>> '{charged,pct}')::numeric = 20
              and approved_by is not null), 1,
  'the approval is audited with the rate charged before and after');

-- ------------------------------------------------------------------ dates

set local role authenticated;
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a1');
select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
  null, 15, pg_temp.today() + 2, pg_temp.today() + 4, 'Launch promotion', null);
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a2');
select public.rpc_merchant_commission_decide(pg_temp.pending('a1960000-0000-4000-8000-0000000000c1'), true, null);
reset role;

select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c1'), 20::numeric,
  'a term starting in two days does not change today');
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c1', 3), 15::numeric,
  'it applies while it runs');
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c1', 6), 20::numeric,
  'and after it ends, the earlier open-ended term applies again');
update public.merchant set has_own_riders = true where id = 'a1960000-0000-4000-8000-0000000000c1';
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c1', 3), 14::numeric,
  'a blank rate in a term stays on the preset');
update public.merchant set has_own_riders = false where id = 'a1960000-0000-4000-8000-0000000000c1';

set local role authenticated;
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a1');
select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
  null, null, pg_temp.today() + 10, null, 'Deal ended; back to the rate card', null);
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a2');
select public.rpc_merchant_commission_decide(pg_temp.pending('a1960000-0000-4000-8000-0000000000c1'), true, null);
reset role;
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c1', 11), 28::numeric,
  'a term with both rates blank puts the merchant back on the preset from its start');

-- ------------------------------------------------------------------ reject, withdraw

set local role authenticated;
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a1');
select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c2',
  5, null, pg_temp.today(), null, 'Asked for 5%', null);
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a2');
select is(
  public.rpc_merchant_commission_decide(pg_temp.pending('a1960000-0000-4000-8000-0000000000c2'),
    false, 'Below cost') #>> '{terms,0,status}',
  'rejected', 'Finance rejects a request, with a note');
reset role;
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c2'), 15::numeric,
  'a rejected request changes nothing');
set local role authenticated;

select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a1');
select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c2',
  12, null, pg_temp.today(), null, 'Asked for 12%', null);
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a3');
select throws_ok(
  format('select public.rpc_merchant_commission_withdraw(%L)',
    pg_temp.pending('a1960000-0000-4000-8000-0000000000c2')),
  '42501', null, 'another merchant ops cannot withdraw someone else''s request');
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a1');
select is(
  public.rpc_merchant_commission_withdraw(pg_temp.pending('a1960000-0000-4000-8000-0000000000c2'))
    #>> '{terms,0,status}',
  'withdrawn', 'the requester withdraws it');
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a2');
select throws_ok(
  format('select public.rpc_merchant_commission_decide(%L, true, null)',
    pg_temp.term('a1960000-0000-4000-8000-0000000000c2', 'withdrawn')),
  '22023', null, 'a withdrawn request cannot be approved');
reset role;
select is((select count(*)::int from audit.audit_event
            where action in ('merchant.commission_rejected', 'merchant.commission_withdrawn')
              and target_id = 'a1960000-0000-4000-8000-0000000000c2'), 2,
  'rejecting and withdrawing are audited');

-- ------------------------------------------------------------------ who sees what

set local role authenticated;
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a4');
select is(public.rpc_merchant_commission_read('a1960000-0000-4000-8000-0000000000c1') ->> 'viewer',
  'merchant', 'the merchant''s owner reads its own card');
select is(
  (select count(*)::int from jsonb_array_elements(
     public.rpc_merchant_commission_read('a1960000-0000-4000-8000-0000000000c1') -> 'terms') e
    where e ->> 'status' <> 'approved' or e ? 'reason' or e ? 'requested_by'), 0,
  'it sees approved terms only, with no reasons or staff names');
select throws_ok(
  $$select public.rpc_merchant_commission_read('a1960000-0000-4000-8000-0000000000c2')$$,
  '42501', null, 'not another merchant''s');
select throws_ok(
  $$select public.rpc_merchant_commission_request('a1960000-0000-4000-8000-0000000000c1',
      1, 1, pg_temp.today(), null, 'Please', null)$$,
  '42501', null, 'a merchant cannot ask for its own rate');
select is(public.fn_merchant_agreed_pct('a1960000-0000-4000-8000-0000000000c1'), null::numeric,
  'Finance''s agreed-rate helper answers nothing to a merchant');

select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a5');
select throws_ok(
  $$select public.rpc_merchant_commission_read('a1960000-0000-4000-8000-0000000000c1')$$,
  '42501', null, 'a stranger reads nothing');
select throws_ok(
  $$select public.fn_merchant_commission('a1960000-0000-4000-8000-0000000000c1', now())$$,
  '42501', null, 'nobody signed in calls the rate function directly');
select throws_ok(
  $$select count(*) from public.merchant_commission_term$$,
  '42501', null, 'nobody signed in reads the terms table');

select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a2');
select is(public.fn_merchant_agreed_pct('a1960000-0000-4000-8000-0000000000c1'), 20::numeric,
  'staff see the agreed rate in Finance''s report');
reset role;

-- ------------------------------------------------------------------ the old tier-change approval

select is((select count(*)::int from public.merchant_commission_term
            where merchant_id = 'a1960000-0000-4000-8000-0000000000c3'), 0,
  'the shop with an undated rate has no term yet');
create temp table n196 as select count(*)::int as n from public.notification where kind = 'merchant_suspended';
set local role authenticated;
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a1');
select public.rpc_merchant_two_person_request('a1960000-0000-4000-8000-0000000000c3',
  'commission_tier_change', 'Volume tier at 11%', '{"tier": "T2", "pct": "11"}');
select pg_temp.as_user('a1960000-0000-4000-8000-0000000000a6');
select public.rpc_merchant_two_person_approve(pg_temp.approval('a1960000-0000-4000-8000-0000000000c3'));
reset role;
select is(pg_temp.rate('a1960000-0000-4000-8000-0000000000c3'), 11::numeric,
  'the old commission change still works: it becomes a dated term');
select is((select count(*)::int from public.notification where kind = 'merchant_suspended'),
  (select n from n196), 'and no longer queues a "merchant suspended" notification');

-- ------------------------------------------------------------------ history and wiring

select ok(
  pg_get_functiondef('public.fn_order_reprice(uuid, jsonb)'::regprocedure) like '%v_commission := o.commission_pct;%',
  'repricing an order keeps the rate the order was charged');

select results_eq(
  $$select action collate "C", module, default_severity::text, two_person, money
      from audit.action_registry where action like 'merchant.commission\_%' escape '\'
       and action not like 'merchant.commission_tier%' order by 1$$,
  $$values ('merchant.commission_approved' collate "C", 'finance', 'high', true, true),
           ('merchant.commission_rejected', 'finance', 'notice', true, true),
           ('merchant.commission_requested', 'finance', 'notice', true, true),
           ('merchant.commission_withdrawn', 'finance', 'info', false, true)$$,
  'the four actions are registered under Finance');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ilike '%commission%'),
  0, 'the wiring check finds nothing wrong with commission');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.merchant_commission_term'::regclass)
    and not has_table_privilege('anon', 'public.merchant_commission_term', 'select')
    and not has_function_privilege('anon', 'public.rpc_merchant_commission_read(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.rpc_merchant_commission_request(uuid, numeric, numeric, date, date, text, text)', 'execute')
    and not has_function_privilege('authenticated', 'public.fn_merchant_commission_decider(uuid)', 'execute'),
  'the terms table has row-level security and anon reaches none of it');

select * from finish();
rollback;
