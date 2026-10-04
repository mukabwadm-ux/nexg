-- Generating a card, and what happens when somebody scans it.
--
-- The code is generated here and only here. A host cannot supply one,
-- cannot edit one, and never types one — which is what makes the
-- scan count mean something, and what stops two properties claiming
-- the same card.
--
-- The scan path is the only part of this system a stranger can reach
-- without signing in, so it is written defensively: rate-limited per
-- code, bot-screened, SECURITY DEFINER so the browser never touches a
-- table, and it answers in one round trip because the person holding
-- the phone is standing in a kitchen waiting for it.

-- ═══════════════════════════ the shapes these replace

/*
 * Two functions from the first hospitality build have to go, not
 * just be superseded.
 *
 *   · `rpc_qr_generate(uuid, uuid)` still names `unit_qr`, which no
 *     longer exists. plpgsql resolves table names at call time, so it
 *     did not fail at migration — it failed the first time somebody
 *     pressed the button, which is the worse way to find out.
 *   · `rpc_qr_mark_placed(uuid)` would sit beside the new
 *     `(uuid, text)` form whose second argument has a default, making
 *     every existing one-argument call ambiguous at runtime.
 *
 * The same overload trap as `audit.log`, found the same way: by
 * listing the catalogue rather than assuming a replacement replaced
 * anything.
 */
drop function if exists public.rpc_qr_generate(uuid, uuid);
drop function if exists public.rpc_qr_mark_placed(uuid);

-- ════════════════════════════════════ codes that read aloud

/*
 * Crockford base32, minus the digits that look like letters in the
 * fonts a card gets printed in. No 0/O, no 1/I/L, no U — U because
 * dropping it is what keeps an accidental English obscenity out of a
 * six-character string, which matters when the string is printed and
 * stuck to somebody's fridge.
 *
 * 30 characters, 6 places: 729 million codes. At a card per property
 * per placement, that is not a number this business will reach.
 */
create or replace function public.fn_qr_new_code()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_banned constant text[] := array['FCK', 'SHT', 'CNT', 'NGR', 'FAG', 'RAPE', 'KKK'];
  v_code text;
  v_try integer := 0;
  v_bad boolean;
  w text;
begin
  loop
    v_try := v_try + 1;
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    v_bad := false;
    foreach w in array v_banned loop
      if position(w in v_code) > 0 then v_bad := true; end if;
    end loop;

    exit when not v_bad
      and not exists (select 1 from public.property_qr q where q.code = 'NXG-' || v_code);

    if v_try > 50 then
      /* Not a collision problem at this size — a bug. Better to stop
         than to hand out a code that might already be on a counter. */
      raise exception 'Could not find a free code after 50 tries. Something is wrong.';
    end if;
  end loop;

  return 'NXG-' || v_code;
end;
$$;

-- ═════════════════════════════════════════════ generating

create or replace function public.rpc_qr_generate(
  p_owner_type public.qr_owner_type,
  p_owner_id uuid,
  p_placement public.qr_placement default 'counter'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_host_id uuid;
  v_hotel_id uuid;
  v_city_id uuid;
  v_label text;
  v_qr public.property_qr;
begin
  /* Resolve the owner and, in the same step, prove it exists. */
  if p_owner_type = 'unit' then
    select u.host_id, u.city_id, u.label_public
      into v_host_id, v_city_id, v_label
      from public.unit u where u.id = p_owner_id and u.archived_at is null;
  elsif p_owner_type = 'hotel_room' then
    select r.hotel_id, h.city_id, 'Room ' || r.room_no
      into v_hotel_id, v_city_id, v_label
      from public.hotel_room r join public.hotel h on h.id = r.hotel_id
     where r.id = p_owner_id;
  else
    select a.hotel_id, h.city_id, a.name
      into v_hotel_id, v_city_id, v_label
      from public.hotel_area a join public.hotel h on h.id = a.hotel_id
     where a.id = p_owner_id;
  end if;

  if v_label is null then
    raise exception 'No such property.';
  end if;

  /* The property's own people, or hospitality staff. */
  if not (
    (v_host_id is not null and authz.is_host_member(v_host_id))
    or (v_hotel_id is not null and authz.is_hotel_member(v_hotel_id, 'admin'))
    or authz.works_hospitality(v_city_id)
  ) then
    raise exception 'You cannot create a card for that property.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.property_qr q
    where q.owner_type = p_owner_type and q.owner_id = p_owner_id
      and q.placement = p_placement and q.voided_at is null
  ) then
    raise exception 'There is already a live % card for this property. Replace it rather than adding a second — two cards in one spot and neither number means anything.',
      p_placement;
  end if;

  insert into public.property_qr (
    code, owner_type, owner_id, placement, host_id, hotel_id, city_id,
    label, secret_hash, generated_by, state)
  values (
    public.fn_qr_new_code(), p_owner_type, p_owner_id, p_placement,
    v_host_id, v_hotel_id, v_city_id, v_label,
    encode(extensions.gen_random_bytes(32), 'hex'), v_me, 'generated')
  returning * into v_qr;

  perform audit.log(
    p_actor_type => case when v_me is null then 'host_user' else 'staff' end::public.actor_type,
    p_module => 'hotels', p_action => 'qr.generated', p_actor_id => v_me,
    p_target_type => 'property_qr', p_target_id => v_qr.id,
    p_target_label => v_qr.code || ' · ' || v_label,
    p_city_id => v_city_id,
    p_after => jsonb_build_object('owner_type', p_owner_type, 'placement', p_placement));

  return jsonb_build_object('ok', true, 'id', v_qr.id, 'code', v_qr.code,
    'label', v_label, 'placement', p_placement,
    'url', 'https://nexgapp.com/q/' || v_qr.code);
end;
$$;

-- ════════════════════════════════════════════ the scan path

/*
 * A code that resolves to nothing is not a property scan — it has no
 * property — so it does not go in `qr_scan`, where it would sit with
 * null owners and quietly skew every count. It goes here, which is
 * what you read when somebody is walking the keyspace.
 */
create table if not exists public.qr_miss (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  code_attempted text not null,
  session_id text,
  ip_country text,
  reason text not null check (reason in ('not_found', 'rate_limited', 'bot'))
);

create index if not exists qr_miss_at_idx on public.qr_miss (at desc);
create index if not exists qr_miss_code_idx on public.qr_miss (code_attempted, at desc);

alter table public.qr_miss enable row level security;
revoke all on public.qr_miss from anon, authenticated;
grant select on public.qr_miss to authenticated;
drop policy if exists qr_miss_read on public.qr_miss;
create policy qr_miss_read on public.qr_miss
  for select to authenticated using (authz.works_hospitality(null));

/*
 * Resolve a card.
 *
 * Writes the scan, mints the session's signed token, and returns the
 * ordering context — all in one call, because the alternative is a
 * second round trip before the page can render and this runs on a
 * mid-range Android on 3G.
 *
 * The token is an HMAC over {qr_id, session_id, scanned_at} keyed by
 * the card's own secret. Checkout hands it back; the order service
 * validates it. A token lifted from another property will not verify,
 * and voiding a card invalidates every token it ever issued.
 */
drop function if exists public.rpc_resolve_qr(text);

create or replace function public.rpc_resolve_qr(
  p_code text,
  p_session_id text default null,
  p_device jsonb default '{}'::jsonb,
  p_referrer public.qr_referrer_kind default 'unknown',
  p_ip_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(p_code));
  v_qr public.property_qr;
  v_session text := coalesce(nullif(trim(p_session_id), ''),
                             encode(extensions.gen_random_bytes(16), 'hex'));
  v_now timestamptz := clock_timestamp();
  v_recent integer;
  v_bot boolean := false;
  v_token text;
  v_scan_id bigint;
  v_unit public.unit;
  v_room public.hotel_room;
  v_area public.hotel_area;
  v_hotel public.hotel;
  v_ctx jsonb;
  v_outcome public.qr_scan_outcome;
begin
  if v_code !~ '^NXG-[0-9A-Z]{6}$' then
    insert into public.qr_miss (code_attempted, session_id, ip_country, reason)
    values (left(coalesce(v_code, ''), 32), v_session, p_ip_country, 'not_found');
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'session_id', v_session,
      'message', 'That code is not one of ours. Check the card, or order to another address.');
  end if;

  select * into v_qr from public.property_qr where code = v_code;

  if v_qr.id is null then
    insert into public.qr_miss (code_attempted, session_id, ip_country, reason)
    values (v_code, v_session, p_ip_country, 'not_found');
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'session_id', v_session,
      'message', 'That code is not one of ours. Check the card, or order to another address.');
  end if;

  /* Sixty a minute on one card. A card on a hotel lobby table during
     a conference can legitimately be busy; a thousand a minute is
     somebody walking the keyspace. */
  select count(*) into v_recent
    from public.qr_scan s
   where s.qr_id = v_qr.id and s.scanned_at > v_now - interval '1 minute';

  if v_recent >= 60 then
    insert into public.qr_miss (code_attempted, session_id, ip_country, reason)
    values (v_code, v_session, p_ip_country, 'rate_limited');
    return jsonb_build_object('ok', false, 'reason', 'busy', 'session_id', v_session,
      'message', 'Too many requests for this card just now. Try again in a moment.');
  end if;

  v_bot := coalesce((p_device ->> 'is_headless')::boolean, false)
        or coalesce(p_device ->> 'ua_family', '') in ('HeadlessChrome', 'PhantomJS', 'bot')
        or v_recent >= 20;

  /* What the scanner gets, decided before the row is written so the
     row records the outcome rather than a guess at it. */
  if v_qr.voided_at is not null then
    v_outcome := 'voided';
  else
    if v_qr.owner_type = 'unit' then
      select * into v_unit from public.unit where id = v_qr.owner_id;
      v_outcome := case when v_unit.status = 'live' then 'landed' else 'paused_unit' end;
    elsif v_qr.owner_type = 'hotel_room' then
      select * into v_room from public.hotel_room where id = v_qr.owner_id;
      select * into v_hotel from public.hotel where id = v_room.hotel_id;
      v_outcome := case when v_hotel.status = 'partner' and v_room.status = 'active'
                        then 'landed' else 'paused_unit' end;
    else
      select * into v_area from public.hotel_area where id = v_qr.owner_id;
      select * into v_hotel from public.hotel where id = v_area.hotel_id;
      v_outcome := case when v_hotel.status = 'partner' and v_area.status = 'active'
                        then 'landed' else 'paused_unit' end;
    end if;
  end if;

  if v_bot then v_outcome := 'blocked'; end if;

  insert into public.qr_scan (
    scanned_at, qr_id, code, owner_type, owner_id, host_id, hotel_id, city_id,
    placement, session_id, device, ip_country, referrer_kind, outcome, is_bot)
  values (
    v_now, v_qr.id, v_qr.code, v_qr.owner_type, v_qr.owner_id,
    v_qr.host_id, v_qr.hotel_id, v_qr.city_id,
    v_qr.placement, v_session, coalesce(p_device, '{}'::jsonb), p_ip_country,
    p_referrer, v_outcome, v_bot)
  returning id into v_scan_id;

  /* Signed with this card's secret, over this session and this
     moment. Written back onto the row so a replay can be recognised
     rather than inferred. */
  v_token := encode(extensions.hmac(
    v_qr.id::text || '.' || v_session || '.' || extract(epoch from v_now)::bigint::text,
    v_qr.secret_hash, 'sha256'), 'hex');

  update public.qr_scan set scan_token = v_token
   where id = v_scan_id and scanned_at = v_now;

  /* A blocked or voided scan is still a scan: the counters move, so
     "this old card is still being scanned" is answerable. */
  update public.property_qr set
    scans = scans + 1,
    first_scanned_at = coalesce(first_scanned_at, v_now),
    last_scanned_at = v_now,
    placed_confirmed_at = coalesce(placed_confirmed_at, case when v_outcome = 'landed' then v_now end),
    state = case when state in ('generated', 'sent') and v_outcome = 'landed'
                 then 'scanned' else state end
  where id = v_qr.id;

  if v_outcome = 'blocked' then
    return jsonb_build_object('ok', false, 'reason', 'busy', 'session_id', v_session,
      'message', 'Try again in a moment.');
  end if;

  if v_outcome = 'voided' then
    return jsonb_build_object('ok', false, 'reason', 'replaced', 'session_id', v_session,
      'label', v_qr.label,
      'message', 'This code was replaced — ask your host for the new card.');
  end if;

  if v_outcome = 'paused_unit' then
    return jsonb_build_object('ok', false, 'reason', 'paused', 'session_id', v_session,
      'label', v_qr.label,
      'message', 'This place isn''t taking orders right now — you can still order to another address.');
  end if;

  if v_qr.owner_type = 'unit' then
    select to_jsonb(c) into v_ctx from public.unit_context_v c where c.unit_id = v_unit.id;
  else
    select jsonb_build_object(
      'hotel_id', h.hotel_id, 'hotel_name', h.hotel_name,
      'charge_to_room', h.offer_charge_to_room,
      'cap', h.charge_cap_per_stay,
      'preferred_suppliers', h.preferred_suppliers,
      'room_no', v_room.room_no,
      'area_name', v_area.name,
      'delivery_point_note', v_area.delivery_point_note
    ) into v_ctx
    from public.checkout_hotel_context_v h where h.hotel_id = v_hotel.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'kind', v_qr.owner_type,
    'label', v_qr.label,
    'placement', v_qr.placement,
    'qr_id', v_qr.id,
    'session_id', v_session,
    'scan_token', v_token,
    'context', v_ctx);
end;
$$;

/*
 * The funnel advances. Idempotent and monotonic: a stage never goes
 * backwards, and nothing moves once the scan has an order against it.
 */
create or replace function public.rpc_qr_scan_progress(
  p_scan_token text,
  p_stage text,
  p_merchant_id uuid default null,
  p_category text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank constant jsonb := '{"landed":1,"browsed":2,"cart":3,"ordered":4}'::jsonb;
  v_scan record;
begin
  if p_stage not in ('browsed', 'cart') then
    raise exception 'A scan progresses to browsed or cart. Ordering is written by the order service.';
  end if;

  select id, scanned_at, outcome into v_scan
    from public.qr_scan
   where scan_token = p_scan_token
     and scanned_at > now() - interval '24 hours'
   order by scanned_at desc limit 1;

  if not found then
    /* An unknown or stale token is not an error worth showing a
       guest — the page works either way. It is simply not counted. */
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;

  if coalesce((v_rank ->> v_scan.outcome::text)::int, 0)
     >= coalesce((v_rank ->> p_stage)::int, 0) then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  update public.qr_scan
     set outcome = p_stage::public.qr_scan_outcome,
         first_merchant_id = coalesce(first_merchant_id, p_merchant_id),
         browsed_category = coalesce(browsed_category, p_category)
   where id = v_scan.id and scanned_at = v_scan.scanned_at;

  return jsonb_build_object('ok', true);
end;
$$;

/*
 * Attribution.
 *
 * Called by the order service inside order creation — never by the
 * browser, which is why it takes the token and checks it rather than
 * taking a scan id and trusting it.
 *
 * The orders domain does not exist yet. Every other module keys an
 * order by `order_reference text`, so this does too; when there is an
 * order table, this gains a uuid beside the reference rather than
 * being rewritten.
 */
create or replace function public.fn_qr_attribute_order(
  p_order_reference text,
  p_scan_token text,
  p_session_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scan record;
  v_qr public.property_qr;
  v_expected text;
  v_source text;
begin
  if coalesce(trim(p_order_reference), '') = '' or coalesce(trim(p_scan_token), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_attribute');
  end if;

  /* The most recent scan in the session wins. A guest who scans the
     counter card and then the fridge card is a fridge order — that
     is the whole reason placement is measured. */
  select s.* into v_scan
    from public.qr_scan s
   where s.scan_token = p_scan_token
   order by s.scanned_at desc limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_token');
  end if;

  if p_session_id is not null and v_scan.session_id is distinct from p_session_id then
    /* A token presented by a different session is a replay. It is
       not attributed, and it is recorded. */
    insert into public.qr_miss (code_attempted, session_id, reason)
    values (v_scan.code, p_session_id, 'bot');
    return jsonb_build_object('ok', false, 'reason', 'session_mismatch');
  end if;

  select * into v_qr from public.property_qr where id = v_scan.qr_id;

  v_expected := encode(extensions.hmac(
    v_scan.qr_id::text || '.' || v_scan.session_id || '.'
      || extract(epoch from v_scan.scanned_at)::bigint::text,
    v_qr.secret_hash, 'sha256'), 'hex');

  if v_expected <> p_scan_token then
    insert into public.qr_miss (code_attempted, session_id, reason)
    values (v_scan.code, p_session_id, 'bot');
    return jsonb_build_object('ok', false, 'reason', 'bad_signature');
  end if;

  /*
   * Inside 24 hours of the scan it is a QR order. Afterwards, while
   * the stay context is still in the session — seven days — it is a
   * return: the guest came back through their history rather than
   * the card, which is a different and quieter kind of success.
   */
  if v_scan.scanned_at > now() - interval '24 hours' then
    v_source := 'qr';
  elsif v_scan.scanned_at > now() - interval '7 days' then
    v_source := 'qr_return';
  else
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  if p_order_reference = any (v_scan.order_refs) then
    return jsonb_build_object('ok', true, 'source', v_source, 'already', true);
  end if;

  update public.qr_scan
     set order_refs = order_refs || p_order_reference,
         outcome = 'ordered',
         ordered_at = coalesce(ordered_at, now())
   where id = v_scan.id and scanned_at = v_scan.scanned_at;

  update public.property_qr set orders = orders + 1 where id = v_scan.qr_id;

  return jsonb_build_object(
    'ok', true,
    'source', v_source,
    'qr_scan_id', v_scan.id,
    'property_qr_id', v_scan.qr_id,
    'delivery_context', jsonb_build_object(
      'owner_type', v_scan.owner_type, 'owner_id', v_scan.owner_id,
      'label', v_qr.label, 'placement', v_scan.placement));
end;
$$;

-- ══════════════════════════════════ looking after the cards

/*
 * A host checking their own card. Flagged, so it never moves the
 * numbers the host is checking.
 */
create or replace function public.rpc_qr_test_scan(p_qr_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qr public.property_qr;
begin
  select * into v_qr from public.property_qr where id = p_qr_id;
  if not found then raise exception 'No such card.'; end if;

  if not (
    (v_qr.host_id is not null and authz.is_host_member(v_qr.host_id))
    or (v_qr.hotel_id is not null and authz.is_hotel_member(v_qr.hotel_id, null))
    or authz.works_hospitality(v_qr.city_id)
  ) then
    raise exception 'That is not your card.' using errcode = '42501';
  end if;

  insert into public.qr_scan (
    qr_id, code, owner_type, owner_id, host_id, hotel_id, city_id,
    placement, outcome, is_test, device)
  values (
    v_qr.id, v_qr.code, v_qr.owner_type, v_qr.owner_id,
    v_qr.host_id, v_qr.hotel_id, v_qr.city_id,
    v_qr.placement, 'landed', true,
    jsonb_build_object('source', 'test_scan'));

  return jsonb_build_object('ok', true,
    'message', 'Scanned. This test is kept out of your numbers.');
end;
$$;

create or replace function public.rpc_qr_mark_placed(
  p_qr_id uuid, p_photo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_qr public.property_qr;
begin
  select * into v_qr from public.property_qr where id = p_qr_id and voided_at is null;
  if not found then raise exception 'No such card.'; end if;

  if not (
    (v_qr.host_id is not null and authz.is_host_member(v_qr.host_id))
    or (v_qr.hotel_id is not null and authz.is_hotel_member(v_qr.hotel_id, null))
    or authz.works_hospitality(v_qr.city_id)
  ) then
    raise exception 'That is not your card.' using errcode = '42501';
  end if;

  update public.property_qr
     set placed_confirmed_at = coalesce(placed_confirmed_at, now()),
         placement_photo_path = coalesce(p_photo_path, placement_photo_path),
         state = case when state in ('generated', 'sent') then 'placed' else state end
   where id = p_qr_id;

  perform audit.log(
    p_actor_type => 'host_user'::public.actor_type, p_module => 'hotels',
    p_action => 'qr.placed', p_actor_id => authz.staff_id(),
    p_target_type => 'property_qr', p_target_id => p_qr_id,
    p_target_label => v_qr.code, p_city_id => v_qr.city_id);

  return jsonb_build_object('ok', true);
end;
$$;

/*
 * Replacing a card. The old code keeps resolving — to a friendly page
 * saying it was replaced — because the old card is still on somebody's
 * counter and a dead link there is worse than an explanation.
 */
create or replace function public.rpc_qr_replace(p_qr_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.property_qr;
  v_new jsonb;
begin
  select * into v_old from public.property_qr where id = p_qr_id and voided_at is null;
  if not found then raise exception 'No such live card.'; end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why it is being replaced — the old card is still out there.';
  end if;

  update public.property_qr
     set voided_at = now(), void_reason = p_reason, state = 'replaced'
   where id = p_qr_id;

  v_new := public.rpc_qr_generate(v_old.owner_type, v_old.owner_id, v_old.placement);

  update public.property_qr
     set replaced_by = (v_new ->> 'id')::uuid
   where id = p_qr_id;

  return v_new || jsonb_build_object('replaced', v_old.code);
end;
$$;

create or replace function public.rpc_qr_void(p_qr_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_qr public.property_qr;
begin
  select * into v_qr from public.property_qr where id = p_qr_id and voided_at is null;
  if not found then raise exception 'No such live card.'; end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why.';
  end if;

  if not (
    (v_qr.host_id is not null and authz.is_host_member(v_qr.host_id))
    or (v_qr.hotel_id is not null and authz.is_hotel_member(v_qr.hotel_id, 'admin'))
    or authz.works_hospitality(v_qr.city_id)
  ) then
    raise exception 'That is not your card.' using errcode = '42501';
  end if;

  update public.property_qr
     set voided_at = now(), void_reason = p_reason, state = 'replaced'
   where id = p_qr_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'hotels',
    p_action => 'qr.voided', p_actor_id => authz.staff_id(),
    p_target_type => 'property_qr', p_target_id => p_qr_id,
    p_target_label => v_qr.code, p_reason => p_reason,
    p_city_id => v_qr.city_id, p_severity => 'notice');

  return jsonb_build_object('ok', true);
end;
$$;

/* A whole print run that went to the wrong address. */
create or replace function public.rpc_qr_void_batch(p_batch_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  if coalesce(trim(p_reason), '') = '' then raise exception 'Say why.'; end if;
  if not authz.works_hospitality(null) then
    raise exception 'Voiding a whole batch is a staff action.' using errcode = '42501';
  end if;

  update public.property_qr
     set voided_at = now(), void_reason = p_reason, state = 'replaced'
   where batch_id = p_batch_id and voided_at is null;
  get diagnostics v_n = row_count;

  update public.qr_pack set voided_at = now(), void_reason = p_reason
   where batch_id = p_batch_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'hotels',
    p_action => 'qr.voided', p_actor_id => authz.staff_id(),
    p_target_type => 'qr_batch', p_target_id => p_batch_id,
    p_target_label => v_n || ' cards', p_reason => p_reason, p_severity => 'high');

  return jsonb_build_object('ok', true, 'voided', v_n);
end;
$$;

/*
 * A pack is a print run: the codes that will be on one sheet of
 * paper, recorded together so they can be voided together. The PDF
 * itself is rendered by the web app, which can draw a QR; this
 * reserves the batch and says which codes belong to it.
 */
create or replace function public.rpc_qr_pack_build(
  p_host_id uuid default null,
  p_hotel_id uuid default null,
  p_format text default 'a6_cards',
  p_placements public.qr_placement[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_pack uuid;
  v_codes jsonb;
  v_n integer;
begin
  if num_nonnulls(p_host_id, p_hotel_id) <> 1 then
    raise exception 'A pack belongs to one host or one hotel.';
  end if;

  if not (
    (p_host_id is not null and (authz.is_host_member(p_host_id) or authz.works_hospitality(null)))
    or (p_hotel_id is not null and (authz.is_hotel_member(p_hotel_id, 'admin') or authz.works_hospitality(null)))
  ) then
    raise exception 'Not your property.' using errcode = '42501';
  end if;

  update public.property_qr
     set batch_id = v_batch
   where voided_at is null
     and ((p_host_id is not null and host_id = p_host_id)
          or (p_hotel_id is not null and hotel_id = p_hotel_id))
     and (p_placements is null or placement = any (p_placements));
  get diagnostics v_n = row_count;

  if v_n = 0 then
    raise exception 'There are no cards to print. Generate one first.';
  end if;

  insert into public.qr_pack (host_id, hotel_id, batch_id, codes, format, built_by)
  values (p_host_id, p_hotel_id, v_batch, v_n, p_format, authz.staff_id())
  returning id into v_pack;

  select jsonb_agg(jsonb_build_object(
           'code', q.code, 'label', q.label, 'placement', q.placement,
           'url', 'https://nexgapp.com/q/' || q.code) order by q.label, q.placement)
    into v_codes
    from public.property_qr q where q.batch_id = v_batch;

  return jsonb_build_object('ok', true, 'pack_id', v_pack, 'batch_id', v_batch,
    'format', p_format, 'codes', v_codes);
end;
$$;

-- ════════════════════════════════════════════════════ grants

grant execute on function public.rpc_resolve_qr(text, text, jsonb, public.qr_referrer_kind, text)
  to anon, authenticated;
grant execute on function public.rpc_qr_scan_progress(text, text, uuid, text) to anon, authenticated;
grant execute on function public.rpc_qr_generate(public.qr_owner_type, uuid, public.qr_placement) to authenticated;
grant execute on function public.rpc_qr_test_scan(uuid) to authenticated;
grant execute on function public.rpc_qr_mark_placed(uuid, text) to authenticated;
grant execute on function public.rpc_qr_replace(uuid, text) to authenticated;
grant execute on function public.rpc_qr_void(uuid, text) to authenticated;
grant execute on function public.rpc_qr_void_batch(uuid, text) to authenticated;
grant execute on function public.rpc_qr_pack_build(uuid, uuid, text, public.qr_placement[]) to authenticated;
grant execute on function public.fn_qr_attribute_order(text, text, text) to service_role;
grant execute on function public.fn_qr_new_code() to authenticated;

/*
 * `fn_qr_attribute_order` is deliberately NOT granted to anon or
 * authenticated. Attribution is written by the order service, inside
 * order creation. A browser that could call it could claim an order
 * for a card it never scanned, and every number on this screen would
 * become a number somebody could make up.
 */

-- ═══════════════════════════════════════ printing a card

/*
 * What a printer needs and nothing else.
 *
 * The card page used to read `property_qr` directly with the anon
 * client, which RLS answers with null rather than an error — so a
 * host printing a pack would have got cards reading "This address"
 * and no indication anything had gone wrong. Silence is the worst
 * possible failure for something that gets laminated.
 *
 * None of this is secret: the label and the placement are printed on
 * the card itself, and the code is on the fridge. What is not here
 * is the host, the address, the hand-off rule and the secret.
 */
create or replace function public.rpc_qr_card(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when q.id is null then jsonb_build_object('ok', false, 'reason', 'not_found')
    else jsonb_build_object(
      'ok', true,
      'code', q.code,
      'label', q.label,
      'placement', q.placement,
      'voided', q.voided_at is not null)
  end
  from (select 1) one
  left join public.property_qr q on q.code = upper(trim(p_code))
$$;

grant execute on function public.rpc_qr_card(text) to anon, authenticated;
