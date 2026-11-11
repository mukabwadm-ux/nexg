-- Menu photos could not be shown to visitors.
--
-- catalogue_images_read lets anyone read a photo that belongs to an item of a
-- live, visible merchant. But it checked that by reading public.merchant
-- directly, and visitors cannot read that table, so for anyone not signed in
-- the check failed with "permission denied for table merchant" and no menu
-- photo ever loaded. Signed-in merchants still saw their own photos, which is
-- why this went unnoticed.
--
-- The rule is unchanged. It is now asked through a security-definer helper
-- that answers only "is this path the photo of an item on a live, visible
-- merchant?", the same way authz.owns_catalogue_image_path answers for owners.

create or replace function authz.catalogue_image_is_public(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.catalogue_item item
      join public.merchant merchant on merchant.id = item.merchant_id
     where item.photo_path = p_path
       and merchant.status = 'live'
       and merchant.explore_visible
  );
$$;

comment on function authz.catalogue_image_is_public(text) is
  'True when the path is the photo of a catalogue item on a live, Explore-visible merchant: the photos any visitor may see.';

revoke execute on function authz.catalogue_image_is_public(text) from public;
grant execute on function authz.catalogue_image_is_public(text) to anon, authenticated;

drop policy if exists catalogue_images_read on storage.objects;
create policy catalogue_images_read on storage.objects
  for select to anon, authenticated
  using (
    bucket_id = 'catalogue-images'
    and (
      authz.owns_catalogue_image_path(name)
      or authz.catalogue_image_is_public(name)
    )
  );
