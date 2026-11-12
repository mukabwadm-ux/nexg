-- The cinema writes are audited.
--
-- 20261212090200 added four RPCs that change state without calling
-- audit.log, so fn_wiring_check reported four critical findings and the
-- database CI job has been red on main since. A write either logs or is
-- written down in wiring_audit_exempt with where its record lives
-- (20260101017700). Seat holds are guest commitments like stay holds,
-- which log, so these log too:
--
--   rpc_cinema_publish_showing  cinema.showing_published  the cinema's feed (system)
--   rpc_cinema_hold_seats       cinema.seats_held         the guest; a retried request logs nothing
--   rpc_cinema_release_hold     cinema.hold_released      the guest, when the seats were still held
--   rpc_cinema_confirm_hold     cinema.hold_confirmed     the cinema (system)
--
-- The actions are registered under Experiences, where cinemas sit. Bodies
-- are unchanged apart from the audit.log call. Same signatures, security
-- definer and search_path; `create or replace` keeps the owner and the
-- grants.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('cinema.showing_published', 'experiences', 'info', false, 'Cinema showing published or updated by the cinema'),
  ('cinema.seats_held', 'experiences', 'info', false, 'Cinema seats held for a guest'),
  ('cinema.hold_released', 'experiences', 'info', false, 'Held cinema seats released'),
  ('cinema.hold_confirmed', 'experiences', 'info', false, 'Held cinema seats confirmed by the cinema')
on conflict (action) do nothing;

create or replace function public.rpc_cinema_publish_showing(
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

  perform audit.log('system'::public.actor_type, 'experiences', 'cinema.showing_published',
    p_target_type => 'cinema_showing', p_target_id => v_showing.id,
    p_city_id => (select m.city_id from public.merchant m where m.id = p_merchant_id),
    p_after => jsonb_build_object('merchant', p_merchant_id, 'film', v_film.id, 'title', v_film.title,
                                  'screen', v_screen_id, 'starts_at', v_showing.starts_at,
                                  'status', coalesce(v_showing.status, 'draft')));
  return v_showing.id;
end;
$$;

create or replace function public.rpc_cinema_hold_seats(
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

  perform audit.log('guest'::public.actor_type, 'experiences', 'cinema.seats_held',
    p_actor_id => v_guest, p_target_type => 'cinema_hold', p_target_id => v_hold.id,
    p_city_id => (select m.city_id from public.merchant m where m.id = v_showing.merchant_id),
    p_after => jsonb_build_object('showing', p_showing_id, 'seats', v_seats,
                                  'total_minor', v_total, 'expires_at', v_hold.expires_at));
  return cinema.hold_result(v_hold);
end;
$$;

create or replace function public.rpc_cinema_release_hold(p_hold_id uuid)
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
    perform audit.log('guest'::public.actor_type, 'experiences', 'cinema.hold_released',
      p_actor_id => auth.uid(), p_target_type => 'cinema_hold', p_target_id => v_hold.id,
      p_after => jsonb_build_object('showing', v_hold.showing_id, 'seats', v_hold.seat_codes));
  end if;
  return cinema.hold_result(v_hold);
end;
$$;

create or replace function public.rpc_cinema_confirm_hold(p_hold_id uuid, p_confirmation_ref text)
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
  perform audit.log('system'::public.actor_type, 'experiences', 'cinema.hold_confirmed',
    p_target_type => 'cinema_hold', p_target_id => v_hold.id,
    p_after => jsonb_build_object('showing', v_hold.showing_id, 'seats', v_hold.seat_codes,
                                  'total_minor', v_hold.total_minor, 'reference', v_reference));
  return cinema.hold_result(v_hold);
end;
$$;
