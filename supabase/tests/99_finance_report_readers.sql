-- Finance → Reports: the Riders and Customers readers.
--
-- Only people who reach Finance read them; test deliveries are left out and
-- shillings come back as cents; days are Nairobi days; customers are guests
-- who paid for an order or a stay, told apart by guest or phone, never
-- named, and new only in the period of their first payment ever.
--
-- The period is the first week of February 2020 (and the week before it),
-- so nothing else in the database lands in it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

insert into t (k, v) values ('nbo', (select id::text from public.city where slug = 'nairobi'));

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('9f700000-0000-4000-8000-0000000000a1'::uuid, 'fin.reports99@test.local'),
  ('9f700000-0000-4000-8000-0000000000a2'::uuid, 'riders.reports99@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('9f700000-0000-4000-8000-0000000000b1', '9f700000-0000-4000-8000-0000000000a1',
   'fin.reports99@test.local', 'Finance Reports 99'),
  ('9f700000-0000-4000-8000-0000000000b2', '9f700000-0000-4000-8000-0000000000a2',
   'riders.reports99@test.local', 'Riders Reports 99');

/* Finance grants need a second approver. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a',
       case when g.role_key = 'finance' then '00000000-0000-4000-8000-00000000000b'::uuid end
from (values
  ('9f700000-0000-4000-8000-0000000000b1'::uuid, 'finance'),
  ('9f700000-0000-4000-8000-0000000000b2'::uuid, 'rider_ops')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

-- ------------------------------------------------------------------ riders

insert into public.rider (id, first_name, last_name, phone, city_id, vehicle) values
  ('9f700000-0000-4000-8000-0000000000c1', 'Kevin', 'Otieno', '+254799770101',
   (select v::uuid from t where k = 'nbo'), 'motorbike'),
  ('9f700000-0000-4000-8000-0000000000c2', 'Mary', 'Njeri', '+254799770102',
   (select v::uuid from t where k = 'nbo'), 'motorbike'),
  ('9f700000-0000-4000-8000-0000000000c3', 'Tess', 'Only', '+254799770103',
   (select v::uuid from t where k = 'nbo'), 'motorbike');

/* No order reference, so nothing posts to the ledger. Totals are the
   lines added up: base + distance + waiting + bonuses + tip − penalty. */
insert into public.rider_earning (rider_id, base_kes, distance_kes, waiting_kes, pickup_bonus_kes,
                                  peak_bonus_kes, tip_kes, penalty_kes, total_kes,
                                  cash_collected_kes, is_test, earned_at)
values
  ('9f700000-0000-4000-8000-0000000000c1', 200, 30, 0, 10, 5, 20, 15, 250, 1200, false,
   '2020-02-04 10:00+03'),
  ('9f700000-0000-4000-8000-0000000000c1', 220, 40, 10, 0, 20, 30, 20, 300, 0, false,
   '2020-02-04 18:30+03'),
  ('9f700000-0000-4000-8000-0000000000c1', 9000, 0, 0, 0, 0, 999, 0, 9999, 5000, true,
   '2020-02-05 12:00+03'),
  ('9f700000-0000-4000-8000-0000000000c2', 150, 30, 0, 0, 0, 0, 0, 180, 800, false,
   '2020-02-06 09:00+03'),
  /* Late on the last day in Nairobi (20:30 UTC): in the period. */
  ('9f700000-0000-4000-8000-0000000000c2', 50, 0, 0, 0, 0, 0, 0, 50, 0, false,
   '2020-02-09 23:30+03'),
  /* Just after midnight in Nairobi, still the 9th in UTC: not in it. */
  ('9f700000-0000-4000-8000-0000000000c2', 60, 0, 0, 0, 0, 0, 0, 60, 0, false,
   '2020-02-10 00:30+03'),
  ('9f700000-0000-4000-8000-0000000000c3', 777, 0, 0, 0, 0, 0, 0, 777, 0, true,
   '2020-02-06 13:00+03'),
  /* The week before. */
  ('9f700000-0000-4000-8000-0000000000c1', 100, 0, 0, 0, 0, 0, 0, 100, 0, false,
   '2020-01-30 12:00+03');

-- --------------------------------------------------------------- customers

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
                             contact_email, city_id)
values ('9f700000-0000-4000-8000-0000000000d1', 'Report Grill 99 Limited', 'Report Grill 99',
        'restaurant', 'Owner 99', '+254712770990', 'owner.reports99@shop.example',
        (select v::uuid from t where k = 'nbo'));

insert into public.guest (id, phone, name) values
  ('9f700000-0000-4000-8000-0000000000e1', '+254711770401', 'Amina Wanjiku'),
  ('9f700000-0000-4000-8000-0000000000e2', '+254711770402', 'Brian Kiptoo');

insert into public.order (id, reference, guest_id, merchant_id, city_id, dropoff_label, payment_method)
select o.id, o.reference, o.guest, '9f700000-0000-4000-8000-0000000000d1',
       (select v::uuid from t where k = 'nbo'), 'Somewhere in Kilimani', 'mpesa_stk'
from (values
  ('9f700000-0000-4000-8000-000000000101'::uuid, 'RPT-T-G1-OLD', '9f700000-0000-4000-8000-0000000000e1'::uuid),
  ('9f700000-0000-4000-8000-000000000102', 'RPT-T-G1', '9f700000-0000-4000-8000-0000000000e1'),
  ('9f700000-0000-4000-8000-000000000103', 'RPT-T-G2', '9f700000-0000-4000-8000-0000000000e2'),
  ('9f700000-0000-4000-8000-000000000104', 'RPT-T-P1-OLD', null),
  ('9f700000-0000-4000-8000-000000000105', 'RPT-T-P1', null),
  ('9f700000-0000-4000-8000-000000000106', 'RPT-T-ANON', null)
) as o (id, reference, guest);

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('9f700000-0000-4000-8000-000000000201', 'multi_unit', 'Report Host 99', '+254700770201',
        (select v::uuid from t where k = 'nbo'), 'live', now(), now());
insert into public.stay (id, host_id, guest_first_name, check_in, check_out, source, status, quote_total_kes)
values ('9f700000-0000-4000-8000-000000000202', '9f700000-0000-4000-8000-000000000201', 'Amina',
        '2020-02-10 14:00+03', '2020-02-12 10:00+03', 'nexg', 'booked', 9000);

insert into public.featured_booking (id, merchant_id, placement_kind)
values ('9f700000-0000-4000-8000-000000000301', '9f700000-0000-4000-8000-0000000000d1', 'homepage');

insert into public.payment (reference, intent, order_id, stay_id, booking_id, merchant_id, guest_id,
                            amount_cents, provider, provider_ref, channel, state, paid_at, created_via,
                            payer_phone)
values
  /* G1 first paid in January, well before both weeks. */
  ('PAY-RPT-G1-OLD', 'order', '9f700000-0000-4000-8000-000000000101', null, null, null,
   '9f700000-0000-4000-8000-0000000000e1', 100000, 'mpesa', 'RPT99G1OLD', 'mpesa', 'paid',
   '2020-01-15 12:00+03', 'guest_checkout', '+254711770401'),
  ('PAY-RPT-G1', 'order', '9f700000-0000-4000-8000-000000000102', null, null, null,
   '9f700000-0000-4000-8000-0000000000e1', 250000, 'mpesa', 'RPT99G1', 'mpesa', 'paid',
   '2020-02-04 13:00+03', 'guest_checkout', '+254711770401'),
  ('PAY-RPT-G1-STAY', 'stay', null, '9f700000-0000-4000-8000-000000000202', null, null,
   '9f700000-0000-4000-8000-0000000000e1', 900000, 'mpesa', 'RPT99G1STAY', 'mpesa', 'paid',
   '2020-02-05 09:00+03', 'guest_checkout', null),
  /* G2 pays for the first time ever in the period. */
  ('PAY-RPT-G2', 'order', '9f700000-0000-4000-8000-000000000103', null, null, null,
   '9f700000-0000-4000-8000-0000000000e2', 180000, 'mpesa', 'RPT99G2', 'mpesa', 'paid',
   '2020-02-06 19:00+03', 'guest_checkout', '+254711770402'),
  /* A phone with no guest: the week before, then again, written differently. */
  ('PAY-RPT-P1-OLD', 'order', '9f700000-0000-4000-8000-000000000104', null, null, null, null,
   50000, 'mpesa', 'RPT99P1OLD', 'mpesa', 'paid', '2020-01-30 12:00+03', 'guest_checkout',
   '0711 770 403'),
  ('PAY-RPT-P1', 'order', '9f700000-0000-4000-8000-000000000105', null, null, null, null,
   70000, 'mpesa', 'RPT99P1', 'mpesa', 'paid', '2020-02-07 12:00+03', 'guest_checkout',
   '+254711770403'),
  /* Neither guest nor phone: in the totals, not a customer. */
  ('PAY-RPT-ANON', 'order', '9f700000-0000-4000-8000-000000000106', null, null, null, null,
   40000, 'mpesa', 'RPT99ANON', 'mpesa', 'paid', '2020-02-08 12:00+03', 'guest_checkout', null),
  /* A merchant and a rider paying NexG: not customers. */
  ('PAY-RPT-FEAT', 'featured_slot', null, null, '9f700000-0000-4000-8000-000000000301',
   '9f700000-0000-4000-8000-0000000000d1', null, 500000, 'mpesa', 'RPT99FEAT', 'mpesa', 'paid',
   '2020-02-05 12:00+03', 'merchant_dashboard', '+254711770404'),
  ('PAY-RPT-FLOAT', 'rider_float', null, null, null, null, null, 300000, 'mpesa', 'RPT99FLOAT',
   'mpesa', 'paid', '2020-02-05 12:00+03', 'rider_app', '+254711770405');

/* Not paid: left out. */
insert into public.payment (reference, intent, order_id, guest_id, amount_cents, provider, state,
                            created_via, payer_phone, created_at)
values ('PAY-RPT-G2-PEND', 'order', '9f700000-0000-4000-8000-000000000103',
        '9f700000-0000-4000-8000-0000000000e2', 990000, 'mpesa', 'pending', 'guest_checkout',
        '+254711770402', '2020-02-06 20:00+03');

-- ------------------------------------------------------------------ wiring

select has_function('public', 'rpc_finance_report_riders', array['date', 'date'],
  'The riders reader exists');
select has_function('public', 'rpc_finance_report_customers', array['date', 'date'],
  'The customers reader exists');

select ok(
  not has_function_privilege('anon', 'public.rpc_finance_report_riders(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_finance_report_customers(date, date)', 'execute'),
  'Signed-out visitors cannot read either report');

select ok(
  has_function_privilege('authenticated', 'public.rpc_finance_report_riders(date, date)', 'execute')
  and has_function_privilege('authenticated', 'public.rpc_finance_report_customers(date, date)', 'execute'),
  'Signed-in staff may call them; the readers decide who sees anything');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ~ 'rpc_finance_report_'),
  0,
  'The wiring check finds nothing wrong with the report readers');

-- ------------------------------------------------------------------ access

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9f700000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_finance_report_riders('2020-02-03', '2020-02-09')$$,
  '42501', 'Only people who reach Finance can see this.',
  'Staff outside Finance cannot read rider earnings');

select throws_ok(
  $$select public.rpc_finance_report_customers('2020-02-03', '2020-02-09')$$,
  '42501', 'Only people who reach Finance can see this.',
  'or customers');

select set_config('request.jwt.claims',
  '{"sub":"9f700000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_finance_report_customers(current_date - 900, current_date)$$,
  '22023', 'Choose a period of two years or less.',
  'A period longer than two years is refused');

insert into t (k, v) values
  ('riders', public.rpc_finance_report_riders('2020-02-03', '2020-02-09')::text),
  ('customers', public.rpc_finance_report_customers('2020-02-03', '2020-02-09')::text);

reset role;

create function pg_temp.r() returns jsonb language sql stable
  as $f$ select v::jsonb from t where k = 'riders' $f$;
create function pg_temp.c() returns jsonb language sql stable
  as $f$ select v::jsonb from t where k = 'customers' $f$;

-- ------------------------------------------------------------------ shapes

select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.r()) k),
  array['kpis', 'riders', 'series'],
  'Finance reads the riders report: KPIs, a daily series and the riders');

select ok(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.r() -> 'kpis') k)
    = array['active_riders', 'avg_per_delivery_cents', 'cash_collected_cents', 'deliveries',
            'earnings_cents', 'tips_cents']
  and (select bool_and(v ? 'now' and v ? 'before') from jsonb_each(pg_temp.r() -> 'kpis') e (k, v)),
  'Every rider KPI has the period and the one before it');

select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.c()) k),
  array['by_intent', 'kpis', 'series', 'top'],
  'Finance reads the customers report: KPIs, a daily series, the top customers and what they paid for');

select ok(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.c() -> 'kpis') k)
    = array['avg_spend_cents', 'customers', 'new_customers', 'repeat_rate_pct',
            'returning_customers', 'total_paid_cents', 'unidentified_payments']
  and (select bool_and(v ? 'now' and v ? 'before') from jsonb_each(pg_temp.c() -> 'kpis') e (k, v)),
  'Every customer KPI has the period and the one before it');

-- ----------------------------------------------------------------- riders

select is(
  (pg_temp.r() -> 'kpis' -> 'deliveries' ->> 'now')::int,
  4,
  'Test deliveries are left out of the count');

select is(
  (pg_temp.r() -> 'kpis' -> 'earnings_cents' ->> 'now')::bigint,
  78000::bigint,
  'Earnings come back in cents: KES 780 is 78,000');

select is(
  pg_temp.r() -> 'kpis',
  '{"active_riders": {"now": 2, "before": 1},
    "deliveries": {"now": 4, "before": 1},
    "earnings_cents": {"now": 78000, "before": 10000},
    "tips_cents": {"now": 5000, "before": 0},
    "cash_collected_cents": {"now": 200000, "before": 0},
    "avg_per_delivery_cents": {"now": 19500, "before": 10000}}'::jsonb,
  'Active riders, tips, cash collected and the average per delivery, against the week before');

select ok(
  not exists (select 1 from jsonb_array_elements(pg_temp.r() -> 'riders') x
               where x ->> 'id' = '9f700000-0000-4000-8000-0000000000c3'),
  'A rider with only test deliveries is not listed');

select is(
  pg_temp.r() -> 'riders' -> 0,
  '{"id": "9f700000-0000-4000-8000-0000000000c1", "name": "Kevin Otieno", "deliveries": 2,
    "earnings_cents": 55000, "tips_cents": 5000, "bonus_cents": 3500, "penalty_cents": 3500,
    "cash_collected_cents": 120000}'::jsonb,
  'The rider who earned most comes first, with tips, bonuses, penalties and cash in cents');

select ok(
  jsonb_array_length(pg_temp.r() -> 'series') = 7
  and (select sum((x ->> 'earnings_cents')::bigint) from jsonb_array_elements(pg_temp.r() -> 'series') x) = 78000
  and (select x ->> 'earnings_cents' || '/' || (x ->> 'deliveries')
         from jsonb_array_elements(pg_temp.r() -> 'series') x where x ->> 'day' = '2020-02-09') = '5000/1',
  'One point per day; a delivery late on the last Nairobi day counts, one after midnight does not');

-- -------------------------------------------------------------- customers

select is(
  pg_temp.c() -> 'kpis',
  '{"customers": {"now": 3, "before": 1},
    "new_customers": {"now": 1, "before": 1},
    "returning_customers": {"now": 2, "before": 0},
    "repeat_rate_pct": {"now": 33.3, "before": 0.0},
    "avg_spend_cents": {"now": 466667, "before": 50000},
    "total_paid_cents": {"now": 1440000, "before": 50000},
    "unidentified_payments": {"now": 1, "before": 0}}'::jsonb,
  'Three customers, one new; the payment with no guest or phone counts in the total only');

select is(
  (select jsonb_agg(x - 'day' order by x ->> 'day')
     from jsonb_array_elements(pg_temp.c() -> 'series') x
    where x ->> 'day' in ('2020-02-04', '2020-02-06', '2020-02-07')),
  '[{"new": 0, "returning": 1}, {"new": 1, "returning": 0}, {"new": 0, "returning": 1}]'::jsonb,
  'A guest who paid before is returning; a first payment ever is new; one phone however it is written');

select ok(
  jsonb_array_length(pg_temp.c() -> 'top') = 3
  and (select bool_and(x ->> 'label' ~ '^Customer ···[0-9]{3}$')
         from jsonb_array_elements(pg_temp.c() -> 'top') x),
  'Every top customer is labelled "Customer ···" and three digits');

select is(
  (pg_temp.c() -> 'top' -> 0) - 'first_paid_at',
  '{"label": "Customer ···401", "payments": 2, "spend_cents": 1150000}'::jsonb,
  'The biggest spender is masked to the last three digits of their phone');

select is(
  ((pg_temp.c() -> 'top' -> 0 ->> 'first_paid_at')::timestamptz),
  '2020-01-15 12:00+03'::timestamptz,
  'and shows when they first paid, before the period');

select ok(
  (select bool_and(position(s in pg_temp.c()::text) = 0)
     from unnest(array['711770401', '711770402', '711770403', '711770404', '711770405',
                       '9f700000-0000-4000-8000-0000000000e1', '9f700000-0000-4000-8000-0000000000e2',
                       'Wanjiku', 'Kiptoo']) s),
  'No phone number, guest id or name appears anywhere in the report');

select ok(
  not exists (select 1 from jsonb_array_elements(pg_temp.c() -> 'top') x
               where x ->> 'label' ~ '40[45]$'),
  'A merchant''s featured slot and a rider''s float top-up are not customers');

select is(
  pg_temp.c() -> 'by_intent',
  '[{"intent": "order", "payments": 4, "spend_cents": 540000},
    {"intent": "stay", "payments": 1, "spend_cents": 900000}]'::jsonb,
  'Spend by what was paid for: orders and stays only');

select * from finish();
rollback;
