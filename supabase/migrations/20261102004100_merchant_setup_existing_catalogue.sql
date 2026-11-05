-- Older catalogue entries do not have an activity assigned. Return them as
-- candidates; the merchant explicitly chooses an activity before editing.
create function public.rpc_merchant_setup_legacy_offerings(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean, false) then
    raise exception 'Setup access is required.' using errcode='42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.id,'name',i.name,'description',coalesce(i.description,''),
    'price',coalesce(i.price_kes::text,''),'available',i.available,'updatedAt',i.updated_at,
    'live',m.status::text='live') order by i.name)
    from public.catalogue_item i join public.merchant m on m.id=i.merchant_id
    left join public.merchant_setup_offering_detail d on d.item_id=i.id
    where i.merchant_id=p_merchant_id and d.item_id is null), '[]'::jsonb);
end;
$$;

-- Attaching metadata does not modify the existing catalogue row or change
-- its visibility, section, stock or price. It is atomic and version-checked.
create function public.rpc_merchant_setup_adopt_offering(
  p_merchant_id uuid, p_item_id uuid, p_expected_updated_at timestamptz, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare i public.catalogue_item; m public.merchant; a public.merchant_application; v_data jsonb;
begin
  select * into a from public.merchant_application where merchant_id=p_merchant_id for update;
  select * into m from public.merchant where id=p_merchant_id for update;
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean, false) then
    raise exception 'Setup access is required.' using errcode='42501';
  end if;
  select * into i from public.catalogue_item where id=p_item_id and merchant_id=p_merchant_id for update;
  if not found then raise exception 'Offering not found in this workspace.' using errcode='42501'; end if;
  if i.updated_at is distinct from p_expected_updated_at then
    raise exception 'This offering changed in another session. Reload it before continuing.' using errcode='40001';
  end if;
  if i.available and m.status::text='live' then
    raise exception 'This live offering must be edited from its operational catalogue.' using errcode='42501';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' or pg_column_size(p_data)>131072
     or p_data->>'id' is distinct from p_item_id::text
     or p_data->>'publication' is distinct from 'draft'
     or p_data->>'version' is distinct from '0'
     or (i.price_kes is not null and p_data->>'priceMode' not in ('fixed','unit'))
     or coalesce(p_data->>'schemaId','') !~ '^[A-Z][A-Z0-9_]{1,99}$'
     or not coalesce(a.payload->'subcategories' ? (p_data->>'profileId'),false)
     or p_data ? 'image' or p_data ? 'imageStoragePath' then
    raise exception 'Choose an activity for this offering.' using errcode='22023';
  end if;
  if exists(select 1 from public.merchant_setup_offering_detail where item_id=i.id) then
    raise exception 'This offering was already opened. Reload it before continuing.' using errcode='40001';
  end if;
  v_data := p_data || jsonb_build_object('name',i.name,'description',coalesce(i.description,''),
    'price',coalesce(i.price_kes::text,''),'publication','draft','version',1,
    'legacyCatalogue',true,'updatedAt',now());
  insert into public.merchant_setup_offering_detail(item_id,merchant_id,version,data)
    values(i.id,p_merchant_id,1,v_data);
  return v_data;
end;
$$;
revoke all on function public.rpc_merchant_setup_legacy_offerings(uuid),
  public.rpc_merchant_setup_adopt_offering(uuid,uuid,timestamptz,jsonb) from public, anon;
grant execute on function public.rpc_merchant_setup_legacy_offerings(uuid),
  public.rpc_merchant_setup_adopt_offering(uuid,uuid,timestamptz,jsonb) to authenticated;
