-- The partner-documents bucket — spec section 3.4.
--
-- Private bucket. Path layout: ${owner_type}/${owner_id}/${requirement_kind}/${uuid}
-- Owners may write inside their own prefix; staff may read within their cities.
-- Every read is a signed URL valid for five minutes, issued by the app.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'partner-documents',
  'partner-documents',
  false,
  10 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/*
 * Does the caller own the partner named in the first two path segments?
 *   storage.foldername(name) -> {owner_type, owner_id, requirement_kind}
 */
create or replace function authz.owns_document_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_owner_type text;
  v_owner_id uuid;
begin
  v_parts := storage.foldername(p_path);
  if array_length(v_parts, 1) < 2 then
    return false;
  end if;

  v_owner_type := v_parts[1];

  -- A path segment is user input; a malformed uuid is a denial, not an error.
  begin
    v_owner_id := v_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_owner_type = 'rider' then
    return exists (
      select 1 from public.rider r
      where r.id = v_owner_id and r.user_id = (select auth.uid())
    );
  elsif v_owner_type = 'merchant' then
    return authz.is_merchant_member(v_owner_id);
  end if;

  return false;
end;
$$;

create or replace function authz.can_review_document_path(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_owner_type text;
  v_owner_id uuid;
  v_city uuid;
begin
  v_parts := storage.foldername(p_path);
  if array_length(v_parts, 1) < 2 then
    return false;
  end if;

  v_owner_type := v_parts[1];

  begin
    v_owner_id := v_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  if v_owner_type = 'rider' then
    select r.city_id into v_city from public.rider r where r.id = v_owner_id;
    return authz.can_manage_riders(v_city);
  elsif v_owner_type = 'merchant' then
    select m.city_id into v_city from public.merchant m where m.id = v_owner_id;
    return authz.can_manage_merchants(v_city);
  end if;

  return false;
end;
$$;

grant execute on function authz.owns_document_path(text) to authenticated, service_role;
grant execute on function authz.can_review_document_path(text) to authenticated, service_role;

-- ------------------------------------------------------------------ policies

create policy partner_documents_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'partner-documents'
    and authz.owns_document_path(name)
  );

create policy partner_documents_owner_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'partner-documents'
    and authz.owns_document_path(name)
  );

create policy partner_documents_staff_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'partner-documents'
    and authz.can_review_document_path(name)
  );

/*
 * Nobody updates or deletes an uploaded document. A replacement is a new
 * object at a new uuid and a new document row; the old file stays so a
 * rejected upload can still be looked at afterwards. Retention is a scheduled
 * job for later, run by service_role, which policies do not constrain.
 */
