begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000',
  ('d8050000-0000-7000-8000-00000000000' || n)::uuid,
  'authenticated', 'authenticated', 'd8-' || n || '@example.test', now(), false, now(), now()
from generate_series(1, 4) n;

insert into public.guest (id, user_id, name)
values ('d8050000-0000-7000-8000-000000000011', 'd8050000-0000-7000-8000-000000000001', '[D8 guest]');
insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id)
values ('d8050000-0000-7000-8000-000000000021', '[D8 merchant]', '[D8 store]', 'restaurant',
  '[Contact]', '+254700008051', 'd8-merchant@example.test', (select id from public.city where slug = 'nairobi'));
insert into public.merchant_branch (id, merchant_id, name, address_text, latitude, longitude)
values ('d8050000-0000-7000-8000-000000000022', 'd8050000-0000-7000-8000-000000000021', '[Branch]', '[Address]', 1, 2);
insert into public."order" (id, reference, guest_id, merchant_id, branch_id, city_id, stage, payment_method, dropoff_label)
values ('d8050000-0000-7000-8000-000000000041', 'D8TEST-A', 'd8050000-0000-7000-8000-000000000011',
    'd8050000-0000-7000-8000-000000000021', 'd8050000-0000-7000-8000-000000000022',
    (select id from public.city where slug = 'nairobi'), 'confirmed', 'mpesa_stk', '[Dropoff]');
insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, status, activated_at)
values ('d8050000-0000-7000-8000-000000000031', 'd8050000-0000-7000-8000-000000000003',
  '[D8]', '[Rider]', '+254700008052', (select id from public.city where slug = 'nairobi'), 'bicycle', 'active', now());
insert into public.rider_device (id, rider_id, platform, is_job_device, notification_permission, location_permission)
values ('d8050000-0000-7000-8000-000000000032', 'd8050000-0000-7000-8000-000000000031', 'android', true, true, true);
insert into dispatch.job (id, order_id, city_id, state, pickup_label, dropoff_label)
values ('d8050000-0000-7000-8000-000000000051', 'd8050000-0000-7000-8000-000000000041',
  (select id from public.city where slug = 'nairobi'), 'offering', '[Pickup]', '[Dropoff]');

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d8050000-0000-7000-8000-000000000060', 'multi_unit','[D8 host]','+254700008053',
  (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d8050000-0000-7000-8000-000000000061', 'd8050000-0000-7000-8000-000000000060',
  'd8-test-block', '[D8 test block]', 'apartment_block', 'Kilimani',
  (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
  city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d8050000-0000-7000-8000-000000000062','d8050000-0000-7000-8000-000000000060',
  'd8050000-0000-7000-8000-000000000061','A','A','[Address]','Kilimani',
  (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 7000);

select ok(not has_schema_privilege('authenticated', 'native_push', 'USAGE'), 'Apps cannot read native token tables.');
select ok(not has_function_privilege('authenticated', 'public.fn_native_push_claim(integer)', 'EXECUTE'),
  'An app cannot claim delivery work.');
select ok(not has_function_privilege('anon', 'public.rpc_native_push_revision(uuid,text)', 'EXECUTE'),
  'Signed-out callers cannot read binding state.');
select is(public.cron_native_push_dispatch(), false, 'Local databases without Vault credentials make no outbound request.');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000001","role":"authenticated"}',true);
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000071', repeat('a',64),
  'consumer','ios','sandbox',repeat('b',64),'en',true,0), '{"revision":1,"binding":1}'::jsonb,
  'A real Consumer account registers a native installation.');
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000071',repeat('a',64),
  'consumer','ios','sandbox',repeat('b',64),'en',true,0)->>'revision','1','A lost response can safely be retried.');
select ok(public.rpc_native_push_watch('d8050000-0000-7000-8000-000000000071',repeat('a',64),1,
  'd8050000-0000-7000-8000-000000000081','order','d8050000-0000-7000-8000-000000000041',repeat('c',64)),
  'The order owner supplies an ActivityKit token for an active order.');
select throws_ok($$select public.rpc_native_push_register('d8050000-0000-7000-8000-000000000073',repeat('a',64),
  'rider','android','sandbox','fake-rider-fcm-token','en',true,0,'d8050000-0000-7000-8000-000000000032')$$,
  '42501', 'This phone is not the Rider job device.', 'A Consumer account cannot register against another Rider’s job device.');

select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000004","role":"authenticated"}',true);
select ok(not public.rpc_native_push_watch('d8050000-0000-7000-8000-000000000071',repeat('a',64),1,
  'd8050000-0000-7000-8000-000000000084','order','d8050000-0000-7000-8000-000000000041',repeat('d',64)),
  'A foreign account cannot attach a watch even with the same installation proof.');

select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000002","role":"authenticated"}',true);
select set_config('d8.test_stay', public.rpc_stay_hold('d8050000-0000-7000-8000-000000000062',
  (now() at time zone 'Africa/Nairobi')::date + 15, (now() at time zone 'Africa/Nairobi')::date + 17,
  '{"first_name":"[D8]"}'::jsonb)->>'stay_id', true);
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000072',repeat('e',64),
  'stays','android','sandbox','fixture-stays-fcm-token','sw',true,0)->>'binding','1','Stays registers an FCM token.');
select ok(public.rpc_native_push_watch('d8050000-0000-7000-8000-000000000072',repeat('e',64),1,
  'd8050000-0000-7000-8000-000000000082','stay',current_setting('d8.test_stay')::uuid),'A guest can track their verified active hold.');

select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000003","role":"authenticated"}',true);
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000073',repeat('f',64),
  'rider','android','sandbox','fixture-rider-fcm-token','en',true,0,'d8050000-0000-7000-8000-000000000032')->>'binding','1',
  'A signed-in rider registers their current job phone.');
reset role;

insert into dispatch.offer (id, job_id, round, rank, rider_id, expires_at)
values ('d8050000-0000-7000-8000-000000000052','d8050000-0000-7000-8000-000000000051',1,1,
  'd8050000-0000-7000-8000-000000000031',clock_timestamp()+interval '20 seconds');
update public."order" set stage = 'preparing' where id = 'd8050000-0000-7000-8000-000000000041';
update public."order" set stage = 'ready' where id = 'd8050000-0000-7000-8000-000000000041';
update public.stay set hold_expires_at = now() + interval '20 minutes' where id = current_setting('d8.test_stay')::uuid;
create temp table d8_claim as select * from public.fn_native_push_claim(50);

select is((select count(*)::integer from d8_claim),4,'The queue claims two Consumer surfaces, one stay update and one Rider offer.');
select is((select stage from d8_claim where app = 'consumer' and surface = 'alert'),'ready','The newest order stage supersedes the previous stage.');
select is((select token from d8_claim where app = 'consumer' and surface = 'live'),repeat('c',64),
  'The iOS watch uses the per-activity token, never the normal push token.');
select is((select stage from d8_claim where app = 'stays' and surface = 'live'),'held','A hold extension updates the Stays watch.');
select is((select stage from d8_claim where app = 'rider'),'offered','An offer queues for the owning rider job device.');
select is((select count(*)::integer from public.fn_native_push_claim(50)),0,'Leases stop a second worker from claiming the same work.');

select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000001","role":"authenticated"}',true);
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000071', repeat('a',64),
  'consumer','ios','sandbox',repeat('d',64),'en',true,1)->>'revision','2','Token rotation uses the expected revision.');
select ok(public.fn_native_push_finish((select id from d8_claim where app='consumer' and surface='alert'),
  (select lease from d8_claim where app='consumer' and surface='alert'),'gone'),'Provider rejection settles that lease.');
select is((select token from native_push.installation where id='d8050000-0000-7000-8000-000000000071'),repeat('d',64),
  'A provider rejection for the old token cannot disable its replacement.');

select ok(public.fn_native_push_finish((select id from d8_claim where app='stays'),
  (select lease from d8_claim where app='stays'),'sent'),'The worker can settle the hold update.');
update native_push.delivery set finished_at=clock_timestamp() - interval '2 seconds' where result='sent';
update public.stay set status='booked', confirmed_at=now() where id=current_setting('d8.test_stay')::uuid;
create temp table d8_close as select * from public.fn_native_push_claim(50);
select ok((select terminal from d8_close where app='stays' and surface='live'), 'A booked stay ends the checkout activity.');
select ok(public.fn_native_push_finish((select id from d8_close where app='stays' and surface='live'),
  (select lease from d8_close where app='stays' and surface='live'),'sent'),'The worker settles delivery of the end event.');
select is((select count(*)::integer from native_push.watch where installation_id='d8050000-0000-7000-8000-000000000072'),
  0, 'A successfully delivered terminal event releases that watch.');

select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000004","role":"authenticated"}',true);
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000071',repeat('a',64),
  'consumer','ios','sandbox',repeat('d',64),'en',true,2)->>'binding','2','Switching accounts replaces the installation binding.');
select is((select count(*)::integer from native_push.watch where installation_id='d8050000-0000-7000-8000-000000000071'),
  0,'An account switch clears the previous account’s activity.');
select ok(public.rpc_native_push_revoke('d8050000-0000-7000-8000-000000000071',repeat('a',64),3),
  'The current user can revoke their phone at sign-out.');
select is((select token from native_push.installation where id='d8050000-0000-7000-8000-000000000071'),null::text,
  'Sign-out removes the stored provider token.');

select * from finish();
rollback;
