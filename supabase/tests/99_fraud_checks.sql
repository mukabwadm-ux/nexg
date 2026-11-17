-- Fraud checks: one queue of flags, raised by checks that run on their own,
-- confirmed or dismissed by a person.
--
-- Each check finds what it is for and raises it once; flags carry no
-- coordinates or device tokens; Finance reviews everything, rider ops the
-- riders they work; nobody reviews a flag about their own expense; a
-- dismissal needs a reason; a confirmed rider flag gives a strike; and every
-- decision and rule change is on the audit log.

begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

/* The limits these checks are tested against, whatever this database was set to. */
update public.fraud_rule r
   set enabled = true, params = r.params || d.params
  from (values
    ('gps_jump', '{"km": 2, "seconds": 60}'::jsonb),
    ('delivered_far_from_pin', '{"metres": 300, "fix_minutes": 2}'),
    ('delivered_too_fast', '{"minutes": 3, "min_km": 1}'),
    ('cash_marked_mpesa', '{"grace_minutes": 30}'),
    ('offer_farming', '{"times": 3, "days": 7}'),
    ('refund_heavy', '{"refunds": 3, "days": 30}'),
    ('pod_refusals', '{"times": 2, "days": 60}'),
    ('expense_repeat', '{"days": 7}')
  ) as d (kind, params)
 where r.kind = d.kind;
update public.fraud_rule set enabled = true;

insert into t (k, v) values ('nbo', (select id::text from public.city where slug = 'nairobi'));
insert into t (k, v) select 'branch', (
  select mb.id::text from public.merchant_branch mb
    join public.merchant m on m.id = mb.merchant_id
   where m.city_id = (select v::uuid from t where k = 'nbo') limit 1);
insert into t (k, v) select 'merchant', (
  select merchant_id::text from public.merchant_branch where id = (select v::uuid from t where k = 'branch'));

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('f7aa0000-0000-4000-8000-0000000000a1'::uuid, 'fin.one.fraud@test.local'),
  ('f7aa0000-0000-4000-8000-0000000000a2'::uuid, 'fin.two.fraud@test.local'),
  ('f7aa0000-0000-4000-8000-0000000000a3'::uuid, 'riders.fraud@test.local'),
  ('f7aa0000-0000-4000-8000-0000000000a4'::uuid, 'support.fraud@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('f7aa0000-0000-4000-8000-0000000000b1', 'f7aa0000-0000-4000-8000-0000000000a1', 'fin.one.fraud@test.local', 'Finance One'),
  ('f7aa0000-0000-4000-8000-0000000000b2', 'f7aa0000-0000-4000-8000-0000000000a2', 'fin.two.fraud@test.local', 'Finance Two'),
  ('f7aa0000-0000-4000-8000-0000000000b3', 'f7aa0000-0000-4000-8000-0000000000a3', 'riders.fraud@test.local', 'Rider Ops'),
  ('f7aa0000-0000-4000-8000-0000000000b4', 'f7aa0000-0000-4000-8000-0000000000a4', 'support.fraud@test.local', 'Support Desk');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a',
       case when g.role_key = 'finance' then '00000000-0000-4000-8000-00000000000b'::uuid end
from (values
  ('f7aa0000-0000-4000-8000-0000000000b1'::uuid, 'finance'),
  ('f7aa0000-0000-4000-8000-0000000000b2'::uuid, 'finance'),
  ('f7aa0000-0000-4000-8000-0000000000b3'::uuid, 'rider_ops'),
  ('f7aa0000-0000-4000-8000-0000000000b4'::uuid, 'support')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

insert into public.rider (id, first_name, last_name, phone, city_id, vehicle) values
  ('f7aa0000-0000-4000-8000-0000000000c1', 'Fast', 'Rider', '+254799000991', (select v::uuid from t where k = 'nbo'), 'motorbike'),
  ('f7aa0000-0000-4000-8000-0000000000c2', 'Cash', 'Rider', '+254799000992', (select v::uuid from t where k = 'nbo'), 'motorbike'),
  ('f7aa0000-0000-4000-8000-0000000000c3', 'Third', 'Rider', '+254799000993', (select v::uuid from t where k = 'nbo'), 'motorbike');

insert into public.guest (id, phone, name)
values ('f7aa0000-0000-4000-8000-0000000000d1', '+254711222345', 'Fraud Test Guest');

-- ------------------------------------------------------------------ orders

insert into public.order (
  id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label, dropoff_point,
  stage, handed_to, payment_method, payment_status, subtotal_cents, delivery_fee_cents,
  service_fee_cents, total_cents, currency, rider_id, picked_up_at, delivered_at,
  cancelled_at, cancel_reason_code)
select o.id, o.reference, 'f7aa0000-0000-4000-8000-0000000000d1',
       (select v::uuid from t where k = 'merchant'), (select v::uuid from t where k = 'branch'),
       (select v::uuid from t where k = 'nbo'), 'web', 'Somewhere in Kilimani',
       extensions.st_setsrid(extensions.st_makepoint(o.lng, o.lat), 4326)::extensions.geography,
       o.stage::public.order_stage, o.handed::public.handoff_target,
       o.method::public.order_payment_method, o.status::public.order_payment_status,
       o.cents, 0, 0, o.cents, 'KES', o.rider_id, o.picked, o.delivered, o.cancelled, o.reason
from (values
  /* closed two minutes after pickup */
  ('f7aa0000-0000-4000-8000-0000000000e1'::uuid, 'FRD-FAST', 'delivered', 'guest', 'card', 'authorised', 150000,
   'f7aa0000-0000-4000-8000-0000000000c1'::uuid, now() - interval '10 minutes', now() - interval '8 minutes',
   null::timestamptz, null, 36.80, -1.29),
  /* cash order delivered two hours ago, cash never recorded */
  ('f7aa0000-0000-4000-8000-0000000000e2', 'FRD-UNPAID', 'delivered', 'guest', 'cash_on_delivery', 'pending', 220000,
   'f7aa0000-0000-4000-8000-0000000000c2', now() - interval '3 hours', now() - interval '2 hours', null, null, 36.80, -1.29),
  /* confirmed delivered by staff, no rider */
  ('f7aa0000-0000-4000-8000-0000000000e3', 'FRD-BYHAND', 'delivered', 'guest', 'cash_on_delivery', 'pending', 90000,
   null, null, now() - interval '5 minutes', null, null, 36.80, -1.29),
  /* two cash orders turned away after pickup */
  ('f7aa0000-0000-4000-8000-0000000000e4', 'FRD-REFUSE1', 'cancelled', null, 'cash_on_delivery', 'pending', 80000,
   'f7aa0000-0000-4000-8000-0000000000c3', now() - interval '3 days', null, now() - interval '3 days', 'guest_unreachable', 36.80, -1.29),
  ('f7aa0000-0000-4000-8000-0000000000e5', 'FRD-REFUSE2', 'cancelled', null, 'cash_on_delivery', 'pending', 70000,
   'f7aa0000-0000-4000-8000-0000000000c3', now() - interval '2 days', null, now() - interval '2 days', 'guest_cancelled', 36.80, -1.29),
  /* three orders that were refunded */
  ('f7aa0000-0000-4000-8000-0000000000e6', 'FRD-RF1', 'delivered', 'guest', 'card', 'authorised', 50000,
   null, null, now() - interval '4 days', null, null, 36.80, -1.29),
  ('f7aa0000-0000-4000-8000-0000000000e7', 'FRD-RF2', 'delivered', 'guest', 'card', 'authorised', 50000,
   null, null, now() - interval '3 days', null, null, 36.80, -1.29),
  ('f7aa0000-0000-4000-8000-0000000000e8', 'FRD-RF3', 'delivered', 'guest', 'card', 'authorised', 50000,
   null, null, now() - interval '2 days', null, null, 36.80, -1.29),
  /* on its way, pin far from where the rider will be */
  ('f7aa0000-0000-4000-8000-0000000000e9', 'FRD-FAR', 'picked_up', null, 'card', 'authorised', 60000,
   'f7aa0000-0000-4000-8000-0000000000c1', now() - interval '15 minutes', null, null, null, 36.90, -1.30)
) as o (id, reference, stage, handed, method, status, cents, rider_id, picked, delivered, cancelled, reason, lng, lat);

insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, at)
values ('f7aa0000-0000-4000-8000-0000000000e3', 'delivered', 'Delivered · confirmed by staff',
        'Guest called to say it arrived · handed to guest', 'staff',
        'f7aa0000-0000-4000-8000-0000000000b4', now() - interval '5 minutes');

insert into public.refund (order_id, amount_cents, method, reason_code, reason_text, requested_by,
                           approved_by, status, requested_at)
select o.id, 20000, 'original', 'missing_item', 'Item missing', 'f7aa0000-0000-4000-8000-0000000000b1',
       'f7aa0000-0000-4000-8000-0000000000b2', 'approved', now() - make_interval(days => o.n)
from (values ('f7aa0000-0000-4000-8000-0000000000e6'::uuid, 3),
             ('f7aa0000-0000-4000-8000-0000000000e7'::uuid, 2),
             ('f7aa0000-0000-4000-8000-0000000000e8'::uuid, 1)) as o (id, n);

/* A rider who accepted a job and was moved off it. */
insert into dispatch.job (id, order_id, city_id, pickup_label, dropoff_label, state, ended_at)
values ('f7aa0000-0000-4000-8000-0000000009a1', 'f7aa0000-0000-4000-8000-0000000000e2',
        (select v::uuid from t where k = 'nbo'), 'The shop', 'The guest', 'completed', now());
insert into dispatch.offer (job_id, round, rank, rider_id, outcome, responded_at)
values ('f7aa0000-0000-4000-8000-0000000009a1', 1, 1, 'f7aa0000-0000-4000-8000-0000000000c3',
        'accepted', now() - interval '3 hours');
insert into dispatch.action (job_id, kind, params, reason)
values ('f7aa0000-0000-4000-8000-0000000009a1', 'reassign',
        jsonb_build_object('from_rider_id', 'f7aa0000-0000-4000-8000-0000000000c3',
                           'to_rider_id', 'f7aa0000-0000-4000-8000-0000000000c2'),
        'Stopped answering');

-- ---------------------------------------------------------- money and phones

/* One M-Pesa code: on a payment and its prompt (one record), then typed again for a rider kit. */
insert into public.payment (id, reference, intent, amount_cents, provider, provider_ref, channel, state,
                            paid_at, created_via, payer_phone, provider_receipt)
values ('f7aa0000-0000-4000-8000-0000000001a1', 'PAY-FRAUD-1', 'rider_float', 250000, 'mpesa',
        'ws_CO_fraud_1', 'mpesa', 'paid', now(), 'rider_app', '+254799000991', 'QAB1CD2EF3');
insert into public.payment_prompt (payment_id, checkout_request_id, phone, receipt, resolved_at,
                                   resolved_via, outcome, result_code)
values ('f7aa0000-0000-4000-8000-0000000001a1', 'ws_CO_fraud_1', '254799000991', 'QAB1CD2EF3', now(),
        'callback', 'paid', 0);

insert into public.rider_kit_order (rider_id, hand_over, price_kes, status, paid_at, paid_amount_kes,
                                    paid_method, paid_reference, paid_recorded_by)
values ('f7aa0000-0000-4000-8000-0000000000c3', 'collect', 2500, 'paid', now(), 2500, 'mpesa',
        'qab1 cd2ef3', 'f7aa0000-0000-4000-8000-0000000000b3'),
       ('f7aa0000-0000-4000-8000-0000000000c1', 'collect', 2500, 'paid', now(), 2500, 'mpesa',
        '12345', 'f7aa0000-0000-4000-8000-0000000000b3');

insert into public.rider_device (rider_id, platform, push_token) values
  ('f7aa0000-0000-4000-8000-0000000000c1', 'android', 'tok-fraud-shared-phone'),
  ('f7aa0000-0000-4000-8000-0000000000c2', 'android', 'tok-fraud-shared-phone');

/* The same bill twice (same receipt file, payee and amount), and a self-approval. */
insert into public.fin_office_expense (id, spent_on, description, category, payee, amount_cents, status,
                                       submitted_by, receipt_path, decided_by, decided_at)
values
  ('f7aa0000-0000-4000-8000-0000000000f1', current_date - 3, 'Printer paper', 'office_supplies',
   'Acme Supplies', 500000, 'submitted', 'f7aa0000-0000-4000-8000-0000000000b1',
   'f7aa0000-0000-4000-8000-0000000000a1/receipt-a.pdf', null, null),
  ('f7aa0000-0000-4000-8000-0000000000f2', current_date - 1, 'Printer paper again', 'office_supplies',
   ' acme supplies', 500000, 'submitted', 'f7aa0000-0000-4000-8000-0000000000b1',
   'f7aa0000-0000-4000-8000-0000000000a1/receipt-a.pdf', null, null),
  ('f7aa0000-0000-4000-8000-0000000000f3', current_date - 2, 'Team lunch', 'other', 'Java House',
   300000, 'approved', 'f7aa0000-0000-4000-8000-0000000000b2', null,
   'f7aa0000-0000-4000-8000-0000000000b2', now());

-- ------------------------------------------------------------------ wiring

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('fraud_rule', 'fraud_signal', 'fraud_check_state')
      and c.relrowsecurity),
  3,
  'The fraud tables have row-level security');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ilike '%fraud%'),
  0,
  'The wiring check finds nothing wrong with the fraud checks');

select is(
  (select count(*)::int from (
     select distinct m[1] as action
     from pg_proc p
     cross join lateral regexp_matches(p.prosrc, '''(fraud\.[a-z_]+)''', 'g') as m
     where p.proname like 'rpc\_fraud\_%') used
   where not exists (select 1 from audit.action_registry r where r.action = used.action)),
  0,
  'Every action the fraud functions log is in the audit registry');

select ok(
  not has_function_privilege('anon', 'public.rpc_fraud_overview(integer)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_fraud_flag_decide(uuid, boolean, text)', 'execute'),
  'Signed-out visitors cannot read or review flags');

select ok(
  not has_function_privilege('authenticated', 'public.fn_fraud_sweep()', 'execute')
  and not has_function_privilege('authenticated',
    'public.fn_fraud_raise(text, text, text, uuid, text, text, jsonb, uuid, text, bigint)', 'execute'),
  'Nobody signed in can run the sweep or raise a flag directly');

select is(
  (select count(*)::int from public.fraud_rule),
  15,
  'Fifteen checks are defined');

select is(
  (select automated from public.fraud_rule where kind = 'plate_photo_mismatch'),
  false,
  'The plate photo check is marked as one people apply by hand');

-- ------------------------------------------------- checks that need the moment

update public.rider
   set last_location = extensions.st_setsrid(extensions.st_makepoint(36.8075, -1.2650), 4326)::extensions.geography,
       last_location_at = now() - interval '30 seconds'
 where id = 'f7aa0000-0000-4000-8000-0000000000c1';
update public.rider
   set last_location = extensions.st_setsrid(extensions.st_makepoint(36.8500, -1.2650), 4326)::extensions.geography,
       last_location_at = now() - interval '10 seconds'
 where id = 'f7aa0000-0000-4000-8000-0000000000c1';

select is(
  (select summary from public.fraud_signal where kind = 'gps_jump'
     and rider_id = 'f7aa0000-0000-4000-8000-0000000000c1'),
  '4.7 km in 20 seconds',
  'Two positions 4.7 km apart, 20 seconds apart, raise a GPS jump');

update public.order set delivered_at = now() where id = 'f7aa0000-0000-4000-8000-0000000000e9';

select ok(
  (select summary from public.fraud_signal where kind = 'delivered_far_from_pin'
     and order_reference = 'FRD-FAR') ~ '^Order FRD-FAR was marked delivered [0-9.]+ km from the drop-off pin$',
  'A delivery confirmed kilometres from the pin is flagged at that moment');

-- ------------------------------------------------------------------- sweep

select lives_ok($$insert into t (k, v) select 'sweep', public.fn_fraud_sweep()::text$$,
  'The sweep runs');

select is(
  (select (v::jsonb -> 'errors') from t where k = 'sweep'),
  '{}'::jsonb,
  'No check failed');

select ok(
  not exists (select 1 from public.fraud_signal
               where details::text ~* '"(lat|lng|latitude|longitude|point|location)"'
                  or details::text ~ 'tok-fraud'),
  'No flag carries coordinates or a device token');

/* Flag ids for the review steps, read here because RLS hides some of them later. */
insert into t (k, v)
select f.k, (select s.id::text from public.fraud_signal s where s.kind = f.kind and s.dedupe_key like f.key_like)
from (values
  ('flag_reused', 'mpesa_code_reused', 'mpesa_code_reused:QAB1CD2EF3:%'),
  ('flag_unpaid', 'cash_marked_mpesa', 'cash_marked_mpesa:f7aa0000-0000-4000-8000-0000000000e2'),
  ('flag_repeat', 'expense_repeat', 'expense_repeat:f7aa0000-0000-4000-8000-0000000000f2'),
  ('flag_self', 'expense_self_approved', 'expense_self_approved:f7aa0000-0000-4000-8000-0000000000f3')
) as f (k, kind, key_like);

select is(
  (select summary from public.fraud_signal where kind = 'mpesa_code_reused' and subject_label = 'M-Pesa QAB1CD2EF3'),
  'M-Pesa code QAB1CD2EF3 is on 2 records: Payment PAY-FRAUD-1, Rider kit payment',
  'A code typed for a rider kit that is already on a payment is flagged, once per record');

select is(
  (select subject_id from public.fraud_signal where kind = 'mpesa_code_malformed' and details ->> 'typed' = '12345'),
  'f7aa0000-0000-4000-8000-0000000000b3'::uuid,
  'A typed M-Pesa code that is not one is flagged against whoever typed it');

select is(
  (select subject_id from public.fraud_signal where kind = 'cash_confirmed_by_hand' and order_reference = 'FRD-BYHAND'),
  'f7aa0000-0000-4000-8000-0000000000b4'::uuid,
  'A cash order confirmed delivered by staff is flagged against that person');

select is(
  (select summary from public.fraud_signal where kind = 'delivered_too_fast' and order_reference = 'FRD-FAST'),
  'Order FRD-FAST was delivered 2 min after pickup',
  'An order closed two minutes after pickup is flagged');

select is(
  (select rider_id from public.fraud_signal where kind = 'cash_marked_mpesa' and order_reference = 'FRD-UNPAID'),
  'f7aa0000-0000-4000-8000-0000000000c2'::uuid,
  'A cash order delivered two hours ago with no cash recorded is flagged against its rider');

select is(
  (select count(*)::int from public.fraud_signal where kind = 'shared_device'
     and rider_id in ('f7aa0000-0000-4000-8000-0000000000c1', 'f7aa0000-0000-4000-8000-0000000000c2')),
  2,
  'Both rider accounts on one phone are flagged');

select is(
  (select count(*)::int from public.fraud_signal where kind = 'offer_farming'
     and rider_id = 'f7aa0000-0000-4000-8000-0000000000c3'),
  0,
  'One job taken away is under the limit of three');

select is(
  (select subject_label || ' · ' || summary from public.fraud_signal where kind = 'pod_refusals'
     and subject_id = 'f7aa0000-0000-4000-8000-0000000000d1'),
  'Customer ···345 · 2 cash orders turned away after pickup in 60 days, KES 1,500',
  'Two cash orders turned away after pickup flag the customer, shown by masked number');

select is(
  (select refusal_count from public.guest where id = 'f7aa0000-0000-4000-8000-0000000000d1'),
  2,
  'The guest record counts the refusals');

select is(
  (select summary from public.fraud_signal where kind = 'refund_heavy'
     and subject_id = 'f7aa0000-0000-4000-8000-0000000000d1'),
  '3 refunds in 30 days, KES 600',
  'Three refunds in a month flag the customer');

select is(
  (select summary from public.fraud_signal where kind = 'expense_same_receipt'
     and subject_id = 'f7aa0000-0000-4000-8000-0000000000f2'),
  (select number from public.fin_office_expense where id = 'f7aa0000-0000-4000-8000-0000000000f2')
    || ' has the same receipt as '
    || (select number from public.fin_office_expense where id = 'f7aa0000-0000-4000-8000-0000000000f1'),
  'The second expense with the same receipt is flagged');

select is(
  (select subject_id from public.fraud_signal where kind = 'expense_repeat'
     and subject_id = 'f7aa0000-0000-4000-8000-0000000000f2'),
  'f7aa0000-0000-4000-8000-0000000000f2'::uuid,
  'The same payee and amount two days apart is flagged on the later expense');

select is(
  (select subject_id from public.fraud_signal where kind = 'expense_self_approved'
     and subject_id = 'f7aa0000-0000-4000-8000-0000000000f3'),
  'f7aa0000-0000-4000-8000-0000000000f3'::uuid,
  'An expense approved by whoever recorded it is flagged');

select is(
  (select (public.fn_fraud_sweep() -> 'raised')),
  '{"riders": 0, "expenses": 0, "payments": 0, "customers": 0}'::jsonb,
  'Running again raises nothing new');

select ok(
  (select last_run_at is not null and last_errors = '{}'::jsonb from public.fraud_check_state),
  'When the checks last ran is recorded');

-- ------------------------------------------------------------- who sees what

set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"f7aa0000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.fraud_signal where subject_type <> 'rider'),
  0,
  'Support staff cannot read payment, customer or expense flags');

select set_config('request.jwt.claims',
  '{"sub":"f7aa0000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select is(
  (select jsonb_build_object(
     'scope', o -> 'scope',
     'only_riders', not exists (select 1 from jsonb_array_elements(o -> 'flags') f
                                 where f ->> 'subject_type' <> 'rider'))
   from (select public.rpc_fraud_overview() as o) x),
  '{"scope": "riders", "only_riders": true}'::jsonb,
  'Rider ops see the rider flags and nothing else');

select throws_ok(
  $$select public.rpc_fraud_flag_decide((select v::uuid from t where k = 'flag_reused'), true)$$,
  '42501', 'Someone else has to review this flag.',
  'Rider ops cannot review a payment flag');

select lives_ok(
  $$select public.rpc_fraud_flag_decide((select v::uuid from t where k = 'flag_unpaid'), true, 'Cash not handed in')$$,
  'Rider ops confirm a flag about a rider they work');

reset role;

select is(
  (select count(*)::int from public.rider_strike
    where rider_id = 'f7aa0000-0000-4000-8000-0000000000c2' and level = 2
      and reason = 'Fraud flag confirmed · Delivered, but never paid or collected'
      and expires_at > now() + interval '89 days'),
  1,
  'A confirmed rider flag gives a 90-day level-2 strike');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f7aa0000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  (select jsonb_build_object(
     'scope', o -> 'scope',
     'own_expense', (select f -> 'may_review' from jsonb_array_elements(o -> 'flags') f
                      where f ->> 'id' = (select v from t where k = 'flag_repeat')),
     'other', (select f -> 'may_review' from jsonb_array_elements(o -> 'flags') f
                where f ->> 'id' = (select v from t where k = 'flag_self')))
   from (select public.rpc_fraud_overview() as o) x),
  '{"scope": "all", "own_expense": false, "other": true}'::jsonb,
  'Finance sees every flag, and the screen knows which ones each person may review');

select throws_ok(
  $$select public.rpc_fraud_flag_decide((select v::uuid from t where k = 'flag_repeat'), false, 'Two orders')$$,
  '42501', 'Someone else has to review this flag.',
  'Nobody reviews a flag about an expense they recorded');

select set_config('request.jwt.claims',
  '{"sub":"f7aa0000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_fraud_flag_decide((select v::uuid from t where k = 'flag_repeat'), false)$$,
  '22023', 'Say why this is not a problem.',
  'Dismissing a flag needs a reason');

select lives_ok(
  $$select public.rpc_fraud_flag_decide((select v::uuid from t where k = 'flag_repeat'), false, 'Two separate deliveries, both on the invoice')$$,
  'Another Finance person dismisses it with a reason');

select throws_ok(
  $$select public.rpc_fraud_flag_decide((select v::uuid from t where k = 'flag_repeat'), true)$$,
  '23514', 'This flag has already been reviewed.',
  'A reviewed flag stays as it was decided');

-- ------------------------------------------------------------------- rules

select throws_ok(
  $$select public.rpc_fraud_rule_set('offer_farming', true, '{"weeks": 2}')$$,
  '22023', '"Accepts jobs, then is taken off them" has no limit called weeks.',
  'A rule only takes the limits it has');

select throws_ok(
  $$select public.rpc_fraud_rule_set('offer_farming', true, '{"times": 0}')$$,
  '22023', 'Each limit must be a number above zero.',
  'A limit must be above zero');

select lives_ok(
  $$select public.rpc_fraud_rule_set('offer_farming', true, '{"times": 1}')$$,
  'Finance lowers a limit');

select lives_ok(
  $$insert into t (k, v) select 'run', public.rpc_fraud_checks_run()::text$$,
  'Finance runs the checks now');

reset role;

select is(
  (select count(*)::int from public.fraud_signal where kind = 'offer_farming'
     and rider_id = 'f7aa0000-0000-4000-8000-0000000000c3'),
  1,
  'With the lower limit, the rider moved off a job they accepted is flagged');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f7aa0000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_fraud_rule_set('gps_jump', false)$$,
  '42501', 'Only people with full Finance access can change the fraud checks.',
  'Rider ops cannot turn a check off');

reset role;

select is(
  (select array_agg(action order by action) from audit.audit_event
    where action in ('fraud.signal_confirmed', 'fraud.flag_dismissed', 'fraud.rule_changed', 'fraud.checks_run')
      and actor_id in ('f7aa0000-0000-4000-8000-0000000000b1', 'f7aa0000-0000-4000-8000-0000000000b2',
                       'f7aa0000-0000-4000-8000-0000000000b3')),
  array['fraud.checks_run', 'fraud.flag_dismissed', 'fraud.rule_changed', 'fraud.signal_confirmed'],
  'Every decision, rule change and run by hand is on the audit log');

select is(
  (select fraud_open::int from public.console_rider_badges_v),
  (select count(*)::int from public.fraud_signal where status = 'open' and subject_type = 'rider'),
  'The riders screen counts open rider flags only');

select * from finish();
rollback;
