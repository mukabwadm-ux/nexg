-- Checkout never hands somebody else's customer record to whoever types its phone number.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0670000-0000-4000-8000-000000000021',
   'authenticated', 'authenticated', 'new.customer67@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0670000-0000-4000-8000-000000000022',
   'authenticated', 'authenticated', 'no.phone67@example.test', now(), false, now(), now());

-- The record staff made for a phone order: a number and a name, no account.
insert into public.guest (id, phone, name)
values ('c0670000-0000-4000-8000-000000000001', '+254700006701', '[Phone-order guest]');
-- A customer whose record has no phone yet, as rpc_guest_ensure (PR #132) leaves it.
insert into public.guest (id, user_id, name)
values ('c0670000-0000-4000-8000-000000000002', 'c0670000-0000-4000-8000-000000000022', '[No phone yet]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c0670000-0000-4000-8000-00000000000a', '[Legal 67] Ltd', '[Shop 67]', 'restaurant',
        '[Contact]', '+254700006700', 'shop67@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c0670000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c0670000-0000-4000-8000-0000000000b1', 'c0670000-0000-4000-8000-00000000000a', 'Menu');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
values ('c0670000-0000-4000-8000-0000000000c1', 'c0670000-0000-4000-8000-0000000000b1',
        'c0670000-0000-4000-8000-00000000000a', 'Pilau', 500, true);

-- Somewhere we deliver.
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c0670000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 67]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

-- The phone-order guest's own order and payment.
insert into public.order (id, reference, guest_id, merchant_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
values ('c0670000-0000-4000-8000-0000000000f1', 'PHONE-ORDER-67', 'c0670000-0000-4000-8000-000000000001',
        'c0670000-0000-4000-8000-00000000000a', (select id from public.city where slug = 'nairobi'),
        'manual', '[Their home]', 'placed', 'mpesa_stk', 'pending', 50000, 0, 0, 50000, 'KES');
insert into public.payment (reference, intent, order_id, merchant_id, guest_id, city_id, amount_cents, created_via)
values ('NXP-TEST-6701', 'order', 'c0670000-0000-4000-8000-0000000000f1', 'c0670000-0000-4000-8000-00000000000a',
        'c0670000-0000-4000-8000-000000000001', (select id from public.city where slug = 'nairobi'), 50000, 'desk');

create function pg_temp.order_for(p_phone text) returns jsonb language sql as $$
  select jsonb_build_object('merchant_id', 'c0670000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk',
    'items', jsonb_build_array(jsonb_build_object(
      'catalogue_item_id', 'c0670000-0000-4000-8000-0000000000c1', 'quantity', 1)),
    'guest_phone', p_phone, 'dropoff_label', '[Fixture address]', 'lat', -1.4000, 'lng', 36.6000)
$$;

-- The hint an app would act on, or 'placed'.
create function pg_temp.hint_of(p_payload jsonb) returns text language plpgsql as $$
declare v_hint text;
begin
  perform public.rpc_order_place_web(p_payload);
  return 'placed';
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return coalesce(nullif(v_hint, ''), sqlerrm);
end
$$;

-- ── a new customer types the phone-order guest's number

select set_config('request.jwt.claims',
  '{"sub":"c0670000-0000-4000-8000-000000000021","role":"authenticated"}', true);

select is(pg_temp.hint_of(pg_temp.order_for('+254700006701')), 'phone_on_file',
  'A number already on a record is refused, with a hint the apps can act on.');
select throws_ok(
  format($$select public.rpc_order_place_web(%L::jsonb)$$, pg_temp.order_for('+254 700 006 701')::text),
  'That number is already on a NexG customer record. Use another number, or contact support to link it to your account.',
  'However it is spaced, and the customer is told what to do next.');
select is((select user_id from public.guest where id = 'c0670000-0000-4000-8000-000000000001'),
  null, 'The phone-order record still belongs to nobody.');

set local role authenticated;
select is((select count(*)::int from public.order where guest_id = 'c0670000-0000-4000-8000-000000000001'),
  0, 'The new customer cannot see its orders.');
select is((select count(*)::int from public.payment where guest_id = 'c0670000-0000-4000-8000-000000000001'),
  0, 'Nor its payments.');
reset role;

select is((public.rpc_order_place_web(pg_temp.order_for('+254700006702')) ->> 'ok')::boolean,
  true, 'With a number of their own, they place the order.');
select is((select phone from public.guest where user_id = 'c0670000-0000-4000-8000-000000000021'),
  '+254700006702', 'On a new record of their own.');

-- ── a customer whose record has no phone yet

select set_config('request.jwt.claims',
  '{"sub":"c0670000-0000-4000-8000-000000000022","role":"authenticated"}', true);
select is(pg_temp.hint_of(pg_temp.order_for('+254700006701')), 'phone_on_file',
  'Is refused the same way, not shown a database error.');
select is(pg_temp.hint_of(pg_temp.order_for('+254700006703')), 'placed',
  'And orders with a number of their own.');

select * from finish();
rollback;
