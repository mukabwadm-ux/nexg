-- Payouts & Settlements: per-merchant money for the period, the summary
-- that adds back up to GMV, a status read from a settlement run, the
-- filters, and who may read it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

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
  ('0b900000-0000-4000-8000-0000000000a1'::uuid, 'merchops.pay@test.local'),
  ('0b900000-0000-4000-8000-0000000000a2'::uuid, 'guest.pay@test.local')
) as u (id, email);
insert into public.staff_user (id, user_id, email, display_name) values
  ('0b900000-0000-4000-8000-0000000000b1', '0b900000-0000-4000-8000-0000000000a1', 'merchops.pay@test.local', 'Pay Ops');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select '0b900000-0000-4000-8000-0000000000b1', r.id, (select v::uuid from t where k = 'nbo'),
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from public.role r where r.key = 'merchant_ops';

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email,
                             city_id, status, went_live_at, explore_visible, payout_rail)
values
  ('0b900000-0000-4000-8000-0000000000c1', 'PayT Kitchen Ltd', 'PayT Kitchen', 'restaurants_food', 'Owner',
   '+254712000901', 'kitchen.pay@shop.example', (select v::uuid from t where k = 'nbo'), 'live', now() - interval '60 days', true,
   'mpesa_paybill'),
  ('0b900000-0000-4000-8000-0000000000c2', 'PayT Grocer Ltd', 'PayT Grocer', 'groceries_essentials', 'Owner',
   '+254712000902', 'grocer.pay@shop.example', (select v::uuid from t where k = 'nbo'), 'live', now() - interval '60 days', true,
   null);
insert into public.guest (id, phone, name) values ('0b900000-0000-4000-8000-0000000000e1', '+254711900901', 'Pay Guest');

insert into public.order (id, reference, guest_id, merchant_id, city_id, channel, dropoff_label, stage, payment_method,
                          payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency,
                          commission_cents, placed_at)
select o.id, o.ref, '0b900000-0000-4000-8000-0000000000e1', o.merchant, (select v::uuid from t where k = 'nbo'), 'web',
       'Kilimani', 'placed', 'cash_on_delivery', 'pending', o.sub, 0, 0, o.sub, 'KES', o.comm, now() - interval '2 days'
from (values
  ('0b900000-0000-4000-8000-000000000101'::uuid, 'PAY-1', '0b900000-0000-4000-8000-0000000000c1'::uuid, 100000, 23200),
  ('0b900000-0000-4000-8000-000000000102', 'PAY-2', '0b900000-0000-4000-8000-0000000000c2', 40000, 11600)
) as o (id, ref, merchant, sub, comm);

-- The grocer is in a run that pays on Friday.
insert into public.fin_settlement_run (id, reference, city_id, period_start, period_end, cutoff_at, pay_date, state)
values ('0b900000-0000-4000-8000-000000000201', 'RUN-TEST-W01', (select v::uuid from t where k = 'nbo'),
        now() - interval '7 days', now() + interval '1 day', now() + interval '1 day', pg_temp.today() + 3, 'built');
insert into public.fin_settlement_line (run_id, party_type, party_id, party_label, rail, gross_cents, commission_cents,
                                        net_cents, state)
values ('0b900000-0000-4000-8000-000000000201', 'merchant', '0b900000-0000-4000-8000-0000000000c2', 'PayT Grocer',
        'mpesa_b2b', 28400, 10000, 28400, 'ready');

set local role authenticated;
select pg_temp.as_user('0b900000-0000-4000-8000-0000000000a1');
create function pg_temp.pay(p_status text default null, p_rail text default null) returns jsonb language sql as $f$
  select public.rpc_merchant_payouts(pg_temp.today() - 29, pg_temp.today(),
    array['restaurants_food', 'groceries_essentials'], p_rail, p_status, 'PayT', 50, 0)
$f$;
create function pg_temp.row_of(p_name text) returns jsonb language sql as $f$
  select r from jsonb_array_elements(pg_temp.pay() -> 'rows') r where r ->> 'name' = p_name
$f$;

select is((pg_temp.row_of('PayT Kitchen') ->> 'payout')::bigint, 76800::bigint, 'the payout is sales less commission with VAT');
select is((pg_temp.row_of('PayT Kitchen') ->> 'commission')::bigint, 20000::bigint, 'commission is shown without VAT');
select is((pg_temp.row_of('PayT Kitchen') ->> 'vat')::bigint, 3200::bigint, 'and the VAT apart');
select is((pg_temp.row_of('PayT Kitchen') ->> 'status'), 'pending', 'not in a run yet: pending');
select is((pg_temp.row_of('PayT Grocer') ->> 'status'), 'scheduled', 'in a built run: scheduled');
select is((pg_temp.row_of('PayT Grocer') ->> 'payout_date'), (pg_temp.today() + 3)::text, 'it pays on the run''s date');
select ok(
  (select (s ->> 'gmv')::bigint = (s ->> 'payouts')::bigint + (s ->> 'commission')::bigint + (s ->> 'vat')::bigint
   from (select public.rpc_merchant_payouts(pg_temp.today() - 29, pg_temp.today(), null, null, null, null, 5, 0) -> 'summary' as s) x),
  'payouts, commission and VAT add back up to GMV');
select is((pg_temp.pay(null, 'mpesa') ->> 'total')::integer, 2, 'both pay by M-Pesa (one by its run, one by its account)');
select throws_ok($$ select public.rpc_merchant_payouts(pg_temp.today() - 29, pg_temp.today(), null, null, 'paid', null, 5, 0) $$,
  '22023', null, 'an unknown status is refused');

select pg_temp.as_user('0b900000-0000-4000-8000-0000000000a2');
select throws_ok($$ select public.rpc_merchant_payouts(pg_temp.today() - 29, pg_temp.today(), null, null, null, null, 5, 0) $$,
  '42501', null, 'someone outside Merchants and Finance cannot read payouts');
reset role;

select * from finish();
rollback;
