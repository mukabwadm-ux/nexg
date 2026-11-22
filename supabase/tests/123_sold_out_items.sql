-- Sold out is not off the menu: a sold-out item stays listed for the apps,
-- marked sold out, while catalogue_public and checkout leave it out. Items
-- off the menu (and drafts) stay hidden everywhere.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1230000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner123@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1230000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'outsider123@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1230000-0000-4000-8000-00000000000a', '[Legal 123] Ltd', '[Bakery 123]', 'restaurant',
        '[Contact]', '+254700012300', 'bakery123@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1230000-0000-4000-8000-00000000000a', 'c1230000-0000-4000-8000-000000000001', 'owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1230000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1230000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 123]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

insert into public.catalogue_section (id, merchant_id, name)
values ('c1230000-0000-4000-8000-0000000000c1', 'c1230000-0000-4000-8000-00000000000a', '[Cakes]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sold_out, age_restricted, sort) values
  ('c1230000-0000-4000-8000-0000000000d1', 'c1230000-0000-4000-8000-00000000000a',
   'c1230000-0000-4000-8000-0000000000c1', '[Bread]', 200, true, false, false, 1),
  ('c1230000-0000-4000-8000-0000000000d2', 'c1230000-0000-4000-8000-00000000000a',
   'c1230000-0000-4000-8000-0000000000c1', '[Cake]', 1500, true, true, false, 2),
  ('c1230000-0000-4000-8000-0000000000d3', 'c1230000-0000-4000-8000-00000000000a',
   'c1230000-0000-4000-8000-0000000000c1', '[Draft]', 900, false, false, false, 3),
  ('c1230000-0000-4000-8000-0000000000d4', 'c1230000-0000-4000-8000-00000000000a',
   'c1230000-0000-4000-8000-0000000000c1', '[Rum cake]', 1800, true, false, true, 4);

create function pg_temp.basket(p_item text) returns jsonb language sql as $f$
  select jsonb_build_object('merchant_id', 'c1230000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk', 'lat', -1.4000, 'lng', 36.6000,
    'guest_phone', '+254700012399', 'guest_name', '[Buyer]', 'dropoff_label', '[Home]',
    'items', jsonb_build_array(jsonb_build_object('catalogue_item_id', p_item, 'quantity', 1)))
$f$;

-- ── the column

select has_column('public', 'catalogue_item', 'sold_out', 'An item can be marked sold out.');
select col_default_is('public', 'catalogue_item', 'sold_out', 'false', 'Items are in stock unless marked.');

-- ── what a visitor sees

set local role anon;
select is(array(select name from public.catalogue_menu_public
                 where merchant_id = 'c1230000-0000-4000-8000-00000000000a' order by sort),
          array['[Bread]', '[Cake]'],
  'The apps'' list shows sold-out items, but not items off the menu or a rum cake without a licence.');
select ok((select sold_out from public.catalogue_menu_public where id = 'c1230000-0000-4000-8000-0000000000d2')
          and not (select sold_out from public.catalogue_menu_public where id = 'c1230000-0000-4000-8000-0000000000d1'),
  'It says which items are sold out.');
select is(array(select name from public.catalogue_public
                 where merchant_id = 'c1230000-0000-4000-8000-00000000000a' order by sort),
          array['[Bread]'],
  'catalogue_public still leaves sold-out items out, for the readers that never see sold_out.');
reset role;

select columns_are('public', 'catalogue_public', array[
  'id', 'merchant_id', 'section_id', 'name', 'description', 'price_kes', 'available',
  'age_restricted', 'highlighted', 'sort', 'photo_path', 'gallery_paths', 'kind',
  'booking_offering_id', 'sold_by', 'unit_label', 'unit_step', 'unit_min', 'unit_max',
  'price_is_estimate', 'has_options', 'has_variants'],
  'catalogue_public keeps exactly the columns it had.');
select is(array(select column_name::text from information_schema.columns
                 where table_schema = 'public' and table_name = 'catalogue_menu_public'
                 order by ordinal_position limit 23), array[
  'id', 'merchant_id', 'section_id', 'name', 'description', 'price_kes', 'available',
  'age_restricted', 'highlighted', 'sort', 'photo_path', 'gallery_paths', 'kind',
  'booking_offering_id', 'sold_by', 'unit_label', 'unit_step', 'unit_min', 'unit_max',
  'price_is_estimate', 'has_options', 'has_variants', 'sold_out'],
  'The apps'' list starts with catalogue_public''s columns, then sold_out.');
select ok(has_table_privilege('anon', 'public.catalogue_menu_public', 'select')
          and has_table_privilege('authenticated', 'public.catalogue_menu_public', 'select'),
  'Visitors and signed-in customers can read the apps'' list.');

-- ── checkout

set local role anon;
select is(public.rpc_order_quote_web(pg_temp.basket('c1230000-0000-4000-8000-0000000000d2')) ->> 'message',
  '[Cake] is sold out.', 'A sold-out item is refused, by name.');
select is(public.rpc_order_quote_web(pg_temp.basket('c1230000-0000-4000-8000-0000000000d1')) ->> 'ok',
  'true', 'An item in stock still sells.');
select is(public.rpc_order_quote_web(pg_temp.basket('c1230000-0000-4000-8000-0000000000d3')) ->> 'message',
  'Something in your basket is no longer available. Review it and try again.',
  'An item off the menu is refused as before.');
reset role;

-- ── who can mark it

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1230000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update public.catalogue_item set sold_out = false where id = 'c1230000-0000-4000-8000-0000000000d2';
reset role;
select ok((select sold_out from public.catalogue_item where id = 'c1230000-0000-4000-8000-0000000000d2'),
  'Someone outside the shop cannot change it.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1230000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.catalogue_item set sold_out = false where id = 'c1230000-0000-4000-8000-0000000000d2';
reset role;
select ok(not (select sold_out from public.catalogue_item where id = 'c1230000-0000-4000-8000-0000000000d2'),
  'The shop marks it back in stock.');

set local role anon;
select is(array(select name from public.catalogue_public
                 where merchant_id = 'c1230000-0000-4000-8000-00000000000a' order by sort),
          array['[Bread]', '[Cake]'], 'Back in stock, it is listed everywhere again.');
select is(public.rpc_order_quote_web(pg_temp.basket('c1230000-0000-4000-8000-0000000000d2')) ->> 'ok',
  'true', 'And it sells again.');
reset role;

-- An item off the menu is hidden even if it was also marked sold out.
update public.catalogue_item set sold_out = true where id = 'c1230000-0000-4000-8000-0000000000d3';
set local role anon;
select is((select count(*)::int from public.catalogue_menu_public
            where id = 'c1230000-0000-4000-8000-0000000000d3'), 0,
  'Off the menu wins over sold out.');
reset role;

select * from finish();
rollback;
