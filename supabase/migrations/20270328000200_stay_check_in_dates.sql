-- Stays: check-in follows the host's calendar day, and an early check-out frees the unit (26 Nov 2026).
--
--  1. rpc_host_stay_mark_checked_in (20270314000800) compared today's date with the stay's timestamps, so it
--     refused a guest on the arrival day and let one in on the departure day. It now compares dates in the
--     host's time zone: from the check-in date, and before the check-out date. Nothing else in it changes.
--     (rpc_host_stay_mark_checked_out compares no dates.)
--     The reservation-code check-in, rpc_host_stay_check_in (20270116000400), had no arrival-date check, so a
--     paid stay could be checked in days early and checked out again, releasing every night under 2. It now
--     keeps the same days and, like the workspace check-in, refuses while another guest is still checked in to
--     the unit. It answers as before, with ok false and a reason: 'too_early', 'ended' or 'unit_occupied'.
--  2. A departed stay no longer keeps its dates. fn_stay_occupies (20261118000100) counted 'departed', so
--     after an early check-out the nights left over stayed busy. Every caller changes with it: guest search,
--     busy nights and holds, host holds and blocks, confirming a hold, a payment settling a lapsed hold, and
--     the conflict flag set by a host entry or recalculated by a cancellation.
--  3. host_unit_list_v no longer shows a departed guest as the unit's current guest.
--
-- The stay keeps its check_in and check_out as booked. Refunds, payouts and receipts do not read
-- fn_stay_occupies. The one money path that does is a payment settling a lapsed hold (tg_payment_stay_settled):
-- when only a departed stay overlaps the hold, it is now booked instead of marked for refund.
--
-- What follows from it:
--   * the unused nights of an early check-out, a paid stay included, can be booked from that moment, tonight too;
--   * a check-out has no undo, so one made by mistake releases the nights;
--   * a guest checked in and straight out again, on or after the arrival date, releases the nights too;
--   * a booking entered afterwards over a departed stay's dates, a backdated one included, is not flagged;
--   * a flag already set against a stay that then departs stays until that booking is edited or a stay on the
--     unit is cancelled.
--
-- Rollback: re-run rpc_host_stay_mark_checked_in from 20270314000800, rpc_host_stay_check_in from
-- 20270116000400, and fn_stay_occupies and host_unit_list_v from 20261118000100.

-- ═══════════════════════════════════════════════ 1. check in on the right days

create or replace function public.rpc_host_stay_mark_checked_in(p_stay_id uuid)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_zone text;
  v_today date;
begin
  select * into v_stay from public.stay where id = p_stay_id for update;
  if v_stay.id is null or not authz.is_host_member(v_stay.host_id)
     or v_stay.unit_id is null or not authz.can_see_unit(v_stay.unit_id) then
    raise exception 'This record is outside your workspace access.' using errcode = '42501';
  end if;
  if v_stay.status = 'in_stay' then
    raise exception 'This guest is already checked in.' using errcode = '22023';
  end if;
  if v_stay.status = 'held' then
    raise exception 'This stay is not confirmed yet.' using errcode = '22023';
  end if;
  if v_stay.status <> 'booked' then
    raise exception 'Only a confirmed reservation can be checked in.' using errcode = '22023';
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

  perform 1 from public.unit where id = v_stay.unit_id for update;
  if exists (select 1 from public.stay o
              where o.unit_id = v_stay.unit_id and o.id <> v_stay.id and o.status = 'in_stay') then
    raise exception 'Another guest is still checked in to this unit. Check them out first.'
      using errcode = '22023';
  end if;

  update public.stay
     set status = 'in_stay', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
   where id = v_stay.id returning * into v_stay;
  update public.reservation_code set used_at = now(), used_by = auth.uid()
   where stay_id = v_stay.id and used_at is null;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'stay.checked_in',
    p_actor_id => auth.uid(), p_target_type => 'stay', p_target_id => v_stay.id,
    p_after => jsonb_build_object('how', 'workspace'));
  return v_stay;
end;
$$;

/* The same days for the reservation code. Otherwise as 20270116000400: the answers stay jsonb. */
create or replace function public.rpc_host_stay_check_in(p_code text, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found jsonb := public.rpc_host_stay_by_code(p_code);
  v_stay public.stay;
  v_zone text;
  v_today date;
begin
  if not (v_found ->> 'ok')::boolean then
    return v_found;
  end if;
  select * into v_stay from public.stay where id = (v_found -> 'stay' ->> 'stay_id')::uuid for update;
  if v_stay.status = 'held' then
    return jsonb_build_object('ok', false, 'reason', 'not_paid',
      'message', 'This stay is not paid yet, so it is not confirmed.');
  end if;
  if v_stay.status <> 'booked' then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed',
      'message', 'This stay is ' || v_stay.status || '; it cannot be checked in.');
  end if;

  select time_zone into v_zone from public.host where id = v_stay.host_id;
  if v_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    v_zone := 'Africa/Nairobi';
  end if;
  v_today := (now() at time zone v_zone)::date;
  if v_today < (v_stay.check_in at time zone v_zone)::date then
    return jsonb_build_object('ok', false, 'reason', 'too_early',
      'message', 'The guest can be checked in from '
                 || to_char(v_stay.check_in at time zone v_zone, 'FMDD Mon YYYY') || '.');
  end if;
  if v_today >= (v_stay.check_out at time zone v_zone)::date then
    return jsonb_build_object('ok', false, 'reason', 'ended', 'message', 'This stay has already ended.');
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is not null
     and not public.fn_same_reservation_name(p_name, v_stay.guest_first_name) then
    perform public.fn_reservation_code_failed();
    return jsonb_build_object('ok', false, 'reason', 'name_mismatch',
      'message', 'The name does not match this booking.');
  end if;

  perform 1 from public.unit where id = v_stay.unit_id for update;
  if exists (select 1 from public.stay o
              where o.unit_id = v_stay.unit_id and o.id <> v_stay.id and o.status = 'in_stay') then
    return jsonb_build_object('ok', false, 'reason', 'unit_occupied',
      'message', 'Another guest is still checked in to this unit. Check them out first.');
  end if;

  update public.stay
     set status = 'in_stay', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
   where id = v_stay.id returning * into v_stay;
  update public.reservation_code set used_at = now(), used_by = auth.uid() where stay_id = v_stay.id;
  perform audit.log('host_user'::public.actor_type, 'hotels', 'stay.checked_in',
    p_actor_id => auth.uid(), p_target_type => 'stay', p_target_id => v_stay.id);
  return jsonb_build_object('ok', true, 'stay', (v_found -> 'stay') || jsonb_build_object('status', v_stay.status),
    'checked_in_at', v_stay.checked_in_at);
end;
$$;

-- ═══════════════════════════════════════════════ 2. who keeps their dates

/* Whether a row keeps its dates from anybody else right now. A guest who has checked out does not. */
create or replace function public.fn_stay_occupies(p_status text, p_hold_expires_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status in ('booked', 'in_stay', 'blocked')
      or (p_status = 'held' and p_hold_expires_at > now());
$$;

-- ═══════════════════════════════════════════════ 3. the unit list

-- As 20261118000100; the current stay is a booked or checked-in one.
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
   where s.unit_id = u.id and s.status in ('booked', 'in_stay')
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
