-- Paystack refunds and problems on the Finance screen (20270330000200,
-- rpc_finance_paystack_refunds and _problems): every try and where it stands;
-- Paystack money due back and not sent, with whether the caller may send it
-- (the open function agrees); and the fixed list of problems, the same for
-- everyone who reaches Finance, closed ones last. Only full Finance or a super
-- admin closes one. A cinema refund is by hand only where the cinema worker
-- will not send it. The key here is made up.
--
-- Money by hand, in cents: orders 30,000, 10,000 and 7,000; a booking 250,000;
-- a cinema hold 80,000; a stay of KES 14,000 = 1,400,000.

begin;
create extension if not exists pgtap with schema extensions;
select plan(46);

delete from vault.secrets where name = 'paystack_live_secret_key';
-- Live cinema refunds are off, the default.
delete from settings.version where key = 'payouts.cinema.automatic_live_refunds';
select vault.create_secret('sk_live_ci_only_0123456789abcdef', 'paystack_live_secret_key');

create temp table t (k text primary key, v jsonb) on commit drop;
grant select, insert on t to authenticated, anon;

create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
/* This file's due items, "kind:cents:can_send". */
create function pg_temp.due(p_doc text) returns text language sql as $$
  select string_agg((x ->> 'kind') || ':' || (x ->> 'amount_cents') || ':' || (x ->> 'can_send'), ' '
                    order by x ->> 'kind', (x ->> 'amount_cents')::bigint)
    from t, jsonb_array_elements(t.v -> 'due') x
   where t.k = p_doc and x ->> 'paid_reference' like 'NXP249%'
$$;
create function pg_temp.due_one(p_doc text, p_target text) returns jsonb language sql as $$
  select x from t, jsonb_array_elements(t.v -> 'due') x where t.k = p_doc and x ->> 'target_id' = p_target
$$;
/* This file's refund tries, by NexG's reference. */
create function pg_temp.tries(p_doc text, p_where text default 'any') returns text language sql as $$
  select string_agg(x ->> 'reference', ' ' order by x ->> 'reference')
    from t, jsonb_array_elements(t.v -> 'refunds') x
   where t.k = p_doc and x ->> 'reference' like 'NXR-ci249-%'
     and (p_where = 'any' or (x ->> p_where) = 'true')
$$;
create function pg_temp.one_try(p_doc text, p_reference text) returns jsonb language sql as $$
  select x from t, jsonb_array_elements(t.v -> 'refunds') x
   where t.k = p_doc and x ->> 'reference' = p_reference
$$;
/* This file's problem events, in the order the screen gets them. */
create function pg_temp.events(p_doc text) returns setof jsonb language sql as $$
  select r.x from t, jsonb_array_elements(t.v -> 'events') with ordinality as r (x, n)
   where t.k = p_doc and r.x ->> 'target_id' in
     ('e2490000-0000-4000-8000-000000000101', 'e2490000-0000-4000-8000-0000000000d1')
   order by r.n
$$;

set local session_replication_role = replica;
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
       now(), false, now(), now()
  from (values
    ('e2490000-0000-4000-8000-000000000001', 'finance249@test.local'),
    ('e2490000-0000-4000-8000-000000000002', 'ops249@test.local'),
    ('e2490000-0000-4000-8000-000000000003', 'partners249@test.local'),
    ('e2490000-0000-4000-8000-000000000004', 'guest249@example.test')) as u (id, email);
insert into public.staff_user (id, user_id, email, display_name) values
  ('e2490000-0000-4000-8000-0000000000b1', 'e2490000-0000-4000-8000-000000000001', 'finance249@test.local', 'Finance 249'),
  ('e2490000-0000-4000-8000-0000000000b2', 'e2490000-0000-4000-8000-000000000002', 'ops249@test.local', 'Ops 249'),
  ('e2490000-0000-4000-8000-0000000000b3', 'e2490000-0000-4000-8000-000000000003', 'partners249@test.local', 'Partnerships 249');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select g.staff::uuid, r.id, null, g.staff::uuid
  from (values
    ('e2490000-0000-4000-8000-0000000000b1', 'finance'),
    ('e2490000-0000-4000-8000-0000000000b2', 'ops_manager'),
    ('e2490000-0000-4000-8000-0000000000b3', 'partnerships')) as g (staff, role_key)
  join public.role r on r.key = g.role_key;

insert into public.merchant (id, trading_name, contact_name, contact_phone, city_id)
values
  ('e2490000-0000-4000-8000-0000000000d1', '[Shop 249]', '[Contact]', '+254700024901',
   (select id from public.city where slug = 'nairobi')),
  ('e2490000-0000-4000-8000-0000000000d2', '[Cinema 249]', '[Contact]', '+254700024902',
   (select id from public.city where slug = 'nairobi'));

-- Orders: one paid through Paystack, one by M-Pesa, one split to the shop.
insert into public."order" (id, reference, merchant_id, city_id, payment_method, dropoff_label,
                            subtotal_cents, total_cents)
select o.id::uuid, o.reference, 'e2490000-0000-4000-8000-0000000000d1',
       (select id from public.city where slug = 'nairobi'), 'card', '[Fixture address]', 80000, 80000
  from (values
    ('e2490000-0000-4000-8000-000000000101', 'PSS249-O1'),
    ('e2490000-0000-4000-8000-000000000102', 'PSS249-O2'),
    ('e2490000-0000-4000-8000-000000000103', 'PSS249-O3')) as o (id, reference);

insert into public.property (id, host_id, slug, name, kind, area, city_id)
values ('e2490000-0000-4000-8000-0000000000a1', 'e2490000-0000-4000-8000-0000000000e1', 'block-249',
        '[Block 249]', 'apartment_block', 'Kilimani', (select id from public.city where slug = 'nairobi'));
-- Stay 1: cancelled, refund due. Stay 2: its refund recorded by hand after a failed try.
insert into public.stay (id, host_id, property_id, check_in, check_out, source, status, paid_kes,
                         payment_reference, refund_due_at, refunded_at, refund_reference)
values
  ('e2490000-0000-4000-8000-000000000201', 'e2490000-0000-4000-8000-0000000000e1',
   'e2490000-0000-4000-8000-0000000000a1', '2031-03-10 14:00+03', '2031-03-12 10:00+03', 'nexg',
   'cancelled', 14000, 'NXP249S1', now() - interval '2 days', null, null),
  ('e2490000-0000-4000-8000-000000000202', 'e2490000-0000-4000-8000-0000000000e1',
   'e2490000-0000-4000-8000-0000000000a1', '2031-04-10 14:00+03', '2031-04-12 10:00+03', 'nexg',
   'cancelled', 14000, 'NXP249S2', now() - interval '3 days', now(), 'MPESA249');

-- Bookings: 1 refused by the engine; 2 accepted; 3 refused, its refund needing attention.
insert into public.customer_engine_booking (id, user_id, merchant_id, engine_booking_id, customer_token, title)
select b.id::uuid, 'e2490000-0000-4000-8000-000000000004', 'e2490000-0000-4000-8000-0000000000d1',
       b.engine, 'ci-only-token-0123456789', '[Table for two]'
  from (values
    ('e2490000-0000-4000-8000-000000000301', 'eng-249-1'),
    ('e2490000-0000-4000-8000-000000000302', 'eng-249-2'),
    ('e2490000-0000-4000-8000-000000000303', 'eng-249-3')) as b (id, engine);

insert into cinema.film (id, title) values ('e2490000-0000-4000-8000-000000000401', '[Film 249]');
insert into cinema.screen (id, merchant_id, name)
values ('e2490000-0000-4000-8000-000000000402', 'e2490000-0000-4000-8000-0000000000d2', 'Screen 1');
insert into cinema.showing (id, film_id, screen_id, starts_at, ends_at, format)
values ('e2490000-0000-4000-8000-000000000403', 'e2490000-0000-4000-8000-000000000401',
        'e2490000-0000-4000-8000-000000000402', now() + interval '1 day',
        now() + interval '1 day 2 hours', '2D');
insert into cinema.hold (id, request_id, showing_id, seat_codes, total_minor, expires_at, state,
                         refund_reason, payment_reference)
values ('e2490000-0000-4000-8000-000000000404', gen_random_uuid(), 'e2490000-0000-4000-8000-000000000403',
        '{A1,A2}', 80000, now(), 'refund_due', 'The cinema could not book the seats', 'NXP249C1');

insert into public.payment (id, reference, intent, order_id, stay_id, cinema_hold_id,
                            customer_engine_booking_id, engine_settle_error, engine_settled_at,
                            amount_cents, provider, provider_ref, state, paid_at, is_test, created_via)
select p.id::uuid, p.reference, p.intent::public.payment_intent, p.order_id::uuid, p.stay_id::uuid,
       p.hold_id::uuid, p.booking_id::uuid, p.refused, case when p.settled then now() end,
       p.amount, p.provider, p.provider_ref, 'paid', now() - interval '4 days', false, 'guest_checkout'
  from (values
    ('e2490000-0000-4000-8000-000000000501', 'NXP249O1', 'order', 'e2490000-0000-4000-8000-000000000101', null, null, null, null, false, 80000, 'paystack', '249001'),
    ('e2490000-0000-4000-8000-000000000502', 'NXP249O2', 'order', 'e2490000-0000-4000-8000-000000000102', null, null, null, null, false, 80000, 'mpesa', '249002'),
    ('e2490000-0000-4000-8000-000000000503', 'NXP249O3', 'order', 'e2490000-0000-4000-8000-000000000103', null, null, null, null, false, 80000, 'paystack', '249003'),
    ('e2490000-0000-4000-8000-000000000504', 'NXP249S1', 'stay', null, 'e2490000-0000-4000-8000-000000000201', null, null, null, false, 1400000, 'paystack', '249004'),
    ('e2490000-0000-4000-8000-000000000505', 'NXP249S2', 'stay', null, 'e2490000-0000-4000-8000-000000000202', null, null, null, false, 1400000, 'paystack', '249005'),
    ('e2490000-0000-4000-8000-000000000506', 'NXP249B1', 'booking', null, null, null, 'e2490000-0000-4000-8000-000000000301', 'The hold ran out', false, 250000, 'paystack', '249006'),
    ('e2490000-0000-4000-8000-000000000507', 'NXP249B2', 'booking', null, null, null, 'e2490000-0000-4000-8000-000000000302', null, true, 120000, 'paystack', '249007'),
    ('e2490000-0000-4000-8000-000000000508', 'NXP249B3', 'booking', null, null, null, 'e2490000-0000-4000-8000-000000000303', 'The hold ran out', false, 60000, 'paystack', '249008'),
    ('e2490000-0000-4000-8000-000000000509', 'NXP249C1', 'cinema', null, null, 'e2490000-0000-4000-8000-000000000404', null, null, false, 80000, 'paystack', '249009'))
    as p (id, reference, intent, order_id, stay_id, hold_id, booking_id, refused, settled, amount,
          provider, provider_ref);

insert into public.refund (id, order_id, amount_cents, method, reason_code, reason_text, status, requested_at)
select f.id::uuid, f.order_id::uuid, f.amount, f.method, 'missing_item', 'An item was missing',
       f.status, now() - f.age::interval
  from (values
    ('e2490000-0000-4000-8000-000000000601', 'e2490000-0000-4000-8000-000000000101', 30000, 'original', 'approved', '5 days'),
    ('e2490000-0000-4000-8000-000000000602', 'e2490000-0000-4000-8000-000000000101', 10000, 'original', 'approved', '4 days'),
    ('e2490000-0000-4000-8000-000000000603', 'e2490000-0000-4000-8000-000000000101', 5000, 'original', 'approved', '3 days'),
    ('e2490000-0000-4000-8000-000000000604', 'e2490000-0000-4000-8000-000000000101', 2000, 'mpesa_b2c', 'approved', '3 days'),
    ('e2490000-0000-4000-8000-000000000605', 'e2490000-0000-4000-8000-000000000101', 1000, 'original', 'issued', '3 days'),
    ('e2490000-0000-4000-8000-000000000606', 'e2490000-0000-4000-8000-000000000101', 7000, 'original', 'approved', '1 day'),
    ('e2490000-0000-4000-8000-000000000607', 'e2490000-0000-4000-8000-000000000102', 4000, 'original', 'approved', '1 day'),
    ('e2490000-0000-4000-8000-000000000608', 'e2490000-0000-4000-8000-000000000103', 3000, 'original', 'issued', '2 days'),
    ('e2490000-0000-4000-8000-000000000609', 'e2490000-0000-4000-8000-000000000103', 2000, 'original', 'issued', '1 day'))
    as f (id, order_id, amount, method, status, age);

insert into public.paystack_refund (kind, refund_id, stay_id, payment_id, reference, amount_cents,
                                    is_test, state, failure_reason, paystack_refund_id, created_by)
select x.kind, x.refund_id::uuid, x.stay_id::uuid, x.payment_id::uuid, x.reference, x.amount, false,
       x.state, x.failure, x.paystack_id, 'e2490000-0000-4000-8000-0000000000b1'
  from (values
    ('order', 'e2490000-0000-4000-8000-000000000602', null, 'e2490000-0000-4000-8000-000000000501', 'NXR-ci249-f2-failed', 10000, 'failed', 'Insufficient balance', null),
    ('order', 'e2490000-0000-4000-8000-000000000603', null, 'e2490000-0000-4000-8000-000000000501', 'NXR-ci249-f3-failed', 5000, 'failed', 'Try again', null),
    ('order', 'e2490000-0000-4000-8000-000000000603', null, 'e2490000-0000-4000-8000-000000000501', 'NXR-ci249-f3-pending', 5000, 'pending', null, '249301'),
    ('order', 'e2490000-0000-4000-8000-000000000605', null, 'e2490000-0000-4000-8000-000000000501', 'NXR-ci249-f5-done', 1000, 'processed', null, '249302'),
    ('order', 'e2490000-0000-4000-8000-000000000606', null, 'e2490000-0000-4000-8000-000000000501', 'NXR-ci249-f6-opened', 7000, 'opened', null, null),
    ('stay', null, 'e2490000-0000-4000-8000-000000000202', 'e2490000-0000-4000-8000-000000000505', 'NXR-ci249-s2-failed', 1400000, 'failed', 'Declined', null),
    ('booking', null, null, 'e2490000-0000-4000-8000-000000000508', 'NXR-ci249-b3-attention', 60000, 'needs-attention', 'Account details needed', '249308'))
    as x (kind, refund_id, stay_id, payment_id, reference, amount, state, failure, paystack_id);

-- Order 3 was split; one refund on it waits for a decision, one was invoiced.
insert into public.paystack_attempt (payment_id, reference, channel, is_test, outcome, split_merchant_id,
                                     split_subaccount, split_share_cents)
values ('e2490000-0000-4000-8000-000000000503', 'NXP249O3-1', 'card', false, 'paid',
        'e2490000-0000-4000-8000-0000000000d1', 'ACCT_ci2490001', 60000);
insert into public.merchant_recovery (merchant_id, order_id, refund_id, amount_cents, method, state, note)
values ('e2490000-0000-4000-8000-0000000000d1', 'e2490000-0000-4000-8000-000000000103',
        'e2490000-0000-4000-8000-000000000609', 2000, 'invoice', 'invoiced', 'Invoice 249');

insert into public.rider (id, first_name, last_name, phone, city_id, vehicle)
values ('e2490000-0000-4000-8000-000000000701', '[Test]', '[Rider 249]', '+254700024903',
        (select id from public.city where slug = 'nairobi'), 'bicycle');
insert into public.paystack_transfer (reference, kind, party_type, party_id, source_id, amount_cents,
                                      is_test, destination, state)
values ('NXT-ci249otp0001', 'rider_early', 'rider', 'e2490000-0000-4000-8000-000000000701',
        gen_random_uuid(), 50000, false, '+254700024903', 'otp');
set local session_replication_role = origin;

-- ──────────────────────────────────────────────────── who may

select ok(
  not has_function_privilege('anon', 'public.rpc_finance_paystack_refunds(text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_finance_paystack_problems(integer)', 'execute')
  and not has_function_privilege('authenticated',
    'public.fn_paystack_refund_label(text, uuid, uuid, uuid)', 'execute'),
  'The anonymous key reads neither, and the label helper is internal.');

set local role authenticated;
select pg_temp.as_user('e2490000-0000-4000-8000-000000000003');
select throws_ok($$select public.rpc_finance_paystack_refunds()$$,
  '42501', 'Only people who reach Finance can see this.', 'Staff without Finance see no refunds.');
select pg_temp.as_user('e2490000-0000-4000-8000-000000000004');
select throws_ok($$select public.rpc_finance_paystack_problems()$$,
  '42501', null, 'A customer sees no problems list.');
select pg_temp.as_user('e2490000-0000-4000-8000-000000000001');
select throws_ok($$select public.rpc_finance_paystack_refunds('everything')$$,
  '22023', 'Show due, refunded or all.', 'The list shows due, refunded or all.');

insert into t select 'rf', public.rpc_finance_paystack_refunds();
insert into t select 'refunded', public.rpc_finance_paystack_refunds('refunded');
insert into t select 'all', public.rpc_finance_paystack_refunds('all');
select pg_temp.as_user('e2490000-0000-4000-8000-000000000002');
insert into t select 'ro', public.rpc_finance_paystack_refunds('due');
reset role;

-- ──────────────────────────────────────────────────── money due back

select is(pg_temp.due('rf'),
  'booking:250000:true cinema:80000:false order:7000:true order:10000:true order:30000:true stay:1400000:false',
  'Finance sees what is due and may send all but the cinema''s and the stay''s.');
select is(pg_temp.due('ro'),
  'booking:250000:true cinema:80000:false order:7000:true order:10000:true order:30000:true stay:1400000:true',
  'An Ops manager, who works hospitality, may send the stay''s too.');
select is(pg_temp.due_one('rf', 'e2490000-0000-4000-8000-000000000601') - 'due_since',
  '{"kind": "order", "target_id": "e2490000-0000-4000-8000-000000000601",
    "label": "Order PSS249-O1 · [Shop 249]", "paid_reference": "NXP249O1", "amount_cents": 30000,
    "is_test": false, "can_send": true, "by_hand": false, "last_try": null}'::jsonb,
  'An approved order refund not yet tried.');
select is((pg_temp.due_one('rf', 'e2490000-0000-4000-8000-000000000602') -> 'last_try') - 'updated_at',
  '{"reference": "NXR-ci249-f2-failed", "state": "failed", "failure_reason": "Insufficient balance"}'::jsonb,
  'A failed try leaves the money due, and says why.');
select is(pg_temp.due_one('rf', 'e2490000-0000-4000-8000-000000000606') #>> '{last_try,state}', 'opened',
  'A try opened and never sent is still due.');
select is(
  (select string_agg((x ->> 'target_id') || ' ' || (x ->> 'label'), ' | ' order by x ->> 'kind')
     from t, jsonb_array_elements(t.v -> 'due') x
    where t.k = 'rf' and x ->> 'kind' <> 'order' and x ->> 'paid_reference' like 'NXP249%'),
  'e2490000-0000-4000-8000-000000000506 Booking · [Shop 249] · [Table for two]'
  || ' | e2490000-0000-4000-8000-000000000404 Cinema · [Film 249] · [Cinema 249]'
  || ' | e2490000-0000-4000-8000-000000000201 Stay · [Block 249] · 10 Mar 2031',
  'Each is named, with what the refund button takes: the payment, the hold and the stay.');
select is(
  (select string_agg(x ->> 'kind', ' ') from t, jsonb_array_elements(t.v -> 'due') x
    where t.k = 'rf' and x ->> 'by_hand' = 'true' and x ->> 'paid_reference' like 'NXP249%'),
  'cinema', 'With live cinema refunds off, only the cinema''s is handled by hand.');

-- ──────────────────────────────────────────────────── the tries

select is(pg_temp.tries('rf'),
  'NXR-ci249-b3-attention NXR-ci249-f2-failed NXR-ci249-f3-pending NXR-ci249-f6-opened',
  'Due shows unfinished tries, not a failed one since replaced or settled by hand.');
select is(pg_temp.tries('refunded'), 'NXR-ci249-f5-done', 'Refunded shows the processed ones.');
select is(pg_temp.tries('all'),
  'NXR-ci249-b3-attention NXR-ci249-f2-failed NXR-ci249-f3-failed NXR-ci249-f3-pending NXR-ci249-f5-done NXR-ci249-f6-opened NXR-ci249-s2-failed',
  'All shows every try.');
select is(pg_temp.one_try('rf', 'NXR-ci249-f2-failed') - 'id' - 'created_at' - 'updated_at',
  '{"reference": "NXR-ci249-f2-failed", "kind": "order",
    "target_id": "e2490000-0000-4000-8000-000000000602", "label": "Order PSS249-O1 · [Shop 249]",
    "paid_reference": "NXP249O1", "amount_cents": 10000, "is_test": false, "state": "failed",
    "failure_reason": "Insufficient balance", "settled": false, "by_hand": false,
    "created_by": "Finance 249"}'::jsonb,
  'A try says what it refunds, where it stands, why it failed and who sent it.');
select is(pg_temp.tries('rf', 'by_hand'), 'NXR-ci249-b3-attention',
  'Needs-attention is handled in the Paystack dashboard.');
select is(pg_temp.tries('all', 'settled'), 'NXR-ci249-f5-done NXR-ci249-s2-failed',
  'Money recorded as back, by Paystack or by hand, is marked settled.');

-- The open function agrees with can_send.
set local role authenticated;
select pg_temp.as_user('e2490000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.rpc_paystack_refund_open('stay', 'e2490000-0000-4000-8000-000000000201',
      'sk_live_ci_only_0123456789abcdef')$$,
  '42501', 'Hospitality staff only.', 'Finance cannot open the stay refund, as the list says.');
select is(public.rpc_paystack_refund_open('booking', 'e2490000-0000-4000-8000-000000000506',
    'sk_live_ci_only_0123456789abcdef') ->> 'amount_cents', '250000',
  'Finance can open the booking refund, as the list says.');
select pg_temp.as_user('e2490000-0000-4000-8000-000000000002');
select is(public.rpc_paystack_refund_open('stay', 'e2490000-0000-4000-8000-000000000201',
    'sk_live_ci_only_0123456789abcdef') ->> 'amount_cents', '1400000',
  'The Ops manager can open the stay refund.');
insert into t select 'opened', public.rpc_finance_paystack_refunds('due');

-- ──────────────────────────────────────────────────── problems

select pg_temp.as_user('e2490000-0000-4000-8000-000000000001');
insert into t select 'before', public.rpc_finance_paystack_problems(500);
reset role;

select is(pg_temp.due_one('opened', 'e2490000-0000-4000-8000-000000000201') #>> '{last_try,state}', 'opened',
  'Opened but not yet sent, it stays on the due list.');

-- One of each listed action on order 1, one not listed, and one of Finance's own.
select audit.log(p_actor_type => 'system'::public.actor_type, p_module => 'finance', p_action => a.action,
         p_target_type => 'order', p_target_id => 'e2490000-0000-4000-8000-000000000101',
         p_after => '{"k": 1}'::jsonb)
  from unnest(array[
    'payment.split_not_made', 'payment.paystack_refund_failed', 'payment.paystack_refund_unmatched',
    'payment.paystack_refund_after_failed_try', 'payment.paystack_unmatched',
    'payment.paystack_paid_after_close', 'payment.paystack_after_close_failed',
    'payment.amount_mismatch', 'stay.split_paid_late', 'stay.refund_possible_double',
    'host.payout_changed_during_run', 'cinema.settle_failed', 'cinema.refunded_but_booked',
    'cinema.payment_close_failed', 'payout.paystack_transfer_failed',
    'payout.paystack_transfer_late_success', 'payout.rider_payout_error', 'payout.rider_payout_held',
    'ledger.posting_failed', 'stay.cancel_refund_full']) as a (action);
select audit.log(p_actor_type => 'staff'::public.actor_type, p_module => 'finance',
  p_action => 'payment.amount_mismatch', p_actor_id => 'e2490000-0000-4000-8000-0000000000b1',
  p_target_type => 'merchant', p_target_id => 'e2490000-0000-4000-8000-0000000000d1');
insert into t select 'split', to_jsonb(e.id) from audit.audit_event e
 where e.action = 'payment.split_not_made' and e.target_id = 'e2490000-0000-4000-8000-000000000101';

set local role authenticated;
select pg_temp.as_user('e2490000-0000-4000-8000-000000000001');
select public.rpc_audit_review_event((select (v #>> '{}')::bigint from t where k = 'split'),
  'reviewed', 'Checked in Paystack');
insert into t select 'pf', public.rpc_finance_paystack_problems(500);
insert into t select 'pone', public.rpc_finance_paystack_problems(1);
select pg_temp.as_user('e2490000-0000-4000-8000-000000000002');
insert into t select 'po', public.rpc_finance_paystack_problems(500);
reset role;

select is(
  (select count(*)::int || ' ' || count(distinct x ->> 'action')::int from pg_temp.events('pf') x),
  '20 19', 'Every listed action appears, and nothing else.');
select is(
  (select (a.v ->> 'open_events')::int - (b.v ->> 'open_events')::int
     from t a, t b where a.k = 'pf' and b.k = 'before'),
  19, 'Twenty raised, one reviewed: nineteen more are open.');
select is(
  (select (x ->> 'action') || ' | ' || (x ->> 'review_state') || ' | ' || (x ->> 'reviewed_by')
          || ' | ' || (x ->> 'review_note')
     from pg_temp.events('pf') with ordinality as r (x, n) order by r.n desc limit 1),
  'payment.split_not_made | reviewed | Finance 249 | Checked in Paystack',
  'The reviewed one comes last, with who reviewed it and the note.');
select is(
  (select jsonb_build_object('target_label', x -> 'target_label', 'details', x -> 'details',
            'severity', x -> 'severity', 'mine', x -> 'mine')
     from pg_temp.events('pf') x where x ->> 'action' = 'payment.split_not_made'),
  '{"target_label": "PSS249-O1", "details": {"k": 1}, "severity": "high", "mine": false}'::jsonb,
  'An event names its target and carries its details.');
select is(
  (select string_agg((x ->> 'target_label') || ' ' || (x ->> 'mine'), ',')
     from pg_temp.events('pf') x where x ->> 'target_type' = 'merchant'),
  '[Shop 249] true', 'One''s own action is marked, so the screen need not offer to review it.');
select is(
  (select count(*)::int || ' ' || bool_or((x ->> 'mine')::boolean)::text from pg_temp.events('po') x),
  '20 false', 'Someone with other audit access sees the same list.');
select is((select jsonb_array_length(v -> 'events') from t where k = 'pone'), 1, 'The limit is kept.');
select is(
  (select x - 'requested_at' from t, jsonb_array_elements(t.v -> 'refunds_to_decide') x
    where t.k = 'pf' and x ->> 'order_reference' = 'PSS249-O3'),
  '{"refund_id": "e2490000-0000-4000-8000-000000000608",
    "merchant_id": "e2490000-0000-4000-8000-0000000000d1", "name": "[Shop 249]",
    "order_reference": "PSS249-O3", "refund_cents": 3000, "share_cents": 60000, "test": false}'::jsonb,
  'The refund on a split order nobody has decided; the invoiced one is not repeated.');
select is(
  (select x - 'id' - 'decided_at' from t, jsonb_array_elements(t.v -> 'invoiced_recoveries') x
    where t.k = 'pf' and x ->> 'order_reference' = 'PSS249-O3'),
  '{"merchant_id": "e2490000-0000-4000-8000-0000000000d1", "name": "[Shop 249]",
    "order_reference": "PSS249-O3", "amount_cents": 2000, "note": "Invoice 249", "test": false}'::jsonb,
  'An invoiced recovery not yet paid.');
select is(
  (select x - 'id' - 'created_at' - 'updated_at' from t, jsonb_array_elements(t.v -> 'otp_transfers') x
    where t.k = 'pf' and x ->> 'reference' = 'NXT-ci249otp0001'),
  '{"reference": "NXT-ci249otp0001", "rider_id": "e2490000-0000-4000-8000-000000000701",
    "rider_name": "[Test] [Rider 249]", "amount_cents": 50000, "test": false}'::jsonb,
  'A transfer waiting on Paystack''s code.');
select is(
  (select string_agg(v ->> 'can_decide', ' ' order by k) from t where k in ('pf', 'po')),
  'true false', 'Only full Finance decides recoveries.');

-- ──────────────────────────────────────────────────── closing a problem

select ok(
  not has_function_privilege('anon', 'public.rpc_finance_paystack_problem_review(bigint, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_paystack_problem_actions()', 'execute')
  and not has_function_privilege('authenticated',
    'authz.staff_had_full_finance(uuid, timestamptz)', 'execute'),
  'The anonymous key cannot mark one, and the two helpers are internal.');

/* The event ids this block uses, by name. */
insert into t select x.k, to_jsonb(e.id)
  from (values ('late', 'stay.split_paid_late'), ('held', 'payout.rider_payout_held'),
               ('unlisted', 'stay.cancel_refund_full')) as x (k, action)
  join audit.audit_event e on e.action = x.action
   and e.target_id = 'e2490000-0000-4000-8000-000000000101';
insert into t select 'own', to_jsonb(e.id) from audit.audit_event e
 where e.action = 'payment.amount_mismatch' and e.target_id = 'e2490000-0000-4000-8000-0000000000d1';

set local role authenticated;
select pg_temp.as_user('e2490000-0000-4000-8000-000000000002');
select throws_ok(
  $$select public.rpc_finance_paystack_problem_review((select (v #>> '{}')::bigint from t where k = 'late'))$$,
  '42501', 'Only full Finance or a super admin marks a Paystack problem reviewed.',
  'View-only Finance cannot mark a problem reviewed.');
-- The Audit console's own function takes their review; the list does not.
select public.rpc_audit_review_event((select (v #>> '{}')::bigint from t where k = 'late'),
  'reviewed', 'Looks fine');
insert into t select 'weak', public.rpc_finance_paystack_problems(500);

select pg_temp.as_user('e2490000-0000-4000-8000-000000000004');
select throws_ok(
  $$select public.rpc_finance_paystack_problem_review((select (v #>> '{}')::bigint from t where k = 'late'))$$,
  '42501', null, 'A customer cannot either.');

select pg_temp.as_user('e2490000-0000-4000-8000-000000000001');
select throws_ok(
  $$select public.rpc_finance_paystack_problem_review((select (v #>> '{}')::bigint from t where k = 'unlisted'))$$,
  '22023', 'That is not one of the Paystack problems.', 'Only a listed problem is marked here.');
select throws_ok(
  $$select public.rpc_finance_paystack_problem_review((select (v #>> '{}')::bigint from t where k = 'own'))$$,
  'P0001', 'Somebody else has to review your own actions.', 'Nobody closes their own action.');
select is(
  public.rpc_finance_paystack_problem_review((select (v #>> '{}')::bigint from t where k = 'held'),
    '  Paid by hand  '),
  '{"ok": true}'::jsonb, 'Full Finance marks one reviewed.');
insert into t select 'strong', public.rpc_finance_paystack_problems(500);
reset role;

select is(
  (select (x ->> 'review_state') || ' | ' || (x ->> 'reviewed_by')
     from pg_temp.events('weak') x where x ->> 'action' = 'stay.split_paid_late'),
  'needs_review | Ops 249', 'A view-only review leaves the problem open.');
select is(
  (select (a.v ->> 'open_events')::int - (b.v ->> 'open_events')::int
     from t a, t b where a.k = 'weak' and b.k = 'pf'),
  0, 'And still counted as open.');
select is(
  (select (x ->> 'review_state') || ' | ' || (x ->> 'reviewed_by') || ' | ' || (x ->> 'review_note')
     from pg_temp.events('strong') x where x ->> 'action' = 'payout.rider_payout_held'),
  'reviewed | Finance 249 | Paid by hand', 'Finance''s review closes it, with the note.');
select is(
  (select (a.v ->> 'open_events')::int - (b.v ->> 'open_events')::int
     from t a, t b where a.k = 'strong' and b.k = 'weak'),
  -1, 'One fewer is open.');

-- ──────────────────────────────────────────────────── cinema refunds by hand

-- The rule on: the worker sends the live cinema refund itself.
insert into settings.version (key, scope_kind, value, status, effective_from, activated_at, reason)
values ('payouts.cinema.automatic_live_refunds', 'global', 'true', 'active',
        now() - interval '1 minute', now() - interval '1 minute', '[test 251]');
set local role authenticated;
select pg_temp.as_user('e2490000-0000-4000-8000-000000000001');
insert into t select 'auto', public.rpc_finance_paystack_refunds('due');
reset role;
select is(
  pg_temp.due_one('auto', 'e2490000-0000-4000-8000-000000000404') ->> 'by_hand',
  'false', 'With automatic live refunds on, the cinema''s is left to the worker.');

-- Its try failed: the worker never sends it again.
set local session_replication_role = replica;
insert into public.paystack_refund (kind, payment_id, reference, amount_cents, is_test, state, failure_reason)
values ('cinema', 'e2490000-0000-4000-8000-000000000509', 'NXR-ci249-c1-cinema', 80000, false,
        'failed', 'Declined');
set local session_replication_role = origin;
set local role authenticated;
select pg_temp.as_user('e2490000-0000-4000-8000-000000000001');
insert into t select 'cfail', public.rpc_finance_paystack_refunds('due');
reset role;
select is(
  (pg_temp.due_one('cfail', 'e2490000-0000-4000-8000-000000000404') ->> 'by_hand')
  || ' ' || (pg_temp.one_try('cfail', 'NXR-ci249-c1-cinema') ->> 'by_hand'),
  'true true', 'A failed cinema try is by hand, in both lists.');

-- Rule off again, and the try with Paystack: never by hand.
delete from settings.version where key = 'payouts.cinema.automatic_live_refunds';
update public.paystack_refund
   set state = 'pending', failure_reason = null, paystack_refund_id = '249309'
 where reference = 'NXR-ci249-c1-cinema';
set local role authenticated;
select pg_temp.as_user('e2490000-0000-4000-8000-000000000001');
insert into t select 'cpending', public.rpc_finance_paystack_refunds('due');
reset role;
select is(
  pg_temp.one_try('cpending', 'NXR-ci249-c1-cinema') ->> 'by_hand',
  'false', 'A cinema try with Paystack is not by hand, even with live refunds off.');

-- Opened and never sent, live, rule off: the worker is refused, so by hand.
update public.paystack_refund set state = 'opened', paystack_refund_id = null
 where reference = 'NXR-ci249-c1-cinema';
set local role authenticated;
select pg_temp.as_user('e2490000-0000-4000-8000-000000000001');
insert into t select 'copened', public.rpc_finance_paystack_refunds('due');
reset role;
select is(
  (pg_temp.due_one('copened', 'e2490000-0000-4000-8000-000000000404') ->> 'by_hand')
  || ' ' || (pg_temp.one_try('copened', 'NXR-ci249-c1-cinema') ->> 'by_hand'),
  'true true', 'An unsent live cinema try is by hand while live refunds are off.');

select * from finish();
rollback;
