-- Paystack keys pasted in the console (20270330000200): only a super admin whose
-- grant names no city saves, sees or removes them; a key is never returned,
-- audited or named in an error; NexG's servers fetch them with a time-limited
-- proof of the one-time Vault token, which no function can set. All keys and
-- tokens here are made up.

begin;
create extension if not exists pgtap with schema extensions;
select plan(53);

delete from vault.secrets where name in
  ('paystack_test_secret_key', 'paystack_live_secret_key', 'paystack_keys_server_token');

create temp table t (k text primary key, v jsonb) on commit drop;
grant select, insert on t to authenticated, anon;

create function pg_temp.as_user(p_uid text) returns void
language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated', 'is_anonymous', false)::text, true)
$$;
/* Whether the error a statement raises repeats p_part anywhere a caller reads it. */
create function pg_temp.says(p_sql text, p_part text) returns text language plpgsql as $$
declare v_message text; v_detail text; v_hint text;
begin
  execute p_sql;
  return 'no error';
exception when others then
  get stacked diagnostics v_message = message_text, v_detail = pg_exception_detail,
                          v_hint = pg_exception_hint;
  return case when position(p_part in coalesce(v_message, '') || coalesce(v_detail, '')
                                      || coalesce(v_hint, '')) > 0 then 'repeats it' else 'quiet' end;
end
$$;
create function pg_temp.minute(p_offset integer) returns bigint language sql as $$
  select floor(extract(epoch from now()) / 60)::bigint + p_offset
$$;
create function pg_temp.proof(p_minute bigint,
                              p_token text default 'ci-only-server-token-0123456789abcdef') returns text
language sql as $$
  select encode(extensions.hmac(convert_to('paystack-keys:' || p_minute::text, 'UTF8'),
                                convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
$$;
create function pg_temp.fetch(p_offset integer) returns jsonb language sql as $$
  select public.rpc_paystack_server_keys(pg_temp.minute(p_offset), pg_temp.proof(pg_temp.minute(p_offset)))
$$;

set local session_replication_role = replica;
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
       now(), false, now(), now()
  from (values
    ('e2460000-0000-4000-8000-000000000001', 'super246@test.local'),
    ('e2460000-0000-4000-8000-000000000002', 'citysuper246@test.local'),
    ('e2460000-0000-4000-8000-000000000003', 'finance246@test.local'),
    ('e2460000-0000-4000-8000-000000000004', 'oldsuper246@test.local'),
    ('e2460000-0000-4000-8000-000000000005', 'guest246@example.test')) as u (id, email);
insert into public.staff_user (id, user_id, email, display_name) values
  ('e2460000-0000-4000-8000-0000000000b1', 'e2460000-0000-4000-8000-000000000001', 'super246@test.local', 'Super 246'),
  ('e2460000-0000-4000-8000-0000000000b2', 'e2460000-0000-4000-8000-000000000002', 'citysuper246@test.local', 'City super 246'),
  ('e2460000-0000-4000-8000-0000000000b3', 'e2460000-0000-4000-8000-000000000003', 'finance246@test.local', 'Finance 246'),
  ('e2460000-0000-4000-8000-0000000000b4', 'e2460000-0000-4000-8000-000000000004', 'oldsuper246@test.local', 'Old super 246');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, revoked_at)
select g.staff::uuid, r.id,
       case when g.city is not null then (select id from public.city where slug = g.city) end,
       g.staff::uuid, case when g.revoked then now() end
  from (values
    ('e2460000-0000-4000-8000-0000000000b1', 'super_admin', null, false),
    ('e2460000-0000-4000-8000-0000000000b2', 'super_admin', 'nairobi', false),
    ('e2460000-0000-4000-8000-0000000000b3', 'finance', null, false),
    ('e2460000-0000-4000-8000-0000000000b4', 'super_admin', null, true)) as g (staff, role_key, city, revoked)
  join public.role r on r.key = g.role_key;
set local session_replication_role = origin;

-- ──────────────────────────────────────────────────── 1. grants

select ok(
  not has_function_privilege('anon', 'public.rpc_paystack_key_set(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_paystack_key_remove(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.rpc_paystack_key_status()', 'execute'),
  'The anonymous key reaches none of the console''s key functions.');
select ok(
  has_function_privilege('anon', 'public.rpc_paystack_server_keys(bigint, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.rpc_paystack_server_keys(bigint, text)', 'execute')
  and not has_function_privilege('service_role', 'public.rpc_paystack_server_keys(bigint, text)', 'execute'),
  'Only the anonymous role may call the server fetch.');
select ok(
  exists (select 1 from public.wiring_anon_allow where function_name = 'rpc_paystack_server_keys'),
  'The anonymous grant is written down with its guard.');

-- ──────────────────────────────────────────────────── 2. who may

set local role authenticated;
select pg_temp.as_user('e2460000-0000-4000-8000-000000000005');
select throws_ok($$select public.rpc_paystack_key_set('test', 'sk_test_ci_only_0123456789')$$,
  '42501', null, 'A customer cannot save a key.');
select pg_temp.as_user('e2460000-0000-4000-8000-000000000003');
select throws_ok($$select public.rpc_paystack_key_set('test', 'sk_test_ci_only_0123456789')$$,
  '42501', 'Only a super admin for every city can save Paystack keys.', 'Finance cannot save a key.');
select throws_ok($$select public.rpc_paystack_key_status()$$, '42501', null,
  'Finance cannot see the keys screen.');
select pg_temp.as_user('e2460000-0000-4000-8000-000000000002');
select throws_ok($$select public.rpc_paystack_key_set('test', 'sk_test_ci_only_0123456789')$$,
  '42501', null, 'A super admin for one city cannot save a key.');
select throws_ok($$select public.rpc_paystack_key_status()$$, '42501', null,
  'Nor see the keys screen.');
select throws_ok($$select public.rpc_paystack_key_remove('test', 'No longer used')$$, '42501', null,
  'Nor remove a key.');
select pg_temp.as_user('e2460000-0000-4000-8000-000000000004');
select throws_ok($$select public.rpc_paystack_key_set('test', 'sk_test_ci_only_0123456789')$$,
  '42501', null, 'A withdrawn super admin grant saves nothing.');

-- ──────────────────────────────────────────────────── 3. saving

select pg_temp.as_user('e2460000-0000-4000-8000-000000000001');
select is(public.rpc_paystack_key_status(),
  '{"test": {"set": false, "last4": null, "updated_at": null},
    "live": {"set": false, "last4": null, "updated_at": null},
    "server_token_set": false}'::jsonb,
  'With nothing saved, the screen says so.');
select throws_ok($$select public.rpc_paystack_key_set('sandbox', 'sk_test_ci_only_0123456789')$$,
  '22023', 'Choose test or live.', 'There are two modes.');
select throws_ok($$select public.rpc_paystack_key_set('test', 'sk_live_ci_only_9876543210')$$,
  '22023', 'A test secret key starts sk_test_.', 'A live key is not saved as the test key.');
select throws_ok($$select public.rpc_paystack_key_set('live', 'pk_live_ci_only_0123456789')$$,
  '22023', 'A live secret key starts sk_live_.', 'A public key is not a secret key.');
select throws_ok($$select public.rpc_paystack_key_set('test', 'sk_test_short')$$,
  '22023', 'That is not a whole Paystack secret key. Copy it again.', 'Part of a key is refused.');
select throws_ok($$select public.rpc_paystack_key_set('test', 'sk_test_ci_only_0123 456789')$$,
  '22023', 'That is not a whole Paystack secret key. Copy it again.', 'A key has no spaces inside.');
select is(pg_temp.says($$select public.rpc_paystack_key_set('test', 'sk_live_ci_only_9876543210')$$,
  'ci_only_9876'), 'quiet', 'A refusal does not repeat the key.');

insert into t select 'set1', public.rpc_paystack_key_set('test', E'  sk_test_ci_only_0123456789\n');
select is((select v - 'updated_at' from t where k = 'set1'),
  '{"ok": true, "mode": "test", "set": true, "last4": "6789"}'::jsonb,
  'The test key is saved; the answer has only its last four characters.');
select ok((select position('ci_only' in v::text) = 0 from t where k = 'set1'),
  'The key is not in the answer.');
reset role;

select is((select decrypted_secret from vault.decrypted_secrets where name = 'paystack_test_secret_key'),
  'sk_test_ci_only_0123456789', 'Vault holds it without the spaces and line break pasted around it.');
select is(
  (select after from audit.audit_event
    where action = 'paystack.key_set' and actor_id = 'e2460000-0000-4000-8000-0000000000b1'),
  '{"mode": "test", "last4": "6789"}'::jsonb, 'The audit records the mode and last four only.');
select ok(
  (select severity = 'high' and target_type = 'paystack_key' from audit.audit_event
    where action = 'paystack.key_set' and actor_id = 'e2460000-0000-4000-8000-0000000000b1')
  and (select money from audit.action_registry where action = 'paystack.key_set'),
  'It is a high-severity money entry.');
select is(
  (select count(*)::int from audit.audit_event e where e::text like '%ci_only_0123456789%'), 0,
  'No audit entry carries the key.');

set local role authenticated;
select pg_temp.as_user('e2460000-0000-4000-8000-000000000001');
select is(public.rpc_paystack_key_set('test', 'sk_test_ci_only_1111222233334444') ->> 'last4', '4444',
  'Saving again replaces the test key.');
select is(public.rpc_paystack_key_set('live', 'sk_live_ci_only_9876543210') ->> 'last4', '3210',
  'The live key is saved beside it.');
reset role;

select is(
  (select count(*)::int || ' ' || min(decrypted_secret) from vault.decrypted_secrets
    where name = 'paystack_test_secret_key'),
  '1 sk_test_ci_only_1111222233334444', 'There is still one test key, the new one.');
select is(authz.paystack_mode('sk_test_ci_only_1111222233334444'), 'test',
  'The payment functions accept the saved key.');

set local role authenticated;
select pg_temp.as_user('e2460000-0000-4000-8000-000000000001');
insert into t select 'status', public.rpc_paystack_key_status();
select is(
  (select v #- '{test,updated_at}' #- '{live,updated_at}' from t where k = 'status'),
  '{"test": {"set": true, "last4": "4444"}, "live": {"set": true, "last4": "3210"},
    "server_token_set": false}'::jsonb,
  'The screen shows both keys by their last four characters.');
select ok(
  (select v #>> '{test,updated_at}' is not null and v #>> '{live,updated_at}' is not null
          and position('ci_only' in v::text) = 0 from t where k = 'status'),
  'With the date each was saved, and no key.');

-- ──────────────────────────────────────────────────── 4. removing

select throws_ok($$select public.rpc_paystack_key_remove('live', '  ')$$,
  '22023', 'Say why this key is being removed.', 'Removing needs a reason.');
select throws_ok($$select public.rpc_paystack_key_remove('live', 'was sk_live_ci_only_9876543210')$$,
  '22023', 'Do not put a key in the reason.', 'A key is not accepted as a reason.');
select is(public.rpc_paystack_key_remove('live', 'Rotating the key'),
  '{"ok": true, "mode": "live", "removed": true}'::jsonb, 'The live key is removed.');
select is(public.rpc_paystack_key_remove('live', 'Rotating the key'),
  '{"ok": true, "mode": "live", "removed": false}'::jsonb, 'Asking again changes nothing.');
reset role;

select is(
  (select string_agg(name, ' ' order by name) from vault.secrets
    where name in ('paystack_test_secret_key', 'paystack_live_secret_key')),
  'paystack_test_secret_key', 'Only the live key is gone.');
select is(
  (select count(*)::int || ' ' || min(reason) || ' ' || min(before ->> 'last4') from audit.audit_event
    where action = 'paystack.key_removed' and actor_id = 'e2460000-0000-4000-8000-0000000000b1'),
  '1 Rotating the key 3210', 'One removal is audited, with its reason and last four.');

-- ──────────────────────────────────────────────────── 5. the servers' fetch

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select pg_temp.fetch(0)$$, '42501', 'Not allowed.',
  'With no token in Vault, nothing is handed out.');
reset role;

select vault.create_secret('too-short-token', 'paystack_keys_server_token');
set local role anon;
select throws_ok(
  $$select public.rpc_paystack_server_keys(pg_temp.minute(0),
      pg_temp.proof(pg_temp.minute(0), 'too-short-token'))$$,
  '42501', 'Not allowed.', 'A token under 32 characters is not used.');
reset role;

set local role authenticated;
select pg_temp.as_user('e2460000-0000-4000-8000-000000000001');
select is(public.rpc_paystack_key_status() ->> 'server_token_set', 'false',
  'The screen does not count a short token as set.');
select throws_ok($$select public.rpc_paystack_key_set('keys_server', 'sk_test_ci_only_0123456789')$$,
  '22023', 'Choose test or live.', 'The key function cannot write the server token.');
reset role;

delete from vault.secrets where name = 'paystack_keys_server_token';
select vault.create_secret(E'ci-only-server-token-0123456789abcdef\n', 'paystack_keys_server_token');
set local role authenticated;
select pg_temp.as_user('e2460000-0000-4000-8000-000000000001');
select is(public.rpc_paystack_key_status() ->> 'server_token_set', 'true',
  'The screen says the server token is set.');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.fetch(0), '{"test": "sk_test_ci_only_1111222233334444", "live": null}'::jsonb,
  'A right proof returns the saved keys, and null for the one not saved.');
select is(pg_temp.fetch(-1) ->> 'test', 'sk_test_ci_only_1111222233334444',
  'A clock one minute behind is accepted.');
select is(pg_temp.fetch(1) ->> 'test', 'sk_test_ci_only_1111222233334444',
  'So is one a minute ahead.');
select throws_ok($$select pg_temp.fetch(-2)$$, '42501', 'Not allowed.', 'An old proof is refused.');
select throws_ok($$select pg_temp.fetch(2)$$, '42501', 'Not allowed.', 'So is one from too far ahead.');
select throws_ok(
  $$select public.rpc_paystack_server_keys(pg_temp.minute(0),
      pg_temp.proof(pg_temp.minute(0), 'ci-only-other-token-0123456789abcdef'))$$,
  '42501', 'Not allowed.', 'A proof made with another token is refused.');
select throws_ok(
  $$select public.rpc_paystack_server_keys(pg_temp.minute(0), pg_temp.proof(pg_temp.minute(1)))$$,
  '42501', 'Not allowed.', 'A proof belongs to its own minute.');
select throws_ok(
  $$select public.rpc_paystack_server_keys(pg_temp.minute(0), upper(pg_temp.proof(pg_temp.minute(0))))$$,
  '42501', 'Not allowed.', 'The proof is lowercase hex.');
select throws_ok(
  $$select public.rpc_paystack_server_keys(pg_temp.minute(0), repeat('z', 64))$$,
  '42501', 'Not allowed.', 'Text that is not hex is refused the same way.');
select throws_ok(
  $$select public.rpc_paystack_server_keys(pg_temp.minute(0), null)$$,
  '42501', 'Not allowed.', 'No proof, no keys.');
select throws_ok(
  $$select public.rpc_paystack_server_keys(null, pg_temp.proof(pg_temp.minute(0)))$$,
  '42501', 'Not allowed.', 'No minute, no keys.');
select throws_ok(
  $$select public.rpc_paystack_server_keys('-9223372036854775808'::bigint, repeat('0', 64))$$,
  '42501', 'Not allowed.', 'An absurd minute is refused the same way.');
reset role;

set local role authenticated;
select pg_temp.as_user('e2460000-0000-4000-8000-000000000001');
select throws_ok($$select pg_temp.fetch(0)$$, '42501', null,
  'Even a super admin''s session cannot fetch the keys, right proof or not.');
reset role;

select * from finish();
rollback;
