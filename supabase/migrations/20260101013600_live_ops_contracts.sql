-- What the two consoles read.
--
-- Orders (A4) and Live operations (A3) share almost everything: the
-- same order, the same job, the same cascade. They differ only in
-- what they put first — Orders leads with money and the timeline,
-- Live ops leads with the clock and the cascade. So the contracts
-- are shared, and the two pages choose columns rather than
-- duplicating logic that could then disagree.
--
-- Every view here is `security_invoker`, so the row policies on
-- `public.order` and `dispatch.job` decide who sees what. The
-- exceptions are the two that read `dispatch.fn_riders_live`, which
-- is already definer with the live-ops grant checked inside.

-- ═════════════════════════════════ how late is late

/*
 * One definition of lateness, because the badge, the sort order and
 * the alert all have to agree. A list that sorted by one definition
 * and coloured by another is a list a dispatcher learns to distrust.
 */
create or replace function public.fn_order_lateness(
  p_promised timestamptz, p_delivered timestamptz
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_promised is null then null
         else (extract(epoch from coalesce(p_delivered, now()) - p_promised) / 60)::integer end
$$;

-- ═════════════════════════════════════ live orders

create or replace view public.console_live_orders_v
with (security_invoker = true) as
select
  o.id,
  o.reference,
  o.city_id,
  c.name as city,
  o.zone_id,
  z.name as zone,
  o.stage::text as stage,
  o.channel::text as channel,
  o.payment_method::text as payment_method,
  o.payment_status::text as payment_status,

  coalesce(m.trading_name, m.legal_name) as merchant,
  o.merchant_id,
  b.name as branch,
  o.dropoff_label,

  g.name as guest,
  g.phone as guest_phone,
  g.vip as guest_vip,

  o.placed_at,
  o.promised_delivery_at,
  o.eta_at,
  o.delivered_at,
  public.fn_order_lateness(o.promised_delivery_at, o.delivered_at) as minutes_late,
  o.delay_minutes_total,
  o.delay_notified_at,

  /* The one word the row is sorted and coloured by. */
  case
    when o.stage in ('cancelled', 'refunded') then 'closed'
    when o.stage = 'delivered' then 'done'
    when j.state = 'escalated' then 'needs_a_person'
    when public.fn_order_lateness(o.promised_delivery_at, null) > 0 then 'late'
    when j.state in ('queued', 'offering') then 'finding_a_rider'
    else 'running'
  end as urgency,

  o.rider_id,
  nullif(trim(coalesce(rd.first_name, '') || ' ' || coalesce(rd.last_name, '')), '') as rider,
  rd.phone as rider_phone,
  rd.presence::text as rider_presence,

  j.id as job_id,
  j.state::text as job_state,
  j.round as cascade_round,
  j.radius_km,
  j.boost_cents,
  j.escalation_reason,
  j.escalated_at,
  (select count(*) from dispatch.offer ofr
    where ofr.job_id = j.id and ofr.outcome <> 'skipped') as offers_made,
  (select count(*) from dispatch.offer ofr
    where ofr.job_id = j.id and ofr.outcome = 'declined') as declines,
  /* Seconds the current round has left, so the screen can count
     down from the database's clock rather than the browser's. */
  (select greatest(0, (extract(epoch from min(ofr.expires_at) - now()))::int)
     from dispatch.offer ofr
    where ofr.job_id = j.id and ofr.outcome = 'pending') as round_seconds_left,

  o.total_cents,
  o.currency,
  o.subtotal_cents,
  o.delivery_fee_cents,
  o.tip_cents,
  o.carry_requirements,
  o.guest_unreachable,
  o.scheduled_for
from public.order o
join public.city c on c.id = o.city_id
left join public.zone z on z.id = o.zone_id
left join public.merchant m on m.id = o.merchant_id
left join public.merchant_branch b on b.id = o.branch_id
left join public.guest g on g.id = o.guest_id
left join public.rider rd on rd.id = o.rider_id
left join dispatch.job j
  on j.order_id = o.id and j.state not in ('cancelled', 'completed');

comment on view public.console_live_orders_v is
  'Every order with its cascade state. One `urgency` word drives the sort, the colour and the badge, so the three cannot disagree.';

-- ════════════════════════════════════ the cascade

/*
 * The workbench. Every offer in order, including the ones that were
 * never made and why — which is the half a dispatcher reads.
 */
create or replace view public.console_cascade_v
with (security_invoker = true) as
select
  ofr.id,
  ofr.job_id,
  j.order_id,
  o.reference,
  j.city_id,
  ofr.round,
  ofr.rank,
  ofr.rider_id,
  nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), '') as rider,
  r.plate_no,
  r.vehicle::text as vehicle,
  ofr.distance_km,
  ofr.eta_min,
  ofr.outcome::text as outcome,
  ofr.skip_reason::text as skip_reason,
  ofr.decline_reason::text as decline_reason,
  ofr.direct,
  ofr.note,
  ofr.offered_at,
  ofr.expires_at,
  ofr.responded_at,
  case when ofr.responded_at is not null
       then greatest(0, (extract(epoch from ofr.responded_at - ofr.offered_at))::int) end
    as answered_in_s,
  case when ofr.outcome = 'pending'
       then greatest(0, (extract(epoch from ofr.expires_at - now()))::int) end
    as seconds_left,
  /* One sentence a dispatcher can read without decoding anything. */
  case ofr.outcome
    when 'skipped' then 'Not asked · ' || coalesce(ofr.note, ofr.skip_reason::text)
    when 'accepted' then 'Accepted'
    when 'declined' then 'Declined' || coalesce(' · ' || ofr.decline_reason::text, '')
    when 'timed_out' then 'No answer'
    when 'withdrawn' then 'Withdrawn · somebody else took it'
    else 'Waiting'
  end as reads_as
from dispatch.offer ofr
join dispatch.job j on j.id = ofr.job_id
join public.order o on o.id = j.order_id
left join public.rider r on r.id = ofr.rider_id;

comment on view public.console_cascade_v is
  'Every offer, in order, including the ones never made and why. The exclusions are the half that explains the screen.';

/* What staff did to a job, interleaved with the cascade on replay. */
create or replace view public.console_dispatch_actions_v
with (security_invoker = true) as
select
  a.id,
  a.job_id,
  j.order_id,
  o.reference,
  j.city_id,
  a.kind,
  a.params,
  a.reason,
  a.at,
  a.actor_id,
  coalesce(su.email, '[no longer staff]') as by_email,
  su.display_name as by_name
from dispatch.action a
join dispatch.job j on j.id = a.job_id
join public.order o on o.id = j.order_id
left join public.staff_user su on su.id = a.actor_id;

-- ═══════════════════════════════ nearest free riders

/*
 * The panel beside the cascade: who is actually near, free, and
 * able to take it. Parameterised rather than a view because it is
 * always asked about one job.
 */
create or replace function public.rpc_nearest_free(p_job_id uuid, p_limit integer default 8)
returns table (
  rider_id uuid,
  name text,
  plate_no text,
  vehicle text,
  distance_km numeric,
  eta_min integer,
  presence text,
  eligible boolean,
  skip_reason text,
  note text
)
language sql
stable
set search_path = ''
as $$
  select c.rider_id, c.name, c.plate_no, c.vehicle, c.distance_km, c.eta_min,
         c.presence, c.eligible, c.skip_reason::text, c.note
    from dispatch.fn_candidates(p_job_id, true) c
   order by c.eligible desc, c.distance_km
   limit greatest(1, least(coalesce(p_limit, 8), 50))
$$;

-- ══════════════════════════════════════ zone health

create or replace view public.console_zone_health_v
with (security_invoker = true) as
select
  z.id as zone_id,
  z.name as zone,
  z.city_id,
  c.name as city,
  z.tier,
  z.cod_allowed,
  z.active,
  coalesce(h.live_orders, 0) as live_orders,
  coalesce(h.riders_free, 0) as riders_free,
  coalesce(h.riders_on_trip, 0) as riders_on_trip,
  coalesce(h.riders_idle, 0) as riders_idle,
  h.avg_assign_s,
  h.p90_assign_s,
  coalesce(h.unassigned, 0) as unassigned,
  coalesce(h.escalated, 0) as escalated,
  coalesce(h.state, 'ok') as state,
  coalesce(h.paused, false) as paused,
  h.paused_reason,
  h.paused_until,
  h.computed_at,
  /* Orders per free rider: the number that says "short" before any
     order is actually late. Null when nobody is free, because
     dividing by zero and calling it infinity reads as a glitch. */
  case when coalesce(h.riders_free, 0) > 0
       then round(coalesce(h.live_orders, 0)::numeric / h.riders_free, 1) end
    as load_per_free_rider
from public.zone z
join public.city c on c.id = z.city_id
left join dispatch.zone_health h on h.zone_id = z.id;

comment on view public.console_zone_health_v is
  'A zone''s pressure now. `load_per_free_rider` is null rather than infinite when nobody is free, because a glitchy number is one a dispatcher stops reading.';

/*
 * Recomputed every minute. Reads the rider record directly, so a
 * zone can never claim riders the rider console says are offline.
 */
create or replace function dispatch.cron_zone_health()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tight numeric;
  v_short numeric;
  v_n integer;
begin
  v_tight := coalesce(settings.fn_num('dispatch.zone_tight_load', null), 2.0);
  v_short := coalesce(settings.fn_num('dispatch.zone_short_load', null), 4.0);

  insert into dispatch.zone_health as h (
    zone_id, live_orders, riders_free, riders_on_trip, riders_idle,
    avg_assign_s, p90_assign_s, unassigned, escalated, state, computed_at)
  select
    z.id,
    coalesce(o.live, 0),
    coalesce(r.free, 0),
    coalesce(r.on_trip, 0),
    coalesce(r.idle, 0),
    a.avg_s,
    a.p90_s,
    coalesce(o.unassigned, 0),
    coalesce(o.escalated, 0),
    case
      when coalesce(o.escalated, 0) > 0 then 'short'
      when coalesce(r.free, 0) = 0 and coalesce(o.live, 0) > 0 then 'short'
      when coalesce(r.free, 0) > 0
           and coalesce(o.live, 0)::numeric / r.free >= v_short then 'short'
      when coalesce(r.free, 0) > 0
           and coalesce(o.live, 0)::numeric / r.free >= v_tight then 'tight'
      else 'ok'
    end,
    now()
  from public.zone z
  left join lateral (
    select
      count(*) filter (where ord.stage not in ('delivered', 'cancelled', 'refunded')) as live,
      count(*) filter (where ord.rider_id is null
                         and ord.stage not in ('delivered', 'cancelled', 'refunded')) as unassigned,
      count(*) filter (where jb.state = 'escalated') as escalated
    from public.order ord
    left join dispatch.job jb
      on jb.order_id = ord.id and jb.state not in ('cancelled', 'completed')
    where ord.zone_id = z.id and ord.placed_at > now() - interval '6 hours'
  ) o on true
  left join lateral (
    select
      count(*) filter (where rr.presence = 'online') as free,
      count(*) filter (where rr.presence = 'on_trip') as on_trip,
      count(*) filter (where rr.presence = 'online'
                         and rr.last_location_at < now() - interval '30 minutes') as idle
    from public.rider rr
    where rr.city_id = z.city_id
      and rr.status = 'active'
      and rr.last_location is not null
      and extensions.st_intersects(z.polygon, rr.last_location)
  ) r on true
  left join lateral (
    select
      avg(extract(epoch from jb.assigned_at - jb.started_at))::int as avg_s,
      (percentile_cont(0.9) within group (
         order by extract(epoch from jb.assigned_at - jb.started_at)))::int as p90_s
    from dispatch.job jb
    where jb.zone_id = z.id and jb.assigned_at is not null
      and jb.started_at > now() - interval '2 hours'
  ) a on true
  where z.active
  on conflict (zone_id) do update set
    live_orders = excluded.live_orders,
    riders_free = excluded.riders_free,
    riders_on_trip = excluded.riders_on_trip,
    riders_idle = excluded.riders_idle,
    avg_assign_s = excluded.avg_assign_s,
    p90_assign_s = excluded.p90_assign_s,
    unassigned = excluded.unassigned,
    escalated = excluded.escalated,
    /* A paused zone keeps its state; the pause is the fact that
       matters and recomputing over it would hide it. */
    state = case when h.paused then h.state else excluded.state end,
    computed_at = excluded.computed_at;

  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'zones', v_n);
end;
$$;

-- ═══════════════════════════════════════ the badges

/*
 * The five numbers across the top. One query, because five separate
 * ones taken a second apart can add up to a picture that was never
 * true at any instant.
 */
create or replace view public.console_live_badges_v
with (security_invoker = true) as
select
  v.city_id,
  v.city,
  count(*) filter (where v.stage not in ('delivered', 'cancelled', 'refunded')) as live,
  count(*) filter (where v.urgency = 'finding_a_rider') as finding_a_rider,
  count(*) filter (where v.urgency = 'needs_a_person') as needs_a_person,
  count(*) filter (where v.urgency = 'late') as late,
  count(*) filter (where v.guest_unreachable) as guest_unreachable,
  count(*) filter (where v.scheduled_for is not null
                     and v.scheduled_for > now()
                     and v.scheduled_for < now() + interval '2 hours') as due_within_2h
from public.console_live_orders_v v
group by v.city_id, v.city;

-- ═════════════════════════ the rules this screen runs under

/*
 * The header line: "20 s accept window · 3 rounds · 3 km radius".
 * Read from settings rather than written here, because a dispatcher
 * judges every intervention against it and a constant that drifted
 * would make the screen lie.
 */
create or replace view public.dispatch_rules_v
with (security_invoker = true) as
select
  c.id as city_id,
  c.name as city,
  settings.fn_int('dispatch.accept_window_s', c.id)::int as accept_window_s,
  settings.fn_int('dispatch.rounds_before_boost', c.id)::int as rounds,
  settings.fn_num('dispatch.search_radius_km', c.id) as radius_km,
  settings.fn_num('dispatch.radius_increment_km', c.id) as radius_step_km,
  settings.fn_int('dispatch.boost_fee', c.id) as boost_cents,
  settings.fn_int('dispatch.boost_max', c.id) as boost_max_cents,
  settings.fn_int('dispatch.escalate_min', c.id)::int as escalate_min,
  settings.fn_int('dispatch.rider_cash_cap', c.id) as cash_cap_cents,
  settings.fn_bool('dispatch.stacking', c.id) as stacking,
  settings.fn_int('guest.free_cancel_delay_min', c.id)::int as free_cancel_min,
  /* Printed as-is at the top of the workbench. An unset number
     shows as a dash rather than a default nobody chose. */
  concat_ws(' · ',
    coalesce(settings.fn_int('dispatch.accept_window_s', c.id)::text || ' s accept window', '[—] accept window'),
    coalesce(settings.fn_int('dispatch.rounds_before_boost', c.id)::text || ' rounds', '[—] rounds'),
    coalesce(settings.fn_num('dispatch.search_radius_km', c.id)::text || ' km radius', '[—] km radius')
  ) as reads_as
from public.city c;

comment on view public.dispatch_rules_v is
  'The header a dispatcher judges every intervention against, read from settings rather than restated here.';

grant select on public.console_live_orders_v, public.console_cascade_v,
  public.console_dispatch_actions_v, public.console_zone_health_v,
  public.console_live_badges_v, public.dispatch_rules_v to authenticated;
grant execute on function public.fn_order_lateness(timestamptz, timestamptz) to authenticated;
grant execute on function public.rpc_nearest_free(uuid, integer) to authenticated;
grant execute on function dispatch.cron_zone_health() to service_role, authenticated;
