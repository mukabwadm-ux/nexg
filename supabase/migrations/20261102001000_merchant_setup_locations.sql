-- Retain setup details on the same branch records used by the workspace.
alter table public.merchant_branch
  add column if not exists place_type text not null default 'physical'
    check (place_type in ('physical', 'service_base', 'digital_operation')),
  add column if not exists public_contact text,
  add column if not exists activity_ids text[] not null default '{}';

create function public.rpc_merchant_setup_locations(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean, false) then
    raise exception 'Setup access is required.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id', b.id, 'name', b.name, 'type', b.place_type,
    'address', coalesce(b.address_text, ''), 'contact', coalesce(b.public_contact, ''),
    'activityIds', to_jsonb(b.activity_ids), 'updatedAt', b.updated_at
  ) order by b.is_primary desc, b.created_at)
    from public.merchant_branch b where b.merchant_id = p_merchant_id and b.deleted_at is null), '[]'::jsonb);
end;
$$;

create function public.rpc_merchant_setup_location_save(
  p_merchant_id uuid, p_branch_id uuid, p_name text, p_place_type text,
  p_address text, p_contact text, p_activity_ids text[], p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.merchant_branch; a public.merchant_application;
begin
  select * into a from public.merchant_application where merchant_id = p_merchant_id for update;
  perform 1 from public.merchant where id = p_merchant_id for update;
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean, false) then
    raise exception 'Setup access is required.' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 100
     or p_place_type not in ('physical','service_base','digital_operation')
     or length(coalesce(p_address,'')) > 1000 or length(coalesce(p_contact,'')) > 100
     or coalesce(array_length(p_activity_ids,1),0) > 128
     or exists (select 1 from unnest(coalesce(p_activity_ids,'{}'::text[])) id
                 where not coalesce(a.payload->'subcategories' ? id, false)) then
    raise exception 'Check the location details and selected activities.' using errcode = '22023';
  end if;
  if p_branch_id is null then
    insert into public.merchant_branch(merchant_id, name, address_text, place_type, public_contact, activity_ids, is_primary, source)
      values(p_merchant_id, trim(p_name), nullif(trim(coalesce(p_address,'')),''), p_place_type,
        nullif(trim(coalesce(p_contact,'')),''), coalesce(p_activity_ids,'{}'::text[]),
        not exists(select 1 from public.merchant_branch where merchant_id=p_merchant_id and is_primary), 'manual')
      returning * into b;
  else
    select * into b from public.merchant_branch where id=p_branch_id and merchant_id=p_merchant_id
      and deleted_at is null for update;
    if not found then raise exception 'Location not found in your workspace.' using errcode = '42501'; end if;
    if p_expected_updated_at is null or b.updated_at is distinct from p_expected_updated_at then
      raise exception 'This location changed in another session. Reload it before saving.' using errcode = '40001';
    end if;
    -- A previous map pin and service zone cannot be assumed valid for a new address.
    update public.merchant_branch set name=trim(p_name), address_text=nullif(trim(coalesce(p_address,'')),''),
      latitude=case when address_text is distinct from nullif(trim(coalesce(p_address,'')),'') then null else latitude end,
      longitude=case when address_text is distinct from nullif(trim(coalesce(p_address,'')),'') then null else longitude end,
      location=case when address_text is distinct from nullif(trim(coalesce(p_address,'')),'') then null else location end,
      zone_id=case when address_text is distinct from nullif(trim(coalesce(p_address,'')),'') then null else zone_id end,
      place_type=p_place_type, public_contact=nullif(trim(coalesce(p_contact,'')),''),
      activity_ids=coalesce(p_activity_ids,'{}'::text[]), updated_at=now()
      where id=p_branch_id returning * into b;
  end if;
  return jsonb_build_object('id', b.id, 'name', b.name, 'type', b.place_type,
    'address', coalesce(b.address_text,''), 'contact', coalesce(b.public_contact,''),
    'activityIds', to_jsonb(b.activity_ids), 'updatedAt', b.updated_at);
end;
$$;
revoke all on function public.rpc_merchant_setup_locations(uuid),
  public.rpc_merchant_setup_location_save(uuid,uuid,text,text,text,text,text[],timestamptz) from public, anon;
grant execute on function public.rpc_merchant_setup_locations(uuid),
  public.rpc_merchant_setup_location_save(uuid,uuid,text,text,text,text,text[],timestamptz) to authenticated;
