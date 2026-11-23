-- Every unit sits in exactly one property (20270220000100).

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- ══════════════════════════════════════════ setup

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values
  ('e1300000-0000-4000-8000-00000000000a','multi_unit','Host 130 Homes','+254700130000',
   (select id from public.city where slug = 'nairobi'),'live', now(), now()),
  ('e1300000-0000-4000-8000-00000000000b','single_unit','Other 130','+254700130001',
   (select id from public.city where slug = 'nairobi'),'live', now(), now());

insert into public.property (id, host_id, slug, name, kind, area, city_id)
values
  ('e1310000-0000-4000-8000-00000000000a','e1300000-0000-4000-8000-00000000000a',
   'arbour-130','The Arbour 130','apartment_block','Kilimani',(select id from public.city where slug = 'nairobi')),
  ('e1310000-0000-4000-8000-00000000000b','e1300000-0000-4000-8000-00000000000b',
   'other-130','Other block 130','apartment','Karen',(select id from public.city where slug = 'nairobi'));

-- ══════════════════════════════════════════ 1. the rule exists

select has_trigger('public', 'unit', 'unit_property_guard', 'Units have the property guard.');

select is(
  (select convalidated from pg_constraint where conname = 'unit_has_property'),
  true,
  'unit_has_property is a validated check.');

select is(
  (select count(*)::integer from public.unit where property_id is null),
  0,
  'No unit is left without a property.');

-- ══════════════════════════════════════════ 2. a unit saved with none goes into the host's

insert into public.unit (id, host_id, name, address_line, city_id)
values ('e1320000-0000-4000-8000-00000000000a','e1300000-0000-4000-8000-00000000000a',
        'Flat 1','[Address]',(select id from public.city where slug = 'nairobi'));

select is(
  (select property_id from public.unit where id = 'e1320000-0000-4000-8000-00000000000a'),
  'e1310000-0000-4000-8000-00000000000a'::uuid,
  'A unit with no property joins the host''s existing property, not a new one.');

select is(
  (select count(*)::integer from public.property where host_id = 'e1300000-0000-4000-8000-00000000000a'),
  1,
  'No stray property was created for it.');

/* Naming a building the host has puts it there. */
insert into public.unit (id, host_id, name, address_line, building, city_id)
values ('e1320000-0000-4000-8000-00000000000b','e1300000-0000-4000-8000-00000000000a',
        'Flat 2','[Address]','the arbour 130',(select id from public.city where slug = 'nairobi'));

select is(
  (select property_id from public.unit where id = 'e1320000-0000-4000-8000-00000000000b'),
  'e1310000-0000-4000-8000-00000000000a'::uuid,
  'A unit whose building matches a property name goes into that property.');

/* A building the host does not have yet becomes a property. */
insert into public.unit (id, host_id, name, address_line, building, area, city_id)
values ('e1320000-0000-4000-8000-00000000000c','e1300000-0000-4000-8000-00000000000a',
        'Flat 3','[Address]','Brook House 130','Westlands',(select id from public.city where slug = 'nairobi'));

select is(
  (select p.name || ' / ' || p.area || ' / ' || (p.host_id = u.host_id)::text
     from public.unit u join public.property p on p.id = u.property_id
    where u.id = 'e1320000-0000-4000-8000-00000000000c'),
  'Brook House 130 / Westlands / true',
  'A new building becomes a property of the same host, with the unit''s area.');

/* A host with no property at all gets one named after them. */
insert into public.host (id, kind, display_name, phone, city_id, status)
values ('e1300000-0000-4000-8000-00000000000c','single_unit','Wanjiru 130','+254700130002',
        (select id from public.city where slug = 'nairobi'),'applied');
insert into public.unit (id, host_id, name, address_line, city_id)
values ('e1320000-0000-4000-8000-00000000000d','e1300000-0000-4000-8000-00000000000c',
        'Unit 1','[Address]',(select id from public.city where slug = 'nairobi'));

select is(
  (select p.name from public.unit u join public.property p on p.id = u.property_id
    where u.id = 'e1320000-0000-4000-8000-00000000000d'),
  'Wanjiru 130',
  'A host with no property gets one named after the host.');

select is(
  (select count(*)::integer from audit.audit_event
    where action = 'property.created_for_unit'
      and after ->> 'host_id' = 'e1300000-0000-4000-8000-00000000000c'),
  1,
  'Creating it is on the audit trail.');

-- ══════════════════════════════════════════ 3. moving between properties

update public.unit set property_id = (
  select property_id from public.unit where id = 'e1320000-0000-4000-8000-00000000000c')
where id = 'e1320000-0000-4000-8000-00000000000a';

select isnt(
  (select property_id from public.unit where id = 'e1320000-0000-4000-8000-00000000000a'),
  'e1310000-0000-4000-8000-00000000000a'::uuid,
  'A unit moves to another property of the same host.');

update public.unit set property_id = null where id = 'e1320000-0000-4000-8000-00000000000a';
select isnt(
  (select property_id from public.unit where id = 'e1320000-0000-4000-8000-00000000000a'),
  null,
  'Clearing the property puts the unit back into a property of its host, never none.');

select throws_ok(
  $$ update public.unit set property_id = 'e1310000-0000-4000-8000-00000000000b'
      where id = 'e1320000-0000-4000-8000-00000000000a' $$,
  '22023', 'A unit can only sit in a property on its own host account.',
  'A unit cannot be put into another host''s property.');

update public.property set deleted_at = now() where id = 'e1310000-0000-4000-8000-00000000000a';
select throws_ok(
  $$ update public.unit set property_id = 'e1310000-0000-4000-8000-00000000000a'
      where id = 'e1320000-0000-4000-8000-00000000000c' $$,
  '22023', null,
  'A live unit cannot be put into a removed property.');

-- ══════════════════════════════════════════ 4. the host application

select is(
  (select count(*)::integer from public.unit u
     left join public.property p on p.id = u.property_id
    where p.id is null or p.host_id <> u.host_id),
  0,
  'Every unit''s property exists and belongs to the unit''s host.');

select * from finish();
rollback;
