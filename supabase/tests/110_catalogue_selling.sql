-- What the app needs to show and sell an item: kind, unit, photos, choices
-- and add-ons, priced at checkout and kept on the order.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'shop110@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'other110@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1100000-0000-4000-8000-00000000000a', '[Legal 110] Ltd', '[Shop 110]', 'restaurant',
        '[Contact]', '+254700011000', 'shop110@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1100000-0000-4000-8000-00000000000a', 'c1100000-0000-4000-8000-000000000002', 'owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1100000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c1100000-0000-4000-8000-0000000000b1', 'c1100000-0000-4000-8000-00000000000a', 'Menu');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available, photo_path)
values ('c1100000-0000-4000-8000-0000000000c1', 'c1100000-0000-4000-8000-0000000000b1',
        'c1100000-0000-4000-8000-00000000000a', 'Burger', 600, true,
        'c1100000-0000-4000-8000-00000000000a/burger.jpg');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available,
                                   sold_by, unit_label, unit_step, unit_min, unit_max, price_is_estimate)
values ('c1100000-0000-4000-8000-0000000000c2', 'c1100000-0000-4000-8000-0000000000b1',
        'c1100000-0000-4000-8000-00000000000a', 'Beef', 800, true,
        'weight', 'kg', 0.5, 0.5, 3, true);
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available, kind, booking_offering_id)
values ('c1100000-0000-4000-8000-0000000000c3', 'c1100000-0000-4000-8000-0000000000b1',
        'c1100000-0000-4000-8000-00000000000a', 'Chef''s table', 5000, true, 'table', 'offering-110');
insert into public.catalogue_photo (item_id, storage_path, status)
values ('c1100000-0000-4000-8000-0000000000c1', 'c1100000-0000-4000-8000-00000000000a/burger-2.jpg', 'published'),
       ('c1100000-0000-4000-8000-0000000000c1', 'c1100000-0000-4000-8000-00000000000a/burger-3.jpg', 'pending');
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1100000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 110]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

create function pg_temp.basket(p_items jsonb) returns jsonb language sql as $$
  select jsonb_build_object('merchant_id', 'c1100000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk', 'items', p_items,
    'guest_phone', '+254700011010', 'dropoff_label', '[Home]', 'lat', -1.4000, 'lng', 36.6000)
$$;

-- ── a bad value is refused by the table itself

select throws_ok($$update public.catalogue_item set sold_by = 'weight', unit_label = null
                    where id = 'c1100000-0000-4000-8000-0000000000c1'$$,
  '23514', null, 'Sold by weight needs a unit.');
select throws_ok($$update public.catalogue_item set booking_offering_id = 'x'
                    where id = 'c1100000-0000-4000-8000-0000000000c1'$$,
  '23514', null, 'A basket item does not name a booking offering.');

-- ── the shop writes its choices

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.rpc_merchant_option_group_save('c1100000-0000-4000-8000-00000000000a',
                    '{"name":"Size","options":[{"name":"Small"}]}')$$,
  '42501', null, 'Nobody outside the shop can write its groups.');

select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select set_config('t.size', public.rpc_merchant_option_group_save('c1100000-0000-4000-8000-00000000000a',
  '{"name":"Size","required":true,"max_choices":1,
    "options":[{"name":"Single","extra_cents":0},{"name":"Double","extra_cents":25000}]}') ->> 'group_id', true);
select set_config('t.extras', public.rpc_merchant_option_group_save('c1100000-0000-4000-8000-00000000000a',
  '{"name":"Extras","max_choices":2,
    "options":[{"name":"Cheese","extra_cents":5000},{"name":"Bacon","extra_cents":10000},
               {"name":"Egg","extra_cents":5000,"available":false}]}') ->> 'group_id', true);
select ok(current_setting('t.size') <> '' and current_setting('t.extras') <> '', 'The shop saves two groups.');
select is((public.rpc_merchant_item_option_groups_set('c1100000-0000-4000-8000-0000000000c1',
             array[current_setting('t.size')::uuid, current_setting('t.extras')::uuid]) ->> 'ok')::boolean,
  true, 'And puts them on the burger.');
reset role;

-- Option ids, read now: visitors cannot read the option tables themselves.
select set_config('t.opt.' || o.name, o.id::text, true)
  from public.modifier_option o
 where o.group_id in (current_setting('t.size')::uuid, current_setting('t.extras')::uuid);
create function pg_temp.opt(p_name text) returns text language sql as $$
  select current_setting('t.opt.' || p_name)
$$;

-- ── what a visitor sees

set local role anon;
select is((select photo_path from public.catalogue_public where id = 'c1100000-0000-4000-8000-0000000000c1'),
  'c1100000-0000-4000-8000-00000000000a/burger.jpg', 'The cover photo is public.');
select is((select gallery_paths from public.catalogue_public where id = 'c1100000-0000-4000-8000-0000000000c1'),
  array['c1100000-0000-4000-8000-00000000000a/burger-2.jpg'], 'So is the published gallery, not the pending photo.');
select is((select kind from public.catalogue_public where id = 'c1100000-0000-4000-8000-0000000000c3'),
  'table', 'Each item says what it is.');
select is((select booking_offering_id from public.catalogue_public where id = 'c1100000-0000-4000-8000-0000000000c3'),
  'offering-110', 'And a bookable one names its booking offering.');
select is((select array[sold_by, unit_label, unit_step::text] from public.catalogue_public
            where id = 'c1100000-0000-4000-8000-0000000000c2'),
  array['weight', 'kg', '0.500'], 'A weighed item says how it is sold.');
select is((select has_options from public.catalogue_public where id = 'c1100000-0000-4000-8000-0000000000c1'),
  true, 'The burger says it has choices.');
select is((select array_agg(group_name || ':' || min_choices || '-' || max_choices order by sort)
             from public.catalogue_option_public where item_id = 'c1100000-0000-4000-8000-0000000000c1'),
  array['Size:1-1', 'Extras:0-2'], 'Its groups, with the fewest and most a customer may choose.');
select is((select jsonb_array_length(options) from public.catalogue_option_public
            where item_id = 'c1100000-0000-4000-8000-0000000000c1' and group_name = 'Extras'),
  3, 'And their options, priced, the unavailable one marked.');
reset role;
select ok(authz.catalogue_image_is_public('c1100000-0000-4000-8000-00000000000a/burger-2.jpg')
          and not authz.catalogue_image_is_public('c1100000-0000-4000-8000-00000000000a/burger-3.jpg'),
  'A published gallery photo can be fetched from storage; a pending one cannot.');

-- ── checkout

set local role anon;
select is(public.rpc_order_quote_web(pg_temp.basket(jsonb_build_array(jsonb_build_object(
    'catalogue_item_id', 'c1100000-0000-4000-8000-0000000000c1', 'quantity', 1)))) ->> 'message',
  'Choose Size first.', 'A required choice must be made.');
select is(public.rpc_order_quote_web(pg_temp.basket(jsonb_build_array(jsonb_build_object(
    'catalogue_item_id', 'c1100000-0000-4000-8000-0000000000c1', 'quantity', 1,
    'options', jsonb_build_array(pg_temp.opt('Single'), pg_temp.opt('Egg')))))) ->> 'message',
  'A choice in your basket is no longer available.', 'An unavailable option is refused.');
select is(public.rpc_order_quote_web(pg_temp.basket(jsonb_build_array(jsonb_build_object(
    'catalogue_item_id', 'c1100000-0000-4000-8000-0000000000c3', 'quantity', 1)))) ->> 'message',
  'Something in your basket is booked rather than bought. Book it on its own page.',
  'A bookable item cannot go through the basket.');
select is(public.rpc_order_quote_web(pg_temp.basket(jsonb_build_array(jsonb_build_object(
    'catalogue_item_id', 'c1100000-0000-4000-8000-0000000000c2', 'quantity', 7)))) ->> 'message',
  'You can buy Beef from 0.500 to 3.000 kg.', 'A weighed amount outside its limits is refused.');

select set_config('t.q', public.rpc_order_quote_web(pg_temp.basket(jsonb_build_array(
    jsonb_build_object('catalogue_item_id', 'c1100000-0000-4000-8000-0000000000c1', 'quantity', 2,
      'options', jsonb_build_array(pg_temp.opt('Double'), pg_temp.opt('Cheese'), pg_temp.opt('Bacon'))),
    jsonb_build_object('catalogue_item_id', 'c1100000-0000-4000-8000-0000000000c2', 'quantity', 3))))::text, true);
select is(current_setting('t.q')::jsonb -> 'lines' -> 0 ->> 'unit_price_cents', '100000',
  'A burger is priced with its choices: 600 + 250 + 50 + 100.');
select is(current_setting('t.q')::jsonb -> 'lines' -> 0 ->> 'line_total_cents', '200000', 'Two of them.');
select is(current_setting('t.q')::jsonb -> 'lines' -> 1 ->> 'line_total_cents', '120000',
  'Three half-kilos of beef at 800 a kilo.');
select is(current_setting('t.q')::jsonb ->> 'subtotal_cents', '320000', 'The basket adds up.');
select is((current_setting('t.q')::jsonb ->> 'has_estimated_prices')::boolean, true,
  'And says a price is an estimate until weighed.');
reset role;

-- ── placed, and read back by the guest

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
select set_config('t.order', public.rpc_order_place_web(pg_temp.basket(jsonb_build_array(
    jsonb_build_object('catalogue_item_id', 'c1100000-0000-4000-8000-0000000000c1', 'quantity', 2,
      'options', jsonb_build_array(pg_temp.opt('Double'), pg_temp.opt('Cheese'), pg_temp.opt('Bacon'))),
    jsonb_build_object('catalogue_item_id', 'c1100000-0000-4000-8000-0000000000c2', 'quantity', 3)))) ->> 'order_id', true);
select is((select total_cents > 320000 from public.order where id = current_setting('t.order')::uuid),
  true, 'The guest places it, with fees on top.');
select is((select array_agg(m.option_name order by m.option_name)
             from public.order_item_modifier m join public.order_item oi on oi.id = m.order_item_id
            where oi.order_id = current_setting('t.order')::uuid),
  array['Bacon', 'Cheese', 'Double'], 'And reads back the choices on their order.');
select is((select unit_label || ' x' || unit_step from public.order_item
            where order_id = current_setting('t.order')::uuid and name = 'Beef'),
  'kg x0.500', 'The beef line keeps its unit for the shop.');
reset role;

select * from finish();
rollback;
