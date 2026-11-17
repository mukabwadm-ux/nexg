-- Test bookings that move through their statuses.
--
-- A booking made with a test key (api_test_order) stayed requested for ever,
-- so a developer could see booking.created arrive but never
-- booking.status_changed. Now a test booking can be moved on, and each move
-- sends booking.status_changed to the merchant's test endpoints, built the
-- same way a live one is.
--
--   * fn_api_test_order_move holds the rules. A test booking only moves
--     forward: requested, confirmed, in_progress, completed, skipping steps
--     if asked; or to cancelled from any status before completed. completed
--     and cancelled are final. Each status gets the first stage real orders
--     use for it: confirmed, picked_up, delivered, cancelled.
--   * rpc_order_status_api_test serves POST /v1/test/orders/{id}/status, for a
--     test key with merchant_write bound to a merchant. Like the other
--     sandbox functions it is granted to service_role only, and it refuses a
--     live key: real bookings move as the merchant and NexG work on them.
--   * rpc_api_test_orders, rpc_api_test_order_sample and
--     rpc_api_test_order_move serve the developer console's Test bookings
--     card: the merchant's owner, in a current session, makes a sample test
--     booking and moves it on without writing code. The same people who
--     manage the merchant's webhook endpoints (fn_api_webhook_can_manage).
--   * tg_api_webhook_test_order_event now also runs when a test booking's
--     stage changes, and sends booking.status_changed when its shared status
--     changes, with previous_status and previous_stage, as the live trigger
--     does. Its insert branch is unchanged.
--
-- Sandbox bookings stay out of the audit chain, as rpc_order_place_api_test
-- does: they move no money, dispatch nothing and reach no customer.
--
-- Rollback: drop the six functions created here; re-run
-- tg_api_webhook_test_order_event from 20270101000100 and recreate its
-- trigger after insert only; delete the three wiring_audit_exempt rows.

-- ═══════════════════════════════════════════════════════════════ the rules

/* The statuses a test booking at this stage may move to, nearest first. */
create function public.fn_api_test_order_next(p_stage text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case public.fn_api_booking_status(p_stage)
    when 'requested' then array['confirmed', 'in_progress', 'completed', 'cancelled']
    when 'confirmed' then array['in_progress', 'completed', 'cancelled']
    when 'in_progress' then array['completed', 'cancelled']
    else array[]::text[]
  end
$$;

comment on function public.fn_api_test_order_next(text) is
  'The shared statuses a test booking at this stage may move to, nearest first. Empty once it is completed or cancelled.';

/*
 * Move one of a merchant's test bookings to a later status. Every caller
 * has already decided the merchant: the key's, or one the person manages.
 */
create function public.fn_api_test_order_move(
  p_id uuid,
  p_merchant_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.api_test_order;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_from text;
  v_next text[];
begin
  if v_status not in ('confirmed', 'in_progress', 'completed', 'cancelled') then
    raise exception 'Move a test booking to confirmed, in_progress, completed or cancelled.'
      using errcode = '22023';
  end if;

  select * into t
  from public.api_test_order
  where id = p_id and merchant_id = p_merchant_id
  for update;

  if not found then
    raise exception 'That order does not exist.' using errcode = 'P0002';
  end if;

  v_from := public.fn_api_booking_status(t.stage);
  v_next := public.fn_api_test_order_next(t.stage);

  if v_status = v_from then
    raise exception 'This test booking is already %.', v_from using errcode = '22023';
  end if;

  if cardinality(v_next) = 0 then
    raise exception 'This test booking is %, so it cannot move again.', v_from
      using errcode = '22023';
  end if;

  if not (v_status = any (v_next)) then
    raise exception 'A test booking only moves forward. From % it can go to %.',
      v_from, array_to_string(v_next, ', ')
      using errcode = '22023';
  end if;

  update public.api_test_order
     set stage = case v_status
                   when 'confirmed' then 'confirmed'
                   when 'in_progress' then 'picked_up'
                   when 'completed' then 'delivered'
                   else 'cancelled'
                 end
   where id = p_id;

  return jsonb_build_object(
    'order', public.fn_api_test_order_object(p_id),
    'previous_status', v_from);
end;
$$;

comment on function public.fn_api_test_order_move(uuid, uuid, text) is
  'Move a merchant''s test booking forward (or to cancelled). The update fires booking.status_changed for its test endpoints. Callers decide the merchant.';

-- ═══════════════════════════════════════════════════════════════ the API

/*
 * POST /v1/test/orders/{id}/status. The key decides the merchant, as in
 * rpc_order_read_api_test, so a key cannot move another merchant's booking:
 * it gets the same P0002 as an id that does not exist.
 */
create function public.rpc_order_status_api_test(
  p_api_key text,
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
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

  return jsonb_build_object('ok', true)
    || public.fn_api_test_order_move(p_order_id, v_key.merchant_id, p_status);
end;
$$;

comment on function public.rpc_order_status_api_test(text, uuid, text) is
  'Move a test booking to a later status with a test API key (merchant_write). Sends booking.status_changed to the merchant''s test endpoints.';

-- ═══════════════════════════════════════════════════════════════ the developer console

/* The latest test bookings of every merchant the signed-in person owns. */
create function public.rpc_api_test_orders(p_limit integer default 20)
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
               'next', to_jsonb(public.fn_api_test_order_next(t.stage))) as item
      from public.api_test_order t
      join public.merchant m on m.id = t.merchant_id
      where t.merchant_id in (
        select mu.merchant_id from public.merchant_user mu
        where mu.user_id = v_user and mu.role = 'owner')
      order by t.created_at desc, t.id desc
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) x
  ), '[]'::jsonb);
end;
$$;

comment on function public.rpc_api_test_orders(integer) is
  'The developer console''s test bookings: the latest of every merchant the signed-in person owns, with the statuses each may move to.';

/*
 * Make a sample test booking from the console: one of the service, priced
 * as the sandbox prices it (NexG's price in the merchant's city, else the
 * sample KES 1,000). Its booking.created goes to the merchant's test
 * endpoints, as one made with a test key does.
 */
create function public.rpc_api_test_order_sample(p_merchant_id uuid, p_service text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_service public.api_service;
  v_price jsonb;
  v_total bigint;
  v_source text;
  v_carried boolean;
  v_id uuid;
  v_ref text;
begin
  perform authz.require_merchant_application_session();

  if p_merchant_id is null or not public.fn_api_webhook_can_manage(p_merchant_id) then
    raise exception 'Test bookings are made by the merchant''s owner.' using errcode = '42501';
  end if;

  select s.* into v_service
  from public.api_service s
  where s.code = nullif(btrim(coalesce(p_service, '')), '')
    and s.active;

  if not found then
    raise exception 'That service is not one we offer.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.api_test_order t
    where t.merchant_id = p_merchant_id and t.api_key_id is null
      and t.created_at > now() - interval '5 seconds') then
    raise exception 'A test booking was just made. Wait a few seconds.' using errcode = '22023';
  end if;

  select m.* into v_merchant from public.merchant m where m.id = p_merchant_id;

  v_price := public.fn_price_api_service(v_merchant.city_id, v_service, 1, 1, now());
  if coalesce((v_price ->> 'ok')::boolean, false) then
    v_total := (v_price ->> 'total_cents')::bigint;
    v_source := 'settings';
  else
    v_total := 100000;
    v_source := 'sample';
  end if;

  v_carried := v_service.kind in ('ride', 'courier');
  v_ref := 'TEST-' || to_char(now() at time zone 'Africa/Nairobi', 'YYMMDD') || '-'
    || upper(left(replace(gen_random_uuid()::text, '-', ''), 6));

  insert into public.api_test_order (
    merchant_id, api_key_id, reference, service, quantity, total_cents, price_source,
    scheduled_for, pickup_label, dropoff_label, payload
  ) values (
    p_merchant_id, null, v_ref, v_service.code, 1, v_total, v_source,
    null,
    case when v_carried then 'Sample pickup' end,
    case when v_carried then 'Sample drop-off' else v_service.label end,
    jsonb_build_object('service', v_service.code, 'quantity', 1, 'source', 'developer_console')
  ) returning id into v_id;

  return public.fn_api_test_order_object(v_id);
end;
$$;

comment on function public.rpc_api_test_order_sample(uuid, text) is
  'Make a sample test booking from the developer console, for a merchant the person manages. Sends booking.created to its test endpoints.';

/* Move a test booking on from the console. */
create function public.rpc_api_test_order_move(p_order_id uuid, p_status text)
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

  return public.fn_api_test_order_move(p_order_id, v_merchant, p_status);
end;
$$;

comment on function public.rpc_api_test_order_move(uuid, text) is
  'Move a test booking forward from the developer console, for a merchant the person manages. Sends booking.status_changed to its test endpoints.';

-- ═══════════════════════════════════════════════════════════════ the event

/*
 * A sandbox booking was made, or its stage changed: its events go to test
 * endpoints. A stage change inside the same status sends nothing, as for
 * live orders.
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

  v_status := public.fn_api_booking_status(new.stage);
  v_previous := public.fn_api_booking_status(old.stage);
  if v_status is distinct from v_previous then
    perform public.fn_api_webhook_enqueue(new.merchant_id, 'test', 'booking.status_changed', new.id,
      jsonb_build_object(
        'booking', public.fn_api_test_order_object(new.id)
          || jsonb_build_object('status', v_status, 'stage', new.stage),
        'previous_status', v_previous,
        'previous_stage', old.stage));
  end if;
  return null;
end;
$$;

drop trigger api_webhook_test_order_event on public.api_test_order;
create trigger api_webhook_test_order_event
  after insert or update of stage on public.api_test_order
  for each row execute function public.tg_api_webhook_test_order_event();

-- ═══════════════════════════════════════════════════════════════ audit and grants

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_order_status_api_test',
   'Moves a sandbox booking made with a test API key. Sandbox bookings are never orders: they move no money, dispatch nothing and reach no customer, so they are not audited business events.',
   'api_test_order (stage) and the booking.status_changed event in api_webhook_event'),
  ('rpc_api_test_order_sample',
   'Makes a sandbox booking from the developer console. Sandbox bookings are never orders: they move no money, dispatch nothing and reach no customer, so they are not audited business events.',
   'api_test_order (merchant_id, payload source developer_console, created_at) and the booking.created event in api_webhook_event'),
  ('rpc_api_test_order_move',
   'Moves a sandbox booking from the developer console. Sandbox bookings are never orders: they move no money, dispatch nothing and reach no customer, so they are not audited business events.',
   'api_test_order (stage) and the booking.status_changed event in api_webhook_event')
on conflict (function_name) do nothing;

revoke all on function public.fn_api_test_order_next(text) from public, anon, authenticated;
revoke all on function public.fn_api_test_order_move(uuid, uuid, text) from public, anon, authenticated;

revoke all on function public.rpc_order_status_api_test(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.rpc_order_status_api_test(text, uuid, text) to service_role;

revoke all on function
  public.rpc_api_test_orders(integer),
  public.rpc_api_test_order_sample(uuid, text),
  public.rpc_api_test_order_move(uuid, text)
  from public, anon;
grant execute on function
  public.rpc_api_test_orders(integer),
  public.rpc_api_test_order_sample(uuid, text),
  public.rpc_api_test_order_move(uuid, text)
  to authenticated, service_role;
