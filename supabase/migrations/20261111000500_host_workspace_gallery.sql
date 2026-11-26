-- Serialize edits to a gallery and keep the existing photo RPCs as the write authority.
create function public.rpc_host_workspace_photos_set(
  p_kind text, p_id uuid, p_expected jsonb, p_photos jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_current jsonb;
begin
  if p_kind = 'property' then
    select property.host_id, property.photos into v_host, v_current
    from public.property property
    join public.host_user member on member.host_id = property.host_id
    where property.id = p_id and property.deleted_at is null
      and member.user_id = (select auth.uid()) and member.units is null
    for update of property;
  elsif p_kind = 'unit' then
    select unit.host_id, unit.photos into v_host, v_current
    from public.unit unit
    where unit.id = p_id and unit.archived_at is null and authz.can_see_unit(unit.id)
    for update;
  end if;

  if v_host is null then
    raise exception 'This gallery is outside your workspace access.' using errcode = '42501';
  end if;
  if coalesce(v_current, '[]'::jsonb) is distinct from coalesce(p_expected, '[]'::jsonb) then
    raise exception 'The gallery changed. Reload it and try again.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_photos) is distinct from 'array' or exists (
    select 1 from jsonb_array_elements(p_photos) as item
    where coalesce(item ->> 'path', '') = ''
      or (split_part(item ->> 'path','/',1) <> v_host::text and not exists (
        select 1 from jsonb_array_elements(coalesce(v_current,'[]'::jsonb)) as previous
        where previous ->> 'path' = item ->> 'path'
      ))
  ) then
    raise exception 'Choose photos from this gallery.' using errcode = '22023';
  end if;

  if p_kind = 'property' then
    perform public.rpc_property_photos_set(p_id,p_photos);
  else
    perform public.rpc_unit_photos_set(p_id,p_photos);
  end if;
end;
$$;

revoke execute on function public.rpc_host_workspace_photos_set(text,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.rpc_host_workspace_photos_set(text,uuid,jsonb,jsonb) to authenticated;
