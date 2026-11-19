-- A shop marks an order ready and a rider is offered it: the rider's app has
-- sent where they are, the rider search (started in the shop's session) finds
-- them, they read the offer, accept it and pick the order up. A rider whose
-- position is old is skipped and says why.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  -- the guest (temporary session), the shop's owner, a rider nearby, a rider
  -- with an old position, a stranger
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'shop110@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'rider110a@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'rider110b@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'stranger110@example.test', now(), false, now(), now());

insert into public.guest (id, user_id, phone, name)
values ('c1100000-0000-4000-8000-000000000011', 'c1100000-0000-4000-8000-000000000001',
        '+254700011001', '[Guest]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1100000-0000-4000-8000-00000000000a', '[Legal 110] Ltd', '[Shop 110]', 'restaurant',
        '[Contact]', '+254700011000', 'shop110@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1100000-0000-4000-8000-00000000000a', 'c1100000-0000-4000-8000-000000000002', 'owner');
insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary, latitude, longitude)
values ('c1100000-0000-4000-8000-0000000000b0', 'c1100000-0000-4000-8000-00000000000a',
        'Main', '[Address 110]', true, -1.2921, 36.8219);

-- Rider A starts offline with no position. Rider B is online, a few hundred
-- metres away, but last sent a position ten minutes ago.
insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no,
                          status, presence, activated_at, last_location, last_location_at)
values
  ('c1100000-0000-4000-8000-000000000031', 'c1100000-0000-4000-8000-000000000003',
   '[Rider]', '[110A]', '+254700011002', (select id from public.city where slug = 'nairobi'),
   'motorbike', '[PLATE110A]', 'active', 'offline', now(), null, null),
  ('c1100000-0000-4000-8000-000000000032', 'c1100000-0000-4000-8000-000000000005',
   '[Rider]', '[110B]', '+254700011003', (select id from public.city where slug = 'nairobi'),
   'motorbike', '[PLATE110B]', 'active', 'online', now(),
   extensions.st_setsrid(extensions.st_makepoint(36.8210, -1.2930), 4326)::extensions.geography,
   now() - interval '10 minutes');

insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, dropoff_point, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
values
  ('c1100000-0000-4000-8000-0000000000f1', 'OFFERS-110-A', 'c1100000-0000-4000-8000-000000000011',
   'c1100000-0000-4000-8000-00000000000a', 'c1100000-0000-4000-8000-0000000000b0',
   (select id from public.city where slug = 'nairobi'), 'web', '[Guest estate]',
   extensions.st_setsrid(extensions.st_makepoint(36.80, -1.30), 4326)::extensions.geography,
   'placed', 'mpesa_stk', 'paid', 50000, 10000, 2500, 62500, 'KES');
insert into public.order_item (order_id, name, quantity, unit_price_cents, line_total_cents)
values ('c1100000-0000-4000-8000-0000000000f1', '[Dish]', 2, 25000, 50000);

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

-- ── who may call what

select ok(has_function_privilege('authenticated', 'public.rpc_rider_location_ping(double precision, double precision, timestamptz)', 'EXECUTE')
          and not has_function_privilege('anon', 'public.rpc_rider_location_ping(double precision, double precision, timestamptz)', 'EXECUTE'),
  'Only signed-in sessions can send a position.');
select ok(has_function_privilege('authenticated', 'public.rpc_my_rider_offers()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.rpc_my_rider_offers()', 'EXECUTE'),
  'Only signed-in sessions can read offers.');
select ok(not has_function_privilege('authenticated', 'dispatch.fn_riders_now(uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'dispatch.fn_candidates_now(uuid, boolean)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'dispatch.fn_offer_round(uuid)', 'EXECUTE'),
  'Nobody signed in can call the round''s internal rider list or start a round.');

-- ── the rider sends where they are

set local role authenticated;
select pg_temp.as_user('c1100000-0000-4000-8000-000000000004');
select throws_ok($$select public.rpc_rider_location_ping(-1.2930, 36.8200)$$,
  '42501', null, 'Somebody who is not a rider cannot send a position.');
select throws_ok($$select public.rpc_my_rider_offers()$$,
  '42501', null, 'Nor read offers.');

select pg_temp.as_user('c1100000-0000-4000-8000-000000000003');
select is(public.rpc_rider_location_ping(-1.2930, 36.8200) ->> 'reason',
  'offline', 'Offline, the position is not stored.');
select ok((select last_location is null from public.rider where id = 'c1100000-0000-4000-8000-000000000031'),
  'Nothing was written.');

select is(public.rpc_rider_go_online(true) ->> 'presence', 'online', 'The rider goes online.');
select is(pg_temp.hint_of($$select public.rpc_rider_location_ping(95, 36.82)$$),
  'bad_position', 'A position off the map is refused.');
select is(pg_temp.hint_of($$select public.rpc_rider_location_ping(-1.293, 36.82, clock_timestamp() + interval '1 minute')$$),
  'bad_time', 'So is one from the future.');
select is(public.rpc_rider_location_ping(-1.293, 36.82, clock_timestamp() - interval '5 minutes') ->> 'reason',
  'too_old', 'One five minutes old is not used.');
select is((public.rpc_rider_location_ping(-1.2930, 36.8200) ->> 'ok')::boolean,
  true, 'A current position is taken.');
reset role;

select ok((select last_location is not null and last_location_at is not null
             from public.rider where id = 'c1100000-0000-4000-8000-000000000031'),
  'And stored on the rider, where dispatch reads it.');

set local role authenticated;
select pg_temp.as_user('c1100000-0000-4000-8000-000000000003');
select is((public.rpc_rider_location_ping(-1.2931, 36.8201,
             (select last_location_at from public.rider where id = 'c1100000-0000-4000-8000-000000000031')
               + interval '1 second') ->> 'ignored')::boolean,
  true, 'A second point within five seconds is ignored.');

-- ── the shop marks it ready, in its own session

select pg_temp.as_user('c1100000-0000-4000-8000-000000000002');
select is(public.rpc_merchant_order_step('c1100000-0000-4000-8000-0000000000f1', 'start') ->> 'stage',
  'preparing', 'The shop starts the order.');
select is((public.rpc_merchant_order_step('c1100000-0000-4000-8000-0000000000f1', 'ready') ->> 'rider_search')::boolean,
  true, 'And marks it ready; the rider search opens.');
reset role;

select is((select o.outcome::text from dispatch.offer o join dispatch.job j on j.id = o.job_id
            where j.order_id = 'c1100000-0000-4000-8000-0000000000f1'
              and o.rider_id = 'c1100000-0000-4000-8000-000000000031'),
  'pending', 'The search, started by the shop, offers it to the rider nearby.');
select is((select o.skip_reason::text from dispatch.offer o join dispatch.job j on j.id = o.job_id
            where j.order_id = 'c1100000-0000-4000-8000-0000000000f1'
              and o.rider_id = 'c1100000-0000-4000-8000-000000000032'),
  'location_stale', 'The rider with a ten-minute-old position is skipped, and the reason says so.');

-- ── the rider reads the offer and takes it

set local role authenticated;
select pg_temp.as_user('c1100000-0000-4000-8000-000000000003');
select set_config('t.offer', (
  select o ->> 'offerId' from jsonb_array_elements(public.rpc_my_rider_offers() -> 'offers') o
   where o ->> 'orderId' = 'c1100000-0000-4000-8000-0000000000f1'), true);
select ok(current_setting('t.offer', true) is not null
          and (select (o -> 'pickup' ->> 'latitude')::numeric = -1.2921
                      and o -> 'dropoff' ->> 'label' = '[Guest estate]'
                      and not (o -> 'dropoff' ? 'latitude')
                      and (o ->> 'itemCount')::int = 2
                      and o -> 'payment' ->> 'collectCents' is null
                      and o ->> 'expiresAt' is not null
                 from jsonb_array_elements(public.rpc_my_rider_offers() -> 'offers') o
                where o ->> 'offerId' = current_setting('t.offer', true)),
  'The rider reads the offer: the shop''s pin, the drop-off by name only, two items, nothing to collect, and a deadline.');

select is((select count(*)::int from dispatch.fn_candidates(
             (select id from dispatch.job where order_id = 'c1100000-0000-4000-8000-0000000000f1'), true)),
  0, 'The rider cannot read the candidate list; that stays live operations''.');

select pg_temp.as_user('c1100000-0000-4000-8000-000000000005');
select is((select count(*)::int from jsonb_array_elements(public.rpc_my_rider_offers() -> 'offers') o
            where o ->> 'orderId' = 'c1100000-0000-4000-8000-0000000000f1'),
  0, 'The skipped rider has no offer for it.');

select pg_temp.as_user('c1100000-0000-4000-8000-000000000003');
select is((public.rpc_dispatch_offer_respond(current_setting('t.offer')::uuid, true) ->> 'accepted')::boolean,
  true, 'The rider accepts.');
select is(jsonb_array_length(public.rpc_my_rider_offers() -> 'offers'),
  0, 'An accepted offer leaves the list.');
select is(public.rpc_rider_order_step('c1100000-0000-4000-8000-0000000000f1', 'picked_up') ->> 'stage',
  'picked_up', 'And picks the order up.');
reset role;

select * from finish();
rollback;
