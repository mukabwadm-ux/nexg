-- Review shops run their own orders (20270340000200): a paid delivery order at
-- a review shop moves on one stage a minute to delivered; a real shop's does not.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.guest (id, phone, name)
values ('d2637000-0000-4000-8000-000000000001', '+254700026301', '[Guest 263]');

insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel, dropoff_label, stage,
  payment_method, payment_status, subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
select ('d2637000-0000-4000-8000-00000000001' || x.n)::uuid, 'PS263-' || x.n,
       'd2637000-0000-4000-8000-000000000001', x.merchant_id, x.branch_id, x.city_id, 'web',
       '[Fixture address]', 'confirmed', 'card', 'paid', 60000, 0, 0, 60000, 'KES'
  from (
    select row_number() over (order by m.id) as n, m.id as merchant_id, b.id as branch_id, m.city_id
      from public.merchant m
      join lateral (select id from public.merchant_branch where merchant_id = m.id order by id limit 1) b on true
     where m.city_id is not null
     order by m.id limit 2) x;
update public.merchant set accepts_test_payments = (id = (select merchant_id from public.order where reference = 'PS263-1'))
 where id in (select merchant_id from public.order where reference in ('PS263-1', 'PS263-2'));
update public.order set placed_at = now() - interval '10 minutes' where reference in ('PS263-1', 'PS263-2');
delete from public.order_event where order_id in (select id from public.order where reference in ('PS263-1', 'PS263-2'));

create function pg_temp.tick() returns text language plpgsql as $$
begin
  perform public.cron_review_shop_orders();
  update public.order_event set at = at - interval '4 minutes'
   where order_id in (select id from public.order where reference in ('PS263-1', 'PS263-2'));
  return (select stage::text from public.order where reference = 'PS263-1');
end $$;

select is(pg_temp.tick(), 'preparing', 'A paid order at a review shop starts by itself.');
select is(pg_temp.tick(), 'ready', 'Then it is ready.');
select is(pg_temp.tick(), 'picked_up', 'Then picked up, with no rider sent.');
select is(pg_temp.tick(), 'arriving', 'Then arriving.');
select is(pg_temp.tick(), 'delivered', 'Then delivered.');
select is((select stage::text from public.order where reference = 'PS263-2'), 'confirmed',
  'A real shop''s order is left to the shop.');
select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0, 'No critical wiring findings.');

select * from finish();
rollback;
