-- The rider's record in the console, one trip's timeline, the directory's
-- numbers, and customers rating their rider (20270312000100).

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1930000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'guest193@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1930000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider193@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1930000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'stranger193@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1930000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'ops193@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1930000-0000-4000-8000-000000000007',
   'authenticated', 'authenticated', 'approver193@test.local', now(), false, now(), now());

create temp table t (k text primary key, v text);
insert into t values ('nbo', (select id::text from public.city where slug = 'nairobi'));
grant select on t to authenticated;

insert into public.staff_user (id, user_id, email, display_name) values
  ('c1930000-0000-4000-8000-0000000000b1', 'c1930000-0000-4000-8000-000000000006', 'ops193@test.local', 'Ops 193'),
  ('c1930000-0000-4000-8000-0000000000b2', 'c1930000-0000-4000-8000-000000000007', 'approver193@test.local', 'Approver 193');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c1930000-0000-4000-8000-0000000000b1', r.id, (select v::uuid from t where k = 'nbo'),
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c1930000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'ops_manager';

insert into public.guest (id, user_id, phone, name)
values ('c1930000-0000-4000-8000-000000000011', 'c1930000-0000-4000-8000-000000000001',
        '+254700019301', '[Guest 193]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1930000-0000-4000-8000-00000000000a', '[Legal 193] Ltd', '[Shop 193]', 'restaurant',
        '[Contact]', '+254700019300', 'shop193@example.test',
        (select v::uuid from t where k = 'nbo'), 'live', true, true, now() - interval '60 days');

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at, last_location, last_location_at,
                          payout_msisdn)
values ('c1930000-0000-4000-8000-000000000031', 'c1930000-0000-4000-8000-000000000003',
        '[Rider]', '[193]', '+254700019302', (select v::uuid from t where k = 'nbo'),
        'motorbike', '[PLATE193]', 'active', 'online', now(),
        extensions.st_setsrid(extensions.st_makepoint(36.81, -1.29), 4326)::extensions.geography,
        now(), '254700019302');

-- A: delivered by the rider, on time. B: ready, not delivered yet (not rateable).
-- C: another rider's order, offered to ours and declined.
insert into public.order (id, reference, guest_id, merchant_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency, rider_id,
  promised_delivery_at)
select v.id::uuid, v.ref, 'c1930000-0000-4000-8000-000000000011',
       'c1930000-0000-4000-8000-00000000000a', (select v::uuid from t where k = 'nbo'), 'web',
       '[Guest estate]', 'ready', 'mpesa_stk', 'paid',
       50000, 10000, 2500, 62500, 'KES', v.rider::uuid, now() + interval '1 hour'
  from (values
    ('c1930000-0000-4000-8000-0000000000f1', 'TRIP-193-A', 'c1930000-0000-4000-8000-000000000031'),
    ('c1930000-0000-4000-8000-0000000000f2', 'TRIP-193-B', 'c1930000-0000-4000-8000-000000000031'),
    ('c1930000-0000-4000-8000-0000000000f3', 'TRIP-193-C', null)) v (id, ref, rider);
update public.order set stage = 'picked_up', picked_up_at = now() - interval '20 minutes'
 where reference = 'TRIP-193-A';
update public.order set stage = 'delivered', delivered_at = now() - interval '5 minutes', handed_to = 'guest'
 where reference = 'TRIP-193-A';

insert into dispatch.job (id, order_id, city_id, pickup_label, dropoff_label, distance_km, state,
                          assigned_rider_id, assigned_at)
values
  ('c1930000-0000-4000-8000-0000000000e1', 'c1930000-0000-4000-8000-0000000000f1',
   (select v::uuid from t where k = 'nbo'), '[Shop 193]', '[Guest estate]', 4, 'completed',
   'c1930000-0000-4000-8000-000000000031', now() - interval '30 minutes'),
  ('c1930000-0000-4000-8000-0000000000e3', 'c1930000-0000-4000-8000-0000000000f3',
   (select v::uuid from t where k = 'nbo'), '[Shop 193]', '[Guest estate]', 6, 'offering',
   null, null);
insert into dispatch.offer (job_id, round, rank, rider_id, offered_at, responded_at, outcome,
                            decline_reason)
values
  ('c1930000-0000-4000-8000-0000000000e1', 1, 1, 'c1930000-0000-4000-8000-000000000031',
   now() - interval '31 minutes', now() - interval '30 minutes', 'accepted', null),
  ('c1930000-0000-4000-8000-0000000000e3', 1, 1, 'c1930000-0000-4000-8000-000000000031',
   now() - interval '10 minutes', now() - interval '9 minutes', 'declined', 'too_far');

insert into public.order_event (order_id, kind, title, actor_type, photo_path)
values ('c1930000-0000-4000-8000-0000000000f1', 'delivered', 'Delivered', 'rider',
        'c1930000-0000-4000-8000-000000000031/c1930000-0000-4000-8000-0000000000f1/handover.jpg');

create function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated')::text, true)
$$;

-- ── someone outside the riders module reads nothing
select pg_temp.as_user('c1930000-0000-4000-8000-000000000004');
set local role authenticated;
select throws_ok(
  $$ select public.rpc_console_rider_profile('c1930000-0000-4000-8000-000000000031') $$,
  '42501', null, 'A stranger cannot read a rider''s record.');
select throws_ok(
  $$ select public.rpc_console_rider_trip('c1930000-0000-4000-8000-000000000031',
                                          'c1930000-0000-4000-8000-0000000000f1') $$,
  '42501', null, 'A stranger cannot read a trip.');
select throws_ok(
  $$ select public.rpc_console_rider_stats() $$,
  '42501', null, 'A stranger cannot read the directory numbers.');
reset role;

-- ── the rider themself cannot read the console's view of them
select pg_temp.as_user('c1930000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok(
  $$ select public.rpc_console_rider_profile('c1930000-0000-4000-8000-000000000031') $$,
  '42501', null, 'The rider cannot read the console record.');
reset role;

-- ── ops in the rider's city reads the whole record
select pg_temp.as_user('c1930000-0000-4000-8000-000000000006');
set local role authenticated;
create temp table p as
  select public.rpc_console_rider_profile('c1930000-0000-4000-8000-000000000031') j;
select is((select (j #>> '{stats,trips_30d}')::int from p), 1, 'One delivered trip in 30 days.');
select is((select (j #>> '{stats,offers_30d}')::int from p), 2, 'Two answered offers.');
select is((select (j #>> '{stats,on_time_30d}')::int from p), 1, 'The trip was on time.');
select is((select jsonb_array_length(j -> 'trips') from p), 2, 'Both of their orders are listed.');
select ok((select (j #>> '{live,has_location}')::boolean from p
            where not (j::text ~ '"lat"|"lng"')),
          'The record says a fix exists but gives no coordinates.');
select is((select j #>> '{profile,payout_msisdn_masked}' from p), '2547•••302',
          'The payout number is masked.');

create temp table tr as
  select public.rpc_console_rider_trip('c1930000-0000-4000-8000-000000000031',
                                       'c1930000-0000-4000-8000-0000000000f1') j;
select is((select j #>> '{offers,0,outcome}' from tr), 'accepted', 'The trip shows the accepted offer.');
select ok((select j #>> '{events,0,photo_path}' from tr) like '%handover.jpg',
          'The trip shows the handover photo.');
select is((select (public.rpc_console_rider_trip('c1930000-0000-4000-8000-000000000031',
                     'c1930000-0000-4000-8000-0000000000f3') ->> 'carried')::boolean),
          false, 'An offered-only trip is readable and marked as not carried.');

select is((select (public.rpc_console_rider_stats() #>> '{c1930000-0000-4000-8000-000000000031,acceptance_pct}')::int),
          50, 'Acceptance is one of two answered offers.');
reset role;

-- ── the customer rates their rider once, after delivery
select pg_temp.as_user('c1930000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$ select public.rpc_order_rate_rider('c1930000-0000-4000-8000-0000000000f2', 5) $$,
  '23514', null, 'An order not yet delivered cannot be rated.');
select throws_ok(
  $$ select public.rpc_order_rate_rider('c1930000-0000-4000-8000-0000000000f1', 4, array['speedy']) $$,
  '22023', null, 'Only the listed words are taken.');
select is(
  (public.rpc_order_rate_rider('c1930000-0000-4000-8000-0000000000f1', 4,
     array['on_time', 'friendly', 'on_time'], ' Quick ') ->> 'ok')::boolean,
  true, 'The customer rates their rider.');
select throws_ok(
  $$ select public.rpc_order_rate_rider('c1930000-0000-4000-8000-0000000000f1', 5) $$,
  '23505', null, 'Only once per order.');
select is((public.rpc_my_order_rider_rating('c1930000-0000-4000-8000-0000000000f1') ->> 'stars')::int,
          4, 'The customer sees their own rating.');
reset role;

-- ── someone else's customer cannot rate it
select pg_temp.as_user('c1930000-0000-4000-8000-000000000004');
set local role authenticated;
select throws_ok(
  $$ select public.rpc_order_rate_rider('c1930000-0000-4000-8000-0000000000f1', 1) $$,
  '42501', null, 'Not your order, not your rating.');
reset role;

-- ── the wiring gate has nothing to say about these functions
select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical'
      and (finding like '%rider_console%' or finding like '%rider_rating%'
           or finding like '%rate_rider%')),
  0, 'No critical wiring findings for the new functions.');

select * from finish();
rollback;
