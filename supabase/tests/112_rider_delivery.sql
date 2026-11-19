-- The rider's delivery: at the shop, waiting, a call, pickup, the customer's
-- code, cash, a photo when it is left with an askari, pay from the rate card,
-- and an order that cannot be delivered, disposed of with live ops' approval.

begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1120000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1120000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider112@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1120000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'stranger112@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1120000-0000-4000-8000-000000000006',
   'authenticated', 'authenticated', 'ops112@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1120000-0000-4000-8000-000000000007',
   'authenticated', 'authenticated', 'approver112@test.local', now(), false, now(), now());

create temp table t (k text primary key, v text);
insert into t values ('nbo', (select id::text from public.city where slug = 'nairobi'));

insert into public.staff_user (id, user_id, email, display_name) values
  ('c1120000-0000-4000-8000-0000000000b1', 'c1120000-0000-4000-8000-000000000006', 'ops112@test.local', 'Ops 112'),
  ('c1120000-0000-4000-8000-0000000000b2', 'c1120000-0000-4000-8000-000000000007', 'approver112@test.local', 'Approver 112');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c1120000-0000-4000-8000-0000000000b1', r.id, (select v::uuid from t where k = 'nbo'),
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c1120000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'ops_manager';

-- The city's rate card: 150 a trip, 20 a km after 2 km, 10 per 5 min waited
-- after the grace, 100 if it ends after pickup.
update public.rider_rate_card set status = 'archived'
 where city_id = (select v::uuid from t where k = 'nbo') and status = 'current';
insert into public.rider_rate_card (city_id, version, effective_from, status,
  base_per_trip_kes, per_km_after_2km_kes, paid_waiting_per_5min_kes, cancellation_after_pickup_kes)
values ((select v::uuid from t where k = 'nbo'), '[v112]', now() - interval '1 day', 'current',
        150, 20, 10, 100);

insert into public.guest (id, user_id, phone, name)
values ('c1120000-0000-4000-8000-000000000011', 'c1120000-0000-4000-8000-000000000001',
        '+254700011201', '[Guest 112]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1120000-0000-4000-8000-00000000000a', '[Legal 112] Ltd', '[Shop 112]', 'restaurant',
        '[Contact]', '+254700011200', 'shop112@example.test',
        (select v::uuid from t where k = 'nbo'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary, latitude, longitude)
values ('c1120000-0000-4000-8000-0000000000b0', 'c1120000-0000-4000-8000-00000000000a',
        'Main', '[Address 112]', true, -1.2921, 36.8219);

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at)
values ('c1120000-0000-4000-8000-000000000031', 'c1120000-0000-4000-8000-000000000003',
        '[Rider]', '[112]', '+254700011202', (select v::uuid from t where k = 'nbo'),
        'motorbike', '[PLATE112]', 'active', 'online', now());

-- A: paid by M-Pesa, handed to the guest. B: cash, left with the askari.
-- C: cannot be delivered.
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, dropoff_point, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency, rider_id)
select v.id::uuid, v.ref, 'c1120000-0000-4000-8000-000000000011',
       'c1120000-0000-4000-8000-00000000000a', 'c1120000-0000-4000-8000-0000000000b0',
       (select v::uuid from t where k = 'nbo'), 'web', '[Guest estate]',
       extensions.st_setsrid(extensions.st_makepoint(36.80, -1.30), 4326)::extensions.geography,
       'ready', v.method::public.order_payment_method, v.status::public.order_payment_status,
       50000, 10000, 2500, 62500, 'KES', 'c1120000-0000-4000-8000-000000000031'
  from (values
    ('c1120000-0000-4000-8000-0000000000f1', 'DELIVERY-112-A', 'mpesa_stk', 'paid'),
    ('c1120000-0000-4000-8000-0000000000f2', 'DELIVERY-112-B', 'cash_on_delivery', 'pending'),
    ('c1120000-0000-4000-8000-0000000000f3', 'DELIVERY-112-C', 'mpesa_stk', 'paid')) v (id, ref, method, status);

insert into dispatch.job (order_id, city_id, pickup_label, dropoff_label, distance_km, state,
                          assigned_rider_id, assigned_at)
select o.id, o.city_id, '[Shop 112]', '[Guest estate]', 5, 'assigned',
       'c1120000-0000-4000-8000-000000000031', now()
  from public.order o where o.reference like 'DELIVERY-112-%';

create function pg_temp.as_user(p_uid text, p_anonymous boolean default false) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text, true)
$$;

create function pg_temp.hint_of(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin
  execute p_sql;
  return 'done';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return coalesce(nullif(v_hint, ''), sqlerrm);
end
$$;

/* What an upload to the rider-proof bucket leaves behind. */
create function pg_temp.uploaded(p_order text, p_file text) returns text language sql as $$
  insert into storage.objects (bucket_id, name, owner)
  values ('rider-proof', 'c1120000-0000-4000-8000-000000000031/' || p_order || '/' || p_file,
          'c1120000-0000-4000-8000-000000000003')
  returning name
$$;

select is((public.fn_rider_trip_pay((select v::uuid from t where k = 'nbo'), 5, 0) ->> 'totalKes')::int,
  210, 'A 5 km trip pays 150 + 3 km × 20 on this rate card.');

-- ── A: at the shop, a call, pickup, the customer's code

set local role authenticated;
select pg_temp.as_user('c1120000-0000-4000-8000-000000000003');
select ok(public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f1', 'at_pickup') ? 'atPickupAt',
  'The rider says they are at the shop.');
select is((public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f1', 'at_pickup') ->> 'already')::boolean,
  true, 'Saying it twice changes nothing.');
select ok(public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f1', 'waiting') ? 'waitingMinutes',
  'And that they are waiting.');
select is((public.rpc_rider_contact_attempt('c1120000-0000-4000-8000-0000000000f1', 'shop', 'call', '[No answer]') ->> 'ok')::boolean,
  true, 'A call to the shop goes on the timeline.');
select is(public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f1', 'picked_up', 'guest', null, null,
            '{"checks": ["sealed"]}') ->> 'stage',
  'picked_up', 'The rider picks it up, with their checks.');
reset role;

select ok((select shown_at is not null from public.order_handoff_code
            where order_id = 'c1120000-0000-4000-8000-0000000000f1'),
  'The customer is sent their code at pickup.');

set local role authenticated;
select pg_temp.as_user('c1120000-0000-4000-8000-000000000003');
select ok((select (j -> 'dropoff' ->> 'phone') = '+254700011201' and (j -> 'proof' ->> 'guest') = 'code'
                  and jsonb_array_length(j -> 'contacts') = 1
             from jsonb_array_elements(public.rpc_my_rider_jobs() -> 'jobs') j
            where j ->> 'orderId' = 'c1120000-0000-4000-8000-0000000000f1'),
  'The rider''s job shows the customer''s phone, the code rule and the call.');
select is(public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f1', 'delivered', 'guest') ->> 'reason',
  'code_required', 'Handing it to the customer needs their code.');
select is((public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f1', 'delivered', 'guest', '0000x')
            ->> 'attemptsLeft')::int,
  4, 'A wrong code is counted.');

select pg_temp.as_user('c1120000-0000-4000-8000-000000000001', true);
select set_config('t.code', public.rpc_my_order_handoff_code('c1120000-0000-4000-8000-0000000000f1') ->> 'code', true);
select ok(current_setting('t.code') ~ '^[0-9]{4}$', 'The customer reads their 4-digit code.');

select pg_temp.as_user('c1120000-0000-4000-8000-000000000003');
select throws_ok($$select * from public.order_handoff_code$$, '42501', null,
  'The rider cannot read the code.');
select is((public.rpc_rider_verify_handoff_code('c1120000-0000-4000-8000-0000000000f1',
            current_setting('t.code')) ->> 'verified')::boolean,
  true, 'The rider checks the code the customer gives.');
select is(public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f1', 'delivered', 'guest') ->> 'proof',
  'code', 'And delivers it on that code.');
reset role;

select is((select total_kes::int from public.rider_earning where order_reference = 'DELIVERY-112-A'),
  210, 'The trip''s pay is written from the rate card.');

-- ── B: cash, left with the askari

set local role authenticated;
select pg_temp.as_user('c1120000-0000-4000-8000-000000000003');
select public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f2', 'picked_up');
select is(public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f2', 'delivered', 'askari') ->> 'reason',
  'cash_not_recorded', 'A cash order needs the cash recorded first.');
select is(public.rpc_rider_cash_collected('c1120000-0000-4000-8000-0000000000f2', 60000) ->> 'reason',
  'amount_mismatch', 'The wrong amount is refused.');
select is((public.rpc_rider_cash_collected('c1120000-0000-4000-8000-0000000000f2', 62500) ->> 'amountKes')::int,
  625, 'The right amount is recorded.');
reset role;
select is((select amount_kes::int from public.cash_event
            where order_reference = 'DELIVERY-112-B' and kind = 'collected'),
  625, 'On the rider''s cash ledger.');

set local role authenticated;
select pg_temp.as_user('c1120000-0000-4000-8000-000000000003');
select is(public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f2', 'delivered', 'askari') ->> 'reason',
  'photo_required', 'Left with the askari, it needs a photo.');
select is(public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f2', 'delivered', 'askari', null,
            'c1120000-0000-4000-8000-000000000031/c1120000-0000-4000-8000-0000000000f2/missing.jpg') ->> 'reason',
  'photo_not_found', 'A photo that was never uploaded is refused.');
reset role;
select set_config('t.photo', pg_temp.uploaded('c1120000-0000-4000-8000-0000000000f2', 'askari.jpg'), true);

set local role authenticated;
select pg_temp.as_user('c1120000-0000-4000-8000-000000000003');
select is(public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f2', 'delivered', 'askari', null,
            current_setting('t.photo')) ->> 'proof',
  'photo', 'With the photo, it is delivered.');
reset role;
select is((select photo_path from public.order_event
            where order_id = 'c1120000-0000-4000-8000-0000000000f2' and kind = 'delivered'),
  current_setting('t.photo'), 'And the photo is on the timeline.');

-- ── C: cannot be delivered

set local role authenticated;
select pg_temp.as_user('c1120000-0000-4000-8000-000000000003');
select public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f3', 'picked_up');
select is(pg_temp.hint_of($$select public.rpc_rider_disposal_request('c1120000-0000-4000-8000-0000000000f3',
            '[Customer unreachable for 30 min]', null)$$),
  'photo_not_found', 'Disposing of an order needs a photo.');
reset role;
select set_config('t.dispose', pg_temp.uploaded('c1120000-0000-4000-8000-0000000000f3', 'bin.jpg'), true);

set local role authenticated;
select pg_temp.as_user('c1120000-0000-4000-8000-000000000003');
select is(public.rpc_rider_disposal_request('c1120000-0000-4000-8000-0000000000f3',
            '[Customer unreachable for 30 min]', current_setting('t.dispose')) ->> 'status',
  'pending', 'With the photo, it waits for live operations.');
select is(pg_temp.hint_of($$select public.rpc_rider_order_step('c1120000-0000-4000-8000-0000000000f3', 'arriving')$$),
  'disposal_pending', 'The order does not move while it waits.');
select is((select j -> 'disposal' ->> 'status'
             from jsonb_array_elements(public.rpc_my_rider_jobs() -> 'jobs') j
            where j ->> 'orderId' = 'c1120000-0000-4000-8000-0000000000f3'),
  'pending', 'The rider sees it pending.');
select throws_ok(format($$select public.rpc_dispatch_disposal_decide(%L, true)$$,
  (select id from public.order_disposal where order_id = 'c1120000-0000-4000-8000-0000000000f3')),
  '42501', null, 'The rider cannot approve it.');

select pg_temp.as_user('c1120000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.dispatch_disposal_queue_v
            where order_reference = 'DELIVERY-112-C' and status = 'pending'),
  1, 'Live operations see it in their queue.');
select is(public.rpc_dispatch_disposal_decide(
            (select id from public.dispatch_disposal_queue_v where order_reference = 'DELIVERY-112-C'),
            true, '[Approved]') ->> 'status',
  'approved', 'And approve it.');
reset role;

select is((select stage::text || ' ' || cancel_reason_code from public.order
            where id = 'c1120000-0000-4000-8000-0000000000f3'),
  'cancelled disposed_undeliverable', 'The order is cancelled as disposed of.');
select is((select presence::text from public.rider where id = 'c1120000-0000-4000-8000-000000000031'),
  'online', 'With every job ended, the rider is back online.');
select is((select total_kes::int from public.rider_earning where order_reference = 'DELIVERY-112-C'),
  100, 'And is paid the rate card''s after-pickup amount.');

select * from finish();
rollback;
