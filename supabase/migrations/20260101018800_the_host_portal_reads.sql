-- What the host portal reads.
--
-- The hospitality module already holds everything a host owns:
-- `host`, `property`, `unit`, `host_user`, `qr_scan`, `qr_pack`.
-- What it never had was a host-facing way in. The admin console
-- could see all of it and the host could see none of it.
--
-- These are the views that portal reads. Nothing in the portal
-- computes a figure; every number on a screen comes from a view
-- named here, so a number can only be wrong in one place.
--
-- The whole module has two states and they are genuinely
-- different screens, not one screen with things hidden. A host
-- who is setting up needs to know what is left and in what
-- order; a host who is live needs to know what is happening
-- right now. The design draws them separately and so does this.

-- ════════════════════════════════════════ the verification code

/*
 * The code a host pastes into their listing so we can prove the
 * listing is theirs. Short, unambiguous in handwriting, and
 * derived once rather than regenerated — a code that changes
 * between two page loads is a code somebody pastes wrong.
 */
alter table host add column if not exists verification_code text;
alter table host add column if not exists verification_method text
  check (verification_method is null
         or verification_method in ('listing_code', 'screenshot', 'call'));
alter table host add column if not exists verification_submitted_at timestamptz;
alter table host add column if not exists terms_version text;
alter table host add column if not exists terms_accepted_at timestamptz;

update host
   set verification_code = 'NXG-' || upper(substr(
         encode(extensions.digest(id::text, 'sha256'), 'hex'), 1, 4))
 where verification_code is null;

/*
 * And every host created from now on.
 *
 * A one-off backfill covers the rows that existed when the
 * migration ran and silently misses every row after it — which
 * shows up as a blank where a code should be, on the one screen
 * whose whole job is to show that code.
 */
create or replace function tg_host_gets_a_verification_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.verification_code is null then
    new.verification_code := 'NXG-' || upper(substr(
      encode(extensions.digest(new.id::text, 'sha256'), 'hex'), 1, 4));
  end if;
  return new;
end;
$$;

drop trigger if exists host_gets_a_verification_code on host;
create trigger host_gets_a_verification_code
  before insert on host
  for each row execute function tg_host_gets_a_verification_code();

comment on column host.verification_code is
  'What the host pastes into their listing description so we can prove it is theirs. Derived from the id, so it is the same every time it is shown.';

-- ══════════════════════════════════════════ unit readiness

/*
 * The five things a unit needs before a guest can order from it.
 *
 * Read from `unit.readiness`, which the unit RPCs maintain, and
 * surfaced one row per flag rather than as a blob — the ring in
 * the design names each one, and a caller that has to know the
 * key spelling to render a label is a caller that will one day
 * render a blank.
 */
create or replace view unit_readiness_v
with (security_invoker = true) as
select
  u.id as unit_id,
  u.host_id,
  u.property_id,
  u.name as unit_name,
  u.status::text as status,
  u.handoff::text as handoff,
  coalesce((u.readiness ->> 'address')::boolean, false) as address_done,
  coalesce((u.readiness ->> 'handoff')::boolean, false) as handoff_done,
  coalesce((u.readiness ->> 'contact_confirmed')::boolean, false) as contact_confirmed,
  coalesce((u.readiness ->> 'hours')::boolean, false) as hours_done,
  coalesce((u.readiness ->> 'qr_placed')::boolean, false) as qr_placed,
  (coalesce((u.readiness ->> 'address')::boolean, false)::int
   + coalesce((u.readiness ->> 'handoff')::boolean, false)::int
   + coalesce((u.readiness ->> 'contact_confirmed')::boolean, false)::int
   + coalesce((u.readiness ->> 'hours')::boolean, false)::int
   + coalesce((u.readiness ->> 'qr_placed')::boolean, false)::int) as ready_count,
  5 as ready_of,
  u.caretaker_confirmed_at,
  u.caretaker_name,
  u.caretaker_token_sent_at,
  u.delivery_hours,
  u.created_at
from public.unit u
where u.archived_at is null;

comment on view unit_readiness_v is
  'The five things a unit needs before a guest can order from it, one named column each. A unit goes live only when all five are true and its host is verified.';

-- ═══════════════════════════════════════ the five setup steps

/*
 * Computed, never stored.
 *
 * A stored progress row is a row that can disagree with the
 * records it claims to describe — a host finishes a step, the
 * write that updates the counter fails, and the portal tells
 * them to do something they have already done. This derives
 * each step from the data that step is about, so the two cannot
 * drift.
 */
create or replace view host_setup_progress_v
with (security_invoker = true) as
with per_host as (
  select
    h.id as host_id,
    h.display_name,
    h.status::text as status,
    h.verification_code,
    h.verification_method,
    h.submitted_at,
    h.packages_enabled,
    h.billing_method,
    /* 1 — who they are */
    (nullif(btrim(coalesce(h.contact_name, '')), '') is not null
      and nullif(btrim(coalesce(h.phone, '')), '') is not null) as step_about,
    /* 2 — a unit with a confirmed address and pin */
    exists (select 1 from public.unit u
             where u.host_id = h.id and u.archived_at is null
               and coalesce((u.readiness ->> 'address')::boolean, false)) as step_unit,
    /* 3 — how riders hand over, confirmed by whoever receives */
    exists (select 1 from public.unit u
             where u.host_id = h.id and u.archived_at is null
               and coalesce((u.readiness ->> 'handoff')::boolean, false)
               and coalesce((u.readiness ->> 'contact_confirmed')::boolean, false)) as step_handoff,
    /*
     * 4 — optional, so "done" means they made a choice either
     * way. Tested on `billing_method`, which is null until
     * somebody picks one. `packages_enabled` cannot be used:
     * it is NOT NULL with a default of false, so "has it been
     * set?" is true for every host that has never seen the
     * question, and the step reads as done before it is asked.
     */
    (h.billing_method is not null) as step_packages,
    /* 5 — submitted for verification */
    (h.submitted_at is not null) as step_verify
  from public.host h
)
select
  p.*,
  (p.step_about::int + p.step_unit::int + p.step_handoff::int
   + p.step_packages::int + p.step_verify::int) as done_count,
  5 as of_count,
  /*
   * Which step the strip should point at. Optional step 4 is
   * skipped when choosing "next": sending somebody to an
   * optional step while a required one is outstanding is how a
   * setup flow feels longer than it is.
   */
  case
    when not p.step_about then 1
    when not p.step_unit then 2
    when not p.step_handoff then 3
    when not p.step_verify then 5
    when not p.step_packages then 4
    else null
  end as next_step,
  p.status = 'live' as is_live
from per_host p;

comment on view host_setup_progress_v is
  'The five onboarding steps, derived from the records each step is about rather than stored. A stored counter can tell a host to do something they have already done.';

-- ═══════════════════════════════════════════════ the hero facts

/* Dropped rather than replaced: `create or replace view` can
   only append columns, and `contact_name` belongs beside the
   display name it is contrasted with. This is the third time
   this file family has hit it. */
drop view if exists host_home_v;

create view host_home_v
with (security_invoker = true) as
select
  h.id as host_id,
  h.display_name,
  /* The person, as distinct from the property. "Good evening,
     Seed Residences" is what you get from greeting somebody by
     their brand. */
  h.contact_name,
  h.kind::text as kind,
  h.status::text as status,
  h.verification_code,
  h.submitted_at,
  h.went_live_at,
  c.name as city_name,
  coalesce(pr.properties, 0) as properties,
  coalesce(un.units_total, 0) as units_total,
  coalesce(un.units_live, 0) as units_live,
  coalesce(un.units_setting_up, 0) as units_setting_up,
  coalesce(un.qr_placed, 0) as qr_placed,
  coalesce(sc.scans_7d, 0) as scans_7d,
  coalesce(od.orders_today, 0) as orders_today,
  coalesce(od.order_units_today, 0) as order_units_today
from public.host h
left join public.city c on c.id = h.city_id
left join lateral (
  select count(*) as properties from public.property p where p.host_id = h.id
) pr on true
left join lateral (
  select
    count(*) as units_total,
    count(*) filter (where u.status = 'live') as units_live,
    count(*) filter (where u.status = 'setting_up') as units_setting_up,
    count(*) filter (where coalesce((u.readiness ->> 'qr_placed')::boolean, false)) as qr_placed
  from public.unit u where u.host_id = h.id and u.archived_at is null
) un on true
left join lateral (
  select count(*) as scans_7d
  from public.qr_scan s
  where s.host_id = h.id and not s.is_bot
    and s.scanned_at > now() - interval '7 days'
) sc on true
left join lateral (
  select
    count(distinct o.id) as orders_today,
    count(distinct s.owner_id) as order_units_today
  from public.qr_scan s
  join public."order" o on o.qr_scan_id = s.id
  where s.host_id = h.id
    and (o.placed_at at time zone 'Africa/Nairobi')::date
        = (now() at time zone 'Africa/Nairobi')::date
) od on true;

comment on view host_home_v is
  'The facts in the hero and the tiles. Orders reach a host through qr_scan.host_id, which is the attribution path the QR cards exist to create.';

-- ════════════════════════════════════════════ today at a glance

create or replace view host_today_v
with (security_invoker = true) as
select
  h.id as host_id,
  coalesce(o.orders_today, 0) as orders_today,
  coalesce(o.value_today_cents, 0) as value_today_cents,
  coalesce(o.units_today, 0) as units_today,
  coalesce(a.arriving, 0) as arriving,
  coalesce(q.open_requests, 0) as open_requests,
  (select count(*) from public.unit u
    where u.host_id = h.id and u.archived_at is null
      and u.status = 'live'
      and not coalesce((u.readiness ->> 'qr_placed')::boolean, false)) as units_without_qr
from public.host h
left join lateral (
  select
    count(distinct o.id) as orders_today,
    sum(o.total_cents) as value_today_cents,
    count(distinct s.owner_id) as units_today
  from public.qr_scan s
  join public."order" o on o.qr_scan_id = s.id
  where s.host_id = h.id
    and (o.placed_at at time zone 'Africa/Nairobi')::date
        = (now() at time zone 'Africa/Nairobi')::date
) o on true
left join lateral (
  select count(*) as arriving
  from public.qr_scan s
  join public."order" ord on ord.qr_scan_id = s.id
  where s.host_id = h.id and ord.stage::text in ('picked_up', 'arriving')
) a on true
left join lateral (
  select count(*) as open_requests
  from public.msg_conversation mc
  join public.msg_object_link ml on ml.conversation_id = mc.id
  where ml.object_type = 'host' and ml.object_id = h.id
    and mc.status not in ('resolved', 'closed')
) q on true;

-- ═══════════════════════════════════════════ what needs a person

/*
 * The attention cards, in the order the design stacks them.
 *
 * Each row is a thing that will not fix itself. A caretaker who
 * never confirmed means every delivery to that unit has no
 * agreed way in; a retired QR card still being scanned means
 * guests are looking at a card that tells them to ask the host.
 * Both are silent until somebody is told.
 */
create or replace view host_attention_v
with (security_invoker = true) as
-- a caretaker who was asked and never answered
select
  u.host_id,
  1 as sort,
  'caretaker_unconfirmed'::text as kind,
  'Your caretaker hasn''t confirmed yet'::text as title,
  'We sent a one-tap SMS asking them to confirm they take deliveries for '
    || u.name || '. No reply so far. Resend, change the number, or pick a '
    || 'different hand-off rule.' as body,
  u.id as unit_id,
  u.name as unit_name
from public.unit u
where u.archived_at is null
  and u.caretaker_token_sent_at is not null
  and u.caretaker_confirmed_at is null
union all
-- a card that was replaced and is still in a guest's hand
-- ('voided' is what the scan outcome is called; 'retired' is what
--  the guest is shown, and they are the same event)
select
  s.host_id, 2, 'retired_card_scanned',
  'A retired QR card is still being scanned',
  'A card that has been replaced was scanned again. Guests see "this card is '
    || 'retired, ask your host". Place the new card or re-print it.',
  s.owner_id, null
from public.qr_scan s
where s.outcome::text = 'voided'
  and s.scanned_at > now() - interval '7 days'
group by s.host_id, s.owner_id
union all
-- live, but a guest in the room has nothing to scan
select
  u.host_id, 3, 'no_qr_card',
  'A live unit has no QR card',
  u.name || ' is live but has no card placed, so guests there cannot order '
    || 'from the room.',
  u.id, u.name
from public.unit u
where u.archived_at is null and u.status = 'live'
  and not coalesce((u.readiness ->> 'qr_placed')::boolean, false)
union all
-- stuck
select
  u.host_id, 4, 'unit_stuck',
  'A unit has been in setup for over five days',
  u.name || ' has not moved since it was created. Whatever is blocking it is '
    || 'not going to clear on its own.',
  u.id, u.name
from public.unit u
where u.archived_at is null and u.status = 'setting_up'
  and u.created_at < now() - interval '5 days';

-- ═══════════════════════════════════════════════ QR activity

/*
 * Every scan, and what happened after it.
 *
 * Guests by first name only. A host has a legitimate interest in
 * knowing their unit was used and no interest at all in a
 * guest's surname or number, and the difference between those
 * two is the whole of what this view is careful about.
 */
create or replace view host_qr_activity_v
with (security_invoker = true) as
select
  s.id as scan_id,
  s.host_id,
  s.owner_id as unit_id,
  u.name as unit_name,
  p.name as property_name,
  s.scanned_at,
  split_part(coalesce(g.name, ''), ' ', 1) as guest_first_name,
  s.outcome::text as outcome,
  o.id as order_id,
  o.reference as order_reference,
  o.total_cents,
  o.stage::text as order_stage,
  m.trading_name as merchant_name,
  u.handoff::text as handoff
from public.qr_scan s
left join public.unit u on u.id = s.owner_id
left join public.property p on p.id = u.property_id
left join public."order" o on o.qr_scan_id = s.id
left join public.merchant m on m.id = o.merchant_id
left join public.guest g on g.id = s.guest_id
where not s.is_bot
order by s.scanned_at desc;

-- ═════════════════════════════════════════════════ arriving now

create or replace view host_arriving_v
with (security_invoker = true) as
select
  o.id as order_id,
  s.host_id,
  s.owner_id as unit_id,
  u.name as unit_name,
  o.reference,
  o.stage::text as stage,
  o.eta_at,
  o.total_cents,
  m.trading_name as merchant_name,
  u.handoff::text as handoff
from public."order" o
join public.qr_scan s on s.id = o.qr_scan_id
left join public.unit u on u.id = s.owner_id
left join public.merchant m on m.id = o.merchant_id
where o.stage::text in ('picked_up', 'arriving')
order by o.eta_at nulls last;

-- ══════════════════════════════════════ where a host belongs

/*
 * `fn_partner_home` grew a host branch.
 *
 * Checked after merchant and rider, which is the existing order
 * and is wrong for anybody who is two of the three — merchant
 * always wins and the other portal is unreachable. That is a
 * real limitation and the fix is a portal chooser, which is its
 * own piece of work. Noted here rather than left to be
 * discovered.
 */
create or replace function public.fn_partner_home()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  m public.merchant;
  r public.rider;
  h public.host;
  v_pct integer;
  v_done integer;
begin
  if v_uid is null then
    return jsonb_build_object('kind', 'anonymous', 'home', '/sign-in');
  end if;

  if exists (select 1 from public.staff_user su
              where su.user_id = v_uid and su.status = 'active') then
    return jsonb_build_object('kind', 'staff', 'home', '/',
      'note', 'Staff work in the admin console, not here.');
  end if;

  select * into m from public.merchant mm
   where authz.is_merchant_member(mm.id)
   order by mm.updated_at desc limit 1;

  if m.id is not null then
    v_pct := coalesce((public.fn_merchant_readiness(m.id) ->> 'pct')::int, 0);
    return jsonb_build_object(
      'kind', 'merchant', 'id', m.id,
      'name', coalesce(m.trading_name, m.legal_name),
      'status', m.status, 'pct', v_pct,
      'submitted', m.submitted_at is not null,
      'ready', m.submitted_at is not null or v_pct >= 80,
      'home', case when m.submitted_at is not null or v_pct >= 80
                   then '/merchant' else '/merchants/apply' end);
  end if;

  select * into r from public.rider rr where rr.user_id = v_uid
   order by rr.updated_at desc limit 1;

  if r.id is not null then
    v_pct := coalesce((public.fn_rider_readiness(r.id) ->> 'pct')::int, 0);
    return jsonb_build_object(
      'kind', 'rider', 'id', r.id,
      'name', nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
      'status', r.status, 'pct', v_pct,
      'submitted', r.submitted_at is not null,
      'ready', r.submitted_at is not null or v_pct >= 80,
      'home', case when r.submitted_at is not null or v_pct >= 80
                   then '/rider' else '/riders/apply' end);
  end if;

  select * into h from public.host hh
   where authz.is_host_member(hh.id)
   order by hh.updated_at desc limit 1;

  if h.id is not null then
    select done_count into v_done
      from public.host_setup_progress_v where host_id = h.id;
    /*
     * Unlike the other two, a host is never sent back to a
     * separate application form. The onboarding lives inside
     * the portal — a host with one half-built unit still has
     * properties, a team and a verification code to look at,
     * and bouncing them out of all of it to finish one step is
     * how a half-finished setup stays half-finished.
     */
    return jsonb_build_object(
      'kind', 'host', 'id', h.id,
      'name', h.display_name,
      'status', h.status,
      'pct', round(coalesce(v_done, 0) * 100.0 / 5),
      'submitted', h.submitted_at is not null,
      'ready', true,
      'home', '/host');
  end if;

  return jsonb_build_object('kind', 'guest', 'home', '/');
end;
$$;

grant execute on function public.fn_partner_home() to authenticated, anon;

grant select on
  unit_readiness_v,
  host_setup_progress_v,
  host_home_v,
  host_today_v,
  host_attention_v,
  host_qr_activity_v,
  host_arriving_v
to authenticated;
