-- Unit archive (20270326000100): a host archives one unit. It leaves the site,
-- its QR cards are voided and the archive is audited. A booking still to come,
-- another host, a signed-out visitor and a second archive are refused.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ══════════════════════════════════════════ setup

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e2420000-0000-4000-8000-000000000001',
   'authenticated','authenticated','host242@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2420000-0000-4000-8000-000000000002',
   'authenticated','authenticated','other242@example.test',now(),now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values
  ('e2421000-0000-4000-8000-00000000000a','multi_unit','[Host 242]','+254700242000',
   (select id from public.city where slug = 'nairobi'),'live', now(), now()),
  ('e2421000-0000-4000-8000-00000000000b','multi_unit','[Other host 242]','+254700242001',
   (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.host_user (host_id, user_id, role) values
  ('e2421000-0000-4000-8000-00000000000a','e2420000-0000-4000-8000-000000000001','owner'),
  ('e2421000-0000-4000-8000-00000000000b','e2420000-0000-4000-8000-000000000002','owner');

insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('e2422000-0000-4000-8000-00000000000a','e2421000-0000-4000-8000-00000000000a',
        'block-242','Block 242','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());

/* Two live, published, listed units. A will be archived; B has a guest coming. */
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, bedrooms, max_guests, nightly_rate_kes,
                         host_published, listed)
values
  ('e2423000-0000-4000-8000-00000000000a','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, true, true),
  ('e2423000-0000-4000-8000-00000000000b','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','B','B','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, true, true);

set local session_replication_role = replica;
update public.property set review_status = 'approved', reviewed_at = now()
 where id = 'e2422000-0000-4000-8000-00000000000a';
insert into public.property_qr (owner_type, owner_id, host_id, code, secret_hash, state, placed_confirmed_at)
values ('unit','e2423000-0000-4000-8000-00000000000a','e2421000-0000-4000-8000-00000000000a',
        'NXG-A2K4MW', 'test-242', 'placed', now());
set local session_replication_role = origin;

/* Unit A: a past stay and a cancelled future one, neither of which blocks.
   Unit B: a booking next week, which does. */
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, check_in, check_out,
                         source, status)
values
  ('e2424000-0000-4000-8000-0000000000a1','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','e2423000-0000-4000-8000-00000000000a','Amina',
   now() - interval '5 days', now() - interval '3 days', 'entered', 'departed'),
  ('e2424000-0000-4000-8000-0000000000a2','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','e2423000-0000-4000-8000-00000000000a','Baraka',
   now() + interval '10 days', now() + interval '12 days', 'entered', 'cancelled'),
  ('e2424000-0000-4000-8000-0000000000b1','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','e2423000-0000-4000-8000-00000000000b','Chausiku',
   now() + interval '7 days', now() + interval '9 days', 'entered', 'booked');

create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

select is((select count(*)::int from public.property_unit_public
            where property_id = 'e2422000-0000-4000-8000-00000000000a'),
  2, 'Before: guests see both units.');

-- ══════════════════════════════════════════ 1. who may archive

set local role anon;
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'Signed-out visitors cannot archive a unit.');
reset role;

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000002');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000a') $$,
  '42501', 'This unit is outside your workspace access.', 'Another host cannot archive it.');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-0000000000ff') $$,
  '42501', 'This unit is outside your workspace access.',
  'A unit that does not exist reads the same as one that is not yours.');

-- ══════════════════════════════════════════ 2. a guest still to come

select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000b') $$,
  '23503', null, 'A unit with a booking still to come cannot be archived.');
reset role;
select is((select status::text from public.unit where id = 'e2423000-0000-4000-8000-00000000000b'),
  'live', 'And it is left as it was.');

-- ══════════════════════════════════════════ 3. the archive

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select lives_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000a') $$,
  'A past stay and a cancelled one do not block the archive.');
reset role;

select results_eq($$
  select status::text, archived_at is not null, host_published, listed from public.unit
   where id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values ('archived'::text, true, false, false) $$,
  'The unit is archived, unpublished and unlisted.');
select is((select count(*)::int from public.property_unit_public
            where id = 'e2423000-0000-4000-8000-00000000000a'),
  0, 'Guests no longer see it.');
select is((select count(*)::int from public.property_unit_public
            where id = 'e2423000-0000-4000-8000-00000000000b'),
  1, 'The other unit in the property still shows.');
select results_eq($$
  select voided_at is not null, void_reason from public.property_qr
   where owner_type = 'unit' and owner_id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values (true, 'The unit was archived'::text) $$, 'Its QR card is voided, with a reason.');
select results_eq($$
  select actor_id, after->>'cards_voided' from audit.audit_event
   where action = 'unit.archived' and target_id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values ('e2420000-0000-4000-8000-000000000001'::uuid, '1'::text) $$,
  'One audit row names the host and the cards voided.');
select is((select count(*)::int from audit.action_registry where action = 'unit.archived'),
  1, 'The action is registered.');
select is((select count(*)::int from public.stay
            where unit_id = 'e2423000-0000-4000-8000-00000000000a'),
  2, 'Its stays are kept.');

-- ══════════════════════════════════════════ 4. only once

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000a') $$,
  '22023', 'This unit is already archived.', 'Archiving twice is refused.');
reset role;
select is((select count(*)::int from audit.audit_event
            where action = 'unit.archived' and target_id = 'e2423000-0000-4000-8000-00000000000a'),
  1, 'And writes no second audit row.');

select * from finish();
rollback;
