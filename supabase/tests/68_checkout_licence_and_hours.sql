-- Checkout sells age-restricted items only where the menu would show them,
-- and takes no order while the shop is closed.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c0680000-0000-4000-8000-000000000021',
        'authenticated', 'authenticated', 'licence.guest68@example.test', now(), false, now(), now());
insert into public.guest (id, phone, name, user_id)
values ('c0680000-0000-4000-8000-000000000001', '+254700006801', '[Guest 68]',
        'c0680000-0000-4000-8000-000000000021');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c0680000-0000-4000-8000-00000000000a', '[Legal 68] Ltd', '[Shop 68]', 'restaurant',
        '[Contact]', '+254700006800', 'shop68@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c0680000-0000-4000-8000-00000000000a', 'Main', '[Address]', true);
insert into public.catalogue_section (id, merchant_id, name)
values ('c0680000-0000-4000-8000-0000000000b1', 'c0680000-0000-4000-8000-00000000000a', 'Menu');
insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available, age_restricted)
values
  ('c0680000-0000-4000-8000-0000000000c1', 'c0680000-0000-4000-8000-0000000000b1',
   'c0680000-0000-4000-8000-00000000000a', 'Lager', 350, true, true),
  ('c0680000-0000-4000-8000-0000000000c2', 'c0680000-0000-4000-8000-0000000000b1',
   'c0680000-0000-4000-8000-00000000000a', 'Chips', 200, true, false);

create function pg_temp.basket(p_item uuid) returns jsonb language sql as $$
  select jsonb_build_object('merchant_id', 'c0680000-0000-4000-8000-00000000000a',
    'payment_method', 'mpesa_stk',
    'items', jsonb_build_array(jsonb_build_object('catalogue_item_id', p_item, 'quantity', 2)))
$$;

-- ── no licence on file

select is(
  (select count(*)::int from public.catalogue_public where id = 'c0680000-0000-4000-8000-0000000000c1'),
  0, 'Without a liquor licence the menu hides the lager.');
select is(
  public.fn_web_order_quote(pg_temp.basket('c0680000-0000-4000-8000-0000000000c1')) ->> 'message',
  '[Shop 68] cannot sell age-restricted items on NexG yet. Remove them to continue.',
  'And a basket built by hand cannot buy it.');
select is(
  (public.fn_web_order_quote(pg_temp.basket('c0680000-0000-4000-8000-0000000000c2')) ->> 'ok')::boolean,
  true, 'The rest of the menu still sells.');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (public.rpc_order_quote_web(pg_temp.basket('c0680000-0000-4000-8000-0000000000c1')) ->> 'ok')::boolean,
  false, 'The public quote refuses it too.');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0680000-0000-4000-8000-000000000021","role":"authenticated"}', true);
select throws_like(
  format($$select public.rpc_order_place_web(%L::jsonb)$$,
    (pg_temp.basket('c0680000-0000-4000-8000-0000000000c1')
      || jsonb_build_object('guest_phone', '+254700006801', 'dropoff_label', '[Fixture address]',
                            'lat', -1.2730, 'lng', 36.8000))::text),
  '%cannot sell age-restricted items%', 'Placing the order is refused for the same reason.');
reset role;

-- ── a verified licence

insert into public.document (id, owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
                             status, reviewed_at)
values ('c0680000-0000-4000-8000-0000000000d1', 'merchant', 'c0680000-0000-4000-8000-00000000000a',
        (select id from public.document_requirement
          where owner_type = 'merchant' and kind = 'liquor_licence' order by id limit 1),
        'merchant/c0680000/liquor.pdf', 'application/pdf', 1024, 'verified', now());

select is(
  (select count(*)::int from public.catalogue_public where id = 'c0680000-0000-4000-8000-0000000000c1'),
  1, 'With a verified licence the menu shows the lager.');
select is(
  (public.fn_web_order_quote(pg_temp.basket('c0680000-0000-4000-8000-0000000000c1')) ->> 'has_age_restricted')::boolean,
  true, 'And checkout sells it, marked as age-restricted.');

-- ── the licence is replaced and the new one is not yet verified

update public.document set superseded_at = now() where id = 'c0680000-0000-4000-8000-0000000000d1';

select is(
  (public.fn_web_order_quote(pg_temp.basket('c0680000-0000-4000-8000-0000000000c1')) ->> 'ok')::boolean,
  false, 'A superseded licence no longer counts at checkout.');
select is(
  (select count(*)::int from public.catalogue_public where id = 'c0680000-0000-4000-8000-0000000000c1'),
  0, 'Nor on the menu: the two rules agree.');

-- ── opening hours (until now the shop had none on file, so it counted as open)

-- Today's hours open two hours from now, for an hour: shut right now.
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
values ('c0680000-0000-4000-8000-00000000000a',
        extract(dow from (now() at time zone 'Africa/Nairobi'))::smallint,
        ((now() at time zone 'Africa/Nairobi') + interval '2 hours')::time,
        ((now() at time zone 'Africa/Nairobi') + interval '3 hours')::time);
select is(
  public.fn_web_order_quote(pg_temp.basket('c0680000-0000-4000-8000-0000000000c2')) ->> 'message',
  '[Shop 68] is closed right now.', 'Outside its opening hours the shop takes no orders.');

-- Open all day today, but it closed early.
update public.merchant_hours set opens = '08:00', closes = '08:00'
 where merchant_id = 'c0680000-0000-4000-8000-00000000000a';
update public.merchant set closed_early_at = now() where id = 'c0680000-0000-4000-8000-00000000000a';
select is(
  public.fn_web_order_quote(pg_temp.basket('c0680000-0000-4000-8000-0000000000c2')) ->> 'message',
  '[Shop 68] is closed right now.', 'A shop that closed early today takes no orders.');

update public.merchant set closed_early_at = null where id = 'c0680000-0000-4000-8000-00000000000a';
select is(
  (public.fn_web_order_quote(pg_temp.basket('c0680000-0000-4000-8000-0000000000c2')) ->> 'ok')::boolean,
  true, 'Open again, it takes orders.');

select * from finish();
rollback;
