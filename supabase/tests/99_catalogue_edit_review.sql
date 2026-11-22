-- Publishing or turning down a catalogue change a merchant asked for
-- (rpc_catalogue_edit_review): it no longer fails on its notification,
-- a price change applies its price, a bad price is refused, a refusal needs
-- a reason, and it is audited and limited to the merchant's reviewers.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;
insert into t (k, v) values ('nbo', (select id::text from public.city where slug = 'nairobi'));

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;
create function pg_temp.notes(p_kind text) returns integer language sql as $f$
  select count(*)::integer from public.notification where kind::text = p_kind
$f$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), now(), now()
from (values
  ('0c100000-0000-4000-8000-0000000000a1'::uuid, 'merchops.edit@test.local'),
  ('0c100000-0000-4000-8000-0000000000a2'::uuid, 'guest.edit@test.local')
) as u (id, email);
insert into public.staff_user (id, user_id, email, display_name) values
  ('0c100000-0000-4000-8000-0000000000b1', '0c100000-0000-4000-8000-0000000000a1', 'merchops.edit@test.local', 'Edit Ops');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select '0c100000-0000-4000-8000-0000000000b1', r.id, (select v::uuid from t where k = 'nbo'),
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from public.role r where r.key = 'merchant_ops';

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email,
                             city_id, status, went_live_at, explore_visible)
values ('0c100000-0000-4000-8000-0000000000c1', 'EditT Kitchen Ltd', 'EditT Kitchen', 'restaurants_food', 'Owner',
        '+254712001001', 'kitchen.edit@shop.example', (select v::uuid from t where k = 'nbo'), 'live', now(), true);
insert into public.catalogue_section (id, merchant_id, name) values
  ('0c100000-0000-4000-8000-0000000000d1', '0c100000-0000-4000-8000-0000000000c1', 'Mains');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available) values
  ('0c100000-0000-4000-8000-0000000000e1', '0c100000-0000-4000-8000-0000000000d1',
   '0c100000-0000-4000-8000-0000000000c1', 'Pilau', 500, true);
insert into public.catalogue_edit_request (id, merchant_id, catalogue_item_id, kind, payload) values
  ('0c100000-0000-4000-8000-000000000101', '0c100000-0000-4000-8000-0000000000c1',
   '0c100000-0000-4000-8000-0000000000e1', 'price_change', '{"price_kes": 650}'),
  ('0c100000-0000-4000-8000-000000000102', '0c100000-0000-4000-8000-0000000000c1',
   '0c100000-0000-4000-8000-0000000000e1', 'price_change', '{"price_kes": "six hundred"}'),
  ('0c100000-0000-4000-8000-000000000103', '0c100000-0000-4000-8000-0000000000c1',
   null, 'new_item', '{"name": "Biryani"}');

insert into t (k, v) values
  ('approved_before', pg_temp.notes('edit_approved')::text),
  ('rejected_before', pg_temp.notes('edit_rejected')::text);

set local role authenticated;
select pg_temp.as_user('0c100000-0000-4000-8000-0000000000a1');

select is(
  (public.rpc_catalogue_edit_review('0c100000-0000-4000-8000-000000000101', true)).status::text,
  'approved', 'publishing a price change works now');
select throws_ok($$ select public.rpc_catalogue_edit_review('0c100000-0000-4000-8000-000000000102', true) $$,
  '22023', null, 'a price change with no price in shillings is refused');
select throws_ok($$ select public.rpc_catalogue_edit_review('0c100000-0000-4000-8000-000000000103', false, '  ') $$,
  '23514', null, 'turning a change down needs a reason');
select is(
  (public.rpc_catalogue_edit_review('0c100000-0000-4000-8000-000000000103', false, 'We do not list that dish.')).reason,
  'We do not list that dish.', 'turning it down keeps the reason the merchant reads');
select throws_ok($$ select public.rpc_catalogue_edit_review('0c100000-0000-4000-8000-000000000101', true) $$,
  'P0002', null, 'a decided change cannot be decided again');

select pg_temp.as_user('0c100000-0000-4000-8000-0000000000a2');
select throws_ok($$ select public.rpc_catalogue_edit_review('0c100000-0000-4000-8000-000000000102', false, 'No') $$,
  '42501', null, 'someone who does not work this merchant cannot decide');
reset role;

select is((select price_kes from public.catalogue_item where id = '0c100000-0000-4000-8000-0000000000e1'), 650,
  'the published price is the item''s price');
select is(pg_temp.notes('edit_approved') - (select v::integer from t where k = 'approved_before'), 1,
  'the merchant is told it was published');
select is(pg_temp.notes('edit_rejected') - (select v::integer from t where k = 'rejected_before'), 1,
  'and told when it was turned down');
select is(
  (select count(*)::integer from audit.audit_event
   where action = 'catalogue.edit_reviewed'
     and target_id in ('0c100000-0000-4000-8000-000000000101', '0c100000-0000-4000-8000-000000000103')),
  2, 'both decisions are audited');
select is(
  (select status::text from public.catalogue_edit_request where id = '0c100000-0000-4000-8000-000000000102'),
  'pending', 'the refused one is still waiting');

select * from finish();
rollback;
