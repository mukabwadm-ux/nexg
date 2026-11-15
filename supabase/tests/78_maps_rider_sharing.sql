begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000',
  ('c0780000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  'authenticated', 'authenticated', case when n <> 5 then 'maps78-' || n || '@example.test' end,
  case when n <> 5 then now() end, n = 5, now(), now()
from generate_series(1, 5) n;

insert into public.guest (id, user_id, name) values
  ('c0780000-0000-4000-8000-000000000011', 'c0780000-0000-4000-8000-000000000001', '[Customer A]'),
  ('c0780000-0000-4000-8000-000000000012', 'c0780000-0000-4000-8000-000000000002', '[Customer B]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id)
values ('c0780000-0000-4000-8000-000000000021', '[Legal]', '[Store]', 'restaurant',
  '[Contact]', '+254700007801', 'merchant78@example.test', (select id from public.city where slug = 'nairobi'));
insert into public.merchant_branch (id, merchant_id, name, address_text, latitude, longitude)
values ('c0780000-0000-4000-8000-000000000022', 'c0780000-0000-4000-8000-000000000021',
  '[Branch]', '[Address]', 1, 2);

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no, status, activated_at, last_location)
values
  ('c0780000-0000-4000-8000-000000000031', 'c0780000-0000-4000-8000-000000000003', '[Rider]', '[A]',
    '+254700007802', (select id from public.city where slug = 'nairobi'), 'motorbike', '[PLATE78-A]', 'active', now(),
    extensions.st_setsrid(extensions.st_makepoint(99, 70), 4326)::extensions.geography),
  ('c0780000-0000-4000-8000-000000000032', 'c0780000-0000-4000-8000-000000000004', '[Rider]', '[B]',
    '+254700007803', (select id from public.city where slug = 'nairobi'), 'bicycle', null, 'active', now(), null);

insert into public."order" (
  id, reference, guest_id, merchant_id, branch_id, city_id, stage, payment_method, dropoff_label, dropoff_point, rider_id
)
values
  ('c0780000-0000-4000-8000-000000000041', 'MAP78-A', 'c0780000-0000-4000-8000-000000000011',
    'c0780000-0000-4000-8000-000000000021', 'c0780000-0000-4000-8000-000000000022',
    (select id from public.city where slug = 'nairobi'), 'picked_up', 'mpesa_stk', '[Dropoff A]',
    extensions.st_setsrid(extensions.st_makepoint(3, 2), 4326)::extensions.geography,
    'c0780000-0000-4000-8000-000000000031'),
  ('c0780000-0000-4000-8000-000000000042', 'MAP78-B', 'c0780000-0000-4000-8000-000000000012',
    'c0780000-0000-4000-8000-000000000021', 'c0780000-0000-4000-8000-000000000022',
    (select id from public.city where slug = 'nairobi'), 'ready', 'mpesa_stk', '[Dropoff B]', null, null);

insert into dispatch.job (id, order_id, city_id, state, pickup_label, dropoff_label, assigned_rider_id, assigned_at)
values ('c0780000-0000-4000-8000-000000000051', 'c0780000-0000-4000-8000-000000000041',
  (select id from public.city where slug = 'nairobi'), 'assigned', '[Pickup]', '[Dropoff]',
  'c0780000-0000-4000-8000-000000000031', '2026-11-15T08:00:00.123456Z');

select ok(not has_table_privilege('service_role', 'dispatch.maps_rider_share', 'SELECT'),
  'The standard service role has no direct pose access.');
select ok(not has_function_privilege('anon', 'public.rpc_rider_map_share_publish(uuid,integer,timestamptz,double precision,double precision)', 'EXECUTE'),
  'Signed-out callers cannot publish a sample.');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c0780000-0000-4000-8000-000000000005","role":"authenticated","is_anonymous":false}',true);
select throws_ok($$select public.rpc_my_rider_map_assignments()$$,
  '42501','An active rider account is required.','A temporary Auth user cannot impersonate a rider.');
select set_config('request.jwt.claims','{"sub":"c0780000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.rpc_my_rider_map_assignments()$$,
  '42501','An active rider account is required.','A customer account gains no rider access.');
select is(public.rpc_my_order_map('c0780000-0000-4000-8000-000000000041','2')->'courier', 'null'::jsonb,
  'A global rider position never substitutes for foreground consent.');

select set_config('request.jwt.claims','{"sub":"c0780000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.rpc_my_rider_map_assignments()->'assignments'->0->>'assignmentId',
  'c0780000-0000-4000-8000-000000000051','Rider reads their exact active dispatch assignment.');
select is(public.rpc_my_rider_map_assignments()->'assignments'->0->>'canShare','true',
  'An unambiguous active assignment to a real customer is eligible.');
select throws_ok($$select public.rpc_rider_map_share_start('c0780000-0000-4000-8000-000000000041',
    'c0780000-0000-4000-8000-000000000051','2026-11-15T08:00:00Z')$$,
  'P0002','Order sharing is unavailable.','A stale assignment timestamp cannot open a share.');
select set_config('t.maps78_share',public.rpc_rider_map_share_start('c0780000-0000-4000-8000-000000000041',
  'c0780000-0000-4000-8000-000000000051','2026-11-15T08:00:00.123456Z')->>'shareId',true);
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    1,clock_timestamp()+interval '1 minute',0,36)$$,
  '22023','Location sample is invalid or out of order.','A future sample is invalid.');
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    1,clock_timestamp()-interval '1 minute',0,36)$$,
  '22023','Location sample is invalid or out of order.','An already expired fix is invalid.');
select is(public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,1,
  clock_timestamp()-interval '1 second',0,36)->>'sequence','1','The opted-in rider can publish a valid fix.');
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    1,clock_timestamp(),8,36)$$,
  '22023','Location sample is invalid or out of order.','A repeated sequence cannot replace or refresh the pose.');
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    2,clock_timestamp()-interval '10 seconds',8,36)$$,
  '22023','Location sample is invalid or out of order.','An increasing sequence cannot backdate an accepted fix.');

select set_config('request.jwt.claims','{"sub":"c0780000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    2,clock_timestamp(),8,36)$$,
  'P0002','Order sharing is unavailable.','Another rider cannot publish to a foreign share.');
select is(public.rpc_rider_map_share_stop(current_setting('t.maps78_share')::uuid)->>'ok','true',
  'An absent or foreign stop response makes no ownership claim.');
select set_config('request.jwt.claims','{"sub":"c0780000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.rpc_my_order_map('c0780000-0000-4000-8000-000000000041','2')$$,
  'P0002','Order map not found.','Another customer cannot read the first order or infer its sharing state.');

select set_config('request.jwt.claims','{"sub":"c0780000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.rpc_my_order_map('c0780000-0000-4000-8000-000000000041')->'courier','null'::jsonb,
  'The legacy read remains fixed-only during an active share.');
select is(public.rpc_my_order_map('c0780000-0000-4000-8000-000000000041','2')->>'status','live',
  'The owning customer receives the current opted-in pose.');
select is(
  (select (pose - 'observedAt' - 'expiresAt') from
    (select public.rpc_my_order_map('c0780000-0000-4000-8000-000000000041','2')->'courier' as pose) as v),
  '{"latitude":0,"longitude":36,"vehicle":"motorbike"}'::jsonb,
  'The pose preserves zero coordinates and source vehicle without exposing rider/assignment or global location.');
select is(
  (select (pose->>'expiresAt')::timestamptz - (pose->>'observedAt')::timestamptz from
    (select public.rpc_my_order_map('c0780000-0000-4000-8000-000000000041','2')->'courier' as pose) as v),
  interval '30 seconds','The server expiry is bounded from capture time.');

-- Advance stored evidence through its deadline without sleeping in CI.
reset role;
update dispatch.maps_rider_share
set observed_at = clock_timestamp()-interval '32 seconds',
    expires_at = clock_timestamp()-interval '2 seconds'
where order_id = 'c0780000-0000-4000-8000-000000000041';
set local role authenticated;
select is(public.rpc_my_order_map('c0780000-0000-4000-8000-000000000041','2')->>'status','locations-only',
  'An expired pose leaves only the valid fixed endpoint state.');
select set_config('request.jwt.claims','{"sub":"c0780000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    2,clock_timestamp(),8,36)$$,
  'P0002','Order sharing is unavailable.','An expired pose cannot resume on the old lease.');

select set_config('t.maps78_share',public.rpc_rider_map_share_start('c0780000-0000-4000-8000-000000000041',
  'c0780000-0000-4000-8000-000000000051','2026-11-15T08:00:00.123456Z')->>'shareId',true);
select is(public.rpc_rider_map_share_stop(current_setting('t.maps78_share')::uuid)->>'ok','true',
  'An explicit stop acknowledges revocation.');
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    1,clock_timestamp(),8,36)$$,
  'P0002','Order sharing is unavailable.','Samples after permanent revocation are refused.');

select set_config('t.maps78_share',public.rpc_rider_map_share_start('c0780000-0000-4000-8000-000000000041',
  'c0780000-0000-4000-8000-000000000051','2026-11-15T08:00:00.123456Z')->>'shareId',true);
select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,1,clock_timestamp(),0,36);
reset role;
update public.order set stage = 'ready' where id = 'c0780000-0000-4000-8000-000000000041';
set local role authenticated;
select is(public.rpc_my_rider_map_assignments()->'assignments'->0->>'canShare','false',
  'An earlier assignment remains listed without permission to share.');
select throws_ok($$select public.rpc_rider_map_share_start('c0780000-0000-4000-8000-000000000041',
    'c0780000-0000-4000-8000-000000000051','2026-11-15T08:00:00.123456Z')$$,
  'P0002','Order sharing is unavailable.','Foreground consent cannot make a pre-pickup position visible.');
reset role;
update public.order set stage = 'picked_up' where id = 'c0780000-0000-4000-8000-000000000041';
set local role authenticated;
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    2,clock_timestamp(),8,36)$$,
  'P0002','Order sharing is unavailable.','A rewind revokes consent even after the order reenters the visibility window.');

select set_config('t.maps78_share',public.rpc_rider_map_share_start('c0780000-0000-4000-8000-000000000041',
  'c0780000-0000-4000-8000-000000000051','2026-11-15T08:00:00.123456Z')->>'shareId',true);
select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,1,clock_timestamp(),0,36);
reset role;
insert into dispatch.job (id, order_id, city_id, state, pickup_label, dropoff_label, assigned_rider_id, assigned_at)
values ('c0780000-0000-4000-8000-000000000052', 'c0780000-0000-4000-8000-000000000042',
  (select id from public.city where slug = 'nairobi'), 'manual_assigned', '[Pickup]', '[Dropoff]',
  'c0780000-0000-4000-8000-000000000031', now());
set local role authenticated;
select is(public.rpc_my_rider_map_assignments()->'assignments'->0->>'canShare','false',
  'An overlapping dispatch assignment closes sharing even if the other order rider link is not yet set.');
select throws_ok($$select public.rpc_rider_map_share_start('c0780000-0000-4000-8000-000000000041',
    'c0780000-0000-4000-8000-000000000051','2026-11-15T08:00:00.123456Z')$$,
  'P0002','Order sharing is unavailable.','A stacked rider cannot opt a single customer back into movement.');
reset role;
update dispatch.job set state = 'cancelled' where id = 'c0780000-0000-4000-8000-000000000052';
set local role authenticated;
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    2,clock_timestamp(),8,36)$$,
  'P0002','Order sharing is unavailable.','Removing the overlapping job does not restore old consent.');

select set_config('t.maps78_share',public.rpc_rider_map_share_start('c0780000-0000-4000-8000-000000000041',
  'c0780000-0000-4000-8000-000000000051','2026-11-15T08:00:00.123456Z')->>'shareId',true);
reset role;
update dispatch.job set assigned_at = assigned_at + interval '1 second'
where id = 'c0780000-0000-4000-8000-000000000051';
set local role authenticated;
select throws_ok($$select public.rpc_rider_map_share_publish(current_setting('t.maps78_share')::uuid,
    1,clock_timestamp(),8,36)$$,
  'P0002','Order sharing is unavailable.','Reusing the job ID with a new assignment epoch revokes consent.');

select set_config('t.maps78_share',public.rpc_rider_map_share_start('c0780000-0000-4000-8000-000000000041',
  'c0780000-0000-4000-8000-000000000051','2026-11-15T08:00:01.123456Z')->>'shareId',true);
reset role;
update public.rider set user_id = null where id = 'c0780000-0000-4000-8000-000000000031';
select is((select count(*)::int from dispatch.maps_rider_share where rider_id = 'c0780000-0000-4000-8000-000000000031'),
  0,'Unlinking the rider physically discards the private pose lease.');

select * from finish();
rollback;
