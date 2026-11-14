-- Test keys and a sandbox for the NexG API.
--
-- A developer needs to try booking a service before NexG lets their merchant
-- book for real, and a booking made to try things out must never become an
-- order a rider is sent for. So API keys now come in two kinds:
--
--   live  every key until now, and still the default. It reads real data,
--         and a booking it makes is a real order.
--   test  issued as `nexg_test_...`. It reads the same public data, but a
--         booking it makes is a row in api_test_order: never an order, so it
--         is never dispatched, billed, settled or counted. Test keys spend
--         from a rate-limit bucket of their own, so a busy sandbox cannot slow
--         the merchant's live integration.
--
-- The line is held here as well as in the API server: the live booking and
-- order-read functions refuse a test key, and the sandbox functions refuse a
-- live one.
--
-- A service NexG has not priced in the merchant's city is refused live. In
-- the sandbox it gets a sample price instead (KES 1,000 per unit, or KES
-- 1,000 for a flat service), recorded as price_source 'sample', so the
-- sandbox works before any pricing exists.
--
-- Backward compatible. Existing keys become live keys. fn_api_key_issue gains
-- an optional p_environment (default 'live'), fn_api_key_lookup gains an
-- environment column, and every other function keeps its arguments and its
-- answers for live keys.
--
-- Rollback: drop rpc_order_read_api_test, rpc_order_place_api_test and
-- api_test_order; drop the new fn_api_key_issue and fn_api_key_lookup and
-- re-run them, fn_api_request_spend from 20261102000200, rpc_order_place_api
-- from 20260101023000 and rpc_order_read_api from 20261205000100; then drop
-- api_key.environment.

-- ═══════════════════════════════════════════════════════════════ the key kind

alter table public.api_key
  add column environment text not null default 'live';

alter table public.api_key
  add constraint api_key_environment_is_known check (environment in ('live', 'test'));

comment on column public.api_key.environment is
  'live: real data and real orders. test: a sandbox key (nexg_test_...); its bookings are api_test_order rows, never orders.';

-- ═══════════════════════════════════════════════════════════════ issuing a key

-- The signature changes (a new trailing argument), so the old function goes
-- first; otherwise two overloads would make named calls ambiguous.
drop function public.fn_api_key_issue(uuid, public.api_credential_scope[], integer, timestamptz, uuid, uuid);

create function public.fn_api_key_issue(
  p_merchant_id uuid default null,
  p_scopes public.api_credential_scope[] default '{public_read}',
  p_rate_limit integer default 60,
  p_expires_at timestamptz default null,
  p_created_by uuid default null,
  p_created_by_user uuid default null,
  p_environment text default 'live'
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
  v_prefix text;
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
    or (p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '366 days'))
    or p_environment is null or p_environment not in ('live', 'test') then
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
  -- A test key is for building against the API, never for NexG's own systems.
  if p_environment = 'test'
    and p_scopes && array['internal_read','internal_write']::public.api_credential_scope[] then
    raise exception 'A test key cannot carry internal scopes.' using errcode = '22023';
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
  -- on the installation schema of the optional pgcrypto extension. A test
  -- key says so in its first characters, and in the prefix people see.
  v_raw := case when p_environment = 'test' then 'nexg_test_' else '' end
    || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_prefix := left(v_raw, case when p_environment = 'test' then 14 else 8 end);
  insert into public.api_key (
    merchant_id, key_hash, key_prefix, scopes, rate_limit,
    expires_at, created_by, created_by_user, environment
  ) values (
    p_merchant_id, encode(sha256(convert_to(v_raw, 'UTF8')), 'hex'), v_prefix,
    p_scopes, p_rate_limit, p_expires_at, v_staff, v_user, p_environment
  ) returning id into v_id;
  perform audit.log(
    p_actor_type => case when v_staff is null then 'merchant_user'::public.actor_type else 'staff'::public.actor_type end,
    p_actor_id => coalesce(v_staff, v_user), p_module => 'api', p_action => 'api.key_issued',
    p_target_type => 'api_key', p_target_id => v_id,
    p_after => jsonb_build_object('merchant_id', p_merchant_id, 'scopes', p_scopes,
      'rate_limit', p_rate_limit, 'environment', p_environment)
  );
  return query select v_raw, v_id, v_prefix;
end;
$$;
revoke all on function public.fn_api_key_issue(uuid, public.api_credential_scope[], integer, timestamptz, uuid, uuid, text) from public, anon;
grant execute on function public.fn_api_key_issue(uuid, public.api_credential_scope[], integer, timestamptz, uuid, uuid, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════ looking a key up

-- The answer gains a column, which Postgres treats as a new function.
drop function public.fn_api_key_lookup(text);

create function public.fn_api_key_lookup(p_raw_key text)
returns table (
  key_id uuid,
  merchant_id uuid,
  scopes public.api_credential_scope[],
  rate_limit integer,
  environment text
)
language sql stable security definer set search_path = ''
set statement_timeout = '5s'
as $$
  select k.id, k.merchant_id, k.scopes, least(k.rate_limit, 600), k.environment
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

-- ═══════════════════════════════════════════════════════════════ the rate limit

/*
 * Test keys spend from a bucket of their own ('merchant:<id>:test', or
 * 'user:<id>:test' for a key without a merchant), refilled at the lowest
 * limit among keys of the same kind. Before this, one bucket covered all of
 * a merchant's keys, so a test key issued with a low limit would have slowed
 * the live integration too. Live keys are answered exactly as before.
 */
create or replace function public.fn_api_request_spend(
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
  v_kind text;
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
    v_kind := case when v_key.environment = 'test' then ':test' else '' end;
    if v_key.merchant_id is not null then
      v_principal := 'merchant:' || v_key.merchant_id::text || v_kind;
      select min(k.rate_limit) into v_refill from public.api_key k
      where k.merchant_id = v_key.merchant_id and k.environment = v_key.environment
        and k.state = 'active' and (k.expires_at is null or k.expires_at > now());
    else
      v_principal_user := coalesce(v_key.created_by_user,
        (select su.user_id from public.staff_user su where su.id = v_key.created_by));
      if v_principal_user is not null then
        v_principal := 'user:' || v_principal_user::text || v_kind;
        select min(k.rate_limit) into v_refill from public.api_key k
        where k.merchant_id is null and k.environment = v_key.environment and k.state = 'active'
          and (k.created_by_user = v_principal_user or (k.created_by_user is null and k.created_by in (
            select su.id from public.staff_user su where su.user_id = v_principal_user
          )))
          and (k.expires_at is null or k.expires_at > now());
      else
        v_principal := 'legacy:platform' || v_kind;
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

-- ═══════════════════════════════════════════════════════════════ the live functions refuse test keys

/*
 * rpc_order_place_api, unchanged from 20260101023000 except for one refusal:
 * a test key never places a real booking. The API server sends test keys to
 * rpc_order_place_api_test; this is the same rule held in the database.
 */
create or replace function public.rpc_order_place_api(
  p_api_key text,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_service public.api_service;
  v_merchant public.merchant;
  v_branch uuid;
  v_quantity integer;
  v_pickup_label text;
  v_dropoff_label text;
  v_pickup_point extensions.geography;
  v_dropoff_point extensions.geography;
  v_when timestamptz;
  v_pax jsonb;
  v_price jsonb;
  v_order uuid;
  v_ref text;
  v_total bigint;
  v_earlier public.api_idempotency;
begin
  -- the caller
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if v_key.environment <> 'live' then
    raise exception 'A test key books in the sandbox, never for real.' using errcode = '42501';
  end if;

  if not ('merchant_write'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot book services.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  -- the retry: a key that has already been used returns its first answer
  select i.* into v_earlier
  from public.api_idempotency i
  where i.merchant_id = v_key.merchant_id
    and i.idempotency_key = p_idempotency_key
    and i.endpoint = 'order.place';

  if found then
    return v_earlier.response;
  end if;

  -- the request
  if length(coalesce(p_idempotency_key, '')) < 16
     or length(coalesce(p_idempotency_key, '')) > 128 then
    raise exception 'An idempotency key is required.' using errcode = '22023';
  end if;

  select s.* into v_service
  from public.api_service s
  where s.code = nullif(p_payload ->> 'service', '')
    and s.active;

  if not found then
    raise exception 'That service is not one we offer.' using errcode = '22023';
  end if;

  select m.* into v_merchant
  from public.merchant m
  where m.id = v_key.merchant_id;

  if not found or v_merchant.status <> 'live' then
    raise exception 'This merchant is not live.' using errcode = '42501';
  end if;

  v_quantity := coalesce(nullif(p_payload ->> 'quantity', '')::integer, 1);
  v_pickup_label := nullif(trim(p_payload ->> 'pickup_label'), '');
  v_dropoff_label := nullif(trim(p_payload ->> 'dropoff_label'), '');
  v_pax := p_payload -> 'passengers';

  if v_quantity < 1 or v_quantity > 60 then
    raise exception 'How many are we moving?' using errcode = '22023';
  end if;

  -- A ride or a courier needs somewhere to collect from and somewhere to go.
  if v_service.kind in ('ride', 'courier') then
    if v_pickup_label is null then
      raise exception 'Where are we collecting from?' using errcode = '22023';
    end if;
    if v_dropoff_label is null then
      raise exception 'Where are we taking them?' using errcode = '22023';
    end if;
    if nullif(p_payload ->> 'pickup_lat', '') is null
       or nullif(p_payload ->> 'pickup_lng', '') is null then
      raise exception 'Give the pickup point as a latitude and longitude.' using errcode = '22023';
    end if;
    if nullif(p_payload ->> 'dropoff_lat', '') is null
       or nullif(p_payload ->> 'dropoff_lng', '') is null then
      raise exception 'Give the dropoff point as a latitude and longitude.' using errcode = '22023';
    end if;

    v_pickup_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'pickup_lng')::float, (p_payload ->> 'pickup_lat')::float), 4326)::extensions.geography;
    v_dropoff_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'dropoff_lng')::float, (p_payload ->> 'dropoff_lat')::float), 4326)::extensions.geography;
  end if;

  v_when := nullif(p_payload ->> 'scheduled_for', '')::timestamptz;
  if v_when is not null and v_when < now() - interval '1 hour' then
    raise exception 'That time has already passed.' using errcode = '22023';
  end if;

  -- the price comes from the settings, never from the payload
  v_price := public.fn_price_api_service(
    v_merchant.city_id, v_service, v_quantity, 1, now());

  if not (v_price ->> 'ok')::boolean then
    raise exception '%', v_price ->> 'message';
  end if;

  v_total := (v_price ->> 'total_cents')::bigint;

  -- the order
  select b.id into v_branch
  from public.merchant_branch b
  where b.merchant_id = v_merchant.id
  order by b.is_primary desc
  limit 1;

  v_ref := public.fn_order_reference();

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
    dropoff_label, dropoff_point, dropoff_note, delivery_context,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents,
    commission_cents, commission_pct, currency, pricing_version_ids,
    scheduled_for, promised_delivery_at
  ) values (
    v_ref, null, v_merchant.id, v_branch, v_merchant.city_id, null, 'api',
    coalesce(v_dropoff_label, v_service.label), v_dropoff_point,
    nullif(trim(p_payload ->> 'note'), ''),
    jsonb_build_object(
      'service', v_service.code,
      'service_label', v_service.label,
      'pickup_label', v_pickup_label,
      'pickup_point', case when v_pickup_point is null then null else
        jsonb_build_object('lat', (p_payload ->> 'pickup_lat')::float,
                           'lng', (p_payload ->> 'pickup_lng')::float) end,
      'passengers', v_pax
    ),
    'placed',
    coalesce(nullif(p_payload ->> 'payment_method', ''), 'on_account')::public.order_payment_method,
    'pending',
    (v_price ->> 'subtotal_cents')::bigint,
    (v_price ->> 'delivery_fee_cents')::bigint,
    (v_price ->> 'service_fee_cents')::bigint,
    v_total,
    (v_price ->> 'commission_cents')::bigint,
    (v_price ->> 'commission_pct')::numeric,
    'KES', v_price -> 'pricing_version_ids',
    v_when, v_when
  ) returning id into v_order;

  insert into public.order_item (
    order_id, name, quantity, unit_price_cents, line_total_cents, note
  ) values (
    v_order, v_service.label, v_quantity,
    (v_price ->> 'unit_price_cents')::bigint,
    (v_price ->> 'subtotal_cents')::bigint,
    v_service.unit_label
  );

  insert into public.order_event (
    order_id, kind, title, detail, actor_type, actor_id, payload
  ) values (
    v_order, 'placed', 'Booked through the API',
    v_service.label || ' x' || v_quantity::text,
    'system', null,
    jsonb_build_object('channel', 'api', 'service', v_service.code)
  );

  perform audit.log(
    p_actor_type => 'system',
    p_module => 'api',
    p_action => 'api.order_placed',
    p_target_type => 'order',
    p_target_id => v_order,
    p_after => jsonb_build_object(
      'reference', v_ref,
      'service', v_service.code,
      'quantity', v_quantity,
      'total_cents', v_total,
      'merchant_id', v_merchant.id,
      'payment_method', coalesce(nullif(p_payload ->> 'payment_method', ''), 'on_account')
    )
  );

  -- the key is recorded with its answer, in the same transaction as the order
  insert into public.api_idempotency (
    merchant_id, idempotency_key, endpoint, response, order_id
  ) values (
    v_key.merchant_id, p_idempotency_key, 'order.place',
    jsonb_build_object(
      'ok', true,
      'order_id', v_order,
      'reference', v_ref,
      'service', v_service.code,
      'quantity', v_quantity,
      'total_cents', v_total,
      'currency', 'KES',
      'payment_method', coalesce(nullif(p_payload ->> 'payment_method', ''), 'on_account'),
      'scheduled_for', v_when
    ),
    v_order
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'reference', v_ref,
    'service', v_service.code,
    'quantity', v_quantity,
    'total_cents', v_total,
    'currency', 'KES',
    'payment_method', coalesce(nullif(p_payload ->> 'payment_method', ''), 'on_account'),
    'scheduled_for', v_when
  );
end;
$$;

comment on function public.rpc_order_place_api is
  'A merchant books a service through the API with a live key. Idempotent on the key, priced from the settings, and audited. Test keys are refused: they book through rpc_order_place_api_test.';

revoke execute on function public.rpc_order_place_api(text, text, jsonb) from public, anon;
grant execute on function public.rpc_order_place_api(text, text, jsonb) to service_role;

/*
 * rpc_order_read_api, unchanged from 20261205000100 except for one refusal:
 * a test key reads test bookings (rpc_order_read_api_test), never real ones.
 */
create or replace function public.rpc_order_read_api(
  p_api_key text,
  p_order_id uuid default null,
  p_limit integer default 25,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_has_cursor boolean := p_cursor_created_at is not null and p_cursor_id is not null;
  v_items jsonb;
  v_found integer;
  v_last jsonb;
begin
  -- The credential: the key decides the merchant, and only merchant_read reads.
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if v_key.environment <> 'live' then
    raise exception 'A test key reads test bookings, never real orders.' using errcode = '42501';
  end if;

  if not ('merchant_read'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot read a merchant''s orders.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null
     or not exists (select 1 from public.merchant m where m.id = v_key.merchant_id) then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  /*
   * One order, or a page of them, through the same shape builder, so a
   * single order and a list item are the same object. A page fetches one
   * row more than it returns; that row only says there is a next page.
   */
  with page as (
    select
      o.id,
      o.reference,
      o.stage,
      o.payment_method,
      o.payment_status,
      o.currency,
      o.total_cents,
      o.scheduled_for,
      o.dropoff_label,
      o.created_at,
      o.delivery_context,
      coalesce(i.quantity, 1) as quantity,
      row_number() over (order by o.created_at desc, o.id desc) as n
    from public.order o
    left join lateral (
      select sum(oi.quantity) as quantity
      from public.order_item oi
      where oi.order_id = o.id and oi.removed_at is null
    ) i on true
    where o.merchant_id = v_key.merchant_id
      and (
        (p_order_id is not null and o.id = p_order_id)
        or (
          p_order_id is null
          and (not v_has_cursor or (o.created_at, o.id) < (p_cursor_created_at, p_cursor_id))
        )
      )
    order by o.created_at desc, o.id desc
    limit case when p_order_id is not null then 1 else v_limit + 1 end
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', p.id,
          'reference', p.reference,
          'service', coalesce(p.delivery_context ->> 'service', ''),
          'quantity', p.quantity,
          'stage', p.stage,
          'payment_method', p.payment_method,
          'payment_status', p.payment_status,
          'currency', p.currency,
          'total_cents', p.total_cents,
          'scheduled_for', p.scheduled_for,
          'pickup_label', p.delivery_context ->> 'pickup_label',
          'dropoff_label', p.dropoff_label,
          'created_at', p.created_at
        ) order by p.n
      ) filter (where p.n <= v_limit),
      '[]'::jsonb
    ),
    count(*)
  into v_items, v_found
  from page p;

  if p_order_id is not null then
    if v_found = 0 then
      raise exception 'That order does not exist.' using errcode = '22023';
    end if;
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  if v_found <= v_limit then
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  -- The next page starts after the last order kept on this one.
  v_last := v_items -> (v_limit - 1);
  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'next_cursor', jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'order_id'
    )
  );
end;
$$;

comment on function public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid) is
  'Read a merchant''s bookings through the API with a live key. The key names the merchant; the caller never does. Test keys read rpc_order_read_api_test.';

revoke execute on function public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════ the sandbox

/*
 * A test booking. Deliberately not an order: no rider, ledger, settlement,
 * report or console reads this table, so nothing a test key does can reach
 * real operations. It holds what a test booking needs to answer the same
 * shapes as a real one, and nothing else.
 */
create table public.api_test_order (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  api_key_id uuid references public.api_key (id) on delete set null,
  -- TEST-YYMMDD-XXXXXX, so a test booking never reads like a real reference.
  reference text not null unique,
  service text not null,
  quantity integer not null check (quantity between 1 and 60),
  stage text not null default 'placed',
  payment_method text not null default 'on_account',
  payment_status text not null default 'pending',
  currency text not null default 'KES',
  total_cents bigint not null check (total_cents >= 0),
  -- 'settings' when NexG has priced the service in the city, else 'sample'.
  price_source text not null check (price_source in ('settings', 'sample')),
  scheduled_for timestamptz,
  pickup_label text,
  dropoff_label text,
  -- The booking as it was sent, for the developer's own checks.
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index api_test_order_page_idx on public.api_test_order (merchant_id, created_at desc, id desc);

comment on table public.api_test_order is
  'Bookings made with test API keys. Never orders: nothing dispatches, bills or counts them.';

alter table public.api_test_order enable row level security;
-- Merchants reach this table only through the sandbox functions below,
-- granted to service_role alone. Staff may read it, as with api_idempotency,
-- to help a developer whose test bookings look wrong. Nothing else is
-- granted: row security does not cover TRUNCATE, so the defaults go too.
revoke all on public.api_test_order from public, anon, authenticated;
grant select on public.api_test_order to authenticated;
create policy api_test_order_staff_read on public.api_test_order
  for select to authenticated
  using (authz.staff_id() is not null);

/*
 * Book in the sandbox. The same request, the same checks and the same
 * answer as rpc_order_place_api, with three differences: it takes only test
 * keys, it writes an api_test_order row instead of an order, and a service
 * NexG has not priced in the city gets the sample price instead of a refusal.
 * Keep its checks in step with rpc_order_place_api; supabase/tests
 * 71_api_test_keys.sql holds the two to the same refusals.
 */
create function public.rpc_order_place_api_test(
  p_api_key text,
  p_idempotency_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_service public.api_service;
  v_merchant public.merchant;
  v_quantity integer;
  v_pickup_label text;
  v_dropoff_label text;
  v_when timestamptz;
  v_price jsonb;
  v_total bigint;
  v_source text;
  v_id uuid;
  v_ref text;
  v_answer jsonb;
  v_earlier public.api_idempotency;
begin
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if v_key.environment <> 'test' then
    raise exception 'A live key books for real, not in the sandbox.' using errcode = '42501';
  end if;

  if not ('merchant_write'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot book services.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  select i.* into v_earlier
  from public.api_idempotency i
  where i.merchant_id = v_key.merchant_id
    and i.idempotency_key = p_idempotency_key
    and i.endpoint = 'order.place.test';

  if found then
    return v_earlier.response;
  end if;

  if length(coalesce(p_idempotency_key, '')) < 16
     or length(coalesce(p_idempotency_key, '')) > 128 then
    raise exception 'An idempotency key is required.' using errcode = '22023';
  end if;

  select s.* into v_service
  from public.api_service s
  where s.code = nullif(p_payload ->> 'service', '')
    and s.active;

  if not found then
    raise exception 'That service is not one we offer.' using errcode = '22023';
  end if;

  select m.* into v_merchant
  from public.merchant m
  where m.id = v_key.merchant_id;

  if not found then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  v_quantity := coalesce(nullif(p_payload ->> 'quantity', '')::integer, 1);
  v_pickup_label := nullif(trim(p_payload ->> 'pickup_label'), '');
  v_dropoff_label := nullif(trim(p_payload ->> 'dropoff_label'), '');

  if v_quantity < 1 or v_quantity > 60 then
    raise exception 'How many are we moving?' using errcode = '22023';
  end if;

  if v_service.kind in ('ride', 'courier') then
    if v_pickup_label is null then
      raise exception 'Where are we collecting from?' using errcode = '22023';
    end if;
    if v_dropoff_label is null then
      raise exception 'Where are we taking them?' using errcode = '22023';
    end if;
    if nullif(p_payload ->> 'pickup_lat', '') is null
       or nullif(p_payload ->> 'pickup_lng', '') is null then
      raise exception 'Give the pickup point as a latitude and longitude.' using errcode = '22023';
    end if;
    if nullif(p_payload ->> 'dropoff_lat', '') is null
       or nullif(p_payload ->> 'dropoff_lng', '') is null then
      raise exception 'Give the dropoff point as a latitude and longitude.' using errcode = '22023';
    end if;
  end if;

  v_when := nullif(p_payload ->> 'scheduled_for', '')::timestamptz;
  if v_when is not null and v_when < now() - interval '1 hour' then
    raise exception 'That time has already passed.' using errcode = '22023';
  end if;

  -- NexG's price where it has one; otherwise the sample price.
  v_price := public.fn_price_api_service(v_merchant.city_id, v_service, v_quantity, 1, now());
  if coalesce((v_price ->> 'ok')::boolean, false) then
    v_total := (v_price ->> 'total_cents')::bigint;
    v_source := 'settings';
  else
    v_total := 100000 * case when v_service.unit_basis = 'flat' then 1 else v_quantity end;
    v_source := 'sample';
  end if;

  v_ref := 'TEST-' || to_char(now() at time zone 'Africa/Nairobi', 'YYMMDD') || '-'
    || upper(left(replace(gen_random_uuid()::text, '-', ''), 6));

  insert into public.api_test_order (
    merchant_id, api_key_id, reference, service, quantity, total_cents, price_source,
    scheduled_for, pickup_label, dropoff_label, payload
  ) values (
    v_merchant.id, v_key.id, v_ref, v_service.code, v_quantity, v_total, v_source,
    v_when, v_pickup_label, coalesce(v_dropoff_label, v_service.label), p_payload
  ) returning id into v_id;

  v_answer := jsonb_build_object(
    'ok', true,
    'order_id', v_id,
    'reference', v_ref,
    'service', v_service.code,
    'quantity', v_quantity,
    'total_cents', v_total,
    'currency', 'KES',
    'payment_method', 'on_account',
    'scheduled_for', v_when
  );

  insert into public.api_idempotency (merchant_id, idempotency_key, endpoint, response, order_id)
  values (v_key.merchant_id, p_idempotency_key, 'order.place.test', v_answer, null);

  return v_answer;
end;
$$;

comment on function public.rpc_order_place_api_test is
  'Book in the sandbox with a test API key: an api_test_order row, never an order. Same checks as rpc_order_place_api; unpriced services get a sample price.';

-- A sandbox booking is a developer trying the API, not a business event, so
-- it stays out of the audit chain; the row itself records who made it.
insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values (
  'rpc_order_place_api_test',
  'Sandbox bookings made with test API keys are never orders: they move no money, dispatch nothing and reach no customer, so they are not audited business events.',
  'api_test_order (merchant_id, api_key_id, payload, created_at) and api_idempotency (endpoint order.place.test)'
)
on conflict (function_name) do nothing;

revoke execute on function public.rpc_order_place_api_test(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_order_place_api_test(text, text, jsonb) to service_role;

/*
 * Read test bookings, in the same shapes and pages as rpc_order_read_api.
 */
create function public.rpc_order_read_api_test(
  p_api_key text,
  p_order_id uuid default null,
  p_limit integer default 25,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_has_cursor boolean := p_cursor_created_at is not null and p_cursor_id is not null;
  v_items jsonb;
  v_found integer;
  v_last jsonb;
begin
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if v_key.environment <> 'test' then
    raise exception 'A live key reads real orders, not test bookings.' using errcode = '42501';
  end if;

  if not ('merchant_read'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot read a merchant''s orders.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  with page as (
    select
      t.*,
      row_number() over (order by t.created_at desc, t.id desc) as n
    from public.api_test_order t
    where t.merchant_id = v_key.merchant_id
      and (
        (p_order_id is not null and t.id = p_order_id)
        or (
          p_order_id is null
          and (not v_has_cursor or (t.created_at, t.id) < (p_cursor_created_at, p_cursor_id))
        )
      )
    order by t.created_at desc, t.id desc
    limit case when p_order_id is not null then 1 else v_limit + 1 end
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', p.id,
          'reference', p.reference,
          'service', p.service,
          'quantity', p.quantity,
          'stage', p.stage,
          'payment_method', p.payment_method,
          'payment_status', p.payment_status,
          'currency', p.currency,
          'total_cents', p.total_cents,
          'scheduled_for', p.scheduled_for,
          'pickup_label', p.pickup_label,
          'dropoff_label', p.dropoff_label,
          'created_at', p.created_at
        ) order by p.n
      ) filter (where p.n <= v_limit),
      '[]'::jsonb
    ),
    count(*)
  into v_items, v_found
  from page p;

  if p_order_id is not null then
    if v_found = 0 then
      raise exception 'That order does not exist.' using errcode = '22023';
    end if;
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  if v_found <= v_limit then
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  v_last := v_items -> (v_limit - 1);
  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'next_cursor', jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'order_id'
    )
  );
end;
$$;

comment on function public.rpc_order_read_api_test is
  'Read test bookings with a test API key, in the same shapes and pages as rpc_order_read_api.';

revoke execute on function public.rpc_order_read_api_test(text, uuid, integer, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.rpc_order_read_api_test(text, uuid, integer, timestamptz, uuid) to service_role;
