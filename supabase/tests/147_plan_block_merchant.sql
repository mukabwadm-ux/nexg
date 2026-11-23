-- An Explore plan's stop says which shop it is at (20270227000200, R9).

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1470000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'planner147@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1470000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'other147@example.test', now(), false, now(), now());

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, went_live_at)
values
  ('c1470000-0000-4000-8000-00000000000a', '[Legal 147] Ltd', '[Cafe 147]', 'restaurant',
   '[Contact]', '+254700014700', 'cafe147@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days'),
  ('c1470000-0000-4000-8000-00000000000b', '[Legal 147b] Ltd', '[Park 147]', 'experiences',
   '[Contact]', '+254700014701', 'park147@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, now() - interval '60 days');
insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('c1470000-0000-4000-8000-00000000000a', 'Main', '[Address]', true),
       ('c1470000-0000-4000-8000-00000000000b', 'Main', '[Address]', true);

insert into public.plan (id, user_id, city_id, status)
values ('c1470000-0000-4000-8000-0000000000f1', 'c1470000-0000-4000-8000-000000000001',
        (select id from public.city where slug = 'nairobi'), 'draft');

-- A partner that is the park's, with a component.
insert into public.experience_partner (id, name, kind, city_id, merchant_id, contact_email)
values ('c1470000-0000-4000-8000-0000000000e1', '[Park partner]', 'venue',
        (select id from public.city where slug = 'nairobi'), 'c1470000-0000-4000-8000-00000000000b',
        'park147@example.test');
insert into public.experience_component (id, partner_id, city_id, kind, mood, title, duration_min, default_slot, swap_group)
values ('c1470000-0000-4000-8000-0000000000c1', 'c1470000-0000-4000-8000-0000000000e1',
        (select id from public.city where slug = 'nairobi'), 'activity', 'wild', '[Walk 147]', 60, 'morning', 'g147');

-- ══════════════════════════════════════════════ the owner saves stops

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1470000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$
  insert into public.plan_block (id, plan_id, slot, kind, title_snapshot, merchant_id, sort)
  values ('c1470000-0000-4000-8000-0000000000b1', 'c1470000-0000-4000-8000-0000000000f1',
          'midday', 'meal', 'Lunch', 'c1470000-0000-4000-8000-00000000000a', 1)$$,
  'The plan''s owner saves a stop with the shop it is at.');
select lives_ok($$
  insert into public.plan_block (id, plan_id, slot, kind, title_snapshot, component_id, sort)
  values ('c1470000-0000-4000-8000-0000000000b2', 'c1470000-0000-4000-8000-0000000000f1',
          'morning', 'activity', 'Walk', 'c1470000-0000-4000-8000-0000000000c1', 0)$$,
  'A stop with a component needs no shop given.');
select lives_ok($$
  insert into public.plan_block (id, plan_id, slot, kind, title_snapshot, sort)
  values ('c1470000-0000-4000-8000-0000000000b3', 'c1470000-0000-4000-8000-0000000000f1',
          'afternoon', 'free', 'Rest', 2)$$,
  'A free stop has no shop.');

select is(
  (select jsonb_agg(jsonb_build_array(b ->> 'title_snapshot', b ->> 'merchant_name') order by (b ->> 'sort')::int)
     from jsonb_array_elements(public.fn_plan_view('c1470000-0000-4000-8000-0000000000f1') -> 'blocks') b),
  '[["Walk", "[Park 147]"], ["Lunch", "[Cafe 147]"], ["Rest", null]]'::jsonb,
  'The plan read gives each stop its shop''s name; a component''s partner fills it in.');
select is(
  (select b ->> 'merchant_id' from jsonb_array_elements(public.fn_plan_view('c1470000-0000-4000-8000-0000000000f1') -> 'blocks') b
    where b ->> 'title_snapshot' = 'Lunch'),
  'c1470000-0000-4000-8000-00000000000a', 'And its id, to open the shop''s page.');

-- Somebody else cannot write into the plan.
select set_config('request.jwt.claims',
  '{"sub":"c1470000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$
  insert into public.plan_block (plan_id, slot, kind, title_snapshot, merchant_id)
  values ('c1470000-0000-4000-8000-0000000000f1', 'night', 'venue', 'Sneaky',
          'c1470000-0000-4000-8000-00000000000a')$$,
  '42501', null, 'Somebody else cannot add a stop to the plan.');
reset role;

select throws_ok($$
  insert into public.plan_block (plan_id, slot, kind, title_snapshot, merchant_id)
  values ('c1470000-0000-4000-8000-0000000000f1', 'night', 'venue', 'Nowhere', gen_random_uuid())$$,
  '23503', null, 'A stop cannot name a shop that does not exist.');

select * from finish();
rollback;
