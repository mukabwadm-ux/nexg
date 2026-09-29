-- Two gaps the rider flow found in shared machinery.

/*
 * 1. rpc_document_submit had nowhere to put a side.
 *
 * A national ID is one requirement and two photos, and the submit RPC
 * supersedes "the previous document for this requirement" — so uploading the
 * back of an ID retired the front. The supersede now matches on the side as
 * well, which leaves every other document behaving exactly as before,
 * because their side is null on bothsides of the comparison.
 */
/*
 * Dropped, not replaced. Adding a parameter to `create or replace function`
 * does not replace anything — it declares an overload, and because p_side
 * has a default, a call without it matches both. PostgREST answers that with
 * 300 Multiple Choices, which arrives in the browser as an upload that
 * silently does nothing: the file reaches the bucket and no row is written.
 */
drop function if exists public.rpc_document_submit(
  public.document_owner_type, uuid, text, text, text, bigint, date, date
);

create or replace function public.rpc_document_submit(
  p_owner_type public.document_owner_type,
  p_owner_id uuid,
  p_requirement_kind text,
  p_storage_path text,
  p_mime text,
  p_size_bytes bigint,
  p_issued_at date default null,
  p_expires_at date default null,
  p_side text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.document_requirement;
  v_version integer;
  v_id uuid;
begin
  if p_side is not null and p_side not in ('front', 'back') then
    raise exception 'A document side is front or back.' using errcode = 'check_violation';
  end if;

  select * into v_req
  from public.document_requirement
  where owner_type = p_owner_type and kind = p_requirement_kind;

  if v_req.id is null then
    raise exception 'We do not ask for that document.' using errcode = 'no_data_found';
  end if;

  /* Ownership: the same question each side of the house answers its own way. */
  if p_owner_type = 'merchant' then
    if not authz.is_merchant_member(p_owner_id) then
      raise exception 'That business belongs to someone else.'
        using errcode = 'insufficient_privilege';
    end if;
  else
    if not exists (
      select 1 from public.rider where id = p_owner_id and user_id = (select auth.uid())
    ) then
      raise exception 'That application belongs to someone else.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if v_req.has_expiry and p_expires_at is null then
    raise exception 'Enter the expiry date for %.', v_req.label using errcode = 'check_violation';
  end if;

  if p_expires_at is not null and p_expires_at <= current_date then
    raise exception 'That % expired on %.', v_req.label, p_expires_at
      using errcode = 'check_violation';
  end if;

  update public.document
  set superseded_at = now()
  where owner_type = p_owner_type
    and owner_id = p_owner_id
    and requirement_id = v_req.id
    and coalesce(side, '-') = coalesce(p_side, '-')
    and superseded_at is null;

  select coalesce(max(version), 0) + 1 into v_version
  from public.document
  where owner_type = p_owner_type and owner_id = p_owner_id
    and requirement_id = v_req.id
    and coalesce(side, '-') = coalesce(p_side, '-');

  insert into public.document (
    owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
    issued_at, expires_at, version, side
  )
  values (
    p_owner_type, p_owner_id, v_req.id, p_storage_path, p_mime, p_size_bytes,
    p_issued_at, p_expires_at, v_version, p_side
  )
  returning id into v_id;

  perform audit.log(
    p_actor_type => case when p_owner_type = 'merchant'
                         then 'merchant_user'::public.actor_type
                         else 'rider'::public.actor_type end,
    p_module => case when p_owner_type = 'merchant' then 'merchant' else 'rider' end,
    p_action => 'document.uploaded',
    p_target_type => 'document',
    p_target_id => v_id,
    p_after => jsonb_build_object('kind', p_requirement_kind, 'side', p_side)
  );

  perform public.fn_partner_recompute_status(p_owner_type, p_owner_id);

  return v_id;
end;
$$;

grant execute on function public.rpc_document_submit(
  public.document_owner_type, uuid, text, text, text, bigint, date, date, text
) to authenticated;

/*
 * 2. The WhatsApp chase was merchant-only.
 *
 * rpc_document_request_via_whatsapp took a merchant id and checked merchant
 * membership, so a rider asking us to chase their good conduct certificate
 * got "that business belongs to someone else". One function for both, since
 * the row it writes is the same row.
 */
create or replace function public.rpc_document_request_via_whatsapp(
  p_owner_type public.document_owner_type,
  p_owner_id uuid,
  p_requirement_kind text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.document_requirement;
  v_sender text;
  v_recipient text;
  v_city uuid;
begin
  if p_owner_type = 'merchant' then
    select contact_phone, city_id into v_recipient, v_city
    from public.merchant where id = p_owner_id and authz.is_merchant_member(id);
  else
    select phone, city_id into v_recipient, v_city
    from public.rider where id = p_owner_id and user_id = (select auth.uid());
  end if;

  if v_recipient is null then
    raise exception 'That application belongs to someone else.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_req
  from public.document_requirement
  where owner_type = p_owner_type and kind = p_requirement_kind;

  if v_req.id is null then
    raise exception 'We do not ask for that document.' using errcode = 'no_data_found';
  end if;

  /* One open chase per document. Asking twice should not mean two reminders
     and two inbound photos to reconcile. */
  if exists (
    select 1 from public.document_request
    where owner_type = p_owner_type and owner_id = p_owner_id
      and requirement_id = v_req.id and fulfilled_document_id is null
  ) then
    return jsonb_build_object('already_requested', true);
  end if;

  insert into public.document_request (owner_type, owner_id, requirement_id, channel)
  values (p_owner_type, p_owner_id, v_req.id, 'whatsapp');

  select value #>> '{}' into v_sender
  from public.setting where key = 'whatsapp_provider' and scope = 'global';

  insert into public.notification_log (channel, recipient, template, payload, status)
  values (
    'whatsapp', v_recipient,
    case when p_owner_type = 'merchant' then 'merchant_doc_request' else 'rider_doc_request' end,
    jsonb_build_object('owner_id', p_owner_id, 'document', v_req.label),
    case when v_sender is null then 'skipped' else 'queued' end
  );

  perform audit.log(
    p_actor_type => case when p_owner_type = 'merchant'
                         then 'merchant_user'::public.actor_type
                         else 'rider'::public.actor_type end,
    p_module => case when p_owner_type = 'merchant' then 'merchant' else 'rider' end,
    p_action => 'document.requested_via_whatsapp',
    p_target_type => p_owner_type::text,
    p_target_id => p_owner_id,
    p_after => jsonb_build_object('document', v_req.kind),
    p_city_id => v_city
  );

  return jsonb_build_object('requested', true, 'delivered', v_sender is not null);
end;
$$;

/* The merchant flow calls the two-argument form; keep it working by
   delegating rather than changing every call site. */
create or replace function public.rpc_document_request_via_whatsapp(
  p_merchant_id uuid,
  p_requirement_kind text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.rpc_document_request_via_whatsapp(
    'merchant'::public.document_owner_type, p_merchant_id, p_requirement_kind);
$$;

grant execute on function public.rpc_document_request_via_whatsapp(
  public.document_owner_type, uuid, text) to authenticated;
grant execute on function public.rpc_document_request_via_whatsapp(uuid, text) to authenticated;
