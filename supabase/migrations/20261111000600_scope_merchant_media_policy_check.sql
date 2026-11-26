-- The merchant media policy must be able to call its owner checks.
-- Keep the underlying application authorization functions private.
create function authz.owns_merchant_offering_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchant m
    where m.id::text = (storage.foldername(p_name))[1]
      and authz.merchant_application_owner(m.id)
      and coalesce((authz.merchant_application_access(m.id)->>'setup')::boolean, false)
  )
$$;

revoke execute on function authz.owns_merchant_offering_media(text) from public, anon;
grant execute on function authz.owns_merchant_offering_media(text) to authenticated;

alter policy merchant_offering_media_owner_insert on storage.objects with check (
  bucket_id = 'merchant-offering-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  and authz.owns_merchant_offering_media(name)
);

alter policy merchant_offering_media_owner_read on storage.objects using (
  bucket_id = 'merchant-offering-media'
  and authz.owns_merchant_offering_media(name)
);
