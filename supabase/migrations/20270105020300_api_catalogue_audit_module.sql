-- The catalogue audit action belongs to the Settings module.
--
-- 20270105020200 registered api.catalogue_item_updated under module api and
-- logged it there. The console has no api module: 20261112000100 moved the
-- API actions (api.key_issued, api.key_revoked and others) to settings, which
-- owns the console's API credentials and integrations sections and their
-- visibility rules. So the registry row moves to settings, and
-- rpc_catalogue_item_update_api logs under settings from now on, as
-- rpc_api_key_revoke does. Entries already written keep their module: it is
-- part of the audit chain.
--
-- rpc_catalogue_item_update_api is its 20270105020200 body with that one
-- line changed. CREATE OR REPLACE keeps its grants (service_role only).
--
-- Rollback: set the registry row's module back to api and re-run the
-- function from 20270105020200.

update audit.action_registry
   set module = 'settings'
 where action = 'api.catalogue_item_updated' and module = 'api';

create or replace function public.rpc_catalogue_item_update_api(
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
      p_module => 'settings',
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
