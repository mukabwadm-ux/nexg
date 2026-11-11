-- Sunday is found in a week written without a weekday convention.
--
-- `fn_merchant_effective_hours` reads `merchant_hours` rows tagged
-- `monday_zero` as Monday = 0. It reads untagged rows the way the table was
-- documented and the way onboarding, the demo data and the guest merchant
-- page number them: Sunday = 0, like Postgres `dow` and JavaScript `getDay`. It matched them on `isodow`, though, which runs from
-- 1 (Monday) to 7 (Sunday). Monday to Saturday lined up and Sunday never did,
-- so those merchants had no hours on a Sunday and app bookings refused them.
--
-- The week is looked up in three places: under a city exception, through a
-- chain parent, and in the merchant's own week. Each is checked here, along
-- with a tagged week that has always worked.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- ------------------------------------------------------------------ fixtures

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, parent_merchant_id
)
values
  ('63000000-0000-0000-0000-000000000001', 'Jumapili Limited', 'Jumapili', 'restaurant',
   'Wanjiru Kamau', '+254700000631', 'jumapili@shop.example',
   (select id from public.city where slug = 'nairobi'), null),
  ('63000000-0000-0000-0000-000000000002', 'Wiki Limited', 'Wiki', 'restaurant',
   'Otieno Ouma', '+254700000632', 'wiki@shop.example',
   (select id from public.city where slug = 'nairobi'), null),
  /* A branch of the first, which shares its hours. */
  ('63000000-0000-0000-0000-000000000003', 'Jumapili Limited', 'Jumapili Kilimani', 'restaurant',
   'Wanjiru Kamau', '+254700000633', 'jumapili.kilimani@shop.example',
   (select id from public.city where slug = 'nairobi'), '63000000-0000-0000-0000-000000000001');

insert into public.merchant_chain_setting (parent_id, shared_hours)
values ('63000000-0000-0000-0000-000000000001', true);

/* Untagged, Sunday = 0: what onboarding writes. */
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
values
  ('63000000-0000-0000-0000-000000000001', 0, '09:00', '13:00'),
  ('63000000-0000-0000-0000-000000000001', 1, '10:00', '22:00');

/* Tagged Monday = 0: what the setup hours editor writes. */
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes, weekday_convention)
values
  ('63000000-0000-0000-0000-000000000002', 0, '07:00', '19:00', 'monday_zero'),
  ('63000000-0000-0000-0000-000000000002', 6, '11:00', '15:00', 'monday_zero');

-- ------------------------------------------- Sunday 15 and Monday 16 November

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '63000000-0000-0000-0000-000000000001', null, date '2026-11-15')$$,
  $$values ('09:00'::time, '13:00'::time, false, 'weekly'::text)$$,
  'an untagged week has its Sunday'
);

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '63000000-0000-0000-0000-000000000001', null, date '2026-11-16')$$,
  $$values ('10:00'::time, '22:00'::time, false, 'weekly'::text)$$,
  'and its Monday, as before'
);

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '63000000-0000-0000-0000-000000000002', null, date '2026-11-15')$$,
  $$values ('11:00'::time, '15:00'::time, false, 'weekly'::text)$$,
  'a monday_zero week still finds Sunday in row 6'
);

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '63000000-0000-0000-0000-000000000002', null, date '2026-11-16')$$,
  $$values ('07:00'::time, '19:00'::time, false, 'weekly'::text)$$,
  'and Monday in row 0'
);

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '63000000-0000-0000-0000-000000000003', null, date '2026-11-15')$$,
  $$values ('09:00'::time, '13:00'::time, false, 'chain parent'::text)$$,
  'a branch that shares its chain''s hours gets the parent''s Sunday'
);

/* What the guest sees: booking checks the same lookup. */
select ok(
  public.fn_booking_open_at('63000000-0000-0000-0000-000000000001',
                            timestamptz '2026-11-15 10:00+03'),
  'a guest can book the untagged merchant on Sunday morning'
);

-- ----------------------------------------------- a city exception that Sunday

insert into public.city_hours_exception (city_id, date, label, default_close)
values ((select id from public.city where slug = 'nairobi'), date '2026-11-15',
        'Test early close', '12:00');

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '63000000-0000-0000-0000-000000000001', null, date '2026-11-15')$$,
  $$values ('09:00'::time, '12:00'::time, false, 'city exception'::text)$$,
  'a city exception shortens the untagged Sunday'
);

select results_eq(
  $$select * from public.fn_merchant_effective_hours(
      '63000000-0000-0000-0000-000000000002', null, date '2026-11-15')$$,
  $$values ('11:00'::time, '12:00'::time, false, 'city exception'::text)$$,
  'and the monday_zero Sunday, as before'
);

select * from finish();
rollback;
