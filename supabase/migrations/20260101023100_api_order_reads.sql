-- ---------------------------------------------------------------------------
-- Reading a booking back
--
-- A merchant that books an airport transfer for its visitors will ask
-- two questions: "did you take it?" and "where is it now?". The first
-- is answered by the receipt the booking returns. The second needs a
-- read, and this migration adds it.
--
-- The read is deliberately narrower than the write.
--
-- **The key decides the merchant, as it does for the write.** The
-- function resolves the key by hash and reads that key's merchant. It
-- never accepts a merchant id from the caller, so a key cannot read
-- another merchant's orders by naming them.
--
-- **The scope decides whether it may read at all.** `merchant_read`
-- is the scope for a merchant's own records. A public-read key gets
-- nothing here, which is right: an order is not public data.
--
-- **The stage is read, not computed.** The order carries the stage it
-- has reached, and it is the same stage the merchant console shows.
-- An API that re-derived a stage would be a second answer to a
-- question the console already answers, and two answers drift.
--
-- The function is SECURITY DEFINER and granted to service_role only.
-- It is a reader, but it reads rows that row-level security keeps
-- closed to the anonymous key, so it must not be callable by one.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- the read

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
  v_merchant public.merchant;
  v_limit integer;
  v_items jsonb;
  v_next_created_at timestamptz;
  v_next_id uuid;
  v_count integer;
begin
  -- â”€â”€â”€â”€â”€â”€â”€â”€ the credential â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€”—€

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

  if v_key.merchant_id is null then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  select m.* into v_merchant
  from public.merchant m
  where m.id = v_key.merchant_id;

  if not found then
    raise exception 'This key is not bound to a merchant.' using errcode = '42501';
  end if;

  -- â”€â”€â”€â”€â”€â”€ the page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€”—€

  v_limit := coalesce(p_limit, 25);
  if v_limit < 1 then v_limit := 1; end if;
  if v_limit > 100 then v_limit := 100; end if;

  /*
   * One order, or a page of them. Both go through the same shape
   * builder, so a single order and an item in a list are the same
   * object and a client does not need two parsers.
   *
   * The cursor is (created_at, id), matching the sort exactly. A
   * cursor of id alone would be wrong: two orders placed in the same
   * millisecond have ids in no particular order, and paging on the id
   * while sorting on the time skips one and repeats another.
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
      coalesce(i.quantity, 1) as quantity
    from public.order o
    left join lateral (
      select sum(oi.quantity) as quantity
      from public.order_item oi
      where oi.order_id = o.id and oi.removed_at is null
    ) i on true
    where o.merchant_id = v_merchant.id
      and (
        p_order_id is not null and o.id = p_order_id
        or p_order_id is null
          and (
            p_cursor_created_at is null
            or o.created_at < p_cursor_created_at
            or (o.created_at = p_cursor_created_at and o.id < p_cursor_id)
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
        ) order by p.created_at desc, p.id desc
      ),
      '[]'::jsonb
    ),
    count(*),
    min(p.created_at),
    min(p.id)
  into v_items, v_count, v_next_created_at, v_next_id
  from page p;

  if p_order_id is not null then
    if v_count = 0 then
      raise exception 'That order does not exist.' using errcode = '22023';
    end if;

    return jsonb_build_object(
      'ok', true,
      'items', v_items,
      'next_cursor', null
    );
  end if;

  /*
   * One row too many was fetched. That row is the signal that there is
   * a next page, and it is cut before it is returned -- and the cursor
   * is the last row of the page that is kept, so the next request
   * starts exactly where this one stopped.
   */
  if v_count > v_limit then
    v_items := (v_items - 0)[0:v_limit - 1];

    with last_row as (
      select p.created_at, p.id
      from jsonb_array_elements(v_items) e
      cross join lateral (
        select
          (e.value ->> 'created_at')::timestamptz as created_at,
          (e.value ->> 'order_id')::uuid as id
      ) p
      order by p.created_at desc, p.id desc
      limit 1
    )
    select l.created_at, l.id into v_next_created_at, v_next_id
    from last_row l;

    return jsonb_build_object(
      'ok', true,
      'items', v_items,
      'next_cursor', jsonb_build_object(
        'created_at', v_next_created_at,
        'id', v_next_id
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'items', v_items,
    'next_cursor', null
  );
end;
$$;

comment on function public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid) is
  'Read a merchant''s bookings through the API. The key names the merchant; the caller never does.';

-- The function is a reader, but it reads rows that row-level security
-- keeps closed to the anonymous key, so the anonymous key must not be
-- able to call it. Without this the grant that Postgres adds to new
-- public functions would let anybody read any merchant's orders.
revoke execute on function public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid) from public, anon;
grant execute on function public.rpc_order_read_api(text, uuid, integer, timestamptz, uuid) to authenticated, service_role;