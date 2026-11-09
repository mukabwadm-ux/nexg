-- Host onboarding: an account on apply, documents before approval, and no
-- listing changes until NexG approves the host.
--
-- Before this, rpc_host_apply created a host that nobody could sign in to
-- (nothing ever inserted into host_user), let any anonymous caller overwrite
-- an existing host's email by reusing its phone number, and rpc_host_verify
-- made a host live with no documents on file.

-- ════════════════════════════════════════════ 1. apply = account + host
create or replace function public.rpc_host_apply(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host;
  v_unit public.unit;
  v_phone text := nullif(trim(p_payload ->> 'phone'), '');
  v_email text := nullif(lower(trim(coalesce(p_payload ->> 'email', ''))), '');
  v_name text := nullif(trim(coalesce(p_payload ->> 'contact_name', p_payload ->> 'display_name', '')), '');
  v_address text := nullif(trim(coalesce(p_payload ->> 'address', '')), '');
  v_handoff public.handoff_mode := nullif(p_payload ->> 'handoff', '')::public.handoff_mode;
  v_city uuid;
  v_reference text;
  v_ticket_id uuid;
  v_body text;
begin
  /* The applicant holds a session (anonymous until they verify their email),
     so the host they create is theirs from the first moment. */
  if v_uid is null then
    raise exception 'Your session expired. Reload the page and try again.' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'We need a name to put on the QR pack.' using errcode = '22023';
  end if;
  if v_phone is null then
    raise exception 'A phone number is how we reach you about your guests.' using errcode = '22023';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter the email address you will sign in with.' using errcode = '22023';
  end if;
  if v_address is null then
    raise exception 'Where is the unit?' using errcode = '22023';
  end if;
  if v_handoff is null then
    raise exception 'Choose how riders should hand over.' using errcode = '22023';
  end if;

  if exists (select 1 from public.host_user where user_id = v_uid) then
    raise exception 'This account already has a host workspace. Sign in to continue.'
      using errcode = '23505';
  end if;
  /* Never update an existing host from an anonymous form: the old upsert let
     anyone who knew a host's phone number replace its email address. */
  if exists (select 1 from public.host where phone = v_phone) then
    raise exception 'That phone number is already registered with NexG. Sign in, or contact support to recover the account.'
      using errcode = '23505';
  end if;

  select id into v_city from public.city
  where slug = coalesce(p_payload ->> 'city', 'nairobi');

  insert into public.host (
    kind, display_name, contact_name, phone, email, city_id,
    listing_link, units_declared_band, default_handoff, submitted_at, onboarding_step
  )
  values (
    coalesce((p_payload ->> 'kind')::public.host_kind, 'single_unit'),
    nullif(trim(coalesce(p_payload ->> 'display_name', '')), ''),
    v_name, v_phone, v_email, v_city,
    nullif(trim(coalesce(p_payload ->> 'listing_link', '')), ''),
    nullif(p_payload ->> 'units_band', ''),
    v_handoff, now(), 2
  )
  returning * into v_host;

  insert into public.host_user (host_id, user_id, role, accepted_at)
  values (v_host.id, v_uid, 'owner', now());

  /* The first unit, from the address they typed. Unit edits are locked until
     approval (see tg_host_listing_lock), so this one insert is let through. */
  perform pg_catalog.set_config('nexg.host_listing_unlock', 'on', true);
  insert into public.unit (host_id, name, label_public, address_line, city_id, handoff)
  values (
    v_host.id,
    coalesce(nullif(trim(coalesce(p_payload ->> 'unit_name', '')), ''), 'Unit 1'),
    nullif(trim(coalesce(p_payload ->> 'unit_name', '')), ''),
    v_address, v_city, v_handoff
  )
  returning * into v_unit;
  perform pg_catalog.set_config('nexg.host_listing_unlock', 'off', true);

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.applied',
    p_actor_id => v_uid,
    p_target_type => 'host', p_target_id => v_host.id, p_city_id => v_city,
    p_after => jsonb_build_object('kind', v_host.kind, 'units_band', v_host.units_declared_band));

  v_body := coalesce(v_name, 'A host') || ' has asked to list ' || v_address || ' with NexG.';
  v_reference := 'NX-T-' || nextval('public.support_ticket_reference_seq')::text;

  insert into public.support_ticket (
    reference, channel, from_role, topic, full_name, email, phone,
    body, details, source_form, city_id
  )
  values (
    v_reference, 'web_form', 'hotel', 'hotel_partnership',
    v_name, v_email, v_phone, v_body,
    jsonb_strip_nulls(jsonb_build_object(
      'host_id', v_host.id,
      'kind', v_host.kind,
      'units_band', v_host.units_declared_band,
      'handoff', v_host.default_handoff,
      'listing_link', v_host.listing_link,
      'address', v_address,
      'city', (select c.name from public.city c where c.id = v_city)
    )),
    'host_landing', v_city
  )
  returning id into v_ticket_id;

  perform audit.log('host_user'::public.actor_type, 'support', 'support.ticket_created',
    p_actor_id => v_uid,
    p_target_type => 'support_ticket', p_target_id => v_ticket_id, p_city_id => v_city,
    p_after => jsonb_build_object('reference', v_reference, 'topic', 'hotel_partnership',
      'from', 'hotel', 'host_id', v_host.id));

  return jsonb_build_object(
    'ok', true,
    'host_id', v_host.id,
    'unit_id', v_unit.id,
    'ticket_reference', v_reference);
end;
$$;

revoke execute on function public.rpc_host_apply(jsonb) from public, anon;
grant execute on function public.rpc_host_apply(jsonb) to authenticated;

-- ═══════════════════════════════════ 2. no listing changes until approved
create or replace function public.tg_host_listing_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid := coalesce(new.host_id, old.host_id);
  v_uid uuid := auth.uid();
begin
  if v_uid is null
    or authz.staff_id() is not null
    or pg_catalog.current_setting('nexg.host_listing_unlock', true) = 'on' then
    return coalesce(new, old);
  end if;
  if exists (
    select 1 from public.host h
    join public.host_user member on member.host_id = h.id and member.user_id = v_uid
    where h.id = v_host and h.status in ('applied', 'verifying')
  ) then
    raise exception 'Your account is under review. You can add or change properties and units once NexG approves your documents.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger property_host_listing_lock
  before insert or update or delete on public.property
  for each row execute function public.tg_host_listing_lock();
create trigger unit_host_listing_lock
  before insert or update or delete on public.unit
  for each row execute function public.tg_host_listing_lock();

-- ═══════════════════════════════════════════════════ 3. host documents
create table public.host_document (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host(id) on delete cascade,
  kind text not null check (kind in ('id_document', 'authority', 'kra_pin', 'business_registration')),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  status text not null default 'uploaded' check (status in ('uploaded', 'approved', 'rejected')),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 500),
  uploaded_by uuid not null,
  uploaded_at timestamptz not null default now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  superseded_at timestamptz,
  check (status <> 'rejected' or rejection_reason is not null)
);
create index host_document_current on public.host_document(host_id, kind) where superseded_at is null;

alter table public.host_document enable row level security;
revoke all on public.host_document from anon, authenticated;
grant select on public.host_document to authenticated;
create policy host_document_read on public.host_document for select to authenticated
  using (
    exists (
      select 1 from public.host_user member
      where member.host_id = host_document.host_id and member.user_id = (select auth.uid())
        and member.units is null
    )
    or authz.works_hospitality((select h.city_id from public.host h where h.id = host_document.host_id))
  );

/* Documents live in the existing private partner-documents bucket under
   host/<host_id>/...; these add a host branch to its two path checks. */
create or replace function authz.owns_document_path(p_path text)
returns boolean
language plpgsql
stable security definer
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
  elsif v_owner_type = 'host' then
    return exists (
      select 1 from public.host_user member
      where member.host_id = v_owner_id and member.user_id = (select auth.uid())
        and member.units is null
    );
  end if;

  return false;
end;
$$;

create or replace function authz.can_review_document_path(p_path text)
returns boolean
language plpgsql
stable security definer
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
  elsif v_owner_type = 'host' then
    select h.city_id into v_city from public.host h where h.id = v_owner_id;
    return authz.works_hospitality(v_city);
  end if;

  return false;
end;
$$;

/* Records an object the host already uploaded to its own folder. */
create function public.rpc_host_document_add(
  p_host_id uuid, p_kind text, p_storage_path text, p_file_name text, p_mime text, p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status public.host_status;
  v_id uuid;
begin
  if not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = v_uid and member.units is null
  ) then
    raise exception 'Only the account owner or a full-access manager can upload documents.'
      using errcode = '42501';
  end if;
  select status into v_status from public.host where id = p_host_id for update;
  if v_status not in ('applied', 'verifying', 'live') then
    raise exception 'Documents cannot be changed on this account. Contact NexG support.'
      using errcode = '22023';
  end if;
  if p_storage_path not like 'host/' || p_host_id::text || '/%' or not exists (
    select 1 from storage.objects o where o.bucket_id = 'partner-documents' and o.name = p_storage_path
  ) then
    raise exception 'Upload the file again.' using errcode = '22023';
  end if;

  update public.host_document set superseded_at = now()
  where host_id = p_host_id and kind = p_kind and superseded_at is null;

  insert into public.host_document (host_id, kind, storage_path, file_name, mime, size_bytes, uploaded_by)
  values (p_host_id, p_kind, p_storage_path, left(trim(p_file_name), 200), p_mime, p_size_bytes, v_uid)
  returning id into v_id;

  /* A new file after a rejection goes back to the review queue only when the
     host asks for review again. */
  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.document_uploaded',
    p_actor_id => v_uid, p_target_type => 'host', p_target_id => p_host_id,
    p_after => jsonb_build_object('kind', p_kind, 'document_id', v_id));
  return v_id;
exception
  when check_violation then
    raise exception 'Upload a PDF or photo (JPEG, PNG, WebP or HEIC) up to 10 MB.' using errcode = '22023';
end;
$$;

/* Required before review: ID or passport, and proof of authority to let. */
create function public.fn_host_documents_missing(p_host_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(required.kind order by required.sort), '{}')
  from (values ('id_document', 1), ('authority', 2)) as required(kind, sort)
  where not exists (
    select 1 from public.host_document d
    where d.host_id = p_host_id and d.kind = required.kind
      and d.superseded_at is null and d.status <> 'rejected'
  )
$$;

create function public.rpc_host_documents_submit(p_host_id uuid)
returns public.host_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host;
  v_missing text[];
begin
  if not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = v_uid and member.units is null
  ) then
    raise exception 'Only the account owner or a full-access manager can submit documents.'
      using errcode = '42501';
  end if;
  select * into v_host from public.host where id = p_host_id for update;
  if v_host.status = 'verifying' then
    return v_host.status;
  end if;
  if v_host.status <> 'applied' then
    raise exception 'This account is not waiting for documents.' using errcode = '22023';
  end if;
  v_missing := public.fn_host_documents_missing(p_host_id);
  if cardinality(v_missing) > 0 then
    raise exception 'Upload your ID or passport and proof of authority to let the property first.'
      using errcode = '22023';
  end if;

  update public.host
  set status = 'verifying', status_reason = null, verification_submitted_at = now(), updated_at = now()
  where id = p_host_id
  returning * into v_host;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.documents_submitted',
    p_actor_id => v_uid, p_target_type => 'host', p_target_id => p_host_id,
    p_city_id => v_host.city_id);
  return v_host.status;
end;
$$;

create function public.rpc_host_document_review(p_document_id uuid, p_approve boolean, p_reason text default null)
returns public.host_document
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.host_document;
  v_host public.host;
  v_staff uuid := authz.staff_id();
begin
  select * into v_doc from public.host_document where id = p_document_id for update;
  if v_doc.id is null then
    raise exception 'No such document.' using errcode = 'no_data_found';
  end if;
  select * into v_host from public.host where id = v_doc.host_id for update;
  if v_staff is null or not authz.works_hospitality(v_host.city_id) then
    raise exception 'You do not review documents for this host.' using errcode = '42501';
  end if;
  if v_doc.superseded_at is not null then
    raise exception 'The host has uploaded a newer file. Review that one.' using errcode = '22023';
  end if;
  if not p_approve and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'Tell the host what to fix.' using errcode = '22023';
  end if;

  update public.host_document set
    status = case when p_approve then 'approved' else 'rejected' end,
    rejection_reason = case when p_approve then null else trim(p_reason) end,
    reviewed_by = v_staff, reviewed_at = now()
  where id = p_document_id
  returning * into v_doc;

  /* A rejected required document sends the host back to fix and resubmit. */
  if not p_approve and v_doc.kind in ('id_document', 'authority') and v_host.status = 'verifying' then
    update public.host
    set status = 'applied', status_reason = 'Documents need changes: ' || trim(p_reason), updated_at = now()
    where id = v_host.id;
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels',
    case when p_approve then 'host.document_approved' else 'host.document_rejected' end,
    p_target_type => 'host', p_target_id => v_host.id, p_city_id => v_host.city_id,
    p_after => jsonb_build_object('document_id', v_doc.id, 'kind', v_doc.kind),
    p_reason => nullif(trim(coalesce(p_reason, '')), ''));
  return v_doc;
end;
$$;

revoke execute on function public.rpc_host_document_add(uuid, text, text, text, text, bigint),
  public.rpc_host_documents_submit(uuid),
  public.rpc_host_document_review(uuid, boolean, text),
  public.fn_host_documents_missing(uuid) from public, anon;
grant execute on function public.rpc_host_document_add(uuid, text, text, text, text, bigint),
  public.rpc_host_documents_submit(uuid),
  public.rpc_host_document_review(uuid, boolean, text),
  public.fn_host_documents_missing(uuid) to authenticated;

-- ═══════════════════════════════════════ 4. approval needs the documents
create or replace function public.rpc_host_verify(p_host_id uuid, p_method text, p_evidence jsonb default '{}'::jsonb)
returns public.host
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host public.host;
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours to verify.' using errcode = 'insufficient_privilege';
  end if;
  if p_method not in ('listing_ownership', 'id_document', 'call') then
    raise exception 'Verification is listing ownership, an ID document, or a call.'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from (values ('id_document'), ('authority')) as required(kind)
    where not exists (
      select 1 from public.host_document d
      where d.host_id = p_host_id and d.kind = required.kind
        and d.superseded_at is null and d.status = 'approved'
    )
  ) then
    raise exception 'Approve the host''s ID or passport and proof of authority before activating the account.'
      using errcode = 'check_violation';
  end if;

  update public.host set
    status = 'live',
    status_reason = null,
    verified_at = now(),
    verified_by = authz.staff_id(),
    verification = jsonb_build_object('method', p_method, 'at', now()) || p_evidence,
    went_live_at = coalesce(went_live_at, now())
  where id = p_host_id and status in ('applied', 'verifying')
  returning * into v_host;

  if v_host.id is null then
    raise exception 'That host is not waiting to be verified.' using errcode = 'no_data_found';
  end if;

  /* Units flip on their own readiness, not on the host's. */
  update public.unit u set status = 'live'
  where u.host_id = p_host_id
    and u.status = 'setting_up'
    and u.address_line is not null
    and u.handoff is not null
    and (u.handoff not in ('leave_with_askari', 'caretaker') or u.caretaker_confirmed_at is not null);

  insert into public.notification (kind, status) values ('host_verified', 'pending');

  perform audit.log('staff'::public.actor_type, 'hotels', 'host.verified',
    p_target_type => 'host', p_target_id => p_host_id, p_city_id => v_host.city_id,
    p_after => jsonb_build_object('method', p_method), p_reason => p_evidence ->> 'notes',
    p_severity => 'high'::public.audit_severity);

  return v_host;
end;
$$;

-- ═══════════════════════ 5. after approval, ready units go live on save
create or replace function public.rpc_unit_upsert_guarded(
  p_host_id uuid,
  p_unit jsonb,
  p_unit_id uuid default null
)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_name text := nullif(trim(p_unit ->> 'name'), '');
  v_property_id uuid := nullif(p_unit ->> 'property_id', '')::uuid;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your unit.' using errcode = '42501';
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.property
    where id = v_property_id and host_id = p_host_id and deleted_at is null
    for share
  ) then
    raise exception 'Choose a property on your account.' using errcode = '22023';
  end if;

  if p_unit_id is null and v_name is not null and exists (
    select 1 from public.unit
    where host_id = p_host_id and name = v_name and archived_at is null
  ) then
    raise exception 'You already have a unit called %.', v_name using errcode = '23505';
  end if;

  v_unit := public.rpc_unit_upsert(p_host_id, p_unit, p_unit_id);
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;

  if p_unit ?| array['property_id', 'bedrooms', 'bathrooms', 'max_guests', 'nightly_rate_kes'] then
    update public.unit set
      property_id = coalesce(v_property_id, property_id),
      bedrooms = coalesce(nullif(p_unit ->> 'bedrooms', '')::integer, bedrooms),
      bathrooms = coalesce(nullif(p_unit ->> 'bathrooms', '')::numeric, bathrooms),
      max_guests = coalesce(nullif(p_unit ->> 'max_guests', '')::integer, max_guests),
      nightly_rate_kes = coalesce(nullif(p_unit ->> 'nightly_rate_kes', '')::bigint, nightly_rate_kes)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  /* rpc_host_verify only promotes the units that exist at approval. A unit
     added or completed afterwards goes live here, on the same rule. */
  if v_unit.status = 'setting_up'
    and exists (select 1 from public.host where id = p_host_id and status = 'live')
    and v_unit.address_line is not null
    and v_unit.handoff is not null
    and (v_unit.handoff not in ('leave_with_askari', 'caretaker') or v_unit.caretaker_confirmed_at is not null) then
    update public.unit set status = 'live' where id = v_unit.id returning * into v_unit;
  end if;

  /* rpc_unit_upsert logs the save itself; this records what the wrapper adds
     (portfolio fields and going live), which the wiring check requires. */
  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.portfolio_saved',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_unit.id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('status', v_unit.status, 'property_id', v_unit.property_id));

  return v_unit;
end;
$$;

-- ══════════════ 6. audit the Hosts Workspace writes added in 20261113*
--
-- fn_wiring_check fails any rpc_* that changes state without audit.log.
-- These four from the workspace migrations did, which has kept the
-- database CI job red on main since #79. Bodies are unchanged apart from
-- the audit.log call.

create or replace function public.rpc_host_workspace_photos_set(
  p_kind text, p_id uuid, p_expected jsonb, p_photos jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_current jsonb;
begin
  if p_kind = 'property' then
    select property.host_id, property.photos into v_host, v_current
    from public.property property
    join public.host_user member on member.host_id = property.host_id
    where property.id = p_id and property.deleted_at is null
      and member.user_id = (select auth.uid()) and member.units is null
    for update of property;
  elsif p_kind = 'unit' then
    select unit.host_id, unit.photos into v_host, v_current
    from public.unit unit
    where unit.id = p_id and unit.archived_at is null and authz.can_see_unit(unit.id)
    for update;
  end if;

  if v_host is null then
    raise exception 'This gallery is outside your workspace access.' using errcode = '42501';
  end if;
  if coalesce(v_current, '[]'::jsonb) is distinct from coalesce(p_expected, '[]'::jsonb) then
    raise exception 'The gallery changed. Reload it and try again.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_photos) is distinct from 'array' or exists (
    select 1 from jsonb_array_elements(p_photos) as item
    where coalesce(item ->> 'path', '') = ''
      or (split_part(item ->> 'path','/',1) <> v_host::text and not exists (
        select 1 from jsonb_array_elements(coalesce(v_current,'[]'::jsonb)) as previous
        where previous ->> 'path' = item ->> 'path'
      ))
  ) then
    raise exception 'Choose photos from this gallery.' using errcode = '22023';
  end if;

  if p_kind = 'property' then
    perform public.rpc_property_photos_set(p_id,p_photos);
  else
    perform public.rpc_unit_photos_set(p_id,p_photos);
  end if;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.gallery_saved',
    p_actor_id => auth.uid(), p_target_type => p_kind, p_target_id => p_id,
    p_after => jsonb_build_object('photos', jsonb_array_length(p_photos)));
end;
$$;

create or replace function public.rpc_host_workspace_task_save(p_id uuid, p_unit_id uuid, p_version integer default null, p_patch jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  task public.host_workspace_task;
  account uuid;
  zone text;
  actor uuid := (select auth.uid());
begin
  select host_id into account from public.unit where id = p_unit_id and archived_at is null for share;
  if account is null or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or
    p_patch - array['stay_id','assignee_id','title','kind','due_at','priority','status','checklist','completed_checks','evidence','comments','cadence','inspection'] <> '{}'::jsonb then
    raise exception 'Check the task details.' using errcode = '22023';
  end if;
  select * into task from public.host_workspace_task where id = p_id for update;
  if found then
    if task.unit_id <> p_unit_id then
      raise exception 'This task is outside your workspace access.' using errcode = '42501';
    end if;
    if p_version is null and task.created_by = actor then return; end if;
    if task.version is distinct from p_version then
      raise exception 'This task has changed. Reload and try again.' using errcode = '40001';
    end if;
  elsif p_version is not null then
    raise exception 'This task could not be found.' using errcode = '42501';
  end if;

  task := jsonb_populate_record(task, p_patch);
  if task.stay_id is not null and not exists (
    select 1 from public.stay where id = task.stay_id and unit_id = p_unit_id for share
  ) then
    raise exception 'Choose a reservation for this unit.' using errcode = '22023';
  end if;
  if (task.assignee_id is not null or task.status in ('In progress','Done')) and not exists (
    select 1 from public.host_user where host_id = account and user_id = task.assignee_id
      and accepted_at is not null and (units is null or p_unit_id = any(units)) for share
  ) then
    raise exception 'Choose an active team member with access to this unit.' using errcode = '22023';
  end if;
  if task.status = 'Done' and not coalesce(task.checklist,'{}') <@ coalesce(task.completed_checks,'{}') then
    raise exception 'Complete every checklist item before finishing the task.' using errcode = '22023';
  end if;
  if task.status = 'Done' and (task.inspection or task.kind in ('Cleaning','Inspection')) and coalesce(task.evidence,'') = '' then
    raise exception 'Add completion evidence before finishing this task.' using errcode = '22023';
  end if;

  insert into public.host_workspace_task as previous (
    id, unit_id, created_by, stay_id, assignee_id, title, kind, due_at, priority, status, checklist,
    completed_checks, evidence, comments, cadence, inspection
  ) values (
    p_id, p_unit_id, actor, task.stay_id, task.assignee_id, task.title, task.kind, task.due_at,
    coalesce(task.priority,'Normal'), coalesce(task.status,'To do'), coalesce(task.checklist,'{}'),
    coalesce(task.completed_checks,'{}'), coalesce(task.evidence,''), coalesce(task.comments,''),
    coalesce(task.cadence,'None'), coalesce(task.inspection,false)
  ) on conflict (id) do update set
    stay_id = excluded.stay_id, assignee_id = excluded.assignee_id, title = excluded.title, kind = excluded.kind,
    due_at = excluded.due_at, priority = excluded.priority, status = excluded.status,
    checklist = excluded.checklist, completed_checks = excluded.completed_checks, evidence = excluded.evidence,
    comments = excluded.comments, cadence = excluded.cadence, inspection = excluded.inspection,
    version = previous.version + 1, updated_at = now()
  where previous.version = p_version;
  if not found and not (p_version is null and exists (
    select 1 from public.host_workspace_task where id = p_id and unit_id = p_unit_id and created_by = actor
  )) then
    raise exception 'This task has changed. Reload and try again.' using errcode = '40001';
  end if;
  if task.status = 'Done' and task.cadence in ('Weekly','Monthly') then
    select time_zone into zone from public.host where id = account;
    if zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
      zone := 'Africa/Nairobi';
    end if;
    insert into public.host_workspace_task (
      id, unit_id, repeat_of, assignee_id, created_by, title, kind, due_at, priority, checklist, cadence, inspection
    ) values (
      gen_random_uuid(), p_unit_id, p_id, task.assignee_id, actor, task.title, task.kind,
      (task.due_at at time zone zone + case task.cadence when 'Weekly' then interval '1 week' else interval '1 month' end) at time zone zone,
      coalesce(task.priority,'Normal'), coalesce(task.checklist,'{}'), task.cadence, coalesce(task.inspection,false)
    ) on conflict (repeat_of) do nothing;
  end if;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.task_saved',
    p_actor_id => actor, p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('task_id', p_id, 'status', coalesce(task.status, 'To do'), 'kind', task.kind));
end;
$$;

create or replace function public.rpc_host_workspace_guide_commit(
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

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.guide_' || p_action,
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('revision', guide.revision + 1, 'published_id', publication));
  return guide.revision + 1;
end;
$$;

create or replace function public.rpc_host_workspace_guide_asset_put(
  p_unit_id uuid, p_revision integer, p_kind text, p_mime text, p_base64 text
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  guide public.host_unit_guide;
  bytes bytea;
  asset_id uuid;
  checksum bytea;
  v_revision integer;
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
  v_revision := public.rpc_host_workspace_guide_commit(p_unit_id,p_revision,'draft',
    jsonb_set(guide.document, array[case when p_kind = 'plan' then 'planId' else 'modelId' end], to_jsonb(asset_id)), null);

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.guide_asset_added',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('asset_id', asset_id, 'kind', p_kind));
  return v_revision;
end;
$$;
