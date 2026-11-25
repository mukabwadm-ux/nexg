-- No caretaker confirmation.
--
-- Owner decision: the person using the app as a host is the caretaker,
-- so a unit whose handoff is "caretaker" or "leave with the askari" no
-- longer waits on unit.caretaker_confirmed_at. Nothing on any screen
-- could set that value, so those units could never be ready, listed or
-- published.
--
-- Each object below is its latest definition, copied, with only the
-- caretaker-confirmation condition removed:
--   unit_live_needs_a_confirmed_contact   (20260101007900) dropped
--   fn_unit_readiness                     (20260101010600) no contact_confirmed key
--   fn_unit_listing_missing               (20270125000100) no caretaker item
--   rpc_unit_upsert_guarded               (20270125000100) promotes without it
--   rpc_host_verify                       (20261114000100) promotes without it
--   unit_readiness_v                      (20260101018800) four checks, column kept
--   host_setup_progress_v                 (20260101018800) handoff step is the rule
--   host_attention_v                      (20260101018800) no caretaker card
--
-- rpc_unit_set_published needs no change: it reads fn_unit_listing_missing.
-- The caretaker_confirmed_at column, rpc_unit_caretaker_invite and
-- rpc_unit_caretaker_confirm stay in place.

-- ═══════════════════════════════════════════════ the table rule

alter table public.unit drop constraint if exists unit_live_needs_a_confirmed_contact;

-- ═══════════════════════════════════════════════ readiness

create or replace function public.fn_unit_readiness(p_unit_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'address', u.address_line is not null,
    'handoff', u.handoff is not null,
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

-- ═══════════════════════════════════════════════ the listing checklist

create or replace function public.fn_unit_listing_missing(p_unit_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_host public.host;
  v_property public.property;
  v_missing text[] := '{}';
begin
  select * into v_unit from public.unit where id = p_unit_id;
  if v_unit.id is null then
    return array['The unit could not be found'];
  end if;
  if v_unit.archived_at is not null then
    return array['The unit is archived'];
  end if;

  select * into v_host from public.host where id = v_unit.host_id;
  if v_host.status is distinct from 'live' then
    v_missing := v_missing || 'NexG approval of your host account'::text;
  end if;

  if v_unit.status = 'archived' then
    v_missing := v_missing || 'The unit is archived'::text;
  elsif v_unit.status <> 'live' then
    if v_unit.address_line is null then
      v_missing := v_missing || 'A street address'::text;
    end if;
    if v_unit.handoff is null then
      v_missing := v_missing || 'A delivery handoff rule'::text;
    end if;
    if v_unit.status = 'paused' then
      v_missing := v_missing || 'The unit is paused'::text;
    end if;
    /* Setting up with everything above in place goes live on approval; any
       other state that is not live still is not ready. */
    if cardinality(v_missing) = 0 then
      v_missing := v_missing || 'One more save of the unit'::text;
    end if;
  end if;

  if v_unit.property_id is not null then
    select * into v_property from public.property
     where id = v_unit.property_id and deleted_at is null;
  end if;
  if v_property.id is null then
    v_missing := v_missing || 'A property'::text;
  elsif nullif(trim(v_property.name), '') is null then
    v_missing := v_missing || 'A property name'::text;
  end if;

  if nullif(trim(coalesce(v_property.area, v_unit.area)), '') is null then
    v_missing := v_missing || 'An area'::text;
  end if;
  if v_unit.nightly_rate_kes is null then
    v_missing := v_missing || 'A nightly rate'::text;
  end if;
  if coalesce(v_unit.max_guests, 0) <= 0 then
    v_missing := v_missing || 'Guest capacity'::text;
  end if;
  if v_unit.bedrooms is null then
    v_missing := v_missing || 'Bedrooms'::text;
  end if;
  if coalesce(jsonb_array_length(v_unit.photos), 0) = 0
     and coalesce(jsonb_array_length(v_property.photos), 0) = 0 then
    v_missing := v_missing || 'At least one photo'::text;
  end if;

  return v_missing;
end;
$$;

-- ═══════════════════════════════════════════════ going live on save

create or replace function public.rpc_unit_upsert_guarded(
  p_host_id uuid,
  p_unit jsonb,
  p_unit_id uuid default null
)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_name text := nullif(trim(p_unit ->> 'name'), '');
  v_property_id uuid := nullif(p_unit ->> 'property_id', '')::uuid;
  v_amenities text[];
  v_bed_setup text;
  v_summary text;
  v_size integer;
  v_min_nights integer;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your unit.' using errcode = '42501';
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.property
    where id = v_property_id and host_id = p_host_id and deleted_at is null
    for share
  ) then
    raise exception 'Choose a property on your account.' using errcode = '22023';
  end if;

  if p_unit_id is null and v_name is not null and exists (
    select 1 from public.unit
    where host_id = p_host_id and name = v_name and archived_at is null
  ) then
    raise exception 'You already have a unit called %.', v_name using errcode = '23505';
  end if;

  /* Checked before anything is written, so a bad field saves nothing. */
  perform public.fn_host_listing_point(p_unit);
  v_amenities := public.fn_host_amenity_labels(p_unit -> 'unit_amenities');
  v_bed_setup := public.fn_host_listing_text(p_unit -> 'bed_setup', 'Bed setup', 200);
  v_summary := public.fn_host_listing_text(p_unit -> 'unit_summary', 'Unit summary', 2000);
  begin
    v_size := nullif(p_unit ->> 'size_sqm', '')::integer;
    v_min_nights := nullif(p_unit ->> 'min_nights', '')::integer;
  exception when others then
    raise exception 'Enter size and minimum nights as whole numbers.' using errcode = '22023';
  end;
  if v_size is not null and (v_size < 1 or v_size > 100000) then
    raise exception 'Enter the size in square metres, between 1 and 100,000.' using errcode = '22023';
  end if;
  if v_min_nights is not null and (v_min_nights < 1 or v_min_nights > 365) then
    raise exception 'Minimum nights is between 1 and 365.' using errcode = '22023';
  end if;

  v_unit := public.rpc_unit_upsert(p_host_id, p_unit, p_unit_id);
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;

  if p_unit ?| array['property_id', 'bedrooms', 'bathrooms', 'max_guests', 'nightly_rate_kes'] then
    update public.unit set
      property_id = coalesce(v_property_id, property_id),
      bedrooms = coalesce(nullif(p_unit ->> 'bedrooms', '')::integer, bedrooms),
      bathrooms = coalesce(nullif(p_unit ->> 'bathrooms', '')::numeric, bathrooms),
      max_guests = coalesce(nullif(p_unit ->> 'max_guests', '')::integer, max_guests),
      nightly_rate_kes = coalesce(nullif(p_unit ->> 'nightly_rate_kes', '')::bigint, nightly_rate_kes)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  /* What a guest reads. Sent keys are written (empty clears), missing keys kept;
     minimum nights is never cleared, only changed. */
  if p_unit ?| array['unit_amenities', 'bed_setup', 'size_sqm', 'unit_summary', 'min_nights'] then
    update public.unit set
      unit_amenities = case when p_unit ? 'unit_amenities' then v_amenities else unit_amenities end,
      bed_setup = case when p_unit ? 'bed_setup' then v_bed_setup else bed_setup end,
      size_sqm = case when p_unit ? 'size_sqm' then v_size else size_sqm end,
      unit_summary = case when p_unit ? 'unit_summary' then v_summary else unit_summary end,
      min_nights = coalesce(v_min_nights, min_nights)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  /* rpc_host_verify only promotes the units that exist at approval. A unit
     added or completed afterwards goes live here, on the same rule. */
  if v_unit.status = 'setting_up'
    and exists (select 1 from public.host where id = p_host_id and status = 'live')
    and v_unit.address_line is not null
    and v_unit.handoff is not null then
    update public.unit set status = 'live' where id = v_unit.id returning * into v_unit;
  end if;

  /* rpc_unit_upsert logs the save itself; this records what the wrapper adds
     (portfolio fields and going live), which the wiring check requires. */
  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.portfolio_saved',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_unit.id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('status', v_unit.status, 'property_id', v_unit.property_id));

  return v_unit;
end;
$$;

-- ═══════════════════════════════════════════════ going live on approval

create or replace function public.rpc_host_verify(p_host_id uuid, p_method text, p_evidence jsonb default '{}'::jsonb)
returns public.host
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host public.host;
begin
  if not authz.works_hospitality(null) then
    raise exception 'Not yours to verify.' using errcode = 'insufficient_privilege';
  end if;
  if p_method not in ('listing_ownership', 'id_document', 'call') then
    raise exception 'Verification is listing ownership, an ID document, or a call.'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from (values ('id_document'), ('authority')) as required(kind)
    where not exists (
      select 1 from public.host_document d
      where d.host_id = p_host_id and d.kind = required.kind
        and d.superseded_at is null and d.status = 'approved'
    )
  ) then
    raise exception 'Approve the host''s ID or passport and proof of authority before activating the account.'
      using errcode = 'check_violation';
  end if;

  update public.host set
    status = 'live',
    status_reason = null,
    verified_at = now(),
    verified_by = authz.staff_id(),
    verification = jsonb_build_object('method', p_method, 'at', now()) || p_evidence,
    went_live_at = coalesce(went_live_at, now())
  where id = p_host_id and status in ('applied', 'verifying')
  returning * into v_host;

  if v_host.id is null then
    raise exception 'That host is not waiting to be verified.' using errcode = 'no_data_found';
  end if;

  /* Units flip on their own readiness, not on that of the host. */
  update public.unit u set status = 'live'
  where u.host_id = p_host_id
    and u.status = 'setting_up'
    and u.address_line is not null
    and u.handoff is not null;

  insert into public.notification (kind, status) values ('host_verified', 'pending');

  perform audit.log('staff'::public.actor_type, 'hotels', 'host.verified',
    p_target_type => 'host', p_target_id => p_host_id, p_city_id => v_host.city_id,
    p_after => jsonb_build_object('method', p_method), p_reason => p_evidence ->> 'notes',
    p_severity => 'high'::public.audit_severity);

  return v_host;
end;
$$;

-- ═══════════════════════════════════════════════ the host portal reads

-- Same columns in the same order. contact_confirmed stays so older readers
-- keep working; there is nothing left to confirm, so it is always true and
-- no longer counts toward ready_count, which is now out of four.

create or replace view public.unit_readiness_v
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
  true as contact_confirmed,
  coalesce((u.readiness ->> 'hours')::boolean, false) as hours_done,
  coalesce((u.readiness ->> 'qr_placed')::boolean, false) as qr_placed,
  (coalesce((u.readiness ->> 'address')::boolean, false)::int
   + coalesce((u.readiness ->> 'handoff')::boolean, false)::int
   + coalesce((u.readiness ->> 'hours')::boolean, false)::int
   + coalesce((u.readiness ->> 'qr_placed')::boolean, false)::int) as ready_count,
  4 as ready_of,
  u.caretaker_confirmed_at,
  u.caretaker_name,
  u.caretaker_token_sent_at,
  u.delivery_hours,
  u.created_at
from public.unit u
where u.archived_at is null;

create or replace view public.host_setup_progress_v
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
    /* 3 — how riders hand over */
    exists (select 1 from public.unit u
             where u.host_id = h.id and u.archived_at is null
               and coalesce((u.readiness ->> 'handoff')::boolean, false)) as step_handoff,
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

create or replace view public.host_attention_v
with (security_invoker = true) as
-- The caretaker card (sort 1) is gone: a caretaker no longer confirms.
-- This branch now comes first, so it names the columns.
-- a card that was replaced and is still in a guest's hand
-- ('voided' is what the scan outcome is called; 'retired' is what
--  the guest is shown, and they are the same event)
select
  s.host_id,
  2 as sort,
  'retired_card_scanned'::text as kind,
  'A retired QR card is still being scanned'::text as title,
  'A card that has been replaced was scanned again. Guests see "this card is '
    || 'retired, ask your host". Place the new card or re-print it.' as body,
  s.owner_id as unit_id,
  null::text as unit_name
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

comment on view public.unit_readiness_v is
  'The four things a unit needs before a guest can order from it, one named column each. contact_confirmed is kept for older readers and is always true: a caretaker no longer confirms.';

-- ═══════════════════════════════════════════════ existing units

-- Recompute readiness the way the unit RPCs do, which drops the
-- contact_confirmed key. caretaker_confirmed_at is left as it is: nothing
-- reads it any more, and a confirmation nobody gave is not written.
update public.unit u
   set readiness = public.fn_unit_readiness(u.id)
 where u.readiness ? 'contact_confirmed';

-- A unit that was held back only by the confirmation goes live now, on the
-- same rule rpc_unit_upsert_guarded and rpc_host_verify use, instead of
-- waiting for one more save. The listing trigger then lists it if its host
-- published it and it is ready.
update public.unit u
   set status = 'live'
 where u.status = 'setting_up'
   and u.archived_at is null
   and u.address_line is not null
   and u.handoff in ('leave_with_askari', 'caretaker')
   and exists (select 1 from public.host h where h.id = u.host_id and h.status = 'live');
