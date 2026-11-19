-- Versions of an item with their own price and stock: the shop saves the grid,
-- the public sees it, checkout prices and refuses by version, the order keeps
-- what was chosen, counted stock is set aside and put back on cancel.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner113@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'outsider113@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1130000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', null, null, true, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1130000-0000-4000-8000-00000000000a', '[Legal 113] Ltd', '[Shoes 113]', 'restaurant',
        '[Contact]', '+254700011300', 'shoes113@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1130000-0000-4000-8000-00000000000a', 'c1130000-0000-4000-8000-000000000001', 'owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1130000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1130000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 113]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

insert into public.catalogue_section (id, merchant_id, name)
values ('c1130000-0000-4000-8000-0000000000c1', 'c1130000-0000-4000-8000-00000000000a', '[Shoes]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort) values
  ('c1130000-0000-4000-8000-0000000000d1', 'c1130000-0000-4000-8000-00000000000a',
   'c1130000-0000-4000-8000-0000000000c1', '[Trainer]', 3000, true, 1),
  ('c1130000-0000-4000-8000-0000000000d2', 'c1130000-0000-4000-8000-00000000000a',
   'c1130000-0000-4000-8000-0000000000c1', '[Laces]', 200, true, 2);

-- ── the shop saves a size × colour grid

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.rpc_merchant_item_variants_save('c1130000-0000-4000-8000-0000000000d1',
  '{"attributes":[{"name":"Size","values":["40"]}],"variants":[{"values":["40"],"price_kes":1}]}')$$,
  '42501', null, 'Someone outside the shop cannot set versions.');

select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.rpc_merchant_item_variants_save('c1130000-0000-4000-8000-0000000000d1',
  '{"attributes":[{"name":"Size","values":["40"]}],"variants":[{"values":["41"],"price_kes":3000}]}')$$,
  '22023', null, 'A version must use the values listed.');
select throws_ok($$select public.rpc_merchant_item_variants_save('c1130000-0000-4000-8000-0000000000d1',
  '{"attributes":[{"name":"Size","values":["40"]}],"variants":[{"values":["40"],"price_kes":3000},{"values":["40"],"price_kes":3100}]}')$$,
  '22023', null, 'The same version can''t be listed twice.');
select throws_ok($$select public.rpc_merchant_item_variants_save('c1130000-0000-4000-8000-0000000000d1',
  '{"attributes":[{"name":"A","values":["1"]},{"name":"B","values":["1"]},{"name":"C","values":["1"]},{"name":"D","values":["1"]}],"variants":[]}')$$,
  '22023', null, 'At most three things vary.');

select lives_ok($$select public.rpc_merchant_item_variants_save('c1130000-0000-4000-8000-0000000000d1',
  '{"attributes":[{"name":"Size","values":["40","41"]},{"name":"Colour","values":["Black","White"]}],
    "variants":[
      {"values":["40","Black"],"price_kes":3000},
      {"values":["40","White"],"price_kes":3200,"stock_count":2,"sku":"TR-40-W"},
      {"values":["41","Black"],"price_kes":3000,"available":false}
    ]}')$$, 'The shop saves sizes and colours, each with its own price.');
reset role;

insert into t select 'black40', id::text from public.catalogue_variant
 where item_id = 'c1130000-0000-4000-8000-0000000000d1' and (select string_agg(av.name, ' / ' order by a.sort) from public.catalogue_attribute_value av join public.catalogue_attribute a on a.id = av.attribute_id where av.id = any (value_ids)) = '40 / Black';
insert into t select 'white40', id::text from public.catalogue_variant
 where item_id = 'c1130000-0000-4000-8000-0000000000d1' and (select string_agg(av.name, ' / ' order by a.sort) from public.catalogue_attribute_value av join public.catalogue_attribute a on a.id = av.attribute_id where av.id = any (value_ids)) = '40 / White';
insert into t select 'black41', id::text from public.catalogue_variant
 where item_id = 'c1130000-0000-4000-8000-0000000000d1' and (select string_agg(av.name, ' / ' order by a.sort) from public.catalogue_attribute_value av join public.catalogue_attribute a on a.id = av.attribute_id where av.id = any (value_ids)) = '41 / Black';
select is((select count(*)::int from t where k in ('black40', 'white40', 'black41')), 3,
  'Three versions exist, labelled size then colour.');

-- ── what a visitor sees

set local role anon;
select ok((select has_variants from public.catalogue_public where id = 'c1130000-0000-4000-8000-0000000000d1')
          and not (select has_variants from public.catalogue_public where id = 'c1130000-0000-4000-8000-0000000000d2'),
  'The item list says which items come in versions.');
select is((select jsonb_array_length(attributes) from public.catalogue_variant_public
            where item_id = 'c1130000-0000-4000-8000-0000000000d1'), 2, 'Two things vary.');
select is((select attributes -> 0 ->> 'name' from public.catalogue_variant_public
            where item_id = 'c1130000-0000-4000-8000-0000000000d1'), 'Size', 'Size comes first.');
select is((select jsonb_array_length(variants) from public.catalogue_variant_public
            where item_id = 'c1130000-0000-4000-8000-0000000000d1'), 3, 'Three versions are listed.');
select is((select (v ->> 'available')::boolean from public.catalogue_variant_public p,
                  jsonb_array_elements(p.variants) v
            where p.item_id = 'c1130000-0000-4000-8000-0000000000d1' and v ->> 'label' = '41 / Black'),
  false, 'A sold-out version shows as not available.');
select is((select price_from_cents from public.catalogue_variant_public
            where item_id = 'c1130000-0000-4000-8000-0000000000d1'), 300000::bigint,
  'The lowest price you can buy at is shown.');
select throws_ok($$select count(*) from public.catalogue_variant$$, '42501', null,
  'The table itself is not public; stock counts and shop codes stay with the shop.');

-- ── checkout

create function pg_temp.basket(p_variant text, p_qty int default 1) returns jsonb language sql as $f$
  select jsonb_build_object('merchant_id', 'c1130000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk', 'lat', -1.4000, 'lng', 36.6000,
    'guest_phone', '+254700011399', 'guest_name', '[Buyer]', 'dropoff_label', '[Home]',
    'items', jsonb_build_array(
      jsonb_strip_nulls(jsonb_build_object('catalogue_item_id', 'c1130000-0000-4000-8000-0000000000d1',
                                           'quantity', p_qty, 'variant_id', p_variant))))
$f$;

select is(public.rpc_order_quote_web(pg_temp.basket(null)) ->> 'message', 'Choose Size and Colour first.',
  'An item with versions needs one chosen.');
select is(public.rpc_order_quote_web(pg_temp.basket((select v from t where k = 'black41'))) ->> 'message',
  '41 / Black is sold out.', 'A sold-out version is refused, by name.');
select is(public.rpc_order_quote_web(pg_temp.basket((select v from t where k = 'white40'), 3)) ->> 'message',
  'Only 2 left of [Trainer] (40 / White).', 'Asking for more than are left is refused.');
select is((public.rpc_order_quote_web(pg_temp.basket((select v from t where k = 'white40'), 2)) -> 'lines' -> 0 ->> 'unit_price_cents')::bigint,
  320000::bigint, 'The line is priced at the version''s own price.');
select is(public.rpc_order_quote_web(pg_temp.basket((select v from t where k = 'white40'), 2)) -> 'lines' -> 0 ->> 'variant_label',
  '40 / White', 'The quote says which version.');
select ok(public.rpc_order_quote_web(jsonb_set(pg_temp.basket(null), '{items,0,catalogue_item_id}',
            '"c1130000-0000-4000-8000-0000000000d2"')) ->> 'ok' = 'true',
  'An item without versions still sells as before.');
reset role;

-- A guest buys the last two white 40s.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
insert into t select 'order', public.rpc_order_place_web(pg_temp.basket((select v from t where k = 'white40'), 2)) ->> 'order_id';
select is((select variant_label from public.order_item where order_id = (select v::uuid from t where k = 'order')),
  '40 / White', 'The order keeps the version chosen.');
reset role;

select is((select stock_count from public.catalogue_variant where id = (select v::uuid from t where k = 'white40')),
  0, 'The two are set aside.');
set local role anon;
select is(public.rpc_order_quote_web(pg_temp.basket((select v from t where k = 'white40'))) ->> 'message',
  '40 / White is sold out.', 'Nobody else can buy them.');
reset role;

update public.order set stage = 'cancelled', cancelled_at = now(), cancel_reason_code = 'account_deleted'
 where id = (select v::uuid from t where k = 'order');
select is((select stock_count from public.catalogue_variant where id = (select v::uuid from t where k = 'white40')),
  2, 'Cancelling the order puts them back.');

-- ── changing the grid

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1130000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_merchant_item_variants_save('c1130000-0000-4000-8000-0000000000d1',
  '{"attributes":[{"name":"Size","values":["40"]},{"name":"Colour","values":["Black"]}],
    "variants":[{"values":["40","Black"],"price_kes":2900}]}');
reset role;
select is((select price_kes from public.catalogue_variant where id = (select v::uuid from t where k = 'black40')),
  2900, 'A version kept keeps its id and takes the new price; ones left out stop being sold.');

select * from finish();
rollback;
