-- Host setup during review (20270314000400): a host NexG has not approved yet
-- can add and edit its properties and units, guests see none of it until the
-- host is live, and a closed (offboarded) host stays locked.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ══════════════════════════════════════════ setup

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e2120000-0000-4000-8000-000000000001',
   'authenticated','authenticated','review212@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e2120000-0000-4000-8000-000000000002',
   'authenticated','authenticated','closed212@example.test',now(),now(),now());

insert into public.host (id, kind, display_name, phone, city_id, status)
values
  ('e2121000-0000-4000-8000-00000000000a','multi_unit','[Host 212 review]','+254700212001',
   (select id from public.city where slug = 'nairobi'),'verifying'),
  ('e2121000-0000-4000-8000-00000000000b','single_unit','[Host 212 closed]','+254700212002',
   (select id from public.city where slug = 'nairobi'),'offboarded');
insert into public.host_user (host_id, user_id, role)
values
  ('e2121000-0000-4000-8000-00000000000a','e2120000-0000-4000-8000-000000000001','owner'),
  ('e2121000-0000-4000-8000-00000000000b','e2120000-0000-4000-8000-000000000002','owner');

/* The closed host's unit, written by the system (no session), which the lock lets through. */
insert into public.property (id, host_id, slug, name, kind, area, city_id)
values ('e2122000-0000-4000-8000-00000000000b','e2121000-0000-4000-8000-00000000000b',
        'closed-212','Closed 212','apartment','Kilimani',(select id from public.city where slug = 'nairobi'));
insert into public.unit (id, host_id, property_id, name, address_line, city_id, handoff)
values ('e2123000-0000-4000-8000-00000000000b','e2121000-0000-4000-8000-00000000000b',
        'e2122000-0000-4000-8000-00000000000b','Closed unit','[Address]',
        (select id from public.city where slug = 'nairobi'),'lockbox');

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;
do $grant$
begin
  execute format('grant usage on schema %I to anon, authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;

-- ══════════════════════════════════════════ 1. a host under review sets up

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2120000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  insert into t (k, v) select 'property', (public.rpc_property_upsert(
    'e2121000-0000-4000-8000-00000000000a',
    jsonb_build_object('name', 'Block 212', 'lat', -1.2921, 'lng', 36.7856,
                       'house_rules', 'No parties.'))).id::text
$$, 'A host under review can add a property.');

select lives_ok($$
  insert into t (k, v) select 'unit', (public.rpc_unit_upsert_guarded(
    'e2121000-0000-4000-8000-00000000000a',
    jsonb_build_object('name', 'Studio 1', 'label_public', 'Studio 1',
                       'address_line', '[Address], Kilimani', 'handoff', 'lockbox',
                       'property_id', (select v from t where k = 'property'),
                       'bedrooms', 1, 'max_guests', 2, 'nightly_rate_kes', 5000))).id::text
$$, 'And a unit in it.');

select lives_ok($$
  select public.rpc_unit_upsert_guarded('e2121000-0000-4000-8000-00000000000a',
    jsonb_build_object('name', 'Studio One', 'bed_setup', '1 queen bed'),
    (select v::uuid from t where k = 'unit'))
$$, 'And edit it.');

select lives_ok($$
  select public.rpc_property_upsert('e2121000-0000-4000-8000-00000000000a',
    jsonb_build_object('name', 'Block 212', 'neighbourhood_note', 'Quiet street.'),
    (select v::uuid from t where k = 'property'))
$$, 'And edit the property.');

select throws_ok($$
  select public.rpc_unit_set_published((select v::uuid from t where k = 'unit'), true)
$$, '22023', null, 'But it cannot publish the unit before NexG approves the host.');

reset role;
/* What follows runs as the system, not the host. */
select set_config('request.jwt.claims', '{}', true);

select is((select name || ' / ' || status::text || ' / ' || host_published::text || ' / ' || listed::text
             from public.unit where id = (select v::uuid from t where k = 'unit')),
  'Studio One / setting_up / false / false',
  'The unit is saved, still setting up, unpublished and unlisted.');
select is((select listed from public.property where id = (select v::uuid from t where k = 'property')),
  false, 'Its property is not listed either.');
select ok(
  'NexG approval of your host account' = any(public.fn_unit_listing_missing((select v::uuid from t where k = 'unit'))),
  'The checklist says what is missing: NexG approval.');

-- ══════════════════════════════════════════ 2. hidden from guests until live

/* Force every listing flag on, as if the unit were otherwise live: only the
   host's status is left to keep it hidden. */
update public.unit set status = 'live', host_published = true, listed = true,
       photos = '[{"path":"e2121000-0000-4000-8000-00000000000a/u/a.jpg"}]'::jsonb
 where id = (select v::uuid from t where k = 'unit');
update public.property set listed = true where id = (select v::uuid from t where k = 'property');

set local role anon;
select is((select count(*)::int from public.property_public
            where id = (select v::uuid from t where k = 'property')), 0,
  'A guest does not see the property of a host under review.');
select is((select count(*)::int from public.property_unit_public
            where id = (select v::uuid from t where k = 'unit')), 0,
  'Nor its unit.');
select is(authz.host_photo_is_public('e2121000-0000-4000-8000-00000000000a/u/a.jpg'), false,
  'Nor its photos.');
reset role;

update public.host set status = 'live', verified_at = now(), went_live_at = now()
 where id = 'e2121000-0000-4000-8000-00000000000a';

set local role anon;
select is((select count(*)::int from public.property_unit_public
            where id = (select v::uuid from t where k = 'unit')), 1,
  'Once the host is live, the same unit shows.');
reset role;

-- ══════════════════════════════════════════ 3. a closed host stays locked

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e2120000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select throws_ok($$
  select public.rpc_unit_upsert_guarded('e2121000-0000-4000-8000-00000000000b',
    '{"name":"Renamed"}'::jsonb, 'e2123000-0000-4000-8000-00000000000b')
$$, '42501', 'This host account is closed. Contact NexG support to reopen it.',
  'A closed host cannot change its units.');

select throws_ok($$
  select public.rpc_property_upsert('e2121000-0000-4000-8000-00000000000b', '{"name":"New block"}'::jsonb)
$$, '42501', 'This host account is closed. Contact NexG support to reopen it.',
  'Or add a property.');

reset role;

select * from finish();
rollback;
