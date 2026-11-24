-- The sandbox cinema: a ticketing system NexG can call before a real cinema
-- is connected (owner, 23 Nov 2026: "no real cinema so build out end to end
-- still with what we have").
--
-- It behaves like a real cinema's system, with its own state, kept apart from
-- the cinema cache (schema cinema_sandbox):
--   * a rolling seven-day programme on two screens, three films, standard,
--     VIP and wheelchair seats;
--   * a box office that keeps selling seats as a showing draws near;
--   * holds that expire, extensions up to 20 minutes, confirmations that issue
--     a ticket per seat, a lookup by request id, release, and cancellation up
--     to 30 minutes before the start;
--   * faults switched on per tenant for tests: down, slow, a seat taken
--     between the map and the hold, a confirm that fails once, a confirm
--     refused, and a confirm that books but answers too late.
--
-- A tenant is one sandbox connection (connector_connection, adapter
-- sandbox-cinema), so each test cinema has its own system. The website's
-- sandbox adapter calls public.sandbox_cinema(tenant, operation, arguments)
-- as the service role; nothing else may.
--
-- Rollback: drop function public.sandbox_cinema and the cinema_sandbox schema.

create schema if not exists cinema_sandbox;
revoke all on schema cinema_sandbox from public, anon, authenticated;

create table if not exists cinema_sandbox.showing (
  tenant uuid not null references public.connector_connection (id) on delete cascade,
  ref text not null,
  film_ref text not null,
  screen_ref text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'on_sale' check (status in ('on_sale', 'cancelled')),
  primary key (tenant, ref)
);

create table if not exists cinema_sandbox.seat_state (
  tenant uuid not null,
  showing_ref text not null,
  code text not null,
  state text not null check (state in ('sold', 'held')),
  hold_ref text,
  booking_ref text,
  expires_at timestamptz,
  primary key (tenant, showing_ref, code),
  foreign key (tenant, showing_ref) references cinema_sandbox.showing (tenant, ref) on delete cascade
);

create table if not exists cinema_sandbox.hold (
  tenant uuid not null references public.connector_connection (id) on delete cascade,
  ref text primary key,
  showing_ref text not null,
  seats text[] not null,
  request_id text not null,
  total_minor bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  state text not null default 'held' check (state in ('held', 'confirmed', 'released', 'expired')),
  unique (tenant, request_id)
);

create table if not exists cinema_sandbox.booking (
  tenant uuid not null references public.connector_connection (id) on delete cascade,
  ref text primary key,
  hold_ref text not null unique references cinema_sandbox.hold (ref),
  request_id text not null,
  payment_ref text,
  tickets jsonb not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (tenant, request_id)
);

create table if not exists cinema_sandbox.fault (
  tenant uuid not null references public.connector_connection (id) on delete cascade,
  mode text not null check (mode in ('down', 'slow', 'seat_taken', 'confirm_fails_once', 'confirm_refused', 'confirm_late')),
  remaining integer not null default 1 check (remaining >= 0),
  primary key (tenant, mode)
);

alter table cinema_sandbox.showing enable row level security;
alter table cinema_sandbox.seat_state enable row level security;
alter table cinema_sandbox.hold enable row level security;
alter table cinema_sandbox.booking enable row level security;
alter table cinema_sandbox.fault enable row level security;

-- ═══════════════════════════════════════════════ what the sandbox cinema shows

create or replace function cinema_sandbox.films()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '[
    {"ref": "SBX-FILM-1", "title": "[Test] The Long Rains", "classification": "PG", "runtimeMinutes": 112,
     "releaseDate": "2026-10-02", "languages": ["English", "Swahili"], "genres": ["Drama"],
     "synopsis": "A test film for the NexG sandbox cinema.", "externalIds": {"sandbox": "long-rains"}},
    {"ref": "SBX-FILM-2", "title": "[Test] Matatu Nights", "classification": "16", "runtimeMinutes": 98,
     "releaseDate": "2026-11-06", "languages": ["English"], "genres": ["Comedy"],
     "synopsis": "A test film for the NexG sandbox cinema.", "externalIds": {"sandbox": "matatu-nights"}},
    {"ref": "SBX-FILM-3", "title": "[Test] Savannah Sky", "classification": "GE", "runtimeMinutes": 90,
     "releaseDate": "2026-09-18", "languages": ["English"], "genres": ["Family", "Animation"],
     "synopsis": "A test film for the NexG sandbox cinema.", "externalIds": {"sandbox": "savannah-sky"}}
  ]'::jsonb
$$;

/* Two screens: rows A–F of ten seats; A1 and A10 wheelchair spaces, row F VIP. */
create or replace function cinema_sandbox.screens()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_agg(jsonb_build_object(
    'ref', sc.ref, 'name', sc.name, 'layoutVersion', 'sbx-1',
    'rows', (select jsonb_agg(jsonb_build_object(
               'label', r.label, 'position', r.position,
               'seats', (select jsonb_agg(jsonb_build_object(
                           'code', r.label || n, 'column', n, 'number', n,
                           'type', case when r.label = 'F' then 'vip'
                                        when r.label = 'A' and n in (1, 10) then 'wheelchair'
                                        else 'standard' end) order by n)
                         from generate_series(1, 10) n))
             order by r.position)
             from (values ('A', 1), ('B', 2), ('C', 3), ('D', 4), ('E', 5), ('F', 6)) r(label, position))
  ) order by sc.ref)
  from (values ('SBX-SCREEN-1', 'Screen 1'), ('SBX-SCREEN-2', 'Screen 2')) sc(ref, name)
$$;

create or replace function cinema_sandbox.price_minor(p_seat_type text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case p_seat_type when 'vip' then 90000 else 65000 end::bigint
$$;

create or replace function cinema_sandbox.seat_type(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when left(p_code, 1) = 'F' then 'vip'
              when p_code in ('A1', 'A10') then 'wheelchair'
              else 'standard' end
$$;

/* Three showings a day on each screen for the next seven Nairobi days. */
create or replace function cinema_sandbox.ensure_programme(p_tenant uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into cinema_sandbox.showing (tenant, ref, film_ref, screen_ref, starts_at, ends_at)
  select p_tenant,
         'SBX-' || to_char(d, 'YYYYMMDD') || '-' || sc.n || '-' || t.slot,
         'SBX-FILM-' || (((extract(doy from d)::int + sc.n + t.slot) % 3) + 1),
         'SBX-SCREEN-' || sc.n,
         (d::timestamp + t.at) at time zone 'Africa/Nairobi',
         (d::timestamp + t.at + interval '2 hours 30 minutes') at time zone 'Africa/Nairobi'
    from generate_series((now() at time zone 'Africa/Nairobi')::date,
                         (now() at time zone 'Africa/Nairobi')::date + 6, interval '1 day') d
   cross join (values (1), (2)) sc(n)
   cross join (values (1, time '13:00'), (2, time '16:30'), (3, time '20:00')) t(slot, at)
  on conflict (tenant, ref) do nothing;
$$;

/* The box office sells seats as a showing draws near: about 10% a week out,
   up to 40% by the start, the same seats every time it is asked. */
create or replace function cinema_sandbox.box_office(p_tenant uuid, p_showing_ref text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into cinema_sandbox.seat_state (tenant, showing_ref, code, state, booking_ref)
  select p_tenant, s.ref, seat.code, 'sold', 'BOX-' || left(md5(s.ref || seat.code), 8)
    from cinema_sandbox.showing s
   cross join lateral (
     select r.label || n as code
       from (values ('A'), ('B'), ('C'), ('D'), ('E'), ('F')) r(label), generate_series(1, 10) n
   ) seat
   where s.tenant = p_tenant and s.ref = p_showing_ref
     and ('x' || left(md5(s.ref || ':' || seat.code), 8))::bit(32)::bigint / 4294967295.0
         < 0.10 + 0.30 * greatest(0, least(1, 1 - extract(epoch from (s.starts_at - now())) / (7 * 86400)))
  on conflict (tenant, showing_ref, code) do nothing;
$$;

create or replace function cinema_sandbox.consume_fault(p_tenant uuid, p_mode text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update cinema_sandbox.fault set remaining = remaining - 1
   where tenant = p_tenant and mode = p_mode and remaining > 0;
  return found;
end;
$$;

-- ═══════════════════════════════════════════════ the system's operations

create or replace function public.sandbox_cinema(p_tenant uuid, p_op text, p_args jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_args jsonb := coalesce(p_args, '{}'::jsonb);
  v_show cinema_sandbox.showing;
  v_hold cinema_sandbox.hold;
  v_booking cinema_sandbox.booking;
  v_seats text[];
  v_taken text[];
  v_ref text;
  v_ttl integer;
  v_from timestamptz;
  v_to timestamptz;
begin
  if not exists (select 1 from public.connector_connection c
                  where c.id = p_tenant and c.adapter_id = 'sandbox-cinema') then
    return jsonb_build_object('ok', false, 'error', 'unknown_tenant');
  end if;

  -- Faults the caller acts on (the adapter waits, or answers as if down).
  if p_op = 'fault' then
    return jsonb_build_object('ok', true,
      'down', cinema_sandbox.consume_fault(p_tenant, 'down'),
      'slow', cinema_sandbox.consume_fault(p_tenant, 'slow'));
  end if;

  if p_op = 'set_fault' then
    insert into cinema_sandbox.fault (tenant, mode, remaining)
    values (p_tenant, v_args ->> 'mode', coalesce((v_args ->> 'remaining')::int, 1))
    on conflict (tenant, mode) do update set remaining = excluded.remaining;
    return jsonb_build_object('ok', true);
  end if;

  perform cinema_sandbox.ensure_programme(p_tenant);
  -- Holds left past their time are expired here, as a real system would.
  update cinema_sandbox.hold set state = 'expired' where tenant = p_tenant and state = 'held' and expires_at <= now();
  delete from cinema_sandbox.seat_state ss using cinema_sandbox.hold h
   where ss.tenant = p_tenant and ss.state = 'held' and ss.hold_ref = h.ref and h.state <> 'held';

  if p_op = 'programme' then
    v_from := coalesce(nullif(v_args ->> 'from', '')::timestamptz, now());
    v_to := v_from + make_interval(days => least(greatest(coalesce((v_args ->> 'days')::int, 7), 1), 14));
    return jsonb_build_object(
      'ok', true,
      'window', jsonb_build_object('from', v_from, 'to', v_to),
      'films', cinema_sandbox.films(),
      'screens', cinema_sandbox.screens(),
      'showings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'ref', s.ref, 'filmRef', s.film_ref, 'screenRef', s.screen_ref,
          'startsAt', s.starts_at, 'endsAt', s.ends_at, 'format', '2D', 'language', 'English',
          'status', s.status,
          'prices', jsonb_build_object('standardMinor', 65000, 'vipMinor', 90000, 'wheelchairMinor', 65000))
          order by s.starts_at, s.screen_ref)
        from cinema_sandbox.showing s
        where s.tenant = p_tenant and s.starts_at >= v_from and s.starts_at < v_to), '[]'::jsonb));
  end if;

  if p_op = 'cancel_showing' then
    update cinema_sandbox.showing set status = 'cancelled'
     where tenant = p_tenant and ref = v_args ->> 'showingRef';
    return jsonb_build_object('ok', found);
  end if;

  if p_op = 'seat_map' then
    select * into v_show from cinema_sandbox.showing where tenant = p_tenant and ref = v_args ->> 'showingRef';
    if not found or v_show.status <> 'on_sale' or v_show.starts_at <= now() + interval '10 minutes' then
      return jsonb_build_object('ok', false, 'error', 'showing_closed');
    end if;
    perform cinema_sandbox.box_office(p_tenant, v_show.ref);
    return jsonb_build_object('ok', true, 'showingRef', v_show.ref, 'observedAt', clock_timestamp(),
      'taken', coalesce((select jsonb_agg(code order by code) from cinema_sandbox.seat_state
                          where tenant = p_tenant and showing_ref = v_show.ref), '[]'::jsonb));
  end if;

  if p_op = 'hold' then
    select * into v_hold from cinema_sandbox.hold where tenant = p_tenant and request_id = v_args ->> 'requestId';
    if found then
      return jsonb_build_object('ok', true, 'holdRef', v_hold.ref, 'expiresAt', v_hold.expires_at,
        'totalMinor', v_hold.total_minor,
        'lines', (select jsonb_agg(jsonb_build_object('seat', x, 'type', cinema_sandbox.seat_type(x),
                                                      'priceMinor', cinema_sandbox.price_minor(cinema_sandbox.seat_type(x))) order by x)
                    from unnest(v_hold.seats) x));
    end if;
    select * into v_show from cinema_sandbox.showing where tenant = p_tenant and ref = v_args ->> 'showingRef'
      for update;
    if not found or v_show.status <> 'on_sale' or v_show.starts_at <= now() + interval '10 minutes' then
      return jsonb_build_object('ok', false, 'error', 'showing_closed');
    end if;
    select array_agg(distinct x order by x) into v_seats
      from jsonb_array_elements_text(coalesce(v_args -> 'seats', '[]'::jsonb)) x;
    if coalesce(cardinality(v_seats), 0) not between 1 and 10
       or exists (select 1 from unnest(v_seats) x where x !~ '^[A-F]([1-9]|10)$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_seats');
    end if;
    perform cinema_sandbox.box_office(p_tenant, v_show.ref);
    if cinema_sandbox.consume_fault(p_tenant, 'seat_taken') then
      insert into cinema_sandbox.seat_state (tenant, showing_ref, code, state, booking_ref)
      values (p_tenant, v_show.ref, v_seats[1], 'sold', 'BOX-RACE')
      on conflict (tenant, showing_ref, code) do nothing;
    end if;
    select array_agg(code order by code) into v_taken from cinema_sandbox.seat_state
     where tenant = p_tenant and showing_ref = v_show.ref and code = any(v_seats);
    if v_taken is not null then
      return jsonb_build_object('ok', false, 'error', 'seat_taken', 'seats', to_jsonb(v_taken));
    end if;
    v_ttl := least(greatest(coalesce((v_args ->> 'ttlSeconds')::int, 420), 60), 420);
    v_ref := 'SBX-H-' || upper(left(md5(p_tenant::text || (v_args ->> 'requestId')), 10));
    insert into cinema_sandbox.hold (tenant, ref, showing_ref, seats, request_id, total_minor, expires_at)
    values (p_tenant, v_ref, v_show.ref, v_seats, v_args ->> 'requestId',
            (select sum(cinema_sandbox.price_minor(cinema_sandbox.seat_type(x))) from unnest(v_seats) x),
            least(now() + make_interval(secs => v_ttl), v_show.starts_at - interval '10 minutes'))
    returning * into v_hold;
    insert into cinema_sandbox.seat_state (tenant, showing_ref, code, state, hold_ref, expires_at)
    select p_tenant, v_show.ref, x, 'held', v_ref, v_hold.expires_at from unnest(v_seats) x;
    return jsonb_build_object('ok', true, 'holdRef', v_hold.ref, 'expiresAt', v_hold.expires_at,
      'totalMinor', v_hold.total_minor,
      'lines', (select jsonb_agg(jsonb_build_object('seat', x, 'type', cinema_sandbox.seat_type(x),
                                                    'priceMinor', cinema_sandbox.price_minor(cinema_sandbox.seat_type(x))) order by x)
                  from unnest(v_seats) x));
  end if;

  if p_op = 'extend' then
    select * into v_hold from cinema_sandbox.hold where tenant = p_tenant and ref = v_args ->> 'holdRef' for update;
    if not found or v_hold.state <> 'held' then
      return jsonb_build_object('ok', false, 'error', 'hold_expired');
    end if;
    select * into v_show from cinema_sandbox.showing where tenant = p_tenant and ref = v_hold.showing_ref;
    update cinema_sandbox.hold
       set expires_at = least(greatest(expires_at, nullif(v_args ->> 'until', '')::timestamptz),
                              created_at + interval '20 minutes', v_show.starts_at - interval '10 minutes')
     where ref = v_hold.ref returning * into v_hold;
    update cinema_sandbox.seat_state set expires_at = v_hold.expires_at where tenant = p_tenant and hold_ref = v_hold.ref;
    return jsonb_build_object('ok', true, 'holdRef', v_hold.ref, 'expiresAt', v_hold.expires_at);
  end if;

  if p_op = 'confirm' then
    select * into v_booking from cinema_sandbox.booking where tenant = p_tenant and request_id = v_args ->> 'requestId';
    if found then
      return jsonb_build_object('ok', true, 'bookingRef', v_booking.ref, 'tickets', v_booking.tickets);
    end if;
    if cinema_sandbox.consume_fault(p_tenant, 'confirm_fails_once') then
      return jsonb_build_object('ok', false, 'error', 'unavailable', 'retryable', true);
    end if;
    select * into v_hold from cinema_sandbox.hold where tenant = p_tenant and ref = v_args ->> 'holdRef' for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'hold_expired');
    end if;
    -- A showing the cinema has cancelled, or whose sales have closed, books
    -- nothing, however late the payment.
    if exists (select 1 from cinema_sandbox.showing
                where tenant = p_tenant and ref = v_hold.showing_ref
                  and (status = 'cancelled' or starts_at - interval '10 minutes' <= now())) then
      return jsonb_build_object('ok', false, 'error', 'showing_closed');
    end if;
    if cinema_sandbox.consume_fault(p_tenant, 'confirm_refused') then
      return jsonb_build_object('ok', false, 'error', 'seat_lost');
    end if;
    if v_hold.state = 'expired' or (v_hold.state = 'held' and v_hold.expires_at <= now()) then
      -- A late payment: still booked if nobody else has the seats.
      if exists (select 1 from cinema_sandbox.seat_state
                  where tenant = p_tenant and showing_ref = v_hold.showing_ref and code = any(v_hold.seats)
                    and coalesce(hold_ref, '') <> v_hold.ref) then
        return jsonb_build_object('ok', false, 'error', 'seat_lost');
      end if;
    elsif v_hold.state <> 'held' then
      return jsonb_build_object('ok', false, 'error', 'hold_expired');
    end if;
    v_ref := 'SBX-B-' || upper(left(md5(v_hold.ref || ':booking'), 10));
    insert into cinema_sandbox.booking (tenant, ref, hold_ref, request_id, payment_ref, tickets)
    values (p_tenant, v_ref, v_hold.ref, v_args ->> 'requestId', v_args ->> 'paymentRef',
            (select jsonb_agg(jsonb_build_object('seat', x, 'ticketRef', v_ref || '-' || x,
                                                 'barcode', upper(left(md5(v_ref || x), 12))) order by x)
               from unnest(v_hold.seats) x))
    returning * into v_booking;
    update cinema_sandbox.hold set state = 'confirmed' where ref = v_hold.ref;
    insert into cinema_sandbox.seat_state (tenant, showing_ref, code, state, booking_ref)
    select p_tenant, v_hold.showing_ref, x, 'sold', v_ref from unnest(v_hold.seats) x
    on conflict (tenant, showing_ref, code) do update set state = 'sold', booking_ref = excluded.booking_ref,
      hold_ref = null, expires_at = null;
    return jsonb_build_object('ok', true, 'bookingRef', v_booking.ref, 'tickets', v_booking.tickets,
      'late', cinema_sandbox.consume_fault(p_tenant, 'confirm_late'));
  end if;

  if p_op = 'lookup' then
    select * into v_booking from cinema_sandbox.booking where tenant = p_tenant and request_id = v_args ->> 'requestId';
    if not found then
      return jsonb_build_object('ok', true, 'found', false);
    end if;
    return jsonb_build_object('ok', true, 'found', true, 'bookingRef', v_booking.ref, 'tickets', v_booking.tickets,
                              'cancelled', v_booking.cancelled_at is not null);
  end if;

  if p_op = 'release' then
    update cinema_sandbox.hold set state = 'released'
     where tenant = p_tenant and ref = v_args ->> 'holdRef' and state = 'held';
    delete from cinema_sandbox.seat_state where tenant = p_tenant and hold_ref = v_args ->> 'holdRef' and state = 'held';
    return jsonb_build_object('ok', true);
  end if;

  if p_op = 'cancel' then
    select * into v_booking from cinema_sandbox.booking where tenant = p_tenant and ref = v_args ->> 'bookingRef' for update;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    if v_booking.cancelled_at is not null then
      return jsonb_build_object('ok', true, 'cancelled', true, 'refundable', true);
    end if;
    select s.* into v_show from cinema_sandbox.showing s
      join cinema_sandbox.hold h on h.showing_ref = s.ref and h.tenant = s.tenant
     where h.ref = v_booking.hold_ref;
    if v_show.starts_at <= now() + interval '30 minutes' then
      return jsonb_build_object('ok', false, 'error', 'cancel_window_closed');
    end if;
    update cinema_sandbox.booking set cancelled_at = now() where ref = v_booking.ref;
    delete from cinema_sandbox.seat_state where tenant = p_tenant and booking_ref = v_booking.ref;
    return jsonb_build_object('ok', true, 'cancelled', true, 'refundable', true);
  end if;

  return jsonb_build_object('ok', false, 'error', 'unknown_operation');
end;
$$;

revoke all on function public.sandbox_cinema(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.sandbox_cinema(uuid, text, jsonb) to service_role;
revoke all on function cinema_sandbox.ensure_programme(uuid) from public, anon, authenticated;
revoke all on function cinema_sandbox.box_office(uuid, text) from public, anon, authenticated;
revoke all on function cinema_sandbox.consume_fault(uuid, text) from public, anon, authenticated;
