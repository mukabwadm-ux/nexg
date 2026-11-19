-- Placing an order twice by accident.
--
-- A retry on a weak connection could send the same "place order" twice and
-- make two orders. The app now sends client_request_id (a UUID it makes once
-- per checkout attempt) in the rpc_order_place_web payload. The first call
-- places the order; a repeat with the same id, from the same customer record,
-- returns that order with repeat: true instead of placing another. A unique
-- index stops two simultaneous calls from both getting through.
--
-- Also checked (gap B12): rpc_payment_authorised, once open to signed-out
-- callers, was dropped by 20261223000100; nothing to change here.
--
-- Rollback: re-run rpc_order_place_web from 20270109000700, then drop the index
-- and the column.

alter table public.order add column client_request_id uuid;
comment on column public.order.client_request_id is
  'The id the app sent with "place order", so a repeat returns this order instead of placing another.';
create unique index order_one_per_client_request
  on public.order (guest_id, client_request_id) where client_request_id is not null;

-- rpc_order_place_web: 20270109000700, returning the first order for a repeated request.
create or replace function public.rpc_order_place_web(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_temporary boolean := authz.is_anonymous_session();
  v_phone text := nullif(regexp_replace(coalesce(p_payload ->> 'guest_phone', ''), '[^0-9+]', '', 'g'), '');
  v_name text := nullif(trim(p_payload ->> 'guest_name'), '');
  v_label text := nullif(trim(p_payload ->> 'dropoff_label'), '');
  q jsonb;
  v_guest public.guest;
  v_point extensions.geography;
  v_order uuid;
  v_ref text;
  v_needs text[] := '{}';
  v_line jsonb;
  v_item uuid;
  v_request text := nullif(trim(p_payload ->> 'client_request_id'), '');
  v_prior public.order;
begin
  if v_uid is null then
    raise exception 'Sign in or continue as a guest to place your order.' using errcode = '42501';
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

  /* One record per session, and a number belongs to the record that already
     holds it (20261223000200). Neither an account nor a temporary session
     proves a phone, so a number on file is never attached here. */
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

  /* The same request sent again (a retry on a weak connection) gets the
     order it already made, not a second one. */
  if v_request is not null then
    if v_request !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'The order request id must be a UUID.' using errcode = '22023';
    end if;
    select * into v_prior from public.order
     where guest_id = v_guest.id and client_request_id = v_request::uuid;
    if found then
      return jsonb_build_object(
        'ok', true, 'order_id', v_prior.id, 'reference', v_prior.reference,
        'total_cents', v_prior.total_cents, 'payment_method', v_prior.payment_method,
        'pay_online', v_prior.payment_method::text in ('card', 'mpesa_stk', 'bank_transfer'),
        'guest', v_temporary, 'repeat', true);
    end if;
  end if;

  if v_temporary and (
       select count(*) from public.order o
        where o.guest_id = v_guest.id
          and o.payment_status in ('pending', 'authorised', 'failed')
          and o.stage in ('placed', 'confirmed')) >= 3 then
    raise exception 'Pay for or cancel your earlier orders first.'
      using hint = 'guest_unpaid_limit';
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
    carry_requirements, client_request_id)
  values (
    v_ref, v_guest.id, (q ->> 'merchant_id')::uuid, nullif(q ->> 'branch_id', '')::uuid,
    (q ->> 'city_id')::uuid, nullif(q ->> 'zone_id', '')::uuid, 'web',
    v_label, v_point, nullif(trim(p_payload ->> 'dropoff_note'), ''), '{}'::jsonb,
    'placed', (q ->> 'payment_method')::public.order_payment_method, 'pending',
    (q ->> 'subtotal_cents')::bigint, (q ->> 'delivery_fee_cents')::bigint,
    (q ->> 'service_fee_cents')::bigint, (q ->> 'small_basket_fee_cents')::bigint,
    (q ->> 'cash_handling_cents')::bigint, (q ->> 'total_cents')::bigint,
    (q ->> 'commission_cents')::bigint, (q ->> 'commission_pct')::numeric,
    'KES', q -> 'pricing_version_ids', v_needs, v_request::uuid)
  returning id into v_order;

  /* Each line, with its unit and the choices made on it (20270109000400). */
  for v_line in select l from jsonb_array_elements(q -> 'lines') l loop
    insert into public.order_item (
      order_id, catalogue_item_id, name, quantity, unit_price_cents, line_total_cents, note,
      unit_label, unit_step, variant_id, variant_label)
    values (v_order, (v_line ->> 'catalogue_item_id')::uuid, v_line ->> 'name',
            (v_line ->> 'quantity')::integer, (v_line ->> 'unit_price_cents')::bigint,
            (v_line ->> 'line_total_cents')::bigint, nullif(v_line ->> 'note', ''),
            case when v_line ->> 'sold_by' in ('weight', 'volume') then v_line ->> 'unit_label' end,
            case when v_line ->> 'sold_by' in ('weight', 'volume') then (v_line ->> 'unit_step')::numeric end,
            nullif(v_line ->> 'variant_id', '')::uuid, nullif(v_line ->> 'variant_label', ''))
    returning id into v_item;

    /* A counted version is set aside for this order; the last one can't be sold twice. */
    if nullif(v_line ->> 'variant_id', '') is not null then
      update public.catalogue_variant
         set stock_count = stock_count - (v_line ->> 'quantity')::integer, updated_at = now()
       where id = (v_line ->> 'variant_id')::uuid and stock_count is not null;
      if exists (select 1 from public.catalogue_variant
                  where id = (v_line ->> 'variant_id')::uuid and stock_count < 0) then
        raise exception 'Not enough % (%) left. Lower the amount.', v_line ->> 'name', v_line ->> 'variant_label'
          using hint = 'variant_sold_out';
      end if;
    end if;

    insert into public.order_item_modifier (order_item_id, group_id, option_id, group_name, option_name, extra_cents)
    select v_item, (c ->> 'group_id')::uuid, (c ->> 'option_id')::uuid,
           c ->> 'group_name', c ->> 'option_name', (c ->> 'extra_cents')::bigint
      from jsonb_array_elements(coalesce(v_line -> 'options', '[]'::jsonb)) c;
  end loop;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (v_order, 'placed', 'Placed on the website',
          replace(q ->> 'payment_method', '_', ' '),
          'guest', v_guest.id,
          jsonb_build_object('channel', 'web', 'temporary_session', v_temporary));

  perform audit.log(p_actor_type=>'guest'::public.actor_type,p_actor_id=>v_guest.id,p_module=>'orders',
    p_action=>'order.web_placed',p_target_type=>'order',p_target_id=>v_order,p_city_id=>(q->>'city_id')::uuid,
    p_after=>jsonb_build_object('channel','web','payment_method',q->>'payment_method',
                                'temporary_session',v_temporary));

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'reference', v_ref,
    'total_cents', (q ->> 'total_cents')::bigint,
    'payment_method', q ->> 'payment_method',
    'pay_online', (q ->> 'payment_method') in ('card', 'mpesa_stk', 'bank_transfer'),
    'guest', v_temporary,
    'repeat', false);
end;
$$;

comment on function public.rpc_order_place_web(jsonb) is
  'Places a delivery order for the signed-in account or a temporary (guest) session, with each line''s unit, choices and version. A repeated client_request_id returns the first order. Bookings and stay holds still need an account.';

revoke execute on function public.rpc_order_place_web(jsonb) from public, anon;
grant execute on function public.rpc_order_place_web(jsonb) to authenticated;
