-- A flat-priced service is charged once, whatever the quantity.
--
-- A venue booking is priced per booking (unit_basis 'flat'), a transfer per
-- passenger. Booking a venue for 4 must cost what booking it for 1 costs,
-- and the order line must still add up: quantity x unit price = line total,
-- in cents, like every other order line. Reading the booking back gives the
-- quantity it was booked with.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create temp table t (k text primary key, v jsonb);

-- ═══════════════════════════════════════════════════════════════ fixtures

/* A live merchant in Nairobi, with a key that can book and read. */
insert into public.merchant (legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, went_live_at)
select 'Lakeside Venues Ltd', 'Lakeside Venues', 'airport_transfers', 'Wanjiru', '+254700000301',
       'wanjiru@lakeside.test', (select id from public.city where slug = 'nairobi'), 'live', now();

insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select m.id, encode(sha256('flat-key-abcdefghijklmnop'::bytea), 'hex'), 'flat-key',
       '{public_read,merchant_read,merchant_write}', 60
from public.merchant m where m.trading_name = 'Lakeside Venues';

/* Prices, in shillings: a venue booking is flat, a transfer per passenger. */
insert into settings.definition (key, "group", scope_kind, value_type, unit, label)
values
  ('fees.service.venue_booking', 'fees', 'global', 'money', 'KES', 'Venue booking, flat'),
  ('fees.service.airport_transfer', 'fees', 'global', 'money', 'KES', 'Airport transfer, per passenger')
on conflict (key) do nothing;

insert into settings.version (key, scope_kind, value, status, effective_from)
values
  ('fees.service.venue_booking', 'global', '15000'::jsonb, 'active', now()),
  ('fees.service.airport_transfer', 'global', '4500'::jsonb, 'active', now())
on conflict do nothing;

/* The price of a service in Nairobi, as the booking functions ask for it. */
create function pg_temp.price(p_code text, p_quantity integer) returns jsonb
language sql stable as $$
  select public.fn_price_api_service(
    (select id from public.city where slug = 'nairobi'),
    (select s from public.api_service s where s.code = p_code),
    p_quantity)
$$;

-- ═══════════════════════════════════════════════════════════════ the price

select is(
  pg_temp.price('venue_booking', 4) ->> 'total_cents',
  pg_temp.price('venue_booking', 1) ->> 'total_cents',
  'a flat service costs the same whatever the quantity');

select is(
  (pg_temp.price('venue_booking', 4) ->> 'subtotal_cents')::bigint,
  1500000::bigint,
  'a venue booking for 4 is charged once: KES 15,000');

select is(
  (pg_temp.price('airport_transfer', 2) ->> 'subtotal_cents')::bigint,
  900000::bigint,
  'a transfer for 2 is still charged per passenger');

select is(
  (pg_temp.price('airport_transfer', 2) ->> 'unit_price_cents') || '|'
    || (pg_temp.price('airport_transfer', 2) ->> 'units') || '|'
    || (pg_temp.price('venue_booking', 4) ->> 'units') || '|'
    || (pg_temp.price('venue_booking', 4) ->> 'quantity'),
  '450000|2|1|4',
  'the unit price is in cents, and a flat service counts one unit for any quantity');

-- ═══════════════════════════════════════════════════════════════ the booking

select lives_ok(
  $$insert into t values ('venue', public.rpc_order_place_api(
      'flat-key-abcdefghijklmnop', 'flat-idem-000000000000001',
      '{"service":"venue_booking","quantity":4}'::jsonb))$$,
  'a venue can be booked for 4');

select is(
  (select (v ->> 'quantity') || '|' || (v ->> 'total_cents') from t where k = 'venue'),
  '4|' || (pg_temp.price('venue_booking', 1) ->> 'total_cents'),
  'the receipt says 4 and charges the flat price once');

select is(
  (select i.quantity || ' x ' || i.unit_price_cents || ' = ' || i.line_total_cents
   from public.order_item i
   where i.order_id = (select (v ->> 'order_id')::uuid from t where k = 'venue')),
  '1 x 1500000 = 1500000',
  'the venue order line is one booking at the flat price, in cents');

select lives_ok(
  $$insert into t values ('transfer', public.rpc_order_place_api(
      'flat-key-abcdefghijklmnop', 'flat-idem-000000000000002',
      '{"service":"airport_transfer","quantity":2,
        "pickup_label":"JKIA Terminal 1E","pickup_lat":-1.3192,"pickup_lng":36.9278,
        "dropoff_label":"Nairobi Serena Hotel","dropoff_lat":-1.2832,"dropoff_lng":36.8172}'::jsonb))$$,
  'a transfer can be booked for 2');

select is(
  (select i.quantity || ' x ' || i.unit_price_cents || ' = ' || i.line_total_cents
   from public.order_item i
   where i.order_id = (select (v ->> 'order_id')::uuid from t where k = 'transfer')),
  '2 x 450000 = 900000',
  'a transfer line is per passenger, in cents');

select ok(
  (select bool_and(o.subtotal_cents = (select sum(i.line_total_cents) from public.order_item i
                                       where i.order_id = o.id and i.removed_at is null))
   from public.order o
   where o.merchant_id = (select id from public.merchant where trading_name = 'Lakeside Venues')),
  'each booking''s subtotal is the sum of its lines');

-- ═══════════════════════════════════════════════════════════════ reading it back

select is(
  public.rpc_order_read_api('flat-key-abcdefghijklmnop',
    (select (v ->> 'order_id')::uuid from t where k = 'venue'), 1, null, null)
    -> 'items' -> 0 ->> 'quantity',
  '4',
  'reading the venue booking back gives the quantity booked');

select is(
  public.rpc_order_read_api('flat-key-abcdefghijklmnop',
    (select (v ->> 'order_id')::uuid from t where k = 'transfer'), 1, null, null)
    -> 'items' -> 0 ->> 'quantity',
  '2',
  'reading the transfer back gives its passengers');

select * from finish();
rollback;
