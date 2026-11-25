-- Complete listings (20270125000100): the host's publish switch, the fields a
-- guest reads, the public views and the photos guests may load.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- Property review (20270323000100): the homes in this file count as reviewed and approved.
alter table public.property alter column review_status set default 'approved';

set local session_replication_role = replica;
delete from public.role_grant;
delete from public.staff_user;
set local session_replication_role = origin;

-- ══════════════════════════════════════════ setup

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','e1200000-0000-4000-8000-000000000001',
   'authenticated','authenticated','host120@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e1200000-0000-4000-8000-000000000002',
   'authenticated','authenticated','stranger120@example.test',now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','e1200000-0000-4000-8000-000000000003',
   'authenticated','authenticated','ops120@nexgapp.com',now(),now(),now());

insert into public.staff_user (id, user_id, email, display_name)
values ('e12000aa-0000-4000-8000-00000000000a','e1200000-0000-4000-8000-000000000003',
        'ops120@nexgapp.com','Ops 120');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select s.id, (select id from public.role where key = 'partnerships'),
       (select id from public.city where slug = 'nairobi'), s.id
from public.staff_user s where s.email = 'ops120@nexgapp.com';

insert into public.host (id, kind, display_name, phone, city_id, status, verified_at, went_live_at)
values ('e1210000-0000-4000-8000-00000000000a','multi_unit','[Host 120]','+254700120000',
        (select id from public.city where slug = 'nairobi'),'live', now(), now());
insert into public.host_user (host_id, user_id, role)
values ('e1210000-0000-4000-8000-00000000000a','e1200000-0000-4000-8000-000000000001','owner');

insert into public.property (id, host_id, slug, name, kind, area, city_id, photos)
values ('e1220000-0000-4000-8000-00000000000a','e1210000-0000-4000-8000-00000000000a',
        'block-120','Block 120','apartment_block','Kilimani',(select id from public.city where slug = 'nairobi'),
        '[{"path":"e1210000-0000-4000-8000-00000000000a/e1220000-0000-4000-8000-00000000000a/front.jpg"}]'::jsonb);

/* A is complete. B has no rate and no photo of its own. */
insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, bedrooms, max_guests, nightly_rate_kes, photos)
values
  ('e1230000-0000-4000-8000-00000000000a','e1210000-0000-4000-8000-00000000000a',
   'e1220000-0000-4000-8000-00000000000a','A','A','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, 6000,
   '[{"path":"e1210000-0000-4000-8000-00000000000a/e1230000-0000-4000-8000-00000000000a/a.jpg"}]'::jsonb),
  ('e1230000-0000-4000-8000-00000000000b','e1210000-0000-4000-8000-00000000000a',
   'e1220000-0000-4000-8000-00000000000a','B','B','[Address]','Kilimani',
   (select id from public.city where slug = 'nairobi'),'lockbox','live', 1, 2, null, '[]'::jsonb);

insert into storage.objects (bucket_id, name, owner) values
  ('host-photos','e1210000-0000-4000-8000-00000000000a/e1230000-0000-4000-8000-00000000000a/a.jpg', null),
  ('host-photos','e1210000-0000-4000-8000-00000000000a/e1230000-0000-4000-8000-00000000000a/spare.jpg', null),
  ('host-photos','e1210000-0000-4000-8000-00000000000a/e1220000-0000-4000-8000-00000000000a/front.jpg', null);

create temp table t (k text primary key, v text);
grant all on t to anon, authenticated;
do $grant$
begin
  execute format('grant usage on schema %I to anon, authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't' and n.nspname like 'pg_temp%'));
end
$grant$;

/* How many of these host-photos objects a signed-out visitor can read. */
create or replace function pg_temp.anon_can_read(p_name text) returns integer
language plpgsql as $$
declare v integer;
begin
  set local role anon;
  select count(*)::int into v from storage.objects where bucket_id = 'host-photos' and name = p_name;
  reset role;
  return v;
end $$;

-- ══════════════════════════════════════════ 1. nothing lists on its own

select is((select listed from public.unit where id = 'e1230000-0000-4000-8000-00000000000a'), false,
  'A complete unit is not listed until its host publishes it.');
select is((select listed from public.property where id = 'e1220000-0000-4000-8000-00000000000a'), false,
  'Nor is its property.');
select is(pg_temp.anon_can_read('e1210000-0000-4000-8000-00000000000a/e1230000-0000-4000-8000-00000000000a/a.jpg'), 0,
  'An unlisted unit''s photo is private.');

-- ══════════════════════════════════════════ 2. the fields a guest reads

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok($$
  select public.rpc_property_upsert('e1210000-0000-4000-8000-00000000000a', jsonb_build_object(
    'name', 'Block 120', 'lat', -1.2921, 'lng', 36.7856,
    'amenities', jsonb_build_array(' Wi-Fi ', 'wi-fi', 'Swimming pool', '', 'Rooftop  braai'),
    'neighbourhood_note', '  Quiet street off Argwings Kodhek.  ',
    'house_rules', 'No parties. Quiet after 22:00.',
    'cancellation_policy', 'Free cancellation up to 5 days before check-in.'),
    'e1220000-0000-4000-8000-00000000000a')
$$, 'The host saves the pin, amenities, neighbourhood note, house rules and cancellation policy.');

select lives_ok($$
  select public.rpc_unit_upsert_guarded('e1210000-0000-4000-8000-00000000000a', jsonb_build_object(
    'name', 'A', 'lat', -1.29215, 'lng', 36.78565, 'checkin_time', '14:00', 'checkout_time', '10:30',
    'unit_amenities', jsonb_build_array('Balcony', 'Workspace'),
    'bed_setup', '1 queen bed', 'size_sqm', 64, 'unit_summary', 'Corner flat with a view.',
    'min_nights', 2),
    'e1230000-0000-4000-8000-00000000000a')
$$, 'And the unit''s pin, times, amenities, beds, size, summary and minimum nights.');

select throws_ok($$
  select public.rpc_property_upsert('e1210000-0000-4000-8000-00000000000a', jsonb_build_object(
    'name', 'Block 120', 'house_rules', repeat('x', 2001)), 'e1220000-0000-4000-8000-00000000000a')
$$, '22023', null, 'House rules over 2000 characters are refused.');
select throws_ok($$
  select public.rpc_property_upsert('e1210000-0000-4000-8000-00000000000a', jsonb_build_object(
    'name', 'Block 120', 'lat', 120, 'lng', 36.7), 'e1220000-0000-4000-8000-00000000000a')
$$, '22023', null, 'A pin off the globe is refused.');
select throws_ok($$
  select public.rpc_unit_upsert_guarded('e1210000-0000-4000-8000-00000000000a',
    jsonb_build_object('name', 'A', 'min_nights', 0), 'e1230000-0000-4000-8000-00000000000a')
$$, '22023', null, 'Minimum nights below one is refused.');
reset role;

select is((select amenities from public.property where id = 'e1220000-0000-4000-8000-00000000000a'),
  array['Wi-Fi', 'Swimming pool', 'Rooftop braai'],
  'Amenities are trimmed, de-duplicated ignoring case, and keep their order.');
select is((select neighbourhood_note from public.property where id = 'e1220000-0000-4000-8000-00000000000a'),
  'Quiet street off Argwings Kodhek.', 'Text is trimmed.');
select is((select house_rules from public.property where id = 'e1220000-0000-4000-8000-00000000000a'),
  'No parties. Quiet after 22:00.', 'A refused save changes nothing.');
select is((select min_nights || ' ' || size_sqm || ' ' || bed_setup from public.unit
            where id = 'e1230000-0000-4000-8000-00000000000a'),
  '2 64 1 queen bed', 'Unit fields are written.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_property_upsert('e1210000-0000-4000-8000-00000000000a',
  jsonb_build_object('name', 'Block 120', 'neighbourhood_note', ''), 'e1220000-0000-4000-8000-00000000000a');
reset role;
select is((select neighbourhood_note is null and house_rules is not null from public.property
            where id = 'e1220000-0000-4000-8000-00000000000a'), true,
  'An empty value clears a field; a field left out keeps its value.');

-- ══════════════════════════════════════════ 3. the switch

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_unit_set_published('e1230000-0000-4000-8000-00000000000a', true) $$,
  '42501', null, 'Someone outside the host cannot publish its unit.');
select is((select count(*)::int from public.rpc_host_listing_checklist('e1210000-0000-4000-8000-00000000000a')), 0,
  'Nor read its checklist.');

select set_config('request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_like($$ select public.rpc_unit_set_published('e1230000-0000-4000-8000-00000000000b', true) $$,
  '%A nightly rate%', 'Publishing an unready unit is refused, and says what is missing.');
insert into t (k, v) select 'missing', missing::text
  from public.rpc_host_listing_checklist('e1210000-0000-4000-8000-00000000000a')
 where unit_id = 'e1230000-0000-4000-8000-00000000000b';
insert into t (k, v) select 'publish', public.rpc_unit_set_published('e1230000-0000-4000-8000-00000000000a', true)::text;
reset role;

select is((select v from t where k = 'missing'), '{"A nightly rate"}',
  'The checklist lists what B still needs (the property photo counts for it).');
select is((select listed from public.unit where id = 'e1230000-0000-4000-8000-00000000000b'), false,
  'The refused unit stays off the site.');
select is((select (v::jsonb ->> 'published') || '/' || (v::jsonb ->> 'listed') || '/' || (v::jsonb ->> 'missing')
             from t where k = 'publish'), 'true/true/[]',
  'Publishing a ready unit lists it at once.');
select is((select listed from public.property where id = 'e1220000-0000-4000-8000-00000000000a'), true,
  'And its property.');

-- ══════════════════════════════════════════ 4. what guests see

select has_column('public', 'property_public', 'latitude', 'property_public has latitude.');
select has_column('public', 'property_public', 'longitude', 'property_public has longitude.');
select has_column('public', 'property_public', 'house_rules', 'property_public has house_rules.');
select has_column('public', 'property_public', 'cancellation_policy', 'property_public has cancellation_policy.');
select has_column('public', 'property_unit_public', 'latitude', 'property_unit_public has latitude.');
select has_column('public', 'property_unit_public', 'longitude', 'property_unit_public has longitude.');
select has_column('public', 'property_unit_public', 'checkin_time', 'property_unit_public has checkin_time.');
select has_column('public', 'property_unit_public', 'checkout_time', 'property_unit_public has checkout_time.');

select is((select round(latitude::numeric, 4) || ',' || round(longitude::numeric, 4) || ' ' || house_rules
                  || ' ' || cancellation_policy
             from public.property_public where id = 'e1220000-0000-4000-8000-00000000000a'),
  '-1.2921,36.7856 No parties. Quiet after 22:00. Free cancellation up to 5 days before check-in.',
  'property_public shows the exact pin, house rules and cancellation policy.');
select is((select round(latitude::numeric, 5) || ',' || round(longitude::numeric, 5) || ' '
                  || checkin_time || '-' || checkout_time
             from public.property_unit_public where id = 'e1230000-0000-4000-8000-00000000000a'),
  '-1.29215,36.78565 14:00:00-10:30:00',
  'property_unit_public shows the unit''s pin and times.');
select is((select ordinal_position::int from information_schema.columns
            where table_schema = 'public' and table_name = 'property_public' and column_name = 'latitude'),
  (select ordinal_position::int from information_schema.columns
    where table_schema = 'public' and table_name = 'property_public' and column_name = 'is_sample') + 1,
  'The new columns come after the old ones.');

-- ══════════════════════════════════════════ 5. photos

select is(pg_temp.anon_can_read('e1210000-0000-4000-8000-00000000000a/e1230000-0000-4000-8000-00000000000a/a.jpg'), 1,
  'A listed unit''s photo can be read by anyone.');
select is(pg_temp.anon_can_read('e1210000-0000-4000-8000-00000000000a/e1220000-0000-4000-8000-00000000000a/front.jpg'), 1,
  'So can a listed property''s.');
select is(pg_temp.anon_can_read('e1210000-0000-4000-8000-00000000000a/e1230000-0000-4000-8000-00000000000a/spare.jpg'), 0,
  'A file that is not in the gallery stays private.');
select is(authz.host_photo_is_public('not-a-uuid/x.jpg'), false, 'A malformed path is simply not public.');

-- ══════════════════════════════════════════ 6. unpublishing

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into t (k, v) select 'unpublish', public.rpc_unit_set_published('e1230000-0000-4000-8000-00000000000a', false)::text;
reset role;

select is((select v::jsonb ->> 'listed' from t where k = 'unpublish'), 'false', 'Unpublishing unlists the unit.');
select is((select count(*)::int from public.property_unit_public where id = 'e1230000-0000-4000-8000-00000000000a'), 0,
  'Guests no longer see it.');
select is((select count(*)::int from public.property_public where id = 'e1220000-0000-4000-8000-00000000000a'), 0,
  'Nor the property, which has no other listed unit.');
select is(pg_temp.anon_can_read('e1210000-0000-4000-8000-00000000000a/e1230000-0000-4000-8000-00000000000a/a.jpg'), 0,
  'Its photo is private again.');
select is(pg_temp.anon_can_read('e1210000-0000-4000-8000-00000000000a/e1220000-0000-4000-8000-00000000000a/front.jpg'), 0,
  'And the property''s.');

update public.unit set max_guests = 3 where id = 'e1230000-0000-4000-8000-00000000000a';
select is((select listed from public.unit where id = 'e1230000-0000-4000-8000-00000000000a'), false,
  'Editing an unpublished unit does not put it back.');

-- ══════════════════════════════════════════ 7. staff unlisting wins

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_unit_set_published('e1230000-0000-4000-8000-00000000000a', true);
select set_config('request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select public.rpc_property_set_listed('e1220000-0000-4000-8000-00000000000a', false);
select set_config('request.jwt.claims',
  '{"sub":"e1200000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select public.rpc_unit_set_published('e1230000-0000-4000-8000-00000000000a', false);
insert into t (k, v) select 'held', public.rpc_unit_set_published('e1230000-0000-4000-8000-00000000000a', true)::text;
reset role;

select is((select v::jsonb ->> 'held_by_staff' from t where k = 'held'), 'true',
  'Publishing a unit on a property NexG took down says so.');
select is((select listed from public.property where id = 'e1220000-0000-4000-8000-00000000000a'), false,
  'And the host''s switch does not put the property back.');
select is((select count(*)::int from public.property_unit_public where id = 'e1230000-0000-4000-8000-00000000000a'), 0,
  'Guests do not see the unit.');
select is(pg_temp.anon_can_read('e1210000-0000-4000-8000-00000000000a/e1230000-0000-4000-8000-00000000000a/a.jpg'), 0,
  'Nor its photo.');

-- ══════════════════════════════════════════ 8. rows listed before the switch

insert into public.unit (id, host_id, property_id, name, label_public, address_line, area,
                         city_id, handoff, status, listed, bedrooms, max_guests, nightly_rate_kes)
values ('e1230000-0000-4000-8000-00000000000c','e1210000-0000-4000-8000-00000000000a',
        'e1220000-0000-4000-8000-00000000000a','C','C','[Address]','Kilimani',
        (select id from public.city where slug = 'nairobi'),'lockbox','live', true, 1, 2, 5000);
update public.unit set bedrooms = 2 where id = 'e1230000-0000-4000-8000-00000000000c';
select is((select listed and host_published from public.unit where id = 'e1230000-0000-4000-8000-00000000000c'), true,
  'A unit listed directly keeps its listing and counts as published.');

select is(
  (select count(*)::int from public.fn_wiring_check()
    where severity = 'critical'
      and finding ilike any (array['%rpc_unit_set_published%', '%rpc_host_listing_checklist%',
        '%rpc_property_upsert%', '%rpc_unit_upsert_guarded%', '%fn_listing_sync%',
        '%fn_unit_listing_missing%', '%fn_host_amenity_labels%', '%fn_host_listing_%'])),
  0,
  'The wiring check is clean.');

select * from finish();
rollback;
