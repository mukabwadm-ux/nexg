-- Rider portal, second round of mockups: what the new screens need from
-- the database.
--
--   1. rpc_rider_offers()          the signed-in rider's open job offers,
--                                  with pickup, drop-off, distance, the
--                                  pay the current rate card gives and map
--                                  points. dispatch.* is not exposed to
--                                  riders; Accept / Decline already go
--                                  through rpc_dispatch_offer_respond.
--   2. rpc_rider_message_reply()   a rider writes to rider ops from the
--                                  Messages page (rpc_rider_message_send
--                                  is staff only).
--   3. rider_points + rpc_rider_rewards()
--                                  points and badges, owner's rules of
--                                  2026-11-23:
--                                    completed delivery           10
--                                    delivered on time            +5
--                                    5-star rating                +5
--                                    booked shift turned up for   20
--                                    7 days in a row delivering   50
--                                    training module passed       25
--                                    referred rider goes active  200
--                                  A no-show earns nothing and breaks the
--                                  streak; nothing is ever taken off.
--                                  Points have no cash value yet.
--
-- Points are worked out from the source rows, idempotently: every award
-- is keyed (rider, reason, source_ref), so re-running the sync never
-- double counts, and nothing hooks into the order or shift writes.

-- ═════════════════════════════════════════════ 1. offers

create or replace function public.rpc_rider_offers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
begin
  select * into v_rider from public.rider r where r.user_id = (select auth.uid());
  if not found then
    raise exception 'Not a rider.' using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    'rider', case when v_rider.last_location is not null then jsonb_build_object(
        'lat', extensions.st_y(v_rider.last_location::extensions.geometry),
        'lng', extensions.st_x(v_rider.last_location::extensions.geometry)) end,
    'offers', coalesce((
      select jsonb_agg(jsonb_build_object(
          'offerId', o.id,
          'offeredAt', o.offered_at,
          'expiresAt', o.expires_at,
          'toPickupKm', o.distance_km,
          'etaMin', o.eta_min,
          'tripKm', j.distance_km,
          'pickup', j.pickup_label,
          'dropoff', j.dropoff_label,
          'reference', ord.reference,
          'scheduledFor', ord.scheduled_for,
          'collectKes', case when ord.payment_method = 'cash_on_delivery'
                             then round(ord.total_cents / 100.0) end,
          'payKes', case when rc.base_per_trip_kes is not null then
              rc.base_per_trip_kes
              + coalesce(rc.per_km_after_2km_kes, 0)
                * ceil(greatest(coalesce(j.distance_km, 0) - 2, 0)) end,
          'pickupPoint', case when j.pickup_point is not null then jsonb_build_object(
              'lat', extensions.st_y(j.pickup_point::extensions.geometry),
              'lng', extensions.st_x(j.pickup_point::extensions.geometry)) end,
          'dropoffPoint', case when j.dropoff_point is not null then jsonb_build_object(
              'lat', extensions.st_y(j.dropoff_point::extensions.geometry),
              'lng', extensions.st_x(j.dropoff_point::extensions.geometry)) end)
        order by o.offered_at desc)
        from dispatch.offer o
        join dispatch.job j on j.id = o.job_id
        join public."order" ord on ord.id = j.order_id
        left join lateral (
          select c.base_per_trip_kes, c.per_km_after_2km_kes
            from public.rider_rate_card c
           where c.city_id = j.city_id and c.status = 'current'
           order by c.effective_from desc
           limit 1) rc on true
       where o.rider_id = v_rider.id
         and o.outcome = 'pending'
         and (o.expires_at is null or o.expires_at > now())), '[]'::jsonb));
end;
$$;

revoke all on function public.rpc_rider_offers() from public, anon;
grant execute on function public.rpc_rider_offers() to authenticated;

-- ═════════════════════════════════════════════ 2. replies

create or replace function public.rpc_rider_message_reply(p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider_id uuid;
  v_body text := trim(coalesce(p_body, ''));
  v_id uuid;
begin
  select r.id into v_rider_id from public.rider r where r.user_id = (select auth.uid());
  if v_rider_id is null then
    raise exception 'Not a rider.' using errcode = 'insufficient_privilege';
  end if;
  if v_body = '' then
    raise exception 'Write a message first.' using errcode = 'check_violation';
  end if;
  if length(v_body) > 1000 then
    raise exception 'Keep it under 1,000 characters.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.rider_message m
       where m.rider_id = v_rider_id and m.direction = 'in'
         and m.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'That is a lot of messages in an hour. Rider ops will answer; for anything urgent call the rider line.'
      using errcode = 'check_violation';
  end if;

  insert into public.rider_message (rider_id, direction, channel, body)
  values (v_rider_id, 'in', 'in_app', v_body)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'message', 'Sent to rider ops.');
end;
$$;

revoke all on function public.rpc_rider_message_reply(text) from public, anon;
grant execute on function public.rpc_rider_message_reply(text) to authenticated;

-- ═════════════════════════════════════════════ 3. points

create table if not exists public.rider_points (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.rider (id) on delete cascade,
  reason text not null check (reason in
    ('delivery', 'on_time', 'five_stars', 'shift_kept', 'streak_7', 'training', 'referral')),
  /* What the points were for: an order id, a shift id, a training
     module, a referral id, or the last day of a 7-day streak. */
  source_ref text not null,
  points integer not null check (points > 0),
  earned_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (rider_id, reason, source_ref)
);

create index if not exists rider_points_rider_idx
  on public.rider_points (rider_id, earned_at desc);

alter table public.rider_points enable row level security;

drop policy if exists rider_points_read on public.rider_points;
create policy rider_points_read on public.rider_points
  for select to authenticated
  using (authz.is_rider_self(rider_id) or authz.can_manage_riders());

revoke all on public.rider_points from anon, authenticated;
grant select on public.rider_points to authenticated;

/* Award whatever the source rows say is due and not yet awarded. */
create or replace function public.fn_rider_points_sync(p_rider_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_added integer := 0;
  v_n integer;
begin
  -- completed deliveries, and on time ones
  insert into public.rider_points (rider_id, reason, source_ref, points, earned_at)
  select p_rider_id, 'delivery', o.id::text, 10, o.delivered_at
    from public."order" o
   where o.rider_id = p_rider_id and o.delivered_at is not null
     and o.stage::text not in ('cancelled', 'refunded')
  on conflict (rider_id, reason, source_ref) do nothing;
  get diagnostics v_n = row_count; v_added := v_added + v_n;

  insert into public.rider_points (rider_id, reason, source_ref, points, earned_at)
  select p_rider_id, 'on_time', o.id::text, 5, o.delivered_at
    from public."order" o
   where o.rider_id = p_rider_id and o.delivered_at is not null
     and o.promised_delivery_at is not null
     and o.delivered_at <= o.promised_delivery_at
     and o.stage::text not in ('cancelled', 'refunded')
  on conflict (rider_id, reason, source_ref) do nothing;
  get diagnostics v_n = row_count; v_added := v_added + v_n;

  -- 5-star ratings on the rider's deliveries
  insert into public.rider_points (rider_id, reason, source_ref, points, earned_at)
  select p_rider_id, 'five_stars', r.order_id::text, 5, r.created_at
    from public.order_rating r
   where r.rider_id = p_rider_id and r.stars = 5
  on conflict (rider_id, reason, source_ref) do nothing;
  get diagnostics v_n = row_count; v_added := v_added + v_n;

  -- booked shifts the rider turned up for
  insert into public.rider_points (rider_id, reason, source_ref, points, earned_at)
  select p_rider_id, 'shift_kept', s.id::text, 20, coalesce(s.showed_at, s.committed_at)
    from public.shift_commitment s
   where s.rider_id = p_rider_id and s.status::text = 'showed'
  on conflict (rider_id, reason, source_ref) do nothing;
  get diagnostics v_n = row_count; v_added := v_added + v_n;

  -- every 7 days in a row with a delivery (Nairobi days)
  insert into public.rider_points (rider_id, reason, source_ref, points, earned_at)
  select p_rider_id, 'streak_7', s.day::text, 50,
         (s.day + 1)::timestamp at time zone 'Africa/Nairobi' - interval '1 second'
    from (
      select d.day,
             row_number() over (partition by d.grp order by d.day) as n
        from (
          select x.day, x.day - (row_number() over (order by x.day))::integer as grp
            from (select distinct (o.delivered_at at time zone 'Africa/Nairobi')::date as day
                    from public."order" o
                   where o.rider_id = p_rider_id and o.delivered_at is not null
                     and o.stage::text not in ('cancelled', 'refunded')) x) d) s
   where s.n % 7 = 0
  on conflict (rider_id, reason, source_ref) do nothing;
  get diagnostics v_n = row_count; v_added := v_added + v_n;

  -- training modules passed
  insert into public.rider_points (rider_id, reason, source_ref, points, earned_at)
  select p_rider_id, 'training', t.module, 25, coalesce(t.completed_at, now())
    from public.rider_training t
   where t.rider_id = p_rider_id and t.passed
  on conflict (rider_id, reason, source_ref) do nothing;
  get diagnostics v_n = row_count; v_added := v_added + v_n;

  -- riders they referred who went active
  insert into public.rider_points (rider_id, reason, source_ref, points, earned_at)
  select p_rider_id, 'referral', rr.id::text, 200, coalesce(rr.first_trip_at, rr.created_at)
    from public.rider_referral rr
   where rr.referrer_rider_id = p_rider_id and rr.status = 'active'
  on conflict (rider_id, reason, source_ref) do nothing;
  get diagnostics v_n = row_count; v_added := v_added + v_n;

  return v_added;
end;
$$;

revoke all on function public.fn_rider_points_sync(uuid) from public, anon, authenticated;
grant execute on function public.fn_rider_points_sync(uuid) to service_role;

/*
 * The Rewards page in one read: points, this week's points, the latest
 * awards, and four badges worked out from real numbers:
 *   jobs_100      100 completed deliveries
 *   safety_star   30 days with no incident and at least 95% on time
 *                 (at least 10 deliveries in those 30 days)
 *   super_rider   rating 4.8 or more, over at least 50 deliveries
 *   top_rider     top 10 in the rider's city last week (Mon–Sun,
 *                 Nairobi) by deliveries, then rating
 */
create or replace function public.rpc_rider_rewards()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_week_start timestamptz := date_trunc('week', now() at time zone 'Africa/Nairobi')
                                at time zone 'Africa/Nairobi';
  v_delivered integer;
  v_d30 integer;
  v_on_time30 integer;
  v_incidents30 integer;
  v_ratings integer;
  v_rating numeric;
  v_rank integer;
  v_last_week integer;
begin
  select * into v_rider from public.rider r where r.user_id = (select auth.uid());
  if not found then
    raise exception 'Not a rider.' using errcode = 'insufficient_privilege';
  end if;

  perform public.fn_rider_points_sync(v_rider.id);

  select count(*),
         count(*) filter (where o.delivered_at > now() - interval '30 days'),
         count(*) filter (where o.delivered_at > now() - interval '30 days'
                            and o.promised_delivery_at is not null
                            and o.delivered_at <= o.promised_delivery_at)
    into v_delivered, v_d30, v_on_time30
    from public."order" o
   where o.rider_id = v_rider.id and o.delivered_at is not null
     and o.stage::text not in ('cancelled', 'refunded');

  select count(*) into v_incidents30
    from public.incident i
   where i.rider_id = v_rider.id and i.happened_at > now() - interval '30 days';

  select count(*), avg(r.stars) into v_ratings, v_rating
    from public.order_rating r where r.rider_id = v_rider.id;

  -- last week's standing in the rider's city
  with week as (
    select o.rider_id, count(*) as trips,
           avg(rt.stars) as stars
      from public."order" o
      join public.rider rd on rd.id = o.rider_id and rd.city_id = v_rider.city_id
      left join public.order_rating rt on rt.order_id = o.id
     where o.delivered_at >= v_week_start - interval '7 days'
       and o.delivered_at < v_week_start
       and o.stage::text not in ('cancelled', 'refunded')
     group by o.rider_id),
  ranked as (
    select w.rider_id, w.trips,
           rank() over (order by w.trips desc, coalesce(w.stars, 0) desc) as place
      from week w)
  select r.place, r.trips into v_rank, v_last_week
    from ranked r where r.rider_id = v_rider.id;

  return jsonb_build_object(
    'points', (select coalesce(sum(p.points), 0) from public.rider_points p
                where p.rider_id = v_rider.id),
    'weekPoints', (select coalesce(sum(p.points), 0) from public.rider_points p
                    where p.rider_id = v_rider.id and p.earned_at >= v_week_start),
    'byReason', coalesce((select jsonb_object_agg(x.reason, x.pts) from (
        select p.reason, sum(p.points) as pts from public.rider_points p
         where p.rider_id = v_rider.id group by p.reason) x), '{}'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object(
        'reason', p.reason, 'points', p.points, 'earnedAt', p.earned_at)
        order by p.earned_at desc) from (
          select * from public.rider_points p
           where p.rider_id = v_rider.id order by p.earned_at desc limit 8) p), '[]'::jsonb),
    'badges', jsonb_build_array(
      jsonb_build_object('key', 'top_rider',
        'earned', coalesce(v_rank <= 10, false),
        'note', case when v_rank is null then 'No deliveries last week'
                     else 'Number ' || v_rank || ' in your city last week' end),
      jsonb_build_object('key', 'jobs_100',
        'earned', v_delivered >= 100,
        'progress', least(v_delivered, 100), 'target', 100),
      jsonb_build_object('key', 'safety_star',
        'earned', v_incidents30 = 0 and v_d30 >= 10 and v_on_time30 * 100 >= v_d30 * 95,
        'note', case when v_incidents30 > 0 then 'An incident in the last 30 days'
                     when v_d30 < 10 then v_d30 || ' of 10 deliveries in 30 days'
                     else round(v_on_time30 * 100.0 / v_d30) || '% on time in 30 days' end),
      jsonb_build_object('key', 'super_rider',
        'earned', v_delivered >= 50 and v_ratings > 0 and v_rating >= 4.8,
        'note', case when v_ratings = 0 then 'No ratings yet'
                     else 'Rating ' || round(v_rating, 1) || ' over ' || v_delivered || ' deliveries' end)
    ));
end;
$$;

revoke all on function public.rpc_rider_rewards() from public, anon;
grant execute on function public.rpc_rider_rewards() to authenticated;
