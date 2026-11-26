-- The NexG Data Processing Agreement in onboarding (20270327000100).
--
-- The owner reads and accepts the current DPA once its agreement details
-- are saved; the acceptance records who, when, the address and device, and
-- the details the DPA is filled with; merchant staff sign it once, with
-- NexG's signatory, as they do the merchant agreement; the merchant's members
-- and its staff read it; going
-- live waits for it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- ------------------------------------------------------------------ fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('9d000000-0000-4000-8000-0000000000a1'::uuid, 'owner9d@test.local'),
  ('9d000000-0000-4000-8000-0000000000a2'::uuid, 'ops9d@test.local'),
  ('9d000000-0000-4000-8000-0000000000a5'::uuid, 'stranger9d@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('9d000000-0000-4000-8000-0000000000b2', '9d000000-0000-4000-8000-0000000000a2', 'ops9d@test.local', 'Ops 9d');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select '9d000000-0000-4000-8000-0000000000b2', r.id, null, '00000000-0000-4000-8000-00000000000a'
from public.role r where r.key = 'merchant_ops';

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id)
values ('9d000000-0000-4000-8000-0000000000c1', 'Afya Pharmacy Limited', 'Afya Pharmacy', 'pharmacy',
  'Achieng Owner', '+254712990002', 'afya9d@test.local',
  (select id from public.city where slug = 'nairobi'));

insert into public.merchant_user (merchant_id, user_id, role)
values ('9d000000-0000-4000-8000-0000000000c1', '9d000000-0000-4000-8000-0000000000a1', 'owner');

/* What NexG's server would have uploaded. */
insert into storage.objects (bucket_id, name, metadata)
select 'merchant-agreements', 'dpa/9d000000-0000-4000-8000-0000000000c1/' || v.f || '.pdf',
       '{"size": 52000, "mimetype": "application/pdf"}'
from (values ('9d000000-0000-4000-8000-0000000000f1'), ('9d000000-0000-4000-8000-0000000000f2')) v (f);

-- ------------------------------------------------------------------ wiring

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('merchant_dpa_version', 'merchant_dpa_acceptance')
      and c.relrowsecurity),
  2,
  'both DPA tables have row-level security');

select is(
  (public.fn_merchant_dpa_current_version()).version,
  '2026-11-25+acd3d3e54ac5',
  'the current DPA is the version the code publishes');

select results_eq(
  $$select action collate "C", module, default_severity::text from audit.action_registry
    where action in ('merchant.dpa_accepted', 'merchant.dpa_copy_stored') order by 1$$,
  $$values ('merchant.dpa_accepted' collate "C", 'merchants', 'notice'),
           ('merchant.dpa_copy_stored', 'merchants', 'info')$$,
  'both DPA actions are registered');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ilike '%dpa%'),
  0,
  'the wiring check finds nothing wrong with the DPA');

select ok(
  (select prosrc from pg_proc where proname = 'fn_merchant_go_live_missing') ilike '%merchant_dpa_acceptance%',
  'going live waits for the current DPA');

-- ------------------------------------------------------------------ the owner

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9d000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.headers',
  '{"x-nexg-client-ip":"198.51.100.7","x-nexg-client-ua":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0","x-nexg-surface":"web"}',
  true);

select is(
  (select jsonb_build_object('accepted', r -> 'accepted', 'party_ready', r -> 'party_ready',
     'can_accept', r -> 'can_accept', 'dpo_email', r #> '{suggested,dpo_email}')
   from public.rpc_merchant_dpa_read('9d000000-0000-4000-8000-0000000000c1') r),
  '{"accepted": false, "party_ready": false, "can_accept": true, "dpo_email": "afya9d@test.local"}'::jsonb,
  'the owner sees the DPA is not accepted yet, with the business email to start Annex 1 from');

select throws_ok(
  $$select public.rpc_merchant_dpa_accept('9d000000-0000-4000-8000-0000000000c1',
    '2026-11-25+acd3d3e54ac5', '{"sensitive_data":"Health data","dpo_name":"Achieng Owner",
    "dpo_email":"dpo@afya.test","dpo_phone":"+254 712 990 002","odpc_registration":""}')$$,
  '55000', 'Save your details for the agreement first: the DPA is filled in with them.',
  'it cannot be accepted before the agreement details it is filled with');

select lives_ok(
  $$select public.rpc_merchant_agreement_details_save('9d000000-0000-4000-8000-0000000000c1',
    '{"legal_name":"Afya Pharmacy Limited","registration_number":"PVT-AFYA9D","kra_pin":"P051234567X",
      "address":"Shop 2, Kimathi Street, Nairobi","signatory_name":"Achieng Owner",
      "signatory_title":"Director","representative_name":"Achieng Owner",
      "representative_title":"Director","principal_name":"Achieng Owner"}')$$,
  'the owner saves the agreement details');

select throws_ok(
  $$select public.rpc_merchant_dpa_accept('9d000000-0000-4000-8000-0000000000c1',
    '2020-01-01+000000000000', '{"sensitive_data":"None","dpo_name":"Achieng Owner",
    "dpo_email":"dpo@afya.test","dpo_phone":"+254 712 990 002"}')$$,
  '40001', 'The data processing agreement has changed. Reload the page and read it again.',
  'only the current version can be accepted');

select throws_ok(
  $$select public.rpc_merchant_dpa_accept('9d000000-0000-4000-8000-0000000000c1',
    '2026-11-25+acd3d3e54ac5', '{"sensitive_data":"None","dpo_name":"Achieng Owner",
    "dpo_email":"not-an-email","dpo_phone":"+254 712 990 002"}')$$,
  '22023', 'Enter a valid email for your compliance contact.',
  'the Annex 1 answers are checked');

select throws_ok(
  $$select public.rpc_merchant_dpa_accept('9d000000-0000-4000-8000-0000000000c1',
    '2026-11-25+acd3d3e54ac5', '{"sensitive_data":"None","legal_name":"Someone Else"}')$$,
  '22023', 'Unknown Annex 1 detail: legal_name.',
  'the names in the DPA come from the saved details, not from the browser');

select is(
  public.rpc_merchant_dpa_accept('9d000000-0000-4000-8000-0000000000c1',
    '2026-11-25+acd3d3e54ac5', '{"sensitive_data":"  Health   data ","dpo_name":"Achieng Owner",
    "dpo_email":" DPO@Afya.test ","dpo_phone":"+254 712 990 002","odpc_registration":""}') -> 'accepted',
  'true'::jsonb,
  'the owner accepts the DPA');

select is(
  public.rpc_merchant_dpa_accept('9d000000-0000-4000-8000-0000000000c1',
    '2026-11-25+acd3d3e54ac5', '{"sensitive_data":"None","dpo_name":"Achieng Owner",
    "dpo_email":"dpo@afya.test","dpo_phone":"+254 712 990 002"}') #>> '{acceptances,0,details,annex,sensitive_data}',
  'Health data',
  'accepting again changes nothing');

select is(
  (select jsonb_build_object('n', jsonb_array_length(r -> 'acceptances'),
     'legal_name', r #>> '{acceptances,0,details,legal_name}',
     'kra', r #>> '{acceptances,0,details,kra_pin}',
     'email', r #>> '{acceptances,0,account_email}',
     'dpo_email', r #>> '{acceptances,0,details,annex,dpo_email}',
     'odpc', r #> '{acceptances,0,details,annex,odpc_registration}',
     'ip', r #> '{acceptances,0,ip}', 'copy', r #> '{acceptances,0,storage_path}')
   from public.rpc_merchant_dpa_read('9d000000-0000-4000-8000-0000000000c1') r),
  '{"n": 1, "legal_name": "Afya Pharmacy Limited", "kra": "P051234567X",
    "email": "owner9d@test.local", "dpo_email": "dpo@afya.test", "odpc": null,
    "ip": null, "copy": null}'::jsonb,
  'one acceptance, filled from the saved details, its address kept from the merchant, no copy yet');

select matches(
  (public.rpc_merchant_dpa_read('9d000000-0000-4000-8000-0000000000c1') #>> '{acceptances,0,reference}'),
  '^NXG-DPA-[A-Z0-9]{12}$',
  'the acceptance has its reference');

select throws_ok(
  $$select count(*) from public.merchant_dpa_acceptance$$,
  '42501', null,
  'the table itself is read through the functions only');

select ok(
  not authz.merchant_dpa_object_writable('dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f3.pdf'),
  'the owner cannot upload a signed DPA');

select throws_ok(
  $$select public.rpc_merchant_dpa_sign_record('9d000000-0000-4000-8000-0000000000c1',
    (public.rpc_merchant_dpa_read('9d000000-0000-4000-8000-0000000000c1') #>> '{acceptances,0,id}')::uuid, gen_random_uuid(),
    'dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f1.pdf', repeat('a', 64), 7, 'dpa-1')$$,
  '42501', 'Merchant staff only.',
  'nor sign it');

-- ------------------------------------------------------------ NexG signs it

reset role;

select is(
  (select count(*)::int from audit.audit_event where action = 'merchant.dpa_accepted'
     and target_id = '9d000000-0000-4000-8000-0000000000c1'),
  1,
  'the acceptance is in the audit trail once');

select results_eq(
  $$select host(ip), device_label, user_agent like 'Mozilla/5.0%' from public.merchant_dpa_acceptance
    where merchant_id = '9d000000-0000-4000-8000-0000000000c1'$$,
  $$values ('198.51.100.7'::text, 'Chrome · Windows'::text, true)$$,
  'the address and device the acceptance came from are recorded');

select set_config('test.dpa_id', (select id::text from public.merchant_dpa_acceptance
  where merchant_id = '9d000000-0000-4000-8000-0000000000c1'), true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9d000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select ok(
  (public.rpc_merchant_dpa_signing_context('9d000000-0000-4000-8000-0000000000c1') -> 'missing')
    ? 'NexG''s signatory and signature are not set up yet (Settings › Agreement signing).',
  'without NexG''s signatory and signature it cannot be signed yet');

reset role;
insert into public.merchant_agreement_signer (id, signatory_name, signatory_title,
  representative_name, representative_title, po_box, registered_office, email, phone, website,
  in_room_commission_pct, signature_path, signature_type, signature_sha256)
values ('9d000000-0000-4000-8000-0000000000e1', 'Amina CEO', 'Director', 'Brian Ops', 'Head of Merchant Operations',
  '12345-00100', 'Studio House, Marcus Garvey Road, Nairobi', 'legal@nexg.test', '+254 700 000 000',
  'www.nexg.test', 10, 'signer/9d000000-0000-4000-8000-0000000000e1.png', 'image/png', repeat('c', 64));

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"9d000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select is(
  (select jsonb_build_object('ready', c -> 'ready', 'address', c #> '{acceptance,details,address}',
     'signer', c #> '{signer,signatory_name}')
   from public.rpc_merchant_dpa_signing_context('9d000000-0000-4000-8000-0000000000c1') c),
  '{"ready": true, "address": "Shop 2, Kimathi Street, Nairobi", "signer": "Amina CEO"}'::jsonb,
  'merchant staff see it is ready, with what it is filled with and NexG''s signatory');

select ok(
  authz.merchant_dpa_object_writable('dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f3.pdf'),
  'merchant staff may upload the signed copy');

select throws_ok(
  $$select public.rpc_merchant_dpa_sign_record('9d000000-0000-4000-8000-0000000000c1', current_setting('test.dpa_id')::uuid, '9d000000-0000-4000-8000-0000000000e1',
    'dpa/9d000000-0000-4000-8000-0000000000c9/9d000000-0000-4000-8000-0000000000f1.pdf',
    repeat('a', 64), 7, 'dpa-1')$$,
  '22023', 'Store the signed DPA in the merchant''s own folder.',
  'a copy in another merchant''s folder is refused');

select throws_ok(
  $$select public.rpc_merchant_dpa_sign_record('9d000000-0000-4000-8000-0000000000c1', current_setting('test.dpa_id')::uuid, '9d000000-0000-4000-8000-0000000000e1',
    'dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f9.pdf', repeat('a', 64), 7, 'dpa-1')$$,
  'P0002', 'The signed DPA did not arrive in storage. Try again.',
  'a copy that is not in storage is refused');

select throws_ok(
  $$select public.rpc_merchant_dpa_sign_record('9d000000-0000-4000-8000-0000000000c1', current_setting('test.dpa_id')::uuid, gen_random_uuid(),
    'dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f1.pdf', repeat('a', 64), 7, 'dpa-1')$$,
  '40001', 'NexG''s signing details changed while signing. Reload and try again.',
  'a copy made with other signing details is refused');

select lives_ok(
  $$select public.rpc_merchant_dpa_sign_record('9d000000-0000-4000-8000-0000000000c1', current_setting('test.dpa_id')::uuid, '9d000000-0000-4000-8000-0000000000e1',
    'dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f1.pdf', repeat('a', 64), 7, 'dpa-1')$$,
  'merchant staff sign and issue it');

select throws_ok(
  $$select public.rpc_merchant_dpa_sign_record('9d000000-0000-4000-8000-0000000000c1', current_setting('test.dpa_id')::uuid, '9d000000-0000-4000-8000-0000000000e1',
    'dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f2.pdf', repeat('b', 64), 7, 'dpa-1')$$,
  '23505', 'This DPA is already signed; the signed copy is never replaced.',
  'and never replaced');

select is(
  public.rpc_merchant_dpa_read('9d000000-0000-4000-8000-0000000000c1') #>> '{acceptances,0,ip}',
  '198.51.100.7',
  'merchant staff see the address it was accepted from');

select ok(
  authz.merchant_agreement_object_readable('dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f1.pdf'),
  'and can download the signed copy');

-- ------------------------------------------------------------ who reads it

select set_config('request.jwt.claims',
  '{"sub":"9d000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  public.rpc_merchant_dpa_read('9d000000-0000-4000-8000-0000000000c1') #>> '{acceptances,0,storage_path}',
  'dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f1.pdf',
  'the owner sees the signed copy');

select ok(
  authz.merchant_agreement_object_readable('dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f1.pdf'),
  'and can download it');

select ok(
  not authz.merchant_agreement_object_readable('dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f2.pdf'),
  'but not a file no acceptance records');

select set_config('request.jwt.claims',
  '{"sub":"9d000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_merchant_dpa_read('9d000000-0000-4000-8000-0000000000c1')$$,
  '42501', 'Not yours to look at.',
  'somebody else cannot see the DPA record');

select throws_ok(
  $$select public.rpc_merchant_dpa_signing_context('9d000000-0000-4000-8000-0000000000c1')$$,
  '42501', 'Merchant staff only.',
  'nor what it is filled with');

select ok(
  not authz.merchant_agreement_object_readable('dpa/9d000000-0000-4000-8000-0000000000c1/9d000000-0000-4000-8000-0000000000f1.pdf'),
  'nor download the copy');

-- ------------------------------------------------------------------ records

reset role;

select throws_ok(
  $$update public.merchant_dpa_acceptance set details = '{}'::jsonb$$,
  '42501', 'A DPA acceptance is never changed; its signed copy is attached once.',
  'an acceptance is never changed, even by the database owner');

select * from finish();
rollback;
