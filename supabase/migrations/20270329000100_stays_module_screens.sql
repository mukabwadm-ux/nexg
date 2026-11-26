-- The admin Stays module, rebuilt from the owner's 20 screens (26 Nov 2026):
-- Overview, Hosts, Buildings & Properties, Accommodation Units, Property
-- Managers & Partners, Reservations, Check-ins & Check-outs, Availability &
-- Rates, Guest Spending & Concierge, Reviews & Ratings, Verification &
-- Compliance, Acquisition & Referrals, QR Codes & Marketing, Finance &
-- Commissions, Payouts & Settlements, Incidents & Disputes, Performance &
-- Analytics, Reports and Stays Configuration. Every figure is counted here
-- from the stay tables; the names and numbers in the mockups are not used.
--
-- What this adds:
--
-- 1. Stays settings (group 'stays', approved by Finance + an ops manager like
--    fees): property manager share, VAT on commission, management fee and its
--    free trial, whether guest orders are shared, and the booking rules the
--    configuration screen shows. NexG's commission itself stays where it is
--    (payouts.host.commission_pct, set on Payout rules).
-- 2. New tables, staff-only (RLS on, no policies; reached through the RPCs):
--      stays_case       incidents, disputes and claims about a stay
--      stays_lead       host / property manager / partner leads
--      stays_campaign   marketing campaigns and what they cost
--      stays_report_run each report a staff member exported
-- 3. New columns: stay_review moderation (status, reply, featured);
--    property.property_manager_id (which partner manages the building);
--    property_manager.partner_kind, assigned_staff_id, last_contact_at;
--    host.rejected_at / rejected_by (the reason is host.status_reason).
-- 4. Host approval: rpc_console_host_reject (send back to fix, or decline),
--    and a trigger that emails the host when they are approved (status
--    becomes live) or sent back / declined.
-- 5. Readers, one per screen, jsonb, gated by authz.reaches_module('hotels').
-- 6. Writers, gated by authz.works_hospitality(null), each audited:
--    check-in / check-out, block dates, nightly rate, review moderation,
--    cases, leads, campaigns, partners, property manager link, report log.
--
-- Definitions (also in the page footnotes):
--   a booking      a stay that is booked, in stay or departed (held, blocked
--                  and cancelled rows are not bookings); counted in the
--                  period its check-in falls in
--   booking value  paid_kes, else the quote, else nightly rate × nights
--   occupancy      booked nights in the period ÷ (live units × days)
--   PM share       stays.pm_share_pct of NexG's commission after VAT, only
--                  for buildings that have a property manager
--   management fee stays.management_fee_kes per approved, listed property
--                  per month once its free trial (stays.trial_months from
--                  listing) has ended; billable, not collected
--
-- Rollback: drop the functions below, the trigger tg_host_review_tells_host,
-- the four tables, the added columns, the stays settings rows and policy,
-- and restore settings.definition's group check without 'stays'.

-- ═══════════════════════════════════════════════════════════════ 0. audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('host.rejected', 'hotels', 'notice', false, 'Staff sent a host application back to fix, or declined it'),
  ('stay.checked_in_by_staff', 'hotels', 'notice', false, 'Staff recorded a guest''s check-in'),
  ('stay.checked_out_by_staff', 'hotels', 'notice', false, 'Staff recorded a guest''s check-out'),
  ('stay.dates_blocked_by_staff', 'hotels', 'notice', false, 'Staff blocked dates on a unit'),
  ('unit.rate_set_by_staff', 'hotels', 'notice', true, 'Staff changed a unit''s nightly rate'),
  ('stay_review.moderated', 'hotels', 'notice', false, 'Staff published, hid, featured or answered a stay review'),
  ('stays_case.opened', 'hotels', 'notice', false, 'Staff logged a stay incident, dispute or claim'),
  ('stays_case.updated', 'hotels', 'notice', false, 'Staff changed a stay case''s status, priority or owner'),
  ('stays_lead.saved', 'hotels', 'info', false, 'Staff added or updated a stays lead'),
  ('stays_campaign.saved', 'hotels', 'info', false, 'Staff added or updated a stays marketing campaign'),
  ('property_manager.saved', 'hotels', 'notice', false, 'Staff added or updated a property manager or building partner'),
  ('property.manager_set', 'hotels', 'notice', false, 'Staff linked a building to a property manager'),
  ('stays_report.exported', 'hotels', 'info', false, 'Staff exported a stays report')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════════ 1. settings

alter table settings.definition drop constraint if exists definition_group_check;
alter table settings.definition add constraint definition_group_check check ("group" in (
  'cities', 'fees', 'dispatch', 'settlement', 'payments', 'payouts',
  'integrations', 'notifications', 'branding', 'legal', 'retention', 'stays'));

insert into settings.approval_policy ("group", pair, threshold, notify_roles)
select 'stays', 'finance+ops_manager', '{}'::jsonb, '{finance,ops_manager}'
where not exists (select 1 from settings.approval_policy where "group" = 'stays');

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort, constraints)
values
  ('stays.pm_share_pct', 'stays', 'global', 'pct', '%', 'Property manager share',
   'The property manager''s share of NexG''s stay commission after VAT, for buildings they manage.',
   true, false, 'finance+ops_manager', '{hotels,finance}', '20'::jsonb, 10, '{"min": 0, "max": 100}'::jsonb),
  ('stays.commission_vat_pct', 'stays', 'global', 'pct', '%', 'VAT inside NexG''s commission',
   'NexG''s stay commission is VAT-inclusive; this is the VAT taken out before the property manager''s share.',
   true, false, 'finance+ops_manager', '{hotels,finance}', '16'::jsonb, 20, '{"min": 0, "max": 50}'::jsonb),
  ('stays.management_fee_kes', 'stays', 'global', 'money', 'KES', 'Management fee per property per month',
   'Charged per approved, listed property each month once its free trial has ended.',
   true, false, 'finance+ops_manager', '{hotels,finance}', '1000'::jsonb, 30, '{"min": 0}'::jsonb),
  ('stays.trial_months', 'stays', 'global', 'int', 'months', 'Management fee free trial',
   'Months from listing before the management fee starts.',
   true, false, 'finance+ops_manager', '{hotels,finance}', '1'::jsonb, 40, '{"min": 0, "max": 24}'::jsonb),
  ('stays.guest_orders_shared', 'stays', 'global', 'bool', null, 'Share guest orders with hosts and PMs',
   'Off: guest orders (food, groceries, transfers, experiences) are NexG''s and are not shared with hosts or property managers.',
   true, false, 'finance+ops_manager', '{hotels,finance}', 'false'::jsonb, 50, '{}'::jsonb),
  ('stays.instant_booking', 'stays', 'global', 'bool', null, 'Instant booking',
   'Guests book without waiting for the host to accept.',
   false, false, 'finance+ops_manager', '{hotels}', 'true'::jsonb, 60, '{}'::jsonb),
  ('stays.min_nights', 'stays', 'global', 'int', 'nights', 'Minimum stay',
   'The shortest stay a unit can take unless the unit sets its own.',
   false, false, 'finance+ops_manager', '{hotels}', '1'::jsonb, 70, '{"min": 1, "max": 365}'::jsonb),
  ('stays.max_nights', 'stays', 'global', 'int', 'nights', 'Maximum stay',
   'The longest stay a guest can book in one go.',
   false, false, 'finance+ops_manager', '{hotels}', '90'::jsonb, 80, '{"min": 1, "max": 730}'::jsonb),
  ('stays.advance_days', 'stays', 'global', 'int', 'days', 'Advance booking window',
   'How far ahead a guest can book.',
   false, false, 'finance+ops_manager', '{hotels}', '365'::jsonb, 90, '{"min": 1, "max": 730}'::jsonb),
  ('stays.check_in_time', 'stays', 'global', 'text', null, 'Standard check-in time',
   'When guests can arrive unless the unit says otherwise (24-hour, e.g. 14:00).',
   false, false, 'finance+ops_manager', '{hotels}', '"14:00"'::jsonb, 100, '{}'::jsonb),
  ('stays.check_out_time', 'stays', 'global', 'text', null, 'Standard check-out time',
   'When guests leave unless the unit says otherwise (24-hour, e.g. 11:00).',
   false, false, 'finance+ops_manager', '{hotels}', '"11:00"'::jsonb, 110, '{}'::jsonb)
on conflict (key) do nothing;

/* A stays setting's current value, falling back to its default. */
create or replace function public.fn_stays_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    settings.fn_get(p_key, 'global'::settings.scope_kind, null, null, null, now()) -> 'value',
    (select d.default_value from settings.definition d where d.key = p_key))
$$;
revoke all on function public.fn_stays_setting(text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ 2. tables

create table if not exists public.stays_case (
  id uuid primary key default gen_random_uuid(),
  ref bigint generated always as identity,
  case_type text not null check (case_type in ('incident', 'dispute', 'claim')),
  category text not null check (category in (
    'property', 'check_in_out', 'payment', 'conduct', 'refund', 'cleanliness',
    'maintenance', 'noise', 'access', 'damage', 'no_show', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (description is null or char_length(description) <= 4000),
  stay_id uuid references public.stay (id) on delete set null,
  host_id uuid references public.host (id) on delete set null,
  property_id uuid references public.property (id) on delete set null,
  unit_id uuid references public.unit (id) on delete set null,
  reported_by text not null default 'guest' check (reported_by in ('guest', 'host', 'staff')),
  parties text check (parties is null or char_length(parties) <= 120),
  amount_kes bigint check (amount_kes is null or amount_kes >= 0),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'mediation', 'resolved', 'closed', 'invalid')),
  assigned_to uuid references public.staff_user (id) on delete set null,
  escalated_at timestamptz,
  first_response_at timestamptz,
  resolved_at timestamptz,
  resolution text check (resolution is null or char_length(resolution) <= 2000),
  opened_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stays_case_open_idx on public.stays_case (created_at desc)
  where status in ('open', 'in_progress', 'mediation');
create index if not exists stays_case_stay_idx on public.stays_case (stay_id) where stay_id is not null;
alter table public.stays_case enable row level security;
comment on table public.stays_case is
  'Stay incidents, disputes and claims staff log and work. Staff only, through rpc_console_stays_case_*.';

create table if not exists public.stays_lead (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  phone text check (phone is null or char_length(phone) <= 40),
  email text check (email is null or char_length(email) <= 200),
  kind text not null default 'host' check (kind in ('host', 'property_manager', 'partner')),
  source text not null default 'other' check (source in (
    'property_manager', 'referral', 'walk_in', 'digital', 'agent', 'other')),
  property_name text check (property_name is null or char_length(property_name) <= 160),
  area text check (area is null or char_length(area) <= 120),
  units integer check (units is null or units between 0 and 100000),
  status text not null default 'captured' check (status in (
    'captured', 'qualified', 'onboarding', 'verification', 'activated', 'lost')),
  assigned_to uuid references public.staff_user (id) on delete set null,
  next_action text check (next_action is null or char_length(next_action) <= 200),
  host_id uuid references public.host (id) on delete set null,
  referrer_host_id uuid references public.host (id) on delete set null,
  property_manager_id uuid references public.property_manager (id) on delete set null,
  campaign_id uuid,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stays_lead_created_idx on public.stays_lead (created_at desc);
alter table public.stays_lead enable row level security;
comment on table public.stays_lead is
  'Hosts, property managers and partners NexG is signing up. Staff only, through rpc_console_stays_lead_save.';

create table if not exists public.stays_campaign (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  objective text not null default 'bookings' check (objective in (
    'host_onboarding', 'bookings', 'building_partners', 'referrals', 'app_downloads', 'other')),
  channel text not null default 'other' check (channel in (
    'social_ads', 'google_ads', 'direct', 'in_app', 'qr', 'email', 'sms', 'other')),
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  spend_kes bigint not null default 0 check (spend_kes >= 0),
  results integer check (results is null or results >= 0),
  result_unit text check (result_unit is null or char_length(result_unit) <= 40),
  status text not null default 'active' check (status in ('draft', 'active', 'paused', 'ended')),
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stays_campaign enable row level security;
alter table public.stays_lead drop constraint if exists stays_lead_campaign_fk;
alter table public.stays_lead add constraint stays_lead_campaign_fk
  foreign key (campaign_id) references public.stays_campaign (id) on delete set null;
comment on table public.stays_campaign is
  'Stays marketing campaigns, their spend and the results staff record. Staff only.';

create table if not exists public.stays_report_run (
  id uuid primary key default gen_random_uuid(),
  report text not null check (char_length(report) between 1 and 60),
  period_from date not null,
  period_to date not null,
  rows_exported integer not null default 0,
  generated_by uuid references public.staff_user (id) on delete set null,
  generated_at timestamptz not null default now()
);
create index if not exists stays_report_run_at_idx on public.stays_report_run (generated_at desc);
alter table public.stays_report_run enable row level security;
comment on table public.stays_report_run is 'Each stays report a staff member exported. Staff only.';

revoke all on public.stays_case, public.stays_lead, public.stays_campaign, public.stays_report_run
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ 3. columns

alter table public.stay_review
  add column if not exists moderation text not null default 'published',
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid references public.staff_user (id) on delete set null,
  add column if not exists staff_reply text,
  add column if not exists featured boolean not null default false;
alter table public.stay_review drop constraint if exists stay_review_moderation_check;
alter table public.stay_review add constraint stay_review_moderation_check
  check (moderation in ('published', 'under_review', 'hidden'));
alter table public.stay_review drop constraint if exists stay_review_reply_length;
alter table public.stay_review add constraint stay_review_reply_length
  check (staff_reply is null or char_length(staff_reply) <= 1000);

alter table public.property
  add column if not exists property_manager_id uuid references public.property_manager (id) on delete set null;
create index if not exists property_manager_idx on public.property (property_manager_id)
  where property_manager_id is not null;

alter table public.property_manager
  add column if not exists partner_kind text not null default 'property_manager',
  add column if not exists assigned_staff_id uuid references public.staff_user (id) on delete set null,
  add column if not exists last_contact_at timestamptz;
alter table public.property_manager drop constraint if exists property_manager_partner_kind_check;
alter table public.property_manager add constraint property_manager_partner_kind_check
  check (partner_kind in ('property_manager', 'building_partner'));

alter table public.host
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.staff_user (id) on delete set null;

-- ═══════════════════════════════════════════════════════════════ 4. helpers

/* Nights of [check_in, check_out) that fall in [p_from, p_to], Nairobi days. */
create or replace function public.fn_stays_nights_in(
  p_in timestamptz, p_out timestamptz, p_from date, p_to date)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(0,
    least((p_out at time zone 'Africa/Nairobi')::date, p_to + 1)
    - greatest((p_in at time zone 'Africa/Nairobi')::date, p_from))
$$;

/*
 * One row per stay with the figures every stays screen shares. Internal:
 * only the readers below call it. p_city null means every city.
 */
create or replace function public.console_stays_rows(p_city uuid default null)
returns table (
  stay_id uuid, ref text, status text, source text, host_id uuid, host_name text,
  property_id uuid, property_name text, area text, unit_id uuid, unit_label text,
  bedrooms integer, guest_name text, guest_phone text, party integer,
  check_in timestamptz, check_out timestamptz, nights integer, rate_kes bigint,
  value_kes bigint, commission_kes bigint, host_share_kes bigint, paid boolean,
  checked_in_at timestamptz, checked_out_at timestamptz, created_at timestamptz,
  refunded_kes bigint, property_manager_id uuid, city_id uuid, payment_reference text,
  rating integer, review_text text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id,
    'NXG-' || upper(right(replace(s.id::text, '-', ''), 6)),
    s.status,
    s.source,
    s.host_id,
    coalesce(h.display_name, h.contact_name, 'Host'),
    p.id,
    p.name,
    coalesce(u.area, p.area),
    u.id,
    coalesce(u.label_public, u.name),
    u.bedrooms::integer,
    coalesce(nullif(btrim(s.guest_first_name), ''), 'Guest'),
    case when s.phone is null then null
         when authz.handles_guest_data() then s.phone
         else '•••• ' || right(s.phone, 3) end,
    (coalesce(s.party_adults, 0) + coalesce(s.party_children, 0))::integer,
    s.check_in,
    s.check_out,
    greatest(1, ((s.check_out at time zone 'Africa/Nairobi')::date
                 - (s.check_in at time zone 'Africa/Nairobi')::date))::integer,
    s.rate_kes::bigint,
    coalesce(s.paid_kes, s.quote_total_kes,
      s.rate_kes * greatest(1, ((s.check_out at time zone 'Africa/Nairobi')::date
                                - (s.check_in at time zone 'Africa/Nairobi')::date)))::bigint,
    s.commission_kes::bigint,
    s.host_share_kes::bigint,
    s.paid_kes is not null and s.paid_kes > 0,
    s.checked_in_at,
    s.checked_out_at,
    s.created_at,
    s.refund_amount_kes::bigint,
    p.property_manager_id,
    coalesce(u.city_id, p.city_id, h.city_id),
    s.payment_reference,
    r.rating::integer,
    case when r.moderation = 'hidden' then null else r.text end
  from public.stay s
  join public.host h on h.id = s.host_id
  left join public.unit u on u.id = s.unit_id
  left join public.property p on p.id = coalesce(s.property_id, u.property_id)
  left join public.stay_review r on r.stay_id = s.id
  where s.status not in ('held', 'blocked')
    and (p_city is null or coalesce(u.city_id, p.city_id, h.city_id) = p_city)
$$;
revoke all on function public.console_stays_rows(uuid) from public, anon, authenticated;

/* Guest orders placed through a unit's QR while a stay was on, per stay. */
create or replace function public.console_stays_orders(p_from timestamptz, p_to timestamptz)
returns table (stay_id uuid, order_id uuid, reference text, created_at timestamptz,
               total_kes numeric, category text, merchant_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, o.id, o.reference, o.created_at, o.total_cents / 100.0,
         coalesce(m.category_key, m.category::text, 'other'),
         coalesce(m.trading_name, m.legal_name)
  from public."order" o
  join public.property_qr q on q.id = o.property_qr_id and q.owner_type = 'unit'
  join public.stay s on s.unit_id = q.owner_id
    and o.created_at >= s.check_in and o.created_at < s.check_out
    and s.status in ('booked', 'in_stay', 'departed')
  left join public.merchant m on m.id = o.merchant_id
  where o.created_at >= p_from and o.created_at < p_to
    and o.payment_status in ('paid', 'collected', 'partially_refunded')
$$;
revoke all on function public.console_stays_orders(timestamptz, timestamptz) from public, anon, authenticated;

create or replace function public.fn_stays_check_period(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Pick a period that ends after it starts.' using errcode = 'invalid_parameter_value';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Pick a period of a year or less.' using errcode = 'invalid_parameter_value';
  end if;
end;
$$;

create or replace function public.fn_stays_reader_gate()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.reaches_module('hotels') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;
revoke all on function public.fn_stays_reader_gate() from public, anon;

create or replace function public.fn_stays_writer_gate()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.works_hospitality(null) then
    raise exception 'Stays changes are for hospitality staff.' using errcode = 'insufficient_privilege';
  end if;
  return authz.staff_id();
end;
$$;
revoke all on function public.fn_stays_writer_gate() from public, anon;

-- ═══════════════════════════════════════════════════════════════ 5. readers

/* Overview: KPIs, occupancy by day, guest spending, recent reservations, top buildings. */
create or replace function public.rpc_console_stays_overview(
  p_from date, p_to date, p_city uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Africa/Nairobi';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi';
  v_len integer := p_to - p_from + 1;
  v_pfrom date := p_from - (p_to - p_from + 1);
  v_pto date := p_from - 1;
  v_units integer;
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);

  select count(*) into v_units from public.unit u
   where u.status = 'live' and u.archived_at is null and u.deleted_at is null
     and (p_city is null or u.city_id = p_city);

  with r as (select * from public.console_stays_rows(p_city)),
  booked as (select * from r where r.status in ('booked', 'in_stay', 'departed')),
  cur as (select * from booked where check_in >= v_start and check_in < v_end),
  prev as (select * from booked
            where check_in >= (v_pfrom::timestamp) at time zone 'Africa/Nairobi'
              and check_in < (p_from::timestamp) at time zone 'Africa/Nairobi'),
  orders as (select o.* from public.console_stays_orders(v_start, v_end) o
              join r on r.stay_id = o.stay_id),
  days as (select d::date as day from generate_series(p_from, p_to, interval '1 day') d)
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'hosts', (select count(*) from public.host h where h.status <> 'offboarded'
                  and (p_city is null or h.city_id = p_city)),
      'hosts_new', (select count(*) from public.host h where h.created_at >= v_start and h.created_at < v_end
                  and (p_city is null or h.city_id = p_city)),
      'buildings', (select count(*) from public.property p where p.archived_at is null and p.deleted_at is null
                  and (p_city is null or p.city_id = p_city)),
      'buildings_new', (select count(*) from public.property p where p.archived_at is null and p.deleted_at is null
                  and p.created_at >= v_start and p.created_at < v_end and (p_city is null or p.city_id = p_city)),
      'units', (select count(*) from public.unit u where u.archived_at is null and u.deleted_at is null
                  and (p_city is null or u.city_id = p_city)),
      'units_live', v_units,
      'occupancy_pct', case when v_units > 0 then round(100.0 *
          (select coalesce(sum(public.fn_stays_nights_in(b.check_in, b.check_out, p_from, p_to)), 0) from booked b)
          / (v_units * v_len), 1) end,
      'occupancy_prev_pct', case when v_units > 0 then round(100.0 *
          (select coalesce(sum(public.fn_stays_nights_in(b.check_in, b.check_out, v_pfrom, v_pto)), 0) from booked b)
          / (v_units * v_len), 1) end,
      'current_guests', (select coalesce(sum(greatest(b.party, 1)), 0) from booked b where b.status = 'in_stay'),
      'bookings', (select count(*) from cur),
      'bookings_prev', (select count(*) from prev),
      'booking_value', (select coalesce(sum(value_kes), 0) from cur),
      'booking_value_prev', (select coalesce(sum(value_kes), 0) from prev),
      'guest_spend', (select coalesce(sum(total_kes), 0) from orders),
      'commission', (select coalesce(sum(commission_kes), 0) from cur),
      'commission_prev', (select coalesce(sum(commission_kes), 0) from prev)),
    'occupancy', (select coalesce(jsonb_agg(jsonb_build_object('day', d.day,
        'pct', case when v_units > 0 then round(100.0 * (select count(*) from booked b
              where (b.check_in at time zone 'Africa/Nairobi')::date <= d.day
                and (b.check_out at time zone 'Africa/Nairobi')::date > d.day) / v_units, 1) end)
        order by d.day), '[]'::jsonb) from days d),
    'spending', jsonb_build_object(
      'accommodation', (select coalesce(sum(value_kes), 0) from cur),
      'orders', (select coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'kes', x.kes)
                   order by x.kes desc), '[]'::jsonb)
                 from (select category, sum(total_kes) as kes from orders group by category) x)),
    'recent', (select coalesce(jsonb_agg(to_jsonb(x) order by x.check_in desc), '[]'::jsonb) from (
        select stay_id, ref, guest_name, unit_label, property_name, check_in, check_out, value_kes, status
        from booked order by check_in desc limit 5) x),
    'top', (select coalesce(jsonb_agg(to_jsonb(x) order by x.value_kes desc), '[]'::jsonb) from (
        select c.property_id, max(c.property_name) as name,
               (select count(*) from public.unit u where u.property_id = c.property_id
                  and u.archived_at is null and u.deleted_at is null) as units,
               sum(c.value_kes) as value_kes,
               round(100.0 * sum(public.fn_stays_nights_in(c.check_in, c.check_out, p_from, p_to))
                 / nullif((select count(*) from public.unit u where u.property_id = c.property_id
                    and u.status = 'live' and u.archived_at is null) * v_len, 0), 1) as occupancy_pct
        from cur c where c.property_id is not null
        group by c.property_id order by sum(c.value_kes) desc limit 5) x)
  ) into v_result;
  return v_result;
end;
$$;

/*
 * The stays table every list screen shares: Reservations, Check-ins &
 * Check-outs, Guest Spending, Finance transactions. p_view picks the tabs.
 */
create or replace function public.rpc_console_stays_list(
  p_from date, p_to date, p_city uuid default null, p_view text default 'reservations',
  p_tab text default 'all', p_q text default null, p_page integer default 1, p_size integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Africa/Nairobi';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi';
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 10), 1), 500);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);
  if p_view not in ('reservations', 'checkins', 'spending', 'finance') then
    raise exception 'Unknown view.' using errcode = 'invalid_parameter_value';
  end if;

  with r as (
    select x.*,
      case
        when x.status = 'cancelled' then 'cancelled'
        when x.status = 'departed' then 'completed'
        when x.status = 'in_stay' then 'checked_in'
        when x.check_in > now() then 'upcoming'
        else 'confirmed' end as bucket,
      (x.check_in at time zone 'Africa/Nairobi')::date as in_day,
      (x.check_out at time zone 'Africa/Nairobi')::date as out_day
    from public.console_stays_rows(p_city) x
  ),
  scoped as (
    select * from r
    where case p_view
      when 'checkins' then (in_day = v_today or out_day = v_today or status = 'in_stay'
                            or (status = 'booked' and in_day < v_today))
      else (check_in < v_end and check_out > v_start) end
  ),
  orders as (select o.stay_id, sum(o.total_kes) as kes, count(*) as n,
                    array_agg(distinct o.category) as categories
               from public.console_stays_orders(v_start - interval '60 days', v_end + interval '60 days') o
               group by o.stay_id),
  tabbed as (
    select s.*, coalesce(o.kes, 0) as concierge_kes, coalesce(o.n, 0) as concierge_orders,
           coalesce(o.categories, '{}') as concierge_categories
    from scoped s left join orders o on o.stay_id = s.stay_id
    where case p_view
      when 'reservations' then (p_tab = 'all' or s.bucket = p_tab)
      when 'checkins' then case p_tab
        when 'arrivals' then s.in_day = v_today
        when 'departures' then s.out_day = v_today
        when 'in_house' then s.status = 'in_stay'
        when 'no_shows' then s.status = 'booked' and s.in_day < v_today
        else true end
      when 'spending' then s.status <> 'cancelled' and (p_tab = 'all' or (p_tab = 'concierge' and coalesce(o.n, 0) > 0))
      else s.status <> 'cancelled' end
      and (v_q is null or s.ref ilike '%' || v_q || '%' or s.guest_name ilike '%' || v_q || '%'
           or s.unit_label ilike '%' || v_q || '%' or s.property_name ilike '%' || v_q || '%'
           or s.host_name ilike '%' || v_q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from tabbed),
    'counts', case p_view
      when 'reservations' then jsonb_build_object(
        'all', (select count(*) from scoped),
        'confirmed', (select count(*) from scoped where bucket = 'confirmed'),
        'checked_in', (select count(*) from scoped where bucket = 'checked_in'),
        'upcoming', (select count(*) from scoped where bucket = 'upcoming'),
        'completed', (select count(*) from scoped where bucket = 'completed'),
        'cancelled', (select count(*) from scoped where bucket = 'cancelled'))
      when 'checkins' then jsonb_build_object(
        'today', (select count(*) from scoped where in_day = v_today or out_day = v_today),
        'arrivals', (select count(*) from scoped where in_day = v_today),
        'departures', (select count(*) from scoped where out_day = v_today),
        'in_house', (select count(*) from scoped where status = 'in_stay'),
        'no_shows', (select count(*) from scoped where status = 'booked' and in_day < v_today))
      else jsonb_build_object('all', (select count(*) from scoped where status <> 'cancelled'),
        'concierge', (select count(*) from scoped s join orders o on o.stay_id = s.stay_id
                       where s.status <> 'cancelled'))
      end,
    'summary', jsonb_build_object(
      'bookings', (select count(*) from scoped where status <> 'cancelled'),
      'value_kes', (select coalesce(sum(value_kes), 0) from scoped where status <> 'cancelled'),
      'commission_kes', (select coalesce(sum(commission_kes), 0) from scoped where status <> 'cancelled'),
      'host_share_kes', (select coalesce(sum(host_share_kes), 0) from scoped where status <> 'cancelled'),
      'guests_in_house', (select coalesce(sum(greatest(party, 1)), 0) from scoped where status = 'in_stay'),
      'concierge_kes', (select coalesce(sum(o.kes), 0) from scoped s join orders o on o.stay_id = s.stay_id
                         where s.status <> 'cancelled'),
      'concierge_orders', (select coalesce(sum(o.n), 0) from scoped s join orders o on o.stay_id = s.stay_id
                         where s.status <> 'cancelled'),
      'stays_with_orders', (select count(*) from scoped s join orders o on o.stay_id = s.stay_id
                         where s.status <> 'cancelled'),
      'avg_check_in_min', (select round(avg(extract(epoch from (checked_in_at at time zone 'Africa/Nairobi')::time) / 60))
                         from scoped where checked_in_at is not null),
      'avg_check_out_min', (select round(avg(extract(epoch from (checked_out_at at time zone 'Africa/Nairobi')::time) / 60))
                         from scoped where checked_out_at is not null)),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) - 'in_day' - 'out_day' order by t.check_in desc), '[]'::jsonb) from (
        select * from tabbed order by check_in desc
        offset (v_page - 1) * v_size limit v_size) t)
  ) into v_result;
  return v_result;
end;
$$;

/* One stay with everything its side panel shows. */
create or replace function public.rpc_console_stay_detail(p_stay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
begin
  perform public.fn_stays_reader_gate();
  select to_jsonb(x) into v_row from public.console_stays_rows(null) x where x.stay_id = p_stay_id;
  if v_row is null then
    return null;
  end if;
  return v_row || jsonb_build_object(
    'orders', (select coalesce(jsonb_agg(jsonb_build_object('reference', o.reference, 'at', o.created_at,
                  'kes', o.total_kes, 'category', o.category, 'merchant', o.merchant_name)
                  order by o.created_at), '[]'::jsonb)
               from public.console_stays_orders(
                 (v_row ->> 'check_in')::timestamptz - interval '1 day',
                 (v_row ->> 'check_out')::timestamptz + interval '1 day') o
               where o.stay_id = p_stay_id),
    'cases', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'ref', 'INC-' || c.ref,
                  'title', c.title, 'status', c.status) order by c.created_at desc), '[]'::jsonb)
              from public.stays_case c where c.stay_id = p_stay_id),
    'photo', (select u.photos -> 0 from public.unit u where u.id = (v_row ->> 'unit_id')::uuid));
end;
$$;

/* Accommodation Units: every unit with its rate, occupancy and current stay. */
create or replace function public.rpc_console_stays_units(
  p_from date, p_to date, p_city uuid default null, p_tab text default 'all',
  p_q text default null, p_property uuid default null, p_page integer default 1, p_size integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_len integer := p_to - p_from + 1;
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 10), 1), 500);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);

  with u as (
    select un.id as unit_id, coalesce(un.label_public, un.name) as label, un.unit_no, un.bedrooms,
           un.max_guests, un.nightly_rate_kes, un.status::text as unit_status, un.listed, un.floor,
           un.size_sqm, un.unit_amenities, un.photos -> 0 as photo, un.created_at, un.paused_reason,
           p.id as property_id, p.name as property_name, coalesce(un.area, p.area) as area,
           h.id as host_id, coalesce(h.display_name, h.contact_name) as host_name,
           (select coalesce(sum(public.fn_stays_nights_in(s.check_in, s.check_out, p_from, p_to)), 0)
              from public.stay s where s.unit_id = un.id and s.status in ('booked', 'in_stay', 'departed')) as nights,
           (select coalesce(sum(public.fn_stays_nights_in(s.check_in, s.check_out, p_from, p_to)), 0)
              from public.stay s where s.unit_id = un.id and s.status = 'blocked') as blocked_nights,
           (select jsonb_build_object('stay_id', s.id, 'check_in', s.check_in, 'check_out', s.check_out)
              from public.stay s where s.unit_id = un.id and s.status = 'in_stay'
              order by s.check_in desc limit 1) as current_stay,
           (select coalesce(sum(coalesce(s.paid_kes, s.quote_total_kes)), 0) from public.stay s
             where s.unit_id = un.id and s.status in ('booked', 'in_stay', 'departed')
               and s.check_in >= (p_from::timestamp) at time zone 'Africa/Nairobi'
               and s.check_in < ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi') as revenue_kes,
           case when un.status = 'live' and un.listed then
             case when exists (select 1 from public.stay s where s.unit_id = un.id and s.status = 'in_stay')
                  then 'occupied' else 'available' end
             when un.status = 'paused' then 'inactive'
             when un.status = 'setting_up' then 'setting_up'
             else 'inactive' end as bucket
    from public.unit un
    join public.host h on h.id = un.host_id
    left join public.property p on p.id = un.property_id
    where un.archived_at is null and un.deleted_at is null
      and (p_city is null or un.city_id = p_city)
      and (p_property is null or un.property_id = p_property)
  ),
  f as (
    select * from u
    where (p_tab = 'all' or (p_tab = 'listed' and listed and unit_status = 'live') or bucket = p_tab)
      and (v_q is null or label ilike '%' || v_q || '%' or coalesce(property_name, '') ilike '%' || v_q || '%'
           or coalesce(host_name, '') ilike '%' || v_q || '%' or coalesce(unit_no, '') ilike '%' || v_q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'counts', jsonb_build_object(
      'all', (select count(*) from u),
      'listed', (select count(*) from u where listed and unit_status = 'live'),
      'occupied', (select count(*) from u where bucket = 'occupied'),
      'available', (select count(*) from u where bucket = 'available'),
      'setting_up', (select count(*) from u where bucket = 'setting_up'),
      'inactive', (select count(*) from u where bucket = 'inactive')),
    'kpis', jsonb_build_object(
      'occupancy_pct', (select round(100.0 * sum(nights) / nullif(count(*) filter (where unit_status = 'live') * v_len, 0), 1) from u),
      'adr_kes', (select round(sum(revenue_kes)::numeric / nullif(sum(nights), 0)) from u),
      'revpar_kes', (select round(sum(revenue_kes)::numeric / nullif(count(*) filter (where unit_status = 'live') * v_len, 0)) from u),
      'revenue_kes', (select coalesce(sum(revenue_kes), 0) from u),
      'avg_rate_kes', (select round(avg(nightly_rate_kes)) from u where nightly_rate_kes is not null)),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.property_name nulls last, t.label), '[]'::jsonb) from (
        select *, round(100.0 * nights / nullif(v_len, 0), 1) as occupancy_pct from f
        order by property_name nulls last, label offset (v_page - 1) * v_size limit v_size) t)
  ) into v_result;
  return v_result;
end;
$$;

/* Availability & Rates: seven days from p_start for a page of units. */
create or replace function public.rpc_console_stays_calendar(
  p_start date, p_city uuid default null, p_q text default null,
  p_page integer default 1, p_size integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 8), 1), 100);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  if p_start is null then
    raise exception 'Pick a start day.' using errcode = 'invalid_parameter_value';
  end if;

  with u as (
    select un.id, coalesce(un.label_public, un.name) as label, un.bedrooms, un.nightly_rate_kes,
           p.name as property_name, un.photos -> 0 as photo
    from public.unit un left join public.property p on p.id = un.property_id
    where un.archived_at is null and un.deleted_at is null and un.status = 'live'
      and (p_city is null or un.city_id = p_city)
      and (v_q is null or coalesce(un.label_public, un.name) ilike '%' || v_q || '%'
           or coalesce(p.name, '') ilike '%' || v_q || '%')
  ),
  page as (select * from u order by property_name nulls last, label
           offset (v_page - 1) * v_size limit v_size),
  days as (select (p_start + i) as day from generate_series(0, 6) i)
  select jsonb_build_object(
    'total', (select count(*) from u),
    'days', (select jsonb_agg(day order by day) from days),
    'kpis', jsonb_build_object(
      'units', (select count(*) from u),
      'available_today', (select count(*) from u where not exists (
          select 1 from public.stay s where s.unit_id = u.id
            and s.status in ('held', 'booked', 'in_stay', 'blocked')
            and (s.check_in at time zone 'Africa/Nairobi')::date <= v_today
            and (s.check_out at time zone 'Africa/Nairobi')::date > v_today)),
      'occupied_today', (select count(*) from u where exists (
          select 1 from public.stay s where s.unit_id = u.id and s.status in ('booked', 'in_stay')
            and (s.check_in at time zone 'Africa/Nairobi')::date <= v_today
            and (s.check_out at time zone 'Africa/Nairobi')::date > v_today)),
      'avg_rate_kes', (select round(avg(nightly_rate_kes)) from u where nightly_rate_kes is not null),
      'booked_ahead_kes', (select coalesce(sum(coalesce(s.paid_kes, s.quote_total_kes)), 0) from public.stay s
          join u on u.id = s.unit_id where s.status = 'booked' and s.check_in > now())),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'unit_id', pg.id, 'label', pg.label, 'bedrooms', pg.bedrooms, 'rate_kes', pg.nightly_rate_kes,
        'property_name', pg.property_name, 'photo', pg.photo,
        'days', (select jsonb_agg(jsonb_build_object('day', d.day,
            'state', coalesce((select case s.status when 'blocked' then 'blocked' when 'held' then 'hold' else 'booked' end
                       from public.stay s where s.unit_id = pg.id
                         and s.status in ('held', 'booked', 'in_stay', 'blocked')
                         and (s.status <> 'held' or s.hold_expires_at > now())
                         and (s.check_in at time zone 'Africa/Nairobi')::date <= d.day
                         and (s.check_out at time zone 'Africa/Nairobi')::date > d.day
                       limit 1), 'available'),
            'rate_kes', pg.nightly_rate_kes) order by d.day) from days d)
      ) order by pg.property_name nulls last, pg.label), '[]'::jsonb) from page pg)
  ) into v_result;
  return v_result;
end;
$$;

/* Buildings & Properties. */
create or replace function public.rpc_console_stays_properties(
  p_from date, p_to date, p_city uuid default null, p_tab text default 'all', p_q text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_len integer := p_to - p_from + 1;
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);

  with p as (
    select pr.id as property_id, pr.name, pr.kind::text as kind, pr.area, pr.review_status, pr.listed,
           pr.photos -> 0 as photo, pr.created_at, pr.listed_at, pr.amenities, pr.floors,
           extensions.st_y(pr.point::extensions.geometry) as lat, extensions.st_x(pr.point::extensions.geometry) as lng,
           h.id as host_id, coalesce(h.display_name, h.contact_name) as host_name, h.status::text as host_status,
           pm.id as manager_id, pm.name as manager_name, pm.phone as manager_phone,
           (select count(*) from public.unit u where u.property_id = pr.id and u.archived_at is null and u.deleted_at is null) as units,
           (select count(*) from public.unit u where u.property_id = pr.id and u.archived_at is null
              and u.status = 'live' and u.listed) as listed_units,
           (select count(*) from public.unit u where u.property_id = pr.id and u.archived_at is null
              and u.status = 'live') as live_units,
           (select coalesce(sum(public.fn_stays_nights_in(s.check_in, s.check_out, p_from, p_to)), 0)
              from public.stay s join public.unit u on u.id = s.unit_id
             where u.property_id = pr.id and s.status in ('booked', 'in_stay', 'departed')) as nights,
           (select coalesce(sum(coalesce(s.paid_kes, s.quote_total_kes)), 0)
              from public.stay s join public.unit u on u.id = s.unit_id
             where u.property_id = pr.id and s.status in ('booked', 'in_stay', 'departed')
               and s.check_in >= (p_from::timestamp) at time zone 'Africa/Nairobi'
               and s.check_in < ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi') as value_kes,
           case when pr.review_status = 'approved' and pr.listed then 'active'
                when pr.review_status = 'pending' then 'pending'
                else 'inactive' end as bucket
    from public.property pr
    join public.host h on h.id = pr.host_id
    left join public.property_manager pm on pm.id = pr.property_manager_id
    where pr.archived_at is null and pr.deleted_at is null
      and (p_city is null or pr.city_id = p_city)
  ),
  f as (select * from p where (p_tab = 'all' or bucket = p_tab)
          and (v_q is null or name ilike '%' || v_q || '%' or coalesce(area, '') ilike '%' || v_q || '%'
               or coalesce(manager_name, '') ilike '%' || v_q || '%' or coalesce(host_name, '') ilike '%' || v_q || '%'))
  select jsonb_build_object(
    'counts', jsonb_build_object('all', (select count(*) from p),
       'active', (select count(*) from p where bucket = 'active'),
       'pending', (select count(*) from p where bucket = 'pending'),
       'inactive', (select count(*) from p where bucket = 'inactive')),
    'kpis', jsonb_build_object(
       'buildings', (select count(*) from p where kind = 'apartment_block' or units > 1),
       'properties', (select count(*) from p),
       'units', (select coalesce(sum(units), 0) from p),
       'onboarded_units', (select coalesce(sum(live_units), 0) from p),
       'listed_units', (select coalesce(sum(listed_units), 0) from p),
       'occupancy_pct', (select round(100.0 * sum(nights) / nullif(sum(live_units) * v_len, 0), 1) from p)),
    'areas', (select coalesce(jsonb_agg(jsonb_build_object('area', a.area, 'n', a.n) order by a.n desc), '[]'::jsonb)
              from (select coalesce(area, 'No area') as area, count(*) as n from p group by 1) a),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.name), '[]'::jsonb) from (
        select *, round(100.0 * nights / nullif(live_units * v_len, 0), 1) as occupancy_pct from f
        order by name limit 200) t)
  ) into v_result;
  return v_result;
end;
$$;

/* Hosts and the Verification & Compliance queue. */
create or replace function public.rpc_console_stays_hosts(
  p_tab text default 'all', p_q text default null, p_page integer default 1, p_size integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 10), 1), 500);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();

  with h as (
    select ho.id as host_id, coalesce(ho.display_name, ho.contact_name, 'Host') as name, ho.contact_name,
           ho.kind::text as kind, ho.status::text as status, ho.status_reason, ho.tier::text as tier,
           case when authz.handles_guest_data() or authz.works_hospitality(null) then ho.phone
                else '•••• ' || right(ho.phone, 3) end as phone,
           ho.email, ho.created_at, ho.submitted_at, ho.verified_at, ho.went_live_at, ho.rejected_at,
           ho.verification_method, c.name as city_name,
           (select count(*) from public.unit u where u.host_id = ho.id and u.archived_at is null and u.deleted_at is null) as units,
           (select count(*) from public.property p where p.host_id = ho.id and p.archived_at is null and p.deleted_at is null) as properties,
           (select min(p.name) from public.property p where p.host_id = ho.id and p.archived_at is null) as first_property,
           (select count(distinct d.kind) from public.host_document d where d.host_id = ho.id and d.superseded_at is null) as docs_uploaded,
           (select count(distinct d.kind) from public.host_document d where d.host_id = ho.id and d.superseded_at is null
              and d.status = 'approved') as docs_approved,
           (select count(*) from public.host_document d where d.host_id = ho.id and d.superseded_at is null
              and d.status = 'rejected') as docs_rejected,
           exists (select 1 from public.host_document d where d.host_id = ho.id and d.superseded_at is null
                    and d.kind = 'id_document' and d.status = 'approved') as id_ok,
           exists (select 1 from public.host_document d where d.host_id = ho.id and d.superseded_at is null
                    and d.kind = 'authority' and d.status = 'approved') as authority_ok,
           exists (select 1 from public.host_document d where d.host_id = ho.id and d.superseded_at is null
                    and d.kind = 'kra_pin' and d.status = 'approved') as kra_ok,
           exists (select 1 from public.host_payout hp where hp.host_id = ho.id and hp.verified_at is not null) as payout_ok,
           (select count(*) from public.stays_case sc where sc.host_id = ho.id
              and sc.status in ('open', 'in_progress', 'mediation')) as open_cases,
           case
             when ho.status = 'live' then 'verified'
             when ho.status in ('applied', 'verifying') and ho.rejected_at is not null and ho.submitted_at is null then 'sent_back'
             when ho.status in ('applied', 'verifying') then 'pending'
             when ho.status = 'paused' then 'flagged'
             else 'rejected' end as bucket
    from public.host ho
    left join public.city c on c.id = ho.city_id
  ),
  f as (select * from h where (p_tab = 'all' or bucket = p_tab or (p_tab = 'non_compliant' and status = 'live'
                                 and (not id_ok or not authority_ok)))
          and (v_q is null or name ilike '%' || v_q || '%' or coalesce(phone, '') ilike '%' || v_q || '%'
               or coalesce(email, '') ilike '%' || v_q || '%' or coalesce(first_property, '') ilike '%' || v_q || '%'))
  select jsonb_build_object(
    'total', (select count(*) from f),
    'counts', jsonb_build_object(
      'all', (select count(*) from h),
      'verified', (select count(*) from h where bucket = 'verified'),
      'pending', (select count(*) from h where bucket = 'pending'),
      'sent_back', (select count(*) from h where bucket = 'sent_back'),
      'flagged', (select count(*) from h where bucket = 'flagged'),
      'rejected', (select count(*) from h where bucket = 'rejected'),
      'non_compliant', (select count(*) from h where status = 'live' and (not id_ok or not authority_ok))),
    'kpis', jsonb_build_object(
      'kyc_complete', (select count(*) from h where id_ok and authority_ok),
      'verified_properties', (select count(*) from public.property p where p.review_status = 'approved' and p.archived_at is null),
      'properties', (select count(*) from public.property p where p.archived_at is null and p.deleted_at is null),
      'verified_units', (select count(*) from public.unit u join public.host ho on ho.id = u.host_id
                          where ho.status = 'live' and u.status = 'live' and u.archived_at is null),
      'units', (select count(*) from public.unit u where u.archived_at is null and u.deleted_at is null)),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (
        select * from f order by (bucket = 'pending') desc, created_at desc
        offset (v_page - 1) * v_size limit v_size) t)
  ) into v_result;
  return v_result;
end;
$$;

/* Property Managers & Partners. */
create or replace function public.rpc_console_stays_partners(
  p_tab text default 'all', p_q text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_vat numeric := coalesce((public.fn_stays_setting('stays.commission_vat_pct') #>> '{}')::numeric, 16);
  v_share numeric := coalesce((public.fn_stays_setting('stays.pm_share_pct') #>> '{}')::numeric, 20);
  v_month timestamptz := date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();

  with pm as (
    select m.id, m.name, m.legal_name, m.email,
           case when authz.works_hospitality(null) then m.phone else '•••• ' || right(m.phone, 3) end as phone,
           m.partner_kind, m.status, m.joined_at, m.last_contact_at, m.monthly_fee_kes, m.first_month_free,
           m.referral_code, su.display_name as assigned_staff,
           (select count(*) from public.property p where p.property_manager_id = m.id and p.archived_at is null) as buildings,
           (select count(*) from public.unit u join public.property p on p.id = u.property_id
             where p.property_manager_id = m.id and u.archived_at is null and u.deleted_at is null) as units,
           (select count(*) from public.stays_lead l where l.property_manager_id = m.id) as leads,
           (select count(*) from public.stays_lead l where l.property_manager_id = m.id and l.status = 'activated') as onboarded,
           (select coalesce(sum(s.commission_kes), 0) from public.stay s join public.property p on p.id = s.property_id
             where p.property_manager_id = m.id and s.status in ('booked', 'in_stay', 'departed')) as commission_kes,
           (select coalesce(sum(s.commission_kes), 0) from public.stay s join public.property p on p.id = s.property_id
             where p.property_manager_id = m.id and s.status in ('booked', 'in_stay', 'departed')
               and s.check_in >= v_month) as commission_mtd_kes,
           (select coalesce(sum(st.net_amount_cents), 0) / 100 from public.property_manager_statement st
             where st.property_manager_id = m.id and st.paid_at is not null) as paid_kes
    from public.property_manager m
    left join public.staff_user su on su.id = m.assigned_staff_id
  ),
  f as (select * from pm where (p_tab = 'all' or partner_kind = p_tab)
          and (v_q is null or name ilike '%' || v_q || '%' or coalesce(email, '') ilike '%' || v_q || '%'
               or coalesce(legal_name, '') ilike '%' || v_q || '%'))
  select jsonb_build_object(
    'share_pct', v_share, 'vat_pct', v_vat,
    'counts', jsonb_build_object('all', (select count(*) from pm),
      'property_manager', (select count(*) from pm where partner_kind = 'property_manager'),
      'building_partner', (select count(*) from pm where partner_kind = 'building_partner')),
    'kpis', jsonb_build_object(
      'partners', (select count(*) from pm),
      'buildings', (select coalesce(sum(buildings), 0) from pm),
      'units', (select coalesce(sum(units), 0) from pm),
      'leads', (select coalesce(sum(leads), 0) from pm),
      'onboarded', (select coalesce(sum(onboarded), 0) from pm),
      'share_mtd_kes', (select round(coalesce(sum(commission_mtd_kes), 0) / (1 + v_vat / 100) * v_share / 100) from pm)),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object(
          'share_kes', round(t.commission_kes / (1 + v_vat / 100) * v_share / 100),
          'buildings_list', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'area', p.area)
                               order by p.name), '[]'::jsonb) from public.property p
                             where p.property_manager_id = t.id and p.archived_at is null),
          'recent_leads', (select coalesce(jsonb_agg(jsonb_build_object('name', l.name, 'status', l.status,
                               'property', l.property_name) order by l.created_at desc), '[]'::jsonb)
                           from (select * from public.stays_lead l where l.property_manager_id = t.id
                                 order by l.created_at desc limit 3) l))
        order by t.name), '[]'::jsonb) from f t)
  ) into v_result;
  return v_result;
end;
$$;

/* Finance & Commissions and Payouts & Settlements. */
create or replace function public.rpc_console_stays_finance(
  p_from date, p_to date, p_city uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Africa/Nairobi';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi';
  v_pfrom date := p_from - (p_to - p_from + 1);
  v_vat numeric := coalesce((public.fn_stays_setting('stays.commission_vat_pct') #>> '{}')::numeric, 16);
  v_share numeric := coalesce((public.fn_stays_setting('stays.pm_share_pct') #>> '{}')::numeric, 20);
  v_fee numeric := coalesce((public.fn_stays_setting('stays.management_fee_kes') #>> '{}')::numeric, 1000);
  v_trial integer := coalesce((public.fn_stays_setting('stays.trial_months') #>> '{}')::integer, 1);
  v_shared boolean := coalesce((public.fn_stays_setting('stays.guest_orders_shared') #>> '{}')::boolean, false);
  v_months numeric := greatest(1, round((p_to - p_from + 1) / 30.4));
  v_commission_pct numeric;
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);
  v_commission_pct := coalesce(nullif(settings.fn_get('payouts.host.commission_pct', 'city'::settings.scope_kind,
      coalesce(p_city, (select id from public.city where slug = 'nairobi')), null, null, now()) ->> 'value', '')::numeric, 15);

  with r as (select * from public.console_stays_rows(p_city) where status in ('booked', 'in_stay', 'departed')),
  cur as (select * from r where check_in >= v_start and check_in < v_end),
  prev as (select * from r where check_in >= (v_pfrom::timestamp) at time zone 'Africa/Nairobi' and check_in < v_start),
  orders as (select * from public.console_stays_orders(v_start, v_end)),
  fees as (
    select p.id, p.name, p.listed_at,
           (p.listed_at + make_interval(months => v_trial)) as trial_ends
    from public.property p
    where p.review_status = 'approved' and p.listed and p.archived_at is null and p.deleted_at is null
      and p.listed_at is not null and (p_city is null or p.city_id = p_city)
  ),
  months as (select generate_series(date_trunc('month', p_from - interval '5 months'), date_trunc('month', p_to::timestamp), interval '1 month')::date as m),
  host_rows as (
    select c.host_id, max(c.host_name) as host_name, max(c.property_name) as property_name,
           count(distinct c.unit_id) as units, count(*) as bookings, sum(c.value_kes) as value_kes,
           sum(coalesce(c.commission_kes, 0)) as commission_kes, sum(coalesce(c.host_share_kes, 0)) as host_share_kes,
           bool_and(c.paid) as all_paid,
           (select hp.rail from public.host_payout hp where hp.host_id = c.host_id) as rail,
           (select hp.verified_at is not null from public.host_payout hp where hp.host_id = c.host_id) as payout_verified
    from cur c group by c.host_id
  )
  select jsonb_build_object(
    'rules', jsonb_build_object('commission_pct', v_commission_pct, 'vat_pct', v_vat, 'pm_share_pct', v_share,
      'management_fee_kes', v_fee, 'trial_months', v_trial, 'guest_orders_shared', v_shared),
    'kpis', jsonb_build_object(
      'gbv', (select coalesce(sum(value_kes), 0) from cur),
      'gbv_prev', (select coalesce(sum(value_kes), 0) from prev),
      'commission', (select coalesce(sum(commission_kes), 0) from cur),
      'commission_prev', (select coalesce(sum(commission_kes), 0) from prev),
      'commission_ex_vat', (select round(coalesce(sum(commission_kes), 0) / (1 + v_vat / 100)) from cur),
      'vat', (select round(coalesce(sum(commission_kes), 0) - coalesce(sum(commission_kes), 0) / (1 + v_vat / 100)) from cur),
      'pm_share', (select round(coalesce(sum(commission_kes), 0) / (1 + v_vat / 100) * v_share / 100)
                    from cur where property_manager_id is not null),
      'host_payouts', (select coalesce(sum(host_share_kes), 0) from cur),
      'refunds', (select coalesce(sum(refunded_kes), 0) from public.console_stays_rows(p_city) x
                   where x.status = 'cancelled' and x.check_in >= v_start and x.check_in < v_end),
      'bookings', (select count(*) from cur),
      'unrecorded_commission', (select count(*) from cur where commission_kes is null),
      'guest_orders_kes', (select coalesce(sum(total_kes), 0) from orders),
      'active_properties', (select count(*) from fees),
      'paying_properties', (select count(*) from fees where trial_ends <= v_end),
      'trial_properties', (select count(*) from fees where trial_ends > v_end),
      'management_fees', (select coalesce(sum(v_fee * least(v_months,
          greatest(0, ceil(extract(epoch from (v_end - greatest(trial_ends, v_start))) / 86400 / 30.4)))), 0)
          from fees where trial_ends < v_end),
      'paid_bookings', (select count(*) from cur where paid),
      'settled_hosts', (select count(*) from host_rows where all_paid and coalesce(payout_verified, false)),
      'hosts_in_period', (select count(*) from host_rows)),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('month', mo.m,
        'value_kes', (select coalesce(sum(value_kes), 0) from r where date_trunc('month', check_in at time zone 'Africa/Nairobi')::date = mo.m),
        'commission_kes', (select coalesce(sum(commission_kes), 0) from r where date_trunc('month', check_in at time zone 'Africa/Nairobi')::date = mo.m),
        'bookings', (select count(*) from r where date_trunc('month', check_in at time zone 'Africa/Nairobi')::date = mo.m))
        order by mo.m), '[]'::jsonb) from months mo),
    'orders_by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'kes', x.kes, 'n', x.n)
        order by x.kes desc), '[]'::jsonb) from (select category, sum(total_kes) as kes, count(*) as n from orders group by 1) x),
    'hosts', (select coalesce(jsonb_agg(to_jsonb(h) order by h.value_kes desc), '[]'::jsonb) from host_rows h),
    'managers', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name,
          'bookings', x.n, 'value_kes', x.v, 'commission_kes', x.c,
          'share_kes', round(x.c / (1 + v_vat / 100) * v_share / 100)) order by x.c desc), '[]'::jsonb)
        from (select property_manager_id, count(*) as n, sum(value_kes) as v, sum(coalesce(commission_kes, 0)) as c
                from cur where property_manager_id is not null group by 1) x
        join public.property_manager m on m.id = x.property_manager_id),
    'fees', (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'listed_at', f.listed_at,
          'trial_ends', f.trial_ends, 'in_trial', f.trial_ends > v_end) order by f.name), '[]'::jsonb) from fees f)
  ) into v_result;
  return v_result;
end;
$$;

/* Reviews & Ratings. */
create or replace function public.rpc_console_stays_reviews(
  p_from date, p_to date, p_city uuid default null, p_tab text default 'all',
  p_q text default null, p_rating integer default null, p_page integer default 1, p_size integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Africa/Nairobi';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi';
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 10), 1), 500);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);

  with rv as (
    select sr.stay_id, sr.rating, sr.text, sr.themes, sr.answered_at, sr.moderation, sr.staff_reply, sr.featured,
           x.ref, x.guest_name, x.unit_label, x.property_name, x.property_id, x.host_id, x.host_name,
           x.nights, x.check_in, x.unit_id
    from public.stay_review sr
    join public.console_stays_rows(p_city) x on x.stay_id = sr.stay_id
    where sr.rating is not null and sr.answered_at >= v_start and sr.answered_at < v_end
  ),
  f as (select * from rv where (p_tab = 'all' or moderation = p_tab)
          and (p_rating is null or rating = p_rating)
          and (v_q is null or guest_name ilike '%' || v_q || '%' or coalesce(property_name, '') ilike '%' || v_q || '%'
               or coalesce(unit_label, '') ilike '%' || v_q || '%' or coalesce(text, '') ilike '%' || v_q || '%'))
  select jsonb_build_object(
    'total', (select count(*) from f),
    'counts', jsonb_build_object('all', (select count(*) from rv),
      'published', (select count(*) from rv where moderation = 'published'),
      'under_review', (select count(*) from rv where moderation = 'under_review'),
      'hidden', (select count(*) from rv where moderation = 'hidden')),
    'kpis', jsonb_build_object(
      'avg', (select round(avg(rating), 2) from rv),
      'reviews', (select count(*) from rv),
      'properties', (select count(distinct property_id) from rv),
      'units', (select count(distinct unit_id) from rv),
      'positive_pct', (select round(100.0 * count(*) filter (where rating >= 4) / nullif(count(*), 0), 1) from rv),
      'attention_pct', (select round(100.0 * count(*) filter (where rating <= 3) / nullif(count(*), 0), 1) from rv)),
    'stars', (select jsonb_agg(jsonb_build_object('stars', s, 'n', (select count(*) from rv where rating = s)) order by s desc)
              from generate_series(1, 5) s),
    'themes', (select coalesce(jsonb_agg(jsonb_build_object('theme', t.theme, 'n', t.n) order by t.n desc), '[]'::jsonb)
               from (select unnest(themes) as theme, count(*) as n from rv group by 1 order by 2 desc limit 8) t),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.answered_at desc), '[]'::jsonb) from (
        select * from f order by answered_at desc offset (v_page - 1) * v_size limit v_size) t)
  ) into v_result;
  return v_result;
end;
$$;

/* Incidents & Disputes. */
create or replace function public.rpc_console_stays_cases(
  p_from date, p_to date, p_tab text default 'all', p_q text default null,
  p_page integer default 1, p_size integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Africa/Nairobi';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi';
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 10), 1), 500);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);

  with c as (
    select sc.*, case sc.case_type when 'dispute' then 'DSP-' when 'claim' then 'CLM-' else 'INC-' end || sc.ref as ref_text,
           p.name as property_name, coalesce(u.label_public, u.name) as unit_label,
           'NXG-' || upper(right(replace(sc.stay_id::text, '-', ''), 6)) as stay_ref,
           su.display_name as assigned_name
    from public.stays_case sc
    left join public.property p on p.id = sc.property_id
    left join public.unit u on u.id = sc.unit_id
    left join public.staff_user su on su.id = sc.assigned_to
    where sc.created_at >= v_start and sc.created_at < v_end
  ),
  f as (select * from c where (p_tab = 'all'
            or (p_tab = 'incidents' and case_type = 'incident')
            or (p_tab = 'disputes' and case_type = 'dispute')
            or (p_tab = 'claims' and case_type = 'claim')
            or (p_tab = 'escalations' and escalated_at is not null))
          and (v_q is null or ref_text ilike '%' || v_q || '%' or title ilike '%' || v_q || '%'
               or coalesce(property_name, '') ilike '%' || v_q || '%'))
  select jsonb_build_object(
    'total', (select count(*) from f),
    'counts', jsonb_build_object('all', (select count(*) from c),
      'incidents', (select count(*) from c where case_type = 'incident'),
      'disputes', (select count(*) from c where case_type = 'dispute'),
      'claims', (select count(*) from c where case_type = 'claim'),
      'escalations', (select count(*) from c where escalated_at is not null)),
    'kpis', jsonb_build_object(
      'total', (select count(*) from c),
      'open', (select count(*) from c where status = 'open'),
      'in_progress', (select count(*) from c where status in ('in_progress', 'mediation')),
      'resolved', (select count(*) from c where status in ('resolved', 'closed')),
      'escalated', (select count(*) from c where escalated_at is not null),
      'valid', (select count(*) from c where status <> 'invalid'),
      'closed', (select count(*) from c where status = 'closed'),
      'bookings', (select count(*) from public.stay s where s.status in ('booked', 'in_stay', 'departed')
                    and s.check_in >= v_start and s.check_in < v_end),
      'disputes', (select count(*) from c where case_type = 'dispute'),
      'avg_resolution_h', (select round(avg(extract(epoch from (resolved_at - created_at)) / 3600)::numeric, 1)
                            from c where resolved_at is not null),
      'first_response_pct', (select round(100.0 * count(*) filter (where first_response_at <= created_at + interval '1 hour')
                              / nullif(count(*) filter (where first_response_at is not null), 0), 1) from c),
      'resolution_pct', (select round(100.0 * count(*) filter (where resolved_at <= created_at + interval '24 hours')
                              / nullif(count(*) filter (where resolved_at is not null), 0), 1) from c),
      'escalation_pct', (select round(100.0 * count(*) filter (where escalated_at <= created_at + interval '4 hours')
                              / nullif(count(*) filter (where escalated_at is not null), 0), 1) from c)),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'n', x.n) order by x.n desc), '[]'::jsonb)
                    from (select category, count(*) as n from c group by 1) x),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('month', x.m, 'total', x.t, 'resolved', x.r) order by x.m), '[]'::jsonb)
              from (select date_trunc('month', sc.created_at at time zone 'Africa/Nairobi')::date as m, count(*) as t,
                           count(*) filter (where sc.resolved_at is not null) as r
                      from public.stays_case sc where sc.created_at >= v_end - interval '6 months' and sc.created_at < v_end
                      group by 1) x),
    'open_incidents', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (
        select id, ref_text, title, property_name, unit_label, reported_by, priority, created_at, status from c
        where case_type = 'incident' and status in ('open', 'in_progress', 'mediation') order by created_at desc limit 5) t),
    'open_disputes', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (
        select id, ref_text, title, stay_ref, parties, amount_kes, created_at, status from c
        where case_type in ('dispute', 'claim') and status in ('open', 'in_progress', 'mediation') order by created_at desc limit 5) t),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (
        select * from f order by created_at desc offset (v_page - 1) * v_size limit v_size) t)
  ) into v_result;
  return v_result;
end;
$$;

/* Acquisition & Referrals. */
create or replace function public.rpc_console_stays_acquisition(
  p_from date, p_to date, p_city uuid default null, p_tab text default 'all', p_q text default null,
  p_page integer default 1, p_size integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Africa/Nairobi';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi';
  v_pstart timestamptz := ((p_from - (p_to - p_from + 1))::timestamp) at time zone 'Africa/Nairobi';
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 10), 1), 500);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);

  with l as (
    select sl.*, su.display_name as assigned_name, h.display_name as referrer_name
    from public.stays_lead sl
    left join public.staff_user su on su.id = sl.assigned_to
    left join public.host h on h.id = sl.referrer_host_id
    where sl.created_at >= v_start and sl.created_at < v_end
  ),
  f as (select * from l where (p_tab = 'all' or kind = p_tab or (p_tab = 'referrals' and source = 'referral'))
          and (v_q is null or name ilike '%' || v_q || '%' or coalesce(property_name, '') ilike '%' || v_q || '%'
               or coalesce(phone, '') ilike '%' || v_q || '%')),
  refs as (select * from public.host_referral hr where hr.created_at >= v_start and hr.created_at < v_end),
  months as (select generate_series(date_trunc('month', v_end - interval '10 months'), date_trunc('month', v_end - interval '1 second'), interval '1 month') as m)
  select jsonb_build_object(
    'total', (select count(*) from f),
    'counts', jsonb_build_object('all', (select count(*) from l),
      'host', (select count(*) from l where kind = 'host'),
      'property_manager', (select count(*) from l where kind = 'property_manager'),
      'partner', (select count(*) from l where kind = 'partner'),
      'referrals', (select count(*) from l where source = 'referral')),
    'kpis', jsonb_build_object(
      'new_hosts', (select count(*) from public.host h where h.created_at >= v_start and h.created_at < v_end
                     and (p_city is null or h.city_id = p_city)),
      'new_hosts_prev', (select count(*) from public.host h where h.created_at >= v_pstart and h.created_at < v_start
                     and (p_city is null or h.city_id = p_city)),
      'new_units', (select count(*) from public.unit u where u.created_at >= v_start and u.created_at < v_end
                     and u.archived_at is null and (p_city is null or u.city_id = p_city)),
      'new_units_prev', (select count(*) from public.unit u where u.created_at >= v_pstart and u.created_at < v_start
                     and (p_city is null or u.city_id = p_city)),
      'new_properties', (select count(*) from public.property p where p.created_at >= v_start and p.created_at < v_end
                     and p.archived_at is null and (p_city is null or p.city_id = p_city)),
      'referral_signups', (select count(*) from refs where referred_host_id is not null),
      'referral_conversions', (select count(*) from refs where live_at is not null),
      'referral_rewards_kes', (select coalesce(sum(reward_amount_kes), 0) from refs where reward_status <> 'void'),
      'referrals', (select count(*) from refs),
      'campaign_spend_kes', (select coalesce(sum(spend_kes), 0) from public.stays_campaign c
                             where c.objective in ('host_onboarding', 'building_partners', 'referrals')
                               and c.starts_on <= p_to and coalesce(c.ends_on, p_to) >= p_from)),
    'funnel', jsonb_build_object(
      'captured', (select count(*) from l),
      'qualified', (select count(*) from l where status in ('qualified', 'onboarding', 'verification', 'activated')),
      'onboarded', (select count(*) from l where status in ('onboarding', 'verification', 'activated')),
      'activated', (select count(*) from l where status = 'activated')),
    'channels', (select coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'n', x.n) order by x.n desc), '[]'::jsonb)
                 from (select source, count(*) as n from l group by 1) x),
    'unit_trend', (select jsonb_agg(jsonb_build_object('month', mo.m::date,
        'new_units', (select count(*) from public.unit u where date_trunc('month', u.created_at) = mo.m
                       and (p_city is null or u.city_id = p_city)),
        'cumulative', (select count(*) from public.unit u where u.created_at < mo.m + interval '1 month'
                       and (u.archived_at is null or u.archived_at >= mo.m + interval '1 month')
                       and (p_city is null or u.city_id = p_city))) order by mo.m) from months mo),
    'top_referrers', (select coalesce(jsonb_agg(to_jsonb(x) order by x.referrals desc), '[]'::jsonb) from (
        select h.id, coalesce(h.display_name, h.contact_name) as name, h.kind::text as kind,
               count(*) as referrals, count(*) filter (where hr.live_at is not null) as conversions,
               coalesce(sum(hr.reward_amount_kes) filter (where hr.reward_status <> 'void'), 0) as rewards_kes
        from public.host_referral hr join public.host h on h.id = hr.referrer_host_id
        group by h.id order by count(*) desc limit 5) x),
    'rows', (select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) from (
        select * from f order by created_at desc offset (v_page - 1) * v_size limit v_size) t)
  ) into v_result;
  return v_result;
end;
$$;

/* QR Codes & Marketing. */
create or replace function public.rpc_console_stays_marketing(
  p_from date, p_to date, p_city uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Africa/Nairobi';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi';
  v_pstart timestamptz := ((p_from - (p_to - p_from + 1))::timestamp) at time zone 'Africa/Nairobi';
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);

  with q as (select * from public.property_qr pq where pq.host_id is not null
               and (p_city is null or pq.city_id = p_city)),
  sc as (select s.* from public.qr_scan s join q on q.id = s.qr_id
          where s.scanned_at >= v_pstart and s.scanned_at < v_end and not coalesce(s.is_bot, false)
            and not coalesce(s.is_test, false)),
  camp as (select * from public.stays_campaign c where c.starts_on <= p_to and coalesce(c.ends_on, p_to) >= p_from)
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'active_codes', (select count(*) from q where q.state::text in ('sent', 'placed', 'scanned')),
      'codes', (select count(*) from q where q.voided_at is null and q.state::text <> 'replaced'),
      'scans', (select count(*) from sc where scanned_at >= v_start),
      'scans_prev', (select count(*) from sc where scanned_at < v_start),
      'orders_from_qr', (select count(*) from sc where scanned_at >= v_start and ordered_at is not null),
      'campaigns_running', (select count(*) from camp where status = 'active'),
      'spend_kes', (select coalesce(sum(spend_kes), 0) from camp),
      'bookings_value_kes', (select coalesce(sum(coalesce(s.paid_kes, s.quote_total_kes)), 0) from public.stay s
                       where s.source = 'nexg' and s.status in ('booked', 'in_stay', 'departed')
                         and s.created_at >= v_start and s.created_at < v_end)),
    'by_placement', (select coalesce(jsonb_agg(jsonb_build_object('placement', x.placement, 'n', x.n) order by x.n desc), '[]'::jsonb)
                     from (select placement::text as placement, count(*) as n from sc where scanned_at >= v_start group by 1) x),
    'campaigns', (select coalesce(jsonb_agg(to_jsonb(c) order by c.starts_on desc), '[]'::jsonb) from (
        select * from public.stays_campaign order by starts_on desc limit 20) c),
    'codes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.scans desc), '[]'::jsonb) from (
        select q.id, q.code, q.label, q.placement::text as placement, q.state::text as state, q.scans, q.orders,
               q.last_scanned_at, coalesce(u.label_public, u.name) as unit_label, p.name as property_name
        from q left join public.unit u on q.owner_type = 'unit' and u.id = q.owner_id
               left join public.property p on p.id = u.property_id
        where q.voided_at is null order by q.scans desc limit 12) x)
  ) into v_result;
  return v_result;
end;
$$;

/* Performance & Analytics. */
create or replace function public.rpc_console_stays_performance(
  p_from date, p_to date, p_city uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := (p_from::timestamp) at time zone 'Africa/Nairobi';
  v_end timestamptz := ((p_to + 1)::timestamp) at time zone 'Africa/Nairobi';
  v_len integer := p_to - p_from + 1;
  v_pfrom date := p_from - (p_to - p_from + 1);
  v_pto date := p_from - 1;
  v_pstart timestamptz := ((p_from - (p_to - p_from + 1))::timestamp) at time zone 'Africa/Nairobi';
  v_units integer;
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  perform public.fn_stays_check_period(p_from, p_to);
  select count(*) into v_units from public.unit u
   where u.status = 'live' and u.archived_at is null and u.deleted_at is null
     and (p_city is null or u.city_id = p_city);

  with r as (select * from public.console_stays_rows(p_city)),
  b as (select * from r where status in ('booked', 'in_stay', 'departed')),
  cur as (select * from b where check_in >= v_start and check_in < v_end),
  prev as (select * from b where check_in >= v_pstart and check_in < v_start),
  allcur as (select * from r where check_in >= v_start and check_in < v_end),
  allprev as (select * from r where check_in >= v_pstart and check_in < v_start),
  months as (select generate_series(date_trunc('month', p_to - interval '5 months'), date_trunc('month', p_to::timestamp), interval '1 month')::date as m),
  ahead as (select generate_series(date_trunc('month', now() + interval '1 month'), date_trunc('month', now() + interval '3 months'), interval '1 month')::date as m),
  guests as (select guest_name, count(*) as n from b group by 1)
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'bookings', (select count(*) from cur), 'bookings_prev', (select count(*) from prev),
      'gbv', (select coalesce(sum(value_kes), 0) from cur), 'gbv_prev', (select coalesce(sum(value_kes), 0) from prev),
      'commission', (select coalesce(sum(commission_kes), 0) from cur),
      'commission_prev', (select coalesce(sum(commission_kes), 0) from prev),
      'occupancy_pct', case when v_units > 0 then round(100.0 *
          (select coalesce(sum(public.fn_stays_nights_in(x.check_in, x.check_out, p_from, p_to)), 0) from b x) / (v_units * v_len), 1) end,
      'occupancy_prev_pct', case when v_units > 0 then round(100.0 *
          (select coalesce(sum(public.fn_stays_nights_in(x.check_in, x.check_out, v_pfrom, v_pto)), 0) from b x) / (v_units * v_len), 1) end,
      'active_properties', (select count(*) from public.property p where p.review_status = 'approved' and p.listed
                             and p.archived_at is null and (p_city is null or p.city_id = p_city)),
      'active_units', v_units,
      'rating', (select round(avg(rating), 2) from cur where rating is not null),
      'rating_prev', (select round(avg(rating), 2) from prev where rating is not null),
      'ratings', (select count(*) from cur where rating is not null),
      'adr', (select round(sum(value_kes)::numeric / nullif(sum(nights), 0)) from cur),
      'adr_prev', (select round(sum(value_kes)::numeric / nullif(sum(nights), 0)) from prev),
      'revpar', case when v_units > 0 then (select round(sum(value_kes)::numeric / (v_units * v_len)) from cur) end,
      'revpar_prev', case when v_units > 0 then (select round(sum(value_kes)::numeric / (v_units * v_len)) from prev) end,
      'avg_nights', (select round(avg(nights), 1) from cur), 'avg_nights_prev', (select round(avg(nights), 1) from prev),
      'cancel_pct', (select round(100.0 * count(*) filter (where status = 'cancelled') / nullif(count(*), 0), 1) from allcur),
      'cancel_prev_pct', (select round(100.0 * count(*) filter (where status = 'cancelled') / nullif(count(*), 0), 1) from allprev),
      'repeat_pct', (select round(100.0 * count(*) filter (where n > 1) / nullif(count(*), 0), 1) from guests where guest_name <> 'Guest'),
      'satisfaction_pct', (select round(100.0 * count(*) filter (where rating >= 4) / nullif(count(*), 0), 1) from cur where rating is not null),
      'active_hosts', (select count(*) from public.host h where h.status = 'live' and (p_city is null or h.city_id = p_city)),
      'managers', (select count(*) from public.property_manager m where m.status = 'active'),
      'host_rating', (select round(avg(rating), 2) from b where rating is not null)),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('month', mo.m,
        'bookings', (select count(*) from b where date_trunc('month', check_in at time zone 'Africa/Nairobi')::date = mo.m),
        'value_kes', (select coalesce(sum(value_kes), 0) from b where date_trunc('month', check_in at time zone 'Africa/Nairobi')::date = mo.m))
        order by mo.m), '[]'::jsonb) from months mo),
    'stars', (select jsonb_agg(jsonb_build_object('stars', s, 'n', (select count(*) from b where rating = s)) order by s desc)
              from generate_series(1, 5) s),
    'areas', (select coalesce(jsonb_agg(to_jsonb(x) order by x.value_kes desc), '[]'::jsonb) from (
        select coalesce(area, 'No area') as area, count(*) as bookings, sum(value_kes) as value_kes,
               sum(coalesce(commission_kes, 0)) as commission_kes,
               round(100.0 * sum(public.fn_stays_nights_in(check_in, check_out, p_from, p_to))
                 / nullif((select count(*) from public.unit u join public.property p2 on p2.id = u.property_id
                    where coalesce(u.area, p2.area) is not distinct from cur.area and u.status = 'live'
                      and u.archived_at is null) * v_len, 0), 1) as occupancy_pct
        from cur group by area order by sum(value_kes) desc limit 5) x),
    'top_properties', (select coalesce(jsonb_agg(to_jsonb(x) order by x.value_kes desc), '[]'::jsonb) from (
        select property_id, max(property_name) as name, max(area) as area,
               (select count(*) from public.unit u where u.property_id = cur.property_id and u.archived_at is null) as units,
               sum(value_kes) as value_kes, round(sum(value_kes)::numeric / nullif(sum(nights), 0)) as adr,
               round(100.0 * sum(public.fn_stays_nights_in(check_in, check_out, p_from, p_to))
                 / nullif((select count(*) from public.unit u where u.property_id = cur.property_id
                    and u.status = 'live' and u.archived_at is null) * v_len, 0), 1) as occupancy_pct
        from cur where property_id is not null group by property_id order by sum(value_kes) desc limit 3) x),
    'channels', (select coalesce(jsonb_agg(jsonb_build_object('source', x.source, 'n', x.n) order by x.n desc), '[]'::jsonb)
                 from (select source, count(*) as n from cur group by 1) x),
    'segments', jsonb_build_object(
      'long', (select count(*) from cur where nights >= 7),
      'couples', (select count(*) from cur where nights < 7 and party = 2),
      'groups', (select count(*) from cur where nights < 7 and party >= 3),
      'solo', (select count(*) from cur where nights < 7 and party <= 1)),
    'ahead', (select coalesce(jsonb_agg(jsonb_build_object('month', a.m,
        'bookings', (select count(*) from b where status = 'booked' and date_trunc('month', check_in at time zone 'Africa/Nairobi')::date = a.m),
        'value_kes', (select coalesce(sum(value_kes), 0) from b where status = 'booked' and date_trunc('month', check_in at time zone 'Africa/Nairobi')::date = a.m),
        'commission_kes', (select coalesce(sum(commission_kes), 0) from b where status = 'booked' and date_trunc('month', check_in at time zone 'Africa/Nairobi')::date = a.m))
        order by a.m), '[]'::jsonb) from ahead a)
  ) into v_result;
  return v_result;
end;
$$;

/* Reports: exports staff ran, newest first. */
create or replace function public.rpc_console_stays_report_runs(p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_stays_reader_gate();
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at desc), '[]'::jsonb) from (
    select r.id, r.report, r.period_from, r.period_to, r.rows_exported, r.generated_at,
           su.display_name as generated_by_name
    from public.stays_report_run r left join public.staff_user su on su.id = r.generated_by
    order by r.generated_at desc limit least(greatest(coalesce(p_limit, 10), 1), 100)) x);
end;
$$;

/* Stays Configuration: the stays settings with their values now, and the stay commission per city. */
create or replace function public.rpc_console_stays_settings(p_city uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_city uuid := coalesce(p_city, (select id from public.city where slug = 'nairobi'));
begin
  perform public.fn_stays_reader_gate();
  return jsonb_build_object(
    'settings', (select coalesce(jsonb_agg(jsonb_build_object(
        'key', d.key, 'group', d."group", 'label', d.label, 'help', d.help, 'unit', d.unit,
        'value_type', d.value_type, 'value', public.fn_stays_setting(d.key), 'sort', d.sort)
        order by d.sort), '[]'::jsonb)
      from settings.definition d where d."group" = 'stays' and d.deprecated_at is null),
    'commission_pct', coalesce(nullif(settings.fn_get('payouts.host.commission_pct', 'city'::settings.scope_kind,
        v_city, null, null, now()) ->> 'value', '')::numeric, 15),
    'agreed_terms', (select count(*) from public.host_commission_term t where t.status = 'approved'
                      and (t.ends_on is null or t.ends_on >= current_date)),
    'calendar_connections', (select count(*) from public.calendar_connection c where c.status = 'ok'),
    'calendar_by_provider', (select coalesce(jsonb_object_agg(x.provider, x.n), '{}'::jsonb)
                              from (select provider, count(*) as n from public.calendar_connection group by 1) x),
    'live_units', (select count(*) from public.unit u where u.status = 'live' and u.archived_at is null));
end;
$fn$;

/*
 * Integrations (a top-level console page): for each service NexG runs on,
 * whether it has done its job lately. Counts and times only; no keys,
 * recipients or payloads. Reaching Settings or Finance is enough to read it.
 */
create or replace function public.rpc_console_integrations_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_week timestamptz := now() - interval '7 days';
begin
  if not (authz.reaches_module('settings') or authz.reaches_module('finance')) then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'paystack', jsonb_build_object(
      'last_at', (select max(created_at) from public.payment where provider = 'paystack'),
      'paid_7d', (select count(*) from public.payment where provider = 'paystack' and state = 'paid' and paid_at >= v_week),
      'failed_7d', (select count(*) from public.payment where provider = 'paystack' and state = 'failed' and updated_at >= v_week),
      'live_7d', (select count(*) from public.payment where provider = 'paystack' and not is_test and created_at >= v_week),
      'subaccounts', (select count(*) from public.host_paystack_subaccount) + (select count(*) from public.merchant_paystack_subaccount)),
    'mpesa', jsonb_build_object(
      'last_at', greatest((select max(created_at) from public.payment where provider = 'mpesa'),
                          (select max(created_at) from public.mpesa_payout)),
      'paid_7d', (select count(*) from public.payment where provider = 'mpesa' and state = 'paid' and paid_at >= v_week),
      'failed_7d', (select count(*) from public.payment where provider = 'mpesa' and state = 'failed' and updated_at >= v_week),
      'payouts_7d', (select count(*) from public.mpesa_payout where created_at >= v_week)),
    'bank', jsonb_build_object(
      'last_at', (select max(created_at) from public.paystack_transfer),
      'sent_7d', (select count(*) from public.paystack_transfer where created_at >= v_week),
      'failed_7d', (select count(*) from public.paystack_transfer where state = 'failed' and updated_at >= v_week)),
    'email', jsonb_build_object(
      'last_at', (select max(coalesce(sent_at, created_at)) from public.notification_log where channel = 'email' and status = 'sent'),
      'sent_7d', (select count(*) from public.notification_log where channel = 'email' and status = 'sent' and created_at >= v_week),
      'failed_7d', (select count(*) from public.notification_log where channel = 'email' and status = 'failed' and created_at >= v_week),
      'queued', (select count(*) from public.notification_log where channel = 'email' and status = 'queued')),
    'sms', jsonb_build_object(
      'last_at', (select max(coalesce(sent_at, created_at)) from public.notification_log where channel = 'sms' and status = 'sent'),
      'sent_7d', (select count(*) from public.notification_log where channel = 'sms' and status = 'sent' and created_at >= v_week)),
    'push', jsonb_build_object(
      'last_at', (select max(coalesce(sent_at, created_at)) from public.notification_log where channel = 'push' and status = 'sent'),
      'sent_7d', (select count(*) from public.notification_log where channel = 'push' and status = 'sent' and created_at >= v_week)),
    'calendar', jsonb_build_object(
      'last_at', (select max(last_synced_at) from public.calendar_connection),
      'ok', (select count(*) from public.calendar_connection where status = 'ok'),
      'failing', (select count(*) from public.calendar_connection where status = 'failing'),
      'pending', (select count(*) from public.calendar_connection where status = 'pending')),
    'webhooks', jsonb_build_object(
      'last_at', (select max(created_at) from public.api_webhook_delivery),
      'endpoints', (select count(*) from public.api_webhook_endpoint where enabled),
      'delivered_7d', (select count(*) from public.api_webhook_delivery where delivered_at >= v_week),
      'failing', (select count(*) from public.api_webhook_endpoint where enabled and last_delivery_ok = false)),
    'api', jsonb_build_object(
      'last_at', (select max(last_used_at) from public.api_key),
      'keys', (select count(*) from public.api_key where revoked_at is null)),
    'connectors', jsonb_build_object(
      'last_at', (select max(created_at) from public.connector_outbox),
      'delivered_7d', (select count(*) from public.connector_outbox where delivered_at >= v_week)),
    'activity', (select coalesce(jsonb_agg(to_jsonb(a) order by a.at desc), '[]'::jsonb) from (
      select * from (
        (select 'paystack' as service,
                case when p.state = 'paid' then 'ok' when p.state = 'failed' then 'failed' else 'pending' end as outcome,
                'Payment ' || p.state as what, coalesce(p.paid_at, p.updated_at) as at
           from public.payment p where p.provider = 'paystack' order by p.updated_at desc limit 3)
        union all
        (select 'mpesa', case when p.state = 'paid' then 'ok' when p.state = 'failed' then 'failed' else 'pending' end,
                'M-PESA payment ' || p.state, coalesce(p.paid_at, p.updated_at)
           from public.payment p where p.provider = 'mpesa' order by p.updated_at desc limit 3)
        union all
        (select 'email', case when n.status = 'sent' then 'ok' when n.status = 'failed' then 'failed' else 'pending' end,
                'Email ' || n.status, coalesce(n.sent_at, n.created_at)
           from public.notification_log n where n.channel = 'email' order by n.created_at desc limit 3)
        union all
        (select 'calendar', case when c.status = 'ok' then 'ok' when c.status = 'failing' then 'failed' else 'pending' end,
                'Calendar sync ' || c.status, coalesce(c.last_synced_at, c.created_at)
           from public.calendar_connection c order by coalesce(c.last_synced_at, c.created_at) desc limit 3)
        union all
        (select 'webhooks', case when d.state = 'delivered' then 'ok' when d.state = 'failed' then 'failed' else 'pending' end,
                'Webhook ' || d.state, coalesce(d.delivered_at, d.created_at)
           from public.api_webhook_delivery d order by d.created_at desc limit 3)
      ) u where u.at is not null order by u.at desc limit 6) a));
end;
$fn$;

-- ═══════════════════════════════════════════════════════════════ 6. writers

/*
 * Send a host application back to fix (it stays applied, with the reason)
 * or decline it (offboarded). Either way the host is emailed the reason by
 * tg_host_review_tells_host.
 */
create or replace function public.rpc_console_host_reject(
  p_host_id uuid, p_reason text, p_final boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_host public.host;
begin
  if v_reason is null then
    raise exception 'Say why, in words the host can act on.' using errcode = 'check_violation';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Keep the reason to 500 characters.' using errcode = 'check_violation';
  end if;

  update public.host set
    status = case when p_final then 'offboarded'::public.host_status else 'applied'::public.host_status end,
    status_reason = v_reason,
    submitted_at = case when p_final then submitted_at else null end,
    rejected_at = now(),
    rejected_by = v_staff,
    updated_at = now()
  where id = p_host_id and status in ('applied', 'verifying')
  returning * into v_host;

  if v_host.id is null then
    raise exception 'That host is not waiting for a decision.' using errcode = 'no_data_found';
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'host.rejected',
    p_target_type => 'host', p_target_id => p_host_id, p_city_id => v_host.city_id,
    p_after => jsonb_build_object('final', p_final), p_reason => v_reason,
    p_severity => 'notice'::public.audit_severity);

  return jsonb_build_object('host_id', v_host.id, 'status', v_host.status);
end;
$$;

/* Email the host when staff approve, send back or decline their application. */
create or replace function public.tg_host_review_tells_host()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name text := coalesce(nullif(btrim(new.contact_name), ''), new.display_name, 'there');
begin
  begin
    v_email := coalesce(public.fn_receipt_email('host', new.id), new.email);
    if v_email is null then
      return null;
    end if;
    if new.status = 'live' and old.status in ('applied', 'verifying') then
      perform public.fn_notify_enqueue(
        p_channel => 'email', p_recipient => v_email, p_template => 'host_approved',
        p_subject => 'You are approved to host on NexG',
        p_body => 'Hi ' || v_name || ',' || E'\n\n'
          || 'NexG has checked your details and approved your host account. Your listings that are '
          || 'ready now show to guests on NexG.' || E'\n\n'
          || 'Sign in to your host workspace to see your bookings and finish any unit that is still being set up.'
          || E'\n\n' || '— NexG Concierge',
        p_payload => jsonb_build_object('host_id', new.id));
    elsif new.rejected_at is distinct from old.rejected_at and new.rejected_at is not null then
      perform public.fn_notify_enqueue(
        p_channel => 'email', p_recipient => v_email,
        p_template => case when new.status = 'offboarded' then 'host_declined' else 'host_sent_back' end,
        p_subject => case when new.status = 'offboarded' then 'Your NexG host application'
                          else 'Your NexG host application needs a change' end,
        p_body => 'Hi ' || v_name || ',' || E'\n\n'
          || case when new.status = 'offboarded'
               then 'NexG has reviewed your host application and cannot approve it.'
               else 'NexG has reviewed your host application and needs you to change something before we can approve it.' end
          || E'\n\n' || 'Reason: ' || coalesce(new.status_reason, '') || E'\n\n'
          || case when new.status = 'offboarded'
               then 'If you think this is a mistake, reply to this email.'
               else 'Sign in to your host workspace, fix it and send your application again.' end
          || E'\n\n' || '— NexG Concierge',
        p_payload => jsonb_build_object('host_id', new.id, 'final', new.status = 'offboarded'));
    end if;
  exception when others then
    raise warning 'host review email not queued for host %: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.tg_host_review_tells_host() from public, anon, authenticated;

drop trigger if exists host_review_tells_host on public.host;
create trigger host_review_tells_host after update of status, rejected_at on public.host
  for each row when (old.status is distinct from new.status or old.rejected_at is distinct from new.rejected_at)
  execute function public.tg_host_review_tells_host();

/* The same days and rule as the host's check-in (20270328000200): from the
   check-in date to before the check-out date in the host's time zone, and
   not while another guest is still checked in to the unit. */
create or replace function public.rpc_console_stay_check_in(p_stay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_stay public.stay;
  v_zone text;
  v_today date;
begin
  select * into v_stay from public.stay where id = p_stay_id for update;
  if v_stay.id is null then
    raise exception 'That stay is not there.' using errcode = 'no_data_found';
  end if;
  if v_stay.status = 'in_stay' then
    raise exception 'This guest is already checked in.' using errcode = '22023';
  end if;
  if v_stay.status <> 'booked' then
    raise exception 'Only a confirmed, paid reservation can be checked in.' using errcode = '22023';
  end if;

  select time_zone into v_zone from public.host where id = v_stay.host_id;
  if v_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    v_zone := 'Africa/Nairobi';
  end if;
  v_today := (now() at time zone v_zone)::date;
  if v_today < (v_stay.check_in at time zone v_zone)::date then
    raise exception 'The guest can be checked in from %.',
      to_char(v_stay.check_in at time zone v_zone, 'FMDD Mon YYYY') using errcode = '22023';
  end if;
  if v_today >= (v_stay.check_out at time zone v_zone)::date then
    raise exception 'This stay has already ended.' using errcode = '22023';
  end if;

  if v_stay.unit_id is not null then
    perform 1 from public.unit where id = v_stay.unit_id for update;
    if exists (select 1 from public.stay o
                where o.unit_id = v_stay.unit_id and o.id <> v_stay.id and o.status = 'in_stay') then
      raise exception 'Another guest is still checked in to this unit. Check them out first.'
        using errcode = '22023';
    end if;
  end if;

  update public.stay set status = 'in_stay', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
   where id = v_stay.id returning * into v_stay;
  update public.reservation_code set used_at = now(), used_by = auth.uid()
   where stay_id = v_stay.id and used_at is null;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay.checked_in_by_staff',
    p_target_type => 'stay', p_target_id => v_stay.id);
  return jsonb_build_object('stay_id', v_stay.id, 'status', v_stay.status, 'staff', v_staff);
end;
$$;

create or replace function public.rpc_console_stay_check_out(p_stay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_stay public.stay;
begin
  update public.stay set status = 'departed', checked_out_at = now(), checked_out_by = auth.uid(), updated_at = now()
   where id = p_stay_id and status = 'in_stay'
  returning * into v_stay;
  if v_stay.id is null then
    raise exception 'Only a guest who is checked in can be checked out.' using errcode = 'check_violation';
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'stay.checked_out_by_staff',
    p_target_type => 'stay', p_target_id => v_stay.id);
  return jsonb_build_object('stay_id', v_stay.id, 'status', v_stay.status, 'staff', v_staff);
end;
$$;

create or replace function public.rpc_console_stay_block(
  p_unit_id uuid, p_from date, p_to date, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_unit public.unit;
  v_zone text;
  v_in timestamptz;
  v_out timestamptz;
  v_stay public.stay;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'The block has to end after it starts.' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Block up to a year at a time.' using errcode = '22023';
  end if;
  select * into v_unit from public.unit where id = p_unit_id and archived_at is null for update;
  if v_unit.id is null then
    raise exception 'That unit is not open.' using errcode = '22023';
  end if;
  select coalesce(time_zone, 'Africa/Nairobi') into v_zone from public.host where id = v_unit.host_id;
  v_in := (p_from + time '12:00') at time zone v_zone;
  v_out := (p_to + time '12:00') at time zone v_zone;

  perform public.fn_stay_release_expired_holds(v_unit.id);
  if exists (select 1 from public.stay s where s.unit_id = v_unit.id
               and public.fn_stay_occupies(s.status, s.hold_expires_at)
               and s.check_in < v_out and s.check_out > v_in) then
    raise exception 'Those dates already have a booking, hold or block. Cancel it first.' using errcode = '23P01';
  end if;

  insert into public.stay (host_id, property_id, unit_id, party_adults, party_children,
                           check_in, check_out, source, status, notes)
  values (v_unit.host_id, v_unit.property_id, v_unit.id, 0, 0, v_in, v_out, 'entered', 'blocked',
          left('Blocked by NexG staff' || coalesce(': ' || nullif(btrim(coalesce(p_note, '')), ''), ''), 500))
  returning * into v_stay;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay.dates_blocked_by_staff',
    p_target_type => 'stay', p_target_id => v_stay.id, p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('unit', v_unit.name, 'from', p_from, 'to', p_to));
  return jsonb_build_object('stay_id', v_stay.id, 'staff', v_staff);
end;
$$;

create or replace function public.rpc_console_unit_rate_set(p_unit_id uuid, p_rate_kes integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_before integer;
  v_unit public.unit;
begin
  if p_rate_kes is null or p_rate_kes < 100 or p_rate_kes > 10000000 then
    raise exception 'Give a nightly rate between KES 100 and KES 10,000,000.' using errcode = 'check_violation';
  end if;
  select nightly_rate_kes into v_before from public.unit where id = p_unit_id;
  update public.unit set nightly_rate_kes = p_rate_kes, updated_at = now()
   where id = p_unit_id and archived_at is null returning * into v_unit;
  if v_unit.id is null then
    raise exception 'That unit is not open.' using errcode = 'no_data_found';
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'unit.rate_set_by_staff',
    p_target_type => 'unit', p_target_id => v_unit.id, p_city_id => v_unit.city_id,
    p_before => jsonb_build_object('nightly_rate_kes', v_before),
    p_after => jsonb_build_object('nightly_rate_kes', p_rate_kes));
  return jsonb_build_object('unit_id', v_unit.id, 'nightly_rate_kes', p_rate_kes, 'staff', v_staff);
end;
$$;

create or replace function public.rpc_console_review_moderate(
  p_stay_id uuid, p_action text, p_reply text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_review public.stay_review;
begin
  if p_action not in ('publish', 'hide', 'review', 'feature', 'unfeature', 'reply') then
    raise exception 'Publish, hide, review, feature, unfeature or reply.' using errcode = 'invalid_parameter_value';
  end if;
  if p_action = 'reply' and nullif(btrim(coalesce(p_reply, '')), '') is null then
    raise exception 'Write the reply.' using errcode = 'check_violation';
  end if;
  update public.stay_review set
    moderation = case p_action when 'publish' then 'published' when 'hide' then 'hidden'
                               when 'review' then 'under_review' else moderation end,
    featured = case p_action when 'feature' then true when 'unfeature' then false
                             when 'hide' then false else featured end,
    staff_reply = case when p_action = 'reply' then left(btrim(p_reply), 1000) else staff_reply end,
    moderated_at = now(), moderated_by = v_staff
  where stay_id = p_stay_id and rating is not null
  returning * into v_review;
  if v_review.stay_id is null then
    raise exception 'That review is not there.' using errcode = 'no_data_found';
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'stay_review.moderated',
    p_target_type => 'stay', p_target_id => p_stay_id,
    p_after => jsonb_build_object('action', p_action, 'moderation', v_review.moderation));
  return jsonb_build_object('stay_id', p_stay_id, 'moderation', v_review.moderation, 'featured', v_review.featured);
end;
$$;

create or replace function public.rpc_console_stays_case_open(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_stay public.stay;
  v_case public.stays_case;
  v_priority text := coalesce(nullif(p ->> 'priority', ''), 'medium');
  v_ref text;
begin
  if nullif(p ->> 'stay_id', '') is not null then
    select * into v_stay from public.stay where id = (p ->> 'stay_id')::uuid;
    if v_stay.id is null then
      raise exception 'That booking is not there.' using errcode = 'no_data_found';
    end if;
  elsif nullif(btrim(coalesce(p ->> 'stay_ref', '')), '') is not null then
    /* A booking ref is NXG- and the last six of the stay's id, as the screens show it. */
    v_ref := lower(regexp_replace(btrim(p ->> 'stay_ref'), '^NXG-', '', 'i'));
    if v_ref !~ '^[0-9a-f]{6}$' then
      raise exception 'Type a booking ref like NXG-1A2B3C.' using errcode = 'invalid_parameter_value';
    end if;
    if (select count(*) from public.stay where right(replace(id::text, '-', ''), 6) = v_ref) <> 1 then
      raise exception 'No single booking matches that ref.' using errcode = 'no_data_found';
    end if;
    select * into v_stay from public.stay where right(replace(id::text, '-', ''), 6) = v_ref;
  end if;
  insert into public.stays_case (case_type, category, title, description, stay_id, host_id, property_id, unit_id,
                                 reported_by, parties, amount_kes, priority, opened_by, assigned_to)
  values (coalesce(nullif(p ->> 'case_type', ''), 'incident'), coalesce(nullif(p ->> 'category', ''), 'other'),
          btrim(coalesce(p ->> 'title', '')), nullif(btrim(coalesce(p ->> 'description', '')), ''),
          v_stay.id, v_stay.host_id, v_stay.property_id, v_stay.unit_id,
          coalesce(nullif(p ->> 'reported_by', ''), 'guest'), nullif(btrim(coalesce(p ->> 'parties', '')), ''),
          nullif(p ->> 'amount_kes', '')::bigint, v_priority, v_staff, v_staff)
  returning * into v_case;
  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_case.opened',
    p_target_type => 'stays_case', p_target_id => v_case.id,
    p_after => jsonb_build_object('type', v_case.case_type, 'category', v_case.category, 'priority', v_case.priority));
  return jsonb_build_object('id', v_case.id, 'ref', v_case.ref);
end;
$$;

create or replace function public.rpc_console_stays_case_update(
  p_case_id uuid, p_status text default null, p_priority text default null,
  p_escalate boolean default false, p_assign_to_me boolean default false, p_resolution text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_case public.stays_case;
begin
  if p_status in ('resolved', 'closed') and nullif(btrim(coalesce(p_resolution, '')), '') is null
     and not exists (select 1 from public.stays_case where id = p_case_id and resolution is not null) then
    raise exception 'Say how it was resolved.' using errcode = 'check_violation';
  end if;
  update public.stays_case set
    status = coalesce(nullif(p_status, ''), status),
    priority = coalesce(nullif(p_priority, ''), priority),
    escalated_at = case when p_escalate then coalesce(escalated_at, now()) else escalated_at end,
    assigned_to = case when p_assign_to_me then v_staff else assigned_to end,
    first_response_at = coalesce(first_response_at, now()),
    resolved_at = case when coalesce(nullif(p_status, ''), status) in ('resolved', 'closed', 'invalid')
                       then coalesce(resolved_at, now()) else null end,
    resolution = coalesce(nullif(btrim(coalesce(p_resolution, '')), ''), resolution),
    updated_at = now()
  where id = p_case_id returning * into v_case;
  if v_case.id is null then
    raise exception 'That case is not there.' using errcode = 'no_data_found';
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_case.updated',
    p_target_type => 'stays_case', p_target_id => v_case.id,
    p_after => jsonb_build_object('status', v_case.status, 'priority', v_case.priority,
      'escalated', v_case.escalated_at is not null));
  return jsonb_build_object('id', v_case.id, 'status', v_case.status);
end;
$$;

create or replace function public.rpc_console_stays_lead_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_lead public.stays_lead;
begin
  if v_id is null then
    insert into public.stays_lead (name, phone, email, kind, source, property_name, area, units, status,
                                   next_action, property_manager_id, notes, created_by, assigned_to)
    values (btrim(coalesce(p ->> 'name', '')), nullif(btrim(coalesce(p ->> 'phone', '')), ''),
            nullif(btrim(coalesce(p ->> 'email', '')), ''), coalesce(nullif(p ->> 'kind', ''), 'host'),
            coalesce(nullif(p ->> 'source', ''), 'other'), nullif(btrim(coalesce(p ->> 'property_name', '')), ''),
            nullif(btrim(coalesce(p ->> 'area', '')), ''), nullif(p ->> 'units', '')::integer,
            coalesce(nullif(p ->> 'status', ''), 'captured'), nullif(btrim(coalesce(p ->> 'next_action', '')), ''),
            nullif(p ->> 'property_manager_id', '')::uuid, nullif(btrim(coalesce(p ->> 'notes', '')), ''),
            v_staff, v_staff)
    returning * into v_lead;
  else
    update public.stays_lead set
      status = coalesce(nullif(p ->> 'status', ''), status),
      next_action = case when p ? 'next_action' then nullif(btrim(coalesce(p ->> 'next_action', '')), '') else next_action end,
      assigned_to = case when (p ->> 'assign_to_me')::boolean then v_staff else assigned_to end,
      updated_at = now()
    where id = v_id returning * into v_lead;
    if v_lead.id is null then
      raise exception 'That lead is not there.' using errcode = 'no_data_found';
    end if;
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_lead.saved',
    p_target_type => 'stays_lead', p_target_id => v_lead.id,
    p_after => jsonb_build_object('status', v_lead.status, 'kind', v_lead.kind));
  return jsonb_build_object('id', v_lead.id, 'status', v_lead.status);
end;
$$;

create or replace function public.rpc_console_stays_campaign_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_c public.stays_campaign;
begin
  if v_id is null then
    insert into public.stays_campaign (name, objective, channel, starts_on, ends_on, spend_kes, results,
                                       result_unit, status, created_by)
    values (btrim(coalesce(p ->> 'name', '')), coalesce(nullif(p ->> 'objective', ''), 'bookings'),
            coalesce(nullif(p ->> 'channel', ''), 'other'),
            coalesce(nullif(p ->> 'starts_on', '')::date, (now() at time zone 'Africa/Nairobi')::date),
            nullif(p ->> 'ends_on', '')::date, coalesce(nullif(p ->> 'spend_kes', '')::bigint, 0),
            nullif(p ->> 'results', '')::integer, nullif(btrim(coalesce(p ->> 'result_unit', '')), ''),
            coalesce(nullif(p ->> 'status', ''), 'active'), v_staff)
    returning * into v_c;
  else
    update public.stays_campaign set
      status = coalesce(nullif(p ->> 'status', ''), status),
      spend_kes = coalesce(nullif(p ->> 'spend_kes', '')::bigint, spend_kes),
      results = coalesce(nullif(p ->> 'results', '')::integer, results),
      ends_on = coalesce(nullif(p ->> 'ends_on', '')::date, ends_on),
      updated_at = now()
    where id = v_id returning * into v_c;
    if v_c.id is null then
      raise exception 'That campaign is not there.' using errcode = 'no_data_found';
    end if;
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_campaign.saved',
    p_target_type => 'stays_campaign', p_target_id => v_c.id,
    p_after => jsonb_build_object('status', v_c.status, 'spend_kes', v_c.spend_kes));
  return jsonb_build_object('id', v_c.id);
end;
$$;

create or replace function public.rpc_console_partner_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_pm public.property_manager;
begin
  if v_id is null then
    if nullif(btrim(coalesce(p ->> 'email', '')), '') is null then
      raise exception 'A partner needs an email.' using errcode = 'check_violation';
    end if;
    insert into public.property_manager (name, email, phone, legal_name, partner_kind, assigned_staff_id, status)
    values (btrim(coalesce(p ->> 'name', '')), lower(btrim(p ->> 'email')), nullif(btrim(coalesce(p ->> 'phone', '')), ''),
            nullif(btrim(coalesce(p ->> 'legal_name', '')), ''),
            coalesce(nullif(p ->> 'partner_kind', ''), 'property_manager'), v_staff,
            coalesce(nullif(p ->> 'status', ''), 'active'))
    returning * into v_pm;
  else
    update public.property_manager set
      status = coalesce(nullif(p ->> 'status', ''), status),
      partner_kind = coalesce(nullif(p ->> 'partner_kind', ''), partner_kind),
      last_contact_at = case when (p ->> 'contacted')::boolean then now() else last_contact_at end,
      assigned_staff_id = case when (p ->> 'assign_to_me')::boolean then v_staff else assigned_staff_id end
    where id = v_id returning * into v_pm;
    if v_pm.id is null then
      raise exception 'That partner is not there.' using errcode = 'no_data_found';
    end if;
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'property_manager.saved',
    p_target_type => 'property_manager', p_target_id => v_pm.id,
    p_after => jsonb_build_object('status', v_pm.status, 'kind', v_pm.partner_kind));
  return jsonb_build_object('id', v_pm.id);
end;
$$;

create or replace function public.rpc_console_property_set_manager(p_property_id uuid, p_manager_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_before uuid;
  v_p public.property;
begin
  select property_manager_id into v_before from public.property where id = p_property_id;
  update public.property set property_manager_id = p_manager_id, updated_at = now()
   where id = p_property_id returning * into v_p;
  if v_p.id is null then
    raise exception 'That property is not there.' using errcode = 'no_data_found';
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'property.manager_set',
    p_target_type => 'property', p_target_id => v_p.id, p_target_label => v_p.name, p_city_id => v_p.city_id,
    p_before => jsonb_build_object('property_manager_id', v_before),
    p_after => jsonb_build_object('property_manager_id', p_manager_id));
  return jsonb_build_object('property_id', v_p.id, 'staff', v_staff);
end;
$$;

create or replace function public.rpc_console_stays_report_log(
  p_report text, p_from date, p_to date, p_rows integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.fn_stays_reader_gate();
  insert into public.stays_report_run (report, period_from, period_to, rows_exported, generated_by)
  values (left(p_report, 60), p_from, p_to, greatest(coalesce(p_rows, 0), 0), authz.staff_id())
  returning id into v_id;
  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_report.exported',
    p_target_type => 'stays_report_run', p_target_id => v_id,
    p_after => jsonb_build_object('report', p_report, 'from', p_from, 'to', p_to, 'rows', p_rows));
  return v_id;
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 7. grants

revoke all on function
  public.fn_stays_nights_in(timestamptz, timestamptz, date, date),
  public.fn_stays_check_period(date, date)
from public, anon;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.rpc_console_stays_overview(date, date, uuid)',
    'public.rpc_console_stays_list(date, date, uuid, text, text, text, integer, integer)',
    'public.rpc_console_stay_detail(uuid)',
    'public.rpc_console_stays_units(date, date, uuid, text, text, uuid, integer, integer)',
    'public.rpc_console_stays_calendar(date, uuid, text, integer, integer)',
    'public.rpc_console_stays_properties(date, date, uuid, text, text)',
    'public.rpc_console_stays_hosts(text, text, integer, integer)',
    'public.rpc_console_stays_partners(text, text)',
    'public.rpc_console_stays_finance(date, date, uuid)',
    'public.rpc_console_stays_reviews(date, date, uuid, text, text, integer, integer, integer)',
    'public.rpc_console_stays_cases(date, date, text, text, integer, integer)',
    'public.rpc_console_stays_acquisition(date, date, uuid, text, text, integer, integer)',
    'public.rpc_console_stays_marketing(date, date, uuid)',
    'public.rpc_console_stays_performance(date, date, uuid)',
    'public.rpc_console_stays_report_runs(integer)',
    'public.rpc_console_stays_settings(uuid)',
    'public.rpc_console_integrations_health()',
    'public.rpc_console_host_reject(uuid, text, boolean)',
    'public.rpc_console_stay_check_in(uuid)',
    'public.rpc_console_stay_check_out(uuid)',
    'public.rpc_console_stay_block(uuid, date, date, text)',
    'public.rpc_console_unit_rate_set(uuid, integer)',
    'public.rpc_console_review_moderate(uuid, text, text)',
    'public.rpc_console_stays_case_open(jsonb)',
    'public.rpc_console_stays_case_update(uuid, text, text, boolean, boolean, text)',
    'public.rpc_console_stays_lead_save(jsonb)',
    'public.rpc_console_stays_campaign_save(jsonb)',
    'public.rpc_console_partner_save(jsonb)',
    'public.rpc_console_property_set_manager(uuid, uuid)',
    'public.rpc_console_stays_report_log(text, date, date, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

grant execute on function public.fn_stays_reader_gate(), public.fn_stays_writer_gate() to authenticated;
