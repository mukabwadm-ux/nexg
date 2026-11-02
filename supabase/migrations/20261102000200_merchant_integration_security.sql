-- Apply after 20261102000100. Existing credential hashes remain valid.
-- Machine authorization uses current merchant state, never a human session.

-- A staff row alone must not permit forging keys or internal scopes directly.
drop policy if exists api_key_staff_write on public.api_key;
revoke insert, update, delete on public.api_key from anon, authenticated;

create or replace function public.fn_api_key_issue(
  p_merchant_id uuid default null,
  p_scopes public.api_credential_scope[] default '{public_read}',
  p_rate_limit integer default 60,
  p_expires_at timestamptz default null,
  p_created_by uuid default null,
  p_created_by_user uuid default null
)
returns table (raw_key text, key_id uuid, key_prefix text)
language plpgsql security definer set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_user uuid := auth.uid();
  v_staff uuid := authz.staff_id();
  v_city uuid;
  v_owner boolean := false;
  v_manager boolean := false;
  v_internal boolean := false;
  v_raw text;
  v_id uuid;
begin
  perform authz.require_merchant_application_session();
  if v_user is null
    or (p_created_by_user is not null and p_created_by_user is distinct from v_user)
    or (p_created_by is not null and p_created_by is distinct from v_staff) then
    raise exception 'Not allowed to issue this credential.' using errcode = '42501';
  end if;
  if p_scopes is null or cardinality(p_scopes) not between 1 and 5
    or array_position(p_scopes, null) is not null
    or p_rate_limit is null or p_rate_limit not between 10 and 600
    or (p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '366 days')) then
    raise exception 'Invalid credential policy.' using errcode = '22023';
  end if;

  -- Internal issuance requires a current global super-admin grant. A city
  -- grant or caller-supplied staff id cannot widen authority.
  select exists (
    select 1 from public.role_grant rg join public.role r on r.id = rg.role_id
    where rg.staff_user_id = v_staff and r.key = 'super_admin'
      and rg.city_id is null and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at > now())
  ) into v_internal;
  if p_scopes && array['internal_read','internal_write']::public.api_credential_scope[]
    and not v_internal then
    raise exception 'Internal credentials require global administration.' using errcode = '42501';
  end if;

  if p_merchant_id is not null then
    select m.city_id into v_city from public.merchant m where m.id = p_merchant_id;
    if not found then
      raise exception 'Not allowed to issue this credential.' using errcode = '42501';
    end if;
    select exists (
      select 1 from public.merchant_user mu where mu.merchant_id = p_merchant_id
        and mu.user_id = v_user and mu.role = 'owner'
    ) into v_owner;
    select exists (
      select 1 from public.role_grant rg join public.role r on r.id = rg.role_id
      where rg.staff_user_id = v_staff and r.key in ('super_admin','merchant_ops')
        and (rg.city_id is null or rg.city_id = v_city)
        and rg.revoked_at is null and (rg.expires_at is null or rg.expires_at > now())
    ) into v_manager;
    if not (v_owner or v_manager) then
      raise exception 'Not allowed to issue this credential.' using errcode = '42501';
    end if;
  elsif p_scopes && array['merchant_read','merchant_write']::public.api_credential_scope[] then
    raise exception 'Merchant scopes require a merchant.' using errcode = '22023';
  end if;

  -- Two built-in cryptographic UUIDs provide 244 random bits without relying
  -- on the installation schema of the optional pgcrypto extension.
  v_raw := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.api_key (
    merchant_id, key_hash, key_prefix, scopes, rate_limit,
    expires_at, created_by, created_by_user
  ) values (
    p_merchant_id, encode(sha256(convert_to(v_raw, 'UTF8')), 'hex'), left(v_raw, 8),
    p_scopes, p_rate_limit, p_expires_at, v_staff, v_user
  ) returning id into v_id;
  perform audit.log(
    p_actor_type => case when v_staff is null then 'merchant_user'::public.actor_type else 'staff'::public.actor_type end,
    p_actor_id => coalesce(v_staff, v_user), p_module => 'api', p_action => 'api.key_issued',
    p_target_type => 'api_key', p_target_id => v_id,
    p_after => jsonb_build_object('merchant_id', p_merchant_id, 'scopes', p_scopes, 'rate_limit', p_rate_limit)
  );
  return query select v_raw, v_id, left(v_raw, 8);
end;
$$;
revoke all on function public.fn_api_key_issue(uuid, public.api_credential_scope[], integer, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.fn_api_key_issue(uuid, public.api_credential_scope[], integer, timestamptz, uuid, uuid) to authenticated, service_role;

create or replace function public.fn_api_key_lookup(p_raw_key text)
returns table (key_id uuid, merchant_id uuid, scopes public.api_credential_scope[], rate_limit integer)
language sql stable security definer set search_path = ''
set statement_timeout = '5s'
as $$
  select k.id, k.merchant_id, k.scopes, least(k.rate_limit, 600)
  from public.api_key k
  where k.key_hash = case when octet_length(p_raw_key) between 1 and 256
      then encode(sha256(convert_to(p_raw_key, 'UTF8')), 'hex') else null end
    and k.state = 'active' and (k.expires_at is null or k.expires_at > now())
    and (k.merchant_id is null or authz.merchant_workspace_operations_allowed(k.merchant_id))
    and (
      not (k.scopes && array['internal_read','internal_write']::public.api_credential_scope[])
      or exists (
        select 1 from public.staff_user su
        join public.role_grant rg on rg.staff_user_id = su.id
        join public.role r on r.id = rg.role_id
        where su.id = k.created_by and su.status = 'active'
          and r.key = 'super_admin' and rg.city_id is null and rg.revoked_at is null
          and (rg.expires_at is null or rg.expires_at > now())
      )
    )
$$;
revoke all on function public.fn_api_key_lookup(text) from public;
grant execute on function public.fn_api_key_lookup(text) to anon, authenticated, service_role;

create table public.api_rate_bucket (
  principal text primary key check (length(principal) between 1 and 100),
  tokens numeric not null check (tokens >= 0 and tokens <= 600),
  updated_at timestamptz not null
);
alter table public.api_rate_bucket enable row level security;
revoke all on public.api_rate_bucket from public, anon, authenticated;
create index api_rate_bucket_updated_idx on public.api_rate_bucket (updated_at);
create index api_key_user_active_idx on public.api_key (created_by_user) where state = 'active';
create index api_key_staff_active_idx on public.api_key (created_by) where state = 'active';

-- Service-only because a public caller must not select a fresh anonymous IP,
-- operation cost, key id, or limit directly through PostgREST. The server passes
-- a raw key and the database resolves its identity and current authorization.
create function public.fn_api_request_spend(
  p_raw_key text default null,
  p_anonymous_ip text default null,
  p_operation text default 'public_read'
)
returns table (allowed boolean, retry_after integer, remaining integer)
language plpgsql volatile security definer set search_path = ''
set statement_timeout = '5s' set lock_timeout = '2s'
as $$
declare
  v_key public.api_key;
  v_principal text;
  v_principal_user uuid;
  v_refill integer;
  v_capacity integer;
  v_cost integer;
  v_tokens numeric;
  v_updated timestamptz;
  v_now timestamptz;
begin
  v_cost := case p_operation when 'public_read' then 1 when 'merchant_read' then 3 when 'merchant_write' then 5 end;
  if v_cost is null then
    raise exception 'Unsupported API operation.' using errcode = '22023';
  end if;
  if p_raw_key is not null then
    select k.* into v_key from public.api_key k
    join public.fn_api_key_lookup(p_raw_key) usable on usable.key_id = k.id;
    if not found then
      raise exception 'That API key is not valid.' using errcode = '42501';
    end if;
    if not (p_operation::public.api_credential_scope = any(v_key.scopes)) then
      raise exception 'Credential scope denied.' using errcode = '42501';
    end if;
    if v_key.merchant_id is not null then
      v_principal := 'merchant:' || v_key.merchant_id::text;
      select min(k.rate_limit) into v_refill from public.api_key k
      where k.merchant_id = v_key.merchant_id and k.state = 'active'
        and (k.expires_at is null or k.expires_at > now());
    else
      v_principal_user := coalesce(v_key.created_by_user,
        (select su.user_id from public.staff_user su where su.id = v_key.created_by));
      if v_principal_user is not null then
        v_principal := 'user:' || v_principal_user::text;
        select min(k.rate_limit) into v_refill from public.api_key k
        where k.merchant_id is null and k.state = 'active'
          and (k.created_by_user = v_principal_user or (k.created_by_user is null and k.created_by in (
            select su.id from public.staff_user su where su.user_id = v_principal_user
          )))
          and (k.expires_at is null or k.expires_at > now());
      else
        v_principal := 'legacy:platform';
        v_refill := 60;
      end if;
    end if;
  else
    if p_operation <> 'public_read' then
      raise exception 'Credential required.' using errcode = '42501';
    end if;
    if p_anonymous_ip is null then
      v_principal := 'anonymous:shared';
      v_refill := 120;
    else
      -- Canonical inet prevents alternate IPv6 spellings from creating buckets.
      if length(p_anonymous_ip) > 45 or p_anonymous_ip like '%/%' then
        raise exception 'Invalid client address.' using errcode = '22023';
      end if;
      v_principal := 'anonymous:ip:' || encode(sha256(convert_to(host(p_anonymous_ip::inet), 'UTF8')), 'hex');
      v_refill := 60;
    end if;
  end if;
  v_refill := greatest(1, least(coalesce(v_refill, 60), 600));
  v_capacity := greatest(5, v_refill);

  insert into public.api_rate_bucket (principal, tokens, updated_at)
  values (v_principal, v_capacity, clock_timestamp()) on conflict (principal) do nothing;
  select b.tokens, b.updated_at into v_tokens, v_updated
  from public.api_rate_bucket b where b.principal = v_principal for update;
  -- Read the clock after the row lock. Waiting requests cannot refill with an
  -- earlier snapshot and concurrent server instances spend the same balance.
  v_now := clock_timestamp();
  v_tokens := least(v_capacity::numeric, v_tokens + greatest(0::numeric, extract(epoch from (v_now - v_updated))) * v_refill / 60);
  allowed := v_tokens >= v_cost;
  retry_after := case when allowed then 0 else greatest(1, ceil((v_cost - v_tokens) * 60 / v_refill)::integer) end;
  if allowed then v_tokens := v_tokens - v_cost; end if;
  remaining := floor(v_tokens)::integer;
  update public.api_rate_bucket set tokens = v_tokens, updated_at = greatest(v_updated, v_now) where principal = v_principal;
  -- Bounded housekeeping; no extra queue, scheduler or infrastructure service.
  delete from public.api_rate_bucket b where b.principal in (
    select stale.principal from public.api_rate_bucket stale
    where stale.updated_at < v_now - interval '1 day'
    order by stale.updated_at limit 20 for update skip locked
  );
  return next;
end;
$$;
revoke all on function public.fn_api_request_spend(text, text, text) from public, anon, authenticated;
grant execute on function public.fn_api_request_spend(text, text, text) to service_role;

-- The legacy API accepted a caller-selected key id/limit and minute windows.
-- Retain its definition for rollback inspection, but disable that bypass.
revoke all on function public.fn_api_key_spend(uuid, integer) from public, anon, authenticated, service_role;
delete from public.wiring_anon_allow where function_name = 'fn_api_key_spend';
update public.wiring_anon_allow
set reason = 'API key lookup without a human session',
    guarded_by = 'active secret hash, expiry, current merchant approval/state and internal staff authority'
where function_name = 'fn_api_key_lookup';
