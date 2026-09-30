-- Hotels & Airbnb · read contracts.
--
-- The database is the integration layer. The guest site reads
-- unit_context_v, the rider app reads rider_handoff_v, the host
-- dashboard reads host_view_v, the desk portal reads hotel_desk_v, the
-- console reads the console_* views. No surface reaches past its own.
--
-- What is NOT in any of these is as deliberate as what is. A gate code
-- appears in none of them. A host's phone number appears in none of
-- the guest-facing ones. A guest's phone number is masked in the staff
-- ones, in the view rather than in the component, because a surface
-- cannot leak what it was never handed.

-- ══════════════════════════════════════════════════ helpers

/* The masked form used everywhere staff see a number. */
create or replace function public.fn_mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null or length(p_phone) < 3 then null
    /* Real bullet glyphs, so a screen reader does not read the digits
       out of a CSS-masked string. */
    else '+254 7•• ••• •' || right(p_phone, 2)
  end
$$;

/*
 * Whether a unit is ready to go live, and what is missing. The console
 * shows the missing lines in red and the host view shows them as a
 * checklist; both read this, so they cannot disagree about what is
 * outstanding.
 */
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
    'qr_placed', exists (
      select 1 from public.unit_qr q
      where q.unit_id = u.id and q.voided_at is null and q.placed_confirmed_at is not null)
  )
  from public.unit u where u.id = p_unit_id
$$;

/*
 * The sentence a rider actually sees, assembled from the fields so the
 * host's onboarding preview, the console and the rider app all render
 * the same words. Built here rather than three times in TypeScript.
 */
create or replace function public.fn_handoff_sentence(p_unit_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(array_to_string(array_remove(array[
    case u.handoff
      when 'guest_meets_at_gate' then 'Guest meets you at the gate'
      when 'leave_with_askari'   then 'Leave with the askari' ||
        coalesce(' ' || u.askari_name, '')
      when 'lockbox'             then 'Lockbox'
      when 'call_guest_first'    then 'Call the guest before arriving'
      when 'reception'           then 'Hand to reception'
      when 'caretaker'           then 'Hand to the caretaker' ||
        coalesce(' ' || u.caretaker_name, '')
    end,
    nullif(u.handoff_note, ''),
    case when u.delivery_hours is not null
      then 'deliveries ' || (u.delivery_hours ->> 'from') || '–' || (u.delivery_hours ->> 'to')
    end,
    nullif(u.parking_note, ''),
    nullif(u.lift_note, '')
  ], null), ' · '), '')
  from public.unit u where u.id = p_unit_id
$$;

-- ═══════════════════════════════════ what a guest may see

/*
 * The QR landing and checkout. Resolved through rpc_resolve_qr, never
 * queried directly, because resolving is also a rate-limited write
 * (the scan is logged).
 *
 * No host phone. No askari or caretaker phone. No gate code. A guest
 * who scans a sticker gets an address and a delivery window, and that
 * is all they need.
 */
create or replace view public.unit_context_v
with (security_invoker = false) as
select
  u.id as unit_id,
  u.label_public,
  u.area,
  u.city_id,
  c.name as city_name,
  u.point,
  u.handoff,
  public.fn_handoff_sentence(u.id) as handoff_sentence,
  u.delivery_hours,
  u.checkin_time,
  u.checkout_time,
  u.status,
  h.display_name as host_display_name,
  null::uuid as hotel_id,
  false as charge_to_room_available,
  '{}'::uuid[] as preferred_suppliers
from public.unit u
join public.host h on h.id = u.host_id
left join public.city c on c.id = u.city_id;

revoke all on public.unit_context_v from anon, authenticated;

comment on view public.unit_context_v is
  'What a guest sees after scanning. Carries no gate code and no phone number of any kind — a surface cannot leak what it was never handed.';

/*
 * Whether checkout may offer "Charge to my room", and under what cap.
 * The cap being null means no cap has been agreed, which is not the
 * same as unlimited; rpc_folio_request refuses in that case.
 */
create or replace view public.checkout_hotel_context_v
with (security_invoker = false) as
select
  ht.id as hotel_id,
  ht.name as hotel_name,
  ht.status,
  s.charge_to_room,
  s.charge_cap_per_stay,
  s.service_charge_pct,
  s.guest_pays_delivery,
  s.desk_sla_minutes,
  s.preferred_suppliers,
  (ht.status = 'partner' and s.charge_to_room and s.charge_cap_per_stay is not null)
    as offer_charge_to_room
from public.hotel ht
join public.hotel_program_setting s on s.hotel_id = ht.id;

revoke all on public.checkout_hotel_context_v from anon, authenticated;

comment on column public.checkout_hotel_context_v.offer_charge_to_room is
  'Requires a cap. No agreed cap means the option is not offered — an unbounded charge to somebody else''s bill is not a default.';

-- ═══════════════════════════════════ what a rider may see

/*
 * The hand-off card, for the assigned rider on an active trip.
 *
 * Contact names are here; contact numbers are not. A rider calls
 * through the masked bridge, so the number never reaches the handset.
 * The gate code is not here either — it comes from a function that
 * checks proximity and logs the reveal.
 */
create or replace view public.rider_handoff_v
with (security_invoker = false) as
select
  u.id as unit_id,
  u.label_public,
  u.address_line,
  u.building,
  u.unit_no,
  u.floor,
  u.point,
  u.handoff,
  u.handoff_note,
  public.fn_handoff_sentence(u.id) as handoff_sentence,
  u.askari_name,
  u.caretaker_name,
  (u.gate_code_encrypted is not null) as has_gate_code,
  u.delivery_hours,
  u.parking_note,
  u.lift_note,
  null::text as hotel_access_text,
  null::text as after_hours_handoff
from public.unit u
where u.status = 'live';

revoke all on public.rider_handoff_v from anon, authenticated;

comment on view public.rider_handoff_v is
  'Names, not numbers. A rider calls the askari through the masked bridge; the gate code comes from rpc_rider_reveal_gate_code, which checks proximity and logs who looked.';

-- ═══════════════════════════════════════ the host dashboard

create or replace view public.host_view_v
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
  q.placed_confirmed_at,
  q.scans as qr_scans,
  (select count(*) from public.package_order po
    where po.unit_id = u.id and po.status = 'scheduled') as packages_scheduled,
  /* Orders need an orders domain. Null, so the host view shows [—]
     rather than telling a host nobody ordered. */
  null::integer as orders_this_month,
  null::integer as guests_served
from public.unit u
left join lateral (
  select * from public.unit_qr x
  where x.unit_id = u.id and x.voided_at is null
  order by x.generated_at desc limit 1
) q on true
where u.archived_at is null;

-- ═══════════════════════════════════════ the desk portal

/*
 * The queue the front desk works from. Age and SLA are computed here
 * so the portal, the console and the escalation sweep all agree on
 * when something is late.
 */
create or replace view public.hotel_desk_v
with (security_invoker = true) as
select
  f.id,
  f.hotel_id,
  f.order_reference,
  f.room_no,
  f.guest_surname,
  f.amount,
  f.status,
  f.folio_ref,
  f.created_at,
  f.desk_action_at,
  f.escalated_at,
  extract(epoch from (now() - f.created_at)) / 60 as age_minutes,
  s.desk_sla_minutes,
  s.escalate_after_minutes,
  case
    when f.status <> 'awaiting_desk' then null
    when extract(epoch from (now() - f.created_at)) / 60
         >= coalesce(s.escalate_after_minutes, 60) then 'late'
    when extract(epoch from (now() - f.created_at)) / 60
         >= coalesce(s.desk_sla_minutes, 40) then 'due'
    else 'ok'
  end as sla_state
from public.folio_posting f
join public.hotel_program_setting s on s.hotel_id = f.hotel_id;

create or replace view public.hotel_admin_v
with (security_invoker = true) as
select
  ht.id as hotel_id,
  ht.name,
  ht.status,
  ht.tier,
  ht.rooms,
  ht.commission_pct,
  ht.invoice_terms_days,
  ht.pms_integration,
  ht.agreement_version,
  ht.agreement_signed_at,
  s.charge_to_room,
  s.charge_cap_per_stay,
  s.folio_sync,
  s.in_room_qr,
  s.room_cards_printed,
  s.front_desk_ordering,
  s.preferred_suppliers,
  s.desk_sla_minutes,
  s.escalate_after_minutes,
  r.version as access_rule_version,
  r.text as access_rule_text,
  r.delivery_from,
  r.delivery_to,
  r.after_hours_handoff,
  (select count(*) from public.hotel_room x where x.hotel_id = ht.id) as rooms_configured,
  (select count(*) from public.hotel_user x where x.hotel_id = ht.id) as users_count
from public.hotel ht
left join public.hotel_program_setting s on s.hotel_id = ht.id
left join public.hotel_access_rule r on r.hotel_id = ht.id and r.superseded_at is null;

-- ═══════════════════════════════════════════ the console

create or replace view public.console_host_directory_v
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
  (select count(*) from public.unit u
    join public.unit_qr q on q.unit_id = u.id and q.voided_at is null
    where u.host_id = h.id and q.placed_confirmed_at is null) as qr_not_placed,
  /* Orders need an orders domain. */
  null::integer as orders_30d
from public.host h
left join public.city c on c.id = h.city_id;

create or replace view public.console_hotel_directory_v
with (security_invoker = true) as
select
  ht.id,
  ht.name,
  ht.brand,
  ht.area,
  ht.city_id,
  c.name as city_name,
  ht.rooms,
  ht.star_rating,
  ht.status,
  ht.tier,
  ht.prospect_stage,
  ht.next_action_at,
  ht.gm_name,
  ht.commission_pct,
  ht.agreement_version,
  ht.agreement_signed_at,
  coalesce(s.charge_to_room, false) as charge_to_room,
  s.charge_cap_per_stay,
  (select count(*) from public.folio_posting f
    where f.hotel_id = ht.id and f.status = 'posted'
      and f.created_at > now() - interval '30 days') as postings_30d,
  (select coalesce(sum(f.amount), 0) from public.folio_posting f
    where f.hotel_id = ht.id and f.status = 'posted'
      and f.created_at > now() - interval '30 days') as posted_30d_kes,
  null::integer as orders_30d
from public.hotel ht
left join public.city c on c.id = ht.city_id
left join public.hotel_program_setting s on s.hotel_id = ht.id;

create or replace view public.console_folio_v
with (security_invoker = true) as
select
  f.id,
  f.order_reference,
  f.hotel_id,
  ht.name as hotel_name,
  f.room_no,
  f.guest_surname,
  f.amount,
  f.status,
  f.folio_ref,
  f.sync,
  f.created_at,
  f.desk_action_at,
  f.escalated_at,
  f.desk_note,
  f.recharged_payment_ref,
  round(extract(epoch from (now() - f.created_at)) / 60)::integer as age_minutes,
  s.desk_sla_minutes,
  s.escalate_after_minutes
from public.folio_posting f
join public.hotel ht on ht.id = f.hotel_id
left join public.hotel_program_setting s on s.hotel_id = f.hotel_id;

/*
 * The guest list, masked at the source. Nothing in the console ever
 * holds an unmasked number; revealing one is an RPC that logs the
 * reason.
 */
create or replace view public.console_guest_v
with (security_invoker = true) as
select
  g.id,
  g.name,
  public.fn_mask_phone(g.phone) as phone_masked,
  g.country_code,
  g.vip,
  g.blocked,
  g.block_reason,
  g.preferences,
  g.payment_summary,
  g.refusal_count,
  g.dispute_count,
  g.repeat_count,
  g.last_stay,
  g.staff_notes,
  g.anonymised_at,
  g.last_order_at,
  g.created_at,
  (g.user_id is not null) as has_account,
  (select granted from public.guest_consent gc
    where gc.guest_id = g.id and gc.kind = 'service_sms'
    order by gc.at desc limit 1) as consent_service_sms,
  (select granted from public.guest_consent gc
    where gc.guest_id = g.id and gc.kind = 'marketing'
    order by gc.at desc limit 1) as consent_marketing,
  (select count(*) from public.data_request dr
    where dr.guest_id = g.id
      and dr.status not in ('fulfilled', 'refused', 'withdrawn')) as open_data_requests
from public.guest g;

create or replace view public.console_data_request_v
with (security_invoker = true) as
select
  dr.id,
  dr.guest_id,
  g.name as guest_name,
  coalesce(public.fn_mask_phone(dr.requester_phone), public.fn_mask_phone(g.phone))
    as requester_masked,
  dr.requester_email,
  dr.kind,
  dr.status,
  dr.received_at,
  dr.due_at,
  dr.channel,
  dr.identity_verified_at,
  dr.identity_method,
  dr.scope,
  dr.blocking_reasons,
  dr.fulfilled_at,
  dr.refusal_reason,
  greatest(0, ceil(extract(epoch from (dr.due_at - now())) / 86400))::integer as days_left,
  su.display_name as handled_by_name
from public.data_request dr
left join public.guest g on g.id = dr.guest_id
left join public.staff_user su on su.id = dr.handled_by;

create or replace view public.console_hospitality_badges_v
with (security_invoker = true) as
select
  (select count(*) from public.host where status = 'live') as hosts_live,
  (select count(*) from public.host
    where status in ('applied', 'verifying')) as hosts_verifying,
  (select count(*) from public.unit where status = 'setting_up') as units_setting_up,
  (select count(*) from public.unit
    where status = 'setting_up' and created_at < now() - interval '5 days') as units_stuck,
  (select count(*) from public.hotel where status = 'partner') as hotels_partner,
  (select count(*) from public.hotel where status = 'prospect') as hotels_prospect,
  (select coalesce(sum(rooms), 0) from public.hotel where status = 'partner') as rooms_covered,
  (select count(*) from public.hotel_program_setting s
    join public.hotel h on h.id = s.hotel_id
    where s.charge_to_room and h.status = 'partner') as hotels_charge_to_room,
  (select count(*) from public.folio_posting where status = 'awaiting_desk') as folios_awaiting,
  (select count(*) from public.folio_posting f
    join public.hotel_program_setting s on s.hotel_id = f.hotel_id
    where f.status = 'awaiting_desk'
      and f.created_at < now() - make_interval(mins => coalesce(s.escalate_after_minutes, 60)))
    as folios_over_sla,
  (select count(*) from public.folio_posting
    where status in ('rejected_checked_out', 'rejected_name_mismatch', 'rejected_cap')
      and created_at > now() - interval '30 days') as folios_rejected_30d,
  (select coalesce(sum(amount), 0) from public.folio_posting
    where status = 'posted'
      and created_at >= date_trunc('month', now())) as posted_this_month,
  (select count(*) from public.folio_reconciliation
    where status in ('open', 'missing_reference', 'disputed')) as recon_open,
  (select count(*) from public.hotel_statement
    where status in ('sent', 'due', 'overdue')) as invoices_due,
  (select count(*) from public.data_request
    where status not in ('fulfilled', 'refused', 'withdrawn')) as data_requests_open,
  (select count(*) from public.data_request
    where status not in ('fulfilled', 'refused', 'withdrawn')
      and due_at < now() + interval '7 days') as data_requests_due_soon,
  (select count(*) from public.guest where blocked) as guests_blocked,
  (select count(*) from public.hotel
    where status = 'prospect' and next_action_at < now()) as prospects_overdue;

/* The coverage map in the Merchants module reads this. */
create or replace view public.hospitality_points_v
with (security_invoker = true) as
select 'unit'::text as kind, u.point, 1 as weight, u.city_id
from public.unit u where u.status = 'live' and u.point is not null
union all
select 'hotel', ht.point, coalesce(ht.rooms, 1), ht.city_id
from public.hotel ht where ht.status = 'partner' and ht.point is not null;

create or replace function public.rpc_hospitality_counts()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select to_jsonb(b) from public.console_hospitality_badges_v b
$$;

grant execute on function public.rpc_hospitality_counts() to authenticated;
grant execute on function public.fn_mask_phone(text) to authenticated, service_role;
grant execute on function public.fn_unit_readiness(uuid) to authenticated, service_role;
grant execute on function public.fn_handoff_sentence(uuid) to authenticated, service_role;
