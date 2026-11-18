-- Rider milestones in order events: every stage of a booking, and its rider.
--
-- booking.status_changed is sent only when a booking's shared status changes
-- (requested, confirmed, in_progress, completed, cancelled). A ride or a
-- courier moves through two stages inside one status, picked_up then
-- arriving, and a delivery gets a rider before anything is picked up: a
-- merchant's system heard none of that.
--
--   * booking.stage_changed: a booking's stage changed and its status did
--     not (preparing to ready, picked_up to arriving). With status_changed,
--     every stage change now sends exactly one event.
--   * booking.rider_assigned: a rider took the booking's delivery job, by
--     accepting an offer or by NexG operations assigning one, and again when
--     the job passes to another rider. It carries the booking and when the
--     rider was assigned. Nothing about the rider yet: what a merchant may see
--     of a rider is the owner's decision.
--   * The live events are written at commit, by deferred triggers, like
--     booking.created and booking.status_changed (20270101000100).
--   * The sandbox sends the same. A test booking can be moved to a stage, not
--     only a status (fn_api_test_order_stage), and a test ride or courier can
--     be given a test rider (fn_api_test_order_rider): by the API with a test
--     key (rpc_order_stage_api_test, rpc_order_rider_api_test) or from the
--     developer console (rpc_api_test_order_stage, rpc_api_test_order_rider).
--     api_test_order.rider_assigned_at records the test rider.
--
-- tg_api_webhook_order_event and tg_api_webhook_test_order_event are their
-- latest bodies (20270101000100, 20270104080100) with the new branches;
-- rpc_api_test_orders (20270104080100) also answers each booking's service
-- kind and test rider. CREATE OR REPLACE keeps their grants.
--
-- Rollback: re-run the three functions from those migrations; drop the
-- trigger api_webhook_rider_event on dispatch.job and the functions created
-- here; recreate api_webhook_test_order_event after insert or update of stage;
-- drop api_test_order.rider_assigned_at; restore the event type check without
-- the two new types (after deleting such events); delete the four
-- wiring_audit_exempt rows.

-- ═══════════════════════════════════════════════════════════════ the event types

alter table public.api_webhook_event drop constraint api_webhook_event_type_check;
alter table public.api_webhook_event add constraint api_webhook_event_type_check
  check (type in ('booking.created', 'booking.status_changed', 'booking.stage_changed',
                  'booking.rider_assigned', 'ping'));

-- ═══════════════════════════════════════════════════════════════ live bookings

/*
 * A live order was created, or its stage changed. Runs at commit, so the
 * order's lines exist by then. A change of status sends
 * booking.status_changed; a change of stage inside the same status sends
 * booking.stage_changed. The booking in the event shows the status and
 * stage of this change.
 */
create or replace function public.tg_api_webhook_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text := public.fn_api_booking_status(new.stage::text);
  v_previous text;
begin
  if not exists (
    select 1 from public.api_webhook_endpoint e
    where e.merchant_id = new.merchant_id and e.environment = 'live' and e.enabled) then
    return null;
  end if;

  if tg_op = 'INSERT' then
    perform public.fn_api_webhook_enqueue(new.merchant_id, 'live', 'booking.created', new.id,
      jsonb_build_object('booking',
        public.fn_api_order_object(new.id)
          || jsonb_build_object('status', v_status, 'stage', new.stage)));
  else
    v_previous := public.fn_api_booking_status(old.stage::text);
    if v_status is distinct from v_previous then
      perform public.fn_api_webhook_enqueue(new.merchant_id, 'live', 'booking.status_changed', new.id,
        jsonb_build_object(
          'booking', public.fn_api_order_object(new.id)
            || jsonb_build_object('status', v_status, 'stage', new.stage),
          'previous_status', v_previous,
          'previous_stage', old.stage));
    elsif new.stage is distinct from old.stage then
      perform public.fn_api_webhook_enqueue(new.merchant_id, 'live', 'booking.stage_changed', new.id,
        jsonb_build_object(
          'booking', public.fn_api_order_object(new.id)
            || jsonb_build_object('status', v_status, 'stage', new.stage),
          'previous_stage', old.stage));
    end if;
  end if;
  return null;
end;
$$;

/*
 * A rider took a live order's delivery job, or it passed to another rider.
 * Runs at commit, like the order's own events. A job released back to the
 * queue (no rider) sends nothing; the next rider's assignment does.
 */
create function public.tg_api_webhook_rider_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
begin
  if new.assigned_rider_id is null
     or (tg_op = 'UPDATE' and new.assigned_rider_id is not distinct from old.assigned_rider_id) then
    return null;
  end if;

  select o.merchant_id into v_merchant from public.order o where o.id = new.order_id;

  if v_merchant is null or not exists (
    select 1 from public.api_webhook_endpoint e
    where e.merchant_id = v_merchant and e.environment = 'live' and e.enabled) then
    return null;
  end if;

  perform public.fn_api_webhook_enqueue(v_merchant, 'live', 'booking.rider_assigned', new.order_id,
    jsonb_build_object(
      'booking', public.fn_api_order_object(new.order_id),
      'assigned_at', coalesce(new.assigned_at, now())));
  return null;
end;
$$;

create constraint trigger api_webhook_rider_event
  after insert or update of assigned_rider_id on dispatch.job
  deferrable initially deferred
  for each row execute function public.tg_api_webhook_rider_event();

-- ═══════════════════════════════════════════════════════════════ the sandbox

alter table public.api_test_order add column rider_assigned_at timestamptz;

comment on column public.api_test_order.rider_assigned_at is
  'When a test rider was last assigned (POST /v1/test/orders/{id}/rider). Null until then.';

/*
 * A sandbox booking was made, its stage changed, or a test rider was
 * assigned: the same events a live booking sends, for test endpoints.
 */
create or replace function public.tg_api_webhook_test_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_previous text;
begin
  if tg_op = 'INSERT' then
    perform public.fn_api_webhook_enqueue(new.merchant_id, 'test', 'booking.created', new.id,
      jsonb_build_object('booking', public.fn_api_test_order_object(new.id)));
    return null;
  end if;

  if new.stage is distinct from old.stage then
    v_status := public.fn_api_booking_status(new.stage);
    v_previous := public.fn_api_booking_status(old.stage);
    if v_status is distinct from v_previous then
      perform public.fn_api_webhook_enqueue(new.merchant_id, 'test', 'booking.status_changed', new.id,
        jsonb_build_object(
          'booking', public.fn_api_test_order_object(new.id)
            || jsonb_build_object('status', v_status, 'stage', new.stage),
          'previous_status', v_previous,
          'previous_stage', old.stage));
    else
      perform public.fn_api_webhook_enqueue(new.merchant_id, 'test', 'booking.stage_changed', new.id,
        jsonb_build_object(
          'booking', public.fn_api_test_order_object(new.id)
            || jsonb_build_object('status', v_status, 'stage', new.stage),
          'previous_stage', old.stage));
    end if;
  end if;

  if new.rider_assigned_at is not null
     and new.rider_assigned_at is distinct from old.rider_assigned_at then
    perform public.fn_api_webhook_enqueue(new.merchant_id, 'test', 'booking.rider_assigned', new.id,
      jsonb_build_object(
        'booking', public.fn_api_test_order_object(new.id),
        'assigned_at', new.rider_assigned_at));
  end if;
  return null;
end;
$$;

drop trigger api_webhook_test_order_event on public.api_test_order;
create trigger api_webhook_test_order_event
  after insert or update of stage, rider_assigned_at on public.api_test_order
  for each row execute function public.tg_api_webhook_test_order_event();

/*
 * A test key for the sandbox: active, test, with merchant_write, bound to a
 * merchant. The same refusals as rpc_order_status_api_test.
 */
create function public.fn_api_sandbox_key(p_api_key text)
returns public.api_key
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
begin
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if v_key.environment <> 'test' then
    raise exception 'Only a test key moves bookings. Real bookings move as the merchant and NexG work on them.'
      using errcode = '42501';
  end if;

  if not ('merchant_write'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot move test bookings: it needs merchant_write.'
      using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  return v_key;
end;
$$;

/*
 * Move one of a merchant's test bookings to a later stage: confirmed,
 * preparing, ready, picked_up, arriving, delivered, or cancelled before it
 * is delivered. Forward only; delivered and cancelled are final.
 */
create function public.fn_api_test_order_stage(
  p_id uuid,
  p_merchant_id uuid,
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.api_test_order;
  v_stage text := lower(btrim(coalesce(p_stage, '')));
  v_order text[] := array['placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered'];
  v_from integer;
  v_to integer;
  v_next text[];
begin
  if v_stage not in ('confirmed', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered', 'cancelled') then
    raise exception 'Move a test booking to confirmed, preparing, ready, picked_up, arriving, delivered or cancelled.'
      using errcode = '22023';
  end if;

  select * into t
  from public.api_test_order
  where id = p_id and merchant_id = p_merchant_id
  for update;

  if not found then
    raise exception 'That order does not exist.' using errcode = 'P0002';
  end if;

  if t.stage = v_stage then
    raise exception 'This test booking is already at %.', v_stage using errcode = '22023';
  end if;

  if t.stage in ('delivered', 'cancelled') then
    raise exception 'This test booking is %, so it cannot move again.',
      public.fn_api_booking_status(t.stage) using errcode = '22023';
  end if;

  v_from := array_position(v_order, t.stage);
  v_next := v_order[v_from + 1:] || array['cancelled'];
  v_to := array_position(v_order, v_stage);

  if v_stage <> 'cancelled' and (v_to is null or v_to <= v_from) then
    raise exception 'A test booking only moves forward. From % it can go to %.',
      t.stage, array_to_string(v_next, ', ')
      using errcode = '22023';
  end if;

  update public.api_test_order set stage = v_stage where id = p_id;

  return jsonb_build_object(
    'order', public.fn_api_test_order_object(p_id),
    'previous_status', public.fn_api_booking_status(t.stage),
    'previous_stage', t.stage);
end;
$$;

comment on function public.fn_api_test_order_stage(uuid, uuid, text) is
  'Move a merchant''s test booking to a later stage, or to cancelled. Sends booking.stage_changed or booking.status_changed to its test endpoints. Callers decide the merchant.';

/*
 * Give a test ride or courier a test rider, as a real one gets when a rider
 * accepts its delivery job. Again for a new rider. Not once it is completed
 * or cancelled.
 */
create function public.fn_api_test_order_rider(p_id uuid, p_merchant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.api_test_order;
  v_kind text;
  v_at timestamptz := clock_timestamp();
begin
  select * into t
  from public.api_test_order
  where id = p_id and merchant_id = p_merchant_id
  for update;

  if not found then
    raise exception 'That order does not exist.' using errcode = 'P0002';
  end if;

  select s.kind into v_kind from public.api_service s where s.code = t.service;
  if v_kind is null or v_kind not in ('ride', 'courier') then
    raise exception 'Only a ride or a courier has a rider.' using errcode = '22023';
  end if;

  if t.stage in ('delivered', 'cancelled') then
    raise exception 'This test booking is %, so it needs no rider.',
      public.fn_api_booking_status(t.stage) using errcode = '22023';
  end if;

  update public.api_test_order set rider_assigned_at = v_at where id = p_id;

  return jsonb_build_object(
    'order', public.fn_api_test_order_object(p_id),
    'assigned_at', v_at);
end;
$$;

comment on function public.fn_api_test_order_rider(uuid, uuid) is
  'Assign a test rider to a merchant''s test ride or courier. Sends booking.rider_assigned to its test endpoints. Callers decide the merchant.';

/* POST /v1/test/orders/{id}/status with a stage. */
create function public.rpc_order_stage_api_test(
  p_api_key text,
  p_order_id uuid,
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key := public.fn_api_sandbox_key(p_api_key);
begin
  return jsonb_build_object('ok', true)
    || public.fn_api_test_order_stage(p_order_id, v_key.merchant_id, p_stage);
end;
$$;

comment on function public.rpc_order_stage_api_test(text, uuid, text) is
  'Move a test booking to a later stage with a test API key (merchant_write).';

/* POST /v1/test/orders/{id}/rider. */
create function public.rpc_order_rider_api_test(p_api_key text, p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key := public.fn_api_sandbox_key(p_api_key);
begin
  return jsonb_build_object('ok', true)
    || public.fn_api_test_order_rider(p_order_id, v_key.merchant_id);
end;
$$;

comment on function public.rpc_order_rider_api_test(text, uuid) is
  'Assign a test rider to a test ride or courier with a test API key (merchant_write).';

/* The console's stage move. */
create function public.rpc_api_test_order_stage(p_order_id uuid, p_stage text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
begin
  perform authz.require_merchant_application_session();

  select t.merchant_id into v_merchant from public.api_test_order t where t.id = p_order_id;
  if not found or not public.fn_api_webhook_can_manage(v_merchant) then
    raise exception 'No such test booking.' using errcode = 'P0002';
  end if;

  return public.fn_api_test_order_stage(p_order_id, v_merchant, p_stage);
end;
$$;

comment on function public.rpc_api_test_order_stage(uuid, text) is
  'Move a test booking to a later stage from the developer console, for a merchant the person manages.';

/* The console's test rider. */
create function public.rpc_api_test_order_rider(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant uuid;
begin
  perform authz.require_merchant_application_session();

  select t.merchant_id into v_merchant from public.api_test_order t where t.id = p_order_id;
  if not found or not public.fn_api_webhook_can_manage(v_merchant) then
    raise exception 'No such test booking.' using errcode = 'P0002';
  end if;

  return public.fn_api_test_order_rider(p_order_id, v_merchant);
end;
$$;

comment on function public.rpc_api_test_order_rider(uuid) is
  'Assign a test rider to a test ride or courier from the developer console, for a merchant the person manages.';

/* The latest test bookings of every merchant the signed-in person owns. */
create or replace function public.rpc_api_test_orders(p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  perform authz.require_merchant_application_session();
  return coalesce((
    select jsonb_agg(x.item order by x.created_at desc, x.id desc)
    from (
      select t.id, t.created_at,
             public.fn_api_test_order_object(t.id) || jsonb_build_object(
               'merchant_id', t.merchant_id,
               'merchant_name', m.trading_name,
               'kind', s.kind,
               'rider_assigned_at', t.rider_assigned_at,
               'next', to_jsonb(public.fn_api_test_order_next(t.stage))) as item
      from public.api_test_order t
      join public.merchant m on m.id = t.merchant_id
      left join public.api_service s on s.code = t.service
      where t.merchant_id in (
        select mu.merchant_id from public.merchant_user mu
        where mu.user_id = v_user and mu.role = 'owner')
      order by t.created_at desc, t.id desc
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ audit and grants

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_order_stage_api_test',
   'Moves a sandbox booking made with a test API key. Sandbox bookings are never orders: they move no money, dispatch nothing and reach no customer, so they are not audited business events.',
   'api_test_order (stage) and the booking event in api_webhook_event'),
  ('rpc_order_rider_api_test',
   'Assigns a test rider to a sandbox booking. Sandbox bookings are never orders: they move no money, dispatch nothing and reach no customer, so they are not audited business events.',
   'api_test_order (rider_assigned_at) and the booking.rider_assigned event in api_webhook_event'),
  ('rpc_api_test_order_stage',
   'Moves a sandbox booking from the developer console. Sandbox bookings are never orders: they move no money, dispatch nothing and reach no customer, so they are not audited business events.',
   'api_test_order (stage) and the booking event in api_webhook_event'),
  ('rpc_api_test_order_rider',
   'Assigns a test rider to a sandbox booking from the developer console. Sandbox bookings are never orders: they move no money, dispatch nothing and reach no customer, so they are not audited business events.',
   'api_test_order (rider_assigned_at) and the booking.rider_assigned event in api_webhook_event')
on conflict (function_name) do nothing;

revoke all on function public.tg_api_webhook_rider_event() from public, anon, authenticated;
revoke all on function public.fn_api_sandbox_key(text) from public, anon, authenticated;
revoke all on function public.fn_api_test_order_stage(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.fn_api_test_order_rider(uuid, uuid) from public, anon, authenticated;

revoke all on function
  public.rpc_order_stage_api_test(text, uuid, text),
  public.rpc_order_rider_api_test(text, uuid)
  from public, anon, authenticated;
grant execute on function
  public.rpc_order_stage_api_test(text, uuid, text),
  public.rpc_order_rider_api_test(text, uuid)
  to service_role;

revoke all on function
  public.rpc_api_test_order_stage(uuid, text),
  public.rpc_api_test_order_rider(uuid)
  from public, anon;
grant execute on function
  public.rpc_api_test_order_stage(uuid, text),
  public.rpc_api_test_order_rider(uuid)
  to authenticated, service_role;
