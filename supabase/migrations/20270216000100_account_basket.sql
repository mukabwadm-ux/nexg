-- One basket per account, shared by the website and every app (shared
-- services D4, approved by the owner on 22 Nov 2026).
--
-- Before this, each client kept its own basket: the website in the browser
-- (localStorage), the phone apps on the device. A basket started on the phone
-- was not there on the website, and the other way round. Now the basket lives
-- here, against the sign-in, and every client reads and writes it through the
-- four functions below. Guests' temporary (anonymous) sessions have a basket
-- too, so a guest who later makes their sign-in permanent keeps it.
--
-- The rules:
--   * One shop per basket, as on the website: a rider collects from one place.
--     Writing lines from another shop replaces the basket.
--   * A line is the same shape as an item in rpc_order_quote_web's
--     p_payload.items: catalogue_item_id, quantity, and optionally variant_id,
--     options, note and message. So a client can send the basket's lines to
--     checkout as they are. Choices, stock and prices are checked by the quote,
--     not here; the basket keeps what the customer picked.
--   * Only things that are bought (catalogue_item.kind = 'buy') from that shop
--     are kept. Other lines are dropped without an error, so an item removed
--     from the menu does not stop the customer saving the rest.
--   * At most 60 lines, the quote's limit; quantity 1 to 50 per line.
--   * Signing in merges: rpc_basket_merge adds the basket the customer built
--     while signed out. Same shop: the lines are added together. Another shop:
--     the signed-out basket wins, because it is what they were just doing.
--   * Placing an order from a shop empties the caller's basket for that shop
--     (trigger order_clears_basket), whichever client placed it.
--
-- Read and written only through the functions; the tables have no grants.
-- Edits are not audited (wiring_audit_exempt): a basket is not a commitment,
-- and the order that comes from it is audited when it is placed.
--
-- Rollback:
--   drop trigger if exists order_clears_basket on public.order;
--   drop function if exists public.tg_order_clears_basket();
--   drop function if exists public.rpc_basket_get();
--   drop function if exists public.rpc_basket_put(uuid, jsonb);
--   drop function if exists public.rpc_basket_merge(uuid, jsonb);
--   drop function if exists public.rpc_basket_clear();
--   drop function if exists public.fn_basket_read(uuid);
--   drop function if exists public.fn_basket_clean_lines(uuid, jsonb);
--   drop table if exists public.basket_line;
--   drop table if exists public.basket;
--   delete from public.wiring_audit_exempt where function_name like 'rpc_basket_%';

create table public.basket (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  updated_at  timestamptz not null default now()
);

create index basket_merchant_idx on public.basket (merchant_id);

create table public.basket_line (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.basket (user_id) on delete cascade,
  position          integer not null,
  catalogue_item_id uuid not null references public.catalogue_item (id) on delete cascade,
  variant_id        text,
  options           jsonb,
  note              text,
  message           text,
  quantity          integer not null,
  constraint basket_line_quantity check (quantity between 1 and 50),
  constraint basket_line_note_length check (char_length(note) <= 500),
  constraint basket_line_message_length check (char_length(message) <= 500),
  constraint basket_line_options_size check (options is null or pg_column_size(options) <= 4000)
);

create index basket_line_user_idx on public.basket_line (user_id, position);
create index basket_line_item_idx on public.basket_line (catalogue_item_id);

alter table public.basket enable row level security;
alter table public.basket_line enable row level security;
revoke all on public.basket, public.basket_line from public, anon, authenticated;

comment on table public.basket is
  'One basket per sign-in (D4), one shop each. Read and written only through rpc_basket_*.';
comment on table public.basket_line is
  'A basket line, in the shape of an rpc_order_quote_web item.';

-- ── Cleaning incoming lines ─────────────────────────────────────────────────
-- Returns the lines to keep, in order, each with only the known keys. Lines
-- for another shop, for something not bought, or with a bad id or quantity
-- are dropped. Raises only when the payload is not a list or is too long.
create or replace function public.fn_basket_clean_lines(p_merchant_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_out jsonb;
begin
  if p_lines is null or jsonb_typeof(p_lines) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'The basket must be a list of lines.' using errcode = 'P0001', hint = 'basket_not_a_list';
  end if;
  if jsonb_array_length(p_lines) > 60 then
    raise exception 'That is a lot for one basket. Keep it to 60 lines.'
      using errcode = 'P0001', hint = 'basket_too_long';
  end if;

  select coalesce(jsonb_agg(
           jsonb_strip_nulls(jsonb_build_object(
             'catalogue_item_id', i.id,
             'quantity', least(l.qty, 50),
             'variant_id', nullif(trim(l.line ->> 'variant_id'), ''),
             'options', case when jsonb_typeof(l.line -> 'options') in ('array', 'object')
                             then l.line -> 'options' end,
             'note', left(nullif(trim(l.line ->> 'note'), ''), 500),
             'message', left(nullif(trim(l.line ->> 'message'), ''), 500)))
           order by l.n), '[]'::jsonb)
    into v_out
    from (select e.line, e.n,
                 case when e.line ->> 'catalogue_item_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                      then (e.line ->> 'catalogue_item_id')::uuid end as item_id,
                 case when jsonb_typeof(e.line -> 'quantity') = 'number'
                       and (e.line ->> 'quantity') ~ '^[0-9]{1,6}$'
                      then (e.line ->> 'quantity')::integer end as qty
            from jsonb_array_elements(p_lines) with ordinality as e(line, n)
           where jsonb_typeof(e.line) = 'object') l
    join public.catalogue_item i
      on i.id = l.item_id
     and i.merchant_id = p_merchant_id
     and i.kind = 'buy'
   where l.qty >= 1
     and (l.line -> 'options' is null
          or jsonb_typeof(l.line -> 'options') not in ('array', 'object')
          or pg_column_size(l.line -> 'options') <= 4000);

  return v_out;
end;
$$;

revoke execute on function public.fn_basket_clean_lines(uuid, jsonb) from public, anon, authenticated;

-- ── Reading ─────────────────────────────────────────────────────────────────
-- The basket as every client sees it. Each line carries the quote's keys plus
-- what a screen needs: line_id, name, price_kes (the menu price, whole
-- shillings; checkout re-prices), photo_path and available.
create or replace function public.fn_basket_read(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
              'merchant', jsonb_build_object('id', m.id, 'name', m.trading_name),
              'updated_at', b.updated_at,
              'lines', coalesce((
                select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                         'line_id', bl.id,
                         'catalogue_item_id', bl.catalogue_item_id,
                         'quantity', bl.quantity,
                         'variant_id', bl.variant_id,
                         'options', bl.options,
                         'note', bl.note,
                         'message', bl.message,
                         'name', i.name,
                         'price_kes', i.price_kes,
                         'photo_path', i.photo_path))
                         /* sold_out comes from 20270129000100; read through
                            to_jsonb so this file runs with or without it. */
                         || jsonb_build_object('available', i.available
                              and not coalesce((to_jsonb(i) ->> 'sold_out')::boolean, false))
                         order by bl.position)
                  from public.basket_line bl
                  join public.catalogue_item i on i.id = bl.catalogue_item_id
                 where bl.user_id = b.user_id), '[]'::jsonb))
       from public.basket b
       join public.merchant m on m.id = b.merchant_id
      where b.user_id = p_user_id),
    jsonb_build_object('merchant', null, 'updated_at', null, 'lines', '[]'::jsonb));
$$;

revoke execute on function public.fn_basket_read(uuid) from public, anon, authenticated;

create or replace function public.rpc_basket_get()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to keep a basket.' using errcode = 'P0001', hint = 'basket_needs_session';
  end if;
  return public.fn_basket_read(auth.uid());
end;
$$;

-- ── Writing ─────────────────────────────────────────────────────────────────
-- Replaces the basket with these lines from this shop. No shop, or no lines
-- left after cleaning, empties it.
create or replace function public.rpc_basket_put(p_merchant_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_lines jsonb;
begin
  if v_user is null then
    raise exception 'Sign in to keep a basket.' using errcode = 'P0001', hint = 'basket_needs_session';
  end if;

  v_lines := case when p_merchant_id is null then '[]'::jsonb
                  else public.fn_basket_clean_lines(p_merchant_id, p_lines) end;

  if jsonb_array_length(v_lines) = 0 then
    delete from public.basket where user_id = v_user;
    return public.fn_basket_read(v_user);
  end if;

  insert into public.basket (user_id, merchant_id, updated_at)
  values (v_user, p_merchant_id, now())
  on conflict (user_id) do update
    set merchant_id = excluded.merchant_id, updated_at = excluded.updated_at;

  delete from public.basket_line where user_id = v_user;
  insert into public.basket_line (user_id, position, catalogue_item_id, variant_id, options, note, message, quantity)
  select v_user, l.n, (l.line ->> 'catalogue_item_id')::uuid, l.line ->> 'variant_id',
         l.line -> 'options', l.line ->> 'note', l.line ->> 'message', (l.line ->> 'quantity')::integer
    from jsonb_array_elements(v_lines) with ordinality as l(line, n);

  return public.fn_basket_read(v_user);
end;
$$;

-- Adds the basket built while signed out to the account's basket, at sign-in.
-- The answer is the basket plus 'outcome':
--   'added'    lines added to the account's basket from the same shop (or it was empty);
--   'replaced' the account's basket was from another shop and is replaced;
--   'kept'     nothing usable came in, the account's basket is unchanged.
create or replace function public.rpc_basket_merge(p_merchant_id uuid, p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_incoming jsonb;
  v_current public.basket;
  v_merged jsonb;
begin
  if v_user is null then
    raise exception 'Sign in to keep a basket.' using errcode = 'P0001', hint = 'basket_needs_session';
  end if;

  v_incoming := case when p_merchant_id is null then '[]'::jsonb
                     else public.fn_basket_clean_lines(p_merchant_id, p_lines) end;
  if jsonb_array_length(v_incoming) = 0 then
    return public.fn_basket_read(v_user) || jsonb_build_object('outcome', 'kept');
  end if;

  select * into v_current from public.basket where user_id = v_user for update;

  if not found then
    return public.rpc_basket_put(p_merchant_id, v_incoming) || jsonb_build_object('outcome', 'added');
  end if;
  if v_current.merchant_id <> p_merchant_id then
    return public.rpc_basket_put(p_merchant_id, v_incoming) || jsonb_build_object('outcome', 'replaced');
  end if;

  /* Same shop: a line that matches one already there (same item, variant,
     options, note and message) adds its quantity; the rest are appended. */
  with existing as (
    select bl.position as n,
           jsonb_strip_nulls(jsonb_build_object(
             'catalogue_item_id', bl.catalogue_item_id, 'variant_id', bl.variant_id,
             'options', bl.options, 'note', bl.note, 'message', bl.message)) as k,
           bl.quantity as q
      from public.basket_line bl
     where bl.user_id = v_user),
  incoming as (
    select 100000 + l.n as n, l.line - 'quantity' as k, (l.line ->> 'quantity')::integer as q
      from jsonb_array_elements(v_incoming) with ordinality as l(line, n)),
  combined as (
    select min(n) as n, k, least(sum(q), 50)::integer as q
      from (select * from existing union all select * from incoming) a
     group by k)
  select jsonb_agg(k || jsonb_build_object('quantity', q) order by n)
    into v_merged
    from (select * from combined order by n limit 60) c;

  return public.rpc_basket_put(p_merchant_id, v_merged) || jsonb_build_object('outcome', 'added');
end;
$$;

create or replace function public.rpc_basket_clear()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to keep a basket.' using errcode = 'P0001', hint = 'basket_needs_session';
  end if;
  delete from public.basket where user_id = auth.uid();
  return public.fn_basket_read(auth.uid());
end;
$$;

revoke execute on function public.rpc_basket_get() from public, anon;
revoke execute on function public.rpc_basket_put(uuid, jsonb) from public, anon;
revoke execute on function public.rpc_basket_merge(uuid, jsonb) from public, anon;
revoke execute on function public.rpc_basket_clear() from public, anon;
grant execute on function public.rpc_basket_get() to authenticated;
grant execute on function public.rpc_basket_put(uuid, jsonb) to authenticated;
grant execute on function public.rpc_basket_merge(uuid, jsonb) to authenticated;
grant execute on function public.rpc_basket_clear() to authenticated;

-- ── Placing an order empties the basket for that shop ───────────────────────
create or replace function public.tg_order_clears_basket()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    delete from public.basket
     where user_id = auth.uid()
       and merchant_id = new.merchant_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_order_clears_basket() from public, anon, authenticated;

create trigger order_clears_basket
  after insert on public.order
  for each row execute function public.tg_order_clears_basket();

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_basket_put',
   'A basket is not a commitment; the order placed from it is audited by rpc_order_place_web.',
   'basket, basket_line'),
  ('rpc_basket_merge',
   'A basket is not a commitment; the order placed from it is audited by rpc_order_place_web.',
   'basket, basket_line'),
  ('rpc_basket_clear',
   'A basket is not a commitment; the order placed from it is audited by rpc_order_place_web.',
   'basket, basket_line')
on conflict (function_name) do nothing;
