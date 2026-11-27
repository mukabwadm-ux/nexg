-- Reservations in API events: the booking engine's changes reach merchants' webhooks.
--
-- Tours, transfers, rentals, appointments and requests live in NexG's booking
-- engine, on its own server and database (owner, 23 Nov 2026), not among
-- orders. The engine now sends its booking changes to the API (POST
-- /internal/booking-events on api.nexgapp.com, signed with the bridge secret
-- it already shares with the website), and the API records them here with
-- rpc_api_reservation_events_ingest. A merchant's system hears:
--
--   * reservation.created: the first time NexG hears of a reservation;
--   * reservation.status_changed: its status (requested, confirmed,
--     in_progress, completed, cancelled) changed; previous_status says from;
--   * reservation.updated: something else changed (its time, its payment, its
--     stage inside the same status).
--
-- How:
--   * An event carries the reservation's summary only: no name, addresses or
--     notes, because events are kept here for 30 days. A merchant's system
--     reads those with GET /v1/reservations/{id}, which asks the engine.
--   * Events go to the merchant's enabled live endpoints, like order events
--     (fn_api_webhook_enqueue). There are no test reservations yet.
--   * A change that happened more than a day before NexG heard of it (the
--     engine's backlog, when sending is first switched on) updates the
--     reservation's last status without an event, so endpoints are not
--     flooded with history.
--   * api_reservation_state keeps each reservation's last status, stage and
--     version, and nothing about the guest. An older version, or the same one
--     again, sends nothing.
--   * api_booking_engine_event remembers each engine event key for 30 days, so
--     a batch the engine sends again (it missed the answer) changes nothing.
--
-- Rollback:
--   delete from public.api_webhook_event where type like 'reservation.%';
--   restore api_webhook_event_type_check without the three reservation types
--   (20270105030100); drop function public.rpc_api_reservation_events_ingest(jsonb);
--   drop table public.api_booking_engine_event, public.api_reservation_state;
--   delete from public.wiring_audit_exempt
--     where function_name = 'rpc_api_reservation_events_ingest';

-- ═══════════════════════════════════════════════════════════════ the event types

alter table public.api_webhook_event drop constraint api_webhook_event_type_check;
alter table public.api_webhook_event add constraint api_webhook_event_type_check
  check (type in ('booking.created', 'booking.status_changed', 'booking.stage_changed',
                  'booking.rider_assigned', 'reservation.created',
                  'reservation.status_changed', 'reservation.updated', 'ping'));

-- ═══════════════════════════════════════════════════════════════ what NexG has heard

create table public.api_reservation_state (
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  reservation_id text not null check (reservation_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  status text not null
    check (status in ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled')),
  stage text not null check (char_length(stage) between 1 and 40),
  version integer not null check (version >= 0),
  -- When the engine last changed it, as the engine said.
  engine_updated_at timestamptz,
  recorded_at timestamptz not null default now(),
  primary key (merchant_id, reservation_id)
);

comment on table public.api_reservation_state is
  'The last status, stage and version NexG heard for each booking-engine reservation, to tell which reservation.* event a change is. Nothing about the guest.';

create table public.api_booking_engine_event (
  event_key text primary key check (event_key ~ '^[A-Za-z0-9_-]{1,128}$'),
  -- Null when the engine named a business that is not a NexG merchant.
  merchant_id uuid references public.merchant (id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  reservation_id text check (reservation_id is null or reservation_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  occurred_at timestamptz,
  -- queued: sent to the merchant's endpoints. recorded: no endpoint, or a change
  -- older than a day. stale: an older or repeated version. The other three
  -- were not reservation changes NexG could use.
  outcome text not null check (outcome in ('queued', 'recorded', 'stale', 'not_a_reservation',
                                           'unknown_merchant', 'malformed')),
  received_at timestamptz not null default now()
);

create index api_booking_engine_event_age_idx on public.api_booking_engine_event (received_at);

comment on table public.api_booking_engine_event is
  'Each booking-engine outbox event NexG received, kept 30 days so a resend changes nothing.';

-- Reached only through the function below.
alter table public.api_reservation_state enable row level security;
alter table public.api_booking_engine_event enable row level security;
revoke all on public.api_reservation_state, public.api_booking_engine_event
  from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ recording a batch

/*
 * Records a batch of the engine's events (1 to 100) and answers
 * { accepted: [event keys] }: every key it recorded, or had already.
 *
 * Each event is { event_key, event_type, business_id, record_id, occurred_at,
 * reservation } as the API checked it (lib/booking-engine.ts EngineEvent),
 * where reservation is the summary, or null for setup and resource events. An
 * event this cannot use (an unknown business, no reservation, a bad value) is
 * still accepted and remembered with its outcome, so the engine stops sending
 * it.
 */
create function public.rpc_api_reservation_events_ingest(p_events jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event jsonb;
  v_key text;
  v_reservation jsonb;
  v_merchant uuid;
  v_id text;
  v_status text;
  v_stage text;
  v_version integer;
  v_occurred timestamptz;
  v_engine_updated timestamptz;
  v_state public.api_reservation_state;
  v_seen boolean;
  v_type text;
  v_outcome text;
  v_accepted text[] := '{}';
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array'
     or jsonb_array_length(p_events) not between 1 and 100 then
    raise exception 'Send between 1 and 100 events.' using errcode = '22023';
  end if;

  for v_event in select value from jsonb_array_elements(p_events) loop
    v_key := v_event ->> 'event_key';
    -- Without a usable key the engine could never be told it arrived.
    continue when v_key is null or v_key !~ '^[A-Za-z0-9_-]{1,128}$';

    -- Heard already: the engine missed the answer. Accept it again, change nothing.
    if exists (select 1 from public.api_booking_engine_event e where e.event_key = v_key) then
      v_accepted := array_append(v_accepted, v_key);
      continue;
    end if;

    v_outcome := null;
    v_merchant := null;
    v_id := null;
    v_occurred := null;
    v_reservation := v_event -> 'reservation';

    begin
      v_occurred := (v_event ->> 'occurred_at')::timestamptz;
    exception when others then
      v_outcome := 'malformed';
    end;

    if v_outcome is null then
      begin
        v_merchant := (v_event ->> 'business_id')::uuid;
      exception when others then
        v_merchant := null;
      end;
      if v_merchant is null
         or not exists (select 1 from public.merchant m where m.id = v_merchant) then
        v_merchant := null;
        v_outcome := 'unknown_merchant';
      end if;
    end if;

    if v_outcome is null and (v_reservation is null or jsonb_typeof(v_reservation) <> 'object') then
      v_outcome := 'not_a_reservation';
    end if;

    if v_outcome is null then
      v_id := v_reservation ->> 'id';
      v_status := v_reservation ->> 'status';
      v_stage := left(coalesce(v_reservation ->> 'stage', ''), 40);
      begin
        v_version := (v_reservation ->> 'version')::integer;
        v_engine_updated := (v_reservation ->> 'updated_at')::timestamptz;
      exception when others then
        v_version := null;
      end;
      if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,128}$'
         or v_status is null
         or v_status not in ('requested', 'confirmed', 'in_progress', 'completed', 'cancelled')
         or v_stage = '' or v_version is null or v_version < 0 then
        v_outcome := 'malformed';
        if v_id is null or v_id !~ '^[A-Za-z0-9_-]{1,128}$' then
          v_id := null;
        end if;
      end if;
    end if;

    if v_outcome is null then
      -- One change of one reservation at a time, so two batches cannot both call it new.
      perform pg_advisory_xact_lock(hashtextextended('api_reservation:' || v_merchant || ':' || v_id, 0));
      select * into v_state
      from public.api_reservation_state s
      where s.merchant_id = v_merchant and s.reservation_id = v_id
      for update;
      v_seen := found;

      if v_seen and (v_state.version > v_version
                     or (v_state.version = v_version and v_state.status = v_status
                         and v_state.stage = v_stage)) then
        v_outcome := 'stale';
      else
        v_type := case
          when not v_seen then 'reservation.created'
          when v_state.status <> v_status then 'reservation.status_changed'
          else 'reservation.updated'
        end;

        insert into public.api_reservation_state
          (merchant_id, reservation_id, status, stage, version, engine_updated_at, recorded_at)
        values (v_merchant, v_id, v_status, v_stage, v_version, v_engine_updated, now())
        on conflict (merchant_id, reservation_id) do update
          set status = excluded.status,
              stage = excluded.stage,
              version = excluded.version,
              engine_updated_at = excluded.engine_updated_at,
              recorded_at = excluded.recorded_at;

        v_outcome := 'recorded';
        if v_occurred >= now() - interval '1 day' then
          if public.fn_api_webhook_enqueue(
               v_merchant, 'live', v_type, null,
               jsonb_build_object('reservation', v_reservation)
                 || case when v_type = 'reservation.status_changed'
                         then jsonb_build_object('previous_status', v_state.status)
                         else '{}'::jsonb end) is not null then
            v_outcome := 'queued';
          end if;
        end if;
      end if;
    end if;

    insert into public.api_booking_engine_event
      (event_key, merchant_id, event_type, reservation_id, occurred_at, outcome)
    values (v_key, v_merchant, left(coalesce(nullif(v_event ->> 'event_type', ''), 'unknown'), 80),
            v_id, v_occurred, v_outcome);
    v_accepted := array_append(v_accepted, v_key);
  end loop;

  delete from public.api_booking_engine_event where received_at < now() - interval '30 days';

  return jsonb_build_object('accepted', to_jsonb(v_accepted));
end;
$$;

revoke all on function public.rpc_api_reservation_events_ingest(jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_api_reservation_events_ingest(jsonb) to service_role;

comment on function public.rpc_api_reservation_events_ingest(jsonb) is
  'Records the booking engine''s outbox events (from the API''s /internal/booking-events) and queues reservation.* webhook events. Service role only.';

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_api_reservation_events_ingest',
   'Relays the booking engine''s changes to merchants'' webhooks. The engine audits each change itself (booking_audit); this keeps only the last status of each reservation and queues the events: delivery bookkeeping, called by the API with the service role.',
   'api_booking_engine_event, api_reservation_state and api_webhook_event')
on conflict (function_name) do nothing;
