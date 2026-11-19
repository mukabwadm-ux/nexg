-- What a merchant entered in the offerings editor reaches the catalogue the
-- apps read: versions with their own price and stock, choice groups with extra
-- prices, and a per-kg unit. Anything that cannot be converted exactly is
-- listed for the merchant instead. Saving again replaces only what was carried
-- over, never what the merchant set on the Menu page.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1190000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner119@example.test', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1190000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'outsider119@example.test', now(), now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, explore_visible,
                             accepting_orders, went_live_at, answers)
values ('c1190000-0000-4000-8000-00000000000a', '[Legal 119] Ltd', '[Cafe 119]', 'restaurant',
        '[Contact]', '+254700011900', 'cafe119@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days',
        '{"cafe_drink_sizes": ["Small", "Regular", "Large"], "cafe_milk_options": "none"}'::jsonb);
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1190000-0000-4000-8000-00000000000a', 'c1190000-0000-4000-8000-000000000001', 'owner');
insert into public.catalogue_section (id, merchant_id, name)
values ('c1190000-0000-4000-8000-0000000000b1', 'c1190000-0000-4000-8000-00000000000a', '[Menu]');

-- Five items saved through the editor, plus one already set on the Menu page.
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available) values
  ('c1190000-0000-4000-8000-0000000000c1', 'c1190000-0000-4000-8000-0000000000b1', 'c1190000-0000-4000-8000-00000000000a', '[Latte]', 300, true),
  ('c1190000-0000-4000-8000-0000000000c2', 'c1190000-0000-4000-8000-0000000000b1', 'c1190000-0000-4000-8000-00000000000a', '[Beef]', 900, true),
  ('c1190000-0000-4000-8000-0000000000c3', 'c1190000-0000-4000-8000-0000000000b1', 'c1190000-0000-4000-8000-00000000000a', '[Cake]', 500, true),
  ('c1190000-0000-4000-8000-0000000000c4', 'c1190000-0000-4000-8000-0000000000b1', 'c1190000-0000-4000-8000-00000000000a', '[Facial]', null, true),
  ('c1190000-0000-4000-8000-0000000000c5', 'c1190000-0000-4000-8000-0000000000b1', 'c1190000-0000-4000-8000-00000000000a', '[Shirt]', 1500, true);

create function pg_temp.offering(p_item text, p_extra jsonb) returns jsonb language sql as $f$
  select jsonb_build_object('id', p_item, 'profileId', 'cafe', 'schemaId', 'PRODUCT_CATALOG_V1',
    'name', 'x', 'description', '', 'price', '300', 'priceMode', 'fixed', 'unit', '',
    'publication', 'draft', 'version', 0, 'fields', '{}'::jsonb, 'attributes', '{}'::jsonb,
    'resources', '[]'::jsonb, 'sources', '{"details":"nexg","price":"nexg","availability":"nexg"}'::jsonb,
    'history', '[]'::jsonb, 'variants', '[]'::jsonb) || p_extra
$f$;

-- Latte: three sizes with their own price (one counted), and an extras group.
insert into public.merchant_setup_offering_detail (item_id, merchant_id, version, data)
values ('c1190000-0000-4000-8000-0000000000c1', 'c1190000-0000-4000-8000-00000000000a', 1,
  pg_temp.offering('c1190000-0000-4000-8000-0000000000c1', '{
    "variants": [{"id":"v1","name":"Small","sku":"L-S","price":"250"},
                 {"id":"v2","name":"Regular","sku":"","price":"300","stock":12},
                 {"id":"v3","name":"Large","sku":"","price":"350.00"}],
    "optionGroups": [{"id":"g1","name":"Extras","minimum":0,"maximum":2,
                      "choices":[{"id":"x1","name":"Oat milk","extra":"50","variantIds":[]},
                                 {"id":"x2","name":"Extra shot","extra":"80.50","variantIds":[]},
                                 {"id":"x3","name":"Cinnamon","extra":"","variantIds":[]}]},
                     {"id":"g2","name":"Cup","minimum":1,"maximum":1,
                      "choices":[{"id":"y1","name":"Ceramic","extra":"0","variantIds":["v2"]}]}]}'::jsonb));

-- ── versions
select is((select count(*)::int from public.catalogue_variant
            where item_id = 'c1190000-0000-4000-8000-0000000000c1' and archived_at is null), 3,
  'The three sizes become versions.');
select is((select price_kes from public.catalogue_variant v
            join public.catalogue_attribute_value av on av.id = v.value_ids[1]
           where v.item_id = 'c1190000-0000-4000-8000-0000000000c1' and av.name = 'Large' and v.archived_at is null), 350,
  'Each keeps its own price.');
select is((select stock_count from public.catalogue_variant v
            join public.catalogue_attribute_value av on av.id = v.value_ids[1]
           where v.item_id = 'c1190000-0000-4000-8000-0000000000c1' and av.name = 'Regular' and v.archived_at is null), 12,
  'And its stock count, when the shop gave one.');
select is((select sku from public.catalogue_variant v
            join public.catalogue_attribute_value av on av.id = v.value_ids[1]
           where v.item_id = 'c1190000-0000-4000-8000-0000000000c1' and av.name = 'Small' and v.archived_at is null), 'L-S',
  'And its shop code.');

-- ── choices
select is((select string_agg(o.name || '=' || o.extra_cents, ',' order by o.sort)
             from public.modifier_option o join public.modifier_group g on g.id = o.group_id
            where g.setup_item_id = 'c1190000-0000-4000-8000-0000000000c1' and g.name = 'Extras'),
  'Oat milk=5000,Extra shot=8050,Cinnamon=0', 'The extras become a choice group with their extra prices.');
select is((select max_choices::int from public.modifier_group
            where setup_item_id = 'c1190000-0000-4000-8000-0000000000c1' and name = 'Extras'), 2,
  'Up to two, as the shop said.');
set local role anon;
select is((select count(*)::int from public.catalogue_option_public where item_id = 'c1190000-0000-4000-8000-0000000000c1'), 1,
  'The app sees the extras on the item.');
select is((select jsonb_array_length(variants) from public.catalogue_variant_public
            where item_id = 'c1190000-0000-4000-8000-0000000000c1'), 3, 'And the three versions.');
reset role;
select ok(not exists (select 1 from public.modifier_group
                       where setup_item_id = 'c1190000-0000-4000-8000-0000000000c1' and name = 'Cup')
          and exists (select 1 from public.catalogue_setup_review
                       where item_id = 'c1190000-0000-4000-8000-0000000000c1' and kind = 'variant_limited_choice'),
  'A choice that applies to only some sizes is not guessed; the shop is asked to set it up.');

-- ── saving again replaces only what was carried over
update public.merchant_setup_offering_detail
   set data = pg_temp.offering('c1190000-0000-4000-8000-0000000000c1', '{
     "variants": [{"id":"v1","name":"Small","sku":"","price":"260"},{"id":"v2","name":"Regular","sku":"","price":"310"}],
     "optionGroups": [{"id":"g1","name":"Extras","minimum":0,"maximum":1,
                       "choices":[{"id":"x1","name":"Oat milk","extra":"60","variantIds":[]}]}]}'::jsonb)
 where item_id = 'c1190000-0000-4000-8000-0000000000c1';
select is((select count(*)::int from public.catalogue_variant
            where item_id = 'c1190000-0000-4000-8000-0000000000c1' and archived_at is null), 2,
  'Saving the editor again leaves exactly the versions it now lists.');
select is((select count(*)::int from public.modifier_group where setup_item_id = 'c1190000-0000-4000-8000-0000000000c1'), 1,
  'And one extras group, not two.');
select is((select o.extra_cents from public.modifier_option o join public.modifier_group g on g.id = o.group_id
            where g.setup_item_id = 'c1190000-0000-4000-8000-0000000000c1'), 6000::bigint, 'At the new price.');
select is((select count(*)::int from public.catalogue_setup_review
            where item_id = 'c1190000-0000-4000-8000-0000000000c1' and resolved_at is null), 0,
  'The earlier review line goes once the editor no longer has the problem.');

-- ── per kg
insert into public.merchant_setup_offering_detail (item_id, merchant_id, version, data)
values ('c1190000-0000-4000-8000-0000000000c2', 'c1190000-0000-4000-8000-00000000000a', 1,
  pg_temp.offering('c1190000-0000-4000-8000-0000000000c2',
    '{"priceMode":"unit","unit":"kg","quantityRules":{"minimum":"0.5","maximum":"5","precision":1}}'::jsonb));
select is((select sold_by || '/' || unit_label || '/' || unit_step::text || '/' || unit_min::text || '/' || unit_max::text
             from public.catalogue_item where id = 'c1190000-0000-4000-8000-0000000000c2'),
  'weight/kg/0.100/0.500/5.000', 'A per-kg price becomes a weighed item, in the shop''s steps and limits.');

-- ── what is left to the shop
insert into public.merchant_setup_offering_detail (item_id, merchant_id, version, data)
values ('c1190000-0000-4000-8000-0000000000c3', 'c1190000-0000-4000-8000-00000000000a', 1,
  pg_temp.offering('c1190000-0000-4000-8000-0000000000c3',
    '{"variants":[{"id":"a","name":"Slice","sku":"","price":"about 200"},{"id":"b","name":"Whole","sku":"","price":"1800"}],
      "imageStoragePath":"c1190000-0000-4000-8000-00000000000a/c1190000-0000-4000-8000-0000000000c3/cake.jpg"}'::jsonb));
select ok(not exists (select 1 from public.catalogue_variant where item_id = 'c1190000-0000-4000-8000-0000000000c3')
          and exists (select 1 from public.catalogue_setup_review
                       where item_id = 'c1190000-0000-4000-8000-0000000000c3' and kind = 'variant_price'),
  'A version priced "about 200" is not guessed; none are made and the shop is asked.');
select ok(exists (select 1 from public.catalogue_setup_review
                   where item_id = 'c1190000-0000-4000-8000-0000000000c3' and kind = 'photo'),
  'A photo left in the editor is listed to add on the Menu page.');

insert into public.merchant_setup_offering_detail (item_id, merchant_id, version, data)
values ('c1190000-0000-4000-8000-0000000000c4', 'c1190000-0000-4000-8000-00000000000a', 1,
  pg_temp.offering('c1190000-0000-4000-8000-0000000000c4',
    '{"schemaId":"SERVICE_APPOINTMENT_V1","priceMode":"quote","unit":"appointment"}'::jsonb));
select is((select string_agg(kind, ',' order by kind) from public.catalogue_setup_review
            where item_id = 'c1190000-0000-4000-8000-0000000000c4' and resolved_at is null),
  'booking_kind,price_on_request', 'A booked service with its price on request is listed, not changed.');
select is((select kind::text from public.catalogue_item where id = 'c1190000-0000-4000-8000-0000000000c4'), 'buy',
  'Its kind is left for the shop to choose.');

-- The Menu page already set the shirt's sizes: the editor's are not applied.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1190000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_merchant_item_variants_save('c1190000-0000-4000-8000-0000000000c5',
  '{"attributes":[{"name":"Size","values":["M"]}],"variants":[{"values":["M"],"price_kes":1500}]}');
reset role;
insert into public.merchant_setup_offering_detail (item_id, merchant_id, version, data)
values ('c1190000-0000-4000-8000-0000000000c5', 'c1190000-0000-4000-8000-00000000000a', 1,
  pg_temp.offering('c1190000-0000-4000-8000-0000000000c5',
    '{"variants":[{"id":"a","name":"S","sku":"","price":"1400"},{"id":"b","name":"XL","sku":"","price":"1700"}]}'::jsonb));
select is((select string_agg(av.name, ',') from public.catalogue_variant v
             join public.catalogue_attribute_value av on av.id = v.value_ids[1]
            where v.item_id = 'c1190000-0000-4000-8000-0000000000c5' and v.archived_at is null), 'M',
  'What the shop set on the Menu page wins.');
select ok(exists (select 1 from public.catalogue_setup_review
                   where item_id = 'c1190000-0000-4000-8000-0000000000c5' and kind = 'menu_already_set'),
  'And the shop is told the editor''s sizes were not applied.');

-- ── onboarding answers, once
select public.fn_setup_review_from_onboarding();
select is((select count(*)::int from public.catalogue_setup_review
            where merchant_id = 'c1190000-0000-4000-8000-00000000000a' and kind = 'onboarding_answer'), 1,
  'The drink sizes from sign-up are listed once; "none" for milk is not.');
select ok((select message like '%Small, Regular, Large%' from public.catalogue_setup_review
            where merchant_id = 'c1190000-0000-4000-8000-00000000000a' and kind = 'onboarding_answer'),
  'With the sizes the shop gave.');

-- ── the shop clears a line
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1190000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(format('select public.rpc_merchant_setup_review_dismiss(%L)',
  (select id from public.catalogue_setup_review where kind = 'onboarding_answer'
     and merchant_id = 'c1190000-0000-4000-8000-00000000000a')),
  '42501', null, 'Nobody outside the shop can clear it.');
select set_config('request.jwt.claims', '{"sub":"c1190000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.rpc_merchant_setup_review_dismiss(
  (select id from public.catalogue_setup_review where kind = 'onboarding_answer'
     and merchant_id = 'c1190000-0000-4000-8000-00000000000a')) ->> 'ok', 'true', 'The shop clears it.');
reset role;

select * from finish();
rollback;
