-- One QR table, one route, and a scan record worth having.
--
-- The hospitality build shipped `unit_qr`: a code, a state, a scan
-- count, and a `qr_scan` row carrying a hashed user agent and one of
-- three outcomes. It works, and it cannot answer the question the
-- channel exists to answer — for any property: where was the card
-- scanned, when, by which session, and what did they order.
--
-- This reshapes rather than duplicates. A second QR table beside the
-- first is exactly the divergence the audit reconciliation just spent
-- a migration undoing, and `unit_qr` already has a unique index, two
-- RLS policies and three views pointing at it.
--
-- Three changes:
--
--   1. `unit_qr` becomes `property_qr`, with an owner_type/owner_id
--      pair so a unit, a hotel room and a hotel common area all hold
--      codes in the same table and resolve through the same route.
--   2. `qr_scan` gains the session, the signed token, the funnel
--      outcome and the attribution, and is partitioned by month —
--      this table genuinely does grow without limit, unlike the audit
--      log, and it is empty today so partitioning costs nothing.
--   3. `hotel_area` arrives, because a lobby or pool bar can hold a
--      card and nothing modelled that.
--
-- Both tables are empty on local and on production, checked before
-- writing this. Nothing is backfilled because there is nothing to
-- backfill — but the rename is written so it would survive rows.

-- ══════════════════════════════════════════ hotel common areas

create table if not exists public.hotel_area (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotel (id) on delete cascade,
  name text not null,
  /* Where a rider actually hands over in a space with no door. */
  delivery_point_note text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  unique (hotel_id, name)
);

comment on table public.hotel_area is
  'Lobby, pool bar, gym, conference floor. A hotel can place a card anywhere a guest sits down, and those scans are the clearest signal of demand the room cards never see.';

-- ═══════════════════════════════════ unit_qr becomes property_qr

/*
 * Guarded on the catalogue rather than on an exception handler. An
 * ALTER on a missing relation raises undefined_table, not
 * undefined_object, so the obvious handler does not catch it — and a
 * migration that half-applies leaves a renamed table with its old
 * indexes, which is a worse place to be than either end.
 */
do $$ begin
  if to_regclass('public.unit_qr') is not null then
    alter table public.unit_qr rename to property_qr;
  end if;
  if to_regclass('public.unit_qr_one_active') is not null then
    alter index public.unit_qr_one_active rename to property_qr_unit_one_active;
  end if;
  if to_regclass('public.room_qr_one_active') is not null then
    alter index public.room_qr_one_active rename to property_qr_room_one_active;
  end if;
end $$;

do $$ begin
  create type public.qr_owner_type as enum ('unit', 'hotel_room', 'hotel_area');
exception when duplicate_object then null; end $$;

/*
 * Placement is not decoration. The counter card and the fridge card
 * in the same flat convert differently, and a host who knows which
 * works moves the other one. It is the single most actionable column
 * in this table.
 */
do $$ begin
  create type public.qr_placement as enum (
    'counter', 'fridge', 'door', 'welcome_book', 'bedside', 'lobby', 'pool', 'other');
exception when duplicate_object then null; end $$;

alter table public.property_qr
  add column if not exists owner_type public.qr_owner_type,
  add column if not exists owner_id uuid,
  add column if not exists placement public.qr_placement not null default 'counter',
  /* Denormalised at generation so a scan can be scoped by host,
     hotel or city without three joins on the hot path. */
  add column if not exists host_id uuid references public.host (id) on delete cascade,
  add column if not exists hotel_id uuid references public.hotel (id) on delete cascade,
  add column if not exists city_id uuid references public.city (id) on delete set null,
  /* What the printed card says. Frozen at generation: a host who
     renames a unit does not invalidate the cards on the counter. */
  add column if not exists label text,
  /* Per-code HMAC key. The scan token is signed with this, so a
     token lifted from one property cannot be replayed against
     another, and voiding a code invalidates its tokens. */
  add column if not exists secret_hash text,
  add column if not exists batch_id uuid,
  add column if not exists generated_by uuid references public.staff_user (id) on delete set null,
  add column if not exists sent_channel text
    check (sent_channel is null or sent_channel in ('email', 'whatsapp', 'sms', 'download')),
  add column if not exists last_scanned_at timestamptz,
  add column if not exists orders integer not null default 0,
  add column if not exists void_reason text,
  add column if not exists placement_photo_path text;

/* Backfill from the old shape. Empty on both databases today; written
   so the migration would be correct if it were not. */
update public.property_qr
   set owner_type = case when unit_id is not null then 'unit'::public.qr_owner_type
                         else 'hotel_room'::public.qr_owner_type end,
       owner_id = coalesce(unit_id, room_id)
 where owner_type is null;

update public.property_qr q
   set host_id = u.host_id, city_id = u.city_id,
       label = coalesce(q.label, u.label_public)
  from public.unit u
 where u.id = q.owner_id and q.owner_type = 'unit' and q.host_id is null;

update public.property_qr q
   set hotel_id = r.hotel_id,
       label = coalesce(q.label, 'Room ' || r.room_no)
  from public.hotel_room r
 where r.id = q.owner_id and q.owner_type = 'hotel_room' and q.hotel_id is null;

update public.property_qr
   set secret_hash = encode(extensions.gen_random_bytes(32), 'hex')
 where secret_hash is null;

/*
 * Three places name the old columns: the RLS policy and two views.
 * They come down before the columns do, and go back up below against
 * owner_type/owner_id — the readiness function too, which is plpgsql
 * and so would have failed at call time rather than here, which is
 * the worse way to find out.
 */
drop policy if exists unit_qr_read on public.property_qr;
drop view if exists public.host_view_v;
drop view if exists public.console_host_directory_v;

/* The old pair of columns has done its job. */
alter table public.property_qr drop constraint if exists qr_belongs_somewhere;
drop index if exists public.property_qr_unit_one_active;
drop index if exists public.property_qr_room_one_active;
alter table public.property_qr drop column if exists unit_id;
alter table public.property_qr drop column if exists room_id;
alter table public.property_qr drop column if exists token_hash;

alter table public.property_qr
  alter column owner_type set not null,
  alter column owner_id set not null,
  alter column secret_hash set not null;

do $$ begin
  alter table public.property_qr
    add constraint property_qr_owner_is_scoped check (
      (owner_type = 'unit' and host_id is not null)
      or (owner_type in ('hotel_room', 'hotel_area') and hotel_id is not null));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.property_qr
    add constraint property_qr_void_has_a_reason check (
      voided_at is null or coalesce(trim(void_reason), '') <> '');
exception when duplicate_object then null; end $$;

/*
 * One live card per spot. A unit may hold a counter card and a fridge
 * card at once — that is the point of measuring placement — but not
 * two counter cards, because then neither number means anything.
 */
create unique index if not exists property_qr_one_active_per_placement
  on public.property_qr (owner_type, owner_id, placement)
  where voided_at is null;

create index if not exists property_qr_host_idx on public.property_qr (host_id)
  where voided_at is null;
create index if not exists property_qr_hotel_idx on public.property_qr (hotel_id)
  where voided_at is null;
create index if not exists property_qr_batch_idx on public.property_qr (batch_id);
/* The hot path: resolve a code in under 150 ms. */
create unique index if not exists property_qr_code_idx on public.property_qr (code);

comment on table public.property_qr is
  'Every card NexG prints. The code is generated server-side and never typed by a host; the secret signs that code''s scan tokens, so a token cannot be replayed against another property and voiding a card invalidates its tokens.';
comment on column public.property_qr.label is
  'What the card prints, frozen at generation. Renaming a unit does not invalidate the cards already on the counter.';

-- ═══════════════════════════════════════════ the scan record

/*
 * Rebuilt rather than altered: the old table has three outcomes and a
 * hashed user agent, the new one is the funnel, and it is empty.
 */
drop table if exists public.qr_scan cascade;

do $$ begin
  create type public.qr_scan_outcome as enum (
    /* The funnel, in order. */
    'landed', 'browsed', 'cart', 'ordered',
    /* And the ways it ends instead. */
    'bounced', 'voided', 'paused_unit', 'not_found', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.qr_referrer_kind as enum (
    'camera', 'in_app_browser', 'copied_link', 'unknown');
exception when duplicate_object then null; end $$;

create table public.qr_scan (
  id bigint generated always as identity,
  scanned_at timestamptz not null default now(),

  qr_id uuid not null,
  /* Denormalised at scan time, so history survives the card being
     replaced and the unit being renamed or archived. */
  code text not null,
  owner_type public.qr_owner_type not null,
  owner_id uuid not null,
  host_id uuid,
  hotel_id uuid,
  city_id uuid,
  zone_id uuid,
  placement public.qr_placement not null,

  /* Derived once, for the heatmaps, in Nairobi time because that is
     the clock the guest is on. */
  local_hour smallint not null
    generated always as (extract(hour from scanned_at at time zone 'Africa/Nairobi')::smallint) stored,
  dow smallint not null
    generated always as (extract(isodow from scanned_at at time zone 'Africa/Nairobi')::smallint) stored,

  /* First-party cookie, 90 days. Not a user id — a browser. */
  session_id text,
  /* HMAC over {qr_id, session_id, scanned_at} with the card's secret.
     Checkout sends it back; the order service validates it. Stored so
     a replay can be recognised rather than guessed at. */
  scan_token text,
  /* Filled later, if the session ever identifies itself. Detached
     again by a KDPA erasure. */
  guest_id uuid references public.guest (id) on delete set null,

  /* {ua_family, os, is_mobile, lang, screen_bucket}. No raw user
     agent — that is a fingerprint. No IP at all: it is reduced to a
     country at the edge and the address is dropped. */
  device jsonb not null default '{}'::jsonb,
  ip_country text,
  referrer_kind public.qr_referrer_kind not null default 'unknown',

  /* A band, never coordinates, and only if the guest granted
     location at checkout for delivery accuracy. */
  geo_band text check (geo_band is null or geo_band in ('at_property', 'nearby', 'far')),

  outcome public.qr_scan_outcome not null default 'landed',
  first_merchant_id uuid references public.merchant (id) on delete set null,
  browsed_category text,
  /* The orders domain does not exist yet. Every other module already
     keys an order by `order_reference text`, so attribution keys on
     the same thing and gains a uuid the day there is a table to point
     at. Writing a uuid column against nothing would be pretending. */
  order_refs text[] not null default '{}',
  ordered_at timestamptz,

  is_bot boolean not null default false,
  /* A host checking their own card must not move their own numbers. */
  is_test boolean not null default false,

  primary key (id, scanned_at)
) partition by range (scanned_at);

comment on table public.qr_scan is
  'Every scan, partitioned by month. High-volume and genuinely unbounded, unlike the audit log — and empty today, so the partitioning costs nothing to put in now and a great deal to retrofit later.';
comment on column public.qr_scan.order_refs is
  'Orders attributed to this scan, by reference. The orders domain is not built; when it is, this gains a uuid column beside the reference rather than being replaced.';

create index on public.qr_scan (qr_id, scanned_at desc);
create index on public.qr_scan (host_id, scanned_at desc);
create index on public.qr_scan (hotel_id, scanned_at desc);
create index on public.qr_scan (session_id, scanned_at desc);
create index on public.qr_scan (outcome, scanned_at desc);

/*
 * Partitions are made ahead of time by a cron, and the first few are
 * made here so a fresh database can take a scan immediately. A write
 * that lands with no partition fails, which on this path means a
 * guest standing in a kitchen holding a phone that will not load.
 */
create or replace function public.fn_qr_scan_partition(p_month date)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', p_month)::date;
  v_name text := 'qr_scan_' || to_char(v_start, 'YYYY_MM');
begin
  if to_regclass('public.' || v_name) is not null then
    return v_name;
  end if;

  execute format(
    'create table public.%I partition of public.qr_scan for values from (%L) to (%L)',
    v_name, v_start, (v_start + interval '1 month')::date);

  return v_name;
end;
$$;

/*
 * A default partition as well. Without one, a clock skew or a cron
 * that did not run turns into a failed scan; with one, the row lands
 * somewhere and the health view notices.
 */
create table if not exists public.qr_scan_overflow partition of public.qr_scan default;

do $$
declare v_m date := date_trunc('month', now())::date;
begin
  for i in -1..3 loop
    perform public.fn_qr_scan_partition((v_m + make_interval(months => i))::date);
  end loop;
end $$;

create or replace function public.cron_qr_scan_partitions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_made text[] := '{}';
  v_name text;
begin
  /* Three months ahead. One would be enough; three means a cron that
     fails for a month is a warning rather than an outage. */
  for i in 0..3 loop
    v_name := public.fn_qr_scan_partition(
      (date_trunc('month', now()) + make_interval(months => i))::date);
    v_made := v_made || v_name;
  end loop;

  /* Anything that landed in the default partition is a bug — a scan
     outside every window — and the health view surfaces the count. */
  return jsonb_build_object('ok', true, 'partitions', v_made,
    'in_overflow', (select count(*) from public.qr_scan_overflow));
end;
$$;

-- ═════════════════════════════════════ print batches and packs

create table if not exists public.qr_pack (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references public.host (id) on delete cascade,
  hotel_id uuid references public.hotel (id) on delete cascade,
  /* Every code in the batch, so a pack that went to the wrong
     address can be voided in one action. */
  batch_id uuid not null default gen_random_uuid(),
  codes integer not null default 0,
  format text not null default 'a6_cards'
    check (format in ('a6_cards', 'welcome_book_a4', 'stickers_50mm', 'room_cards', 'print_shop_pdfx')),
  pdf_path text,
  built_at timestamptz not null default now(),
  built_by uuid references public.staff_user (id) on delete set null,
  sent_at timestamptz,
  sent_channel text check (sent_channel is null or sent_channel in ('email', 'whatsapp', 'download')),
  voided_at timestamptz,
  void_reason text,
  constraint qr_pack_belongs_to_one check (num_nonnulls(host_id, hotel_id) = 1)
);

create index if not exists qr_pack_host_idx on public.qr_pack (host_id, built_at desc);
create index if not exists qr_pack_hotel_idx on public.qr_pack (hotel_id, built_at desc);


-- ═══════════════════ the three call sites, against the new shape

create or replace function public.fn_unit_readiness(p_unit_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'address', u.address_line is not null,
    'handoff', u.handoff is not null,
    'contact_confirmed',
      u.handoff not in ('leave_with_askari', 'caretaker') or u.caretaker_confirmed_at is not null,
    'hours', u.delivery_hours is not null,
    /* Any card confirmed in place counts. A unit with a counter card
       up and a fridge card still in the envelope is ready. */
    'qr_placed', exists (
      select 1 from public.property_qr q
      where q.owner_type = 'unit' and q.owner_id = u.id
        and q.voided_at is null and q.placed_confirmed_at is not null)
  )
  from public.unit u where u.id = p_unit_id
$$;

create view public.host_view_v
with (security_invoker = true) as
select
  u.id as unit_id,
  u.host_id,
  u.name,
  u.label_public,
  u.area,
  u.status,
  u.handoff,
  public.fn_handoff_sentence(u.id) as handoff_sentence,
  u.delivery_hours,
  u.paused_reason,
  public.fn_unit_readiness(u.id) as readiness,
  q.code as qr_code,
  q.state as qr_state,
  q.placement as qr_placement,
  q.placed_confirmed_at,
  q.scans as qr_scans,
  q.orders as qr_orders,
  q.last_scanned_at,
  /* Every live card on this unit, not only the newest — a host with
     a counter card and a fridge card has two, and the view that
     showed one was quietly hiding half the story. */
  (select count(*) from public.property_qr x
    where x.owner_type = 'unit' and x.owner_id = u.id and x.voided_at is null) as qr_cards,
  (select coalesce(sum(x.scans), 0) from public.property_qr x
    where x.owner_type = 'unit' and x.owner_id = u.id and x.voided_at is null) as scans_total,
  (select count(*) from public.package_order po
    where po.unit_id = u.id and po.status = 'scheduled') as packages_scheduled,
  /* Orders need an orders domain. Null, so the host view shows [—]
     rather than telling a host nobody ordered. */
  null::integer as orders_this_month,
  null::integer as guests_served
from public.unit u
left join lateral (
  select * from public.property_qr x
  where x.owner_type = 'unit' and x.owner_id = u.id and x.voided_at is null
  order by x.generated_at desc limit 1
) q on true
where u.archived_at is null;

create view public.console_host_directory_v
with (security_invoker = true) as
select
  h.id,
  h.display_name,
  h.contact_name,
  public.fn_mask_phone(h.phone) as phone_masked,
  h.kind,
  h.tier,
  h.status,
  h.city_id,
  c.name as city_name,
  h.areas,
  h.superhost_claimed,
  h.packages_enabled,
  h.verified_at,
  h.went_live_at,
  h.created_at,
  h.submitted_at,
  (select count(*) from public.unit u where u.host_id = h.id and u.archived_at is null) as units,
  (select count(*) from public.unit u
    where u.host_id = h.id and u.status = 'setting_up') as units_setting_up,
  (select count(*) from public.unit u
    where u.host_id = h.id and u.status = 'live') as units_live,
  (select count(*) from public.package_order po
    where po.host_id = h.id
      and po.created_at > now() - interval '30 days') as packages_month,
  (select count(*) from public.property_qr q
    where q.host_id = h.id and q.voided_at is null
      and q.placed_confirmed_at is null) as qr_not_placed,
  (select coalesce(sum(q.scans), 0) from public.property_qr q
    where q.host_id = h.id and q.voided_at is null) as qr_scans,
  /* Orders need an orders domain. */
  null::integer as orders_30d
from public.host h
left join public.city c on c.id = h.city_id;

grant select on public.host_view_v, public.console_host_directory_v to authenticated;

-- ════════════════════════════════════════════════════ RLS

alter table public.hotel_area enable row level security;
alter table public.qr_scan enable row level security;
alter table public.qr_pack enable row level security;

revoke all on public.hotel_area, public.qr_scan, public.qr_pack from anon, authenticated;
grant select on public.hotel_area, public.qr_scan, public.qr_pack to authenticated;

create policy hotel_area_read on public.hotel_area
  for select to authenticated
  using (authz.is_hotel_member(hotel_id, null) or authz.works_hospitality(null));

/*
 * A host sees their own scans, a hotel its own — but never the
 * session id, device or geo band, which is why neither reads this
 * table directly. The scoped report views below strip those columns;
 * this policy is the floor under them.
 */
create policy qr_scan_read on public.qr_scan
  for select to authenticated
  using (
    authz.works_hospitality(city_id)
    or (host_id is not null and authz.is_host_member(host_id))
    or (hotel_id is not null and authz.is_hotel_member(hotel_id, null)));

create policy qr_pack_read on public.qr_pack
  for select to authenticated
  using (
    authz.works_hospitality(null)
    or (host_id is not null and authz.is_host_member(host_id))
    or (hotel_id is not null and authz.is_hotel_member(hotel_id, null)));

/* The existing property_qr policy still names the old columns. */
drop policy if exists unit_qr_read on public.property_qr;
create policy property_qr_read on public.property_qr
  for select to authenticated
  using (
    authz.works_hospitality(city_id)
    or (host_id is not null and authz.is_host_member(host_id))
    or (hotel_id is not null and authz.is_hotel_member(hotel_id, null)));

/*
 * `anon` gets nothing on any of these. A scan is written by
 * `rpc_resolve_qr`, which is SECURITY DEFINER — the browser never
 * touches the table, so a visitor cannot write a scan for a card they
 * are not holding or read anybody's funnel.
 */

grant execute on function public.fn_qr_scan_partition(date) to service_role;
