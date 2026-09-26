-- Recording an uploaded document — spec section 3.2.
--
-- The file lands in storage first (the bucket policies decide whether the
-- caller may write to that prefix), then this records it. Doing it in one
-- function rather than two client statements matters because a re-upload has
-- to supersede the previous version and insert the new one together:
-- `document_current_version` is a unique index, so between those two
-- statements the pair is invalid and a concurrent upload would collide.

create or replace function public.rpc_document_submit(
  p_owner_type public.document_owner_type,
  p_owner_id uuid,
  p_requirement_kind text,
  p_storage_path text,
  p_mime text,
  p_size_bytes bigint,
  p_issued_at date default null,
  p_expires_at date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_requirement public.document_requirement;
  v_owns boolean := false;
  v_previous public.document;
  v_document_id uuid;
begin
  if v_caller is null then
    raise exception 'Sign in to upload a document.' using errcode = 'insufficient_privilege';
  end if;

  /*
   * Ownership, not staff scope: this is the applicant's own upload path.
   * Staff replace a document by asking the partner for it again, so there is
   * deliberately no staff branch here.
   */
  if p_owner_type = 'rider' then
    select exists (
      select 1 from public.rider r where r.id = p_owner_id and r.user_id = v_caller
    ) into v_owns;
  elsif p_owner_type = 'merchant' then
    select authz.is_merchant_member(p_owner_id) into v_owns;
  end if;

  if not v_owns then
    raise exception 'That application is not yours to upload to.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_requirement
  from public.document_requirement
  where owner_type = p_owner_type and kind = p_requirement_kind;

  if v_requirement.id is null then
    raise exception 'We do not ask for a % from a %.', p_requirement_kind, p_owner_type
      using errcode = 'no_data_found';
  end if;

  -- An expiring document is worthless to a reviewer without its date, and the
  -- status gate counts an expired document as missing.
  if v_requirement.has_expiry and p_expires_at is null then
    raise exception 'Enter the expiry date for %.', v_requirement.label
      using errcode = 'check_violation';
  end if;

  if v_requirement.has_expiry and p_expires_at <= current_date then
    raise exception '% has already expired.', v_requirement.label
      using errcode = 'check_violation';
  end if;

  /*
   * The storage path is what the signed URL is later minted from, so it must
   * sit inside this owner's prefix. A caller that owns application A cannot
   * record a path under application B and read it back through the review UI.
   */
  if p_storage_path not like p_owner_type::text || '/' || p_owner_id::text || '/%' then
    raise exception 'That file was not uploaded to your folder.'
      using errcode = 'check_violation';
  end if;

  select * into v_previous
  from public.document
  where owner_type = p_owner_type
    and owner_id = p_owner_id
    and requirement_id = v_requirement.id
    and superseded_at is null;

  if v_previous.id is not null then
    -- A verified document is not replaced on a whim: re-uploading one would
    -- silently drop an approval a reviewer already gave.
    if v_previous.status = 'verified' then
      raise exception '% is already verified.', v_requirement.label
        using errcode = 'check_violation';
    end if;

    update public.document set superseded_at = now() where id = v_previous.id;
  end if;

  insert into public.document (
    owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
    issued_at, expires_at, version
  )
  values (
    p_owner_type, p_owner_id, v_requirement.id, p_storage_path, p_mime, p_size_bytes,
    p_issued_at, p_expires_at, coalesce(v_previous.version, 0) + 1
  )
  returning id into v_document_id;

  perform audit.log(
    p_actor_type => case p_owner_type
      when 'rider' then 'rider'::public.actor_type
      else 'merchant_user'::public.actor_type
    end,
    p_module => 'document',
    p_action => 'document.uploaded',
    p_target_type => 'document',
    p_target_id => v_document_id,
    p_after => jsonb_build_object(
      'owner_type', p_owner_type,
      'owner_id', p_owner_id,
      'kind', p_requirement_kind,
      'version', coalesce(v_previous.version, 0) + 1
    )
  );

  return v_document_id;
end;
$$;

comment on function public.rpc_document_submit is
  'Records a file the applicant has just uploaded, superseding the previous version atomically. The file itself is written to storage first, where the bucket policies decide who may write where.';

grant execute on function public.rpc_document_submit(
  public.document_owner_type, uuid, text, text, text, bigint, date, date
) to authenticated;
