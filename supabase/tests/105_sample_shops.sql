-- Sample shops are shown and labelled, and never take an order (20270107000100).

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- ── fixtures: one sample shop, one real shop

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at, is_sample)
values
  ('c1050000-0000-4000-8000-00000000000a', '[Legal 105a] Ltd', '[Sample 105a]', 'restaurant',
   '[Contact]', '+254700010501', 'shop105a@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, false, now(), true),
  ('c1050000-0000-4000-8000-00000000000b', '[Legal 105b] Ltd', '[Shop 105b]', 'restaurant',
   '[Contact]', '+254700010502', 'shop105b@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now(), false);

insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary, latitude, longitude)
values ('c1050000-0000-4000-8000-0000000000ba', 'c1050000-0000-4000-8000-00000000000a',
        '[Branch]', 'Westlands, Nairobi', true, -1.2649, 36.8024);

-- ── the marker

select is((select is_sample from public.merchant where id = 'c1050000-0000-4000-8000-00000000000b'),
  false, 'A merchant is not a sample unless marked.');
select is((select is_sample from public.merchant_public where id = 'c1050000-0000-4000-8000-00000000000a'),
  true, 'merchant_public shows a sample shop, and says it is one.');

-- ── a sample shop cannot take orders or be picked

select throws_ok(
  $$update public.merchant set accepting_orders = true where id = 'c1050000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'A sample shop cannot switch on orders.');
select throws_ok(
  $$update public.merchant set concierge_pick = true where id = 'c1050000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'A sample shop cannot be a concierge pick.');
select throws_ok(
  $$update public.merchant set is_sample = true where id = 'c1050000-0000-4000-8000-00000000000b'$$,
  '23514', null, 'A shop taking orders cannot be marked a sample without switching orders off.');
select lives_ok(
  $$update public.merchant set accepting_orders = false, is_sample = true where id = 'c1050000-0000-4000-8000-00000000000b'$$,
  'A shop with orders off can be marked a sample.');
update public.merchant set is_sample = false, accepting_orders = true where id = 'c1050000-0000-4000-8000-00000000000b';

-- ── checkout refuses it

select is((public.fn_web_order_quote(jsonb_build_object(
  'merchant_id', 'c1050000-0000-4000-8000-00000000000a',
  'payment_method', 'cash_on_delivery',
  'items', jsonb_build_array())) ->> 'ok')::boolean,
  false, 'The quote refuses a sample shop.');

-- ── no order row can name it, whatever the channel

select throws_ok(
  $$insert into public.order (merchant_id) values ('c1050000-0000-4000-8000-00000000000a')$$,
  '22023', 'This is a sample shop. It does not take orders.',
  'An order row for a sample shop is refused.');

select is(
  (select has_function_privilege('anon', 'public.tg_order_refuses_sample_merchant()', 'execute')
       or has_function_privilege('authenticated', 'public.tg_order_refuses_sample_merchant()', 'execute')),
  false, 'The trigger function is not callable from the API.');

select * from finish();
rollback;
