-- What merchants entered in the offerings editor now reaches the catalogue the
-- apps read.
--
-- The editor (apps/web/components/merchant/offerings, saved through
-- fn_merchant_setup_offering_write into merchant_setup_offering_detail.data)
-- has always collected versions with their own price and stock, choice groups
-- with extra prices, a unit and quantity rules. Only the name, description,
-- price and section ever reached catalogue_item. This migration:
--
-- 1. fn_offering_setup_project(item): turns one saved offering into the real
--    rows the apps and checkout read:
--      variants[]      -> catalogue_attribute "Version" + catalogue_variant
--                         (own price, stock count, shop code)
--      optionGroups[]  -> modifier_group + modifier_option (extra price) +
--                         catalogue_item_modifier
--      unit + quantityRules, for a per-kg or per-litre price
--                      -> catalogue_item.sold_by / unit_label / unit_step /
--                         unit_min / unit_max
--    It never guesses. Anything it cannot convert exactly is written to
--    catalogue_setup_review for the merchant to finish on the Menu page:
--    prices that are not whole shillings, choices limited to some versions,
--    "price on request", booking-type offerings, a photo still in the editor's
--    private bucket, a unit it does not recognise.
--    Rows it made are marked (catalogue_attribute.source,
--    modifier_group.setup_item_id) and only those are replaced on the next
--    save. Anything the merchant set on the Menu page is left alone, and the
--    editor's version is listed for review instead.
-- 2. A trigger on merchant_setup_offering_detail runs it on every save (editor,
--    CSV import, adopting an older item), so nothing has to be entered twice.
-- 3. A one-time carry-over runs it for every offering already saved, and lists
--    the sizes and options merchants gave during onboarding
--    (merchant.answers: cafe_drink_sizes, cafe_milk_options, juice_bar_sizes,
--    fast_food_combo_offers), which name no item, for the merchant to set up.
--    Running it again changes nothing.
-- 4. rpc_merchant_setup_review_dismiss lets the shop clear a review line.
--
-- Rollback: drop the trigger, the five functions, catalogue_setup_review, and
-- the columns catalogue_attribute.source and modifier_group.setup_item_id.
-- Rows already carried over are ordinary catalogue rows and stay.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('catalogue.setup_review_dismissed', 'merchants', 'info', false,
   'A shop cleared a line its earlier setup left to confirm')
on conflict (action) do nothing;

alter table public.catalogue_attribute
  add column source text not null default 'menu' check (source in ('menu', 'offering_setup'));
alter table public.modifier_group
  add column setup_item_id uuid references public.catalogue_item(id) on delete cascade;
create index modifier_group_setup_item_idx on public.modifier_group (setup_item_id)
  where setup_item_id is not null;

comment on column public.catalogue_attribute.source is
  'menu: set on the Menu page. offering_setup: carried from the offerings editor and replaced when that offering is saved again.';
comment on column public.modifier_group.setup_item_id is
  'Set when the group was carried from this item''s offerings-editor entry; replaced when that offering is saved again.';

-- ═══════════════════════════════════════════════ what is left to confirm

create table public.catalogue_setup_review (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchant(id) on delete cascade,
  item_id      uuid references public.catalogue_item(id) on delete cascade,
  kind         text not null check (kind in (
                 'variant_price', 'variant_limited_choice', 'choice_price', 'price_on_request',
                 'booking_kind', 'photo', 'unit', 'menu_already_set', 'onboarding_answer')),
  message      text not null check (char_length(message) between 1 and 500),
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create unique index catalogue_setup_review_once
  on public.catalogue_setup_review (merchant_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, (detail ->> 'key'))
  where resolved_at is null;
create index catalogue_setup_review_open on public.catalogue_setup_review (merchant_id) where resolved_at is null;

comment on table public.catalogue_setup_review is
  'What a merchant entered earlier (offerings editor, onboarding) that could not be turned into catalogue rows exactly. Shown on the Menu page to finish by hand.';

alter table public.catalogue_setup_review enable row level security;
create policy catalogue_setup_review_read on public.catalogue_setup_review
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.can_manage_merchants(null));
revoke all on public.catalogue_setup_review from public, anon;
grant select on public.catalogue_setup_review to authenticated;

create or replace function public.fn_setup_review_add(
  p_merchant uuid, p_item uuid, p_kind text, p_message text, p_key text default '')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.catalogue_setup_review (merchant_id, item_id, kind, message, detail)
  values (p_merchant, p_item, p_kind, left(p_message, 500), jsonb_build_object('key', coalesce(p_key, '')))
  on conflict do nothing;
$$;
revoke execute on function public.fn_setup_review_add(uuid, uuid, text, text, text) from public, anon, authenticated;

-- ═══════════════════════════════════════════════ 1. one offering

create or replace function public.fn_offering_setup_project(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d jsonb;
  i public.catalogue_item;
  v_mode text;
  v_unit text;
  v_label text;
  v_sold text;
  v_rules jsonb;
  v_min numeric;
  v_max numeric;
  v_prec integer;
  v_step numeric;
  v jsonb;
  g jsonb;
  c jsonb;
  v_ok boolean;
  v_attr uuid;
  v_val uuid;
  v_group uuid;
  v_n integer;
  v_min_c integer;
  v_max_c integer;
  v_menu_attrs boolean;
  v_schema text;
  v_kind text;
begin
  select data into d from public.merchant_setup_offering_detail where item_id = p_item_id;
  select * into i from public.catalogue_item where id = p_item_id;
  if d is null or i.id is null then return; end if;

  -- Start this item's review lines afresh; dismissed ones stay dismissed.
  delete from public.catalogue_setup_review
   where item_id = p_item_id and resolved_at is null and kind <> 'onboarding_answer';

  v_mode := d ->> 'priceMode';
  v_schema := coalesce(d ->> 'schemaId', '');

  -- Booking-type offerings are booked, not bought. Kind stays 'buy' until the
  -- shop links the item to its booking on the Menu page.
  v_kind := case v_schema
    when 'EVENT_TICKET_V1' then 'ticket'
    when 'GROUP_SESSION_V1' then 'ticket'
    when 'SERVICE_APPOINTMENT_V1' then 'appointment'
    when 'REMOTE_SESSION_V1' then 'appointment'
    when 'SPACE_RESERVATION_V1' then 'table'
    when 'RENTAL_ASSET_V1' then 'rental'
    when 'STORAGE_SPACE_V1' then 'rental'
    when 'TRANSFER_ROUTE_V1' then 'transfer'
    when 'TOUR_PACKAGE_V1' then 'trip'
    when 'FIELD_SERVICE_V1' then 'service'
    when 'SERVICE_JOB_V1' then 'service'
    when 'PICKUP_RETURN_V1' then 'service'
    when 'MEMBERSHIP_PLAN_V1' then 'pass'
    when 'REQUEST_QUOTE_V1' then 'request'
    when 'REGULATED_ENQUIRY_V1' then 'request'
    when 'FREIGHT_SHIPMENT_V1' then 'request'
    else null end;  -- PRODUCT_CATALOG_V1, MADE_TO_ORDER_V1: bought
  if v_kind is not null and i.kind = 'buy' then
    perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'booking_kind',
      i.name || ' looks like something customers book (' || v_kind || '). Choose "How customers get it" on the Menu page and link it to its booking.',
      v_kind);
  end if;

  if v_mode in ('quote', 'enquiry') then
    perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'price_on_request',
      i.name || ' has its price on request. Give it a price, or set it as a request on the Menu page.');
  end if;

  if coalesce(d ->> 'imageStoragePath', '') <> '' and i.photo_path is null then
    perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'photo',
      'The photo for ' || i.name || ' was added in the offerings editor. Add it again on the Menu page so customers see it.');
  end if;

  -- ── unit and quantity: only a clear per-kg or per-litre price
  v_unit := lower(trim(coalesce(nullif(d #>> '{fields,sale_unit}', ''), d ->> 'unit', '')));
  if v_mode = 'unit' and v_unit <> '' then
    v_sold := case
      when v_unit in ('kg', 'kgs', 'kilo', 'kilogram', 'kilograms', 'g', 'gram', 'grams') then 'weight'
      when v_unit in ('l', 'litre', 'litres', 'liter', 'liters', 'ml', 'millilitre', 'millilitres') then 'volume'
      else null end;
    if v_sold is null then
      perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'unit',
        i.name || ' is priced per ' || left(v_unit, 40) || '. Check how it is sold on the Menu page.', v_unit);
    elsif i.sold_by = 'each' then
      v_label := case when v_unit in ('kg', 'kgs', 'kilo', 'kilogram', 'kilograms') then 'kg'
                      when v_unit in ('g', 'gram', 'grams') then 'g'
                      when v_unit in ('ml', 'millilitre', 'millilitres') then 'ml'
                      else 'litre' end;
      v_rules := d -> 'quantityRules';
      v_prec := case when coalesce(v_rules ->> 'precision', '') ~ '^[0-3]$' then (v_rules ->> 'precision')::integer else 0 end;
      v_step := power(10::numeric, -v_prec);
      v_min := case when coalesce(v_rules ->> 'minimum', '') ~ '^[0-9]+([.][0-9]{1,3})?$'
                     and (v_rules ->> 'minimum')::numeric > 0 then (v_rules ->> 'minimum')::numeric end;
      v_max := case when coalesce(v_rules ->> 'maximum', '') ~ '^[0-9]+([.][0-9]{1,3})?$'
                     and (v_rules ->> 'maximum')::numeric >= coalesce(v_min, v_step) then (v_rules ->> 'maximum')::numeric end;
      update public.catalogue_item
         set sold_by = v_sold, unit_label = v_label, unit_step = v_step, unit_min = v_min, unit_max = v_max
       where id = p_item_id;
    end if;
  end if;

  -- Versions and choices are for items customers buy.
  if i.kind <> 'buy' then return; end if;

  -- ── versions
  select exists (select 1 from public.catalogue_attribute a where a.item_id = p_item_id and a.source = 'menu')
    into v_menu_attrs;
  if jsonb_typeof(d -> 'variants') = 'array' and jsonb_array_length(d -> 'variants') > 0 then
    if v_menu_attrs then
      perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'menu_already_set',
        'The versions of ' || i.name || ' were already set on the Menu page, so the ones from the offerings editor were not applied.');
    else
      select bool_and(
               length(trim(coalesce(x ->> 'name', ''))) between 1 and 40
               and coalesce(x ->> 'price', '') ~ '^[0-9]{1,8}([.]0{1,2})?$'
               and (x -> 'stock' is null or jsonb_typeof(x -> 'stock') = 'null'
                    or (jsonb_typeof(x -> 'stock') = 'number' and (x ->> 'stock') ~ '^[0-9]{1,7}$')))
             and count(distinct lower(trim(x ->> 'name'))) = count(*)
             and count(*) <= 300
        into v_ok
        from jsonb_array_elements(d -> 'variants') x;
      if not v_ok then
        perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'variant_price',
          'Some versions of ' || i.name || ' have a price that is not whole shillings, a missing name, or a name used twice. Set them on the Menu page.');
      else
        -- Replace what an earlier save carried over; keep anything else.
        update public.catalogue_variant set archived_at = now(), updated_at = now()
         where item_id = p_item_id and archived_at is null;
        delete from public.catalogue_attribute where item_id = p_item_id and source = 'offering_setup';
        insert into public.catalogue_attribute (item_id, name, sort, source)
        values (p_item_id, 'Version', 1, 'offering_setup') returning id into v_attr;
        v_n := 0;
        for v in select * from jsonb_array_elements(d -> 'variants') loop
          v_n := v_n + 1;
          insert into public.catalogue_attribute_value (attribute_id, name, sort)
          values (v_attr, trim(v ->> 'name'), v_n) returning id into v_val;
          insert into public.catalogue_variant (item_id, value_ids, price_kes, available, stock_count, sku)
          values (p_item_id, array[v_val], (v ->> 'price')::numeric::integer, true,
                  case when jsonb_typeof(v -> 'stock') = 'number' then (v ->> 'stock')::integer end,
                  nullif(left(trim(coalesce(v ->> 'sku', '')), 64), ''));
        end loop;
      end if;
    end if;
  elsif not v_menu_attrs then
    -- The editor no longer lists versions: take away the ones it made.
    update public.catalogue_variant set archived_at = now(), updated_at = now()
     where item_id = p_item_id and archived_at is null
       and exists (select 1 from public.catalogue_attribute a where a.item_id = p_item_id and a.source = 'offering_setup');
    delete from public.catalogue_attribute where item_id = p_item_id and source = 'offering_setup';
  end if;

  -- ── choices and add-ons
  delete from public.modifier_group where setup_item_id = p_item_id;
  if jsonb_typeof(d -> 'optionGroups') = 'array' then
    v_n := 0;
    for g in select * from jsonb_array_elements(d -> 'optionGroups') loop
      v_n := v_n + 1;
      if jsonb_typeof(g -> 'choices') is distinct from 'array' or jsonb_array_length(g -> 'choices') = 0
         or length(trim(coalesce(g ->> 'name', ''))) not between 1 and 60 then
        continue;
      end if;
      if exists (select 1 from jsonb_array_elements(g -> 'choices') x
                  where jsonb_typeof(x -> 'variantIds') = 'array' and jsonb_array_length(x -> 'variantIds') > 0) then
        perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'variant_limited_choice',
          'In ' || i.name || ', some "' || trim(g ->> 'name') || '" choices apply only to certain versions. Set that group up on the Menu page.',
          trim(g ->> 'name'));
        continue;
      end if;
      if exists (select 1 from jsonb_array_elements(g -> 'choices') x
                  where length(trim(coalesce(x ->> 'name', ''))) not between 1 and 60
                     or not (coalesce(nullif(trim(x ->> 'extra'), ''), '0') ~ '^[0-9]{1,6}([.][0-9]{1,2})?$')) then
        perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'choice_price',
          'In ' || i.name || ', a "' || trim(g ->> 'name') || '" choice has no name or an unclear extra price. Set that group up on the Menu page.',
          trim(g ->> 'name'));
        continue;
      end if;
      v_min_c := case when coalesce(g ->> 'minimum', '') ~ '^[0-9]{1,3}$' then (g ->> 'minimum')::integer else 0 end;
      v_max_c := case when coalesce(g ->> 'maximum', '') ~ '^[0-9]{1,3}$' then (g ->> 'maximum')::integer else 1 end;
      v_max_c := least(greatest(v_max_c, v_min_c, 1), jsonb_array_length(g -> 'choices'));
      v_min_c := least(v_min_c, v_max_c);
      insert into public.modifier_group (merchant_id, name, required, min_choices, max_choices, sort, setup_item_id)
      values (i.merchant_id, trim(g ->> 'name'), v_min_c >= 1, v_min_c, v_max_c, v_n, p_item_id)
      returning id into v_group;
      insert into public.modifier_option (group_id, name, extra_cents, available, sort)
      select v_group, trim(x ->> 'name'),
             round(coalesce(nullif(trim(x ->> 'extra'), ''), '0')::numeric * 100)::bigint, true, n::smallint
        from jsonb_array_elements(g -> 'choices') with ordinality as t(x, n);
      insert into public.catalogue_item_modifier (item_id, group_id, sort)
      values (p_item_id, v_group, 100 + v_n)
      on conflict do nothing;
    end loop;
  end if;
end;
$$;
revoke execute on function public.fn_offering_setup_project(uuid) from public, anon, authenticated;

comment on function public.fn_offering_setup_project(uuid) is
  'Turns one offerings-editor entry into catalogue rows (versions, choice groups, unit) and lists what it cannot convert exactly in catalogue_setup_review. Safe to run again.';

-- ═══════════════════════════════════════════════ 2. on every save

create or replace function public.tg_offering_setup_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.fn_offering_setup_project(new.item_id);
  return new;
end;
$$;
revoke execute on function public.tg_offering_setup_project() from public, anon, authenticated;

create trigger offering_setup_project
after insert or update of data on public.merchant_setup_offering_detail
for each row execute function public.tg_offering_setup_project();

-- ═══════════════════════════════════════════════ 3. what is already saved

create or replace function public.fn_setup_review_from_onboarding()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
insert into public.catalogue_setup_review (merchant_id, item_id, kind, message, detail)
select m.id, null, 'onboarding_answer',
       left(case q.key
              when 'cafe_drink_sizes' then 'At sign-up you listed drink sizes: '
              when 'cafe_milk_options' then 'At sign-up you listed milk options: '
              when 'juice_bar_sizes' then 'At sign-up you listed juice sizes: '
              else 'At sign-up you listed combo offers: ' end
            || q.answer || '. Add them as a choice group on the Menu page so customers can pick them.', 500),
       jsonb_build_object('key', q.key, 'answer', q.answer)
  from public.merchant m
  cross join lateral (
    select k as key,
           case jsonb_typeof(m.answers -> k)
             when 'array' then (select string_agg(e, ', ') from jsonb_array_elements_text(m.answers -> k) e)
             else m.answers ->> k end as answer
      from unnest(array['cafe_drink_sizes', 'cafe_milk_options', 'juice_bar_sizes', 'fast_food_combo_offers']) k
     where m.answers ? k) q
 where nullif(trim(coalesce(q.answer, '')), '') is not null
   and q.answer not in ('false', 'no', 'none')
on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.fn_setup_review_from_onboarding() from public, anon, authenticated;

do $$
begin
  perform public.fn_offering_setup_project(item_id) from public.merchant_setup_offering_detail;
  perform public.fn_setup_review_from_onboarding();
end;
$$;

-- ═══════════════════════════════════════════════ 4. the shop clears a line

create or replace function public.rpc_merchant_setup_review_dismiss(p_review_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.catalogue_setup_review;
begin
  select * into r from public.catalogue_setup_review where id = p_review_id;
  if (select auth.uid()) is null or not found or not authz.is_merchant_member(r.merchant_id) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  update public.catalogue_setup_review set resolved_at = coalesce(resolved_at, now()) where id = p_review_id;
  perform audit.log(p_actor_type => 'merchant_user'::public.actor_type, p_actor_id => (select auth.uid()),
    p_module => 'merchants', p_action => 'catalogue.setup_review_dismissed',
    p_target_type => 'catalogue_setup_review', p_target_id => p_review_id, p_after => jsonb_build_object('kind', r.kind));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.rpc_merchant_setup_review_dismiss(uuid) from public, anon;
grant execute on function public.rpc_merchant_setup_review_dismiss(uuid) to authenticated;
