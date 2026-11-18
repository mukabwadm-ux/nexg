-- Catalogue updates through the API (20270105020100, 20270105020200): a live
-- key with catalogue_write changes its merchant's item prices and
-- availability, saved and audited; a test key changes nothing and answers
-- with the result; only price_kes and available, in range; another
-- merchant's item answers like a missing one; keys without catalogue_write
-- are refused; the list shows sold-out items too; owners can issue the scope
-- for a merchant only; a catalogue update costs one token; nothing is open to
-- the public.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

create temp table t_m on commit drop as
  select m.id from public.merchant m
  where m.status = 'live' and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t_other on commit drop as
  select m.id from public.merchant m
  where m.id <> (select id from t_m) and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t (k text primary key, v jsonb) on commit drop;
grant select on t_m, t_other to authenticated;
grant select, insert on t to authenticated;

insert into public.catalogue_section (id, merchant_id, name, sort)
values
  ('cd000000-0000-4000-8000-000000000001', (select id from t_m), 'API test section', 9000),
  ('cd000000-0000-4000-8000-000000000002', (select id from t_other), 'API test section', 9000);
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
values
  ('ce000000-0000-4000-8000-000000000001', 'cd000000-0000-4000-8000-000000000001',
   (select id from t_m), 'API test pilau', 500, true),
  ('ce000000-0000-4000-8000-000000000002', 'cd000000-0000-4000-8000-000000000001',
   (select id from t_m), 'API test chapati', 120, false),
  ('ce000000-0000-4000-8000-000000000003', 'cd000000-0000-4000-8000-000000000002',
   (select id from t_other), 'API test samosa', 80, true);

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit, environment)
values
  ((select id from t_m), encode(sha256(convert_to('catalogue-live-key-0000000000000000000', 'UTF8')), 'hex'),
   'catliv01', '{public_read,catalogue_write}', 600, 'live'),
  ((select id from t_m), encode(sha256(convert_to('nexg_test_catalogue-key-00000000000000', 'UTF8')), 'hex'),
   'nexg_test_cat1', '{public_read,catalogue_write}', 600, 'test'),
  ((select id from t_m), encode(sha256(convert_to('catalogue-reader-key-00000000000000000', 'UTF8')), 'hex'),
   'catrea01', '{public_read,merchant_read}', 600, 'live'),
  ((select id from t_m), encode(sha256(convert_to('catalogue-public-key-00000000000000000', 'UTF8')), 'hex'),
   'catpub01', '{public_read}', 600, 'live'),
  ((select id from t_m), encode(sha256(convert_to('nexg_test_catalogue-booker-0000000000', 'UTF8')), 'hex'),
   'nexg_test_cat2', '{public_read,merchant_write}', 600, 'test'),
  ((select id from t_other), encode(sha256(convert_to('catalogue-other-key-00000000000000000', 'UTF8')), 'hex'),
   'catoth01', '{public_read,catalogue_write}', 600, 'live');

-- ═══════════════════════════════════════════════════════════════ the scope and the list

select ok(
  'catalogue_write' = any (enum_range(null::public.api_credential_scope)::text[]),
  'catalogue_write is a scope of its own');

select is(
  jsonb_array_length(public.rpc_catalogue_items_api('catalogue-live-key-0000000000000000000') -> 'items'),
  (select count(*)::integer from public.catalogue_item where merchant_id = (select id from t_m)),
  'a catalogue_write key lists every item of its merchant');

select is(
  (select x ->> 'available' from jsonb_array_elements(
     public.rpc_catalogue_items_api('catalogue-live-key-0000000000000000000') -> 'items') x
   where x ->> 'id' = 'ce000000-0000-4000-8000-000000000002'),
  'false',
  'sold-out items are listed too, which the public catalogue leaves out');

select is(
  (select array_agg(k order by k) from jsonb_object_keys(
     public.rpc_catalogue_items_api('catalogue-live-key-0000000000000000000') -> 'items' -> 0) k),
  array['age_restricted', 'available', 'description', 'highlighted', 'id', 'merchant_id',
        'name', 'price_kes', 'section_id', 'sort'],
  'each item has the public catalogue''s fields, no more');

select lives_ok(
  $$select public.rpc_catalogue_items_api('catalogue-reader-key-00000000000000000')$$,
  'a merchant_read key lists them too');

select throws_ok(
  $$select public.rpc_catalogue_items_api('catalogue-public-key-00000000000000000')$$,
  '42501', 'This key cannot read the merchant''s catalogue: it needs merchant_read or catalogue_write.',
  'a public_read key cannot');

-- ═══════════════════════════════════════════════════════════════ a live key changes the item

insert into t values ('price', public.rpc_catalogue_item_update_api(
  'catalogue-live-key-0000000000000000000', 'ce000000-0000-4000-8000-000000000001',
  '{"price_kes": 550}'::jsonb));

select is(
  (select concat_ws('|', v ->> 'applied', v #>> '{item,price_kes}', v #>> '{item,available}') from t where k = 'price'),
  'true|550|true',
  'a live catalogue_write key changes the price');

select is(
  (select price_kes from public.catalogue_item where id = 'ce000000-0000-4000-8000-000000000001'),
  550,
  'and it is saved');

select is(
  (select concat_ws('|', l.actor_type::text, l.module, l.before ->> 'price_kes', l.after ->> 'price_kes',
     l.after ->> 'key_prefix')
   from audit.audit_event l
   where l.action = 'api.catalogue_item_updated' and l.target_id = 'ce000000-0000-4000-8000-000000000001'),
  'system|settings|500|550|catliv01',
  'the change is audited with the key that made it');

select is(
  public.rpc_catalogue_item_update_api('catalogue-live-key-0000000000000000000',
    'ce000000-0000-4000-8000-000000000002', '{"available": true, "price_kes": 150}'::jsonb)
    -> 'item' ->> 'available',
  'true',
  'a sold-out item is put back on sale, with a new price, in one call');

select is(
  public.rpc_catalogue_item_update_api('catalogue-live-key-0000000000000000000',
    'ce000000-0000-4000-8000-000000000001', '{"price_kes": 550}'::jsonb) ->> 'applied',
  'true',
  'repeating a change answers the same');

select is(
  (select count(*) from audit.audit_event l
   where l.action = 'api.catalogue_item_updated' and l.target_id = 'ce000000-0000-4000-8000-000000000001'),
  1::bigint,
  'and logs nothing more, because nothing changed');

-- ═══════════════════════════════════════════════════════════════ a test key changes nothing

insert into t values ('test', public.rpc_catalogue_item_update_api(
  'nexg_test_catalogue-key-00000000000000', 'ce000000-0000-4000-8000-000000000001',
  '{"price_kes": 999, "available": false}'::jsonb));

select is(
  (select concat_ws('|', v ->> 'applied', v #>> '{item,price_kes}', v #>> '{item,available}') from t where k = 'test'),
  'false|999|false',
  'a test key answers with the item as the change would leave it');

select is(
  (select price_kes::text || '|' || available::text
   from public.catalogue_item where id = 'ce000000-0000-4000-8000-000000000001'),
  '550|true',
  'but saves nothing');

-- ═══════════════════════════════════════════════════════════════ what may change

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('catalogue-live-key-0000000000000000000',
      'ce000000-0000-4000-8000-000000000001', '{"name": "Pilau", "price_kes": 600}'::jsonb)$$,
  '22023', 'Only price_kes and available can be changed here, not name.',
  'other fields are refused, and nothing is changed');

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('catalogue-live-key-0000000000000000000',
      'ce000000-0000-4000-8000-000000000001', '{}'::jsonb)$$,
  '22023', 'Send price_kes, available, or both.',
  'an empty change is refused');

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('catalogue-live-key-0000000000000000000',
      'ce000000-0000-4000-8000-000000000001', '{"price_kes": 0}'::jsonb)$$,
  '22023', 'price_kes is whole shillings, from 1 to 1,000,000.',
  'a price of nothing is refused');

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('catalogue-live-key-0000000000000000000',
      'ce000000-0000-4000-8000-000000000001', '{"price_kes": 12.5}'::jsonb)$$,
  '22023', 'price_kes is whole shillings, from 1 to 1,000,000.',
  'so is a part of a shilling');

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('catalogue-live-key-0000000000000000000',
      'ce000000-0000-4000-8000-000000000001', '{"price_kes": "550"}'::jsonb)$$,
  '22023', 'price_kes is whole shillings, from 1 to 1,000,000.',
  'and a price sent as text');

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('catalogue-live-key-0000000000000000000',
      'ce000000-0000-4000-8000-000000000001', '{"available": "yes"}'::jsonb)$$,
  '22023', 'available is true or false.',
  'available must be true or false');

-- ═══════════════════════════════════════════════════════════════ whose item, which key

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('catalogue-live-key-0000000000000000000',
      'ce000000-0000-4000-8000-000000000003', '{"price_kes": 90}'::jsonb)$$,
  'P0002', 'No such item.',
  'another merchant''s item answers like one that does not exist');

select is(
  (select price_kes from public.catalogue_item where id = 'ce000000-0000-4000-8000-000000000003'),
  80,
  'and stays as it was');

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('catalogue-reader-key-00000000000000000',
      'ce000000-0000-4000-8000-000000000001', '{"price_kes": 600}'::jsonb)$$,
  '42501', 'This key cannot update the catalogue: it needs catalogue_write.',
  'a merchant_read key cannot change the catalogue');

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('nexg_test_catalogue-booker-0000000000',
      'ce000000-0000-4000-8000-000000000001', '{"price_kes": 600}'::jsonb)$$,
  '42501', 'This key cannot update the catalogue: it needs catalogue_write.',
  'nor can a key that books (merchant_write)');

select throws_ok(
  $$select public.rpc_catalogue_item_update_api('not-a-key-at-all',
      'ce000000-0000-4000-8000-000000000001', '{"price_kes": 600}'::jsonb)$$,
  '42501', 'That API key is not valid.',
  'an unknown key is refused');

-- ═══════════════════════════════════════════════════════════════ spending and issuing

select ok(
  (select s.allowed and s.remaining = (
     select greatest(5, least(min(k.rate_limit), 600)) - 1 from public.api_key k
     where k.merchant_id = (select id from t_m) and k.environment = 'live' and k.state = 'active'
       and (k.expires_at is null or k.expires_at > now()))
   from public.fn_api_request_spend('catalogue-live-key-0000000000000000000', null, 'catalogue_write') s),
  'a catalogue update spends one token from a full bucket');

select throws_ok(
  $$select * from public.fn_api_request_spend('catalogue-reader-key-00000000000000000', null, 'catalogue_write')$$,
  '42501', 'Credential scope denied.',
  'and only a key with catalogue_write may spend on one');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', 'cf100000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'catalogue.owner@test.local', '', now(), now(), now(),
  '', '', '', '', '', '', '', '');
insert into public.merchant_user (merchant_id, user_id, role)
values ((select id from t_m), 'cf100000-0000-4000-8000-000000000001', 'owner');
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('cf200000-0000-4000-8000-000000000001', 'cf100000-0000-4000-8000-000000000001', now(), now());
insert into public.merchant_application_session_activity (session_id, user_id, last_activity_at)
values ('cf200000-0000-4000-8000-000000000001', 'cf100000-0000-4000-8000-000000000001', now());

select set_config('request.jwt.claims',
  '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated",'
  || '"session_id":"cf200000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;

select throws_ok(
  $$select * from public.fn_api_key_issue(null, '{public_read,catalogue_write}', 60, null, null,
      'cf100000-0000-4000-8000-000000000001', 'live')$$,
  '22023', 'Merchant scopes require a merchant.',
  'a catalogue_write key must be bound to a merchant');

insert into t values ('issued', (select to_jsonb(x) from public.fn_api_key_issue(
  (select id from t_m), '{public_read,catalogue_write}', 60, null, null,
  'cf100000-0000-4000-8000-000000000001', 'live') x));

reset role;

select is(
  (select array_to_string(k.scopes, ',') || '|' || k.environment
   from public.api_key k where k.id = (select (v ->> 'key_id')::uuid from t where k = 'issued')),
  'public_read,catalogue_write|live',
  'the owner issues a live key that updates the catalogue');

-- ═══════════════════════════════════════════════════════════════ who may call what

select ok(
  not has_function_privilege('anon', 'public.rpc_catalogue_items_api(text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_catalogue_item_update_api(text, uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.rpc_catalogue_items_api(text)', 'execute')
  and not has_function_privilege('authenticated', 'public.rpc_catalogue_item_update_api(text, uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.fn_api_catalogue_item(jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.rpc_catalogue_item_update_api(text, uuid, jsonb)', 'execute'),
  'the API''s functions are the server''s alone');

select is(
  (select count(*) from public.fn_wiring_check() w
   where w.finding ~ '(catalogue_item|catalogue_items|fn_api_key_issue|fn_api_request_spend)'),
  0::bigint,
  'the wiring check finds nothing in the new or changed functions');

select * from finish();
rollback;
