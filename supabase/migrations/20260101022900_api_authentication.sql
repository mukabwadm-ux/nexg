-- API keys and OAuth clients for api.nexgapp.com
--
-- Two ways for the outside world to hold a credential against NexG:
--
-- 1. API keys. A secret in a header, scoped to what it can do. Good for
--    server-to-server work, scripts, and the quick-start.
--
-- 2. OAuth 2.0. Authorization code flow with scopes, for partner apps that
--    act on behalf of a merchant or a guest. Access tokens are short-lived,
--    refresh tokens longer, and both are revocable.
--
-- The scoping question this table has to answer: "whose data does this
-- credential see?" The answer is a merchant. A merchant is the unit of
-- business in this system -- it has branches, catalogue items, orders and
-- settlements -- so a credential scoped to a merchant is scoped to something
-- that actually exists and that staff already reason about.
--
-- A key with no merchant is a platform key: it sees public catalog data
-- only, and cannot see any merchant's private records. That is the
-- default, and it is why creating a key is not by itself a way to see
-- anything private.

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• the scope

-- What a credential is allowed to do.
--
-- Deliberately small. Every scope here corresponds to a line of business,
-- and a scope that is invented per endpoint is a scope no client can rely
-- on. `public_read` is the one a new integration asks for.
create type public.api_credential_scope as enum (
  'public_read',    -- The public catalog: merchants, zones, experiences.
  'merchant_read',  -- One merchant's own records: orders, catalogue, settlement.
  'merchant_write', -- Act on behalf of that merchant: update the catalogue, acknowledge orders.
  'internal_read',  -- Staff-level reads across the platform.
  'internal_write'  -- Staff-level writes. Every one is audited.
);

comment on type public.api_credential_scope is
  'What an API credential may do. merchant_* is bound to one merchant; internal_* is bound to the audit chain.';

-- The state of a credential.
create type public.api_credential_state as enum ('active', 'revoked', 'expired');

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• API keys

create table public.api_key (
  id uuid primary key default gen_random_uuid(),
  /*
   * Whose records this key may read. Null for a platform key, which sees
   * public data only. It points at public.merchant because that is the
   * unit of business: a merchant owns branches, a catalogue, orders and
   * a settlement, and a credential scoped to one is scoped to something
   * a person can be shown.
   */
  merchant_id uuid references public.merchant (id) on delete cascade,
  /*
   * The key is stored as a hash and only ever compared as a hash. The
   * raw key is returned once, at creation, and never again -- so a
   * leaked database cannot be replayed against the API.
   */
  key_hash text not null unique,
  /*
   * The first few characters of the raw key, so a person looking at a
   * list of keys can tell which is which without the secret being
   * recoverable from what is stored.
   */
  key_prefix text not null,
  /* What the key may do. */
  scopes public.api_credential_scope[] not null default '{public_read}',
  /* Requests per minute. */
  rate_limit integer not null default 60,
  state public.api_credential_state not null default 'active',
  created_at timestamptz not null default now(),
  created_by uuid references public.staff_user (id) on delete set null,
  /* The owner, when the key was made by the merchant rather than by staff. */
  created_by_user uuid references auth.users (id) on delete set null,
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.staff_user (id) on delete set null,
  revoke_reason text,

  constraint api_key_scopes_not_empty check (array_length(scopes, 1) > 0),
  constraint api_key_rate_limit_positive check (rate_limit > 0),
  constraint api_key_prefix_is_short check (length(key_prefix) between 4 and 16),
  /*
   * A key that can see a merchant's records must name that merchant.
   * Without this, a key with merchant_read and no merchant_id would
   * be a key that reads every merchant -- which is exactly the sort of
   * thing a scope list should never be able to express.
   */
  constraint api_key_merchant_scope_is_bound check (
    merchant_id is not null
    or not (scopes && array['merchant_read','merchant_write']::public.api_credential_scope[])
  ),
  /*
   * Internal scopes are staff-only. A self-service key must never be
   * able to grant itself the reach of the staff console.
   */
  constraint api_key_internal_scope_is_staff_only check (
    created_by is not null
    or not (scopes && array['internal_read','internal_write']::public.api_credential_scope[])
  )
);

create index api_key_merchant_idx on public.api_key (merchant_id) where state = 'active';
create index api_key_hash_idx on public.api_key (key_hash);

comment on table public.api_key is
  'API keys for api.nexgapp.com. The raw key is shown once at creation and stored only as a SHA-256 hash.';

comment on column public.api_key.key_prefix is
  'The first 8 characters of the raw key, for identifying a key in a list without storing the secret.';

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• OAuth

-- An application that may ask a merchant or a guest to authorize it.
create table public.oauth_client (
  id uuid primary key default gen_random_uuid(),
  -- Whose records this client may act on. Null for a platform client.
  merchant_id uuid references public.merchant (id) on delete cascade,
  -- The public half of the credential. It appears in URLs.
  client_id text not null unique,
  -- The secret half, stored as a hash for the same reason the API key is.
  client_secret_hash text not null,
  -- What this application is, for the consent screen.
  name text not null,
  -- Where the authorization server may send the user back to. Exact
  -- matches only: a redirect URI that is a prefix of a registered one
  -- is how an authorization code ends up somewhere it should not.
  redirect_uris text[] not null,
  -- The scopes this client is allowed to ask for.
  allowed_scopes text[] not null default '{read:catalog}',
  rate_limit integer not null default 100,
  state public.api_credential_state not null default 'active',
  created_at timestamptz not null default now(),
  created_by uuid references public.staff_user (id) on delete set null,
  revoked_at timestamptz,

  constraint oauth_client_redirect_uris_not_empty check (array_length(redirect_uris, 1) > 0),
  constraint oauth_client_rate_limit_positive check (rate_limit > 0)
);

create index oauth_client_merchant_idx on public.oauth_client (merchant_id) where state = 'active';

comment on table public.oauth_client is
  'OAuth 2.0 clients for partner applications. redirect_uris are matched exactly, never by prefix.';

-- A short-lived code, exchanged once for tokens.
create table public.oauth_authorization_code (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_client (id) on delete cascade,
  -- Who authorized this. A merchant user, a guest, or a staff member.
  subject_id uuid not null,
  subject_type public.actor_type not null,
  -- The code itself, hashed like every other secret here.
  code_hash text not null unique,
  -- The scopes that were actually granted, which may be fewer than asked for.
  scopes text[] not null,
  -- The redirect URI this code was issued against, and must be presented with.
  redirect_uri text not null,
  -- PKCE, for applications that cannot keep a secret.
  code_challenge text,
  code_challenge_method text,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,

  constraint oauth_code_expires_in_the_future check (expires_at > created_at)
);

create index oauth_code_hash_idx on public.oauth_authorization_code (code_hash);

comment on table public.oauth_authorization_code is
  'One-time authorization codes. Ten minutes to redeem, then spent.';

-- An access token: short-lived, hashed at rest.
create table public.oauth_access_token (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_client (id) on delete cascade,
  subject_id uuid not null,
  subject_type public.actor_type not null,
  token_hash text not null unique,
  scopes text[] not null,
  expires_at timestamptz not null default (now() + interval '1 hour'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index oauth_access_token_hash_idx on public.oauth_access_token (token_hash);
create index oauth_access_token_subject_idx on public.oauth_access_token (subject_id, subject_type);

-- A refresh token: longer-lived, revocable, and only ever buys new access.
create table public.oauth_refresh_token (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.oauth_client (id) on delete cascade,
  subject_id uuid not null,
  subject_type public.actor_type not null,
  token_hash text not null unique,
  scopes text[] not null,
  -- A rotation family: when a refresh token is used, its sibling is revoked.
  -- A stolen refresh token is then usable at most once, and the theft
  -- shows up as the legitimate client being refused.
  family_id uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index oauth_refresh_token_hash_idx on public.oauth_refresh_token (token_hash);
create index oauth_refresh_token_family_idx on public.oauth_refresh_token (family_id);

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• rate limiting

-- A count of what each key has spent this minute.
--
-- In the database rather than in memory because the API runs on more than
-- one process, and a limit enforced in one process's memory is a limit
-- of one process's worth of traffic.
create table public.api_rate_window (
  key_id uuid not null references public.api_key (id) on delete cascade,
  -- The minute, truncated. One row per key per minute.
  window_start timestamptz not null,
  used integer not null default 0,
  primary key (key_id, window_start)
);

comment on table public.api_rate_window is
  'Per-key request counts, one row per key per minute. The counter is reset by truncation, not by a job.';

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• the functions

-- Issue a new API key. Returns the raw key exactly once.
create or replace function public.fn_api_key_issue(
  p_merchant_id uuid default null,
  p_scopes public.api_credential_scope[] default '{public_read}',
  p_rate_limit integer default 60,
  p_expires_at timestamptz default null,
  p_created_by uuid default null,
  p_created_by_user uuid default null
)
returns table (raw_key text, key_id uuid, key_prefix text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw text;
  v_hash text;
  v_prefix text;
  v_id uuid;
begin
  /*
   * 32 random bytes, base64url. The characters that would need quoting
   * in a header are removed rather than escaped, so the key can be
   * pasted into curl without ceremony.
   */
  v_raw := encode(gen_random_bytes(32), 'base64');
  v_raw := replace(replace(replace(v_raw, '+', '-'), '/', '_'), '=', '');

  v_hash := encode(sha256(convert_to(v_raw, 'UTF8')), 'hex');
  v_prefix := left(v_raw, 8);

  insert into public.api_key (
    merchant_id, key_hash, key_prefix, scopes, rate_limit,
    expires_at, created_by, created_by_user
  ) values (
    p_merchant_id, v_hash, v_prefix, p_scopes, p_rate_limit,
    p_expires_at, p_created_by, p_created_by_user
  )
  returning id into v_id;

  return query select v_raw, v_id, v_prefix;
end;
$$;

comment on function public.fn_api_key_issue is
  'Issue an API key. The raw key is returned once and is not recoverable afterwards.';

-- Look up a key by its raw value.
--
-- Returns nothing for a key that is revoked, expired, or unknown, and the
-- caller cannot tell those apart -- which is the point. Whether a key
-- exists is not something an unauthenticated caller gets to learn.
create or replace function public.fn_api_key_lookup(p_raw_key text)
returns table (
  key_id uuid,
  merchant_id uuid,
  scopes public.api_credential_scope[],
  rate_limit integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.merchant_id, k.scopes, k.rate_limit
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_raw_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now())
$$;

comment on function public.fn_api_key_lookup is
  'Resolve a raw API key to its scopes. Returns no row for a revoked, expired or unknown key.';

-- Count one request against a key's minute.
--
-- Returns false when the key is over its limit. The increment and the
-- check are one statement, so two requests arriving at once cannot both
-- see the counter below the limit and both be let through.
create or replace function public.fn_api_key_spend(
  p_key_id uuid,
  p_limit integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('minute', now());
  v_used integer;
begin
  insert into public.api_rate_window (key_id, window_start, used)
  values (p_key_id, v_window, 1)
  on conflict (key_id, window_start)
  do update set used = public.api_rate_window.used + 1
  returning used into v_used;

  if v_used > p_limit then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.fn_api_key_spend is
  'Count a request against a key and say whether it is within the limit. One statement, so concurrent requests cannot both slip past the limit.';

-- Revoke a key.
--
-- An RPC, so that the wiring check sees it writes state, and so that it
-- can be the one place that decides who may revoke what.
create or replace function public.rpc_api_key_revoke(
  p_key_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant_id uuid;
  v_staff uuid;
begin
  select k.merchant_id into v_merchant_id
  from public.api_key k where k.id = p_key_id;

  v_staff := authz.staff_id();

  -- Staff may revoke anything. A merchant may revoke its own.
  if v_staff is null then
    if v_merchant_id is null or not authz.is_merchant_member(v_merchant_id) then
      raise exception 'Not allowed to revoke this key.' using errcode = '42501';
    end if;
  end if;

  update public.api_key
  set
    state = 'revoked',
    revoked_at = now(),
    revoked_by = v_staff,
    revoke_reason = p_reason
  where id = p_key_id and state = 'active';

  perform audit.log(
    p_actor_type => case when v_staff is not null then 'staff'::public.actor_type else 'merchant_user'::public.actor_type end,
    p_module => 'api',
    p_action => 'api.key_revoked',
    p_actor_id => v_staff,
    p_target_type => 'api_key',
    p_target_id => p_key_id,
    p_reason => p_reason
  );

  return true;
end;
$$;

comment on function public.rpc_api_key_revoke is
  'Revoke an API key. Staff may revoke any key; a merchant may revoke its own. Audited.';

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• RLS

alter table public.api_key enable row level security;
alter table public.oauth_client enable row level security;
alter table public.oauth_authorization_code enable row level security;
alter table public.oauth_access_token enable row level security;
alter table public.oauth_refresh_token enable row level security;
alter table public.api_rate_window enable row level security;

-- A key list is staff-only. A merchant sees the keys of their own business.
create policy api_key_read on public.api_key
  for select to authenticated
  using (
    authz.staff_id() is not null
    or (merchant_id is not null and authz.is_merchant_member(merchant_id))
  );

-- Only staff may write to the key table directly. Everything else goes
-- through the functions above, which decide who is allowed to.
create policy api_key_staff_write on public.api_key
  for all to authenticated
  using (authz.staff_id() is not null)
  with check (authz.staff_id() is not null);

create policy oauth_client_read on public.oauth_client
  for select to authenticated
  using (
    authz.staff_id() is not null
    or (merchant_id is not null and authz.is_merchant_member(merchant_id))
  );

create policy oauth_client_staff_write on public.oauth_client
  for all to authenticated
  using (authz.staff_id() is not null)
  with check (authz.staff_id() is not null);

-- The token tables have no policy on purpose: no one reads them through
-- PostgREST. They are only ever reached through the functions that need
-- them, which run as definer.

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• audit

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('api.key_issued', 'api', 'notice', false, false, false, '{}', 'An API key was issued'),
  ('api.key_revoked', 'api', 'notice', false, false, false, '{}', 'An API key was revoked'),
  ('api.oauth_client_created', 'api', 'notice', false, false, false, '{}', 'An OAuth client was registered')
on conflict (action) do nothing;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• wiring

-- The lookup and the counter are callable by the anon key, because the API
-- server itself authenticates with the anon key. What they expose is a
-- scope list and a boolean, and only in exchange for a secret that is
-- already hashed.
insert into wiring_anon_allow (function_name, reason, guarded_by)
values
  ('fn_api_key_lookup', 'The API server resolves an X-Api-Key header with the anon key', 'returns nothing unless the sha256 hash matches an active, unexpired key'),
  ('fn_api_key_spend', 'The API server counts a request against a key', 'the key id must already exist; this only increments a counter')
on conflict (function_name) do nothing;

/*
 * Issuing a key and revoking one are not things the anonymous key may
 * do. Supabase grants EXECUTE on every new function in `public` to
 * `anon` by default, so the grant has to be taken back explicitly --
 * otherwise anybody with the browser key can mint themselves a
 * merchant_write key.
 */
revoke execute on function public.fn_api_key_issue(uuid, public.api_credential_scope[], integer, timestamptz, uuid, uuid) from public, anon;
revoke execute on function public.rpc_api_key_revoke(uuid, text) from public, anon;
grant execute on function public.fn_api_key_issue(uuid, public.api_credential_scope[], integer, timestamptz, uuid, uuid) to authenticated, service_role;
grant execute on function public.rpc_api_key_revoke(uuid, text) to authenticated, service_role;