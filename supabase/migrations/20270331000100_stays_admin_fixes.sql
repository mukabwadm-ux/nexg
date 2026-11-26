-- Stays admin fixes (26 Nov 2026), on top of 20270329000100. No access rule changes: every function keeps its
-- signature, owner, grants and gate (create or replace).
--
--  1. A host staff sent back to fix, who then resubmits, is pending again. rpc_console_host_reject empties
--     host.submitted_at and rpc_host_documents_submit did not set it again, so the host stayed in Sent Back with
--     setup step 5 undone. The submit now fills it in when it is empty.
--     rpc_host_listing_photo_set compared an empty submitted_at, got NULL and did not refuse. It now refuses an
--     empty one, and any application that was sent back (which a fresh submitted_at would otherwise reopen).
--     Rows changed here: only public.host rows with status 'verifying', submitted_at empty, rejected_at set and
--     verification_submitted_at at or after rejected_at (sent back, then resubmitted). submitted_at becomes
--     verification_submitted_at (updated_at moves with it, by trigger). No email goes out.
--  2. Nights freed by an early check-out no longer count towards occupancy: units, properties, overview (rate,
--     previous rate, daily chart, top buildings) and performance (rate, previous rate, areas, top properties).
--     A departed stay counts the nights from its check-in day up to the day it was checked out, never past the
--     booked check-out; with no check-out time recorded it counts as booked. A guest checked out on the arrival
--     day counts no night. The calendar KPIs never counted departed stays.
--     Money is as before and no record changes: booking value and revenue stay the whole paid (or quoted) amount,
--     in the period the check-in falls in, and ADR and the average per night still divide by the nights as booked.
--     RevPAR divides that value by available unit nights. Length of stay is still the booked length.
--  3. Staff check-in refuses a stay with no unit, as the host workspace check-in does.
--  4. The calendar's "available today" no longer counts an expired hold as taken, matching its day grid.
--  5. Repeat guests, grouped by first name, leave out 'Former member' (a deleted account) as well as 'Guest'.
--
-- Rollback: re-run rpc_host_documents_submit from 20261114000100, rpc_host_listing_photo_set from 20261117000100,
-- the rpc_console_* functions below from 20270329000100, then drop fn_stays_held_until. The repaired
-- submitted_at values are correct either way and can stay.

-- ═══════════════════════════════════════════════ 1. sent back, then resubmitted

create or replace function public.rpc_host_documents_submit(p_host_id uuid)
returns public.host_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host;
  v_missing text[];
begin
  if not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = v_uid and member.units is null
  ) then
    raise exception 'Only the account owner or a full-access manager can submit documents.'
      using errcode = '42501';
  end if;
  select * into v_host from public.host where id = p_host_id for update;
  if v_host.status = 'verifying' then
    return v_host.status;
  end if;
  if v_host.status <> 'applied' then
    raise exception 'This account is not waiting for documents.' using errcode = '22023';
  end if;
  v_missing := public.fn_host_documents_missing(p_host_id);
  if cardinality(v_missing) > 0 then
    raise exception 'Upload your ID or passport and proof of authority to let the property first.'
      using errcode = '22023';
  end if;

  update public.host
  set status = 'verifying', status_reason = null, verification_submitted_at = now(),
      /* Sending a host back empties this (rpc_console_host_reject); the application is in again. */
      submitted_at = coalesce(submitted_at, now()), updated_at = now()
  where id = p_host_id
  returning * into v_host;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.documents_submitted',
    p_actor_id => v_uid, p_target_type => 'host', p_target_id => p_host_id,
    p_city_id => v_host.city_id);
  return v_host.status;
end;
$$;

create or replace function public.rpc_host_listing_photo_set(
  p_host_id uuid, p_unit_id uuid, p_path text, p_alt text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_host public.host;
  v_unit public.unit;
  v_photo jsonb;
begin
  if not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = v_uid and member.role = 'owner'
  ) then
    raise exception 'Only the account owner can add this photo.' using errcode = '42501';
  end if;
  select * into v_host from public.host where id = p_host_id;
  /* A sent-back application is not fresh, and one with no submission time never counts as fresh. */
  if v_host.status <> 'applied' or v_host.rejected_at is not null or v_host.submitted_at is null
     or v_host.submitted_at < now() - interval '1 hour' then
    raise exception 'Add photos from your workspace instead.' using errcode = '22023';
  end if;
  select * into v_unit from public.unit where id = p_unit_id and host_id = p_host_id for update;
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;
  if p_path not like p_host_id::text || '/' || p_unit_id::text || '/%' or not exists (
    select 1 from storage.objects o where o.bucket_id = 'host-photos' and o.name = p_path
  ) then
    raise exception 'Upload the photo again.' using errcode = '22023';
  end if;

  v_photo := jsonb_build_array(jsonb_build_object(
    'path', p_path, 'alt', left(coalesce(nullif(trim(p_alt), ''), 'Cover photo'), 160), 'cover', true));

  perform pg_catalog.set_config('nexg.host_listing_unlock', 'on', true);
  update public.unit set photos = v_photo
  where id = v_unit.id and coalesce(jsonb_array_length(photos), 0) = 0;
  update public.property set photos = v_photo
  where id = v_unit.property_id and host_id = p_host_id and coalesce(jsonb_array_length(photos), 0) = 0;
  perform pg_catalog.set_config('nexg.host_listing_unlock', 'off', true);

  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.listing_photo_imported',
    p_actor_id => v_uid, p_target_type => 'unit', p_target_id => v_unit.id,
    p_after => jsonb_build_object('path', p_path));
end;
$$;

/* Hosts already stuck: sent back, resubmitted, and still without a submission time. */
do $$
declare
  v_ids uuid[];
begin
  with fixed as (
    update public.host
       set submitted_at = verification_submitted_at
     where status = 'verifying'
       and submitted_at is null
       and rejected_at is not null
       and verification_submitted_at >= rejected_at
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from fixed;
  raise notice 'Resubmitted hosts moved back to pending: % %', cardinality(v_ids), v_ids;
end;
$$;

-- ═══════════════════════════════════════════════ 2. nights freed by an early check-out

/*
 * Where a stay stops counting nights: its booked check-out, or, once the guest has left, the moment they were
 * checked out if that is earlier (never before the check-in). fn_stays_nights_in takes it as the end.
 */
create or replace function public.fn_stays_held_until(
  p_status text, p_in timestamptz, p_out timestamptz, p_left timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case when p_status = 'departed' and p_left is not null
              then greatest(p_in, least(p_out, p_left))
              else p_out end
$$;
revoke all on function public.fn_stays_held_until(text, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;

/* As 20270329000100, counting a departed stay's nights only until it was checked out. */
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
  booked as (select r.*, public.fn_stays_held_until(r.status, r.check_in, r.check_out, r.checked_out_at) as held_until
               from r where r.status in ('booked', 'in_stay', 'departed')),
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
          (select coalesce(sum(public.fn_stays_nights_in(b.check_in, b.held_until, p_from, p_to)), 0) from booked b)
          / (v_units * v_len), 1) end,
      'occupancy_prev_pct', case when v_units > 0 then round(100.0 *
          (select coalesce(sum(public.fn_stays_nights_in(b.check_in, b.held_until, v_pfrom, v_pto)), 0) from booked b)
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
                and (b.held_until at time zone 'Africa/Nairobi')::date > d.day) / v_units, 1) end)
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
               round(100.0 * sum(public.fn_stays_nights_in(c.check_in, c.held_until, p_from, p_to))
                 / nullif((select count(*) from public.unit u where u.property_id = c.property_id
                    and u.status = 'live' and u.archived_at is null) * v_len, 0), 1) as occupancy_pct
        from cur c where c.property_id is not null
        group by c.property_id order by sum(c.value_kes) desc limit 5) x)
  ) into v_result;
  return v_result;
end;
$$;

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
           (select coalesce(sum(public.fn_stays_nights_in(s.check_in,
                     public.fn_stays_held_until(s.status, s.check_in, s.check_out, s.checked_out_at), p_from, p_to)), 0)
              from public.stay s where s.unit_id = un.id and s.status in ('booked', 'in_stay', 'departed')) as nights,
           /* The nights as booked, which the booking value pays for: the ADR divisor. */
           (select coalesce(sum(public.fn_stays_nights_in(s.check_in, s.check_out, p_from, p_to)), 0)
              from public.stay s where s.unit_id = un.id and s.status in ('booked', 'in_stay', 'departed')) as sold_nights,
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
      'adr_kes', (select round(sum(revenue_kes)::numeric / nullif(sum(sold_nights), 0)) from u),
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
           (select coalesce(sum(public.fn_stays_nights_in(s.check_in,
                     public.fn_stays_held_until(s.status, s.check_in, s.check_out, s.checked_out_at), p_from, p_to)), 0)
              from public.stay s join public.unit u on u.id = s.unit_id
             where u.property_id = pr.id and s.status in ('booked', 'in_stay', 'departed')) as nights,
           (select coalesce(sum(public.fn_stays_nights_in(s.check_in, s.check_out, p_from, p_to)), 0)
              from public.stay s join public.unit u on u.id = s.unit_id
             where u.property_id = pr.id and s.status in ('booked', 'in_stay', 'departed')) as sold_nights,
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

/* Also: repeat guests leave out deleted accounts. */
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
  b as (select r.*, public.fn_stays_held_until(r.status, r.check_in, r.check_out, r.checked_out_at) as held_until
          from r where status in ('booked', 'in_stay', 'departed')),
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
          (select coalesce(sum(public.fn_stays_nights_in(x.check_in, x.held_until, p_from, p_to)), 0) from b x) / (v_units * v_len), 1) end,
      'occupancy_prev_pct', case when v_units > 0 then round(100.0 *
          (select coalesce(sum(public.fn_stays_nights_in(x.check_in, x.held_until, v_pfrom, v_pto)), 0) from b x) / (v_units * v_len), 1) end,
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
      'repeat_pct', (select round(100.0 * count(*) filter (where n > 1) / nullif(count(*), 0), 1) from guests
                      where guest_name not in ('Guest', 'Former member')),
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
               round(100.0 * sum(public.fn_stays_nights_in(check_in, held_until, p_from, p_to))
                 / nullif((select count(*) from public.unit u join public.property p2 on p2.id = u.property_id
                    where coalesce(u.area, p2.area) is not distinct from cur.area and u.status = 'live'
                      and u.archived_at is null) * v_len, 0), 1) as occupancy_pct
        from cur group by area order by sum(value_kes) desc limit 5) x),
    'top_properties', (select coalesce(jsonb_agg(to_jsonb(x) order by x.value_kes desc), '[]'::jsonb) from (
        select property_id, max(property_name) as name, max(area) as area,
               (select count(*) from public.unit u where u.property_id = cur.property_id and u.archived_at is null) as units,
               sum(value_kes) as value_kes, round(sum(value_kes)::numeric / nullif(sum(nights), 0)) as adr,
               round(100.0 * sum(public.fn_stays_nights_in(check_in, held_until, p_from, p_to))
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

-- ═══════════════════════════════════════════════ 3. staff check-in needs a unit

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
  if v_stay.unit_id is null then
    raise exception 'This stay has no unit, so the guest cannot be checked in.' using errcode = '22023';
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

  update public.stay set status = 'in_stay', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
   where id = v_stay.id returning * into v_stay;
  update public.reservation_code set used_at = now(), used_by = auth.uid()
   where stay_id = v_stay.id and used_at is null;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stay.checked_in_by_staff',
    p_target_type => 'stay', p_target_id => v_stay.id);
  return jsonb_build_object('stay_id', v_stay.id, 'status', v_stay.status, 'staff', v_staff);
end;
$$;

-- ═══════════════════════════════════════════════ 4. available today

/* As 20270329000100; the KPI now asks fn_stay_occupies, so a lapsed hold leaves the unit available. */
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
            and public.fn_stay_occupies(s.status, s.hold_expires_at)
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
