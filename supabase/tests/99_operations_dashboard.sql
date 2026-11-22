-- Operations dashboard: the figures, the live table and Raise Incident.
--
-- Each kind lands in the right tab and status from what is actually known
-- (nothing invents "preparing"); the KPIs move by exactly what was added;
-- only Orders or Live operations staff can read it; Raise Incident is for
-- operations staff and links the order's rider.

begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

insert into t (k, v) values ('nbo', (select id::text from public.city where slug = 'nairobi'));

/* The last 30 days in Nairobi, and one page of a view of them. */
create function pg_temp.d0() returns date language sql stable
  as $f$ select (now() at time zone 'Africa/Nairobi')::date - 29 $f$;
create function pg_temp.d1() returns date language sql stable
  as $f$ select (now() at time zone 'Africa/Nairobi')::date $f$;
create function pg_temp.ops(p_tab text, p_bucket text, p_q text, p_area text default null)
  returns jsonb language sql
  as $f$ select public.rpc_operations_list(pg_temp.d0(), pg_temp.d1(), p_tab, p_bucket, null, null,
                                           p_area, p_q, 50, 0) $f$;

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('0d500000-0000-4000-8000-0000000000a1'::uuid, 'ops.dash@test.local'),
  ('0d500000-0000-4000-8000-0000000000a2'::uuid, 'growth.dash@test.local'),
  ('0d500000-0000-4000-8000-0000000000a3'::uuid, 'guest.dash@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('0d500000-0000-4000-8000-0000000000b1', '0d500000-0000-4000-8000-0000000000a1', 'ops.dash@test.local', 'Ops Dash'),
  ('0d500000-0000-4000-8000-0000000000b2', '0d500000-0000-4000-8000-0000000000a2', 'growth.dash@test.local', 'Growth Dash');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from (values
  ('0d500000-0000-4000-8000-0000000000b1'::uuid, 'ops_manager'),
  ('0d500000-0000-4000-8000-0000000000b2'::uuid, 'growth')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

-- --------------------------------------------------------------- baseline

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"0d500000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into t (k, v) select 'before',
  public.rpc_operations_overview(pg_temp.d0(), pg_temp.d1())::text;
reset role;

-- --------------------------------------------------------------- fixtures

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
                             contact_email, city_id)
values
  ('0d500000-0000-4000-8000-0000000000c1', 'Urban Bistro Dash Ltd', 'Urban Bistro Dash', 'restaurants_food',
   'Owner', '+254712000501', 'bistro.dash@shop.example', (select v::uuid from t where k = 'nbo')),
  ('0d500000-0000-4000-8000-0000000000c2', 'Green Leaf Dash Ltd', 'Green Leaf Dash', 'groceries_essentials',
   'Owner', '+254712000502', 'leaf.dash@shop.example', (select v::uuid from t where k = 'nbo')),
  ('0d500000-0000-4000-8000-0000000000c3', 'NEXG Transfers Dash Ltd', 'NEXG Transfers Dash', 'airport_transfers',
   'Owner', '+254712000503', 'cars.dash@shop.example', (select v::uuid from t where k = 'nbo')),
  ('0d500000-0000-4000-8000-0000000000c4', 'Calm Spa Dash Ltd', 'Calm Spa Dash', 'wellness',
   'Owner', '+254712000504', 'spa.dash@shop.example', (select v::uuid from t where k = 'nbo'));

insert into t (k, v) values
  ('zone', (select z.id::text from public.zone z where z.city_id = (select v::uuid from t where k = 'nbo')
             order by z.name limit 1));

insert into public.merchant_branch (id, merchant_id, name, address_text, latitude, longitude, is_primary, zone_id)
values ('0d500000-0000-4000-8000-0000000000d1', '0d500000-0000-4000-8000-0000000000c1', 'Main',
        'Westlands', -1.2650, 36.8030, true, (select v::uuid from t where k = 'zone'));

insert into public.guest (id, phone, name)
values ('0d500000-0000-4000-8000-0000000000e1', '+254711500501', 'Amina Wanjiku');

insert into public.rider (id, first_name, last_name, phone, city_id, vehicle) values
  ('0d500000-0000-4000-8000-0000000000f1', 'Kevin', 'Otieno', '+254799500501',
   (select v::uuid from t where k = 'nbo'), 'motorbike');

insert into public.order (
  id, reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel, dropoff_label, stage,
  handed_to, payment_method, payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents,
  total_cents, currency, rider_id, placed_at, delivered_at, cancelled_at, cancel_reason_code,
  scheduled_for)
select o.id, o.reference, '0d500000-0000-4000-8000-0000000000e1', o.merchant,
       case when o.merchant = '0d500000-0000-4000-8000-0000000000c1'::uuid
            then '0d500000-0000-4000-8000-0000000000d1'::uuid end,
       (select v::uuid from t where k = 'nbo'),
       case when o.reference = 'OPS-T-FOOD' then (select v::uuid from t where k = 'zone') end,
       'web', 'Somewhere in Kilimani', o.stage::public.order_stage,
       case when o.stage = 'delivered' then 'guest'::public.handoff_target end,
       o.method::public.order_payment_method, o.status::public.order_payment_status,
       o.cents, 0, 0, o.cents, 'KES', o.rider, o.placed, o.delivered, o.cancelled, o.reason, o.scheduled
from (values
  ('0d500000-0000-4000-8000-000000000101'::uuid, 'OPS-T-FOOD', '0d500000-0000-4000-8000-0000000000c1'::uuid,
   'placed', 'cash_on_delivery', 'pending', 234000, null::uuid, now() - interval '10 minutes',
   null::timestamptz, null::timestamptz, null, null::timestamptz),
  ('0d500000-0000-4000-8000-000000000102', 'OPS-T-RIDER', '0d500000-0000-4000-8000-0000000000c2',
   'placed', 'cash_on_delivery', 'pending', 485000, '0d500000-0000-4000-8000-0000000000f1',
   now() - interval '25 minutes', null, null, null, null),
  ('0d500000-0000-4000-8000-000000000103', 'OPS-T-PAY', '0d500000-0000-4000-8000-0000000000c1',
   'placed', 'mpesa_stk', 'pending', 150000, null, now() - interval '3 minutes', null, null, null, null),
  ('0d500000-0000-4000-8000-000000000104', 'OPS-T-LATER', '0d500000-0000-4000-8000-0000000000c2',
   'placed', 'cash_on_delivery', 'pending', 99000, null, now() - interval '1 minute', null, null, null,
   now() + interval '1 day'),
  ('0d500000-0000-4000-8000-000000000105', 'OPS-T-DONE', '0d500000-0000-4000-8000-0000000000c2',
   'delivered', 'cash_on_delivery', 'pending', 120000, '0d500000-0000-4000-8000-0000000000f1',
   now() - interval '1 day 2 hours', now() - interval '1 day', null, null, null),
  ('0d500000-0000-4000-8000-000000000106', 'OPS-T-GONE', '0d500000-0000-4000-8000-0000000000c1',
   'cancelled', 'cash_on_delivery', 'pending', 80000, null, now() - interval '2 hours', null,
   now() - interval '1 hour', 'guest_cancelled', null),
  ('0d500000-0000-4000-8000-000000000107', 'OPS-T-CAR', '0d500000-0000-4000-8000-0000000000c3',
   'placed', 'cash_on_delivery', 'pending', 950000, null, now() - interval '5 minutes', null, null, null, null)
) as o (id, reference, merchant, stage, method, status, cents, rider, placed, delivered, cancelled, reason, scheduled);

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('0d500000-0000-4000-8000-000000000201', 'multi_unit', 'Riverside Host Dash', '+254700500201',
        (select v::uuid from t where k = 'nbo'), 'live', now(), now());
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, point)
values ('0d500000-0000-4000-8000-000000000202', '0d500000-0000-4000-8000-000000000201', 'riverside-dash',
        'Riverside Stays Dash', 'apartment_block', 'Riverside', (select v::uuid from t where k = 'nbo'),
        true, now(), extensions.st_setsrid(extensions.st_makepoint(36.80, -1.27), 4326)::extensions.geography);
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area, city_id, handoff,
                         status, listed, bedrooms, max_guests, nightly_rate_kes)
select u.id, '0d500000-0000-4000-8000-000000000201', '0d500000-0000-4000-8000-000000000202', u.n, u.n,
       '[Address]', 'Riverside', (select v::uuid from t where k = 'nbo'), 'lockbox', 'live', true, 2, 4, 9000
from (values ('0d500000-0000-4000-8000-000000000203'::uuid, 'A'),
             ('0d500000-0000-4000-8000-000000000204', 'B'),
             ('0d500000-0000-4000-8000-000000000205', 'C')) as u (id, n);
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, party_adults, party_children,
                         check_in, check_out, source, status, quote_total_kes)
values
  ('0d500000-0000-4000-8000-000000000206', '0d500000-0000-4000-8000-000000000201',
   '0d500000-0000-4000-8000-000000000202', '0d500000-0000-4000-8000-000000000203', 'Wanjiru', 2, 1,
   now() - interval '1 day', now() + interval '3 days', 'nexg', 'booked', 36000),
  ('0d500000-0000-4000-8000-000000000207', '0d500000-0000-4000-8000-000000000201',
   '0d500000-0000-4000-8000-000000000202', '0d500000-0000-4000-8000-000000000204', 'Otieno', 2, 0,
   now() + interval '2 days', now() + interval '4 days', 'nexg', 'booked', 18000),
  ('0d500000-0000-4000-8000-000000000208', '0d500000-0000-4000-8000-000000000201',
   '0d500000-0000-4000-8000-000000000202', '0d500000-0000-4000-8000-000000000205', null, 0, 0,
   now() + interval '5 days', now() + interval '6 days', 'entered', 'blocked', null);

insert into public.plan (id, user_id, city_id, guest_name, guest_phone, duration, party_type, party_size,
                         date, budget_kes, moods, status, quote_total_kes, paid_at, payment_reference)
values
  ('0d500000-0000-4000-8000-000000000301', '0d500000-0000-4000-8000-0000000000a3',
   (select v::uuid from t where k = 'nbo'), 'Peter Akinyi', '+254722500301', 'day', 'couple', 2,
   (now() at time zone 'Africa/Nairobi')::date, 20000, array['taste']::public.mood[], 'paid', 6000, now(), 'SAB1CD2EF3'),
  ('0d500000-0000-4000-8000-000000000302', '0d500000-0000-4000-8000-0000000000a3',
   (select v::uuid from t where k = 'nbo'), 'Grace Mwangi', '+254722500302', 'day', 'couple', 2,
   (now() at time zone 'Africa/Nairobi')::date + 5, 20000, array['taste']::public.mood[], 'sent', null, null, null);

insert into public.bookable_resource (id, merchant_id, model, kind, name, price_cents, price_unit)
values ('0d500000-0000-4000-8000-000000000401', '0d500000-0000-4000-8000-0000000000c4', 'exclusive',
        'session', 'Massage room', 450000, 'booking');
/* Straight in: the opening-hours check is not what is under test here. */
set local session_replication_role = replica;
insert into public.booking (id, reference, resource_id, merchant_id, starts_at, ends_at, status, guest_name,
                            source, total_cents, held_during)
values ('0d500000-0000-4000-8000-000000000402', 'NX-B-DASH1', '0d500000-0000-4000-8000-000000000401',
        '0d500000-0000-4000-8000-0000000000c4', now() - interval '30 minutes', now() + interval '30 minutes',
        'confirmed', 'Mary Njeri', 'app', 450000,
        tstzrange(now() - interval '30 minutes', now() + interval '30 minutes'));
set local session_replication_role = origin;

insert into public.incident (id, kind, severity, status, reported_by_type, description, happened_at, merchant_id)
values ('0d500000-0000-4000-8000-000000000501', 'guest_complaint', 'minor', 'open', 'staff',
        'Cold food', now() - interval '20 minutes', '0d500000-0000-4000-8000-0000000000c1');
insert into public.dispute (id, merchant_id, reason, status, opened_at, order_reference, amount_claimed_kes,
                            merchant_reply_due_at)
values ('0d500000-0000-4000-8000-000000000502', '0d500000-0000-4000-8000-0000000000c2', 'missing_item',
        'awaiting_merchant', now() - interval '3 hours', 'OPS-T-DONE', 500, now() + interval '21 hours');

-- ------------------------------------------------------------------ wiring

select is(
  (select count(*)::int from public.fn_wiring_check()
    where finding ~* '(rpc_operations|rpc_ops_incident|fn_ops_)'),
  0,
  'The wiring check finds nothing wrong with the operations functions');

select ok(
  not has_function_privilege('anon', 'public.rpc_operations_overview(date, date, text)', 'execute')
  and not has_function_privilege('anon',
    'public.rpc_operations_list(date, date, text, text, text, text, text, text, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_ops_incident_raise(text, text, text, text)', 'execute'),
  'Signed-out visitors cannot read operations or raise incidents');

select ok(
  not has_function_privilege('authenticated', 'public.fn_ops_rows(date, date)', 'execute'),
  'The row source is not callable directly');

select is(
  array[public.fn_ops_short_name('Amina Wanjiku'), public.fn_ops_short_name(' Peter  Otieno Akinyi '),
        public.fn_ops_short_name('Wanjiru'), coalesce(public.fn_ops_short_name(' '), 'null')],
  array['A. Wanjiku', 'P. Akinyi', 'Wanjiru', 'null'],
  'Customers read as an initial and a surname');

select is(public.fn_ops_kinds('nope'), null::text[], 'An unknown tab has no kinds');

-- ------------------------------------------------------------------ access

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"0d500000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_operations_overview(current_date - 1, current_date)$$,
  '42501', 'Only people who reach Orders or Live operations can see this.',
  'Someone without Orders or Live operations cannot read the figures');

select throws_ok(
  $$select public.rpc_operations_list(current_date - 1, current_date)$$,
  '42501', 'Only people who reach Orders or Live operations can see this.',
  'Nor the table');

select throws_ok(
  $$select public.rpc_ops_incident_raise('other', 'minor', 'Test', null)$$,
  '42501', 'Only operations staff can raise an incident here.',
  'Nor raise an incident');

-- ------------------------------------------------------------------- KPIs

select set_config('request.jwt.claims',
  '{"sub":"0d500000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

insert into t (k, v) select 'after',
  public.rpc_operations_overview(pg_temp.d0(), pg_temp.d1())::text;

create function pg_temp.added(p_key text) returns numeric language sql stable
  as $f$ select (a.v::jsonb -> 'kpis' -> p_key ->> 'value')::numeric
                - (b.v::jsonb -> 'kpis' -> p_key ->> 'value')::numeric
           from t a, t b where a.k = 'after' and b.k = 'before' $f$;

select is(pg_temp.added('orders'), 7::numeric,
  'Total Orders counts the seven orders placed in the period');
select is(pg_temp.added('bookings'), 5::numeric,
  'Bookings counts two stays, two experience days and a service booking; the host block is not one');
select is(pg_temp.added('deliveries'), 1::numeric,
  'Active Deliveries counts the order out with a rider, not the delivered one');
select is(pg_temp.added('guests'), 3::numeric,
  'In-house Guests counts the adults and child in the stay that is under way');
select is(pg_temp.added('incidents'), 2::numeric,
  'Open Incidents counts the open incident and the dispute awaiting the merchant');
select is(
  jsonb_array_length((select v::jsonb from t where k = 'after') -> 'kpis' -> 'orders' -> 'series'),
  30,
  'The trend line has one point per day of the period');

-- ------------------------------------------------------------------- rows

select is(
  (select (r -> 'rows' -> 0) - 'id' - 'starts_at' - 'ends_at' - 'eta_at' - 'href'
     from pg_temp.ops('all', 'ongoing', 'OPS-T-FOOD') r),
  jsonb_build_object('kind', 'food', 'ref', 'OPS-T-FOOD', 'customer', 'A. Wanjiku',
                     'party', 'Urban Bistro Dash', 'amount_cents', 234000, 'status', 'placed',
                     'status_label', 'Placed', 'tone', 'amber', 'bucket', 'ongoing', 'all_day', false,
                     'area', (select z.name from public.zone z where z.id = (select v::uuid from t where k = 'zone'))),
  'A live restaurant order with nobody on it reads Placed, never an invented Preparing');

select is(
  (select r -> 'rows' -> 0 ->> 'status' || '/' || (r -> 'rows' -> 0 ->> 'kind')
     from pg_temp.ops('all', 'ongoing', 'OPS-T-RIDER') r),
  'rider_assigned/delivery',
  'A shop order with a rider is a delivery with its rider assigned');

select is(
  (select r -> 'rows' -> 0 ->> 'status'
     from pg_temp.ops('all', 'pending', 'OPS-T-PAY') r),
  'awaiting_payment',
  'An M-Pesa order not yet paid is pending, awaiting payment');

select is(
  (select r -> 'rows' -> 0 ->> 'status'
     from pg_temp.ops('all', 'pending', 'OPS-T-LATER') r),
  'scheduled',
  'An order for tomorrow is pending, scheduled');

select is(
  (select r -> 'rows' -> 0 ->> 'status'
     from pg_temp.ops('all', 'completed', 'OPS-T-DONE') r),
  'delivered',
  'A delivered order is completed within the period');

select is(
  (select (r ->> 'total')::int
     from public.rpc_operations_list(pg_temp.d1(), pg_temp.d1(), 'all', 'completed', null, null, null,
                                     'OPS-T-DONE', 5, 0) r),
  0,
  'and not in a period that ended before it was delivered');

select is(
  (select r -> 'rows' -> 0 ->> 'status'
     from pg_temp.ops('all', 'cancelled', 'OPS-T-GONE') r),
  'cancelled',
  'A cancelled order is under Cancelled');

select is(
  (select r -> 'rows' -> 0 ->> 'kind'
     from pg_temp.ops('transfers', 'ongoing', 'OPS-T-CAR') r),
  'transfer',
  'An order from a transfer company is a transfer, under Transfers');

select is(
  (select r -> 'rows' -> 0 ->> 'status' || '/' || (r -> 'rows' -> 0 ->> 'customer')
     from pg_temp.ops('stays', 'ongoing', 'Riverside Stays Dash') r),
  'checked_in/Wanjiru',
  'The stay under way is checked in, with the first name the stay holds');

select is(
  (select r -> 'rows' -> 0 ->> 'status'
     from pg_temp.ops('stays', 'pending', 'Riverside Stays Dash') r),
  'booked',
  'The stay that has not started is pending, booked');

select is(
  (select sum((r ->> 'total')::int)
     from unnest(array['ongoing', 'pending', 'completed', 'cancelled']) b,
          lateral pg_temp.ops('stays', b, 'Riverside Stays Dash') r),
  2::bigint,
  'The host''s date block is not a stay');

select is(
  (select (r -> 'rows' -> 0 ->> 'status') || '/' || (r -> 'rows' -> 0 ->> 'all_day')
     from pg_temp.ops('experiences', 'ongoing', 'P. Akinyi') r),
  'on_the_day/true',
  'A paid experience day happening today is on the day, a whole day with no time');

select is(
  (select r -> 'rows' -> 0 ->> 'status'
     from pg_temp.ops('experiences', 'pending', 'G. Mwangi') r),
  'new_request',
  'A request the desk has not answered is pending');

select is(
  (select (r -> 'rows' -> 0 ->> 'status') || '/' || (r -> 'rows' -> 0 ->> 'customer')
     from pg_temp.ops('services', 'ongoing', 'NX-B-DASH1') r),
  'in_progress/M. Njeri',
  'A confirmed service booking under way is in progress');

select is(
  (pg_temp.ops('incidents', 'pending', 'Urban Bistro Dash') -> 'rows' -> 0 ->> 'kind')
    || '/' || (pg_temp.ops('incidents', 'ongoing', 'OPS-T-DONE') -> 'rows' -> 0 ->> 'kind'),
  'incident/dispute',
  'Incidents & Disputes shows the open incident and the dispute awaiting the merchant');

select is(
  (select (r ->> 'total')::int
     from pg_temp.ops('all', 'pending', 'Guest complaint') r),
  0,
  'All Operations leaves incidents and disputes to their own view');

select is(
  (select r -> 'rows' -> 0 ->> 'ref'
     from pg_temp.ops('food', 'ongoing', 'OPS-T-', (select v from t where k = 'zone')) r),
  'OPS-T-FOOD',
  'The Area filter keeps the order in that zone');

select ok(
  (select v::jsonb -> 'statuses' from t where k = 'after') @> '[{"key": "awaiting_payment", "label": "Awaiting payment"}]',
  'The Status filter lists the statuses that are there');

select ok(
  exists (select 1
            from jsonb_array_elements(public.rpc_operations_overview(pg_temp.d0(), pg_temp.d1(), 'stays') -> 'points') p
           where p ->> 'kind' = 'stay' and p ->> 'label' like '%Riverside Stays Dash'),
  'The map shows the stay under way where its property is');

select throws_ok(
  $$select public.rpc_operations_overview(current_date - 1, current_date, 'nope')$$,
  '22023', 'There is no such view.', 'An unknown tab is refused');

select throws_ok(
  $$select public.rpc_operations_list(current_date - 1, current_date, 'all', 'all')$$,
  '22023', 'Choose ongoing, pending, completed or cancelled.', 'An unknown status bar is refused');

select throws_ok(
  $$select public.rpc_operations_overview(current_date - 500, current_date)$$,
  '22023', 'Choose a period of 400 days or less.', 'A period longer than 400 days is refused');

-- ---------------------------------------------------------- raise incident

select throws_ok(
  $$select public.rpc_ops_incident_raise('guest_complaint', 'minor', '  ', null)$$,
  '22023', 'Say what happened.', 'An incident needs a description');

select throws_ok(
  $$select public.rpc_ops_incident_raise('guest_complaint', 'minor', 'Late', 'OPS-NOPE')$$,
  'P0002', 'No order has the reference OPS-NOPE.', 'An unknown order reference is refused');

select lives_ok(
  $$insert into t (k, v) select 'raised',
      public.rpc_ops_incident_raise('rider_complaint', 'major', 'Rider was rude', 'ops-t-rider')::text$$,
  'Operations staff raise an incident against an order');

reset role;

select is(
  (select rider_id::text || '/' || reported_by_type || '/' || status::text || '/' || order_reference
     from public.incident where id = (select v::uuid from t where k = 'raised')),
  '0d500000-0000-4000-8000-0000000000f1/staff/open/OPS-T-RIDER',
  'It links the order''s rider, is recorded as raised by staff, and starts open');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'incident.opened' and actor_id = '0d500000-0000-4000-8000-0000000000b1'
      and target_id = (select v::uuid from t where k = 'raised')),
  1,
  'It is on the audit log against the person who raised it');

select * from finish();
rollback;
