-- Archive and delete (20270326000100): a host archives, restores and deletes a
-- unit or a whole property. Archive keeps the QR cards and restore leaves the
-- unit paused; delete voids the cards with a reason and keeps the stays.
-- Guests never see an archived or deleted unit or property. A stay that has
-- not ended, another host, a signed-out visitor and a member limited to some
-- units are refused. A lapsed hold is released, not counted.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ══════════════════════════════════════════ setup

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e2420000-0000-4000-8000-000000000001',
   'authenticated','authenticated','host242@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2420000-0000-4000-8000-000000000002',
   'authenticated','authenticated','other242@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2420000-0000-4000-8000-000000000003',
   'authenticated','authenticated','staff242@example.test',now(),now(),now());

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
        (select id from public.city where slug = 'nairobi'), true, now()),
       ('e2422000-0000-4000-8000-00000000000b','e2421000-0000-4000-8000-00000000000a',
        'gone-242','Gone 242','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), false, null);

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

/* Unpublished units for the other refusals: C has a block, D a live hold,
   E a hold that has lapsed, F sits in the property removed below. */
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, bedrooms, max_guests, nightly_rate_kes,
                         host_published, listed)
values
  ('e2423000-0000-4000-8000-00000000000c','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','C','C','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, false, false),
  ('e2423000-0000-4000-8000-00000000000d','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','D','D','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, false, false),
  ('e2423000-0000-4000-8000-00000000000e','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','E','E','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, false, false),
  ('e2423000-0000-4000-8000-00000000000f','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000b','F','F','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, false, false);
update public.property set deleted_at = now() where id = 'e2422000-0000-4000-8000-00000000000b';

/* K is still setting up: no address and no handoff yet. */
insert into public.unit (id, host_id, property_id, name, label_public, area, city_id, status,
                         bedrooms, max_guests, nightly_rate_kes, host_published, listed)
values ('e2423000-0000-4000-8000-000000000011','e2421000-0000-4000-8000-00000000000a',
        'e2422000-0000-4000-8000-00000000000a','K','K','Kilimani',
        (select id from public.city where slug = 'nairobi'),'setting_up', 1, 2, 6000, false, false);

/* A member of staff limited to unit A. */
insert into public.host_user (host_id, user_id, role, units) values
  ('e2421000-0000-4000-8000-00000000000a','e2420000-0000-4000-8000-000000000003','manager',
   array['e2423000-0000-4000-8000-00000000000a'::uuid]);

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
insert into public.stay (id, host_id, property_id, unit_id, guest_first_name, check_in, check_out,
                         source, status, hold_expires_at)
values
  ('e2424000-0000-4000-8000-0000000000c1','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','e2423000-0000-4000-8000-00000000000c',null,
   now() + interval '3 days', now() + interval '5 days', 'entered', 'blocked', null),
  ('e2424000-0000-4000-8000-0000000000d1','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','e2423000-0000-4000-8000-00000000000d','Dalia',
   now() + interval '3 days', now() + interval '5 days', 'entered', 'held',
   now() + interval '2 hours'),
  ('e2424000-0000-4000-8000-0000000000e1','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000a','e2423000-0000-4000-8000-00000000000e','Esther',
   now() + interval '3 days', now() + interval '5 days', 'entered', 'held',
   now() - interval '1 hour');

create or replace function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

select is((select count(*)::int from public.property_unit_public
            where property_id = 'e2422000-0000-4000-8000-00000000000a'),
  2, 'Before: guests see both units.');

-- ══════════════════════════════════════════ 1. who may archive, restore or delete

set local role anon;
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'Signed-out visitors cannot archive a unit.');
select throws_ok($$ select public.rpc_unit_unarchive('e2423000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'Or restore one.');
select throws_ok($$ select public.rpc_unit_delete('e2423000-0000-4000-8000-00000000000a', 'A') $$,
  '42501', null, 'Or delete one.');
select throws_ok($$ select public.rpc_property_archive('e2422000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'Or archive a property.');
select throws_ok($$ select public.rpc_property_unarchive('e2422000-0000-4000-8000-00000000000a') $$,
  '42501', null, 'Or restore a property.');
select throws_ok($$ select public.rpc_property_delete('e2422000-0000-4000-8000-00000000000a', 'Block 242') $$,
  '42501', null, 'Or delete a property.');
reset role;

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000002');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000a') $$,
  '42501', 'This unit is outside your workspace access.', 'Another host cannot archive it.');
select throws_ok($$ select public.rpc_unit_delete('e2423000-0000-4000-8000-00000000000a', 'A') $$,
  '42501', 'This unit is outside your workspace access.', 'Another host cannot delete it.');
select throws_ok($$ select public.rpc_property_archive('e2422000-0000-4000-8000-00000000000a') $$,
  '42501', 'This property is outside your workspace access.',
  'Another host cannot archive the property.');
select throws_ok($$ select public.rpc_property_delete('e2422000-0000-4000-8000-00000000000a', 'Block 242') $$,
  '42501', 'Not your property.', 'Another host cannot delete the property.');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-0000000000ff') $$,
  '42501', 'This unit is outside your workspace access.',
  'A unit that does not exist reads the same as one that is not yours.');

select pg_temp.as_user('e2420000-0000-4000-8000-000000000003');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000a') $$,
  '42501', 'This unit is outside your workspace access.',
  'Staff limited to some units cannot archive even one of theirs.');
select throws_ok($$ select public.rpc_unit_delete('e2423000-0000-4000-8000-00000000000a', 'A') $$,
  '42501', 'This unit is outside your workspace access.', 'Nor delete it.');
select throws_ok($$ select public.rpc_property_archive('e2422000-0000-4000-8000-00000000000a') $$,
  '42501', 'This property is outside your workspace access.', 'Nor archive its property.');
select throws_ok($$ select public.rpc_property_delete('e2422000-0000-4000-8000-00000000000a', 'Block 242') $$,
  '42501', 'Not your property.', 'Nor delete its property.');
reset role;

-- ══════════════════════════════════════════ 2. a guest still to come

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000b') $$,
  '23503', 'A guest has a stay here that hasn''t ended. You can do this after they check out, or once the stay is cancelled.',
  'A unit with a booking still to come cannot be archived, and the host is told why.');
select throws_ok($$ select public.rpc_unit_delete('e2423000-0000-4000-8000-00000000000b', 'B') $$,
  '23503', null, 'Nor deleted.');
reset role;
select is((select status::text from public.unit where id = 'e2423000-0000-4000-8000-00000000000b'),
  'live', 'And it is left as it was.');

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000c') $$,
  '23503', null, 'A unit with dates blocked still to come cannot be archived.');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000d') $$,
  '23503', null, 'A unit with a live hold cannot be archived.');
select lives_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000e') $$,
  'A hold that has lapsed does not block the archive.');
reset role;
select is((select status::text from public.stay where id = 'e2424000-0000-4000-8000-0000000000e1'),
  'cancelled', 'The lapsed hold is released on the way.');

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000f') $$,
  '22023', 'This unit''s property has been deleted.',
  'A unit in a deleted property is refused with that reason.');
reset role;

-- ══════════════════════════════════════════ 3. archive a unit

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select lives_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000a') $$,
  'A past stay and a cancelled one do not block the archive.');
reset role;

select results_eq($$
  select status::text, archived_at is not null, deleted_at is null, host_published, listed
    from public.unit where id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values ('archived'::text, true, true, false, false) $$,
  'The unit is archived, not deleted, and off NEXG Stays.');
select is((select count(*)::int from public.property_unit_public
            where id = 'e2423000-0000-4000-8000-00000000000a'),
  0, 'Guests no longer see it.');
select is((select count(*)::int from public.property_unit_public
            where id = 'e2423000-0000-4000-8000-00000000000b'),
  1, 'The other unit in the property still shows.');
select results_eq($$
  select voided_at is null, void_reason is null from public.property_qr
   where owner_type = 'unit' and owner_id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values (true, true) $$, 'Archive keeps its QR card.');
select results_eq($$
  select actor_id from audit.audit_event
   where action = 'unit.archived' and target_id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values ('e2420000-0000-4000-8000-000000000001'::uuid) $$,
  'One audit row names the host.');
select is((select count(*)::int from public.stay
            where unit_id = 'e2423000-0000-4000-8000-00000000000a'),
  2, 'Its stays are kept.');

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-00000000000a') $$,
  '22023', 'This unit is already archived.', 'Archiving twice is refused.');
select throws_ok($$ select public.rpc_unit_set_published('e2423000-0000-4000-8000-00000000000a', true) $$,
  '22023', null, 'An archived unit cannot be put back on NEXG Stays with the switch.');
reset role;
select is((select count(*)::int from audit.audit_event
            where action = 'unit.archived' and target_id = 'e2423000-0000-4000-8000-00000000000a'),
  1, 'And writes no second audit row.');

-- ══════════════════════════════════════════ 4. restore a unit

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000003');
select throws_ok($$ select public.rpc_unit_unarchive('e2423000-0000-4000-8000-00000000000a') $$,
  '42501', 'This unit is outside your workspace access.', 'Staff limited to some units cannot restore it.');
select pg_temp.as_user('e2420000-0000-4000-8000-000000000002');
select throws_ok($$ select public.rpc_unit_unarchive('e2423000-0000-4000-8000-00000000000a') $$,
  '42501', 'This unit is outside your workspace access.', 'Nor can another host.');
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_unit_unarchive('e2423000-0000-4000-8000-00000000000b') $$,
  '22023', 'This unit is not archived.', 'A unit that is not archived cannot be restored.');
select results_eq($$ select public.rpc_unit_unarchive('e2423000-0000-4000-8000-00000000000a') ->> 'status' $$,
  $$ values ('live'::text) $$, 'A ready unit comes back live.');
reset role;

select results_eq($$
  select status::text, archived_at is null, host_published, listed
    from public.unit where id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values ('live'::text, true, false, false) $$,
  'Restored, it stays paused: off NEXG Stays until the host turns it back on.');
select is((select count(*)::int from public.property_unit_public
            where id = 'e2423000-0000-4000-8000-00000000000a'),
  0, 'So guests still do not see it.');
select is((select count(*)::int from public.property_qr
            where owner_type = 'unit' and owner_id = 'e2423000-0000-4000-8000-00000000000a'
              and voided_at is null),
  1, 'Its card still works.');
select is((select count(*)::int from audit.audit_event
            where action = 'unit.unarchived' and target_id = 'e2423000-0000-4000-8000-00000000000a'),
  1, 'The restore is audited.');

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select lives_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-000000000011') $$,
  'A unit still setting up can be archived.');
select results_eq($$ select public.rpc_unit_unarchive('e2423000-0000-4000-8000-000000000011') ->> 'status' $$,
  $$ values ('setting_up'::text) $$, 'And comes back setting up, not live, archived or paused.');
reset role;

-- ══════════════════════════════════════════ 5. delete a unit

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_unit_delete('e2423000-0000-4000-8000-00000000000a', 'Not A') $$,
  '22023', 'Type the unit name exactly to confirm: A', 'The name has to match.');
select lives_ok($$ select public.rpc_unit_delete('e2423000-0000-4000-8000-00000000000a', '  a ') $$,
  'Typed in any case, with spaces around it, the name confirms the delete.');
reset role;

select results_eq($$
  select status::text, deleted_at is not null, archived_at is not null, host_published
    from public.unit where id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values ('archived'::text, true, true, false) $$, 'The unit is deleted.');
select results_eq($$
  select voided_at is not null, void_reason from public.property_qr
   where owner_type = 'unit' and owner_id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values (true, 'The unit was deleted'::text) $$, 'Delete voids its QR card, with a reason.');
select results_eq($$
  select after->>'cards_voided' from audit.audit_event
   where action = 'unit.deleted' and target_id = 'e2423000-0000-4000-8000-00000000000a'
$$, $$ values ('1'::text) $$, 'One audit row counts the cards voided.');
select is((select count(*)::int from public.stay
            where unit_id = 'e2423000-0000-4000-8000-00000000000a'),
  2, 'Its stays are kept.');

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_unit_delete('e2423000-0000-4000-8000-00000000000a', 'A') $$,
  '42501', 'This unit is outside your workspace access.', 'A deleted unit is gone: no second delete.');
select throws_ok($$ select public.rpc_unit_unarchive('e2423000-0000-4000-8000-00000000000a') $$,
  '42501', 'This unit is outside your workspace access.', 'Nor a restore.');
select lives_ok($$ select public.rpc_unit_delete('e2423000-0000-4000-8000-00000000000e', 'E') $$,
  'An archived unit can be deleted.');
reset role;

-- ══════════════════════════════════════════ 6. guests never see archived or deleted rows

/* Set directly, so only the views' own conditions hide unit B. */
update public.unit set deleted_at = now() where id = 'e2423000-0000-4000-8000-00000000000b';
select is((select count(*)::int from public.property_unit_public
            where id = 'e2423000-0000-4000-8000-00000000000b'),
  0, 'A deleted unit is hidden from guests even if it is still listed.');
select is((select count(*)::int from public.property_public
            where id = 'e2422000-0000-4000-8000-00000000000a'),
  0, 'And does not count towards its property.');
update public.unit set deleted_at = null where id = 'e2423000-0000-4000-8000-00000000000b';
select is((select count(*)::int from public.property_public
            where id = 'e2422000-0000-4000-8000-00000000000a'),
  1, 'Back again, the property shows.');

update public.property set archived_at = now() where id = 'e2422000-0000-4000-8000-00000000000a';
select is((select count(*)::int from public.property_public
            where id = 'e2422000-0000-4000-8000-00000000000a'),
  0, 'An archived property is hidden from guests.');
select is((select count(*)::int from public.property_unit_public
            where property_id = 'e2422000-0000-4000-8000-00000000000a'),
  0, 'And so are its units.');
update public.property set archived_at = null, deleted_at = now()
 where id = 'e2422000-0000-4000-8000-00000000000a';
select is((select count(*)::int from public.property_unit_public
            where property_id = 'e2422000-0000-4000-8000-00000000000a')
        + (select count(*)::int from public.property_public
            where id = 'e2422000-0000-4000-8000-00000000000a'),
  0, 'A deleted property and its units are hidden from guests.');
update public.property set deleted_at = null where id = 'e2422000-0000-4000-8000-00000000000a';

-- ══════════════════════════════════════════ 7. archive and restore a property

/* Hill 242: unit G on NEXG Stays and unit H, archived on its own first. */
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('e2422000-0000-4000-8000-00000000000d','e2421000-0000-4000-8000-00000000000a',
        'hill-242','Hill 242','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, bedrooms, max_guests, nightly_rate_kes,
                         host_published, listed)
values
  ('e2423000-0000-4000-8000-000000000012','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000d','G','G','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, true, true),
  ('e2423000-0000-4000-8000-000000000013','e2421000-0000-4000-8000-00000000000a',
   'e2422000-0000-4000-8000-00000000000d','H','H','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, false, false);
set local session_replication_role = replica;
update public.property set review_status = 'approved', reviewed_at = now()
 where id = 'e2422000-0000-4000-8000-00000000000d';
insert into public.property_qr (owner_type, owner_id, host_id, code, secret_hash, state, placed_confirmed_at)
values ('unit','e2423000-0000-4000-8000-000000000012','e2421000-0000-4000-8000-00000000000a',
        'NXG-H4R7TW', 'test-242-h', 'placed', now());
set local session_replication_role = origin;
select is((select count(*)::int from public.property_public
            where id = 'e2422000-0000-4000-8000-00000000000d'),
  1, 'Before: guests see Hill 242.');

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select lives_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-000000000013') $$,
  'Unit H is archived on its own.');
select throws_ok($$ select public.rpc_property_archive('e2422000-0000-4000-8000-00000000000a') $$,
  '23503', 'A guest has a stay here that hasn''t ended. You can do this after they check out, or once the stay is cancelled.',
  'A property with a guest still to come cannot be archived.');
select lives_ok($$ select public.rpc_property_archive('e2422000-0000-4000-8000-00000000000d') $$,
  'The host archives Hill 242.');
reset role;

select is((select archived_at is not null from public.property
            where id = 'e2422000-0000-4000-8000-00000000000d'),
  true, 'The property is archived.');
select results_eq($$
  select name, host_published, listed, archived_at is null from public.unit
   where property_id = 'e2422000-0000-4000-8000-00000000000d' order by name
$$, $$ values ('G'::text, false, false, true), ('H'::text, false, false, false) $$,
  'Its units are off NEXG Stays and keep their own archived state.');
select is((select count(*)::int from public.property_public
            where id = 'e2422000-0000-4000-8000-00000000000d')
        + (select count(*)::int from public.property_unit_public
            where property_id = 'e2422000-0000-4000-8000-00000000000d'),
  0, 'Guests no longer see it or its units.');
select is((select count(*)::int from public.property_qr
            where owner_type = 'unit' and owner_id = 'e2423000-0000-4000-8000-000000000012'
              and voided_at is null),
  1, 'Archive keeps the cards in its units.');
select is((select count(*)::int from audit.audit_event
            where action = 'property.archived' and target_id = 'e2422000-0000-4000-8000-00000000000d'),
  1, 'The archive is audited.');

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_property_archive('e2422000-0000-4000-8000-00000000000d') $$,
  '22023', 'This property is already archived.', 'Archiving it twice is refused.');
select throws_ok($$ select public.rpc_unit_archive('e2423000-0000-4000-8000-000000000012') $$,
  '22023', 'This unit''s property is archived. Restore its property first.',
  'A unit in an archived property cannot be archived on its own.');
select throws_ok($$ select public.rpc_unit_unarchive('e2423000-0000-4000-8000-000000000013') $$,
  '22023', 'This unit''s property is archived. Restore its property first.',
  'Nor restored on its own.');
select throws_ok($$ select public.rpc_unit_set_published('e2423000-0000-4000-8000-000000000012', true) $$,
  '22023', null, 'Nor put back on NEXG Stays.');
select is((public.rpc_unit_set_published('e2423000-0000-4000-8000-000000000012', false) -> 'missing')
            ? 'The property is archived',
  true, 'The switch says the property is archived.');
select pg_temp.as_user('e2420000-0000-4000-8000-000000000003');
select throws_ok($$ select public.rpc_property_unarchive('e2422000-0000-4000-8000-00000000000d') $$,
  '42501', 'This property is outside your workspace access.', 'Staff limited to some units cannot restore it.');
select pg_temp.as_user('e2420000-0000-4000-8000-000000000002');
select throws_ok($$ select public.rpc_property_unarchive('e2422000-0000-4000-8000-00000000000d') $$,
  '42501', 'This property is outside your workspace access.', 'Nor can another host.');
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select lives_ok($$ select public.rpc_property_unarchive('e2422000-0000-4000-8000-00000000000d') $$,
  'The host restores Hill 242.');
select throws_ok($$ select public.rpc_property_unarchive('e2422000-0000-4000-8000-00000000000d') $$,
  '22023', 'This property is not archived.', 'Restoring it twice is refused.');
reset role;

select results_eq($$
  select p.archived_at is null, u.host_published, u.listed
    from public.property p join public.unit u on u.property_id = p.id
   where p.id = 'e2422000-0000-4000-8000-00000000000d' and u.name = 'G'
$$, $$ values (true, false, false) $$, 'Restored, its units stay paused.');
select is((select count(*)::int from public.property_public
            where id = 'e2422000-0000-4000-8000-00000000000d'),
  0, 'So guests do not see it until the host turns a unit back on.');

-- ══════════════════════════════════════════ 8. delete a property

/* Third 242 with one live unit, G2, on NEXG Stays and a placed card in it. */
insert into public.property (id, host_id, slug, name, kind, area, city_id, listed, listed_at)
values ('e2422000-0000-4000-8000-00000000000c','e2421000-0000-4000-8000-00000000000a',
        'third-242','Third 242','apartment_block','Kilimani',
        (select id from public.city where slug = 'nairobi'), true, now());
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, bedrooms, max_guests, nightly_rate_kes,
                         host_published, listed)
values ('e2423000-0000-4000-8000-000000000010','e2421000-0000-4000-8000-00000000000a',
        'e2422000-0000-4000-8000-00000000000c','G2','G2','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000, true, true);
set local session_replication_role = replica;
insert into public.property_qr (owner_type, owner_id, host_id, code, secret_hash, state, placed_confirmed_at)
values ('unit','e2423000-0000-4000-8000-000000000010','e2421000-0000-4000-8000-00000000000a',
        'NXG-G7Q3PX', 'test-242-g', 'placed', now());
set local session_replication_role = origin;

set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_property_delete('e2422000-0000-4000-8000-00000000000c', 'Third 242') $$,
  '23503', 'This property has 1 unit(s) still on NEXG Stays. Pause them first, then delete the property.',
  'A property with a unit still on NEXG Stays is refused, saying what to do.');
select lives_ok($$ select public.rpc_unit_set_published('e2423000-0000-4000-8000-000000000010', false) $$,
  'The host pauses the unit with the publish switch.');
select throws_ok($$ select public.rpc_property_delete('e2422000-0000-4000-8000-00000000000c', 'Third') $$,
  '22023', 'Type the property name exactly to confirm: Third 242', 'The name has to match.');
select lives_ok($$ select public.rpc_property_delete('e2422000-0000-4000-8000-00000000000c', 'third 242') $$,
  'A paused unit, still live in status, no longer blocks deleting the property, even with a placed card.');
reset role;

select results_eq($$
  select status::text, archived_at is not null, deleted_at is not null from public.unit
   where id = 'e2423000-0000-4000-8000-000000000010'
$$, $$ values ('archived'::text, true, true) $$, 'Its unit is deleted with it.');
select results_eq($$
  select voided_at is not null, void_reason from public.property_qr
   where owner_type = 'unit' and owner_id = 'e2423000-0000-4000-8000-000000000010'
$$, $$ values (true, 'The property was deleted'::text) $$, 'Its card is voided, with a reason.');
select is((select deleted_at is not null from public.property
            where id = 'e2422000-0000-4000-8000-00000000000c'),
  true, 'The property is deleted.');
select results_eq($$
  select actor_id, after->>'cards_voided' from audit.audit_event
   where action = 'property.deleted' and target_id = 'e2422000-0000-4000-8000-00000000000c'
$$, $$ values ('e2420000-0000-4000-8000-000000000001'::uuid, '1'::text) $$,
  'One audit row names the host and the cards voided.');

/* An archived property can be deleted too. */
set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select lives_ok($$ select public.rpc_property_archive('e2422000-0000-4000-8000-00000000000d') $$,
  'Hill 242 is archived again.');
select lives_ok($$ select public.rpc_property_delete('e2422000-0000-4000-8000-00000000000d', 'Hill 242') $$,
  'And then deleted.');
select throws_ok($$ select public.rpc_property_unarchive('e2422000-0000-4000-8000-00000000000d') $$,
  '42501', 'This property is outside your workspace access.', 'A deleted property cannot be restored.');
reset role;
select is((select count(*)::int from public.unit
            where property_id = 'e2422000-0000-4000-8000-00000000000d' and deleted_at is null),
  0, 'Every unit in it is deleted, the archived one too.');
select is((select count(*)::int from public.property_qr
            where owner_type = 'unit' and owner_id = 'e2423000-0000-4000-8000-000000000012'
              and void_reason = 'The property was deleted'),
  1, 'And its card is voided now.');

/* A paused property with a guest still to come cannot be deleted. */
update public.unit set host_published = false
 where property_id = 'e2422000-0000-4000-8000-00000000000a';
set local role authenticated;
select pg_temp.as_user('e2420000-0000-4000-8000-000000000001');
select throws_ok($$ select public.rpc_property_delete('e2422000-0000-4000-8000-00000000000a', 'Block 242') $$,
  '23503', 'A guest has a stay here that hasn''t ended. You can do this after they check out, or once the stay is cancelled.',
  'A property with a guest still to come cannot be deleted.');
reset role;

select is((select count(*)::int from audit.action_registry
            where action in ('unit.archived', 'unit.unarchived', 'unit.deleted',
                             'property.archived', 'property.unarchived', 'property.deleted')),
  6, 'Every action is registered.');

select * from finish();
rollback;
