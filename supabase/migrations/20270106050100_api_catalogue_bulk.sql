-- Bulk catalogue updates through the API.
--
-- PATCH /v1/catalog/items changes up to 100 of a merchant's items in one
-- call: each one's price (price_kes), whether it is on sale (available), or
-- both. A till or ERP that keeps a whole price list in step sends it in a
-- few calls instead of one call per item.
--
-- It is all or nothing. A list that is empty or longer than 100, an item
-- without an id, an item listed twice, or an id the key's merchant does not
-- have, and nothing is saved. The ids the merchant does not have come back
-- together, with their place in the list, so a caller can drop them and
-- send the rest again. Another merchant's item answers like a missing one.
--
-- Each item then goes through rpc_catalogue_item_update_api, the one-item
-- change, in the same transaction: the same rules for price_kes and
-- available, the same test-key behaviour (a test key saves nothing and
-- answers with the result), and the same audit entry for each change. The
-- rows are locked first, in id order, so two calls that touch the same
-- items cannot deadlock.
--
-- One call costs one catalogue_write token, however many items it carries.

create or replace function public.rpc_catalogue_items_update_api(
  p_api_key text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_count integer;
  v_missing jsonb;
  v_result jsonb;
  v_items jsonb := '[]'::jsonb;
  v_applied boolean;
  r record;
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

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Send items: a list of changes, each with the id of the item it changes.'
      using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count = 0 or v_count > 100 then
    raise exception 'Send from 1 to 100 items in one call.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_items) e
     where jsonb_typeof(e) <> 'object'
        or jsonb_typeof(e -> 'id') is distinct from 'string'
        or (e ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'Each item needs the id of the item it changes.' using errcode = '22023';
  end if;

  if (select count(distinct lower(e ->> 'id')) from jsonb_array_elements(p_items) e) <> v_count then
    raise exception 'Each item can appear only once in a call.' using errcode = '22023';
  end if;

  /* Every id the merchant does not have, at once, with its place in the list. */
  select jsonb_agg(jsonb_build_object('index', e.ord - 1, 'id', e.value ->> 'id') order by e.ord)
    into v_missing
    from jsonb_array_elements(p_items) with ordinality as e(value, ord)
   where not exists (
     select 1 from public.catalogue_item i
      where i.id = (e.value ->> 'id')::uuid and i.merchant_id = v_key.merchant_id);

  if v_missing is not null then
    return jsonb_build_object('ok', false, 'missing', v_missing);
  end if;

  perform 1 from public.catalogue_item i
   where i.id in (select (e ->> 'id')::uuid from jsonb_array_elements(p_items) e)
   order by i.id
   for update;

  for r in
    select e.value, e.ord
      from jsonb_array_elements(p_items) with ordinality as e(value, ord)
     order by e.ord
  loop
    v_result := public.rpc_catalogue_item_update_api(
      p_api_key, (r.value ->> 'id')::uuid, r.value - 'id');
    v_items := v_items || jsonb_build_array(v_result -> 'item');
    v_applied := (v_result ->> 'applied')::boolean;
  end loop;

  return jsonb_build_object('ok', true, 'applied', v_applied, 'items', v_items);
end;
$$;

comment on function public.rpc_catalogue_items_update_api(text, jsonb) is
  'PATCH /v1/catalog/items: up to 100 price or availability changes to the key''s merchant''s items, all or nothing, each through rpc_catalogue_item_update_api. Unknown ids come back together as missing.';

revoke all on function public.rpc_catalogue_items_update_api(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_catalogue_items_update_api(text, jsonb) to service_role;

/* It changes nothing itself: every change goes through
   rpc_catalogue_item_update_api, which writes the audit entry. */
insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_catalogue_items_update_api',
   'Changes items only by calling rpc_catalogue_item_update_api for each one, in the same transaction, and that function audits every change it saves.',
   'audit.audit_event (api.catalogue_item_updated), one entry per changed item, written by rpc_catalogue_item_update_api')
on conflict (function_name) do nothing;
