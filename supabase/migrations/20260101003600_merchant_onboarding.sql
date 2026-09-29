-- Onboarding as a draft, not a form.
--
-- The old application was one submit: nothing existed until every required
-- field was filled, and a merchant who stopped halfway had nothing to come
-- back to. The new flow saves each tap, which means the row has to be allowed
-- to be incomplete for a while.
--
-- So the NOT NULLs move. They do not disappear — they become a condition of
-- submitting rather than a condition of existing, which is where they always
-- belonged. A draft with no category is fine; a submitted application without
-- one is not, and the check below says so.

alter table public.merchant
  alter column legal_name drop not null,
  alter column category drop not null,
  alter column city_id drop not null,
  alter column contact_email drop not null;

/*
 * The answers to that category's follow-up questions, keyed as
 * category_config.questions defines. Kept as jsonb rather than columns
 * because the question set is data: adding "do you cater?" to restaurants
 * should not be a migration against every other category.
 */
alter table public.merchant
  add column if not exists answers jsonb not null default '{}',
  add column if not exists onboarding_source text
    check (onboarding_source is null or onboarding_source in ('link', 'scratch')),
  add column if not exists source_url text,
  add column if not exists onboarding_step smallint not null default 1
    check (onboarding_step between 1 and 7),
  /* Hashed, like every other token here — a stolen database row must not be a
     working login. */
  add column if not exists resume_token_hash text,
  add column if not exists resume_token_expires_at timestamptz,
  add column if not exists price_band text,
  add column if not exists hours_pattern text
    check (hours_pattern is null or hours_pattern in ('same_daily', 'weekday_weekend', 'custom')),
  /* {"mon":[{"open":"10:00","close":"23:00"}], …}. merchant_hours stays the
     published, queryable form; this is the pattern the merchant chose, so
     "weekdays vs weekend" can be edited later as two ranges rather than as
     fourteen times they never typed. */
  add column if not exists hours jsonb,
  add column if not exists late_night_until time,
  add column if not exists prep_minutes integer not null default 20
    check (prep_minutes between 5 and 60),
  add column if not exists order_channels text[] not null default '{dashboard}',
  add column if not exists when_busy text not null default 'pause'
    check (when_busy in ('pause', 'extend_prep', 'never_pause')),
  add column if not exists packaging text,
  add column if not exists pickup_instructions text,
  add column if not exists rider_parking text,
  add column if not exists landmark text,
  add column if not exists branch_count_band text,
  add column if not exists payout_rail text
    check (payout_rail is null or payout_rail in ('mpesa_till', 'mpesa_paybill', 'bank')),
  /* Till or paybill numbers, or bank details. Not the settlement_account
     column, which finance owns and which is written after verification. */
  add column if not exists payout_account jsonb,
  add column if not exists payout_name_lookup jsonb,
  add column if not exists onboarding_call_at timestamptz,
  add column if not exists requires_ops_mapping boolean not null default false,
  add column if not exists waitlisted_at timestamptz,
  add column if not exists submitted_at timestamptz,
  add column if not exists has_own_riders boolean not null default false,
  add column if not exists fleet_dispatch_preference text not null default 'own_first'
    check (fleet_dispatch_preference in ('own_first', 'pool_only', 'mixed')),
  add column if not exists credentials_sent_at timestamptz,
  add column if not exists password_set_at timestamptz;

/*
 * What used to be NOT NULL, enforced where it matters. A merchant cannot be
 * submitted for verification without the things a verifier needs: who they
 * legally are, what they sell, and which city's team should look at it.
 */
alter table public.merchant
  add constraint merchant_submitted_is_complete check (
    submitted_at is null
    or (legal_name is not null and category is not null and city_id is not null)
  );

/* The old rule read `category <> 'other'`, which is null — and so passes —
   when the category has not been chosen yet. Say it outright instead. */
alter table public.merchant drop constraint if exists merchant_other_category_is_explained;
alter table public.merchant
  add constraint merchant_other_category_is_explained check (
    category is distinct from 'other'
    or submitted_at is null
    or (category_other is not null and length(trim(category_other)) > 0)
  );

create index if not exists merchant_draft_idx
  on public.merchant (updated_at desc)
  where submitted_at is null;

comment on column public.merchant.answers is
  'Answers to the category follow-up questions, keyed by category_config.questions[].key. Read by fn_merchant_required_docs to decide which licences to demand.';
comment on column public.merchant.onboarding_step is
  'Where to send this merchant when they come back. 7 is the status page.';
comment on column public.merchant.payout_account is
  'Till, paybill or bank details as entered. Never logged, never returned to anyone but the merchant and finance.';
comment on column public.merchant.submitted_at is
  'When the merchant asked to be verified. Before this the row is a draft and may be incomplete.';

-- ---------------------------------------------------------------- branches

alter table public.merchant_branch
  alter column name drop not null,
  alter column address_text drop not null,
  /* A real point, so zone_for_point can answer. The latitude/longitude pair
     stays as it is — it is what the admin console already reads — and this is
     kept in step with it by the trigger below rather than replacing it. */
  add column if not exists location extensions.geography(Point, 4326),
  add column if not exists inherits_hours boolean not null default true,
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'google')),
  add column if not exists sort integer not null default 0;

alter table public.merchant_branch
  add constraint merchant_branch_zone_id_fkey
  foreign key (zone_id) references public.zone (id) on delete set null;

create or replace function public.tg_branch_location_from_coords()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.latitude is not null and new.longitude is not null then
    new.location := extensions.st_setsrid(
      extensions.st_makepoint(new.longitude, new.latitude), 4326
    )::extensions.geography;
  else
    new.location := null;
  end if;
  return new;
end;
$$;

create trigger merchant_branch_location_from_coords
  before insert or update of latitude, longitude on public.merchant_branch
  for each row execute function public.tg_branch_location_from_coords();

create index if not exists merchant_branch_location_idx
  on public.merchant_branch using gist (location);

-- ------------------------------------------------------- the merchant's own riders

create type public.fleet_invite_status as enum
  ('invited', 'started', 'under_review', 'active', 'declined', 'expired');

create table public.merchant_fleet_rider (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  branch_id uuid references public.merchant_branch (id) on delete set null,
  name text not null,
  phone text not null,
  vehicle public.vehicle_type not null,
  plate_no text,
  invite_status public.fleet_invite_status not null default 'invited',
  invite_token_hash text,
  invite_expires_at timestamptz,
  /* Set when the invited person finishes rider onboarding. Until then this
     row is a declaration, not a rider. */
  rider_id uuid references public.rider (id) on delete set null,
  invited_at timestamptz,
  declared_by uuid references public.merchant_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fleet_rider_phone_is_e164 check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint fleet_rider_name_not_blank check (length(trim(name)) > 0),
  /* A bicycle has no plate. Everything else does, and a rider card that shows
     a plate the guest can check is the whole point of verifying one. */
  constraint fleet_rider_has_plate_unless_bicycle check (
    vehicle = 'bicycle' or (plate_no is not null and length(trim(plate_no)) > 0)
  ),
  unique (merchant_id, phone)
);

create index merchant_fleet_rider_merchant_idx on public.merchant_fleet_rider (merchant_id);
create index merchant_fleet_rider_rider_idx on public.merchant_fleet_rider (rider_id);

create trigger merchant_fleet_rider_set_updated_at
  before update on public.merchant_fleet_rider
  for each row execute function public.tg_set_updated_at();

comment on table public.merchant_fleet_rider is
  'A rider a merchant says works for them. Being declared here grants nothing: the person still goes through rider onboarding and the same document verification as any NexG rider.';

/* A rider's own record gains where they came from, so dispatch can prefer a
   merchant's own people without a join through this table. */
alter table public.rider
  add column if not exists source text not null default 'nexg_pool'
    check (source in ('nexg_pool', 'merchant_fleet')),
  add column if not exists employer_merchant_id uuid
    references public.merchant (id) on delete set null;

-- --------------------------------------------------- documents asked for later

create table public.document_request (
  id uuid primary key default gen_random_uuid(),
  owner_type public.document_owner_type not null,
  owner_id uuid not null,
  requirement_id uuid not null references public.document_requirement (id) on delete cascade,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'sms', 'email')),
  sent_at timestamptz not null default now(),
  fulfilled_document_id uuid references public.document (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index document_request_owner_idx
  on public.document_request (owner_type, owner_id)
  where fulfilled_document_id is null;

create trigger document_request_set_updated_at
  before update on public.document_request
  for each row execute function public.tg_set_updated_at();

comment on table public.document_request is
  'A merchant asked us to chase a document on WhatsApp. Open rows are what an inbound photo is matched against.';

-- ------------------------------------------------------- document requirements
--
-- Two new things a requirement has to carry. `why_text` is the line under the
-- label on the documents screen — a merchant handing over their ID is owed a
-- reason. `essential` is the difference between "you cannot be verified
-- without this" and "send it within the fortnight": without the split, one
-- missing food handler certificate holds up an entire restaurant.

alter table public.document_requirement
  add column if not exists why_text text,
  add column if not exists essential boolean not null default true;

/* The premises photo is useful to the team and is not paperwork. Counting it
   made a laundry "4 documents" when the artboard — and the merchant's own
   sense of it — says three. */
update public.document_requirement
set required = false, essential = false,
    label = 'Photo of your premises',
    why_text = 'Helps the team recognise the place · not required to go live'
where owner_type = 'merchant' and kind = 'premises_photo';

update public.document_requirement set
  label = 'Business permit (county)',
  why_text = 'Proves you are licensed to trade · needed to go live'
where owner_type = 'merchant' and kind = 'business_permit';

update public.document_requirement set
  label = 'Owner or director ID',
  why_text = 'Front and back · national ID or passport'
where owner_type = 'merchant' and kind = 'owner_id';

update public.document_requirement set
  label = 'KRA PIN certificate',
  why_text = 'For your settlement statements and tax invoices'
where owner_type = 'merchant' and kind = 'kra_pin';

update public.document_requirement set
  label = 'Food handler certificates',
  why_text = 'For the staff who prepare food · any one is enough to start',
  essential = false,
  applies_when = '{"category": ["restaurant", "bar_liquor"]}'
where owner_type = 'merchant' and kind = 'food_handler_cert';

update public.document_requirement set
  label = 'Liquor licence',
  why_text = 'Because you serve alcohol · you can go live without it if alcohol is hidden from your menu until it arrives',
  essential = false,
  applies_when = '{"category": ["bar_liquor"]}'
where owner_type = 'merchant' and kind = 'liquor_licence';

/* The PPB issues two separate things and we need both from a dispensing
   pharmacy: one for the premises, one for the superintendent. The old single
   "Pharmacy licence" row becomes the premises one. */
update public.document_requirement set
  kind = 'pharmacy_premises_licence',
  label = 'PPB premises licence',
  why_text = 'Pharmacy and Poisons Board licence for this address',
  essential = true
where owner_type = 'merchant' and kind = 'pharmacy_licence';

insert into public.document_requirement
  (owner_type, kind, label, why_text, applies_when, has_expiry, required, essential, sort)
values
  ('merchant', 'pharmacist_licence', 'Superintendent pharmacist licence',
   'Required where you dispense · we will ask for the licence number too',
   '{"category": ["pharmacy"], "answer": {"dispenses_rx": "yes"}}', true, true, true, 80),
  ('merchant', 'cosmetology_licence', 'Cosmetology licence',
   'Because you treat guests in their own room',
   '{"category": ["beauty_fashion"], "answer": {"home_service": "yes"}}', true, true, false, 85)
on conflict do nothing;

comment on column public.document_requirement.essential is
  'Verification cannot finish without it. Non-essential documents have a grace period (setting.doc_grace_days) and, for alcohol, hide the affected items instead of blocking the listing.';

-- --------------------------------------------------------------------- RLS

alter table public.merchant_fleet_rider enable row level security;
alter table public.document_request enable row level security;

/*
 * The merchant's own people manage their own declarations — but only while
 * the invitation is still theirs to withdraw. Once the person has started
 * their own rider onboarding the row describes somebody else's account, and
 * the merchant can no longer edit or delete it; they can still see it.
 */
create policy fleet_rider_read_own on public.merchant_fleet_rider
  for select to authenticated
  using (authz.is_merchant_member(merchant_id));

create policy fleet_rider_insert_own on public.merchant_fleet_rider
  for insert to authenticated
  with check (authz.is_merchant_member(merchant_id));

create policy fleet_rider_change_own on public.merchant_fleet_rider
  for update to authenticated
  using (
    authz.is_merchant_member(merchant_id)
    and invite_status in ('invited', 'declined', 'expired')
  )
  with check (authz.is_merchant_member(merchant_id));

create policy fleet_rider_delete_own on public.merchant_fleet_rider
  for delete to authenticated
  using (
    authz.is_merchant_member(merchant_id)
    and invite_status in ('invited', 'declined', 'expired')
  );

/* The person named in the row may read it — they are told who added them. */
create policy fleet_rider_read_self on public.merchant_fleet_rider
  for select to authenticated
  using (
    rider_id is not null
    and exists (
      select 1 from public.rider r
      where r.id = merchant_fleet_rider.rider_id and r.user_id = (select auth.uid())
    )
  );

create policy fleet_rider_read_staff on public.merchant_fleet_rider
  for select to authenticated
  using (
    exists (
      select 1 from public.merchant m
      where m.id = merchant_fleet_rider.merchant_id
        and authz.can_manage_merchants(m.city_id)
    )
  );

/* Document chases belong to whoever the document belongs to. */
create policy document_request_read_own on public.document_request
  for select to authenticated
  using (
    (owner_type = 'merchant' and authz.is_merchant_member(owner_id))
    or (owner_type = 'rider' and exists (
          select 1 from public.rider r
          where r.id = document_request.owner_id and r.user_id = (select auth.uid())))
  );

create policy document_request_insert_own on public.document_request
  for insert to authenticated
  with check (
    (owner_type = 'merchant' and authz.is_merchant_member(owner_id))
    or (owner_type = 'rider' and exists (
          select 1 from public.rider r
          where r.id = document_request.owner_id and r.user_id = (select auth.uid())))
  );

create policy document_request_read_staff on public.document_request
  for select to authenticated
  using (authz.staff_id() is not null);
