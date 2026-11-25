-- The admin Riders module, rebuilt from the owner's eight screens (25 Nov
-- 2026): Overview, All Riders, Onboarding & KYC, Availability & Zones,
-- Orders & Deliveries, Earnings & Payouts, Performance, Incidents & Disputes.
-- "As exactly as this, and very functional": every figure on those screens
-- is counted here from the rider tables; nothing is estimated.
--
-- What this adds:
--
-- 1. Case fields on public.incident, so an incident can also be a dispute:
--    case_type, priority, reason, sla_due_at, escalated_at, outcome. A
--    before-insert trigger fills them for rows written by the existing
--    writers (rpc_incident_open, rpc_ops_incident_raise), and on update it
--    gives a resolved case the outcome 'resolved' when its writer
--    (rpc_incident_resolve) sets none, so those keep working unchanged.
--    Existing rows are backfilled the same way.
-- 2. console_rider_facts(from, to): one row per rider with the figures the
--    screens share (state, zone, KYC, trips, on-time, acceptance, earnings,
--    latest payout, performance score). Internal: only the readers below
--    call it; nobody can execute it directly.
-- 3. Readers, one per screen, each returning jsonb and gated by
--    authz.reaches_module('riders'), riders filtered by authz.works_rider
--    (worked out once per query by console_my_riders):
--      rpc_console_riders_overview, rpc_console_riders_list (the rider tables
--      of Overview, All Riders, Earnings and Performance),
--      rpc_console_riders_onboarding, rpc_console_riders_availability,
--      rpc_console_riders_deliveries, rpc_console_riders_earnings,
--      rpc_console_riders_performance, rpc_console_riders_cases.
-- 4. Case writers: rpc_console_rider_case_open, rpc_console_rider_case_update,
--    rpc_console_rider_case_resolve, each audited.
--
-- No live coordinates are returned by any of these: the maps keep using
-- rpc_riders_live and rpc_live_order_points, as the live screen does.
--
-- Definitions the screens show (also in the page footnotes):
--   on time        delivered at or before the promised time;
--   delivery time  picked up → delivered, in minutes;
--   acceptance     accepted ÷ (accepted + declined + timed out) offers;
--   completion     delivered ÷ accepted offers;
--   performance    on time 40%, completion 30%, acceptance 20%, rating 10%,
--                  over the parts that have a figure; null when none has;
--   KYC verified   every required rider document that applies to the
--                  rider's vehicle has a current verified copy.
--
-- Rollback: drop the functions (console_my_riders and console_rider_facts
-- included) and the trigger, then drop the six incident
-- columns and delete the three audit.action_registry rows.

insert into audit.action_registry (action, module, default_severity, description) values
  ('rider_case.opened', 'riders', 'notice', 'Staff opened a rider incident or dispute case'),
  ('rider_case.updated', 'riders', 'notice', 'Staff assigned, started, escalated or re-prioritised a rider case'),
  ('rider_case.resolved', 'riders', 'notice', 'Staff resolved a rider case with an outcome')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ incidents become cases

alter table public.incident
  add column if not exists case_type text,
  add column if not exists priority text,
  add column if not exists reason text,
  add column if not exists sla_due_at timestamptz,
  add column if not exists escalated_at timestamptz,
  add column if not exists outcome text;

/* The kind an existing writer chose, read as a case type. */
create or replace function public.fn_incident_case_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.case_type := coalesce(new.case_type, case new.kind
    when 'guest_complaint' then 'rider_conduct'
    when 'rider_complaint' then 'customer_conduct'
    when 'other' then 'other'
    else 'safety' end);
  new.priority := coalesce(new.priority, case new.severity
    when 'critical' then 'urgent'
    when 'major' then 'high'
    else 'medium' end);
  new.sla_due_at := coalesce(new.sla_due_at, coalesce(new.created_at, now()) + case new.priority
    when 'urgent' then interval '1 hour'
    when 'high' then interval '4 hours'
    when 'medium' then interval '24 hours'
    else interval '72 hours' end);
  /* rpc_incident_resolve and the SOS flow close incidents without an
     outcome; a plain resolution is what they mean. */
  if new.status in ('resolved', 'closed') and new.outcome is null then
    new.outcome := 'resolved';
  end if;
  return new;
end;
$$;

drop trigger if exists incident_case_defaults on public.incident;
create trigger incident_case_defaults
  before insert or update on public.incident
  for each row execute function public.fn_incident_case_defaults();

update public.incident i set
  case_type = case i.kind
    when 'guest_complaint' then 'rider_conduct'
    when 'rider_complaint' then 'customer_conduct'
    when 'other' then 'other'
    else 'safety' end,
  priority = case i.severity
    when 'critical' then 'urgent'
    when 'major' then 'high'
    else 'medium' end
 where i.case_type is null or i.priority is null;

update public.incident i set
  sla_due_at = i.created_at + case i.priority
    when 'urgent' then interval '1 hour'
    when 'high' then interval '4 hours'
    when 'medium' then interval '24 hours'
    else interval '72 hours' end
 where i.sla_due_at is null;

update public.incident i set outcome = 'resolved'
 where i.status in ('resolved', 'closed') and i.outcome is null;

alter table public.incident
  alter column case_type set not null,
  alter column priority set not null,
  alter column sla_due_at set not null;

alter table public.incident drop constraint if exists incident_case_type_known;
alter table public.incident add constraint incident_case_type_known check (case_type in
  ('delivery_dispute', 'payment_earnings', 'customer_conduct', 'rider_conduct',
   'order_item', 'safety', 'other'));
alter table public.incident drop constraint if exists incident_priority_known;
alter table public.incident add constraint incident_priority_known check (priority in
  ('low', 'medium', 'high', 'urgent'));
alter table public.incident drop constraint if exists incident_reason_known;
alter table public.incident add constraint incident_reason_known check (reason is null or reason in
  ('late_delivery', 'wrong_or_missing_item', 'damaged_item', 'earnings_query',
   'customer_behaviour', 'rider_behaviour', 'safety', 'other'));
alter table public.incident drop constraint if exists incident_outcome_known;
alter table public.incident add constraint incident_outcome_known check (outcome is null or outcome in
  ('resolved', 'no_issue', 'compensated', 'penalized', 'unresolved'));
alter table public.incident drop constraint if exists incident_outcome_when_closed;
alter table public.incident add constraint incident_outcome_when_closed check (
  status not in ('resolved', 'closed') or outcome is not null);

create index if not exists incident_created_at_idx on public.incident (created_at desc);

-- ═══════════════════════════════════════════════════ shared rider facts

/* Nairobi midnights for a date range, the end exclusive. */
create or replace function public.fn_console_period(p_from date, p_to date)
returns table (start_at timestamptz, end_at timestamptz, prev_start timestamptz)
language sql
immutable
set search_path = ''
as $$
  select (p_from::timestamp at time zone 'Africa/Nairobi'),
         ((p_to + 1)::timestamp at time zone 'Africa/Nairobi'),
         ((p_from - (p_to - p_from + 1))::timestamp at time zone 'Africa/Nairobi');
$$;

/* The riders the signed-in staff member may see, worked out once per query
   instead of once per row. */
create or replace function public.console_my_riders()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id from public.rider r where authz.works_rider(r.id);
$$;

revoke all on function public.console_my_riders() from public, anon, authenticated;

create or replace function public.console_rider_facts(p_start timestamptz, p_end timestamptz)
returns table (
  rider_id uuid,
  name text,
  phone text,
  vehicle text,
  plate_no text,
  status text,
  presence text,
  bucket text,
  zone_id uuid,
  zone_name text,
  kyc text,
  docs_required integer,
  docs_verified integer,
  rating_avg numeric,
  rating_count integer,
  trips integer,
  trips_all integer,
  trips_today integer,
  timed integer,
  on_time integer,
  delivery_min numeric,
  offers_answered integer,
  offers_accepted integer,
  accept_sec numeric,
  cancelled integer,
  earned_kes bigint,
  earned_all_kes bigint,
  adjustments_kes bigint,
  payout_state text,
  payout_method text,
  payout_paid_at timestamptz,
  payable_cents bigint,
  last_active timestamptz,
  submitted_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz,
  background_check text,
  on_time_pct numeric,
  completion_pct numeric,
  acceptance_pct numeric,
  score numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select r.*,
           case
             when r.status = 'suspended' then 'suspended'
             when r.status = 'offboarded' then 'offboarded'
             when r.status <> 'active' then 'onboarding'
             when r.presence = 'on_trip' then 'on_trip'
             when r.presence in ('online', 'cooldown') then 'online'
             else 'offline'
           end as bucket
      from public.rider r
     where r.id in (select m from public.console_my_riders() m)
  )
  select
    b.id,
    trim(b.first_name || ' ' || b.last_name),
    b.phone,
    b.vehicle::text,
    b.plate_no,
    b.status::text,
    b.presence::text,
    b.bucket,
    z.id,
    z.name,
    case
      when d.rejected > 0 and d.verified < req.n then 'rejected'
      when req.n > 0 and d.verified >= req.n then 'verified'
      when d.docs > 0 then 'in_review'
      else 'not_started'
    end,
    req.n::integer,
    least(d.verified, req.n)::integer,
    g.avg_stars,
    coalesce(g.n, 0)::integer,
    coalesce(t.trips, 0)::integer,
    coalesce(ta.trips, 0)::integer,
    coalesce(t.today, 0)::integer,
    coalesce(t.timed, 0)::integer,
    coalesce(t.on_time, 0)::integer,
    t.delivery_min,
    coalesce(f.answered, 0)::integer,
    coalesce(f.accepted, 0)::integer,
    f.accept_sec,
    coalesce(t.cancelled, 0)::integer,
    coalesce(e.earned, 0)::bigint,
    coalesce(ea.earned, 0)::bigint,
    coalesce(adj.total, 0)::bigint,
    p.state,
    case when p.destination is not null then 'M-PESA' end,
    p.paid_at,
    coalesce(pend.cents, 0)::bigint,
    greatest(b.last_seen_at, b.presence_changed_at),
    b.submitted_at,
    b.activated_at,
    b.created_at,
    b.background_check ->> 'status',
    s.on_time_pct,
    s.completion_pct,
    s.acceptance_pct,
    case when s.weight > 0 then round(s.weighted / s.weight, 1) end
  from base b
  left join lateral (
    /* Where their last fix is; failing that, the zone of their latest
       presence event. */
    select zz.id, zz.name from (
      select z1.id, z1.name, 1 as pref, now() as at
        from public.zone z1
       where z1.city_id = b.city_id and b.last_location is not null
         and extensions.st_covers(z1.polygon, b.last_location)
      union all
      (select z2.id, z2.name, 2, pe.at
         from public.rider_presence_event pe
         join public.zone z2 on z2.id = pe.zone_id
        where pe.rider_id = b.id and pe.zone_id is not null
        order by pe.at desc limit 1)
    ) zz order by zz.pref, zz.at desc limit 1) z on true
  left join lateral (
    select count(*) as n
      from public.document_requirement dr
     where dr.owner_type = 'rider' and dr.required
       and (dr.applies_when = '{}'::jsonb
            or (dr.applies_when ? 'vehicle'
                and dr.applies_when -> 'vehicle' @> to_jsonb(b.vehicle::text)))) req on true
  left join lateral (
    select count(*) as docs,
           count(distinct doc.requirement_id) filter (where doc.status = 'verified') as verified,
           count(*) filter (where doc.status = 'rejected') as rejected
      from public.document doc
     where doc.owner_type = 'rider' and doc.owner_id = b.id and doc.superseded_at is null) d on true
  left join lateral (
    select round(avg(rr.stars)::numeric, 2) as avg_stars, count(*) as n
      from public.rider_rating rr where rr.rider_id = b.id) g on true
  left join lateral (
    select count(*) filter (where o.stage = 'delivered') as trips,
           count(*) filter (where o.stage = 'delivered'
             and (o.delivered_at at time zone 'Africa/Nairobi')::date
                 = (now() at time zone 'Africa/Nairobi')::date) as today,
           count(*) filter (where o.stage = 'delivered' and o.promised_delivery_at is not null) as timed,
           count(*) filter (where o.stage = 'delivered' and o.promised_delivery_at is not null
                              and o.delivered_at <= o.promised_delivery_at) as on_time,
           round(avg(extract(epoch from (o.delivered_at - o.picked_up_at)) / 60.0)
                 filter (where o.stage = 'delivered' and o.picked_up_at is not null)::numeric, 1)
             as delivery_min,
           count(*) filter (where o.stage = 'cancelled') as cancelled
      from public.order o
     where o.rider_id = b.id
       and coalesce(o.delivered_at, o.placed_at) >= p_start
       and coalesce(o.delivered_at, o.placed_at) < p_end) t on true
  left join lateral (
    select count(*) as trips from public.order o
     where o.rider_id = b.id and o.stage = 'delivered') ta on true
  left join lateral (
    select count(*) filter (where x.outcome in ('accepted', 'declined', 'timed_out')) as answered,
           count(*) filter (where x.outcome = 'accepted') as accepted,
           round(avg(extract(epoch from (x.responded_at - x.offered_at)))
                 filter (where x.outcome = 'accepted' and x.responded_at is not null)::numeric, 1)
             as accept_sec
      from dispatch.offer x
     where x.rider_id = b.id and x.offered_at >= p_start and x.offered_at < p_end) f on true
  left join lateral (
    select sum(re.total_kes) as earned from public.rider_earning re
     where re.rider_id = b.id and re.earned_at >= p_start and re.earned_at < p_end) e on true
  left join lateral (
    select sum(re.total_kes) as earned from public.rider_earning re where re.rider_id = b.id) ea on true
  left join lateral (
    select sum(ra.amount_kes) as total from public.rider_adjustment ra
     where ra.rider_id = b.id and ra.created_at >= p_start and ra.created_at < p_end) adj on true
  left join lateral (
    select rp.state, rp.destination, rp.paid_at
      from public.rider_payout rp
     where rp.rider_id = b.id and not rp.is_test
     order by rp.created_at desc limit 1) p on true
  left join lateral (
    select sum(rp.gross_cents) as cents from public.rider_payout rp
     where rp.rider_id = b.id and not rp.is_test and rp.state in ('held', 'sending')) pend on true
  cross join lateral (
    select
      case when coalesce(t.timed, 0) > 0 then round(100.0 * t.on_time / t.timed, 1) end as on_time_pct,
      case when coalesce(f.accepted, 0) > 0
           then least(100, round(100.0 * coalesce(t.trips, 0) / f.accepted, 1)) end as completion_pct,
      case when coalesce(f.answered, 0) > 0 then round(100.0 * f.accepted / f.answered, 1) end
        as acceptance_pct
  ) s0
  cross join lateral (
    select s0.on_time_pct, s0.completion_pct, s0.acceptance_pct,
           coalesce(0.4 * s0.on_time_pct, 0) + coalesce(0.3 * s0.completion_pct, 0)
             + coalesce(0.2 * s0.acceptance_pct, 0) + coalesce(0.1 * g.avg_stars * 20, 0) as weighted,
           (case when s0.on_time_pct is not null then 0.4 else 0 end)
             + (case when s0.completion_pct is not null then 0.3 else 0 end)
             + (case when s0.acceptance_pct is not null then 0.2 else 0 end)
             + (case when g.avg_stars is not null then 0.1 else 0 end) as weight
  ) s;
$$;

revoke all on function public.console_rider_facts(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.fn_console_period(date, date) from public, anon;
grant execute on function public.fn_console_period(date, date) to authenticated;

-- ═══════════════════════════════════════════════════════════ the list

/*
 * The rider tables of Overview, All Riders, Earnings & Payouts and
 * Performance. p_tab picks the rows (and the counts come back for every
 * tab); p_sort orders them; p_size up to 5000 serves Export.
 */
create or replace function public.rpc_console_riders_list(
  p_from date,
  p_to date,
  p_tab text default 'all',
  p_q text default null,
  p_zone uuid default null,
  p_vehicle text default null,
  p_kyc text default null,
  p_sort text default 'trips',
  p_page integer default 1,
  p_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_size integer := greatest(1, least(coalesce(p_size, 10), 5000));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_result jsonb;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a period of a year or less.' using errcode = 'invalid_parameter_value';
  end if;
  select start_at, end_at into v_start, v_end from public.fn_console_period(p_from, p_to);

  with f as (
    select * from public.console_rider_facts(v_start, v_end) x
     where x.bucket <> 'onboarding'
  ),
  filtered as (
    select * from f
     where (v_q is null
            or lower(f.name) like '%' || v_q || '%'
            or f.phone like '%' || v_q || '%'
            or lower(coalesce(f.plate_no, '')) like '%' || v_q || '%'
            or lower(coalesce(f.zone_name, '')) like '%' || v_q || '%'
            or upper(right(f.rider_id::text, 8)) like '%' || upper(v_q) || '%')
       and (p_zone is null or f.zone_id = p_zone)
       and (p_vehicle is null or f.vehicle = p_vehicle)
       and (p_kyc is null or f.kyc = p_kyc)
  ),
  tabbed as (
    select * from filtered x
     where case coalesce(p_tab, 'all')
             when 'all' then true
             when 'online' then x.bucket = 'online'
             when 'on_trip' then x.bucket = 'on_trip'
             when 'offline' then x.bucket = 'offline'
             when 'suspended' then x.bucket = 'suspended'
             when 'top' then x.score is not null
             when 'needs_improvement' then x.score is not null and x.score < 85
             when 'paid' then x.payout_state = 'paid'
             when 'pending' then x.payout_state in ('held', 'sending')
             when 'failed' then x.payout_state = 'failed'
             else true
           end
  ),
  ordered as (
    select x.*, row_number() over (order by
      case when p_sort = 'name' then x.name end asc,
      case when p_sort = 'earned' then x.earned_kes end desc nulls last,
      case when p_sort = 'score' or p_tab = 'top' then x.score end desc nulls last,
      case when p_tab = 'needs_improvement' then x.score end asc nulls last,
      case when p_sort = 'rating' then x.rating_avg end desc nulls last,
      case when p_sort = 'last_active' then x.last_active end desc nulls last,
      x.trips desc, x.name asc) as rn
      from tabbed x
  )
  select jsonb_build_object(
    'total', (select count(*) from tabbed),
    'page', v_page,
    'size', v_size,
    'counts', jsonb_build_object(
      'all', (select count(*) from filtered),
      'online', (select count(*) from filtered where bucket = 'online'),
      'on_trip', (select count(*) from filtered where bucket = 'on_trip'),
      'offline', (select count(*) from filtered where bucket = 'offline'),
      'suspended', (select count(*) from filtered where bucket = 'suspended'),
      'top', (select count(*) from filtered where score is not null),
      'needs_improvement', (select count(*) from filtered where score is not null and score < 85),
      'paid', (select count(*) from filtered where payout_state = 'paid'),
      'pending', (select count(*) from filtered where payout_state in ('held', 'sending')),
      'failed', (select count(*) from filtered where payout_state = 'failed'),
      'rating_avg', (select round(avg(rating_avg), 2) from filtered where rating_avg is not null)),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.rn)
        from ordered o
       where o.rn > (v_page - 1) * v_size and o.rn <= v_page * v_size), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name) order by z.name)
        from public.zone z where z.active), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ═══════════════════════════════════════════════════════════ overview

create or replace function public.rpc_console_riders_overview(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  v_mine uuid[];
  v_start timestamptz;
  v_end timestamptz;
  v_prev timestamptz;
  v_today_start timestamptz := ((now() at time zone 'Africa/Nairobi')::date)::timestamp
                                 at time zone 'Africa/Nairobi';
  v_result jsonb;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a period of a year or less.' using errcode = 'invalid_parameter_value';
  end if;
  select start_at, end_at, prev_start into v_start, v_end, v_prev
    from public.fn_console_period(p_from, p_to);
  v_mine := array(select public.console_my_riders());

  with riders as (
    select r.* from public.rider r where r.id = any(v_mine)
  ),
  orders as (
    select o.* from public.order o
      join riders r on r.id = o.rider_id
  ),
  per as (
    select
      count(*) filter (where o.stage = 'delivered' and o.delivered_at >= v_start and o.delivered_at < v_end) as done,
      count(*) filter (where o.stage = 'delivered' and o.delivered_at >= v_prev and o.delivered_at < v_start) as done_prev,
      count(*) filter (where o.stage = 'delivered' and o.promised_delivery_at is not null
                         and o.delivered_at >= v_start and o.delivered_at < v_end) as timed,
      count(*) filter (where o.stage = 'delivered' and o.delivered_at <= o.promised_delivery_at
                         and o.delivered_at >= v_start and o.delivered_at < v_end) as on_time,
      count(*) filter (where o.stage = 'delivered' and o.promised_delivery_at is not null
                         and o.delivered_at >= v_prev and o.delivered_at < v_start) as timed_prev,
      count(*) filter (where o.stage = 'delivered' and o.delivered_at <= o.promised_delivery_at
                         and o.delivered_at >= v_prev and o.delivered_at < v_start) as on_time_prev,
      avg(extract(epoch from (o.delivered_at - o.picked_up_at)) / 60.0)
        filter (where o.stage = 'delivered' and o.picked_up_at is not null
                  and o.delivered_at >= v_start and o.delivered_at < v_end) as minutes,
      avg(extract(epoch from (o.delivered_at - o.picked_up_at)) / 60.0)
        filter (where o.stage = 'delivered' and o.picked_up_at is not null
                  and o.delivered_at >= v_prev and o.delivered_at < v_start) as minutes_prev,
      count(*) filter (where o.stage in ('confirmed', 'preparing', 'ready', 'picked_up', 'arriving')) as in_progress,
      count(*) filter (where o.stage = 'delivered' and o.delivered_at >= v_today_start) as done_today
      from orders o
  ),
  paid as (
    select
      coalesce(sum(p.net_cents) filter (where p.paid_at >= v_start and p.paid_at < v_end), 0) as now_c,
      coalesce(sum(p.net_cents) filter (where p.paid_at >= v_prev and p.paid_at < v_start), 0) as prev_c
      from public.rider_payout p
      join riders r on r.id = p.rider_id
     where p.state = 'paid' and not p.is_test
  ),
  buckets as (
    select
      count(*) filter (where r.status = 'active') as active,
      count(*) filter (where r.status = 'active' and r.activated_at < v_start) as active_prev,
      count(*) filter (where r.status in ('active', 'suspended')) as total,
      count(*) filter (where r.status in ('active', 'suspended') and r.created_at < v_start) as total_prev,
      count(*) filter (where r.status = 'active' and r.presence in ('online', 'cooldown')) as online,
      count(*) filter (where r.status = 'active' and r.presence = 'on_trip') as on_trip,
      count(*) filter (where r.status = 'active' and r.presence = 'offline') as offline,
      count(*) filter (where r.status = 'suspended') as suspended
      from riders r
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'active', b.active, 'active_prev', b.active_prev,
      'total', b.total, 'total_prev', b.total_prev,
      'completed', per.done, 'completed_prev', per.done_prev,
      'on_time_pct', case when per.timed > 0 then round(100.0 * per.on_time / per.timed, 1) end,
      'on_time_pct_prev', case when per.timed_prev > 0 then round(100.0 * per.on_time_prev / per.timed_prev, 1) end,
      'delivery_min', round(per.minutes::numeric, 1),
      'delivery_min_prev', round(per.minutes_prev::numeric, 1),
      'payouts_cents', paid.now_c, 'payouts_cents_prev', paid.prev_c),
    'status', jsonb_build_object('online', b.online, 'on_trip', b.on_trip,
                                 'offline', b.offline, 'suspended', b.suspended),
    'today', jsonb_build_object(
      'in_progress', per.in_progress,
      'completed', per.done_today,
      'open_cases', (select count(*) from public.incident i
                      where i.status in ('open', 'investigating')
                        and (i.rider_id is null or i.rider_id = any(v_mine)))),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'trips', coalesce(c.n, 0)) order by d.day)
        from generate_series(p_from, p_to, interval '1 day') as d(day)
        left join lateral (
          select count(*) as n from orders o
           where o.stage = 'delivered'
             and (o.delivered_at at time zone 'Africa/Nairobi')::date = d.day::date) c on true),
      '[]'::jsonb),
    'top', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.trips desc, t.name)
        from (select * from public.console_rider_facts(v_start, v_end) x
               where x.trips > 0 order by x.trips desc, x.name limit 3) t), '[]'::jsonb)
  ) into v_result
  from per, paid, buckets b;

  return v_result;
end;
$$;

-- ══════════════════════════════════════════════════════ onboarding & KYC

create or replace function public.rpc_console_riders_onboarding(
  p_from date,
  p_to date,
  p_tab text default 'all',
  p_q text default null,
  p_zone uuid default null,
  p_vehicle text default null,
  p_kyc text default null,
  p_page integer default 1,
  p_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  v_mine uuid[];
  v_start timestamptz;
  v_end timestamptz;
  v_prev timestamptz;
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_size integer := greatest(1, least(coalesce(p_size, 10), 5000));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_result jsonb;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a period of a year or less.' using errcode = 'invalid_parameter_value';
  end if;
  select start_at, end_at, prev_start into v_start, v_end, v_prev
    from public.fn_console_period(p_from, p_to);
  v_mine := array(select public.console_my_riders());

  with f as (
    select x.*,
           case
             when x.status = 'active' or x.activated_at is not null then 'activated'
             when x.status = 'offboarded' then 'rejected'
             when x.background_check = 'clear' then 'approved'
             else 'pending_review'
           end as stage
      from public.console_rider_facts(v_start, v_end) x
  ),
  applied as (
    select * from f
     where coalesce(f.submitted_at, f.created_at) >= v_start
       and coalesce(f.submitted_at, f.created_at) < v_end
  ),
  filtered as (
    select * from applied a
     where (v_q is null
            or lower(a.name) like '%' || v_q || '%'
            or a.phone like '%' || v_q || '%'
            or upper(right(a.rider_id::text, 8)) like '%' || upper(v_q) || '%')
       and (p_zone is null or a.zone_id = p_zone)
       and (p_vehicle is null or a.vehicle = p_vehicle)
       and (p_kyc is null or a.kyc = p_kyc)
  ),
  tabbed as (
    select * from filtered x
     where case coalesce(p_tab, 'all')
             when 'pending' then x.stage = 'pending_review'
             when 'approved' then x.stage in ('approved', 'activated')
             when 'rejected' then x.stage = 'rejected'
             else true
           end
  ),
  ordered as (
    select x.*, row_number() over (order by coalesce(x.submitted_at, x.created_at) desc, x.name) as rn
      from tabbed x
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'applications', (select count(*) from applied),
      'applications_prev', (select count(*) from public.rider r
                             where r.id = any(v_mine)
                               and coalesce(r.submitted_at, r.created_at) >= v_prev
                               and coalesce(r.submitted_at, r.created_at) < v_start),
      'kyc_verified', (select count(*) from applied where kyc = 'verified'),
      'approved', (select count(*) from applied where stage in ('approved', 'activated')),
      'activated', (select count(*) from applied where stage = 'activated'),
      'pending', (select count(*) from applied where stage = 'pending_review'),
      'rejected', (select count(*) from applied where stage = 'rejected')),
    'kyc_by_document', coalesce((
      select jsonb_agg(jsonb_build_object(
               'kind', dr.kind, 'label', dr.label,
               'needed', k.needed, 'verified', k.verified) order by dr.sort)
        from public.document_requirement dr
        cross join lateral (
          select count(*) as needed,
                 count(*) filter (where exists (
                   select 1 from public.document doc
                    where doc.owner_type = 'rider' and doc.owner_id = a.rider_id
                      and doc.requirement_id = dr.id and doc.superseded_at is null
                      and doc.status = 'verified')) as verified
            from applied a
           where dr.applies_when = '{}'::jsonb
              or (dr.applies_when ? 'vehicle'
                  and dr.applies_when -> 'vehicle' @> to_jsonb(a.vehicle))) k
       where dr.owner_type = 'rider' and dr.required), '[]'::jsonb),
    'documents', jsonb_build_object(
      'uploaded', (select count(*) from public.document doc
                    where doc.owner_type = 'rider' and doc.superseded_at is null
                      and doc.status = 'uploaded' and doc.owner_id = any(v_mine)),
      'verified', (select count(*) from public.document doc
                    where doc.owner_type = 'rider' and doc.status = 'verified'
                      and doc.reviewed_at >= v_start and doc.reviewed_at < v_end
                      and doc.owner_id = any(v_mine)),
      'rejected', (select count(*) from public.document doc
                    where doc.owner_type = 'rider' and doc.status = 'rejected'
                      and doc.reviewed_at >= v_start and doc.reviewed_at < v_end
                      and doc.owner_id = any(v_mine))),
    'recent', coalesce((
      select jsonb_agg(q.v order by q.at desc) from (
        select jsonb_build_object(
                 'rider_id', r.id, 'name', trim(r.first_name || ' ' || r.last_name),
                 'what', case doc.status when 'verified' then 'verified' else 'rejected' end,
                 'document', dr.label, 'at', doc.reviewed_at) as v,
               doc.reviewed_at as at
          from public.document doc
          join public.rider r on r.id = doc.owner_id
          join public.document_requirement dr on dr.id = doc.requirement_id
         where doc.owner_type = 'rider' and doc.status in ('verified', 'rejected')
           and doc.reviewed_at is not null and r.id = any(v_mine)
        union all
        select jsonb_build_object(
                 'rider_id', r.id, 'name', trim(r.first_name || ' ' || r.last_name),
                 'what', 'activated', 'document', null, 'at', r.activated_at),
               r.activated_at
          from public.rider r
         where r.activated_at is not null and r.id = any(v_mine)
         order by 2 desc
         limit 6) q), '[]'::jsonb),
    'total', (select count(*) from tabbed),
    'counts', jsonb_build_object(
      'all', (select count(*) from filtered),
      'pending', (select count(*) from filtered where stage = 'pending_review'),
      'approved', (select count(*) from filtered where stage in ('approved', 'activated')),
      'rejected', (select count(*) from filtered where stage = 'rejected')),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.rn)
        from ordered o
       where o.rn > (v_page - 1) * v_size and o.rn <= v_page * v_size), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name) order by z.name)
        from public.zone z where z.active), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ══════════════════════════════════════════════════ availability & zones

create or replace function public.rpc_console_riders_availability(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  v_mine uuid[];
  v_start timestamptz;
  v_end timestamptz;
  v_prev timestamptz;
  v_result jsonb;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a period of a year or less.' using errcode = 'invalid_parameter_value';
  end if;
  select start_at, end_at, prev_start into v_start, v_end, v_prev
    from public.fn_console_period(p_from, p_to);
  v_mine := array(select public.console_my_riders());

  with f as (
    select * from public.console_rider_facts(v_start, v_end) x
     where x.bucket in ('online', 'on_trip', 'offline')
  ),
  zones as (
    select z.* from public.zone z
  ),
  per_zone as (
    select z.id, z.name, z.active, z.tier::text as tier,
           count(f.rider_id) filter (where f.bucket in ('online', 'on_trip')) as online,
           count(f.rider_id) filter (where f.bucket = 'online') as available,
           count(f.rider_id) filter (where f.bucket = 'on_trip') as on_trip,
           count(f.rider_id) as total
      from zones z
      left join f on f.zone_id = z.id
     group by z.id, z.name, z.active, z.tier
  ),
  jobs as (
    select j.* from dispatch.job j
     where j.started_at >= v_start and j.started_at < v_end
  ),
  jobs_prev as (
    select j.* from dispatch.job j
     where j.started_at >= v_prev and j.started_at < v_start
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'online', (select count(*) from f where bucket in ('online', 'on_trip')),
      'on_trip', (select count(*) from f where bucket = 'on_trip'),
      'available', (select count(*) from f where bucket = 'online'),
      'offline', (select count(*) from f where bucket = 'offline'),
      'riders', (select count(*) from f),
      'zones', (select count(*) from zones where active),
      'zones_covered', (select count(*) from per_zone where active and online > 0)),
    'by_zone', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'name', p.name, 'active', p.active, 'tier', p.tier,
               'online', p.online, 'available', p.available,
               'on_trip', p.on_trip, 'total', p.total)
             order by p.active desc, p.online desc, p.name)
        from per_zone p), '[]'::jsonb),
    'unzoned', (select count(*) from f where zone_id is null),
    'coverage', jsonb_build_object(
      'accept_sec', (select round(avg(extract(epoch from (x.responded_at - x.offered_at)))::numeric, 1)
                       from dispatch.offer x
                      where x.outcome = 'accepted' and x.responded_at is not null
                        and x.offered_at >= v_start and x.offered_at < v_end),
      'accept_sec_prev', (select round(avg(extract(epoch from (x.responded_at - x.offered_at)))::numeric, 1)
                       from dispatch.offer x
                      where x.outcome = 'accepted' and x.responded_at is not null
                        and x.offered_at >= v_prev and x.offered_at < v_start),
      'pickup_min', (select round(avg(extract(epoch from (j.at_pickup_at - j.assigned_at)) / 60.0)::numeric, 1)
                       from jobs j where j.at_pickup_at is not null and j.assigned_at is not null),
      'pickup_min_prev', (select round(avg(extract(epoch from (j.at_pickup_at - j.assigned_at)) / 60.0)::numeric, 1)
                       from jobs_prev j where j.at_pickup_at is not null and j.assigned_at is not null),
      'delivery_min', (select round(avg(extract(epoch from (o.delivered_at - o.picked_up_at)) / 60.0)::numeric, 1)
                         from public.order o
                        where o.rider_id is not null and o.stage = 'delivered' and o.picked_up_at is not null
                          and o.delivered_at >= v_start and o.delivered_at < v_end),
      'delivery_min_prev', (select round(avg(extract(epoch from (o.delivered_at - o.picked_up_at)) / 60.0)::numeric, 1)
                         from public.order o
                        where o.rider_id is not null and o.stage = 'delivered' and o.picked_up_at is not null
                          and o.delivered_at >= v_prev and o.delivered_at < v_start)),
    'shifts', jsonb_build_object(
      'all', (select count(*) from public.shift_commitment s
               where s.date between p_from and p_to and s.rider_id = any(v_mine)),
      'morning', (select count(*) from public.shift_commitment s
               where s.date between p_from and p_to and s.time_window = 'morning' and s.rider_id = any(v_mine)),
      'lunch', (select count(*) from public.shift_commitment s
               where s.date between p_from and p_to and s.time_window = 'lunch' and s.rider_id = any(v_mine)),
      'dinner', (select count(*) from public.shift_commitment s
               where s.date between p_from and p_to and s.time_window = 'dinner' and s.rider_id = any(v_mine)),
      'late', (select count(*) from public.shift_commitment s
               where s.date between p_from and p_to and s.time_window = 'late' and s.rider_id = any(v_mine)),
      'showed', (select count(*) from public.shift_commitment s
               where s.date between p_from and p_to and s.status = 'showed' and s.rider_id = any(v_mine)),
      'no_show', (select count(*) from public.shift_commitment s
               where s.date between p_from and p_to and s.status = 'no_show' and s.rider_id = any(v_mine)))
  ) into v_result;

  return v_result;
end;
$$;

-- ═════════════════════════════════════════════════ orders & deliveries

create or replace function public.rpc_console_riders_deliveries(
  p_from date,
  p_to date,
  p_tab text default 'all',
  p_q text default null,
  p_zone uuid default null,
  p_page integer default 1,
  p_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  v_mine uuid[];
  v_start timestamptz;
  v_end timestamptz;
  v_prev timestamptz;
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_size integer := greatest(1, least(coalesce(p_size, 10), 5000));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_result jsonb;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a period of a year or less.' using errcode = 'invalid_parameter_value';
  end if;
  select start_at, end_at, prev_start into v_start, v_end, v_prev
    from public.fn_console_period(p_from, p_to);
  v_mine := array(select public.console_my_riders());

  /* A delivery is an order NexG dispatched: it has a dispatch job. */
  with d as (
    select o.id, o.reference, o.stage::text as stage, o.placed_at, o.picked_up_at,
           o.delivered_at, o.promised_delivery_at, o.total_cents, o.rider_id,
           m.trading_name as merchant, m.category::text as category,
           split_part(trim(coalesce(g.name, '')), ' ', 1) as customer,
           trim(r.first_name || ' ' || left(r.last_name, 1) || '.') as rider,
           j.zone_id, z.name as zone, j.at_pickup_at, j.assigned_at,
           case
             when o.stage = 'delivered' then 'delivered'
             when o.stage in ('picked_up', 'arriving') then 'in_transit'
             when o.stage in ('cancelled', 'refunded', 'disputed') then 'failed'
             else 'pending_pickup'
           end as bucket
      from public.order o
      join lateral (
        select jj.* from dispatch.job jj where jj.order_id = o.id
         order by jj.started_at desc limit 1) j on true
      left join public.merchant m on m.id = o.merchant_id
      left join public.guest g on g.id = o.guest_id
      left join public.rider r on r.id = o.rider_id
      left join public.zone z on z.id = j.zone_id
     where o.placed_at >= v_prev and o.placed_at < v_end
       and (o.rider_id is null or o.rider_id = any(v_mine))
  ),
  cur as (select * from d where d.placed_at >= v_start),
  prev as (select * from d where d.placed_at < v_start),
  filtered as (
    select * from cur c
     where (v_q is null
            or lower(c.reference) like '%' || v_q || '%'
            or lower(coalesce(c.merchant, '')) like '%' || v_q || '%'
            or lower(coalesce(c.rider, '')) like '%' || v_q || '%'
            or lower(coalesce(c.customer, '')) like '%' || v_q || '%')
       and (p_zone is null or c.zone_id = p_zone)
  ),
  tabbed as (
    select * from filtered x where coalesce(p_tab, 'all') = 'all' or x.bucket = p_tab
  ),
  ordered as (
    select x.*, row_number() over (order by x.placed_at desc) as rn from tabbed x
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from cur),
      'total_prev', (select count(*) from prev),
      'delivered', (select count(*) from cur where bucket = 'delivered'),
      'in_transit', (select count(*) from cur where bucket = 'in_transit'),
      'pending_pickup', (select count(*) from cur where bucket = 'pending_pickup'),
      'failed', (select count(*) from cur where bucket = 'failed'),
      'delivery_min', (select round(avg(extract(epoch from (delivered_at - picked_up_at)) / 60.0)::numeric, 1)
                         from cur where bucket = 'delivered' and picked_up_at is not null),
      'delivery_min_prev', (select round(avg(extract(epoch from (delivered_at - picked_up_at)) / 60.0)::numeric, 1)
                         from prev where bucket = 'delivered' and picked_up_at is not null),
      'pickup_min', (select round(avg(extract(epoch from (at_pickup_at - assigned_at)) / 60.0)::numeric, 1)
                       from cur where at_pickup_at is not null and assigned_at is not null),
      'on_time_pct', (select case when count(*) filter (where promised_delivery_at is not null) > 0
                                  then round(100.0 * count(*) filter (where delivered_at <= promised_delivery_at)
                                             / count(*) filter (where promised_delivery_at is not null), 1) end
                        from cur where bucket = 'delivered'),
      'on_time_pct_prev', (select case when count(*) filter (where promised_delivery_at is not null) > 0
                                  then round(100.0 * count(*) filter (where delivered_at <= promised_delivery_at)
                                             / count(*) filter (where promised_delivery_at is not null), 1) end
                        from prev where bucket = 'delivered')),
    'funnel', jsonb_build_object(
      'orders', (select count(*) from cur),
      'picked_up', (select count(*) from cur where picked_up_at is not null),
      'in_transit', (select count(*) from cur where picked_up_at is not null and bucket in ('in_transit', 'delivered')),
      'delivered', (select count(*) from cur where bucket = 'delivered')),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', dd.day, 'orders', coalesce(c.n, 0)) order by dd.day)
        from generate_series(p_from, p_to, interval '1 day') as dd(day)
        left join lateral (
          select count(*) as n from cur
           where (cur.placed_at at time zone 'Africa/Nairobi')::date = dd.day::date) c on true),
      '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'reference', x.reference, 'bucket', x.bucket, 'rider', x.rider,
               'delivered_at', x.delivered_at, 'picked_up_at', x.picked_up_at,
               'promised_delivery_at', x.promised_delivery_at) order by x.at desc)
        from (select c.*, coalesce(c.delivered_at, c.picked_up_at) as at from cur c
               where c.bucket in ('delivered', 'in_transit')
               order by coalesce(c.delivered_at, c.picked_up_at) desc limit 4) x), '[]'::jsonb),
    'total', (select count(*) from tabbed),
    'counts', jsonb_build_object(
      'all', (select count(*) from filtered),
      'delivered', (select count(*) from filtered where bucket = 'delivered'),
      'in_transit', (select count(*) from filtered where bucket = 'in_transit'),
      'pending_pickup', (select count(*) from filtered where bucket = 'pending_pickup'),
      'failed', (select count(*) from filtered where bucket = 'failed')),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'reference', o.reference, 'customer', o.customer,
               'merchant', o.merchant, 'category', o.category, 'rider_id', o.rider_id,
               'rider', o.rider, 'zone', o.zone, 'total_cents', o.total_cents,
               'stage', o.stage, 'bucket', o.bucket, 'placed_at', o.placed_at,
               'picked_up_at', o.picked_up_at, 'delivered_at', o.delivered_at,
               'promised_delivery_at', o.promised_delivery_at) order by o.rn)
        from ordered o
       where o.rn > (v_page - 1) * v_size and o.rn <= v_page * v_size), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object('id', z.id, 'name', z.name) order by z.name)
        from public.zone z where z.active), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ═════════════════════════════════════════════════ earnings & payouts

create or replace function public.rpc_console_riders_earnings(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  v_mine uuid[];
  v_start timestamptz;
  v_end timestamptz;
  v_prev timestamptz;
  v_result jsonb;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a period of a year or less.' using errcode = 'invalid_parameter_value';
  end if;
  select start_at, end_at, prev_start into v_start, v_end, v_prev
    from public.fn_console_period(p_from, p_to);
  v_mine := array(select public.console_my_riders());

  with fees as (
    select
      coalesce(sum(o.delivery_fee_cents) filter (where o.delivered_at >= v_start), 0) as now_c,
      coalesce(sum(o.delivery_fee_cents) filter (where o.delivered_at < v_start), 0) as prev_c
      from public.order o
     where o.stage = 'delivered' and o.rider_id is not null
       and o.delivered_at >= v_prev and o.delivered_at < v_end
       and o.rider_id = any(v_mine)
  ),
  earn as (
    select
      coalesce(sum(e.total_kes) filter (where e.earned_at >= v_start), 0) as total,
      coalesce(sum(e.total_kes) filter (where e.earned_at < v_start), 0) as total_prev,
      coalesce(sum(e.base_kes + e.distance_kes + e.waiting_kes) filter (where e.earned_at >= v_start), 0) as trip_pay,
      coalesce(sum(e.peak_bonus_kes) filter (where e.earned_at >= v_start), 0) as bonuses,
      coalesce(sum(e.tip_kes) filter (where e.earned_at >= v_start), 0) as tips
      from public.rider_earning e
     where e.earned_at >= v_prev and e.earned_at < v_end
       and e.rider_id = any(v_mine)
  ),
  adj as (
    select coalesce(sum(a.amount_kes), 0) as total
      from public.rider_adjustment a
     where a.created_at >= v_start and a.created_at < v_end and a.rider_id = any(v_mine)
  ),
  pay as (
    select
      coalesce(sum(p.net_cents) filter (where p.state = 'paid' and p.paid_at >= v_start and p.paid_at < v_end), 0) as paid,
      coalesce(sum(p.net_cents) filter (where p.state = 'paid' and p.paid_at >= v_prev and p.paid_at < v_start), 0) as paid_prev,
      coalesce(sum(p.gross_cents) filter (where p.state in ('held', 'sending')), 0) as pending,
      count(distinct p.rider_id) filter (where p.state in ('held', 'sending')) as pending_riders,
      coalesce(sum(p.gross_cents) filter (where p.state = 'failed' and p.created_at >= v_start and p.created_at < v_end), 0) as failed,
      min(p.slot_at) filter (where p.state = 'held' and p.slot_at > now()) as next_run
      from public.rider_payout p
     where not p.is_test and p.rider_id = any(v_mine)
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'fees_cents', fees.now_c, 'fees_cents_prev', fees.prev_c,
      'rider_kes', earn.total, 'rider_kes_prev', earn.total_prev,
      'paid_cents', pay.paid, 'paid_cents_prev', pay.paid_prev,
      'pending_cents', pay.pending, 'pending_riders', pay.pending_riders,
      'failed_cents', pay.failed, 'next_run', pay.next_run),
    'breakdown', jsonb_build_object(
      'trip_pay_kes', earn.trip_pay, 'bonuses_kes', earn.bonuses,
      'tips_kes', earn.tips, 'adjustments_kes', adj.total),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', dd.day, 'kes', coalesce(c.kes, 0)) order by dd.day)
        from generate_series(p_from, p_to, interval '1 day') as dd(day)
        left join lateral (
          select sum(e.total_kes) as kes from public.rider_earning e
           where (e.earned_at at time zone 'Africa/Nairobi')::date = dd.day::date
             and e.rider_id = any(v_mine)) c on true), '[]'::jsonb),
    'frequency', (select p.mode from public.rider_payout p
                   where not p.is_test and p.created_at >= v_start - interval '60 days'
                   group by p.mode order by count(*) desc limit 1),
    'recent_runs', coalesce((
      select jsonb_agg(jsonb_build_object('day', x.day, 'cents', x.cents, 'riders', x.riders) order by x.day desc)
        from (select (p.paid_at at time zone 'Africa/Nairobi')::date as day,
                     sum(p.net_cents) as cents, count(distinct p.rider_id) as riders
                from public.rider_payout p
               where p.state = 'paid' and not p.is_test and p.paid_at is not null
                 and p.rider_id = any(v_mine)
               group by 1 order by 1 desc limit 3) x), '[]'::jsonb)
  ) into v_result
  from fees, earn, adj, pay;

  return v_result;
end;
$$;

-- ══════════════════════════════════════════════════════════ performance

create or replace function public.rpc_console_riders_performance(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  v_mine uuid[];
  v_start timestamptz;
  v_end timestamptz;
  v_prev timestamptz;
  v_days integer := p_to - p_from + 1;
  v_result jsonb;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a period of a year or less.' using errcode = 'invalid_parameter_value';
  end if;
  select start_at, end_at, prev_start into v_start, v_end, v_prev
    from public.fn_console_period(p_from, p_to);
  v_mine := array(select public.console_my_riders());

  with cur as (select * from public.console_rider_facts(v_start, v_end) x where x.bucket <> 'onboarding'),
  prv as (select * from public.console_rider_facts(v_prev, v_start) x where x.bucket <> 'onboarding'),
  agg as (
    select
      sum(trips) as trips, sum(timed) as timed, sum(on_time) as on_time,
      sum(offers_answered) as answered, sum(offers_accepted) as accepted,
      sum(cancelled) as cancelled,
      count(*) filter (where trips > 0) as working,
      round(avg(score)::numeric, 1) as score,
      count(*) filter (where score is not null and score < 85) as below,
      round((sum(delivery_min * trips) filter (where delivery_min is not null)
             / nullif(sum(trips) filter (where delivery_min is not null), 0))::numeric, 1) as delivery_min
      from cur
  ),
  agg_prev as (
    select
      sum(trips) as trips, sum(timed) as timed, sum(on_time) as on_time,
      sum(offers_answered) as answered, sum(offers_accepted) as accepted,
      count(*) filter (where trips > 0) as working,
      round(avg(score)::numeric, 1) as score,
      round((sum(delivery_min * trips) filter (where delivery_min is not null)
             / nullif(sum(trips) filter (where delivery_min is not null), 0))::numeric, 1) as delivery_min
      from prv
  ),
  ratings as (
    select
      round(avg(rr.stars) filter (where rr.created_at >= v_start)::numeric, 2) as now_r,
      round(avg(rr.stars) filter (where rr.created_at < v_start)::numeric, 2) as prev_r
      from public.rider_rating rr
     where rr.created_at >= v_prev and rr.created_at < v_end and rr.rider_id = any(v_mine)
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'score', a.score, 'score_prev', p.score,
      'on_time_pct', case when a.timed > 0 then round(100.0 * a.on_time / a.timed, 1) end,
      'on_time_pct_prev', case when p.timed > 0 then round(100.0 * p.on_time / p.timed, 1) end,
      'completion_pct', case when a.accepted > 0 then least(100, round(100.0 * a.trips / a.accepted, 1)) end,
      'completion_pct_prev', case when p.accepted > 0 then least(100, round(100.0 * p.trips / p.accepted, 1)) end,
      'acceptance_pct', case when a.answered > 0 then round(100.0 * a.accepted / a.answered, 1) end,
      'cancellation_pct', case when a.trips + a.cancelled > 0
                               then round(100.0 * a.cancelled / (a.trips + a.cancelled), 1) end,
      'delivery_min', a.delivery_min, 'delivery_min_prev', p.delivery_min,
      'per_rider_day', case when a.working > 0 then round(a.trips::numeric / a.working / v_days, 1) end,
      'per_rider_day_prev', case when p.working > 0 then round(p.trips::numeric / p.working / v_days, 1) end,
      'rating', r.now_r, 'rating_prev', r.prev_r,
      'below_85', a.below),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', dd.day, 'on_time_pct', c.pct, 'trips', c.n) order by dd.day)
        from generate_series(p_from, p_to, interval '1 day') as dd(day)
        left join lateral (
          select count(*) as n,
                 case when count(*) filter (where o.promised_delivery_at is not null) > 0
                      then round(100.0 * count(*) filter (where o.delivered_at <= o.promised_delivery_at)
                                 / count(*) filter (where o.promised_delivery_at is not null), 1) end as pct
            from public.order o
           where o.rider_id is not null and o.stage = 'delivered'
             and (o.delivered_at at time zone 'Africa/Nairobi')::date = dd.day::date
             and o.rider_id = any(v_mine)) c on true), '[]'::jsonb),
    'by_zone', coalesce((
      select jsonb_agg(jsonb_build_object('zone', z.zone_name, 'score', z.score, 'riders', z.n)
                       order by z.score desc nulls last)
        from (select c.zone_name, round(avg(c.score)::numeric, 1) as score, count(*) as n
                from cur c where c.zone_name is not null and c.score is not null
               group by c.zone_name) z), '[]'::jsonb)
  ) into v_result
  from agg a, agg_prev p, ratings r;

  return v_result;
end;
$$;

-- ═══════════════════════════════════════════════════ incidents & disputes

create or replace function public.rpc_console_riders_cases(
  p_from date,
  p_to date,
  p_tab text default 'all',
  p_q text default null,
  p_type text default null,
  p_priority text default null,
  p_page integer default 1,
  p_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '20s'
as $$
declare
  v_mine uuid[];
  v_start timestamptz;
  v_end timestamptz;
  v_prev timestamptz;
  v_q text := nullif(lower(trim(coalesce(p_q, ''))), '');
  v_size integer := greatest(1, least(coalesce(p_size, 10), 5000));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_result jsonb;
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'Pick a period of a year or less.' using errcode = 'invalid_parameter_value';
  end if;
  select start_at, end_at, prev_start into v_start, v_end, v_prev
    from public.fn_console_period(p_from, p_to);
  v_mine := array(select public.console_my_riders());

  with c as (
    select i.*,
           case
             when i.status in ('resolved', 'closed') then 'resolved'
             when i.escalated_at is not null then 'escalated'
             when i.status = 'investigating' then 'in_progress'
             else 'open'
           end as bucket,
           trim(r.first_name || ' ' || left(coalesce(r.last_name, ''), 1) || '.') as rider,
           z.name as zone,
           s.display_name as assignee
      from public.incident i
      left join public.rider r on r.id = i.rider_id
      left join lateral (
        select zz.name from public.zone zz
         where r.last_location is not null and zz.city_id = r.city_id
           and extensions.st_covers(zz.polygon, r.last_location) limit 1) z on true
      left join lateral (
        select coalesce(su.display_name, su.email) as display_name
          from public.staff_user su where su.id = i.assignee_id) s on true
     where i.created_at >= v_prev and i.created_at < v_end
       and (i.rider_id is null or i.rider_id = any(v_mine))
  ),
  cur as (select * from c where c.created_at >= v_start),
  prv as (select * from c where c.created_at < v_start),
  filtered as (
    select * from cur x
     where (v_q is null
            or lower(coalesce(x.order_reference, '')) like '%' || v_q || '%'
            or lower(coalesce(x.rider, '')) like '%' || v_q || '%'
            or lower(coalesce(x.description, '')) like '%' || v_q || '%'
            or upper(right(x.id::text, 8)) like '%' || upper(v_q) || '%')
       and (p_type is null or x.case_type = p_type)
       and (p_priority is null or x.priority = p_priority)
  ),
  tabbed as (
    select * from filtered x where coalesce(p_tab, 'all') = 'all' or x.bucket = p_tab
  ),
  ordered as (
    select x.*, row_number() over (order by x.created_at desc) as rn from tabbed x
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total', (select count(*) from cur),
      'total_prev', (select count(*) from prv),
      'open', (select count(*) from cur where bucket = 'open'),
      'in_progress', (select count(*) from cur where bucket = 'in_progress'),
      'resolved', (select count(*) from cur where bucket = 'resolved'),
      'escalated', (select count(*) from cur where bucket = 'escalated'),
      'resolution_hours', (select round(avg(extract(epoch from (resolved_at - created_at)) / 3600.0)::numeric, 1)
                             from cur where resolved_at >= created_at),
      'resolution_hours_prev', (select round(avg(extract(epoch from (resolved_at - created_at)) / 3600.0)::numeric, 1)
                             from prv where resolved_at >= created_at),
      'resolution_pct', (select case when count(*) > 0
                                     then round(100.0 * count(*) filter (where bucket = 'resolved') / count(*), 1) end
                           from cur),
      'resolution_pct_prev', (select case when count(*) > 0
                                     then round(100.0 * count(*) filter (where bucket = 'resolved') / count(*), 1) end
                           from prv),
      'overdue', (select count(*) from cur where bucket <> 'resolved' and sla_due_at < now()),
      'unassigned', (select count(*) from cur where bucket <> 'resolved' and assignee_id is null)),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', dd.day, 'cases', coalesce(n.n, 0)) order by dd.day)
        from generate_series(p_from, p_to, interval '1 day') as dd(day)
        left join lateral (
          select count(*) as n from cur
           where (cur.created_at at time zone 'Africa/Nairobi')::date = dd.day::date) n on true),
      '[]'::jsonb),
    'by_type', coalesce((
      select jsonb_object_agg(t.case_type, t.n) from (
        select case_type, count(*) as n from cur group by case_type) t), '{}'::jsonb),
    'outcomes', coalesce((
      select jsonb_object_agg(t.outcome, t.n) from (
        select outcome, count(*) as n from cur where outcome is not null group by outcome) t), '{}'::jsonb),
    'reasons', coalesce((
      select jsonb_agg(jsonb_build_object('reason', t.reason, 'n', t.n) order by t.n desc)
        from (select reason, count(*) as n from cur where reason is not null
               group by reason order by count(*) desc limit 5) t), '[]'::jsonb),
    'total', (select count(*) from tabbed),
    'counts', jsonb_build_object(
      'all', (select count(*) from filtered),
      'open', (select count(*) from filtered where bucket = 'open'),
      'in_progress', (select count(*) from filtered where bucket = 'in_progress'),
      'resolved', (select count(*) from filtered where bucket = 'resolved'),
      'escalated', (select count(*) from filtered where bucket = 'escalated')),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'order_reference', o.order_reference, 'case_type', o.case_type,
               'kind', o.kind, 'reason', o.reason, 'reported_by', o.reported_by_type,
               'rider_id', o.rider_id, 'rider', o.rider, 'zone', o.zone,
               'status', o.status, 'bucket', o.bucket, 'priority', o.priority,
               'created_at', o.created_at, 'sla_due_at', o.sla_due_at,
               'resolved_at', o.resolved_at, 'outcome', o.outcome,
               'assignee_id', o.assignee_id, 'assignee', o.assignee,
               'description', o.description) order by o.rn)
        from ordered o
       where o.rn > (v_page - 1) * v_size and o.rn <= v_page * v_size), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- ═══════════════════════════════════════════════════════ case writers

create or replace function public.rpc_console_rider_case_open(
  p_case_type text,
  p_priority text,
  p_description text,
  p_rider_id uuid default null,
  p_order_reference text default null,
  p_reason text default null,
  p_reported_by text default 'staff'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_order public.order;
  v_kind public.incident_kind;
  v_ref text := nullif(upper(trim(coalesce(p_order_reference, ''))), '');
  v_desc text := nullif(left(trim(coalesce(p_description, '')), 2000), '');
begin
  if not authz.reaches_module('riders') or authz.staff_id() is null then
    raise exception 'Not yours to open.' using errcode = 'insufficient_privilege';
  end if;
  if p_case_type not in ('delivery_dispute', 'payment_earnings', 'customer_conduct',
                         'rider_conduct', 'order_item', 'safety', 'other') then
    raise exception 'Pick a case type.' using errcode = 'invalid_parameter_value';
  end if;
  if p_priority not in ('low', 'medium', 'high', 'urgent') then
    raise exception 'Pick a priority.' using errcode = 'invalid_parameter_value';
  end if;
  if p_reported_by not in ('rider', 'guest', 'merchant', 'staff', 'system') then
    raise exception 'Who reported it?' using errcode = 'invalid_parameter_value';
  end if;
  if v_desc is null then
    raise exception 'Say what happened.' using errcode = 'invalid_parameter_value';
  end if;
  if v_ref is not null then
    select * into v_order from public.order o where o.reference = v_ref;
    if v_order.id is null then
      raise exception 'No order % .', v_ref using errcode = 'no_data_found';
    end if;
  end if;
  if p_rider_id is null and v_order.rider_id is not null then
    p_rider_id := v_order.rider_id;
  end if;
  if p_rider_id is not null and not authz.works_rider(p_rider_id) then
    raise exception 'Not one of your riders.' using errcode = 'insufficient_privilege';
  end if;

  v_kind := case p_case_type
    when 'rider_conduct' then 'guest_complaint'
    when 'customer_conduct' then 'rider_complaint'
    else 'other' end::public.incident_kind;

  insert into public.incident (rider_id, order_reference, merchant_id, kind, severity, status,
                               reported_by_type, reported_by_id, description,
                               case_type, priority, reason)
  values (p_rider_id, v_ref, v_order.merchant_id, v_kind,
          (case p_priority when 'urgent' then 'critical' when 'high' then 'major'
                else 'minor' end)::public.incident_severity,
          'open', p_reported_by, case when p_reported_by = 'staff' then authz.staff_id() end,
          v_desc, p_case_type, p_priority, p_reason)
  returning id into v_id;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider_case.opened',
    p_target_type => 'incident', p_target_id => v_id,
    p_after => jsonb_build_object('case_type', p_case_type, 'priority', p_priority,
                                  'rider_id', p_rider_id, 'order_reference', v_ref,
                                  'reason', p_reason));
  return v_id;
end;
$$;

create or replace function public.rpc_console_rider_case_update(
  p_case_id uuid,
  p_action text,
  p_priority text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.incident;
  v_after public.incident;
begin
  if not authz.reaches_module('riders') or authz.staff_id() is null then
    raise exception 'Not yours to change.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_before from public.incident where id = p_case_id for update;
  if v_before.id is null
     or (v_before.rider_id is not null and not authz.works_rider(v_before.rider_id)) then
    raise exception 'No such case.' using errcode = 'no_data_found';
  end if;
  if v_before.status in ('resolved', 'closed') then
    raise exception 'This case is already resolved.' using errcode = 'check_violation';
  end if;

  if p_action = 'assign_me' then
    update public.incident set assignee_id = authz.staff_id() where id = p_case_id;
  elsif p_action = 'start' then
    update public.incident set status = 'investigating',
           assignee_id = coalesce(assignee_id, authz.staff_id()) where id = p_case_id;
  elsif p_action = 'escalate' then
    update public.incident set escalated_at = coalesce(escalated_at, now()),
           priority = case when priority in ('low', 'medium') then 'high' else priority end
     where id = p_case_id;
  elsif p_action = 'priority' then
    if p_priority not in ('low', 'medium', 'high', 'urgent') then
      raise exception 'Pick a priority.' using errcode = 'invalid_parameter_value';
    end if;
    update public.incident set priority = p_priority where id = p_case_id;
  else
    raise exception 'Assign, start, escalate or change priority.' using errcode = 'invalid_parameter_value';
  end if;

  if nullif(trim(coalesce(p_note, '')), '') is not null then
    insert into public.incident_note (incident_id, author_id, body)
    values (p_case_id, authz.staff_id(), left(trim(p_note), 2000));
  end if;

  select * into v_after from public.incident where id = p_case_id;
  perform audit.log('staff'::public.actor_type, 'riders', 'rider_case.updated',
    p_target_type => 'incident', p_target_id => p_case_id,
    p_before => jsonb_build_object('status', v_before.status, 'priority', v_before.priority,
                                   'assignee_id', v_before.assignee_id,
                                   'escalated_at', v_before.escalated_at),
    p_after => jsonb_build_object('action', p_action, 'status', v_after.status,
                                  'priority', v_after.priority, 'assignee_id', v_after.assignee_id,
                                  'escalated_at', v_after.escalated_at));
  return jsonb_build_object('id', v_after.id, 'status', v_after.status, 'priority', v_after.priority);
end;
$$;

create or replace function public.rpc_console_rider_case_resolve(
  p_case_id uuid,
  p_outcome text,
  p_resolution text,
  p_compensation_kes bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.incident;
  v_text text := nullif(left(trim(coalesce(p_resolution, '')), 2000), '');
begin
  if not authz.reaches_module('riders') or authz.staff_id() is null then
    raise exception 'Not yours to resolve.' using errcode = 'insufficient_privilege';
  end if;
  if p_outcome not in ('resolved', 'no_issue', 'compensated', 'penalized', 'unresolved') then
    raise exception 'Pick an outcome.' using errcode = 'invalid_parameter_value';
  end if;
  if v_text is null then
    raise exception 'Say how it was resolved.' using errcode = 'invalid_parameter_value';
  end if;
  if p_compensation_kes is not null and p_compensation_kes < 0 then
    raise exception 'Compensation cannot be negative.' using errcode = 'invalid_parameter_value';
  end if;
  select * into v_before from public.incident where id = p_case_id for update;
  if v_before.id is null
     or (v_before.rider_id is not null and not authz.works_rider(v_before.rider_id)) then
    raise exception 'No such case.' using errcode = 'no_data_found';
  end if;
  if v_before.status in ('resolved', 'closed') then
    raise exception 'This case is already resolved.' using errcode = 'check_violation';
  end if;

  update public.incident set
    status = 'resolved', outcome = p_outcome, resolution = v_text, resolved_at = now(),
    compensation_kes = coalesce(p_compensation_kes, compensation_kes),
    assignee_id = coalesce(assignee_id, authz.staff_id())
  where id = p_case_id;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider_case.resolved',
    p_target_type => 'incident', p_target_id => p_case_id,
    p_before => jsonb_build_object('status', v_before.status),
    p_after => jsonb_build_object('outcome', p_outcome, 'compensation_kes', p_compensation_kes));
  return jsonb_build_object('id', p_case_id, 'status', 'resolved', 'outcome', p_outcome);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ grants

revoke all on function public.fn_incident_case_defaults() from public, anon, authenticated;

do $grants$
declare
  v_sig text;
begin
  foreach v_sig in array array[
    'public.rpc_console_riders_list(date, date, text, text, uuid, text, text, text, integer, integer)',
    'public.rpc_console_riders_overview(date, date)',
    'public.rpc_console_riders_onboarding(date, date, text, text, uuid, text, text, integer, integer)',
    'public.rpc_console_riders_availability(date, date)',
    'public.rpc_console_riders_deliveries(date, date, text, text, uuid, integer, integer)',
    'public.rpc_console_riders_earnings(date, date)',
    'public.rpc_console_riders_performance(date, date)',
    'public.rpc_console_riders_cases(date, date, text, text, text, text, integer, integer)',
    'public.rpc_console_rider_case_open(text, text, text, uuid, text, text, text)',
    'public.rpc_console_rider_case_update(uuid, text, text, text)',
    'public.rpc_console_rider_case_resolve(uuid, text, text, bigint)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_sig);
    execute format('grant execute on function %s to authenticated', v_sig);
  end loop;
end
$grants$;
