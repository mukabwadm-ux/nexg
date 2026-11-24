-- The rider's whole record in the console, and customers rating their rider.
--
-- The owner (24 Nov 2026): the rider account in the admin console "misses out
-- some parts". The gap list agreed that day: staff could see a rider's
-- application but not their live state, trips, money, shifts, points,
-- referrals, conduct or audit trail, although the database holds all of it;
-- and customers could not rate the rider who delivered to them ("Build
-- customer rating now").
--
-- Nothing here changes an existing table or function. It adds:
--
-- 1. rider_rating: one rating of the rider per delivered order, by the
--    order's customer (stars, a few fixed tags, an optional comment). It sits
--    beside order_rating, which stays one rating per order of the order as a
--    whole; a customer can now give both.
-- 2. rpc_order_rate_rider / rpc_my_order_rider_rating: the customer's write
--    and read, through authz.customer_order like rpc_order_rate.
-- 3. rpc_console_rider_profile(rider): every section of the rider's record as
--    one jsonb. Live location is NOT in it: that stays behind
--    rpc_rider_live_location, which asks for a reason and audits the look.
-- 4. rpc_console_rider_trip(rider, order): one trip's timeline, from the
--    offer to the handover proof.
-- 5. rpc_console_rider_stats(): trips, acceptance, on-time and rating per
--    rider for the directory, counted from the trips themselves.
--
-- Readers are gated by authz.reaches_module('riders') and, per rider, by
-- authz.works_rider (city-scoped). Staff writes reuse the existing audited
-- RPCs (rpc_rider_set_control, rpc_rider_cooldown, rpc_rider_strike,
-- rpc_rider_message_send, rpc_rider_log_call, rpc_cash_manual_adjustment).
--
-- Rollback: drop the five functions and the table, and delete the
-- audit.action_registry row added below.

insert into audit.action_registry (action, module, default_severity, description) values
  ('rider.rated', 'riders', 'info', 'A customer rated the rider who delivered their order')
on conflict (action) do nothing;

-- ═════════════════════════════════════════════ customers rate their rider

create table if not exists public.rider_rating (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public."order" (id) on delete cascade,
  rider_id uuid not null references public.rider (id) on delete cascade,
  guest_id uuid references public.guest (id) on delete set null,
  stars smallint not null check (stars between 1 and 5),
  /* A fixed list, so the console can count them without reading prose. */
  tags text[] not null default '{}'
    check (tags <@ array['on_time', 'friendly', 'careful', 'followed_instructions',
                         'late', 'rude', 'damaged', 'hard_to_reach']::text[]),
  comment text check (comment is null or length(comment) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists rider_rating_rider_idx
  on public.rider_rating (rider_id, created_at desc);

alter table public.rider_rating enable row level security;

/* Staff who work this rider read them; nobody writes except through
   rpc_order_rate_rider. Riders do not read comments about themselves here. */
drop policy if exists rider_rating_staff_read on public.rider_rating;
create policy rider_rating_staff_read on public.rider_rating
  for select to authenticated
  using (authz.works_rider(rider_id));

revoke all on public.rider_rating from anon, authenticated;
grant select on public.rider_rating to authenticated;

create or replace function public.rpc_order_rate_rider(
  p_order_id uuid,
  p_stars integer,
  p_tags text[] default '{}',
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
declare
  o public.order;
  v_tags text[] := coalesce(p_tags, '{}');
begin
  select * into o from authz.customer_order(p_order_id);
  if o.id is null then
    raise exception 'That order is not on your account.' using errcode = '42501';
  end if;
  if o.stage <> 'delivered' then
    raise exception 'You can rate your rider once the order is delivered.'
      using errcode = 'check_violation';
  end if;
  if o.rider_id is null then
    raise exception 'No NexG rider delivered this order.' using errcode = 'check_violation';
  end if;
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'Choose from 1 to 5 stars.' using errcode = '22023';
  end if;
  if not v_tags <@ array['on_time', 'friendly', 'careful', 'followed_instructions',
                         'late', 'rude', 'damaged', 'hard_to_reach']::text[] then
    raise exception 'Choose from the listed words.' using errcode = '22023';
  end if;
  if exists (select 1 from public.rider_rating r where r.order_id = o.id) then
    raise exception 'You have already rated your rider. Thank you.' using errcode = '23505';
  end if;

  insert into public.rider_rating (order_id, rider_id, guest_id, stars, tags, comment)
  values (o.id, o.rider_id, o.guest_id, p_stars,
          (select coalesce(array_agg(distinct t), '{}') from unnest(v_tags) t),
          nullif(left(trim(coalesce(p_comment, '')), 1000), ''));

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type, p_module => 'riders', p_action => 'rider.rated',
    p_target_type => 'rider', p_target_id => o.rider_id,
    p_city_id => o.city_id,
    p_after => jsonb_build_object('stars', p_stars, 'order_reference', o.reference));

  return jsonb_build_object('ok', true, 'note', 'Thank you. That goes to the NexG rider team.');
end;
$$;

revoke all on function public.rpc_order_rate_rider(uuid, integer, text[], text) from public, anon;
grant execute on function public.rpc_order_rate_rider(uuid, integer, text[], text) to authenticated;

/* For the customer's order page: was there a rider, what is their first
   name, and has this customer rated them yet. */
create or replace function public.rpc_my_order_rider_rating(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when o.id is null or o.rider_id is null then null
  else jsonb_build_object(
    'rider_first_name', (select r.first_name from public.rider r where r.id = o.rider_id),
    'stars', (select rr.stars from public.rider_rating rr where rr.order_id = o.id))
  end
  from authz.customer_order(p_order_id) o
$$;

revoke all on function public.rpc_my_order_rider_rating(uuid) from public, anon;
grant execute on function public.rpc_my_order_rider_rating(uuid) to authenticated;

-- ═════════════════════════════════════════════ the console's reader

create or replace function public.rpc_console_rider_profile(p_rider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  r public.rider;
  v_since timestamptz := now() - interval '30 days';
begin
  if not (authz.reaches_module('riders') and authz.works_rider(p_rider_id)) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  select * into r from public.rider where id = p_rider_id;

  return jsonb_build_object(
    -- ── who they are
    'profile', jsonb_build_object(
      'id', r.id,
      'first_name', r.first_name,
      'last_name', r.last_name,
      'status', r.status,
      'status_reason', r.status_reason,
      'city', (select c.name from public.city c where c.id = r.city_id),
      'vehicle', r.vehicle,
      'plate_no', r.plate_no,
      'ownership', r.ownership,
      'insurance', r.insurance,
      'years_riding', r.years_riding,
      'areas', to_jsonb(r.areas),
      'shifts', to_jsonb(r.shifts),
      'source', r.source,
      'employer', (select m.trading_name from public.merchant m where m.id = r.employer_merchant_id),
      'submitted_at', r.submitted_at,
      'activated_at', r.activated_at,
      'created_at', r.created_at,
      'phone_verified_at', r.phone_verified_at,
      /* The payout number is shown masked; Finance holds the full one. */
      'payout_msisdn_masked', case when r.payout_msisdn is null then null
        else left(r.payout_msisdn, 4) || '•••' || right(r.payout_msisdn, 3) end,
      'payout_msisdn_changed_at', r.payout_msisdn_changed_at,
      'agreement', (
        select jsonb_build_object('version', v.version, 'accepted_at', a.accepted_at,
                                  'current', v.status = 'current')
          from public.rider_agreement_acceptance a
          join public.rider_agreement_version v on v.id = a.agreement_version_id
         where a.rider_id = r.id
         order by a.accepted_at desc limit 1),
      'current_agreement', (select v.version from public.rider_agreement_version v
                             where v.status = 'current' limit 1),
      'devices', coalesce((
        select jsonb_agg(jsonb_build_object('platform', d.platform, 'label', d.label,
                 'is_job_device', d.is_job_device, 'bound_at', d.bound_at,
                 'last_seen_at', d.last_seen_at, 'unbound_at', d.unbound_at,
                 'location_permission', d.location_permission,
                 'notification_permission', d.notification_permission)
                 order by d.bound_at desc)
          from public.rider_device d where d.rider_id = r.id), '[]'::jsonb),
      'phone_changes', coalesce((
        select jsonb_agg(jsonb_build_object('kind', pc.kind, 'created_at', pc.created_at,
                 'verified_at', pc.verified_at) order by pc.created_at desc)
          from (select * from public.rider_phone_change x where x.rider_id = r.id
                 order by x.created_at desc limit 10) pc), '[]'::jsonb)
    ),

    -- ── right now (no coordinates: those go through rpc_rider_live_location)
    'live', jsonb_build_object(
      'presence', r.presence,
      'presence_changed_at', r.presence_changed_at,
      'last_seen_at', r.last_seen_at,
      'last_location_at', r.last_location_at,
      'has_location', r.last_location is not null,
      /* The zone of their last presence change with one. */
      'zone', (select z.name from public.rider_presence_event pe
                 join public.zone z on z.id = pe.zone_id
                where pe.rider_id = r.id and pe.zone_id is not null
                order by pe.at desc limit 1),
      'current_order_reference', r.current_order_reference,
      'current_order_id', (select o.id from public.order o
                            where o.reference = r.current_order_reference limit 1),
      'cooldown_until', r.cooldown_until,
      'cooldown_reason', r.cooldown_reason,
      'can_receive_offers', r.can_receive_offers,
      'offers_paused_reason', r.offers_paused_reason,
      'large_items_eligible', r.large_items_eligible,
      'alcohol_eligible', r.alcohol_eligible
    ),

    -- ── the numbers
    'stats', jsonb_build_object(
      'trips_30d', (select count(*) from public.order o
                     where o.rider_id = r.id and o.stage = 'delivered'
                       and o.delivered_at >= v_since),
      'trips_all', (select count(*) from public.order o
                     where o.rider_id = r.id and o.stage = 'delivered'),
      'offers_30d', (select count(*) from dispatch.offer f
                      where f.rider_id = r.id and f.offered_at >= v_since
                        and f.outcome in ('accepted', 'declined', 'timed_out')),
      'accepted_30d', (select count(*) from dispatch.offer f
                        where f.rider_id = r.id and f.offered_at >= v_since
                          and f.outcome = 'accepted'),
      'on_time_30d', (select count(*) from public.order o
                       where o.rider_id = r.id and o.stage = 'delivered'
                         and o.delivered_at >= v_since and o.promised_delivery_at is not null
                         and o.delivered_at <= o.promised_delivery_at),
      'timed_30d', (select count(*) from public.order o
                     where o.rider_id = r.id and o.stage = 'delivered'
                       and o.delivered_at >= v_since and o.promised_delivery_at is not null),
      'earned_30d_kes', (select coalesce(sum(e.total_kes), 0) from public.rider_earning e
                          where e.rider_id = r.id and not e.is_test and e.earned_at >= v_since),
      'health_score', r.health_score,
      'health_band', r.health_band,
      'strike_count', r.strike_count
    ),

    -- ── trips: the last 50 orders they carried, and the last 50 offers
    'trips', coalesce((
      select jsonb_agg(t order by t->>'at' desc) from (
        select jsonb_build_object(
          'order_id', o.id, 'reference', o.reference, 'stage', o.stage,
          'at', coalesce(o.delivered_at, o.picked_up_at, o.placed_at),
          'merchant', (select m.trading_name from public.merchant m where m.id = o.merchant_id),
          'dropoff', o.dropoff_label,
          'picked_up_at', o.picked_up_at, 'delivered_at', o.delivered_at,
          'promised_delivery_at', o.promised_delivery_at,
          'handed_to', o.handed_to,
          'proof', case when o.handoff_code_verified then 'code'
                        when o.handoff_photo_path is not null then 'photo' end,
          'earned_kes', (select sum(e.total_kes) from public.rider_earning e
                          where e.rider_id = r.id and e.order_reference = o.reference),
          'stars', (select rr.stars from public.rider_rating rr where rr.order_id = o.id)
        ) t
          from public.order o
         where o.rider_id = r.id
         order by coalesce(o.delivered_at, o.picked_up_at, o.placed_at) desc
         limit 50) x), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'offered_at', f.offered_at, 'responded_at', f.responded_at,
               'outcome', f.outcome, 'decline_reason', f.decline_reason,
               'distance_km', f.distance_km, 'direct', f.direct,
               'reference', (select o.reference from public.order o where o.id = j.order_id),
               'order_id', j.order_id) order by f.offered_at desc)
        from (select * from dispatch.offer x where x.rider_id = r.id
               order by x.offered_at desc limit 50) f
        join dispatch.job j on j.id = f.job_id), '[]'::jsonb),

    -- ── money
    'money', jsonb_build_object(
      'cash_on_hand_kes', r.cash_on_hand,
      'cash_cap_kes', public.fn_rider_cash_cap(r.id),
      /* The last 30 days in Nairobi time, a row for every day. */
      'by_day', (
        select jsonb_agg(jsonb_build_object(
                 'day', d.day,
                 'kes', coalesce((select sum(e.total_kes) from public.rider_earning e
                                   where e.rider_id = r.id and not e.is_test
                                     and (e.earned_at at time zone 'Africa/Nairobi')::date = d.day), 0),
                 'trips', (select count(*) from public.order o
                            where o.rider_id = r.id and o.stage = 'delivered'
                              and (o.delivered_at at time zone 'Africa/Nairobi')::date = d.day))
                 order by d.day)
          from (select g::date as day
                  from generate_series((now() at time zone 'Africa/Nairobi')::date - 29,
                                       (now() at time zone 'Africa/Nairobi')::date,
                                       interval '1 day') g) d),
      'earnings', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'earned_at', e.earned_at, 'order_reference', e.order_reference,
                 'base_kes', e.base_kes, 'distance_kes', e.distance_kes,
                 'waiting_kes', e.waiting_kes, 'bonus_kes', e.peak_bonus_kes + e.pickup_bonus_kes,
                 'tip_kes', e.tip_kes, 'penalty_kes', e.penalty_kes,
                 'total_kes', e.total_kes, 'is_test', e.is_test) order by e.earned_at desc)
          from (select * from public.rider_earning x where x.rider_id = r.id
                 order by x.earned_at desc limit 50) e), '[]'::jsonb),
      'cash_events', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', c.id, 'kind', c.kind, 'amount_kes', c.amount_kes,
                 'order_reference', c.order_reference, 'note', c.note,
                 'created_at', c.created_at) order by c.created_at desc)
          from (select * from public.cash_event x where x.rider_id = r.id
                 order by x.created_at desc limit 50) c), '[]'::jsonb),
      'settlements', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'period_start', sr.period_start, 'period_end', sr.period_end,
                 'trips', l.trips, 'earnings_kes', l.earnings_kes, 'bonuses_kes', l.bonuses_kes,
                 'tips_kes', l.tips_kes, 'cash_net_kes', l.cash_net_kes,
                 'net_pay_kes', l.net_pay_kes, 'status', l.status, 'paid_at', l.paid_at,
                 'failure_reason', l.failure_reason) order by sr.period_end desc)
          from public.rider_settlement_line l
          join public.rider_settlement_run sr on sr.id = l.run_id
         where l.rider_id = r.id), '[]'::jsonb),
      'payout_requests', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'requested_at', p.requested_at, 'amount_kes', p.amount_kes,
                 'status', p.status, 'reason', p.reason, 'decided_at', p.decided_at,
                 'decision_note', p.decision_note, 'paid_at', p.paid_at)
                 order by p.requested_at desc)
          from (select * from public.rider_payout_request x where x.rider_id = r.id
                 order by x.requested_at desc limit 30) p), '[]'::jsonb),
      'adjustments', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'created_at', a.created_at, 'kind', a.kind, 'amount_kes', a.amount_kes,
                 'reason', a.reason) order by a.created_at desc)
          from (select * from public.rider_adjustment x where x.rider_id = r.id
                 order by x.created_at desc limit 30) a), '[]'::jsonb)
    ),

    -- ── shifts, points, referrals
    'activity', jsonb_build_object(
      'shifts', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'date', s.date, 'time_window', s.time_window, 'status', s.status,
                 'zone', (select z.name from public.zone z where z.id = s.zone_id),
                 'showed_at', s.showed_at) order by s.date desc, s.time_window)
          from (select * from public.shift_commitment x where x.rider_id = r.id
                 order by x.date desc limit 30) s), '[]'::jsonb),
      'points_total', (select coalesce(sum(p.points), 0) from public.rider_points p
                        where p.rider_id = r.id),
      'points', coalesce((
        select jsonb_agg(jsonb_build_object('earned_at', p.earned_at, 'points', p.points,
                 'reason', p.reason) order by p.earned_at desc)
          from (select * from public.rider_points x where x.rider_id = r.id
                 order by x.earned_at desc limit 20) p), '[]'::jsonb),
      'referrals', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'created_at', f.created_at, 'referred_name', f.referred_name,
                 'status', f.status, 'first_trip_at', f.first_trip_at,
                 'reward_status', f.reward_status, 'reward_amount_kes', f.reward_amount_kes,
                 'void_reason', f.void_reason) order by f.created_at desc)
          from public.rider_referral f where f.referrer_rider_id = r.id), '[]'::jsonb),
      'referred_by', (select coalesce(rr.first_name || ' ' || coalesce(rr.last_name, ''), '')
                        from public.rider_referral f
                        join public.rider rr on rr.id = f.referrer_rider_id
                       where f.referred_rider_id = r.id limit 1)
    ),

    -- ── how customers rate them
    'ratings', jsonb_build_object(
      'avg', (select round(avg(x.stars)::numeric, 2) from public.rider_rating x
               where x.rider_id = r.id),
      'count', (select count(*) from public.rider_rating x where x.rider_id = r.id),
      'by_star', (select jsonb_object_agg(s::text,
                    (select count(*) from public.rider_rating x
                      where x.rider_id = r.id and x.stars = s))
                    from generate_series(1, 5) s),
      'tags', coalesce((select jsonb_object_agg(t, n) from (
                 select t, count(*) n from public.rider_rating x, unnest(x.tags) t
                  where x.rider_id = r.id group by t) q), '{}'::jsonb),
      'recent', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'created_at', x.created_at, 'stars', x.stars, 'tags', to_jsonb(x.tags),
                 'comment', x.comment,
                 'reference', (select o.reference from public.order o where o.id = x.order_id),
                 'order_id', x.order_id) order by x.created_at desc)
          from (select * from public.rider_rating y where y.rider_id = r.id
                 order by y.created_at desc limit 20) x), '[]'::jsonb),
      /* Order ratings the customer said were about the rider. */
      'order_ratings_about_rider', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'created_at', x.created_at, 'stars', x.stars, 'comment', x.comment,
                 'reference', (select o.reference from public.order o where o.id = x.order_id))
                 order by x.created_at desc)
          from (select * from public.order_rating y
                 where y.rider_id = r.id and y.about = 'rider'
                 order by y.created_at desc limit 20) x), '[]'::jsonb)
    ),

    -- ── conduct
    'conduct', jsonb_build_object(
      'incidents', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', i.id, 'kind', i.kind, 'severity', i.severity, 'status', i.status,
                 'happened_at', i.happened_at, 'description', i.description,
                 'order_reference', i.order_reference, 'resolution', i.resolution)
                 order by i.happened_at desc)
          from (select * from public.incident x where x.rider_id = r.id
                 order by x.happened_at desc limit 30) i), '[]'::jsonb),
      /* Customer reports on orders this rider carried. */
      'complaints', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'reference', t.reference, 'order_reference', t.order_reference,
                 'created_at', t.created_at, 'status', t.status, 'topic', t.topic,
                 'body', left(t.body, 280)) order by t.created_at desc)
          from (select st.* from public.support_ticket st
                 where st.order_reference in (select o.reference from public.order o
                                               where o.rider_id = r.id)
                 order by st.created_at desc limit 20) t), '[]'::jsonb),
      'strikes', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'level', s.level, 'reason', s.reason, 'issued_at', s.issued_at,
                 'expires_at', s.expires_at, 'cleared_at', s.cleared_at,
                 'issued_by', (select su.display_name from public.staff_user su
                                where su.id = s.issued_by)) order by s.issued_at desc)
          from public.rider_strike s where s.rider_id = r.id), '[]'::jsonb),
      'fraud_flags', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', f.id, 'kind', f.kind, 'severity', f.severity, 'status', f.status,
                 'summary', f.summary, 'detected_at', f.detected_at,
                 'order_reference', f.order_reference) order by f.detected_at desc)
          from (select * from public.fraud_signal x
                 where x.rider_id = r.id
                    or (x.subject_type = 'rider' and x.subject_id = r.id)
                 order by x.detected_at desc limit 30) f), '[]'::jsonb),
      'status_history', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'at', h.created_at, 'from', h.from_status, 'to', h.to_status,
                 'reason', h.reason,
                 'by', (select su.display_name from public.staff_user su where su.id = h.actor_id),
                 'second_approver', (select su.display_name from public.staff_user su
                                      where su.id = h.second_approver_id))
                 order by h.created_at desc)
          from public.rider_status_change h where h.rider_id = r.id), '[]'::jsonb)
    ),

    -- ── messages with ops, oldest first so the thread reads down
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'direction', m.direction, 'channel', m.channel,
               'subject', m.subject, 'body', m.body, 'created_at', m.created_at,
               'read_at', m.read_at,
               'by', (select su.display_name from public.staff_user su where su.id = m.actor_id))
               order by m.created_at)
        from (select * from public.rider_message x where x.rider_id = r.id
               order by x.created_at desc limit 60) m), '[]'::jsonb),

    -- ── who did what to this rider
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', a.at, 'action', a.action, 'actor_type', a.actor_type,
               'actor', (select su.display_name from public.staff_user su
                          where su.id = a.actor_id or su.user_id = a.actor_id limit 1),
               'reason', a.reason, 'severity', a.severity) order by a.at desc)
        from (select * from audit.audit_event x
               where x.target_type = 'rider' and x.target_id = r.id
               order by x.at desc limit 60) a), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.rpc_console_rider_profile(uuid) from public, anon;
grant execute on function public.rpc_console_rider_profile(uuid) to authenticated;

-- ═════════════════════════════════════════════ one trip, step by step

create or replace function public.rpc_console_rider_trip(p_rider_id uuid, p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  o public.order;
begin
  if not (authz.reaches_module('riders') and authz.works_rider(p_rider_id)) then
    raise exception 'Not your rider.' using errcode = 'insufficient_privilege';
  end if;
  select * into o from public.order x where x.id = p_order_id;
  /* The trip has to be this rider's, either carried or offered. */
  if o.id is null or not (o.rider_id is not distinct from p_rider_id or exists (
       select 1 from dispatch.offer f join dispatch.job j on j.id = f.job_id
        where j.order_id = o.id and f.rider_id = p_rider_id)) then
    raise exception 'That trip is not this rider''s.' using errcode = 'no_data_found';
  end if;

  return jsonb_build_object(
    'order_id', o.id,
    'reference', o.reference,
    'stage', o.stage,
    'carried', o.rider_id is not distinct from p_rider_id,
    'merchant', (select m.trading_name from public.merchant m where m.id = o.merchant_id),
    'dropoff', o.dropoff_label,
    'placed_at', o.placed_at,
    'promised_delivery_at', o.promised_delivery_at,
    'picked_up_at', o.picked_up_at,
    'delivered_at', o.delivered_at,
    'handed_to', o.handed_to,
    'handoff_code_verified', o.handoff_code_verified,
    'handoff_photo_path', o.handoff_photo_path,
    'jobs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'state', j.state, 'started_at', j.started_at, 'assigned_at', j.assigned_at,
               'at_pickup_at', j.at_pickup_at, 'ended_at', j.ended_at,
               'end_reason', j.end_reason, 'distance_km', j.distance_km,
               'pickup', j.pickup_label, 'dropoff', j.dropoff_label,
               'assigned_to_this_rider', j.assigned_rider_id is not distinct from p_rider_id)
               order by j.started_at)
        from dispatch.job j where j.order_id = o.id), '[]'::jsonb),
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'offered_at', f.offered_at, 'responded_at', f.responded_at,
               'outcome', f.outcome, 'decline_reason', f.decline_reason,
               'distance_km', f.distance_km, 'eta_min', f.eta_min, 'direct', f.direct)
               order by f.offered_at)
        from dispatch.offer f join dispatch.job j on j.id = f.job_id
       where j.order_id = o.id and f.rider_id = p_rider_id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', e.at, 'kind', e.kind, 'title', e.title, 'detail', e.detail,
               'actor_type', e.actor_type, 'photo_path', e.photo_path)
               order by e.at, e.id)
        from public.order_event e where e.order_id = o.id), '[]'::jsonb),
    'earning', (
      select jsonb_build_object('total_kes', sum(e.total_kes), 'base_kes', sum(e.base_kes),
               'distance_kes', sum(e.distance_kes), 'tip_kes', sum(e.tip_kes),
               'is_test', bool_or(e.is_test))
        from public.rider_earning e
       where e.rider_id = p_rider_id and e.order_reference = o.reference
      having count(*) > 0),
    'cash', coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'amount_kes', c.amount_kes,
               'created_at', c.created_at) order by c.created_at)
        from public.cash_event c
       where c.rider_id = p_rider_id and c.order_reference = o.reference), '[]'::jsonb),
    'rating', (select jsonb_build_object('stars', rr.stars, 'tags', to_jsonb(rr.tags),
                        'comment', rr.comment, 'created_at', rr.created_at)
                 from public.rider_rating rr where rr.order_id = o.id)
  );
end;
$$;

revoke all on function public.rpc_console_rider_trip(uuid, uuid) from public, anon;
grant execute on function public.rpc_console_rider_trip(uuid, uuid) to authenticated;

-- ═════════════════════════════════════════════ the directory's numbers

/* One row per rider this staff member works, counted from the trips
   themselves rather than the health snapshot. Percentages are null, not
   zero, when there is nothing to divide by. */
create or replace function public.rpc_console_rider_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_since timestamptz := now() - interval '30 days';
begin
  if not authz.reaches_module('riders') then
    raise exception 'Not yours to read.' using errcode = 'insufficient_privilege';
  end if;

  return coalesce((
    select jsonb_object_agg(r.id, jsonb_build_object(
      'trips_30d', coalesce(t.trips, 0),
      'acceptance_pct', case when coalesce(f.answered, 0) = 0 then null
                             else round(100.0 * f.accepted / f.answered) end,
      'on_time_pct', case when coalesce(t.timed, 0) = 0 then null
                          else round(100.0 * t.on_time / t.timed) end,
      'rating_avg', g.avg_stars,
      'rating_count', coalesce(g.n, 0)))
      from public.rider r
      left join lateral (
        select count(*) trips,
               count(*) filter (where o.promised_delivery_at is not null) timed,
               count(*) filter (where o.promised_delivery_at is not null
                                  and o.delivered_at <= o.promised_delivery_at) on_time
          from public.order o
         where o.rider_id = r.id and o.stage = 'delivered' and o.delivered_at >= v_since) t on true
      left join lateral (
        select count(*) filter (where x.outcome in ('accepted', 'declined', 'timed_out')) answered,
               count(*) filter (where x.outcome = 'accepted') accepted
          from dispatch.offer x
         where x.rider_id = r.id and x.offered_at >= v_since) f on true
      left join lateral (
        select round(avg(rr.stars)::numeric, 2) avg_stars, count(*) n
          from public.rider_rating rr where rr.rider_id = r.id) g on true
     where authz.works_rider(r.id)), '{}'::jsonb);
end;
$$;

revoke all on function public.rpc_console_rider_stats() from public, anon;
grant execute on function public.rpc_console_rider_stats() to authenticated;
