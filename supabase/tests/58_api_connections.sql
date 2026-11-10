-- Settings → API: who may change connections, credentials that never come back
-- out, live connections that must be public https, and tests recorded honestly.

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0580000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'fin@api.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0580000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'ops@api.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0580000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'guest@api.test', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c0580000-0000-4000-8000-000000000011', 'c0580000-0000-4000-8000-000000000001', 'fin@api.test', 'Finance Api'),
  ('c0580000-0000-4000-8000-000000000012', 'c0580000-0000-4000-8000-000000000002', 'ops@api.test', 'Ops Api');

insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
select 'c0580000-0000-4000-8000-000000000011', r.id,
       (select id from public.staff_user where id not in ('c0580000-0000-4000-8000-000000000011', 'c0580000-0000-4000-8000-000000000012') limit 1),
       'c0580000-0000-4000-8000-000000000012'
from public.role r where r.key = 'finance';
insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
select 'c0580000-0000-4000-8000-000000000012', r.id,
       (select id from public.staff_user where id not in ('c0580000-0000-4000-8000-000000000011', 'c0580000-0000-4000-8000-000000000012') limit 1),
       'c0580000-0000-4000-8000-000000000011'
from public.role r where r.key = 'ops_manager';

create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- ───────────────────────────────────────── finance may add and change
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0580000-0000-4000-8000-000000000001","role":"authenticated"}', true);

insert into t select 'id', public.rpc_api_connection_save(jsonb_build_object(
  'name', 'Acme POS', 'kind', 'merchant_system', 'environment', 'sandbox',
  'base_url', 'http://host.docker.internal:4010/', 'auth_type', 'api_key_header',
  'auth_header', 'X-Api-Key', 'test_path', '/health'))->>'id';

select is((select base_url from public.api_connection_v where id = (select v from t where k = 'id')::uuid),
  'http://host.docker.internal:4010', 'a sandbox connection may use a local http address, trailing slash removed');

select throws_ok(
  $$select public.rpc_api_connection_save('{"name":"Bank X","kind":"bank","environment":"live","base_url":"http://bank.example.com"}')$$,
  '22023', null, 'a live connection must use https');
select throws_ok(
  $$select public.rpc_api_connection_save('{"name":"Bank X","kind":"bank","environment":"live","base_url":"https://10.0.0.5"}')$$,
  '22023', null, 'a live connection cannot point at a private network');
select throws_ok(
  $$select public.rpc_api_connection_save('{"name":"Bank X","kind":"bank","environment":"live","base_url":"https://localhost:8443"}')$$,
  '22023', null, 'or at this machine');
select lives_ok(
  $$select public.rpc_api_connection_save('{"name":"Equity Live","kind":"bank","environment":"live","base_url":"https://api.bank.example.com","auth_type":"bearer"}')$$,
  'a live connection on public https is accepted');
select throws_ok(
  $$select public.rpc_api_connection_save('{"name":"Header missing","kind":"other","environment":"sandbox","base_url":"https://x.example.com","auth_type":"api_key_header"}')$$,
  '22023', null, 'an API-key-header connection must name its header');

select is(
  public.rpc_api_connection_set_secret((select v from t where k = 'id')::uuid, 'credential', 'sandbox-key-0123456789') ->> 'ok',
  'true', 'finance can set a credential');
select is((select has_credential from public.api_connection_v where id = (select v from t where k = 'id')::uuid),
  true, 'the console sees only that a credential is set');
select throws_ok(
  $$select secret_ref from public.api_connection$$,
  '42501', null, 'nobody in the console can read the table that holds the Vault names');

-- ───────────────────────────────────────── ops may look and test, not change
select set_config('request.jwt.claims', '{"sub":"c0580000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select ok((select count(*) from public.api_connection_v) >= 4, 'ops sees the connections');
select throws_ok(
  format($$select public.rpc_api_connection_set_secret(%L, 'credential', 'stolen-0123456789')$$, (select v from t where k = 'id')),
  '42501', null, 'ops cannot set credentials');
select throws_ok(
  $$select public.rpc_api_connection_save('{"name":"Sneaky","kind":"other","environment":"sandbox"}')$$,
  '42501', null, 'ops cannot add connections');

insert into t select 'test', public.rpc_api_connection_test((select v from t where k = 'id')::uuid)::text;
select ok((select v from t where k = 'test') is not null, 'ops can start a connection test');
select throws_ok(
  format($$select public.rpc_api_connection_test(%L)$$, (select v from t where k = 'id')),
  '22023', null, 'tests are spaced a few seconds apart');
select is(public.rpc_api_connection_test_result((select v from t where k = 'test')::uuid) ->> 'done',
  'false', 'a test with no answer yet says so');

-- ───────────────────────────────────────── someone outside settings
select set_config('request.jwt.claims', '{"sub":"c0580000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.api_connection_v), 0, 'a non-staff user sees no connections');
select throws_ok(
  format($$select public.rpc_api_connection_test(%L)$$, (select v from t where k = 'id')),
  '42501', null, 'and cannot run tests');
reset role;

-- ───────────────────────────────────────── what the test sent, and its outcome
select is(
  (select headers->>'X-Api-Key' from net.http_request_queue
    where id = (select request_id from public.api_connection_test where id = (select v from t where k = 'test')::uuid)),
  'sandbox-key-0123456789', 'the credential was sent from inside the database, in the named header');

insert into net._http_response (id, status_code, content_type, headers, content, timed_out, error_msg, created)
select request_id, 200, 'application/json', '{}'::jsonb, '{"ok":true}', false, null, started_at + interval '120 milliseconds'
from public.api_connection_test where id = (select v from t where k = 'test')::uuid;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c0580000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.rpc_api_connection_test_result((select v from t where k = 'test')::uuid) ->> 'ok',
  'true', 'a 200 answer passes the test');
select is((select status || ':' || last_test_ms from public.api_connection_v where id = (select v from t where k = 'id')::uuid),
  'connected:120', 'the connection shows as connected, with the response time');
reset role;

select * from finish();
rollback;
