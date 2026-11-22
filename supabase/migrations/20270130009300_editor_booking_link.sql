-- R38, part 2: the offerings editor links an item to its booking.
--
-- The editor saves bookingOfferingId (the shop's booking-engine offering,
-- chosen in "Booking it opens") with a booking-type offering.
-- fn_offering_setup_project (latest 20270130000100) now copies it, with the
-- kind its offering type implies (pass for a plan, table for a space,
-- appointment, ticket and so on), into catalogue_item.kind and
-- booking_offering_id on every save. The apps' Book button then opens that
-- booking. Without a link the item stays as it is and the review line still
-- asks the shop to link it; the Menu page can still set or change both.
--
-- Rollback: restore fn_offering_setup_project from 20270130000100.

-- fn_offering_setup_project: 20270130000100, plus the editor's booking link.
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
  v_per text;
  v_dur integer;
  v_pmin integer;
  v_pmax integer;
  v_prep integer;
  v_disc_kind text;
  v_disc_value integer;
  v_starts timestamptz;
  v_ends timestamptz;
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
  -- shop links the item to its booking, in the editor or on the Menu page.
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
  -- The editor's "Booking it opens": the kind and the link reach the item
  -- together, as the Menu page sets them. Without one, the shop is asked.
  if v_kind is not null
     and coalesce(d ->> 'bookingOfferingId', '') ~ '^[A-Za-z0-9_-]{1,128}$' then
    update public.catalogue_item
       set kind = v_kind::public.catalogue_item_kind,
           booking_offering_id = d ->> 'bookingOfferingId'
     where id = p_item_id;
    i.kind := v_kind::public.catalogue_item_kind;
  elsif v_kind is not null and i.kind = 'buy' then
    perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'booking_kind',
      i.name || ' looks like something customers book (' || v_kind || '). Choose "Booking it opens" in the offerings editor, or link it on the Menu page.',
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
    v_per := case
      when v_unit in ('person', 'persons', 'people', 'pax', 'guest', 'guests', 'participant', 'participants') then 'person'
      when v_unit in ('day', 'days', 'daily') then 'day'
      when v_unit in ('night', 'nights', 'nightly') then 'night'
      when v_unit in ('hour', 'hours', 'hr', 'hrs', 'hourly') then 'hour'
      when v_unit in ('trip', 'trips', 'ride', 'rides') then 'trip'
      when v_unit in ('session', 'sessions', 'class', 'classes', 'lesson', 'lessons') then 'session'
      when v_unit in ('month', 'months', 'monthly') then 'month'
      when v_unit in ('visit', 'visits') then 'visit'
      else null end;
    if v_sold is null and v_per is not null then
      null;  -- priced per person, day, hour…: price_per, set below
    elsif v_sold is null then
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

  -- ── what one unit of the price is (the editor owns it until the Menu page can set it)
  update public.catalogue_item
     set price_per = case when v_mode = 'unit' and v_sold is null then v_per end
   where id = p_item_id;

  -- ── timing and party size, for bought and booked items alike
  v_dur := case when coalesce(d #>> '{fields,duration_minutes}', '') ~ '^[0-9]{1,5}$'
                 and (d #>> '{fields,duration_minutes}')::integer between 1 and 43200
                then (d #>> '{fields,duration_minutes}')::integer end;
  v_pmin := case when coalesce(d #>> '{fields,party_min}', d #>> '{fields,group_size_min}', '') ~ '^[0-9]{1,5}$'
                 then nullif(coalesce(d #>> '{fields,party_min}', d #>> '{fields,group_size_min}')::integer, 0) end;
  v_pmax := case when coalesce(d #>> '{fields,party_max}', d #>> '{fields,group_size_max}', '') ~ '^[0-9]{1,5}$'
                 then nullif(coalesce(d #>> '{fields,party_max}', d #>> '{fields,group_size_max}')::integer, 0) end;
  if v_pmin > 10000 then v_pmin := null; end if;
  if v_pmax > 10000 or v_pmax < coalesce(v_pmin, 1) then v_pmax := null; end if;
  v_prep := case when coalesce(d #>> '{fields,preparation_minutes}', '') ~ '^[0-9]{1,4}$'
                  and (d #>> '{fields,preparation_minutes}')::integer > 0
                 then (d #>> '{fields,preparation_minutes}')::integer end;
  update public.catalogue_item
     set duration_minutes = v_dur, party_min = v_pmin, party_max = v_pmax,
         prep_time_minutes = coalesce(prep_time_minutes, v_prep)
   where id = p_item_id;

  -- ── discount: one promotion for this item, replaced on every save
  delete from public.merchant_promotion where setup_item_id = p_item_id;
  if (d #>> '{discount,enabled}') = 'true' then
    v_disc_kind := case d #>> '{discount,kind}' when 'percentage' then 'percent' when 'amount' then 'amount' end;
    v_disc_value := case when coalesce(d #>> '{discount,value}', '') ~ '^[0-9]{1,7}$'
                         then (d #>> '{discount,value}')::integer end;
    v_starts := case when coalesce(d #>> '{discount,startsAt}', '') ~ '^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$'
                     then (d #>> '{discount,startsAt}')::timestamp at time zone 'Africa/Nairobi' end;
    -- An end date alone means the end of that day in Nairobi.
    v_ends := case when coalesce(d #>> '{discount,endsAt}', '') ~ '^\d{4}-\d{2}-\d{2}$'
                   then ((d #>> '{discount,endsAt}')::date + 1)::timestamp at time zone 'Africa/Nairobi'
                   when coalesce(d #>> '{discount,endsAt}', '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$'
                   then (d #>> '{discount,endsAt}')::timestamp at time zone 'Africa/Nairobi' end;
    if v_disc_kind is null or v_disc_value is null or v_disc_value < 1
       or (v_disc_kind = 'percent' and v_disc_value > 90)
       or (v_disc_kind = 'amount' and (i.price_kes is null or v_disc_value >= i.price_kes))
       or (v_ends is not null and v_ends <= coalesce(v_starts, now())) then
      perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'discount',
        'The discount on ' || i.name || ' could not be applied: use 1 to 90% off, or an amount below the price, with the end after the start. Set it on the Promotions page.');
    elsif v_ends is null or v_ends > now() then
      insert into public.merchant_promotion (merchant_id, name, kind, value, catalogue_item_id,
                                             starts_at, ends_at, status, setup_item_id)
      values (i.merchant_id, left(i.name, 70) || ' offer', v_disc_kind, v_disc_value, p_item_id,
              coalesce(v_starts, now()), v_ends, 'active', p_item_id);
    end if;
  end if;

  -- ── bundle: the items it contains. A part saved after the bundle joins it
  --    when the bundle is next saved.
  delete from public.catalogue_bundle_item where item_id = p_item_id;
  if jsonb_typeof(d -> 'bundleItems') = 'array' and jsonb_array_length(d -> 'bundleItems') > 0 then
    insert into public.catalogue_bundle_item (item_id, component_item_id, quantity, sort)
    select p_item_id, sd.item_id,
           case when coalesce(b.x ->> 'quantity', '') ~ '^[0-9]{1,2}$' and (b.x ->> 'quantity')::integer >= 1
                then (b.x ->> 'quantity')::smallint else 1 end,
           b.n::smallint
      from jsonb_array_elements(d -> 'bundleItems') with ordinality as b(x, n)
      join public.merchant_setup_offering_detail sd
        on sd.merchant_id = i.merchant_id
       and sd.data ->> 'id' = b.x ->> 'offeringId'
       and sd.item_id <> p_item_id
    on conflict do nothing;
    get diagnostics v_n = row_count;
    if v_n < jsonb_array_length(d -> 'bundleItems') then
      perform public.fn_setup_review_add(i.merchant_id, p_item_id, 'bundle',
        'Some parts of the bundle ' || i.name || ' are not saved as offerings yet, so customers see only the parts that are. Save them, then save the bundle again.');
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
