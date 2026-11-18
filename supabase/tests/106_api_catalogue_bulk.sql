-- Bulk catalogue updates through the API (20270106050100): a live key with
-- catalogue_write changes up to 100 of its merchant's items in one call, each
-- saved and audited as a one-item change would be; a test key saves nothing;
-- unknown ids and another merchant's items come back together and nothing is
-- saved; a bad change anywhere in the list saves nothing; the list is 1 to
-- 100 items, each once, each with an id; nothing is open to the public.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create temp table t_m on commit drop as
  select m.id from public.merchant m
  where m.status = 'live' and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t_other on commit drop as
  select m.id from public.merchant m
  where m.id <> (select id from t_m) and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;

insert into public.catalogue_section (id, merchant_id, name, sort)
values
  ('cb000000-0000-4000-8000-000000000001', (select id from t_m), 'API bulk section', 9100),
  ('cb000000-0000-4000-8000-000000000002', (select id from t_other), 'API bulk section', 9100);
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
values
  ('cc000000-0000-4000-8000-000000000001', 'cb000000-0000-4000-8000-000000000001',
   (select id from t_m), 'Bulk test pilau', 500, true),
  ('cc000000-0000-4000-8000-000000000002', 'cb000000-0000-4000-8000-000000000001',
   (select id from t_m), 'Bulk test chapati', 120, false),
  ('cc000000-0000-4000-8000-000000000003', 'cb000000-0000-4000-8000-000000000001',
   (select id from t_m), 'Bulk test tea', 60, true),
  ('cc000000-0000-4000-8000-000000000009', 'cb000000-0000-4000-8000-000000000002',
   (select id from t_other), 'Bulk test samosa', 80, true);

/* A hundred more, for the largest call allowed. */
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
select ('cd000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'cb000000-0000-4000-8000-000000000001', (select id from t_m),
       'Bulk test item ' || n, 100 + n, true
  from generate_series(1, 100) n;

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
values
  ((select id from t_m), encode(sha256(convert_to('bulk-live-key-000000000000000000000000', 'UTF8')), 'hex'),
   'bulkliv1', '{public_read,catalogue_write}', 600, 'live'),
  ((select id from t_m), encode(sha256(convert_to('nexg_test_bulk-key-0000000000000000000', 'UTF8')), 'hex'),
   'nexg_test_blk1', '{public_read,catalogue_write}', 600, 'test'),
  ((select id from t_m), encode(sha256(convert_to('bulk-reader-key-0000000000000000000000', 'UTF8')), 'hex'),
   'bulkrea1', '{public_read,merchant_read}', 600, 'live');

-- ═══════════════════════════════════════════════════════════════ a live key

insert into t values ('live', public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000',
  '[{"id": "cc000000-0000-4000-8000-000000000002", "available": true, "price_kes": 150},
    {"id": "cc000000-0000-4000-8000-000000000001", "price_kes": 550},
    {"id": "cc000000-0000-4000-8000-000000000003", "available": true}]'::jsonb));

select is(
  (select concat_ws('|', v ->> 'ok', v ->> 'applied', jsonb_array_length(v -> 'items')) from t where k = 'live'),
  'true|true|3',
  'a live key changes three items in one call');

select is(
  (select string_agg(concat_ws(':', x ->> 'id', x ->> 'price_kes', x ->> 'available'), ',' order by o)
     from t, jsonb_array_elements(v -> 'items') with ordinality as e(x, o) where k = 'live'),
  'cc000000-0000-4000-8000-000000000002:150:true,cc000000-0000-4000-8000-000000000001:550:true,cc000000-0000-4000-8000-000000000003:60:true',
  'and answers with each item as it now is, in the order sent');

select is(
  (select string_agg(concat_ws(':', price_kes, available::text), ',' order by id)
     from public.catalogue_item where id::text like 'cc000000-%' and merchant_id = (select id from t_m)),
  '550:true,150:true,60:true',
  'the changes are saved');

select is(
  (select string_agg(concat_ws(':', right(l.target_id::text, 1), l.before ->> 'price_kes',
            l.after ->> 'price_kes', l.after ->> 'key_prefix'), ',' order by l.target_id)
     from audit.audit_event l
    where l.action = 'api.catalogue_item_updated' and l.target_id::text like 'cc000000-%'),
  '1:500:550:bulkliv1,2:120:150:bulkliv1',
  'each change is audited with the key, and the item that did not change is not');

select is(
  (select array_agg(k order by k) from jsonb_object_keys(
     (select v -> 'items' -> 0 from t where k = 'live')) k),
  array['age_restricted', 'available', 'description', 'highlighted', 'id', 'merchant_id',
        'name', 'price_kes', 'section_id', 'sort'],
  'each item has the public catalogue''s fields, as the one-item change answers');

select is(
  public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000',
    (select jsonb_agg(jsonb_build_object('id', 'cd000000-0000-4000-8000-' || lpad(n::text, 12, '0'),
                                         'price_kes', 777))
       from generate_series(1, 100) n)) ->> 'ok',
  'true',
  'a hundred items go in one call');

select is(
  (select count(*)::integer from public.catalogue_item
    where id::text like 'cd000000-%' and price_kes = 777),
  100,
  'and all hundred are saved');

-- ═══════════════════════════════════════════════════════════════ a test key changes nothing

insert into t values ('test', public.rpc_catalogue_items_update_api('nexg_test_bulk-key-0000000000000000000',
  '[{"id": "cc000000-0000-4000-8000-000000000001", "price_kes": 999, "available": false},
    {"id": "cc000000-0000-4000-8000-000000000003", "price_kes": 75}]'::jsonb));

select is(
  (select concat_ws('|', v ->> 'applied', v #>> '{items,0,price_kes}', v #>> '{items,0,available}',
          v #>> '{items,1,price_kes}') from t where k = 'test'),
  'false|999|false|75',
  'a test key answers with the items as the changes would leave them, applied false');

select is(
  (select string_agg(price_kes::text, ',' order by id)
     from public.catalogue_item
    where id in ('cc000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000003')),
  '550,60',
  'and saves nothing');

-- ═══════════════════════════════════════════════════════════════ all or nothing

select is(
  public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000',
    '[{"id": "cc000000-0000-4000-8000-000000000001", "price_kes": 600},
      {"id": "cc000000-0000-4000-8000-000000000009", "price_kes": 90},
      {"id": "cc000000-0000-4000-8000-0000000000ff", "available": false}]'::jsonb),
  jsonb_build_object('ok', false, 'missing', jsonb_build_array(
    jsonb_build_object('index', 1, 'id', 'cc000000-0000-4000-8000-000000000009'),
    jsonb_build_object('index', 2, 'id', 'cc000000-0000-4000-8000-0000000000ff'))),
  'another merchant''s item and an unknown id come back together, with their places');

select is(
  (select price_kes from public.catalogue_item where id = 'cc000000-0000-4000-8000-000000000001'),
  550,
  'and nothing in that call is saved');

select throws_ok(
  $$select public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000',
    '[{"id": "cc000000-0000-4000-8000-000000000001", "price_kes": 610},
      {"id": "cc000000-0000-4000-8000-000000000003", "price_kes": 0}]'::jsonb)$$,
  '22023', null,
  'a bad price anywhere in the list refuses the call');

select is(
  (select price_kes from public.catalogue_item where id = 'cc000000-0000-4000-8000-000000000001'),
  550,
  'and the good change before it is not saved either');

select throws_ok(
  $$select public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000',
    '[{"id": "cc000000-0000-4000-8000-000000000001", "name": "Renamed"}]'::jsonb)$$,
  '22023', null,
  'only price_kes and available change here');

-- ═══════════════════════════════════════════════════════════════ the shape of the list

select throws_ok(
  $$select public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000', '[]'::jsonb)$$,
  '22023', 'Send from 1 to 100 items in one call.',
  'an empty list is refused');

select throws_ok(
  $$select public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000',
    (select jsonb_agg(jsonb_build_object('id', gen_random_uuid(), 'price_kes', 1))
       from generate_series(1, 101)))$$,
  '22023', 'Send from 1 to 100 items in one call.',
  'so is a list of more than 100');

select throws_ok(
  $$select public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000',
    '[{"id": "cc000000-0000-4000-8000-000000000001", "price_kes": 610},
      {"id": "CC000000-0000-4000-8000-000000000001", "available": false}]'::jsonb)$$,
  '22023', 'Each item can appear only once in a call.',
  'an item listed twice is refused, whatever the case of its id');

select throws_ok(
  $$select public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000',
    '[{"price_kes": 610}]'::jsonb)$$,
  '22023', 'Each item needs the id of the item it changes.',
  'an item without an id is refused');

select throws_ok(
  $$select public.rpc_catalogue_items_update_api('bulk-live-key-000000000000000000000000',
    '{"id": "cc000000-0000-4000-8000-000000000001", "price_kes": 610}'::jsonb)$$,
  '22023', null,
  'a single change that is not in a list is refused');

-- ═══════════════════════════════════════════════════════════════ keys and access

select throws_ok(
  $$select public.rpc_catalogue_items_update_api('bulk-reader-key-0000000000000000000000',
    '[{"id": "cc000000-0000-4000-8000-000000000001", "price_kes": 610}]'::jsonb)$$,
  '42501', 'This key cannot update the catalogue: it needs catalogue_write.',
  'a key without catalogue_write is refused');

select throws_ok(
  $$select public.rpc_catalogue_items_update_api('no-such-key',
    '[{"id": "cc000000-0000-4000-8000-000000000001", "price_kes": 610}]'::jsonb)$$,
  '42501', 'That API key is not valid.',
  'an unknown key is refused');

select ok(
  not has_function_privilege('anon', 'public.rpc_catalogue_items_update_api(text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.rpc_catalogue_items_update_api(text, jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.rpc_catalogue_items_update_api(text, jsonb)', 'execute'),
  'only the server may call it');

select is_empty(
  $$ select 1 from public.fn_wiring_check() where finding like '%rpc_catalogue_items_update_api%' $$,
  'the wiring check has nothing to say about it');

select is(
  (select count(*)::integer from audit.audit_event l
    where l.action = 'api.catalogue_item_updated' and l.target_id::text like 'cd000000-%'),
  100,
  'the hundred-item call wrote one audit entry per item');

select * from finish();
rollback;
