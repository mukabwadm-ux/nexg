-- A merchant books a service through the API.
--
-- The scenario: a tour company uses NexG to move their visitors from
-- the airport. They call the API, say two passengers are arriving, and
-- pay.
--
-- These tests are about the four things that make that safe to expose:
-- the key identifies the merchant, the price comes from the settings and
-- not from the caller, the same key makes the same order, and the order
-- lands in the places the operations team already looks.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

/* Carries the reference between statements. */
create temp table t (k text primary key, v text);

do $grant$
begin
  execute format('grant usage on schema %I to anon',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 't' and nspname like 'pg_temp%'));
end
$grant$;
grant all on t to anon;

set local session_replication_role = replica;
delete from public.role_grant;
delete from public.staff_user;
set local session_replication_role = origin;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• fixtures

/* A live merchant, in Nairobi, that can take orders. */
insert into public.merchant (legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, went_live_at)
select 'Sunrise Tours Ltd', 'Sunrise Tours', 'airport_transfers', 'Asha', '+254700000001',
       'asha@sunrisetours.test',
       (select id from public.city where slug='nairobi'), 'live', now()
where exists (select 1 from public.city where slug='nairobi');

/* A second merchant, so the tests can prove one cannot book for the other. */
insert into public.merchant (legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, went_live_at)
select 'Harbour Tours Ltd', 'Harbour Tours', 'airport_transfers', 'Bodo', '+254700000002',
       'bodo@harbourtours.test',
       (select id from public.city where slug='nairobi'), 'live', now()
where exists (select 1 from public.city where slug='nairobi');

/* The price of an airport transfer, in the fee settings. */
insert into settings.definition (key, "group", scope_kind, value_type, unit, label)
values ('fees.service.airport_transfer', 'fees', 'global', 'money', 'KES',
        'Airport transfer, per passenger')
on conflict (key) do nothing;

insert into settings.version (key, scope_kind, value, status, effective_from)
values ('fees.service.airport_transfer', 'global', '4500'::jsonb, 'active', now())
on conflict do nothing;

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• the key

/* A merchant key with the scope that lets it book. */
select lives_ok(
  $$insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
    select m.id, encode(sha256('tour-key-abcdefghijklmnop'::bytea), 'hex'),
           'tour-key', '{public_read,merchant_write}', 60
    from public.merchant m where m.trading_name = 'Sunrise Tours'$$,
  'a merchant key can be issued');

/* A key that can only read. */
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select m.id, encode(sha256('read-key-abcdefghijklmnop'::bytea), 'hex'),
       'read-key', '{public_read}', 60
from public.merchant m where m.trading_name = 'Sunrise Tours';

/* A key bound to the other merchant, with the write scope. */
insert into public.api_key (merchant_id, key_hash, key_prefix, scopes, rate_limit)
select m.id, encode(sha256('harbour-key-abcdefghijklmn'::bytea), 'hex'),
       'harbour-k', '{public_read,merchant_write}', 60
from public.merchant m where m.trading_name = 'Harbour Tours';

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• the booking */

select lives_ok(
  $$insert into t (k, v) values ('booking', public.rpc_order_place_api(
       'tour-key-abcdefghijklmnop',
       'idem-key-000000000000001',
       '{"service":"airport_transfer","quantity":2,
         "pickup_label":"JKIA Terminal 1E","pickup_lat":-1.3192,"pickup_lng":36.9278,
         "dropoff_label":"Nairobi Serena Hotel","dropoff_lat":-1.2832,"dropoff_lng":36.8172,
         "scheduled_for":"2030-06-01T08:00:00Z",
         "passengers":[{"name":"Jane Doe","phone":"+254700000010","flight":"KQ100"}],
         "payment_method":"on_account"}'::jsonb)::text) $$,
  'a merchant can book an airport transfer through the API');

/* The booking succeeded. */
select is(
  (select v::jsonb ->> 'ok' from t where k='booking'),
  'true',
  'the booking succeeded');

/* It has a reference a person can quote on the phone. */
select ok(
  (select (v::jsonb ->> 'reference') is not null and (v::jsonb ->> 'reference') <> ''
   from t where k='booking'),
  'the booking has a reference');

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• the price */

/*
 * Two passengers at 4500 each is 9000, and the service fee on top.
 * The number that matters is that the caller did not choose it: the
 * price is 4500 because that is what the settings say.
 */
/*
 * Two passengers at 4500 each is 9000, plus the service fee on top and
 * the band-1 delivery fee. Every one of those numbers was read from the
 * settings; the caller said only how many and where.
 */
select is(
  (select (v::jsonb ->> 'total_cents')::bigint from t where k='booking'),
  (select 900000
     + round(900000 * coalesce(settings.fn_num('fees.service_pct'), 0) / 100)::bigint
     + coalesce(settings.fn_int('fees.delivery.band_1'), 0) * 100
   from settings.definition d
   where d.key = 'fees.service_pct'),
  'the price came from the settings, not from the caller');

/* The order exists, on the right merchant, on the api channel. */
select is(
  (select channel::text from public.order where reference = (select v::jsonb ->> 'reference' from t where k='booking')),
  'api',
  'the order is on the api channel');

select is(
  (select o.merchant_id = (select id from public.merchant where trading_name = 'Sunrise Tours')
   from public.order o where o.reference = (select v::jsonb ->> 'reference' from t where k='booking')),
  true,
  'the order belongs to the merchant whose key made the call');

/* One line, for two passengers, at the settings price. */
select is(
  (select i.quantity from public.order_item i
   join public.order o on o.id = i.order_id
   where o.reference = (select v::jsonb ->> 'reference' from t where k='booking')),
  2,
  'the order carries one line for two passengers');

/* The money on the order is the sum of its lines. */
select ok(
  (select o.total_cents = o.subtotal_cents + o.delivery_fee_cents + o.service_fee_cents
   from public.order o where o.reference = (select v::jsonb ->> 'reference' from t where k='booking')),
  'the total is the sum of the lines');

/* The order was frozen with the figures and the settings that produced them. */
select ok(
  (select o.pricing_version_ids ? 'service_unit_price'
   from public.order o where o.reference = (select v::jsonb ->> 'reference' from t where k='booking')),
  'the order records which settings produced the price');

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• the retry */

/*
 * The same key, the same call. The answer is the same and the order is
 * still the one order. A machine that retries must not create a second
 * airport transfer.
 */
select lives_ok(
  $$insert into t (k, v) values ('retry', public.rpc_order_place_api(
       'tour-key-abcdefghijklmnop',
       'idem-key-000000000000001',
       '{"service":"airport_transfer","quantity":2,
         "pickup_label":"JKIA Terminal 1E","pickup_lat":-1.3192,"pickup_lng":36.9278,
         "dropoff_label":"Nairobi Serena Hotel","dropoff_lat":-1.2832,"dropoff_lng":36.8172}'::jsonb)::text) $$,
  'the same key can be replayed');

select is(
  (select v::jsonb ->> 'reference' from t where k='retry'),
  (select v::jsonb ->> 'reference' from t where k='booking'),
  'the retry returns the same reference');

select is(
  (select count(*)::integer from public.order
   where merchant_id = (select id from public.merchant where trading_name='Sunrise Tours')),
  1,
  'the retry did not make a second order');

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• the refusals */

/* A key that can only read cannot book. */
select throws_ok(
  $$select public.rpc_order_place_api(
       'read-key-abcdefghijklmnop',
       'idem-key-000000000000002',
       '{"service":"airport_transfer","quantity":1,
         "pickup_label":"JKIA","pickup_lat":-1.3192,"pickup_lng":36.9278,
         "dropoff_label":"Hotel","dropoff_lat":-1.2832,"dropoff_lng":36.8172}'::jsonb) $$,
  '42501',
  'This key cannot book services.',
  'a key without the write scope is refused');

/* A ride with no pickup point cannot be dispatched, so it is refused. */
select throws_ok(
  $$select public.rpc_order_place_api(
       'tour-key-abcdefghijklmnop',
       'idem-key-000000000000003',
       '{"service":"airport_transfer","quantity":1}'::jsonb) $$,
  '22023',
  'Where are we collecting from?',
  'a booking with nothing to dispatch is refused');

/* A service we do not offer is refused. */
select throws_ok(
  $$select public.rpc_order_place_api(
       'tour-key-abcdefghijklmnop',
       'idem-key-000000000000004',
       '{"service":"teleportation","quantity":1}'::jsonb) $$,
  '22023',
  'That service is not one we offer.',
  'a service that is not in the catalogue is refused');

/* Another merchant's key cannot book under this merchant's idempotency key. */
select is(
  (select (v::jsonb ->> 'reference') from t where k='booking')
  is distinct from
  (select public.rpc_order_place_api(
       'harbour-key-abcdefghijklmn',
       'idem-key-000000000000001',
       '{"service":"airport_transfer","quantity":2,
         "pickup_label":"JKIA","pickup_lat":-1.3192,"pickup_lng":36.9278,
         "dropoff_label":"Hotel","dropoff_lat":-1.2832,"dropoff_lng":36.8172}'::jsonb) ->> 'reference'),
  true,
  'another merchant with the same key gets its own order');

rollback;
