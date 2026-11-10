-- Settings → API: the outside systems NexG connects to, and proof they work.
--
-- One row per connection: a bank, a merchant's own system (POS, ERP,
-- booking or inventory software), a payment provider, or NexG's own API.
-- Each belongs to an environment: 'sandbox' for testing, 'live' for the
-- connection partners will use with real data.
--
-- Rules, all enforced here rather than in the console:
--   * Credentials live in Supabase Vault. A row keeps only the Vault name;
--     the console reads a view without even that, just whether one is set.
--     A credential is written once and never read back by anyone.
--   * A connection test is an HTTP request made by the database itself
--     (pg_net), so a stored credential is used inside the database and is
--     never returned to the console, the browser or the admin server.
--   * Live connections must use https and a public host.
--   * Anyone in the Settings module can see connections and run tests;
--     only people who may edit Payments & integrations can add or change
--     them or set their credentials. Every change is audited, never the value.
--
-- Rollback:
--   drop function public.rpc_api_connection_save(jsonb),
--     public.rpc_api_connection_set_secret(uuid, text, text),
--     public.rpc_api_connection_clear_secret(uuid, text),
--     public.rpc_api_connection_set_enabled(uuid, boolean),
--     public.rpc_api_connection_test(uuid),
--     public.rpc_api_connection_test_result(uuid),
--     authz.api_connection_url_ok(text, text);
--   drop view public.api_connection_test_v, public.api_connection_v;
--   drop table public.api_connection_test, public.api_connection;
--   delete from vault.secrets where name like 'api_connection:%';

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('api_connection.saved', 'settings', 'notice', false, false, false, 'An API connection was added or changed'),
  ('api_connection.secret_set', 'settings', 'high', false, false, false, 'An API connection credential was set'),
  ('api_connection.secret_cleared', 'settings', 'notice', false, false, false, 'An API connection credential was removed'),
  ('api_connection.enabled_changed', 'settings', 'notice', false, false, false, 'An API connection was switched on or off'),
  ('api_connection.test_started', 'settings', 'info', false, false, false, 'An API connection test was started'),
  ('api_connection.tested', 'settings', 'info', false, false, false, 'An API connection was tested')
on conflict (action) do nothing;

create table public.api_connection (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9][a-z0-9-]{1,48}$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  kind text not null check (kind in ('bank', 'merchant_system', 'payment_provider', 'nexg_api', 'other')),
  environment text not null check (environment in ('sandbox', 'live')),
  base_url text check (base_url is null or (base_url ~ '^https?://[^\s/?#]+' and length(base_url) <= 300)),
  auth_type text not null default 'none' check (auth_type in ('none', 'bearer', 'api_key_header', 'basic')),
  auth_header text check (auth_header is null or auth_header ~ '^[A-Za-z0-9-]{1,64}$'),
  test_path text not null default '/health' check (test_path ~ '^/\S*$' and length(test_path) <= 300),
  /* Vault names. Never the secret, not even encrypted. */
  secret_ref text,
  webhook_secret_ref text,
  merchant_id uuid references public.merchant (id) on delete set null,
  contact_name text check (contact_name is null or length(contact_name) <= 120),
  contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notes text check (notes is null or length(notes) <= 2000),
  enabled boolean not null default true,
  status text not null default 'not_tested' check (status in ('not_tested', 'connected', 'failing')),
  last_tested_at timestamptz,
  last_test_ok boolean,
  last_test_status integer,
  last_test_ms integer,
  last_test_detail text,
  sort integer not null default 100,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint api_connection_header_needed check (auth_type <> 'api_key_header' or auth_header is not null)
);

create table public.api_connection_test (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.api_connection (id) on delete cascade,
  request_id bigint,
  url text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  status_code integer,
  latency_ms integer,
  detail text,
  tested_by uuid references public.staff_user (id) on delete set null
);
create index api_connection_test_connection_idx on public.api_connection_test (connection_id, started_at desc);

alter table public.api_connection enable row level security;
alter table public.api_connection_test enable row level security;
revoke all on public.api_connection, public.api_connection_test from anon, authenticated;

-- What the console reads: no Vault names, only whether a credential is set.
create view public.api_connection_v
with (security_invoker = false) as
select c.id, c.key, c.name, c.kind, c.environment, c.base_url, c.auth_type, c.auth_header,
       c.test_path, c.secret_ref is not null as has_credential,
       c.webhook_secret_ref is not null as has_webhook_secret,
       c.merchant_id, c.contact_name, c.contact_email, c.notes, c.enabled, c.status,
       c.last_tested_at, c.last_test_ok, c.last_test_status, c.last_test_ms, c.last_test_detail,
       c.sort, c.created_at, c.updated_at
from public.api_connection c
where authz.is_super_admin() or authz.reaches_module('settings');

create view public.api_connection_test_v
with (security_invoker = false) as
select t.id, t.connection_id, t.url, t.started_at, t.finished_at, t.ok, t.status_code,
       t.latency_ms, t.detail
from public.api_connection_test t
where authz.is_super_admin() or authz.reaches_module('settings');

grant select on public.api_connection_v, public.api_connection_test_v to authenticated;

comment on view public.api_connection_v is
  'Runs as owner and scopes itself, because the base table holds Vault names. Credentials are reported only as has_credential / has_webhook_secret.';

-- ─────────────────────────────────────────────────────────── helpers

-- Live connections: https, and a host that is not this machine or a
-- private network. Sandbox connections may use http (a local sandbox).
create function authz.api_connection_url_ok(p_url text, p_environment text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_host text := lower(substring(p_url from '^https?://(?:[^@/]*@)?([^:/?#]+)'));
begin
  if p_url is null then return true; end if;
  if v_host is null or p_url !~ '^https?://' then return false; end if;
  if p_environment = 'live' then
    if p_url !~ '^https://' then return false; end if;
    if v_host in ('localhost', 'host.docker.internal', 'metadata.google.internal')
       or v_host ~ '^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
       or v_host ~ '\.(local|internal|localhost)$' or v_host ~ '^\[' then
      return false;
    end if;
  end if;
  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────── writes

create function public.rpc_api_connection_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_before public.api_connection;
  v_row public.api_connection;
  v_env text := coalesce(p->>'environment', 'sandbox');
  v_url text := nullif(btrim(coalesce(p->>'base_url', '')), '');
  v_auth text := coalesce(nullif(p->>'auth_type', ''), 'none');
begin
  if not settings.fn_may_edit('payments') then
    raise exception 'Only people who may edit Payments & integrations can change API connections.'
      using errcode = '42501';
  end if;
  v_url := rtrim(v_url, '/');
  if not authz.api_connection_url_ok(v_url, v_env) then
    raise exception 'A live connection needs an https address on a public host.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.api_connection (key, name, kind, environment, base_url, auth_type, auth_header,
      test_path, merchant_id, contact_name, contact_email, notes, created_by)
    values (
      coalesce(nullif(p->>'key', ''),
               trim(both '-' from left(regexp_replace(lower(coalesce(p->>'name', '')), '[^a-z0-9]+', '-', 'g'), 40))
                 || '-' || v_env),
      btrim(p->>'name'), p->>'kind', v_env, v_url, v_auth,
      nullif(btrim(coalesce(p->>'auth_header', '')), ''),
      coalesce(nullif(btrim(coalesce(p->>'test_path', '')), ''), '/health'),
      nullif(p->>'merchant_id', '')::uuid,
      nullif(btrim(coalesce(p->>'contact_name', '')), ''),
      nullif(btrim(coalesce(p->>'contact_email', '')), ''),
      nullif(btrim(coalesce(p->>'notes', '')), ''),
      authz.staff_id())
    returning * into v_row;
  else
    select * into v_before from public.api_connection where id = v_id for update;
    if not found then raise exception 'No such connection.' using errcode = 'P0002'; end if;
    update public.api_connection set
      name = btrim(p->>'name'),
      kind = p->>'kind',
      environment = v_env,
      base_url = v_url,
      auth_type = v_auth,
      auth_header = nullif(btrim(coalesce(p->>'auth_header', '')), ''),
      test_path = coalesce(nullif(btrim(coalesce(p->>'test_path', '')), ''), '/health'),
      merchant_id = nullif(p->>'merchant_id', '')::uuid,
      contact_name = nullif(btrim(coalesce(p->>'contact_name', '')), ''),
      contact_email = nullif(btrim(coalesce(p->>'contact_email', '')), ''),
      notes = nullif(btrim(coalesce(p->>'notes', '')), ''),
      -- What was proven no longer applies to a changed address or login.
      status = case when v_before.base_url is distinct from v_url or v_before.auth_type is distinct from v_auth
                         or v_before.test_path is distinct from coalesce(nullif(btrim(coalesce(p->>'test_path', '')), ''), '/health')
                    then 'not_tested' else v_before.status end,
      updated_at = now()
    where id = v_id
    returning * into v_row;
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_actor_id => authz.staff_id(), p_module => 'settings',
    p_action => 'api_connection.saved', p_target_type => 'api_connection', p_target_id => v_row.id,
    p_target_label => v_row.name,
    p_before => case when v_before.id is null then null else
      jsonb_build_object('base_url', v_before.base_url, 'environment', v_before.environment, 'auth_type', v_before.auth_type) end,
    p_after => jsonb_build_object('base_url', v_row.base_url, 'environment', v_row.environment,
                                  'auth_type', v_row.auth_type, 'kind', v_row.kind));
  return jsonb_build_object('ok', true, 'id', v_row.id, 'key', v_row.key);
exception
  when unique_violation then
    raise exception 'A connection with that name already exists in this environment.' using errcode = '23505';
  when check_violation then
    raise exception 'Check the connection details: %', sqlerrm using errcode = '22023';
end;
$$;

-- p_kind: 'credential' (sent to the other system) or 'webhook' (checks what
-- it sends us). The value is stored in Vault and never returned.
create function public.rpc_api_connection_set_secret(p_id uuid, p_kind text, p_value text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.api_connection;
  v_name text;
  v_secret_id uuid;
begin
  if not settings.fn_may_edit('payments') then
    raise exception 'Only people who may edit Payments & integrations can set credentials.' using errcode = '42501';
  end if;
  if p_kind not in ('credential', 'webhook') then
    raise exception 'Unknown credential kind.' using errcode = '22023';
  end if;
  if p_value is null or length(p_value) < 8 or length(p_value) > 4096 then
    raise exception 'A credential is 8 to 4096 characters.' using errcode = '22023';
  end if;
  select * into c from public.api_connection where id = p_id for update;
  if not found then raise exception 'No such connection.' using errcode = 'P0002'; end if;
  if p_kind = 'credential' and c.auth_type = 'basic' and position(':' in p_value) = 0 then
    raise exception 'Basic sign-in needs username:password.' using errcode = '22023';
  end if;

  v_name := 'api_connection:' || c.key || ':' || p_kind;
  select id into v_secret_id from vault.secrets where name = v_name;
  if v_secret_id is null then
    perform vault.create_secret(p_value, v_name, 'API connection ' || c.name || ' (' || p_kind || ')');
  else
    perform vault.update_secret(v_secret_id, p_value);
  end if;

  update public.api_connection
     set secret_ref = case when p_kind = 'credential' then v_name else secret_ref end,
         webhook_secret_ref = case when p_kind = 'webhook' then v_name else webhook_secret_ref end,
         status = case when p_kind = 'credential' then 'not_tested' else status end,
         updated_at = now()
   where id = c.id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_actor_id => authz.staff_id(), p_module => 'settings',
    p_action => 'api_connection.secret_set', p_target_type => 'api_connection', p_target_id => c.id,
    p_target_label => c.name, p_after => jsonb_build_object('kind', p_kind));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.rpc_api_connection_clear_secret(p_id uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.api_connection;
  v_ref text;
begin
  if not settings.fn_may_edit('payments') then
    raise exception 'Only people who may edit Payments & integrations can remove credentials.' using errcode = '42501';
  end if;
  select * into c from public.api_connection where id = p_id for update;
  if not found then raise exception 'No such connection.' using errcode = 'P0002'; end if;
  v_ref := case p_kind when 'credential' then c.secret_ref when 'webhook' then c.webhook_secret_ref end;
  if v_ref is not null then
    delete from vault.secrets where name = v_ref;
  end if;
  update public.api_connection
     set secret_ref = case when p_kind = 'credential' then null else secret_ref end,
         webhook_secret_ref = case when p_kind = 'webhook' then null else webhook_secret_ref end,
         status = case when p_kind = 'credential' then 'not_tested' else status end,
         updated_at = now()
   where id = c.id;
  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_actor_id => authz.staff_id(), p_module => 'settings',
    p_action => 'api_connection.secret_cleared', p_target_type => 'api_connection', p_target_id => c.id,
    p_target_label => c.name, p_after => jsonb_build_object('kind', p_kind));
  return jsonb_build_object('ok', true);
end;
$$;

create function public.rpc_api_connection_set_enabled(p_id uuid, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.api_connection;
begin
  if not settings.fn_may_edit('payments') then
    raise exception 'Only people who may edit Payments & integrations can switch connections.' using errcode = '42501';
  end if;
  update public.api_connection set enabled = p_enabled, updated_at = now()
   where id = p_id returning * into c;
  if not found then raise exception 'No such connection.' using errcode = 'P0002'; end if;
  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_actor_id => authz.staff_id(), p_module => 'settings',
    p_action => 'api_connection.enabled_changed', p_target_type => 'api_connection', p_target_id => c.id,
    p_target_label => c.name, p_after => jsonb_build_object('enabled', p_enabled));
  return jsonb_build_object('ok', true);
end;
$$;

-- ─────────────────────────────────────────────────────────── tests

-- Start a test: the database sends GET <base_url><test_path> with the
-- connection's credential. Returns the test id; read the outcome with
-- rpc_api_connection_test_result a moment later.
create function public.rpc_api_connection_test(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.api_connection;
  v_secret text;
  v_headers jsonb := jsonb_build_object('accept', 'application/json', 'user-agent', 'NexG-Connection-Test/1.0');
  v_url text;
  v_request bigint;
  v_test uuid;
begin
  if not (authz.is_super_admin() or authz.reaches_module('settings')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select * into c from public.api_connection where id = p_id for update;
  if not found then raise exception 'No such connection.' using errcode = 'P0002'; end if;
  if not c.enabled then raise exception 'Switch the connection on first.' using errcode = '22023'; end if;
  if c.base_url is null then raise exception 'Set the connection address first.' using errcode = '22023'; end if;
  if not authz.api_connection_url_ok(c.base_url, c.environment) then
    raise exception 'A live connection needs an https address on a public host.' using errcode = '22023';
  end if;
  if exists (select 1 from public.api_connection_test
              where connection_id = c.id and started_at > now() - interval '5 seconds') then
    raise exception 'A test just ran. Wait a few seconds.' using errcode = '22023';
  end if;

  if c.auth_type <> 'none' then
    if c.secret_ref is null then
      raise exception 'Set the credential first.' using errcode = '22023';
    end if;
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = c.secret_ref;
    if v_secret is null then raise exception 'The stored credential is missing. Set it again.' using errcode = '22023'; end if;
    v_headers := v_headers || case c.auth_type
      when 'bearer' then jsonb_build_object('authorization', 'Bearer ' || v_secret)
      when 'api_key_header' then jsonb_build_object(c.auth_header, v_secret)
      when 'basic' then jsonb_build_object('authorization',
        'Basic ' || replace(encode(convert_to(v_secret, 'UTF8'), 'base64'), E'\n', ''))
    end;
  end if;

  v_url := c.base_url || c.test_path;
  v_request := net.http_get(url := v_url, headers := v_headers, timeout_milliseconds := 10000);

  insert into public.api_connection_test (connection_id, request_id, url, tested_by)
  values (c.id, v_request, v_url, authz.staff_id())
  returning id into v_test;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_actor_id => authz.staff_id(), p_module => 'settings',
    p_action => 'api_connection.test_started', p_target_type => 'api_connection', p_target_id => c.id,
    p_target_label => c.name, p_after => jsonb_build_object('url', v_url));
  return v_test;
end;
$$;

-- The outcome of a test, recorded once the response (or a timeout) is in.
create function public.rpc_api_connection_test_result(p_test_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.api_connection_test;
  c public.api_connection;
  r record;
  v_ok boolean;
  v_detail text;
begin
  if not (authz.is_super_admin() or authz.reaches_module('settings')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  select * into t from public.api_connection_test where id = p_test_id for update;
  if not found then raise exception 'No such test.' using errcode = 'P0002'; end if;

  if t.finished_at is null then
    select status_code, content, error_msg, timed_out, created into r
      from net._http_response where id = t.request_id;
    if found then
      v_ok := r.error_msg is null and coalesce(r.timed_out, false) = false
              and r.status_code between 200 and 299;
      v_detail := left(coalesce(r.error_msg,
        case when coalesce(r.timed_out, false) then 'No answer within 10 seconds.' end,
        regexp_replace(coalesce(r.content, ''), '\s+', ' ', 'g')), 300);
      update public.api_connection_test
         set finished_at = now(), ok = v_ok, status_code = r.status_code,
             latency_ms = greatest(0, (extract(epoch from (r.created - t.started_at)) * 1000)::int),
             detail = v_detail
       where id = t.id returning * into t;
    elsif t.started_at < now() - interval '20 seconds' then
      update public.api_connection_test
         set finished_at = now(), ok = false, detail = 'No answer within 20 seconds.'
       where id = t.id returning * into t;
    else
      return jsonb_build_object('done', false);
    end if;

    update public.api_connection
       set status = case when t.ok then 'connected' else 'failing' end,
           last_tested_at = t.finished_at, last_test_ok = t.ok, last_test_status = t.status_code,
           last_test_ms = t.latency_ms, last_test_detail = t.detail
     where id = t.connection_id
     returning * into c;

    perform audit.log(
      p_actor_type => 'staff'::public.actor_type, p_actor_id => t.tested_by, p_module => 'settings',
      p_action => 'api_connection.tested', p_target_type => 'api_connection', p_target_id => t.connection_id,
      p_target_label => c.name,
      p_after => jsonb_build_object('ok', t.ok, 'status_code', t.status_code, 'latency_ms', t.latency_ms));
  end if;

  return jsonb_build_object('done', true, 'ok', t.ok, 'status_code', t.status_code,
    'latency_ms', t.latency_ms, 'detail', t.detail, 'url', t.url);
end;
$$;

revoke execute on function authz.api_connection_url_ok(text, text) from public, anon;
revoke execute on function public.rpc_api_connection_save(jsonb),
  public.rpc_api_connection_set_secret(uuid, text, text),
  public.rpc_api_connection_clear_secret(uuid, text),
  public.rpc_api_connection_set_enabled(uuid, boolean),
  public.rpc_api_connection_test(uuid),
  public.rpc_api_connection_test_result(uuid) from public, anon;
grant execute on function public.rpc_api_connection_save(jsonb),
  public.rpc_api_connection_set_secret(uuid, text, text),
  public.rpc_api_connection_clear_secret(uuid, text),
  public.rpc_api_connection_set_enabled(uuid, boolean),
  public.rpc_api_connection_test(uuid),
  public.rpc_api_connection_test_result(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────── starting rows

insert into public.api_connection
  (key, name, kind, environment, base_url, auth_type, test_path, notes, sort)
values
  ('nexg-sandbox-bank', 'NexG Sandbox Bank', 'bank', 'sandbox', null, 'bearer', '/v1/test-accounts',
   'Stand-in bank for testing pay by bank (apps/bank-sandbox). Set the address where it runs and its SANDBOX_API_KEY as the credential; the test then proves the key is accepted.', 10),
  ('nexg-api', 'NexG public API', 'nexg_api', 'live', 'https://api.nexgapp.com', 'none', '/v1/zones',
   'NexG''s own API, where merchants and partners connect with keys from the developer console.', 20)
on conflict (key) do nothing;
