-- A shop's stars come from NexG customers' ratings of its delivered orders:
-- only ratings about the order or the food count, and the average shows once
-- there are at least three.

begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values ('c1330000-0000-4000-8000-00000000000a', '[Legal 133] Ltd', '[Grill 133]', 'restaurant',
        '[Contact]', '+254700013300', 'grill133@example.test',
        (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');

-- Ratings need orders; make minimal delivered orders straight in the table.
create function pg_temp.rate(p_n int, p_stars int, p_about text) returns void language plpgsql as $f$
declare v_order uuid;
begin
  insert into public.order (reference, merchant_id, city_id, channel, dropoff_label, stage,
                            payment_method, payment_status, subtotal_cents, delivery_fee_cents,
                            service_fee_cents, total_cents, currency, handed_to, delivered_at)
  values ('RATE-133-' || p_n, 'c1330000-0000-4000-8000-00000000000a',
          (select id from public.city where slug = 'nairobi'), 'web', '[Home]', 'delivered',
          'mpesa_stk', 'paid', 10000, 0, 0, 10000, 'KES', 'guest', now())
  returning id into v_order;
  insert into public.order_rating (order_id, merchant_id, stars, about)
  values (v_order, 'c1330000-0000-4000-8000-00000000000a', p_stars, p_about);
end;
$f$;

select pg_temp.rate(1, 5, 'food');
select pg_temp.rate(2, 4, 'order');

set local role anon;
select is((select row(rating_count, rating_avg)::text from public.merchant_public
            where id = 'c1330000-0000-4000-8000-00000000000a'), '(2,)',
  'Two ratings are counted, but no average shows yet.');
reset role;

select pg_temp.rate(3, 3, 'order');
select pg_temp.rate(4, 1, 'rider');

set local role anon;
select is((select rating_count from public.merchant_public where id = 'c1330000-0000-4000-8000-00000000000a'),
  3, 'A rating about the rider does not count for the shop.');
select is((select rating_avg from public.merchant_public where id = 'c1330000-0000-4000-8000-00000000000a'),
  4.0, 'With three, the shop shows their average.');
select is((select rating_count from public.merchant_public where id = (
             select id from public.merchant_public where id <> 'c1330000-0000-4000-8000-00000000000a'
              and rating_count = 0 limit 1)), 0, 'A shop with no ratings counts none.');
select ok(exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = 'merchant_public' and column_name = 'rating_avg'),
  'The shop listing has rating_avg for the map and Top Rated.');
reset role;

select * from finish();
rollback;
