-- Offerings follow their catalogue section, and a CSV import saves many
-- offerings at once through the editor's own save (20261218000200).
begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-4000-8000-0000000000a1',
   'authenticated', 'authenticated', 'import.owner@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '72000000-0000-4000-8000-0000000000a2',
   'authenticated', 'authenticated', 'import.stranger@example.test', '', now(), now(), now());

-- Application commands check that the signed-in session still exists.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('72000000-0000-4000-8000-0000000000e1', '72000000-0000-4000-8000-0000000000a1', now(), now()),
  ('72000000-0000-4000-8000-0000000000e2', '72000000-0000-4000-8000-0000000000a2', now(), now());

insert into public.merchant (
  id, legal_name, trading_name, category, subcategory, contact_name, contact_phone,
  contact_email, city_id, status
)
select '72000000-0000-4000-8000-0000000000c1', 'Import Studio Ltd', 'Import Studio', 'beauty',
       'makeup', 'Amina Kariuki', '+254700000772', 'import.studio@example.test', c.id,
       'under_review'
from public.city c where c.slug = 'nairobi';

insert into public.merchant_user (merchant_id, user_id, role)
values ('72000000-0000-4000-8000-0000000000c1', '72000000-0000-4000-8000-0000000000a1', 'owner');

insert into public.merchant_application (
  merchant_id, revision, payload, review_state, submitted_revision, submitted_at
)
values (
  '72000000-0000-4000-8000-0000000000c1', 1,
  jsonb_build_object(
    'business', jsonb_build_object(
      'name', 'Import Studio', 'firstName', 'Amina', 'lastName', 'Kariuki',
      'phone', '+254700000772', 'email', 'import.studio@example.test'),
    'categoryId', 'beauty',
    'subcategories', jsonb_build_array('makeup')),
  'pending', 1, now()
);

/* An offering as the editor saves it. */
create function pg_temp.offering(p_id uuid, p_name text, p_section text, p_version integer)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'profileId', 'makeup', 'schemaId', 'SERVICE_APPOINTMENT_V1',
    'name', p_name, 'description', 'Full face for an evening event.',
    'price', '2500', 'priceMode', 'fixed', 'unit', 'appointment',
    'publication', 'draft', 'version', p_version, 'fields', '{}'::jsonb,
    'attributes', '{}'::jsonb, 'resources', '[]'::jsonb, 'availabilityLinked', false,
    'sources', jsonb_build_object('details', 'nexg', 'price', 'nexg', 'availability', 'nexg'),
    'sync', 'current', 'updatedAt', '', 'history', '[]'::jsonb, 'variants', '[]'::jsonb)
  || case when p_section is null then '{}'::jsonb else jsonb_build_object('section', p_section) end;
$$;

create function pg_temp.section_of(p_item uuid)
returns text language sql as $$
  select s.name from public.catalogue_item i
  join public.catalogue_section s on s.id = i.section_id where i.id = p_item;
$$;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"72000000-0000-4000-8000-0000000000a1","role":"authenticated","session_id":"72000000-0000-4000-8000-0000000000e1"}';

-- ---------------------------------------------- the editor's section field

select lives_ok(
  $$select public.rpc_merchant_setup_offering_save('72000000-0000-4000-8000-0000000000c1',
      pg_temp.offering('72000000-0000-4000-8000-000000000101', 'Evening glam', 'Bridal', 0))$$,
  'an offering saves with a catalogue section'
);

select is(pg_temp.section_of('72000000-0000-4000-8000-000000000101'), 'Bridal',
  'and its catalogue item sits in that section');

select lives_ok(
  $$select public.rpc_merchant_setup_offering_save('72000000-0000-4000-8000-0000000000c1',
      pg_temp.offering('72000000-0000-4000-8000-000000000102', 'Trial run', '  bridal ', 0))$$,
  'a second offering names the same section differently'
);

select is(
  (select count(*)::int from public.catalogue_section
   where merchant_id = '72000000-0000-4000-8000-0000000000c1' and lower(name) = 'bridal'),
  1,
  'and joins it rather than making another'
);

select lives_ok(
  $$select public.rpc_merchant_setup_offering_save('72000000-0000-4000-8000-0000000000c1',
      pg_temp.offering('72000000-0000-4000-8000-000000000101', 'Evening glam', 'Events', 1))$$,
  'changing the section in the editor saves'
);

select is(pg_temp.section_of('72000000-0000-4000-8000-000000000101'), 'Events',
  'and moves the offering to the new section');

select lives_ok(
  $$select public.rpc_merchant_setup_offering_save('72000000-0000-4000-8000-0000000000c1',
      pg_temp.offering('72000000-0000-4000-8000-000000000101', 'Evening glam', '', 2))$$,
  'saving with the section cleared'
);

select is(pg_temp.section_of('72000000-0000-4000-8000-000000000101'), 'Events',
  'leaves the offering where it was');

select lives_ok(
  $$select public.rpc_merchant_setup_offering_save('72000000-0000-4000-8000-0000000000c1',
      pg_temp.offering('72000000-0000-4000-8000-000000000103', 'Lashes', null, 0))$$,
  'a new offering with no section saves'
);

select is(pg_temp.section_of('72000000-0000-4000-8000-000000000103'), 'Setup offerings',
  'into Setup offerings, as before');

select throws_ok(
  $$select public.rpc_merchant_setup_offering_save('72000000-0000-4000-8000-0000000000c1',
      pg_temp.offering('72000000-0000-4000-8000-000000000104', 'Too long', repeat('x', 81), 0))$$,
  '22023',
  'Check the offering details and selected activity.',
  'a section longer than 80 characters is refused'
);

-- ------------------------------------------------------------------ import

-- Publish offering 101 the way the Publish button does.
update public.catalogue_item set available = true
where id = '72000000-0000-4000-8000-000000000101';

select is(
  public.rpc_merchant_setup_offerings_import('72000000-0000-4000-8000-0000000000c1',
    jsonb_build_array(
      jsonb_build_object('data', pg_temp.offering('72000000-0000-4000-8000-000000000201', 'Braids', 'Hair', 0)),
      jsonb_build_object('data', pg_temp.offering('72000000-0000-4000-8000-000000000202', 'Cornrows', 'Hair', 0),
                         'publish', true),
      jsonb_build_object('data', pg_temp.offering('72000000-0000-4000-8000-000000000101', 'Evening glam', 'Events', 3)))),
  '{"created": 2, "updated": 1, "published": 1, "unpublished": 0}'::jsonb,
  'an import adds two offerings, publishes one, and updates a third'
);

select is(
  (select count(*)::int from public.catalogue_item i
   join public.catalogue_section s on s.id = i.section_id
   where i.merchant_id = '72000000-0000-4000-8000-0000000000c1' and s.name = 'Hair'),
  2,
  'imported offerings are in the section their rows name'
);

select is(
  (select count(*)::int
   from jsonb_array_elements(public.rpc_merchant_setup_offerings('72000000-0000-4000-8000-0000000000c1')) o
   where o ->> 'id' in ('72000000-0000-4000-8000-000000000201', '72000000-0000-4000-8000-000000000202')
     and o ->> 'section' = 'Hair'),
  2,
  'and each is an offering the editor loads, with its section'
);

select results_eq(
  $$select id::text, available from public.catalogue_item
    where id in ('72000000-0000-4000-8000-000000000101', '72000000-0000-4000-8000-000000000201',
                 '72000000-0000-4000-8000-000000000202')
    order by id$$,
  $$values ('72000000-0000-4000-8000-000000000101', true),
           ('72000000-0000-4000-8000-000000000201', false),
           ('72000000-0000-4000-8000-000000000202', true)$$,
  'a published offering stays published, a new one is a draft unless the row publishes it'
);

select is(
  public.rpc_merchant_setup_offerings_import('72000000-0000-4000-8000-0000000000c1',
    jsonb_build_array(
      jsonb_build_object('data', pg_temp.offering('72000000-0000-4000-8000-000000000101', 'Evening glam', 'Events', 4),
                         'publish', false))),
  '{"created": 0, "updated": 1, "published": 0, "unpublished": 1}'::jsonb,
  'a row can unpublish an offering'
);

select is(
  (select available from public.catalogue_item where id = '72000000-0000-4000-8000-000000000101'),
  false,
  'which guests then no longer see'
);

select throws_ok(
  $$select public.rpc_merchant_setup_offerings_import('72000000-0000-4000-8000-0000000000c1',
      jsonb_build_array(
        jsonb_build_object('data', pg_temp.offering('72000000-0000-4000-8000-000000000203', 'Wash', 'Hair', 0)),
        jsonb_build_object('data', pg_temp.offering('72000000-0000-4000-8000-000000000201', 'Braids', 'Hair', 0))))$$,
  '40001',
  'This offering changed in another session. Reload it before saving.',
  'a stale row stops the import'
);

select is(
  (select count(*)::int from public.catalogue_item where id = '72000000-0000-4000-8000-000000000203'),
  0,
  'and nothing from that file is kept'
);

select throws_ok(
  $$select public.rpc_merchant_setup_offerings_import('72000000-0000-4000-8000-0000000000c1',
      (select jsonb_agg(jsonb_build_object('data',
         pg_temp.offering(gen_random_uuid(), 'Row ' || n, 'Bulk', 0)))
       from generate_series(1, 501) n))$$,
  '22023',
  'Import from 1 to 500 offerings at a time.',
  'a file of more than 500 offerings is refused'
);

reset role;

select is(
  (select e.after from audit.audit_event e
   where e.action = 'merchant.offerings_imported'
     and e.target_id = '72000000-0000-4000-8000-0000000000c1'
   order by e.id limit 1),
  '{"created": 2, "updated": 1, "published": 1, "unpublished": 0}'::jsonb,
  'the import is in the audit trail with what it did'
);

select is(
  (select count(*)::int from audit.audit_event e
   where e.action = 'audit.unknown_action'
     and (e.after ->> 'event_id')::bigint in (
       select x.id from audit.audit_event x
       where x.target_id in ('72000000-0000-4000-8000-0000000000c1',
                             '72000000-0000-4000-8000-000000000101',
                             '72000000-0000-4000-8000-000000000201'))),
  0,
  'offering saves and imports are registered actions, not unknown ones'
);

select is(
  (select count(*)::int from audit.action_registry
   where module = 'merchants' and action in (
     'merchant.application_started', 'merchant.application_saved',
     'merchant.application_submitted', 'merchant.application_reviewed',
     'merchant.agreement_accepted', 'merchant.payout_declared',
     'merchant.setup_location_saved', 'merchant.setup_offering_adopted',
     'merchant.setup_offering_saved', 'merchant.offerings_imported')),
  10,
  'the merchant application and setup actions are registered under Merchants'
);

-- ------------------------------------------------------- someone else's

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"72000000-0000-4000-8000-0000000000a2","role":"authenticated","session_id":"72000000-0000-4000-8000-0000000000e2"}';

select throws_ok(
  $$select public.rpc_merchant_setup_offerings_import('72000000-0000-4000-8000-0000000000c1',
      jsonb_build_array(jsonb_build_object('data',
        pg_temp.offering('72000000-0000-4000-8000-000000000204', 'Intruder', 'Hair', 0))))$$,
  '42501',
  'Setup access is required.',
  'nobody else can import into the workspace'
);

reset role;

select * from finish();
rollback;
