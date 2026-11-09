-- Stay booking, phase 1: holds, date blocks, availability, and no double booking.
--
-- Host stays already live in `stay`. A host typing in an Airbnb guest may
-- clash with another stay, and that saves with `conflict_flagged` so they
-- can see it and sort it out. A guest paying NexG online cannot be
-- treated that way, so this adds a second class of row that the database
-- refuses to overlap:
--
--   held     dates kept for a guest (NexG checkout) or by a host (a phone
--            enquiry), until `hold_expires_at`. Expired holds are
--            released by a minute cron and also swept before every new
--            hold, so a stale one never blocks a real guest.
--   blocked  dates the host has closed (repairs, own use).
--   booked + source 'nexg'
--            a guest booking confirmed through NexG.
--
-- Those rows can never overlap each other (`stay_firm_no_overlap`), and a
-- new hold or block is refused when it would overlap anything active,
-- host-entered stays included. Phase 2 (checkout and M-Pesa) calls
-- `rpc_stay_hold` and then `rpc_stay_confirm` from the payment callback.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('stay.held', 'hotels', 'info', false, 'Dates held for a stay'),
  ('stay.hold_released', 'hotels', 'info', false, 'Held dates released'),
  ('stay.holds_expired', 'hotels', 'info', false, 'Expired stay holds released'),
  ('stay.confirmed', 'hotels', 'info', false, 'Held stay confirmed'),
  ('stay.dates_blocked', 'hotels', 'info', false, 'Unit dates blocked')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════ the table

alter table public.stay drop constraint if exists stay_status_check;
alter table public.stay add constraint stay_status_check
  check (status in ('held', 'booked', 'in_stay', 'departed', 'cancelled', 'blocked'));

alter table public.stay drop constraint if exists stay_source_check;
alter table public.stay add constraint stay_source_check
  check (source in ('entered', 'airbnb', 'booking_com', 'ical', 'pms', 'walk_in', 'nexg'));

alter table public.stay
  add column if not exists hold_expires_at timestamptz,
  add column if not exists guest_user_id uuid references auth.users (id) on delete set null,
  add column if not exists quote_total_kes bigint
    check (quote_total_kes is null or quote_total_kes >= 0),
  add column if not exists confirmed_at timestamptz;

alter table public.stay drop constraint if exists stay_hold_expires;
alter table public.stay add constraint stay_hold_expires
  check (status <> 'held' or hold_expires_at is not null);

comment on column public.stay.hold_expires_at is
  'When a held stay lets its dates go. Kept after release or confirmation as a record of the hold.';
comment on column public.stay.guest_user_id is
  'The signed-in guest who booked through NexG. Null for stays a host entered or imported.';
comment on column public.stay.quote_total_kes is
  'What NexG quoted the guest for the whole stay, in whole KES, at the moment of the hold.';

/*
 * The guarantee. Only firm rows take part, so host-entered stays keep
 * their flag-not-refuse behaviour; the RPCs below refuse a new hold or
 * block against those too, under a lock on the unit.
 */
alter table public.stay drop constraint if exists stay_firm_no_overlap;
alter table public.stay add constraint stay_firm_no_overlap
  exclude using gist (unit_id with =, tstzrange(check_in, check_out, '[)') with &&)
  where (status in ('held', 'blocked') or (source = 'nexg' and status in ('booked', 'in_stay')));

create index if not exists stay_by_guest on public.stay (guest_user_id)
  where guest_user_id is not null;
create index if not exists stay_held_expiry on public.stay (hold_expires_at)
  where status = 'held';

/* A guest sees their own holds and bookings, and nothing of anyone else's. */
drop policy if exists stay_guest_read on public.stay;
create policy stay_guest_read on public.stay
  for select to authenticated using (guest_user_id = (select auth.uid()));

-- ═══════════════════════════════════════════════════ helpers

/* Whether a row keeps its dates from anybody else right now. */
create or replace function public.fn_stay_occupies(p_status text, p_hold_expires_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status in ('booked', 'in_stay', 'departed', 'blocked')
      or (p_status = 'held' and p_hold_expires_at > now());
$$;

/* A guest's check-in and check-out dates as the unit's real times. */
create or replace function public.fn_stay_window(p_unit_id uuid, p_check_in date, p_check_out date)
returns tstzrange
language sql
stable
security definer
set search_path = ''
as $$
  select tstzrange(
    (p_check_in + coalesce(u.checkin_time, p.check_in_from, time '14:00'))
      at time zone coalesce(h.time_zone, 'Africa/Nairobi'),
    (p_check_out + coalesce(u.checkout_time, p.check_out_by, time '10:00'))
      at time zone coalesce(h.time_zone, 'Africa/Nairobi'),
    '[)')
  from public.unit u
  join public.host h on h.id = u.host_id
  left join public.property p on p.id = u.property_id
  where u.id = p_unit_id;
$$;

/* Dates a guest may ask for: from today, up to a year out, 1 to 90 nights. */
create or replace function public.fn_stay_dates_check(p_check_in date, p_check_out date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_check_in is null or p_check_out is null then
    raise exception 'Choose a check-in and a check-out date.' using errcode = '22023';
  end if;
  if p_check_out <= p_check_in then
    raise exception 'Check-out has to be after check-in.' using errcode = '22023';
  end if;
  if p_check_in < (now() at time zone 'Africa/Nairobi')::date then
    raise exception 'Check-in cannot be in the past.' using errcode = '22023';
  end if;
  if p_check_in > (now() at time zone 'Africa/Nairobi')::date + 365 then
    raise exception 'Bookings open up to a year ahead.' using errcode = '22023';
  end if;
  if p_check_out - p_check_in > 90 then
    raise exception 'Stays booked online are up to 90 nights. Ask us about longer stays.'
      using errcode = '22023';
  end if;
end;
$$;

/* Lets go of holds whose time ran out. The cron runs it every minute. */
create or replace function public.fn_stay_release_expired_holds(p_unit_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with released as (
    update public.stay set status = 'cancelled', updated_at = now()
     where status = 'held' and hold_expires_at <= now()
       and (p_unit_id is null or unit_id = p_unit_id)
    returning id
  )
  select count(*) into v_count from released;

  if v_count > 0 then
    perform audit.log('system'::public.actor_type, 'hotels', 'stay.holds_expired',
      p_target_type => 'unit', p_target_id => p_unit_id,
      p_after => jsonb_build_object('released', v_count));
  end if;
  return v_count;
end;
$$;

revoke execute on function public.fn_stay_window(uuid, date, date),
  public.fn_stay_release_expired_holds(uuid)
from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ what a guest can ask

/*
 * The nights a public unit is taken between two dates, as check-in and
 * check-out days in the unit's time zone. Busy or free only: no guest,
 * no source, no reason.
 */
create or replace function public.rpc_unit_busy(p_unit_id uuid, p_from date, p_to date)
returns table (starts_on date, ends_on date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_zone text;
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > 400 then
    raise exception 'Ask for up to 400 days at a time.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.property_unit_public where id = p_unit_id) then
    raise exception 'This home is not taking bookings.' using errcode = '22023';
  end if;
  select coalesce(h.time_zone, 'Africa/Nairobi') into v_zone
    from public.unit u join public.host h on h.id = u.host_id where u.id = p_unit_id;

  return query
    select (s.check_in at time zone v_zone)::date, (s.check_out at time zone v_zone)::date
      from public.stay s
     where s.unit_id = p_unit_id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and s.check_in < (p_to + 1)::timestamp at time zone v_zone
       and s.check_out > p_from::timestamp at time zone v_zone
     order by s.check_in;
end;
$$;

/* Public units free for the whole of the guest's dates, with the price. */
create or replace function public.rpc_stay_search(
  p_check_in date,
  p_check_out date,
  p_guests integer default 1,
  p_property_id uuid default null
)
returns table (unit_id uuid, property_id uuid, nights integer, nightly_rate_kes bigint, total_kes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_stay_dates_check(p_check_in, p_check_out);

  return query
    select u.id, u.property_id, (p_check_out - p_check_in)::integer,
           u.nightly_rate_kes::bigint,
           (u.nightly_rate_kes * (p_check_out - p_check_in))::bigint
      from public.property_unit_public u
     where (p_property_id is null or u.property_id = p_property_id)
       and coalesce(u.max_guests, 1) >= greatest(coalesce(p_guests, 1), 1)
       and coalesce(u.min_nights, 1) <= p_check_out - p_check_in
       and not exists (
         select 1 from public.stay s
          where s.unit_id = u.id
            and public.fn_stay_occupies(s.status, s.hold_expires_at)
            and tstzrange(s.check_in, s.check_out, '[)')
                && public.fn_stay_window(u.id, p_check_in, p_check_out))
     order by u.nightly_rate_kes nulls last, u.id;
end;
$$;

grant execute on function public.rpc_unit_busy(uuid, date, date),
  public.rpc_stay_search(date, date, integer, uuid)
to anon, authenticated;

-- ═══════════════════════════════════════════════════ holding dates

/*
 * Hold a public unit for the signed-in guest for 15 minutes while they
 * pay. The unit row is locked, so two guests racing for the same nights
 * are served one at a time and the second is told the dates have gone.
 */
create or replace function public.rpc_stay_hold(
  p_unit_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_unit public.unit;
  v_nights integer := p_check_out - p_check_in;
  v_adults integer := coalesce(nullif(p_guest ->> 'adults', '')::integer, 1);
  v_children integer := coalesce(nullif(p_guest ->> 'children', '')::integer, 0);
  v_window tstzrange;
  v_stay public.stay;
begin
  if v_user is null then
    raise exception 'Sign in to hold these dates.' using errcode = '42501';
  end if;
  perform public.fn_stay_dates_check(p_check_in, p_check_out);
  if not exists (select 1 from public.property_unit_public where id = p_unit_id) then
    raise exception 'This home is not taking bookings.' using errcode = '22023';
  end if;

  select * into v_unit from public.unit where id = p_unit_id for update;

  if v_unit.nightly_rate_kes is null then
    raise exception 'This home is priced on request. Send an enquiry instead.' using errcode = '22023';
  end if;
  if v_nights < coalesce(v_unit.min_nights, 1) then
    raise exception 'This home takes stays of at least % nights.', v_unit.min_nights
      using errcode = '22023';
  end if;
  if v_adults < 1 or v_children < 0 then
    raise exception 'A stay needs at least one adult.' using errcode = '22023';
  end if;
  if v_unit.max_guests is not null and v_adults + v_children > v_unit.max_guests then
    raise exception 'This home sleeps up to % guests.', v_unit.max_guests using errcode = '22023';
  end if;
  if (select count(*) from public.stay
       where guest_user_id = v_user and status = 'held' and hold_expires_at > now()) >= 2 then
    raise exception 'You already have two stays on hold. Finish or release one first.'
      using errcode = '22023';
  end if;

  perform public.fn_stay_release_expired_holds(p_unit_id);

  v_window := public.fn_stay_window(p_unit_id, p_check_in, p_check_out);
  if exists (
    select 1 from public.stay s
     where s.unit_id = p_unit_id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and tstzrange(s.check_in, s.check_out, '[)') && v_window
  ) then
    raise exception 'Those dates are no longer available.' using errcode = '23P01';
  end if;

  insert into public.stay (
    host_id, property_id, unit_id, guest_user_id, guest_first_name,
    party_adults, party_children, check_in, check_out, source, status,
    hold_expires_at, rate_kes, quote_total_kes)
  values (
    v_unit.host_id, v_unit.property_id, v_unit.id, v_user,
    left(nullif(trim(p_guest ->> 'first_name'), ''), 80),
    v_adults, v_children, lower(v_window), upper(v_window), 'nexg', 'held',
    now() + interval '15 minutes', v_unit.nightly_rate_kes,
    v_unit.nightly_rate_kes * v_nights)
  returning * into v_stay;

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay.held',
    p_actor_id => v_user, p_target_type => 'stay', p_target_id => v_stay.id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('unit', v_unit.id, 'nights', v_nights,
                                  'total_kes', v_stay.quote_total_kes));

  return jsonb_build_object(
    'stay_id', v_stay.id, 'expires_at', v_stay.hold_expires_at,
    'check_in', v_stay.check_in, 'check_out', v_stay.check_out,
    'nights', v_nights, 'nightly_rate_kes', v_unit.nightly_rate_kes,
    'total_kes', v_stay.quote_total_kes);
end;
$$;

/* A guest lets their own hold go before it runs out. */
create or replace function public.rpc_stay_hold_release(p_stay_id uuid)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
begin
  update public.stay set status = 'cancelled', updated_at = now()
   where id = p_stay_id and status = 'held'
     and guest_user_id = auth.uid() and auth.uid() is not null
  returning * into v_stay;
  if v_stay.id is null then
    raise exception 'There is no hold of yours to release.' using errcode = '22023';
  end if;

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay.hold_released',
    p_actor_id => auth.uid(), p_target_type => 'stay', p_target_id => v_stay.id);
  return v_stay;
end;
$$;

/*
 * A host holds dates for somebody who has not confirmed yet: a phone
 * enquiry, a deposit on its way. Same guarantee as a guest hold; it lets
 * go by itself after the hours given unless the host confirms it.
 */
create or replace function public.rpc_stay_host_hold(p_host_id uuid, p_stay jsonb, p_hours integer)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_in timestamptz := nullif(p_stay ->> 'check_in', '')::timestamptz;
  v_out timestamptz := nullif(p_stay ->> 'check_out', '')::timestamptz;
  v_stay public.stay;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;
  if p_hours is null or p_hours < 1 or p_hours > 168 then
    raise exception 'Hold dates for between 1 hour and 7 days.' using errcode = '22023';
  end if;
  if v_in is null or v_out is null or v_out <= v_in then
    raise exception 'Check-out has to be after check-in.' using errcode = '22023';
  end if;

  select * into v_unit from public.unit
   where id = nullif(p_stay ->> 'unit_id', '')::uuid
     and host_id = p_host_id and archived_at is null
   for update;
  if v_unit.id is null then
    raise exception 'Pick one of your units for this hold.' using errcode = '22023';
  end if;

  perform public.fn_stay_release_expired_holds(v_unit.id);
  if exists (
    select 1 from public.stay s
     where s.unit_id = v_unit.id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and s.check_in < v_out and s.check_out > v_in
  ) then
    raise exception 'Those dates overlap a booking, hold or block on this unit.' using errcode = '23P01';
  end if;

  insert into public.stay (
    host_id, property_id, unit_id, guest_first_name, party_adults, party_children,
    check_in, check_out, source, status, hold_expires_at, phone, rate_kes)
  values (
    p_host_id, v_unit.property_id, v_unit.id,
    nullif(trim(p_stay ->> 'guest_first_name'), ''),
    coalesce(nullif(p_stay ->> 'party_adults', '')::integer, 1),
    coalesce(nullif(p_stay ->> 'party_children', '')::integer, 0),
    v_in, v_out, 'entered', 'held', now() + make_interval(hours => p_hours),
    nullif(trim(p_stay ->> 'phone'), ''),
    nullif(p_stay ->> 'rate_kes', '')::bigint)
  returning * into v_stay;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'stay.held',
    p_target_type => 'stay', p_target_id => v_stay.id, p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('unit', v_unit.name, 'hours', p_hours));
  return v_stay;
end;
$$;

/*
 * Turn a hold into a booking.
 *
 * A NexG guest hold is confirmed by the payment callback (service role)
 * or by hospitality staff, never by the guest or the host. A host's own
 * hold is confirmed by the host. A hold that ran out can still be
 * confirmed, a late M-Pesa callback for instance, as long as nobody has
 * taken the dates in the meantime.
 */
create or replace function public.rpc_stay_confirm(p_stay_id uuid, p_reference text default null)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null then
    raise exception 'No such hold.' using errcode = '22023';
  end if;
  if v_stay.source = 'nexg' then
    if not v_is_service and not authz.works_hospitality(null) then
      raise exception 'A NexG booking is confirmed by its payment.' using errcode = 'insufficient_privilege';
    end if;
  elsif not authz.is_host_member(v_stay.host_id) then
    raise exception 'Not your booking.' using errcode = 'insufficient_privilege';
  end if;

  perform 1 from public.unit where id = v_stay.unit_id for update;
  select * into v_stay from public.stay where id = p_stay_id for update;
  if v_stay.status = 'booked' then
    return v_stay;
  end if;
  if v_stay.status not in ('held', 'cancelled') or (v_stay.status = 'cancelled' and v_stay.hold_expires_at is null) then
    raise exception 'Only a hold can be confirmed.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.stay s
     where s.unit_id = v_stay.unit_id and s.id <> v_stay.id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and s.check_in < v_stay.check_out and s.check_out > v_stay.check_in
  ) then
    raise exception 'The hold ran out and those dates have been taken.' using errcode = '23P01';
  end if;

  update public.stay set status = 'booked', confirmed_at = now(), updated_at = now()
   where id = p_stay_id
  returning * into v_stay;

  perform audit.log(
    case when v_is_service then 'system' when v_stay.source = 'nexg' then 'staff' else 'host_user' end::public.actor_type,
    'hotels', 'stay.confirmed', p_target_type => 'stay', p_target_id => v_stay.id,
    p_after => jsonb_build_object('reference', nullif(trim(coalesce(p_reference, '')), ''),
                                  'total_kes', v_stay.quote_total_kes));
  return v_stay;
end;
$$;

/*
 * Close a unit for some nights. `p_to` is the morning the unit opens
 * again, like a check-out day, so a block from the 3rd to the 5th closes
 * two nights. Noon to noon, so a guest leaving that morning and another
 * arriving that afternoon are both unaffected.
 */
create or replace function public.rpc_stay_block(
  p_host_id uuid,
  p_unit_id uuid,
  p_from date,
  p_to date,
  p_note text default null
)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_zone text;
  v_in timestamptz;
  v_out timestamptz;
  v_stay public.stay;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'The block has to end after it starts.' using errcode = '22023';
  end if;
  if p_to - p_from > 366 then
    raise exception 'Block up to a year at a time.' using errcode = '22023';
  end if;

  select * into v_unit from public.unit
   where id = p_unit_id and host_id = p_host_id and archived_at is null
   for update;
  if v_unit.id is null then
    raise exception 'Pick one of your units to block.' using errcode = '22023';
  end if;
  select coalesce(time_zone, 'Africa/Nairobi') into v_zone from public.host where id = p_host_id;
  v_in := (p_from + time '12:00') at time zone v_zone;
  v_out := (p_to + time '12:00') at time zone v_zone;

  perform public.fn_stay_release_expired_holds(v_unit.id);
  if exists (
    select 1 from public.stay s
     where s.unit_id = v_unit.id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and s.check_in < v_out and s.check_out > v_in
  ) then
    raise exception 'Those dates already have a booking, hold or block. Cancel it first.'
      using errcode = '23P01';
  end if;

  insert into public.stay (
    host_id, property_id, unit_id, party_adults, party_children,
    check_in, check_out, source, status, notes)
  values (
    p_host_id, v_unit.property_id, v_unit.id, 0, 0, v_in, v_out, 'entered', 'blocked',
    left(nullif(trim(coalesce(p_note, '')), ''), 500))
  returning * into v_stay;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'stay.dates_blocked',
    p_target_type => 'stay', p_target_id => v_stay.id, p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('unit', v_unit.name, 'from', p_from, 'to', p_to));
  return v_stay;
end;
$$;

revoke execute on function public.rpc_stay_hold(uuid, date, date, jsonb),
  public.rpc_stay_hold_release(uuid),
  public.rpc_stay_host_hold(uuid, jsonb, integer),
  public.rpc_stay_confirm(uuid, text),
  public.rpc_stay_block(uuid, uuid, date, date, text)
from public, anon;

grant execute on function public.rpc_stay_hold(uuid, date, date, jsonb),
  public.rpc_stay_hold_release(uuid),
  public.rpc_stay_host_hold(uuid, jsonb, integer),
  public.rpc_stay_confirm(uuid, text),
  public.rpc_stay_block(uuid, uuid, date, date, text)
to authenticated, service_role;

-- ═══════════════════════════════════════════════════ host entries

/*
 * Enter or amend a booking, as before: an overlap with another
 * host-entered stay saves with `conflict_flagged`. Now the unit is locked
 * while it checks, expired holds do not count as a clash, and holds,
 * blocks and NexG bookings are changed through their own actions.
 */
create or replace function public.rpc_stay_upsert(
  p_host_id uuid,
  p_stay jsonb,
  p_stay_id uuid default null
)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_unit public.unit;
  v_in timestamptz := nullif(p_stay ->> 'check_in', '')::timestamptz;
  v_out timestamptz := nullif(p_stay ->> 'check_out', '')::timestamptz;
  v_clash boolean;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your booking to enter.' using errcode = 'insufficient_privilege';
  end if;
  if p_stay ->> 'source' = 'nexg' then
    raise exception 'NexG bookings are made by guests online.' using errcode = '22023';
  end if;

  select * into v_unit from public.unit
   where id = nullif(p_stay ->> 'unit_id', '')::uuid
     and host_id = p_host_id and archived_at is null
   for update;
  if v_unit.id is null then
    raise exception 'Pick one of your units for this booking.' using errcode = '22023';
  end if;
  if v_in is null or v_out is null then
    raise exception 'A booking needs a check-in and a check-out.' using errcode = '22023';
  end if;
  if v_out <= v_in then
    raise exception 'Check-out has to be after check-in.' using errcode = '22023';
  end if;

  if p_stay_id is not null and exists (
    select 1 from public.stay
     where id = p_stay_id and host_id = p_host_id
       and (status in ('held', 'blocked') or source = 'nexg')
  ) then
    raise exception 'Holds, blocks and NexG bookings are changed from their own actions.'
      using errcode = '22023';
  end if;

  /* Overlap in the same unit, ignoring this row on an edit. */
  select exists (
    select 1 from public.stay s
     where s.unit_id = v_unit.id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and (p_stay_id is null or s.id <> p_stay_id)
       and s.check_in < v_out and s.check_out > v_in
  ) into v_clash;

  if p_stay_id is null then
    insert into public.stay (
      host_id, property_id, unit_id, guest_first_name,
      party_adults, party_children, check_in, check_out,
      source, status, conflict_flagged, phone, rate_kes)
    values (
      p_host_id, v_unit.property_id, v_unit.id,
      nullif(trim(p_stay ->> 'guest_first_name'), ''),
      coalesce(nullif(p_stay ->> 'party_adults', '')::integer, 1),
      coalesce(nullif(p_stay ->> 'party_children', '')::integer, 0),
      v_in, v_out,
      coalesce(nullif(p_stay ->> 'source', ''), 'entered'),
      'booked', v_clash,
      nullif(trim(p_stay ->> 'phone'), ''),
      nullif(p_stay ->> 'rate_kes', '')::bigint)
    returning * into v_stay;
  else
    update public.stay set
      unit_id = v_unit.id,
      property_id = v_unit.property_id,
      guest_first_name = coalesce(nullif(trim(p_stay ->> 'guest_first_name'), ''), guest_first_name),
      party_adults = coalesce(nullif(p_stay ->> 'party_adults', '')::integer, party_adults),
      party_children = coalesce(nullif(p_stay ->> 'party_children', '')::integer, party_children),
      check_in = v_in,
      check_out = v_out,
      source = coalesce(nullif(p_stay ->> 'source', ''), source),
      conflict_flagged = v_clash,
      phone = coalesce(nullif(trim(p_stay ->> 'phone'), ''), phone),
      rate_kes = coalesce(nullif(p_stay ->> 'rate_kes', '')::bigint, rate_kes)
    where id = p_stay_id and host_id = p_host_id
    returning * into v_stay;

    if v_stay.id is null then
      raise exception 'That booking is not on your account.' using errcode = '42501';
    end if;
  end if;

  perform audit.log('host_user'::public.actor_type, 'hotels',
    case when p_stay_id is null then 'stay.created' else 'stay.updated' end,
    p_target_type => 'stay', p_target_id => v_stay.id, p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('unit', v_unit.name, 'source', v_stay.source,
                                  'conflict', v_stay.conflict_flagged));

  return v_stay;
end;
$$;

/*
 * Cancel a stay, release a hold or lift a block. A NexG guest booking has
 * been paid for, so only hospitality staff cancel it (and refund it).
 */
create or replace function public.rpc_stay_cancel(p_stay_id uuid, p_reason text default null)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_staff boolean := authz.works_hospitality(null);
begin
  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null then
    raise exception 'No such booking.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_stay.host_id) and not v_staff then
    raise exception 'Not your booking.' using errcode = 'insufficient_privilege';
  end if;
  if v_stay.source = 'nexg' and v_stay.status in ('booked', 'in_stay') and not v_staff then
    raise exception 'This guest paid through NexG. Contact NexG to cancel it.' using errcode = '22023';
  end if;

  update public.stay set status = 'cancelled', updated_at = now()
   where id = p_stay_id returning * into v_stay;

  /* A cancellation can clear somebody else's conflict flag, and
     leaving it set would keep a red row on the page forever. */
  update public.stay s set conflict_flagged = exists (
    select 1 from public.stay o
     where o.unit_id = s.unit_id and o.id <> s.id
       and public.fn_stay_occupies(o.status, o.hold_expires_at)
       and o.check_in < s.check_out and o.check_out > s.check_in)
   where s.unit_id = v_stay.unit_id and s.status in ('booked', 'in_stay');

  perform audit.log(
    case when v_staff and not authz.is_host_member(v_stay.host_id) then 'staff' else 'host_user' end::public.actor_type,
    'hotels', 'stay.cancelled',
    p_target_type => 'stay', p_target_id => p_stay_id,
    p_after => jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''),
                                  'was', v_stay.notes));

  return v_stay;
end;
$$;

-- ═══════════════════════════════════════════════════ what a host reads

create or replace view host_stay_v
with (security_invoker = false) as
select
  s.id,
  s.host_id,
  s.unit_id,
  u.name as unit_name,
  p.name as property_name,
  s.guest_first_name,
  s.party_adults,
  s.party_children,
  s.check_in,
  s.check_out,
  s.source,
  s.status,
  s.conflict_flagged,
  s.rate_kes,
  s.qr_link_sent_at,
  case
    when s.phone is null then null
    when length(s.phone) > 6
      then left(s.phone, 4) || repeat('•', greatest(0, length(s.phone) - 7))
           || right(s.phone, 2)
    else '•••'
  end as phone_masked,
  r.rating as stay_rating,
  r.text as stay_review,
  r.answered_at as reviewed_at,
  (select count(*) from public.qr_scan sc
    where sc.owner_id = s.unit_id
      and sc.scanned_at between s.check_in and s.check_out)::int as scans,
  (select count(*) from public.qr_scan sc
    join public."order" o on o.qr_scan_id = sc.id
   where sc.owner_id = s.unit_id
     and sc.scanned_at between s.check_in and s.check_out)::int as orders,
  (now() >= s.check_in and now() < s.check_out) as in_stay,
  /* A hold that ran out reads as gone even before the cron catches it. */
  s.hold_expires_at,
  s.notes,
  s.quote_total_kes,
  (s.status = 'held' and s.hold_expires_at <= now()) as hold_expired
from public.stay s
left join public.unit u on u.id = s.unit_id
left join public.property p on p.id = s.property_id
left join public.stay_review r on r.stay_id = s.id
where authz.is_host_member(s.host_id);

-- ═══════════════════════════════════════════════════ the minute cron

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; expired stay holds are released when the next hold or block is made.';
    return;
  end if;
  perform cron.schedule(
    'stay-release-expired-holds',
    '* * * * *',
    $cron$select public.fn_stay_release_expired_holds()$cron$);
end $$;

-- A block or a hold is not a guest: the unit list shows who is actually staying.
create or replace view host_unit_list_v
with (security_invoker = false) as
select
  u.id,
  u.host_id,
  u.property_id,
  pr.name as property_name,
  u.name,
  u.label_public,
  u.status::text as status,
  u.floor,
  u.bedrooms,
  u.bathrooms,
  u.max_guests,
  u.unit_amenities,
  u.photos,
  u.handoff::text as handoff,
  u.delivery_hours,
  u.caretaker_name,
  u.caretaker_confirmed_at,
  u.readiness,
  u.nightly_rate_kes,
  now_stay.guest_first_name as guest_now,
  now_stay.check_out as guest_out,
  now_stay.party_adults as guest_adults,
  now_stay.party_children as guest_children,
  now_stay.source as guest_source,
  next_stay.check_in as next_check_in,
  next_stay.guest_first_name as next_guest,
  coalesce(q.cards, 0) as qr_cards,
  coalesce(q.placed, 0) as qr_placed,
  coalesce(o.orders_30d, 0) as orders_30d,
  (now_stay.id is not null) as occupied,
  /* Departing is a separate state from occupied because the two
     need different things from a host today: one needs nothing,
     the other needs cleaning booked. */
  (now_stay.id is not null and now_stay.check_out::date = (now() at time zone 'Africa/Nairobi')::date)
    as departing_today
from public.unit u
left join public.property pr on pr.id = u.property_id
left join lateral (
  select s.* from public.stay s
   where s.unit_id = u.id and s.status in ('booked', 'in_stay', 'departed')
     and now() >= s.check_in and now() < s.check_out
   order by s.check_in desc limit 1
) now_stay on true
left join lateral (
  select s.* from public.stay s
   where s.unit_id = u.id and s.status in ('booked', 'in_stay', 'departed') and s.check_in > now()
   order by s.check_in limit 1
) next_stay on true
left join lateral (
  select count(*) as cards, count(*) filter (where state = 'placed') as placed
  from public.property_qr
   where owner_type = 'unit' and owner_id = u.id and voided_at is null
) q on true
left join lateral (
  select count(*) as orders_30d
  from public.qr_scan sc join public."order" ord on ord.qr_scan_id = sc.id
   where sc.owner_id = u.id and ord.placed_at > now() - interval '30 days'
) o on true
where u.archived_at is null
  and authz.is_host_member(u.host_id);
