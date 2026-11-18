-- Updating a merchant's catalogue through the API: PATCH /v1/catalog/items/{id}
-- changes an item's price or availability, and GET /v1/catalog/items lists
-- every item of the key's merchant, sold-out ones included.
--
--   * rpc_catalogue_item_update_api holds the rules: a key with
--     catalogue_write (20270105020100), bound to a merchant; only price_kes
--     (whole shillings, 1 to 1,000,000, as the merchant console allows) and
--     available; the key decides the merchant. A live key saves the change,
--     live for the next order, and audits it as api.catalogue_item_updated
--     with the key. A test key saves nothing and answers with the result.
--   * rpc_catalogue_items_api lists the items for merchant_read or
--     catalogue_write keys, in menu order, in the CatalogueItem shape.
--   * fn_api_key_issue: catalogue_write, like merchant_read and
--     merchant_write, needs a merchant. Otherwise its latest body
--     (20261217000100) unchanged.
--   * fn_api_request_spend: a catalogue update costs one token, so a till
--     can keep hundreds of items in step a minute. Otherwise its latest body
--     (20261217000100) unchanged.
--
-- Both RPCs are granted to service_role only, like the other key-checked
-- API functions.
--
-- Rollback: drop rpc_catalogue_item_update_api, rpc_catalogue_items_api and
-- fn_api_catalogue_item; re-run fn_api_key_issue and fn_api_request_spend
-- from 20261217000100; delete the api.catalogue_item_updated registry row.

-- ═══════════════════════════════════════════════════════════════ issuing and spending

create or replace function public.fn_api_key_issue(
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
  elsif p_scopes && array['merchant_read','merchant_write','catalogue_write']::public.api_credential_scope[] then
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
  v_cost := case p_operation when 'public_read' then 1 when 'merchant_read' then 3 when 'merchant_write' then 5
    when 'catalogue_write' then 1 end;
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

-- ═══════════════════════════════════════════════════════════════ an item as the API shows it

/*
 * A catalogue item (to_jsonb of its row) in the shape GET
 * /v1/catalog/merchants/{id} returns, so one parser reads both; columns not
 * named here never reach the API. It takes jsonb, not the row type, so
 * PostgREST does not take it for a computed column of catalogue_item.
 * price_kes is null for an item with no price yet.
 */
create function public.fn_api_catalogue_item(p_item jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_item -> 'id',
    'merchant_id', p_item -> 'merchant_id',
    'section_id', p_item -> 'section_id',
    'name', p_item -> 'name',
    'description', p_item -> 'description',
    'price_kes', p_item -> 'price_kes',
    'available', p_item -> 'available',
    'age_restricted', p_item -> 'age_restricted',
    'highlighted', p_item -> 'highlighted',
    'sort', p_item -> 'sort')
$$;

comment on function public.fn_api_catalogue_item(jsonb) is
  'A catalogue item as the API returns it: the CatalogueItem shape of GET /v1/catalog/merchants/{id}.';

-- ═══════════════════════════════════════════════════════════════ GET /v1/catalog/items

/*
 * Every item of the key's merchant, sold-out ones included: the public
 * catalogue leaves those out, and a till that switches an item off must be
 * able to find it again. The key decides the merchant.
 */
create function public.rpc_catalogue_items_api(p_api_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
begin
  select k.* into v_key
  from public.api_key k
  join public.fn_api_key_lookup(p_api_key) usable on usable.key_id = k.id;

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if not (v_key.scopes && array['merchant_read', 'catalogue_write']::public.api_credential_scope[]) then
    raise exception 'This key cannot read the merchant''s catalogue: it needs merchant_read or catalogue_write.'
      using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'ok', true,
    'items', coalesce((
      select jsonb_agg(public.fn_api_catalogue_item(to_jsonb(i)) order by s.sort, s.name, i.sort, i.name, i.id)
      from public.catalogue_item i
      join public.catalogue_section s on s.id = i.section_id
      where i.merchant_id = v_key.merchant_id
    ), '[]'::jsonb));
end;
$$;

comment on function public.rpc_catalogue_items_api(text) is
  'GET /v1/catalog/items: every catalogue item of the key''s merchant, sold-out ones included, in menu order. Needs merchant_read or catalogue_write.';

-- ═══════════════════════════════════════════════════════════════ PATCH /v1/catalog/items/{id}

/*
 * Change an item's price or availability, the two things a merchant's own
 * till or ERP keeps up to date. The same rules as the merchant console's
 * own edits: whole shillings from 1 to 1,000,000, live for the next order.
 *
 * A live key saves the change and logs it with the key that made it. A
 * test key changes nothing: it answers with the item as the change would
 * leave it, so an integration can be built without touching real prices.
 * Another merchant's item answers like one that does not exist.
 */
create function public.rpc_catalogue_item_update_api(
  p_api_key text,
  p_item_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  i public.catalogue_item;
  v_unknown text;
  v_price integer;
  v_available boolean;
  v_after public.catalogue_item;
begin
  select k.* into v_key
  from public.api_key k
  join public.fn_api_key_lookup(p_api_key) usable on usable.key_id = k.id;

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if not ('catalogue_write'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot update the catalogue: it needs catalogue_write.'
      using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Send price_kes, available, or both.' using errcode = '22023';
  end if;

  select string_agg(k, ', ' order by k) into v_unknown
  from jsonb_object_keys(p_changes) k
  where k not in ('price_kes', 'available');

  if v_unknown is not null then
    raise exception 'Only price_kes and available can be changed here, not %.', v_unknown
      using errcode = '22023';
  end if;

  if p_changes ? 'price_kes' then
    if jsonb_typeof(p_changes -> 'price_kes') <> 'number' then
      raise exception 'price_kes is whole shillings, from 1 to 1,000,000.' using errcode = '22023';
    end if;
    if (p_changes ->> 'price_kes')::numeric <> trunc((p_changes ->> 'price_kes')::numeric)
       or (p_changes ->> 'price_kes')::numeric < 1
       or (p_changes ->> 'price_kes')::numeric > 1000000 then
      raise exception 'price_kes is whole shillings, from 1 to 1,000,000.' using errcode = '22023';
    end if;
    v_price := (p_changes ->> 'price_kes')::integer;
  end if;

  if p_changes ? 'available' then
    if jsonb_typeof(p_changes -> 'available') <> 'boolean' then
      raise exception 'available is true or false.' using errcode = '22023';
    end if;
    v_available := (p_changes ->> 'available')::boolean;
  end if;

  select * into i
  from public.catalogue_item
  where id = p_item_id and merchant_id = v_key.merchant_id
  for update;

  if not found then
    raise exception 'No such item.' using errcode = 'P0002';
  end if;

  v_after := i;
  v_after.price_kes := coalesce(v_price, i.price_kes);
  v_after.available := coalesce(v_available, i.available);

  if v_key.environment = 'test' then
    return jsonb_build_object('ok', true, 'applied', false,
      'item', public.fn_api_catalogue_item(to_jsonb(v_after)));
  end if;

  if v_after.price_kes is distinct from i.price_kes
     or v_after.available is distinct from i.available then
    update public.catalogue_item
       set price_kes = v_after.price_kes,
           available = v_after.available
     where id = i.id
    returning * into v_after;

    perform audit.log(
      p_actor_type => 'system',
      p_module => 'api',
      p_action => 'api.catalogue_item_updated',
      p_target_type => 'catalogue_item',
      p_target_id => i.id,
      p_before => jsonb_build_object('price_kes', i.price_kes, 'available', i.available),
      p_after => jsonb_build_object('price_kes', v_after.price_kes, 'available', v_after.available,
        'merchant_id', i.merchant_id, 'api_key_id', v_key.id, 'key_prefix', v_key.key_prefix));
  end if;

  return jsonb_build_object('ok', true, 'applied', true,
    'item', public.fn_api_catalogue_item(to_jsonb(v_after)));
end;
$$;

comment on function public.rpc_catalogue_item_update_api(text, uuid, jsonb) is
  'PATCH /v1/catalog/items/{id}: change an item''s price_kes or available with a catalogue_write key. A live key saves and audits the change; a test key only answers with the result.';

-- ═══════════════════════════════════════════════════════════════ audit and grants

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('api.catalogue_item_updated', 'api', 'notice', false, false, false,
   'A merchant''s catalogue item price or availability was changed through the API')
on conflict (action) do nothing;

revoke all on function public.fn_api_catalogue_item(jsonb) from public, anon, authenticated;

revoke all on function
  public.rpc_catalogue_items_api(text),
  public.rpc_catalogue_item_update_api(text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.rpc_catalogue_items_api(text),
  public.rpc_catalogue_item_update_api(text, uuid, jsonb)
  to service_role;
