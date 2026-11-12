-- A host team member limited to one unit cannot read or change the others.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0710000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'owner71@example.test', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0710000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'cleaner71@example.test', now(), now(), now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('c0710000-0000-4000-8000-00000000000a', 'multi_unit', '[Host 71]', '+254700071000',
        (select id from public.city where slug = 'nairobi'), 'live', now(), now());

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('c0710000-0000-4000-8000-0000000000b1', 'c0710000-0000-4000-8000-00000000000a',
        'block-71', '[Block 71]', 'apartment_block', 'Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());

insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values
  ('c0710000-0000-4000-8000-0000000000c1', 'c0710000-0000-4000-8000-00000000000a',
   'c0710000-0000-4000-8000-0000000000b1', 'A', 'A', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 1, 2, 7000),
  ('c0710000-0000-4000-8000-0000000000c2', 'c0710000-0000-4000-8000-00000000000a',
   'c0710000-0000-4000-8000-0000000000b1', 'B', 'B', '[Address]', 'Kilimani',
   (select id from public.city where slug = 'nairobi'), 'lockbox', 'live', true, 2, 4, 11000);

-- The owner, and a member of staff limited to unit A.
insert into public.host_user (host_id, user_id, role, units, accepted_at) values
  ('c0710000-0000-4000-8000-00000000000a', 'c0710000-0000-4000-8000-000000000001', 'owner', null, now()),
  ('c0710000-0000-4000-8000-00000000000a', 'c0710000-0000-4000-8000-000000000002', 'manager',
   array['c0710000-0000-4000-8000-0000000000c1'::uuid], now());

-- A guest staying in unit B.
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name,
                         check_in, check_out, source, status)
values ('c0710000-0000-4000-8000-0000000000d2', 'c0710000-0000-4000-8000-00000000000a',
        'c0710000-0000-4000-8000-0000000000b1', 'c0710000-0000-4000-8000-0000000000c2',
        '[Guest B]', now() + interval '10 days', now() + interval '12 days', 'entered', 'booked');

-- ── the member limited to unit A

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0710000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(authz.can_see_unit('c0710000-0000-4000-8000-0000000000c1'), true,
  'Staff limited to unit A still reach unit A.');
select is(authz.can_see_unit('c0710000-0000-4000-8000-0000000000c2'), false,
  'And not unit B.');
select is(authz.is_host_member('c0710000-0000-4000-8000-00000000000a'), false,
  'They are not a member with every unit, so whole-account checks refuse them.');
select is((select count(*)::int from public.host_unit_list_v where id = 'c0710000-0000-4000-8000-0000000000c2'),
  0, 'The unit list does not show them unit B.');
select is((select count(*)::int from public.host_stay_v where unit_id = 'c0710000-0000-4000-8000-0000000000c2'),
  0, 'The stay list does not show them unit B''s guest.');
select is((select count(*)::int from public.stay where id = 'c0710000-0000-4000-8000-0000000000d2'),
  0, 'Nor does the stay table itself.');
select throws_ok(
  $$select public.rpc_stay_block('c0710000-0000-4000-8000-00000000000a', 'c0710000-0000-4000-8000-0000000000c2',
      current_date + 20, current_date + 22, 'not mine')$$,
  '42501', null, 'They cannot block unit B''s dates.');
select throws_ok(
  $$select public.rpc_unit_upsert_guarded('c0710000-0000-4000-8000-00000000000a',
      '{"name": "B, renamed"}'::jsonb, 'c0710000-0000-4000-8000-0000000000c2')$$,
  '42501', null, 'They cannot change unit B.');

-- ── the owner, unchanged

select set_config('request.jwt.claims',
  '{"sub":"c0710000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(authz.is_host_member('c0710000-0000-4000-8000-00000000000a'), true,
  'The owner is still a member of the whole account.');
select is((select count(*)::int from public.host_stay_v where unit_id = 'c0710000-0000-4000-8000-0000000000c2'),
  1, 'The owner still sees unit B''s guest.');
select lives_ok(
  $$select public.rpc_stay_block('c0710000-0000-4000-8000-00000000000a', 'c0710000-0000-4000-8000-0000000000c2',
      current_date + 20, current_date + 22, 'owner block')$$,
  'And can still block unit B''s dates.');
reset role;

select * from finish();
rollback;
