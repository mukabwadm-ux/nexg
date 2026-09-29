-- Rider onboarding as a draft, the same shape as the merchant flow.
--
-- The rider row held eleven columns: a name, a number, a vehicle and a plate.
-- Everything else a rider ops person needed — which areas they know, when
-- they ride, whether the bike is theirs, whether they will carry cash, where
-- Friday's pay should go — was gathered on a phone call and written nowhere.
--
-- Same reasoning as the merchant side: the NOT NULLs become a condition of
-- submitting rather than of existing, because a rider standing next to their
-- bike on mobile data will not finish in one sitting.

create type public.vehicle_ownership as enum ('own', 'rented', 'family');
create type public.insurance_type as enum ('comprehensive', 'third_party', 'none');

alter table public.rider
  alter column city_id drop not null,
  alter column vehicle drop not null,
  /* The flow asks for a first name and a phone number and nothing else on
     the first screen. A surname is collected from the national ID at
     verification, where it can be read off the document rather than typed
     by somebody standing next to their bike. */
  alter column last_name drop not null;

alter table public.rider
  add column if not exists ownership public.vehicle_ownership,
  /* Who the logbook is in the name of, when it is not the rider. */
  add column if not exists owner_name text,
  add column if not exists owner_phone text,
  add column if not exists insurance public.insurance_type,
  add column if not exists years_riding text
    check (years_riding is null or years_riding in ('new', '1_2', '3_5', '5_plus')),
  /*
   * Zone names rather than ids. A rider picks "Westlands" because they know
   * the streets, and that stays true if the polygon is redrawn — the areas a
   * person knows are not a foreign key to our delivery geometry.
   */
  add column if not exists areas text[] not null default '{}',
  add column if not exists shifts text[] not null default '{}',
  add column if not exists cash_ok boolean not null default true,
  add column if not exists kit_has text[] not null default '{}',
  /* Bicycles only: how far they are willing to go per trip. */
  add column if not exists bike_max_km integer
    check (bike_max_km is null or bike_max_km between 1 and 100),
  add column if not exists notes text,
  /* Defaults to their own line. Pay only ever goes to a line in their name. */
  add column if not exists payout_msisdn text,
  add column if not exists payout_name_lookup jsonb,
  add column if not exists onboarding_step smallint not null default 1
    check (onboarding_step between 1 and 6),
  add column if not exists resume_token_hash text,
  add column if not exists resume_token_expires_at timestamptz,
  add column if not exists phone_code_hash text,
  add column if not exists phone_code_expires_at timestamptz,
  add column if not exists phone_code_attempts smallint not null default 0,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists face_photo_path text,
  add column if not exists submitted_at timestamptz,
  add column if not exists waitlisted_at timestamptz,
  add column if not exists kit_issued_at timestamptz,
  add column if not exists cash_cap bigint;

/* kit_issued was a boolean with no record of when. Activation happens at the
   hub after the kit is handed over, so the moment is the useful part. */
update public.rider set kit_issued_at = updated_at where kit_issued and kit_issued_at is null;
alter table public.rider drop column if exists kit_issued;

alter table public.rider
  add constraint rider_submitted_is_complete check (
    submitted_at is null or (city_id is not null and vehicle is not null)
  ),
  /* A bicycle has no plate. Everything else does, and the plate is what a
     guest checks at the gate. */
  add constraint rider_plate_unless_bicycle check (
    submitted_at is null
    or vehicle = 'bicycle'
    or (plate_no is not null and length(trim(plate_no)) > 0)
  ),
  add constraint rider_owner_named_when_not_own check (
    ownership is null or ownership = 'own'
    or submitted_at is null
    or (owner_name is not null and length(trim(owner_name)) > 0)
  ),
  add constraint rider_areas_at_most_five check (array_length(areas, 1) is null or array_length(areas, 1) <= 5);

create index if not exists rider_draft_idx on public.rider (updated_at desc) where submitted_at is null;

comment on column public.rider.areas is
  'Zone names the rider says they know. Text rather than zone ids: knowing Westlands survives the polygon being redrawn.';
comment on column public.rider.payout_msisdn is
  'Where Friday settles. Must be a line in the rider''s own name — payout_name_lookup records whether anyone checked.';
comment on column public.rider.kit_issued_at is
  'When the rider was handed their bag and jacket at the hub. Activation requires it.';

-- ------------------------------------------------------------- documents

/* One requirement, two captures. The ID is only satisfied when both sides
   are on file, which the readiness function counts. */
alter table public.document
  add column if not exists side text check (side is null or side in ('front', 'back')),
  /* What the reader made of the photo: a plate, an expiry, a name. Kept so a
     reviewer can see what the machine thought and disagree with it. */
  add column if not exists ocr jsonb,
  add column if not exists quality jsonb;

comment on column public.document.ocr is
  'What OCR read from the photo. Advisory: a reviewer overrides it, and nothing is auto-verified from it.';

/*
 * One version of a document per requirement — unless the document has
 * sides. A national ID is one requirement and two photos, and the existing
 * constraint had no room for the second: the back came back as a duplicate
 * key on the front.
 *
 * An expression index rather than adding `side` to the constraint, because
 * unique constraints treat NULLs as distinct — every other requirement has
 * a null side, and two nulls would not collide, so re-uploading a permit
 * would silently create a second row at the same version.
 */
alter table public.document
  drop constraint if exists document_owner_type_owner_id_requirement_id_version_key;

create unique index if not exists document_one_per_side_and_version
  on public.document (owner_type, owner_id, requirement_id, version, coalesce(side, '-'));

/*
 * The same assumption again in the partial index that enforces "one current
 * document per requirement". A two-sided ID has two current documents, so
 * the rule is one current document per requirement *per side*.
 */
drop index if exists public.document_current_version;

create unique index document_current_version
  on public.document (owner_type, owner_id, requirement_id, coalesce(side, '-'))
  where superseded_at is null;

-- ------------------------------------------------- rider document requirements
--
-- Six for a motorbike on third-party cover, three for a bicycle. The
-- difference is the whole reason the vehicle question comes before this
-- screen: a bicycle rider asked for a logbook would rightly give up.

update public.document_requirement set
  label = 'Your face · selfie',
  why_text = 'Guests and the concierge desk see this next to your plate'
where owner_type = 'rider' and kind = 'face_photo';

update public.document_requirement set
  label = 'National ID · front and back',
  why_text = 'Must match the name on your M-Pesa line'
where owner_type = 'rider' and kind = 'national_id';

update public.document_requirement set
  label = 'Driving licence',
  why_text = 'Class for your vehicle · expiry tracked'
where owner_type = 'rider' and kind = 'driving_licence';

update public.document_requirement set
  label = 'Logbook or plate photo',
  why_text = 'Plate must match the one on your card'
where owner_type = 'rider' and kind = 'logbook_or_plate';

/*
 * Insurance only applies where there is cover to hold. A rider who answered
 * "not yet" still sees the row on the documents screen, because they cannot
 * be activated without it — but the requirement itself drops out so the
 * count is honest.
 */
update public.document_requirement set
  label = 'Third-party insurance certificate',
  why_text = 'Because you chose third party · expiry tracked',
  applies_when = '{"vehicle": ["motorbike", "car", "tuktuk"], "answer": {"insurance": ["comprehensive", "third_party"]}}'
where owner_type = 'rider' and kind = 'insurance';

/*
 * Good conduct takes weeks from the DCI. Holding a rider out of work for it
 * would cost us every rider who needs the money this month, so it has a
 * grace period — and is therefore not essential to activation.
 */
update public.document_requirement set
  label = 'Certificate of good conduct',
  why_text = 'Can take a few days — send it on WhatsApp when it arrives',
  essential = false
where owner_type = 'rider' and kind = 'good_conduct';

insert into public.document_requirement
  (owner_type, kind, label, why_text, applies_when, has_expiry, required, essential, sort)
values
  ('rider', 'owner_letter', 'Owner’s permission letter',
   'Because the vehicle is not yours — a short letter or WhatsApp message from the owner',
   '{"answer": {"ownership": ["rented", "family"]}}', false, true, true, 60)
on conflict do nothing;

-- --------------------------------------------------------- onboarding slots

create table public.onboarding_slot (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references public.city (id) on delete cascade,
  hub_name text not null,
  starts_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  booked integer not null default 0 check (booked >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint onboarding_slot_not_oversold check (booked <= capacity),
  unique (city_id, hub_name, starts_at)
);

create index onboarding_slot_open_idx
  on public.onboarding_slot (city_id, starts_at)
  where booked < capacity;

create trigger onboarding_slot_set_updated_at
  before update on public.onboarding_slot
  for each row execute function public.tg_set_updated_at();

alter table public.rider
  add column if not exists onboarding_slot_id uuid references public.onboarding_slot (id) on delete set null;

comment on table public.onboarding_slot is
  'Kit handover and onboarding sessions. A rider books one; capacity is enforced by rpc_book_slot, not by the client.';

alter table public.onboarding_slot enable row level security;

/* A rider needs to see the times before they have anything else. Capacity
   and hub name are not sensitive; who booked them is not in this table. */
create policy onboarding_slot_read on public.onboarding_slot
  for select to authenticated using (true);

create policy onboarding_slot_write_staff on public.onboarding_slot
  for all to authenticated
  using (authz.can_manage_riders(city_id))
  with check (authz.can_manage_riders(city_id));
