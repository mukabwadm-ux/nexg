-- A digital item (an eSIM) is ordered with no address, never gets a rider,
-- and reaches the customer as a code the shop sends once the order is paid.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1280000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner128@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1280000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'outsider128@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1280000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', null, null, true, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1280000-0000-4000-8000-00000000000a', '[Legal 128] Ltd', '[Telco 128]', 'restaurant',
        '[Contact]', '+254700012800', 'telco128@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1280000-0000-4000-8000-00000000000a', 'c1280000-0000-4000-8000-000000000001', 'owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1280000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c1280000-0000-4000-8000-0000000000c1', 'c1280000-0000-4000-8000-00000000000a', '[eSIMs]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort, digital) values
  ('c1280000-0000-4000-8000-0000000000d1', 'c1280000-0000-4000-8000-00000000000a',
   'c1280000-0000-4000-8000-0000000000c1', '[eSIM 10 GB]', 1500, true, 1, true),
  ('c1280000-0000-4000-8000-0000000000d2', 'c1280000-0000-4000-8000-00000000000a',
   'c1280000-0000-4000-8000-0000000000c1', '[SIM card]', 100, true, 2, false);

-- No address, no pin.
create function pg_temp.basket(p_items text[]) returns jsonb language sql as $f$
  select jsonb_build_object('merchant_id', 'c1280000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk', 'guest_phone', '+254700012899', 'guest_name', '[Buyer]',
    'items', (select jsonb_agg(jsonb_build_object('catalogue_item_id', x, 'quantity', 1)) from unnest(p_items) x))
$f$;

-- ── checkout

set local role anon;
select is(public.rpc_order_quote_web(pg_temp.basket(array['c1280000-0000-4000-8000-0000000000d1']))
            ->> 'fulfilment', 'digital', 'A basket of digital items is digital.');
select is((public.rpc_order_quote_web(pg_temp.basket(array['c1280000-0000-4000-8000-0000000000d1']))
            ->> 'delivery_fee_cents')::bigint, 0::bigint, 'It has no delivery fee.');
select is(public.rpc_order_quote_web(pg_temp.basket(array['c1280000-0000-4000-8000-0000000000d1',
                                                          'c1280000-0000-4000-8000-0000000000d2']))
            ->> 'fulfilment', 'delivery', 'A mixed basket is delivered as before.');
select ok((select digital from public.catalogue_menu_public where id = 'c1280000-0000-4000-8000-0000000000d1'),
  'The apps see which items are digital.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1280000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
insert into t select 'order', public.rpc_order_place_web(
  pg_temp.basket(array['c1280000-0000-4000-8000-0000000000d1'])) ->> 'order_id';
select throws_ok($$select public.rpc_order_place_web(pg_temp.basket(array[
    'c1280000-0000-4000-8000-0000000000d1', 'c1280000-0000-4000-8000-0000000000d2']))$$,
  'P0001', 'Where should we bring it? Set your delivery address first.',
  'A mixed basket still needs an address.');
reset role;

select is((select row(fulfilment, dropoff_label, dropoff_point is null)::text from public.order
            where id = (select v::uuid from t where k = 'order')), '(digital,"Digital delivery",t)',
  'A digital order is placed with no address and no pin.');

-- ── never a rider

select throws_ok($$select dispatch.fn_job_start((select v::uuid from t where k = 'order'))$$,
  '22023', 'A digital order has no delivery. Send its code instead.', 'No rider is searched for.');

-- ── the code

insert into t select 'line', id::text from public.order_item where order_id = (select v::uuid from t where k = 'order');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1280000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(format($$select public.rpc_merchant_order_send_codes(%L, jsonb_build_array(jsonb_build_object('order_item_id', %L, 'code', 'LPA:1$SM-DP$ABC')))$$,
                        (select v from t where k = 'order'), (select v from t where k = 'line')),
  '22023', 'Send the code once the order is paid.', 'No code before payment.');
reset role;

update public.order set payment_status = 'paid' where id = (select v::uuid from t where k = 'order');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1280000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(format($$select public.rpc_merchant_order_send_codes(%L, jsonb_build_array(jsonb_build_object('order_item_id', %L, 'code', 'X')))$$,
                        (select v from t where k = 'order'), (select v from t where k = 'line')),
  '42501', null, 'Someone outside the shop cannot send a code.');
select is(public.rpc_my_order_codes((select v::uuid from t where k = 'order')), '[]'::jsonb,
  'Nor read one.');
select set_config('request.jwt.claims',
  '{"sub":"c1280000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.rpc_merchant_order_send_codes((select v::uuid from t where k = 'order'),
            jsonb_build_array(jsonb_build_object('order_item_id', (select v from t where k = 'line'),
                                                 'code', 'LPA:1$SM-DP$ABC'))) ->> 'stage',
  'delivered', 'Once the shop sends the code, the digital order is delivered.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1280000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
select is(public.rpc_my_order_codes((select v::uuid from t where k = 'order')) -> 0 ->> 'code',
  'LPA:1$SM-DP$ABC', 'The customer reads the code in their app.');
select throws_ok($$select * from public.order_item_code$$, '42501', null,
  'Nobody reads codes from the table directly.');
reset role;

select is((select count(*)::int from public.order_event
            where order_id = (select v::uuid from t where k = 'order') and kind = 'codes_sent'), 1,
  'The order history says the code was sent.');

set local role anon;
select throws_ok($$select public.rpc_my_order_codes(gen_random_uuid())$$, '42501', null,
  'A signed-out visitor cannot ask for codes.');
reset role;

select * from finish();
rollback;
