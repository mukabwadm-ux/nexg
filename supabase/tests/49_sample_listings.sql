-- Sample listings are shown but can never be held, paid for or booked.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','d4900000-0000-4000-8000-000000000001',
        'authenticated','authenticated','guest49@example.test',now(),false,now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('d4910000-0000-4000-8000-00000000000a','multi_unit','[Host 49]','+254700049000',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at, is_sample, photos)
values
  ('d4920000-0000-4000-8000-00000000000a','d4910000-0000-4000-8000-00000000000a',
   'sample-49','Sample 49','apartment_block','Kilimani',
   (select id from public.city where slug = 'nairobi'), true, now(), true,
   '[{"src":"/images/stays/lounge-sofa.jpg","caption":"Living area"}]'::jsonb),
  ('d4920000-0000-4000-8000-00000000000b','d4910000-0000-4000-8000-00000000000a',
   'real-49','Real 49','apartment_block','Kilimani',
   (select id from public.city where slug = 'nairobi'), true, now(), false, '[]'::jsonb);

insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values
  ('d4930000-0000-4000-8000-00000000000a','d4910000-0000-4000-8000-00000000000a',
   'd4920000-0000-4000-8000-00000000000a','S','S','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 5000),
  ('d4930000-0000-4000-8000-00000000000b','d4910000-0000-4000-8000-00000000000a',
   'd4920000-0000-4000-8000-00000000000b','R','R','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 5000);

select is(
  (select is_sample from public.property_public where slug = 'sample-49'),
  true,
  'A sample listing is still shown, and says it is a sample.');

select is(
  (select is_sample from public.property_unit_public where id = 'd4930000-0000-4000-8000-00000000000a'),
  true,
  'Its units say so too.');

select is(
  (select photos->0->>'src' from public.property_public where slug = 'sample-49'),
  '/images/stays/lounge-sofa.jpg',
  'Its photographs come through to the page.');

select is(
  (select array_agg(unit_id::text) from public.rpc_stay_search(
     (now() at time zone 'Africa/Nairobi')::date + 5, (now() at time zone 'Africa/Nairobi')::date + 7,
     1, null) where property_id in ('d4920000-0000-4000-8000-00000000000a','d4920000-0000-4000-8000-00000000000b')),
  array['d4930000-0000-4000-8000-00000000000b'],
  'Availability search leaves the sample out and keeps the real unit.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d4900000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.rpc_stay_hold('d4930000-0000-4000-8000-00000000000a',
       (now() at time zone 'Africa/Nairobi')::date + 5, (now() at time zone 'Africa/Nairobi')::date + 7) $$,
  '22023', 'This is a sample listing that shows how stays look on NexG. It cannot be booked.',
  'A sample listing cannot be held, so it can never be paid for.');

select lives_ok(
  $$ select public.rpc_stay_hold('d4930000-0000-4000-8000-00000000000b',
       (now() at time zone 'Africa/Nairobi')::date + 5, (now() at time zone 'Africa/Nairobi')::date + 7) $$,
  'A real listing can still be held.');

reset role;
select * from finish();
rollback;
