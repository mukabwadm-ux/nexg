insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalogue-images',
  'catalogue-images',
  false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function authz.owns_catalogue_image_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner_text text;
  v_owner_id uuid;
begin
  v_owner_text := (storage.foldername(p_path))[1];
  if v_owner_text is null
    or v_owner_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  v_owner_id := v_owner_text::uuid;
  return authz.is_merchant_member(v_owner_id);
end;
$$;

grant execute on function authz.owns_catalogue_image_path(text) to authenticated;

create policy catalogue_images_merchant_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'catalogue-images'
    and authz.owns_catalogue_image_path(name)
  );

create policy catalogue_images_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'catalogue-images'
    and (
      authz.owns_catalogue_image_path(name)
      or exists (
        select 1
        from public.catalogue_item item
        join public.merchant merchant on merchant.id = item.merchant_id
        where item.photo_path = storage.objects.name
          and merchant.status = 'live'
          and merchant.explore_visible
      )
    )
  );
