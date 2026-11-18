-- Merchant Performance: what counts as a sale, commission without VAT, the
-- period before, the category filter, and who may read it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;
insert into t (k, v) values ('nbo', (select id::text from public.city where slug = 'nairobi'));

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;
create function pg_temp.today() returns date language sql stable as $f$
  select (now() at time zone 'Africa/Nairobi')::date
$f$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), now(), now()
from (values
  ('0a800000-0000-4000-8000-0000000000a1'::uuid, 'merchops.perf@test.local'),
  ('0a800000-0000-4000-8000-0000000000a2'::uuid, 'guest.perf@test.local')
) as u (id, email);
insert into public.staff_user (id, user_id, email, display_name) values
  ('0a800000-0000-4000-8000-0000000000b1', '0a800000-0000-4000-8000-0000000000a1', 'merchops.perf@test.local', 'Perf Ops');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select '0a800000-0000-4000-8000-0000000000b1', r.id, (select v::uuid from t where k = 'nbo'),
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from public.role r where r.key = 'merchant_ops';

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email,
                             city_id, status, went_live_at, explore_visible)
values ('0a800000-0000-4000-8000-0000000000c1', 'PerfT Kitchen Ltd', 'PerfT Kitchen', 'restaurants_food', 'Owner',
        '+254712000801', 'kitchen.perf@shop.example', (select v::uuid from t where k = 'nbo'), 'live',
        now() - interval '90 days', true);
insert into public.guest (id, phone, name) values ('0a800000-0000-4000-8000-0000000000e1', '+254711800801', 'Perf Guest');

-- This period: two sales (one with commission) and one cancelled order. The period before: one sale.
insert into public.order (id, reference, guest_id, merchant_id, city_id, channel, dropoff_label, stage, payment_method,
                          payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency,
                          commission_cents, placed_at, cancelled_at, cancel_reason_code)
select o.id, o.ref, '0a800000-0000-4000-8000-0000000000e1', '0a800000-0000-4000-8000-0000000000c1',
       (select v::uuid from t where k = 'nbo'), 'web', 'Kilimani', o.stage::public.order_stage, 'cash_on_delivery',
       'pending', o.sub, 0, 0, o.sub, 'KES', o.comm, o.placed, o.cancelled, o.reason
from (values
  ('0a800000-0000-4000-8000-000000000101'::uuid, 'PERF-1', 'placed', 100000, 11600, now() - interval '2 days', null::timestamptz, null),
  ('0a800000-0000-4000-8000-000000000102', 'PERF-2', 'placed', 50000, null, now() - interval '3 days', null, null),
  ('0a800000-0000-4000-8000-000000000103', 'PERF-3', 'cancelled', 999900, null, now() - interval '1 day', now(), 'guest_cancelled'),
  ('0a800000-0000-4000-8000-000000000104', 'PERF-4', 'placed', 60000, null, now() - interval '40 days', null, null)
) as o (id, ref, stage, sub, comm, placed, cancelled, reason);

set local role authenticated;
select pg_temp.as_user('0a800000-0000-4000-8000-0000000000a1');
insert into t (k, v) select 'p', public.rpc_merchant_performance(pg_temp.today() - 29, pg_temp.today(), array['restaurants_food'])::text;

create function pg_temp.mine() returns jsonb language sql as $f$
  select m from jsonb_array_elements((select v::jsonb from t where k = 'p') -> 'merchants') m
  where m ->> 'id' = '0a800000-0000-4000-8000-0000000000c1'
$f$;

select is((pg_temp.mine() ->> 'gmv')::bigint, 150000::bigint, 'sales are the subtotals of orders not cancelled');
select is((pg_temp.mine() ->> 'orders')::integer, 2, 'the cancelled order is not counted');
select is((pg_temp.mine() ->> 'commission')::bigint, 10000::bigint, 'commission is shown without its 16% VAT');
select is((pg_temp.mine() ->> 'prev_gmv')::bigint, 60000::bigint, 'the period before is the same number of days');
select is(
  jsonb_array_length((select v::jsonb from t where k = 'p') -> 'series'), 30, 'one point per day');
select is(
  (select count(*)::integer from jsonb_array_elements(
     public.rpc_merchant_performance(pg_temp.today() - 29, pg_temp.today(), array['groceries_essentials']) -> 'merchants') m
   where m ->> 'id' = '0a800000-0000-4000-8000-0000000000c1'),
  0, 'another category leaves this merchant out');
select throws_ok($$ select public.rpc_merchant_performance(pg_temp.today(), pg_temp.today() - 1, null) $$, '22023', null,
  'a period that ends before it starts is refused');

select pg_temp.as_user('0a800000-0000-4000-8000-0000000000a2');
select throws_ok($$ select public.rpc_merchant_performance(pg_temp.today() - 29, pg_temp.today(), null) $$, '42501', null,
  'someone outside Merchants and Finance cannot read it');
reset role;

select ok(not has_function_privilege('anon', 'public.rpc_merchant_performance(date, date, text[])', 'execute'),
  'signed-out visitors cannot call it');

select * from finish();
rollback;
