-- Receipts: issued when money moves, once, emailed, and readable only by their owner.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','d5200000-0000-4000-8000-000000000001',
   'authenticated','authenticated','guest52@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d5200000-0000-4000-8000-000000000002',
   'authenticated','authenticated','other52@example.test',now(),false,now(),now()),
  ('00000000-0000-0000-0000-000000000000','d5200000-0000-4000-8000-000000000003',
   'authenticated','authenticated','host52@example.test',now(),false,now(),now());

insert into public.host (id, kind, display_name, phone, email, city_id, status, verified_at, went_live_at)
values ('d5210000-0000-4000-8000-00000000000a','multi_unit','[Host 52]','+254700052000','host52@example.test',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.host_user (host_id, user_id, role)
values ('d5210000-0000-4000-8000-00000000000a','d5200000-0000-4000-8000-000000000003','owner');
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('d5220000-0000-4000-8000-00000000000a','d5210000-0000-4000-8000-00000000000a',
        'block-52','Block 52','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('d5230000-0000-4000-8000-00000000000a','d5210000-0000-4000-8000-00000000000a',
        'd5220000-0000-4000-8000-00000000000a','A','Studio A','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 5000);

create temp table t (k text primary key, v text);
create temp table d as select (now() at time zone 'Africa/Nairobi')::date as today;
do $grant$
begin
  execute format('grant usage on schema %I to authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 'd' and n.nspname like 'pg_temp%'));
end
$grant$;
grant select on d to authenticated;
grant all on t to authenticated;

-- A guest books and pays two nights.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d5200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into t (k, v) select 'stay', public.rpc_stay_hold('d5230000-0000-4000-8000-00000000000a',
  (select today + 10 from d), (select today + 12 from d)) ->> 'stay_id';
insert into t (k, v) select 'ref', public.rpc_payment_begin_stay((select v::uuid from t where k = 'stay')) ->> 'reference';
reset role;

select public.rpc_payment_webhook(
  p_event => 'test.settled', p_reference => (select v from t where k = 'ref'),
  p_dedupe_key => 'test52', p_signature_ok => true, p_payload => '{}'::jsonb, p_paid => true,
  p_provider_ref => 'CHECKOUT-52', p_amount_cents => 1000000, p_channel => 'mpesa');

select is(
  (select kind || ' ' || total_cents from public.receipt
    where party_type = 'guest' and party_id = 'd5200000-0000-4000-8000-000000000001'),
  'payment 1000000',
  'The guest gets a payment receipt for exactly what they paid.');

select ok(
  (select number ~ '^RCT-\d{2}-\d{5}$' from public.receipt
    where party_type = 'guest' and party_id = 'd5200000-0000-4000-8000-000000000001'),
  'It has a receipt number like RCT-26-00001.');

select is(
  (select total_cents || ' ' || (lines -> 1 ->> 'amount_cents') from public.receipt
    where party_type = 'host' and party_id = 'd5210000-0000-4000-8000-00000000000a'),
  '850000 -150000',
  'The host gets a booking earnings receipt: their 85%, with the 15% commission shown.');

select is(
  (select count(*)::int from public.notification_outbox
    where template = 'receipt' and recipient in ('guest52@example.test', 'host52@example.test')),
  2,
  'Both receipts are emailed, each to its owner.');

update public.payment set provider_receipt = 'SKR52ABCDE' where reference = (select v from t where k = 'ref');
select is(
  (select method || ' ' || method_ref from public.receipt
    where party_type = 'guest' and party_id = 'd5200000-0000-4000-8000-000000000001'),
  'M-Pesa SKR52ABCDE',
  'The M-Pesa receipt code is added when it arrives.');

select public.fn_receipt_for_payment((select id from public.payment where reference = (select v from t where k = 'ref')), true);
select is(
  (select count(*)::int from public.receipt where source_type = 'payment'
     and source_id = (select id from public.payment where reference = (select v from t where k = 'ref'))),
  1,
  'Settling twice never issues a second receipt.');

-- A stay refund recorded by staff gives the guest a refund receipt.
update public.stay set status = 'cancelled', refund_due_at = now(), refunded_at = now(),
       refund_reference = 'SKRFD52'
 where id = (select v::uuid from t where k = 'stay');
select ok(
  (select number ~ '^RFD-' and total_cents = 1000000 and method_ref = 'SKRFD52' from public.receipt
    where source_type = 'stay_refund' and source_id = (select v::uuid from t where k = 'stay')),
  'A stay refund gets an RFD receipt with the refund''s M-Pesa reference.');

-- Who can see what.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d5200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select array_agg(kind order by kind) from public.receipt),
  array['payment', 'refund'],
  'The guest sees their payment and refund receipts, and not the host''s.');

select set_config('request.jwt.claims',
  '{"sub":"d5200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.receipt), 0, 'Another signed-in person sees none of them.');

select set_config('request.jwt.claims',
  '{"sub":"d5200000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(
  (select array_agg(kind) from public.receipt),
  array['earnings'],
  'The host sees their own earnings receipt only.');
reset role;

set local role anon;
select throws_ok($$ select * from public.receipt $$, '42501', null, 'Receipts are never public.');
reset role;

select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical' and finding ilike '%receipt%'),
  0,
  'The wiring check is clean.');

select * from finish();
rollback;
