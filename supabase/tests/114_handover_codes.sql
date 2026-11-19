-- One code per handover. Pickup: the rider shows, the shop enters. Delivery:
-- the customer shows (from pickup), the rider enters. Collection: the
-- customer shows, the shop enters. Nobody entering a code can read it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- The collection order type arrives with PR #155 (order.fulfilment); add it
-- here, for this test only, if this database does not have it yet.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'order' and column_name = 'fulfilment') then
    alter table public.order add column fulfilment text not null default 'delivery';
  end if;
end $$;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1140000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1140000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'shop114@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1140000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider114@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1140000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'rider114b@example.test', now(), false, now(), now());

insert into public.guest (id, user_id, phone, name)
values ('c1140000-0000-4000-8000-000000000011', 'c1140000-0000-4000-8000-000000000001',
        '+254700011401', '[Guest 114]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1140000-0000-4000-8000-00000000000a', '[Legal 114] Ltd', '[Shop 114]', 'restaurant',
        '[Contact]', '+254700011400', 'shop114@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1140000-0000-4000-8000-00000000000a', 'c1140000-0000-4000-8000-000000000002', 'owner');
insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary, latitude, longitude)
values ('c1140000-0000-4000-8000-0000000000b0', 'c1140000-0000-4000-8000-00000000000a',
        'Main', '[Address 114]', true, -1.2921, 36.8219);

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at)
values
  ('c1140000-0000-4000-8000-000000000031', 'c1140000-0000-4000-8000-000000000003',
   '[Rider]', '[114]', '+254700011402', (select id from public.city where slug = 'nairobi'),
   'motorbike', '[PLATE114]', 'active', 'online', now()),
  ('c1140000-0000-4000-8000-000000000032', 'c1140000-0000-4000-8000-000000000005',
   '[Rider]', '[114B]', '+254700011403', (select id from public.city where slug = 'nairobi'),
   'motorbike', '[PLATE114B]', 'active', 'online', now());

-- A: delivered by a rider. C: the customer collects it.
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency, rider_id)
values
  ('c1140000-0000-4000-8000-0000000000f1', 'CODES-114-A', 'c1140000-0000-4000-8000-000000000011',
   'c1140000-0000-4000-8000-00000000000a', 'c1140000-0000-4000-8000-0000000000b0',
   (select id from public.city where slug = 'nairobi'), 'web', '[Guest estate]',
   'ready', 'mpesa_stk', 'paid', 50000, 10000, 2500, 62500, 'KES', 'c1140000-0000-4000-8000-000000000031'),
  ('c1140000-0000-4000-8000-0000000000f3', 'CODES-114-C', 'c1140000-0000-4000-8000-000000000011',
   'c1140000-0000-4000-8000-00000000000a', 'c1140000-0000-4000-8000-0000000000b0',
   (select id from public.city where slug = 'nairobi'), 'web', '[At the shop]',
   'preparing', 'mpesa_stk', 'paid', 50000, 0, 2500, 52500, 'KES', null);
update public.order set fulfilment = 'pickup' where id = 'c1140000-0000-4000-8000-0000000000f3';

insert into dispatch.job (order_id, city_id, pickup_label, dropoff_label, distance_km, state,
                          assigned_rider_id, assigned_at)
values ('c1140000-0000-4000-8000-0000000000f1', (select id from public.city where slug = 'nairobi'),
        '[Shop 114]', '[Guest estate]', 4, 'assigned', 'c1140000-0000-4000-8000-000000000031', now());

create function pg_temp.as_user(p_uid text, p_anonymous boolean default false) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text, true)
$$;

-- ── pickup: the rider shows, the shop enters

set local role authenticated;
select pg_temp.as_user('c1140000-0000-4000-8000-000000000003');
select set_config('t.pickup', public.rpc_my_rider_pickup_code('c1140000-0000-4000-8000-0000000000f1') ->> 'code', true);
select ok(current_setting('t.pickup') ~ '^[0-9]{4}$', 'The assigned rider has a 4-digit pickup code.');

select pg_temp.as_user('c1140000-0000-4000-8000-000000000005');
select throws_ok($$select public.rpc_my_rider_pickup_code('c1140000-0000-4000-8000-0000000000f1')$$,
  'P0002', null, 'Another rider cannot read it.');

select pg_temp.as_user('c1140000-0000-4000-8000-000000000002');
select throws_ok($$select * from public.order_shop_code$$, '42501', null, 'The shop cannot read the codes.');
select throws_ok($$select public.rpc_my_rider_pickup_code('c1140000-0000-4000-8000-0000000000f1')$$,
  '42501', null, 'Nor read the rider''s code through the rider''s function.');
select is(public.rpc_merchant_handover_code_enter('c1140000-0000-4000-8000-0000000000f1', 'x') ->> 'reason',
  'wrong_code', 'A wrong code is refused.');
select is((public.rpc_merchant_handover_code_enter('c1140000-0000-4000-8000-0000000000f1', 'y') ->> 'attemptsLeft')::int,
  3, 'And counted.');

-- ── delivery code: nothing to show before pickup

select pg_temp.as_user('c1140000-0000-4000-8000-000000000001', true);
select is(public.rpc_my_order_handoff_code('c1140000-0000-4000-8000-0000000000f1') ->> 'code', null,
  'Before pickup the customer has no delivery code to show.');

select pg_temp.as_user('c1140000-0000-4000-8000-000000000002');
select is(public.rpc_merchant_handover_code_enter('c1140000-0000-4000-8000-0000000000f1',
            current_setting('t.pickup')) ->> 'stage',
  'picked_up', 'The rider''s code, entered by the shop, picks the order up.');
select is(public.rpc_merchant_handover_code_enter('c1140000-0000-4000-8000-0000000000f1',
            current_setting('t.pickup')) ->> 'reason',
  'used', 'A used code does nothing more.');
reset role;

select is((select payload ->> 'proof' from public.order_event
            where order_id = 'c1140000-0000-4000-8000-0000000000f1' and kind = 'picked_up'),
  'shop_code', 'The timeline says the shop checked the code.');

set local role authenticated;
select pg_temp.as_user('c1140000-0000-4000-8000-000000000003');
select is(public.rpc_my_rider_pickup_code('c1140000-0000-4000-8000-0000000000f1') ->> 'code', null,
  'The rider''s pickup code is spent.');

-- ── delivery: the customer shows, the rider enters

select pg_temp.as_user('c1140000-0000-4000-8000-000000000001', true);
select set_config('t.delivery', public.rpc_my_order_handoff_code('c1140000-0000-4000-8000-0000000000f1') ->> 'code', true);
select ok(current_setting('t.delivery') ~ '^[0-9]{4}$', 'Once picked up, the customer sees a delivery code.');

select pg_temp.as_user('c1140000-0000-4000-8000-000000000003');
select public.rpc_rider_order_step('c1140000-0000-4000-8000-0000000000f1', 'arriving');
select pg_temp.as_user('c1140000-0000-4000-8000-000000000001', true);
select is(public.rpc_my_order_handoff_code('c1140000-0000-4000-8000-0000000000f1') ->> 'code',
  current_setting('t.delivery'), 'It is still there while the rider is arriving.');

select pg_temp.as_user('c1140000-0000-4000-8000-000000000003');
select is(public.rpc_rider_order_step('c1140000-0000-4000-8000-0000000000f1', 'delivered', 'guest',
            current_setting('t.delivery')) ->> 'stage',
  'delivered', 'The rider enters it and the order is delivered.');
select pg_temp.as_user('c1140000-0000-4000-8000-000000000001', true);
select is(public.rpc_my_order_handoff_code('c1140000-0000-4000-8000-0000000000f1') ->> 'code', null,
  'Once delivered the code is gone.');

-- ── collection: the customer shows, the shop enters

select is(public.rpc_my_order_collection_code('c1140000-0000-4000-8000-0000000000f3') ->> 'code', null,
  'Before it is ready, there is no collection code.');
select pg_temp.as_user('c1140000-0000-4000-8000-000000000002');
reset role;
update public.order set stage = 'ready', ready_at = now() where id = 'c1140000-0000-4000-8000-0000000000f3';
set local role authenticated;
select is(public.rpc_merchant_handover_code_enter('c1140000-0000-4000-8000-0000000000f3', '1234') ->> 'reason',
  'no_code', 'Until the customer opens it, the shop has nothing to check against.');

select pg_temp.as_user('c1140000-0000-4000-8000-000000000001', true);
select set_config('t.collect', public.rpc_my_order_collection_code('c1140000-0000-4000-8000-0000000000f3') ->> 'code', true);
select ok(current_setting('t.collect') ~ '^[0-9]{4}$', 'Ready, the customer sees a collection code.');
select is(public.rpc_my_order_handoff_code('c1140000-0000-4000-8000-0000000000f3') ->> 'code', null,
  'A collection order has no delivery code.');

select pg_temp.as_user('c1140000-0000-4000-8000-000000000002');
select is(public.rpc_merchant_handover_code_enter('c1140000-0000-4000-8000-0000000000f3',
            current_setting('t.collect')) ->> 'kind',
  'collection', 'The shop enters the customer''s code.');
reset role;
select is((select stage::text || ' ' || handed_to::text from public.order where id = 'c1140000-0000-4000-8000-0000000000f3'),
  'delivered guest', 'And the order is collected.');

set local role authenticated;
select pg_temp.as_user('c1140000-0000-4000-8000-000000000001', true);
select is(public.rpc_my_order_collection_code('c1140000-0000-4000-8000-0000000000f3') ->> 'code', null,
  'The used collection code is gone.');

-- ── a city that requires the shop's code

reset role;
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency, rider_id)
values ('c1140000-0000-4000-8000-0000000000f4', 'CODES-114-D', 'c1140000-0000-4000-8000-000000000011',
   'c1140000-0000-4000-8000-00000000000a', 'c1140000-0000-4000-8000-0000000000b0',
   (select id from public.city where slug = 'nairobi'), 'web', '[Guest estate]',
   'ready', 'mpesa_stk', 'paid', 1000, 100, 0, 1100, 'KES', 'c1140000-0000-4000-8000-000000000032');
insert into dispatch.job (order_id, city_id, pickup_label, dropoff_label, state, assigned_rider_id, assigned_at)
values ('c1140000-0000-4000-8000-0000000000f4', (select id from public.city where slug = 'nairobi'),
        '[Shop 114]', '[Guest estate]', 'assigned', 'c1140000-0000-4000-8000-000000000032', now());
create function pg_temp.pickup_required() returns boolean language plpgsql as $$
begin
  -- The setting is read through settings.fn_bool; override it for this test.
  create or replace function settings.fn_bool(p_key text, p_city_id uuid default null, p_category text default null)
  returns boolean language sql stable set search_path = '' as
  'select case when p_key = ''dispatch.pickup_code_required'' then true
               else nullif(settings.fn_value(p_key, p_city_id, p_category) #>> ''{}'', '''')::boolean end';
  return true;
end $$;
select pg_temp.pickup_required();

set local role authenticated;
select pg_temp.as_user('c1140000-0000-4000-8000-000000000005');
select throws_ok($$select public.rpc_rider_order_step('c1140000-0000-4000-8000-0000000000f4', 'picked_up')$$,
  '22023', null, 'Where the city requires it, the rider cannot tap "picked up" alone.');
select pg_temp.as_user('c1140000-0000-4000-8000-000000000002');
select is(public.rpc_merchant_handover_code_enter('c1140000-0000-4000-8000-0000000000f4',
            (select '0000') ) ->> 'reason', 'wrong_code', 'The shop still enters the right code to hand it over.');
reset role;

select * from finish();
rollback;
