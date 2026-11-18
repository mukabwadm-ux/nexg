begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0730000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'first73@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0730000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'second73@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0730000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', null, null, true, now(), now());

insert into public.guest (id, user_id, name, anonymised_at)
values
  ('c0730000-0000-4000-8000-000000000011', 'c0730000-0000-4000-8000-000000000001', '[Owner]', null),
  ('c0730000-0000-4000-8000-000000000012', 'c0730000-0000-4000-8000-000000000001', null, now()),
  ('c0730000-0000-4000-8000-000000000013', 'c0730000-0000-4000-8000-000000000003', '[Temporary]', null),
  ('c0730000-0000-4000-8000-000000000014', null, '[Unlinked]', null);

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id)
values
  ('c0730000-0000-4000-8000-000000000021', '[Legal A]', '[Merchant A]', 'restaurant', '[Contact]',
    '+254700007301', 'merchant.a73@example.test', (select id from public.city where slug = 'nairobi')),
  ('c0730000-0000-4000-8000-000000000022', '[Legal B]', '[Merchant B]', 'restaurant', '[Contact]',
    '+254700007302', 'merchant.b73@example.test', (select id from public.city where slug = 'nairobi'));

insert into public.merchant_branch (id, merchant_id, name, address_text, latitude, longitude)
values
  ('c0730000-0000-4000-8000-000000000031', 'c0730000-0000-4000-8000-000000000021', 'Zero', '[Address A]', 0, 0),
  ('c0730000-0000-4000-8000-000000000032', 'c0730000-0000-4000-8000-000000000022', 'Foreign', '[Address B]', 3, 4),
  ('c0730000-0000-4000-8000-000000000033', 'c0730000-0000-4000-8000-000000000021', 'Partial', '[Address C]', 5, null);

insert into public.rider (
  id, first_name, last_name, phone, city_id, vehicle, plate_no, status, activated_at, last_location, last_location_at
)
values (
  'c0730000-0000-4000-8000-000000000041', '[Rider]', '[Location fixture]', '+254700007303',
  (select id from public.city where slug = 'nairobi'), 'motorbike', '[PLATE-73]', 'active', now(),
  extensions.st_setsrid(extensions.st_makepoint(20, 10), 4326)::extensions.geography, now()
);

insert into public."order" (
  id, reference, guest_id, merchant_id, branch_id, city_id, stage,
  payment_method, dropoff_label, dropoff_point, dropoff_note, handed_to, cancel_reason_code, rider_id, eta_at
)
select
  ('c0730000-0000-4000-8000-0000000000' || fixture.suffix)::uuid,
  'TEST-MAP-73-' || fixture.suffix,
  ('c0730000-0000-4000-8000-0000000000' || fixture.guest)::uuid,
  'c0730000-0000-4000-8000-000000000021',
  ('c0730000-0000-4000-8000-0000000000' || fixture.branch)::uuid,
  (select id from public.city where slug = 'nairobi'),
  fixture.stage::public.order_stage,
  'mpesa_stk', '[Private order label]',
  extensions.st_setsrid(extensions.st_makepoint(fixture.dropoff_lng, fixture.dropoff_lat), 4326)::extensions.geography,
  '[Private order note]',
  case when fixture.stage = 'delivered' then 'guest'::public.handoff_target end,
  case when fixture.stage = 'cancelled' then 'test-cancelled' end,
  case when fixture.suffix = '51' then 'c0730000-0000-4000-8000-000000000041'::uuid end,
  now() + interval '10 minutes'
from (values
  ('51', '11', '31', 'picked_up', 0, 0),
  ('52', '11', '31', 'placed', null, null),
  ('53', '11', '32', 'confirmed', 1, 2),
  ('54', '11', '33', 'preparing', null, null),
  ('55', '11', '31', 'delivered', 1, 2),
  ('56', '11', '31', 'cancelled', 1, 2),
  ('57', '11', '31', 'refunded', 1, 2),
  ('58', '11', '31', 'disputed', 1, 2),
  ('59', '12', '31', 'ready', 1, 2),
  ('5a', '13', '31', 'ready', 1, 2),
  ('5b', '14', '31', 'ready', 1, 2)
) as fixture(suffix, guest, branch, stage, dropoff_lat, dropoff_lng);

insert into dispatch.job (order_id, city_id, state, pickup_point, pickup_label, dropoff_label, assigned_rider_id)
select
  ('c0730000-0000-4000-8000-0000000000' || fixture.suffix)::uuid,
  (select id from public.city where slug = 'nairobi'),
  fixture.state::dispatch.job_state,
  extensions.st_setsrid(extensions.st_makepoint(fixture.lng, fixture.lat), 4326)::extensions.geography,
  '[Private snapshot pickup]', '[Private snapshot dropoff]',
  case when fixture.state = 'assigned' then 'c0730000-0000-4000-8000-000000000041'::uuid end
from (values
  ('51', 'assigned', -1.25, 36.75),
  ('52', 'queued', null, null),
  ('52', 'cancelled', 12, 15),
  ('53', 'queued', 3, 4),
  ('54', 'completed', 14, 16)
) as fixture(suffix, state, lat, lng);

select ok(not has_function_privilege('anon', 'public.rpc_my_order_map(uuid)', 'EXECUTE'),
  'Signed-out users have no execute grant.');
select ok(has_function_privilege('authenticated', 'public.rpc_my_order_map(uuid)', 'EXECUTE'),
  'The authenticated PostgREST role can call the RPC.');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.rpc_my_order_map('c0730000-0000-4000-8000-000000000051')$$,
  '42501', 'Sign in with your account to view an order map.', 'A bearer subject is required.');
select set_config('request.jwt.claims',
  '{"sub":"c0730000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}', true);
-- Since 20270108000300_order_stages a guest (temporary session) reads the map of
-- an order it owns (tests/107_order_stages.sql).
select is(public.rpc_my_order_map('c0730000-0000-4000-8000-00000000005a') -> 'record' ->> 'id',
  'c0730000-0000-4000-8000-00000000005a', 'A temporary session reads the map of the order it owns.');
select set_config('request.jwt.claims',
  '{"sub":"c0730000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.rpc_my_order_map('c0730000-0000-4000-8000-000000000051')$$,
  'P0002', 'Order map not found.', 'A foreign order is indistinguishable from an absent order.');
select throws_ok($$select public.rpc_my_order_map('c0730000-0000-4000-8000-000000000099')$$,
  'P0002', 'Order map not found.', 'An absent order returns the same error.');

select set_config('request.jwt.claims',
  '{"sub":"c0730000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.rpc_my_order_map('c0730000-0000-4000-8000-000000000059')$$,
  'P0002', 'Order map not found.', 'An anonymised guest cannot authorize an order read.');
select throws_ok($$select public.rpc_my_order_map('c0730000-0000-4000-8000-00000000005b')$$,
  'P0002', 'Order map not found.', 'A guest without a linked user cannot authorize an order read.');

select is(public.rpc_my_order_map('c0730000-0000-4000-8000-000000000051'),
  '{
    "contractVersion":"1",
    "accountId":"c0730000-0000-4000-8000-000000000001",
    "record":{"kind":"order","id":"c0730000-0000-4000-8000-000000000051"},
    "status":"locations-only",
    "stage":"picked_up",
    "places":[
      {
        "id":"order:c0730000-0000-4000-8000-000000000051:pickup",
        "latitude":-1.25,"longitude":36.75,"title":"Pickup location","role":"pickup"
      },
      {
        "id":"order:c0730000-0000-4000-8000-000000000051:dropoff",
        "latitude":0,"longitude":0,"title":"Delivery location","role":"dropoff"
      }
    ],
    "courier":null
  }'::jsonb,
  'The current snapshot takes precedence, zero dropoff stays valid, and the payload omits private order and rider data.');

select is(public.rpc_my_order_map('c0730000-0000-4000-8000-000000000052')->'places',
  '[{
    "id":"order:c0730000-0000-4000-8000-000000000052:pickup",
    "latitude":0,"longitude":0,"title":"Pickup location","role":"pickup"
  }]'::jsonb, 'An empty current snapshot uses the matching branch and ignores cancelled job history.');
select is(public.rpc_my_order_map('c0730000-0000-4000-8000-000000000053')->'places',
  '[{
    "id":"order:c0730000-0000-4000-8000-000000000053:dropoff",
    "latitude":1,"longitude":2,"title":"Delivery location","role":"dropoff"
  }]'::jsonb, 'A wrong-merchant branch and its current snapshot are ignored, preserving the valid dropoff.');
select is(public.rpc_my_order_map('c0730000-0000-4000-8000-000000000054'),
  '{
    "contractVersion":"1",
    "accountId":"c0730000-0000-4000-8000-000000000001",
    "record":{"kind":"order","id":"c0730000-0000-4000-8000-000000000054"},
    "status":"unavailable","stage":"preparing","places":[],"courier":null,"reason":"locations-missing"
  }'::jsonb, 'A partial branch pair and historical job cannot create a pickup.');

select is(public.rpc_my_order_map('c0730000-0000-4000-8000-000000000055'),
  '{
    "contractVersion":"1",
    "accountId":"c0730000-0000-4000-8000-000000000001",
    "record":{"kind":"order","id":"c0730000-0000-4000-8000-000000000055"},
    "status":"unavailable","stage":"delivered","places":[],"courier":null,"reason":"completed"
  }'::jsonb, 'A delivered order loses its fixed locations even when source points exist.');
select is(
  (select count(*)::int
     from (values ('56'), ('57'), ('58')) as fixture(suffix)
     cross join lateral public.rpc_my_order_map(('c0730000-0000-4000-8000-0000000000' || fixture.suffix)::uuid) as map(result)
    where result->>'status' = 'unavailable' and result->>'reason' = 'completed' and result->'places' = '[]'::jsonb),
  3, 'Cancelled, refunded, and disputed orders also return no locations.');

reset role;
select * from finish();
rollback;
