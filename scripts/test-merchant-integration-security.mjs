/**
 * Isolated SQL contract fixture for migration 002. Uses a temporary PGlite
 * installation, never a linked Supabase database. Session and workspace-state
 * helpers are test boundaries; migration 001 tests own their implementation.
 * Run: $env:PHASE4_PGLITE_PATH='C:/.../@electric-sql/pglite/dist/index.js';
 *      node scripts/test-merchant-integration-security.mjs
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

if (!process.env.PHASE4_PGLITE_PATH)
  throw new Error('Set PHASE4_PGLITE_PATH to the isolated installed PGlite dist/index.js.');
const { PGlite } = await import(pathToFileURL(process.env.PHASE4_PGLITE_PATH).href);
const pg = new PGlite();
// PGlite does not infer serializers for a freshly created enum-array OID.
const query = pg.query.bind(pg);
pg.query = (sql, args = []) =>
  query(
    sql,
    args.map((value) => (Array.isArray(value) ? `{${value.join(',')}}` : value)),
  );
const owner = '10000000-0000-4000-8000-000000000001';
const stranger = '10000000-0000-4000-8000-000000000002';
const staffUser = '10000000-0000-4000-8000-000000000003';
const staffId = '20000000-0000-4000-8000-000000000001';
const merchant = '30000000-0000-4000-8000-000000000001';
const otherMerchant = '30000000-0000-4000-8000-000000000002';
const city = '40000000-0000-4000-8000-000000000001';
const otherCity = '40000000-0000-4000-8000-000000000002';
let checks = 0;
const scalar = async (sql, args = []) => Object.values((await pg.query(sql, args)).rows[0])[0];
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
};
const denied = async (sql, args, code, label) => {
  try {
    await pg.query(sql, args);
    assert.fail(`${label}: unexpectedly succeeded`);
  } catch (error) {
    assert.equal(error.code, code, label);
    checks++;
  }
};
const actor = async (id) => {
  await pg.query("select set_config('test.uid', $1, false)", [id ?? '']);
};
const spend = async (raw, operation = 'public_read', ip = null) =>
  (await pg.query('select * from public.fn_api_request_spend($1,$2,$3)', [raw, ip, operation]))
    .rows[0];
const issue = async (
  merchantId = merchant,
  scopes = ['public_read', 'merchant_read'],
  rate = 10,
  creator = owner,
  staff = null,
) =>
  (
    await pg.query(
      'select * from public.fn_api_key_issue($1,$2::public.api_credential_scope[],$3,null,$4,$5)',
      [merchantId, scopes, rate, staff, creator],
    )
  ).rows[0];

try {
  await pg.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema authz; create schema audit;
    create type public.api_credential_scope as enum ('public_read','merchant_read','merchant_write','internal_read','internal_write');
    create type public.actor_type as enum ('merchant_user','staff');
    create table public.merchant (id uuid primary key, city_id uuid, operations boolean not null default true);
    create table public.merchant_user (merchant_id uuid, user_id uuid, role text);
    create table public.staff_user (id uuid primary key, user_id uuid, status text);
    create table public.role (id uuid primary key, key text);
    create table public.role_grant (staff_user_id uuid, role_id uuid, city_id uuid, revoked_at timestamptz, expires_at timestamptz);
    create table public.api_key (
      id uuid primary key default gen_random_uuid(), merchant_id uuid references public.merchant(id),
      key_hash text not null unique, key_prefix text not null, scopes public.api_credential_scope[] not null,
      rate_limit integer not null, state text not null default 'active', expires_at timestamptz,
      created_by uuid references public.staff_user(id), created_by_user uuid,
      check (rate_limit > 0), check (cardinality(scopes)>0),
      check (merchant_id is not null or not scopes && array['merchant_read','merchant_write']::public.api_credential_scope[]),
      check (created_by is not null or not scopes && array['internal_read','internal_write']::public.api_credential_scope[])
    );
    alter table public.api_key enable row level security;
    create policy api_key_staff_write on public.api_key for all to authenticated using (true) with check (true);
    grant all on public.api_key to authenticated;
    create table public.wiring_anon_allow (function_name text primary key, reason text, guarded_by text);
    insert into public.wiring_anon_allow values ('fn_api_key_lookup','',''), ('fn_api_key_spend','','');
    create function public.fn_api_key_spend(uuid,integer) returns boolean language sql as 'select true';
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function authz.staff_id() returns uuid language sql stable security definer as $$
      select id from public.staff_user where user_id=auth.uid() and status='active' $$;
    create function authz.require_merchant_application_session() returns void language plpgsql as $$ begin
      if auth.uid() is null or current_setting('test.session_valid',true) is distinct from 'true' then
        raise exception 'Invalid current session' using errcode='42501'; end if; end $$;
    create function authz.merchant_workspace_operations_allowed(uuid) returns boolean language sql stable security definer as $$
      select coalesce((select operations from public.merchant where id=$1), false) $$;
    create table audit.fixture_event (action text, actor_id uuid, after jsonb);
    create function audit.log(p_actor_type public.actor_type, p_module text, p_action text,
      p_actor_id uuid default null, p_actor_role text default null, p_target_type text default null,
      p_target_id uuid default null, p_before jsonb default null, p_after jsonb default null,
      p_reason text default null) returns bigint language plpgsql as $$ begin
      insert into audit.fixture_event values(p_action,p_actor_id,p_after); return 1; end $$;
    insert into public.merchant values ('${merchant}','${city}',true), ('${otherMerchant}','${otherCity}',true);
    insert into public.merchant_user values ('${merchant}','${owner}','owner'), ('${merchant}','${stranger}','manager');
    insert into public.staff_user values ('${staffId}','${staffUser}','active');
    insert into public.role values ('50000000-0000-4000-8000-000000000001','merchant_ops'), ('50000000-0000-4000-8000-000000000002','super_admin');
    select set_config('test.session_valid','true',false);
  `);
  await pg.exec(
    await readFile(
      new URL(
        '../supabase/migrations/20261102000200_merchant_integration_security.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  );

  await actor(owner);
  const key = await issue();
  check(key.raw_key.length, 64, 'owner receives a one-time secret');
  check(
    await scalar('select created_by_user::text from public.api_key where id=$1', [key.key_id]),
    owner,
    'creator derived from caller',
  );
  check(
    await scalar('select count(*)::int from public.fn_api_key_lookup($1)', [key.raw_key]),
    1,
    'existing consumer lookup',
  );
  check(
    await scalar(
      "select count(*)::int from audit.fixture_event where action='api.key_issued' and after::text like $1",
      [`%${key.raw_key}%`],
    ),
    0,
    'audit excludes raw credential',
  );
  await denied(
    'select * from public.fn_api_key_issue($1,$2::public.api_credential_scope[],60,null,null,$3)',
    [otherMerchant, ['merchant_read'], owner],
    '42501',
    'foreign tenant denied',
  );
  await denied(
    'select * from public.fn_api_key_issue(null,$1::public.api_credential_scope[],60,null,null,$2)',
    [['public_read'], stranger],
    '42501',
    'spoofed creator denied',
  );
  await denied(
    'select * from public.fn_api_key_issue(null,$1::public.api_credential_scope[],60,null,$2,$3)',
    [['public_read'], staffId, owner],
    '42501',
    'spoofed staff denied',
  );
  await denied(
    'select * from public.fn_api_key_issue(null,$1::public.api_credential_scope[])',
    [['internal_write']],
    '42501',
    'owner cannot grant internal scope',
  );
  await denied(
    'select * from public.fn_api_key_issue(null,$1::public.api_credential_scope[],601)',
    [['public_read']],
    '22023',
    'rate ceiling enforced',
  );
  await actor(stranger);
  await denied(
    'select * from public.fn_api_key_issue($1,$2::public.api_credential_scope[])',
    [merchant, ['merchant_read']],
    '42501',
    'non-owner member denied',
  );
  await actor(null);
  await denied('select * from public.fn_api_key_issue()', [], '42501', 'anonymous issuance denied');

  await actor(staffUser);
  await denied(
    'select * from public.fn_api_key_issue($1,$2::public.api_credential_scope[])',
    [merchant, ['merchant_read']],
    '42501',
    'staff row without grant denied',
  );
  await pg.query('insert into public.role_grant values ($1,$2,$3,null,null)', [
    staffId,
    '50000000-0000-4000-8000-000000000001',
    otherCity,
  ]);
  await denied(
    'select * from public.fn_api_key_issue($1,$2::public.api_credential_scope[])',
    [merchant, ['merchant_read']],
    '42501',
    'foreign-city staff grant denied',
  );
  await pg.query('update public.role_grant set city_id=$1', [city]);
  const sibling = await issue(merchant, ['public_read', 'merchant_read'], 60, staffUser);
  check(sibling.raw_key.length, 64, 'scoped staff grant succeeds');
  await pg.query('insert into public.role_grant values ($1,$2,$3,null,null)', [
    staffId,
    '50000000-0000-4000-8000-000000000002',
    city,
  ]);
  await denied(
    'select * from public.fn_api_key_issue(null,$1::public.api_credential_scope[])',
    [['internal_read']],
    '42501',
    'city super-admin cannot grant internal scope',
  );
  await pg.query(
    "update public.role_grant set city_id=null where role_id='50000000-0000-4000-8000-000000000002'",
  );
  const internal = await issue(null, ['public_read', 'internal_read'], 60, staffUser);
  check(
    await scalar('select count(*)::int from public.fn_api_key_lookup($1)', [internal.raw_key]),
    1,
    'global super-admin key works',
  );
  await pg.query(
    "update public.role_grant set revoked_at=now() where role_id='50000000-0000-4000-8000-000000000002'",
  );
  check(
    await scalar('select count(*)::int from public.fn_api_key_lookup($1)', [internal.raw_key]),
    0,
    'revoked internal authority denied',
  );

  await actor(owner);
  const first = await spend(key.raw_key, 'merchant_read');
  check([first.allowed, first.remaining], [true, 7], 'merchant read costs three');
  await spend(sibling.raw_key, 'merchant_read');
  const third = await spend(key.raw_key, 'merchant_read');
  check([third.allowed, third.remaining], [true, 1], 'siblings share lowest-rate merchant bucket');
  const refused = await spend(sibling.raw_key, 'merchant_read');
  check(
    [refused.allowed, refused.remaining, refused.retry_after],
    [false, 1, 12],
    'depletion returns retry-after without overspending',
  );
  check(
    await scalar('select count(*)::int from public.api_rate_bucket'),
    1,
    'rotated keys cannot allocate another tenant bucket',
  );
  await pg.query(
    "update public.api_rate_bucket set updated_at=clock_timestamp()-interval '12.1 seconds'",
  );
  const refill = await spend(key.raw_key, 'merchant_read');
  check([refill.allowed, refill.remaining], [true, 0], 'continuous refill admits weighted work');
  await denied(
    'select * from public.fn_api_request_spend($1,null,$2)',
    [key.raw_key, 'invented_operation'],
    '22023',
    'unknown costs rejected',
  );
  await denied(
    'select * from public.fn_api_request_spend(null,null,$1)',
    ['merchant_read'],
    '42501',
    'anonymous private operation denied',
  );
  await pg.query('update public.merchant set operations=false where id=$1', [merchant]);
  check(
    await scalar('select count(*)::int from public.fn_api_key_lookup($1)', [key.raw_key]),
    0,
    'current merchant state denies existing key',
  );
  await denied(
    'select * from public.fn_api_request_spend($1)',
    [key.raw_key],
    '42501',
    'spend rechecks current merchant state',
  );
  await pg.query('update public.merchant set operations=true where id=$1', [merchant]);
  await pg.query("update public.api_key set state='revoked' where id=$1", [sibling.key_id]);
  check(
    await scalar('select count(*)::int from public.fn_api_key_lookup($1)', [sibling.raw_key]),
    0,
    'revoked key denied',
  );
  await pg.query("update public.api_key set expires_at=now()-interval '1 second' where id=$1", [
    key.key_id,
  ]);
  check(
    await scalar('select count(*)::int from public.fn_api_key_lookup($1)', [key.raw_key]),
    0,
    'expired key denied',
  );

  const anonymous = await spend(null);
  check(
    [anonymous.allowed, anonymous.remaining],
    [true, 119],
    'anonymous requests have a bounded shared bucket',
  );
  await spend(null, 'public_read', '2001:db8::1');
  await spend(null, 'public_read', '2001:0db8:0:0:0:0:0:1');
  check(
    await scalar(
      "select count(*)::int from public.api_rate_bucket where principal like 'anonymous:ip:%'",
    ),
    1,
    'IPv6 spelling cannot multiply identity',
  );
  check(
    await scalar(
      "select floor(tokens)::int from public.api_rate_bucket where principal like 'anonymous:ip:%'",
    ),
    58,
    'trusted IP requests share quota',
  );
  check(
    await scalar(
      "select has_function_privilege('anon','public.fn_api_request_spend(text,text,text)','EXECUTE')",
    ),
    false,
    'public cannot invent rate identity',
  );
  check(
    await scalar(
      "select has_function_privilege('authenticated','public.fn_api_request_spend(text,text,text)','EXECUTE')",
    ),
    false,
    'human callers cannot invent rate identity',
  );
  check(
    await scalar(
      "select has_function_privilege('service_role','public.fn_api_request_spend(text,text,text)','EXECUTE')",
    ),
    true,
    'server limiter grant',
  );
  check(
    await scalar(
      "select has_function_privilege('anon','public.fn_api_key_spend(uuid,integer)','EXECUTE')",
    ),
    false,
    'legacy caller-selected limit disabled',
  );
  check(
    await scalar("select has_table_privilege('authenticated','public.api_key','INSERT')"),
    false,
    'direct key insert revoked',
  );
  check(
    await scalar("select has_table_privilege('authenticated','public.api_key','UPDATE')"),
    false,
    'direct key escalation revoked',
  );
  check(
    await scalar(
      "select count(*)::int from pg_policies where tablename='api_key' and policyname='api_key_staff_write'",
    ),
    0,
    'broad staff policy removed',
  );
  check(
    await scalar(
      "select has_function_privilege('anon','public.fn_api_key_issue(uuid,public.api_credential_scope[],integer,timestamptz,uuid,uuid)','EXECUTE')",
    ),
    false,
    'anonymous cannot execute issuer',
  );
  const writable = await issue(merchant, ['public_read', 'merchant_write'], 10);
  await pg.query(
    'update public.api_rate_bucket set tokens=10, updated_at=clock_timestamp() where principal=$1',
    [`merchant:${merchant}`],
  );
  const writeSpend = await spend(writable.raw_key, 'merchant_write');
  check([writeSpend.allowed, writeSpend.remaining], [true, 5], 'reserved write work costs five');
  await pg.query(
    "update public.api_rate_bucket set tokens=9, updated_at=clock_timestamp()+interval '1 hour' where principal=$1",
    [`merchant:${merchant}`],
  );
  const futureBucketTimestamp = await scalar(
    'select updated_at::text from public.api_rate_bucket where principal=$1',
    [`merchant:${merchant}`],
  );
  await spend(writable.raw_key, 'public_read');
  await spend(writable.raw_key, 'public_read');
  check(
    await scalar('select tokens::double precision from public.api_rate_bucket where principal=$1', [
      `merchant:${merchant}`,
    ]),
    7,
    'future API bucket timestamp grants no refill on a second spend',
  );
  check(
    await scalar('select updated_at::text from public.api_rate_bucket where principal=$1', [
      `merchant:${merchant}`,
    ]),
    futureBucketTimestamp,
    'API bucket timestamp never moves backward',
  );
  await pg.exec('set role anon');
  check(
    await scalar('select count(*)::int from public.fn_api_key_lookup($1)', [writable.raw_key]),
    1,
    'anonymous raw-key lookup passes guarded SQL without table access',
  );
  await denied(
    'select * from public.fn_api_request_spend($1)',
    [writable.raw_key],
    '42501',
    'direct anonymous rate RPC denied',
  );
  await pg.exec('reset role; set role authenticated');
  await denied(
    "update public.api_key set scopes='{internal_write}' where id=$1",
    [writable.key_id],
    '42501',
    'authenticated direct escalation fails',
  );
  await pg.exec('reset role; set role service_role');
  check(
    (await spend(writable.raw_key, 'public_read')).allowed,
    true,
    'server role executes guarded limiter',
  );
  await pg.exec('reset role');
  await actor(staffUser);
  const newStaffPlatform = await issue(null, ['public_read'], 10, staffUser);
  await pg.query(
    `insert into public.api_key(key_hash,key_prefix,scopes,rate_limit,created_by)
    values(encode(sha256(convert_to('old-staff-platform-key','UTF8')),'hex'),'oldstaff','{public_read}',10,$1)`,
    [staffId],
  );
  check(
    (await spend('old-staff-platform-key')).remaining,
    9,
    'legacy staff platform key resolves user principal',
  );
  check(
    (await spend(newStaffPlatform.raw_key)).remaining,
    8,
    'rotated staff platform key shares original user balance',
  );
  await actor(owner);
  await pg.query("select set_config('test.session_valid','false',false)");
  await denied(
    'select * from public.fn_api_key_issue()',
    [],
    '42501',
    'revoked human session cannot issue',
  );
  console.log(
    `PASS: ${checks} integration-security SQL assertions. Session and application helper implementations are tested separately by migration 001; multi-connection and deployed ingress acceptance remain open.`,
  );
} catch (error) {
  console.error(`FAIL after ${checks} checks: ${error.code ?? error.name}: ${error.message}`);
  if (error.where) console.error(error.where);
  process.exitCode = 1;
} finally {
  await pg.close();
}
