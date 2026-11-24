-- The 3D house (owner, 24 Nov 2026): v1 of a unit's 3D guide. In the House Builder a host draws the rooms to their real
-- sizes and adds doors, windows, furniture and amenity pins. The house is kept in the unit's guide document as `house`,
-- next to the instructions, the floor plan and the 3D model, so it follows the same draft, publish and restore steps.
-- Guests see it once the guide is published.
--
-- Changes from 20261114000100_host_onboarding.sql:
--   * `house` is allowed in the document: an object with a `rooms` array (at most 40 rooms), or null.
--   * The house has its own size budget (260,000 bytes as jsonb text; the API keeps it to 200,000 characters of JSON).
--     The rest of the document keeps its 170,000-byte limit.
--   * A guide can be published with instructions, or with a house that has at least one room.
-- Everything else is unchanged.
create or replace function public.rpc_host_workspace_guide_commit(
  p_unit_id uuid, p_revision integer, p_action text, p_document jsonb, p_restore_id uuid
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  guide public.host_unit_guide;
  content jsonb;
  publication uuid;
  house jsonb;
  house_rooms integer := 0;
begin
  perform 1 from public.unit where id = p_unit_id and archived_at is null for share;
  if not found or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  insert into public.host_unit_guide(unit_id) values (p_unit_id) on conflict do nothing;
  select * into guide from public.host_unit_guide where unit_id = p_unit_id for update;
  if guide.revision is distinct from p_revision then
    raise exception 'The guide has changed. Reload before saving.' using errcode = '40001';
  end if;

  publication := guide.published_id;
  content := guide.document;
  case p_action
    when 'draft' then content := p_document;
    when 'publish' then null;
    when 'unpublish' then publication := null;
    when 'restore' then
      select document into content from public.host_unit_guide_version
        where id = p_restore_id and unit_id = p_unit_id;
      if not found then
        raise exception 'Choose a published version of this guide.' using errcode = '22023';
      end if;
    else raise exception 'Choose a valid guide action.' using errcode = '22023';
  end case;

  if jsonb_typeof(content) is distinct from 'object'
    or content - array['articles','planId','modelId','house'] <> '{}'::jsonb
    or jsonb_typeof(content -> 'articles') is distinct from 'array'
    or octet_length((content - 'house')::text) > 170000 then
    raise exception 'Check the guide contents.' using errcode = '22023';
  end if;
  if jsonb_array_length(content -> 'articles') > 40 then
    raise exception 'Use up to 40 amenity instructions.' using errcode = '22023';
  end if;

  house := content -> 'house';
  if house is not null and jsonb_typeof(house) <> 'null' then
    if jsonb_typeof(house) <> 'object' or jsonb_typeof(house -> 'rooms') is distinct from 'array' then
      raise exception 'Check the 3D house.' using errcode = '22023';
    end if;
    house_rooms := jsonb_array_length(house -> 'rooms');
    if house_rooms > 40 then
      raise exception 'Use up to 40 rooms in the 3D house.' using errcode = '22023';
    end if;
    if octet_length(house::text) > 260000 then
      raise exception 'This 3D house is too large to save.' using errcode = '22023';
    end if;
  end if;

  if (content ->> 'planId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'planId')::uuid and unit_id = p_unit_id and kind = 'plan'
  )) or (content ->> 'modelId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'modelId')::uuid and unit_id = p_unit_id and kind = 'model'
  )) then
    raise exception 'Choose files attached to this unit.' using errcode = '22023';
  end if;
  if p_action in ('publish','restore') then
    if jsonb_array_length(content -> 'articles') = 0 and house_rooms = 0 then
      raise exception 'Add amenity instructions or the 3D house before publishing.' using errcode = '22023';
    end if;
    insert into public.host_unit_guide_version(unit_id,document) values (p_unit_id,content) returning id into publication;
  end if;
  update public.host_unit_guide set document = content, published_id = publication, revision = guide.revision + 1
    where unit_id = p_unit_id;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.guide_' || p_action,
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('revision', guide.revision + 1, 'published_id', publication));
  return guide.revision + 1;
end;
$$;
