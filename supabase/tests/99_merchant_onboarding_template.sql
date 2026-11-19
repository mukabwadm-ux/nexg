-- Merchant onboarding follows the owner's template: the fields each category
-- is asked, how answers are checked, the submit check, and the documents the
-- template adds or changes.

begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;
create function pg_temp.keys(p jsonb) returns text[] language sql immutable as $f$
  select coalesce(array_agg(x.value ->> 'key' order by x.value ->> 'key'), '{}') from jsonb_array_elements(p) x
$f$;
create function pg_temp.docs(p_merchant uuid) returns text[] language sql as $f$
  select coalesce(array_agg(kind order by kind), '{}') from public.fn_merchant_required_docs(p_merchant)
$f$;

-- ------------------------------------------------------------------ catalogue

select is(
  (select count(distinct c) from public.merchant_onboarding_field, unnest(categories) c),
  17::bigint,
  'the 17 template addenda that map to a NexG category each have fields');

select ok(
  (select bool_and(exists (select 1 from public.category_config cc where cc.category = c))
   from (select distinct unnest(categories) c from public.merchant_onboarding_field) x),
  'every category the template names is a real category');

select ok(
  not exists (select 1 from public.merchant_onboarding_field f
              where f.required = 'conditional' and not exists (
                select 1 from public.merchant_onboarding_field t
                where t.key = f.required_when ->> 'field' and t.type = 'yes_no'
                  and t.categories is not distinct from f.categories)),
  'every conditional field hangs off a yes/no question in the same category');

select ok(
  not exists (select 1 from public.merchant_onboarding_field f
              where f.requires_doc is not null and not exists (
                select 1 from public.document_requirement d
                where d.owner_type = 'merchant' and d.kind = f.requires_doc and d.required)),
  'every document a question calls for is a required merchant document');

-- ------------------------------------------------------------------ people

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), now(), now()
from (values
  ('0e710000-0000-4000-8000-0000000000a1'::uuid, 'owner.template@test.local'),
  ('0e710000-0000-4000-8000-0000000000a2'::uuid, 'stranger.template@test.local'),
  ('0e710000-0000-4000-8000-0000000000a3'::uuid, 'ops.template@test.local'),
  ('0e710000-0000-4000-8000-0000000000a4'::uuid, 'owner2.template@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('0e710000-0000-4000-8000-0000000000b1', '0e710000-0000-4000-8000-0000000000a3', 'ops.template@test.local', 'Template Ops');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select '0e710000-0000-4000-8000-0000000000b1', r.id, null,
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from public.role r where r.key = 'merchant_ops';

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, status)
values
  ('0e710000-0000-4000-8000-0000000000c1', 'Template Transfers Ltd', 'Template Transfers', 'airport_transfers',
   'Owner', '+254712000711', 'transfers.template@shop.example', 'applied'),
  ('0e710000-0000-4000-8000-0000000000c2', 'Template Spa Ltd', 'Template Spa', 'wellness',
   'Owner', '+254712000712', 'spa.template@shop.example', 'applied'),
  ('0e710000-0000-4000-8000-0000000000c3', 'Template Grocer Ltd', 'Template Grocer', 'groceries_essentials',
   'Owner', '+254712000713', 'grocer.template@shop.example', 'applied');

insert into public.merchant_user (merchant_id, user_id, role) values
  ('0e710000-0000-4000-8000-0000000000c1', '0e710000-0000-4000-8000-0000000000a1', 'owner'),
  ('0e710000-0000-4000-8000-0000000000c2', '0e710000-0000-4000-8000-0000000000a4', 'owner');

set local session_replication_role = replica;
insert into public.merchant_application (merchant_id, revision, payload, review_state)
values ('0e710000-0000-4000-8000-0000000000c1', 1, '{"categoryId": "airport_transfers"}', 'draft');
set local session_replication_role = origin;

-- ------------------------------------------------------------------ reading

set local role authenticated;
select pg_temp.as_user('0e710000-0000-4000-8000-0000000000a2');

select ok(
  pg_temp.keys(public.rpc_merchant_onboarding_read(null, 'airport_transfers') -> 'fields')
    @> array['at_drivers', 'at_vehicles', 'business_type', 'county', 'owner_id_number', 'policies_acknowledged'],
  'before saving, a category''s fields come with the common ones');
select ok(
  not (pg_temp.keys(public.rpc_merchant_onboarding_read(null, 'games_sports') -> 'fields') && array['at_vehicles']),
  'a category with no addendum gets the common fields only');
select throws_ok(
  $$ select public.rpc_merchant_onboarding_read('0e710000-0000-4000-8000-0000000000c1', null) $$,
  '42501', null, 'someone else''s merchant is refused');

select pg_temp.as_user('0e710000-0000-4000-8000-0000000000a1');
select is(public.rpc_merchant_onboarding_read('0e710000-0000-4000-8000-0000000000c1', null) ->> 'category',
  'airport_transfers', 'the owner reads their application''s category');

-- ------------------------------------------------------------------ saving

select throws_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c1', '{"gr_permit_number": "CP-1234"}') $$,
  '22023', null, 'a field from another category is refused');
select throws_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c1', '{"owner_id_number": "12-34"}') $$,
  '22023', null, 'an ID number in the wrong format is refused');
select throws_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c1', '{"county": "Atlantis"}') $$,
  '22023', null, 'a county that is not on the list is refused');
select throws_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c1',
       '{"at_vehicles": [{"registration": "KDA 123A", "make_model_seats": "Toyota Noah, 7 seats",
         "psv_licence_number": "PSV-1", "psv_licence_expiry": "2020-01-01",
         "insurance_policy_number": "POL-1", "insurance_expiry": "2099-01-01",
         "roadworthiness_number": "RW-1", "roadworthiness_expiry": "2099-01-01"}]}') $$,
  '22023', 'Vehicles: row 1: PSV licence expiry has passed; renew it before you continue.',
  'an expired PSV licence is refused, naming the row');
select throws_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c1',
       '{"at_drivers": [{"full_name": "Jane Driver"}]}') $$,
  '22023', null, 'a driver row missing a column is refused');

select lives_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c1',
       '{"business_type": "limited_company", "county": "Nairobi", "owner_id_number": "12345678",
         "policies_acknowledged": "no",
         "at_vehicles": [{"registration": "KDA 123A", "make_model_seats": "Toyota Noah, 7 seats",
           "psv_licence_number": "PSV-1", "psv_licence_expiry": "2099-01-01",
           "insurance_policy_number": "POL-1", "insurance_expiry": "2099-01-01",
           "roadworthiness_number": "RW-1", "roadworthiness_expiry": "2099-01-01"}],
         "at_drivers": [{"full_name": "Jane Driver", "licence": "DL1234567 BCE", "psv_badge": "PSV-B-77"}]}') $$,
  'valid answers save');

select is(
  pg_temp.keys(public.rpc_merchant_onboarding_read('0e710000-0000-4000-8000-0000000000c1', null) -> 'missing'),
  array['policies_acknowledged', 'registration_number'],
  'a confirmation answered No is still missing, and so is the registration number');

select lives_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c1',
       '{"policies_acknowledged": "yes", "map_pin": ""}') $$,
  'some answers save without touching the others');
select is(
  public.rpc_merchant_onboarding_read('0e710000-0000-4000-8000-0000000000c1', null) #>> '{answers,county}',
  'Nairobi', 'answers not sent are kept');

-- ------------------------------------------------------------------ submit check

reset role;
insert into public.merchant_agreement_acceptance (merchant_id, category, agreement_id, version, accepted_by)
select '0e710000-0000-4000-8000-0000000000c1', 'airport_transfers', a.id, a.version,
       '0e710000-0000-4000-8000-0000000000a1'
from public.fn_merchant_agreement_for_category('airport_transfers') a
where a.id is not null;
-- Since 20270124000100 (approve first) a missing detail no longer blocks
-- submitting; it keeps the merchant from going live instead.
select ok(
  public.fn_merchant_go_live_missing('0e710000-0000-4000-8000-0000000000c1')
    @> '[{"key": "agreement_details"}]'::jsonb,
  'without the registration number, going live still waits for the agreement details');

insert into public.merchant_agreement_party (merchant_id, legal_name, registration_number, kra_pin, address,
  signatory_name, signatory_title, representative_name, representative_title, principal_name)
values ('0e710000-0000-4000-8000-0000000000c1', 'Template Transfers Ltd', 'PVT-AB12CD3', 'P051234567X',
  'Moi Avenue, Nairobi', 'Jane Owner', 'Director', 'Jane Owner', 'Director', 'Jane Owner');

select lives_ok(
  $$ update public.merchant_application set submitted_revision = 1, submitted_at = now(), review_state = 'pending'
     where merchant_id = '0e710000-0000-4000-8000-0000000000c1' $$,
  'with everything in, the application submits');

-- ------------------------------------------------------------------ conditional fields and documents

select is(
  pg_temp.keys(public.fn_merchant_onboarding_missing_for('wellness',
    '{"business_type": "sole_proprietor", "county": "Kisumu", "owner_id_number": "A1234567",
      "policies_acknowledged": "yes", "we_in_person": "no", "we_regulated_practitioner": "no",
      "we_invasive": "no", "we_contraindications": "yes"}')),
  '{}'::text[], 'with every trigger answered No, no conditional field is asked for');
select is(
  pg_temp.keys(public.fn_merchant_onboarding_missing_for('wellness',
    '{"business_type": "sole_proprietor", "county": "Kisumu", "owner_id_number": "A1234567",
      "policies_acknowledged": "yes", "we_in_person": "yes", "we_regulated_practitioner": "no",
      "we_invasive": "yes", "we_contraindications": "yes"}')),
  array['we_liability_policy', 'we_permit_number'],
  'answering Yes makes the fields that hang off it required');
select is(
  pg_temp.keys(public.fn_merchant_onboarding_missing_for('groceries_essentials',
    '{"business_type": "sole_proprietor", "county": "Kisumu", "owner_id_number": "A1234567",
      "policies_acknowledged": "yes", "gr_permit_number": "CP 1234", "gr_fresh_produce": "yes",
      "gr_fresh_compliance_confirmed": "yes", "gr_substitution_confirmed": "no"}')),
  array['gr_substitution_confirmed'], 'a confirmation must be Yes to count');

select ok(pg_temp.docs('0e710000-0000-4000-8000-0000000000c1')
            @> array['business_registration_cert', 'kra_pin', 'owner_id', 'transfer_compliance_bundle'],
  'every merchant owes the ID copy, KRA PIN and registration certificates; transfers owe their bundle');
select ok(not (pg_temp.docs('0e710000-0000-4000-8000-0000000000c1') && array['business_permit']),
  'airport transfers do not owe a county permit');
select ok(pg_temp.docs('0e710000-0000-4000-8000-0000000000c3') @> array['business_permit'],
  'groceries always owe the county permit');
select ok(not (pg_temp.docs('0e710000-0000-4000-8000-0000000000c2') && array['business_permit']),
  'wellness owes no permit before saying it works in person');

set local role authenticated;
select pg_temp.as_user('0e710000-0000-4000-8000-0000000000a4');
select lives_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c2', '{"we_in_person": "yes"}') $$,
  'the spa says it works in person');
select ok(pg_temp.docs('0e710000-0000-4000-8000-0000000000c2') @> array['business_permit'],
  'and now owes the county permit, also when read as the owner');
select throws_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c1', '{"county": "Nairobi"}') $$,
  '42501', null, 'one owner cannot write another merchant''s details');

-- ------------------------------------------------------------------ staff

select pg_temp.as_user('0e710000-0000-4000-8000-0000000000a3');
select is(
  public.rpc_merchant_onboarding_read('0e710000-0000-4000-8000-0000000000c1', null) #>> '{answers,at_drivers,0,psv_badge}',
  'PSV-B-77', 'merchant ops read the answers when reviewing');
select is(
  jsonb_array_length(public.rpc_merchant_onboarding_read('0e710000-0000-4000-8000-0000000000c1', null) -> 'missing'),
  0, 'and see nothing missing');
select throws_ok(
  $$ select public.rpc_merchant_onboarding_save('0e710000-0000-4000-8000-0000000000c1', '{"county": "Kisumu"}') $$,
  '42501', null, 'staff read but do not write the merchant''s answers');

reset role;
select ok(
  exists (select 1 from audit.audit_event e where e.action = 'merchant.onboarding_details_saved'
          and e.target_id = '0e710000-0000-4000-8000-0000000000c1'
          and not (e.after::text like '%12345678%')),
  'saves are audited by field name, without the values');

select * from finish();
rollback;
