-- Product variants: versions of one item that each have their own price and
-- stock (size and colour, storage and colour, pack size).
--
-- The merchant JSON already asks for them: the offering price question
-- Q_OFFERING_PRICE has mode 'variant', and specialty needs name "size",
-- "colour" or "device-type" variants. Until now nothing stored one.
--
-- Choice groups (modifier_group, 20270109000400) stay for things added to the
-- same product: extras, sides, a message. A variant replaces the product:
--
-- 1. catalogue_attribute: up to three per item ("Size", "Colour"), each with
--    its values in catalogue_attribute_value ("M", "L"; "Red", "Blue").
-- 2. catalogue_variant: one row per combination the shop sells, with its own
--    price (whole KES, like catalogue_item.price_kes), in stock or not, an
--    optional count, a shop code (sku) and a photo.
-- 3. catalogue_variant_public: what the app reads, per item: the attributes
--    and values, and every variant with its price and whether it can be
--    bought. catalogue_public gains has_variants.
-- 4. Checkout: a line carries variant_id. An item with variants needs one;
--    the line is priced at the variant's price (promotions apply to it), a
--    sold-out or missing variant is refused with a message, and the order
--    keeps variant_id and its label ("M / Red"). A counted variant is set
--    aside when the order is placed and put back if the order is cancelled.
-- 5. rpc_merchant_item_variants_save: the shop saves an item's attributes and
--    variant grid in one go (Menu page).
--
-- Rollback: re-run fn_web_order_quote, rpc_order_place_web and
-- catalogue_public from 20270109000400; drop the trigger, the functions,
-- catalogue_variant_public, the three tables and the two order_item columns.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('catalogue.item_variants_saved', 'merchants', 'info', true,
   'A shop saved the versions of an item, with their prices and stock')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 1–2. tables

create table public.catalogue_attribute (
  id       uuid primary key default gen_random_uuid(),
  item_id  uuid not null references public.catalogue_item(id) on delete cascade,
  name     text not null check (char_length(trim(name)) between 1 and 40),
  sort     smallint not null default 0,
  unique (item_id, name)
);

create table public.catalogue_attribute_value (
  id            uuid primary key default gen_random_uuid(),
  attribute_id  uuid not null references public.catalogue_attribute(id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 40),
  sort          smallint not null default 0,
  unique (attribute_id, name)
);

create table public.catalogue_variant (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references public.catalogue_item(id) on delete cascade,
  -- One value per attribute, in the attributes' order.
  value_ids    uuid[] not null check (cardinality(value_ids) between 1 and 3),
  price_kes    integer not null check (price_kes >= 0 and price_kes <= 10000000),
  available    boolean not null default true,
  -- Null when the shop doesn't keep counts.
  stock_count  integer check (stock_count is null or stock_count >= 0),
  sku          text check (sku is null or char_length(sku) <= 64),
  photo_path   text check (photo_path is null or char_length(photo_path) <= 512),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index catalogue_variant_one_per_combination
  on public.catalogue_variant (item_id, value_ids) where archived_at is null;
create index catalogue_attribute_item_idx on public.catalogue_attribute (item_id, sort);
create index catalogue_variant_item_idx on public.catalogue_variant (item_id) where archived_at is null;

comment on table public.catalogue_variant is
  'Versions of a catalogue item with their own price and stock: one value per attribute (value_ids, in attribute order).';
comment on column public.catalogue_variant.stock_count is
  'How many are left, when the shop counts them. Placing an order takes from it; cancelling puts it back.';

alter table public.catalogue_attribute enable row level security;
alter table public.catalogue_attribute_value enable row level security;
alter table public.catalogue_variant enable row level security;

-- The shop's team and merchant staff read their own; the public reads catalogue_variant_public.
create policy catalogue_attribute_read on public.catalogue_attribute
  for select to authenticated
  using (exists (select 1 from public.catalogue_item i
                  where i.id = item_id
                    and (authz.is_merchant_member(i.merchant_id) or authz.can_manage_merchants(null))));
create policy catalogue_attribute_value_read on public.catalogue_attribute_value
  for select to authenticated
  using (exists (select 1 from public.catalogue_attribute a
                   join public.catalogue_item i on i.id = a.item_id
                  where a.id = attribute_id
                    and (authz.is_merchant_member(i.merchant_id) or authz.can_manage_merchants(null))));
create policy catalogue_variant_read on public.catalogue_variant
  for select to authenticated
  using (exists (select 1 from public.catalogue_item i
                  where i.id = item_id
                    and (authz.is_merchant_member(i.merchant_id) or authz.can_manage_merchants(null))));

revoke all on public.catalogue_attribute, public.catalogue_attribute_value, public.catalogue_variant
  from public, anon;
grant select on public.catalogue_attribute, public.catalogue_attribute_value, public.catalogue_variant
  to authenticated;

alter table public.order_item
  add column variant_id uuid references public.catalogue_variant(id) on delete set null,
  add column variant_label text;

comment on column public.order_item.variant_label is
  'The version bought, as the customer saw it ("M / Red"). Kept even if the shop later changes its versions.';

-- ═══════════════════════════════════════════════ 3. what the app reads

/* An item's attribute values in order, as "M / Red". */
create or replace function public.fn_variant_label(p_value_ids uuid[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg(av.name, ' / ' order by a.sort, a.name)
    from public.catalogue_attribute_value av
    join public.catalogue_attribute a on a.id = av.attribute_id
   where av.id = any (p_value_ids);
$$;
revoke execute on function public.fn_variant_label(uuid[]) from public, anon, authenticated;

create view public.catalogue_variant_public
with (security_invoker = false)
as
select
  cp.id as item_id,
  coalesce((select jsonb_agg(jsonb_build_object(
                     'id', a.id, 'name', a.name,
                     'values', coalesce((select jsonb_agg(jsonb_build_object('id', av.id, 'name', av.name)
                                                          order by av.sort, av.name)
                                           from public.catalogue_attribute_value av
                                          where av.attribute_id = a.id), '[]'::jsonb))
                     order by a.sort, a.name)
              from public.catalogue_attribute a where a.item_id = cp.id), '[]'::jsonb) as attributes,
  (select jsonb_agg(jsonb_build_object(
            'id', v.id,
            'value_ids', to_jsonb(v.value_ids),
            'label', (select string_agg(av.name, ' / ' order by a.sort, a.name)
                        from public.catalogue_attribute_value av
                        join public.catalogue_attribute a on a.id = av.attribute_id
                       where av.id = any (v.value_ids)),
            'price_cents', v.price_kes::bigint * 100,
            'available', v.available and coalesce(v.stock_count, 1) > 0,
            'photo_path', v.photo_path)
          order by v.price_kes, v.created_at)
     from public.catalogue_variant v
    where v.item_id = cp.id and v.archived_at is null) as variants,
  (select min(v.price_kes)::bigint * 100 from public.catalogue_variant v
    where v.item_id = cp.id and v.archived_at is null
      and v.available and coalesce(v.stock_count, 1) > 0) as price_from_cents
from public.catalogue_public cp
where exists (select 1 from public.catalogue_variant v
               where v.item_id = cp.id and v.archived_at is null);

comment on view public.catalogue_variant_public is
  'Per public item with versions: attributes [{id, name, values:[{id, name}]}], variants [{id, value_ids, label, price_cents, available, photo_path}] and the lowest price you can buy at. A combination with no variant row is not sold.';

grant select on public.catalogue_variant_public to anon, authenticated;

-- ═══════════════════════════════════════════════ 4. checkout

/* The version chosen on one line. Items without versions take none.
   Returns {ok, variant_id, price_kes, label, stock_count} or {ok:false, message}. */
create or replace function public.fn_line_variant(p_item_id uuid, p_variant text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.catalogue_variant;
  v_names text;
  v_label text;
begin
  if not exists (select 1 from public.catalogue_variant
                  where item_id = p_item_id and archived_at is null) then
    if nullif(p_variant, '') is not null then
      return jsonb_build_object('ok', false, 'message', 'That version is no longer sold. Add the item again.');
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if nullif(p_variant, '') is null then
    select string_agg(a.name, ' and ' order by a.sort, a.name) into v_names
      from public.catalogue_attribute a where a.item_id = p_item_id;
    return jsonb_build_object('ok', false, 'message', 'Choose ' || coalesce(v_names, 'a version') || ' first.');
  end if;
  if p_variant !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return jsonb_build_object('ok', false, 'message', 'That version is no longer sold. Add the item again.');
  end if;

  select * into v from public.catalogue_variant
   where id = p_variant::uuid and item_id = p_item_id and archived_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'That version is no longer sold. Add the item again.');
  end if;
  v_label := public.fn_variant_label(v.value_ids);
  if not v.available or v.stock_count = 0 then
    return jsonb_build_object('ok', false, 'message', coalesce(v_label, 'That version') || ' is sold out.');
  end if;
  return jsonb_build_object('ok', true, 'variant_id', v.id, 'price_kes', v.price_kes,
                            'label', v_label, 'stock_count', v.stock_count);
end;
$$;
revoke execute on function public.fn_line_variant(uuid, text) from public, anon, authenticated;

/* A cancelled order puts back what it set aside. */
create or replace function public.tg_order_variant_restock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.catalogue_variant v
     set stock_count = v.stock_count + s.quantity, updated_at = now()
    from (select oi.variant_id, sum(oi.quantity)::integer as quantity
            from public.order_item oi
           where oi.order_id = new.id and oi.variant_id is not null
           group by oi.variant_id) s
   where v.id = s.variant_id and v.stock_count is not null;
  return new;
end;
$$;
revoke execute on function public.tg_order_variant_restock() from public, anon, authenticated;

create trigger order_variant_restock
after update of stage on public.order
for each row
when (new.stage = 'cancelled' and old.stage is distinct from 'cancelled')
execute function public.tg_order_variant_restock();

-- ═══════════════════════════════════════════════ 5. the shop saves the grid

create or replace function public.rpc_merchant_item_variants_save(p_item_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  i public.catalogue_item;
  a jsonb;
  vr jsonb;
  v_attr uuid;
  v_attrs uuid[] := '{}';
  v_keep_values uuid[] := '{}';
  v_keep_variants uuid[] := '{}';
  v_seen text[] := '{}';
  v_value_ids uuid[];
  v_value uuid;
  v_names text[];
  v_n integer;
  v_k integer;
  v_variant uuid;
  v_price integer;
  v_stock integer;
begin
  select * into i from public.catalogue_item where id = p_item_id;
  if v_uid is null or not found or not authz.is_merchant_member(i.merchant_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if i.kind <> 'buy' then
    raise exception 'Versions are for items customers buy. This item is booked.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_payload -> 'attributes', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_payload -> 'variants', '[]'::jsonb)) <> 'array' then
    raise exception 'Send attributes and variants as lists.' using errcode = '22023';
  end if;
  v_n := coalesce(jsonb_array_length(p_payload -> 'attributes'), 0);
  if v_n > 3 then
    raise exception 'Use at most three things that vary, for example size, colour and material.' using errcode = '22023';
  end if;
  if v_n > 0 and coalesce(jsonb_array_length(p_payload -> 'variants'), 0) = 0 then
    raise exception 'Add at least one version with its price.' using errcode = '22023';
  end if;
  if coalesce(jsonb_array_length(p_payload -> 'variants'), 0) > 300 then
    raise exception 'That is more than 300 versions. Split the item.' using errcode = '22023';
  end if;

  -- Attributes and their values, matched by name; ones left out are removed.
  v_k := 0;
  for a in select * from jsonb_array_elements(coalesce(p_payload -> 'attributes', '[]'::jsonb)) loop
    v_k := v_k + 1;
    if nullif(trim(a ->> 'name'), '') is null then
      raise exception 'Name each thing that varies, for example Size.' using errcode = '22023';
    end if;
    if jsonb_typeof(a -> 'values') is distinct from 'array' or jsonb_array_length(a -> 'values') = 0 then
      raise exception 'Give % at least one value.', trim(a ->> 'name') using errcode = '22023';
    end if;
    insert into public.catalogue_attribute (item_id, name, sort)
    values (p_item_id, trim(a ->> 'name'), v_k)
    on conflict (item_id, name) do update set sort = excluded.sort
    returning id into v_attr;
    v_attrs := v_attrs || v_attr;
    declare v_j integer := 0; v_text text;
    begin
      for v_text in select trim(x) from jsonb_array_elements_text(a -> 'values') x loop
        v_j := v_j + 1;
        if v_text = '' then
          raise exception 'Every value of % needs a name.', trim(a ->> 'name') using errcode = '22023';
        end if;
        insert into public.catalogue_attribute_value (attribute_id, name, sort)
        values (v_attr, v_text, v_j)
        on conflict (attribute_id, name) do update set sort = excluded.sort
        returning id into v_value;
        v_keep_values := v_keep_values || v_value;
      end loop;
    end;
  end loop;

  -- Variants, one value per attribute in order, matched by their values.
  for vr in select * from jsonb_array_elements(coalesce(p_payload -> 'variants', '[]'::jsonb)) loop
    select array_agg(trim(x) order by n) into v_names
      from jsonb_array_elements_text(vr -> 'values') with ordinality as t(x, n);
    if coalesce(cardinality(v_names), 0) <> v_n then
      raise exception 'Each version needs one value for every thing that varies.' using errcode = '22023';
    end if;
    v_value_ids := '{}';
    for v_k in 1 .. v_n loop
      select av.id into v_value
        from public.catalogue_attribute_value av
       where av.attribute_id = v_attrs[v_k] and av.name = v_names[v_k];
      if v_value is null then
        raise exception '% is not one of the values you listed.', v_names[v_k] using errcode = '22023';
      end if;
      v_value_ids := v_value_ids || v_value;
      v_value := null;
    end loop;
    if (vr ->> 'price_kes') !~ '^[0-9]{1,8}$' then
      raise exception 'Give % a price in whole shillings.', array_to_string(v_names, ' / ') using errcode = '22023';
    end if;
    v_price := (vr ->> 'price_kes')::integer;
    v_stock := case when nullif(vr ->> 'stock_count', '') is null then null
                    when (vr ->> 'stock_count') ~ '^[0-9]{1,7}$' then (vr ->> 'stock_count')::integer
                    else -1 end;
    if v_stock = -1 then
      raise exception 'Enter how many % are left as a whole number, or leave it empty.',
        array_to_string(v_names, ' / ') using errcode = '22023';
    end if;
    if array_to_string(v_value_ids, ',') = any (v_seen) then
      raise exception '% is listed twice.', array_to_string(v_names, ' / ') using errcode = '22023';
    end if;
    v_seen := v_seen || array_to_string(v_value_ids, ',');

    update public.catalogue_variant
       set price_kes = v_price,
           available = coalesce((vr ->> 'available')::boolean, true),
           stock_count = v_stock,
           sku = nullif(trim(vr ->> 'sku'), ''),
           photo_path = nullif(trim(vr ->> 'photo_path'), ''),
           updated_at = now()
     where item_id = p_item_id and value_ids = v_value_ids and archived_at is null
    returning id into v_variant;
    if v_variant is null then
      insert into public.catalogue_variant (item_id, value_ids, price_kes, available, stock_count, sku, photo_path)
      values (p_item_id, v_value_ids, v_price, coalesce((vr ->> 'available')::boolean, true), v_stock,
              nullif(trim(vr ->> 'sku'), ''), nullif(trim(vr ->> 'photo_path'), ''))
      returning id into v_variant;
    end if;
    v_keep_variants := v_keep_variants || v_variant;
    v_variant := null;
  end loop;

  /* Versions left out stop being sold; past orders keep their own label and price. */
  update public.catalogue_variant set archived_at = now(), updated_at = now()
   where item_id = p_item_id and archived_at is null and not (id = any (v_keep_variants));
  delete from public.catalogue_attribute_value av
   using public.catalogue_attribute ca
   where ca.id = av.attribute_id and ca.item_id = p_item_id and not (av.id = any (v_keep_values));
  delete from public.catalogue_attribute
   where item_id = p_item_id and not (id = any (v_attrs));

  perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_actor_id => v_uid,
    p_module => 'merchants', p_action => 'catalogue.item_variants_saved',
    p_target_type => 'catalogue_item', p_target_id => p_item_id, p_target_label => i.name,
    p_after => p_payload);

  return jsonb_build_object('ok', true, 'item_id', p_item_id,
                            'variant_ids', to_jsonb(v_keep_variants),
                            'attribute_ids', to_jsonb(v_attrs));
end;
$$;

comment on function public.rpc_merchant_item_variants_save(uuid, jsonb) is
  'The shop saves an item''s versions: {attributes:[{name, values:[name]}], variants:[{values:[name per attribute], price_kes, available?, stock_count?, sku?, photo_path?}]}. Empty lists turn versions off.';

revoke execute on function public.rpc_merchant_item_variants_save(uuid, jsonb) from public, anon;
grant execute on function public.rpc_merchant_item_variants_save(uuid, jsonb) to authenticated;

-- catalogue_public: 20270109000400, with has_variants appended.
create or replace view public.catalogue_public
with (security_invoker = false)
as
select
  i.id,
  i.merchant_id,
  i.section_id,
  i.name,
  i.description,
  i.price_kes,
  i.available,
  i.age_restricted,
  i.highlighted,
  i.sort,
  i.photo_path,
  coalesce((select array_agg(p.storage_path order by p.is_cover desc, p.sort, p.created_at)
              from public.catalogue_photo p
             where p.item_id = i.id and p.status = 'published'), '{}'::text[]) as gallery_paths,
  i.kind::text as kind,
  i.booking_offering_id,
  i.sold_by,
  i.unit_label,
  i.unit_step,
  i.unit_min,
  i.unit_max,
  i.price_is_estimate,
  exists (select 1 from public.catalogue_item_modifier cim
            join public.modifier_group g on g.id = cim.group_id and g.archived_at is null
           where cim.item_id = i.id) as has_options,
  exists (select 1 from public.catalogue_variant v
           where v.item_id = i.id and v.archived_at is null) as has_variants
from public.catalogue_item i
join public.merchant_public mp on mp.id = i.merchant_id
where coalesce(i.available, true)
  and (
    not coalesce(i.age_restricted, false)
    or exists (
      select 1
      from public.document d
      join public.document_requirement r on r.id = d.requirement_id
      where d.owner_type = 'merchant' and d.owner_id = i.merchant_id
        and r.kind = 'liquor_licence'
        and d.status = 'verified' and d.superseded_at is null
    )
  );

grant select on public.catalogue_public to anon, authenticated;

-- fn_web_order_quote: 20270109000400, with each line's version.
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
  v_problem text;
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
  if not public.fn_merchant_open_for_orders(m.id, now()) then
    return jsonb_build_object('ok', false, 'message', m.trading_name || ' is closed right now.');
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

  if exists (
       select 1
         from jsonb_to_recordset(p_payload -> 'items') as q(catalogue_item_id uuid)
         join public.catalogue_item i
           on i.id = q.catalogue_item_id and i.merchant_id = v_merchant
        where coalesce(i.age_restricted, false))
     and not public.fn_merchant_liquor_licensed(v_merchant) then
    return jsonb_build_object('ok', false,
      'message', m.trading_name || ' cannot sell age-restricted items on NexG yet. Remove them to continue.');
  end if;

  /* Bookable items are booked, not put in a basket. */
  if exists (
       select 1
         from jsonb_to_recordset(p_payload -> 'items') as q(catalogue_item_id uuid)
         join public.catalogue_item i
           on i.id = q.catalogue_item_id and i.merchant_id = v_merchant
        where i.kind <> 'buy') then
    return jsonb_build_object('ok', false,
      'message', 'Something in your basket is booked rather than bought. Book it on its own page.');
  end if;

  /* Choices and amounts, line by line, with a message for the first that is wrong. */
  select coalesce(
           (select lv.v ->> 'message'
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
              cross join lateral (select public.fn_line_variant(i.id, l.line ->> 'variant_id') as v) lv
             where not (lv.v ->> 'ok')::boolean
             order by l.n limit 1),
           (select 'Only ' || (lv.v ->> 'stock_count') || ' left of ' || i.name || ' (' || (lv.v ->> 'label') || ').'
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
              cross join lateral (select public.fn_line_variant(i.id, l.line ->> 'variant_id') as v) lv
             where (lv.v ->> 'stock_count') is not null
               and (l.line ->> 'quantity') ~ '^[0-9]+$'
               and (l.line ->> 'quantity')::integer > (lv.v ->> 'stock_count')::integer
             order by l.n limit 1),
           (select ln.opts ->> 'message'
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
              cross join lateral (select public.fn_line_options(i.id, l.line -> 'options') as opts) ln
             where not (ln.opts ->> 'ok')::boolean
             order by l.n limit 1),
           (select 'You can buy ' || i.name || ' from ' || i.unit_min || ' to '
                   || coalesce(i.unit_max::text, 'any amount') || ' ' || coalesce(i.unit_label, '') || '.'
              from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
              join public.catalogue_item i
                on i.id = nullif(l.line ->> 'catalogue_item_id', '')::uuid and i.merchant_id = v_merchant
             where (l.line ->> 'quantity') ~ '^[0-9]+$'
               and ((i.unit_min is not null and (l.line ->> 'quantity')::numeric * i.unit_step < i.unit_min)
                 or (i.unit_max is not null and (l.line ->> 'quantity')::numeric * i.unit_step > i.unit_max))
             order by l.n limit 1))
    into v_problem;
  if v_problem is not null then
    return jsonb_build_object('ok', false, 'message', v_problem);
  end if;

  /* Each line is priced from the catalogue row, at the running promotion's
     price when there is one, for one step of its unit, plus the options
     chosen. A line that is not this merchant's, not on sale, or not priced
     is refused rather than quietly dropped. */
  select
    jsonb_agg(jsonb_build_object(
      'catalogue_item_id', i.id,
      'name', i.name,
      'quantity', q.quantity,
      'unit_price_cents', round(pp.price_kes::numeric * 100 * i.unit_step)::bigint
                          + (ln.opts ->> 'extra_cents')::bigint,
      'list_price_cents', round(coalesce((lv.v ->> 'price_kes')::numeric, i.price_kes::numeric) * 100 * i.unit_step)::bigint
                          + (ln.opts ->> 'extra_cents')::bigint,
      'promotion_id', pp.promotion_id,
      'line_total_cents', (round(pp.price_kes::numeric * 100 * i.unit_step)::bigint
                           + (ln.opts ->> 'extra_cents')::bigint) * q.quantity,
      'options', ln.opts -> 'chosen',
      'variant_id', lv.v ->> 'variant_id',
      'variant_label', lv.v ->> 'label',
      'sold_by', i.sold_by,
      'unit_label', i.unit_label,
      'unit_step', i.unit_step,
      'price_is_estimate', i.price_is_estimate,
      'note', nullif(trim(q.note), ''),
      'age_restricted', i.age_restricted) order by q.n),
    coalesce(sum((round(pp.price_kes::numeric * 100 * i.unit_step)::bigint
                  + (ln.opts ->> 'extra_cents')::bigint) * q.quantity), 0),
    count(*)
  into v_lines, v_subtotal, v_found
  from jsonb_array_elements(p_payload -> 'items') with ordinality as l(line, n)
  cross join lateral (select nullif(l.line ->> 'catalogue_item_id', '')::uuid as catalogue_item_id,
                             case when (l.line ->> 'quantity') ~ '^[0-9]+$'
                                  then (l.line ->> 'quantity')::integer end as quantity,
                             l.line ->> 'note' as note, l.n) q
  join public.catalogue_item i
    on i.id = q.catalogue_item_id
   and i.merchant_id = v_merchant
   and i.available
  cross join lateral (select public.fn_line_variant(i.id, l.line ->> 'variant_id') as v) lv
  cross join lateral public.fn_item_promo_price(
    i.id, i.merchant_id, coalesce((lv.v ->> 'price_kes')::integer, i.price_kes)) pp
  cross join lateral (select public.fn_line_options(i.id, l.line -> 'options') as opts) ln
  where q.quantity between 1 and 50
    and (lv.v ->> 'ok')::boolean
    and coalesce((lv.v ->> 'price_kes')::integer, i.price_kes) is not null;

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
    'has_estimated_prices', exists (
      select 1 from jsonb_array_elements(v_lines) l where (l ->> 'price_is_estimate')::boolean),
    'currency', 'KES');
end;
$$;

revoke execute on function public.fn_web_order_quote(jsonb) from public, anon, authenticated;
grant execute on function public.fn_web_order_quote(jsonb) to service_role;

-- rpc_order_place_web: 20270109000400, keeping the version and setting aside counted stock.
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
    'guest', v_temporary);
end;
$$;

comment on function public.rpc_order_place_web(jsonb) is
  'Places a delivery order for the signed-in account or a temporary (guest) session, with each line''s unit, choices and version. Bookings and stay holds still need an account.';

revoke execute on function public.rpc_order_place_web(jsonb) from public, anon;
grant execute on function public.rpc_order_place_web(jsonb) to authenticated;
