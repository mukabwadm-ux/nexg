-- The rest of what a dispatcher can do: swap the rider, stack a
-- second order, pause a zone, and read the whole thing back
-- afterwards.
--
-- Two of these are heavier than they look. Pausing a zone stops
-- NexG taking money in a part of the city, so it is an ops-manager
-- decision with a reason and a `critical` audit line. Stacking
-- overrides a setting that exists to stop a rider carrying two hot
-- bags at once, so it is recorded as an override rather than a
-- normal assignment.

-- ══════════════════════════════════════════ reassign

create or replace function dispatch.fn_reassign_preview(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_owed bigint;
begin
  select * into o from public.order where id = p_order_id;
  if not found then return jsonb_build_object('ok', false); end if;

  v_owed := settings.fn_int('fees.cancellation_after_pickup', o.city_id);

  return jsonb_build_object(
    'ok', true,
    'has_rider', o.rider_id is not null,
    'past_pickup', o.picked_up_at is not null,
    /* A rider taken off a job they already collected has ridden for
       nothing. What they keep is the rate card's figure, and if
       Finance has not published one the screen says so rather than
       implying they get nothing. */
    'outgoing_owed_cents', case when o.picked_up_at is not null then v_owed end,
    'outgoing_owed_set', o.picked_up_at is null or v_owed is not null);
end;
$$;

create or replace function dispatch.rpc_reassign(
  p_order_id uuid, p_rider_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  j dispatch.job;
  v_me uuid;
  v_preview jsonb;
  v_outgoing uuid;
  v_window integer := 60;
  v_offer uuid;
  c record;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  v_me := dispatch.fn_require(o.city_id, 'reassign an order');

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. The outgoing rider is told this, and so is the guest.';
  end if;
  if o.delivered_at is not null then
    raise exception 'That order has been delivered.';
  end if;
  if o.rider_id = p_rider_id then
    raise exception 'That is the rider who already has it.';
  end if;

  v_preview := dispatch.fn_reassign_preview(p_order_id);
  v_outgoing := o.rider_id;

  select * into j from dispatch.job
   where order_id = p_order_id and state not in ('cancelled', 'completed');

  /* No job left running — the first one finished when it was
     assigned. Start a fresh one so the cascade stays readable as
     two separate attempts rather than one confusing thread. */
  if j.id is null then
    insert into dispatch.job (
      order_id, city_id, zone_id, pickup_point, dropoff_point,
      pickup_label, dropoff_label, distance_km, vehicle_requirements,
      state, round, radius_km)
    select order_id, city_id, zone_id, pickup_point, dropoff_point,
           pickup_label, dropoff_label, distance_km, vehicle_requirements,
           'queued', 0, radius_km
      from dispatch.job where order_id = p_order_id
     order by started_at desc limit 1
    returning * into j;
  end if;

  if j.id is null then
    raise exception 'That order was never dispatched, so there is nobody to reassign from.';
  end if;

  select * into c from dispatch.fn_candidates(j.id, true) x where x.rider_id = p_rider_id;
  if c.rider_id is null then
    raise exception 'That rider is not online in this city.';
  end if;
  if c.skip_reason in ('wrong_vehicle', 'cash_over_cap',
                       'not_alcohol_eligible', 'not_large_item_eligible') then
    raise exception 'Cannot: %.', c.note;
  end if;

  update dispatch.job
     set state = 'offering',
         round = j.round + 1,
         assigned_rider_id = null,
         assigned_at = null
   where id = j.id;

  insert into dispatch.offer (
    job_id, round, rank, rider_id, distance_km, eta_min,
    expires_at, outcome, direct, note)
  values (
    j.id, j.round + 1, 1, p_rider_id, c.distance_km, c.eta_min,
    now() + make_interval(secs => v_window), 'pending', true,
    'reassignment · ' || p_reason)
  returning id into v_offer;

  /* The order keeps no rider until the new one accepts. Showing the
     incoming rider before they have said yes is how a guest gets
     told about a rider who then declines. */
  update public.order set rider_id = null where id = p_order_id;

  insert into dispatch.action (job_id, kind, params, actor_id, reason)
  values (j.id, 'reassign',
          jsonb_build_object('from_rider_id', v_outgoing, 'to_rider_id', p_rider_id,
                             'offer_id', v_offer) || v_preview,
          v_me, p_reason);

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (p_order_id, 'reassigned', 'Rider changed',
          p_reason || case when (v_preview ->> 'past_pickup')::boolean
                           then ' · the outgoing rider had already collected' else '' end,
          'staff', v_me, v_preview);

  if v_outgoing is not null then
    insert into public.notification_log (channel, recipient, template, payload, status)
    select 'sms', r.phone, 'rider_reassigned_away',
           jsonb_build_object('order', o.reference, 'reason', p_reason) || v_preview,
           'queued'
      from public.rider r where r.id = v_outgoing;
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'dispatch.reassigned', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => p_order_id,
    p_target_label => o.reference, p_city_id => o.city_id,
    p_reason => p_reason, p_severity => 'notice',
    p_before => jsonb_build_object('rider_id', v_outgoing),
    p_after => jsonb_build_object('rider_id', p_rider_id) || v_preview);

  return jsonb_build_object('ok', true, 'offer_id', v_offer, 'window_s', v_window,
    'preview', v_preview,
    'message', 'Asked ' || c.name || ' · ' || v_window
      || ' seconds. The order has no rider until they accept.');
end;
$$;

-- ═══════════════════════════════════════ force a stack

create or replace function dispatch.rpc_force_stack(
  p_job_id uuid, p_rider_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j dispatch.job;
  v_me uuid;
  v_rank integer;
  v_offer uuid;
  c record;
begin
  select * into j from dispatch.job where id = p_job_id;
  if not found then raise exception 'No such job.'; end if;
  v_me := dispatch.fn_require(j.city_id, 'stack an order');

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. Stacking overrides a rule that exists to stop a rider carrying two orders at once.';
  end if;

  select * into c from dispatch.fn_candidates(p_job_id, true) x where x.rider_id = p_rider_id;
  if c.rider_id is null then
    raise exception 'That rider is not online in this city.';
  end if;
  if coalesce(c.skip_reason::text, 'stacking_not_allowed') <> 'stacking_not_allowed' then
    raise exception 'That rider is not excluded for stacking — they are excluded because %. Stacking will not help.',
      c.note;
  end if;

  select coalesce(max(rank), 0) + 1 into v_rank
    from dispatch.offer where job_id = p_job_id and round = j.round;

  insert into dispatch.offer (
    job_id, round, rank, rider_id, distance_km, eta_min,
    expires_at, outcome, direct, note)
  values (
    p_job_id, j.round, v_rank, p_rider_id, c.distance_km, c.eta_min,
    now() + make_interval(secs => 60), 'pending', true,
    'stacked by a dispatcher · ' || p_reason)
  returning id into v_offer;

  insert into dispatch.action (job_id, kind, params, actor_id, reason)
  values (p_job_id, 'force_stack',
          jsonb_build_object('rider_id', p_rider_id, 'offer_id', v_offer), v_me, p_reason);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'dispatch.stack_forced', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => j.order_id,
    p_target_label => (select reference from public.order where id = j.order_id),
    p_city_id => j.city_id, p_reason => p_reason, p_severity => 'notice',
    p_after => jsonb_build_object('rider_id', p_rider_id,
                                  'already_on', c.note));

  return jsonb_build_object('ok', true, 'offer_id', v_offer,
    'message', 'Asked ' || c.name || ' to take a second one. They can still say no.');
end;
$$;

-- ════════════════════════════════════════ pause a zone

/*
 * The single question checkout asks: can we take an order to this
 * point right now. One function, so a paused zone stops the money
 * in exactly one place rather than in however many the web app
 * remembers to check.
 */
create or replace function public.fn_zone_serviceable(p_point extensions.geography)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object(
       'ok', z.active and not coalesce(h.paused, false),
       'zone_id', z.id,
       'zone', z.name,
       'reason', case
         when not z.active then 'We are not delivering in this area yet.'
         when coalesce(h.paused, false) then
           'Deliveries here are paused right now'
           || coalesce(' · ' || h.paused_reason, '') || '.'
         end)
       from public.zone z
       left join dispatch.zone_health h on h.zone_id = z.id
      where extensions.st_intersects(z.polygon, p_point)
      order by z.active desc, z.tier
      limit 1),
    jsonb_build_object('ok', false, 'zone_id', null,
      'reason', 'That address is outside every area we deliver to.'))
$$;

comment on function public.fn_zone_serviceable is
  'The one question checkout asks before taking money. A paused zone stops orders here and nowhere else, so the pause cannot be half-applied.';

create or replace function dispatch.rpc_zone_pause(
  p_zone_id uuid, p_reason text, p_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  z public.zone;
  v_me uuid := authz.staff_id();
  v_live integer;
begin
  select * into z from public.zone where id = p_zone_id;
  if not found then raise exception 'No such zone.'; end if;

  /* Deliberately narrower than the live-ops grant. Pausing stops
     NexG taking money in part of a city. */
  if not (authz.is_super_admin()
          or authz.has_role('ops_manager', z.city_id)
          or authz.has_role('city_lead', z.city_id)) then
    raise exception 'Only an ops manager or city lead can pause a zone.' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. Guests see that deliveries are paused, and this is the line staff are asked about afterwards.';
  end if;

  select count(*) into v_live from public.order o
   where o.zone_id = p_zone_id
     and o.stage not in ('delivered', 'cancelled', 'refunded');

  insert into dispatch.zone_health as h (zone_id, paused, paused_reason, paused_until, state)
  values (p_zone_id, true, p_reason, p_until, 'short')
  on conflict (zone_id) do update set
    paused = true, paused_reason = p_reason, paused_until = p_until;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'dispatch.zone_paused', p_actor_id => v_me,
    p_target_type => 'zone', p_target_id => p_zone_id, p_target_label => z.name,
    p_city_id => z.city_id, p_reason => p_reason, p_severity => 'high',
    p_after => jsonb_build_object('until', p_until, 'orders_already_running', v_live));

  return jsonb_build_object('ok', true, 'live_orders', v_live,
    'message', 'Paused. No new orders into ' || z.name || '. '
      || case when v_live = 0 then 'Nothing is running there now.'
         else v_live || ' order' || case when v_live = 1 then '' else 's' end
              || ' already running still need finishing.' end);
end;
$$;

create or replace function dispatch.rpc_zone_resume(p_zone_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  z public.zone;
  v_me uuid := authz.staff_id();
begin
  select * into z from public.zone where id = p_zone_id;
  if not found then raise exception 'No such zone.'; end if;
  if not (authz.is_super_admin()
          or authz.has_role('ops_manager', z.city_id)
          or authz.has_role('city_lead', z.city_id)) then
    raise exception 'Only an ops manager or city lead can resume a zone.' using errcode = '42501';
  end if;

  update dispatch.zone_health
     set paused = false, paused_reason = null, paused_until = null, state = 'ok'
   where zone_id = p_zone_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'dispatch.zone_resumed', p_actor_id => v_me,
    p_target_type => 'zone', p_target_id => p_zone_id, p_target_label => z.name,
    p_city_id => z.city_id, p_reason => p_note, p_severity => 'notice');

  return jsonb_build_object('ok', true, 'message', z.name || ' is taking orders again.');
end;
$$;

/* A pause with an end time ends itself. A pause that outlives the
   reason for it is how a zone quietly stops earning for a week. */
create or replace function dispatch.cron_zone_unpause()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  with done as (
    update dispatch.zone_health
       set paused = false, paused_reason = null, paused_until = null, state = 'ok'
     where paused and paused_until is not null and paused_until < now()
    returning zone_id, paused_reason
  )
  select count(*) into v_n from done;

  return jsonb_build_object('ok', true, 'resumed', v_n);
end;
$$;

-- ══════════════════════════════════════════ replay

/*
 * Captured while the cascade runs, because riders move and no
 * query afterwards can say who was nearby at 20:14.
 */
create or replace function dispatch.cron_replay_capture()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer := 0;
  j record;
  v_days integer;
begin
  v_days := coalesce(settings.fn_int('dispatch.replay_retention_days', null)::int, 30);

  for j in select * from dispatch.job where state in ('queued', 'offering') loop
    insert into dispatch.replay as rp (job_id, snapshots, retained_until, updated_at)
    values (
      j.id,
      jsonb_build_array(jsonb_build_object(
        'at', now(),
        'round', j.round,
        'radius_km', j.radius_km,
        'riders', (
          select coalesce(jsonb_agg(jsonb_build_object(
                    'rider_id', l.rider_id,
                    'lat', extensions.st_y(l.point::extensions.geometry),
                    'lng', extensions.st_x(l.point::extensions.geometry),
                    'presence', l.presence)), '[]'::jsonb)
            from dispatch.fn_riders_live(j.city_id) l where l.point is not null),
        'offers', (
          select coalesce(jsonb_agg(jsonb_build_object(
                    'rider_id', o.rider_id, 'round', o.round, 'rank', o.rank,
                    'outcome', o.outcome, 'skip_reason', o.skip_reason)), '[]'::jsonb)
            from dispatch.offer o where o.job_id = j.id)
      )),
      current_date + v_days,
      now())
    on conflict (job_id) do update set
      /* Capped, so a job nobody closes cannot grow without limit. */
      snapshots = (
        select coalesce(jsonb_agg(s), '[]'::jsonb) from (
          select s from jsonb_array_elements(rp.snapshots || excluded.snapshots) s
          order by (s ->> 'at') desc limit 720
        ) k),
      retained_until = excluded.retained_until,
      updated_at = now();
    v_n := v_n + 1;
  end loop;

  delete from dispatch.replay where retained_until < current_date;

  return jsonb_build_object('ok', true, 'captured', v_n);
end;
$$;

create or replace function dispatch.rpc_replay(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  j dispatch.job;
  v_me uuid := authz.staff_id();
  v_snaps jsonb;
begin
  select * into j from dispatch.job where id = p_job_id;
  if not found then raise exception 'No such job.'; end if;

  /* Narrower than live ops: a replay is every rider's movements for
     a window of time, which is the most revealing thing this
     database holds about them. */
  if not (authz.is_super_admin()
          or authz.has_role('ops_manager', j.city_id)
          or authz.has_role('city_lead', j.city_id)) then
    raise exception 'Replay is for ops managers and city leads.' using errcode = '42501';
  end if;

  select snapshots into v_snaps from dispatch.replay where job_id = p_job_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'live_ops',
    p_action => 'dispatch.replay_viewed', p_actor_id => v_me,
    p_target_type => 'order', p_target_id => j.order_id,
    p_target_label => (select reference from public.order where id = j.order_id),
    p_city_id => j.city_id, p_severity => 'notice',
    p_context => jsonb_build_object('snapshots', jsonb_array_length(coalesce(v_snaps, '[]'::jsonb))));

  return jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'rules', j.rule_version_ids,
    'snapshots', coalesce(v_snaps, '[]'::jsonb),
    'offers', (select coalesce(jsonb_agg(to_jsonb(c) order by c.round, c.rank), '[]'::jsonb)
                 from public.console_cascade_v c where c.job_id = p_job_id),
    'actions', (select coalesce(jsonb_agg(to_jsonb(a) order by a.at), '[]'::jsonb)
                  from public.console_dispatch_actions_v a where a.job_id = p_job_id),
    'captured', v_snaps is not null,
    'message', case when v_snaps is null
      then 'No positions were captured for this one — capture runs while a cascade is live, so a job that resolved between captures has only its offers.'
      end);
end;
$$;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('dispatch.reassigned', 'live_ops', 'notice', false, false, true, '{}', 'An order was moved to a different rider'),
  ('dispatch.stack_forced', 'live_ops', 'notice', false, false, false, '{}', 'A rider was given a second order against the rule'),
  ('dispatch.zone_paused', 'live_ops', 'high', true, false, false, '{}', 'A zone stopped taking orders'),
  ('dispatch.zone_resumed', 'live_ops', 'notice', false, false, false, '{}', 'A zone started taking orders again'),
  /* Needs review, and names the field: a replay is every rider's
     movements for a window of time, which is the most revealing
     thing this database holds about them. */
  ('dispatch.replay_viewed', 'live_ops', 'notice', true, false, false, array['rider_location'], 'Somebody replayed a cascade, including rider positions')
on conflict (action) do nothing;

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('dispatch.replay_retention_days', 'retention', 'global', 'int', 'days',
   'How long cascade replays are kept',
   'A replay holds every rider''s movements for the window of a job. Thirty days covers an incident review; longer is surveillance nobody asked for.',
   false, false, 'super_admin+dpo', array['live_ops','audit'], '30'::jsonb, 400),
  ('dispatch.zone_tight_load', 'dispatch', 'city', 'pct', 'orders per free rider',
   'Orders per free rider before a zone reads tight',
   'Amber on the zones table. A warning, not a stop.',
   false, true, 'single:ops_manager', array['live_ops','dispatch'], '2'::jsonb, 210),
  ('dispatch.zone_short_load', 'dispatch', 'city', 'pct', 'orders per free rider',
   'Orders per free rider before a zone reads short',
   'Red on the zones table, and the point at which the supply actions appear.',
   false, true, 'single:ops_manager', array['live_ops','dispatch'], '4'::jsonb, 211)
on conflict (key) do nothing;

grant execute on function dispatch.fn_reassign_preview(uuid) to authenticated;
grant execute on function dispatch.rpc_reassign(uuid, uuid, text) to authenticated;
grant execute on function dispatch.rpc_force_stack(uuid, uuid, text) to authenticated;
grant execute on function public.fn_zone_serviceable(extensions.geography) to authenticated, anon;
grant execute on function dispatch.rpc_zone_pause(uuid, text, timestamptz) to authenticated;
grant execute on function dispatch.rpc_zone_resume(uuid, text) to authenticated;
grant execute on function dispatch.cron_zone_unpause() to service_role, authenticated;
grant execute on function dispatch.cron_replay_capture() to service_role, authenticated;
grant execute on function dispatch.rpc_replay(uuid) to authenticated;
