-- The NexG Data Processing Agreement (DPA) in merchant onboarding.
--
-- Next to its merchant agreement, an approved merchant now reads and
-- accepts NexG's Data Processing Agreement from its dashboard (Business ›
-- Documents). The wording is the owner's Word document, kept in
-- packages/contracts/src/merchant-dpa.ts; this records which version a
-- merchant accepted and keeps its filled-in, signed copy.
--
--   * merchant_dpa_version: the published versions, newest current. The
--     version is the publication day plus a short SHA-256 of the wording, as
--     the merchant agreements do (20261124000100). A revised DPA is a new
--     row here and in the code.
--
--   * merchant_dpa_acceptance: one per merchant and version. Who accepted,
--     when, from which address and device (audit.fn_request_context, the
--     same reading the audit trail makes), the account email, the details
--     the DPA's blanks were filled with (the agreement details the merchant
--     already gives for its merchant agreement, its email and phone, and its
--     Annex 1 answers) and, once stored, the signed PDF: path, SHA-256,
--     size, pages and NexG's signatory version. Never edited, except that
--     the copy is attached once.
--
--   * The signed copy is made the way the merchant agreement's is
--     (20270103000100): NexG staff issue it from the admin console, which
--     renders it from what the acceptance recorded (packages/merchant-
--     agreement) on the NexG letterhead with NexG's signatory and signature
--     (Settings › Agreement signing), stores it in the private
--     `merchant-agreements` bucket under dpa/{merchant}/{uuid}.pdf and
--     attaches it with rpc_merchant_dpa_sign_record. It runs as the staff
--     member, so storage and the database check their access as usual; no
--     service role key is involved. Merchant staff upload there; the
--     merchant's members and its staff read the copy an acceptance records.
--
--   * Going live (fn_merchant_go_live_missing) now also waits for the
--     current DPA: "Read and accept the data processing agreement". A
--     business that is already live is not held back; its Documents page
--     offers the DPA to accept.
--
-- Nothing here changes an existing table. Re-runnable.

-- ═══════════════════════════════════════════════════════════════ tables

create table if not exists public.merchant_dpa_version (
  version text primary key check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\+[0-9a-f]{12}$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  published_on date not null,
  created_at timestamptz not null default now()
);

comment on table public.merchant_dpa_version is
  'Published versions of the NexG Data Processing Agreement (wording in packages/contracts/src/merchant-dpa.ts); the newest is the one merchants accept.';

-- Generated from packages/contracts/src/merchant-dpa.ts (DPA_VERSION, DPA_TEXT_SHA256).
insert into public.merchant_dpa_version (version, sha256, published_on)
values ('2026-11-25+acd3d3e54ac5',
        'acd3d3e54ac562e0667529fd03bd22b1e75fabad5e97655d24d20b5baf57d896',
        date '2026-11-25')
on conflict (version) do nothing;

create table if not exists public.merchant_dpa_acceptance (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  version text not null references public.merchant_dpa_version (version),
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz not null default now(),
  account_email text,
  -- Where the acceptance came from: what audit.fn_request_context() read.
  ip inet,
  user_agent text check (user_agent is null or length(user_agent) <= 400),
  device_id text,
  device_label text,
  session_id text,
  -- The values the DPA's blanks were filled with.
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  reference text not null unique check (reference ~ '^NXG-DPA-[A-Z0-9]{12}$'),
  -- The signed copy NexG issued, attached once by rpc_merchant_dpa_sign_record.
  storage_path text unique
    check (storage_path is null or storage_path ~ '^dpa/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer check (bytes is null or bytes > 0),
  pages integer check (pages is null or pages between 1 and 200),
  render_version text check (render_version is null or length(render_version) between 1 and 40),
  signer_id uuid references public.merchant_agreement_signer (id),
  signed_by uuid references public.staff_user (id) on delete set null,
  copy_stored_at timestamptz,
  unique (merchant_id, version),
  check ((storage_path is null) = (copy_stored_at is null)
     and (storage_path is null) = (sha256 is null)
     and (storage_path is null) = (bytes is null)
     and (storage_path is null) = (pages is null)
     and (storage_path is null) = (render_version is null)
     and (storage_path is null) = (signer_id is null))
);
create index if not exists merchant_dpa_acceptance_merchant_idx
  on public.merchant_dpa_acceptance (merchant_id, accepted_at desc);

comment on table public.merchant_dpa_acceptance is
  'Each merchant''s acceptance of a Data Processing Agreement version: who, when, address and device, the details it was filled with, and its signed PDF in the private merchant-agreements bucket. Never edited; the copy is attached once.';

/* An acceptance is a record: only the signed copy may be attached, once. */
create or replace function public.tg_merchant_dpa_acceptance_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.storage_path is null and new.storage_path is not null
     and (to_jsonb(new) - array['storage_path', 'sha256', 'bytes', 'pages', 'render_version',
                                'signer_id', 'signed_by', 'copy_stored_at'])
       = (to_jsonb(old) - array['storage_path', 'sha256', 'bytes', 'pages', 'render_version',
                                'signer_id', 'signed_by', 'copy_stored_at']) then
    return new;
  end if;
  raise exception 'A DPA acceptance is never changed; its signed copy is attached once.'
    using errcode = '42501';
end;
$$;
drop trigger if exists merchant_dpa_acceptance_immutable on public.merchant_dpa_acceptance;
create trigger merchant_dpa_acceptance_immutable
  before update on public.merchant_dpa_acceptance
  for each row execute function public.tg_merchant_dpa_acceptance_immutable();

-- Read through the functions below only: they decide who sees the address
-- and device.
alter table public.merchant_dpa_version enable row level security;
alter table public.merchant_dpa_acceptance enable row level security;
drop policy if exists merchant_dpa_version_read on public.merchant_dpa_version;
create policy merchant_dpa_version_read on public.merchant_dpa_version
  for select to anon, authenticated using (true);
revoke all on public.merchant_dpa_version, public.merchant_dpa_acceptance from anon, authenticated;
grant select on public.merchant_dpa_version to anon, authenticated;

-- ══════════════════════════════════════════════════════════════ storage

/* The merchant a dpa/{merchant}/{file}.pdf path belongs to, or null. */
create or replace function authz.merchant_dpa_path_merchant(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when p_name ~ '^dpa/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.pdf$'
    then split_part(p_name, '/', 2)::uuid
  end;
$$;
revoke all on function authz.merchant_dpa_path_merchant(text) from public, anon;
grant execute on function authz.merchant_dpa_path_merchant(text) to authenticated;

-- 20270103000100, plus dpa/: staff read every copy, the merchant's members
-- the copies its acceptances record. Merchant staff write there (below).
create or replace function authz.merchant_agreement_object_readable(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_merchant uuid := authz.merchant_agreement_path_merchant(p_name);
  v_dpa_merchant uuid;
begin
  if p_name ~ '^signer/' then
    return authz.is_super_admin() or authz.has_role('legal') or authz.can_manage_merchants();
  end if;
  if p_name ~ '^dpa/' then
    v_dpa_merchant := authz.merchant_dpa_path_merchant(p_name);
    return v_dpa_merchant is not null
      and (authz.merchant_application_staff(v_dpa_merchant)
        or (authz.is_merchant_member(v_dpa_merchant)
          and exists (select 1 from public.merchant_dpa_acceptance x where x.storage_path = p_name)));
  end if;
  -- Staff see every upload; the merchant only the copies that were issued.
  return v_merchant is not null
    and (authz.merchant_application_staff(v_merchant)
      or (authz.is_merchant_member(v_merchant)
        and exists (select 1 from public.merchant_agreement_signed s where s.storage_path = p_name)));
end;
$$;

/* Merchant staff upload signed DPAs, as they do signed agreements. */
create or replace function authz.merchant_dpa_object_writable(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_merchant uuid := authz.merchant_dpa_path_merchant(p_name);
begin
  return v_merchant is not null and authz.merchant_application_staff(v_merchant);
end;
$$;
revoke all on function authz.merchant_dpa_object_writable(text) from public, anon;
grant execute on function authz.merchant_dpa_object_writable(text) to authenticated;

drop policy if exists merchant_dpa_staff_insert on storage.objects;
create policy merchant_dpa_staff_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'merchant-agreements' and authz.merchant_dpa_object_writable(name));

/* Only an upload no acceptance records: what a failed signing left behind. */
create or replace function authz.merchant_dpa_object_orphan(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select authz.merchant_dpa_path_merchant(p_name) is not null
    and not exists (select 1 from public.merchant_dpa_acceptance x where x.storage_path = p_name);
$$;
revoke all on function authz.merchant_dpa_object_orphan(text) from public, anon;
grant execute on function authz.merchant_dpa_object_orphan(text) to authenticated;

drop policy if exists merchant_dpa_staff_delete on storage.objects;
create policy merchant_dpa_staff_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'merchant-agreements' and authz.merchant_dpa_object_writable(name)
         and authz.merchant_dpa_object_orphan(name));

-- ══════════════════════════════════════════════════════════════ helpers

/* The DPA version merchants accept now. */
create or replace function public.fn_merchant_dpa_current_version()
returns public.merchant_dpa_version
language sql stable security definer set search_path = '' as $$
  select v from public.merchant_dpa_version v order by v.published_on desc, v.created_at desc limit 1;
$$;

/* The merchant's email and phone for notices, as the merchant agreement uses them. */
create or replace function public.fn_merchant_dpa_contact(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.merchant;
  a public.merchant_application;
begin
  select * into m from public.merchant where id = p_merchant_id;
  select * into a from public.merchant_application where merchant_id = p_merchant_id;
  return jsonb_build_object(
    'email', coalesce(nullif(a.payload #>> '{business,email}', ''), nullif(m.contact_email, '')),
    'phone', case
      when (a.payload #>> '{business,sameBusinessPhone}') = 'false'
        and coalesce(a.payload #>> '{business,businessPhone}', '') <> ''
      then a.payload #>> '{business,businessPhone}'
      else m.contact_phone end);
end;
$$;

revoke all on function public.fn_merchant_dpa_current_version(),
  public.fn_merchant_dpa_contact(uuid),
  public.tg_merchant_dpa_acceptance_immutable() from public, anon, authenticated;

-- ═══════════════════════════════════════════════ the merchant's dashboard

/*
 * The DPA for the merchant's page and for staff: the current version, the
 * merchant's acceptance of it and earlier ones, what the Annex 1 form can
 * start from, and whether the owner can accept now. The address and device
 * an acceptance came from are shown to NexG staff only.
 */
create or replace function public.rpc_merchant_dpa_read(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.merchant;
  p public.merchant_agreement_party;
  v_current public.merchant_dpa_version;
  v_staff boolean;
  v_contact jsonb;
  v_category text;
begin
  if not (authz.is_merchant_member(p_merchant_id) or authz.merchant_application_staff(p_merchant_id)) then
    raise exception 'Not yours to look at.' using errcode = '42501';
  end if;
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    raise exception 'Merchant not found.' using errcode = 'P0002';
  end if;
  v_staff := authz.merchant_application_staff(p_merchant_id);
  v_current := public.fn_merchant_dpa_current_version();
  select * into p from public.merchant_agreement_party where merchant_id = p_merchant_id;
  v_contact := public.fn_merchant_dpa_contact(p_merchant_id);
  v_category := public.fn_merchant_agreement_category(p_merchant_id);

  return jsonb_build_object(
    'version', case when v_current.version is null then null else jsonb_build_object(
      'version', v_current.version, 'sha256', v_current.sha256,
      'published_on', v_current.published_on) end,
    'category', v_category,
    'can_accept', (select auth.uid()) is not null and authz.merchant_application_owner(p_merchant_id),
    'party_ready', p.merchant_id is not null,
    'suggested', jsonb_build_object(
      'dpo_name', coalesce(p.signatory_name, m.contact_name),
      'dpo_email', v_contact ->> 'email',
      'dpo_phone', v_contact ->> 'phone'),
    'accepted', exists (select 1 from public.merchant_dpa_acceptance x
                        where x.merchant_id = p_merchant_id and x.version = v_current.version),
    'acceptances', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'version', x.version, 'current', x.version = v_current.version,
        'accepted_at', x.accepted_at, 'account_email', x.account_email,
        'reference', x.reference, 'details', x.details,
        'storage_path', x.storage_path, 'sha256', x.sha256, 'bytes', x.bytes, 'pages', x.pages,
        'copy_stored_at', x.copy_stored_at,
        'signed_by_nexg', x.signer_id is not null,
        'ip', case when v_staff then host(x.ip) end,
        'device_label', case when v_staff then x.device_label end,
        'user_agent', case when v_staff then x.user_agent end)
        order by x.accepted_at desc)
      from public.merchant_dpa_acceptance x where x.merchant_id = p_merchant_id), '[]'::jsonb)
  );
end;
$$;

/*
 * The owner accepts the current DPA. The details its blanks are filled with
 * are read here, not trusted from the browser: the agreement details the
 * owner saved (merchant_agreement_party), the business email and phone, and
 * the Annex 1 answers sent, checked as MerchantDpaAnnex checks them. Where
 * the call came from is recorded with it. Accepting a version twice changes
 * nothing.
 */
create or replace function public.rpc_merchant_dpa_accept(
  p_merchant_id uuid, p_version text, p_annex jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_current public.merchant_dpa_version;
  p public.merchant_agreement_party;
  v_contact jsonb;
  v_context jsonb := audit.fn_request_context();
  v_id uuid := gen_random_uuid();
  v_email text;
  v_key text;
  v_sensitive text;
  v_dpo_name text;
  v_dpo_email text;
  v_dpo_phone text;
  v_odpc text;
begin
  if (select auth.uid()) is null or not authz.merchant_application_owner(p_merchant_id) then
    raise exception 'Only the business owner can accept the data processing agreement.'
      using errcode = '42501';
  end if;
  v_current := public.fn_merchant_dpa_current_version();
  if v_current.version is null or v_current.version is distinct from p_version then
    raise exception 'The data processing agreement has changed. Reload the page and read it again.'
      using errcode = '40001';
  end if;
  if jsonb_typeof(p_annex) is distinct from 'object' then
    raise exception 'Send the Annex 1 details.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_annex) loop
    if v_key not in ('sensitive_data', 'dpo_name', 'dpo_email', 'dpo_phone', 'odpc_registration') then
      raise exception 'Unknown Annex 1 detail: %.', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(p_annex -> v_key) not in ('string', 'null') then
      raise exception 'Annex 1 details are text.' using errcode = '22023';
    end if;
  end loop;

  v_sensitive := public.fn_merchant_agreement_text(p_annex ->> 'sensitive_data');
  v_dpo_name := public.fn_merchant_agreement_text(p_annex ->> 'dpo_name');
  v_dpo_email := lower(public.fn_merchant_agreement_text(p_annex ->> 'dpo_email'));
  v_dpo_phone := public.fn_merchant_agreement_text(p_annex ->> 'dpo_phone');
  v_odpc := public.fn_merchant_agreement_text(p_annex ->> 'odpc_registration');
  if v_sensitive is null or length(v_sensitive) not between 2 and 300 then
    raise exception 'Say which sensitive personal data you handle, or “None”.' using errcode = '22023';
  end if;
  if v_dpo_name is null or length(v_dpo_name) not between 2 and 120 then
    raise exception 'Enter the name of your data protection officer or compliance contact.'
      using errcode = '22023';
  end if;
  if v_dpo_email is null or length(v_dpo_email) > 254
     or v_dpo_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email for your compliance contact.' using errcode = '22023';
  end if;
  if v_dpo_phone is null or v_dpo_phone !~ '^\+?[0-9][0-9 ]{7,19}$' then
    raise exception 'Enter your compliance contact’s phone in digits, for example +254 700 000 000.'
      using errcode = '22023';
  end if;
  if v_odpc is not null and length(v_odpc) > 60 then
    raise exception 'Enter the registration number from your Data Commissioner certificate, or leave it empty.'
      using errcode = '22023';
  end if;

  -- One acceptance at a time per merchant.
  perform 1 from public.merchant where id = p_merchant_id for update;
  if exists (select 1 from public.merchant_dpa_acceptance x
             where x.merchant_id = p_merchant_id and x.version = v_current.version) then
    return public.rpc_merchant_dpa_read(p_merchant_id);
  end if;
  select * into p from public.merchant_agreement_party where merchant_id = p_merchant_id;
  if p.merchant_id is null then
    raise exception 'Save your details for the agreement first: the DPA is filled in with them.'
      using errcode = '55000';
  end if;
  v_contact := public.fn_merchant_dpa_contact(p_merchant_id);
  if coalesce(v_contact ->> 'email', '') = '' then
    raise exception 'Your business has no email for notices. Contact NexG to add one.'
      using errcode = '55000';
  end if;
  select u.email into v_email from auth.users u where u.id = (select auth.uid());

  insert into public.merchant_dpa_acceptance (id, merchant_id, version, accepted_by, account_email,
    ip, user_agent, device_id, device_label, session_id, details, reference)
  values (v_id, p_merchant_id, v_current.version, (select auth.uid()), v_email,
    audit.fn_inet(v_context ->> 'ip'), v_context ->> 'user_agent', v_context ->> 'device_id',
    v_context ->> 'device_label', v_context ->> 'session_id',
    jsonb_build_object(
      'legal_name', p.legal_name, 'registration_number', p.registration_number,
      'kra_pin', p.kra_pin, 'address', p.address, 'postal_address', p.postal_address,
      'signatory_name', p.signatory_name, 'signatory_title', p.signatory_title,
      'email', v_contact ->> 'email', 'phone', v_contact ->> 'phone',
      'category', public.fn_merchant_agreement_category(p_merchant_id),
      'annex', jsonb_build_object('sensitive_data', v_sensitive, 'dpo_name', v_dpo_name,
        'dpo_email', v_dpo_email, 'dpo_phone', v_dpo_phone, 'odpc_registration', v_odpc)),
    'NXG-DPA-' || upper(left(replace(v_id::text, '-', ''), 12)));

  perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'merchant.dpa_accepted', p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('version', v_current.version, 'acceptance_id', v_id));
  return public.rpc_merchant_dpa_read(p_merchant_id);
end;
$$;

-- ═══════════════════════════════════════════════════════════ signing

/*
 * Everything the console needs to sign a merchant's DPA, and what is still
 * missing: the merchant's acceptance of the current version, and NexG's
 * signatory and signature. Merchant staff only: it carries the signature's
 * storage path.
 */
create or replace function public.rpc_merchant_dpa_signing_context(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_current public.merchant_dpa_version;
  x public.merchant_dpa_acceptance;
  s public.merchant_agreement_signer;
  v_missing text[] := '{}';
begin
  if not authz.merchant_application_staff(p_merchant_id) then
    raise exception 'Merchant staff only.' using errcode = '42501';
  end if;
  v_current := public.fn_merchant_dpa_current_version();
  select * into x from public.merchant_dpa_acceptance
    where merchant_id = p_merchant_id and version = v_current.version;
  select * into s from public.merchant_agreement_signer order by created_at desc limit 1;
  if x.id is null then
    v_missing := v_missing || 'The merchant has not accepted the current data processing agreement.'::text;
  end if;
  if s.id is null then
    v_missing := v_missing ||
      'NexG''s signatory and signature are not set up yet (Settings › Agreement signing).'::text;
  end if;
  return jsonb_build_object(
    'ready', cardinality(v_missing) = 0 and x.storage_path is null,
    'missing', to_jsonb(v_missing),
    'acceptance', case when x.id is null then null else jsonb_build_object(
      'id', x.id, 'merchant_id', x.merchant_id, 'version', x.version,
      'sha256', v_current.sha256, 'accepted_at', x.accepted_at,
      'account_email', x.account_email, 'ip', host(x.ip), 'device_label', x.device_label,
      'details', x.details, 'reference', x.reference) end,
    'signer', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'signatory_name', s.signatory_name, 'signatory_title', s.signatory_title,
      'po_box', s.po_box, 'registered_office', s.registered_office, 'email', s.email,
      'phone', s.phone, 'website', s.website, 'signature_path', s.signature_path,
      'signature_type', s.signature_type) end,
    'signed', case when x.storage_path is null then null else jsonb_build_object(
      'storage_path', x.storage_path, 'sha256', x.sha256, 'pages', x.pages,
      'signed_at', x.copy_stored_at, 'reference', x.reference) end);
end;
$$;

/*
 * Records the signed DPA the console rendered and uploaded. Checks again
 * that the acceptance and NexG's signing details are the ones the PDF was
 * made from; reads the file's size and type from storage. An acceptance is
 * signed once, never again.
 */
create or replace function public.rpc_merchant_dpa_sign_record(
  p_merchant_id uuid,
  p_acceptance_id uuid,
  p_signer_id uuid,
  p_storage_path text,
  p_sha256 text,
  p_pages integer,
  p_render_version text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := authz.staff_id();
  v_context jsonb;
  v_meta jsonb;
  x public.merchant_dpa_acceptance;
begin
  if v_staff is null or not authz.merchant_application_staff(p_merchant_id) then
    raise exception 'Merchant staff only.' using errcode = '42501';
  end if;
  -- One signing at a time per merchant.
  perform 1 from public.merchant where id = p_merchant_id for update;
  v_context := public.rpc_merchant_dpa_signing_context(p_merchant_id);
  if v_context -> 'signed' <> 'null'::jsonb then
    if v_context #>> '{signed,storage_path}' = p_storage_path then
      return v_context -> 'signed';
    end if;
    raise exception 'This DPA is already signed; the signed copy is never replaced.'
      using errcode = '23505';
  end if;
  if not (v_context ->> 'ready')::boolean then
    raise exception 'Not ready to sign: %',
      (select string_agg(m, ' ') from jsonb_array_elements_text(v_context -> 'missing') m)
      using errcode = '55000';
  end if;
  if (v_context #>> '{acceptance,id}')::uuid is distinct from p_acceptance_id then
    raise exception 'The merchant''s acceptance changed while signing. Reload and try again.'
      using errcode = '40001';
  end if;
  if (v_context #>> '{signer,id}')::uuid is distinct from p_signer_id then
    raise exception 'NexG''s signing details changed while signing. Reload and try again.'
      using errcode = '40001';
  end if;
  if authz.merchant_dpa_path_merchant(p_storage_path) is distinct from p_merchant_id then
    raise exception 'Store the signed DPA in the merchant''s own folder.' using errcode = '22023';
  end if;
  select o.metadata into v_meta from storage.objects o
    where o.bucket_id = 'merchant-agreements' and o.name = p_storage_path;
  if v_meta is null then
    raise exception 'The signed DPA did not arrive in storage. Try again.' using errcode = 'P0002';
  end if;
  if coalesce(v_meta ->> 'mimetype', '') <> 'application/pdf'
     or coalesce((v_meta ->> 'size')::bigint, 0) not between 1 and 5 * 1024 * 1024 then
    raise exception 'The signed DPA must be a PDF of at most 5 MB.' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_pages is null
     or p_pages not between 1 and 200 or p_render_version is null
     or length(p_render_version) not between 1 and 40 then
    raise exception 'Invalid signed DPA.' using errcode = '22023';
  end if;

  update public.merchant_dpa_acceptance
    set storage_path = p_storage_path, sha256 = p_sha256, bytes = (v_meta ->> 'size')::integer,
        pages = p_pages, render_version = p_render_version, signer_id = p_signer_id,
        signed_by = v_staff, copy_stored_at = now()
    where id = p_acceptance_id
    returning * into x;

  perform audit.log(p_actor_type => 'staff'::public.actor_type, p_actor_id => v_staff,
    p_module => 'merchants', p_action => 'merchant.dpa_signed',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('acceptance_id', x.id, 'version', x.version,
      'reference', x.reference, 'sha256', x.sha256, 'signer_id', x.signer_id));

  return jsonb_build_object('storage_path', x.storage_path, 'sha256', x.sha256,
    'pages', x.pages, 'signed_at', x.copy_stored_at, 'reference', x.reference);
end;
$$;

revoke all on function public.rpc_merchant_dpa_read(uuid),
  public.rpc_merchant_dpa_accept(uuid, text, jsonb),
  public.rpc_merchant_dpa_signing_context(uuid),
  public.rpc_merchant_dpa_sign_record(uuid, uuid, uuid, text, text, integer, text)
  from public, anon;
grant execute on function public.rpc_merchant_dpa_read(uuid),
  public.rpc_merchant_dpa_accept(uuid, text, jsonb),
  public.rpc_merchant_dpa_signing_context(uuid),
  public.rpc_merchant_dpa_sign_record(uuid, uuid, uuid, text, text, integer, text)
  to authenticated;

alter function public.rpc_merchant_dpa_accept(uuid, text, jsonb) set statement_timeout = '5s';
alter function public.rpc_merchant_dpa_sign_record(uuid, uuid, uuid, text, text, integer, text)
  set statement_timeout = '5s';

-- ═══════════════════════════════════════════════════════════ going live

-- fn_merchant_go_live_missing: 20270203009700, plus the Data Processing Agreement.
create or replace function public.fn_merchant_go_live_missing(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  a public.merchant_application;
  v_items jsonb := '[]'::jsonb;
  v_category text;
  v_details int;
  v_agreement public.merchant_agreement;
  v_to_upload int;
  v_to_check int;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;
  select * into a from public.merchant_application where merchant_id = p_merchant_id;

  if a.merchant_id is not null then
    if not (a.review_state = 'approved' and a.approved_revision = a.revision
            and a.submitted_revision = a.revision) then
      v_items := v_items || jsonb_build_object('key', 'application', 'who', 'nexg',
        'label', 'NexG approves your application');
    end if;

    v_category := public.fn_merchant_onboarding_category(p_merchant_id);
    v_details := jsonb_array_length(public.fn_merchant_onboarding_missing_for(
      v_category,
      coalesce((select oa.answers from public.merchant_onboarding_answer oa
                where oa.merchant_id = p_merchant_id), '{}'::jsonb)));
    if v_details > 0 then
      v_items := v_items || jsonb_build_object('key', 'onboarding_details', 'who', 'merchant',
        'label', 'Onboarding details', 'count', v_details);
    end if;

    if not exists (
      select 1 from public.merchant_agreement_party p
      where p.merchant_id = p_merchant_id
        and nullif(trim(coalesce(p.registration_number, '')), '') is not null
    ) then
      v_items := v_items || jsonb_build_object('key', 'agreement_details', 'who', 'merchant',
        'label', 'Your details for the agreement');
    end if;

    v_agreement := public.fn_merchant_agreement_for_category(public.fn_merchant_agreement_category(p_merchant_id));
    if v_agreement.id is not null and not exists (
      select 1 from public.merchant_agreement_acceptance x
      where x.merchant_id = p_merchant_id and x.agreement_id = v_agreement.id
        and x.version = v_agreement.version
    ) then
      v_items := v_items || jsonb_build_object('key', 'agreement', 'who', 'merchant',
        'label', 'Read and accept the merchant agreement');
    end if;

    /* The Data Processing Agreement (20270327000100): the current version. */
    if not exists (
      select 1 from public.merchant_dpa_acceptance x
      where x.merchant_id = p_merchant_id
        and x.version = (public.fn_merchant_dpa_current_version()).version
    ) then
      v_items := v_items || jsonb_build_object('key', 'dpa', 'who', 'merchant',
        'label', 'Read and accept the data processing agreement');
    end if;
  end if;

  if not exists (select 1 from public.merchant_branch b
                 where b.merchant_id = p_merchant_id and b.is_primary) then
    v_items := v_items || jsonb_build_object('key', 'branch', 'who', 'merchant',
      'label', 'Your business location');
  elsif not exists (select 1 from public.merchant_branch b
                     where b.merchant_id = p_merchant_id and b.is_primary and b.deleted_at is null
                       and b.latitude is not null and b.longitude is not null and b.zone_id is not null) then
    /* Without its pin a shop is on no map and in no area (22 Nov 2026). */
    v_items := v_items || jsonb_build_object('key', 'branch_pin', 'who', 'merchant',
      'label', 'Put your main location on the map, inside an area NexG serves');
  end if;

  /* Hours: the rows the shop page, "Open now" and checkout read. Onboarding
     and the Hours screen both write them. */
  if not exists (select 1 from public.merchant_hours h where h.merchant_id = p_merchant_id) then
    v_items := v_items || jsonb_build_object('key', 'hours', 'who', 'merchant',
      'label', 'Your opening hours');
  end if;

  /* An essential required document is the merchant's to do while it has no current
     upload or the last one was rejected or expired; NexG's while it waits to
     be checked. */
  select
    count(*) filter (where d.status is null or d.status in ('rejected', 'expired')),
    count(*) filter (where d.status = 'uploaded')
  into v_to_upload, v_to_check
  from public.fn_merchant_required_docs(p_merchant_id) q
  left join lateral (
    select doc.status::text as status
    from public.document doc
    where doc.owner_type = 'merchant' and doc.owner_id = p_merchant_id
      and doc.requirement_id = q.id and doc.superseded_at is null
    order by doc.created_at desc
    limit 1
  ) d on true
  where q.essential;

  if v_to_upload > 0 then
    v_items := v_items || jsonb_build_object('key', 'documents', 'who', 'merchant',
      'label', 'Documents to upload', 'count', v_to_upload);
  end if;
  if v_to_check > 0 then
    v_items := v_items || jsonb_build_object('key', 'documents_review', 'who', 'nexg',
      'label', 'NexG checks your documents', 'count', v_to_check);
  end if;

  return v_items;
end;
$$;

revoke all on function public.fn_merchant_go_live_missing(uuid) from public, anon, authenticated;
grant execute on function public.fn_merchant_go_live_missing(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════ audit

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('merchant.dpa_accepted', 'merchants', 'notice', false, false, false, '{}',
   'Merchant owner accepted the NexG Data Processing Agreement'),
  ('merchant.dpa_signed', 'merchants', 'notice', false, false, false, '{}',
   'NexG issued the merchant''s Data Processing Agreement, filled in and signed, as a PDF')
on conflict (action) do nothing;
