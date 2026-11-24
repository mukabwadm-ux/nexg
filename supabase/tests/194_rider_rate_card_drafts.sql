-- The rider rate card can be drafted, and still needs two people to go live
-- (20270311000100 with rpc_rate_card_publish from 20260101007800).

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1450000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'ops145@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1450000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'finance145@test.local', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1450000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'stranger145@example.test', now(), false, now(), now());

create temp table t (k text primary key, v text);
insert into t values ('nbo', (select id::text from public.city where slug = 'nairobi'));
grant select on t to authenticated;

insert into public.staff_user (id, user_id, email, display_name) values
  ('c1450000-0000-4000-8000-0000000000b1', 'c1450000-0000-4000-8000-000000000001', 'ops145@test.local', 'Ops 145'),
  ('c1450000-0000-4000-8000-0000000000b2', 'c1450000-0000-4000-8000-000000000002', 'finance145@test.local', 'Finance 145');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select s.id, r.id, null,
       (select id from public.staff_user where email = 'dev.admin@nexgapp.com'),
       /* The approver is never the granter: the other new staff member. */
       case when s.id = 'c1450000-0000-4000-8000-0000000000b1'
            then 'c1450000-0000-4000-8000-0000000000b2'::uuid
            else 'c1450000-0000-4000-8000-0000000000b1'::uuid end
  from (values ('c1450000-0000-4000-8000-0000000000b1'::uuid, 'ops_manager'),
               ('c1450000-0000-4000-8000-0000000000b2'::uuid, 'finance')) s(id, role_key)
  join public.role r on r.key = s.role_key;

update public.rider_rate_card set status = 'archived'
 where city_id = (select v::uuid from t where k = 'nbo') and status in ('current', 'draft');

create function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_uid, 'role', 'authenticated')::text, true)
$$;

-- ── a stranger cannot draft one
select pg_temp.as_user('c1450000-0000-4000-8000-000000000003');
set local role authenticated;
select throws_ok(
  $$ select public.rpc_rate_card_draft_save((select v::uuid from t where k = 'nbo'), '[v145]', now(), 150, 30) $$,
  '42501', null, 'Someone outside riders and finance cannot draft a rate card.');
reset role;

-- ── ops drafts one; base and per-km are required
select pg_temp.as_user('c1450000-0000-4000-8000-000000000001');
set local role authenticated;
select throws_ok(
  $$ select public.rpc_rate_card_draft_save((select v::uuid from t where k = 'nbo'), '[v145]', now(), 0, 30) $$,
  '22023', null, 'A card without base pay is refused.');
select is(
  (select status from public.rpc_rate_card_draft_save((select v::uuid from t where k = 'nbo'), '[v145]', now(), 150, 30)),
  'draft', 'Ops drafts the card.');
select is(
  (select approved_by::text from public.rpc_rate_card_publish(
     (select id from public.rider_rate_card where version = '[v145]'))),
  'c1450000-0000-4000-8000-0000000000b1', 'The first press approves.');
select throws_ok(
  $$ select public.rpc_rate_card_publish((select id from public.rider_rate_card where version = '[v145]')) $$,
  '42501', null, 'The same person cannot also publish it.');

-- ── a change clears the first approval and keeps one draft per city
select ok(
  (select approved_by is null and base_per_trip_kes = 160
     from public.rpc_rate_card_draft_save((select v::uuid from t where k = 'nbo'), '[v145]', now(), 160, 30)),
  'Changing the draft clears the approval.');
select is(
  (select count(*)::int from public.rider_rate_card
    where city_id = (select v::uuid from t where k = 'nbo') and status = 'draft'),
  1, 'Still one draft for the city.');
select is(
  (select approved_by::text from public.rpc_rate_card_publish(
     (select id from public.rider_rate_card where version = '[v145]'))),
  'c1450000-0000-4000-8000-0000000000b1', 'Ops approves the changed card.');
reset role;

-- ── finance publishes it, and trips are paid on it
select pg_temp.as_user('c1450000-0000-4000-8000-000000000002');
set local role authenticated;
select is(
  (select status from public.rpc_rate_card_publish(
     (select id from public.rider_rate_card where version = '[v145]'))),
  'current', 'A second person publishes it.');
reset role;

select is(
  (public.fn_rider_trip_pay((select v::uuid from t where k = 'nbo'), 5.2, 0, false) ->> 'totalKes')::int,
  160 + 30 * 4, 'A 5.2 km trip pays base plus 4 km.');

-- ── the wiring gate has nothing to say about these functions
select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical' and finding like '%rate_card%'),
  0, 'No critical wiring findings for the rate card functions.');

select * from finish();
rollback;
