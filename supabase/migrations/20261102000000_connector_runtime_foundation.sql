-- Shared connector runtime foundation.
--
-- This migration is additive. Connector state is isolated from existing
-- merchant, order, finance and rider-cash tables; later adapters attach by
-- reference. Only the sandbox supplier adapter is registered here.

create type public.connector_family as enum ('supplier', 'payments');

create type public.connector_connection_state as enum (
  'draft', 'authorising', 'handshaking', 'operational', 'degraded',
  'disconnected', 'suspended', 'revoked'
);

create type public.connector_environment as enum ('sandbox', 'production');

create type public.connector_adapter_state as enum ('draft', 'sandbox', 'available', 'disabled');

create type public.connector_job_state as enum ('queued', 'leased', 'retry', 'delivered', 'dead');

create table public.connector_adapter (
  id text primary key,
  family public.connector_family not null,
  vertical text,
  version text not null,
  manifest jsonb not null,
  state public.connector_adapter_state not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connector_adapter_id_token check (id ~ '^[a-z][a-z0-9-]{1,62}$'),
  constraint connector_adapter_manifest_object check (jsonb_typeof(manifest) = 'object')
);

comment on table public.connector_adapter is
  'Registry of connector contracts. The first migration registers mock-only capabilities; vendor adapters require contract review and certification.';

create table public.connector_connection (
  id uuid primary key default gen_random_uuid(),
  adapter_id text not null references public.connector_adapter (id) on delete restrict,
  merchant_id uuid references public.merchant (id) on delete cascade,
  branch_id uuid references public.merchant_branch (id) on delete cascade,
  environment public.connector_environment not null default 'sandbox',
  state public.connector_connection_state not null default 'draft',
  manifest jsonb not null default '{}'::jsonb,
  last_ok_at timestamptz,
  last_error text,
  created_by_user uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connector_connection_manifest_object check (jsonb_typeof(manifest) = 'object'),
  constraint connector_connection_branch_needs_merchant check (branch_id is null or merchant_id is not null)
);

create index connector_connection_merchant_idx
  on public.connector_connection (merchant_id, created_at desc)
  where merchant_id is not null;
create index connector_connection_state_idx
  on public.connector_connection (state, updated_at desc);

create table public.connector_connection_consent (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connector_connection (id) on delete cascade,
  capabilities jsonb not null,
  agreed_by uuid not null references auth.users (id) on delete restrict,
  agreed_at timestamptz not null default now(),
  manifest_version text not null,
  constraint connector_consent_capabilities_object check (jsonb_typeof(capabilities) = 'object')
);

create index connector_consent_connection_idx
  on public.connector_connection_consent (connection_id, agreed_at desc);

create table public.connector_connection_secret (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connector_connection (id) on delete cascade,
  name text not null,
  vault_secret_id uuid not null,
  fingerprint text not null,
  updated_at timestamptz not null default now(),
  unique (connection_id, name),
  constraint connector_secret_name_token check (name ~ '^[a-z][a-z0-9_]{0,62}$')
);

comment on table public.connector_connection_secret is
  'Contains Supabase Vault references and fingerprints only. Secret values are never stored in connector tables.';

create table public.connector_outbox (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connector_connection (id) on delete cascade,
  operation text not null,
  payload jsonb not null,
  payload_hash text not null,
  idempotency_key text not null,
  state public.connector_job_state not null default 'queued',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (connection_id, idempotency_key),
  constraint connector_outbox_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint connector_outbox_payload_size check (octet_length(payload::text) <= 65536),
  constraint connector_outbox_idempotency_length check (length(idempotency_key) between 16 and 128),
  constraint connector_outbox_attempts_nonnegative check (attempts >= 0),
  constraint connector_outbox_lease_consistent check (
    (state = 'leased' and lease_token is not null and lease_until is not null)
    or (state <> 'leased' and lease_token is null and lease_until is null)
  )
);

create index connector_outbox_due_idx
  on public.connector_outbox (next_attempt_at, created_at)
  where state in ('queued', 'retry', 'leased');

create table public.connector_event (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connector_connection (id) on delete cascade,
  provider_event_id text not null,
  payload_hash text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (connection_id, provider_event_id)
);

comment on table public.connector_event is
  'Immutable inbound event envelope. Public webhook intake is not enabled until adapter-specific verification and retention policies are implemented.';

create table public.connector_run (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.connector_connection (id) on delete cascade,
  outbox_id uuid references public.connector_outbox (id) on delete set null,
  operation text not null,
  attempt integer not null,
  outcome text not null check (outcome in ('succeeded', 'retrying', 'dead')),
  request_hash text not null,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  elapsed_ms integer,
  created_at timestamptz not null default now(),
  constraint connector_run_elapsed_nonnegative check (elapsed_ms is null or elapsed_ms >= 0)
);

create index connector_run_connection_idx on public.connector_run (connection_id, created_at desc);
create index connector_run_outbox_idx on public.connector_run (outbox_id, attempt);

create table public.connector_dlq (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null unique references public.connector_outbox (id) on delete cascade,
  connection_id uuid not null references public.connector_connection (id) on delete cascade,
  reason_code text not null,
  resolved_at timestamptz,
  resolved_by uuid references public.staff_user (id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  constraint connector_dlq_resolution_complete check (
    (resolved_at is null and resolved_by is null and resolution_note is null)
    or (resolved_at is not null and resolved_by is not null and length(trim(resolution_note)) > 0)
  )
);

create table public.connector_kill_switch (
  scope_key text primary key,
  pause_writes boolean not null default false,
  pause_all boolean not null default false,
  reason text not null,
  updated_by uuid references public.staff_user (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint connector_kill_switch_scope check (
    scope_key = 'global'
    or scope_key ~ '^adapter:[a-z][a-z0-9-]{1,62}$'
    or scope_key ~ '^connection:[0-9a-f-]{36}$'
  ),
  constraint connector_kill_switch_reason check (length(trim(reason)) > 0)
);

create or replace function public.tg_connector_connection_secrets_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  for v_secret_id in
    select s.vault_secret_id
    from public.connector_connection_secret s
    where s.connection_id = old.id
  loop
    perform vault.delete_secret(v_secret_id);
  end loop;

  return old;
end;
$$;

create trigger connector_connection_secrets_cleanup
  before delete on public.connector_connection
  for each row execute function public.tg_connector_connection_secrets_cleanup();

create or replace function public.tg_connector_event_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Connector event envelopes are immutable.'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger connector_event_immutable
  before update or delete on public.connector_event
  for each row execute function public.tg_connector_event_immutable();

insert into public.connector_adapter (id, family, vertical, version, manifest, state)
values (
  'mock-supplier',
  'supplier',
  'test',
  '1.0.0',
  '{"family":"supplier","version":"1.0.0","capabilities":{"runtime.echo":{"supported":true}},"simulation_only":true}'::jsonb,
  'sandbox'
)
on conflict (id) do nothing;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('connector.connection_created', 'connectors', 'notice', false, false, false, '{}', 'Connector connection created'),
  ('connector.connection_consented', 'connectors', 'notice', false, false, false, '{}', 'Connector capabilities accepted'),
  ('connector.connection_state_changed', 'connectors', 'notice', false, false, false, '{}', 'Connector connection state changed'),
  ('connector.secret_stored', 'connectors', 'high', true, false, false, '{}', 'Connector secret stored in Vault'),
  ('connector.outbox_enqueued', 'connectors', 'info', false, false, false, '{}', 'Connector operation queued'),
  ('connector.outbox_completed', 'connectors', 'notice', false, false, false, '{}', 'Connector operation processed'),
  ('connector.kill_switch_changed', 'connectors', 'high', true, false, false, '{}', 'Connector kill switch changed')
on conflict (action) do nothing;

alter table public.connector_adapter enable row level security;
alter table public.connector_connection enable row level security;
alter table public.connector_connection_consent enable row level security;
alter table public.connector_connection_secret enable row level security;
alter table public.connector_outbox enable row level security;
alter table public.connector_event enable row level security;
alter table public.connector_run enable row level security;
alter table public.connector_dlq enable row level security;
alter table public.connector_kill_switch enable row level security;

revoke all on public.connector_adapter,
  public.connector_connection,
  public.connector_connection_consent,
  public.connector_connection_secret,
  public.connector_outbox,
  public.connector_event,
  public.connector_run,
  public.connector_dlq,
  public.connector_kill_switch
from public, anon, authenticated, service_role;

create or replace function public.rpc_connector_connection_create(
  p_adapter_id text,
  p_merchant_id uuid,
  p_branch_id uuid,
  p_created_by_user uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection_id uuid;
  v_adapter public.connector_adapter;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the connector service may create connections.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_adapter
  from public.connector_adapter
  where id = p_adapter_id and state = 'sandbox';

  if not found then
    raise exception 'That adapter is not enabled for sandbox connections.'
      using errcode = '22023';
  end if;

  if v_adapter.family <> 'supplier' then
    raise exception 'The initial connector runtime only creates sandbox supplier connections.'
      using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.merchant_branch b
    where b.id = p_branch_id and b.merchant_id = p_merchant_id
  ) then
    raise exception 'The branch does not belong to the selected merchant.'
      using errcode = '22023';
  end if;

  if p_merchant_id is null or p_created_by_user is null or not exists (
    select 1 from public.merchant_user mu
    where mu.merchant_id = p_merchant_id and mu.user_id = p_created_by_user
  ) then
    raise exception 'A merchant member must create the supplier connection.'
      using errcode = '22023';
  end if;

  insert into public.connector_connection (
    adapter_id, merchant_id, branch_id, environment, manifest, created_by_user
  )
  values (
    p_adapter_id, p_merchant_id, p_branch_id, 'sandbox', v_adapter.manifest, p_created_by_user
  )
  returning id into v_connection_id;

  perform audit.log(
    'system'::public.actor_type, 'connectors', 'connector.connection_created',
    p_target_type => 'connector_connection', p_target_id => v_connection_id,
    p_after => jsonb_build_object(
      'adapter_id', p_adapter_id, 'merchant_id', p_merchant_id,
      'branch_id', p_branch_id, 'environment', 'sandbox'
    )
  );

  return v_connection_id;
end;
$$;

create or replace function public.rpc_connector_consent_record(
  p_connection_id uuid,
  p_capabilities jsonb,
  p_agreed_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.connector_connection;
  v_consent_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the connector service may record connection consent.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_connection
  from public.connector_connection
  where id = p_connection_id
  for update;

  if not found or v_connection.state not in ('draft', 'authorising', 'handshaking')
     or p_agreed_by is null or jsonb_typeof(p_capabilities) <> 'object'
     or p_capabilities is distinct from v_connection.manifest -> 'capabilities'
     or not exists (
       select 1 from public.merchant_user mu
       where mu.merchant_id = v_connection.merchant_id
         and mu.user_id = p_agreed_by
     ) then
    raise exception 'A connection, consenting user, and capability list are required.'
      using errcode = '22023';
  end if;

  insert into public.connector_connection_consent (
    connection_id, capabilities, agreed_by, manifest_version
  )
  values (
    v_connection.id, p_capabilities, p_agreed_by,
    v_connection.manifest ->> 'version'
  )
  returning id into v_consent_id;

  perform audit.log(
    'system'::public.actor_type, 'connectors', 'connector.connection_consented',
    p_target_type => 'connector_connection', p_target_id => v_connection.id,
    p_after => jsonb_build_object(
      'consent_id', v_consent_id, 'capabilities', p_capabilities,
      'agreed_by', p_agreed_by, 'manifest_version', v_connection.manifest ->> 'version'
    )
  );

  return v_consent_id;
end;
$$;

create or replace function public.rpc_connector_transition(
  p_connection_id uuid,
  p_next_state public.connector_connection_state,
  p_reason text default null
)
returns public.connector_connection_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.connector_connection;
  v_allowed boolean;
  v_secret_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the connector service may transition a connection.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_connection
  from public.connector_connection
  where id = p_connection_id
  for update;

  if not found then
    raise exception 'That connector connection does not exist.'
      using errcode = '22023';
  end if;

  select exists (
    select 1
    from (values
      ('draft', 'authorising'),
      ('authorising', 'handshaking'),
      ('authorising', 'degraded'),
      ('handshaking', 'operational'),
      ('handshaking', 'degraded'),
      ('operational', 'degraded'),
      ('operational', 'disconnected'),
      ('operational', 'suspended'),
      ('degraded', 'operational'),
      ('degraded', 'disconnected'),
      ('degraded', 'suspended'),
      ('disconnected', 'authorising'),
      ('disconnected', 'revoked'),
      ('suspended', 'operational'),
      ('suspended', 'disconnected'),
      ('suspended', 'revoked')
    ) as allowed(from_state, to_state)
    where allowed.from_state = v_connection.state::text
      and allowed.to_state = p_next_state::text
  ) into v_allowed;

  if not v_allowed then
    raise exception 'That connection state change is not allowed (% to %).',
      v_connection.state, p_next_state
      using errcode = '22023';
  end if;

  if p_next_state = 'degraded' and nullif(trim(p_reason), '') is null then
    raise exception 'A reason is required when degrading a connection.'
      using errcode = '22023';
  end if;

  if p_next_state = 'operational' and not exists (
    select 1 from public.connector_connection_consent c
    where c.connection_id = v_connection.id
      and c.manifest_version = v_connection.manifest ->> 'version'
  ) then
    raise exception 'Record consent for the current adapter capabilities before activating the connection.'
      using errcode = 'check_violation';
  end if;

  update public.connector_connection
  set state = p_next_state, updated_at = now(),
      last_error = case when p_next_state = 'degraded' then nullif(trim(p_reason), '') else null end
  where id = v_connection.id;

  if p_next_state in ('disconnected', 'revoked') then
    for v_secret_id in
      select s.vault_secret_id
      from public.connector_connection_secret s
      where s.connection_id = v_connection.id
    loop
      perform vault.delete_secret(v_secret_id);
    end loop;
    delete from public.connector_connection_secret s
    where s.connection_id = v_connection.id;
  end if;

  perform audit.log(
    'system'::public.actor_type, 'connectors', 'connector.connection_state_changed',
    p_target_type => 'connector_connection', p_target_id => v_connection.id,
    p_before => jsonb_build_object('state', v_connection.state),
    p_after => jsonb_build_object('state', p_next_state),
    p_reason => p_reason
  );

  return p_next_state;
end;
$$;

create or replace function public.rpc_connector_secret_store(
  p_connection_id uuid,
  p_name text,
  p_secret text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.connector_connection;
  v_secret_id uuid;
  v_fingerprint text;
  v_secret_name text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the connector service may write secrets to Vault.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_name is null or p_secret is null or length(p_secret) = 0 or length(p_secret) > 8192
     or p_name !~ '^[a-z][a-z0-9_]{0,62}$' then
    raise exception 'A valid secret name and non-empty secret are required.'
      using errcode = '22023';
  end if;

  select * into v_connection
  from public.connector_connection
  where id = p_connection_id
  for update;

  if not found or v_connection.environment <> 'sandbox'
     or v_connection.state not in ('authorising', 'handshaking', 'operational', 'degraded') then
    raise exception 'Secrets may only be attached to an existing sandbox connection.'
      using errcode = '22023';
  end if;

  v_secret_name := 'connector:' || p_connection_id::text || ':' || p_name;
  v_fingerprint := encode(extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256'), 'hex');

  select s.vault_secret_id into v_secret_id
  from public.connector_connection_secret s
  where s.connection_id = p_connection_id and s.name = p_name
  for update;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_secret, v_secret_name, 'Connector sandbox credential');
    insert into public.connector_connection_secret (
      connection_id, name, vault_secret_id, fingerprint
    ) values (
      p_connection_id, p_name, v_secret_id, v_fingerprint
    );
  else
    perform vault.update_secret(v_secret_id, p_secret, v_secret_name, 'Connector sandbox credential');
    update public.connector_connection_secret
    set fingerprint = v_fingerprint, updated_at = now()
    where connection_id = p_connection_id and name = p_name;
  end if;

  perform audit.log(
    'system'::public.actor_type, 'connectors', 'connector.secret_stored',
    p_target_type => 'connector_connection', p_target_id => p_connection_id,
    p_after => jsonb_build_object('name', p_name, 'vault_secret_id', v_secret_id)
  );

  return v_secret_id;
end;
$$;

create or replace function public.rpc_connector_outbox_enqueue(
  p_connection_id uuid,
  p_operation text,
  p_payload jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_connection public.connector_connection;
  v_adapter public.connector_adapter;
  v_payload_hash text;
  v_outbox_id uuid;
  v_existing_hash text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the connector service may enqueue adapter operations.'
      using errcode = 'insufficient_privilege';
  end if;

  select c.* into v_connection
  from public.connector_connection c
  join public.connector_adapter a on a.id = c.adapter_id
  where c.id = p_connection_id and a.state = 'sandbox' and a.family = 'supplier'
  for update of c;

  if not found or v_connection.state <> 'operational' then
    raise exception 'Only operational sandbox connections accept queued work.'
      using errcode = 'check_violation';
  end if;

  select * into v_adapter from public.connector_adapter where id = v_connection.adapter_id;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_operation is null
     or p_operation !~ '^[a-z][a-z0-9_.]{1,95}$'
     or (v_adapter.manifest -> 'capabilities' -> p_operation ->> 'supported') is distinct from 'true'
     or octet_length(p_payload::text) > 65536
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 16 and 128 then
    raise exception 'The operation, payload, or idempotency key is invalid for this adapter.'
      using errcode = '22023';
  end if;

  v_payload_hash := encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex');

  select o.id, o.payload_hash into v_outbox_id, v_existing_hash
  from public.connector_outbox o
  where o.connection_id = p_connection_id
    and o.idempotency_key = p_idempotency_key;

  if v_outbox_id is not null then
    if v_existing_hash <> v_payload_hash then
      raise exception 'An idempotency key cannot be reused with a different payload.'
        using errcode = 'unique_violation';
    end if;
    return v_outbox_id;
  end if;

  if exists (
    select 1 from public.connector_kill_switch k
    where (k.pause_writes or k.pause_all)
      and (
        k.scope_key = 'global'
        or k.scope_key = 'adapter:' || v_connection.adapter_id
        or k.scope_key = 'connection:' || v_connection.id::text
      )
  ) then
    raise exception 'Connector work is paused by an active kill switch.'
      using errcode = 'check_violation';
  end if;

  insert into public.connector_outbox (
    connection_id, operation, payload, payload_hash, idempotency_key
  )
  values (
    p_connection_id, p_operation, p_payload, v_payload_hash, p_idempotency_key
  )
  on conflict (connection_id, idempotency_key) do nothing
  returning id into v_outbox_id;

  if v_outbox_id is null then
    select o.id, o.payload_hash into v_outbox_id, v_existing_hash
    from public.connector_outbox o
    where o.connection_id = p_connection_id
      and o.idempotency_key = p_idempotency_key;

    if v_existing_hash <> v_payload_hash then
      raise exception 'An idempotency key cannot be reused with a different payload.'
        using errcode = 'unique_violation';
    end if;
    return v_outbox_id;
  end if;

  perform audit.log(
    'system'::public.actor_type, 'connectors', 'connector.outbox_enqueued',
    p_target_type => 'connector_outbox', p_target_id => v_outbox_id,
    p_after => jsonb_build_object(
      'connection_id', p_connection_id, 'operation', p_operation,
      'payload_hash', v_payload_hash
    )
  );

  return v_outbox_id;
end;
$$;

create or replace function public.rpc_connector_outbox_claim(
  p_limit integer,
  p_lease_seconds integer
)
returns table (
  outbox_id uuid,
  connection_id uuid,
  adapter_id text,
  operation text,
  payload jsonb,
  idempotency_key text,
  attempts integer,
  lease_token uuid,
  manifest jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the connector worker may claim queued operations.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 100
     or p_lease_seconds is null or p_lease_seconds < 1 or p_lease_seconds > 3600 then
    raise exception 'A bounded claim size and lease duration are required.'
      using errcode = '22023';
  end if;

  return query
  with candidates as (
    select o.id
    from public.connector_outbox o
    join public.connector_connection c on c.id = o.connection_id
    join public.connector_adapter a on a.id = c.adapter_id
    where c.state = 'operational'
      and c.environment = 'sandbox'
      and a.state = 'sandbox'
      and (o.state in ('queued', 'retry') and o.next_attempt_at <= now()
        or o.state = 'leased' and o.lease_until < now())
      and not exists (
        select 1 from public.connector_kill_switch k
        where k.pause_all
          and (
            k.scope_key = 'global'
            or k.scope_key = 'adapter:' || c.adapter_id
            or k.scope_key = 'connection:' || c.id::text
          )
      )
      and not exists (
        select 1 from public.connector_kill_switch k
        where k.pause_writes
          and (
            k.scope_key = 'global'
            or k.scope_key = 'adapter:' || c.adapter_id
            or k.scope_key = 'connection:' || c.id::text
          )
      )
    order by o.next_attempt_at, o.created_at
    limit p_limit
    for update of o skip locked
  ),
  leased as (
    update public.connector_outbox o
    set state = 'leased',
        attempts = o.attempts + 1,
        lease_token = gen_random_uuid(),
        lease_until = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    from candidates c
    where o.id = c.id
    returning o.*
  )
  select l.id, l.connection_id, c.adapter_id, l.operation, l.payload,
    l.idempotency_key, l.attempts, l.lease_token, c.manifest
  from leased l
  join public.connector_connection c on c.id = l.connection_id;
end;
$$;

create or replace function public.rpc_connector_outbox_finish(
  p_outbox_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_result jsonb,
  p_error_code text,
  p_retryable boolean,
  p_max_attempts integer,
  p_base_delay_seconds integer,
  p_elapsed_ms integer
)
returns public.connector_job_state
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.connector_outbox;
  v_state public.connector_job_state;
  v_delay_seconds integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the connector worker may finish queued operations.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object'
     or p_succeeded is null or p_retryable is null
     or p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 20
     or p_base_delay_seconds is null or p_base_delay_seconds < 1
     or p_elapsed_ms is null or p_elapsed_ms < 0 then
    raise exception 'A result and explicit bounded retry policy are required.'
      using errcode = '22023';
  end if;

  select * into v_job
  from public.connector_outbox
  where id = p_outbox_id
  for update;

  if not found or v_job.state <> 'leased' or v_job.lease_token <> p_lease_token then
    raise exception 'The outbox lease is no longer valid.'
      using errcode = '40001';
  end if;

  if p_succeeded then
    v_state := 'delivered';
    update public.connector_outbox
    set state = v_state, delivered_at = now(), lease_token = null,
        lease_until = null, last_error_code = null, updated_at = now()
    where id = v_job.id;
  elsif p_retryable and v_job.attempts < p_max_attempts then
    v_state := 'retry';
    v_delay_seconds := greatest(1, floor(
      least(
        p_base_delay_seconds::numeric * power(2::numeric, least(v_job.attempts - 1, 16)::numeric),
        86400
      ) * (0.8::numeric + random()::numeric * 0.4::numeric)
    )::integer);
    update public.connector_outbox
    set state = v_state, next_attempt_at = now() + make_interval(secs => v_delay_seconds),
        lease_token = null, lease_until = null,
        last_error_code = nullif(left(p_error_code, 120), ''), updated_at = now()
    where id = v_job.id;
  else
    v_state := 'dead';
    update public.connector_outbox
    set state = v_state, lease_token = null, lease_until = null,
        last_error_code = nullif(left(p_error_code, 120), ''), updated_at = now()
    where id = v_job.id;

    insert into public.connector_dlq (outbox_id, connection_id, reason_code)
    values (v_job.id, v_job.connection_id, coalesce(nullif(left(p_error_code, 120), ''), 'unknown_error'))
    on conflict (outbox_id) do nothing;
  end if;

  insert into public.connector_run (
    connection_id, outbox_id, operation, attempt, outcome,
    request_hash, result, error_code, elapsed_ms
  )
  values (
    v_job.connection_id, v_job.id, v_job.operation, v_job.attempts,
    case v_state when 'delivered' then 'succeeded' when 'retry' then 'retrying' else 'dead' end,
    v_job.payload_hash, p_result, nullif(left(p_error_code, 120), ''), p_elapsed_ms
  );

  perform audit.log(
    'system'::public.actor_type, 'connectors', 'connector.outbox_completed',
    p_target_type => 'connector_outbox', p_target_id => v_job.id,
    p_after => jsonb_build_object(
      'state', v_state, 'attempt', v_job.attempts,
      'error_code', nullif(left(p_error_code, 120), '')
    )
  );

  return v_state;
end;
$$;

create or replace function public.rpc_connector_kill_switch_set(
  p_scope_key text,
  p_pause_writes boolean,
  p_pause_all boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Only the connector service may change kill switches.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_scope_key is null or p_reason is null or length(trim(p_reason)) = 0
     or p_pause_writes is null or p_pause_all is null then
    raise exception 'A scope and reason are required to change a kill switch.'
      using errcode = '22023';
  end if;

  select jsonb_build_object('pause_writes', k.pause_writes, 'pause_all', k.pause_all, 'reason', k.reason)
  into v_before
  from public.connector_kill_switch k
  where k.scope_key = p_scope_key;

  insert into public.connector_kill_switch (scope_key, pause_writes, pause_all, reason)
  values (p_scope_key, p_pause_writes, p_pause_all, p_reason)
  on conflict (scope_key) do update
  set pause_writes = excluded.pause_writes,
      pause_all = excluded.pause_all,
      reason = excluded.reason,
      updated_by = null,
      updated_at = now();

  perform audit.log(
    'system'::public.actor_type, 'connectors', 'connector.kill_switch_changed',
    p_target_type => 'connector_kill_switch',
    p_before => v_before,
    p_after => jsonb_build_object(
      'scope_key', p_scope_key, 'pause_writes', p_pause_writes,
      'pause_all', p_pause_all, 'reason', p_reason
    ),
    p_reason => p_reason
  );
end;
$$;

revoke execute on function public.rpc_connector_connection_create(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_connector_consent_record(uuid, jsonb, uuid) from public, anon, authenticated;
revoke execute on function public.rpc_connector_transition(uuid, public.connector_connection_state, text) from public, anon, authenticated;
revoke execute on function public.rpc_connector_secret_store(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.rpc_connector_outbox_enqueue(uuid, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.rpc_connector_outbox_claim(integer, integer) from public, anon, authenticated;
revoke execute on function public.rpc_connector_outbox_finish(uuid, uuid, boolean, jsonb, text, boolean, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.rpc_connector_kill_switch_set(text, boolean, boolean, text) from public, anon, authenticated;

grant execute on function public.rpc_connector_connection_create(text, uuid, uuid, uuid) to service_role;
grant execute on function public.rpc_connector_consent_record(uuid, jsonb, uuid) to service_role;
grant execute on function public.rpc_connector_transition(uuid, public.connector_connection_state, text) to service_role;
grant execute on function public.rpc_connector_secret_store(uuid, text, text) to service_role;
grant execute on function public.rpc_connector_outbox_enqueue(uuid, text, jsonb, text) to service_role;
grant execute on function public.rpc_connector_outbox_claim(integer, integer) to service_role;
grant execute on function public.rpc_connector_outbox_finish(uuid, uuid, boolean, jsonb, text, boolean, integer, integer, integer) to service_role;
grant execute on function public.rpc_connector_kill_switch_set(text, boolean, boolean, text) to service_role;
