-- Test payments for bookings, while no payment provider is connected.
--
-- Owner, 19 Nov 2026: every booking is paid before it is confirmed, and
-- Paystack (piece 3) is on hold, so a priced booking could never be
-- confirmed. Until it is connected, a customer can "pay" with a test
-- payment: the booking is confirmed exactly as a real payment would confirm
-- it, but it is marked paid_simulated and its reference starts with SIM-, so
-- the business and staff can see no money was collected.
--
-- Off unless the setting payments.simulated_bookings is turned on (per city;
-- default off). Stays are not included: they already take real M-Pesa, and a
-- test stay payment would write money into the host's finance records.
--
-- Remove when payments land: turn the setting off, then
--   drop function public.rpc_booking_pay_simulated(uuid);
--   delete from settings.definition where key = 'payments.simulated_bookings';
--   (keep booking.paid_simulated: it records which past bookings were tests)
-- Rollback: the same, and alter table public.booking drop column paid_simulated.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('booking.paid_simulated', 'merchants', 'notice', false, 'Booking confirmed with a test payment; no money collected')
on conflict (action) do nothing;

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('payments.simulated_bookings', 'payments', 'city', 'bool', null,
   'Test payments for bookings',
   'While no payment provider is connected, customers confirm a booking with a test payment. No money is collected; the booking is marked as a test payment. Turn off once real payments work.',
   true, false, 'tech+super_admin', '{merchants}', 'false', 420)
on conflict (key) do nothing;

alter table public.booking
  add column if not exists paid_simulated boolean not null default false;

comment on column public.booking.paid_simulated is
  'Confirmed with a test payment (payments.simulated_bookings): no money was collected.';

/* The customer pays for their own booking with a test payment. */
create or replace function public.rpc_booking_pay_simulated(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.booking;
  v_city uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into b from public.booking where id = p_booking_id;
  if b.id is null or b.guest_user_id is distinct from auth.uid() then
    raise exception 'That booking is not yours.' using errcode = '42501';
  end if;
  select city_id into v_city from public.merchant where id = b.merchant_id;
  if not coalesce(settings.fn_bool('payments.simulated_bookings', v_city), false) then
    raise exception 'Test payments are switched off.' using errcode = '42501';
  end if;

  v_result := public.fn_booking_mark_paid(b.id, b.total_cents,
    'SIM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)));
  if (v_result ->> 'ok')::boolean then
    update public.booking set paid_simulated = true where id = b.id;
    perform audit.log('guest'::public.actor_type, 'merchants', 'booking.paid_simulated',
      p_actor_id => auth.uid(), p_target_type => 'booking', p_target_id => b.id, p_city_id => v_city);
  end if;
  return v_result || jsonb_build_object('simulated', true);
end;
$$;

revoke execute on function public.rpc_booking_pay_simulated(uuid) from public, anon;
grant execute on function public.rpc_booking_pay_simulated(uuid) to authenticated;

-- The business sees a test payment for what it is, at the counter.
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
    'paid', b.paid_at is not null or b.total_cents = 0,
    'test_payment', b.paid_simulated));
end;
$$;
