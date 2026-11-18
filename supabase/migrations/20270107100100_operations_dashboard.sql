-- Operations dashboard: every live order, stay, experience day, delivery and
-- service booking in one place, and the figures above them.
--
-- Operations → Operations Dashboard reads two functions:
--   rpc_operations_overview(p_from, p_to, p_tab): the five KPI cards, the
--     Ongoing / Pending / Completed / Cancelled counts, the Area and Status
--     filter lists, the city the map centres on and the points on it;
--   rpc_operations_list(p_from, p_to, p_tab, p_bucket, p_kind, p_status,
--     p_area, p_q, p_limit, p_offset): one page of the Live Operations table.
-- Both read rows through fn_ops_rows, so a row and the count it belongs to
-- can never disagree.
--
-- What each kind is, and what its statuses mean:
--   orders      public.order. Nothing in NexG moves an order to confirmed,
--               preparing, ready, picked up or arriving today (merchants do
--               not accept orders in the app; staff mark delivered by hand),
--               so a live order says what is actually known: awaiting
--               payment, scheduled, finding a rider, rider assigned, or
--               placed. Those stages show if they are ever set. Food = a
--               restaurant. Transfer = an API airport or intercity transfer,
--               or an order from a transfer or vehicle-rental merchant.
--               Everything else a merchant delivers is a delivery.
--   stays       public.stay. In house = booked or in stay with now between
--               check-in and check-out. Host date blocks are not stays.
--   experiences public.plan, grouped as the desk groups them; drafts are
--               left out.
--   services    public.booking (the booking engine); maintenance blocks are
--               left out.
--   incidents   public.incident and public.dispute, shown only behind
--   & disputes  Operations → Incidents & Disputes.
-- Ongoing and pending rows are whatever is live now. Completed and cancelled
-- rows are those that finished inside the period.
--
-- KPIs (the same whichever tab is open):
--   Total Orders             orders placed in the period, against the same
--                            number of days before it; the line is per day.
--   Bookings & Reservations  stays, experience days and service bookings
--                            made in the period.
--   Active Deliveries        orders with a rider that are not finished, now;
--                            change and line: deliveries per day.
--   In-house Guests          adults and children in house now; the line is
--                            guests in house at 22:00 each night, the change
--                            compares the average night.
--   Open Incidents           open incidents and disputes now; change and
--                            line: new ones per day (up is bad).
--
-- Access: both readers are security definer and check the caller first
-- (Orders or Live operations, or a super admin). Each kind is then included
-- only for those who may read it: orders for Orders or Live operations;
-- stays for those or Hotels; experience days by can_see_plan(city); service
-- bookings for Orders or can_manage_merchants(city); incidents for Riders or
-- Live operations; disputes for Orders. Customers appear as an initial and a
-- surname ("A. Wanjiku"); stays only ever hold a first name.
--
-- Raise Incident (Quick Actions) is rpc_ops_incident_raise: operations staff
-- only, recorded as staff, linked to the order's rider, merchant and guest.
--
-- Rollback:
--   drop function
--     public.rpc_operations_list(date, date, text, text, text, text, text, text, integer, integer),
--     public.rpc_operations_overview(date, date, text),
--     public.rpc_ops_incident_raise(text, text, text, text),
--     public.fn_ops_rows(date, date),
--     public.fn_ops_kinds(text),
--     public.fn_ops_short_name(text);

-- ═══════════════════════════════════════════════════════════ helpers

/* "Amina Wanjiku" → "A. Wanjiku". The table shows an initial and a surname. */
create or replace function public.fn_ops_short_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_name is null or btrim(p_name) = '' then null
    when array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1) = 1 then btrim(p_name)
    else upper(left(btrim(p_name), 1)) || '. '
         || (regexp_split_to_array(btrim(p_name), '\s+'))[array_length(regexp_split_to_array(btrim(p_name), '\s+'), 1)]
  end;
$$;

/* The kinds each tab shows. Null for a tab that does not exist. */
create or replace function public.fn_ops_kinds(p_tab text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_tab, 'all')
    when 'all' then array['food', 'delivery', 'stay', 'experience', 'transfer', 'service']
    when 'food' then array['food', 'delivery']
    when 'stays' then array['stay']
    when 'experiences' then array['experience']
    when 'transfers' then array['transfer']
    when 'services' then array['service']
    when 'incidents' then array['incident', 'dispute']
  end;
$$;

-- ══════════════════════════════════════════════════════════ the rows

/*
 * Every operation the caller may see: whatever is live now, and whatever
 * finished between p_from and p_to (Nairobi days). Internal: the two
 * readers call it after their own checks.
 */
create or replace function public.fn_ops_rows(p_from date, p_to date)
returns table (
  kind text,
  id uuid,
  ref text,
  customer text,
  party text,
  amount_cents bigint,
  status text,
  status_label text,
  tone text,
  bucket text,
  starts_at timestamptz,
  ends_at timestamptz,
  eta_at timestamptz,
  all_day boolean,
  done_at timestamptz,
  area_id uuid,
  area text,
  city_id uuid,
  href text,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select authz.is_super_admin() as admin,
           authz.reaches_module('orders') as orders,
           authz.reaches_module('live_ops') as live,
           authz.reaches_module('hotels') as hotels,
           authz.reaches_module('riders') as riders
  ),
  span as (
    select (p_from::timestamp at time zone 'Africa/Nairobi') as s,
           ((p_to + 1)::timestamp at time zone 'Africa/Nairobi') as e,
           (now() at time zone 'Africa/Nairobi')::date as today
  ),
  st (key, label, tone, bucket) as (
    values
      ('placed', 'Placed', 'amber', 'ongoing'),
      ('confirmed', 'Confirmed', 'blue', 'ongoing'),
      ('preparing', 'Preparing', 'amber', 'ongoing'),
      ('ready', 'Ready for pickup', 'amber', 'ongoing'),
      ('finding_rider', 'Finding a rider', 'amber', 'ongoing'),
      ('rider_assigned', 'Rider assigned', 'blue', 'ongoing'),
      ('out_for_delivery', 'Out for delivery', 'blue', 'ongoing'),
      ('arriving', 'Arriving', 'blue', 'ongoing'),
      ('on_trip', 'On trip', 'green', 'ongoing'),
      ('disputed', 'Disputed', 'red', 'ongoing'),
      ('awaiting_payment', 'Awaiting payment', 'amber', 'pending'),
      ('scheduled', 'Scheduled', 'blue', 'pending'),
      ('delivered', 'Delivered', 'green', 'completed'),
      ('refunded', 'Refunded', 'grey', 'completed'),
      ('cancelled', 'Cancelled', 'red', 'cancelled'),
      ('checked_in', 'Checked in', 'green', 'ongoing'),
      ('held', 'On hold', 'amber', 'pending'),
      ('booked', 'Booked', 'blue', 'pending'),
      ('checked_out', 'Checked out', 'grey', 'completed'),
      ('stay_cancelled', 'Cancelled', 'red', 'cancelled'),
      ('on_the_day', 'On the day', 'green', 'ongoing'),
      ('paid', 'Paid', 'blue', 'pending'),
      ('approved', 'Confirmed', 'blue', 'pending'),
      ('quoted', 'Quote sent', 'amber', 'pending'),
      ('confirming', 'Confirming', 'amber', 'pending'),
      ('new_request', 'New request', 'amber', 'pending'),
      ('plan_completed', 'Completed', 'green', 'completed'),
      ('plan_cancelled', 'Cancelled', 'red', 'cancelled'),
      ('plan_expired', 'Expired', 'grey', 'cancelled'),
      ('in_progress', 'In progress', 'green', 'ongoing'),
      ('booking_confirmed', 'Confirmed', 'blue', 'pending'),
      ('requested', 'Requested', 'amber', 'pending'),
      ('booking_done', 'Completed', 'green', 'completed'),
      ('booking_cancelled', 'Cancelled', 'red', 'cancelled'),
      ('no_show', 'No-show', 'red', 'cancelled'),
      ('booking_expired', 'Expired', 'grey', 'cancelled'),
      ('incident_open', 'Open', 'red', 'pending'),
      ('investigating', 'Investigating', 'amber', 'ongoing'),
      ('incident_resolved', 'Resolved', 'green', 'completed'),
      ('dispute_open', 'Open', 'red', 'pending'),
      ('awaiting_merchant', 'Awaiting merchant', 'amber', 'ongoing'),
      ('dispute_resolved', 'Resolved', 'green', 'completed'),
      ('chargeback', 'Chargeback', 'red', 'completed')
  ),

  /* ── orders: food, deliveries and transfers ─────────────────────────── */
  o as (
    select o.*,
           coalesce(nullif(btrim(m.trading_name), ''), m.legal_name) as m_name,
           case
             when (o.channel = 'api'
                   and o.delivery_context ->> 'service' in ('airport_transfer', 'intercity_transfer'))
                  or m.category in ('airport_transfers', 'vehicle_rentals') then 'transfer'
             when m.category in ('restaurants_food', 'restaurant') then 'food'
             else 'delivery'
           end as k,
           g.name as g_name,
           z.name as z_name,
           b.latitude as b_lat,
           b.longitude as b_lng,
           exists (select 1 from dispatch.job j
                    where j.order_id = o.id and j.state in ('queued', 'offering', 'escalated')) as finding
      from public.order o
      join public.merchant m on m.id = o.merchant_id
      left join public.guest g on g.id = o.guest_id
      left join public.zone z on z.id = o.zone_id
      left join public.merchant_branch b on b.id = o.branch_id
     where (select admin or orders or live from me)
       and (o.stage not in ('delivered', 'cancelled', 'refunded')
            or (coalesce(o.delivered_at, o.cancelled_at, o.updated_at) >= (select s from span)
                and coalesce(o.delivered_at, o.cancelled_at, o.updated_at) < (select e from span)))
  ),
  o_rows as (
    select o.k, o.id, o.reference,
           public.fn_ops_short_name(o.g_name), o.m_name, o.total_cents,
           s.key, s.label, s.tone, s.bucket,
           coalesce(o.scheduled_for, o.placed_at), coalesce(o.delivered_at, o.cancelled_at),
           coalesce(o.eta_at, o.promised_delivery_at), false,
           case when s.bucket in ('completed', 'cancelled')
                then coalesce(o.delivered_at, o.cancelled_at, o.updated_at) end,
           o.zone_id, o.z_name, o.city_id,
           '/orders?chip=all&q=' || o.reference || '&selected=' || o.id,
           case when o.picked_up_at is not null and o.dropoff_point is not null
                then extensions.st_y(o.dropoff_point::extensions.geometry) else o.b_lat end,
           case when o.picked_up_at is not null and o.dropoff_point is not null
                then extensions.st_x(o.dropoff_point::extensions.geometry) else o.b_lng end
      from o
      join st s on s.key = case
        when o.stage = 'cancelled' then 'cancelled'
        when o.stage = 'refunded' then 'refunded'
        when o.stage = 'delivered' then 'delivered'
        when o.stage = 'disputed' then 'disputed'
        when o.payment_method in ('mpesa_stk', 'card') and o.payment_status in ('pending', 'failed')
          then 'awaiting_payment'
        when o.scheduled_for is not null and o.scheduled_for > now() then 'scheduled'
        when o.k = 'transfer' and (o.stage in ('picked_up', 'arriving') or o.picked_up_at is not null)
          then 'on_trip'
        when o.stage = 'arriving' then 'arriving'
        when o.stage = 'picked_up' or o.picked_up_at is not null then 'out_for_delivery'
        when o.stage = 'ready' then 'ready'
        when o.stage = 'preparing' then 'preparing'
        when o.stage = 'confirmed' then 'confirmed'
        when o.rider_id is not null then 'rider_assigned'
        when o.finding then 'finding_rider'
        else 'placed'
      end
  ),

  /* ── stays ──────────────────────────────────────────────────────────── */
  y as (
    select sy.*,
           coalesce(p.name, u.label_public, u.name, h.display_name) as party_name,
           u.zone_id as u_zone,
           coalesce(z.name, u.area, p.area) as area_name,
           coalesce(p.city_id, u.city_id, h.city_id) as y_city,
           coalesce(u.point, p.point) as y_point
      from public.stay sy
      left join public.property p on p.id = sy.property_id
      left join public.unit u on u.id = sy.unit_id
      left join public.host h on h.id = sy.host_id
      left join public.zone z on z.id = u.zone_id
     where (select admin or orders or live or hotels from me)
       and sy.status <> 'blocked'
       and not (sy.status = 'held' and sy.hold_expires_at is not null and sy.hold_expires_at < now())
       and ((sy.status in ('held', 'booked', 'in_stay') and sy.check_out > now())
            or (sy.status in ('booked', 'in_stay') and sy.check_out <= now()
                and sy.check_out >= (select s from span) and sy.check_out < (select e from span))
            or (sy.status in ('departed', 'cancelled')
                and sy.updated_at >= (select s from span) and sy.updated_at < (select e from span)))
  ),
  y_rows as (
    select 'stay', y.id,
           coalesce(nullif(btrim(y.payment_reference), ''),
                    'STY-' || upper(left(replace(y.id::text, '-', ''), 6))),
           nullif(btrim(y.guest_first_name), ''), y.party_name,
           case when y.quote_total_kes is not null then y.quote_total_kes * 100 end,
           s.key, s.label, s.tone, s.bucket,
           y.check_in, y.check_out, null::timestamptz, false,
           case when s.bucket in ('completed', 'cancelled')
                then case when y.status in ('cancelled', 'departed') then y.updated_at else y.check_out end end,
           y.u_zone, y.area_name, y.y_city,
           '/hotels/hosts/' || y.host_id,
           case when y.y_point is not null then extensions.st_y(y.y_point::extensions.geometry) end,
           case when y.y_point is not null then extensions.st_x(y.y_point::extensions.geometry) end
      from y
      join st s on s.key = case
        when y.status = 'cancelled' then 'stay_cancelled'
        when y.status = 'departed' or y.check_out <= now() then 'checked_out'
        when y.status in ('booked', 'in_stay') and now() >= y.check_in then 'checked_in'
        when y.status = 'held' then 'held'
        else 'booked'
      end
  ),

  /* ── experience days ────────────────────────────────────────────────── */
  x as (
    select p.*, cd.title as day_title, zz.id as zone_id, zz.name as zone_name
      from public.plan p
      left join public.curated_day cd on cd.id = p.curated_day_id
      left join lateral (
        select zf.id, zf.name
          from public.zone_for_point(extensions.st_x(p.stay_point::extensions.geometry),
                                     extensions.st_y(p.stay_point::extensions.geometry)) zf
         limit 1
      ) zz on p.stay_point is not null
     where p.status <> 'draft'
       and authz.can_see_plan(p.city_id)
       and (p.status not in ('completed', 'cancelled', 'expired')
            or (coalesce(p.completed_at, p.updated_at) >= (select s from span)
                and coalesce(p.completed_at, p.updated_at) < (select e from span)))
  ),
  x_rows as (
    select 'experience', x.id, x.reference,
           public.fn_ops_short_name(x.guest_name), coalesce(x.day_title, 'Custom day'),
           case when coalesce(x.quote_total_kes, x.estimate_total_kes) is not null
                then coalesce(x.quote_total_kes, x.estimate_total_kes) * 100 end,
           s.key, s.label, s.tone, s.bucket,
           (x.date::timestamp at time zone 'Africa/Nairobi'),
           ((coalesce(x.end_date, x.date) + 1)::timestamp at time zone 'Africa/Nairobi'),
           null::timestamptz, true,
           case when s.bucket in ('completed', 'cancelled') then coalesce(x.completed_at, x.updated_at) end,
           x.zone_id, x.zone_name, x.city_id,
           '/experiences/plans/' || x.id,
           case when x.stay_point is not null then extensions.st_y(x.stay_point::extensions.geometry) end,
           case when x.stay_point is not null then extensions.st_x(x.stay_point::extensions.geometry) end
      from x
      join st s on s.key = case
        when x.status = 'cancelled' then 'plan_cancelled'
        when x.status = 'expired' then 'plan_expired'
        when x.status = 'completed' then 'plan_completed'
        when x.status = 'in_progress' then 'on_the_day'
        when x.status in ('paid', 'approved')
             and x.date <= (select today from span)
             and coalesce(x.end_date, x.date) >= (select today from span) then 'on_the_day'
        when x.status = 'paid' then 'paid'
        when x.status = 'approved' then 'approved'
        when x.status = 'quoted' then 'quoted'
        when x.status in ('confirming', 'changes_requested') then 'confirming'
        else 'new_request'
      end
  ),

  /* ── service bookings ───────────────────────────────────────────────── */
  b as (
    select bk.*,
           coalesce(nullif(btrim(m.trading_name), ''), m.legal_name) as m_name,
           m.city_id as m_city,
           br.zone_id as br_zone, br.latitude as br_lat, br.longitude as br_lng,
           z.name as z_name
      from public.booking bk
      join public.merchant m on m.id = bk.merchant_id
      left join lateral (
        select mb.zone_id, mb.latitude, mb.longitude
          from public.merchant_branch mb
         where mb.merchant_id = bk.merchant_id and mb.deleted_at is null
         order by mb.is_primary desc, mb.created_at
         limit 1
      ) br on true
      left join public.zone z on z.id = br.zone_id
     where bk.status <> 'blocked'
       and ((select admin or orders from me) or authz.can_manage_merchants(m.city_id))
       and ((bk.status in ('pending', 'confirmed') and bk.ends_at > now() and bk.expired_at is null)
            or (bk.status in ('completed', 'confirmed') and bk.ends_at <= now()
                and bk.ends_at >= (select s from span) and bk.ends_at < (select e from span))
            or (bk.status in ('cancelled', 'no_show')
                and bk.updated_at >= (select s from span) and bk.updated_at < (select e from span))
            or (bk.status = 'pending' and bk.expired_at is not null
                and bk.expired_at >= (select s from span) and bk.expired_at < (select e from span)))
  ),
  b_rows as (
    select 'service', b.id, b.reference,
           public.fn_ops_short_name(b.guest_name), b.m_name, b.total_cents,
           s.key, s.label, s.tone, s.bucket,
           b.starts_at, b.ends_at, null::timestamptz, false,
           case s.key
             when 'booking_done' then b.ends_at
             when 'booking_expired' then b.expired_at
             when 'booking_cancelled' then b.updated_at
             when 'no_show' then b.updated_at
           end,
           b.br_zone, b.z_name, b.m_city,
           '/merchants/' || b.merchant_id,
           b.br_lat, b.br_lng
      from b
      join st s on s.key = case
        when b.status = 'cancelled' then 'booking_cancelled'
        when b.status = 'no_show' then 'no_show'
        when b.status = 'pending' and b.expired_at is not null then 'booking_expired'
        when b.status = 'completed' or b.ends_at <= now() then 'booking_done'
        when b.status = 'confirmed' and now() >= b.starts_at then 'in_progress'
        when b.status = 'confirmed' then 'booking_confirmed'
        else 'requested'
      end
  ),

  /* ── incidents ──────────────────────────────────────────────────────── */
  i as (
    select inc.*,
           r.city_id as r_city,
           btrim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')) as r_name,
           coalesce(nullif(btrim(m.trading_name), ''), m.legal_name) as m_name,
           gg.name as g_name
      from public.incident inc
      left join public.rider r on r.id = inc.rider_id
      left join public.merchant m on m.id = inc.merchant_id
      left join lateral (select g.name from public.guest g
                          where g.user_id = inc.guest_user_id limit 1) gg on true
     where (select admin or riders or live from me)
       and (inc.status in ('open', 'investigating')
            or (inc.resolved_at >= (select s from span) and inc.resolved_at < (select e from span)))
  ),
  i_rows as (
    select 'incident', i.id, 'INC-' || upper(left(replace(i.id::text, '-', ''), 6)),
           public.fn_ops_short_name(i.g_name),
           initcap(replace(i.kind::text, '_', ' '))
             || coalesce(' · ' || i.m_name, ' · ' || public.fn_ops_short_name(nullif(i.r_name, '')), ''),
           case when i.compensation_kes is not null then i.compensation_kes * 100 end,
           s.key, s.label, s.tone, s.bucket,
           i.happened_at, i.resolved_at, null::timestamptz, false,
           case when s.bucket = 'completed' then i.resolved_at end,
           null::uuid, null::text, i.r_city,
           '/riders/incidents/' || i.id,
           null::double precision, null::double precision
      from i
      join st s on s.key = case i.status::text
        when 'open' then 'incident_open'
        when 'investigating' then 'investigating'
        else 'incident_resolved'
      end
  ),

  /* ── disputes ───────────────────────────────────────────────────────── */
  d as (
    select dp.*,
           coalesce(nullif(btrim(m.trading_name), ''), m.legal_name) as m_name,
           m.city_id as m_city,
           gg.name as g_name
      from public.dispute dp
      left join public.merchant m on m.id = dp.merchant_id
      left join lateral (select g.name from public.guest g
                          where g.user_id = dp.guest_user_id limit 1) gg on true
     where (select admin or orders from me)
       and (dp.status in ('open', 'awaiting_merchant')
            or (dp.resolved_at >= (select s from span) and dp.resolved_at < (select e from span)))
  ),
  d_rows as (
    select 'dispute', d.id,
           coalesce(nullif(btrim(d.order_reference), ''),
                    'DSP-' || upper(left(replace(d.id::text, '-', ''), 6))),
           public.fn_ops_short_name(d.g_name), d.m_name,
           case when d.amount_claimed_kes is not null then d.amount_claimed_kes * 100 end,
           s.key, s.label, s.tone, s.bucket,
           d.opened_at, d.resolved_at, d.merchant_reply_due_at, false,
           case when s.bucket = 'completed' then d.resolved_at end,
           null::uuid, null::text, d.m_city,
           '/merchants?tab=disputes',
           null::double precision, null::double precision
      from d
      join st s on s.key = case d.status::text
        when 'open' then 'dispute_open'
        when 'awaiting_merchant' then 'awaiting_merchant'
        when 'chargeback' then 'chargeback'
        else 'dispute_resolved'
      end
  )
  select * from o_rows
  union all select * from y_rows
  union all select * from x_rows
  union all select * from b_rows
  union all select * from i_rows
  union all select * from d_rows;
$$;

-- ═══════════════════════════════════════════════════════════ the readers

/*
 * The figures above the table, the counts in its status bar, the filter
 * lists and the map. KPIs cover every kind; counts, statuses and points
 * follow the open tab.
 */
create or replace function public.rpc_operations_overview(
  p_from date,
  p_to date,
  p_tab text default 'all'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := authz.is_super_admin();
  v_orders boolean := v_admin or authz.reaches_module('orders') or authz.reaches_module('live_ops');
  v_stays boolean := v_orders or authz.reaches_module('hotels');
  v_incidents boolean := v_orders or authz.reaches_module('riders');
  v_kinds text[] := public.fn_ops_kinds(p_tab);
  v_days integer;
  v_s timestamptz;
  v_e timestamptz;
  v_ps timestamptz;
  v_kpis jsonb;
  v_rows jsonb;
begin
  if authz.staff_id() is null or not v_orders then
    raise exception 'Only people who reach Orders or Live operations can see this.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a period that starts before it ends.' using errcode = '22023';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Choose a period of 400 days or less.' using errcode = '22023';
  end if;
  if v_kinds is null then
    raise exception 'There is no such view.' using errcode = '22023';
  end if;

  v_days := p_to - p_from + 1;
  v_s := p_from::timestamp at time zone 'Africa/Nairobi';
  v_e := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';
  v_ps := v_s - make_interval(days => v_days);

  with days as (
    select d::date as d, row_number() over (order by d) as n
      from generate_series(p_from, p_to, interval '1 day') d
  ),
  /* Orders placed, per day, this period and the one before. */
  placed as (
    select (o.placed_at at time zone 'Africa/Nairobi')::date as d, count(*)::bigint as n
      from public.order o
     where v_orders and o.placed_at >= v_ps and o.placed_at < v_e
     group by 1
  ),
  /* Bookings made: stays, experience days, service bookings. */
  made as (
    select (sy.created_at at time zone 'Africa/Nairobi')::date as d
      from public.stay sy
     where v_stays and sy.status <> 'blocked' and sy.created_at >= v_ps and sy.created_at < v_e
    union all
    select (p.created_at at time zone 'Africa/Nairobi')::date
      from public.plan p
     where p.status <> 'draft' and authz.can_see_plan(p.city_id)
       and p.created_at >= v_ps and p.created_at < v_e
    union all
    select (bk.created_at at time zone 'Africa/Nairobi')::date
      from public.booking bk
      join public.merchant m on m.id = bk.merchant_id
     where bk.status <> 'blocked'
       and (v_orders or authz.can_manage_merchants(m.city_id))
       and bk.created_at >= v_ps and bk.created_at < v_e
  ),
  made_n as (select d, count(*)::bigint as n from made group by d),
  /* Deliveries finished, per day: orders with a rider marked delivered. */
  delivered as (
    select (o.delivered_at at time zone 'Africa/Nairobi')::date as d, count(*)::bigint as n
      from public.order o
     where v_orders and o.rider_id is not null
       and o.delivered_at >= v_ps and o.delivered_at < v_e
     group by 1
  ),
  /* New incidents and disputes, per day. */
  raised as (
    select (inc.happened_at at time zone 'Africa/Nairobi')::date as d
      from public.incident inc
     where v_incidents and inc.happened_at >= v_ps and inc.happened_at < v_e
    union all
    select (dp.opened_at at time zone 'Africa/Nairobi')::date
      from public.dispute dp
     where v_orders and dp.opened_at >= v_ps and dp.opened_at < v_e
  ),
  raised_n as (select d, count(*)::bigint as n from raised group by d),
  /* Guests in house at 22:00 each night, this period and the one before. */
  nights as (
    select d::date as d
      from generate_series(p_from - v_days, p_to, interval '1 day') d
  ),
  guests as (
    select n.d,
           coalesce((select sum(coalesce(sy.party_adults, 0) + coalesce(sy.party_children, 0))
                       from public.stay sy
                      where v_stays and sy.status in ('booked', 'in_stay', 'departed')
                        and sy.check_in <= ((n.d + time '22:00')::timestamp at time zone 'Africa/Nairobi')
                        and sy.check_out > ((n.d + time '22:00')::timestamp at time zone 'Africa/Nairobi')),
                    0)::bigint as n
      from nights n
  ),
  series as (
    select jsonb_build_object(
      'orders', jsonb_agg(coalesce((select p.n from placed p where p.d = days.d), 0) order by days.d),
      'bookings', jsonb_agg(coalesce((select m.n from made_n m where m.d = days.d), 0) order by days.d),
      'deliveries', jsonb_agg(coalesce((select x.n from delivered x where x.d = days.d), 0) order by days.d),
      'guests', jsonb_agg(coalesce((select g.n from guests g where g.d = days.d), 0) order by days.d),
      'incidents', jsonb_agg(coalesce((select r.n from raised_n r where r.d = days.d), 0) order by days.d)
    ) as j
      from days
  ),
  totals as (
    select
      (select coalesce(sum(n), 0) from placed where d >= p_from) as orders_now,
      (select coalesce(sum(n), 0) from placed where d < p_from) as orders_before,
      (select coalesce(sum(n), 0) from made_n where d >= p_from) as made_now,
      (select coalesce(sum(n), 0) from made_n where d < p_from) as made_before,
      (select coalesce(sum(n), 0) from delivered where d >= p_from) as delivered_now,
      (select coalesce(sum(n), 0) from delivered where d < p_from) as delivered_before,
      (select coalesce(avg(n), 0) from guests where d >= p_from) as guests_now,
      (select coalesce(avg(n), 0) from guests where d < p_from) as guests_before,
      (select coalesce(sum(n), 0) from raised_n where d >= p_from) as raised_now,
      (select coalesce(sum(n), 0) from raised_n where d < p_from) as raised_before,
      (select count(*) from public.order o
        where v_orders and o.rider_id is not null
          and o.stage not in ('delivered', 'cancelled', 'refunded')) as active_deliveries,
      (select coalesce(sum(coalesce(sy.party_adults, 0) + coalesce(sy.party_children, 0)), 0)
         from public.stay sy
        where v_stays and sy.status in ('booked', 'in_stay')
          and sy.check_in <= now() and sy.check_out > now()) as in_house,
      (select count(*) from public.incident inc
        where v_incidents and inc.status in ('open', 'investigating'))
      + (select count(*) from public.dispute dp
          where v_orders and dp.status in ('open', 'awaiting_merchant')) as open_incidents
  )
  select jsonb_build_object(
    'orders', jsonb_build_object(
      'value', case when v_orders then t.orders_now end,
      'delta', case when v_orders and t.orders_before > 0
                    then round((t.orders_now - t.orders_before) * 100.0 / t.orders_before, 1) end,
      'series', case when v_orders then s.j -> 'orders' else '[]'::jsonb end),
    'bookings', jsonb_build_object(
      'value', t.made_now,
      'delta', case when t.made_before > 0
                    then round((t.made_now - t.made_before) * 100.0 / t.made_before, 1) end,
      'series', s.j -> 'bookings'),
    'deliveries', jsonb_build_object(
      'value', case when v_orders then t.active_deliveries end,
      'delta', case when v_orders and t.delivered_before > 0
                    then round((t.delivered_now - t.delivered_before) * 100.0 / t.delivered_before, 1) end,
      'series', case when v_orders then s.j -> 'deliveries' else '[]'::jsonb end),
    'guests', jsonb_build_object(
      'value', case when v_stays then t.in_house end,
      'delta', case when v_stays and t.guests_before > 0
                    then round((t.guests_now - t.guests_before) * 100.0 / t.guests_before, 1) end,
      'series', case when v_stays then s.j -> 'guests' else '[]'::jsonb end),
    'incidents', jsonb_build_object(
      'value', case when v_incidents then t.open_incidents end,
      'delta', case when v_incidents and t.raised_before > 0
                    then round((t.raised_now - t.raised_before) * 100.0 / t.raised_before, 1) end,
      'series', case when v_incidents then s.j -> 'incidents' else '[]'::jsonb end))
    into v_kpis
    from totals t cross join series s;

  with r as (
    select * from public.fn_ops_rows(p_from, p_to) r where r.kind = any (v_kinds)
  )
  select jsonb_build_object(
    'buckets', jsonb_build_object(
      'ongoing', (select count(*) from r where bucket = 'ongoing'),
      'pending', (select count(*) from r where bucket = 'pending'),
      'completed', (select count(*) from r where bucket = 'completed'),
      'cancelled', (select count(*) from r where bucket = 'cancelled')),
    'statuses', (select coalesce(jsonb_agg(jsonb_build_object('key', x.status, 'label', x.status_label)
                                           order by x.status_label), '[]'::jsonb)
                   from (select distinct r.status, r.status_label from r) x),
    'points', (select coalesce(jsonb_agg(jsonb_build_object('kind', p.kind, 'lat', p.lat, 'lng', p.lng,
                                                            'label', p.ref || coalesce(' · ' || p.party, ''))),
                               '[]'::jsonb)
                 from (select * from r
                        where r.bucket in ('ongoing', 'pending') and r.lat is not null and r.lng is not null
                          and r.kind not in ('incident', 'dispute')
                        limit 200) p)
  ) into v_rows;

  return jsonb_build_object(
    'kpis', v_kpis,
    'buckets', v_rows -> 'buckets',
    'statuses', v_rows -> 'statuses',
    'points', v_rows -> 'points',
    'areas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', z.id,
               'name', z.name || case when (select count(distinct zz.city_id) from public.zone zz where zz.active) > 1
                                      then ' · ' || c.name else '' end)
             order by c.sort, z.name), '[]'::jsonb)
        from public.zone z
        join public.city c on c.id = z.city_id
       where z.active),
    'city', (
      select jsonb_build_object(
               'id', c.id, 'name', c.name,
               'lat', case when c.centre is not null then extensions.st_y(c.centre::extensions.geometry) end,
               'lng', case when c.centre is not null then extensions.st_x(c.centre::extensions.geometry) end)
        from public.city c
       where c.status = 'live'
       order by c.sort
       limit 1)
  );
end;
$$;

/*
 * One page of the Live Operations table. Ongoing and pending rows come
 * soonest first; completed and cancelled rows most recent first.
 */
create or replace function public.rpc_operations_list(
  p_from date,
  p_to date,
  p_tab text default 'all',
  p_bucket text default 'ongoing',
  p_kind text default null,
  p_status text default null,
  p_area text default null,
  p_q text default null,
  p_limit integer default 5,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kinds text[] := public.fn_ops_kinds(p_tab);
  v_area uuid;
  v_q text;
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 100);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 100000);
begin
  if authz.staff_id() is null
     or not (authz.is_super_admin() or authz.reaches_module('orders') or authz.reaches_module('live_ops')) then
    raise exception 'Only people who reach Orders or Live operations can see this.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a period that starts before it ends.' using errcode = '22023';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Choose a period of 400 days or less.' using errcode = '22023';
  end if;
  if v_kinds is null then
    raise exception 'There is no such view.' using errcode = '22023';
  end if;
  if coalesce(p_bucket, '') not in ('ongoing', 'pending', 'completed', 'cancelled') then
    raise exception 'Choose ongoing, pending, completed or cancelled.' using errcode = '22023';
  end if;
  if nullif(btrim(p_area), '') is not null then
    if btrim(p_area) !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'There is no such area.' using errcode = '22023';
    end if;
    v_area := btrim(p_area)::uuid;
  end if;
  if nullif(btrim(p_q), '') is not null then
    v_q := '%' || replace(replace(replace(left(btrim(p_q), 80), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return (
    with r as (
      select *
        from public.fn_ops_rows(p_from, p_to) r
       where r.kind = any (v_kinds)
         and r.bucket = p_bucket
         and (p_kind is null or r.kind = p_kind)
         and (p_status is null or r.status = p_status)
         and (v_area is null or r.area_id = v_area)
         and (v_q is null or r.ref ilike v_q or r.customer ilike v_q or r.party ilike v_q)
    ),
    page as (
      select r.*,
             row_number() over (
               order by
                 case when p_bucket in ('ongoing', 'pending') then coalesce(r.eta_at, r.starts_at) end asc nulls last,
                 case when p_bucket in ('completed', 'cancelled') then r.done_at end desc nulls last,
                 r.ref) as n
        from r
       order by n
       limit v_limit offset v_offset
    )
    select jsonb_build_object(
      'total', (select count(*) from r),
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'kind', p.kind, 'id', p.id, 'ref', p.ref, 'customer', p.customer, 'party', p.party,
                 'amount_cents', p.amount_cents, 'status', p.status, 'status_label', p.status_label,
                 'tone', p.tone, 'bucket', p.bucket, 'starts_at', p.starts_at, 'ends_at', p.ends_at,
                 'eta_at', p.eta_at, 'all_day', p.all_day, 'area', p.area, 'href', p.href)
               order by p.n)
          from page p), '[]'::jsonb))
  );
end;
$$;

-- ══════════════════════════════════════════════════════ raise incident

/*
 * Quick Actions → Raise Incident. rpc_incident_open (the rider app's SOS
 * path) takes whatever reporter type the caller names; this one is for
 * operations staff only, records them as the reporter, and links the
 * order's rider, merchant and guest when a reference is given.
 */
create or replace function public.rpc_ops_incident_raise(
  p_kind text,
  p_severity text,
  p_description text,
  p_order_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_text text := nullif(btrim(coalesce(p_description, '')), '');
  v_ref text := nullif(btrim(coalesce(p_order_reference, '')), '');
  v_order public.order;
  v_id uuid;
begin
  if v_staff is null
     or not (authz.is_super_admin() or authz.reaches_module('live_ops')
             or authz.reaches_module('orders') or authz.reaches_module('riders')) then
    raise exception 'Only operations staff can raise an incident here.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('accident', 'harassment', 'theft', 'guest_complaint',
                                      'rider_complaint', 'police_stop', 'breakdown', 'other') then
    raise exception 'Choose what happened.' using errcode = '22023';
  end if;
  if p_severity is null or p_severity not in ('minor', 'major', 'critical') then
    raise exception 'Choose how serious it is.' using errcode = '22023';
  end if;
  if v_text is null then
    raise exception 'Say what happened.' using errcode = '22023';
  end if;
  if length(v_text) > 1000 then
    raise exception 'Keep it under 1,000 characters.' using errcode = '22023';
  end if;

  if v_ref is not null then
    select * into v_order from public.order o where upper(o.reference) = upper(v_ref);
    if v_order.id is null then
      raise exception 'No order has the reference %.', v_ref using errcode = 'P0002';
    end if;
    if not (authz.is_super_admin() or authz.reaches_module('orders')
            or authz.works_live_ops(v_order.city_id)) then
      raise exception 'That order is in a city you do not work.' using errcode = '42501';
    end if;
  end if;

  insert into public.incident (
    kind, severity, status, reported_by_type, reported_by_id, rider_id, order_reference,
    merchant_id, guest_user_id, description)
  values (
    p_kind::public.incident_kind, p_severity::public.incident_severity, 'open', 'staff',
    (select auth.uid()), v_order.rider_id, v_order.reference, v_order.merchant_id,
    (select g.user_id from public.guest g where g.id = v_order.guest_id), v_text)
  returning id into v_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'riders', p_action => 'incident.opened',
    p_actor_id => v_staff,
    p_target_type => 'incident', p_target_id => v_id,
    p_target_label => coalesce(v_order.reference, replace(p_kind, '_', ' ')),
    p_after => jsonb_build_object('kind', p_kind, 'severity', p_severity,
                                  'order_reference', v_order.reference, 'from', 'operations'),
    p_severity => (case when p_severity = 'critical' then 'high' else 'notice' end)::public.audit_severity);

  return v_id;
end;
$$;

-- ═════════════════════════════════════════════════════════════ access

revoke execute on function
  public.fn_ops_rows(date, date),
  public.fn_ops_short_name(text),
  public.fn_ops_kinds(text)
  from public, anon, authenticated;

revoke execute on function
  public.rpc_operations_overview(date, date, text),
  public.rpc_operations_list(date, date, text, text, text, text, text, text, integer, integer),
  public.rpc_ops_incident_raise(text, text, text, text)
  from public, anon;

grant execute on function
  public.rpc_operations_overview(date, date, text),
  public.rpc_operations_list(date, date, text, text, text, text, text, text, integer, integer),
  public.rpc_ops_incident_raise(text, text, text, text)
  to authenticated, service_role;
