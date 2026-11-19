-- A delivery order moves from placed to delivered: the shop starts and readies
-- it, the rider search opens, the rider picks it up and delivers it, and the
-- guest who ordered sees every step and the map, live position included.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  -- the guest (temporary session), the shop's owner, the rider, a stranger
  ('00000000-0000-0000-0000-000000000000', 'c1070000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1070000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'shop107@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1070000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider107@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1070000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'stranger107@example.test', now(), false, now(), now());

insert into public.guest (id, user_id, phone, name)
values ('c1070000-0000-4000-8000-000000000011', 'c1070000-0000-4000-8000-000000000001',
        '+254700010701', '[Guest]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1070000-0000-4000-8000-00000000000a', '[Legal 107] Ltd', '[Shop 107]', 'restaurant',
        '[Contact]', '+254700010700', 'shop107@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1070000-0000-4000-8000-00000000000a', 'c1070000-0000-4000-8000-000000000002', 'owner');
insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary, latitude, longitude)
values ('c1070000-0000-4000-8000-0000000000b0', 'c1070000-0000-4000-8000-00000000000a',
        'Main', '[Address]', true, -1.2921, 36.8219);

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no, status, activated_at)
values ('c1070000-0000-4000-8000-000000000031', 'c1070000-0000-4000-8000-000000000003',
        '[Rider]', '[107]', '+254700010702', (select id from public.city where slug = 'nairobi'),
        'motorbike', '[PLATE107]', 'active', now());

-- An order paid by M-Pesa and one still waiting for payment.
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, dropoff_point, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
values
  ('c1070000-0000-4000-8000-0000000000f1', 'STAGES-107-A', 'c1070000-0000-4000-8000-000000000011',
   'c1070000-0000-4000-8000-00000000000a', 'c1070000-0000-4000-8000-0000000000b0',
   (select id from public.city where slug = 'nairobi'), 'web', '[Guest home]',
   extensions.st_setsrid(extensions.st_makepoint(36.80, -1.30), 4326)::extensions.geography,
   'placed', 'mpesa_stk', 'paid', 50000, 10000, 2500, 62500, 'KES'),
  ('c1070000-0000-4000-8000-0000000000f2', 'STAGES-107-B', 'c1070000-0000-4000-8000-000000000011',
   'c1070000-0000-4000-8000-00000000000a', 'c1070000-0000-4000-8000-0000000000b0',
   (select id from public.city where slug = 'nairobi'), 'web', '[Guest home]',
   extensions.st_setsrid(extensions.st_makepoint(36.80, -1.30), 4326)::extensions.geography,
   'placed', 'mpesa_stk', 'pending', 50000, 10000, 2500, 62500, 'KES');

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

-- ── the shop

select ok(has_function_privilege('authenticated', 'public.rpc_merchant_order_step(uuid, text)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.rpc_merchant_order_step(uuid, text)', 'EXECUTE'),
  'Only signed-in sessions can call the shop''s step.');

set local role authenticated;
select pg_temp.as_user('c1070000-0000-4000-8000-000000000004');
select throws_ok($$select public.rpc_merchant_order_step('c1070000-0000-4000-8000-0000000000f1', 'start')$$,
  'P0002', 'Order not found.', 'Somebody outside the shop cannot move its order.');

select pg_temp.as_user('c1070000-0000-4000-8000-000000000002');
select is(pg_temp.hint_of($$select public.rpc_merchant_order_step('c1070000-0000-4000-8000-0000000000f2', 'start')$$),
  'awaiting_payment', 'An order not yet paid cannot be started.');
select is(pg_temp.hint_of($$select public.rpc_merchant_order_step('c1070000-0000-4000-8000-0000000000f1', 'ready')$$),
  'wrong_stage', 'Nor can an order be marked ready before it is started.');

select is(public.rpc_merchant_order_step('c1070000-0000-4000-8000-0000000000f1', 'start') ->> 'stage',
  'preparing', 'The shop starts a paid order.');
select is((public.rpc_merchant_order_step('c1070000-0000-4000-8000-0000000000f1', 'start') ->> 'already')::boolean,
  true, 'A second tap changes nothing.');
reset role;

select is((select stage::text from public.order where id = 'c1070000-0000-4000-8000-0000000000f1'),
  'preparing', 'The order is being prepared.');
select ok((select confirmed_at is not null from public.order where id = 'c1070000-0000-4000-8000-0000000000f1'),
  'And counts as confirmed.');
select is((select what_now from public.merchant_orders_v where id = 'c1070000-0000-4000-8000-0000000000f1'),
  'cooking', 'The Work page shows it as preparing.');

set local role authenticated;
select pg_temp.as_user('c1070000-0000-4000-8000-000000000002');
select is(public.rpc_merchant_order_step('c1070000-0000-4000-8000-0000000000f1', 'ready') ->> 'stage',
  'ready', 'The shop marks it ready.');
reset role;

select ok((select ready_at is not null from public.order where id = 'c1070000-0000-4000-8000-0000000000f1'),
  'With the time it was ready.');
select is((select count(*)::int from dispatch.job
            where order_id = 'c1070000-0000-4000-8000-0000000000f1'
              and state not in ('cancelled', 'completed')),
  1, 'And the rider search opened by itself.');

-- ── the customer, part way

set local role authenticated;
select pg_temp.as_user('c1070000-0000-4000-8000-000000000001', true);
select is((select array_agg(kind order by id) from public.order_event
            where order_id = 'c1070000-0000-4000-8000-0000000000f1'),
  array['confirmed', 'preparing', 'ready'], 'The guest reads each step so far.');
select is(public.rpc_my_order_map('c1070000-0000-4000-8000-0000000000f1') ->> 'status',
  'locations-only', 'And the guest sees the map: shop and drop-off pins.');
select is(jsonb_array_length(public.rpc_my_order_map('c1070000-0000-4000-8000-0000000000f1') -> 'places'),
  2, 'Both pins.');

select pg_temp.as_user('c1070000-0000-4000-8000-000000000004');
select throws_ok($$select public.rpc_my_order_map('c1070000-0000-4000-8000-0000000000f1')$$,
  'P0002', 'Order map not found.', 'Somebody else cannot see that map.');
reset role;

-- ── a rider takes it (offer answers are tested in 86; here the job is assigned)

update dispatch.job set state = 'assigned', assigned_rider_id = 'c1070000-0000-4000-8000-000000000031',
       assigned_at = now()
 where order_id = 'c1070000-0000-4000-8000-0000000000f1' and state not in ('cancelled', 'completed');
update public.order set rider_id = 'c1070000-0000-4000-8000-000000000031'
 where id = 'c1070000-0000-4000-8000-0000000000f1';

set local role authenticated;
select pg_temp.as_user('c1070000-0000-4000-8000-000000000004');
select throws_ok($$select public.rpc_rider_order_step('c1070000-0000-4000-8000-0000000000f1', 'picked_up')$$,
  '42501', null, 'Somebody who is not a rider cannot move it.');

select pg_temp.as_user('c1070000-0000-4000-8000-000000000003');
select is(pg_temp.hint_of($$select public.rpc_rider_order_step('c1070000-0000-4000-8000-0000000000f1', 'delivered')$$),
  'wrong_stage', 'The rider cannot deliver what they have not picked up.');
select throws_ok($$select public.rpc_rider_order_step('c1070000-0000-4000-8000-0000000000f2', 'picked_up')$$,
  'P0002', 'This order is not assigned to you.', 'Nor touch an order that is not theirs.');
select is(public.rpc_rider_order_step('c1070000-0000-4000-8000-0000000000f1', 'picked_up') ->> 'stage',
  'picked_up', 'The rider picks it up.');

-- The rider shares their position (20270109000200), now that it is picked up.
select is((select (a ->> 'canShare')::boolean
             from jsonb_array_elements(public.rpc_my_rider_map_assignments() -> 'assignments') a
            where a ->> 'orderId' = 'c1070000-0000-4000-8000-0000000000f1'),
  true, 'The rider can share their position with a guest''s order.');
-- As the Rider app does: the assignment it is offered names the job and time.
select set_config('t.share', (
  select public.rpc_rider_map_share_start(
           (a ->> 'orderId')::uuid, (a ->> 'assignmentId')::uuid, (a ->> 'assignedAt')::timestamptz)
         ->> 'shareId'
    from jsonb_array_elements(public.rpc_my_rider_map_assignments() -> 'assignments') a
   where a ->> 'orderId' = 'c1070000-0000-4000-8000-0000000000f1'), true);
select is((public.rpc_rider_map_share_publish(current_setting('t.share')::uuid, 1,
             clock_timestamp() - interval '1 second', -1.295, 36.81) ->> 'sequence')::int,
  1, 'And sends a position.');

select pg_temp.as_user('c1070000-0000-4000-8000-000000000001', true);
select is(public.rpc_my_order_map('c1070000-0000-4000-8000-0000000000f1', '2') ->> 'status',
  'live', 'The guest sees the rider moving on the map.');
select is((public.rpc_my_order_map('c1070000-0000-4000-8000-0000000000f1', '2') -> 'courier' ->> 'latitude')::numeric,
  -1.295, 'At the position the rider sent.');

-- The guest reads the code they give the rider (20270115000400).
select set_config('t.code',
  public.rpc_my_order_handoff_code('c1070000-0000-4000-8000-0000000000f1') ->> 'code', true);

select pg_temp.as_user('c1070000-0000-4000-8000-000000000003');
select is(public.rpc_rider_order_step('c1070000-0000-4000-8000-0000000000f1', 'arriving') ->> 'stage',
  'arriving', 'The rider is arriving.');
select is(public.rpc_rider_order_step('c1070000-0000-4000-8000-0000000000f1', 'delivered', 'guest',
            current_setting('t.code')) ->> 'stage',
  'delivered', 'And delivers it, with the guest''s code.');
reset role;

select is((select handed_to::text from public.order where id = 'c1070000-0000-4000-8000-0000000000f1'),
  'guest', 'Handed to the guest.');
select is((select state::text from dispatch.job where order_id = 'c1070000-0000-4000-8000-0000000000f1'),
  'completed', 'The rider''s job is complete.');
select is((select what_now from public.merchant_orders_v where id = 'c1070000-0000-4000-8000-0000000000f1'),
  'done', 'The Work page shows it delivered.');

-- ── the customer, at the end

set local role authenticated;
select pg_temp.as_user('c1070000-0000-4000-8000-000000000001', true);
select is((select array_agg(kind order by id) from public.order_event
            where order_id = 'c1070000-0000-4000-8000-0000000000f1'),
  array['confirmed', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered'],
  'The guest reads every step.');
select is(public.rpc_my_order_map('c1070000-0000-4000-8000-0000000000f1') ->> 'reason',
  'completed', 'And the map closes once it is delivered.');
reset role;

select * from finish();
rollback;
