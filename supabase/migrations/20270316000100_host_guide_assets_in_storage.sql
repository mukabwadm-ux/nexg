-- Guide files go straight to Storage (24 Nov 2026).
--
-- A unit guide's floor plan (PNG, JPEG or WebP, up to 2 MB) and 3D model (GLB, up to 12 MB) used to come through the
-- API as multipart and were stored in host_unit_guide_asset.body. Vercel refuses request bodies over about 4.5 MB, so
-- a scanned apartment model could never upload on the live site. The Hosts Workspace now uses the signed direct upload
-- that host documents and photos use (#219): the API signs an upload for one path, the browser sends the file to the
-- private host-guide-assets bucket, the API downloads and checks it (GLB structure, or the image's magic bytes), and
-- rpc_host_workspace_guide_asset_record records it.
--
-- Changes:
--   * Bucket host-guide-assets: private, 12 MB, GLB and PNG/JPEG/WebP only. The 2 MB plan limit is checked by the API
--     and again by the record RPC.
--   * Paths are <host_id>/<unit_id>/<plan|model>/<sha256>.<glb|png|jpg|webp>. A retry of the same file lands on the
--     same path, and the sha256 matches the existing (unit, kind, digest) de-duplication.
--   * Storage policies: the host members who may write a unit's guide (authz.can_see_unit, as the guide RPCs check)
--     may read and add files under that unit; they may remove a file only while no guide asset records it (a file
--     that failed its checks). Hospitality staff may read. Anyone may read a file the unit's published guide uses,
--     which is what rpc_host_workspace_guide_asset already hands a guest with the QR code.
--   * host_unit_guide_asset keeps its bytes for files stored before this change (body) and points at Storage for new
--     ones (storage_path); exactly one of the two is set. Both stay readable.
--   * rpc_host_workspace_guide_asset returns {mime, base64} for a stored body, or {mime, path} for a Storage file.
--     The API answers a path with a short-lived signed URL.
--     Files stored in body are not moved: Storage keeps its bytes outside the database, so SQL cannot copy them into
--     the bucket. They stay where they are and are served as before until a host replaces them.
--   * host.guide_asset_added (logged by the old and the new RPC) and host.guide_draft, host.guide_publish,
--     host.guide_unpublish and host.guide_restore (logged by rpc_host_workspace_guide_commit, which the new RPC calls
--     to save the draft) are registered in audit.action_registry.
-- rpc_host_workspace_guide_asset_put (the multipart path) is unchanged and keeps working for small files.

-- ═══════════════════════════════════════════════ bucket

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'host-guide-assets',
  'host-guide-assets',
  false,
  12 * 1024 * 1024,
  array['model/gltf-binary', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ═══════════════════════════════════════════════ where an asset's bytes live

alter table public.host_unit_guide_asset
  alter column body drop not null,
  add column if not exists storage_path text,
  add column if not exists size_bytes integer;

alter table public.host_unit_guide_asset
  add constraint host_unit_guide_asset_storage_path_key unique (storage_path),
  add constraint host_unit_guide_asset_one_source check (num_nonnulls(body, storage_path) = 1),
  add constraint host_unit_guide_asset_size check (size_bytes is null or size_bytes between 1 and 12582912);

comment on column public.host_unit_guide_asset.storage_path is
  'The file in the host-guide-assets bucket, for assets uploaded straight to Storage. Null for assets stored in body.';

-- ═══════════════════════════════════════════════ path checks

/*
 * The unit a host-guide-assets path belongs to, or null when the path is not
 * <host_id>/<unit_id>/<plan|model>/<sha256>.<ext> for a unit of that host that
 * is not archived. The extension must suit the kind.
 */
create or replace function authz.guide_asset_path_unit(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_unit uuid;
begin
  if p_name is null or p_name !~ (
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    || '(model/[0-9a-f]{64}\.glb|plan/[0-9a-f]{64}\.(png|jpg|webp))$') then
    return null;
  end if;
  v_host := split_part(p_name, '/', 1)::uuid;
  v_unit := split_part(p_name, '/', 2)::uuid;
  return (select u.id from public.unit u
           where u.id = v_unit and u.host_id = v_host and u.archived_at is null);
end;
$$;

/* May the caller add or read files at this path: a member who may write the unit's guide. */
create or replace function authz.can_write_guide_asset_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(authz.can_see_unit(authz.guide_asset_path_unit(p_name)), false)
$$;

/* A file may be removed by such a member only while no guide asset records it. */
create or replace function authz.can_remove_guide_asset_path(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.can_write_guide_asset_path(p_name)
     and not exists (select 1 from public.host_unit_guide_asset a where a.storage_path = p_name)
$$;

/*
 * True when the file is the plan or model of a unit's published guide that a
 * guest can open by its QR code (the same conditions as
 * rpc_host_workspace_published_guide). Every other guide file stays private.
 */
create or replace function authz.guide_asset_is_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.host_unit_guide_asset a
      join public.host_unit_guide guide on guide.unit_id = a.unit_id
      join public.host_unit_guide_version version
        on version.id = guide.published_id and version.unit_id = guide.unit_id
      join public.unit u on u.id = a.unit_id
      join public.host h on h.id = u.host_id
     where a.storage_path = p_name
       and a.id::text in (version.document ->> 'planId', version.document ->> 'modelId')
       and h.status = 'live' and u.status = 'live' and u.archived_at is null
       and exists (
         select 1 from public.property_qr q
          where q.owner_type = 'unit' and q.owner_id = u.id and q.host_id = u.host_id
            and q.voided_at is null and q.state = 'placed' and q.placed_confirmed_at is not null)
  )
$$;

revoke execute on function authz.guide_asset_path_unit(text), authz.can_write_guide_asset_path(text),
  authz.can_remove_guide_asset_path(text), authz.guide_asset_is_public(text) from public;
grant execute on function authz.guide_asset_path_unit(text), authz.can_write_guide_asset_path(text),
  authz.can_remove_guide_asset_path(text) to authenticated;
grant execute on function authz.guide_asset_is_public(text) to anon, authenticated;

-- ═══════════════════════════════════════════════ storage policies

drop policy if exists host_guide_assets_member_read on storage.objects;
create policy host_guide_assets_member_read on storage.objects
  for select to authenticated
  using (bucket_id = 'host-guide-assets' and authz.can_write_guide_asset_path(name));

drop policy if exists host_guide_assets_member_insert on storage.objects;
create policy host_guide_assets_member_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'host-guide-assets' and authz.can_write_guide_asset_path(name));

/* Only for a file that failed its checks: once recorded, a file stays while the guide may use it. */
drop policy if exists host_guide_assets_member_delete on storage.objects;
create policy host_guide_assets_member_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'host-guide-assets' and authz.can_remove_guide_asset_path(name));

drop policy if exists host_guide_assets_staff_read on storage.objects;
create policy host_guide_assets_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'host-guide-assets' and authz.works_hospitality(null));

drop policy if exists host_guide_assets_public_read on storage.objects;
create policy host_guide_assets_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'host-guide-assets' and authz.guide_asset_is_public(name));

-- ═══════════════════════════════════════════════ recording an uploaded file

/*
 * Attach a file already uploaded to host-guide-assets to the unit's guide
 * draft, with the same checks as rpc_host_workspace_guide_asset_put: the unit
 * is not archived and the caller may write its guide, the draft revision
 * matches, and the file is within its kind's size. The API has already
 * checked the file's contents and its sha256 (p_digest, which is also its
 * file name). The same file attached twice reuses one asset.
 */
create or replace function public.rpc_host_workspace_guide_asset_record(
  p_unit_id uuid, p_revision integer, p_kind text, p_path text, p_digest text
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  guide public.host_unit_guide;
  v_host uuid;
  v_mime text;
  v_size bigint;
  asset_id uuid;
  checksum bytea;
  v_revision integer;
begin
  select host_id into v_host from public.unit where id = p_unit_id and archived_at is null for share;
  if not found or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('plan','model') or p_digest is null or p_digest !~ '^[0-9a-f]{64}$'
    or p_path is null
    or split_part(p_path, '.', 1) <> v_host::text || '/' || p_unit_id::text || '/' || p_kind || '/' || p_digest
    or authz.guide_asset_path_unit(p_path) is distinct from p_unit_id then
    raise exception 'Choose a supported guide file.' using errcode = '22023';
  end if;

  select o.metadata ->> 'mimetype', nullif(o.metadata ->> 'size', '')::bigint into v_mime, v_size
    from storage.objects o where o.bucket_id = 'host-guide-assets' and o.name = p_path;
  if not found then
    raise exception 'Upload the file again.' using errcode = '22023';
  end if;
  if v_mime is null
    or (p_kind = 'model' and v_mime <> 'model/gltf-binary')
    or (p_kind = 'plan' and v_mime not in ('image/png','image/jpeg','image/webp'))
    or p_path not like '%.' || case v_mime
      when 'model/gltf-binary' then 'glb' when 'image/png' then 'png'
      when 'image/jpeg' then 'jpg' when 'image/webp' then 'webp' end
    or v_size is null or v_size < 1 then
    raise exception 'Choose a supported guide file.' using errcode = '22023';
  end if;
  if v_size > (case when p_kind = 'plan' then 2097152 else 12582912 end) then
    raise exception 'This guide file is too large.' using errcode = '22023';
  end if;

  insert into public.host_unit_guide(unit_id) values (p_unit_id) on conflict do nothing;
  select * into guide from public.host_unit_guide where unit_id = p_unit_id for update;
  if guide.revision is distinct from p_revision then
    raise exception 'The guide has changed. Reload before attaching a file.' using errcode = '40001';
  end if;

  checksum := decode(p_digest, 'hex');
  select id into asset_id from public.host_unit_guide_asset
    where unit_id = p_unit_id and kind = p_kind and digest = checksum;
  if asset_id is null then
    insert into public.host_unit_guide_asset(unit_id, kind, mime, digest, storage_path, size_bytes)
      values (p_unit_id, p_kind, v_mime, checksum, p_path, v_size) returning id into asset_id;
  end if;
  v_revision := public.rpc_host_workspace_guide_commit(p_unit_id, p_revision, 'draft',
    jsonb_set(guide.document, array[case when p_kind = 'plan' then 'planId' else 'modelId' end], to_jsonb(asset_id)), null);

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.guide_asset_added',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('asset_id', asset_id, 'kind', p_kind, 'stored', 'storage'));
  return v_revision;
end;
$$;
revoke execute on function public.rpc_host_workspace_guide_asset_record(uuid,integer,text,text,text) from public, anon;
grant execute on function public.rpc_host_workspace_guide_asset_record(uuid,integer,text,text,text) to authenticated;

-- ═══════════════════════════════════════════════ reading an asset

/* As 20261113001000_host_workspace_guides.sql, plus {mime, path} for a file in Storage. */
create or replace function public.rpc_host_workspace_guide_asset(p_id uuid, p_code text default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select case when asset.storage_path is not null
    then jsonb_build_object('mime', asset.mime, 'path', asset.storage_path)
    else jsonb_build_object('mime', asset.mime, 'base64', encode(asset.body, 'base64'))
  end
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

-- ═══════════════════════════════════════════════ audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('host.guide_asset_added', 'hotels', 'info', false, 'Host attached a floor plan or 3D model to a unit guide draft'),
  ('host.guide_draft', 'hotels', 'info', false, 'Host saved a unit guide draft'),
  ('host.guide_publish', 'hotels', 'info', false, 'Host published a unit guide'),
  ('host.guide_unpublish', 'hotels', 'info', false, 'Host unpublished a unit guide'),
  ('host.guide_restore', 'hotels', 'info', false, 'Host restored an earlier published unit guide')
on conflict (action) do nothing;
