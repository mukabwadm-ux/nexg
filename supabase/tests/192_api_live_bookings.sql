-- Live API bookings (20270302000200): only a merchant Finance has approved
-- books for real, within its monthly limit; a courier is priced by the
-- delivery check, so the check and the booking agree, and a trip the check
-- refuses cannot be booked; the sandbox prices the same way without the
-- approval; the switch is Finance's and is audited.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create temp table t_m on commit drop as
  select m.id, m.city_id from public.merchant m
  where m.status = 'live' and m.explore_visible and m.deleted_at is null
    and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
values
  ((select id from t_m), encode(sha256(convert_to('live-book-key-0000000000000000000000', 'UTF8')), 'hex'),
   'lvbook01', '{public_read,merchant_read,merchant_write}', 600, 'live'),
  ((select id from t_m), encode(sha256(convert_to('nexg_test_live-book-key-000000000000', 'UTF8')), 'hex'),
   'nexg_test_lvb1', '{public_read,merchant_read,merchant_write}', 600, 'test');

/* Finance, and a colleague without the role. */
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1920000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'finance192@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1920000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'ops192@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1920000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'approver192@test.local', now(), false, now(), now());
insert into public.staff_user (id, user_id, email, display_name) values
  ('c1920000-0000-4000-8000-0000000000b1', 'c1920000-0000-4000-8000-000000000001', 'finance192@test.local', 'Finance 192'),
  ('c1920000-0000-4000-8000-0000000000b2', 'c1920000-0000-4000-8000-000000000002', 'ops192@test.local', 'Ops 192'),
  ('c1920000-0000-4000-8000-0000000000b3', 'c1920000-0000-4000-8000-000000000003', 'approver192@test.local', 'Approver 192');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c1920000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c1920000-0000-4000-8000-0000000000b3'
  from public.role r where r.key = 'finance';

create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;

/* Westlands to Kilimani: 3.5 km, KES 80 + 3 x 25 = KES 155 on the rate card. */
create function pg_temp.courier(p_key text, p_idem text, p_dropoff_lat float default -1.2921,
                                p_dropoff_lng float default 36.7865) returns jsonb
language sql as $$
  select public.rpc_order_place_api(p_key, p_idem, jsonb_build_object(
    'service', 'courier', 'pickup_label', 'Woodvale Grove', 'pickup_lat', -1.2648, 'pickup_lng', 36.8027,
    'dropoff_label', 'Kilimani', 'dropoff_lat', p_dropoff_lat, 'dropoff_lng', p_dropoff_lng))
$$;

-- ═══════════════════════════════════════════════════════════════ approval

select throws_ok(
  $$select pg_temp.courier('live-book-key-0000000000000000000000', 'live-book-idem-000000000001')$$,
  '42501', 'Live bookings through the API are not switched on for this merchant yet. Ask NexG to approve the account; meanwhile a test key books in the sandbox.',
  'a merchant NexG has not approved cannot book for real');

select pg_temp.as_user('c1920000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.rpc_api_booking_access_set((select id from t_m), true, 300, 'Pilot')$$,
  '42501', 'API booking approval is Finance''s.',
  'staff without Finance cannot switch it on');

select pg_temp.as_user('c1920000-0000-4000-8000-000000000001');
insert into t values ('on', public.rpc_api_booking_access_set((select id from t_m), true, 300, 'Pilot, agreed by the owner'));
select is(
  (select concat_ws('|', v ->> 'enabled', v ->> 'monthly_limit_kes', v ->> 'note', v ->> 'changed_by') from t where k = 'on'),
  'true|300|Pilot, agreed by the owner|Finance 192',
  'Finance switches it on, with a monthly limit');

select is(
  (select concat_ws('|', l.module, l.after ->> 'enabled', l.after ->> 'monthly_limit_kes')
     from audit.audit_event l
    where l.action = 'merchant.api_bookings_set' and l.target_id = (select id from t_m)),
  'finance|true|300',
  'and it is audited');

select throws_ok(
  $$select public.rpc_api_booking_access_set((select id from t_m), true, 0)$$,
  '22023', 'The monthly limit is whole shillings, from 1 to 1,000,000,000.',
  'a limit must be at least one shilling');

-- ═══════════════════════════════════════════════════════════════ the price

insert into t values ('first', pg_temp.courier('live-book-key-0000000000000000000000', 'live-book-idem-000000000002'));

select is(
  (select (v ->> 'total_cents')::bigint from t where k = 'first'),
  15500::bigint,
  'a courier is priced per km: 3.5 km is KES 80 + 3 x 25');

select is(
  (select (v ->> 'total_cents')::bigint from t where k = 'first'),
  (public.rpc_delivery_check(-1.2648, 36.8027, -1.2921, 36.7865) ->> 'delivery_fee_cents')::bigint,
  'and it is exactly what the delivery check quotes');

select is(
  (select concat_ws('|', o.subtotal_cents, o.delivery_fee_cents, o.service_fee_cents, o.total_cents, o.channel)
     from public.order o where o.id = (select (v ->> 'order_id')::uuid from t where k = 'first')),
  '0|15500|0|15500|api',
  'the order carries it as the delivery fee, with no service fee on top');

select throws_ok(
  $$select pg_temp.courier('live-book-key-0000000000000000000000', 'live-book-idem-000000000003', -1.3670, 38.0100)$$,
  '22023', 'The drop-off is outside the areas NexG delivers in.',
  'a trip the delivery check refuses cannot be booked, and says why');

-- ═══════════════════════════════════════════════════════════════ the monthly limit

select throws_ok(
  $$select pg_temp.courier('live-book-key-0000000000000000000000', 'live-book-idem-000000000004')$$,
  'P0004', 'This booking (KES 155) would take this month''s API bookings to KES 310, over the monthly limit of KES 300. Ask NexG to raise the limit.',
  'a booking that would pass the monthly limit is refused');

select is(
  public.rpc_order_cancel_api('live-book-key-0000000000000000000000',
    (select (v ->> 'order_id')::uuid from t where k = 'first')) ->> 'cancelled',
  'true',
  'the first booking is cancelled');

select is(
  (pg_temp.courier('live-book-key-0000000000000000000000', 'live-book-idem-000000000005') ->> 'total_cents')::bigint,
  15500::bigint,
  'a cancelled booking does not count against the limit');

select is(
  (select concat_ws('|', x ->> 'month_used_kes', x ->> 'month_bookings')
     from (select public.rpc_api_booking_access_read((select id from t_m)) as x) r),
  '155|1',
  'the card shows this month''s use, cancelled bookings aside');

select is(
  (pg_temp.courier('live-book-key-0000000000000000000000', 'live-book-idem-000000000002') ->> 'total_cents')::bigint,
  15500::bigint,
  'a replayed idempotency key still answers with its first booking');

-- ═══════════════════════════════════════════════════════════════ switched off

select is(
  public.rpc_api_booking_access_set((select id from t_m), false, 300) ->> 'enabled',
  'false',
  'Finance switches it off');

select throws_ok(
  $$select pg_temp.courier('live-book-key-0000000000000000000000', 'live-book-idem-000000000006')$$,
  '42501', null,
  'and the merchant can no longer book for real');

select is(
  (select count(*)::integer from audit.audit_event l
    where l.action = 'merchant.api_bookings_set' and l.target_id = (select id from t_m)),
  2,
  'each change is audited');

-- ═══════════════════════════════════════════════════════════════ the sandbox

select is(
  (public.rpc_order_place_api_test('nexg_test_live-book-key-000000000000', 'live-book-test-idem-0000001',
     jsonb_build_object('service', 'courier', 'pickup_label', 'Woodvale Grove', 'pickup_lat', -1.2648,
       'pickup_lng', 36.8027, 'dropoff_label', 'Kilimani', 'dropoff_lat', -1.2921,
       'dropoff_lng', 36.7865)) ->> 'total_cents')::bigint,
  15500::bigint,
  'the sandbox prices a courier the same way, with no approval needed');

select throws_ok(
  $$select public.rpc_order_place_api_test('nexg_test_live-book-key-000000000000', 'live-book-test-idem-0000002',
     jsonb_build_object('service', 'courier', 'pickup_label', 'Woodvale Grove', 'pickup_lat', -1.2648,
       'pickup_lng', 36.8027, 'dropoff_label', 'Kitui', 'dropoff_lat', -1.3670, 'dropoff_lng', 38.0100))$$,
  '22023', 'The drop-off is outside the areas NexG delivers in.',
  'and refuses a trip the live API would refuse, in the same words');

-- ═══════════════════════════════════════════════════════════════ access

select ok(
  not has_function_privilege('anon', 'public.fn_price_api_booking(uuid, public.api_service, integer, jsonb, timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_price_api_booking(uuid, public.api_service, integer, jsonb, timestamptz)', 'execute'),
  'the price function is the server''s alone');

select ok(
  not has_table_privilege('authenticated', 'public.api_booking_access', 'select')
  and not has_table_privilege('anon', 'public.api_booking_access', 'select'),
  'the approvals are read only through Finance''s functions');

select ok(
  not has_function_privilege('anon', 'public.rpc_api_booking_access_set(uuid, boolean, integer, text)', 'execute')
  and has_function_privilege('authenticated', 'public.rpc_api_booking_access_set(uuid, boolean, integer, text)', 'execute'),
  'the switch is for signed-in staff, and checks the role itself');

select is_empty(
  $$ select 1 from public.fn_wiring_check()
      where finding ~ '(rpc_api_booking_access|fn_price_api_booking|rpc_order_place_api)' $$,
  'the wiring check has nothing to say about them');

select is(
  (select count(*)::integer from settings.definition where key like 'fees.ride.%'),
  0,
  'rides keep their price per passenger: no ride card yet');

select * from finish();
rollback;
