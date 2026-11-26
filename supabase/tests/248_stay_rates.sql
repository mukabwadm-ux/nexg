-- Weekend, seasonal and long-stay rates (20270331000100): fn_stay_quote prices
-- Friday and Saturday nights at the weekend rate, applies the most specific
-- season, takes the weekly or monthly discount off the sum; the hold, the
-- search, the guest quote and the native checkout all charge that total; the
-- staff writers and readers are for hospitality staff only.

begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

-- ─────────────────────────────────────────────────────────── fixtures

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c2480000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'stranger248@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2480000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'ops248@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2480000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'approver248@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2480000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 'host248@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c2480000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 'guest248@example.test', now(), false, now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('c2480000-0000-4000-8000-0000000000b1', 'c2480000-0000-4000-8000-000000000002', 'ops248@test.local', 'Ops 248'),
  ('c2480000-0000-4000-8000-0000000000b2', 'c2480000-0000-4000-8000-000000000003', 'approver248@test.local', 'Approver 248');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select 'c2480000-0000-4000-8000-0000000000b1', r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       'c2480000-0000-4000-8000-0000000000b2'
  from public.role r where r.key = 'ops_manager';

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('c2480000-0000-4000-8000-0000000000a1', 'multi_unit', '[Host 248]', '+254700248000',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());
insert into public.host_user (host_id, user_id, role)
values ('c2480000-0000-4000-8000-0000000000a1', 'c2480000-0000-4000-8000-000000000004', 'owner');

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, review_status)
values ('c2480000-0000-4000-8000-0000000000d1', 'c2480000-0000-4000-8000-0000000000a1',
        'block-248', '[Block 248]', 'apartment_block', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now(), 'approved');

/* c1: the priced unit; c2: a second live unit in the same building; c3: unlisted. */
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area, city_id,
                         handoff, status, listed, bedrooms, max_guests, nightly_rate_kes,
                         weekend_rate_kes, weekly_discount_pct, monthly_discount_pct)
values
  ('c2480000-0000-4000-8000-0000000000c1', 'c2480000-0000-4000-8000-0000000000a1',
   'c2480000-0000-4000-8000-0000000000d1', 'R1', 'R1', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 2, 10000,
   12000, 10, 20),
  ('c2480000-0000-4000-8000-0000000000c2', 'c2480000-0000-4000-8000-0000000000a1',
   'c2480000-0000-4000-8000-0000000000d1', 'R2', 'R2', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 2, 5000,
   null, null, null),
  ('c2480000-0000-4000-8000-0000000000c3', 'c2480000-0000-4000-8000-0000000000a1',
   'c2480000-0000-4000-8000-0000000000d1', 'R3', 'R3', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', false, 1, 2, 5000,
   null, null, null);

/* mon: a Monday at least a week ahead in Nairobi. */
create temp table d as
select m.mon from (
  select (now() at time zone 'Africa/Nairobi')::date + 7 as base
) b, lateral (select b.base + ((8 - extract(isodow from b.base)::int) % 7) as mon) m;
do $grant$
begin
  execute format('grant usage on schema %I to anon, authenticated, service_role',
                 (select nspname from pg_namespace n
                   join pg_class c on c.relnamespace = n.oid
                  where c.relname = 'd' and n.nspname like 'pg_temp%'));
end
$grant$;
grant select on d to anon, authenticated, service_role;

-- ─────────────────────────────────────────── the price

select is(extract(isodow from (select mon from d))::int, 1, 'the fixture day is a Monday');
select is((public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon from d), (select mon + 3 from d)) ->> 'total_kes')::bigint,
  30000::bigint, 'weekday nights are the nightly rate');
select is((public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon + 4 from d), (select mon + 6 from d)) ->> 'total_kes')::bigint,
  24000::bigint, 'Friday and Saturday nights are the weekend rate');
select is((public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon + 6 from d), (select mon + 7 from d)) ->> 'total_kes')::bigint,
  10000::bigint, 'Sunday night is a weekday night');
select is((public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon from d), (select mon + 7 from d)) ->> 'subtotal_kes')::bigint,
  74000::bigint, 'a week is five weekday and two weekend nights');
select is((public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon from d), (select mon + 7 from d)) ->> 'total_kes')::bigint,
  66600::bigint, 'with the weekly discount off from 7 nights');
select is((public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon from d), (select mon + 6 from d)) ->> 'discount_pct')::int,
  0, 'six nights get no discount');
select is((public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon + 28 from d), (select mon + 56 from d)) ->> 'total_kes')::bigint,
  236800::bigint, 'four weeks take the monthly discount instead');
select is((public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon from d), (select mon + 7 from d)) ->> 'avg_nightly_kes')::bigint,
  9514::bigint, 'the average night is the total over the nights, rounded');
select is(jsonb_array_length(public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon from d), (select mon + 7 from d)) -> 'per_night'),
  7, 'one line per night');
select is((public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c2', (select mon from d), (select mon + 7 from d)) ->> 'total_kes')::bigint,
  35000::bigint, 'a unit with no rules is the nightly rate times the nights');
select is(public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon from d), (select mon from d)),
  null, 'no nights, no price');

-- ─────────────────────────────────────────── strangers are refused

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2480000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok($$ select public.rpc_console_unit_rate_rules_set('c2480000-0000-4000-8000-0000000000c1', 1, 1, 1) $$,
  '42501', null, 'a stranger cannot set rate rules');
select throws_ok($$ select public.rpc_console_stays_season_save('{"name":"X","starts_on":"2030-01-01","ends_on":"2030-01-02","adjust_pct":10}') $$,
  '42501', null, 'nor add a season');
select throws_ok($$ select public.rpc_console_stays_seasons() $$, '42501', null, 'nor read the seasons');
select throws_ok($$ select public.rpc_console_unit_rates('c2480000-0000-4000-8000-0000000000c1') $$,
  '42501', null, 'nor a unit''s rates');
select throws_ok($$ select count(*) from public.stays_season $$, '42501', null,
  'stays_season is closed to direct reads');
select throws_ok($$ select public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1', current_date + 1, current_date + 2) $$,
  '42501', null, 'fn_stay_quote is internal');

-- ─────────────────────────────────────────── staff set seasons and rules

select set_config('request.jwt.claims', '{"sub":"c2480000-0000-4000-8000-000000000002","role":"authenticated"}', true);

/* Week three: Tue in the city (+50) and the building (+20), Wed the unit (-10), Thu everywhere (+100). */
select ok(public.rpc_console_stays_season_save(jsonb_build_object('name', 'City 248', 'scope', 'city',
  'scope_id', (select id from public.city where slug = 'nairobi'),
  'starts_on', (select mon + 15 from d), 'ends_on', (select mon + 15 from d), 'adjust_pct', 50)) ? 'season_id',
  'staff add a city season');
select ok(public.rpc_console_stays_season_save(jsonb_build_object('name', 'Building 248', 'scope', 'property',
  'scope_id', 'c2480000-0000-4000-8000-0000000000d1',
  'starts_on', (select mon + 15 from d), 'ends_on', (select mon + 16 from d), 'adjust_pct', 20)) ? 'season_id',
  'a building season');
select ok(public.rpc_console_stays_season_save(jsonb_build_object('name', 'Unit 248', 'scope', 'unit',
  'scope_id', 'c2480000-0000-4000-8000-0000000000c1',
  'starts_on', (select mon + 16 from d), 'ends_on', (select mon + 16 from d), 'adjust_pct', -10)) ? 'season_id',
  'a unit season');
select ok(public.rpc_console_stays_season_save(jsonb_build_object('name', 'Everywhere 248',
  'starts_on', (select mon + 17 from d), 'ends_on', (select mon + 17 from d), 'adjust_pct', 100)) ? 'season_id',
  'and a season everywhere');
select throws_ok($$ select public.rpc_console_stays_season_save('{"name":"Bad","starts_on":"2030-01-02","ends_on":"2030-01-01","adjust_pct":10}') $$,
  '23514', null, 'a season ends after it starts');
select throws_ok($$ select public.rpc_console_stays_season_save('{"name":"Bad","starts_on":"2030-01-01","ends_on":"2030-01-02","adjust_pct":400}') $$,
  '23514', null, 'and moves the rate by at most +300%');

reset role;
select is((select array_agg((e ->> 'rate_kes')::bigint order by e ->> 'day')
             from jsonb_array_elements(public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1',
                    (select mon + 14 from d), (select mon + 18 from d)) -> 'per_night') e),
  array[10000, 12000, 9000, 20000]::bigint[],
  'the most specific season wins: none, building over city, unit over building, everywhere');
select is((select array_agg(e ->> 'season' order by e ->> 'day')
             from jsonb_array_elements(public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c1',
                    (select mon + 14 from d), (select mon + 18 from d)) -> 'per_night') e),
  array[null, 'Building 248', 'Unit 248', 'Everywhere 248'],
  'and each night names its season');
select is((select (e ->> 'rate_kes')::bigint from jsonb_array_elements(public.fn_stay_quote('c2480000-0000-4000-8000-0000000000c2',
                    (select mon + 16 from d), (select mon + 17 from d)) -> 'per_night') e),
  6000::bigint, 'a unit season leaves the other units in the building on the building season');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c2480000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is((public.rpc_console_stays_seasons() -> 'counts' ->> 'upcoming')::int >= 4, true,
  'the seasons read back as upcoming');
select is((public.rpc_console_unit_rate_rules_set('c2480000-0000-4000-8000-0000000000c2', 6000, 5, null)) ->> 'weekend_rate_kes',
  '6000', 'staff set a weekend rate and weekly discount');
select is((public.rpc_console_unit_rates('c2480000-0000-4000-8000-0000000000c2')) ->> 'weekly_discount_pct',
  '5', 'and read them back');
select is((select (r -> 'days' -> 4 ->> 'rate_kes')::bigint
             from jsonb_array_elements(public.rpc_console_stays_calendar((select mon from d), null, '[Block 248]', 1, 100) -> 'rows') r
            where r ->> 'unit_id' = 'c2480000-0000-4000-8000-0000000000c1'),
  12000::bigint, 'the calendar shows Friday at the weekend rate');
select ok(public.rpc_console_stays_season_end(
            (select (s ->> 'id')::uuid from jsonb_array_elements(public.rpc_console_stays_seasons() -> 'rows') s
              where s ->> 'name' = 'Everywhere 248')) ? 'season_id', 'staff end a season');
select is((select (r -> 'days' -> 3 ->> 'rate_kes')::bigint
             from jsonb_array_elements(public.rpc_console_stays_calendar((select mon + 14 from d), null, '[Block 248]', 1, 100) -> 'rows') r
            where r ->> 'unit_id' = 'c2480000-0000-4000-8000-0000000000c1'),
  10000::bigint, 'an ended season no longer prices a night');

-- ─────────────────────────────────────────── the host saves rules

select set_config('request.jwt.claims', '{"sub":"c2480000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select is((public.rpc_unit_upsert_guarded('c2480000-0000-4000-8000-0000000000a1',
  '{"weekend_rate_kes": 7000, "monthly_discount_pct": 15, "weekly_discount_pct": ""}',
  'c2480000-0000-4000-8000-0000000000c2')).weekend_rate_kes, 7000::bigint, 'a host saves a weekend rate');
reset role;
select is((select array[weekly_discount_pct, monthly_discount_pct] from public.unit
            where id = 'c2480000-0000-4000-8000-0000000000c2'),
  array[null, 15]::integer[], 'an empty discount clears it, a sent one is saved');
set local role authenticated;

-- ─────────────────────────────────────────── every price agrees

select set_config('request.jwt.claims', '{"sub":"c2480000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select is((select total_kes from public.rpc_stay_search((select mon from d), (select mon + 7 from d), 1,
             'c2480000-0000-4000-8000-0000000000d1') where unit_id = 'c2480000-0000-4000-8000-0000000000c1'),
  66600::bigint, 'search quotes the discounted total');
select is((public.rpc_stay_quote('c2480000-0000-4000-8000-0000000000c1', (select mon from d), (select mon + 7 from d)) ->> 'total_kes')::bigint,
  66600::bigint, 'and so does the guest quote');
select is(public.rpc_stay_quote('c2480000-0000-4000-8000-0000000000c3', (select mon from d), (select mon + 7 from d)),
  null, 'an unlisted unit has no guest quote');
select is((public.rpc_stay_hold('c2480000-0000-4000-8000-0000000000c1', (select mon from d), (select mon + 7 from d),
             '{"first_name":"Ann","adults":1}') ->> 'total_kes')::bigint,
  66600::bigint, 'the hold charges the same total');
select is((public.rpc_native_stay_quote('c2480000-0000-4000-8000-0000000000d1', 'c2480000-0000-4000-8000-0000000000c1',
             (select mon + 7 from d), (select mon + 14 from d), 1, 0) ->> 'nightlyMinor')::bigint,
  951400::bigint, 'the native quote''s nightly price is the average night');
select is((public.rpc_native_stay_hold((public.rpc_native_stay_quote('c2480000-0000-4000-8000-0000000000d1',
             'c2480000-0000-4000-8000-0000000000c1', (select mon + 21 from d), (select mon + 28 from d), 1, 0) ->> 'quoteId')::uuid,
             'Ann') ->> 'totalMinor')::bigint,
  6660000::bigint, 'and the native hold charges the same total');

select * from finish();
rollback;
