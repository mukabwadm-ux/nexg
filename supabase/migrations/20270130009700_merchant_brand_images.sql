-- Brand logo and banner photo for live businesses.
--
-- The Business page has shown "Change logo" and "Add banner" since the
-- workspace redesign, but a live business could not save either: the page is
-- read-only for live merchants and there was nowhere to keep a logo. The
-- banner already has a home (merchant.cover_photo_path, read by Explore, the
-- home page and Featured as an image URL); the logo gets one alongside it.
--
-- Both are shown to guests, so the bucket is public. Files sit under the
-- merchant's id with an opaque name, and only that merchant's owner or
-- manager can add or remove them. The columns are written only through
-- rpc_merchant_set_brand_image, which accepts nothing but a public URL into
-- this bucket under the caller's own merchant folder.

alter table public.merchant add column if not exists logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-brand', 'merchant-brand', true, 2000000,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

/* Takes text so a storage path that is not a uuid is simply refused. */
create or replace function authz.manages_merchant_brand(p_merchant_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant_user mu
    join public.merchant m on m.id = mu.merchant_id
    where mu.merchant_id::text = p_merchant_id
      and mu.user_id = (select auth.uid())
      and mu.role in ('owner', 'manager')
      and m.deleted_at is null
  )
$$;

revoke all on function authz.manages_merchant_brand(text) from public, anon;
grant execute on function authz.manages_merchant_brand(text) to authenticated, service_role;

drop policy if exists merchant_brand_insert on storage.objects;
create policy merchant_brand_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'merchant-brand'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  and authz.manages_merchant_brand((storage.foldername(name))[1])
);

drop policy if exists merchant_brand_delete on storage.objects;
create policy merchant_brand_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'merchant-brand'
  and name ~ '^[0-9a-f-]{36}/'
  and authz.manages_merchant_brand((storage.foldername(name))[1])
);

/*
 * Set or clear the logo or banner. p_url is the bucket's public URL for a
 * file under the merchant's own folder, or null to remove the image. The
 * previous file is left in the bucket: a guest page cached a moment ago may
 * still point at it.
 */
create or replace function public.rpc_merchant_set_brand_image(
  p_merchant_id uuid,
  p_kind text,
  p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not authz.manages_merchant_brand(p_merchant_id::text) then
    raise exception 'Only the owner or a manager can change the logo or banner.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_kind not in ('logo', 'banner') then
    raise exception 'Choose the logo or the banner.' using errcode = 'invalid_parameter_value';
  end if;

  if p_url is not null and p_url !~ (
    '^https?://[^/]+/storage/v1/object/public/merchant-brand/'
    || p_merchant_id::text || '/[0-9a-f-]{36}[.](jpg|png|webp)$'
  ) then
    raise exception 'That image is not one of this business''s uploads.'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_kind = 'logo' then
    update public.merchant set logo_path = p_url, updated_at = now() where id = p_merchant_id;
  else
    update public.merchant set cover_photo_path = p_url, updated_at = now() where id = p_merchant_id;
  end if;

  perform audit.log('merchant_user'::public.actor_type, 'merchants',
    case when p_kind = 'logo' then 'merchant.logo_changed' else 'merchant.banner_changed' end,
    p_target_type => 'merchant', p_target_id => p_merchant_id);
end;
$$;

revoke all on function public.rpc_merchant_set_brand_image(uuid, text, text) from public, anon;
grant execute on function public.rpc_merchant_set_brand_image(uuid, text, text) to authenticated;
