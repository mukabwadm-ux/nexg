-- Best sellers: paid slots first, then what sells, then what merchants mark popular.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- Two live shops in Mombasa. Other shops' "popular" marks are cleared so
-- only this test's products compete in the popular tier.
update public.catalogue_item set highlighted = false;

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at,
                             health_band, health_score, payout_name_lookup)
values
  ('b5300000-0000-4000-8000-00000000000a','[Legal 53a] Ltd','[Shop 53a]','restaurant',
   '[Contact]','+254700005301','bs53a@example.test',
   (select id from public.city where slug = 'mombasa'),'live', true, true,
   now() - interval '60 days','green', 88, '{"matched": true}'::jsonb),
  ('b5300000-0000-4000-8000-00000000000b','[Legal 53b] Ltd','[Shop 53b]','florist',
   '[Contact]','+254700005302','bs53b@example.test',
   (select id from public.city where slug = 'mombasa'),'live', true, true,
   now() - interval '60 days','green', 88, '{"matched": true}'::jsonb);

insert into public.merchant_branch (id, merchant_id, name, address_text, is_primary)
values ('b5310000-0000-4000-8000-00000000000a','b5300000-0000-4000-8000-00000000000a','Main','[Address]', true),
       ('b5310000-0000-4000-8000-00000000000b','b5300000-0000-4000-8000-00000000000b','Main','[Address]', true);

insert into public.catalogue_section (id, merchant_id, name)
values ('b5320000-0000-4000-8000-00000000000a','b5300000-0000-4000-8000-00000000000a','Menu'),
       ('b5320000-0000-4000-8000-00000000000b','b5300000-0000-4000-8000-00000000000b','Flowers');

insert into public.catalogue_item (id, section_id, merchant_id, name, price_kes, available, highlighted)
values
  ('b5330000-0000-4000-8000-0000000000a1','b5320000-0000-4000-8000-00000000000a','b5300000-0000-4000-8000-00000000000a','A1 marked popular', 500, true, true),
  ('b5330000-0000-4000-8000-0000000000a2','b5320000-0000-4000-8000-00000000000a','b5300000-0000-4000-8000-00000000000a','A2 sells most', 600, true, false),
  ('b5330000-0000-4000-8000-0000000000a3','b5320000-0000-4000-8000-00000000000a','b5300000-0000-4000-8000-00000000000a','A3 sells some', 700, true, false),
  ('b5330000-0000-4000-8000-0000000000a4','b5320000-0000-4000-8000-00000000000a','b5300000-0000-4000-8000-00000000000a','A4 sells a little', 800, true, false),
  ('b5330000-0000-4000-8000-0000000000b1','b5320000-0000-4000-8000-00000000000b','b5300000-0000-4000-8000-00000000000b','B1 paid slot', 2500, true, false),
  ('b5330000-0000-4000-8000-0000000000b2','b5320000-0000-4000-8000-00000000000b','b5300000-0000-4000-8000-00000000000b','B2 sold out', 900, false, true);

-- Paid orders: A2 x5, A3 x3, A4 x1. An unpaid order for A1 must not count.
insert into public.guest (id, phone, name)
values ('b5340000-0000-4000-8000-000000000001', '+254700005399', '[Guest 53]');

insert into public.order (id, reference, guest_id, merchant_id, branch_id, city_id, channel,
  dropoff_label, stage, payment_method, payment_status,
  subtotal_cents, delivery_fee_cents, service_fee_cents, total_cents, currency)
values
  ('b5350000-0000-4000-8000-000000000001','TEST-BS53-PAID','b5340000-0000-4000-8000-000000000001',
   'b5300000-0000-4000-8000-00000000000a','b5310000-0000-4000-8000-00000000000a',
   (select id from public.city where slug = 'mombasa'),'web','[Address]','confirmed','card','paid',
   590000, 0, 0, 590000, 'KES'),
  ('b5350000-0000-4000-8000-000000000002','TEST-BS53-UNPAID','b5340000-0000-4000-8000-000000000001',
   'b5300000-0000-4000-8000-00000000000a','b5310000-0000-4000-8000-00000000000a',
   (select id from public.city where slug = 'mombasa'),'web','[Address]','confirmed','card','pending',
   5000000, 0, 0, 5000000, 'KES');

insert into public.order_item (order_id, catalogue_item_id, name, quantity, unit_price_cents, line_total_cents)
values
  ('b5350000-0000-4000-8000-000000000001','b5330000-0000-4000-8000-0000000000a2','A2', 5, 60000, 300000),
  ('b5350000-0000-4000-8000-000000000001','b5330000-0000-4000-8000-0000000000a3','A3', 3, 70000, 210000),
  ('b5350000-0000-4000-8000-000000000001','b5330000-0000-4000-8000-0000000000a4','A4', 1, 80000, 80000),
  ('b5350000-0000-4000-8000-000000000002','b5330000-0000-4000-8000-0000000000a1','A1', 100, 50000, 5000000);

-- Shop B has paid for a Best seller slot this week, promoting B1.
insert into public.featured_placement (id, city_id, kind, position, label)
values ('b5360000-0000-4000-8000-000000000001', (select id from public.city where slug = 'mombasa'),
        'popular_request', 9, '[Best seller 53]');

insert into public.featured_booking (id, merchant_id, placement_id, placement_kind, city_id,
  status, requested_via, weeks, start_date, end_date, confirmed_at, quoted_price, item_id)
values ('b5370000-0000-4000-8000-000000000001','b5300000-0000-4000-8000-00000000000b',
        'b5360000-0000-4000-8000-000000000001','popular_request',
        (select id from public.city where slug = 'mombasa'),'live','staff', 1,
        date_trunc('week', now())::date, date_trunc('week', now())::date + 6, now(), 5000,
        'b5330000-0000-4000-8000-0000000000b1');

insert into public.featured_slot_week (placement_id, week_start, booking_id, status)
values ('b5360000-0000-4000-8000-000000000001', date_trunc('week', now())::date,
        'b5370000-0000-4000-8000-000000000001', 'live');

create temp table r as
  select row_number() over () as n, x.*
    from public.rpc_best_sellers('mombasa', 24) x
   where x.merchant_id in ('b5300000-0000-4000-8000-00000000000a', 'b5300000-0000-4000-8000-00000000000b');

select is(
  (select item_name || ' ' || source from r order by n limit 1),
  'B1 paid slot sponsored',
  'A paid Best seller slot leads the row, as sponsored.');

select is(
  (select string_agg(item_name, ', ' order by n) from r where source = 'top_selling'),
  'A2 sells most, A3 sells some',
  'Then the most sold products of the last 30 days, at most two per shop.');

select is(
  (select units_sold from r where item_name = 'A2 sells most'),
  5::bigint,
  'Only paid orders count towards units sold.');

select is(
  (select string_agg(item_name, ', ' order by n) from r where source = 'popular'),
  'A1 marked popular',
  'Then products shops mark as popular; a sold-out one is left out.');

select ok(
  not exists (select 1 from r where item_name in ('A4 sells a little', 'B2 sold out')),
  'A third product from one shop and a sold-out product are not shown.');

select is(
  (select count(*)::int from public.rpc_best_sellers('mombasa', 2)),
  2,
  'The row is cut to the length asked for.');

set local role anon;
select ok(
  (select count(*) > 0 from public.rpc_best_sellers('mombasa', 8)),
  'Any visitor can read the row.');
reset role;

select * from finish();
rollback;
