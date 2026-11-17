-- Merchant agreements fill themselves in and are signed on approval.
--
-- Until now a merchant ticked "I have read and agree" to the blank
-- agreement PDF for its category (20261124000100). This adds what the
-- agreement's blanks need and a record of each signed copy:
--
--   * merchant_agreement_party: the merchant's details for the agreement
--     that the application did not ask for: registered name, registration
--     number, KRA PIN, address, P.O. Box, the signatory and title, the
--     designated representative for disputes and the owner or managing
--     director. The owner saves them (application form or Business ›
--     Documents) through rpc_merchant_agreement_details_save. Once the
--     agreement is signed with them they are locked.
--
--   * merchant_agreement_signer: NexG's side, versioned: the signatory and
--     title, the dispute representative, the letterhead (registered office,
--     P.O. Box, phone, email, website), the Property Partner in-room
--     commission and the signature image. Only a super admin saves a new
--     version (rpc_merchant_agreement_signer_save, audited for review); rows
--     are never changed, so each signed copy names the version it used.
--
--   * merchant_agreement_signed: one signed PDF per acceptance. The admin
--     console renders it from the template (packages/merchant-agreement),
--     stores it in the private bucket and records it with its SHA-256
--     through rpc_merchant_agreement_sign_record. It is a snapshot: never
--     replaced or edited.
--
-- Storage: the private `merchant-agreements` bucket.
--   signer/{uuid}.png|jpg     signature images; super admins upload, super
--                             admins, legal and merchant staff read (the
--                             staff member approving a merchant signs).
--   signed/{merchant}/{uuid}.pdf  signed agreements; merchant staff upload,
--                             the merchant's members and its staff read.
--
-- Nothing here changes the application payload, its validation or the
-- merchant row, so the live application keeps working before and after
-- this runs. Idempotent where it can be.

-- ═══════════════════════════════════════════════════════════════ tables

create table if not exists public.merchant_agreement_party (
  merchant_id uuid primary key references public.merchant (id) on delete cascade,
  legal_name text not null check (length(legal_name) between 2 and 200),
  -- Null until the business is registered: it may apply unregistered, but
  -- its agreement is signed only once the number is given.
  registration_number text
    check (registration_number is null or registration_number ~ '^[A-Z0-9][A-Z0-9 ./-]{1,59}$'),
  kra_pin text not null check (kra_pin ~ '^[AP][0-9]{9}[A-Z]$'),
  address text not null check (length(address) between 5 and 300),
  postal_address text check (postal_address is null or length(postal_address) between 3 and 120),
  signatory_name text not null check (length(signatory_name) between 2 and 120),
  signatory_title text not null check (length(signatory_title) between 2 and 80),
  representative_name text not null check (length(representative_name) between 2 and 120),
  representative_title text not null check (length(representative_title) between 2 and 80),
  principal_name text not null check (length(principal_name) between 2 and 120),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.merchant_agreement_party is
  'The merchant''s details its merchant agreement is filled in with. Written only by rpc_merchant_agreement_details_save; locked once the agreement is signed.';

create table if not exists public.merchant_agreement_signer (
  id uuid primary key default gen_random_uuid(),
  signatory_name text not null check (length(signatory_name) between 2 and 120),
  signatory_title text not null check (length(signatory_title) between 2 and 120),
  representative_name text not null check (length(representative_name) between 2 and 120),
  representative_title text not null check (length(representative_title) between 2 and 120),
  po_box text not null check (length(po_box) between 1 and 40),
  registered_office text not null check (length(registered_office) between 5 and 300),
  email text not null check (email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' and length(email) <= 254),
  phone text not null check (phone ~ '^\+?[0-9][0-9 ]{7,19}$'),
  website text not null check (length(website) between 4 and 120),
  in_room_commission_pct numeric(5, 2) not null
    check (in_room_commission_pct >= 0 and in_room_commission_pct <= 100),
  signature_path text not null check (signature_path ~ '^signer/[0-9a-f-]{36}\.(png|jpg)$'),
  signature_type text not null check (signature_type in ('image/png', 'image/jpeg')),
  signature_sha256 text not null check (signature_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by uuid references public.staff_user (id) on delete set null
);
create index if not exists merchant_agreement_signer_created_idx
  on public.merchant_agreement_signer (created_at desc);

comment on table public.merchant_agreement_signer is
  'NexG''s signatory, signature and letterhead for merchant agreements. Append-only: the newest row is current, and every signed copy names the row it used.';

create table if not exists public.merchant_agreement_signed (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  acceptance_id uuid not null unique
    references public.merchant_agreement_acceptance (id) on delete cascade,
  agreement_id text not null,
  version text not null,
  signer_id uuid not null references public.merchant_agreement_signer (id),
  storage_path text not null unique
    check (storage_path ~ '^signed/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes > 0),
  pages integer not null check (pages between 1 and 200),
  reference text not null unique check (reference ~ '^NXG-MA-[A-Z0-9]{6,20}$'),
  template_version text not null check (length(template_version) between 1 and 40),
  effective_on date not null,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  signed_at timestamptz not null default now(),
  signed_by uuid references public.staff_user (id) on delete set null,
  foreign key (agreement_id, version) references public.merchant_agreement (id, version)
);
create index if not exists merchant_agreement_signed_merchant_idx
  on public.merchant_agreement_signed (merchant_id, signed_at desc);

comment on table public.merchant_agreement_signed is
  'Each merchant agreement NexG issued, filled in and signed: a PDF in the private merchant-agreements bucket, its SHA-256 and the details it was filled with. Never replaced.';

/* A signed copy, and the signing details it names, are records: they do not change. */
create or replace function public.tg_merchant_agreement_signed_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are never changed; a new one is added instead.', tg_table_name
    using errcode = '42501';
end;
$$;
drop trigger if exists merchant_agreement_signed_immutable on public.merchant_agreement_signed;
create trigger merchant_agreement_signed_immutable
  before update on public.merchant_agreement_signed
  for each row execute function public.tg_merchant_agreement_signed_immutable();

drop trigger if exists merchant_agreement_signer_immutable on public.merchant_agreement_signer;
create trigger merchant_agreement_signer_immutable
  before update on public.merchant_agreement_signer
  for each row execute function public.tg_merchant_agreement_signed_immutable();

alter table public.merchant_agreement_party enable row level security;
alter table public.merchant_agreement_signer enable row level security;
alter table public.merchant_agreement_signed enable row level security;

drop policy if exists merchant_agreement_party_read on public.merchant_agreement_party;
create policy merchant_agreement_party_read on public.merchant_agreement_party
  for select to authenticated using (
    authz.is_merchant_member(merchant_id) or authz.merchant_application_staff(merchant_id)
  );

drop policy if exists merchant_agreement_signer_read on public.merchant_agreement_signer;
create policy merchant_agreement_signer_read on public.merchant_agreement_signer
  for select to authenticated using (authz.is_super_admin() or authz.has_role('legal'));

drop policy if exists merchant_agreement_signed_read on public.merchant_agreement_signed;
create policy merchant_agreement_signed_read on public.merchant_agreement_signed
  for select to authenticated using (
    authz.is_merchant_member(merchant_id) or authz.merchant_application_staff(merchant_id)
  );

revoke all on public.merchant_agreement_party, public.merchant_agreement_signer,
  public.merchant_agreement_signed from anon, authenticated;
grant select on public.merchant_agreement_party, public.merchant_agreement_signer,
  public.merchant_agreement_signed to authenticated;

-- ══════════════════════════════════════════════════════════════ storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-agreements', 'merchant-agreements', false, 5 * 1024 * 1024,
        array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/* The merchant a signed/{merchant}/{file}.pdf path belongs to, or null. */
create or replace function authz.merchant_agreement_path_merchant(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when p_name ~ '^signed/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.pdf$'
    then split_part(p_name, '/', 2)::uuid
  end;
$$;

create or replace function authz.merchant_agreement_object_readable(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_merchant uuid := authz.merchant_agreement_path_merchant(p_name);
begin
  if p_name ~ '^signer/' then
    return authz.is_super_admin() or authz.has_role('legal') or authz.can_manage_merchants();
  end if;
  -- Staff see every upload; the merchant only the copies that were issued.
  return v_merchant is not null
    and (authz.merchant_application_staff(v_merchant)
      or (authz.is_merchant_member(v_merchant)
        and exists (select 1 from public.merchant_agreement_signed s where s.storage_path = p_name)));
end;
$$;

create or replace function authz.merchant_agreement_object_writable(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_merchant uuid := authz.merchant_agreement_path_merchant(p_name);
begin
  if p_name ~ '^signer/[0-9a-f-]{36}\.(png|jpg)$' then
    return authz.is_super_admin();
  end if;
  return v_merchant is not null and authz.merchant_application_staff(v_merchant);
end;
$$;

/* Only an upload no signed copy records: what a failed signing left behind. */
create or replace function authz.merchant_agreement_object_orphan(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select authz.merchant_agreement_path_merchant(p_name) is not null
    and not exists (select 1 from public.merchant_agreement_signed s where s.storage_path = p_name);
$$;

revoke all on function authz.merchant_agreement_path_merchant(text),
  authz.merchant_agreement_object_readable(text), authz.merchant_agreement_object_writable(text),
  authz.merchant_agreement_object_orphan(text) from public, anon;
grant execute on function authz.merchant_agreement_path_merchant(text),
  authz.merchant_agreement_object_readable(text), authz.merchant_agreement_object_writable(text),
  authz.merchant_agreement_object_orphan(text) to authenticated;

drop policy if exists merchant_agreements_insert on storage.objects;
create policy merchant_agreements_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'merchant-agreements' and authz.merchant_agreement_object_writable(name));

drop policy if exists merchant_agreements_read on storage.objects;
create policy merchant_agreements_read on storage.objects
  for select to authenticated
  using (bucket_id = 'merchant-agreements' and authz.merchant_agreement_object_readable(name));

drop policy if exists merchant_agreements_delete on storage.objects;
create policy merchant_agreements_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'merchant-agreements'
    and authz.merchant_agreement_object_writable(name)
    and authz.merchant_agreement_object_orphan(name));

-- ══════════════════════════════════════════════════════════════ helpers

/* Trimmed, inner whitespace collapsed, empty as null. */
create or replace function public.fn_merchant_agreement_text(p_value text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(btrim(coalesce(p_value, '')), '\s+', ' ', 'g'), '');
$$;

/*
 * The commission the agreement states: the rate pricing charges this
 * merchant (fn_price_order): its negotiated rate, else the city and
 * category's standard rate when it delivers with its own riders, else the
 * rate for orders a NexG rider delivers.
 */
create or replace function public.fn_merchant_agreement_commission(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.merchant;
  v_pct numeric;
  v_basis text;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;
  if m.commission_pct is not null then
    v_pct := m.commission_pct;
    v_basis := 'negotiated';
  elsif coalesce(m.has_own_riders, false) then
    v_pct := settings.fn_num('fees.commission', m.city_id, m.category::text);
    v_basis := 'own_riders';
  else
    v_pct := coalesce(settings.fn_num('fees.commission_nexg_delivery', m.city_id, m.category::text),
                      settings.fn_num('fees.commission', m.city_id, m.category::text));
    v_basis := 'nexg_delivery';
  end if;
  return jsonb_build_object('pct', v_pct, 'basis', v_basis);
end;
$$;

/* The acceptance of the agreement version that applies to the merchant now, if any. */
create or replace function public.fn_merchant_agreement_current_acceptance(p_merchant_id uuid)
returns public.merchant_agreement_acceptance
language plpgsql stable security definer set search_path = '' as $$
declare
  v_agreement public.merchant_agreement;
  v_acceptance public.merchant_agreement_acceptance;
begin
  v_agreement := public.fn_merchant_agreement_for_category(
    public.fn_merchant_agreement_category(p_merchant_id));
  if v_agreement.id is not null then
    select * into v_acceptance from public.merchant_agreement_acceptance
      where merchant_id = p_merchant_id and agreement_id = v_agreement.id
        and version = v_agreement.version;
  end if;
  return v_acceptance;
end;
$$;

revoke all on function public.fn_merchant_agreement_text(text),
  public.fn_merchant_agreement_commission(uuid),
  public.fn_merchant_agreement_current_acceptance(uuid),
  public.tg_merchant_agreement_signed_immutable() from public, anon, authenticated;

-- ═════════════════════════════════════════════════ the merchant's details

create or replace function public.rpc_merchant_agreement_details_read(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.merchant;
  p public.merchant_agreement_party;
  v_acceptance public.merchant_agreement_acceptance;
  v_locked boolean := false;
begin
  if not (authz.is_merchant_member(p_merchant_id) or authz.merchant_application_staff(p_merchant_id)) then
    raise exception 'Not yours to look at.' using errcode = '42501';
  end if;
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    raise exception 'Merchant not found.' using errcode = 'P0002';
  end if;
  select * into p from public.merchant_agreement_party where merchant_id = p_merchant_id;
  v_acceptance := public.fn_merchant_agreement_current_acceptance(p_merchant_id);
  if v_acceptance.id is not null then
    v_locked := exists (select 1 from public.merchant_agreement_signed s
                        where s.acceptance_id = v_acceptance.id);
  end if;
  return jsonb_build_object(
    'saved', p.merchant_id is not null,
    'locked', v_locked,
    'updated_at', p.updated_at,
    'details', case when p.merchant_id is null then null else jsonb_build_object(
      'legal_name', p.legal_name, 'registration_number', p.registration_number,
      'kra_pin', p.kra_pin, 'address', p.address, 'postal_address', p.postal_address,
      'signatory_name', p.signatory_name, 'signatory_title', p.signatory_title,
      'representative_name', p.representative_name,
      'representative_title', p.representative_title,
      'principal_name', p.principal_name) end,
    -- What the form can start from when nothing is saved yet.
    'suggested', jsonb_build_object(
      'legal_name', coalesce(nullif(btrim(m.legal_name), ''), m.trading_name),
      'kra_pin', nullif(upper(btrim(m.kra_pin)), ''),
      'signatory_name', m.contact_name,
      'principal_name', m.contact_name)
  );
end;
$$;

/*
 * The owner saves the details the agreement is filled in with. Normalised
 * (trimmed, one space, registration number and KRA PIN in capitals) and
 * checked here; the audit records which fields changed, not their values.
 */
create or replace function public.rpc_merchant_agreement_details_save(p_merchant_id uuid, p_details jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.merchant_agreement_party;
  v_old public.merchant_agreement_party;
  v_acceptance public.merchant_agreement_acceptance;
  v_changed text[] := '{}';
  v_key text;
  v_text constant text[] := array['legal_name', 'registration_number', 'kra_pin', 'address',
    'postal_address', 'signatory_name', 'signatory_title', 'representative_name',
    'representative_title', 'principal_name'];
begin
  if (select auth.uid()) is null or not authz.merchant_application_owner(p_merchant_id) then
    raise exception 'Only the business owner can complete the agreement details.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'Send the agreement details.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_details) loop
    if v_key <> all (v_text) then
      raise exception 'Unknown agreement detail: %.', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(p_details -> v_key) not in ('string', 'null') then
      raise exception 'Agreement details are text.' using errcode = '22023';
    end if;
  end loop;

  v.merchant_id := p_merchant_id;
  v.legal_name := public.fn_merchant_agreement_text(p_details ->> 'legal_name');
  v.registration_number := upper(public.fn_merchant_agreement_text(p_details ->> 'registration_number'));
  v.kra_pin := upper(replace(public.fn_merchant_agreement_text(p_details ->> 'kra_pin'), ' ', ''));
  v.address := public.fn_merchant_agreement_text(p_details ->> 'address');
  v.postal_address := public.fn_merchant_agreement_text(p_details ->> 'postal_address');
  v.signatory_name := public.fn_merchant_agreement_text(p_details ->> 'signatory_name');
  v.signatory_title := public.fn_merchant_agreement_text(p_details ->> 'signatory_title');
  v.representative_name := public.fn_merchant_agreement_text(p_details ->> 'representative_name');
  v.representative_title := public.fn_merchant_agreement_text(p_details ->> 'representative_title');
  v.principal_name := public.fn_merchant_agreement_text(p_details ->> 'principal_name');

  if v.legal_name is null or length(v.legal_name) not between 2 and 200 then
    raise exception 'Enter the business''s registered name, as on its registration certificate.'
      using errcode = '22023';
  end if;
  if v.registration_number is not null and v.registration_number !~ '^[A-Z0-9][A-Z0-9 ./-]{1,59}$' then
    raise exception 'Enter the registration number on the business''s certificate, for example PVT-AB12CD3 or BN-AB12CD3.'
      using errcode = '22023';
  end if;
  if v.kra_pin is null or v.kra_pin !~ '^[AP][0-9]{9}[A-Z]$' then
    raise exception 'Enter the KRA PIN: a letter, nine digits and a letter, for example P051234567X.'
      using errcode = '22023';
  end if;
  if v.address is null or length(v.address) not between 5 and 300 then
    raise exception 'Enter the business''s physical address.' using errcode = '22023';
  end if;
  if v.postal_address is not null and length(v.postal_address) not between 3 and 120 then
    raise exception 'Enter the P.O. Box in full, for example P.O. Box 12345-00100, Nairobi, or leave it empty.'
      using errcode = '22023';
  end if;
  if v.signatory_name is null or length(v.signatory_name) not between 2 and 120
     or v.signatory_title is null or length(v.signatory_title) not between 2 and 80 then
    raise exception 'Enter the name and title of the person who signs for the business.'
      using errcode = '22023';
  end if;
  if v.representative_name is null or length(v.representative_name) not between 2 and 120
     or v.representative_title is null or length(v.representative_title) not between 2 and 80 then
    raise exception 'Enter the name and title of the business''s representative for disputes.'
      using errcode = '22023';
  end if;
  if v.principal_name is null or length(v.principal_name) not between 2 and 120 then
    raise exception 'Enter the owner''s or managing director''s name.' using errcode = '22023';
  end if;

  -- Serialise with signing, then refuse once the agreement is signed with them.
  perform 1 from public.merchant where id = p_merchant_id for update;
  v_acceptance := public.fn_merchant_agreement_current_acceptance(p_merchant_id);
  if v_acceptance.id is not null and exists (
    select 1 from public.merchant_agreement_signed s where s.acceptance_id = v_acceptance.id
  ) then
    raise exception 'Your merchant agreement has been signed with these details. Contact NexG to correct them.'
      using errcode = '55000';
  end if;

  select * into v_old from public.merchant_agreement_party where merchant_id = p_merchant_id;
  if v_old.merchant_id is null then
    v_changed := v_text;
  else
    select coalesce(array_agg(n.key order by n.key), '{}') into v_changed
    from jsonb_each(to_jsonb(v)) n
    join jsonb_each(to_jsonb(v_old)) o on o.key = n.key
    where n.key = any (v_text) and n.value is distinct from o.value;
  end if;

  if cardinality(v_changed) > 0 then
    insert into public.merchant_agreement_party as t (merchant_id, legal_name, registration_number,
      kra_pin, address, postal_address, signatory_name, signatory_title, representative_name,
      representative_title, principal_name, updated_at, updated_by)
    values (v.merchant_id, v.legal_name, v.registration_number, v.kra_pin, v.address,
      v.postal_address, v.signatory_name, v.signatory_title, v.representative_name,
      v.representative_title, v.principal_name, now(), (select auth.uid()))
    on conflict (merchant_id) do update set
      legal_name = excluded.legal_name, registration_number = excluded.registration_number,
      kra_pin = excluded.kra_pin, address = excluded.address,
      postal_address = excluded.postal_address, signatory_name = excluded.signatory_name,
      signatory_title = excluded.signatory_title,
      representative_name = excluded.representative_name,
      representative_title = excluded.representative_title,
      principal_name = excluded.principal_name, updated_at = now(),
      updated_by = (select auth.uid());
    perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
      p_action => 'merchant.agreement_details_saved', p_target_type => 'merchant',
      p_target_id => p_merchant_id, p_after => jsonb_build_object('fields', to_jsonb(v_changed)));
  end if;
  return public.rpc_merchant_agreement_details_read(p_merchant_id);
end;
$$;

-- ════════════════════════════════════════════════════ NexG's signatory

create or replace function public.rpc_merchant_agreement_signer_read()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  s public.merchant_agreement_signer;
  v_name text;
begin
  if authz.staff_id() is null or not (authz.is_super_admin() or authz.has_role('legal')) then
    raise exception 'Only a super admin or legal can see NexG''s signing details.'
      using errcode = '42501';
  end if;
  select * into s from public.merchant_agreement_signer order by created_at desc limit 1;
  if s.id is not null then
    select display_name into v_name from public.staff_user where id = s.created_by;
  end if;
  return jsonb_build_object(
    'can_edit', authz.is_super_admin(),
    'current', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'signatory_name', s.signatory_name, 'signatory_title', s.signatory_title,
      'representative_name', s.representative_name,
      'representative_title', s.representative_title, 'po_box', s.po_box,
      'registered_office', s.registered_office, 'email', s.email, 'phone', s.phone,
      'website', s.website, 'in_room_commission_pct', s.in_room_commission_pct,
      'signature_path', s.signature_path, 'signature_type', s.signature_type,
      'signature_sha256', s.signature_sha256, 'created_at', s.created_at,
      'created_by_name', v_name) end,
    'versions', (select count(*) from public.merchant_agreement_signer),
    'signed_with_current', case when s.id is null then 0 else
      (select count(*) from public.merchant_agreement_signed g where g.signer_id = s.id) end
  );
end;
$$;

/*
 * A super admin saves a new version of NexG's signing details. The
 * signature image is uploaded first to signer/{uuid}.png|jpg by the same
 * person; its type and size are read from storage, not trusted from the
 * browser. Leaving p_signature_path out keeps the current signature.
 */
create or replace function public.rpc_merchant_agreement_signer_save(
  p_details jsonb, p_signature_path text default null, p_signature_sha256 text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := authz.staff_id();
  v_previous public.merchant_agreement_signer;
  v public.merchant_agreement_signer;
  v_meta jsonb;
  v_owner text;
  v_key text;
  v_fields constant text[] := array['signatory_name', 'signatory_title', 'representative_name',
    'representative_title', 'po_box', 'registered_office', 'email', 'phone', 'website',
    'in_room_commission_pct'];
begin
  if v_staff is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can set NexG''s signatory and signature.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_details) is distinct from 'object' then
    raise exception 'Send the signing details.' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_details) loop
    if v_key <> all (v_fields) then
      raise exception 'Unknown signing detail: %.', v_key using errcode = '22023';
    end if;
  end loop;

  v.signatory_name := public.fn_merchant_agreement_text(p_details ->> 'signatory_name');
  v.signatory_title := public.fn_merchant_agreement_text(p_details ->> 'signatory_title');
  v.representative_name := public.fn_merchant_agreement_text(p_details ->> 'representative_name');
  v.representative_title := public.fn_merchant_agreement_text(p_details ->> 'representative_title');
  v.po_box := public.fn_merchant_agreement_text(p_details ->> 'po_box');
  v.registered_office := public.fn_merchant_agreement_text(p_details ->> 'registered_office');
  v.email := lower(public.fn_merchant_agreement_text(p_details ->> 'email'));
  v.phone := public.fn_merchant_agreement_text(p_details ->> 'phone');
  v.website := public.fn_merchant_agreement_text(p_details ->> 'website');
  begin
    v.in_room_commission_pct := (p_details ->> 'in_room_commission_pct')::numeric;
  exception when invalid_text_representation then
    raise exception 'Enter the Property Partner in-room commission as a percentage.'
      using errcode = '22023';
  end;

  if v.signatory_name is null or v.signatory_title is null then
    raise exception 'Enter the signatory''s name and title.' using errcode = '22023';
  end if;
  if v.representative_name is null or v.representative_title is null then
    raise exception 'Enter the name and title of NexG''s representative for disputes.'
      using errcode = '22023';
  end if;
  if v.po_box is null or v.registered_office is null or v.email is null or v.phone is null
     or v.website is null then
    raise exception 'Enter the letterhead: registered office, P.O. Box, phone, email and website.'
      using errcode = '22023';
  end if;
  if v.email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email for notices.' using errcode = '22023';
  end if;
  if v.phone !~ '^\+?[0-9][0-9 ]{7,19}$' then
    raise exception 'Enter the phone number in digits, for example +254 700 000 000.'
      using errcode = '22023';
  end if;
  if v.in_room_commission_pct is null or v.in_room_commission_pct < 0
     or v.in_room_commission_pct > 100 then
    raise exception 'Enter the Property Partner in-room commission, from 0 to 100 per cent.'
      using errcode = '22023';
  end if;

  select * into v_previous from public.merchant_agreement_signer order by created_at desc limit 1;
  if p_signature_path is null then
    if v_previous.id is null then
      raise exception 'Upload the signature image.' using errcode = '22023';
    end if;
    v.signature_path := v_previous.signature_path;
    v.signature_type := v_previous.signature_type;
    v.signature_sha256 := v_previous.signature_sha256;
  else
    if p_signature_path !~ '^signer/[0-9a-f-]{36}\.(png|jpg)$' then
      raise exception 'Upload the signature as a PNG or JPEG.' using errcode = '22023';
    end if;
    if p_signature_sha256 is null or p_signature_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'The signature''s checksum is missing.' using errcode = '22023';
    end if;
    select o.metadata, o.owner_id into v_meta, v_owner from storage.objects o
      where o.bucket_id = 'merchant-agreements' and o.name = p_signature_path;
    if v_meta is null then
      raise exception 'The signature upload did not arrive. Try again.' using errcode = 'P0002';
    end if;
    if v_owner is distinct from (select auth.uid())::text then
      raise exception 'Upload the signature yourself before saving it.' using errcode = '42501';
    end if;
    if coalesce(v_meta ->> 'mimetype', '') not in ('image/png', 'image/jpeg')
       or coalesce((v_meta ->> 'size')::bigint, 0) not between 1 and 2 * 1024 * 1024 then
      raise exception 'The signature must be a PNG or JPEG of at most 2 MB.' using errcode = '22023';
    end if;
    v.signature_path := p_signature_path;
    v.signature_type := v_meta ->> 'mimetype';
    v.signature_sha256 := p_signature_sha256;
  end if;

  insert into public.merchant_agreement_signer (signatory_name, signatory_title,
    representative_name, representative_title, po_box, registered_office, email, phone, website,
    in_room_commission_pct, signature_path, signature_type, signature_sha256, created_by)
  values (v.signatory_name, v.signatory_title, v.representative_name, v.representative_title,
    v.po_box, v.registered_office, v.email, v.phone, v.website, v.in_room_commission_pct,
    v.signature_path, v.signature_type, v.signature_sha256, v_staff)
  returning * into v;

  perform audit.log(p_actor_type => 'staff'::public.actor_type, p_actor_id => v_staff,
    p_module => 'settings', p_action => 'merchant.agreement_signer_saved',
    p_target_type => 'merchant_agreement_signer', p_target_id => v.id,
    p_before => case when v_previous.id is null then null else jsonb_build_object(
      'signer_id', v_previous.id, 'signature_sha256', v_previous.signature_sha256) end,
    p_after => jsonb_build_object('signer_id', v.id,
      'signature_changed', v_previous.id is null
        or v_previous.signature_sha256 is distinct from v.signature_sha256,
      'signature_sha256', v.signature_sha256));
  return public.rpc_merchant_agreement_signer_read();
end;
$$;

-- ═════════════════════════════════════════════════════════════ signing

/*
 * Everything the console needs to sign a merchant's agreement, and what is
 * still missing. Merchant staff only: it carries the merchant's details
 * and the signature's storage path.
 */
create or replace function public.rpc_merchant_agreement_signing_context(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  m public.merchant;
  a public.merchant_application;
  v_category text;
  v_agreement public.merchant_agreement;
  v_acceptance public.merchant_agreement_acceptance;
  p public.merchant_agreement_party;
  s public.merchant_agreement_signer;
  g public.merchant_agreement_signed;
  v_approved boolean;
  v_commission jsonb;
  v_cycle text;
  v_account_email text;
  v_email text;
  v_phone text;
  v_missing text[] := '{}';
begin
  if not authz.merchant_application_staff(p_merchant_id) then
    raise exception 'Merchant staff only.' using errcode = '42501';
  end if;
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    raise exception 'Merchant not found.' using errcode = 'P0002';
  end if;
  select * into a from public.merchant_application where merchant_id = p_merchant_id;
  -- Approved once is enough: a later edit waiting for review does not undo it.
  v_approved := case
    when a.merchant_id is not null then a.approved_revision is not null
      or m.status::text in ('live', 'paused')
    else m.went_live_at is not null or m.status::text in ('live', 'paused')
  end;
  v_category := public.fn_merchant_agreement_category(p_merchant_id);
  v_agreement := public.fn_merchant_agreement_for_category(v_category);
  if v_agreement.id is not null then
    select * into v_acceptance from public.merchant_agreement_acceptance
      where merchant_id = p_merchant_id and agreement_id = v_agreement.id
        and version = v_agreement.version;
  end if;
  if v_acceptance.id is not null then
    select * into g from public.merchant_agreement_signed where acceptance_id = v_acceptance.id;
    select u.email into v_account_email from auth.users u where u.id = v_acceptance.accepted_by;
  end if;
  select * into p from public.merchant_agreement_party where merchant_id = p_merchant_id;
  select * into s from public.merchant_agreement_signer order by created_at desc limit 1;
  v_commission := public.fn_merchant_agreement_commission(p_merchant_id);
  v_cycle := case
    when coalesce(settings.fn_text('settlement.cycle', m.city_id), '') ~* '^(bi-?weekly|fortnight)'
    then 'biweekly' else 'weekly' end;
  v_email := coalesce(nullif(a.payload #>> '{business,email}', ''), nullif(m.contact_email, ''));
  v_phone := case
    when (a.payload #>> '{business,sameBusinessPhone}') = 'false'
      and coalesce(a.payload #>> '{business,businessPhone}', '') <> ''
    then a.payload #>> '{business,businessPhone}'
    else m.contact_phone end;

  if not v_approved then
    v_missing := v_missing || 'The application is not approved yet.'::text;
  end if;
  if v_agreement.id is null then
    v_missing := v_missing || 'The merchant has no category yet, so no agreement applies.'::text;
  elsif v_acceptance.id is null then
    v_missing := v_missing || 'The merchant has not accepted the current agreement for its category.'::text;
  end if;
  if p.merchant_id is null then
    v_missing := v_missing ||
      'The merchant has not given its agreement details yet (registration number, KRA PIN, address, signatory).'::text;
  elsif p.registration_number is null then
    v_missing := v_missing ||
      'The merchant has not given its business registration number yet.'::text;
  end if;
  if s.id is null then
    v_missing := v_missing ||
      'NexG''s signatory and signature are not set up yet (Settings › Agreement signing).'::text;
  end if;
  if (v_commission ->> 'pct') is null then
    v_missing := v_missing || 'No commission rate applies to this merchant.'::text;
  end if;
  if v_email is null then
    v_missing := v_missing || 'The merchant has no email for notices.'::text;
  end if;

  return jsonb_build_object(
    'ready', cardinality(v_missing) = 0 and g.id is null,
    'missing', to_jsonb(v_missing),
    'approved', v_approved,
    'category', v_category,
    'agreement', case when v_agreement.id is null then null else jsonb_build_object(
      'id', v_agreement.id, 'title', v_agreement.title, 'version', v_agreement.version) end,
    'acceptance', case when v_acceptance.id is null then null else jsonb_build_object(
      'id', v_acceptance.id, 'accepted_at', v_acceptance.accepted_at,
      'account_email', coalesce(v_account_email, v_email)) end,
    'party', case when p.merchant_id is null then null else jsonb_build_object(
      'legal_name', p.legal_name, 'registration_number', p.registration_number,
      'kra_pin', p.kra_pin, 'address', p.address, 'postal_address', p.postal_address,
      'signatory_name', p.signatory_name, 'signatory_title', p.signatory_title,
      'representative_name', p.representative_name,
      'representative_title', p.representative_title,
      'principal_name', p.principal_name) end,
    'merchant', jsonb_build_object('id', m.id, 'trading_name', m.trading_name,
      'email', v_email, 'phone', v_phone),
    'commission', v_commission,
    'settlement_cycle', v_cycle,
    'signer', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'signatory_name', s.signatory_name, 'signatory_title', s.signatory_title,
      'representative_name', s.representative_name,
      'representative_title', s.representative_title, 'po_box', s.po_box,
      'registered_office', s.registered_office, 'email', s.email, 'phone', s.phone,
      'website', s.website, 'in_room_commission_pct', s.in_room_commission_pct,
      'signature_path', s.signature_path, 'signature_type', s.signature_type) end,
    'signed', case when g.id is null then null else jsonb_build_object(
      'id', g.id, 'reference', g.reference, 'storage_path', g.storage_path,
      'sha256', g.sha256, 'bytes', g.bytes, 'pages', g.pages, 'signed_at', g.signed_at,
      'effective_on', g.effective_on, 'version', g.version) end
  );
end;
$$;

/*
 * Records the signed PDF the console rendered and uploaded. Checks again
 * that the merchant is ready and that the acceptance and NexG's signing
 * details are the ones the PDF was made from; reads the file's size and
 * type from storage. A merchant's acceptance is signed once.
 */
create or replace function public.rpc_merchant_agreement_sign_record(
  p_merchant_id uuid,
  p_acceptance_id uuid,
  p_signer_id uuid,
  p_storage_path text,
  p_sha256 text,
  p_pages integer,
  p_reference text,
  p_template_version text,
  p_effective_on date,
  p_details jsonb
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_staff uuid := authz.staff_id();
  v_context jsonb;
  v_meta jsonb;
  v_row public.merchant_agreement_signed;
begin
  if v_staff is null or not authz.merchant_application_staff(p_merchant_id) then
    raise exception 'Merchant staff only.' using errcode = '42501';
  end if;
  -- One signing at a time per merchant.
  perform 1 from public.merchant where id = p_merchant_id for update;
  v_context := public.rpc_merchant_agreement_signing_context(p_merchant_id);
  if v_context -> 'signed' <> 'null'::jsonb then
    if v_context #>> '{signed,storage_path}' = p_storage_path then
      return v_context -> 'signed';
    end if;
    raise exception 'This agreement is already signed; the signed copy is never replaced.'
      using errcode = '23505';
  end if;
  if not (v_context ->> 'ready')::boolean then
    raise exception 'Not ready to sign: %',
      (select string_agg(x, ' ') from jsonb_array_elements_text(v_context -> 'missing') x)
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
  if authz.merchant_agreement_path_merchant(p_storage_path) is distinct from p_merchant_id then
    raise exception 'Upload the signed PDF to the merchant''s own folder.' using errcode = '22023';
  end if;
  select o.metadata into v_meta from storage.objects o
    where o.bucket_id = 'merchant-agreements' and o.name = p_storage_path;
  if v_meta is null then
    raise exception 'The signed PDF did not arrive in storage. Try again.' using errcode = 'P0002';
  end if;
  if coalesce(v_meta ->> 'mimetype', '') <> 'application/pdf'
     or coalesce((v_meta ->> 'size')::bigint, 0) not between 1 and 5 * 1024 * 1024 then
    raise exception 'The signed copy must be a PDF of at most 5 MB.' using errcode = '22023';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_pages is null
     or p_pages not between 1 and 200 or p_reference is null
     or p_reference !~ '^NXG-MA-[A-Z0-9]{6,20}$' or p_template_version is null
     or length(p_template_version) not between 1 and 40 then
    raise exception 'Invalid signed copy.' using errcode = '22023';
  end if;
  if p_effective_on is null or p_effective_on not between current_date - 2 and current_date + 2 then
    raise exception 'The agreement must be dated today.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_details) is distinct from 'object' or octet_length(p_details::text) > 32768 then
    raise exception 'Invalid signed copy details.' using errcode = '22023';
  end if;

  insert into public.merchant_agreement_signed (merchant_id, acceptance_id, agreement_id, version,
    signer_id, storage_path, sha256, bytes, pages, reference, template_version, effective_on,
    details, signed_by)
  values (p_merchant_id, p_acceptance_id, v_context #>> '{agreement,id}',
    v_context #>> '{agreement,version}', p_signer_id, p_storage_path, p_sha256,
    (v_meta ->> 'size')::integer, p_pages, p_reference, p_template_version, p_effective_on,
    p_details, v_staff)
  returning * into v_row;

  perform audit.log(p_actor_type => 'staff'::public.actor_type, p_actor_id => v_staff,
    p_module => 'merchants', p_action => 'merchant.agreement_signed',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('agreement', v_row.agreement_id, 'version', v_row.version,
      'reference', v_row.reference, 'sha256', v_row.sha256, 'signer_id', v_row.signer_id,
      'template', v_row.template_version));

  return jsonb_build_object('id', v_row.id, 'reference', v_row.reference,
    'storage_path', v_row.storage_path, 'sha256', v_row.sha256, 'bytes', v_row.bytes,
    'pages', v_row.pages, 'signed_at', v_row.signed_at, 'effective_on', v_row.effective_on,
    'version', v_row.version);
end;
$$;

/* The merchant's signed agreements, newest first, for the merchant and its staff. */
create or replace function public.rpc_merchant_agreement_signed_list(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_acceptance public.merchant_agreement_acceptance;
begin
  if not (authz.is_merchant_member(p_merchant_id) or authz.merchant_application_staff(p_merchant_id)) then
    raise exception 'Not yours to look at.' using errcode = '42501';
  end if;
  v_acceptance := public.fn_merchant_agreement_current_acceptance(p_merchant_id);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', g.id, 'agreement_id', g.agreement_id, 'title', a.title, 'version', g.version,
      'reference', g.reference, 'storage_path', g.storage_path, 'sha256', g.sha256,
      'bytes', g.bytes, 'pages', g.pages, 'signed_at', g.signed_at,
      'effective_on', g.effective_on,
      'current', g.acceptance_id is not distinct from v_acceptance.id)
      order by g.signed_at desc)
    from public.merchant_agreement_signed g
    join public.merchant_agreement a on a.id = g.agreement_id and a.version = g.version
    where g.merchant_id = p_merchant_id), '[]'::jsonb);
end;
$$;

revoke all on function public.rpc_merchant_agreement_details_read(uuid),
  public.rpc_merchant_agreement_details_save(uuid, jsonb),
  public.rpc_merchant_agreement_signer_read(),
  public.rpc_merchant_agreement_signer_save(jsonb, text, text),
  public.rpc_merchant_agreement_signing_context(uuid),
  public.rpc_merchant_agreement_sign_record(uuid, uuid, uuid, text, text, integer, text, text, date, jsonb),
  public.rpc_merchant_agreement_signed_list(uuid) from public, anon;
grant execute on function public.rpc_merchant_agreement_details_read(uuid),
  public.rpc_merchant_agreement_details_save(uuid, jsonb),
  public.rpc_merchant_agreement_signer_read(),
  public.rpc_merchant_agreement_signer_save(jsonb, text, text),
  public.rpc_merchant_agreement_signing_context(uuid),
  public.rpc_merchant_agreement_sign_record(uuid, uuid, uuid, text, text, integer, text, text, date, jsonb),
  public.rpc_merchant_agreement_signed_list(uuid) to authenticated;

alter function public.rpc_merchant_agreement_details_save(uuid, jsonb) set statement_timeout = '5s';
alter function public.rpc_merchant_agreement_signer_save(jsonb, text, text) set statement_timeout = '5s';
alter function public.rpc_merchant_agreement_sign_record(uuid, uuid, uuid, text, text, integer, text, text, date, jsonb)
  set statement_timeout = '5s';

-- ═══════════════════════════════════════════════════════════════ audit

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('merchant.agreement_details_saved', 'merchants', 'info', false, false, false, '{}',
   'Merchant saved the details its merchant agreement is filled in with. Records which fields changed, not their values.'),
  ('merchant.agreement_signed', 'merchants', 'notice', false, false, false, '{}',
   'NexG issued the merchant''s agreement, filled in and signed, as a PDF'),
  ('merchant.agreement_signer_saved', 'settings', 'high', true, false, false, '{}',
   'NexG''s signatory, signature or letterhead for merchant agreements changed')
on conflict (action) do nothing;
