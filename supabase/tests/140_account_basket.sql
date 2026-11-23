-- One basket per account (20270216000100): read and written through
-- rpc_basket_*, merged at sign-in, emptied when an order is placed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1390000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'basket139@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1390000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'other139@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1390000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', null, null, true, now(), now());

-- Two live shops with no hours on file (open at any time).
insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values
  ('c1390000-0000-4000-8000-00000000000a', '[Legal 139] Ltd', '[Shop 139]', 'restaurant',
   '[Contact]', '+254700013900', 'shop139@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days'),
  ('c1390000-0000-4000-8000-00000000000b', '[Legal 139b] Ltd', '[Other shop 139]', 'restaurant',
   '[Contact]', '+254700013901', 'othershop139@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values
  ('c1390000-0000-4000-8000-00000000000a', 'Main', '[Address]', true),
  ('c1390000-0000-4000-8000-00000000000b', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values
  ('c1390000-0000-4000-8000-0000000000b1', 'c1390000-0000-4000-8000-00000000000a', 'Menu'),
  ('c1390000-0000-4000-8000-0000000000b2', 'c1390000-0000-4000-8000-00000000000b', 'Menu');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available, kind)
values
  ('c1390000-0000-4000-8000-0000000000c1', 'c1390000-0000-4000-8000-0000000000b1',
   'c1390000-0000-4000-8000-00000000000a', 'Pilau', 500, true, 'buy'),
  ('c1390000-0000-4000-8000-0000000000c2', 'c1390000-0000-4000-8000-0000000000b1',
   'c1390000-0000-4000-8000-00000000000a', 'Chapati', 50, true, 'buy'),
  ('c1390000-0000-4000-8000-0000000000c3', 'c1390000-0000-4000-8000-0000000000b1',
   'c1390000-0000-4000-8000-00000000000a', 'Table for two', 1000, true, 'table'),
  ('c1390000-0000-4000-8000-0000000000d1', 'c1390000-0000-4000-8000-0000000000b2',
   'c1390000-0000-4000-8000-00000000000b', 'Burger', 600, true, 'buy');


-- ══════════════════════════════════════════════ who may use it

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.rpc_basket_get()$$, '42501', null,
  'The anonymous key cannot read a basket.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1390000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select * from public.basket$$, '42501', null,
  'The basket table is not readable directly.');
select is(public.rpc_basket_get(),
  '{"merchant": null, "updated_at": null, "lines": []}'::jsonb,
  'A new account has an empty basket.');

-- ══════════════════════════════════════════════ writing

select set_config('t.put', public.rpc_basket_put('c1390000-0000-4000-8000-00000000000a', '[
  {"catalogue_item_id": "c1390000-0000-4000-8000-0000000000c1", "quantity": 2, "note": " no onions "},
  {"catalogue_item_id": "c1390000-0000-4000-8000-0000000000d1", "quantity": 1},
  {"catalogue_item_id": "c1390000-0000-4000-8000-0000000000c3", "quantity": 1},
  {"catalogue_item_id": "not-a-uuid", "quantity": 1},
  {"catalogue_item_id": "c1390000-0000-4000-8000-0000000000c2", "quantity": 0},
  {"catalogue_item_id": "c1390000-0000-4000-8000-0000000000c2", "quantity": 80}
]'::jsonb)::text, true);

select is(jsonb_array_length(current_setting('t.put')::jsonb -> 'lines'), 2,
  'Lines from another shop, for something booked, with a bad id or no quantity are dropped.');
select is(current_setting('t.put')::jsonb #>> '{merchant,name}', '[Shop 139]',
  'The basket names its shop.');
select is(current_setting('t.put')::jsonb #>> '{lines,0,note}', 'no onions',
  'A note is kept, trimmed.');
select is((current_setting('t.put')::jsonb #>> '{lines,1,quantity}')::int, 50,
  'A quantity over 50 is capped at 50.');
select ok((current_setting('t.put')::jsonb #>> '{lines,0,price_kes}')::numeric = 500
          and (current_setting('t.put')::jsonb #>> '{lines,0,available}')::boolean
          and current_setting('t.put')::jsonb #>> '{lines,0,name}' = 'Pilau',
  'Each line carries its name, menu price and whether it is on sale.');
select is(public.rpc_basket_get(), current_setting('t.put')::jsonb,
  'Reading it back gives the same basket.');

select throws_ok(
  format($$select public.rpc_basket_put(%L, %L::jsonb)$$, 'c1390000-0000-4000-8000-00000000000a',
    (select jsonb_agg(jsonb_build_object('catalogue_item_id', 'c1390000-0000-4000-8000-0000000000c1',
                                         'quantity', 1))
       from generate_series(1, 61))::text),
  'P0001', 'That is a lot for one basket. Keep it to 60 lines.',
  'More than 60 lines is refused.');

-- ══════════════════════════════════════════════ another account cannot see it

select set_config('request.jwt.claims', '{"sub":"c1390000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.rpc_basket_get() -> 'lines', '[]'::jsonb,
  'Another account sees only its own (empty) basket.');
select public.rpc_basket_put('c1390000-0000-4000-8000-00000000000b',
  '[{"catalogue_item_id": "c1390000-0000-4000-8000-0000000000d1", "quantity": 1}]'::jsonb);

-- ══════════════════════════════════════════════ merging at sign-in

select set_config('request.jwt.claims', '{"sub":"c1390000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('t.merge', public.rpc_basket_merge('c1390000-0000-4000-8000-00000000000a', '[
  {"catalogue_item_id": "c1390000-0000-4000-8000-0000000000c1", "quantity": 1, "note": "no onions"},
  {"catalogue_item_id": "c1390000-0000-4000-8000-0000000000c1", "quantity": 1}
]'::jsonb)::text, true);
select is(current_setting('t.merge')::jsonb ->> 'outcome', 'added',
  'Signing in with a basket from the same shop adds to the account''s.');
select is(
  (select jsonb_agg(jsonb_build_array(l ->> 'name', (l ->> 'quantity')::int, l ->> 'note'))
     from jsonb_array_elements(current_setting('t.merge')::jsonb -> 'lines') l),
  '[["Pilau", 3, "no onions"], ["Chapati", 50, null], ["Pilau", 1, null]]'::jsonb,
  'A matching line adds its quantity; a different one is appended, in order.');

select is(public.rpc_basket_merge('c1390000-0000-4000-8000-00000000000a', '[]'::jsonb) ->> 'outcome',
  'kept', 'An empty signed-out basket leaves the account''s alone.');

select set_config('t.other', public.rpc_basket_merge('c1390000-0000-4000-8000-00000000000b',
  '[{"catalogue_item_id": "c1390000-0000-4000-8000-0000000000d1", "quantity": 2}]'::jsonb)::text, true);
select is(current_setting('t.other')::jsonb ->> 'outcome', 'replaced',
  'A signed-out basket from another shop replaces the account''s.');
select is(current_setting('t.other')::jsonb #>> '{merchant,name}', '[Other shop 139]',
  'The basket is now the other shop''s.');

select is(public.rpc_basket_clear() -> 'lines', '[]'::jsonb, 'Clearing empties it.');

-- A guest's temporary session keeps a basket too.
select set_config('request.jwt.claims', '{"sub":"c1390000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(jsonb_array_length(public.rpc_basket_put('c1390000-0000-4000-8000-00000000000a',
  '[{"catalogue_item_id": "c1390000-0000-4000-8000-0000000000c1", "quantity": 1}]'::jsonb) -> 'lines'),
  1, 'A guest''s temporary session has a basket.');

-- ══════════════════════════════════════════════ placing an order empties it

select set_config('request.jwt.claims', '{"sub":"c1390000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_basket_put('c1390000-0000-4000-8000-00000000000a',
  '[{"catalogue_item_id": "c1390000-0000-4000-8000-0000000000c1", "quantity": 2}]'::jsonb);
select set_config('t.order', public.rpc_order_place_web(jsonb_build_object(
    'merchant_id', 'c1390000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk',
    'fulfilment', 'pickup',
    'guest_phone', '+254700139001',
    'items', public.rpc_basket_get() -> 'lines')) ->> 'order_id', true);
select isnt(current_setting('t.order', true), null,
  'The basket''s lines go to checkout as they are.');
select is(public.rpc_basket_get() -> 'lines', '[]'::jsonb,
  'Placing an order from the shop empties the basket.');
reset role;

-- An order from another shop leaves the basket alone.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c1390000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.rpc_order_place_web(jsonb_build_object(
    'merchant_id', 'c1390000-0000-4000-8000-00000000000b',
    'payment_method', 'mpesa_stk',
    'fulfilment', 'pickup',
    'guest_phone', '+254700139003',
    'items', '[{"catalogue_item_id": "c1390000-0000-4000-8000-0000000000d1", "quantity": 1}]'::jsonb));
select is(jsonb_array_length(public.rpc_basket_get() -> 'lines'), 1,
  'An order from another shop leaves the basket alone.');
reset role;

-- A sold-out item stays in the basket, marked unavailable.
update public.catalogue_item set sold_out = true where id = 'c1390000-0000-4000-8000-0000000000c1';
select is((public.fn_basket_read('c1390000-0000-4000-8000-000000000003') #>> '{lines,0,available}')::boolean,
  false, 'A sold-out item stays in the basket, marked unavailable.');

-- Deleting the sign-in deletes its basket.
select is((select count(*)::int from public.basket
            where user_id = 'c1390000-0000-4000-8000-000000000002'), 1,
  'The other account has a basket before its sign-in is deleted.');
delete from auth.users where id = 'c1390000-0000-4000-8000-000000000002';
select is((select count(*)::int from public.basket
            where user_id = 'c1390000-0000-4000-8000-000000000002'), 0,
  'Deleting the sign-in deletes its basket.');

select * from finish();
rollback;
