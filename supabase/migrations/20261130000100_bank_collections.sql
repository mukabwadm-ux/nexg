-- Bank collections at checkout.
--
-- A guest can pay for an order straight from their bank. NexG asks the bank
-- (through an adapter in the web app) to collect a payment against the
-- NexG payment reference; the guest approves it on the bank's page; the bank
-- then sends a signed event, and only that signed event marks the order paid.
--
-- The first bank is the NexG Sandbox Bank (apps/bank-sandbox), recorded as
-- provider 'bank_sandbox'. A real bank later is another provider
-- ('bank_<name>') behind the same functions; nothing here is sandbox-specific
-- except that name.
--
-- Trust:
--   * Events are signed with HMAC-SHA256 over "<timestamp>.<raw body>" using
--     the shared secret stored in Vault as 'bank_webhook_secret', and are
--     refused when the timestamp is more than five minutes from now.
--   * The signature is checked here, in the database, as for Paystack, so a
--     caller cannot claim a payment by calling the RPC directly.
--   * The amount and currency must match what NexG asked for, and the
--     collection must be the one NexG recorded for that payment.
--   * Every event is stored once (dedupe on the bank's event id).
--
-- Setup, once per environment (run in the SQL editor, never committed):
--   select vault.create_secret('<the same value as BANK_WEBHOOK_SECRET>', 'bank_webhook_secret');
--
-- Rollback:
--   drop function public.rpc_payment_bank_webhook(text, text, text),
--     public.rpc_payment_bank_started(text, text, text, text, text),
--     authz.require_bank_webhook_secret(text);
--   then re-run the previous definitions of fn_web_order_quote (20261128000100),
--   rpc_order_place_web (20261112000200) and rpc_payment_begin_order
--   (20260101015200). The enum value 'bank_transfer' cannot be dropped; it is
--   harmless once nothing offers it.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('payment.bank_collection_started', 'orders', 'info', true, 'Bank collection started'),
  ('payment.bank_unmatched', 'orders', 'high', true, 'Bank reported money paid against a collection NexG no longer expects')
on conflict (action) do nothing;

alter type public.order_payment_method add value if not exists 'bank_transfer';

-- ─────────────────────── checkout accepts bank_transfer as an online method
-- Each of these is the current definition with only the method list widened.

create or replace function public.fn_web_order_quote(p_payload jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant uuid := nullif(p_payload ->> 'merchant_id', '')::uuid;
  v_method text := coalesce(nullif(p_payload ->> 'payment_method', ''), 'card');
  m public.merchant;
  v_branch uuid;
  v_from extensions.geography;
  v_point extensions.geography;
  v_zone jsonb := null;
  v_distance jsonb;
  v_band smallint := 1;
  v_located boolean := false;
  v_wanted integer;
  v_found integer;
  v_lines jsonb;
  v_subtotal bigint;
  v_price jsonb;
  v_cash bigint;
  v_total bigint;
begin
  if v_merchant is null then
    return jsonb_build_object('ok', false, 'message', 'Which merchant is this basket for?');
  end if;

  select * into m from public.merchant where id = v_merchant;
  if not found or m.status <> 'live' then
    return jsonb_build_object('ok', false, 'message', 'This merchant is not taking orders.');
  end if;
  if m.accepting_orders is false then
    return jsonb_build_object('ok', false, 'message', m.trading_name || ' is not taking orders right now.');
  end if;

  if v_method not in ('card', 'mpesa_stk', 'bank_transfer', 'cash_on_delivery') then
    return jsonb_build_object('ok', false, 'message', 'Choose how you would like to pay.');
  end if;

  v_wanted := coalesce(jsonb_array_length(p_payload -> 'items'), 0);
  if v_wanted = 0 then
    return jsonb_build_object('ok', false, 'message', 'Your basket is empty.');
  end if;
  if v_wanted > 60 then
    return jsonb_build_object('ok', false, 'message', 'That is a lot for one order. Split it in two.');
  end if;

  /* Each line is priced from the catalogue row, at the running promotion's
     price when there is one, and a line that is not this merchant's, not on
     sale, or not priced is refused rather than quietly dropped. */
  select
    jsonb_agg(jsonb_build_object(
      'catalogue_item_id', i.id,
      'name', i.name,
      'quantity', q.quantity,
      'unit_price_cents', pp.price_kes::bigint * 100,
      'list_price_cents', i.price_kes::bigint * 100,
      'promotion_id', pp.promotion_id,
      'line_total_cents', pp.price_kes::bigint * 100 * q.quantity,
      'note', nullif(trim(q.note), ''),
      'age_restricted', i.age_restricted)),
    coalesce(sum(pp.price_kes::bigint * 100 * q.quantity), 0),
    count(*)
  into v_lines, v_subtotal, v_found
  from jsonb_to_recordset(p_payload -> 'items')
         as q(catalogue_item_id uuid, quantity integer, note text)
  join public.catalogue_item i
    on i.id = q.catalogue_item_id
   and i.merchant_id = v_merchant
   and i.available
   and i.price_kes is not null
  cross join lateral public.fn_item_promo_price(i.id, i.merchant_id, i.price_kes) pp
  where q.quantity between 1 and 50;

  if v_found is distinct from v_wanted then
    return jsonb_build_object('ok', false,
      'message', 'Something in your basket is no longer available. Review it and try again.');
  end if;

  select b.id, b.location into v_branch, v_from
    from public.merchant_branch b
   where b.merchant_id = v_merchant
   order by b.is_primary desc
   limit 1;

  if p_payload ? 'lat' and p_payload ? 'lng'
     and nullif(p_payload ->> 'lat', '') is not null
     and nullif(p_payload ->> 'lng', '') is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(
      (p_payload ->> 'lng')::float, (p_payload ->> 'lat')::float), 4326)::extensions.geography;
    v_zone := public.fn_zone_serviceable(v_point);
    if not coalesce((v_zone ->> 'ok')::boolean, false) then
      return jsonb_build_object('ok', false, 'message', v_zone ->> 'reason');
    end if;
    v_located := true;

    if v_from is not null then
      v_distance := public.fn_delivery_band(m.city_id, v_from, v_point);
      if not (v_distance ->> 'ok')::boolean then
        return jsonb_build_object('ok', false, 'message', v_distance ->> 'message');
      end if;
      v_band := (v_distance ->> 'band')::smallint;
    else
      select coalesce(z.delivery_band, 1::smallint) into v_band
        from public.zone z where z.id = nullif(v_zone ->> 'zone_id', '')::uuid;
      v_band := coalesce(v_band, 1::smallint);
    end if;
  end if;

  v_price := public.fn_price_order(m.city_id, m.category::text, v_subtotal, v_band, now(), m.id);
  if not (v_price ->> 'ok')::boolean then
    return jsonb_build_object('ok', false, 'message', v_price ->> 'message');
  end if;

  /* The cash-handling fee is for handling cash. */
  v_cash := case when v_method = 'cash_on_delivery'
                 then (v_price ->> 'cash_handling_cents')::bigint else 0 end;

  v_total := (v_price ->> 'subtotal_cents')::bigint
           + (v_price ->> 'delivery_fee_cents')::bigint
           + (v_price ->> 'service_fee_cents')::bigint
           + (v_price ->> 'small_basket_fee_cents')::bigint
           + v_cash;

  if v_method = 'cash_on_delivery' then
    if not m.pay_on_delivery then
      return jsonb_build_object('ok', false,
        'message', m.trading_name || ' does not take payment on delivery. Pay online instead.');
    end if;
    if m.pay_on_delivery_cap_kes is not null and v_total > m.pay_on_delivery_cap_kes::bigint * 100 then
      return jsonb_build_object('ok', false,
        'message', 'Payment on delivery is limited to KES ' || m.pay_on_delivery_cap_kes
          || ' for this merchant. Pay online for a larger order.');
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'merchant_id', m.id,
    'merchant_name', m.trading_name,
    'city_id', m.city_id,
    'branch_id', v_branch,
    'zone_id', case when v_zone is null then null else nullif(v_zone ->> 'zone_id', '') end,
    'located', v_located,
    'payment_method', v_method,
    'lines', v_lines,
    'subtotal_cents', (v_price ->> 'subtotal_cents')::bigint,
    'list_subtotal_cents', (select coalesce(sum((l ->> 'list_price_cents')::bigint * (l ->> 'quantity')::bigint), 0)
                              from jsonb_array_elements(v_lines) l),
    'delivery_fee_cents', (v_price ->> 'delivery_fee_cents')::bigint,
    'service_fee_cents', (v_price ->> 'service_fee_cents')::bigint,
    'small_basket_fee_cents', (v_price ->> 'small_basket_fee_cents')::bigint,
    'cash_handling_cents', v_cash,
    'total_cents', v_total,
    'commission_pct', (v_price ->> 'commission_pct')::numeric,
    'commission_cents', (v_price ->> 'commission_cents')::bigint,
    'pricing_version_ids', v_price -> 'pricing_version_ids',
    'has_age_restricted', exists (
      select 1 from jsonb_array_elements(v_lines) l where (l ->> 'age_restricted')::boolean),
    'currency', 'KES');
end;
$$;

revoke execute on function public.fn_web_order_quote(jsonb) from public, anon, authenticated;
grant execute on function public.fn_web_order_quote(jsonb) to service_role;

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
    'pay_online', (q ->> 'payment_method') in ('card', 'mpesa_stk', 'bank_transfer'));
end;
$$;

revoke execute on function public.rpc_order_place_web(jsonb) from public, anon;
grant execute on function public.rpc_order_place_web(jsonb) to authenticated;

create or replace function public.rpc_payment_begin_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_existing public.payment;
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_ref text;
  v_owed bigint;
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;

  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;

  /*
   * Definer, so row security did not run. This is that check,
   * done by hand: the guest who placed it, somebody who works for
   * the merchant, or staff. Without it the function answers "what
   * is owed on this order" to anybody who guesses an id.
   */
  if not (
    exists (select 1 from public.guest g
             where g.id = o.guest_id and g.user_id = v_uid)
    or authz.is_merchant_member(o.merchant_id)
    or authz.works_merchant(o.merchant_id)
    or authz.reaches_module('orders')
  ) then
    raise exception 'That order is not yours to pay for.' using errcode = '42501';
  end if;

  if o.payment_method not in ('mpesa_stk', 'card', 'bank_transfer') then
    raise exception 'That order is %, which is not paid online.',
      replace(o.payment_method::text, '_', ' ');
  end if;
  if o.payment_status in ('paid', 'collected') then
    raise exception 'That order is already paid.';
  end if;
  if o.stage in ('cancelled', 'refunded') then
    raise exception 'That order is %.', o.stage;
  end if;

  select * into v_existing from public.payment
   where order_id = p_order_id and state in ('pending', 'authorised')
     and (expires_at is null or expires_at > now())
   limit 1;

  if v_existing.id is not null then
    return jsonb_build_object(
      'ok', true, 'payment_id', v_existing.id, 'reference', v_existing.reference,
      'amount_cents', v_existing.amount_cents, 'currency', v_existing.currency,
      'authorization_url', v_existing.authorization_url, 'reused', true);
  end if;

  v_owed := o.total_cents
    - coalesce((select sum(p.amount_cents) from public.payment p
                 where p.order_id = p_order_id and p.state = 'paid'), 0);
  if v_owed <= 0 then
    raise exception 'Nothing is owed on that order.';
  end if;

  v_ref := public.fn_payment_reference();

  insert into public.payment (
    reference, intent, order_id, merchant_id, guest_id, city_id,
    amount_cents, currency, created_by, created_via, expires_at)
  values (
    v_ref, 'order', p_order_id, o.merchant_id, o.guest_id, o.city_id,
    v_owed, o.currency, v_uid,
    case when o.channel = 'manual' then 'desk' else 'guest_checkout' end,
    now() + interval '1 hour')
  returning id into v_id;

  return jsonb_build_object(
    'ok', true, 'payment_id', v_id, 'reference', v_ref,
    'amount_cents', v_owed, 'currency', o.currency,
    'order_reference', o.reference, 'reused', false);
end;
$$;

-- ─────────────────────────────────────────────── proof the web app holds

create function authz.require_bank_webhook_secret(p_secret text)
returns void
language plpgsql
stable security definer
set search_path = ''
as $$
declare
  v_expected text;
begin
  select nullif(trim(decrypted_secret), '') into v_expected
    from vault.decrypted_secrets where name = 'bank_webhook_secret';

  if v_expected is null or p_secret is null or octet_length(p_secret) > 4096
     or not authz.payment_proof_equal(extensions.digest(p_secret, 'sha256'),
                                      extensions.digest(v_expected, 'sha256')) then
    raise exception 'Bank verification failed.' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function authz.require_bank_webhook_secret(text)
  from public, anon, authenticated, service_role;

-- ──────────────────────────────────── the bank has opened a collection

-- Called by the web app's start route after the bank accepted the request.
-- The proof is the shared bank secret, which only the server holds, so a
-- browser cannot point a payment at a collection of its choosing.
create function public.rpc_payment_bank_started(
  p_reference text,
  p_provider text,
  p_collection_id text,
  p_checkout_url text,
  p_proof text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.payment;
  v_uid uuid := (select auth.uid());
  v_staff_id uuid := authz.staff_id();
begin
  if v_uid is null then
    raise exception 'Start a session first.' using errcode = '42501';
  end if;
  perform authz.require_bank_webhook_secret(p_proof);

  if p_provider is null or p_provider !~ '^bank_[a-z0-9_]{2,30}$' then
    raise exception 'Unknown bank provider.' using errcode = '22023';
  end if;
  if nullif(trim(p_collection_id), '') is null or length(p_collection_id) > 200 then
    raise exception 'The bank did not return a collection.' using errcode = '22023';
  end if;
  if p_checkout_url is null or p_checkout_url !~ '^https?://' or length(p_checkout_url) > 2048 then
    raise exception 'The bank did not return a page to approve the payment.' using errcode = '22023';
  end if;

  select * into p from public.payment where reference = p_reference for update;
  if not found or p.state not in ('pending', 'authorised') then
    raise exception 'No payment waiting on that reference.';
  end if;
  if not (p.created_by is not distinct from v_uid or authz.reaches_module('orders')) then
    raise exception 'That payment is not yours.' using errcode = '42501';
  end if;

  update public.payment
     set provider = p_provider, provider_ref = p_collection_id, channel = 'bank',
         authorization_url = p_checkout_url, state = 'authorised',
         authorised_at = now(), updated_at = now()
   where id = p.id;

  insert into public.payment_event
    (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
  values (p.id, p_provider, 'collection.started', 'started:' || p_collection_id, p_reference,
          jsonb_build_object('collection_id', p_collection_id),
          true, true, 'collection opened at the bank')
  on conflict (provider, dedupe_key) do nothing;

  perform audit.log(
    p_actor_type => case when v_staff_id is not null then 'staff'::public.actor_type else 'guest'::public.actor_type end,
    p_actor_id => coalesce(v_staff_id, p.guest_id, v_uid), p_module => 'orders',
    p_action => 'payment.bank_collection_started',
    p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
    p_after => jsonb_build_object('provider', p_provider, 'state', 'authorised'));

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.rpc_payment_bank_started(text, text, text, text, text) from public, anon;
grant execute on function public.rpc_payment_bank_started(text, text, text, text, text) to authenticated;

-- ──────────────────────────────────────────── the bank says what happened

-- A signed event from the bank: a webhook, or a status the web app fetched
-- from the bank (the bank signs those the same way). Header format:
--   t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
create function public.rpc_payment_bank_webhook(
  p_provider text,
  p_raw_body text,
  p_signature_header text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
  v_parts text[];
  v_payload jsonb;
  v_data jsonb;
  v_event_id text;
  v_reference text;
  v_collection text;
  v_status text;
  v_amount bigint;
  v_paid boolean;
  p public.payment;
  v_result jsonb;
begin
  if p_provider is null or p_provider !~ '^bank_[a-z0-9_]{2,30}$'
     or p_raw_body is null or octet_length(p_raw_body) > 1048576
     or p_signature_header is null then
    raise exception 'Bank verification failed.' using errcode = '42501';
  end if;

  v_parts := regexp_match(p_signature_header, '^t=([0-9]{9,12}),v1=([0-9a-f]{64})$');
  if v_parts is null then
    raise exception 'Bank verification failed.' using errcode = '42501';
  end if;

  select nullif(trim(decrypted_secret), '') into v_secret
    from vault.decrypted_secrets where name = 'bank_webhook_secret';

  if v_secret is null or not authz.payment_proof_equal(
       decode(v_parts[2], 'hex'),
       extensions.hmac(convert_to(v_parts[1] || '.' || p_raw_body, 'UTF8'),
                       convert_to(v_secret, 'UTF8'), 'sha256')) then
    raise exception 'Bank verification failed.' using errcode = '42501';
  end if;
  if abs(extract(epoch from now())::bigint - v_parts[1]::bigint) > 300 then
    raise exception 'Bank event is too old.' using errcode = '42501';
  end if;

  begin
    v_payload := p_raw_body::jsonb;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'unreadable');
  end;

  v_data := v_payload->'data';
  v_event_id := nullif(v_payload->>'id', '');
  v_reference := nullif(v_data->>'merchant_reference', '');
  v_collection := nullif(v_data->>'id', '');
  v_status := v_data->>'status';
  if v_event_id is null or v_reference is null or v_collection is null then
    return jsonb_build_object('ok', false, 'reason', 'incomplete_event');
  end if;
  if v_status is null or v_status not in ('succeeded', 'failed', 'expired', 'cancelled') then
    return jsonb_build_object('ok', true, 'ignored', true, 'status', v_status);
  end if;

  select * into p from public.payment
   where reference = v_reference and provider = p_provider for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_reference');
  end if;

  -- Banks retry, and NexG also fetches the latest event itself: one event,
  -- once. Checked under the payment's row lock, so two copies arriving
  -- together are handled one after the other.
  if exists (select 1 from public.payment_event
              where provider = p_provider and dedupe_key = 'bank:' || v_event_id) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p.provider_ref is distinct from v_collection then
    -- An older collection for this payment was replaced (the guest started
    -- again). If the bank says money moved on it anyway, that money is real
    -- and must reach a person: keep the event and raise it for finance.
    if v_status = 'succeeded' then
      insert into public.payment_event
        (payment_id, provider, event, dedupe_key, reference, payload, signature_ok, handled, handled_note)
      values (p.id, p_provider, 'bank.collection.succeeded', 'bank:' || v_event_id, v_reference,
              v_payload, true, false,
              'paid against replaced collection ' || v_collection || '; refund or apply by hand')
      on conflict (provider, dedupe_key) do nothing;
      perform audit.log(
        p_actor_type => 'system'::public.actor_type, p_module => 'orders',
        p_action => 'payment.bank_unmatched', p_actor_label => '[System] · payments',
        p_target_type => 'payment', p_target_id => p.id, p_city_id => p.city_id,
        p_severity => 'high',
        p_reason => 'The bank collected money on a collection this payment no longer uses.',
        p_after => jsonb_build_object('reference', v_reference, 'collection_id', v_collection,
                                      'amount_cents', v_data->'amount'));
    end if;
    return jsonb_build_object('ok', false, 'reason', 'collection_mismatch');
  end if;

  v_paid := v_status = 'succeeded';
  if v_paid then
    if coalesce(v_data->>'currency', '') <> p.currency then
      return jsonb_build_object('ok', false, 'reason', 'currency_mismatch');
    end if;
    if jsonb_typeof(v_data->'amount') is distinct from 'number'
       or v_data->>'amount' !~ '^[1-9][0-9]{0,17}$' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
    end if;
    v_amount := (v_data->>'amount')::bigint;
  end if;

  v_result := public.rpc_payment_webhook(
    p_event => 'bank.collection.' || v_status,
    p_reference => v_reference,
    p_dedupe_key => 'bank:' || v_event_id,
    p_signature_ok => true,
    p_payload => v_payload || jsonb_build_object(
      'gateway_response', coalesce(nullif(v_data->>'failure_reason', ''), 'bank collection ' || v_status)),
    p_paid => v_paid,
    p_provider_ref => v_collection,
    p_amount_cents => v_amount,
    p_channel => 'bank');

  -- The shared worker files events under its default provider; file this one
  -- under the bank it came from.
  update public.payment_event set provider = p_provider
   where provider = 'paystack' and dedupe_key = 'bank:' || v_event_id;

  if v_result->>'state' = 'paid' then
    update public.payment
       set provider_receipt = coalesce(nullif(v_data->>'bank_reference', ''), provider_receipt)
     where id = p.id;
  end if;
  return v_result;
end;
$$;

revoke execute on function public.rpc_payment_bank_webhook(text, text, text) from public;
grant execute on function public.rpc_payment_bank_webhook(text, text, text) to anon, authenticated;

insert into public.wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_payment_bank_webhook', 'Banks call in with no application session.',
   'The database checks the HMAC-SHA256 of "<timestamp>.<raw body>" with the Vault bank_webhook_secret, refuses events over five minutes old, and checks the collection, amount and currency before any payment changes.')
on conflict (function_name) do update set reason = excluded.reason, guarded_by = excluded.guarded_by;

-- ─────────────────── provider callbacks could not commit a paid payment

-- A paid payment posts to the ledger, and the ledger checks each transaction
-- balances in deferred constraint triggers that run at COMMIT. By then the
-- security-definer webhook function has returned, so the check ran as the
-- caller: anon for every bank, Paystack and M-Pesa callback, which has no
-- access to the ledger schema. The commit failed with "permission denied for
-- schema ledger" and the provider was left retrying. (Tests that roll back
-- never reach the commit, which is why this was not caught.) The check only
-- reads the ledger, so it runs as its owner. These are the only two deferred
-- triggers in the database.
alter function ledger.tg_txn_balances() security definer;
alter function ledger.tg_entry_balances() security definer;
revoke execute on function ledger.tg_txn_balances(), ledger.tg_entry_balances()
  from public, anon, authenticated;
