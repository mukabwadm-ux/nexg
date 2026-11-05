-- Private offering photos. Draft images must never be publicly readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-offering-media', 'merchant-offering-media', false, 2000000,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- The first two path segments are merchant and offering UUIDs. The name is an
-- opaque UUID, so uploads cannot overwrite an existing merchant's image.
create policy merchant_offering_media_owner_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'merchant-offering-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  and exists (
    select 1 from public.merchant m
    where m.id::text = (storage.foldername(name))[1]
      and authz.merchant_application_owner(m.id)
      and coalesce((authz.merchant_application_access(m.id)->>'setup')::boolean, false)
  )
);
create policy merchant_offering_media_owner_read on storage.objects
for select to authenticated using (
  bucket_id = 'merchant-offering-media'
  and exists (
    select 1 from public.merchant m
    where m.id::text = (storage.foldername(name))[1]
      and authz.merchant_application_owner(m.id)
      and coalesce((authz.merchant_application_access(m.id)->>'setup')::boolean, false)
  )
);

-- Even a direct RPC caller cannot attach an image belonging to another
-- merchant or offering. Signed URLs are never stored in the draft.
alter table public.merchant_setup_offering_detail
  add constraint merchant_setup_offering_media_path_check
  check (not (data ? 'imageStoragePath') or
    (jsonb_typeof(data->'imageStoragePath') = 'string'
     and data->>'imageStoragePath' like merchant_id::text || '/' || item_id::text || '/%')),
  add constraint merchant_setup_offering_no_signed_url_check
  check (not (data ? 'image'));
