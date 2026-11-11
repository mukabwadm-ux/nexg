-- Merchants can read their orders through the API again.
--
-- rpc_order_read_api (20260101023100) is the read behind GET /v1/orders and
-- GET /v1/orders/{id}. It has failed on every call since it was written:
--
--   * Its page query ended with `min(p.created_at), min(p.id)`. Postgres has
--     no min() for uuid, so every call raised "function min(uuid) does not
--     exist" (42883) and the API answered 500.
--   * Once that was past, trimming the extra row used `(v_items - 0)`, which
--     deletes the first element of a jsonb array: the newest order, not the
--     surplus one.
--   * It then sliced the array with `[0:v_limit - 1]`, which jsonb does not
--     support, so any merchant with more orders than one page would fail.
--
-- The page is now numbered in SQL and only the first `limit` rows are kept,
-- with the cursor taken from the last row kept. The cursor comparison is the
-- row comparison (created_at, id) < (cursor), which is the same condition the
-- old one spelled out. Everything a caller can see is unchanged: the same
-- signature and arguments, the same order object, the same errors (42501 for
-- a key that may not read orders, 22023 for an order the merchant does not
-- have). The key still decides the merchant; the caller never names one.
-- `create or replace` keeps the owner; the grants are restated as they were.
--
-- Rollback: re-run the definition in 20260101023100_api_order_reads.sql
-- (which fails on every call, as described above).

create or replace function public.rpc_order_read_api(
  p_api_key text,
  p_order_id uuid default null,
  p_limit integer default 25,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key public.api_key;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_has_cursor boolean := p_cursor_created_at is not null and p_cursor_id is not null;
  v_items jsonb;
  v_found integer;
  v_last jsonb;
begin
  -- The credential: the key decides the merchant, and only merchant_read reads.
  select k.* into v_key
  from public.api_key k
  where k.key_hash = encode(sha256(convert_to(p_api_key, 'UTF8')), 'hex')
    and k.state = 'active'
    and (k.expires_at is null or k.expires_at > now());

  if not found then
    raise exception 'That API key is not valid.' using errcode = '42501';
  end if;

  if not ('merchant_read'::public.api_credential_scope = any (v_key.scopes)) then
    raise exception 'This key cannot read a merchant''s orders.' using errcode = '42501';
  end if;

  if v_key.merchant_id is null
     or not exists (select 1 from public.merchant m where m.id = v_key.merchant_id) then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  /*
   * One order, or a page of them, through the same shape builder, so a
   * single order and a list item are the same object. A page fetches one
   * row more than it returns; that row only says there is a next page.
   */
  with page as (
    select
      o.id,
      o.reference,
      o.stage,
      o.payment_method,
      o.payment_status,
      o.currency,
      o.total_cents,
      o.scheduled_for,
      o.dropoff_label,
      o.created_at,
      o.delivery_context,
      coalesce(i.quantity, 1) as quantity,
      row_number() over (order by o.created_at desc, o.id desc) as n
    from public.order o
    left join lateral (
      select sum(oi.quantity) as quantity
      from public.order_item oi
      where oi.order_id = o.id and oi.removed_at is null
    ) i on true
    where o.merchant_id = v_key.merchant_id
      and (
        (p_order_id is not null and o.id = p_order_id)
        or (
          p_order_id is null
          and (not v_has_cursor or (o.created_at, o.id) < (p_cursor_created_at, p_cursor_id))
        )
      )
    order by o.created_at desc, o.id desc
    limit case when p_order_id is not null then 1 else v_limit + 1 end
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'order_id', p.id,
          'reference', p.reference,
          'service', coalesce(p.delivery_context ->> 'service', ''),
          'quantity', p.quantity,
          'stage', p.stage,
          'payment_method', p.payment_method,
          'payment_status', p.payment_status,
          'currency', p.currency,
          'total_cents', p.total_cents,
          'scheduled_for', p.scheduled_for,
          'pickup_label', p.delivery_context ->> 'pickup_label',
          'dropoff_label', p.dropoff_label,
          'created_at', p.created_at
        ) order by p.n
      ) filter (where p.n <= v_limit),
      '[]'::jsonb
    ),
    count(*)
  into v_items, v_found
  from page p;

  if p_order_id is not null then
    if v_found = 0 then
      raise exception 'That order does not exist.' using errcode = '22023';
    end if;
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  if v_found <= v_limit then
    return jsonb_build_object('ok', true, 'items', v_items, 'next_cursor', null);
  end if;

  -- The next page starts after the last order kept on this one.
  v_last := v_items -> (v_limit - 1);
  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'next_cursor', jsonb_build_object(
      'created_at', v_last -> 'created_at',
      'id', v_last -> 'order_id'
    )
  );
end;
$$;

comment on function public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid) is
  'Read a merchant''s bookings through the API. The key names the merchant; the caller never does.';

revoke execute on function public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid) to authenticated, service_role;
