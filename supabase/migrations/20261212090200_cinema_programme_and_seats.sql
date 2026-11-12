-- Cinema operators publish a programme into a private catalogue. Public RPCs
-- expose only bookable showings and seat availability. Seat holds use one lock
-- per showing and unique seat allocations. No payment is taken by these RPCs.

create schema cinema;
revoke all on schema cinema from public, anon, authenticated;

create table cinema.film (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 200),
  classification text check (classification in ('GE', 'PG', '16', '18', 'R')),
  languages text[] not null default '{}',
  genres text[] not null default '{}',
  runtime_minutes integer check (runtime_minutes > 0),
  release_date date,
  synopsis text,
  poster_url text check (poster_url like 'https://%'),
  preview_video_url text check (preview_video_url like 'https://%'),
  preview_poster_url text check (preview_poster_url like 'https://%'),
  trailer_url text check (trailer_url like 'https://%')
);

create table cinema.screen (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid references public.merchant (id) on delete set null,
  name text not null check (length(btrim(name)) between 1 and 100),
  unique (merchant_id, name)
);

create table cinema.screen_row (
  screen_id uuid not null references cinema.screen (id),
  position smallint not null check (position between 1 and 200),
  label text not null check (length(btrim(label)) between 1 and 12),
  primary key (screen_id, position),
  unique (screen_id, label)
);

create table cinema.seat (
  screen_id uuid not null,
  row_position smallint not null,
  column_position smallint not null check (column_position between 1 and 200),
  number smallint not null check (number > 0),
  code text not null check (length(btrim(code)) between 1 and 12),
  seat_type text not null check (seat_type in ('standard', 'vip', 'wheelchair')),
  primary key (screen_id, code),
  unique (screen_id, row_position, column_position),
  unique (screen_id, row_position, number),
  foreign key (screen_id, row_position) references cinema.screen_row (screen_id, position)
);

create table cinema.showing (
  id uuid primary key default gen_random_uuid(),
  film_id uuid not null references cinema.film (id),
  screen_id uuid not null references cinema.screen (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  format text not null check (length(btrim(format)) between 1 and 80),
  language text,
  status text not null default 'draft' check (status in ('draft', 'on_sale', 'closed', 'cancelled')),
  standard_minor integer check (standard_minor > 0),
  vip_minor integer check (vip_minor > 0),
  wheelchair_minor integer check (wheelchair_minor > 0),
  check (ends_at > starts_at),
  unique (id, screen_id),
  exclude using gist (
    screen_id extensions.gist_uuid_ops with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('on_sale', 'closed'))
);
create index cinema_showing_film_start_idx on cinema.showing (film_id, starts_at);
create index cinema_showing_screen_start_idx on cinema.showing (screen_id, starts_at);
create index cinema_showing_sale_idx on cinema.showing (starts_at) where status = 'on_sale';

create table cinema.hold (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid references auth.users (id) on delete set null,
  request_id uuid not null,
  showing_id uuid not null references cinema.showing (id),
  seat_codes text[] not null check (cardinality(seat_codes) between 1 and 10),
  total_minor bigint not null check (total_minor > 0),
  expires_at timestamptz not null,
  state text not null default 'held' check (state in ('held', 'released', 'confirmed')),
  confirmation_ref text,
  check ((state = 'confirmed') = (confirmation_ref is not null)),
  unique (guest_id, request_id),
  unique (showing_id, id),
  unique (showing_id, confirmation_ref)
);

create table cinema.allocation (
  showing_id uuid not null,
  screen_id uuid not null,
  seat_code text not null,
  hold_id uuid not null,
  primary key (showing_id, seat_code),
  foreign key (showing_id, screen_id) references cinema.showing (id, screen_id),
  foreign key (showing_id, hold_id) references cinema.hold (showing_id, id),
  foreign key (screen_id, seat_code) references cinema.seat (screen_id, code)
);
create index cinema_allocation_hold_idx on cinema.allocation (showing_id, hold_id);
create index cinema_allocation_seat_idx on cinema.allocation (screen_id, seat_code);

alter table cinema.film enable row level security;
alter table cinema.screen enable row level security;
alter table cinema.screen_row enable row level security;
alter table cinema.seat enable row level security;
alter table cinema.showing enable row level security;
alter table cinema.hold enable row level security;
alter table cinema.allocation enable row level security;

-- Only the trusted cinema ingestion service can publish. The same film ID
-- can be used by any operator. Screen and showing IDs stay with their owner.
create function public.rpc_cinema_publish_showing(
  p_merchant_id uuid, p_film jsonb, p_screen jsonb, p_showing jsonb, p_rows jsonb default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_film cinema.film;
  v_showing cinema.showing;
  v_screen_id uuid := (p_screen ->> 'id')::uuid;
  v_row record;
  v_seat record;
  v_seat_count integer := 0;
begin
  if not exists (
    select 1 from public.merchant where id = p_merchant_id and category = 'experiences'
      and subcategory = 'cinemas' and deleted_at is null
  ) then
    raise exception 'The merchant must be registered as a cinema.' using errcode = '22023';
  end if;

  v_film := jsonb_populate_record(null::cinema.film, p_film);
  v_showing := jsonb_populate_record(null::cinema.showing, p_showing);

  insert into cinema.film (
    id, title, classification, languages, genres, runtime_minutes, release_date, synopsis,
    poster_url, preview_video_url, preview_poster_url, trailer_url
  )
  values (
    v_film.id, v_film.title, v_film.classification, coalesce(v_film.languages, '{}'),
    coalesce(v_film.genres, '{}'), v_film.runtime_minutes, v_film.release_date, v_film.synopsis,
    v_film.poster_url, v_film.preview_video_url, v_film.preview_poster_url, v_film.trailer_url
  )
  on conflict (id) do update set
    title = excluded.title, classification = excluded.classification, languages = excluded.languages,
    genres = excluded.genres, runtime_minutes = excluded.runtime_minutes, release_date = excluded.release_date,
    synopsis = excluded.synopsis, poster_url = excluded.poster_url, preview_video_url = excluded.preview_video_url,
    preview_poster_url = excluded.preview_poster_url, trailer_url = excluded.trailer_url;

  insert into cinema.screen (id, merchant_id, name)
  values (v_screen_id, p_merchant_id, p_screen ->> 'name')
  on conflict (id) do update set name = excluded.name
  where cinema.screen.merchant_id = excluded.merchant_id;
  if not found then
    raise exception 'The screen belongs to a different cinema.' using errcode = '42501';
  end if;

  if p_rows is not null then
    if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then
      raise exception 'Provide a valid seat layout.' using errcode = '22023';
    end if;

    for v_row in select * from jsonb_to_recordset(p_rows) as layout_row(position smallint, label text, seats jsonb)
    loop
      insert into cinema.screen_row (screen_id, position, label)
      values (v_screen_id, v_row.position, v_row.label) on conflict (screen_id, position) do nothing;
      if not exists (
        select 1 from cinema.screen_row where screen_id = v_screen_id
          and position = v_row.position and label = v_row.label
      ) then
        raise exception 'The published screen layout cannot be replaced.' using errcode = '22023';
      end if;

      for v_seat in select * from jsonb_to_recordset(v_row.seats)
        as seat(code text, column_position smallint, number smallint, seat_type text)
      loop
        insert into cinema.seat (screen_id, row_position, column_position, number, code, seat_type)
        values (v_screen_id, v_row.position, v_seat.column_position, v_seat.number, v_seat.code, v_seat.seat_type)
        on conflict (screen_id, code) do nothing;
        if not exists (
          select 1 from cinema.seat where screen_id = v_screen_id and code = v_seat.code
            and row_position = v_row.position and column_position = v_seat.column_position
            and number = v_seat.number and seat_type = v_seat.seat_type
        ) then
          raise exception 'The published seat layout cannot be replaced.' using errcode = '22023';
        end if;
        v_seat_count := v_seat_count + 1;
      end loop;
    end loop;

    if (select count(*) from cinema.screen_row where screen_id = v_screen_id) <> jsonb_array_length(p_rows)
      or (select count(*) from cinema.seat where screen_id = v_screen_id) <> v_seat_count then
      raise exception 'Provide the entire screen layout.' using errcode = '22023';
    end if;
  end if;
  if not exists (select 1 from cinema.seat where screen_id = v_screen_id) then
    raise exception 'Set up the screen layout before publishing.' using errcode = '22023';
  end if;

  insert into cinema.showing (
    id, film_id, screen_id, starts_at, ends_at, format, language, status, standard_minor, vip_minor, wheelchair_minor
  )
  values (
    v_showing.id, v_film.id, v_screen_id, v_showing.starts_at, v_showing.ends_at, v_showing.format,
    v_showing.language, coalesce(v_showing.status, 'draft'),
    v_showing.standard_minor, v_showing.vip_minor, v_showing.wheelchair_minor
  )
  on conflict (id) do update set
    film_id = excluded.film_id, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    format = excluded.format, language = excluded.language, status = excluded.status,
    standard_minor = excluded.standard_minor, vip_minor = excluded.vip_minor,
    wheelchair_minor = excluded.wheelchair_minor
  where cinema.showing.screen_id = excluded.screen_id;
  if not found then
    raise exception 'The showing belongs to a different screen.' using errcode = '42501';
  end if;
  return v_showing.id;
end;
$$;

create function cinema.guard_showing_changes()
returns trigger
language plpgsql set search_path = ''
as $$
begin
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

create trigger cinema_showing_guard_changes before update on cinema.showing
for each row execute function cinema.guard_showing_changes();

create view cinema.public_showing as
select showing.*, screen.merchant_id, screen.name as screen_name
from cinema.showing
join cinema.screen on screen.id = showing.screen_id
where showing.status = 'on_sale' and exists (
  select 1 from public.merchant_public merchant
  where merchant.id = screen.merchant_id and merchant.category = 'experiences' and merchant.subcategory = 'cinemas'
);

create function public.rpc_cinema_programme(
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
      select s.* from cinema.public_showing s
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

create function public.rpc_cinema_seat_map(p_showing_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_showing cinema.public_showing;
begin
  select * into v_showing from cinema.public_showing
  where id = p_showing_id and starts_at > statement_timestamp() + interval '10 minutes';
  if not found then
    raise exception 'This showing is no longer on sale.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'showingId', v_showing.id,
    'observedAt', statement_timestamp(),
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
    'taken', coalesce((
      select jsonb_agg(a.seat_code order by a.seat_code)
      from cinema.allocation a
      join cinema.hold h on h.id = a.hold_id
      where a.showing_id = v_showing.id
        and (h.state = 'confirmed' or (h.state = 'held' and h.guest_id is not null and h.expires_at > statement_timestamp()))
    ), '[]'::jsonb)
  );
end;
$$;

create function cinema.hold_result(p_hold cinema.hold)
returns jsonb
language sql stable set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'holdId', p_hold.id, 'showingId', p_hold.showing_id, 'seatIds', p_hold.seat_codes,
    'totalMinor', p_hold.total_minor, 'currency', 'KES', 'expiresAt', p_hold.expires_at,
    'status', case when p_hold.state = 'held' and p_hold.expires_at <= statement_timestamp()
      then 'expired' else p_hold.state end,
    'confirmationRef', p_hold.confirmation_ref
  ));
$$;

create function public.rpc_cinema_hold_seats(
  p_showing_id uuid, p_seat_ids text[], p_expected_total_minor bigint, p_request_id uuid
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_guest uuid := auth.uid();
  v_showing cinema.public_showing;
  v_hold cinema.hold;
  v_seats text[];
  v_priced integer;
  v_total bigint;
  v_now timestamptz;
begin
  if v_guest is null then
    raise exception 'Sign in to hold seats.' using errcode = '28000';
  end if;
  if p_showing_id is null or p_request_id is null or p_expected_total_minor is null
    or p_expected_total_minor <= 0 or coalesce(cardinality(p_seat_ids), 0) not between 1 and 10
    or array_ndims(p_seat_ids) <> 1 then
    raise exception 'Choose one to ten seats and review the total.' using errcode = '22023';
  end if;
  select array_agg(distinct code order by code) into v_seats from unnest(p_seat_ids) as seat(code)
  where length(btrim(code)) between 1 and 12;
  if coalesce(cardinality(v_seats), 0) <> cardinality(p_seat_ids) then
    raise exception 'Select valid, distinct seats.' using errcode = '22023';
  end if;

  perform 1 from cinema.showing where id = p_showing_id for update;
  select * into v_hold from cinema.hold where guest_id = v_guest and request_id = p_request_id;
  if found then
    if (v_hold.showing_id, v_hold.seat_codes, v_hold.total_minor)
        is distinct from (p_showing_id, v_seats, p_expected_total_minor) then
      raise exception 'This request already has a different selection.' using errcode = '23505';
    end if;
    return cinema.hold_result(v_hold);
  end if;

  v_now := clock_timestamp();
  select * into v_showing from cinema.public_showing
  where id = p_showing_id and starts_at > v_now + interval '10 minutes';
  if not found then
    raise exception 'This showing is no longer on sale.' using errcode = 'P0002';
  end if;

  select count(price), sum(price) into v_priced, v_total
  from (
    select case seat_type when 'standard' then v_showing.standard_minor
      when 'vip' then v_showing.vip_minor when 'wheelchair' then v_showing.wheelchair_minor end as price
    from cinema.seat where screen_id = v_showing.screen_id and code = any(v_seats)
  ) priced;
  if v_priced <> cardinality(v_seats) or v_total is distinct from p_expected_total_minor then
    raise exception 'Seat prices or availability changed. Review your selection.' using errcode = '22023';
  end if;

  delete from cinema.allocation a using cinema.hold h
  where a.showing_id = p_showing_id and a.hold_id = h.id
    and h.state = 'held' and (h.guest_id is null or h.expires_at <= v_now);

  if exists (
    select 1 from cinema.allocation where showing_id = p_showing_id and seat_code = any(v_seats)
  ) then
    raise exception 'A selected seat is no longer available.' using errcode = '23P01';
  end if;

  insert into cinema.hold (guest_id, request_id, showing_id, seat_codes, total_minor, expires_at)
  values (v_guest, p_request_id, p_showing_id, v_seats, v_total,
    least(v_now + interval '5 minutes', v_showing.starts_at - interval '10 minutes'))
  returning * into v_hold;
  insert into cinema.allocation (showing_id, screen_id, seat_code, hold_id)
  select p_showing_id, v_showing.screen_id, code, v_hold.id from unnest(v_seats) as seat(code);
  return cinema.hold_result(v_hold);
end;
$$;

create function public.rpc_cinema_release_hold(p_hold_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_hold cinema.hold;
begin
  select * into v_hold from cinema.hold where id = p_hold_id and guest_id = auth.uid();
  if not found then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  perform 1 from cinema.showing where id = v_hold.showing_id for update;
  select * into v_hold from cinema.hold where id = p_hold_id;
  if v_hold.state = 'held' then
    update cinema.hold set state = 'released' where id = v_hold.id returning * into v_hold;
    delete from cinema.allocation where showing_id = v_hold.showing_id and hold_id = v_hold.id;
  end if;
  return cinema.hold_result(v_hold);
end;
$$;

create function public.rpc_cinema_confirm_hold(p_hold_id uuid, p_confirmation_ref text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_hold cinema.hold;
  v_reference text := btrim(p_confirmation_ref);
begin
  if v_reference is null or length(v_reference) not between 1 and 200 then
    raise exception 'A cinema confirmation reference is required.' using errcode = '22023';
  end if;
  select * into v_hold from cinema.hold where id = p_hold_id;
  if not found then
    raise exception 'Seat hold not found.' using errcode = 'P0002';
  end if;
  perform 1 from cinema.showing where id = v_hold.showing_id for update;
  select * into v_hold from cinema.hold where id = p_hold_id;
  if v_hold.state = 'confirmed' and v_hold.confirmation_ref = v_reference then
    return cinema.hold_result(v_hold);
  end if;
  if v_hold.state <> 'held' or v_hold.guest_id is null or v_hold.expires_at <= clock_timestamp() or not exists (
    select 1 from cinema.public_showing where id = v_hold.showing_id
  ) then
    raise exception 'This hold can no longer be confirmed.' using errcode = '22023';
  end if;
  update cinema.hold set state = 'confirmed', confirmation_ref = v_reference
  where id = p_hold_id returning * into v_hold;
  return cinema.hold_result(v_hold);
end;
$$;

revoke all on function public.rpc_cinema_publish_showing(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function cinema.guard_showing_changes() from public, anon, authenticated;
revoke all on function cinema.hold_result(cinema.hold) from public, anon, authenticated;
revoke all on function public.rpc_cinema_programme(date, integer, uuid, uuid) from public, anon, authenticated;
revoke all on function public.rpc_cinema_seat_map(uuid) from public, anon, authenticated;
revoke all on function public.rpc_cinema_hold_seats(uuid, text[], bigint, uuid) from public, anon, authenticated;
revoke all on function public.rpc_cinema_release_hold(uuid) from public, anon, authenticated;
revoke all on function public.rpc_cinema_confirm_hold(uuid, text) from public, anon, authenticated;
grant execute on function public.rpc_cinema_programme(date, integer, uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.rpc_cinema_seat_map(uuid) to anon, authenticated, service_role;
grant execute on function public.rpc_cinema_hold_seats(uuid, text[], bigint, uuid) to authenticated;
grant execute on function public.rpc_cinema_release_hold(uuid) to authenticated;
grant execute on function public.rpc_cinema_confirm_hold(uuid, text) to service_role;
grant execute on function public.rpc_cinema_publish_showing(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
