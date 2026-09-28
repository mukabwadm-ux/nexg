-- Document requirements and uploaded documents — spec section 3.2.

create table public.document_requirement (
  id uuid primary key default gen_random_uuid(),
  owner_type public.document_owner_type not null,
  /*
   * When this requirement applies. An empty object means always. Otherwise a
   * single key naming a column on the owner, with the values that trigger it:
   *   {"vehicle": ["motorbike", "car", "tuktuk"]}
   *   {"category": ["pharmacy"]}
   */
  applies_when jsonb not null default '{}'::jsonb,
  kind text not null,
  label text not null,
  help_text text,
  has_expiry boolean not null default false,
  required boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_type, kind),
  constraint document_requirement_applies_when_is_object check (
    jsonb_typeof(applies_when) = 'object'
  )
);

create index document_requirement_owner_idx on public.document_requirement (owner_type, sort);

create trigger document_requirement_set_updated_at
  before update on public.document_requirement
  for each row execute function public.tg_set_updated_at();

comment on table public.document_requirement is
  'What each kind of partner must supply. Editing these changes what every applicant is asked for, so treat it as configuration, not content.';

-- ------------------------------------------------------------------ document

create table public.document (
  id uuid primary key default gen_random_uuid(),
  owner_type public.document_owner_type not null,
  owner_id uuid not null,
  requirement_id uuid not null references public.document_requirement (id) on delete restrict,
  storage_path text not null,
  mime text not null,
  size_bytes bigint not null,
  issued_at date,
  expires_at date,
  status public.document_status not null default 'uploaded',
  reviewed_by uuid references public.staff_user (id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  -- A re-upload inserts a new row at the next version; the old row stays, so
  -- the review history is never overwritten (section 3.2).
  version integer not null default 1,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint document_size_within_limit check (size_bytes > 0 and size_bytes <= 10 * 1024 * 1024),
  constraint document_rejection_has_reason check (
    status <> 'rejected' or (rejection_reason is not null and length(trim(rejection_reason)) > 0)
  ),
  constraint document_review_is_attributed check (
    status in ('uploaded', 'expired') or reviewed_at is not null
  ),
  constraint document_expiry_after_issue check (
    issued_at is null or expires_at is null or expires_at >= issued_at
  ),
  unique (owner_type, owner_id, requirement_id, version)
);

-- The current version of each document for an owner.
create unique index document_current_version
  on public.document (owner_type, owner_id, requirement_id)
  where superseded_at is null;

create index document_owner_idx on public.document (owner_type, owner_id);
create index document_review_queue_idx
  on public.document (created_at)
  where status = 'uploaded' and superseded_at is null;
create index document_expiry_idx
  on public.document (expires_at)
  where expires_at is not null and superseded_at is null;

create trigger document_set_updated_at
  before update on public.document
  for each row execute function public.tg_set_updated_at();

comment on table public.document is
  'One uploaded file against one requirement. Re-uploads add a version; nothing is overwritten.';

-- ------------------------------------------------- seed: the 13 requirements
--
-- Exactly the table in spec section 3.2.

insert into public.document_requirement
  (owner_type, kind, label, help_text, applies_when, has_expiry, required, sort)
values
  ('rider', 'national_id', 'National ID',
   'Both sides, readable, no glare.',
   '{}'::jsonb, false, true, 10),

  ('rider', 'driving_licence', 'Driving licence',
   'Must be current and match your name.',
   '{"vehicle": ["motorbike", "car", "tuktuk"]}'::jsonb, true, true, 20),

  ('rider', 'logbook_or_plate', 'Logbook or number plate',
   'The logbook, or a clear photo of the plate front and rear.',
   '{"vehicle": ["motorbike", "car", "tuktuk"]}'::jsonb, false, true, 30),

  ('rider', 'insurance', 'Insurance',
   'Third-party cover at minimum. We check the expiry date.',
   '{"vehicle": ["motorbike", "car", "tuktuk"]}'::jsonb, true, true, 40),

  ('rider', 'good_conduct', 'Good conduct certificate',
   'Issued by the DCI. Renewed every 12 months.',
   '{}'::jsonb, true, true, 50),

  ('rider', 'face_photo', 'Selfie',
   'Plain background, face clearly visible. Used to verify your ID.',
   '{}'::jsonb, false, true, 60),

  ('merchant', 'business_permit', 'Business permit',
   'Your current county single business permit.',
   '{}'::jsonb, true, true, 10),

  ('merchant', 'owner_id', 'Owner ID',
   'National ID or passport of the registered owner.',
   '{}'::jsonb, false, true, 20),

  ('merchant', 'kra_pin', 'KRA PIN certificate',
   'The certificate, not just the number.',
   '{}'::jsonb, false, true, 30),

  ('merchant', 'food_handler_cert', 'Food handler certificate',
   'For every member of staff who handles food.',
   '{"category": ["restaurant", "bar_liquor"]}'::jsonb, true, true, 40),

  ('merchant', 'liquor_licence', 'Liquor licence',
   'Required before we can list any alcohol.',
   '{"category": ["bar_liquor"]}'::jsonb, true, true, 50),

  ('merchant', 'pharmacy_licence', 'Pharmacy licence',
   'Your current PPB premises licence.',
   '{"category": ["pharmacy"]}'::jsonb, true, true, 60),

  ('merchant', 'premises_photo', 'Photo of your premises',
   'The shopfront, so a rider can find you.',
   '{}'::jsonb, false, true, 70)
on conflict (owner_type, kind) do nothing;

-- ------------------------------------------------- review scope for a document
--
-- A document does not carry a city; its owner does. Review rights follow that
-- owner's city and the matching ops role. Defined here because it needs both
-- partner tables and the authz helpers, and is used by the review RPCs.

create or replace function authz.document_review_scope(d public.document)
returns table (city uuid, allowed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with owner_city as (
    select case
      when d.owner_type = 'rider'
        then (select r.city_id from public.rider r where r.id = d.owner_id)
      else (select m.city_id from public.merchant m where m.id = d.owner_id)
    end as city_id
  )
  select
    oc.city_id,
    case
      when d.owner_type = 'rider' then authz.can_manage_riders(oc.city_id)
      else authz.can_manage_merchants(oc.city_id)
    end
  from owner_city oc
$$;

grant execute on function authz.document_review_scope(public.document)
  to authenticated, service_role;
