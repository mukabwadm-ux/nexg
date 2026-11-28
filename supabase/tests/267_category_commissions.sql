-- Commission per category (20270345000100): the owner's rate card seeded at
-- the top of each band; a merchant's term beats its category rate, which
-- beats the preset; dated rates apply only from their day; one asks and a
-- second approves (or one approver, when the category says so); every change
-- is in the Change History and the audit log with old and new values.

begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;
create function pg_temp.today() returns date language sql as $f$
  select (now() at time zone 'Africa/Nairobi')::date
$f$;
create function pg_temp.rate(p_merchant text, p_days integer default 0) returns numeric language sql as $f$
  select (public.fn_merchant_commission(p_merchant::uuid, now() + make_interval(days => p_days)) ->> 'pct')::numeric
$f$;
create function pg_temp.pending(p_category text) returns uuid language sql security definer as $f$
  select id from public.category_commission_rate where category = p_category and status = 'pending'
$f$;
create function pg_temp.seeded(p_category text) returns numeric language sql security definer as $f$
  select pct from public.category_commission_rate
   where category = p_category and status = 'approved' and requested_by is null
$f$;

-- ------------------------------------------------------------------ the seed

select is(pg_temp.seeded('alcohol_beverages'), 15::numeric, 'Alcohol & Beverages 12–15% starts at 15%');
select is(pg_temp.seeded('tech_electronics'), 11::numeric, 'Electronics & Technology 7–11% starts at 11%');
select is(pg_temp.seeded('groceries_essentials'), 13::numeric, 'Green & Groceries 10–13% starts at 13%');
select is(pg_temp.seeded('logistics_shipping'), 14::numeric, 'Courier Services 10–14% starts at 14%');
select is((select count(*)::int from public.category_commission_rate
            where status = 'approved' and requested_by is null), 20,
  'all twenty groups on the rate card have a rate');
select is((select band_min_pct from public.category_commission where category = 'pharmacy'), 10.00::numeric,
  'the band''s lowest rate is kept');
select is((select band_max_pct from public.category_commission where category = 'pharmacy'), 14.00::numeric,
  'and its highest');
select is(pg_temp.seeded('restaurants_food'), null, 'Food & Restaurant has no group on the card: no rate');
select is(pg_temp.seeded('pets'), null, 'nor has Pets');
select is((select count(*)::int from public.category_config c
            where not exists (select 1 from public.category_commission x where x.category = c.category)), 0,
  'every category has a settings row');
select is((select nexg_delivery_pct from public.category_commission_rate
            where category = 'alcohol_beverages' and requested_by is null), null,
  'the NexG-delivery rate is left on the preset');

-- ------------------------------------------------------------------ fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), now(), now()
from (values
  ('a2670000-0000-4000-8000-0000000000a1'::uuid, 'ops267@test.local'),
  ('a2670000-0000-4000-8000-0000000000a2'::uuid, 'finance267@test.local'),
  ('a2670000-0000-4000-8000-0000000000a3'::uuid, 'finance2.267@test.local'),
  ('a2670000-0000-4000-8000-0000000000a4'::uuid, 'support267@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('a2670000-0000-4000-8000-0000000000b1', 'a2670000-0000-4000-8000-0000000000a1', 'ops267@test.local', 'Ops 267'),
  ('a2670000-0000-4000-8000-0000000000b2', 'a2670000-0000-4000-8000-0000000000a2', 'finance267@test.local', 'Finance 267'),
  ('a2670000-0000-4000-8000-0000000000b3', 'a2670000-0000-4000-8000-0000000000a3', 'finance2.267@test.local', 'Finance Two 267'),
  ('a2670000-0000-4000-8000-0000000000b4', 'a2670000-0000-4000-8000-0000000000a4', 'support267@test.local', 'Support 267');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select x.staff, r.id, null, '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from (values
  ('a2670000-0000-4000-8000-0000000000b1'::uuid, 'merchant_ops'),
  ('a2670000-0000-4000-8000-0000000000b2'::uuid, 'finance'),
  ('a2670000-0000-4000-8000-0000000000b3'::uuid, 'finance'),
  ('a2670000-0000-4000-8000-0000000000b4'::uuid, 'support_agent')
) as x (staff, role)
join public.role r on r.key = x.role;

/* A bar with its own riders, a bar NexG riders deliver for, a restaurant with
   its own riders (no category rate), a bar with an agreed term. */
insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status, went_live_at, has_own_riders)
select x.id, x.trading || ' Limited', x.trading, x.category::public.merchant_category, 'Owner',
  x.phone, x.email, (select id from public.city where slug = 'nairobi'), 'live', now(), x.own
from (values
  ('a2670000-0000-4000-8000-0000000000c1'::uuid, 'Bar 267', 'alcohol_beverages',
   '+254712267001', 'bar267@shop.example', true),
  ('a2670000-0000-4000-8000-0000000000c2'::uuid, 'Bar Two 267', 'alcohol_beverages',
   '+254712267002', 'bar2.267@shop.example', false),
  ('a2670000-0000-4000-8000-0000000000c3'::uuid, 'Kitchen 267', 'restaurants_food',
   '+254712267003', 'kitchen267@shop.example', true),
  ('a2670000-0000-4000-8000-0000000000c4'::uuid, 'Bar Three 267', 'alcohol_beverages',
   '+254712267004', 'bar3.267@shop.example', true)
) as x (id, trading, category, phone, email, own);

insert into public.merchant_commission_term
  (merchant_id, own_delivery_pct, nexg_delivery_pct, starts_on, reason, status, decided_at)
values ('a2670000-0000-4000-8000-0000000000c4', 9, null, pg_temp.today(), 'Agreed 267', 'approved', now());

-- ------------------------------------------------------------------ the order

select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c1'), 15::numeric,
  'a bar with its own riders is charged its category rate');
select is(public.fn_merchant_commission('a2670000-0000-4000-8000-0000000000c1') ->> 'basis', 'category',
  'and says so');
select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c2'), 28::numeric,
  'a bar NexG riders deliver for stays on the NexG-delivery preset');
select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c3'), 14::numeric,
  'a restaurant (no category rate) stays on the preset');
select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c4'), 9::numeric,
  'an agreed term beats the category rate');
select is((public.fn_price_order((select city_id from public.merchant where id = 'a2670000-0000-4000-8000-0000000000c1'),
            'alcohol_beverages', 100000, 1::smallint, now(), 'a2670000-0000-4000-8000-0000000000c1')
          ->> 'commission_cents')::bigint, 15000::bigint,
  'checkout charges 15% of a KES 1,000 basket: KES 150');
select ok(public.fn_price_order((select city_id from public.merchant where id = 'a2670000-0000-4000-8000-0000000000c1'),
            'alcohol_beverages', 100000, 1::smallint, now(), 'a2670000-0000-4000-8000-0000000000c1')
          #> '{pricing_version_ids,commission_category_rate}' is not null,
  'and the order records which category rate it used');

-- ------------------------------------------------------------------ the screens

set local role authenticated;
select pg_temp.as_user('a2670000-0000-4000-8000-0000000000a4');
select throws_ok($$select public.rpc_category_commission_overview()$$, '42501', null,
  'support cannot open the screen');
select throws_ok($$select public.rpc_category_commission_save('alcohol_beverages', '{"label":"X"}')$$, '42501', null,
  'nor change a category');

select pg_temp.as_user('a2670000-0000-4000-8000-0000000000a1');
select ok(jsonb_array_length(public.rpc_category_commission_overview() -> 'categories') >= 22,
  'merchant ops sees every category');
select is((public.rpc_category_commission_overview() #>> '{presets,nexg_delivery_pct}')::numeric, 28::numeric,
  'with the presets it falls back to');

select throws_ok($$select public.rpc_category_commission_save('alcohol_beverages',
  '{"rate":{"pct":13,"starts_on":"2000-01-01","reason":"Backdated"}}')$$, '22023', null,
  'a rate cannot start before today');
select throws_ok($$select public.rpc_category_commission_save('alcohol_beverages',
  jsonb_build_object('rate', jsonb_build_object('pct', 13, 'starts_on', pg_temp.today(), 'reason', ' ')))$$,
  '22023', null, 'a rate needs a reason');
select throws_ok($$select public.rpc_category_commission_save('alcohol_beverages',
  jsonb_build_object('rate', jsonb_build_object('pct', 100.5, 'starts_on', pg_temp.today(), 'reason', 'x')))$$,
  '22023', null, 'a rate over 100% is refused');

select is(public.rpc_category_commission_save('alcohol_beverages',
  jsonb_build_object('rate', jsonb_build_object('pct', 13, 'nexg_delivery_pct', 25,
    'starts_on', pg_temp.today() + 2, 'reason', 'Launch push'))) ->> 'rate', 'pending',
  'merchant ops asks for 13% / 25% from the day after tomorrow; it waits');
select throws_ok($$select public.rpc_category_commission_save('alcohol_beverages',
  jsonb_build_object('rate', jsonb_build_object('pct', 12, 'starts_on', pg_temp.today(), 'reason', 'Again')))$$,
  '23505', null, 'one request waits at a time');
select throws_ok($$select public.rpc_category_commission_decide(pg_temp.pending('alcohol_beverages'), true, null)$$,
  '42501', null, 'merchant ops cannot approve');
select throws_ok($$select public.rpc_category_commission_save('alcohol_beverages', '{"merchant_overrides":false}')$$,
  '42501', null, 'nor switch merchant-specific rates off');

select is(public.rpc_category_commission_save('alcohol_beverages',
  '{"fulfilment_methods":["delivery","pickup","digital"],"band_min_pct":11}') ->> 'changed', 'true',
  'merchant ops changes fulfilment and the band at once');

reset role;
select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c1', 3), 15::numeric,
  'a waiting request changes nothing');

set local role authenticated;
select pg_temp.as_user('a2670000-0000-4000-8000-0000000000a2');
select is(public.rpc_category_commission_decide(pg_temp.pending('alcohol_beverages'), true, 'OK') ->> 'status',
  'approved', 'Finance approves it');
reset role;

select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c1'), 15::numeric,
  'today is still charged 15%: the new rate starts later');
select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c1', 3), 13::numeric,
  'from its day, 13%');
select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c2', 3), 25::numeric,
  'and the NexG-delivery rate applies to the bar NexG riders deliver for');

-- VAT exclusive: 10% + 16% VAT = 11.60% charged.
set local role authenticated;
select pg_temp.as_user('a2670000-0000-4000-8000-0000000000a2');
select public.rpc_category_commission_save('alcohol_beverages', '{"approval":"single"}');
select is(public.rpc_category_commission_save('alcohol_beverages',
  jsonb_build_object('rate', jsonb_build_object('pct', 10, 'vat_treatment', 'exclusive',
    'starts_on', pg_temp.today() + 5, 'reason', 'Quoted before VAT'))) ->> 'rate', 'approved',
  'with single approval, Finance''s change applies without a second person');
reset role;
select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c1', 6), 11.60::numeric,
  'a rate quoted VAT exclusive is charged with VAT added');

-- Merchant overrides off: the agreed 9% gives way to the category rate.
set local role authenticated;
select pg_temp.as_user('a2670000-0000-4000-8000-0000000000a2');
select public.rpc_category_commission_save('alcohol_beverages', '{"merchant_overrides":false}');
reset role;
select is(pg_temp.rate('a2670000-0000-4000-8000-0000000000c4'), 15::numeric,
  'with merchant overrides off, the merchant is charged the category rate');

-- ------------------------------------------------------------------ history

select is((select count(*)::int from public.category_commission_log
            where category = 'alcohol_beverages' and actor is not null), 6,
  'every change is in the Change History');
select ok((select before ->> 'band_min_pct' = '12.00' and after ->> 'band_min_pct' = '11'
             from public.category_commission_log
            where category = 'alcohol_beverages' and action = 'settings_changed'
              and after ? 'band_min_pct'),
  'with the old and the new value');
select is((select count(*)::int from audit.audit_event
            where action in ('category.commission_requested', 'category.commission_approved',
                             'category.settings_changed')
              and context ->> 'category' = 'alcohol_beverages'), 6,
  'and in the audit log');

set local role authenticated;
select pg_temp.as_user('a2670000-0000-4000-8000-0000000000a1');
select ok(jsonb_array_length(public.rpc_category_commission_history('alcohol_beverages', 50)) >= 6,
  'the Change History tab reads it');
select ok(exists (select 1 from jsonb_array_elements(public.rpc_category_commission_overrides()) o
                   where o ->> 'merchant_id' = 'a2670000-0000-4000-8000-0000000000c4'),
  'Merchant Overrides lists the merchant with an agreed rate');
reset role;

select * from finish();
rollback;
