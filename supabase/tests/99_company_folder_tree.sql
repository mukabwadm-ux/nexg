-- Company files: the twelve folders, folders inside them, and the rules.
--
-- The twelve folders exist in order with their sub-folders; staff with
-- Company access add folders inside a folder and rename any of them; a
-- sub-folder holds files, not folders; names are unique within a folder;
-- a folder that still holds folders or files cannot be deleted; and the
-- folder view counts a folder's sub-folders and their files.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('99f00000-0000-4000-8000-0000000000a1'::uuid, 'co.ops.tree@test.local'),
  ('99f00000-0000-4000-8000-0000000000a2'::uuid, 'co.legal.tree@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('99f00000-0000-4000-8000-0000000000b1', '99f00000-0000-4000-8000-0000000000a1', 'co.ops.tree@test.local', 'Ops Tree'),
  ('99f00000-0000-4000-8000-0000000000b2', '99f00000-0000-4000-8000-0000000000a2', 'co.legal.tree@test.local', 'Legal Tree');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a'
from (values
  ('99f00000-0000-4000-8000-0000000000b1'::uuid, 'ops_manager'),
  ('99f00000-0000-4000-8000-0000000000b2'::uuid, 'legal')
) as g (staff_id, role_key)
join public.role r on r.key = g.role_key;

-- ----------------------------------------------------------- the twelve

select is(
  (select array_agg(name order by sort, name) from public.company_folder
    where parent_id is null and sort < 1000 and area is null),
  array['Corporate and Legal', 'Human Resource', 'Finance and Accounting', 'Merchants and Partners',
        'NexG Stays and Hosts', 'Operations and Logistics', 'Sales and Management',
        'Technology and Product', 'Customer Support and Compliance', 'Management and Strategy',
        'Procurement and Company Assets', 'Templates and Forms'],
  'The twelve folders exist, in the order they were listed');

select is(
  (select array_agg(s.name order by s.sort) from public.company_folder s
     join public.company_folder p on p.id = s.parent_id
    where p.name = 'Corporate and Legal'),
  array['Company registration', 'Licenses & permits', 'Legal agreements', 'Corporate governance'],
  'Corporate and Legal holds its four folders, in order');

select is(
  (select count(*)::int from public.company_folder s
     join public.company_folder p on p.id = s.parent_id and p.sort < 1000 and p.area is null),
  47,
  'All 47 folders inside the twelve are there');

select is(
  (select array_agg(s.name order by s.sort) from public.company_folder s
     join public.company_folder p on p.id = s.parent_id
    where p.name = 'Management and Strategy'),
  array['Management meetings', 'Performance reports', 'Investor documents'],
  'Management and Strategy holds its three');

insert into t (k, v) values
  ('legal', (select id::text from public.company_folder where parent_id is null and name = 'Corporate and Legal')),
  ('hr', (select id::text from public.company_folder where parent_id is null and name = 'Human Resource')),
  ('registration', (select s.id::text from public.company_folder s
                      join public.company_folder p on p.id = s.parent_id
                     where p.name = 'Corporate and Legal' and s.name = 'Company registration'));

-- --------------------------------------------------------------- rules

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99f00000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$insert into t (k, v) select 'tenders', public.rpc_company_folder_save(
      'Tenders', null, null, (select v::uuid from t where k = 'legal'))::text$$,
  'Staff with Company access add a folder inside a folder');

select is(
  (select parent_id from public.company_folder where id = (select v::uuid from t where k = 'tenders')),
  (select v::uuid from t where k = 'legal'),
  'It sits inside the folder it was added to');

select is(
  (select sort from public.company_folder where id = (select v::uuid from t where k = 'tenders')),
  50,
  'and goes after the folders already there');

select throws_ok(
  $$select public.rpc_company_folder_save('Too deep', null, null, (select v::uuid from t where k = 'registration'))$$,
  '22023', 'A sub-folder holds files, not folders.',
  'A folder inside a folder cannot hold folders');

select throws_ok(
  $$select public.rpc_company_folder_save('company REGISTRATION', null, null, (select v::uuid from t where k = 'legal'))$$,
  '23505', 'There is already a folder called "company REGISTRATION" here.',
  'Names are unique within a folder, whatever the case');

select lives_ok(
  $$insert into t (k, v) select 'hr_tenders', public.rpc_company_folder_save(
      'Tenders', null, null, (select v::uuid from t where k = 'hr'))::text$$,
  'The same name can be used in another folder');

select lives_ok(
  $$select public.rpc_company_folder_save('Company registration & CR12', null,
      (select v::uuid from t where k = 'registration'))$$,
  'A folder inside a folder can be renamed');

select is(
  (select name || ' · ' || (parent_id = (select v::uuid from t where k = 'legal'))::text
     from public.company_folder where id = (select v::uuid from t where k = 'registration')),
  'Company registration & CR12 · true',
  'Renaming keeps it where it is');

select lives_ok(
  $$select public.rpc_company_folder_save('Corporate, Legal and Governance', null,
      (select v::uuid from t where k = 'legal'))$$,
  'A top-level folder can be renamed');

select throws_ok(
  $$select public.rpc_company_folder_save('', null, (select v::uuid from t where k = 'legal'))$$,
  '22023', 'Give the folder a name.',
  'A folder needs a name');

select throws_ok(
  $$select public.rpc_company_folder_delete((select v::uuid from t where k = 'legal'))$$,
  '23503', 'Delete the folders inside "Corporate, Legal and Governance" first.',
  'A folder that holds folders cannot be deleted');

select lives_ok(
  $$select public.rpc_company_folder_delete((select v::uuid from t where k = 'tenders'))$$,
  'An empty folder inside a folder can be deleted');

select is(
  (select count(*)::int from public.company_folder where id = (select v::uuid from t where k = 'tenders')),
  0,
  'and is gone');

select lives_ok(
  $$insert into t (k, v) select 'top', public.rpc_company_folder_save('Board papers')::text$$,
  'A new top-level folder still works the old way');

select is(
  (select parent_id is null and sort = (select max(sort) from public.company_folder where parent_id is null and sort < 1000 and id <> (select v::uuid from t where k = 'top')) + 10 from public.company_folder where id = (select v::uuid from t where k = 'top')),
  true,
  'and goes after the top-level folders');

-- ------------------------------------------------------- reading and access

reset role;

insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
  ('company-files', '99f00000-0000-4000-8000-0000000000a1/tree/CR12.pdf',
   '99f00000-0000-4000-8000-0000000000a1', '99f00000-0000-4000-8000-0000000000a1',
   '{"size": 120000, "mimetype": "application/pdf"}');
insert into public.company_file (folder_id, name, storage_path, mime_type, size_bytes, owner_id)
values ((select v::uuid from t where k = 'registration'), 'CR12.pdf',
        '99f00000-0000-4000-8000-0000000000a1/tree/CR12.pdf', 'application/pdf', 120000,
        '99f00000-0000-4000-8000-0000000000b1');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99f00000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  (select jsonb_build_object('subs', sub_count, 'here', file_count, 'all', all_file_count, 'bytes', all_bytes)
     from public.company_folder_v where id = (select v::uuid from t where k = 'legal')),
  '{"subs": 4, "here": 0, "all": 1, "bytes": 120000}'::jsonb,
  'The folder view counts a folder''s sub-folders and the files in them');

select throws_ok(
  $$select public.rpc_company_folder_delete((select v::uuid from t where k = 'registration'))$$,
  '23503', 'Move or delete the files in "Company registration & CR12" first.',
  'A folder with files in it cannot be deleted');

select set_config('request.jwt.claims',
  '{"sub":"99f00000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_company_folder_save('Sneaky', null, null, (select v::uuid from t where k = 'legal'))$$,
  '42501', 'You can see Company but not change it.',
  'People who can only view Company cannot add folders');

reset role;

select throws_ok(
  $$insert into public.company_folder (name, parent_id) values ('Direct', (select v::uuid from t where k = 'registration'))$$,
  '23514', 'A sub-folder holds files, not folders.',
  'The one-level rule holds for direct writes too');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ilike '%company_folder%'),
  0,
  'The wiring check finds nothing wrong with the folder functions');

select * from finish();
rollback;
