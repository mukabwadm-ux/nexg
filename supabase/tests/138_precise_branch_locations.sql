-- Precise branch locations (20270203009700): every branch a merchant adds or
-- edits keeps its exact pin, its position and its area in step, and a shop
-- goes live only with its main location pinned in a served area and its
-- opening hours set.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'c1340000-0000-4000-8000-000000000001',
        'authenticated', 'authenticated', 'owner134@example.test', now(), now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status)
select v.id, v.legal, v.trading, 'restaurant', '[Contact]', v.phone, v.email, c.id, 'under_review'
from public.city c
cross join (values
  ('c1340000-0000-4000-8000-00000000000a'::uuid, '[Legal 134] Ltd', '[Cafe 134]', '+254700013400', 'cafe134@example.test'),
  ('c1340000-0000-4000-8000-00000000000b'::uuid, '[Legal 134b] Ltd', '[Cafe 134b]', '+254700013401', 'cafe134b@example.test')
) as v(id, legal, trading, phone, email)
where c.slug = 'nairobi';

insert into public.merchant_user (merchant_id, user_id, role)
values ('c1340000-0000-4000-8000-00000000000a', 'c1340000-0000-4000-8000-000000000001', 'owner');

create function pg_temp.zone(p_name text) returns uuid language sql as $f$
  select id from public.zone where name = p_name and active limit 1
$f$;

-- ───────────────────────────────────────────── one position, everywhere

insert into public.merchant_branch (id, merchant_id, name, latitude, longitude)
values ('c1340000-0000-4000-8000-0000000000b1', 'c1340000-0000-4000-8000-00000000000b',
        '[Kilimani]', -1.285, 36.780);

select is((select zone_id from public.merchant_branch where id = 'c1340000-0000-4000-8000-0000000000b1'),
  pg_temp.zone('Kilimani'), 'A pinned branch is put in the area its pin is in.');
select ok((select location is not null from public.merchant_branch where id = 'c1340000-0000-4000-8000-0000000000b1'),
  'And gets its position for distance and nearby.');

update public.merchant_branch set latitude = -1.260, longitude = 36.810
 where id = 'c1340000-0000-4000-8000-0000000000b1';
select is((select zone_id from public.merchant_branch where id = 'c1340000-0000-4000-8000-0000000000b1'),
  pg_temp.zone('Westlands'), 'Moving the pin moves the branch to its new area.');

update public.merchant_branch set latitude = -1.517, longitude = 37.263
 where id = 'c1340000-0000-4000-8000-0000000000b1';
select ok((select zone_id is null and location is not null from public.merchant_branch
            where id = 'c1340000-0000-4000-8000-0000000000b1'),
  'A pin outside every area keeps its position but no area.');

update public.merchant_branch set latitude = null, longitude = null
 where id = 'c1340000-0000-4000-8000-0000000000b1';
select ok((select zone_id is null and location is null from public.merchant_branch
            where id = 'c1340000-0000-4000-8000-0000000000b1'),
  'Taking the pin away takes its position and area with it.');

insert into public.merchant_branch (id, merchant_id, name, latitude, longitude, zone_id)
values ('c1340000-0000-4000-8000-0000000000b2', 'c1340000-0000-4000-8000-00000000000b',
        '[Chosen zone]', -1.285, 36.780, pg_temp.zone('Westlands'));
select is((select zone_id from public.merchant_branch where id = 'c1340000-0000-4000-8000-0000000000b2'),
  pg_temp.zone('Kilimani'), 'The area is measured from the pin, never taken as given.');

-- A zone added over a pin that was outside every area takes it in; switched off, lets it go.
insert into public.merchant_branch (id, merchant_id, name, latitude, longitude)
values ('c1340000-0000-4000-8000-0000000000b3', 'c1340000-0000-4000-8000-00000000000b',
        '[Thika Rd]', -1.517, 37.263);
insert into public.zone (city_id, name, tier, polygon, eta_min, eta_max, cod_allowed)
select c.id, '[Zone 134]', 'trial',
       extensions.st_makeenvelope(37.20, -1.55, 37.30, -1.48, 4326)::extensions.geography, 40, 60, false
from public.city c where c.slug = 'nairobi';
select is((select zone_id from public.merchant_branch where id = 'c1340000-0000-4000-8000-0000000000b3'),
  pg_temp.zone('[Zone 134]'), 'A new zone places the branches inside it.');
update public.zone set active = false where name = '[Zone 134]';
select ok((select zone_id is null from public.merchant_branch where id = 'c1340000-0000-4000-8000-0000000000b3'),
  'Switching the zone off takes its branches out of it.');

-- Pins in what the merchant typed: coordinates or a Maps link that carries them, never an address.
select is((select row(latitude, longitude)::text from public.fn_pin_from_text(' -1.2864, 36.8172 ')),
  '(-1.2864,36.8172)', 'The sign-up "latitude, longitude" is read.');
select is((select row(latitude, longitude)::text from public.fn_pin_from_text(
    'https://www.google.com/maps/place/Cafe/@-1.2900,36.7800,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-1.2891!4d36.7823')),
  '(-1.2891,36.7823)', 'A Google Maps place link gives the place pin, not the view.');
select is((select row(latitude, longitude)::text from public.fn_pin_from_text(
    'https://maps.google.com/?q=-1.2700,36.8100')),
  '(-1.27,36.81)', 'A Maps link with q= is read.');
select is((select count(*)::int from public.fn_pin_from_text('Argwings Kodhek Rd, Kilimani')),
  0, 'An address alone gives no pin.');

-- A "Google Maps pin" answer fills the main branch that still has none.
insert into public.merchant_branch (id, merchant_id, name, is_primary)
values ('c1340000-0000-4000-8000-0000000000b4', 'c1340000-0000-4000-8000-00000000000b', '[Main b]', true);
insert into public.merchant_onboarding_answer (merchant_id, answers)
values ('c1340000-0000-4000-8000-00000000000b', '{"map_pin": "-1.2850, 36.7800"}');
select is((select zone_id from public.merchant_branch where id = 'c1340000-0000-4000-8000-0000000000b4'),
  pg_temp.zone('Kilimani'), 'The sign-up pin is copied to the main branch, and it gets its area.');
update public.merchant_onboarding_answer set answers = '{"map_pin": "-1.2600, 36.8100"}'
 where merchant_id = 'c1340000-0000-4000-8000-00000000000b';
select is((select latitude from public.merchant_branch where id = 'c1340000-0000-4000-8000-0000000000b4'),
  -1.285::double precision, 'A pin already on the branch is never overwritten by the answer.');

-- ───────────────────────────────────────────── the Locations screen

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"c1340000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_merchant_setup_location_save('c1340000-0000-4000-8000-00000000000a', null,
      'Main', 'physical', 'Argwings Kodhek Rd', '', '{}', null)$$,
  '22023', 'Pin this location on the map: riders and customers are sent to that exact spot.',
  'A new physical location needs its pin.');

select throws_ok(
  $$select public.rpc_merchant_setup_location_save('c1340000-0000-4000-8000-00000000000a', null,
      'Main', 'physical', 'Argwings Kodhek Rd', '', '{}', null, -1.285, null)$$,
  '22023', 'That map pin is not a real place. Pin it on the map again.',
  'Half a pin is refused.');

select is(
  public.rpc_merchant_setup_location_save('c1340000-0000-4000-8000-00000000000a', null,
    'Main', 'physical', 'Argwings Kodhek Rd', '', '{}', null, -1.285, 36.780)
    - 'id' - 'updatedAt' - 'activityIds',
  '{"name": "Main", "type": "physical", "address": "Argwings Kodhek Rd", "contact": "",
    "pin": "-1.285000, 36.780000", "inServiceArea": true, "area": "Kilimani"}'::jsonb,
  'With its pin it saves, in a served area, and says so.');

select lives_ok(
  $$select public.rpc_merchant_setup_location_save('c1340000-0000-4000-8000-00000000000a', null,
      'Online', 'digital_operation', '', '', '{}', null)$$,
  'An online-only operation needs no pin.');

-- Editing the address without a new pin keeps the pin (it used to clear it).
select lives_ok(
  format($$select public.rpc_merchant_setup_location_save('c1340000-0000-4000-8000-00000000000a', %L,
      'Main', 'physical', 'Argwings Kodhek Rd, gate 2', '', '{}', %L)$$,
    (select id from public.merchant_branch where merchant_id = 'c1340000-0000-4000-8000-00000000000a' and name = 'Main'),
    (select updated_at from public.merchant_branch where merchant_id = 'c1340000-0000-4000-8000-00000000000a' and name = 'Main')),
  'The address can change on its own.');
select is(
  (select jsonb_build_object('pin', l -> 'pin', 'address', l -> 'address')
     from jsonb_array_elements(public.rpc_merchant_setup_locations('c1340000-0000-4000-8000-00000000000a')) l
    where l ->> 'name' = 'Main'),
  '{"pin": "-1.285000, 36.780000", "address": "Argwings Kodhek Rd, gate 2"}'::jsonb,
  'And the screen reads back the same pin with the new address.');

-- A physical place saved before this change, with no pin, gets one on its next save.
reset role;
insert into public.merchant_branch (id, merchant_id, name, place_type)
values ('c1340000-0000-4000-8000-0000000000a2', 'c1340000-0000-4000-8000-00000000000a', '[Old shop]', 'physical');
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"c1340000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  format($$select public.rpc_merchant_setup_location_save('c1340000-0000-4000-8000-00000000000a',
      'c1340000-0000-4000-8000-0000000000a2', '[Old shop]', 'physical', '', '', '{}', %L)$$,
    (select updated_at from public.merchant_branch where id = 'c1340000-0000-4000-8000-0000000000a2')),
  '22023', 'Pin this location on the map: riders and customers are sent to that exact spot.',
  'A location with no pin cannot be saved again without one.');

-- ───────────────────────────────────────────── the branch drawer

select throws_ok(
  $$select public.rpc_branch_upsert('c1340000-0000-4000-8000-00000000000a',
      '{"name": "[Lavington]", "address_text": "James Gichuru Rd"}'::jsonb)$$,
  '22023', 'Pin this branch on the map: riders and customers are sent to that exact spot.',
  'A new branch needs its pin.');

select is(
  (select (public.rpc_branch_upsert('c1340000-0000-4000-8000-00000000000a',
      '{"name": "[Westlands]", "latitude": "-1.260", "longitude": "36.810"}'::jsonb)).zone_id),
  pg_temp.zone('Westlands'),
  'With its pin it is added, in the area the pin is in.');

select throws_ok(
  $$select public.rpc_branch_upsert('c1340000-0000-4000-8000-00000000000a',
      '{"name": "[Old shop]", "rider_phone": "+254700013499"}'::jsonb,
      'c1340000-0000-4000-8000-0000000000a2')$$,
  '22023', 'Pin this branch on the map: riders and customers are sent to that exact spot.',
  'A branch that still has no pin is asked for one when it is edited.');

select lives_ok(
  $$select public.rpc_branch_upsert('c1340000-0000-4000-8000-00000000000a',
      '{"name": "[Westlands]", "rider_phone": "+254700013498"}'::jsonb,
      (select id from public.merchant_branch where name = '[Westlands]'))$$,
  'A pinned branch can be edited without sending its pin again.');

select throws_ok(
  $$select public.rpc_branch_upsert('c1340000-0000-4000-8000-00000000000a',
      '{"name": "[Nowhere]", "latitude": "123", "longitude": "36.8"}'::jsonb)$$,
  '22023', 'That map pin is not a real place. Pin it on the map again.',
  'A pin off the globe is refused.');

-- ───────────────────────────────────────────── going live

reset role;

select ok(not public.fn_merchant_go_live_missing('c1340000-0000-4000-8000-00000000000a')
              @> '[{"key": "branch_pin"}]'::jsonb,
  'A main location pinned in a served area is not on the list.');
select ok(public.fn_merchant_go_live_missing('c1340000-0000-4000-8000-00000000000a')
            @> '[{"key": "hours", "who": "merchant"}]'::jsonb,
  'No opening hours is on the list, for the merchant.');

insert into public.merchant_hours (merchant_id, day_of_week, opens, closes)
select 'c1340000-0000-4000-8000-00000000000a', d, '08:00', '20:00' from generate_series(0, 6) d;
select ok(not public.fn_merchant_go_live_missing('c1340000-0000-4000-8000-00000000000a')
              @> '[{"key": "hours"}]'::jsonb,
  'Once the hours are in, they are off the list.');

-- The main location moved outside every area.
update public.merchant_branch set latitude = -1.517, longitude = 37.263
 where merchant_id = 'c1340000-0000-4000-8000-00000000000a' and is_primary;
select ok(public.fn_merchant_go_live_missing('c1340000-0000-4000-8000-00000000000a')
            @> '[{"key": "branch_pin", "who": "merchant"}]'::jsonb,
  'A main location outside every area NexG serves is on the list.');

update public.merchant_branch set latitude = null, longitude = null
 where merchant_id = 'c1340000-0000-4000-8000-00000000000a' and is_primary;
select ok(public.fn_merchant_go_live_missing('c1340000-0000-4000-8000-00000000000a')
            @> '[{"key": "branch_pin"}]'::jsonb,
  'So is one with no pin.');

select * from finish();
rollback;
