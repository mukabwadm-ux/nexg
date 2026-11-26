-- Keep the existing unit save and its portfolio details in the same transaction.
create or replace function public.rpc_unit_upsert_guarded(
  p_host_id uuid,
  p_unit jsonb,
  p_unit_id uuid default null
)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_name text := nullif(trim(p_unit ->> 'name'), '');
  v_property_id uuid := nullif(p_unit ->> 'property_id', '')::uuid;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your unit.' using errcode = '42501';
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.property
    where id = v_property_id and host_id = p_host_id and deleted_at is null
    for share
  ) then
    raise exception 'Choose a property on your account.' using errcode = '22023';
  end if;

  if p_unit_id is null and v_name is not null and exists (
    select 1 from public.unit
    where host_id = p_host_id and name = v_name and archived_at is null
  ) then
    raise exception 'You already have a unit called %.', v_name using errcode = '23505';
  end if;

  v_unit := public.rpc_unit_upsert(p_host_id, p_unit, p_unit_id);
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;

  if p_unit ?| array['property_id', 'bedrooms', 'bathrooms', 'max_guests', 'nightly_rate_kes'] then
    update public.unit set
      property_id = coalesce(v_property_id, property_id),
      bedrooms = coalesce(nullif(p_unit ->> 'bedrooms', '')::integer, bedrooms),
      bathrooms = coalesce(nullif(p_unit ->> 'bathrooms', '')::numeric, bathrooms),
      max_guests = coalesce(nullif(p_unit ->> 'max_guests', '')::integer, max_guests),
      nightly_rate_kes = coalesce(nullif(p_unit ->> 'nightly_rate_kes', '')::bigint, nightly_rate_kes)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  return v_unit;
end;
$$;
