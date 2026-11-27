-- Review shops never send a real rider (20270340000100): an order at a test
-- tenant opens no rider search, even when it is not paid online.

begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into public.guest (id, phone, name)
values ('d2627000-0000-4000-8000-000000000001', '+254700026201', '[Guest 262]');

-- A cash-on-delivery order, ready, at a shop that becomes a test tenant.
with shop as (
  select m.id as merchant_id, m.city_id, b.id as branch_id
    from public.merchant m
    join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
   where m.city_id is not null order by m.id limit 1
)
insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label, stage,
  payment_method, payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select 'd2627000-0000-4000-8000-000000000011', 'PS262-1', 'd2627000-0000-4000-8000-000000000001',
       s.merchant_id, s.branch_id, s.city_id, 'web', '[Fixture address]', 'ready', 'cash_on_delivery', 'pending',
       60000, 0, 0, 60000, 'KES'
  from shop s;
update public.merchant set accepts_test_payments = true
 where id = (select merchant_id from public.order where id = 'd2627000-0000-4000-8000-000000000011');

select is(dispatch.fn_job_start('d2627000-0000-4000-8000-000000000011') ->> 'test', 'true',
  'An unpaid order at a review shop answers "test order".');
select is((select count(*)::int from dispatch.job where order_id = 'd2627000-0000-4000-8000-000000000011'), 0,
  'And no rider is offered it.');
select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
