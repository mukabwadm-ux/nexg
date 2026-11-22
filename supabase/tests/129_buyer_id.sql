-- An eSIM needs the buyer's passport or national ID: checkout asks for it,
-- the order keeps it apart, only the shop's team reads it, and it is deleted
-- 90 days after the order ends.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1290000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner129@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1290000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'outsider129@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1290000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', null, null, true, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1290000-0000-4000-8000-00000000000a', '[Legal 129] Ltd', '[Telco 129]', 'restaurant',
        '[Contact]', '+254700012900', 'telco129@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('c1290000-0000-4000-8000-00000000000a', 'c1290000-0000-4000-8000-000000000001', 'owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1290000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c1290000-0000-4000-8000-0000000000c1', 'c1290000-0000-4000-8000-00000000000a', '[eSIMs]');
insert into public.catalogue_item (id, merchant_id, section_id, name, price_kes, available, sort,
                                   digital, requires_buyer_id) values
  ('c1290000-0000-4000-8000-0000000000d1', 'c1290000-0000-4000-8000-00000000000a',
   'c1290000-0000-4000-8000-0000000000c1', '[eSIM 5 GB]', 1000, true, 1, true, true);

create function pg_temp.basket(p_id jsonb) returns jsonb language sql as $f$
  select jsonb_strip_nulls(jsonb_build_object('merchant_id', 'c1290000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk', 'guest_phone', '+254700012999', 'guest_name', '[Buyer]',
    'buyer_id', p_id,
    'items', jsonb_build_array(jsonb_build_object(
      'catalogue_item_id', 'c1290000-0000-4000-8000-0000000000d1', 'quantity', 1))))
$f$;

-- ── checkout asks for it

set local role anon;
select ok((select requires_buyer_id from public.catalogue_menu_public
            where id = 'c1290000-0000-4000-8000-0000000000d1'), 'The apps see that the item needs an ID.');
select is(public.rpc_order_quote_web(pg_temp.basket(null)) ->> 'needs_buyer_id', 'true',
  'Without an ID the quote says one is needed...');
select is(public.rpc_order_quote_web(pg_temp.basket(null)) ->> 'ok', 'false', '...and refuses.');
select is(public.rpc_order_quote_web(pg_temp.basket(
            '{"type":"passport","number":"AB1234567","name":"Jane Visitor"}')) ->> 'ok', 'false',
  'A passport needs its country.');
select is(public.rpc_order_quote_web(pg_temp.basket(
            '{"type":"national_id","number":"12 345 678","name":"Amani Otieno"}')) ->> 'ok', 'true',
  'A national ID with a name is enough.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1290000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
insert into t select 'order', public.rpc_order_place_web(pg_temp.basket(
  '{"type":"passport","number":"ab-1234567","country":"gb","name":"Jane Visitor"}')) ->> 'order_id';
select throws_ok($$select * from public.order_buyer_id$$, '42501', null, 'The buyer cannot read the table either.');
reset role;

select is((select row(id_type, id_number, issuing_country, full_name)::text from public.order_buyer_id
            where order_id = (select v::uuid from t where k = 'order')),
  '(passport,AB1234567,GB,"Jane Visitor")', 'The order keeps the ID, tidied, apart from the order row.');

-- ── only the shop reads it

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1290000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(format('select public.rpc_merchant_order_buyer_id(%L)', (select v from t where k = 'order')),
  '42501', null, 'Someone outside the shop cannot read it.');
select set_config('request.jwt.claims',
  '{"sub":"c1290000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.rpc_merchant_order_buyer_id((select v::uuid from t where k = 'order')) #>> '{buyer_id,number}',
  'AB1234567', 'The shop reads it to register the eSIM.');
reset role;

-- ── and it does not stay

select is(public.cron_purge_order_buyer_ids(), 0, 'A live order keeps it.');
update public.order set stage = 'delivered', handed_to = 'guest', delivered_at = now() - interval '91 days'
 where id = (select v::uuid from t where k = 'order');
select is(public.cron_purge_order_buyer_ids(), 1, 'It is deleted 90 days after the order is delivered.');

select * from finish();
rollback;
