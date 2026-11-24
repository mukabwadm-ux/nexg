-- Cinemas connected to their own ticketing system (owner, 23 Nov 2026: "we send
-- requests and book on their system, our portals are just formailit").
--
-- The cinema's own system is the truth for its programme, seats and bookings.
-- NexG reads from it and places holds and bookings on it through one connector
-- per system (packages/connectors, the next pull request). These tables become
-- a cache of what that system said, and the record of each hold NexG placed on
-- it. They are never a second seat inventory: a connected cinema's seats are
-- not allocated in cinema.allocation, so nothing here can refuse or double-sell
-- against the cinema's own box office.
--
-- Design: cinema-api-design-2026-11-23.md (shared notes). In this migration:
--
-- 1. sandbox-cinema, the connector adapter for the test cinema.
-- 2. The cache: films mapped from each system (cinema.film_source, one NexG
--    film across cinemas, never merged on title alone), screens and showings
--    keyed by the system's own references, the last live seat map
--    (cinema.seat_snapshot) and each connection's sync state.
-- 3. cinema_sync_apply: a programme from the system, applied so that a re-send
--    changes nothing, a showing left out is closed (never silently removed), a
--    cancelled one releases its holds and marks paid bookings for refund, and
--    a showing that would overlap another on its screen is refused, not saved.
-- 4. A hold's life on the cinema's system: held, paying (extended to the
--    payment's time limit), confirming, confirmed with the cinema's booking
--    reference and tickets, or released, expired, refund_due, refunded. The
--    trusted server (service role) records each step; every money step is
--    audited.
-- 5. The worker: cinema_due_work lists syncs, confirm retries and expired holds
--    for the cinema worker, closes the showings of a connection that stopped
--    syncing, and marks any paid hold not booked within 15 minutes for refund.
--    cron_cinema_worker pokes the worker each minute (Vault cinema_worker_url
--    and cinema_worker_secret), like the payments worker.
-- 6. Reads: the customer's own hold; for the cinema and staff, the connection's
--    health, the programme as it arrived, and the bookings through NexG. The
--    cinema connects its system and can pause sales on NexG.
-- 7. The old in-database hold path refuses a connected cinema's showings, its
--    holds can be confirmed only with the cinema's booking reference, the seat
--    map shows the cinema's last answer, and the programme says when each
--    showing was last synced.
--
-- The test cinema is a test tenant (accepts_test_payments): merchant_public,
-- and so cinema.public_showing, show it only to reviewers and staff
-- (20270228000300).
--
-- Rollback: drop the functions and triggers created here, cinema.film_source,
-- cinema.seat_snapshot and cinema.sync_state; drop the added columns; restore
-- hold_state_check and hold_check from 20261212090200, cinema.guard_showing_changes,
-- rpc_cinema_seat_map and rpc_cinema_programme from 20261212090200; unschedule
-- 'cinema-worker'; delete the sandbox-cinema adapter.

-- ═══════════════════════════════════════════════ 0. audit actions

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('cinema.connected', 'experiences', 'notice', false, 'A cinema connected its ticketing system to NexG'),
  ('cinema.sales_paused', 'experiences', 'notice', false, 'A cinema''s sales on NexG paused or resumed'),
  ('cinema.programme_synced', 'experiences', 'info', false, 'A cinema''s programme synced from its ticketing system'),
  ('cinema.showings_closed_stale', 'experiences', 'high', false, 'A cinema''s showings closed because its system stopped syncing'),
  ('cinema.hold_placed', 'experiences', 'info', false, 'Seats held on a cinema''s own system'),
  ('cinema.hold_ended', 'experiences', 'info', false, 'A seat hold on a cinema''s system released or expired'),
  ('cinema.payment_started', 'experiences', 'info', true, 'Payment started for seats held on a cinema''s system'),
  ('cinema.payment_settled', 'experiences', 'info', true, 'Payment settled for seats held on a cinema''s system'),
  ('cinema.booking_confirmed', 'experiences', 'info', true, 'A cinema confirmed a booking paid on NexG'),
  ('cinema.confirm_failed', 'experiences', 'notice', true, 'A cinema did not confirm a paid booking (retrying)'),
  ('cinema.refund_due', 'experiences', 'high', true, 'A paid cinema booking needs a refund'),
  ('cinema.refunded', 'experiences', 'info', true, 'A paid cinema booking was refunded'),
  ('cinema.booking_cancelled', 'experiences', 'notice', true, 'A cinema booking was cancelled')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 1. the sandbox adapter

insert into public.connector_adapter (id, family, vertical, version, manifest, state)
values ('sandbox-cinema', 'supplier', 'cinemas', '1.0.0', '{
  "family": "supplier",
  "version": "1.0.0",
  "capabilities": {
    "cinema.programme": {"supported": true},
    "cinema.seat_map": {"supported": true},
    "cinema.hold": {"supported": true, "maxSeats": 10, "holdSeconds": 420},
    "cinema.extend": {"supported": true, "maxHoldSeconds": 1200},
    "cinema.confirm": {"supported": true},
    "cinema.lookup": {"supported": true},
    "cinema.release": {"supported": true},
    "cinema.cancel": {"supported": true, "untilMinutesBefore": 30}
  },
  "label": "NexG sandbox cinema (test tenants only)"
}'::jsonb, 'sandbox')
on conflict (id) do update
  set manifest = excluded.manifest, version = excluded.version, vertical = excluded.vertical,
      updated_at = now();

-- ═══════════════════════════════════════════════ 2. the cache

alter table cinema.film
  add column if not exists external_ids jsonb not null default '{}'::jsonb;
alter table cinema.film drop constraint if exists film_external_ids_object;
alter table cinema.film add constraint film_external_ids_object check (jsonb_typeof(external_ids) = 'object');

/* Each system's own film id, mapped to one NexG film. */
create table if not exists cinema.film_source (
  connection_id uuid not null references public.connector_connection (id) on delete cascade,
  source_ref text not null check (length(btrim(source_ref)) between 1 and 200),
  film_id uuid not null references cinema.film (id),
  matched_by text not null check (matched_by in ('external_id', 'title_year_runtime', 'new')),
  needs_review boolean not null default false,
  synced_at timestamptz not null default now(),
  primary key (connection_id, source_ref)
);
create index if not exists cinema_film_source_film_idx on cinema.film_source (film_id);
alter table cinema.film_source enable row level security;

alter table cinema.screen
  add column if not exists connection_id uuid references public.connector_connection (id) on delete set null,
  add column if not exists source_ref text,
  add column if not exists layout_version text,
  add column if not exists synced_at timestamptz;
create unique index if not exists cinema_screen_source_idx
  on cinema.screen (connection_id, source_ref) where connection_id is not null;

alter table cinema.showing
  add column if not exists connection_id uuid references public.connector_connection (id) on delete set null,
  add column if not exists source_ref text,
  add column if not exists synced_at timestamptz,
  add column if not exists in_latest_sync boolean not null default true;
create unique index if not exists cinema_showing_source_idx
  on cinema.showing (connection_id, source_ref) where connection_id is not null;

/* The cinema's last answer about a showing's seats. */
create table if not exists cinema.seat_snapshot (
  showing_id uuid primary key references cinema.showing (id) on delete cascade,
  taken text[] not null default '{}',
  observed_at timestamptz not null,
  source text not null check (source in ('live', 'sync'))
);
alter table cinema.seat_snapshot enable row level security;

create table if not exists cinema.sync_state (
  connection_id uuid primary key references public.connector_connection (id) on delete cascade,
  last_sync_at timestamptz,
  last_sync_ok boolean,
  last_error text,
  counts jsonb not null default '{}'::jsonb,
  stale_closed_at timestamptz
);
alter table cinema.sync_state enable row level security;

-- A hold on a cinema's system.
alter table cinema.hold
  add column if not exists connection_id uuid references public.connector_connection (id) on delete set null,
  add column if not exists source_hold_ref text,
  add column if not exists source_booking_ref text,
  add column if not exists tickets jsonb not null default '[]'::jsonb,
  add column if not exists lines jsonb not null default '[]'::jsonb,
  add column if not exists payment_reference text,
  add column if not exists payment_started_at timestamptz,
  add column if not exists settled_at timestamptz,
  add column if not exists confirm_attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_error text,
  add column if not exists refund_reason text,
  add column if not exists refund_reference text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table cinema.hold drop constraint if exists hold_state_check;
alter table cinema.hold add constraint hold_state_check check (state in
  ('held', 'paying', 'confirming', 'confirmed', 'released', 'expired', 'refund_due', 'refunded'));
/* A confirmed hold carries the cinema's reference; a refunded booking keeps it. */
alter table cinema.hold drop constraint if exists hold_check;
alter table cinema.hold drop constraint if exists hold_confirmed_has_reference;
alter table cinema.hold add constraint hold_confirmed_has_reference
  check (state <> 'confirmed' or confirmation_ref is not null);
alter table cinema.hold drop constraint if exists hold_refund_reason;
alter table cinema.hold add constraint hold_refund_reason
  check (state not in ('refund_due', 'refunded') or refund_reason is not null);

create index if not exists cinema_hold_due_idx on cinema.hold (next_attempt_at) where state = 'confirming';
create index if not exists cinema_hold_expiry_idx on cinema.hold (expires_at)
  where state in ('held', 'paying') and connection_id is not null;

-- ═══════════════════════════════════════════════ 3. applying a programme

/* One NexG film per real film: the system's own id first, then a standard
   external id, then title, year and runtime together. Never title alone. */
create or replace function cinema.film_for_source(p_connection_id uuid, p_film jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := nullif(btrim(p_film ->> 'ref'), '');
  v_ext jsonb := coalesce(p_film -> 'externalIds', '{}'::jsonb);
  v_title text := nullif(btrim(p_film ->> 'title'), '');
  v_runtime integer := nullif(p_film ->> 'runtimeMinutes', '')::integer;
  v_release date := nullif(p_film ->> 'releaseDate', '')::date;
  v_id uuid;
  v_matched text;
begin
  if v_ref is null or v_title is null then
    raise exception 'A film needs its own reference and a title.' using errcode = '22023';
  end if;
  if jsonb_typeof(v_ext) <> 'object' then
    v_ext := '{}'::jsonb;
  end if;

  select fs.film_id into v_id from cinema.film_source fs
   where fs.connection_id = p_connection_id and fs.source_ref = v_ref;

  if v_id is null and v_ext <> '{}'::jsonb then
    select f.id into v_id from cinema.film f
     where exists (select 1 from jsonb_each_text(v_ext) e
                    where length(btrim(e.value)) > 0 and f.external_ids ->> e.key = e.value)
     order by f.id limit 1;
    v_matched := 'external_id';
  end if;

  if v_id is null and v_runtime is not null and v_release is not null then
    select f.id into v_id from cinema.film f
     where lower(btrim(f.title)) = lower(v_title)
       and f.runtime_minutes = v_runtime
       and extract(year from f.release_date) = extract(year from v_release)
     order by f.id limit 1;
    v_matched := 'title_year_runtime';
  end if;

  if v_id is null then
    insert into cinema.film (title, classification, languages, genres, runtime_minutes, release_date,
                             synopsis, poster_url, trailer_url, external_ids)
    values (v_title,
            nullif(p_film ->> 'classification', ''),
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_film -> 'languages', '[]')) x), '{}'),
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_film -> 'genres', '[]')) x), '{}'),
            v_runtime, v_release,
            nullif(p_film ->> 'synopsis', ''),
            nullif(p_film ->> 'poster', ''),
            nullif(p_film ->> 'trailerUrl', ''),
            v_ext)
    returning id into v_id;
    v_matched := 'new';
  else
    -- A shared film keeps what it has; the system fills only what is missing.
    update cinema.film f set
      classification = coalesce(f.classification, nullif(p_film ->> 'classification', '')),
      runtime_minutes = coalesce(f.runtime_minutes, v_runtime),
      release_date = coalesce(f.release_date, v_release),
      synopsis = coalesce(f.synopsis, nullif(p_film ->> 'synopsis', '')),
      poster_url = coalesce(f.poster_url, nullif(p_film ->> 'poster', '')),
      trailer_url = coalesce(f.trailer_url, nullif(p_film ->> 'trailerUrl', '')),
      external_ids = v_ext || f.external_ids
     where f.id = v_id;
  end if;

  insert into cinema.film_source (connection_id, source_ref, film_id, matched_by, needs_review)
  values (p_connection_id, v_ref, v_id, coalesce(v_matched, 'new'), coalesce(v_matched = 'title_year_runtime', false))
  on conflict (connection_id, source_ref) do update set synced_at = now();
  return v_id;
end;
$$;

/* A screen and its seat layout, by the system's own reference. A new layout
   replaces the old one only while no future showing on the screen has paid
   or confirmed seats. */
create or replace function cinema.screen_for_source(p_connection_id uuid, p_merchant_id uuid, p_screen jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text := nullif(btrim(p_screen ->> 'ref'), '');
  v_name text := nullif(btrim(p_screen ->> 'name'), '');
  v_layout text := coalesce(nullif(btrim(p_screen ->> 'layoutVersion'), ''), md5(coalesce(p_screen -> 'rows', '[]'::jsonb)::text));
  v_screen cinema.screen;
  v_row jsonb;
  v_seat jsonb;
begin
  if v_ref is null or v_name is null then
    raise exception 'A screen needs its own reference and a name.' using errcode = '22023';
  end if;
  select * into v_screen from cinema.screen
   where connection_id = p_connection_id and source_ref = v_ref for update;

  if found and v_screen.layout_version is not distinct from v_layout then
    update cinema.screen set name = v_name, synced_at = now() where id = v_screen.id;
    return v_screen.id;
  end if;

  if found and exists (
    select 1 from cinema.hold h join cinema.showing s on s.id = h.showing_id
     where s.screen_id = v_screen.id and s.starts_at > now()
       and h.state in ('paying', 'confirming', 'confirmed')) then
    -- Seats are committed on this layout; keep it until those showings pass.
    update cinema.screen set name = v_name, synced_at = now() where id = v_screen.id;
    return v_screen.id;
  end if;

  if not found then
    insert into cinema.screen (merchant_id, name, connection_id, source_ref, layout_version, synced_at)
    values (p_merchant_id, v_name, p_connection_id, v_ref, v_layout, now())
    returning * into v_screen;
  else
    delete from cinema.seat where screen_id = v_screen.id;
    delete from cinema.screen_row where screen_id = v_screen.id;
    update cinema.screen set name = v_name, layout_version = v_layout, synced_at = now()
     where id = v_screen.id returning * into v_screen;
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_screen -> 'rows', '[]'::jsonb)) loop
    insert into cinema.screen_row (screen_id, position, label)
    values (v_screen.id, (v_row ->> 'position')::smallint, btrim(v_row ->> 'label'));
    for v_seat in select value from jsonb_array_elements(coalesce(v_row -> 'seats', '[]'::jsonb)) loop
      insert into cinema.seat (screen_id, row_position, column_position, number, code, seat_type)
      values (v_screen.id, (v_row ->> 'position')::smallint, (v_seat ->> 'column')::smallint,
              (v_seat ->> 'number')::smallint, btrim(v_seat ->> 'code'),
              coalesce(nullif(v_seat ->> 'type', ''), 'standard'));
    end loop;
  end loop;
  return v_screen.id;
end;
$$;

/* A showing the cinema cancelled: unpaid holds are released, paid ones are
   marked for a full refund. Nothing is deleted. */
create or replace function cinema.showing_cancelled(p_showing_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold cinema.hold;
  v_count integer := 0;
begin
  for v_hold in select * from cinema.hold
                 where showing_id = p_showing_id and state in ('held', 'paying', 'confirming', 'confirmed')
                 for update loop
    if v_hold.state = 'held' or (v_hold.state = 'paying' and v_hold.settled_at is null) then
      update cinema.hold set state = 'released', last_error = 'The cinema cancelled this showing.',
             updated_at = now() where id = v_hold.id;
    else
      update cinema.hold set state = 'refund_due', refund_reason = 'showing_cancelled',
             next_attempt_at = null, updated_at = now() where id = v_hold.id;
      perform audit.log('system'::public.actor_type, 'experiences', 'cinema.refund_due',
        p_target_type => 'cinema_hold', p_target_id => v_hold.id,
        p_after => jsonb_build_object('reason', 'showing_cancelled', 'total_minor', v_hold.total_minor));
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.cinema_sync_apply(p_connection_id uuid, p_programme jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.connector_connection;
  m public.merchant;
  v_item jsonb;
  v_from timestamptz := nullif(p_programme -> 'window' ->> 'from', '')::timestamptz;
  v_to timestamptz := nullif(p_programme -> 'window' ->> 'to', '')::timestamptz;
  v_films integer := 0;
  v_screens integer := 0;
  v_showings integer := 0;
  v_cancelled integer := 0;
  v_closed integer := 0;
  v_refused jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_ref text;
  v_film uuid;
  v_screen uuid;
  v_status text;
  v_prices jsonb;
  v_existing cinema.showing;
  v_missing_type boolean;
begin
  select * into c from public.connector_connection where id = p_connection_id for update;
  if not found or c.state not in ('operational', 'degraded') then
    raise exception 'This cinema connection is not active.' using errcode = '22023';
  end if;
  select * into m from public.merchant
   where id = c.merchant_id and category = 'experiences' and subcategory = 'cinemas' and deleted_at is null;
  if not found then
    raise exception 'This connection does not belong to a cinema.' using errcode = '22023';
  end if;
  if v_from is null or v_to is null or v_to <= v_from then
    raise exception 'A programme says which window it covers.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_programme -> 'films', '[]'::jsonb)) loop
    perform cinema.film_for_source(c.id, v_item);
    v_films := v_films + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_programme -> 'screens', '[]'::jsonb)) loop
    perform cinema.screen_for_source(c.id, m.id, v_item);
    v_screens := v_screens + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_programme -> 'showings', '[]'::jsonb)) loop
    v_ref := nullif(btrim(v_item ->> 'ref'), '');
    begin
      if v_ref is null then
        raise exception 'A showing needs its own reference.' using errcode = '22023';
      end if;
      select fs.film_id into v_film from cinema.film_source fs
       where fs.connection_id = c.id and fs.source_ref = v_item ->> 'filmRef';
      select s.id into v_screen from cinema.screen s
       where s.connection_id = c.id and s.source_ref = v_item ->> 'screenRef';
      if v_film is null or v_screen is null then
        raise exception 'Its film or screen is not in the programme.' using errcode = '22023';
      end if;
      v_status := coalesce(nullif(v_item ->> 'status', ''), 'on_sale');
      if v_status not in ('on_sale', 'closed', 'cancelled') then
        raise exception 'Unknown status %.', v_status using errcode = '22023';
      end if;
      v_prices := coalesce(v_item -> 'prices', '{}'::jsonb);
      -- On sale only with a price for every seat type the screen has.
      select exists (
        select 1 from cinema.seat st where st.screen_id = v_screen
           and nullif(v_prices ->> (st.seat_type || 'Minor'), '') is null) into v_missing_type;
      if v_status = 'on_sale' and v_missing_type then
        v_status := 'draft';
        v_refused := v_refused || jsonb_build_object('ref', v_ref, 'reason',
          'Not on sale on NexG: a seat type on its screen has no price.');
      end if;

      select * into v_existing from cinema.showing where connection_id = c.id and source_ref = v_ref for update;
      if found then
        if v_status = 'cancelled' and v_existing.status <> 'cancelled' then
          v_cancelled := v_cancelled + 1;
        end if;
        update cinema.showing set
          film_id = v_film, screen_id = v_screen,
          starts_at = (v_item ->> 'startsAt')::timestamptz, ends_at = (v_item ->> 'endsAt')::timestamptz,
          format = coalesce(nullif(btrim(v_item ->> 'format'), ''), '2D'),
          language = nullif(v_item ->> 'language', ''),
          status = v_status,
          standard_minor = nullif(v_prices ->> 'standardMinor', '')::integer,
          vip_minor = nullif(v_prices ->> 'vipMinor', '')::integer,
          wheelchair_minor = nullif(v_prices ->> 'wheelchairMinor', '')::integer,
          synced_at = now(), in_latest_sync = true
         where id = v_existing.id;
        if v_status = 'cancelled' and v_existing.status <> 'cancelled' then
          perform cinema.showing_cancelled(v_existing.id);
        end if;
      else
        insert into cinema.showing (film_id, screen_id, starts_at, ends_at, format, language, status,
                                    standard_minor, vip_minor, wheelchair_minor,
                                    connection_id, source_ref, synced_at, in_latest_sync)
        values (v_film, v_screen, (v_item ->> 'startsAt')::timestamptz, (v_item ->> 'endsAt')::timestamptz,
                coalesce(nullif(btrim(v_item ->> 'format'), ''), '2D'), nullif(v_item ->> 'language', ''),
                v_status,
                nullif(v_prices ->> 'standardMinor', '')::integer,
                nullif(v_prices ->> 'vipMinor', '')::integer,
                nullif(v_prices ->> 'wheelchairMinor', '')::integer,
                c.id, v_ref, now(), true);
      end if;
      v_seen := v_seen || v_ref;
      v_showings := v_showings + 1;
    exception
      when exclusion_violation then
        v_refused := v_refused || jsonb_build_object('ref', v_ref, 'reason',
          'It overlaps another showing on the same screen.');
      when sqlstate '22023' or check_violation or invalid_text_representation or invalid_datetime_format
           or datetime_field_overflow or not_null_violation then
        v_refused := v_refused || jsonb_build_object('ref', v_ref, 'reason', sqlerrm);
    end;
  end loop;

  -- Left out of this window: closed on NexG and marked, never deleted.
  with gone as (
    update cinema.showing s
       set status = case when s.status = 'on_sale' then 'closed' else s.status end,
           in_latest_sync = false, synced_at = now()
     where s.connection_id = c.id and s.starts_at >= v_from and s.starts_at < v_to
       and s.in_latest_sync and not (s.source_ref = any(v_seen))
    returning s.id
  )
  select count(*) into v_closed from gone;

  insert into cinema.sync_state (connection_id, last_sync_at, last_sync_ok, last_error, counts, stale_closed_at)
  values (c.id, now(), true, null,
          jsonb_build_object('films', v_films, 'screens', v_screens, 'showings', v_showings,
                             'cancelled', v_cancelled, 'closed', v_closed, 'refused', jsonb_array_length(v_refused)),
          null)
  on conflict (connection_id) do update
    set last_sync_at = excluded.last_sync_at, last_sync_ok = true, last_error = null,
        counts = excluded.counts, stale_closed_at = null;
  update public.connector_connection set last_ok_at = now(), last_error = null, updated_at = now()
   where id = c.id;

  perform audit.log('system'::public.actor_type, 'experiences', 'cinema.programme_synced',
    p_actor_label => '[System] · cinema sync', p_target_type => 'merchant', p_target_id => m.id,
    p_target_label => m.trading_name, p_city_id => m.city_id,
    p_after => jsonb_build_object('films', v_films, 'screens', v_screens, 'showings', v_showings,
                                  'cancelled', v_cancelled, 'closed', v_closed,
                                  'refused', jsonb_array_length(v_refused)));

  return jsonb_build_object('ok', true, 'films', v_films, 'screens', v_screens, 'showings', v_showings,
                            'cancelled', v_cancelled, 'closed', v_closed, 'refused', v_refused);
end;
$$;

/* A sync that failed: said on the connection, so the portal shows it. */
create or replace function public.cinema_sync_failed(p_connection_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into cinema.sync_state (connection_id, last_sync_ok, last_error)
  values (p_connection_id, false, left(coalesce(p_error, 'The cinema''s system did not answer.'), 500))
  on conflict (connection_id) do update set last_sync_ok = false, last_error = excluded.last_error;
  update public.connector_connection set last_error = left(coalesce(p_error, 'The cinema''s system did not answer.'), 500),
         updated_at = now()
   where id = p_connection_id;
$$;

create or replace function public.cinema_record_snapshot(p_showing_id uuid, p_taken text[], p_observed_at timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into cinema.seat_snapshot (showing_id, taken, observed_at, source)
  values (p_showing_id, coalesce(p_taken, '{}'), coalesce(p_observed_at, now()), 'live')
  on conflict (showing_id) do update
    set taken = excluded.taken, observed_at = excluded.observed_at, source = 'live'
  where cinema.seat_snapshot.observed_at <= excluded.observed_at;
$$;

-- ═══════════════════════════════════════════════ 4. a hold's life on the cinema's system

create or replace function cinema.kes(p_minor bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'KES ' || to_char(p_minor / 100.0, 'FM999,999,990')
$$;

/* What the customer is told, by state. */
create or replace function cinema.hold_message(p_state text, p_reason text, p_cinema text, p_total_minor bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_state
    when 'paying' then 'Your seats are held while you pay.'
    when 'confirming' then 'Payment received. Confirming your tickets with ' || coalesce(p_cinema, 'the cinema') || '…'
    when 'expired' then 'Your seats were released. Pick them again.'
    when 'released' then 'Your seats were released. Pick them again.'
    when 'refund_due' then case p_reason
      when 'showing_cancelled' then coalesce(p_cinema, 'The cinema') || ' cancelled this showing. Your '
        || cinema.kes(p_total_minor) || ' is being refunded.'
      when 'customer_cancelled' then 'Cancelled. Your ' || cinema.kes(p_total_minor) || ' is being refunded.'
      else coalesce(p_cinema, 'The cinema') || ' couldn''t confirm your seats. Your ' || cinema.kes(p_total_minor)
        || ' is being refunded to your card or M-Pesa; it shows in 1 to 5 days.' end
    when 'refunded' then 'Refunded.'
    else null end
$$;

create or replace function cinema.connected_hold_result(p_hold_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'holdId', h.id,
    'state', case when h.state = 'held' and h.expires_at <= statement_timestamp() then 'expired' else h.state end,
    'expiresAt', h.expires_at,
    'seats', to_jsonb(h.seat_codes),
    'lines', h.lines,
    'totalMinor', h.total_minor,
    'currency', 'KES',
    'showing', jsonb_build_object('id', s.id, 'filmTitle', f.title, 'cinemaName', m.trading_name,
                                  'screenName', sc.name, 'startsAt', s.starts_at),
    'tickets', h.tickets,
    'bookingRef', h.source_booking_ref,
    'message', cinema.hold_message(
      case when h.state = 'held' and h.expires_at <= statement_timestamp() then 'expired' else h.state end,
      h.refund_reason, m.trading_name, h.total_minor)
  ))
  from cinema.hold h
  join cinema.showing s on s.id = h.showing_id
  join cinema.screen sc on sc.id = s.screen_id
  join cinema.film f on f.id = s.film_id
  left join public.merchant m on m.id = sc.merchant_id
  where h.id = p_hold_id
$$;

/* Seats the cinema's system has just held for this customer. Asking again
   with the same request id returns the same hold. */
create or replace function public.cinema_record_hold(
  p_showing_id uuid, p_user_id uuid, p_request_id uuid, p_seats text[], p_lines jsonb,
  p_total_minor bigint, p_source_hold_ref text, p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold cinema.hold;
  v_screen cinema.screen;
  v_showing cinema.showing;
  v_seats text[];
begin
  select * into v_hold from cinema.hold where guest_id = p_user_id and request_id = p_request_id;
  if found then
    return cinema.connected_hold_result(v_hold.id);
  end if;
  select * into v_showing from cinema.showing where id = p_showing_id;
  select * into v_screen from cinema.screen where id = v_showing.screen_id;
  if v_screen.connection_id is null then
    raise exception 'This cinema is not connected to NexG.' using errcode = '22023';
  end if;
  if p_user_id is null or p_request_id is null or nullif(btrim(p_source_hold_ref), '') is null
     or coalesce(cardinality(p_seats), 0) not between 1 and 10 or p_total_minor is null or p_total_minor <= 0
     or p_expires_at is null then
    raise exception 'A hold needs the customer, the request, the seats, the total and the cinema''s reference.'
      using errcode = '22023';
  end if;
  select array_agg(distinct x order by x) into v_seats from unnest(p_seats) x;

  insert into cinema.hold (guest_id, request_id, showing_id, seat_codes, total_minor, expires_at, state,
                           connection_id, source_hold_ref, lines)
  values (p_user_id, p_request_id, p_showing_id, v_seats, p_total_minor, p_expires_at, 'held',
          v_screen.connection_id, btrim(p_source_hold_ref), coalesce(p_lines, '[]'::jsonb))
  returning * into v_hold;

  perform audit.log('guest'::public.actor_type, 'experiences', 'cinema.hold_placed',
    p_actor_id => p_user_id, p_target_type => 'cinema_hold', p_target_id => v_hold.id,
    p_city_id => (select mm.city_id from public.merchant mm where mm.id = v_screen.merchant_id),
    p_after => jsonb_build_object('showing', p_showing_id, 'seats', v_seats, 'total_minor', p_total_minor,
                                  'expires_at', p_expires_at, 'cinema_ref', btrim(p_source_hold_ref)));
  return cinema.connected_hold_result(v_hold.id);
end;
$$;

/* Payment is starting: the cinema extended the hold to cover it. */
create or replace function public.cinema_record_paying(p_hold_id uuid, p_expires_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold cinema.hold;
begin
  select * into v_hold from cinema.hold where id = p_hold_id for update;
  if not found or v_hold.connection_id is null then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  if v_hold.state = 'paying' then
    update cinema.hold set expires_at = greatest(expires_at, coalesce(p_expires_at, expires_at)), updated_at = now()
     where id = p_hold_id;
    return cinema.connected_hold_result(p_hold_id);
  end if;
  if v_hold.state <> 'held' or v_hold.expires_at <= now() then
    raise exception 'Your seats were released. Pick them again.' using errcode = '22023', hint = 'hold_ended';
  end if;
  update cinema.hold set state = 'paying', expires_at = coalesce(p_expires_at, expires_at),
         payment_started_at = now(), updated_at = now()
   where id = p_hold_id;
  perform audit.log('guest'::public.actor_type, 'experiences', 'cinema.payment_started',
    p_actor_id => v_hold.guest_id, p_target_type => 'cinema_hold', p_target_id => p_hold_id,
    p_after => jsonb_build_object('total_minor', v_hold.total_minor, 'expires_at', p_expires_at));
  return cinema.connected_hold_result(p_hold_id);
end;
$$;

/* The payment arrived (the Paystack chat calls this from its verified
   webhook). Confirming with the cinema is queued at once. A late payment for
   a hold that has ended is still confirmed if the cinema accepts it; if not,
   it is refunded. */
create or replace function public.cinema_payment_settled(p_hold_id uuid, p_payment_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold cinema.hold;
begin
  if nullif(btrim(p_payment_reference), '') is null then
    raise exception 'A payment reference is required.' using errcode = '22023';
  end if;
  select * into v_hold from cinema.hold where id = p_hold_id for update;
  if not found or v_hold.connection_id is null then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  if v_hold.settled_at is not null then
    if v_hold.payment_reference is distinct from btrim(p_payment_reference) then
      raise exception 'This hold was already paid by another payment.' using errcode = '23505';
    end if;
    return cinema.connected_hold_result(p_hold_id);
  end if;
  if v_hold.state in ('refund_due', 'refunded') then
    return cinema.connected_hold_result(p_hold_id);
  end if;
  -- Paid after the cinema cancelled the showing: nothing to book, so refund.
  if exists (select 1 from cinema.showing s where s.id = v_hold.showing_id and s.status = 'cancelled') then
    update cinema.hold set state = 'refund_due', refund_reason = 'showing_cancelled',
           payment_reference = btrim(p_payment_reference), settled_at = now(), next_attempt_at = null,
           updated_at = now()
     where id = p_hold_id;
    perform audit.log('system'::public.actor_type, 'experiences', 'cinema.refund_due',
      p_target_type => 'cinema_hold', p_target_id => p_hold_id, p_severity => 'high'::public.audit_severity,
      p_reason => 'Paid for a showing the cinema had cancelled.',
      p_after => jsonb_build_object('reason', 'showing_cancelled', 'total_minor', v_hold.total_minor,
                                    'payment', btrim(p_payment_reference), 'state_before', v_hold.state));
    return cinema.connected_hold_result(p_hold_id);
  end if;
  update cinema.hold set state = 'confirming', payment_reference = btrim(p_payment_reference),
         settled_at = now(), next_attempt_at = now(), confirm_attempts = 0, updated_at = now()
   where id = p_hold_id;
  perform audit.log('system'::public.actor_type, 'experiences', 'cinema.payment_settled',
    p_target_type => 'cinema_hold', p_target_id => p_hold_id,
    p_after => jsonb_build_object('total_minor', v_hold.total_minor, 'payment', btrim(p_payment_reference),
                                  'state_before', v_hold.state));
  return cinema.connected_hold_result(p_hold_id);
end;
$$;

create or replace function public.cinema_record_confirm(p_hold_id uuid, p_booking_ref text, p_tickets jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold cinema.hold;
  v_ref text := nullif(btrim(p_booking_ref), '');
begin
  if v_ref is null then
    raise exception 'The cinema''s booking reference is required.' using errcode = '22023';
  end if;
  select * into v_hold from cinema.hold where id = p_hold_id for update;
  if not found or v_hold.connection_id is null then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  if v_hold.state = 'confirmed' then
    return cinema.connected_hold_result(p_hold_id);
  end if;
  if v_hold.state <> 'confirming' then
    raise exception 'Only a paid hold is confirmed.' using errcode = '22023';
  end if;
  update cinema.hold set state = 'confirmed', confirmation_ref = v_ref, source_booking_ref = v_ref,
         tickets = coalesce(p_tickets, '[]'::jsonb), next_attempt_at = null, last_error = null,
         updated_at = now()
   where id = p_hold_id;
  perform audit.log('system'::public.actor_type, 'experiences', 'cinema.booking_confirmed',
    p_target_type => 'cinema_hold', p_target_id => p_hold_id,
    p_after => jsonb_build_object('booking', v_ref, 'seats', v_hold.seat_codes,
                                  'total_minor', v_hold.total_minor, 'payment', v_hold.payment_reference));
  return cinema.connected_hold_result(p_hold_id);
end;
$$;

/* The cinema did not confirm. Retried with the same request after 10 s,
   30 s, 2 and 5 minutes; refused for good, after five attempts, or 15 minutes
   after the payment, it becomes a refund. */
create or replace function public.cinema_record_confirm_failed(p_hold_id uuid, p_error text, p_final boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold cinema.hold;
  v_attempts integer;
  v_final boolean;
begin
  select * into v_hold from cinema.hold where id = p_hold_id for update;
  if not found or v_hold.connection_id is null then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  if v_hold.state <> 'confirming' then
    return cinema.connected_hold_result(p_hold_id);
  end if;
  v_attempts := v_hold.confirm_attempts + 1;
  v_final := coalesce(p_final, false) or v_attempts >= 5
             or v_hold.settled_at <= now() - interval '15 minutes';
  if v_final then
    update cinema.hold set state = 'refund_due', refund_reason = 'confirm_refused', confirm_attempts = v_attempts,
           last_error = left(p_error, 500), next_attempt_at = null, updated_at = now()
     where id = p_hold_id;
    perform audit.log('system'::public.actor_type, 'experiences', 'cinema.refund_due',
      p_target_type => 'cinema_hold', p_target_id => p_hold_id, p_severity => 'high'::public.audit_severity,
      p_reason => 'The cinema did not confirm a paid booking.',
      p_after => jsonb_build_object('reason', 'confirm_refused', 'error', left(p_error, 500),
                                    'total_minor', v_hold.total_minor, 'payment', v_hold.payment_reference));
  else
    update cinema.hold set confirm_attempts = v_attempts, last_error = left(p_error, 500),
           next_attempt_at = now() + (array[interval '10 seconds', interval '30 seconds',
                                            interval '2 minutes', interval '5 minutes'])[least(v_attempts, 4)],
           updated_at = now()
     where id = p_hold_id;
    perform audit.log('system'::public.actor_type, 'experiences', 'cinema.confirm_failed',
      p_target_type => 'cinema_hold', p_target_id => p_hold_id,
      p_after => jsonb_build_object('attempt', v_attempts, 'error', left(p_error, 500)));
  end if;
  return cinema.connected_hold_result(p_hold_id);
end;
$$;

/* Released by the customer, or expired; the cinema has been told. */
create or replace function public.cinema_record_hold_ended(p_hold_id uuid, p_state text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold cinema.hold;
begin
  if p_state not in ('released', 'expired') then
    raise exception 'A hold ends released or expired.' using errcode = '22023';
  end if;
  select * into v_hold from cinema.hold where id = p_hold_id for update;
  if not found or v_hold.connection_id is null then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  if v_hold.state in ('held', 'paying') and v_hold.settled_at is null then
    update cinema.hold set state = p_state, next_attempt_at = null, updated_at = now() where id = p_hold_id;
    perform audit.log('system'::public.actor_type, 'experiences', 'cinema.hold_ended',
      p_target_type => 'cinema_hold', p_target_id => p_hold_id,
      p_after => jsonb_build_object('state', p_state, 'seats', v_hold.seat_codes));
  end if;
  return cinema.connected_hold_result(p_hold_id);
end;
$$;

/* Cancelled on the cinema's system: the booking becomes a refund. */
create or replace function public.cinema_record_cancelled(p_hold_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold cinema.hold;
begin
  if p_reason not in ('customer_cancelled', 'showing_cancelled') then
    raise exception 'Unknown cancellation reason.' using errcode = '22023';
  end if;
  select * into v_hold from cinema.hold where id = p_hold_id for update;
  if not found or v_hold.connection_id is null then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  if v_hold.state in ('refund_due', 'refunded') then
    return cinema.connected_hold_result(p_hold_id);
  end if;
  if v_hold.state <> 'confirmed' then
    raise exception 'Only a confirmed booking is cancelled.' using errcode = '22023';
  end if;
  update cinema.hold set state = 'refund_due', refund_reason = p_reason, updated_at = now() where id = p_hold_id;
  perform audit.log('system'::public.actor_type, 'experiences', 'cinema.booking_cancelled',
    p_target_type => 'cinema_hold', p_target_id => p_hold_id,
    p_after => jsonb_build_object('reason', p_reason, 'booking', v_hold.source_booking_ref,
                                  'total_minor', v_hold.total_minor));
  return cinema.connected_hold_result(p_hold_id);
end;
$$;

create or replace function public.cinema_record_refunded(p_hold_id uuid, p_refund_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold cinema.hold;
begin
  select * into v_hold from cinema.hold where id = p_hold_id for update;
  if not found or v_hold.connection_id is null then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  if v_hold.state = 'refunded' then
    return cinema.connected_hold_result(p_hold_id);
  end if;
  if v_hold.state <> 'refund_due' then
    raise exception 'Only a refund that is due is recorded.' using errcode = '22023';
  end if;
  update cinema.hold set state = 'refunded', refund_reference = nullif(btrim(p_refund_reference), ''),
         updated_at = now()
   where id = p_hold_id;
  perform audit.log('system'::public.actor_type, 'experiences', 'cinema.refunded',
    p_target_type => 'cinema_hold', p_target_id => p_hold_id,
    p_after => jsonb_build_object('total_minor', v_hold.total_minor, 'refund', nullif(btrim(p_refund_reference), ''),
                                  'reason', v_hold.refund_reason));
  return cinema.connected_hold_result(p_hold_id);
end;
$$;

-- ═══════════════════════════════════════════════ 5. the worker

/* What the cinema worker should do now. Also does the work that needs no
   call to a cinema: closes the showings of a connection that stopped syncing
   (6 hours), and marks any paid hold not booked within 15 minutes for refund. */
create or replace function public.cinema_due_work(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_stale record;
  v_hold_id uuid;
  v_closed integer;
begin
  for v_stale in
    select c.id, c.merchant_id from public.connector_connection c
      join public.connector_adapter a on a.id = c.adapter_id and a.vertical = 'cinemas'
      left join cinema.sync_state st on st.connection_id = c.id
     where c.state in ('operational', 'degraded')
       and coalesce(st.last_sync_at, c.created_at) < now() - interval '6 hours'
       and st.stale_closed_at is null
  loop
    with closed as (
      update cinema.showing s set status = 'closed'
       where s.connection_id = v_stale.id and s.status = 'on_sale' and s.starts_at > now()
      returning s.id
    ) select count(*) into v_closed from closed;
    insert into cinema.sync_state (connection_id, stale_closed_at) values (v_stale.id, now())
    on conflict (connection_id) do update set stale_closed_at = now();
    perform audit.log('system'::public.actor_type, 'experiences', 'cinema.showings_closed_stale',
      p_target_type => 'merchant', p_target_id => v_stale.merchant_id, p_severity => 'high'::public.audit_severity,
      p_reason => 'The cinema''s system has not synced for 6 hours.',
      p_after => jsonb_build_object('closed', v_closed));
  end loop;

  for v_hold_id in select id from cinema.hold
                    where state = 'confirming' and settled_at <= now() - interval '15 minutes' loop
    perform public.cinema_record_confirm_failed(v_hold_id, 'Not confirmed within 15 minutes of payment.', true);
  end loop;

  return jsonb_build_object(
    'syncs', coalesce((
      select jsonb_agg(jsonb_build_object('connectionId', x.id, 'adapterId', x.adapter_id, 'merchantId', x.merchant_id))
        from (select c.id, c.adapter_id, c.merchant_id from public.connector_connection c
                join public.connector_adapter a on a.id = c.adapter_id and a.vertical = 'cinemas'
                left join cinema.sync_state st on st.connection_id = c.id
               where c.state in ('operational', 'degraded')
                 and coalesce(st.last_sync_at, '-infinity'::timestamptz) < now() - interval '5 minutes'
               order by st.last_sync_at nulls first limit v_limit) x), '[]'::jsonb),
    'confirms', coalesce((
      select jsonb_agg(x.id) from (select id from cinema.hold
        where state = 'confirming' and next_attempt_at <= now() order by next_attempt_at limit v_limit) x), '[]'::jsonb),
    'expiries', coalesce((
      select jsonb_agg(x.id) from (select id from cinema.hold
        where state in ('held', 'paying') and settled_at is null and connection_id is not null
          and expires_at <= now() order by expires_at limit v_limit) x), '[]'::jsonb),
    'refunds', coalesce((
      select jsonb_agg(x.id) from (select id from cinema.hold
        where state = 'refund_due' order by updated_at limit v_limit) x), '[]'::jsonb)
  );
end;
$$;

/* Everything the worker needs to make one call for a hold. */
create or replace function public.cinema_hold_for_worker(p_hold_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'holdId', h.id, 'state', h.state, 'requestId', h.request_id, 'userId', h.guest_id,
    'connectionId', h.connection_id, 'adapterId', c.adapter_id, 'environment', c.environment,
    'showingId', s.id, 'showingRef', s.source_ref, 'seats', to_jsonb(h.seat_codes), 'totalMinor', h.total_minor,
    'holdRef', h.source_hold_ref, 'bookingRef', h.source_booking_ref,
    'paymentReference', h.payment_reference, 'expiresAt', h.expires_at, 'startsAt', s.starts_at)
  from cinema.hold h
  join cinema.showing s on s.id = h.showing_id
  join public.connector_connection c on c.id = h.connection_id
  where h.id = p_hold_id
$$;

/* What the live calls need about a showing: its connection and the
   system's own reference. */
create or replace function public.cinema_showing_for_call(p_showing_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'showingId', s.id, 'showingRef', s.source_ref, 'status', s.status, 'startsAt', s.starts_at,
    'connectionId', c.id, 'adapterId', c.adapter_id, 'environment', c.environment, 'connectionState', c.state,
    'merchantId', sc.merchant_id, 'screenId', sc.id,
    'prices', jsonb_build_object('standard', s.standard_minor, 'vip', s.vip_minor, 'wheelchair', s.wheelchair_minor))
  from cinema.showing s
  join cinema.screen sc on sc.id = s.screen_id
  join public.connector_connection c on c.id = s.connection_id
  where s.id = p_showing_id
$$;

create or replace function public.fn_cinema_worker_poke()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request bigint;
begin
  select nullif(trim(decrypted_secret), '') into v_url
    from vault.decrypted_secrets where name = 'cinema_worker_url';
  select nullif(trim(decrypted_secret), '') into v_secret
    from vault.decrypted_secrets where name = 'cinema_worker_secret';
  if v_url is null or v_secret is null then
    return jsonb_build_object('ok', false,
      'message', 'cinema_worker_url or cinema_worker_secret is missing from Vault, so the cinema worker was not called.');
  end if;
  select net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cinema-worker-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into v_request;
  return jsonb_build_object('ok', true, 'request', v_request);
end;
$$;

create or replace function public.cron_cinema_worker()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due jsonb := public.cinema_due_work(50);
begin
  if jsonb_array_length(v_due -> 'syncs') = 0 and jsonb_array_length(v_due -> 'confirms') = 0
     and jsonb_array_length(v_due -> 'expiries') = 0 then
    return jsonb_build_object('ok', true, 'waiting', 0);
  end if;
  return public.fn_cinema_worker_poke() || jsonb_build_object(
    'syncs', jsonb_array_length(v_due -> 'syncs'), 'confirms', jsonb_array_length(v_due -> 'confirms'),
    'expiries', jsonb_array_length(v_due -> 'expiries'));
end;
$$;

do $cron$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'cinema-worker';
    perform cron.schedule('cinema-worker', '* * * * *', $sched$select public.cron_cinema_worker()$sched$);
  end if;
end $cron$;

-- ═══════════════════════════════════════════════ 6. reads, connecting, pausing

/* The customer's own hold. */
create or replace function public.rpc_my_cinema_hold(p_hold_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from cinema.hold where id = p_hold_id and guest_id = (select auth.uid())) then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  return cinema.connected_hold_result(p_hold_id);
end;
$$;

create or replace function cinema.require_cinema(p_merchant_id uuid)
returns public.merchant
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
begin
  if not (authz.is_merchant_member(p_merchant_id) or authz.can_manage_merchants(null)) then
    raise exception 'Not your cinema.' using errcode = '42501';
  end if;
  select * into m from public.merchant
   where id = p_merchant_id and category = 'experiences' and subcategory = 'cinemas' and deleted_at is null;
  if not found then
    raise exception 'Only a cinema connects a ticketing system.' using errcode = '22023';
  end if;
  return m;
end;
$$;

create or replace function cinema.connection_for(p_merchant_id uuid)
returns public.connector_connection
language sql
stable
security definer
set search_path = ''
as $$
  select c.* from public.connector_connection c
    join public.connector_adapter a on a.id = c.adapter_id and a.vertical = 'cinemas'
   where c.merchant_id = p_merchant_id and c.state not in ('revoked', 'disconnected')
   order by c.created_at desc limit 1
$$;

create or replace function public.rpc_cinema_connection(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant := cinema.require_cinema(p_merchant_id);
  c public.connector_connection := cinema.connection_for(p_merchant_id);
  st cinema.sync_state;
begin
  if c.id is null then
    return jsonb_build_object('connected', false, 'merchantId', m.id,
      'adapters', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'label', a.manifest ->> 'label',
                                                                'state', a.state) order by a.id)
                              from public.connector_adapter a
                             where a.vertical = 'cinemas' and a.state in ('sandbox', 'available')
                               and (a.state = 'available' or m.accepts_test_payments)), '[]'::jsonb));
  end if;
  select * into st from cinema.sync_state where connection_id = c.id;
  return jsonb_strip_nulls(jsonb_build_object(
    'connected', true, 'merchantId', m.id, 'connectionId', c.id, 'adapterId', c.adapter_id,
    'adapterLabel', (select a.manifest ->> 'label' from public.connector_adapter a where a.id = c.adapter_id),
    'environment', c.environment, 'state', c.state,
    'paused', c.state = 'suspended',
    'lastOkAt', c.last_ok_at, 'lastError', c.last_error,
    'lastSyncAt', st.last_sync_at, 'lastSyncOk', st.last_sync_ok, 'lastSyncError', st.last_error,
    'staleClosedAt', st.stale_closed_at, 'lastCounts', st.counts,
    'counts', jsonb_build_object(
      'films', (select count(distinct s.film_id) from cinema.showing s
                 where s.connection_id = c.id and s.starts_at > now()),
      'screens', (select count(*) from cinema.screen sc where sc.connection_id = c.id),
      'showingsNext7Days', (select count(*) from cinema.showing s
                             where s.connection_id = c.id and s.status = 'on_sale'
                               and s.starts_at > now() and s.starts_at < now() + interval '7 days')),
    'latencyMs', (select round(avg(r.elapsed_ms)) from (select elapsed_ms from public.connector_run
                    where connection_id = c.id and elapsed_ms is not null
                    order by created_at desc limit 20) r)
  ));
end;
$$;

/* Connect the cinema's system. The sandbox needs no credentials and is only
   for test cinemas; a real system's connection starts in draft until its
   credentials are stored and a test call succeeds. */
create or replace function public.rpc_cinema_connect(p_merchant_id uuid, p_adapter_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant := cinema.require_cinema(p_merchant_id);
  a public.connector_adapter;
  c public.connector_connection := cinema.connection_for(p_merchant_id);
begin
  select * into a from public.connector_adapter
   where id = p_adapter_id and vertical = 'cinemas' and state in ('sandbox', 'available');
  if not found then
    raise exception 'That ticketing system is not available.' using errcode = '22023';
  end if;
  if a.state = 'sandbox' and not m.accepts_test_payments then
    raise exception 'The sandbox cinema is for test cinemas only.' using errcode = '22023';
  end if;
  if c.id is not null then
    if c.adapter_id = a.id then
      return public.rpc_cinema_connection(p_merchant_id);
    end if;
    update public.connector_connection set state = 'disconnected', updated_at = now() where id = c.id;
  end if;
  insert into public.connector_connection (adapter_id, merchant_id, environment, state, created_by_user)
  values (a.id, m.id, (case when a.state = 'sandbox' then 'sandbox' else 'production' end)::public.connector_environment,
          (case when a.state = 'sandbox' then 'operational' else 'draft' end)::public.connector_connection_state,
          (select auth.uid()))
  returning * into c;
  perform audit.log('merchant_user'::public.actor_type, 'experiences', 'cinema.connected',
    p_target_type => 'merchant', p_target_id => m.id, p_target_label => m.trading_name, p_city_id => m.city_id,
    p_after => jsonb_build_object('adapter', a.id, 'connection', c.id, 'state', c.state));
  return public.rpc_cinema_connection(p_merchant_id);
end;
$$;

/* Pause sales on NexG: the connection is suspended and its showings close on
   NexG; resuming lets the next sync open them again. */
create or replace function public.rpc_cinema_pause(p_merchant_id uuid, p_paused boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant := cinema.require_cinema(p_merchant_id);
  c public.connector_connection := cinema.connection_for(p_merchant_id);
begin
  if c.id is null then
    raise exception 'Connect the cinema''s ticketing system first.' using errcode = '22023';
  end if;
  if coalesce(p_paused, false) then
    update public.connector_connection set state = 'suspended', updated_at = now() where id = c.id;
    update cinema.showing set status = 'closed' where connection_id = c.id and status = 'on_sale';
  else
    update public.connector_connection set state = 'operational', updated_at = now()
     where id = c.id and state = 'suspended';
    update cinema.sync_state set last_sync_at = null where connection_id = c.id;
  end if;
  perform audit.log('merchant_user'::public.actor_type, 'experiences', 'cinema.sales_paused',
    p_target_type => 'merchant', p_target_id => m.id, p_target_label => m.trading_name, p_city_id => m.city_id,
    p_after => jsonb_build_object('paused', coalesce(p_paused, false)));
  return public.rpc_cinema_connection(p_merchant_id);
end;
$$;

/* The programme as it arrived, closed and cancelled showings included. */
create or replace function public.rpc_cinema_programme_for_merchant(p_merchant_id uuid, p_from date, p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant := cinema.require_cinema(p_merchant_id);
begin
  if p_from is null or coalesce(p_days, 0) not between 1 and 14 then
    raise exception 'Choose up to fourteen days.' using errcode = '22023';
  end if;
  return jsonb_build_object(
    'merchantId', m.id,
    'showings', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', s.id, 'ref', s.source_ref, 'filmTitle', f.title, 'filmId', f.id, 'screenName', sc.name,
        'startsAt', s.starts_at, 'endsAt', s.ends_at, 'format', s.format, 'language', s.language,
        'status', s.status, 'inLatestSync', s.in_latest_sync, 'syncedAt', s.synced_at,
        'prices', jsonb_build_object('standardMinor', s.standard_minor, 'vipMinor', s.vip_minor,
                                     'wheelchairMinor', s.wheelchair_minor)
      )) order by s.starts_at, sc.name)
      from cinema.showing s
      join cinema.screen sc on sc.id = s.screen_id
      join cinema.film f on f.id = s.film_id
      where sc.merchant_id = m.id
        and s.starts_at >= (p_from::timestamp at time zone 'Africa/Nairobi')
        and s.starts_at < ((p_from + p_days)::timestamp at time zone 'Africa/Nairobi')
    ), '[]'::jsonb),
    'filmsNeedingReview', coalesce((
      select jsonb_agg(jsonb_build_object('ref', fs.source_ref, 'filmId', fs.film_id, 'title', f.title))
        from cinema.film_source fs
        join cinema.film f on f.id = fs.film_id
        join public.connector_connection c on c.id = fs.connection_id
       where c.merchant_id = m.id and fs.needs_review
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.rpc_cinema_bookings_for_merchant(p_merchant_id uuid, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant := cinema.require_cinema(p_merchant_id);
begin
  return coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'holdId', h.id, 'state', h.state, 'filmTitle', f.title, 'startsAt', s.starts_at, 'screenName', sc.name,
      'seats', to_jsonb(h.seat_codes), 'totalMinor', h.total_minor, 'bookingRef', h.source_booking_ref,
      'nexgRef', upper(left(h.id::text, 8)), 'refundReason', h.refund_reason, 'updatedAt', h.updated_at
    )) order by h.updated_at desc)
    from (select hh.* from cinema.hold hh
            join cinema.showing s2 on s2.id = hh.showing_id
            join cinema.screen sc2 on sc2.id = s2.screen_id
           where hh.connection_id is not null and sc2.merchant_id = m.id
             and hh.state not in ('held', 'released', 'expired')
           order by hh.updated_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) h
    join cinema.showing s on s.id = h.showing_id
    join cinema.screen sc on sc.id = s.screen_id
    join cinema.film f on f.id = s.film_id
  ), '[]'::jsonb);
end;
$$;

-- ═══════════════════════════════════════════════ 7. the old path and the reads

/* A connected cinema's seats are held on its own system, never by the
   in-database hold, and confirmed only with the cinema's booking reference. */
create or replace function cinema.guard_connected_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.connection_id is null and exists (
       select 1 from cinema.showing s join cinema.screen sc on sc.id = s.screen_id
        where s.id = new.showing_id and sc.connection_id is not null) then
    raise exception 'Hold these seats through the cinema checkout.' using errcode = '22023', hint = 'use_cinema_checkout';
  end if;
  if tg_op = 'UPDATE' and new.connection_id is not null and new.state = 'confirmed'
     and old.state <> 'confirmed' and new.source_booking_ref is null then
    raise exception 'A connected cinema confirms with its own booking reference.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function cinema.guard_connected_hold() from public, anon, authenticated;

drop trigger if exists cinema_hold_guard_connected on cinema.hold;
create trigger cinema_hold_guard_connected
before insert or update on cinema.hold
for each row execute function cinema.guard_connected_hold();

/* 20261212090200, except that a connected cinema's own system decides: a
   showing it moves is moved. */
create or replace function cinema.guard_showing_changes()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.connection_id is not null then
    return new;
  end if;
  if (new.film_id, new.screen_id, new.starts_at, new.ends_at, new.format, new.language)
    is distinct from (old.film_id, old.screen_id, old.starts_at, old.ends_at, old.format, old.language)
    and exists (
      select 1 from cinema.hold where showing_id = old.id
        and (state = 'confirmed' or (state = 'held' and guest_id is not null and expires_at > clock_timestamp()))
    ) then
    raise exception 'A showing with seat commitments cannot be rescheduled or reassigned.' using errcode = '22023';
  end if;
  return new;
end;
$$;

/* 20261212090200's seat map. For a connected cinema, the seats taken are the
   cinema's last answer (live: false); the app asks the cinema itself through
   /api/customer/cinema/showings/{id}/seats. */
create or replace function public.rpc_cinema_seat_map(p_showing_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_showing cinema.public_showing;
  v_connected boolean;
  v_snapshot cinema.seat_snapshot;
begin
  select * into v_showing from cinema.public_showing
  where id = p_showing_id and starts_at > statement_timestamp() + interval '10 minutes';
  if not found then
    raise exception 'This showing is no longer on sale.' using errcode = 'P0002';
  end if;
  select sc.connection_id is not null into v_connected from cinema.screen sc where sc.id = v_showing.screen_id;
  if v_connected then
    select * into v_snapshot from cinema.seat_snapshot where showing_id = p_showing_id;
  end if;
  return jsonb_strip_nulls(jsonb_build_object(
    'showingId', v_showing.id,
    'observedAt', case when v_connected then coalesce(v_snapshot.observed_at,
                         (select sh.synced_at from cinema.showing sh where sh.id = v_showing.id))
                       else statement_timestamp() end,
    'live', case when v_connected then false end,
    'plan', jsonb_build_object(
      'screenId', v_showing.screen_id, 'screenName', v_showing.screen_name,
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object('label', r.label, 'cells', cells.items) order by r.position)
        from cinema.screen_row r
        cross join lateral (
          select jsonb_agg(case when seat.code is null then null else jsonb_build_object(
            'id', seat.code, 'row', r.label, 'number', seat.number, 'type', seat.seat_type
          ) end order by col.position) as items
          from generate_series(1, (
            select max(s.column_position) from cinema.seat s
            where s.screen_id = r.screen_id and s.row_position = r.position
          )) as col(position)
          left join cinema.seat seat on seat.screen_id = r.screen_id
            and seat.row_position = r.position and seat.column_position = col.position
        ) cells
        where r.screen_id = v_showing.screen_id and cells.items is not null
      ), '[]'::jsonb)
    ),
    'taken', case when v_connected then to_jsonb(coalesce(v_snapshot.taken, '{}'::text[]))
      else coalesce((
        select jsonb_agg(a.seat_code order by a.seat_code)
        from cinema.allocation a
        join cinema.hold h on h.id = a.hold_id
        where a.showing_id = v_showing.id
          and (h.state = 'confirmed' or (h.state = 'held' and h.guest_id is not null and h.expires_at > statement_timestamp()))
      ), '[]'::jsonb) end
  ));
end;
$$;

/* 20261212090200's programme, plus when each showing was last synced from
   the cinema's system (syncedAt; absent for a cinema that is not connected). */
create or replace function public.rpc_cinema_programme(
  p_from date, p_days integer default 7, p_merchant_id uuid default null, p_film_id uuid default null
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (statement_timestamp() at time zone 'Africa/Nairobi')::date;
begin
  if p_from is null or p_days is null or p_days not between 1 and 7
    or p_from < v_today or p_from + p_days > v_today + 7 then
    raise exception 'Choose days in the current seven-day programme.' using errcode = '22023';
  end if;

  return (
    with showings as materialized (
      select s.*, sh.synced_at
      from cinema.public_showing s
      join cinema.showing sh on sh.id = s.id
      where s.starts_at >= (p_from::timestamp at time zone 'Africa/Nairobi')
        and s.starts_at < ((p_from + p_days)::timestamp at time zone 'Africa/Nairobi')
        and s.starts_at > statement_timestamp() + interval '10 minutes'
        and (p_merchant_id is null or s.merchant_id = p_merchant_id)
        and (p_film_id is null or s.film_id = p_film_id)
    )
    select jsonb_build_object(
      'observedAt', statement_timestamp(),
      'films', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', f.id, 'title', f.title, 'classification', f.classification,
          'languages', f.languages, 'genres', f.genres, 'runtimeMinutes', f.runtime_minutes,
          'releaseDate', f.release_date, 'synopsis', f.synopsis, 'poster', f.poster_url,
          'trailerUrl', f.trailer_url,
          'preview', case when f.preview_video_url is not null then
            jsonb_build_object('video', f.preview_video_url, 'poster', f.preview_poster_url) end
        )) order by f.id)
        from cinema.film f where exists (select 1 from showings s where s.film_id = f.id)
      ), '[]'::jsonb),
      'showings', coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', s.id, 'filmId', s.film_id, 'merchantId', s.merchant_id,
          'screenId', s.screen_id, 'screenName', s.screen_name, 'startsAt', s.starts_at,
          'format', s.format, 'language', s.language, 'currency', 'KES',
          'syncedAt', s.synced_at,
          'prices', jsonb_build_object(
            'standard', s.standard_minor::numeric / 100,
            'vip', s.vip_minor::numeric / 100,
            'wheelchair', s.wheelchair_minor::numeric / 100
          )
        )) order by s.starts_at, s.id) from showings s
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- ═══════════════════════════════════════════════ who may call what

-- Inside the cinema schema: helpers only, called by the functions above.
revoke all on function cinema.film_for_source(uuid, jsonb) from public, anon, authenticated;
revoke all on function cinema.screen_for_source(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function cinema.showing_cancelled(uuid) from public, anon, authenticated;
revoke all on function cinema.connected_hold_result(uuid) from public, anon, authenticated;
revoke all on function cinema.require_cinema(uuid) from public, anon, authenticated;
revoke all on function cinema.connection_for(uuid) from public, anon, authenticated;
revoke all on function cinema.hold_message(text, text, text, bigint) from public, anon, authenticated;
revoke all on function cinema.kes(bigint) from public, anon, authenticated;

-- The trusted server (the website's cinema endpoints and worker) only.
revoke all on function public.cinema_sync_apply(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.cinema_sync_failed(uuid, text) from public, anon, authenticated;
revoke all on function public.cinema_record_snapshot(uuid, text[], timestamptz) from public, anon, authenticated;
revoke all on function public.cinema_record_hold(uuid, uuid, uuid, text[], jsonb, bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.cinema_record_paying(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.cinema_payment_settled(uuid, text) from public, anon, authenticated;
revoke all on function public.cinema_record_confirm(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.cinema_record_confirm_failed(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.cinema_record_hold_ended(uuid, text) from public, anon, authenticated;
revoke all on function public.cinema_record_cancelled(uuid, text) from public, anon, authenticated;
revoke all on function public.cinema_record_refunded(uuid, text) from public, anon, authenticated;
revoke all on function public.cinema_due_work(integer) from public, anon, authenticated;
revoke all on function public.cinema_hold_for_worker(uuid) from public, anon, authenticated;
revoke all on function public.cinema_showing_for_call(uuid) from public, anon, authenticated;
revoke all on function public.fn_cinema_worker_poke() from public, anon, authenticated;
revoke all on function public.cron_cinema_worker() from public, anon, authenticated;
grant execute on function public.cinema_sync_apply(uuid, jsonb) to service_role;
grant execute on function public.cinema_sync_failed(uuid, text) to service_role;
grant execute on function public.cinema_record_snapshot(uuid, text[], timestamptz) to service_role;
grant execute on function public.cinema_record_hold(uuid, uuid, uuid, text[], jsonb, bigint, text, timestamptz) to service_role;
grant execute on function public.cinema_record_paying(uuid, timestamptz) to service_role;
grant execute on function public.cinema_payment_settled(uuid, text) to service_role;
grant execute on function public.cinema_record_confirm(uuid, text, jsonb) to service_role;
grant execute on function public.cinema_record_confirm_failed(uuid, text, boolean) to service_role;
grant execute on function public.cinema_record_hold_ended(uuid, text) to service_role;
grant execute on function public.cinema_record_cancelled(uuid, text) to service_role;
grant execute on function public.cinema_record_refunded(uuid, text) to service_role;
grant execute on function public.cinema_due_work(integer) to service_role;
grant execute on function public.cinema_hold_for_worker(uuid) to service_role;
grant execute on function public.cinema_showing_for_call(uuid) to service_role;
grant execute on function public.cron_cinema_worker() to service_role;

-- Signed in: the customer's own hold; the cinema's team and NexG staff.
revoke all on function public.rpc_my_cinema_hold(uuid) from public, anon;
revoke all on function public.rpc_cinema_connection(uuid) from public, anon;
revoke all on function public.rpc_cinema_connect(uuid, text) from public, anon;
revoke all on function public.rpc_cinema_pause(uuid, boolean) from public, anon;
revoke all on function public.rpc_cinema_programme_for_merchant(uuid, date, integer) from public, anon;
revoke all on function public.rpc_cinema_bookings_for_merchant(uuid, integer) from public, anon;
grant execute on function public.rpc_my_cinema_hold(uuid) to authenticated;
grant execute on function public.rpc_cinema_connection(uuid) to authenticated;
grant execute on function public.rpc_cinema_connect(uuid, text) to authenticated;
grant execute on function public.rpc_cinema_pause(uuid, boolean) to authenticated;
grant execute on function public.rpc_cinema_programme_for_merchant(uuid, date, integer) to authenticated;
grant execute on function public.rpc_cinema_bookings_for_merchant(uuid, integer) to authenticated;
