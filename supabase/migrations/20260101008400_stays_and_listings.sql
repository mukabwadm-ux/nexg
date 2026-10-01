-- Stays · listed properties, their units, and tailored requests.
--
-- Two things this adds to the hospitality module.
--
-- A **property** above the unit. A host's building is the thing a
-- guest recognises and chooses; the units inside it are what they
-- actually book. Until now `unit` stood alone, so three flats in one
-- block appeared as three unrelated addresses. A property groups them,
-- carries the photography and the description, and is what a listing
-- card shows.
--
-- A **stay request**: somebody tells us what they need — dates, party
-- size, area, budget, what matters to them — and the desk comes back
-- with units that actually fit. The form is a lead; the matching is a
-- person's judgement, recorded.
--
-- Public visibility stays a database rule (GR5). A property appears to
-- a guest only when the host is live, the property is listed, and the
-- unit is live — checked in the view, not in whichever page renders it.

-- ═══════════════════════════════════════════════════ enums

create type public.property_kind as enum (
  'apartment', 'apartment_block', 'villa', 'townhouse',
  'guest_house', 'cottage', 'penthouse', 'studio'
);

create type public.stay_request_status as enum (
  'new', 'reviewing', 'matched', 'sent', 'won', 'lost', 'closed'
);

alter type public.notification_kind add value if not exists 'stay_request_received';
alter type public.notification_kind add value if not exists 'stay_request_options_sent';

-- ═══════════════════════════════════════════════════ property

create table public.property (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.host (id) on delete cascade,
  /* Stable and readable, because it ends up in a URL a guest shares. */
  slug text not null unique,
  name text not null,
  kind public.property_kind not null default 'apartment',

  area text,
  city_id uuid references public.city (id) on delete set null,
  point extensions.geography(Point, 4326),
  /* What a guest is told before they book. Never the gate code, never
     the street number of an empty flat. */
  neighbourhood_note text,

  summary text,
  description text,
  amenities text[] not null default '{}',
  photos jsonb not null default '[]'::jsonb,

  /*
   * Public visibility is a database rule. A property shows to guests
   * only when somebody has listed it AND the host is live — see
   * property_public, which checks both.
   */
  listed boolean not null default false,
  listed_at timestamptz,
  listed_by uuid references public.staff_user (id) on delete set null,

  check_in_from time,
  check_out_by time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (host_id, name)
);

create index property_listed_idx on public.property (listed, city_id) where listed;
create index property_point_idx on public.property using gist (point);

comment on column public.property.listed is
  'Set by staff, not by the host. A host asking to be listed is a request; being listed is a decision, and the public view checks it alongside the host being live.';

/* The unit joins its building, and gains what a listing needs. */
alter table public.unit
  add column if not exists property_id uuid references public.property (id) on delete set null,
  add column if not exists bedrooms integer check (bedrooms is null or bedrooms >= 0),
  add column if not exists bathrooms numeric(3, 1) check (bathrooms is null or bathrooms >= 0),
  add column if not exists max_guests integer check (max_guests is null or max_guests > 0),
  add column if not exists size_sqm integer,
  add column if not exists bed_setup text,
  /* Null means price on request, which is the honest default: nobody
     has agreed a rate, and a number invented here is one a guest would
     try to book against. */
  add column if not exists nightly_rate_kes bigint check (nightly_rate_kes is null or nightly_rate_kes > 0),
  add column if not exists min_nights integer not null default 1,
  add column if not exists unit_summary text,
  add column if not exists unit_amenities text[] not null default '{}',
  add column if not exists photos jsonb not null default '[]'::jsonb,
  add column if not exists listed boolean not null default false;

create index unit_property_idx on public.unit (property_id);
create index unit_listed_idx on public.unit (listed) where listed;

comment on column public.unit.nightly_rate_kes is
  'Null means price on request. Nothing in this system invents a nightly rate — a guest would try to book against it.';

-- ═══════════════════════════════════════════ what a guest sees

/*
 * The listing grid.
 *
 * Three conditions, all checked here so no page can get them wrong:
 * the host is live, the property is listed, and it has at least one
 * live listed unit. A property whose only unit is paused is not a
 * place anybody can stay tonight.
 */
create or replace view public.property_public
with (security_invoker = false) as
select
  p.id,
  p.slug,
  p.name,
  p.kind,
  p.area,
  p.city_id,
  c.name as city_name,
  p.summary,
  p.description,
  p.amenities,
  p.photos,
  p.neighbourhood_note,
  p.check_in_from,
  p.check_out_by,
  count(u.id)::integer as units_available,
  min(u.bedrooms) as bedrooms_min,
  max(u.bedrooms) as bedrooms_max,
  max(u.max_guests) as sleeps_max,
  /* "from KES x" is a minimum, and only over units that actually have
     a rate. All null stays null, and the card says price on request. */
  min(u.nightly_rate_kes) as from_rate_kes,
  count(*) filter (where u.nightly_rate_kes is null)::integer as units_without_rate
from public.property p
join public.host h on h.id = p.host_id
left join public.city c on c.id = p.city_id
join public.unit u
  on u.property_id = p.id
 and u.status = 'live'
 and u.listed
 and u.archived_at is null
where p.listed and h.status = 'live'
group by p.id, c.name;

grant select on public.property_public to anon, authenticated;

comment on view public.property_public is
  'The guest-facing listing. Joins rather than left-joins the unit on purpose: a property with no bookable unit is not a listing.';

/*
 * The units inside one property, as a guest sees them — the "which
 * flat do I want" step.
 *
 * Carries no address, no gate code and no contact of any kind. Where
 * exactly it is comes after somebody is actually coming.
 */
create or replace view public.property_unit_public
with (security_invoker = false) as
select
  u.id,
  u.property_id,
  u.label_public,
  u.name,
  u.unit_summary,
  u.bedrooms,
  u.bathrooms,
  u.max_guests,
  u.size_sqm,
  u.bed_setup,
  u.nightly_rate_kes,
  u.min_nights,
  u.unit_amenities,
  u.photos,
  u.floor,
  u.area,
  /* So a guest knows the concierge rule exists without being handed
     the askari's name before they have booked anything. */
  (u.handoff is not null) as handoff_arranged
from public.unit u
join public.property p on p.id = u.property_id
join public.host h on h.id = u.host_id
where u.status = 'live' and u.listed and u.archived_at is null
  and p.listed and h.status = 'live';

grant select on public.property_unit_public to anon, authenticated;

-- ═══════════════════════════════════════════ stay requests

create table public.stay_request (
  id uuid primary key default gen_random_uuid(),
  /* Short and sayable, because somebody will read it down a phone. */
  reference text not null unique,

  requester_name text,
  requester_phone text,
  requester_email text,

  city_id uuid references public.city (id) on delete set null,
  areas text[] not null default '{}',
  check_in date,
  check_out date,
  guests integer check (guests is null or guests > 0),
  bedrooms_needed integer,
  budget_per_night_kes bigint check (budget_per_night_kes is null or budget_per_night_kes > 0),

  purpose text check (purpose is null or purpose in
    ('leisure', 'business', 'relocation', 'family', 'crew', 'event', 'other')),
  must_haves text[] not null default '{}',
  notes text,

  status public.stay_request_status not null default 'new',
  assigned_to uuid references public.staff_user (id) on delete set null,
  sent_at timestamptz,
  decided_at timestamptz,
  outcome_note text,
  source text not null default 'stays_hero',
  consent_marketing boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint stay_request_reachable check (
    coalesce(trim(requester_phone), '') <> '' or coalesce(trim(requester_email), '') <> ''
  ),
  constraint stay_request_dates_make_sense check (
    check_in is null or check_out is null or check_out > check_in
  ),
  constraint stay_request_outcome_is_explained check (
    status not in ('won', 'lost') or coalesce(trim(outcome_note), '') <> ''
  )
);

create index stay_request_open_idx on public.stay_request (status, created_at desc)
  where status in ('new', 'reviewing', 'matched', 'sent');

comment on constraint stay_request_reachable on public.stay_request is
  'A request we cannot answer is not a request. One of phone or email is required.';

/*
 * What the desk proposed, and what happened to it. Several options per
 * request, ranked, each with the reason it was picked — so the next
 * person can see the thinking rather than just the shortlist.
 */
create table public.stay_request_match (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.stay_request (id) on delete cascade,
  unit_id uuid not null references public.unit (id) on delete cascade,
  rank integer not null default 1,
  why text,
  quoted_nightly_kes bigint,
  proposed_by uuid references public.staff_user (id) on delete set null,
  sent_at timestamptz,
  guest_response text check (guest_response is null or guest_response in
    ('interested', 'declined', 'booked')),
  created_at timestamptz not null default now(),
  unique (request_id, unit_id)
);

create index stay_request_match_idx on public.stay_request_match (request_id, rank);

-- ═══════════════════════════════════════════ the form

create or replace function public.rpc_stay_request_create(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.stay_request;
  v_ref text;
  v_phone text := nullif(trim(p_payload ->> 'phone'), '');
  v_email text := nullif(trim(p_payload ->> 'email'), '');
begin
  if v_phone is null and v_email is null then
    raise exception 'We need a phone number or an email, or we cannot come back to you.'
      using errcode = 'check_violation';
  end if;

  v_ref := 'ST-' || (
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                             1 + floor(random() * 32)::integer, 1), '')
    from generate_series(1, 6)
  );
  while exists (select 1 from public.stay_request where reference = v_ref) loop
    v_ref := 'ST-' || (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                               1 + floor(random() * 32)::integer, 1), '')
      from generate_series(1, 6)
    );
  end loop;

  insert into public.stay_request (
    reference, requester_name, requester_phone, requester_email,
    city_id, areas, check_in, check_out, guests, bedrooms_needed,
    budget_per_night_kes, purpose, must_haves, notes, source, consent_marketing
  )
  values (
    v_ref,
    nullif(trim(p_payload ->> 'name'), ''),
    v_phone,
    v_email,
    (select id from public.city where slug = coalesce(p_payload ->> 'city', 'nairobi')),
    coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_payload -> 'areas')),
      '{}'),
    nullif(p_payload ->> 'check_in', '')::date,
    nullif(p_payload ->> 'check_out', '')::date,
    nullif(p_payload ->> 'guests', '')::integer,
    nullif(p_payload ->> 'bedrooms', '')::integer,
    nullif(p_payload ->> 'budget', '')::bigint,
    nullif(p_payload ->> 'purpose', ''),
    coalesce(
      (select array_agg(value #>> '{}') from jsonb_array_elements(p_payload -> 'must_haves')),
      '{}'),
    nullif(trim(p_payload ->> 'notes'), ''),
    coalesce(nullif(p_payload ->> 'source', ''), 'stays_hero'),
    coalesce((p_payload ->> 'consent_marketing')::boolean, false)
  )
  returning * into v_request;

  insert into public.notification (kind, status) values ('stay_request_received', 'pending');

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay_request.received',
    p_target_type => 'stay_request', p_target_id => v_request.id,
    p_city_id => v_request.city_id,
    p_after => jsonb_build_object('reference', v_ref, 'guests', v_request.guests,
                                  'purpose', v_request.purpose));

  return jsonb_build_object('ok', true, 'reference', v_ref);
end;
$$;

grant execute on function public.rpc_stay_request_create(jsonb) to anon, authenticated;

/*
 * Suggest units for a request. One row per option, ranked, each with
 * the reason — the desk's judgement is the product here, so it is
 * recorded rather than inferred later from which one was booked.
 */
create or replace function public.rpc_stay_request_match(
  p_request_id uuid,
  p_unit_id uuid,
  p_why text,
  p_rank integer default 1,
  p_quoted_nightly_kes bigint default null
)
returns public.stay_request_match
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match public.stay_request_match;
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours to match.' using errcode = 'insufficient_privilege';
  end if;

  insert into public.stay_request_match
    (request_id, unit_id, rank, why, quoted_nightly_kes, proposed_by)
  values (p_request_id, p_unit_id, p_rank, nullif(trim(coalesce(p_why, '')), ''),
          p_quoted_nightly_kes, authz.staff_id())
  on conflict (request_id, unit_id) do update
    set rank = excluded.rank, why = excluded.why,
        quoted_nightly_kes = excluded.quoted_nightly_kes
  returning * into v_match;

  update public.stay_request
  set status = case when status = 'new' then 'matched' else status end,
      assigned_to = coalesce(assigned_to, authz.staff_id()),
      updated_at = now()
  where id = p_request_id;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay_request.matched',
    p_target_type => 'stay_request', p_target_id => p_request_id,
    p_after => jsonb_build_object('unit_id', p_unit_id, 'rank', p_rank));

  return v_match;
end;
$$;

create or replace function public.rpc_stay_request_update(
  p_request_id uuid,
  p_status public.stay_request_status,
  p_note text default null
)
returns public.stay_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.stay_request;
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  /* Won and lost both need a sentence. A request closed with no
     account of why teaches the next person nothing. */
  if p_status in ('won', 'lost') and coalesce(trim(coalesce(p_note, '')), '') = '' then
    raise exception 'Say what happened — won and lost are the two worth learning from.'
      using errcode = 'check_violation';
  end if;

  update public.stay_request set
    status = p_status,
    assigned_to = coalesce(assigned_to, authz.staff_id()),
    outcome_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), outcome_note),
    sent_at = case when p_status = 'sent' then coalesce(sent_at, now()) else sent_at end,
    decided_at = case when p_status in ('won', 'lost') then now() else decided_at end,
    updated_at = now()
  where id = p_request_id
  returning * into v_request;

  if p_status = 'sent' then
    insert into public.notification (kind, status) values ('stay_request_options_sent', 'pending');
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay_request.' || p_status::text,
    p_target_type => 'stay_request', p_target_id => p_request_id, p_reason => p_note);

  return v_request;
end;
$$;

/* Listing a property is a decision, so it is an RPC with a name on it. */
create or replace function public.rpc_property_set_listed(
  p_property_id uuid,
  p_listed boolean
)
returns public.property
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.property;
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours to list.' using errcode = 'insufficient_privilege';
  end if;

  update public.property set
    listed = p_listed,
    listed_at = case when p_listed then now() end,
    listed_by = case when p_listed then authz.staff_id() end
  where id = p_property_id
  returning * into v_property;

  perform audit.log('staff'::public.actor_type, 'hotels',
    case when p_listed then 'property.listed' else 'property.unlisted' end,
    p_target_type => 'property', p_target_id => p_property_id,
    p_city_id => v_property.city_id, p_severity => 'notice'::public.audit_severity);

  return v_property;
end;
$$;

grant execute on function public.rpc_stay_request_match(uuid, uuid, text, integer, bigint) to authenticated;
grant execute on function public.rpc_stay_request_update(uuid, public.stay_request_status, text) to authenticated;
grant execute on function public.rpc_property_set_listed(uuid, boolean) to authenticated;

-- ═══════════════════════════════════════════ the console's read

create or replace view public.console_stay_request_v
with (security_invoker = true) as
select
  r.id,
  r.reference,
  r.requester_name,
  public.fn_mask_phone(r.requester_phone) as phone_masked,
  r.requester_email,
  r.city_id,
  c.name as city_name,
  r.areas,
  r.check_in,
  r.check_out,
  case when r.check_in is not null and r.check_out is not null
    then (r.check_out - r.check_in) end as nights,
  r.guests,
  r.bedrooms_needed,
  r.budget_per_night_kes,
  r.purpose,
  r.must_haves,
  r.notes,
  r.status,
  r.source,
  r.created_at,
  r.sent_at,
  r.outcome_note,
  su.display_name as assigned_to_name,
  (select count(*) from public.stay_request_match m where m.request_id = r.id) as options,
  round(extract(epoch from (now() - r.created_at)) / 3600)::integer as age_hours
from public.stay_request r
left join public.city c on c.id = r.city_id
left join public.staff_user su on su.id = r.assigned_to;

create or replace view public.console_property_v
with (security_invoker = true) as
select
  p.id,
  p.slug,
  p.name,
  p.kind,
  p.area,
  p.city_id,
  c.name as city_name,
  p.host_id,
  h.display_name as host_name,
  h.status as host_status,
  p.listed,
  p.listed_at,
  p.summary,
  p.amenities,
  jsonb_array_length(p.photos) as photo_count,
  (select count(*) from public.unit u
    where u.property_id = p.id and u.archived_at is null) as units,
  (select count(*) from public.unit u
    where u.property_id = p.id and u.listed and u.status = 'live') as units_listed,
  (select min(u.nightly_rate_kes) from public.unit u
    where u.property_id = p.id and u.listed) as from_rate_kes,
  /* Why this property is not visible, worked out once here rather
     than guessed at in the console. */
  case
    when not p.listed then 'Not listed'
    when h.status <> 'live' then 'Host is not live'
    when not exists (select 1 from public.unit u
      where u.property_id = p.id and u.listed and u.status = 'live')
      then 'No live listed unit'
    when jsonb_array_length(p.photos) = 0 then 'No photos'
  end as blocked_reason
from public.property p
join public.host h on h.id = p.host_id
left join public.city c on c.id = p.city_id;

-- ═══════════════════════════════════════════════════ security

do $$
declare
  t text;
begin
  foreach t in array array['property', 'stay_request', 'stay_request_match']
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

create policy property_read on public.property
  for select to authenticated
  using (authz.is_host_member(host_id) or authz.works_hospitality(city_id));

/*
 * A stay request is somebody's travel plan with their phone number on
 * it. Staff who work hospitality, and the support desk who field the
 * calls about them. Nobody else.
 */
create policy stay_request_read on public.stay_request
  for select to authenticated
  using (authz.works_hospitality(city_id) or authz.handles_guest_data());

create policy stay_request_match_read on public.stay_request_match
  for select to authenticated
  using (authz.works_hospitality(null) or authz.handles_guest_data());

create trigger property_set_updated_at before update on public.property
  for each row execute function public.tg_set_updated_at();
create trigger stay_request_set_updated_at before update on public.stay_request
  for each row execute function public.tg_set_updated_at();
