-- Audit the business state changes at the existing authorised RPC boundaries.
insert into audit.action_registry (action, module, default_severity, money, description) values
  ('booking.created', 'merchants', 'info', false, 'Booking created'),
  ('booking.status_changed', 'merchants', 'info', false, 'Booking status changed'),
  ('booking.blocked', 'merchants', 'info', false, 'Booking time blocked'),
  ('staff.avatar_changed', 'staff', 'info', false, 'Staff avatar changed'),
  ('order.web_placed', 'orders', 'info', true, 'Website order placed'),
  ('tax.kra_status_changed', 'finance', 'notice', true, 'Tax document KRA status changed')
on conflict (action) do nothing;

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

create or replace function public.rpc_booking_block(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null
)
returns public.booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.bookable_resource;
  b public.booking;
begin
  select * into r from public.bookable_resource where id = p_resource_id;
  if not found or not authz.is_merchant_member(r.merchant_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if r.model <> 'exclusive' then
    raise exception 'Close the session instead of blocking it' using errcode = '22023';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'End must be after start' using errcode = '22023';
  end if;
  insert into public.booking (resource_id, starts_at, ends_at, status, notes, source, merchant_id, held_during)
  values (r.id, p_starts_at, p_ends_at, 'blocked', p_notes, 'merchant', r.merchant_id,
          tstzrange(p_starts_at, p_ends_at))
  returning * into b;
  perform audit.log(p_actor_type=>'merchant_user'::public.actor_type,p_actor_id=>(select auth.uid()),p_module=>'merchants',
    p_action=>'booking.blocked',p_target_type=>'booking',p_target_id=>b.id,
    p_city_id=>(select city_id from public.merchant where id=b.merchant_id),
    p_after=>jsonb_build_object('resource_id',r.id,'status',b.status));
  return b;
exception
  when exclusion_violation then
    raise exception 'That time already has a booking' using errcode = '23P01';
end;
$$;

create or replace function public.rpc_my_staff_avatar_set(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_old text;
begin
  if v_me is null then
    raise exception 'Sign in as staff first.' using errcode = 'insufficient_privilege';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'That file is not in your folder.' using errcode = 'insufficient_privilege';
  end if;

  select avatar_path into v_old from public.staff_user where id = v_me;
  update public.staff_user set avatar_path = p_path where id = v_me;

  if v_old is distinct from p_path then
    perform audit.log(p_actor_type=>'staff'::public.actor_type,p_actor_id=>v_me,p_module=>'staff',
      p_action=>'staff.avatar_changed',p_target_type=>'staff_user',p_target_id=>v_me,
      p_after=>jsonb_build_object('avatar_present',p_path is not null));
  end if;

  return case when v_old is distinct from p_path then v_old else null end;
end;
$$;

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

  /* One guest per account. A number already held by somebody else's
     account is not ours to hand over. */
  select * into v_guest from public.guest where user_id = v_uid;
  if not found then
    select * into v_guest from public.guest where phone = v_phone;
    if found and v_guest.user_id is not null and v_guest.user_id <> v_uid then
      raise exception 'That number is already linked to another account.';
    end if;
    if found then
      update public.guest set user_id = v_uid, name = coalesce(name, v_name)
       where id = v_guest.id returning * into v_guest;
    else
      insert into public.guest (user_id, phone, name)
      values (v_uid, v_phone, v_name) returning * into v_guest;
    end if;
  else
    update public.guest
       set phone = coalesce(phone, v_phone), name = coalesce(name, v_name)
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
    'pay_online', (q ->> 'payment_method') in ('card', 'mpesa_stk'));
end;
$$;

create or replace function public.rpc_tax_set_kra_status(
  p_invoice_id uuid,
  p_status text,
  p_reference text default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city_id uuid;
begin
  if not authz.has_full_finance() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'submitted', 'accepted', 'rejected', 'not_required') then
    raise exception 'Unknown KRA status.';
  end if;
  update public.tax_invoice
     set kra_status = p_status,
         kra_reference = coalesce(nullif(trim(p_reference), ''), kra_reference),
         kra_submitted_at = case when p_status in ('submitted', 'accepted') then coalesce(kra_submitted_at, now())
                                 else kra_submitted_at end,
         kra_response = coalesce(kra_response, '{}'::jsonb)
           || jsonb_build_object('note', p_note, 'set_at', now(), 'set_by', (select auth.uid()))
   where id = p_invoice_id returning city_id into v_city_id;
  if not found then raise exception 'No such document.'; end if;
  perform audit.log(p_actor_type=>'staff'::public.actor_type,p_actor_id=>authz.staff_id(),p_module=>'finance',
    p_action=>'tax.kra_status_changed',p_target_type=>'tax_invoice',p_target_id=>p_invoice_id,
    p_city_id=>v_city_id,p_after=>jsonb_build_object('status',p_status));
end;
$$;

-- Only a verified session's heartbeat and its rate budget change here.
-- Approval and other business mutations retain their own audit events.
insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values ('rpc_merchant_session_activity',
  'Verified session heartbeat refreshes inactivity timing and its rate budget without granting access.',
  'merchant_application_session_activity.last_activity_at; merchant_application_command_budget')
on conflict (function_name) do nothing;

-- This definer has no caller or order-scope check and is an internal tax helper.
revoke execute on function public.fn_tax_issue_order_compliant(uuid) from public, anon, authenticated;
