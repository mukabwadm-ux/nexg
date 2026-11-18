-- Merchant Catalogues: each catalogue's state from what is on record, the
-- figures, search by product, one catalogue's detail, and Add Product with
-- its audit event and its access rule.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;
insert into t (k, v) values ('nbo', (select id::text from public.city where slug = 'nairobi'));

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), now(), now()
from (values
  ('0f700000-0000-4000-8000-0000000000a1'::uuid, 'merchops.cat@test.local'),
  ('0f700000-0000-4000-8000-0000000000a2'::uuid, 'opsmgr.cat@test.local'),
  ('0f700000-0000-4000-8000-0000000000a3'::uuid, 'guest.cat@test.local')
) as u (id, email);
insert into public.staff_user (id, user_id, email, display_name) values
  ('0f700000-0000-4000-8000-0000000000b1', '0f700000-0000-4000-8000-0000000000a1', 'merchops.cat@test.local', 'Cat Merch Ops'),
  ('0f700000-0000-4000-8000-0000000000b2', '0f700000-0000-4000-8000-0000000000a2', 'opsmgr.cat@test.local', 'Cat Ops Manager');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, (select v::uuid from t where k = 'nbo'),
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from (values ('0f700000-0000-4000-8000-0000000000b1'::uuid, 'merchant_ops'),
             ('0f700000-0000-4000-8000-0000000000b2'::uuid, 'ops_manager')) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email,
                             city_id, status, went_live_at, explore_visible)
values
  ('0f700000-0000-4000-8000-0000000000c1', 'CatT Kitchen Ltd', 'CatT Kitchen', 'restaurants_food', 'Owner',
   '+254712000701', 'kitchen.cat@shop.example', (select v::uuid from t where k = 'nbo'), 'live', now(), true),
  ('0f700000-0000-4000-8000-0000000000c2', 'CatT Grocer Ltd', 'CatT Grocer', 'groceries_essentials', 'Owner',
   '+254712000702', 'grocer.cat@shop.example', (select v::uuid from t where k = 'nbo'), 'applied', null, false),
  ('0f700000-0000-4000-8000-0000000000c3', 'CatT Florist Ltd', 'CatT Florist', 'flowers_gifts', 'Owner',
   '+254712000703', 'florist.cat@shop.example', (select v::uuid from t where k = 'nbo'), 'live', now(), true);

insert into public.catalogue_section (id, merchant_id, name, sort) values
  ('0f700000-0000-4000-8000-0000000000d1', '0f700000-0000-4000-8000-0000000000c1', 'Mains', 0),
  ('0f700000-0000-4000-8000-0000000000d2', '0f700000-0000-4000-8000-0000000000c2', 'Fresh', 0),
  ('0f700000-0000-4000-8000-0000000000d3', '0f700000-0000-4000-8000-0000000000c3', 'Bouquets', 0);

insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, photo_path, available) values
  ('0f700000-0000-4000-8000-0000000000e1', '0f700000-0000-4000-8000-0000000000d1', '0f700000-0000-4000-8000-0000000000c1',
   'Ugali and greens', 650, 'merchant/k/ugali.jpg', true),
  ('0f700000-0000-4000-8000-0000000000e2', '0f700000-0000-4000-8000-0000000000d1', '0f700000-0000-4000-8000-0000000000c1',
   'Chef special', null, null, false),
  ('0f700000-0000-4000-8000-0000000000e3', '0f700000-0000-4000-8000-0000000000d2', '0f700000-0000-4000-8000-0000000000c2',
   'Sukuma bunch', 50, 'merchant/g/sukuma.jpg', true),
  ('0f700000-0000-4000-8000-0000000000e4', '0f700000-0000-4000-8000-0000000000d3', '0f700000-0000-4000-8000-0000000000c3',
   'Roses dozen', 2500, 'merchant/f/roses.jpg', true);

insert into public.catalogue_edit_request (merchant_id, catalogue_item_id, kind, payload, status)
values ('0f700000-0000-4000-8000-0000000000c3', '0f700000-0000-4000-8000-0000000000e4', 'price_change',
        '{"price_kes": 2800}', 'pending');

set local role authenticated;
select pg_temp.as_user('0f700000-0000-4000-8000-0000000000a1');

create function pg_temp.state_of(p_id text) returns text language sql as $f$
  select r ->> 'state'
  from jsonb_array_elements(public.rpc_merchant_catalogue_list(null, null, 'CatT', 50, 0) -> 'rows') r
  where r ->> 'merchant_id' = p_id
$f$;

select is(pg_temp.state_of('0f700000-0000-4000-8000-0000000000c1'), 'published', 'live, visible, an item shown: published');
select is(pg_temp.state_of('0f700000-0000-4000-8000-0000000000c2'), 'not_live', 'a merchant not live yet: not live');
select is(pg_temp.state_of('0f700000-0000-4000-8000-0000000000c3'), 'under_review', 'a change waiting: under review');
select is((public.rpc_merchant_catalogue_list(null, null, 'Sukuma', 50, 0) -> 'rows' -> 0 ->> 'name'), 'CatT Grocer',
  'search finds a catalogue by a product in it');
select is((public.rpc_merchant_catalogue_list(array['flowers_gifts'], null, 'CatT', 50, 0) ->> 'total')::integer, 1,
  'the category keys narrow the list');
select is((public.rpc_merchant_catalogue_list(null, 'not_live', 'CatT', 50, 0) ->> 'total')::integer, 1,
  'the status filter narrows the list');
select is(
  (select (r ->> 'needs_fix')::integer from jsonb_array_elements(public.rpc_merchant_catalogue_list(null, null, 'CatT Kitchen', 5, 0) -> 'rows') r),
  1, 'an item with no price and no photo needs action once');
select throws_ok($$ select public.rpc_merchant_catalogue_list(null, 'draft', null, 5, 0) $$, '22023', null,
  'an unknown status is refused');

select is(jsonb_array_length(public.rpc_merchant_catalogue_detail('0f700000-0000-4000-8000-0000000000c3') -> 'pending_edits'), 1,
  'the waiting change is in the detail');
select is((public.rpc_merchant_catalogue_detail('0f700000-0000-4000-8000-0000000000c1') ->> 'can_edit'), 'true',
  'merchant ops may add products in its city');

-- Add Product, into a new section, hidden by default.
insert into t (k, v) select 'item', public.rpc_catalogue_item_add_staff(
  '0f700000-0000-4000-8000-0000000000c1', 'Pilau', null, 'Rice', 700, 'Spiced rice', false)::text;
reset role;
select ok(
  exists (select 1 from public.catalogue_item i join public.catalogue_section s on s.id = i.section_id
          where i.id = (select v::uuid from t where k = 'item') and s.name = 'Rice' and not i.available
            and i.price_kes = 700),
  'the product lands hidden, in its new section');
select ok(
  exists (select 1 from audit.audit_event e
          where e.action = 'catalogue.item_added'
            and e.target_id = '0f700000-0000-4000-8000-0000000000c1'
            and (e.after ->> 'item_id') = (select v from t where k = 'item')),
  'adding a product is audited');

set local role authenticated;
select pg_temp.as_user('0f700000-0000-4000-8000-0000000000a2');
select throws_ok($$ select public.rpc_catalogue_item_add_staff('0f700000-0000-4000-8000-0000000000c1', 'Chapati') $$,
  '42501', null, 'an ops manager can read catalogues but not add to them');

select pg_temp.as_user('0f700000-0000-4000-8000-0000000000a3');
select throws_ok($$ select public.rpc_merchant_catalogue_overview(null) $$, '42501', null,
  'someone outside Merchants cannot read catalogues');
reset role;

select ok(not has_function_privilege('anon', 'public.rpc_catalogue_item_add_staff(uuid, text, uuid, text, integer, text, boolean)', 'execute'),
  'signed-out visitors cannot add products');

select * from finish();
rollback;
