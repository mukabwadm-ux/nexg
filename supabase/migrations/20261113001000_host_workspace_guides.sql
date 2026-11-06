-- Guest guides use the existing unit and QR identifiers. Drafts and old versions are private.
create table public.host_unit_guide (
  unit_id uuid primary key references public.unit(id) on delete cascade,
  revision integer not null default 0,
  document jsonb not null default '{"articles":[]}',
  published_id uuid
);
create table public.host_unit_guide_version (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.host_unit_guide(unit_id) on delete cascade,
  document jsonb not null,
  article_count integer generated always as (jsonb_array_length(document -> 'articles')) stored,
  published_at timestamptz not null default now()
);
create index host_unit_guide_history_idx on public.host_unit_guide_version(unit_id, published_at desc, id);
create table public.host_unit_guide_asset (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.host_unit_guide(unit_id) on delete cascade,
  kind text not null check (kind in ('plan', 'model')),
  mime text not null check (
    kind = 'plan' and mime in ('image/png','image/jpeg','image/webp') or
    kind = 'model' and mime = 'model/gltf-binary'
  ),
  digest bytea not null,
  body bytea not null check (octet_length(body) between 1 and 12582912),
  unique (unit_id, kind, digest)
);
alter table public.host_unit_guide enable row level security;
alter table public.host_unit_guide_version enable row level security;
alter table public.host_unit_guide_asset enable row level security;
revoke all on public.host_unit_guide, public.host_unit_guide_version, public.host_unit_guide_asset from anon, authenticated;
grant select on public.host_unit_guide, public.host_unit_guide_version to authenticated;
create policy host_unit_guide_read on public.host_unit_guide for select to authenticated
  using (authz.can_see_unit(unit_id));
create policy host_unit_guide_history_read on public.host_unit_guide_version for select to authenticated
  using (authz.can_see_unit(unit_id));

create function public.rpc_host_workspace_guide_commit(
  p_unit_id uuid, p_revision integer, p_action text, p_document jsonb, p_restore_id uuid
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  guide public.host_unit_guide;
  content jsonb;
  publication uuid;
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
    or content - array['articles','planId','modelId'] <> '{}'::jsonb
    or jsonb_typeof(content -> 'articles') is distinct from 'array'
    or octet_length(content::text) > 170000 then
    raise exception 'Check the guide contents.' using errcode = '22023';
  end if;
  if jsonb_array_length(content -> 'articles') > 40 then
    raise exception 'Use up to 40 amenity instructions.' using errcode = '22023';
  end if;
  if (content ->> 'planId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'planId')::uuid and unit_id = p_unit_id and kind = 'plan'
  )) or (content ->> 'modelId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'modelId')::uuid and unit_id = p_unit_id and kind = 'model'
  )) then
    raise exception 'Choose files attached to this unit.' using errcode = '22023';
  end if;
  if p_action in ('publish','restore') then
    if jsonb_array_length(content -> 'articles') = 0 then
      raise exception 'Add amenity instructions before publishing.' using errcode = '22023';
    end if;
    insert into public.host_unit_guide_version(unit_id,document) values (p_unit_id,content) returning id into publication;
  end if;
  update public.host_unit_guide set document = content, published_id = publication, revision = guide.revision + 1
    where unit_id = p_unit_id;
  return guide.revision + 1;
end;
$$;
revoke execute on function public.rpc_host_workspace_guide_commit(uuid,integer,text,jsonb,uuid) from public, anon;
grant execute on function public.rpc_host_workspace_guide_commit(uuid,integer,text,jsonb,uuid) to authenticated;

create function public.rpc_host_workspace_guide_asset_put(
  p_unit_id uuid, p_revision integer, p_kind text, p_mime text, p_base64 text
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  guide public.host_unit_guide;
  bytes bytea;
  asset_id uuid;
  checksum bytea;
begin
  perform 1 from public.unit where id = p_unit_id and archived_at is null for share;
  if not found or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  if p_kind not in ('plan','model') or p_base64 is null or length(p_base64) > 16777216 then
    raise exception 'Choose a supported guide file.' using errcode = '22023';
  end if;
  insert into public.host_unit_guide(unit_id) values (p_unit_id) on conflict do nothing;
  select * into guide from public.host_unit_guide where unit_id = p_unit_id for update;
  if guide.revision is distinct from p_revision then
    raise exception 'The guide has changed. Reload before attaching a file.' using errcode = '40001';
  end if;
  bytes := decode(p_base64, 'base64');
  if octet_length(bytes) > (case when p_kind = 'plan' then 2097152 else 12582912 end) then
    raise exception 'This guide file is too large.' using errcode = '22023';
  end if;
  checksum := extensions.digest(bytes, 'sha256');
  select id into asset_id from public.host_unit_guide_asset
    where unit_id = p_unit_id and kind = p_kind and digest = checksum;
  if asset_id is null then
    insert into public.host_unit_guide_asset(unit_id,kind,mime,digest,body)
      values (p_unit_id,p_kind,p_mime,checksum,bytes) returning id into asset_id;
  end if;
  return public.rpc_host_workspace_guide_commit(p_unit_id,p_revision,'draft',
    jsonb_set(guide.document, array[case when p_kind = 'plan' then 'planId' else 'modelId' end], to_jsonb(asset_id)), null);
end;
$$;

create function public.rpc_host_workspace_published_guide(p_code text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('unitName', coalesce(u.label_public, q.label, 'Your unit'),
    'document', version.document, 'publishedAt', version.published_at)
  from public.property_qr q
  join public.unit u on u.id = q.owner_id and u.host_id = q.host_id
  join public.host h on h.id = u.host_id
  join public.host_unit_guide guide on guide.unit_id = u.id
  join public.host_unit_guide_version version on version.id = guide.published_id and version.unit_id = guide.unit_id
  where q.code = upper(trim(p_code)) and q.owner_type = 'unit' and q.voided_at is null
    and q.state = 'placed' and q.placed_confirmed_at is not null
    and h.status = 'live' and u.status = 'live' and u.archived_at is null
$$;

create function public.rpc_host_workspace_guide_asset(p_id uuid, p_code text default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('mime',asset.mime,'base64',encode(asset.body,'base64'))
  from public.host_unit_guide_asset asset
  join public.unit u on u.id = asset.unit_id and u.archived_at is null
  where asset.id = p_id and (
    p_code is null and authz.can_see_unit(asset.unit_id) or
    p_code is not null and p_id::text in (
      select unnest(array[doc ->> 'planId', doc ->> 'modelId'])
      from (select public.rpc_host_workspace_published_guide(p_code) -> 'document' as doc) guide
    )
  )
$$;
revoke execute on function public.rpc_host_workspace_guide_asset_put(uuid,integer,text,text,text) from public, anon;
grant execute on function public.rpc_host_workspace_guide_asset_put(uuid,integer,text,text,text) to authenticated;
revoke execute on function public.rpc_host_workspace_published_guide(text),
  public.rpc_host_workspace_guide_asset(uuid,text) from public;
grant execute on function public.rpc_host_workspace_published_guide(text),
  public.rpc_host_workspace_guide_asset(uuid,text) to anon, authenticated;
