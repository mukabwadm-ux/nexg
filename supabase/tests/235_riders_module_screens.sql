-- The Riders module screens' readers and the case writers (20270321000100).

begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2320000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'guest232@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2320000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'stranger232@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2320000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'ops232@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2320000-0000-4000-8000-000000000007',
   'authenticated', 'authenticated', 'approver232@test.local', now(), false, now(), now());

create temp table t (k text primary key, v text);
insert into t values
  ('nbo', (select id::text from public.city where slug = 'nairobi')),
  ('from', ((now() at time zone 'Africa/Nairobi')::date - 7)::text),
  ('to', ((now() at time zone 'Africa/Nairobi')::date)::text);
grant select on t to authenticated;

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2320000-0000-4000-8000-0000000000b1', 'c2320000-0000-4000-8000-000000000006', 'ops232@test.local', 'Ops 232'),
  ('c2320000-0000-4000-8000-0000000000b2', 'c2320000-0000-4000-8000-000000000007', 'approver232@test.local', 'Approver 232');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c2320000-0000-4000-8000-0000000000b1', r.id, (select v::uuid from t where k = 'nbo'),
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c2320000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'ops_manager';

insert into public.guest (id, user_id, phone, name)
values ('c2320000-0000-4000-8000-000000000011', 'c2320000-0000-4000-8000-000000000001',
        '+254700023201', 'Wanjiku Guest232');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c2320000-0000-4000-8000-00000000000a', '[Legal 232] Ltd', '[Shop 232]', 'restaurant',
        '[Contact]', '+254700023200', 'shop232@example.test',
        (select v::uuid from t where k = 'nbo'), 'live', true, true, now() - interval '60 days');

insert into public.rider (id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at, last_location, last_location_at,
                          payout_msisdn)
values ('c2320000-0000-4000-8000-000000000031', 'Rider', 'Twothreetwo', '+254700023202',
        (select v::uuid from t where k = 'nbo'), 'motorbike', '[PLATE232]', 'active', 'online', now(),
        extensions.st_setsrid(extensions.st_makepoint(36.81, -1.29), 4326)::extensions.geography,
        now(), '254700023202');

-- A: delivered on time by our rider. B: offered to our rider and declined.
insert into public.order (id, reference, guest_id, merchant_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency, rider_id,
  promised_delivery_at)
select v.id::uuid, v.ref, 'c2320000-0000-4000-8000-000000000011',
       'c2320000-0000-4000-8000-00000000000a', (select v::uuid from t where k = 'nbo'), 'web',
       '[Guest estate]', 'ready', 'mpesa_stk', 'paid',
       50000, 15000, 2500, 67500, 'KES', v.rider::uuid, now() + interval '1 hour'
  from (values
    ('c2320000-0000-4000-8000-0000000000f1', 'TRIP-232-A', 'c2320000-0000-4000-8000-000000000031'),
    ('c2320000-0000-4000-8000-0000000000f2', 'TRIP-232-B', null)) v (id, ref, rider);
update public.order set stage = 'picked_up', picked_up_at = now() - interval '20 minutes'
 where reference = 'TRIP-232-A';
update public.order set stage = 'delivered', delivered_at = now() - interval '5 minutes', handed_to = 'guest'
 where reference = 'TRIP-232-A';

insert into dispatch.job (id, order_id, city_id, pickup_label, dropoff_label, distance_km, state,
                          assigned_rider_id, assigned_at, at_pickup_at)
values
  ('c2320000-0000-4000-8000-0000000000e1', 'c2320000-0000-4000-8000-0000000000f1',
   (select v::uuid from t where k = 'nbo'), '[Shop 232]', '[Guest estate]', 4, 'completed',
   'c2320000-0000-4000-8000-000000000031', now() - interval '30 minutes', now() - interval '22 minutes'),
  ('c2320000-0000-4000-8000-0000000000e2', 'c2320000-0000-4000-8000-0000000000f2',
   (select v::uuid from t where k = 'nbo'), '[Shop 232]', '[Guest estate]', 6, 'offering', null, null, null);
insert into dispatch.offer (job_id, round, rank, rider_id, offered_at, responded_at, outcome, decline_reason)
values
  ('c2320000-0000-4000-8000-0000000000e1', 1, 1, 'c2320000-0000-4000-8000-000000000031',
   now() - interval '31 minutes', now() - interval '30 minutes 50 seconds', 'accepted', null),
  ('c2320000-0000-4000-8000-0000000000e2', 1, 1, 'c2320000-0000-4000-8000-000000000031',
   now() - interval '10 minutes', now() - interval '9 minutes', 'declined', 'too_far');

insert into public.rider_earning (rider_id, order_reference, earned_at, base_kes, distance_kes,
                                  waiting_kes, peak_bonus_kes, tip_kes, total_kes)
values ('c2320000-0000-4000-8000-000000000031', 'TRIP-232-A', now() - interval '5 minutes',
        100, 20, 0, 0, 30, 150);

-- An incident written the old way, by an existing writer's insert: the
-- trigger gives it a case type, a priority and an SLA.
insert into public.incident (id, rider_id, kind, severity, reported_by_type, description)
values ('c2320000-0000-4000-8000-0000000000c1', 'c2320000-0000-4000-8000-000000000031',
        'accident', 'major', 'rider', 'Fell on Ngong Rd, no injury.');

select is((select case_type || '/' || priority from public.incident
            where id = 'c2320000-0000-4000-8000-0000000000c1'),
          'safety/high', 'An old-style accident becomes a high-priority safety case.');
select ok((select sla_due_at between created_at + interval '3 hours 59 minutes'
                                 and created_at + interval '4 hours 1 minute'
             from public.incident where id = 'c2320000-0000-4000-8000-0000000000c1'),
          'High priority gets four hours.');

create function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated')::text, true)
$$;

-- ── someone outside the riders module reads and writes nothing
select pg_temp.as_user('c2320000-0000-4000-8000-000000000004');
set local role authenticated;
select throws_ok(
  $$ select public.rpc_console_riders_list(current_date - 7, current_date) $$,
  '42501', null, 'A stranger cannot read the rider list.');
select throws_ok(
  $$ select public.rpc_console_riders_overview(current_date - 7, current_date) $$,
  '42501', null, 'A stranger cannot read the overview.');
select throws_ok(
  $$ select public.rpc_console_riders_cases(current_date - 7, current_date) $$,
  '42501', null, 'A stranger cannot read the cases.');
select throws_ok(
  $$ select public.rpc_console_rider_case_open('other', 'low', 'Something') $$,
  '42501', null, 'A stranger cannot open a case.');
select throws_ok(
  $$ select * from public.console_rider_facts(now() - interval '1 day', now()) $$,
  '42501', null, 'Nobody calls the shared facts directly.');
reset role;

-- ── ops in the rider's city
select pg_temp.as_user('c2320000-0000-4000-8000-000000000006');
set local role authenticated;

create temp table l as
  select public.rpc_console_riders_list((select v::date from t where k = 'from'),
                                        (select v::date from t where k = 'to'),
                                        'all', 'Twothreetwo') j;
select is((select (j ->> 'total')::int from l), 1, 'Search finds the rider by name.');
select is((select j #>> '{rows,0,bucket}' from l), 'online', 'They are online now.');
select is((select (j #>> '{rows,0,trips}')::int from l), 1, 'One delivery in the period.');
select is((select (j #>> '{rows,0,acceptance_pct}')::numeric from l), 50.0,
          'Acceptance is one of two answered offers.');
select is((select (j #>> '{rows,0,earned_kes}')::int from l), 150, 'They earned KES 150.');
select ok((select (j #>> '{rows,0,score}') is not null from l), 'They have a performance score.');
select ok((select not (j::text ~ '"lat"|"lng"|"last_location"') from l),
          'The list carries no coordinates.');
select is((select (public.rpc_console_riders_list((select v::date from t where k = 'from'),
                     (select v::date from t where k = 'to'), 'on_trip', 'Twothreetwo') ->> 'total')::int),
          0, 'The On Trip tab leaves them out.');

select ok((public.rpc_console_riders_overview((select v::date from t where k = 'from'),
             (select v::date from t where k = 'to')) #>> '{kpis,completed}')::int >= 1,
          'The overview counts the delivery.');

create temp table d as
  select public.rpc_console_riders_deliveries((select v::date from t where k = 'from'),
                                              (select v::date from t where k = 'to'),
                                              'delivered', 'TRIP-232') j;
select is((select j #>> '{rows,0,reference}' from d), 'TRIP-232-A', 'The delivered tab lists the order.');
select is((select j #>> '{rows,0,customer}' from d), 'Wanjiku', 'The customer is shown by first name only.');

select ok((public.rpc_console_riders_availability((select v::date from t where k = 'from'),
             (select v::date from t where k = 'to')) #>> '{kpis,online}')::int >= 1,
          'Availability counts them online.');
select ok((public.rpc_console_riders_earnings((select v::date from t where k = 'from'),
             (select v::date from t where k = 'to')) #>> '{kpis,rider_kes}')::int >= 150,
          'Earnings include theirs.');
select ok(public.rpc_console_riders_performance((select v::date from t where k = 'from'),
            (select v::date from t where k = 'to')) ? 'kpis',
          'Performance answers.');
select ok(public.rpc_console_riders_onboarding((select v::date from t where k = 'from'),
            (select v::date from t where k = 'to')) ? 'kyc_by_document',
          'Onboarding answers.');

-- ── a case, from opening to resolution
select throws_ok(
  $$ select public.rpc_console_rider_case_open('lost_parcel', 'low', 'Something') $$,
  '22023', null, 'An unknown case type is refused.');
create temp table c as
  select public.rpc_console_rider_case_open('delivery_dispute', 'medium',
           'Customer says the food arrived cold.', null, 'trip-232-a', 'late_delivery', 'guest') id;
select is((select rider_id from public.incident where id = (select id from c)),
          'c2320000-0000-4000-8000-000000000031'::uuid, 'The rider comes from the order.');
select is((public.rpc_console_rider_case_update((select id from c), 'escalate') ->> 'priority'),
          'high', 'Escalating raises a medium case to high.');
select throws_ok(
  format($$ select public.rpc_console_rider_case_resolve(%L, 'compensated', '  ') $$, (select id from c)),
  '22023', null, 'A resolution needs words.');
select is((public.rpc_console_rider_case_resolve((select id from c), 'compensated',
             'Refunded the delivery fee.', 150) ->> 'status'),
          'resolved', 'The case is resolved.');
select throws_ok(
  format($$ select public.rpc_console_rider_case_update(%L, 'start') $$, (select id from c)),
  '23514', null, 'A resolved case is not reopened by a menu.');
select is((public.rpc_incident_resolve('c2320000-0000-4000-8000-0000000000c1', 'Bike checked, rider fine.')).outcome,
          'resolved', 'The old resolve writer still closes a case, as resolved.');
select ok((public.rpc_console_riders_cases((select v::date from t where k = 'from'),
             (select v::date from t where k = 'to')) #>> '{outcomes,compensated}')::int >= 1,
          'Case outcomes count it.');
reset role;

select is((select count(*)::int from audit.audit_event
            where action in ('rider_case.opened', 'rider_case.updated', 'rider_case.resolved')
              and target_id = (select id from c)),
          3, 'Opening, escalating and resolving are each audited.');

-- ── the wiring gate has nothing to say about these functions
select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical'
      and (finding like '%console_riders%' or finding like '%rider_case%'
           or finding like '%console_rider_facts%' or finding like '%incident_case%')),
  0, 'No critical wiring findings for the new functions.');

select * from finish();
rollback;
