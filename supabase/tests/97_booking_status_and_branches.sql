-- Phase 1 of the shared booking format (20270101000100): every booking has
-- one of five statuses beside its stage, the reads answer it, and every open
-- branch of a listed merchant is public, without its private fields.

begin;
create extension if not exists pgtap with schema extensions;
-- Fixtures below set order stages directly; the stage guard (20270221000100) allows that only when asked.
select set_config('nexg.order_stage_any', 'on', true);
select plan(15);

-- A live merchant that may operate, with venue bookings priced in its city.
create temp table t_m on commit drop as
  select m.id, m.city_id from public.merchant m
  where m.status = 'live' and m.explore_visible and m.deleted_at is null
    and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;

insert into settings.definition (key, "group", scope_kind, value_type, unit, label)
values ('fees.service.venue_booking', 'fees', 'city', 'money', 'KES', 'Venue booking, flat')
on conflict (key) do nothing;
insert into settings.version (key, scope_kind, scope_city_id, value, status, effective_from, reason)
select 'fees.service.venue_booking', 'city', city_id, to_jsonb(15000), 'active',
       now() - interval '1 minute', 'booking status'
from t_m;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select id, encode(sha256(convert_to('status-live-key-000000000000000000', 'UTF8')), 'hex'),
       'statusl1', '{public_read,merchant_read,merchant_write}', 600
from t_m;
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
select id, encode(sha256(convert_to('nexg_test_status-key-000000000000000', 'UTF8')), 'hex'),
       'nexg_test_sta1', '{public_read,merchant_read,merchant_write}', 600, 'test'
from t_m;

-- ═══════════════════════════════════════════════════════════════ status

select is(
  (select count(*) from unnest(enum_range(null::public.order_stage)) s
   where public.fn_api_booking_status(s::text) is null),
  0::bigint,
  'every order stage has a shared status');

select set_eq(
  $$select distinct public.fn_api_booking_status(s::text)
    from unnest(enum_range(null::public.order_stage)) s$$,
  array['requested', 'confirmed', 'in_progress', 'completed', 'cancelled'],
  'the shared statuses are exactly the five');

select is(
  (select string_agg(s || '=' || public.fn_api_booking_status(s), ' ' order by s)
   from unnest(array['placed', 'preparing', 'arriving', 'delivered', 'refunded', 'cancelled']) s),
  'arriving=in_progress cancelled=cancelled delivered=completed placed=requested preparing=confirmed refunded=completed',
  'stages map to the status a partner expects');

-- Live API bookings need NexG's approval (20270302000200).
insert into public.api_booking_access (merchant_id, enabled, monthly_limit_cents)
select id, true, 100000000 from t_m
on conflict (merchant_id) do nothing;

insert into t values ('live', public.rpc_order_place_api(
  'status-live-key-000000000000000000', 'status-idem-000000000000001',
  '{"service":"venue_booking","quantity":2}'::jsonb));

select is(
  (select item ->> 'status' || '|' || (item ->> 'stage')
   from (select public.rpc_order_read_api('status-live-key-000000000000000000',
           (select (v ->> 'order_id')::uuid from t where k = 'live'), 1, null, null)
           -> 'items' -> 0 as item) x),
  'requested|placed',
  'a new booking reads back as requested, with its stage beside it');

update public.order set stage = 'picked_up'
where id = (select (v ->> 'order_id')::uuid from t where k = 'live');

select is(
  public.rpc_order_read_api('status-live-key-000000000000000000',
    (select (v ->> 'order_id')::uuid from t where k = 'live'), 1, null, null)
    -> 'items' -> 0 ->> 'status',
  'in_progress',
  'a booking under way reads as in_progress');

select is(
  public.fn_api_order_object((select (v ->> 'order_id')::uuid from t where k = 'live')),
  public.rpc_order_read_api('status-live-key-000000000000000000',
    (select (v ->> 'order_id')::uuid from t where k = 'live'), 1, null, null) -> 'items' -> 0,
  'an event carries the same booking object a read returns');

select ok(
  (select bool_and(item ? 'status')
   from jsonb_array_elements(public.rpc_order_read_api(
     'status-live-key-000000000000000000', null, 25, null, null) -> 'items') item),
  'every order in a list has a status');

insert into t values ('test', public.rpc_order_place_api_test(
  'nexg_test_status-key-000000000000000', 'status-idem-000000000000002',
  '{"service":"venue_booking","quantity":1}'::jsonb));

select is(
  public.rpc_order_read_api_test('nexg_test_status-key-000000000000000',
    (select (v ->> 'order_id')::uuid from t where k = 'test'), 1, null, null)
    -> 'items' -> 0 ->> 'status',
  'requested',
  'a sandbox booking reads back as requested too');

select is(
  public.fn_api_test_order_object((select (v ->> 'order_id')::uuid from t where k = 'test')),
  public.rpc_order_read_api_test('nexg_test_status-key-000000000000000',
    (select (v ->> 'order_id')::uuid from t where k = 'test'), 1, null, null) -> 'items' -> 0,
  'a sandbox event carries the same booking object a sandbox read returns');

-- ═══════════════════════════════════════════════════════════════ branches

insert into public.merchant_branch (merchant_id, name, address_text, latitude, longitude,
                                    is_primary, rider_phone, pickup_instructions)
select id, 'Status Test Westlands', 'Woodvale Grove, Westlands', -1.2648, 36.8027, false,
       '+254700000999', 'Ring the bell twice'
from t_m;
insert into public.merchant_branch (merchant_id, name, address_text, is_primary, deleted_at)
select id, 'Status Test Deleted', 'Gone Road', false, now() from t_m;
insert into public.merchant_branch (merchant_id, name, address_text, is_primary, closed_at)
select id, 'Status Test Closed', 'Shut Street', false, now() from t_m;

select is(
  (select count(*) from public.merchant_branch_public bp
   where bp.merchant_id = (select id from t_m) and bp.name like 'Status Test %'),
  1::bigint,
  'a listed merchant''s open branch is public; deleted and closed ones are not');

select is(
  (select count(*) from public.merchant_branch_public bp
   where bp.merchant_id = (select id from t_m)),
  (select count(*) from public.merchant_branch b
   where b.merchant_id = (select id from t_m) and b.deleted_at is null and b.closed_at is null),
  'every open branch of the merchant is listed, not only the primary one');

select set_eq(
  $$select column_name::text from information_schema.columns
    where table_schema = 'public' and table_name = 'merchant_branch_public'$$,
  array['id', 'merchant_id', 'name', 'address', 'latitude', 'longitude', 'is_primary',
        'place_type', 'contact', 'paused', 'opens_today', 'closes_today', 'closed_today', 'sort'],
  'the public view has no rider phone, pickup instructions or pause reason');

set local role anon;
select is(
  (select count(*) from public.merchant_branch_public where name = 'Status Test Westlands'),
  1::bigint,
  'anyone may read the public branches');
reset role;

select is(
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'merchant_branch'
     and (roles && array['anon', 'public']::name[])),
  0::bigint,
  'the branch table itself has no policy that shows the public its rows');

update public.merchant set explore_visible = false where id = (select id from t_m);
select is(
  (select count(*) from public.merchant_branch_public where merchant_id = (select id from t_m)),
  0::bigint,
  'a merchant that is not listed shows no branches');

select * from finish();
rollback;
