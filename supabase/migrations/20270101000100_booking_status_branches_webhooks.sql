-- Phase 1 of the shared booking format: one status for every booking,
-- every branch of a merchant, and order events (webhooks).
--
-- Status. A booking's stage says where it is in its own workflow (an order
-- is preparing, picked_up, arriving); its status says the same thing in the
-- five words every workflow shares: requested, confirmed, in_progress,
-- completed, cancelled. fn_api_booking_status maps one to the other, and the
-- order reads (live and sandbox) now answer both. A booking completed and
-- later disputed or refunded stays completed; its stage and payment_status
-- say what happened after.
--
-- Branches. merchant_branch_public publishes the open branches of listed
-- merchants: name, address, position, contact, place type and today's hours.
-- Nothing a rider or the merchant's team uses internally.
--
-- Events. See the order events section below.
--
-- The two read functions are their latest bodies (20261219000100 for the live
-- read, 20261217000100 for the sandbox read) with one added line each, the
-- status. CREATE OR REPLACE keeps their grants.
--
-- Rollback: select cron.unschedule('api-webhooks'); drop the triggers
-- api_webhook_order_event and api_webhook_test_order_event, the functions
-- and tables named api_webhook_*, fn_api_order_object, fn_api_test_order_object
-- and the view merchant_branch_public; delete from vault.secrets where name
-- like 'api_webhook:%'; re-run the two read functions from the migrations
-- above, then drop fn_api_booking_status.

-- ═══════════════════════════════════════════════════════════════ status

create function public.fn_api_booking_status(p_stage text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stage
    when 'placed' then 'requested'
    when 'confirmed' then 'confirmed'
    when 'preparing' then 'confirmed'
    when 'ready' then 'confirmed'
    when 'picked_up' then 'in_progress'
    when 'arriving' then 'in_progress'
    when 'delivered' then 'completed'
    when 'disputed' then 'completed'
    when 'refunded' then 'completed'
    when 'cancelled' then 'cancelled'
  end
$$;

comment on function public.fn_api_booking_status(text) is
  'The shared booking status (requested, confirmed, in_progress, completed, cancelled) of an order stage. Null for a stage it does not know, which a test keeps from happening.';

grant execute on function public.fn_api_booking_status(text) to anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════ branches

create view public.merchant_branch_public
with (security_invoker = false)
as
select
  b.id,
  b.merchant_id,
  b.name,
  b.address_text as address,
  b.latitude,
  b.longitude,
  b.is_primary,
  b.place_type,
  b.public_contact as contact,
  b.paused_at is not null as paused,
  (select h.opens from public.fn_merchant_effective_hours(b.merchant_id, b.id, current_date) h) as opens_today,
  (select h.closes from public.fn_merchant_effective_hours(b.merchant_id, b.id, current_date) h) as closes_today,
  (select h.closed from public.fn_merchant_effective_hours(b.merchant_id, b.id, current_date) h) as closed_today,
  b.sort
from public.merchant_branch b
join public.merchant m on m.id = b.merchant_id
where m.status = 'live'
  and m.explore_visible
  and m.deleted_at is null
  and b.deleted_at is null
  and b.closed_at is null;

comment on view public.merchant_branch_public is
  'The open branches of listed merchants, as the public API shows them: no rider phone, pickup instructions or pause reasons.';

grant select on public.merchant_branch_public to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ the reads answer status

create or replace function public.rpc_order_read_api(
  p_api_key text,
  p_order_id uuid default null,
  p_limit integer default 25,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_has_cursor boolean := p_cursor_created_at is not null and p_cursor_id is not null;
  v_items jsonb;
  v_found integer;
  v_last jsonb;
begin
  -- The credential: the key decides the merchant, and only merchant_read reads.
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if v_key.environment <> 'live' then
    raise exception 'A test key reads test bookings, never real orders.' using errcode = '42501';
  end if;

  if not ('merchant_read'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot read a merchant''s orders.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null
     or not exists (select 1 from public.merchant m where m.id = v_key.merchant_id) then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  /*
   * One order, or a page of them, through the same shape builder, so a
   * single order and a list item are the same object. A page fetches one
   * row more than it returns; that row only says there is a next page.
   */
  with page as (
    select
      o.id,
      o.reference,
      o.stage,
      o.payment_method,
      o.payment_status,
      o.currency,
      o.total_cents,
      o.scheduled_for,
      o.dropoff_label,
      o.created_at,
      o.delivery_context,
      -- An API booking answers the quantity it was booked with; its line
      -- may say 1 for a flat service. Other orders count their lines.
      coalesce(
        case when o.channel = 'api' then (o.delivery_context ->> 'quantity')::integer end,
        i.quantity, 1
      ) as quantity,
      row_number() over (order by o.created_at desc, o.id desc) as n
    from public.order o
    left join lateral (
      select sum(oi.quantity) as quantity
      from public.order_item oi
      where oi.order_id = o.id and oi.removed_at is null
    ) i on true
    where o.merchant_id = v_key.merchant_id
      and (
        (p_order_id is not null and o.id = p_order_id)
        or (
          p_order_id is null
          and (not v_has_cursor or (o.created_at, o.id) < (p_cursor_created_at, p_cursor_id))
        )
      )
    order by o.created_at desc, o.id desc
    limit case when p_order_id is not null then 1 else v_limit + 1 end
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', p.id,
          'reference', p.reference,
          'service', coalesce(p.delivery_context ->> 'service', ''),
          'quantity', p.quantity,
          'stage', p.stage,
          'status', public.fn_api_booking_status(p.stage::text),
          'payment_method', p.payment_method,
          'payment_status', p.payment_status,
          'currency', p.currency,
          'total_cents', p.total_cents,
          'scheduled_for', p.scheduled_for,
          'pickup_label', p.delivery_context ->> 'pickup_label',
          'dropoff_label', p.dropoff_label,
          'created_at', p.created_at
        ) order by p.n
      ) filter (where p.n <= v_limit),
      '[]'::jsonb
    ),
    count(*)
  into v_items, v_found
  from page p;

  if p_order_id is not null then
    if v_found = 0 then
      raise exception 'That order does not exist.' using errcode = '22023';
    end if;
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  if v_found <= v_limit then
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  -- The next page starts after the last order kept on this one.
  v_last := v_items -> (v_limit - 1);
  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'next_cursor', jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'order_id'
    )
  );
end;
$$;

create or replace function public.rpc_order_read_api_test(
  p_api_key text,
  p_order_id uuid default null,
  p_limit integer default 25,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_has_cursor boolean := p_cursor_created_at is not null and p_cursor_id is not null;
  v_items jsonb;
  v_found integer;
  v_last jsonb;
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
    raise exception 'A live key reads real orders, not test bookings.' using errcode = '42501';
  end if;

  if not ('merchant_read'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot read a merchant''s orders.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  with page as (
    select
      t.*,
      row_number() over (order by t.created_at desc, t.id desc) as n
    from public.api_test_order t
    where t.merchant_id = v_key.merchant_id
      and (
        (p_order_id is not null and t.id = p_order_id)
        or (
          p_order_id is null
          and (not v_has_cursor or (t.created_at, t.id) < (p_cursor_created_at, p_cursor_id))
        )
      )
    order by t.created_at desc, t.id desc
    limit case when p_order_id is not null then 1 else v_limit + 1 end
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', p.id,
          'reference', p.reference,
          'service', p.service,
          'quantity', p.quantity,
          'stage', p.stage,
          'status', public.fn_api_booking_status(p.stage),
          'payment_method', p.payment_method,
          'payment_status', p.payment_status,
          'currency', p.currency,
          'total_cents', p.total_cents,
          'scheduled_for', p.scheduled_for,
          'pickup_label', p.pickup_label,
          'dropoff_label', p.dropoff_label,
          'created_at', p.created_at
        ) order by p.n
      ) filter (where p.n <= v_limit),
      '[]'::jsonb
    ),
    count(*)
  into v_items, v_found
  from page p;

  if p_order_id is not null then
    if v_found = 0 then
      raise exception 'That order does not exist.' using errcode = '22023';
    end if;
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  if v_found <= v_limit then
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  v_last := v_items -> (v_limit - 1);
  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'next_cursor', jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'order_id'
    )
  );
end;
$$;

-- ═══════════════════════════════════════════════════════════════ order events (webhooks)
--
-- A merchant registers an https endpoint, live or test, in the developer
-- console. When one of its bookings is created or its status changes, NexG
-- posts a signed JSON event to every enabled endpoint of that environment,
-- and keeps retrying with growing gaps until the endpoint answers 2xx.
--
--   * api_webhook_endpoint: where to send. The signing secret lives in
--     Vault; a row keeps only its name and first characters.
--   * api_webhook_event: one row per thing that happened, holding the body
--     exactly as it is sent. A retry sends the same body, signed afresh.
--   * api_webhook_delivery: one row per event and endpoint: attempts, the
--     next try, the last answer.
--   * Live events are written at commit, by a deferred trigger on
--     public.order, so an order's lines exist when its event is built.
--   * fn_api_webhook_dispatch, run every minute by pg_cron, reads the
--     answers to earlier attempts from pg_net, then sends what is due. A
--     signature is HMAC-SHA256 over "<t>.<body>", the scheme banks already
--     use to call NexG.
--   * Only a status code and a short error are kept from an answer, never
--     its body: an endpoint is somebody else's server.

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('api.webhook_endpoint_created', 'settings', 'notice', false, false, false,
   'A webhook endpoint was added for a merchant'),
  ('api.webhook_endpoint_changed', 'settings', 'notice', false, false, false,
   'A webhook endpoint was switched on or off'),
  ('api.webhook_endpoint_deleted', 'settings', 'notice', false, false, false,
   'A webhook endpoint was removed'),
  ('api.webhook_test_sent', 'settings', 'info', false, false, false,
   'A test event was sent to a webhook endpoint')
on conflict (action) do nothing;

create table public.api_webhook_endpoint (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  environment text not null check (environment in ('live', 'test')),
  url text not null check (length(url) between 12 and 300),
  description text check (description is null or length(description) <= 120),
  -- The Vault secret's name, api_webhook:<id>. The value never leaves Vault
  -- except to sign a delivery inside fn_api_webhook_dispatch.
  secret_ref text not null,
  -- whsec_ and six more characters, so a developer can tell secrets apart.
  secret_prefix text not null,
  enabled boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_delivery_at timestamptz,
  last_delivery_ok boolean,
  last_status_code integer,
  constraint api_webhook_endpoint_once unique (merchant_id, environment, url)
);

create index api_webhook_endpoint_enabled_idx
  on public.api_webhook_endpoint (merchant_id, environment) where enabled;

comment on table public.api_webhook_endpoint is
  'Where a merchant''s booking events are sent: https on a public host, live or test, five per environment.';

create table public.api_webhook_event (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  environment text not null check (environment in ('live', 'test')),
  type text not null check (type in ('booking.created', 'booking.status_changed', 'ping')),
  booking_id uuid,
  body jsonb not null,
  created_at timestamptz not null default now()
);

create index api_webhook_event_age_idx on public.api_webhook_event (created_at);

comment on table public.api_webhook_event is
  'One booking event, with the body exactly as it is sent. Kept 30 days.';

create table public.api_webhook_delivery (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.api_webhook_event (id) on delete cascade,
  endpoint_id uuid not null references public.api_webhook_endpoint (id) on delete cascade,
  state text not null default 'queued'
    check (state in ('queued', 'sending', 'delivered', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  -- The pg_net request of the attempt in flight.
  request_id bigint,
  sent_at timestamptz,
  delivered_at timestamptz,
  last_status_code integer,
  last_error text check (last_error is null or length(last_error) <= 200),
  created_at timestamptz not null default now(),
  constraint api_webhook_delivery_once unique (event_id, endpoint_id)
);

create index api_webhook_delivery_due_idx
  on public.api_webhook_delivery (next_attempt_at) where state = 'queued';
create index api_webhook_delivery_sending_idx
  on public.api_webhook_delivery (sent_at) where state = 'sending';
create index api_webhook_delivery_endpoint_idx
  on public.api_webhook_delivery (endpoint_id, created_at desc);

comment on table public.api_webhook_delivery is
  'One event to one endpoint: queued, sending, delivered or failed after eight attempts.';

-- Reached only through the functions below.
alter table public.api_webhook_endpoint enable row level security;
alter table public.api_webhook_event enable row level security;
alter table public.api_webhook_delivery enable row level security;
revoke all on public.api_webhook_endpoint, public.api_webhook_event, public.api_webhook_delivery
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────── addresses

/*
 * Where NexG may send a merchant's events: https, a DNS name with at least
 * two labels whose last starts with a letter (so no IP address in any
 * notation and no IPv6 literal), no user:password@, port 443 only, and no
 * name that only resolves inside a network. Checked when an endpoint is
 * saved and again before every delivery.
 */
create function public.fn_api_webhook_url_ok(p_url text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_authority text;
  v_host text;
begin
  if p_url is null or length(p_url) > 300 or p_url !~ '^https://[^\s]+$' then
    return false;
  end if;
  v_authority := substring(p_url from '^https://([^/?#]*)');
  if v_authority is null or v_authority = '' or position('@' in v_authority) > 0 then
    return false;
  end if;
  if position(':' in v_authority) > 0 then
    if v_authority !~ ':443$' then
      return false;
    end if;
    v_authority := left(v_authority, length(v_authority) - 4);
  end if;
  v_host := lower(v_authority);
  if v_host !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$' then
    return false;
  end if;
  if v_host ~ '(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa)$' then
    return false;
  end if;
  return true;
end;
$$;

-- ─────────────────────────────────────────────────────────── who manages them

/* The merchant's owner, or NexG merchant operations for its city: the same
   people who may issue the merchant's API keys. */
create function public.fn_api_webhook_can_manage(p_merchant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_staff uuid := authz.staff_id();
  v_city uuid;
begin
  select m.city_id into v_city from public.merchant m where m.id = p_merchant_id;
  if not found then
    return false;
  end if;
  return exists (
      select 1 from public.merchant_user mu
      where mu.merchant_id = p_merchant_id and mu.user_id = v_user and mu.role = 'owner')
    or exists (
      select 1 from public.role_grant rg join public.role r on r.id = rg.role_id
      where rg.staff_user_id = v_staff and r.key in ('super_admin', 'merchant_ops')
        and (rg.city_id is null or rg.city_id = v_city)
        and rg.revoked_at is null and (rg.expires_at is null or rg.expires_at > now()));
end;
$$;

-- ─────────────────────────────────────────────────────────── the booking an event carries

/* A real order as GET /v1/orders returns it, status included. */
create function public.fn_api_order_object(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', o.id,
    'reference', o.reference,
    'service', coalesce(o.delivery_context ->> 'service', ''),
    'quantity', coalesce(
      case when o.channel = 'api' then (o.delivery_context ->> 'quantity')::integer end,
      i.quantity, 1),
    'status', public.fn_api_booking_status(o.stage::text),
    'stage', o.stage,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'currency', o.currency,
    'total_cents', o.total_cents,
    'scheduled_for', o.scheduled_for,
    'pickup_label', o.delivery_context ->> 'pickup_label',
    'dropoff_label', o.dropoff_label,
    'created_at', o.created_at
  )
  from public.order o
  left join lateral (
    select sum(oi.quantity) as quantity
    from public.order_item oi
    where oi.order_id = o.id and oi.removed_at is null
  ) i on true
  where o.id = p_order_id
$$;

/* A sandbox booking as GET /v1/orders returns it to a test key. */
create function public.fn_api_test_order_object(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_id', t.id,
    'reference', t.reference,
    'service', t.service,
    'quantity', t.quantity,
    'status', public.fn_api_booking_status(t.stage),
    'stage', t.stage,
    'payment_method', t.payment_method,
    'payment_status', t.payment_status,
    'currency', t.currency,
    'total_cents', t.total_cents,
    'scheduled_for', t.scheduled_for,
    'pickup_label', t.pickup_label,
    'dropoff_label', t.dropoff_label,
    'created_at', t.created_at
  )
  from public.api_test_order t
  where t.id = p_id
$$;

-- ─────────────────────────────────────────────────────────── writing events

/*
 * Write one event for a merchant's enabled endpoints of one environment (or
 * for one endpoint, for a test event). Nothing is written when no endpoint
 * would receive it. Returns the event id, or null.
 */
create function public.fn_api_webhook_enqueue(
  p_merchant_id uuid,
  p_environment text,
  p_type text,
  p_booking_id uuid,
  p_data jsonb,
  p_endpoint_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  insert into public.api_webhook_event (id, merchant_id, environment, type, booking_id, body, created_at)
  select v_event, p_merchant_id, p_environment, p_type, p_booking_id,
    jsonb_build_object(
      'id', v_event,
      'type', p_type,
      'api_version', 'v1',
      'environment', p_environment,
      'created_at', v_now,
      'data', p_data),
    v_now
  where exists (
    select 1 from public.api_webhook_endpoint e
    where e.merchant_id = p_merchant_id and e.environment = p_environment and e.enabled
      and (p_endpoint_id is null or e.id = p_endpoint_id));

  if not found then
    return null;
  end if;

  insert into public.api_webhook_delivery (event_id, endpoint_id)
  select v_event, e.id
  from public.api_webhook_endpoint e
  where e.merchant_id = p_merchant_id and e.environment = p_environment and e.enabled
    and (p_endpoint_id is null or e.id = p_endpoint_id);

  return v_event;
end;
$$;

/*
 * A live order was created, or its stage changed. Runs at commit, so the
 * order's lines exist by then. A stage change inside the same status (from
 * preparing to ready, say) sends nothing: events follow the shared status.
 * The booking in the event shows the status and stage of this change.
 */
create function public.tg_api_webhook_order_event()
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
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger api_webhook_order_event
  after insert or update of stage on public.order
  deferrable initially deferred
  for each row execute function public.tg_api_webhook_order_event();

/* A sandbox booking was made with a test key: its event goes to test endpoints. */
create function public.tg_api_webhook_test_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_api_webhook_enqueue(new.merchant_id, 'test', 'booking.created', new.id,
    jsonb_build_object('booking', public.fn_api_test_order_object(new.id)));
  return null;
end;
$$;

create trigger api_webhook_test_order_event
  after insert on public.api_test_order
  for each row execute function public.tg_api_webhook_test_order_event();

-- ─────────────────────────────────────────────────────────── sending

/*
 * Run every minute. First the answers to earlier attempts: 2xx is
 * delivered; anything else, an error or no answer within 10 seconds is
 * tried again after 1 minute, 5, 30, 2 hours, 6, 12 and 24 (eight attempts,
 * about two days), then failed. Then what is due is signed and sent.
 */
create function public.fn_api_webhook_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d record;
  r record;
  v_found boolean;
  v_ok boolean;
  v_secret text;
  v_t text;
  v_signature text;
  v_request bigint;
  v_answered integer := 0;
  v_sent integer := 0;
  v_gaps interval[] := array[
    '1 minute', '5 minutes', '30 minutes', '2 hours', '6 hours', '12 hours', '24 hours'
  ]::interval[];
  v_max integer := 8;
begin
  -- One dispatcher at a time.
  if not pg_try_advisory_xact_lock(hashtextextended('api_webhook_dispatch', 0)) then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  for d in
    select dl.id, dl.endpoint_id, dl.attempts, dl.request_id, dl.sent_at
    from public.api_webhook_delivery dl
    where dl.state = 'sending'
    for update skip locked
  loop
    select resp.status_code, resp.error_msg, resp.timed_out into r
    from net._http_response resp
    where resp.id = d.request_id;
    v_found := found;

    if not v_found and d.sent_at > now() - interval '2 minutes' then
      continue;  -- still on its way
    end if;

    v_ok := v_found and r.error_msg is null and not coalesce(r.timed_out, false)
      and r.status_code between 200 and 299;

    if v_ok then
      update public.api_webhook_delivery
         set state = 'delivered', delivered_at = now(), last_status_code = r.status_code,
             last_error = null, request_id = null
       where id = d.id;
    else
      update public.api_webhook_delivery
         set state = case when d.attempts >= v_max then 'failed' else 'queued' end,
             next_attempt_at = now() + v_gaps[least(greatest(d.attempts, 1), array_length(v_gaps, 1))],
             last_status_code = case when v_found then r.status_code end,
             last_error = left(case
               when not v_found then 'No answer was recorded.'
               when r.error_msg is not null then r.error_msg
               when coalesce(r.timed_out, false) then 'No answer within 10 seconds.'
               else 'Answered ' || r.status_code || '.'
             end, 200),
             request_id = null
       where id = d.id;
    end if;

    update public.api_webhook_endpoint
       set last_delivery_at = now(), last_delivery_ok = v_ok,
           last_status_code = case when v_found then r.status_code end
     where id = d.endpoint_id;
    v_answered := v_answered + 1;
  end loop;

  for d in
    select dl.id, dl.event_id, e.url, e.secret_ref, e.environment, ev.type, ev.body
    from public.api_webhook_delivery dl
    join public.api_webhook_endpoint e on e.id = dl.endpoint_id
    join public.api_webhook_event ev on ev.id = dl.event_id
    where dl.state = 'queued' and dl.next_attempt_at <= now() and e.enabled
    order by dl.next_attempt_at
    limit 200
    for update of dl skip locked
  loop
    if not public.fn_api_webhook_url_ok(d.url) then
      update public.api_webhook_delivery
         set state = 'failed', last_error = 'The endpoint address is not allowed.'
       where id = d.id;
      continue;
    end if;

    select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds
    where ds.name = d.secret_ref;
    if v_secret is null then
      update public.api_webhook_delivery
         set state = 'failed', last_error = 'The signing secret is missing.'
       where id = d.id;
      continue;
    end if;

    -- pg_net sends body::text, so that is the text signed.
    v_t := floor(extract(epoch from clock_timestamp()))::bigint::text;
    v_signature := encode(extensions.hmac(v_t || '.' || d.body::text, v_secret, 'sha256'), 'hex');
    v_request := net.http_post(
      url := d.url,
      body := d.body,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'User-Agent', 'NexG-Webhooks/1.0',
        'NexG-Event-Id', d.event_id::text,
        'NexG-Event-Type', d.type,
        'NexG-Environment', d.environment,
        'NexG-Signature', 't=' || v_t || ',v1=' || v_signature),
      timeout_milliseconds := 10000);

    update public.api_webhook_delivery
       set state = 'sending', attempts = attempts + 1, request_id = v_request, sent_at = now()
     where id = d.id;
    v_sent := v_sent + 1;
  end loop;

  -- A month of history is enough to answer "did you send it?".
  delete from public.api_webhook_event where created_at < now() - interval '30 days';

  return jsonb_build_object('ok', true, 'answered', v_answered, 'sent', v_sent);
end;
$$;

-- ─────────────────────────────────────────────────────────── the developer console

/* Add an endpoint. The signing secret is returned once and never again. */
create function public.rpc_api_webhook_endpoint_create(
  p_merchant_id uuid,
  p_url text,
  p_environment text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_staff uuid := authz.staff_id();
  v_id uuid := gen_random_uuid();
  v_url text := btrim(coalesce(p_url, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_secret text;
begin
  perform authz.require_merchant_application_session();
  if p_merchant_id is null or not public.fn_api_webhook_can_manage(p_merchant_id) then
    raise exception 'Only the merchant''s owner can add its webhook endpoints.' using errcode = '42501';
  end if;
  if p_environment is null or p_environment not in ('live', 'test') then
    raise exception 'An endpoint is live or test.' using errcode = '22023';
  end if;
  if not public.fn_api_webhook_url_ok(v_url) then
    raise exception 'Use an https address on a public host, such as https://example.com/nexg/events.'
      using errcode = '22023';
  end if;
  if length(v_description) > 120 then
    raise exception 'Keep the description to 120 characters.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.api_webhook_endpoint e
    where e.merchant_id = p_merchant_id and e.environment = p_environment and e.url = v_url) then
    raise exception 'That address is already an endpoint.' using errcode = '23505';
  end if;
  if (select count(*) from public.api_webhook_endpoint e
      where e.merchant_id = p_merchant_id and e.environment = p_environment) >= 5 then
    raise exception 'A merchant can have five endpoints in each environment.' using errcode = '22023';
  end if;

  v_secret := 'whsec_' || replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');
  perform vault.create_secret(v_secret, 'api_webhook:' || v_id::text,
    'Signing secret of a merchant webhook endpoint');

  insert into public.api_webhook_endpoint (
    id, merchant_id, environment, url, description, secret_ref, secret_prefix, created_by
  ) values (
    v_id, p_merchant_id, p_environment, v_url, v_description,
    'api_webhook:' || v_id::text, left(v_secret, 12), coalesce(v_staff, v_user)
  );

  perform audit.log(
    p_actor_type => case when v_staff is null then 'merchant_user'::public.actor_type
                         else 'staff'::public.actor_type end,
    p_actor_id => coalesce(v_staff, v_user), p_module => 'settings',
    p_action => 'api.webhook_endpoint_created',
    p_target_type => 'api_webhook_endpoint', p_target_id => v_id,
    p_after => jsonb_build_object('merchant_id', p_merchant_id, 'environment', p_environment,
      'url', v_url));

  return jsonb_build_object('id', v_id, 'secret', v_secret, 'secret_prefix', left(v_secret, 12));
end;
$$;

/* The endpoints of every merchant the signed-in person owns. */
create function public.rpc_api_webhook_endpoints()
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
    select jsonb_agg(jsonb_build_object(
      'id', e.id,
      'merchant_id', e.merchant_id,
      'merchant_name', m.trading_name,
      'environment', e.environment,
      'url', e.url,
      'description', e.description,
      'secret_prefix', e.secret_prefix,
      'enabled', e.enabled,
      'created_at', e.created_at,
      'last_delivery_at', e.last_delivery_at,
      'last_delivery_ok', e.last_delivery_ok,
      'last_status_code', e.last_status_code,
      'waiting', (select count(*) from public.api_webhook_delivery d
                  where d.endpoint_id = e.id and d.state in ('queued', 'sending')),
      'failed', (select count(*) from public.api_webhook_delivery d
                 where d.endpoint_id = e.id and d.state = 'failed')
    ) order by m.trading_name, e.environment, e.created_at)
    from public.api_webhook_endpoint e
    join public.merchant m on m.id = e.merchant_id
    where e.merchant_id in (
      select mu.merchant_id from public.merchant_user mu
      where mu.user_id = v_user and mu.role = 'owner')
  ), '[]'::jsonb);
end;
$$;

/* Switch an endpoint off or on. Off drops what was waiting for it. */
create function public.rpc_api_webhook_endpoint_set_enabled(p_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_staff uuid := authz.staff_id();
  e public.api_webhook_endpoint;
begin
  perform authz.require_merchant_application_session();
  select * into e from public.api_webhook_endpoint where id = p_id for update;
  if not found or not public.fn_api_webhook_can_manage(e.merchant_id) then
    raise exception 'No such endpoint.' using errcode = 'P0002';
  end if;
  if p_enabled is null then
    raise exception 'Say whether the endpoint is on or off.' using errcode = '22023';
  end if;

  update public.api_webhook_endpoint set enabled = p_enabled where id = p_id;
  if not p_enabled then
    update public.api_webhook_delivery
       set state = 'failed', last_error = 'The endpoint was switched off.'
     where endpoint_id = p_id and state = 'queued';
  end if;

  perform audit.log(
    p_actor_type => case when v_staff is null then 'merchant_user'::public.actor_type
                         else 'staff'::public.actor_type end,
    p_actor_id => coalesce(v_staff, v_user), p_module => 'settings',
    p_action => 'api.webhook_endpoint_changed',
    p_target_type => 'api_webhook_endpoint', p_target_id => p_id,
    p_before => jsonb_build_object('enabled', e.enabled),
    p_after => jsonb_build_object('enabled', p_enabled));
end;
$$;

/* Remove an endpoint, its signing secret and its delivery history. */
create function public.rpc_api_webhook_endpoint_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_staff uuid := authz.staff_id();
  e public.api_webhook_endpoint;
begin
  perform authz.require_merchant_application_session();
  select * into e from public.api_webhook_endpoint where id = p_id for update;
  if not found or not public.fn_api_webhook_can_manage(e.merchant_id) then
    raise exception 'No such endpoint.' using errcode = 'P0002';
  end if;

  delete from vault.secrets where name = e.secret_ref;
  delete from public.api_webhook_endpoint where id = p_id;

  perform audit.log(
    p_actor_type => case when v_staff is null then 'merchant_user'::public.actor_type
                         else 'staff'::public.actor_type end,
    p_actor_id => coalesce(v_staff, v_user), p_module => 'settings',
    p_action => 'api.webhook_endpoint_deleted',
    p_target_type => 'api_webhook_endpoint', p_target_id => p_id,
    p_before => jsonb_build_object('merchant_id', e.merchant_id, 'environment', e.environment,
      'url', e.url));
end;
$$;

/* Send a ping to one endpoint, to check it receives and verifies events. */
create function public.rpc_api_webhook_ping(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_staff uuid := authz.staff_id();
  e public.api_webhook_endpoint;
  v_event uuid;
begin
  perform authz.require_merchant_application_session();
  select * into e from public.api_webhook_endpoint where id = p_id for update;
  if not found or not public.fn_api_webhook_can_manage(e.merchant_id) then
    raise exception 'No such endpoint.' using errcode = 'P0002';
  end if;
  if not e.enabled then
    raise exception 'Switch the endpoint on first.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.api_webhook_delivery d
    join public.api_webhook_event ev on ev.id = d.event_id
    where d.endpoint_id = p_id and ev.type = 'ping' and d.created_at > now() - interval '10 seconds') then
    raise exception 'A test event was just sent. Wait a few seconds.' using errcode = '22023';
  end if;

  v_event := public.fn_api_webhook_enqueue(e.merchant_id, e.environment, 'ping', null,
    jsonb_build_object('endpoint_id', e.id,
      'message', 'A test event from the NexG developer console.'),
    p_id);

  perform audit.log(
    p_actor_type => case when v_staff is null then 'merchant_user'::public.actor_type
                         else 'staff'::public.actor_type end,
    p_actor_id => coalesce(v_staff, v_user), p_module => 'settings',
    p_action => 'api.webhook_test_sent',
    p_target_type => 'api_webhook_endpoint', p_target_id => p_id,
    p_after => jsonb_build_object('event_id', v_event));

  return v_event;
end;
$$;

/* The latest deliveries to one endpoint, newest first. */
create function public.rpc_api_webhook_deliveries(p_endpoint_id uuid, p_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e public.api_webhook_endpoint;
begin
  perform authz.require_merchant_application_session();
  select * into e from public.api_webhook_endpoint where id = p_endpoint_id;
  if not found or not public.fn_api_webhook_can_manage(e.merchant_id) then
    raise exception 'No such endpoint.' using errcode = 'P0002';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) order by x.created_at desc)
    from (
      select d.id, ev.id as event_id, ev.type,
             ev.body #>> '{data,booking,reference}' as reference,
             ev.body #>> '{data,booking,status}' as status,
             d.state, d.attempts, d.last_status_code, d.last_error,
             d.created_at, d.delivered_at,
             case when d.state = 'queued' then d.next_attempt_at end as next_attempt_at
      from public.api_webhook_delivery d
      join public.api_webhook_event ev on ev.id = d.event_id
      where d.endpoint_id = p_endpoint_id
      order by d.created_at desc
      limit greatest(1, least(coalesce(p_limit, 20), 50))
    ) x
  ), '[]'::jsonb);
end;
$$;

-- ─────────────────────────────────────────────────────────── grants

revoke all on function public.fn_api_webhook_url_ok(text) from public, anon, authenticated;
revoke all on function public.fn_api_webhook_can_manage(uuid) from public, anon, authenticated;
revoke all on function public.fn_api_order_object(uuid) from public, anon, authenticated;
revoke all on function public.fn_api_test_order_object(uuid) from public, anon, authenticated;
revoke all on function public.fn_api_webhook_enqueue(uuid, text, text, uuid, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.tg_api_webhook_order_event() from public, anon, authenticated;
revoke all on function public.tg_api_webhook_test_order_event() from public, anon, authenticated;
revoke all on function public.fn_api_webhook_dispatch() from public, anon, authenticated;
grant execute on function public.fn_api_webhook_dispatch() to service_role;

revoke all on function
  public.rpc_api_webhook_endpoint_create(uuid, text, text, text),
  public.rpc_api_webhook_endpoints(),
  public.rpc_api_webhook_endpoint_set_enabled(uuid, boolean),
  public.rpc_api_webhook_endpoint_delete(uuid),
  public.rpc_api_webhook_ping(uuid),
  public.rpc_api_webhook_deliveries(uuid, integer)
  from public, anon;
grant execute on function
  public.rpc_api_webhook_endpoint_create(uuid, text, text, text),
  public.rpc_api_webhook_endpoints(),
  public.rpc_api_webhook_endpoint_set_enabled(uuid, boolean),
  public.rpc_api_webhook_endpoint_delete(uuid),
  public.rpc_api_webhook_ping(uuid),
  public.rpc_api_webhook_deliveries(uuid, integer)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────── every minute

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; webhook deliveries are not scheduled.';
    return;
  end if;
  perform cron.schedule('api-webhooks', '* * * * *',
    $sched$select public.fn_api_webhook_dispatch()$sched$);
end
$cron$;
