-- What the Consumer app needs to show and sell an item.
--
-- The app's item sheet draws a photo, choices, add-ons, a unit and a button
-- whose label depends on what the item is. None of that reached it: the
-- public catalogue (catalogue_public) had no photo, no kind and no unit, the
-- choice and add-on tables (20260101020200) could be read only by the shop and
-- staff, nothing could write them, and checkout priced name x quantity only.
--
-- 1. Kind. catalogue_item.kind says how the item is taken: 'buy' goes in the
--    basket; the others (ticket, seats, appointment, table, trip, transfer,
--    rental, service, request, pass) are booked through the booking engine,
--    and catalogue_item.booking_offering_id names the engine's offering.
--    Every existing item is 'buy'. Checkout refuses anything that is not.
-- 2. Unit. sold_by ('each', 'pack', 'weight', 'volume'), unit_label ('kg'),
--    unit_step (0.5 means sold in half-kilo steps), unit_min / unit_max (in
--    the unit) and price_is_estimate (final price after weighing). price_kes
--    is the price of one unit (per kg); a basket quantity counts steps, so
--    3 x 0.5 kg at KES 800/kg is 1.5 kg and KES 1,200. Each item: step 1.
-- 3. Photos. catalogue_public gains photo_path (the cover) and gallery_paths
--    (published gallery photos), both storage paths in the 'catalogue-images'
--    bucket, which anyone may already read for a live, visible shop
--    (20261210000500). Published gallery photos are now readable too.
-- 4. Choices and add-ons. catalogue_option_public lists each item's groups
--    with their options and prices. Checkout takes the chosen option ids per
--    line ("options": [...]), checks each group's minimum and maximum, adds
--    the options' prices to the line and keeps them on the order
--    (order_item_modifier), which the customer can now read back.
--    The shop writes them with rpc_merchant_option_group_save and
--    rpc_merchant_item_option_groups_set.
--
-- Rollback: re-run fn_web_order_quote from 20261223000400, rpc_order_place_web
-- from 20270109000100, catalogue_public from 20260101007300,
-- authz.catalogue_image_is_public from 20261210000500 and the
-- order_item_modifier_read policy from 20260101020200; then drop the new
-- functions, catalogue_option_public, the new columns and the enum.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('catalogue.option_group_saved', 'merchants', 'info', true, 'A shop saved a choice or add-on group'),
  ('catalogue.item_option_groups_set', 'merchants', 'info', false, 'A shop chose which groups an item offers')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 1–2. kind and unit

create type public.catalogue_item_kind as enum (
  'buy', 'ticket', 'seats', 'appointment', 'table', 'trip', 'transfer',
  'rental', 'service', 'request', 'pass');

alter table public.catalogue_item
  add column kind public.catalogue_item_kind not null default 'buy',
  add column booking_offering_id text,
  add column sold_by text not null default 'each',
  add column unit_label text,
  add column unit_step numeric(10, 3) not null default 1,
  add column unit_min numeric(10, 3),
  add column unit_max numeric(10, 3),
  add column price_is_estimate boolean not null default false;

alter table public.catalogue_item
  add constraint catalogue_item_sold_by_known
    check (sold_by in ('each', 'pack', 'weight', 'volume')),
  add constraint catalogue_item_unit_makes_sense
    check (unit_step > 0
           and (unit_min is null or unit_min > 0)
           and (unit_max is null or unit_max >= coalesce(unit_min, unit_step))
           and (sold_by in ('each', 'pack') or nullif(trim(unit_label), '') is not null)),
  add constraint catalogue_item_offering_only_for_bookings
    check (booking_offering_id is null or kind <> 'buy');

comment on column public.catalogue_item.kind is
  'How the item is taken: buy (basket and checkout) or a booking kind handled by the booking engine.';
comment on column public.catalogue_item.booking_offering_id is
  'The booking engine offering this item books (its public id), for kinds other than buy.';
comment on column public.catalogue_item.unit_step is
  'One basket step in the unit: 1 for each item, 0.5 for half a kilo. price_kes is per one unit.';

alter table public.order_item
  add column unit_label text,
  add column unit_step numeric(10, 3);

comment on column public.order_item.unit_step is
  'For items sold by weight or volume: quantity is a count of these steps (3 x 0.5 kg).';

-- ═══════════════════════════════════════════════ 3. photos

create or replace function authz.catalogue_image_is_public(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.catalogue_item item
      join public.merchant merchant on merchant.id = item.merchant_id
     where merchant.status = 'live'
       and merchant.explore_visible
       and (item.photo_path = p_path
            or exists (select 1 from public.catalogue_photo p
                        where p.item_id = item.id and p.storage_path = p_path
                          and p.status = 'published'))
  );
$$;

comment on function authz.catalogue_image_is_public(text) is
  'True when the path is the cover or a published gallery photo of an item on a live, Explore-visible merchant.';

-- catalogue_public: 20260101007300, with what the item sheet needs appended.
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
           where cim.item_id = i.id) as has_options
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

-- ═══════════════════════════════════════════════ 4. choices and add-ons

create view public.catalogue_option_public
with (security_invoker = false)
as
select
  cim.item_id,
  g.id as group_id,
  g.name as group_name,
  g.required,
  case when g.required then greatest(g.min_choices, 1) else g.min_choices end::smallint as min_choices,
  g.max_choices,
  cim.sort,
  coalesce((select jsonb_agg(jsonb_build_object(
                     'id', o.id, 'name', o.name, 'extra_cents', o.extra_cents,
                     'available', o.available) order by o.sort, o.name)
              from public.modifier_option o where o.group_id = g.id), '[]'::jsonb) as options
from public.catalogue_item_modifier cim
join public.catalogue_public cp on cp.id = cim.item_id
join public.modifier_group g on g.id = cim.group_id and g.archived_at is null;

comment on view public.catalogue_option_public is
  'The choices and add-ons each public item offers, with prices in cents. min_choices already counts "required".';

grant select on public.catalogue_option_public to anon, authenticated;

/* The options chosen on one line, checked against the item's groups.
   Returns {ok, extra_cents, chosen:[...]} or {ok:false, message}. */
create or replace function public.fn_line_options(p_item_id uuid, p_options jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_known integer;
  v_bad record;
  v_chosen jsonb;
  v_extra bigint;
begin
  if p_options is not null and jsonb_typeof(p_options) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Choices must be a list.');
  end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into v_ids
    from jsonb_array_elements_text(coalesce(p_options, '[]'::jsonb)) x;
  if cardinality(v_ids) <> coalesce(jsonb_array_length(p_options), 0) then
    return jsonb_build_object('ok', false, 'message', 'A choice was picked twice.');
  end if;

  select count(*) into v_known
    from public.modifier_option o
    join public.modifier_group g on g.id = o.group_id and g.archived_at is null
    join public.catalogue_item_modifier cim on cim.group_id = g.id and cim.item_id = p_item_id
   where o.id = any (v_ids) and o.available;
  if v_known <> cardinality(v_ids) then
    return jsonb_build_object('ok', false, 'message', 'A choice in your basket is no longer available.');
  end if;

  select g.name as group_name, count(o.id) as picked,
         case when g.required then greatest(g.min_choices, 1) else g.min_choices end as least_n,
         g.max_choices
    into v_bad
    from public.catalogue_item_modifier cim
    join public.modifier_group g on g.id = cim.group_id and g.archived_at is null
    left join public.modifier_option o on o.group_id = g.id and o.id = any (v_ids)
   where cim.item_id = p_item_id
   group by g.id, g.name, g.required, g.min_choices, g.max_choices
  having count(o.id) < case when g.required then greatest(g.min_choices, 1) else g.min_choices end
      or count(o.id) > g.max_choices
   limit 1;
  if found then
    return jsonb_build_object('ok', false,
      'message', case when v_bad.picked < v_bad.least_n
                      then 'Choose ' || v_bad.group_name || ' first.'
                      else 'Choose at most ' || v_bad.max_choices || ' for ' || v_bad.group_name || '.' end);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'group_id', g.id, 'group_name', g.name,
           'option_id', o.id, 'option_name', o.name, 'extra_cents', o.extra_cents)
           order by cim.sort, g.sort, o.sort), '[]'::jsonb),
         coalesce(sum(o.extra_cents), 0)
    into v_chosen, v_extra
    from public.modifier_option o
    join public.modifier_group g on g.id = o.group_id
    join public.catalogue_item_modifier cim on cim.group_id = g.id and cim.item_id = p_item_id
   where o.id = any (v_ids);

  return jsonb_build_object('ok', true, 'extra_cents', v_extra, 'chosen', v_chosen);
end;
$$;

revoke execute on function public.fn_line_options(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_line_options(uuid, jsonb) to service_role;

-- The customer reads back the choices on their own order.
drop policy if exists order_item_modifier_read on public.order_item_modifier;
create policy order_item_modifier_read on public.order_item_modifier
  for select to authenticated
  using (exists (
    select 1 from public.order_item oi
      join public."order" o on o.id = oi.order_id
     where oi.id = order_item_id
       and (authz.is_merchant_member(o.merchant_id)
            or authz.reaches_module('orders')
            or exists (select 1 from public.guest g
                        where g.id = o.guest_id and g.user_id = (select auth.uid())))));

-- ── the shop writes its groups

create or replace function public.rpc_merchant_option_group_save(p_merchant_id uuid, p_group jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid := nullif(p_group ->> 'id', '')::uuid;
  v_name text := nullif(trim(p_group ->> 'name'), '');
  v_required boolean := coalesce((p_group ->> 'required')::boolean, false);
  v_min smallint := coalesce((p_group ->> 'min_choices')::smallint, 0);
  v_max smallint := coalesce((p_group ->> 'max_choices')::smallint, 1);
  v_keep uuid[] := '{}';
  o jsonb;
  v_opt uuid;
  v_i integer := 0;
begin
  if v_uid is null or not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Name the group, for example "Size" or "Extras".' using errcode = '22023';
  end if;
  if v_max < greatest(v_min, 1) or (v_required and v_max < 1) then
    raise exception 'The most a customer can choose must be at least the fewest.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_group -> 'options') is distinct from 'array'
     or jsonb_array_length(p_group -> 'options') = 0 then
    raise exception 'Add at least one option.' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.modifier_group (merchant_id, name, required, min_choices, max_choices)
    values (p_merchant_id, v_name, v_required, v_min, v_max) returning id into v_id;
  else
    update public.modifier_group
       set name = v_name, required = v_required, min_choices = v_min, max_choices = v_max,
           archived_at = case when coalesce((p_group ->> 'archived')::boolean, false)
                              then coalesce(archived_at, now()) end
     where id = v_id and merchant_id = p_merchant_id;
    if not found then raise exception 'Group not found.' using errcode = 'P0002'; end if;
  end if;

  for o in select * from jsonb_array_elements(p_group -> 'options') loop
    v_i := v_i + 1;
    if nullif(trim(o ->> 'name'), '') is null then
      raise exception 'Every option needs a name.' using errcode = '22023';
    end if;
    if coalesce((o ->> 'extra_cents')::bigint, 0) < 0 then
      raise exception 'An option cannot cost less than nothing.' using errcode = '22023';
    end if;
    v_opt := nullif(o ->> 'id', '')::uuid;
    if v_opt is not null then
      update public.modifier_option
         set name = trim(o ->> 'name'), extra_cents = coalesce((o ->> 'extra_cents')::bigint, 0),
             available = coalesce((o ->> 'available')::boolean, true), sort = v_i
       where id = v_opt and group_id = v_id;
      if not found then raise exception 'Option not found.' using errcode = 'P0002'; end if;
    else
      insert into public.modifier_option (group_id, name, extra_cents, available, sort)
      values (v_id, trim(o ->> 'name'), coalesce((o ->> 'extra_cents')::bigint, 0),
              coalesce((o ->> 'available')::boolean, true), v_i)
      returning id into v_opt;
    end if;
    v_keep := v_keep || v_opt;
  end loop;
  /* Options left out are removed; past orders keep their own copy of the name and price. */
  delete from public.modifier_option where group_id = v_id and not (id = any (v_keep));

  perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_actor_id => v_uid,
    p_module => 'merchants', p_action => 'catalogue.option_group_saved',
    p_target_type => 'modifier_group', p_target_id => v_id, p_target_label => v_name,
    p_after => p_group);

  return jsonb_build_object('ok', true, 'group_id', v_id, 'option_ids', to_jsonb(v_keep));
end;
$$;

comment on function public.rpc_merchant_option_group_save(uuid, jsonb) is
  'The shop saves one choice or add-on group: {id?, name, required, min_choices, max_choices, archived?, options:[{id?, name, extra_cents, available}]}.';

revoke execute on function public.rpc_merchant_option_group_save(uuid, jsonb) from public, anon;
grant execute on function public.rpc_merchant_option_group_save(uuid, jsonb) to authenticated;

create or replace function public.rpc_merchant_item_option_groups_set(p_item_id uuid, p_group_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_merchant uuid;
begin
  select merchant_id into v_merchant from public.catalogue_item where id = p_item_id;
  if v_uid is null or v_merchant is null or not authz.is_merchant_member(v_merchant) then
    raise exception 'Item not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(coalesce(p_group_ids, '{}')) gid
              where not exists (select 1 from public.modifier_group g
                                 where g.id = gid and g.merchant_id = v_merchant)) then
    raise exception 'That group is not this shop''s.' using errcode = '22023';
  end if;

  delete from public.catalogue_item_modifier where item_id = p_item_id;
  insert into public.catalogue_item_modifier (item_id, group_id, sort)
  select p_item_id, gid, (ord - 1)::smallint
    from unnest(coalesce(p_group_ids, '{}')) with ordinality as t(gid, ord);

  perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_actor_id => v_uid,
    p_module => 'merchants', p_action => 'catalogue.item_option_groups_set',
    p_target_type => 'catalogue_item', p_target_id => p_item_id,
    p_after => jsonb_build_object('group_ids', to_jsonb(coalesce(p_group_ids, '{}'))));

  return jsonb_build_object('ok', true, 'item_id', p_item_id,
                            'group_ids', to_jsonb(coalesce(p_group_ids, '{}')));
end;
$$;

comment on function public.rpc_merchant_item_option_groups_set(uuid, uuid[]) is
  'The shop chooses which of its groups an item offers, in order. An empty list removes them all.';

revoke execute on function public.rpc_merchant_item_option_groups_set(uuid, uuid[]) from public, anon;
grant execute on function public.rpc_merchant_item_option_groups_set(uuid, uuid[]) to authenticated;

-- ═══════════════════════════════════════════════ checkout

-- fn_web_order_quote: 20261223000400, with kinds, units and options per line.
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
      'list_price_cents', round(i.price_kes::numeric * 100 * i.unit_step)::bigint
                          + (ln.opts ->> 'extra_cents')::bigint,
      'promotion_id', pp.promotion_id,
      'line_total_cents', (round(pp.price_kes::numeric * 100 * i.unit_step)::bigint
                           + (ln.opts ->> 'extra_cents')::bigint) * q.quantity,
      'options', ln.opts -> 'chosen',
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
   and i.price_kes is not null
  cross join lateral public.fn_item_promo_price(i.id, i.merchant_id, i.price_kes) pp
  cross join lateral (select public.fn_line_options(i.id, l.line -> 'options') as opts) ln
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

-- rpc_order_place_web: 20270109000100, saving each line's unit and choices.
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
      unit_label, unit_step)
    values (v_order, (v_line ->> 'catalogue_item_id')::uuid, v_line ->> 'name',
            (v_line ->> 'quantity')::integer, (v_line ->> 'unit_price_cents')::bigint,
            (v_line ->> 'line_total_cents')::bigint, nullif(v_line ->> 'note', ''),
            case when v_line ->> 'sold_by' in ('weight', 'volume') then v_line ->> 'unit_label' end,
            case when v_line ->> 'sold_by' in ('weight', 'volume') then (v_line ->> 'unit_step')::numeric end)
    returning id into v_item;

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
  'Places a delivery order for the signed-in account or a temporary (guest) session, with each line''s unit and choices. Bookings and stay holds still need an account.';

revoke execute on function public.rpc_order_place_web(jsonb) from public, anon;
grant execute on function public.rpc_order_place_web(jsonb) to authenticated;
