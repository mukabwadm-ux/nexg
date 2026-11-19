-- Guests can book once they pay; nothing is confirmed before it is paid;
-- the customer shows a booking code and the business checks it.
--
-- Decided with the owner on 19 Nov 2026, replacing the "accounts only" rule of
-- 20261223000500 for bookings and stays (orders went the same way in
-- 20270109000100):
--
-- 1. A temporary (guest) session may book a time (rpc_booking_create) or hold
--    a stay's dates (rpc_stay_hold). A guest gives the name to reserve under.
--    At most two unpaid holds at a time per session, as stays already had, so
--    a throwaway session cannot sit on a business's calendar.
-- 2. Paid first. A customer booking with a price waits as 'pending' with a
--    payment deadline (payment_due_by, 15 minutes) and holds its time while it
--    waits. It becomes 'confirmed' only when fn_booking_mark_paid records the
--    full amount. An unpaid booking is released at its deadline. The business
--    cannot confirm an unpaid customer booking by hand. Free bookings and
--    bookings the business enters itself are as before; a booking priced on
--    request stays a request until it has a price. Stays already worked this
--    way (held 15 minutes, confirmed by the payment); now a guest may pay too.
--    There is no payment provider for bookings yet (Paystack, piece 3, is on
--    hold): fn_booking_mark_paid is where the payment's settlement plugs in.
-- 3. Reservation codes. Each customer booking and NexG stay gets a
--    six-character code (no 0/O or 1/I/L) in reservation_code, a table no
--    business, host or customer can read. The customer reads their own code
--    with rpc_my_booking_code / rpc_my_stay_code: null until it is paid and
--    confirmed, and null again once used or over. The business or host types
--    it in (rpc_merchant_booking_by_code / _check_in, rpc_host_stay_by_code /
--    _check_in), optionally with the name the customer gives. Checking in
--    marks the code used; it then stops working. Ten wrong codes or names in
--    15 minutes lock that person out for a while. These answer
--    { ok, reason, message } rather than raising, so a wrong attempt is kept.
--
-- Rollback: re-run rpc_booking_create, rpc_stay_hold and
-- fn_booking_release_stale from 20261223000500, rpc_booking_set_status from
-- 20261112000200, rpc_my_bookings from 20261129000100, and
-- rpc_payment_begin_stay and rpc_stay_checkout_status from 20261119000200; then
--   drop function public.fn_booking_mark_paid(uuid, bigint, text),
--     public.rpc_merchant_booking_by_code(text), public.rpc_merchant_booking_check_in(text, text),
--     public.rpc_host_stay_by_code(text), public.rpc_host_stay_check_in(text, text),
--     public.rpc_my_booking_code(uuid), public.rpc_my_stay_code(uuid),
--     public.fn_reservation_code_new(), public.fn_reservation_code_locked(),
--     public.fn_reservation_code_failed();
--   drop table public.reservation_code_attempt, public.reservation_code;
--   drop function
--     public.fn_booking_code_normalise(text), public.fn_short_booking_code(),
--     public.fn_reservation_name(text), public.fn_same_reservation_name(text, text);
--   alter table public.booking drop column payment_due_by, drop column paid_cents,
--     drop column paid_at, drop column payment_reference, drop column checked_in_at,
--     drop column checked_in_by;
--   alter table public.stay drop column checked_in_at, drop column checked_in_by;

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('booking.paid', 'merchants', 'notice', true, 'Customer booking paid and confirmed'),
  ('booking.payment_late', 'merchants', 'high', true, 'Booking payment arrived after its hold ended; refund due'),
  ('booking.checked_in', 'merchants', 'info', false, 'Customer checked in with their booking code'),
  ('stay.checked_in', 'hotels', 'info', false, 'Guest checked in with their booking code')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════ shared helpers

/* Six characters with no 0/O or 1/I/L, so a code read aloud is unambiguous. */
create or replace function public.fn_short_booking_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                           1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;

/* A code as typed: uppercase, spaces and dashes removed. */
create or replace function public.fn_booking_code_normalise(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')), '');
$$;

/* The name to reserve under: trimmed, single spaces, 1 to 80 characters. */
create or replace function public.fn_reservation_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'))) between 1 and 80
              then btrim(regexp_replace(p_name, '\s+', ' ', 'g')) end;
$$;

/* A name given at the counter against the reservation: case, spaces and punctuation ignored. */
create or replace function public.fn_same_reservation_name(p_a text, p_b text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(regexp_replace(lower(coalesce(p_a, '')), '[^[:alnum:]]', '', 'g'), '')
      = regexp_replace(lower(coalesce(p_b, '')), '[^[:alnum:]]', '', 'g'),
    false);
$$;

revoke execute on function public.fn_short_booking_code(), public.fn_booking_code_normalise(text),
  public.fn_reservation_name(text), public.fn_same_reservation_name(text, text) from public, anon;
grant execute on function public.fn_booking_code_normalise(text), public.fn_reservation_name(text),
  public.fn_same_reservation_name(text, text) to authenticated, service_role;
grant execute on function public.fn_short_booking_code() to service_role;

-- ═══════════════════════════════════════════════════════════ bookings

alter table public.booking
  add column if not exists payment_due_by timestamptz,
  add column if not exists paid_cents bigint check (paid_cents is null or paid_cents >= 0),
  add column if not exists paid_at timestamptz,
  add column if not exists payment_reference text check (payment_reference is null or char_length(payment_reference) <= 200),
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references auth.users (id) on delete set null;

comment on column public.booking.payment_due_by is
  'A customer booking with a price: when it must be paid by. It holds its time until then and is released if unpaid.';
comment on column public.booking.paid_at is
  'When the customer paid the full amount (fn_booking_mark_paid). A customer booking with a price is confirmed only once paid.';
comment on column public.booking.checked_in_at is
  'When the business checked the customer in with their booking code.';

create index if not exists booking_payment_due_idx on public.booking (payment_due_by)
  where status = 'pending' and paid_at is null and payment_due_by is not null;

-- fn_booking_release_stale: 20261223000500, plus unpaid bookings past their deadline.
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
            or (b.paid_at is null and b.payment_due_by is not null and b.payment_due_by <= now())
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

-- rpc_booking_create: 20261223000500, with guests allowed, a reservation name
-- for customers, and paid-first for a priced customer booking.
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
  v_name text;
  v_due timestamptz;
  b public.booking;
begin
  if auth.uid() is null then
    raise exception 'Sign in to book' using errcode = '28000';
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

  v_name := public.fn_reservation_name(p_guest_name);
  if not v_by_merchant then
    if v_name is null then
      raise exception 'Add the name to book under' using errcode = '22023';
    end if;
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

  /* Paid first: a customer booking with a price waits for its payment. */
  v_status := case
    when v_by_merchant then 'confirmed'
    when v_total > 0 then 'pending'
    when r.instant_confirm and not r.quote_required then 'confirmed'
    else 'pending'
  end;
  if not v_by_merchant and v_total > 0 then
    if (select count(*) from public.booking
         where guest_user_id = auth.uid() and status = 'pending'
           and paid_at is null and payment_due_by > now()) >= 2 then
      raise exception 'You already have two bookings waiting for payment. Pay for or cancel one first.'
        using errcode = '22023';
    end if;
    v_due := now() + interval '15 minutes';
  end if;

  /* A booking the business never answered, or never paid for, no longer holds the time. */
  perform public.fn_booking_release_stale(r.id);

  insert into public.booking (
    resource_id, slot_id, starts_at, ends_at, quantity, status, guest_user_id,
    guest_name, guest_phone, notes, total_cents, source, merchant_id, held_during,
    payment_due_by
  ) values (
    r.id, case when r.model = 'capacity' then s.id end, v_start, v_end, v_qty, v_status,
    case when v_by_merchant then null else auth.uid() end,
    coalesce(v_name, p_guest_name), p_guest_phone, p_notes, v_total,
    case when v_by_merchant then 'merchant' else 'app' end,
    r.merchant_id, tstzrange(v_start, v_end), v_due
  ) returning * into b;
  /* A customer booking gets the code they show; they see it once paid (rpc_my_booking_code). */
  if not v_by_merchant then
    insert into public.reservation_code (booking_id, code)
    values (b.id, public.fn_reservation_code_new());
  end if;
  perform audit.log(
    p_actor_type=>case when v_by_merchant then 'merchant_user'::public.actor_type else 'guest'::public.actor_type end,
    p_actor_id=>(select auth.uid()),p_module=>'merchants',
    p_action=>'booking.created',p_target_type=>'booking',p_target_id=>b.id,
    p_city_id=>m.city_id,p_after=>jsonb_build_object('resource_id',r.id,'status',b.status,'quantity',b.quantity,
      'payment_due_by', b.payment_due_by));
  return b;
exception
  when exclusion_violation then
    raise exception 'That time is already taken' using errcode = '23P01';
end;
$$;

-- rpc_booking_set_status: 20261112000200, refusing to confirm an unpaid customer booking.
create or replace function public.rpc_booking_set_status(p_booking_id uuid, p_status public.reservation_status)
returns public.booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.booking;
  r public.bookable_resource;
  v_member boolean;
  v_previous public.reservation_status;
  v_guest boolean;
begin
  select * into b from public.booking where id = p_booking_id for update;
  if not found then
    raise exception 'Unknown booking' using errcode = 'P0002';
  end if;
  select * into r from public.bookable_resource where id = b.resource_id;
  v_member := authz.is_merchant_member(b.merchant_id);
  v_guest := b.guest_user_id is not null and b.guest_user_id = auth.uid();
  if not v_member and not v_guest then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if not (
    (b.status = 'pending' and p_status in ('confirmed', 'cancelled')) or
    (b.status = 'confirmed' and p_status in ('cancelled', 'completed', 'no_show')) or
    (b.status = 'blocked' and p_status = 'cancelled')
  ) then
    raise exception 'A % booking cannot become %', b.status, p_status using errcode = '22023';
  end if;

  if p_status = 'confirmed' and b.source = 'app' and b.paid_at is null
     and (b.total_cents is null or b.total_cents > 0) then
    raise exception 'This booking is not paid yet. It is confirmed when the customer pays.'
      using errcode = '22023';
  end if;

  if not v_member then
    if p_status <> 'cancelled' then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if now() > b.starts_at - make_interval(mins => r.cancel_cutoff_minutes) then
      raise exception 'It is too late to cancel this online' using errcode = '22023';
    end if;
  end if;

  v_previous := b.status;
  update public.booking set status = p_status where id = b.id returning * into b;
  perform audit.log(
    p_actor_type=>case when v_member then 'merchant_user'::public.actor_type else 'guest'::public.actor_type end,
    p_actor_id=>(select auth.uid()),p_module=>'merchants',
    p_action=>'booking.status_changed',p_target_type=>'booking',p_target_id=>b.id,
    p_city_id=>(select city_id from public.merchant where id=b.merchant_id),
    p_before=>jsonb_build_object('status',v_previous),p_after=>jsonb_build_object('status',b.status));
  return b;
exception
  when exclusion_violation then
    raise exception 'That time is already taken' using errcode = '23P01';
end;
$$;

/*
 * The payment side: a customer booking was paid. Where a payment provider's
 * settlement plugs in (none is connected for bookings yet). Confirms the
 * booking when the exact amount arrives in time. Never raises for a late or
 * wrong payment, so a payment webhook calling it cannot lose its own record:
 * it answers ok false with the reason, and a late payment is logged for a
 * refund.
 */
create or replace function public.fn_booking_mark_paid(
  p_booking_id uuid,
  p_amount_cents bigint,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.booking;
  v_city uuid;
begin
  select * into b from public.booking where id = p_booking_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  select city_id into v_city from public.merchant where id = b.merchant_id;
  if b.paid_at is not null then
    return jsonb_build_object('ok', b.payment_reference = p_reference, 'reason',
      case when b.payment_reference = p_reference then 'already_paid' else 'paid_by_another_payment' end,
      'status', b.status);
  end if;
  if b.total_cents is null or b.total_cents <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_pay');
  end if;
  if p_amount_cents is distinct from b.total_cents then
    return jsonb_build_object('ok', false, 'reason', 'amount_mismatch', 'due_cents', b.total_cents);
  end if;
  if b.status <> 'pending' or b.payment_due_by is null or b.payment_due_by < now() then
    perform audit.log('system'::public.actor_type, 'merchants', 'booking.payment_late',
      p_target_type => 'booking', p_target_id => b.id, p_city_id => v_city,
      p_after => jsonb_build_object('reference', p_reference, 'amount_cents', p_amount_cents,
                                    'status', b.status));
    return jsonb_build_object('ok', false, 'reason', 'hold_expired');
  end if;

  update public.booking
     set status = 'confirmed', paid_cents = p_amount_cents, paid_at = now(),
         payment_reference = left(p_reference, 200), payment_due_by = null, updated_at = now()
   where id = b.id
  returning * into b;
  perform audit.log('system'::public.actor_type, 'merchants', 'booking.paid',
    p_target_type => 'booking', p_target_id => b.id, p_city_id => v_city,
    p_after => jsonb_build_object('reference', p_reference, 'amount_cents', p_amount_cents));
  return jsonb_build_object('ok', true, 'status', b.status, 'reference', b.reference);
end;
$$;

revoke execute on function public.fn_booking_mark_paid(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.fn_booking_mark_paid(uuid, bigint, text) to service_role;

-- rpc_my_bookings: 20261129000100, with what the customer must still pay.
create or replace function public.rpc_my_bookings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.starts_at desc), '[]'::jsonb)
  from (
    select b.id, b.reference, b.starts_at, b.ends_at, b.quantity, b.status, b.total_cents,
           r.name as resource_name, r.model, m.id as merchant_id, m.trading_name as merchant_name,
           (b.status in ('pending', 'confirmed')
             and now() <= b.starts_at - make_interval(mins => r.cancel_cutoff_minutes)) as can_cancel,
           b.guest_name as reservation_name,
           (b.status = 'pending' and b.paid_at is null and b.payment_due_by > now()) as awaiting_payment,
           b.payment_due_by, b.paid_at, b.checked_in_at
    from public.booking b
    join public.bookable_resource r on r.id = b.resource_id
    join public.merchant m on m.id = b.merchant_id
    where b.guest_user_id = auth.uid()
    order by b.starts_at desc
    limit 100
  ) x;
$$;

-- ═══════════════════════════════════════════════════════════ stays

alter table public.stay
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references auth.users (id) on delete set null;

-- ═══════════════════════════════════════════════════════════ reservation codes

/*
 * One code per customer booking or stay, kept apart from both: no business,
 * host or customer can read this table. The customer reads their own code
 * through rpc_my_booking_code / rpc_my_stay_code (null when there is none);
 * the business or host only ever types it in.
 */
create table if not exists public.reservation_code (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid unique references public.booking (id) on delete cascade,
  stay_id     uuid unique references public.stay (id) on delete cascade,
  code        text not null unique check (code ~ '^[A-HJKMNP-Z2-9]{6}$'),
  used_at     timestamptz,
  used_by     uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(booking_id, stay_id) = 1)
);

comment on table public.reservation_code is
  'The six-character code a customer shows for a booking or stay. Readable only by the customer, through rpc_my_booking_code / rpc_my_stay_code. Used once.';

alter table public.reservation_code enable row level security;
revoke all on public.reservation_code from public, anon, authenticated;
grant select, insert, update, delete on public.reservation_code to service_role;

/* Wrong codes and names typed by a business or host, to limit guessing. */
create table if not exists public.reservation_code_attempt (
  id     bigserial primary key,
  actor  uuid not null,
  at     timestamptz not null default now()
);
create index if not exists reservation_code_attempt_actor_idx
  on public.reservation_code_attempt (actor, at desc);
alter table public.reservation_code_attempt enable row level security;
revoke all on public.reservation_code_attempt from public, anon, authenticated;
grant select, insert, delete on public.reservation_code_attempt to service_role;

/* A fresh, unused code. */
create or replace function public.fn_reservation_code_new()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := public.fn_short_booking_code();
    exit when not exists (select 1 from public.reservation_code where code = v_code);
  end loop;
  return v_code;
end;
$$;

/* True when this person has typed 10 wrong codes or names in 15 minutes. */
create or replace function public.fn_reservation_code_locked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) >= 10 from public.reservation_code_attempt
   where actor = auth.uid() and at > now() - interval '15 minutes';
$$;

create or replace function public.fn_reservation_code_failed()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.reservation_code_attempt (actor) values (auth.uid());
$$;

revoke execute on function public.fn_reservation_code_new(), public.fn_reservation_code_locked(),
  public.fn_reservation_code_failed() from public, anon, authenticated;

/* Codes for customer bookings and NexG stays that are already waiting or confirmed. */
insert into public.reservation_code (booking_id, code)
select b.id, public.fn_reservation_code_new()
  from public.booking b
 where b.source = 'app' and b.status in ('pending', 'confirmed') and b.ends_at > now()
   and not exists (select 1 from public.reservation_code rc where rc.booking_id = b.id);
insert into public.reservation_code (stay_id, code)
select s.id, public.fn_reservation_code_new()
  from public.stay s
 where s.source = 'nexg' and s.status in ('held', 'booked') and s.check_out > now()
   and not exists (select 1 from public.reservation_code rc where rc.stay_id = s.id);

/* The customer's own code for a booking: only once it is paid and confirmed, until used or over. */
create or replace function public.rpc_my_booking_code(p_booking_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rc.code
    from public.booking b
    join public.reservation_code rc on rc.booking_id = b.id
   where b.id = p_booking_id
     and auth.uid() is not null and b.guest_user_id = auth.uid()
     and b.status = 'confirmed'
     and (b.paid_at is not null or b.total_cents = 0)
     and rc.used_at is null
     and b.ends_at > now();
$$;

/* The guest's own code for a stay: once paid (booked), until used or checked out. */
create or replace function public.rpc_my_stay_code(p_stay_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rc.code
    from public.stay s
    join public.reservation_code rc on rc.stay_id = s.id
   where s.id = p_stay_id
     and auth.uid() is not null and s.guest_user_id = auth.uid()
     and s.status = 'booked'
     and rc.used_at is null
     and s.check_out > now();
$$;

/*
 * The business types the code the customer shows. Never raises for a wrong
 * code, so the wrong attempt is counted: answers
 *   { ok: false, reason: 'too_many_attempts' | 'not_found' | 'used', message }
 * or { ok: true, booking: {...} }.
 */
create or replace function public.rpc_merchant_booking_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := public.fn_booking_code_normalise(p_code);
  rc public.reservation_code;
  b public.booking;
begin
  if auth.uid() is null then
    raise exception 'Sign in to check a booking.' using errcode = '42501';
  end if;
  if public.fn_reservation_code_locked() then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts',
      'message', 'Too many wrong codes. Try again in 15 minutes.');
  end if;
  select * into rc from public.reservation_code where code = v_code and booking_id is not null;
  select * into b from public.booking where id = rc.booking_id;
  if b.id is null or not authz.is_merchant_member(b.merchant_id) then
    perform public.fn_reservation_code_failed();
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'No booking has this code.');
  end if;
  if rc.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used', 'used_at', rc.used_at,
      'message', 'This code was already used.');
  end if;
  return jsonb_build_object('ok', true, 'booking', jsonb_build_object(
    'id', b.id, 'reference', b.reference, 'merchant_id', b.merchant_id,
    'resource_name', (select name from public.bookable_resource where id = b.resource_id),
    'reservation_name', b.guest_name, 'starts_at', b.starts_at, 'ends_at', b.ends_at,
    'quantity', b.quantity, 'status', b.status, 'total_cents', b.total_cents,
    'paid', b.paid_at is not null or b.total_cents = 0));
end;
$$;

/*
 * The customer is here: the code (and, when typed, the name) checks them in
 * and marks the code used. Answers { ok: true, booking, checked_in_at } or
 * { ok: false, reason: 'too_many_attempts' | 'not_found' | 'used' | 'not_paid'
 *   | 'not_confirmed' | 'ended' | 'name_mismatch', message }.
 */
create or replace function public.rpc_merchant_booking_check_in(p_code text, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found jsonb := public.rpc_merchant_booking_by_code(p_code);
  b public.booking;
begin
  if not (v_found ->> 'ok')::boolean then
    return v_found;
  end if;
  select * into b from public.booking where id = (v_found -> 'booking' ->> 'id')::uuid for update;
  if b.status = 'pending' and b.paid_at is null and coalesce(b.total_cents, 1) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_paid',
      'message', 'This booking is not paid yet, so it is not confirmed.');
  end if;
  if b.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed',
      'message', 'This booking is ' || b.status || '; it cannot be checked in.');
  end if;
  if b.ends_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'ended', 'message', 'This booking has already ended.');
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is not null
     and not public.fn_same_reservation_name(p_name, b.guest_name) then
    perform public.fn_reservation_code_failed();
    return jsonb_build_object('ok', false, 'reason', 'name_mismatch',
      'message', 'The name does not match this booking.');
  end if;
  update public.booking set checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
   where id = b.id returning * into b;
  update public.reservation_code set used_at = now(), used_by = auth.uid() where booking_id = b.id;
  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'booking.checked_in',
    p_actor_id => auth.uid(), p_target_type => 'booking', p_target_id => b.id,
    p_city_id => (select city_id from public.merchant where id = b.merchant_id));
  return jsonb_build_object('ok', true, 'booking', v_found -> 'booking', 'checked_in_at', b.checked_in_at);
end;
$$;

/* The host: the same for a stay. */
create or replace function public.rpc_host_stay_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := public.fn_booking_code_normalise(p_code);
  rc public.reservation_code;
  v_stay public.stay;
begin
  if auth.uid() is null then
    raise exception 'Sign in to check a booking.' using errcode = '42501';
  end if;
  if public.fn_reservation_code_locked() then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts',
      'message', 'Too many wrong codes. Try again in 15 minutes.');
  end if;
  select * into rc from public.reservation_code where code = v_code and stay_id is not null;
  select * into v_stay from public.stay where id = rc.stay_id;
  if v_stay.id is null or not authz.is_host_member(v_stay.host_id) then
    perform public.fn_reservation_code_failed();
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'message', 'No stay has this code.');
  end if;
  if rc.used_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'used', 'used_at', rc.used_at,
      'message', 'This code was already used.');
  end if;
  return jsonb_build_object('ok', true, 'stay', jsonb_build_object(
    'stay_id', v_stay.id, 'host_id', v_stay.host_id,
    'unit', (select coalesce(u.label_public, u.name) from public.unit u where u.id = v_stay.unit_id),
    'reservation_name', v_stay.guest_first_name,
    'check_in', v_stay.check_in, 'check_out', v_stay.check_out,
    'adults', v_stay.party_adults, 'children', v_stay.party_children,
    'status', case when v_stay.status = 'held' and v_stay.hold_expires_at <= now()
                   then 'expired' else v_stay.status end,
    'paid', v_stay.status in ('booked', 'in_stay', 'departed') and v_stay.paid_kes is not null));
end;
$$;

create or replace function public.rpc_host_stay_check_in(p_code text, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_found jsonb := public.rpc_host_stay_by_code(p_code);
  v_stay public.stay;
begin
  if not (v_found ->> 'ok')::boolean then
    return v_found;
  end if;
  select * into v_stay from public.stay where id = (v_found -> 'stay' ->> 'stay_id')::uuid for update;
  if v_stay.status = 'held' then
    return jsonb_build_object('ok', false, 'reason', 'not_paid',
      'message', 'This stay is not paid yet, so it is not confirmed.');
  end if;
  if v_stay.status <> 'booked' then
    return jsonb_build_object('ok', false, 'reason', 'not_confirmed',
      'message', 'This stay is ' || v_stay.status || '; it cannot be checked in.');
  end if;
  if v_stay.check_out <= now() then
    return jsonb_build_object('ok', false, 'reason', 'ended', 'message', 'This stay has already ended.');
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is not null
     and not public.fn_same_reservation_name(p_name, v_stay.guest_first_name) then
    perform public.fn_reservation_code_failed();
    return jsonb_build_object('ok', false, 'reason', 'name_mismatch',
      'message', 'The name does not match this booking.');
  end if;
  update public.stay
     set status = 'in_stay', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
   where id = v_stay.id returning * into v_stay;
  update public.reservation_code set used_at = now(), used_by = auth.uid() where stay_id = v_stay.id;
  perform audit.log('host_user'::public.actor_type, 'hotels', 'stay.checked_in',
    p_actor_id => auth.uid(), p_target_type => 'stay', p_target_id => v_stay.id);
  return jsonb_build_object('ok', true, 'stay', (v_found -> 'stay') || jsonb_build_object('status', v_stay.status),
    'checked_in_at', v_stay.checked_in_at);
end;
$$;

revoke execute on function public.rpc_my_booking_code(uuid), public.rpc_my_stay_code(uuid),
  public.rpc_merchant_booking_by_code(text), public.rpc_merchant_booking_check_in(text, text),
  public.rpc_host_stay_by_code(text), public.rpc_host_stay_check_in(text, text) from public, anon;
grant execute on function public.rpc_my_booking_code(uuid), public.rpc_my_stay_code(uuid),
  public.rpc_merchant_booking_by_code(text), public.rpc_merchant_booking_check_in(text, text),
  public.rpc_host_stay_by_code(text), public.rpc_host_stay_check_in(text, text) to authenticated;


-- rpc_stay_hold: 20261223000500, with guests allowed, a name for a guest, and a reservation code.
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
  v_name text := public.fn_reservation_name(p_guest ->> 'first_name');
  v_window tstzrange;
  v_stay public.stay;
begin
  if v_user is null then
    raise exception 'Sign in to hold these dates.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() and v_name is null then
    raise exception 'Add the name to book under.' using errcode = '22023';
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
    v_name,
    v_adults, v_children, lower(v_window), upper(v_window), 'nexg', 'held',
    now() + interval '15 minutes', v_unit.nightly_rate_kes,
    v_unit.nightly_rate_kes * v_nights)
  returning * into v_stay;

  /* The guest sees it once paid (rpc_my_stay_code). */
  insert into public.reservation_code (stay_id, code)
  values (v_stay.id, public.fn_reservation_code_new());

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

-- rpc_payment_begin_stay: 20261119000200, without the email requirement.
create or replace function public.rpc_payment_begin_stay(p_stay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_stay public.stay;
  v_unit public.unit;
  v_existing public.payment;
  v_id uuid;
  v_ref text;
  v_amount bigint;
begin
  if v_uid is null then
    raise exception 'Sign in to pay for your stay.' using errcode = '42501';
  end if;
  /* A guest (temporary session) may pay too; their booking code is their confirmation. */

  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null or v_stay.guest_user_id is distinct from v_uid then
    raise exception 'That stay is not yours.' using errcode = '42501';
  end if;
  if v_stay.status = 'booked' then
    raise exception 'That stay is already paid and confirmed.' using errcode = '22023';
  end if;
  if v_stay.status <> 'held' or v_stay.hold_expires_at <= now() then
    raise exception 'Your hold ran out. Choose your dates again.' using errcode = '22023';
  end if;
  if coalesce(v_stay.quote_total_kes, 0) <= 0 then
    raise exception 'This stay has no price to pay.' using errcode = '22023';
  end if;

  select * into v_unit from public.unit where id = v_stay.unit_id for update;
  select * into v_stay from public.stay where id = p_stay_id for update;

  update public.stay
     set hold_expires_at = greatest(hold_expires_at, now() + interval '10 minutes'),
         updated_at = now()
   where id = p_stay_id
  returning * into v_stay;

  v_amount := v_stay.quote_total_kes * 100;

  select * into v_existing from public.payment
   where stay_id = p_stay_id and state in ('pending', 'authorised')
   limit 1;
  if v_existing.id is not null then
    update public.payment set expires_at = v_stay.hold_expires_at, updated_at = now()
     where id = v_existing.id;
    return jsonb_build_object(
      'ok', true, 'payment_id', v_existing.id, 'reference', v_existing.reference,
      'amount_cents', v_existing.amount_cents, 'currency', v_existing.currency,
      'expires_at', v_stay.hold_expires_at, 'reused', true);
  end if;

  v_ref := public.fn_payment_reference();
  insert into public.payment (
    reference, intent, stay_id, city_id, amount_cents, currency,
    created_by, created_via, expires_at)
  values (
    v_ref, 'stay', p_stay_id, v_unit.city_id, v_amount, 'KES',
    v_uid, 'guest_checkout', v_stay.hold_expires_at)
  returning id into v_id;

  perform audit.log('guest'::public.actor_type, 'hotels', 'payment.stay_begun',
    p_actor_id => v_uid, p_target_type => 'payment', p_target_id => v_id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('stay', p_stay_id, 'amount_cents', v_amount, 'reference', v_ref));

  return jsonb_build_object(
    'ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', v_amount, 'currency', 'KES',
    'expires_at', v_stay.hold_expires_at, 'reused', false);
end;
$$;

-- rpc_stay_checkout_status: 20261119000200, with the booking code and reservation name.
/* Where a guest's checkout stands. Their own stay only. */
create or replace function public.rpc_stay_checkout_status(p_stay_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_zone text;
  v_result jsonb;
begin
  select * into v_stay from public.stay where id = p_stay_id;
  if v_stay.id is null or v_stay.guest_user_id is distinct from auth.uid() or auth.uid() is null then
    raise exception 'That stay is not yours.' using errcode = '42501';
  end if;
  select coalesce(h.time_zone, 'Africa/Nairobi') into v_zone from public.host h where h.id = v_stay.host_id;

  select jsonb_build_object(
    'stay_id', v_stay.id,
    'status', case when v_stay.status = 'held' and v_stay.hold_expires_at <= now()
                   then 'expired' else v_stay.status end,
    'hold_expires_at', v_stay.hold_expires_at,
    'check_in', (v_stay.check_in at time zone v_zone)::date,
    'check_out', (v_stay.check_out at time zone v_zone)::date,
    'nights', (v_stay.check_out at time zone v_zone)::date - (v_stay.check_in at time zone v_zone)::date,
    'adults', v_stay.party_adults,
    'children', v_stay.party_children,
    'total_kes', v_stay.quote_total_kes,
    'paid_kes', v_stay.paid_kes,
    'refund_due', v_stay.refund_due_at is not null,
    'unit', coalesce(u.label_public, u.name),
    'property', p.name,
    'property_slug', p.slug,
    'payment_state', (select pay.state::text from public.payment pay
                       where pay.stay_id = v_stay.id order by pay.created_at desc limit 1),
    'payment_failure', (select pay.failure_reason from public.payment pay
                         where pay.stay_id = v_stay.id order by pay.created_at desc limit 1),
    'payment_reference', v_stay.payment_reference,
    'booking_code', public.rpc_my_stay_code(v_stay.id),
    'reservation_name', v_stay.guest_first_name)
  into v_result
  from public.unit u
  left join public.property p on p.id = u.property_id
  where u.id = v_stay.unit_id;

  return v_result;
end;
$$;



