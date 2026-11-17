-- Revoking API keys (20270104070100): the owner of the key's merchant, or the
-- issuer of a platform key, revokes it in a current session; the key stops
-- working at once; the audit entry names who did it; a second revoke changes
-- nothing; a manager, strangers, unknown keys and stale sessions are refused;
-- and the issuer of a platform key may read it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create temp table t_m on commit drop as
  select m.id from public.merchant m
  where m.status = 'live' and authz.merchant_workspace_operations_allowed(m.id)
  order by m.id limit 1;
create temp table t_other on commit drop as
  select m.id from public.merchant m
  where m.id <> (select id from t_m)
  order by m.id limit 1;
grant select on t_m, t_other to authenticated;

-- The owner, and another person who issued a platform key of their own.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000', 'ca100000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'revoke.owner@test.local', '', now(), now(), now(),
   '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'ca100000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'revoke.someone@test.local', '', now(), now(), now(),
   '', '', '', '', '', '', '', '');
insert into public.merchant_user (merchant_id, user_id, role)
select id, 'ca100000-0000-4000-8000-000000000001'::uuid, 'owner'::public.merchant_user_role from t_m
union all
select id, 'ca100000-0000-4000-8000-000000000002'::uuid, 'manager'::public.merchant_user_role from t_m;
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('ca200000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', now(), now()),
       ('ca200000-0000-4000-8000-000000000002', 'ca100000-0000-4000-8000-000000000002', now(), now());
insert into public.merchant_application_session_activity (session_id, user_id, last_activity_at)
values ('ca200000-0000-4000-8000-000000000001', 'ca100000-0000-4000-8000-000000000001', now()),
       ('ca200000-0000-4000-8000-000000000002', 'ca100000-0000-4000-8000-000000000002', now());

insert into public.api_key (id, merchant_id, key_hash, key_prefix, scopes, rate_limit, created_by_user)
values
  ('cb000000-0000-4000-8000-000000000001', (select id from t_m),
   encode(sha256(convert_to('revoke-test-merchant-key-000000000000', 'UTF8')), 'hex'),
   'revoke01', '{public_read,merchant_read}', 60, 'ca100000-0000-4000-8000-000000000001'),
  ('cb000000-0000-4000-8000-000000000002', null,
   encode(sha256(convert_to('revoke-test-platform-key-mine-0000000', 'UTF8')), 'hex'),
   'revoke02', '{public_read}', 60, 'ca100000-0000-4000-8000-000000000001'),
  ('cb000000-0000-4000-8000-000000000003', null,
   encode(sha256(convert_to('revoke-test-platform-key-theirs-00000', 'UTF8')), 'hex'),
   'revoke03', '{public_read}', 60, 'ca100000-0000-4000-8000-000000000002'),
  ('cb000000-0000-4000-8000-000000000004', (select id from t_other),
   encode(sha256(convert_to('revoke-test-other-merchant-key-000000', 'UTF8')), 'hex'),
   'revoke04', '{public_read}', 60, null),
  ('cb000000-0000-4000-8000-000000000005', (select id from t_m),
   encode(sha256(convert_to('revoke-test-merchant-key-two-00000000', 'UTF8')), 'hex'),
   'revoke05', '{public_read}', 60, null);

select is(
  (select count(*) from public.fn_api_key_lookup('revoke-test-merchant-key-000000000000')),
  1::bigint,
  'the merchant key works before it is revoked');

-- ═══════════════════════════════════════════════════════════════ as a manager

select set_config('request.jwt.claims',
  '{"sub":"ca100000-0000-4000-8000-000000000002","role":"authenticated",'
  || '"session_id":"ca200000-0000-4000-8000-000000000002","is_anonymous":false}', true);
set local role authenticated;

select throws_ok(
  $$select public.rpc_api_key_revoke('cb000000-0000-4000-8000-000000000005')$$,
  '42501', 'Not allowed to revoke this key.',
  'a manager of the merchant may not revoke its key: only the owner may, as only the owner may issue one');

reset role;

-- ═══════════════════════════════════════════════════════════════ as the owner

select set_config('request.jwt.claims',
  '{"sub":"ca100000-0000-4000-8000-000000000001","role":"authenticated",'
  || '"session_id":"ca200000-0000-4000-8000-000000000001","is_anonymous":false}', true);
set local role authenticated;

select is(
  public.rpc_api_key_revoke('cb000000-0000-4000-8000-000000000001', '  Leaked in a screenshot  '),
  true,
  'the owner of the merchant revokes its key');

select is(
  public.rpc_api_key_revoke('cb000000-0000-4000-8000-000000000001', 'again'),
  false,
  'revoking a revoked key changes nothing');

select is(
  public.rpc_api_key_revoke('cb000000-0000-4000-8000-000000000002'),
  true,
  'the issuer of a platform key revokes it');

select throws_ok(
  $$select public.rpc_api_key_revoke('cb000000-0000-4000-8000-000000000003')$$,
  '42501', 'Not allowed to revoke this key.',
  'nobody revokes someone else''s platform key');

select throws_ok(
  $$select public.rpc_api_key_revoke('cb000000-0000-4000-8000-000000000004')$$,
  '42501', 'Not allowed to revoke this key.',
  'nobody revokes a key of a merchant they do not belong to');

select throws_ok(
  $$select public.rpc_api_key_revoke('cb000000-0000-4000-8000-0000000000ff')$$,
  'P0002', 'No such key.',
  'an unknown key is refused');

select is(
  (select string_agg(key_prefix, ',' order by key_prefix) from public.api_key where merchant_id is null),
  'revoke02',
  'the issuer of a platform key can read it, and no one else''s');

-- A session that is not current is refused.
select set_config('request.jwt.claims',
  '{"sub":"ca100000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select throws_ok(
  $$select public.rpc_api_key_revoke('cb000000-0000-4000-8000-000000000005')$$,
  '42501', 'A current signed-in account session is required.',
  'revoking needs a current signed-in session');

reset role;

-- ═══════════════════════════════════════════════════════════════ what it left behind

select is(
  (select state || '|' || (revoked_at is not null)::text || '|' || revoke_reason
   from public.api_key where id = 'cb000000-0000-4000-8000-000000000001'),
  'revoked|true|Leaked in a screenshot',
  'the key is revoked, with the reason trimmed');

select is(
  (select count(*) from public.fn_api_key_lookup('revoke-test-merchant-key-000000000000')),
  0::bigint,
  'a revoked key stops working at once');

select is(
  (select count(*)::text || '|' || min(e.actor_id::text) || '|' || min(e.before ->> 'state')
   from audit.audit_event e
   where e.action = 'api.key_revoked' and e.target_id = 'cb000000-0000-4000-8000-000000000001'),
  '1|ca100000-0000-4000-8000-000000000001|active',
  'one audit entry names who revoked the key');

select * from finish();
rollback;
