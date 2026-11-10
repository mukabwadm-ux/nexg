-- Merchant promotions: run by the merchant, shown to guests, charged at checkout.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','b5500000-0000-4000-8000-000000000001',
   'authenticated','authenticated','owner55@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','b5500000-0000-4000-8000-000000000002',
   'authenticated','authenticated','stranger55@example.test',now(),false,now(),now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('b5510000-0000-4000-8000-00000000000a','[Legal 55] Ltd','[Shop 55]','restaurant',
        '[Contact]','+254700005501','shop55@example.test',
        (select id from public.city where slug = 'nairobi'),'live', true, true, now() - interval '60 days');
insert into public.merchant_user (merchant_id, user_id, role)
values ('b5510000-0000-4000-8000-00000000000a','b5500000-0000-4000-8000-000000000001','owner');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('b5510000-0000-4000-8000-00000000000a','Main','[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('b5520000-0000-4000-8000-00000000000a','b5510000-0000-4000-8000-00000000000a','Menu');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
values
  ('b5530000-0000-4000-8000-0000000000a1','b5520000-0000-4000-8000-00000000000a','b5510000-0000-4000-8000-00000000000a','Grill platter', 1450, true),
  ('b5530000-0000-4000-8000-0000000000a2','b5520000-0000-4000-8000-00000000000a','b5510000-0000-4000-8000-00000000000a','Juice', 300, true);

-- The owner runs 15% off the platter.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b5500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_merchant_promotion_save(
  'b5510000-0000-4000-8000-00000000000a', null, 'Weekend special', 'percent', 15,
  'b5530000-0000-4000-8000-0000000000a1', null, null);

select throws_ok($$select public.rpc_merchant_promotion_save(
  'b5510000-0000-4000-8000-00000000000a', null, 'Too much', 'percent', 95, null, null, null)$$,
  '22023', null, 'A percentage over 90 is refused.');
select throws_ok($$select public.rpc_merchant_promotion_save(
  'b5510000-0000-4000-8000-00000000000a', null, 'Free juice', 'amount', 300,
  'b5530000-0000-4000-8000-0000000000a2', null, null)$$,
  '22023', null, 'An amount off as large as the price is refused.');

select set_config('request.jwt.claims',
  '{"sub":"b5500000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.rpc_merchant_promotion_save(
  'b5510000-0000-4000-8000-00000000000a', null, 'Not mine', 'percent', 50, null, null, null)$$,
  '42501', null, 'Someone else cannot run a promotion on this business.');
reset role;

select is(
  (select price_kes from public.fn_item_promo_price(
     'b5530000-0000-4000-8000-0000000000a1', 'b5510000-0000-4000-8000-00000000000a', 1450)),
  1232, '15% off KES 1,450 is KES 1,232: whole shillings, rounded down for the guest.');

select is(
  (select price_kes from public.fn_item_promo_price(
     'b5530000-0000-4000-8000-0000000000a2', 'b5510000-0000-4000-8000-00000000000a', 300)),
  300, 'An item the promotion does not cover keeps its price.');

set local role anon;
select is(
  (select promo_price_kes || ' ' || promotion_name from public.rpc_promoted_prices('b5510000-0000-4000-8000-00000000000a')),
  '1232 Weekend special', 'Any visitor sees the promotional price and its name.');
reset role;

select is(
  (select (l ->> 'unit_price_cents') || ' ' || (l ->> 'list_price_cents')
     from jsonb_array_elements(public.fn_web_order_quote(jsonb_build_object(
       'merchant_id', 'b5510000-0000-4000-8000-00000000000a', 'payment_method', 'card',
       'items', jsonb_build_array(jsonb_build_object(
         'catalogue_item_id', 'b5530000-0000-4000-8000-0000000000a1', 'quantity', 2)))) -> 'lines') l),
  '123200 145000', 'Checkout charges the promotional price and keeps the list price on the line.');

-- A whole-catalogue KES 200 off sits alongside: the lower price wins.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b5500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_merchant_promotion_save(
  'b5510000-0000-4000-8000-00000000000a', null, 'Store week', 'amount', 200, null, null, null);
reset role;

select is(
  (select price_kes || ' ' || promotion_name from public.fn_item_promo_price(
     'b5530000-0000-4000-8000-0000000000a1', 'b5510000-0000-4000-8000-00000000000a', 1450)),
  '1232 Weekend special', 'Of two promotions, the one giving the lower price applies.');
select is(
  (select price_kes from public.fn_item_promo_price(
     'b5530000-0000-4000-8000-0000000000a2', 'b5510000-0000-4000-8000-00000000000a', 300)),
  100, 'A whole-catalogue promotion reaches every item.');

-- Paused, the platter goes back to its own price less the store promotion.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"b5500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_merchant_promotion_set_status(
  (select id from public.merchant_promotion where name = 'Weekend special'), 'paused');
reset role;

select is(
  (select price_kes from public.fn_item_promo_price(
     'b5530000-0000-4000-8000-0000000000a1', 'b5510000-0000-4000-8000-00000000000a', 1450)),
  1250, 'A paused promotion stops applying.');

-- A promotion that has not started yet does not apply.
update public.merchant_promotion set status = 'ended' where merchant_id = 'b5510000-0000-4000-8000-00000000000a';
insert into public.merchant_promotion (merchant_id, name, kind, value, starts_at)
values ('b5510000-0000-4000-8000-00000000000a', 'Next week', 'percent', 50, now() + interval '7 days');
select is(
  (select price_kes from public.fn_item_promo_price(
     'b5530000-0000-4000-8000-0000000000a1', 'b5510000-0000-4000-8000-00000000000a', 1450)),
  1450, 'A promotion that has not started yet does not apply.');

select is(
  (select count(*)::int from audit.audit_event
    where action in ('promotion.saved', 'promotion.status_changed')
      and target_type = 'merchant_promotion'),
  3, 'Every change a merchant makes is in the audit log.');

select * from finish();
rollback;
