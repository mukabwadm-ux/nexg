-- Orders, bookings and stay holds need a real account, and a booking the
-- business never confirms lets its time go.
--
-- 1. Accounts only. supabase/config.toml turns anonymous sign-ins on, for
--    applicants uploading documents and for the trip planner, and a
--    temporary session is "authenticated" to the database. Nothing refused
--    one in rpc_order_place_web, rpc_booking_create or rpc_stay_hold, so a
--    visitor with no account could place an order, take a booking slot or
--    hold a stay's dates. Decided with the owner on 12 Nov 2026: they need an
--    account first. Stay payment (rpc_payment_begin_stay) already insisted on
--    one; now the three steps before payment do too. authz.is_anonymous_session
--    reads the session's own claim and the auth.users row, so a temporary
--    session is caught either way. Applicants and the planner keep their
--    temporary sessions for what they are for.
--
-- 2. Unconfirmed bookings. A booking that needs the business to confirm it
--    (not instant, or priced on request) waits as 'pending', and pending
--    takes the time: booking_no_overlap counts it. Nothing ever released one,
--    so a business that never answered kept the slot blocked for good. Now a
--    pending booking is released ('cancelled', with expired_at set) once it
--    has waited 24 hours without an answer, or once its start time has come,
--    whichever is first. The 24 hours is the setting
--    booking.pending_release_hours (per city), so it can change without a
--    migration. Released every five minutes by pg_cron, and on the spot for
--    the resource being booked, as stay holds are.
--
-- Rollback: re-run rpc_order_place_web from 20261211000200, rpc_booking_create
-- from 20261112000200 and rpc_stay_hold from 20261122000100; then
--   select cron.unschedule('booking-release-stale');
--   drop function public.fn_booking_release_stale(uuid), authz.is_anonymous_session();
--   alter table public.booking drop column expired_at;

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('booking.expired', 'merchants', 'info', false, 'Unconfirmed bookings released')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 1. accounts only

create or replace function authz.is_anonymous_session()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
      or exists (select 1 from auth.users u
                  where u.id = (select auth.uid()) and coalesce(u.is_anonymous, false))
$$;

comment on function authz.is_anonymous_session() is
  'A temporary (anonymous) sign-in rather than an account. Orders, bookings and stay holds refuse it.';

revoke execute on function authz.is_anonymous_session() from public, anon;
grant execute on function authz.is_anonymous_session() to authenticated, service_role;

-- rpc_order_place_web: 20261211000200, refusing a temporary session first.
create or replace function public.rpc_order_place_web(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_phone text := nullif(regexp_replace(coalesce(p_payload ->> 'guest_phone', ''), '[^0-9+]', '', 'g'), '');
  v_name text := nullif(trim(p_payload ->> 'guest_name'), '');
  v_label text := nullif(trim(p_payload ->> 'dropoff_label'), '');
  q jsonb;
  v_guest public.guest;
  v_point extensions.geography;
  v_order uuid;
  v_ref text;
  v_needs text[] := '{}';
begin
  if v_uid is null then
    raise exception 'Sign in to place your order.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to place your order.' using errcode = '42501';
  end if;
  if v_phone is null or v_phone !~ '^\+?[0-9]{9,15}$' then
    raise exception 'A phone number the rider can reach you on.';
  end if;
  if v_label is null then
    raise exception 'Where should we bring it? Set your delivery address first.';
  end if;
  if nullif(p_payload ->> 'lat', '') is null or nullif(p_payload ->> 'lng', '') is null then
    raise exception 'Set your delivery address on the map first.';
  end if;

  q := public.fn_web_order_quote(p_payload);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'message';
  end if;

  v_point := extensions.st_setsrid(extensions.st_makepoint(
    (p_payload ->> 'lng')::float, (p_payload ->> 'lat')::float), 4326)::extensions.geography;

  /* One record per account, and a number belongs to the record that already
     holds it. Signing up proves an email, not a phone, so a number on file is
     never attached here; support links it after checking who is asking. */
  select * into v_guest from public.guest where user_id = v_uid;
  if not found then
    if exists (select 1 from public.guest where phone = v_phone) then
      raise exception 'That number is already on a NexG customer record. Use another number, or contact support to link it to your account.'
        using hint = 'phone_on_file';
    end if;
    insert into public.guest (user_id, phone, name)
    values (v_uid, v_phone, v_name) returning * into v_guest;
  elsif v_guest.phone is null then
    if exists (select 1 from public.guest where phone = v_phone and id <> v_guest.id) then
      raise exception 'That number is already on a NexG customer record. Use another number, or contact support to link it to your account.'
        using hint = 'phone_on_file';
    end if;
    update public.guest set phone = v_phone, name = coalesce(name, v_name)
     where id = v_guest.id returning * into v_guest;
  else
    update public.guest set name = coalesce(name, v_name)
     where id = v_guest.id returning * into v_guest;
  end if;

  if v_guest.blocked then
    raise exception 'This account cannot place orders. Contact support.';
  end if;

  if (q ->> 'has_age_restricted')::boolean then
    v_needs := v_needs || 'alcohol'::text;
  end if;

  v_ref := public.fn_order_reference();

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
    dropoff_label, dropoff_point, dropoff_note, delivery_context,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    small_basket_fee_cents, cash_handling_cents, total_cents,
    commission_cents, commission_pct, currency, pricing_version_ids,
    carry_requirements)
  values (
    v_ref, v_guest.id, (q ->> 'merchant_id')::uuid, nullif(q ->> 'branch_id', '')::uuid,
    (q ->> 'city_id')::uuid, nullif(q ->> 'zone_id', '')::uuid, 'web',
    v_label, v_point, nullif(trim(p_payload ->> 'dropoff_note'), ''), '{}'::jsonb,
    'placed', (q ->> 'payment_method')::public.order_payment_method, 'pending',
    (q ->> 'subtotal_cents')::bigint, (q ->> 'delivery_fee_cents')::bigint,
    (q ->> 'service_fee_cents')::bigint, (q ->> 'small_basket_fee_cents')::bigint,
    (q ->> 'cash_handling_cents')::bigint, (q ->> 'total_cents')::bigint,
    (q ->> 'commission_cents')::bigint, (q ->> 'commission_pct')::numeric,
    'KES', q -> 'pricing_version_ids', v_needs)
  returning id into v_order;

  insert into public.order_item (
    order_id, catalogue_item_id, name, quantity, unit_price_cents, line_total_cents, note)
  select v_order, (l ->> 'catalogue_item_id')::uuid, l ->> 'name',
         (l ->> 'quantity')::integer, (l ->> 'unit_price_cents')::bigint,
         (l ->> 'line_total_cents')::bigint, nullif(l ->> 'note', '')
    from jsonb_array_elements(q -> 'lines') l;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (v_order, 'placed', 'Placed on the website',
          replace(q ->> 'payment_method', '_', ' '),
          'guest', v_guest.id, jsonb_build_object('channel', 'web'));

  perform audit.log(p_actor_type=>'guest'::public.actor_type,p_actor_id=>v_guest.id,p_module=>'orders',
    p_action=>'order.web_placed',p_target_type=>'order',p_target_id=>v_order,p_city_id=>(q->>'city_id')::uuid,
    p_after=>jsonb_build_object('channel','web','payment_method',q->>'payment_method'));

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'reference', v_ref,
    'total_cents', (q ->> 'total_cents')::bigint,
    'payment_method', q ->> 'payment_method',
    'pay_online', (q ->> 'payment_method') in ('card', 'mpesa_stk', 'bank_transfer'));
end;
$$;

revoke execute on function public.rpc_order_place_web(jsonb) from public, anon;
grant execute on function public.rpc_order_place_web(jsonb) to authenticated;

-- rpc_stay_hold: 20261122000100, refusing a temporary session first.
create or replace function public.rpc_stay_hold(
  p_unit_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_unit public.unit;
  v_nights integer := p_check_out - p_check_in;
  v_adults integer := coalesce(nullif(p_guest ->> 'adults', '')::integer, 1);
  v_children integer := coalesce(nullif(p_guest ->> 'children', '')::integer, 0);
  v_window tstzrange;
  v_stay public.stay;
begin
  if v_user is null then
    raise exception 'Sign in to hold these dates.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to hold these dates.' using errcode = '42501';
  end if;
  perform public.fn_stay_dates_check(p_check_in, p_check_out);
  if not exists (select 1 from public.property_unit_public where id = p_unit_id) then
    raise exception 'This home is not taking bookings.' using errcode = '22023';
  end if;
  if exists (select 1 from public.property_unit_public where id = p_unit_id and is_sample) then
    raise exception 'This is a sample listing that shows how stays look on NexG. It cannot be booked.'
      using errcode = '22023';
  end if;

  select * into v_unit from public.unit where id = p_unit_id for update;

  if v_unit.nightly_rate_kes is null then
    raise exception 'This home is priced on request. Send an enquiry instead.' using errcode = '22023';
  end if;
  if v_nights < coalesce(v_unit.min_nights, 1) then
    raise exception 'This home takes stays of at least % nights.', v_unit.min_nights
      using errcode = '22023';
  end if;
  if v_adults < 1 or v_children < 0 then
    raise exception 'A stay needs at least one adult.' using errcode = '22023';
  end if;
  if v_unit.max_guests is not null and v_adults + v_children > v_unit.max_guests then
    raise exception 'This home sleeps up to % guests.', v_unit.max_guests using errcode = '22023';
  end if;
  if (select count(*) from public.stay
       where guest_user_id = v_user and status = 'held' and hold_expires_at > now()) >= 2 then
    raise exception 'You already have two stays on hold. Finish or release one first.'
      using errcode = '22023';
  end if;

  perform public.fn_stay_release_expired_holds(p_unit_id);

  v_window := public.fn_stay_window(p_unit_id, p_check_in, p_check_out);
  if exists (
    select 1 from public.stay s
     where s.unit_id = p_unit_id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and tstzrange(s.check_in, s.check_out, '[)') && v_window
  ) then
    raise exception 'Those dates are no longer available.' using errcode = '23P01';
  end if;

  insert into public.stay (
    host_id, property_id, unit_id, guest_user_id, guest_first_name,
    party_adults, party_children, check_in, check_out, source, status,
    hold_expires_at, rate_kes, quote_total_kes)
  values (
    v_unit.host_id, v_unit.property_id, v_unit.id, v_user,
    left(nullif(trim(p_guest ->> 'first_name'), ''), 80),
    v_adults, v_children, lower(v_window), upper(v_window), 'nexg', 'held',
    now() + interval '15 minutes', v_unit.nightly_rate_kes,
    v_unit.nightly_rate_kes * v_nights)
  returning * into v_stay;

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay.held',
    p_actor_id => v_user, p_target_type => 'stay', p_target_id => v_stay.id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('unit', v_unit.id, 'nights', v_nights,
                                  'total_kes', v_stay.quote_total_kes));

  return jsonb_build_object(
    'stay_id', v_stay.id, 'expires_at', v_stay.hold_expires_at,
    'check_in', v_stay.check_in, 'check_out', v_stay.check_out,
    'nights', v_nights, 'nightly_rate_kes', v_unit.nightly_rate_kes,
    'total_kes', v_stay.quote_total_kes);
end;
$$;

-- ═══════════════════════════════════════ 2. unconfirmed bookings let go

alter table public.booking add column if not exists expired_at timestamptz;

comment on column public.booking.expired_at is
  'When a pending booking was released because the business did not confirm it in time. Its status is then cancelled.';

create or replace function public.fn_booking_release_stale(p_resource_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with released as (
    update public.booking b
       set status = 'cancelled', expired_at = now(), updated_at = now()
      from public.merchant m
     where m.id = b.merchant_id
       and b.status = 'pending'
       and (p_resource_id is null or b.resource_id = p_resource_id)
       and (b.starts_at <= now()
            or b.created_at <= now() - make_interval(hours => coalesce(
                 settings.fn_int('booking.pending_release_hours', m.city_id), 24)::int))
    returning b.id
  )
  select count(*) into v_count from released;

  if v_count > 0 then
    perform audit.log('system'::public.actor_type, 'merchants', 'booking.expired',
      p_target_type => 'bookable_resource', p_target_id => p_resource_id,
      p_after => jsonb_build_object('released', v_count));
  end if;
  return v_count;
end;
$$;

comment on function public.fn_booking_release_stale(uuid) is
  'Releases pending bookings the business has not confirmed: after booking.pending_release_hours (24 by default) or once they start, whichever is first.';

revoke execute on function public.fn_booking_release_stale(uuid) from public, anon, authenticated;
grant execute on function public.fn_booking_release_stale(uuid) to service_role;

-- rpc_booking_create: 20261112000200, refusing a temporary session and
-- letting this resource's stale pending bookings go before it looks for room.
create or replace function public.rpc_booking_create(
  p_resource_id uuid,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_slot_id uuid default null,
  p_quantity int default 1,
  p_guest_name text default null,
  p_guest_phone text default null,
  p_notes text default null
)
returns public.booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.bookable_resource;
  s public.booking_slot;
  m public.merchant;
  v_start timestamptz := p_starts_at;
  v_end timestamptz := p_ends_at;
  v_by_merchant boolean;
  v_total bigint;
  v_status public.reservation_status;
  v_qty int := greatest(coalesce(p_quantity, 1), 1);
  b public.booking;
begin
  if auth.uid() is null then
    raise exception 'Sign in to book' using errcode = '28000';
  end if;
  if authz.is_anonymous_session() then
    raise exception 'Sign in with your account to book' using errcode = '28000';
  end if;
  select * into r from public.bookable_resource where id = p_resource_id;
  if not found then
    raise exception 'Unknown resource' using errcode = 'P0002';
  end if;
  select * into m from public.merchant where id = r.merchant_id;
  v_by_merchant := authz.is_merchant_member(r.merchant_id);

  if not r.active then
    raise exception 'This is not bookable right now' using errcode = '22023';
  end if;
  if not v_by_merchant and (m.status <> 'live' or m.deleted_at is not null) then
    raise exception 'This business is not taking bookings yet' using errcode = '22023';
  end if;

  if r.model = 'capacity' then
    select * into s from public.booking_slot where id = p_slot_id;
    if not found or s.resource_id <> r.id then
      raise exception 'Pick a session' using errcode = '22023';
    end if;
    if s.status <> 'open' then
      raise exception 'This session is closed' using errcode = '22023';
    end if;
    v_start := s.starts_at;
    v_end := s.ends_at;
    if not v_by_merchant and now() > s.starts_at - make_interval(mins => s.cutoff_minutes) then
      raise exception 'Booking for this session has closed' using errcode = '22023';
    end if;
  else
    if v_start is null then
      raise exception 'Pick a start time' using errcode = '22023';
    end if;
    if v_end is null then
      if r.duration_minutes is null then
        raise exception 'Pick an end time' using errcode = '22023';
      end if;
      v_end := v_start + make_interval(mins => r.duration_minutes);
    end if;
    v_qty := 1;
  end if;

  if v_end <= v_start then
    raise exception 'End must be after start' using errcode = '22023';
  end if;
  if not v_by_merchant then
    if v_start < now() + make_interval(mins => r.min_notice_minutes) then
      raise exception 'This needs more notice than that' using errcode = '22023';
    end if;
    if v_start > now() + make_interval(days => r.max_advance_days) then
      raise exception 'That is too far ahead to book' using errcode = '22023';
    end if;
  end if;

  if r.quote_required or r.price_cents is null then
    v_total := null;
  else
    v_total := case r.price_unit
      when 'seat' then r.price_cents * v_qty
      when 'hour' then ceil(extract(epoch from (v_end - v_start)) / 3600.0)::bigint * r.price_cents
      when 'day' then ceil(extract(epoch from (v_end - v_start)) / 86400.0)::bigint * r.price_cents
      else r.price_cents
    end;
  end if;

  v_status := case
    when v_by_merchant then 'confirmed'
    when r.instant_confirm and not r.quote_required then 'confirmed'
    else 'pending'
  end;

  /* A booking the business never answered no longer holds the time. */
  perform public.fn_booking_release_stale(r.id);

  insert into public.booking (
    resource_id, slot_id, starts_at, ends_at, quantity, status, guest_user_id,
    guest_name, guest_phone, notes, total_cents, source, merchant_id, held_during
  ) values (
    r.id, case when r.model = 'capacity' then s.id end, v_start, v_end, v_qty, v_status,
    case when v_by_merchant then null else auth.uid() end,
    p_guest_name, p_guest_phone, p_notes, v_total,
    case when v_by_merchant then 'merchant' else 'app' end,
    r.merchant_id, tstzrange(v_start, v_end)
  ) returning * into b;
  perform audit.log(
    p_actor_type=>case when v_by_merchant then 'merchant_user'::public.actor_type else 'guest'::public.actor_type end,
    p_actor_id=>(select auth.uid()),p_module=>'merchants',
    p_action=>'booking.created',p_target_type=>'booking',p_target_id=>b.id,
    p_city_id=>m.city_id,p_after=>jsonb_build_object('resource_id',r.id,'status',b.status,'quantity',b.quantity));
  return b;
exception
  when exclusion_violation then
    raise exception 'That time is already taken' using errcode = '23P01';
end;
$$;

-- Every five minutes, as long as pg_cron is here.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; stale pending bookings are released when the next booking for that resource is made.';
    return;
  end if;
  perform cron.schedule(
    'booking-release-stale',
    '*/5 * * * *',
    $cron$select public.fn_booking_release_stale()$cron$);
end $$;
