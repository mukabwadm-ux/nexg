-- A customer with no account can order delivery from a temporary (guest)
-- session, read that order and its stages back, and nobody else can.
-- Bookings and stay holds still need an account (85_accounts_only_...).

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  -- two guests on two phones, and one account
  ('00000000-0000-0000-0000-000000000000', 'c1060000-0000-4000-8000-000000000020',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1060000-0000-4000-8000-000000000021',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1060000-0000-4000-8000-000000000022',
   'authenticated', 'authenticated', 'account106@example.test', now(), false, now(), now());

-- A record staff made for a phone order: a number, no account.
insert into public.guest (id, phone, name)
values ('c1060000-0000-4000-8000-000000000001', '+254700010601', '[Phone-order guest]');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1060000-0000-4000-8000-00000000000a', '[Legal 106] Ltd', '[Shop 106]', 'restaurant',
        '[Contact]', '+254700010600', 'shop106@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1060000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c1060000-0000-4000-8000-0000000000b1', 'c1060000-0000-4000-8000-00000000000a', 'Menu');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available)
values ('c1060000-0000-4000-8000-0000000000c1', 'c1060000-0000-4000-8000-0000000000b1',
        'c1060000-0000-4000-8000-00000000000a', 'Chapati', 300, true);
insert into public.zone (id, city_id, name, tier, polygon, eta_min, eta_max, active)
values ('c1060000-0000-4000-8000-0000000000e1', (select id from public.city where slug = 'nairobi'),
        '[Zone 106]', 'core',
        'SRID=4326;POLYGON((36.59 -1.41, 36.61 -1.41, 36.61 -1.39, 36.59 -1.39, 36.59 -1.41))'::extensions.geography,
        20, 40, true);

create function pg_temp.order_for(p_phone text) returns jsonb language sql as $$
  select jsonb_build_object('merchant_id', 'c1060000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk',
    'items', jsonb_build_array(jsonb_build_object(
      'catalogue_item_id', 'c1060000-0000-4000-8000-0000000000c1', 'quantity', 2)),
    'guest_phone', p_phone, 'guest_name', '[Guest]',
    'dropoff_label', '[Fixture address]', 'lat', -1.4000, 'lng', 36.6000)
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

-- ── no session at all

set local role anon;
select throws_ok(
  format($$select public.rpc_order_place_web(%L::jsonb)$$, pg_temp.order_for('+254700010610')::text),
  '42501', null, 'With no session at all, nothing can be placed.');
select is((public.rpc_order_quote_web(pg_temp.order_for('+254700010610')) ->> 'ok')::boolean,
  true, 'But a price can be read before any session exists.');
reset role;

-- ── a guest (temporary session)

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1060000-0000-4000-8000-000000000020","role":"authenticated","is_anonymous":true}', true);

select is((public.rpc_order_quote_web(pg_temp.order_for('+254700010610')) ->> 'total_cents') is not null,
  true, 'A guest is quoted.');
select set_config('t.placed', public.rpc_order_place_web(pg_temp.order_for('+254 700 010 610'))::text, true);
select is((current_setting('t.placed')::jsonb ->> 'ok')::boolean, true, 'A guest places an order.');
select is((current_setting('t.placed')::jsonb ->> 'guest')::boolean, true, 'And is told it is a guest order.');

select is((select count(*)::int from public.order
            where id = (current_setting('t.placed')::jsonb ->> 'order_id')::uuid
              and stage = 'placed' and payment_status = 'pending'),
  1, 'The guest reads the order back: placed, waiting for payment.');
select is((select count(*)::int from public.order_item
            where order_id = (current_setting('t.placed')::jsonb ->> 'order_id')::uuid),
  1, 'With its lines.');
select is((select kind from public.order_event
            where order_id = (current_setting('t.placed')::jsonb ->> 'order_id')::uuid),
  'placed', 'And its stages so far.');
reset role;

select is((select phone from public.guest where user_id = 'c1060000-0000-4000-8000-000000000020'),
  '+254700010610', 'The guest''s number is kept on a record of their own, for the rider.');
select is((select dropoff_label from public.order
            where id = (current_setting('t.placed')::jsonb ->> 'order_id')::uuid),
  '[Fixture address]', 'With the delivery address.');

-- ── somebody else

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1060000-0000-4000-8000-000000000021","role":"authenticated","is_anonymous":true}', true);
select is((select count(*)::int from public.order
            where id = (current_setting('t.placed')::jsonb ->> 'order_id')::uuid),
  0, 'Another guest cannot see that order.');
select is((select count(*)::int from public.order_event
            where order_id = (current_setting('t.placed')::jsonb ->> 'order_id')::uuid),
  0, 'Nor its stages.');
reset role;

select is(pg_temp.hint_of(pg_temp.order_for('+254700010601')), 'phone_on_file',
  'A guest typing a number already on a record is refused, as an account is.');
select is((select user_id from public.guest where id = 'c1060000-0000-4000-8000-000000000001'),
  null, 'And the record is not handed to them.');

-- ── a guest cannot pile up unpaid orders

select set_config('request.jwt.claims',
  '{"sub":"c1060000-0000-4000-8000-000000000020","role":"authenticated","is_anonymous":true}', true);
do $$ begin perform pg_temp.hint_of(pg_temp.order_for('+254700010610')); end $$;
do $$ begin perform pg_temp.hint_of(pg_temp.order_for('+254700010610')); end $$;
select is(pg_temp.hint_of(pg_temp.order_for('+254700010610')), 'guest_unpaid_limit',
  'A fourth unpaid order from the same guest is refused.');

-- An account is not limited this way.
select set_config('request.jwt.claims',
  '{"sub":"c1060000-0000-4000-8000-000000000022","role":"authenticated"}', true);
do $$ begin perform pg_temp.hint_of(pg_temp.order_for('+254700010620')); end $$;
do $$ begin perform pg_temp.hint_of(pg_temp.order_for('+254700010620')); end $$;
do $$ begin perform pg_temp.hint_of(pg_temp.order_for('+254700010620')); end $$;
select is(pg_temp.hint_of(pg_temp.order_for('+254700010620')), 'placed',
  'An account places a fourth.');

select * from finish();
rollback;
