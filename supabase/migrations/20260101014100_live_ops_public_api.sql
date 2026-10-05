-- The console's door into the dispatch schema.
--
-- PostgREST only serves schemas in a list configured in the Supabase
-- dashboard, and a schema that is not on that list returns *nothing*
-- rather than an error. That failure is indistinguishable from a
-- quiet night: the live screen would show no orders, no riders and
-- no zones, and look entirely plausible doing it.
--
-- It has already cost this project three debugging sessions — the
-- audit zeroes, the integrations tile reading 0 / 9, and the whole
-- settings module rendering as locked. So rather than depend on that
-- setting a fourth time, every function the console calls gets a
-- `public.` wrapper here.
--
-- The wrappers hold no logic. They are invoker-rights, so the
-- definer function behind each one does its own authorisation
-- exactly as it would if called directly, and adding a wrapper can
-- never widen what somebody may do.

create or replace function public.rpc_dispatch_boost_retry(
  p_job_id uuid, p_boost_cents bigint default null)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_boost_retry(p_job_id, p_boost_cents) $$;

create or replace function public.rpc_dispatch_widen_preview(
  p_job_id uuid, p_radius_km numeric)
returns jsonb language sql stable set search_path = '' as $$
  select dispatch.fn_widen_preview(p_job_id, p_radius_km) $$;

create or replace function public.rpc_dispatch_widen_radius(
  p_job_id uuid, p_radius_km numeric)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_widen_radius(p_job_id, p_radius_km) $$;

create or replace function public.rpc_dispatch_assign_manual(
  p_job_id uuid, p_rider_id uuid, p_reason text)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_assign_manual(p_job_id, p_rider_id, p_reason) $$;

create or replace function public.rpc_dispatch_tell_guest_delay(
  p_order_id uuid, p_minutes integer, p_note text default null)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_tell_guest_delay(p_order_id, p_minutes, p_note) $$;

create or replace function public.rpc_dispatch_cancel_preview(p_order_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select dispatch.fn_cancel_preview(p_order_id) $$;

create or replace function public.rpc_dispatch_cancel(
  p_order_id uuid, p_reason_code text, p_note text default null)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_cancel(p_order_id, p_reason_code, p_note) $$;

create or replace function public.rpc_dispatch_reassign_preview(p_order_id uuid)
returns jsonb language sql stable set search_path = '' as $$
  select dispatch.fn_reassign_preview(p_order_id) $$;

create or replace function public.rpc_dispatch_reassign(
  p_order_id uuid, p_rider_id uuid, p_reason text)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_reassign(p_order_id, p_rider_id, p_reason) $$;

create or replace function public.rpc_dispatch_force_stack(
  p_job_id uuid, p_rider_id uuid, p_reason text)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_force_stack(p_job_id, p_rider_id, p_reason) $$;

create or replace function public.rpc_zone_pause(
  p_zone_id uuid, p_reason text, p_until timestamptz default null)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_zone_pause(p_zone_id, p_reason, p_until) $$;

create or replace function public.rpc_zone_resume(p_zone_id uuid, p_note text default null)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_zone_resume(p_zone_id, p_note) $$;

create or replace function public.rpc_dispatch_replay(p_job_id uuid)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_replay(p_job_id) $$;

create or replace function public.rpc_dispatch_job_start(p_order_id uuid)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_job_start(p_order_id) $$;

create or replace function public.rpc_dispatch_offer_respond(
  p_offer_id uuid, p_accept boolean, p_decline_reason text default null)
returns jsonb language sql set search_path = '' as $$
  select dispatch.rpc_offer_respond(
    p_offer_id, p_accept, p_decline_reason::dispatch.decline_reason) $$;

/* The candidate list with its reasons, for the Assign chooser. */
create or replace function public.rpc_dispatch_candidates(
  p_job_id uuid, p_include_ineligible boolean default true)
returns table (
  rider_id uuid, name text, vehicle text, plate_no text,
  distance_km numeric, eta_min integer, cash_on_hand_cents bigint,
  presence text, eligible boolean, skip_reason text, note text)
language sql stable set search_path = '' as $$
  select c.rider_id, c.name, c.vehicle, c.plate_no, c.distance_km, c.eta_min,
         c.cash_on_hand_cents, c.presence, c.eligible, c.skip_reason::text, c.note
    from dispatch.fn_candidates(p_job_id, p_include_ineligible) c $$;

/* Where everybody is, for the map and the list mode. */
create or replace function public.rpc_riders_live(p_city_id uuid)
returns table (
  rider_id uuid, name text, vehicle text, plate_no text, presence text,
  presence_since timestamptz, lat double precision, lng double precision,
  last_seen_at timestamptz, zone_id uuid, zone_name text,
  current_order_reference text, cash_on_hand_cents bigint, cash_cap_cents bigint,
  offers_paused boolean, offers_paused_reason text,
  cooldown_until timestamptz, cooldown_reason text,
  health_band text, top_decile boolean, phone_masked text)
language sql stable set search_path = '' as $$
  select l.rider_id, l.name, l.vehicle, l.plate_no, l.presence, l.presence_since,
         extensions.st_y(l.point::extensions.geometry),
         extensions.st_x(l.point::extensions.geometry),
         l.last_seen_at, l.zone_id, l.zone_name, l.current_order_reference,
         l.cash_on_hand_cents, l.cash_cap_cents, l.offers_paused, l.offers_paused_reason,
         l.cooldown_until, l.cooldown_reason, l.health_band, l.top_decile,
         public.fn_mask_phone(l.phone)
    from dispatch.fn_riders_live(p_city_id) l $$;

/*
 * The live screen's map needs pickup and drop-off as plain numbers.
 * A separate function rather than columns on `console_live_orders_v`,
 * because a dropped pin is a guest's home address and most of the
 * console has no business holding one.
 */
create or replace function public.rpc_live_order_points(p_city_id uuid)
returns table (
  order_id uuid, reference text, urgency text, stage text,
  pickup_lat double precision, pickup_lng double precision,
  dropoff_lat double precision, dropoff_lng double precision,
  radius_km numeric, rider_id uuid)
language sql stable security definer set search_path = '' as $$
  select o.id, o.reference,
    case
      when o.stage in ('cancelled', 'refunded') then 'closed'
      when o.stage = 'delivered' then 'done'
      when j.state = 'escalated' then 'needs_a_person'
      when public.fn_order_lateness(o.promised_delivery_at, null) > 0 then 'late'
      when j.state in ('queued', 'offering') then 'finding_a_rider'
      else 'running'
    end,
    o.stage::text,
    extensions.st_y(j.pickup_point::extensions.geometry),
    extensions.st_x(j.pickup_point::extensions.geometry),
    extensions.st_y(o.dropoff_point::extensions.geometry),
    extensions.st_x(o.dropoff_point::extensions.geometry),
    j.radius_km, o.rider_id
  from public.order o
  left join dispatch.job j
    on j.order_id = o.id and j.state not in ('cancelled', 'completed')
  where o.city_id = p_city_id
    and o.stage not in ('delivered', 'cancelled', 'refunded')
    and authz.works_live_ops(p_city_id)
$$;

grant execute on function public.rpc_dispatch_boost_retry(uuid, bigint) to authenticated;
grant execute on function public.rpc_dispatch_widen_preview(uuid, numeric) to authenticated;
grant execute on function public.rpc_dispatch_widen_radius(uuid, numeric) to authenticated;
grant execute on function public.rpc_dispatch_assign_manual(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_dispatch_tell_guest_delay(uuid, integer, text) to authenticated;
grant execute on function public.rpc_dispatch_cancel_preview(uuid) to authenticated;
grant execute on function public.rpc_dispatch_cancel(uuid, text, text) to authenticated;
grant execute on function public.rpc_dispatch_reassign_preview(uuid) to authenticated;
grant execute on function public.rpc_dispatch_reassign(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_dispatch_force_stack(uuid, uuid, text) to authenticated;
grant execute on function public.rpc_zone_pause(uuid, text, timestamptz) to authenticated;
grant execute on function public.rpc_zone_resume(uuid, text) to authenticated;
grant execute on function public.rpc_dispatch_replay(uuid) to authenticated;
grant execute on function public.rpc_dispatch_job_start(uuid) to authenticated, service_role;
grant execute on function public.rpc_dispatch_offer_respond(uuid, boolean, text) to authenticated;
grant execute on function public.rpc_dispatch_candidates(uuid, boolean) to authenticated;
grant execute on function public.rpc_riders_live(uuid) to authenticated;
grant execute on function public.rpc_live_order_points(uuid) to authenticated;

/* The two modules exist in the sidebar but have had nowhere to go. */
update public.console_module set href = '/live' where key = 'live_ops';
update public.console_module set href = '/orders' where key = 'orders';
