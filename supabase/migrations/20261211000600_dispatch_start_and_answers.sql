-- Dispatch: who may start it, and how two answers to one job are settled.
--
-- 1. dispatch.rpc_job_start (last defined in 20260101013550) runs as the
--    database owner, is granted to authenticated, and checked nothing about
--    the caller, so any signed-in account, including a temporary anonymous
--    one, could start a rider search for any order whose id it had. That
--    sends job offers to riders and opens a dispatch record for an order
--    nobody asked to dispatch. Now it takes live operations in the order's
--    city (authz.works_live_ops), or the service role. Nothing in the apps
--    calls it yet; the live screen is staff.
--
-- 2. dispatch.rpc_offer_respond (20260101013300) read the offer and the job
--    without locks. Two riders accepting one job at once could not both win,
--    because offer_is_final refuses any change to an answered offer, but the
--    second got that trigger's error, or a deadlock between the two, instead
--    of "Somebody else took it". The job row is now locked first and the
--    offer read again under that lock, so answers to one job queue and each
--    sees what the one before it did. A rider repeating an accept that
--    already went through gets the same answer back instead of an error.
--
--    fn_offer_round takes the same lock first, so a new round started while
--    a rider is answering waits its turn instead of deadlocking with it. The
--    staff actions that start rounds (boost, widen) already update the job
--    first.
--
-- 3. rpc_job_start added 'alcohol' to a bar's order as an untyped literal,
--    which text[] || reads as an array: starting dispatch for any bar order
--    that had not declared alcohol failed with "malformed array literal".
--    Found by `supabase db lint`. The literal is typed now.
--
-- Rollback: re-run dispatch.rpc_job_start from 20260101013550 and
-- dispatch.fn_offer_round and dispatch.rpc_offer_respond from 20260101013300.

create or replace function dispatch.rpc_job_start(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_job uuid;
  v_radius numeric;
  v_pickup extensions.geography;
  v_needs text[];
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;

  /* Starting a rider search is live operations' call, in the order's city. */
  if not (coalesce(auth.role(), '') = 'service_role' or authz.works_live_ops(o.city_id)) then
    raise exception 'Only live operations in this order''s city can start dispatch.'
      using errcode = '42501';
  end if;

  if exists (select 1 from dispatch.job j
             where j.order_id = p_order_id and j.state not in ('cancelled', 'completed')) then
    return jsonb_build_object('ok', true, 'already_running', true);
  end if;

  select extensions.st_setsrid(extensions.st_makepoint(b.longitude, b.latitude), 4326)::extensions.geography
    into v_pickup
    from public.merchant_branch b where b.id = o.branch_id;

  v_radius := coalesce(settings.fn_num('dispatch.search_radius_km', o.city_id), 3);

  /*
   * Whatever the order declared, plus alcohol if it came from a
   * bar. That one is a licence rather than a preference, so it is
   * not left to whoever placed the order to remember.
   */
  v_needs := o.carry_requirements;
  if exists (select 1 from public.merchant m
              where m.id = o.merchant_id and m.category = 'bar_liquor')
     and not ('alcohol' = any (v_needs)) then
    /* Typed: an untyped literal on the right of text[] || is read as an
       array, and 'alcohol' is not one. */
    v_needs := v_needs || 'alcohol'::text;
  end if;

  insert into dispatch.job (
    order_id, city_id, zone_id, pickup_point, dropoff_point,
    pickup_label, dropoff_label, distance_km, vehicle_requirements,
    state, round, radius_km, rule_version_ids)
  values (
    p_order_id, o.city_id, o.zone_id, v_pickup, o.dropoff_point,
    coalesce((select coalesce(m.trading_name, m.legal_name) from public.merchant m
               where m.id = o.merchant_id), 'Merchant'),
    o.dropoff_label,
    case when v_pickup is not null and o.dropoff_point is not null
         then round((extensions.st_distance(v_pickup, o.dropoff_point) / 1000.0)::numeric, 2) end,
    v_needs,
    'queued', 0, v_radius,
    /* Frozen: a job that started on a 20-second window is judged
       against a 20-second window. */
    jsonb_build_object(
      'accept_window_s', settings.fn_get('dispatch.accept_window_s', 'city', o.city_id) ->> 'version_id',
      'rounds', settings.fn_get('dispatch.rounds_before_boost', 'city', o.city_id) ->> 'version_id',
      'radius', settings.fn_get('dispatch.search_radius_km', 'city', o.city_id) ->> 'version_id'))
  returning id into v_job;

  perform dispatch.fn_offer_round(v_job);

  return jsonb_build_object('ok', true, 'job_id', v_job, 'needs', to_jsonb(v_needs));
end;
$$;

/*
 * One round: offer to everybody eligible, ranked, with a window.
 *
 * The skipped riders are written down too. A dispatcher asking "why
 * wasn't Rider D offered" gets an answer rather than an absence.
 */
create or replace function dispatch.fn_offer_round(p_job_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  j dispatch.job;
  v_window integer;
  v_round integer;
  v_n integer := 0;
  c record;
  v_rank integer := 0;
begin
  /* The job first, as rpc_offer_respond takes it: a round and an answer to
     the same job go one after the other. */
  select * into j from dispatch.job where id = p_job_id for update;
  if j.state in ('assigned', 'manual_assigned', 'cancelled', 'completed') then
    return 0;
  end if;

  v_window := coalesce(settings.fn_int('dispatch.accept_window_s', j.city_id)::int, 20);
  v_round := j.round + 1;

  /*
   * One live offer per rider per job. A dispatcher who widens or
   * boosts while a direct offer is still counting down would
   * otherwise leave that rider holding two cards for the same
   * order, and two accepts racing each other. The earlier offer is
   * withdrawn and says why, so the cascade still reads as what
   * happened.
   */
  update dispatch.offer
     set outcome = 'withdrawn', responded_at = now(),
         note = coalesce(note || ' · ', '') || 'withdrawn when round ' || v_round || ' started'
   where job_id = p_job_id and outcome = 'pending' and round < v_round;

  update dispatch.job set round = v_round, state = 'offering' where id = p_job_id;

  for c in select * from dispatch.fn_candidates(p_job_id, true) loop
    v_rank := v_rank + 1;
    insert into dispatch.offer (
      job_id, round, rank, rider_id, distance_km, eta_min,
      expires_at, outcome, skip_reason, responded_at, note)
    values (
      p_job_id, v_round, v_rank, c.rider_id, c.distance_km, c.eta_min,
      case when c.eligible then now() + make_interval(secs => v_window) end,
      case when c.eligible then 'pending' else 'skipped' end::dispatch.offer_outcome,
      c.skip_reason,
      case when not c.eligible then now() end,
      c.note);

    if c.eligible then v_n := v_n + 1; end if;
  end loop;

  /* Nobody at all is not the same as nobody who said yes, and the
     escalation reason records which. */
  if v_n = 0 then
    update dispatch.job
       set state = 'escalated', escalated_at = now(),
           escalation_reason = case when v_rank = 0 then 'no_eligible_riders'
                                    else 'radius_exhausted' end
     where id = p_job_id;
  end if;

  return v_n;
end;
$$;

create or replace function dispatch.rpc_offer_respond(
  p_offer_id uuid,
  p_accept boolean,
  p_decline_reason dispatch.decline_reason default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o dispatch.offer;
  j dispatch.job;
begin
  select * into o from dispatch.offer where id = p_offer_id;
  if not found then raise exception 'No such offer.'; end if;

  /* Answers to one job queue on the job row. Read again under the lock, the
     offer and the job are what the answer before this one left them. */
  select * into j from dispatch.job where id = o.job_id for update;
  select * into o from dispatch.offer where id = p_offer_id for update;

  if not (authz.is_rider_self(o.rider_id) or authz.works_live_ops(j.city_id)) then
    raise exception 'That offer is not yours.' using errcode = '42501';
  end if;

  if p_accept then
    /* The same accept again, after the first one went through. */
    if o.outcome = 'accepted' and j.assigned_rider_id is not distinct from o.rider_id then
      return jsonb_build_object('ok', true, 'accepted', true, 'order_id', j.order_id, 'duplicate', true);
    end if;

    /* First to accept wins; everyone after is told so rather than shown an error. */
    if j.state in ('assigned', 'manual_assigned') then
      if o.outcome = 'pending' then
        update dispatch.offer set outcome = 'withdrawn', responded_at = now()
         where id = p_offer_id;
      end if;
      return jsonb_build_object('ok', false, 'reason', 'already_taken',
        'message', 'Somebody else took it.');
    end if;

    if j.state in ('cancelled', 'completed') then
      if o.outcome = 'pending' then
        update dispatch.offer set outcome = 'withdrawn', responded_at = now()
         where id = p_offer_id;
      end if;
      return jsonb_build_object('ok', false, 'reason', 'job_closed',
        'message', 'This delivery is no longer running.');
    end if;
  end if;

  if o.outcome <> 'pending' then
    raise exception 'That offer has already been answered (%).', o.outcome;
  end if;
  if o.expires_at < now() then
    raise exception 'That offer expired % seconds ago.',
      (extract(epoch from now() - o.expires_at))::int;
  end if;

  if not p_accept then
    update dispatch.offer
       set outcome = 'declined', responded_at = now(), decline_reason = p_decline_reason
     where id = p_offer_id;
    return jsonb_build_object('ok', true, 'accepted', false);
  end if;

  update dispatch.offer
     set outcome = 'accepted', responded_at = now() where id = p_offer_id;

  /* Everyone else in the round is withdrawn rather than left pending, so the
     cascade reads correctly. */
  update dispatch.offer
     set outcome = 'withdrawn', responded_at = now()
   where job_id = o.job_id and outcome = 'pending' and id <> p_offer_id;

  update dispatch.job
     set state = case when o.direct then 'manual_assigned' else 'assigned' end::dispatch.job_state,
         assigned_at = now(), assigned_rider_id = o.rider_id
   where id = o.job_id;

  update public.order set rider_id = o.rider_id where id = j.order_id;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_label, payload)
  values (
    j.order_id, 'dispatch_accepted', 'Dispatch started',
    'Offered to ' || coalesce((select trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,''))
                               from public.rider r where r.id = o.rider_id), 'a rider')
      || ' (' || coalesce(o.distance_km::text, '—') || ' km) · accepted in '
      || greatest(1, (extract(epoch from now() - o.offered_at))::int) || ' s',
    'rider', '[Rider]',
    jsonb_build_object('rider_id', o.rider_id, 'round', o.round,
                       'seconds', (extract(epoch from now() - o.offered_at))::int,
                       'direct', o.direct));

  return jsonb_build_object('ok', true, 'accepted', true, 'order_id', j.order_id);
end;
$$;
