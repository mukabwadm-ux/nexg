-- Phone push (20270120000100): registration, guests, the customer's choices,
-- producers for orders, bookings, stays, support replies and riders, and the
-- sender's queue. Replaces PR #151's 79_native_push.sql.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Property review (20270323000100): the homes in this file count as reviewed and approved.
alter table public.property alter column review_status set default 'approved';

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000',
  ('d8050000-0000-7000-8000-00000000000' || n)::uuid,
  'authenticated', 'authenticated', case when n = 5 then null else 'd8-' || n || '@example.test' end,
  now(), n = 5, now(), now()
from generate_series(1, 5) n;

insert into public.guest (id, user_id, name)
values ('d8050000-0000-7000-8000-000000000011', 'd8050000-0000-7000-8000-000000000001', '[D8 guest]'),
       ('d8050000-0000-7000-8000-000000000015', 'd8050000-0000-7000-8000-000000000005', '[D8 temporary guest]');
insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id)
values ('d8050000-0000-7000-8000-000000000021', '[D8 merchant]', '[D8 store]', 'restaurant',
  '[Contact]', '+254700008051', 'd8-merchant@example.test', (select id from public.city where slug = 'nairobi'));
insert into public.merchant_branch (id, merchant_id, name, address_text, latitude, longitude)
values ('d8050000-0000-7000-8000-000000000022', 'd8050000-0000-7000-8000-000000000021', '[Branch]', '[Address]', 1, 2);
insert into public."order" (id, reference, guest_id, merchant_id, branch_id, city_id, stage, payment_method, dropoff_label)
values ('d8050000-0000-7000-8000-000000000041', 'D8TEST-A', 'd8050000-0000-7000-8000-000000000011',
    'd8050000-0000-7000-8000-000000000021', 'd8050000-0000-7000-8000-000000000022',
    (select id from public.city where slug = 'nairobi'), 'confirmed', 'mpesa_stk', '[Dropoff]'),
  ('d8050000-0000-7000-8000-000000000045', 'D8TEST-G', 'd8050000-0000-7000-8000-000000000015',
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
select ok(not has_function_privilege('authenticated', 'public.fn_native_push_reminders()', 'EXECUTE'),
  'An app cannot run the reminders.');
select ok(not has_function_privilege('anon', 'public.rpc_native_push_revision(uuid,text)', 'EXECUTE'),
  'Signed-out callers cannot read binding state.');
select is(public.cron_native_push_dispatch(), false, 'Without the Vault pair the scheduler makes no outbound request.');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000001","role":"authenticated"}',true);
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000071', repeat('a',64),
  'consumer','ios','sandbox',repeat('b',64),'en',true,0), '{"revision":1,"binding":1}'::jsonb,
  'A Consumer account registers its iPhone.');
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000071',repeat('a',64),
  'consumer','ios','sandbox',repeat('b',64),'en',true,0)->>'revision','1','A lost response can safely be retried.');
select ok(public.rpc_native_push_watch('d8050000-0000-7000-8000-000000000071',repeat('a',64),1,
  'd8050000-0000-7000-8000-000000000081','order','d8050000-0000-7000-8000-000000000041',repeat('c',64)),
  'The order owner supplies an ActivityKit token for an active order.');
select throws_ok($$select public.rpc_native_push_register('d8050000-0000-7000-8000-000000000073',repeat('a',64),
  'rider','android','sandbox','fake-rider-fcm-token','en',true,0,'d8050000-0000-7000-8000-000000000032')$$,
  '42501', 'This phone is not the Rider job device.', 'A Consumer account cannot register against a Rider''s job device.');

-- A guest (temporary session) who placed an order registers by installation.
select set_config('request.jwt.claims',
  '{"sub":"d8050000-0000-7000-8000-000000000005","role":"authenticated","is_anonymous":true}',true);
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000075', repeat('9',64),
  'consumer','android','sandbox','fixture-guest-fcm-token','en',true,0)->>'binding','1',
  'A guest with no account registers the Consumer app.');
select ok(public.rpc_native_push_watch('d8050000-0000-7000-8000-000000000075',repeat('9',64),1,
  'd8050000-0000-7000-8000-000000000085','order','d8050000-0000-7000-8000-000000000045'),
  'The guest tracks their own order.');
select ok(not public.rpc_native_push_watch('d8050000-0000-7000-8000-000000000075',repeat('9',64),1,
  'd8050000-0000-7000-8000-000000000086','order','d8050000-0000-7000-8000-000000000041'),
  'A guest cannot track somebody else''s order.');
select throws_ok($$select public.rpc_native_push_register('d8050000-0000-7000-8000-000000000076',repeat('8',64),
  'rider','android','sandbox','fixture-guest-rider-token','en',true,0)$$,
  '42501', 'Sign in to register a phone.', 'A guest cannot register the Rider app.');

select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000004","role":"authenticated"}',true);
select ok(not public.rpc_native_push_watch('d8050000-0000-7000-8000-000000000071',repeat('a',64),1,
  'd8050000-0000-7000-8000-000000000084','order','d8050000-0000-7000-8000-000000000041',repeat('d',64)),
  'A foreign account cannot attach a watch even with the same installation proof.');
select is(public.rpc_native_push_revision('d8050000-0000-7000-8000-000000000071',repeat('a',64)), 0,
  'A foreign account cannot read another account''s binding revision.');

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

select is((select stage from native_push.delivery where installation_id='d8050000-0000-7000-8000-000000000071'),
  'confirmed', 'Registering an order watch queues the current authoritative state.');
select is((select stage from native_push.delivery where installation_id='d8050000-0000-7000-8000-000000000072'),
  'held', 'Registering a stay watch queues the current verified deadline.');

insert into dispatch.offer (id, job_id, round, rank, rider_id, expires_at)
values ('d8050000-0000-7000-8000-000000000052','d8050000-0000-7000-8000-000000000051',1,1,
  'd8050000-0000-7000-8000-000000000031',clock_timestamp()+interval '20 seconds');
select is((select count(*)::integer from native_push.delivery where subject = 'offer'), 1,
  'A short offer queues one alert and no "about to expire" alert.');
update public."order" set stage = 'preparing' where id = 'd8050000-0000-7000-8000-000000000041';
update public."order" set stage = 'ready' where id = 'd8050000-0000-7000-8000-000000000041';
update public.stay set hold_expires_at = now() + interval '20 minutes' where id = current_setting('d8.test_stay')::uuid;
create temp table d8_claim as select * from public.fn_native_push_claim(50);

select is((select count(*)::integer from d8_claim where app <> 'consumer' or installation_id = 'd8050000-0000-7000-8000-000000000071'),
  4, 'The queue claims two Consumer surfaces, one stay update and one Rider offer.');
select is((select stage from d8_claim where app = 'consumer' and surface = 'alert'
  and installation_id = 'd8050000-0000-7000-8000-000000000071'),'ready','The newest order stage supersedes the previous stage.');
select is((select token from d8_claim where app = 'consumer' and surface = 'live'
  and installation_id = 'd8050000-0000-7000-8000-000000000071'),repeat('c',64),
  'The iOS watch uses the per-activity token, never the normal push token.');
select is((select stage from d8_claim where app = 'stays' and surface = 'live'),'held','A hold extension updates the Stays watch.');
select is((select count(*)::integer from d8_claim where app = 'stays' and surface = 'alert'), 0,
  'A hold extension does not repeat the payment-due alert.');
select is((select stage from d8_claim where app = 'rider'),'offered','An offer queues for the owning rider job device.');
select is((select count(*)::integer from public.fn_native_push_claim(50)),0,'Leases stop a second worker from claiming the same work.');

-- The guest's order moves too.
update public."order" set stage = 'preparing' where id = 'd8050000-0000-7000-8000-000000000045';
select is((select count(*)::integer from native_push.delivery
  where installation_id = 'd8050000-0000-7000-8000-000000000075' and stage = 'preparing'), 2,
  'A guest''s phone gets the alert and the live update for their order.');

-- The customer's choices: order confirmations off sends no alert, the live activity still moves;
-- a cancellation is always sent.
insert into public.customer_notification_pref (user_id, choices)
values ('d8050000-0000-7000-8000-000000000005', '{"order_confirmations":{"push":false},"delivery_updates":{"all":false}}');
update public."order" set stage = 'ready' where id = 'd8050000-0000-7000-8000-000000000045';
select is((select count(*)::integer from native_push.delivery
  where installation_id = 'd8050000-0000-7000-8000-000000000075' and stage = 'ready' and surface = 'alert'), 0,
  'A category the customer turned off sends no alert.');
select is((select count(*)::integer from native_push.delivery
  where installation_id = 'd8050000-0000-7000-8000-000000000075' and stage = 'ready' and surface = 'live'), 1,
  'The live activity the customer started still updates.');
update public."order" set stage = 'cancelled', cancel_reason_code = 'customer_request' where id = 'd8050000-0000-7000-8000-000000000045';
select is((select count(*)::integer from native_push.delivery
  where installation_id = 'd8050000-0000-7000-8000-000000000075' and stage = 'cancelled' and surface = 'alert'), 1,
  'A cancellation is transactional and always sent.');

-- Bookings from the app (opening hours are not what this file tests).
alter table public.booking disable trigger booking_hours_guard;
insert into public.bookable_resource (id, merchant_id, name)
values ('d8050000-0000-7000-8000-000000000091', 'd8050000-0000-7000-8000-000000000021', '[Chair]');
insert into public.booking (id, merchant_id, resource_id, starts_at, ends_at, held_during, status, guest_user_id,
  source, total_cents, payment_due_by)
values ('d8050000-0000-7000-8000-000000000092', 'd8050000-0000-7000-8000-000000000021',
  'd8050000-0000-7000-8000-000000000091', now() + interval '55 minutes', now() + interval '115 minutes',
  tstzrange(now() + interval '55 minutes', now() + interval '115 minutes'), 'pending',
  'd8050000-0000-7000-8000-000000000001', 'app', 150000, now() + interval '15 minutes');
select is((select stage from native_push.delivery where subject = 'booking'
  and installation_id = 'd8050000-0000-7000-8000-000000000071'), 'payment_due',
  'A booking waiting for payment tells the customer payment is due.');
update public.booking set status = 'confirmed', paid_at = now() where id = 'd8050000-0000-7000-8000-000000000092';
select ok(exists (select 1 from native_push.delivery where subject = 'booking' and stage = 'confirmed'),
  'A paid booking is confirmed on the phone.');
select is(public.fn_native_push_reminders() >= 1, true, 'A booking an hour away gets its reminder.');
select is(public.fn_native_push_reminders(), 0, 'A reminder is sent once.');

-- A reply from the support desk.
insert into public.support_ticket (id, reference, body, email, created_by_user)
values ('d8050000-0000-7000-8000-000000000095', 'D8-T-1', '[Question]', 'd8-1@example.test', 'd8050000-0000-7000-8000-000000000001');
insert into public.support_message (ticket_id, from_staff_id, body, internal)
values ('d8050000-0000-7000-8000-000000000095', null, '[Customer follow-up]', false);
select is((select count(*)::integer from native_push.delivery where subject = 'ticket'), 0,
  'The customer''s own message is not pushed back to them.');
insert into public.staff_user (id, user_id, email, display_name)
values ('d8050000-0000-7000-8000-000000000097', 'd8050000-0000-7000-8000-000000000004', 'd8-4@example.test', '[Desk]');
insert into public.support_message (ticket_id, from_staff_id, body, internal)
values ('d8050000-0000-7000-8000-000000000095', 'd8050000-0000-7000-8000-000000000097', '[Note]', true);
select is((select count(*)::integer from native_push.delivery where subject = 'ticket'), 0,
  'An internal desk note is never pushed.');
insert into public.support_message (ticket_id, from_staff_id, body, internal)
values ('d8050000-0000-7000-8000-000000000095', 'd8050000-0000-7000-8000-000000000097', '[Answer]', false);
select is((select stage from native_push.delivery where subject = 'ticket'
  and installation_id = 'd8050000-0000-7000-8000-000000000071'), 'reply',
  'A reply from the desk reaches the customer''s phone.');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000001","role":"authenticated"}',true);
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000071', repeat('a',64),
  'consumer','ios','sandbox',repeat('d',64),'en',true,1)->>'revision','2','Token rotation uses the expected revision.');
reset role;
select ok(public.fn_native_push_finish((select id from d8_claim where app='consumer' and surface='alert'
  and installation_id = 'd8050000-0000-7000-8000-000000000071'),
  (select lease from d8_claim where app='consumer' and surface='alert'
  and installation_id = 'd8050000-0000-7000-8000-000000000071'),'gone'),'Provider rejection settles that lease.');
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

-- Rider: a disposal decision and an account change.
insert into public.order_disposal (id, order_id, rider_id, reason, photo_path)
values ('d8050000-0000-7000-8000-000000000096', 'd8050000-0000-7000-8000-000000000041',
  'd8050000-0000-7000-8000-000000000031', '[Could not deliver]', 'd8/proof.jpg');
update public.order_disposal set status = 'approved', decided_at = now() where id = 'd8050000-0000-7000-8000-000000000096';
select is((select stage from native_push.delivery where subject = 'disposal'), 'disposal_approved',
  'The rider hears that their disposal request was answered.');
update public.rider set status = 'suspended' where id = 'd8050000-0000-7000-8000-000000000031';
select is((select stage from native_push.delivery where subject = 'account'), 'account_suspended',
  'A suspended rider is told, even though they can no longer take jobs.');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d8050000-0000-7000-8000-000000000004","role":"authenticated"}',true);
select is(public.rpc_native_push_register('d8050000-0000-7000-8000-000000000071',repeat('a',64),
  'consumer','ios','sandbox',repeat('d',64),'en',true,2)->>'binding','2','Switching accounts replaces the installation binding.');
select ok(public.rpc_native_push_revoke('d8050000-0000-7000-8000-000000000071',repeat('a',64),3),
  'The current user can revoke their phone at sign-out.');
reset role;
select is((select count(*)::integer from native_push.watch where installation_id='d8050000-0000-7000-8000-000000000071'),
  0,'An account switch clears the previous account''s activity.');
select is((select token from native_push.installation where id='d8050000-0000-7000-8000-000000000071'),null::text,
  'Sign-out removes the stored provider token.');

select * from finish();
rollback;
