-- A shop's minimum order comes from its sign-up answer, is changed by the
-- shop, shows on the shop page and is enforced at checkout. Only listed
-- sign-up answers show on the shop page.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1260000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner126@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1260000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'outsider126@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at, answers)
values ('c1260000-0000-4000-8000-00000000000a', '[Legal 126] Ltd', '[Grill 126]', 'restaurant',
        '[Contact]', '+254700012600', 'grill126@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days',
        '{"min_order":"1000","wifi_available":true,"license_number":"LIC-126","flight_tracking":true,"tour_languages":[]}');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1260000-0000-4000-8000-00000000000a', 'c1260000-0000-4000-8000-000000000001', 'owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1260000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1260000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 126]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c1260000-0000-4000-8000-0000000000c1', 'c1260000-0000-4000-8000-00000000000a', '[Grill]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort) values
  ('c1260000-0000-4000-8000-0000000000d1', 'c1260000-0000-4000-8000-00000000000a',
   'c1260000-0000-4000-8000-0000000000c1', '[Skewer]', 400, true, 1);

create function pg_temp.basket(p_qty int) returns jsonb language sql as $f$
  select jsonb_build_object('merchant_id', 'c1260000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk', 'lat', -1.4000, 'lng', 36.6000,
    'guest_phone', '+254700012699', 'guest_name', '[Buyer]', 'dropoff_label', '[Home]',
    'items', jsonb_build_array(jsonb_build_object(
      'catalogue_item_id', 'c1260000-0000-4000-8000-0000000000d1', 'quantity', p_qty)))
$f$;

-- ── minimum order

select is((select min_order_kes from public.merchant where id = 'c1260000-0000-4000-8000-00000000000a'),
  1000, 'The minimum starts from the sign-up answer.');
select is(public.fn_min_order_from_answers('{"MINIMUM_ORDER_AMOUNT":{"amount_minor":250000,"currency":"KES"}}'),
  2500, 'An exact amount in cents counts too.');
select is(public.fn_min_order_from_answers('{"min_order":"none"}'), null, '"none" means no minimum.');

set local role anon;
select is(public.rpc_order_quote_web(pg_temp.basket(2)) ->> 'message',
  '[Grill 126] takes orders from KES 1,000. Add KES 200 more.', 'A basket under the minimum is refused, with what is missing.');
select is(public.rpc_order_quote_web(pg_temp.basket(3)) ->> 'ok', 'true', 'At or over the minimum it sells.');
select is((select min_order_kes from public.merchant_public where id = 'c1260000-0000-4000-8000-00000000000a'),
  1000, 'The shop page shows the minimum.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1260000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.rpc_merchant_set_min_order('c1260000-0000-4000-8000-00000000000a', 1)$$,
  null, null, 'Someone outside the shop cannot change it.');
select set_config('request.jwt.claims',
  '{"sub":"c1260000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.rpc_merchant_set_min_order('c1260000-0000-4000-8000-00000000000a', 0)$$,
  null, null, 'Zero is refused; null means none.');
select is(public.rpc_merchant_set_min_order('c1260000-0000-4000-8000-00000000000a', null) ->> 'ok', 'true',
  'The shop can remove its minimum.');
reset role;

update public.merchant set answers = answers || '{"min_order":"2000"}'
 where id = 'c1260000-0000-4000-8000-00000000000a';
select is((select min_order_kes from public.merchant where id = 'c1260000-0000-4000-8000-00000000000a'),
  2000, 'With no minimum set, a changed sign-up answer fills it.');

-- ── answers customers see

set local role anon;
select is((select array_agg(a ->> 'key' order by a ->> 'key') from public.merchant_public mp,
                  jsonb_array_elements(mp.public_answers) a
            where mp.id = 'c1260000-0000-4000-8000-00000000000a'),
  array['flight_tracking', 'wifi_available'],
  'The shop page shows listed answers only: not the licence number, not an empty list.');
select ok((select bool_and(a ? 'label' and a ? 'value') from public.merchant_public mp,
                  jsonb_array_elements(mp.public_answers) a
            where mp.id = 'c1260000-0000-4000-8000-00000000000a'),
  'Each answer comes with the words to show.');
reset role;

select * from finish();
rollback;
