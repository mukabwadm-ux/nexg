-- Sign-up sizes, milks and combos become choice groups the shop can attach,
-- and an item that takes a message carries it through checkout to the order.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c1250000-0000-4000-8000-000000000003',
        'authenticated', 'authenticated', null, null, true, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at, answers)
values ('c1250000-0000-4000-8000-00000000000a', '[Legal 125] Ltd', '[Cafe 125]', 'restaurant',
        '[Contact]', '+254700012500', 'cafe125@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days',
        '{"cafe_milk_options":["Oat","Whole"],"cafe_drink_sizes":"Small, Medium, Large","juice_bar_sizes":"none"}');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1250000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1250000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 125]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

-- ── sign-up choices

select is(array(select g.name || ':' || (select string_agg(o.name, '/' order by o.sort)
                                           from public.modifier_option o where o.group_id = g.id)
                  from public.modifier_group g
                 where g.merchant_id = 'c1250000-0000-4000-8000-00000000000a' order by g.name),
          array['Drink size:Small/Medium/Large', 'Milk:Oat/Whole'],
  'Sizes and milks from sign-up become choice groups; an answer of "none" does not.');
select is((select count(*)::int from public.catalogue_item_modifier cim
             join public.modifier_group g on g.id = cim.group_id
            where g.merchant_id = 'c1250000-0000-4000-8000-00000000000a'), 0,
  'They are attached to nothing until the shop chooses.');
select ok((select bool_and(o.extra_cents = 0) from public.modifier_option o
             join public.modifier_group g on g.id = o.group_id
            where g.merchant_id = 'c1250000-0000-4000-8000-00000000000a'),
  'They cost nothing extra until the shop sets a price.');

update public.merchant
   set answers = answers || '{"cafe_milk_options":["Oat","Whole","Almond"],"juice_bar_sizes":["Regular","Large"]}'
 where id = 'c1250000-0000-4000-8000-00000000000a';
select is((select count(*)::int from public.modifier_group
            where merchant_id = 'c1250000-0000-4000-8000-00000000000a' and onboarding_key = 'cafe_milk_options'), 1,
  'Changing an answer does not make a second Milk group.');
select is((select count(*)::int from public.modifier_group
            where merchant_id = 'c1250000-0000-4000-8000-00000000000a' and onboarding_key = 'juice_bar_sizes'), 1,
  'A newly answered list becomes its group.');

-- ── messages

insert into public.catalogue_section (id, merchant_id, name)
values ('c1250000-0000-4000-8000-0000000000c1', 'c1250000-0000-4000-8000-00000000000a', '[Cakes]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort,
                                   message_label, message_max_length) values
  ('c1250000-0000-4000-8000-0000000000d1', 'c1250000-0000-4000-8000-00000000000a',
   'c1250000-0000-4000-8000-0000000000c1', '[Cake]', 2500, true, 1, 'Message on the cake', 20),
  ('c1250000-0000-4000-8000-0000000000d2', 'c1250000-0000-4000-8000-00000000000a',
   'c1250000-0000-4000-8000-0000000000c1', '[Bread]', 200, true, 2, null, 100);

create function pg_temp.basket(p_item text, p_message text) returns jsonb language sql as $f$
  select jsonb_build_object('merchant_id', 'c1250000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk', 'lat', -1.4000, 'lng', 36.6000,
    'guest_phone', '+254700012599', 'guest_name', '[Buyer]', 'dropoff_label', '[Home]',
    'items', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'catalogue_item_id', p_item, 'quantity', 1, 'message', p_message))))
$f$;

set local role anon;
select is((select array[message_label, message_max_length::text] from public.catalogue_menu_public
            where id = 'c1250000-0000-4000-8000-0000000000d1'), array['Message on the cake', '20'],
  'The apps see which items take a message, what to ask and how long it may be.');
select is(public.rpc_order_quote_web(pg_temp.basket('c1250000-0000-4000-8000-0000000000d1', 'Happy birthday Amani'))
            -> 'lines' -> 0 ->> 'message', 'Happy birthday Amani', 'The quote keeps the message.');
select is(public.rpc_order_quote_web(pg_temp.basket('c1250000-0000-4000-8000-0000000000d1', 'Happy 30th birthday, Amani!'))
            ->> 'message', 'Keep the message for [Cake] to 20 characters.', 'A long message is refused.');
select is(public.rpc_order_quote_web(pg_temp.basket('c1250000-0000-4000-8000-0000000000d2', 'Hello'))
            ->> 'message', '[Bread] does not take a message.', 'An item that takes none refuses one.');
select is(public.rpc_order_quote_web(pg_temp.basket('c1250000-0000-4000-8000-0000000000d1', null)) ->> 'ok',
  'true', 'A message is optional.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1250000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
insert into t select 'order', public.rpc_order_place_web(
  pg_temp.basket('c1250000-0000-4000-8000-0000000000d1', 'Happy birthday Amani')) ->> 'order_id';
reset role;
select is((select message from public.order_item where order_id = (select v::uuid from t where k = 'order')),
  'Happy birthday Amani', 'The order keeps the message on its line.');
select is((select note from public.order_item where order_id = (select v::uuid from t where k = 'order')),
  null, 'The line note stays separate.');
select throws_ok($$update public.catalogue_item set message_label = '' where id = 'c1250000-0000-4000-8000-0000000000d2'$$,
  '23514', null, 'A blank question is refused; null means no message.');

select * from finish();
rollback;
