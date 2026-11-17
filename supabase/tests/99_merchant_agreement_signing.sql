-- Merchant agreements filled in and signed on approval (20270103000100).
--
-- The owner gives the agreement details; a super admin sets NexG's
-- signatory, signature and letterhead; merchant staff sign the merchant's
-- accepted agreement once, from a PDF in the private bucket. Who may do
-- what, the checks on each input, the audit trail, and that a signed copy
-- and the details it used do not change afterwards.

begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

-- ------------------------------------------------------------------ fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('99000000-0000-4000-8000-0000000000a1'::uuid, 'owner99@test.local'),
  ('99000000-0000-4000-8000-0000000000a2'::uuid, 'ops99@test.local'),
  ('99000000-0000-4000-8000-0000000000a3'::uuid, 'ceo99@test.local'),
  ('99000000-0000-4000-8000-0000000000a4'::uuid, 'legal99@test.local'),
  ('99000000-0000-4000-8000-0000000000a5'::uuid, 'stranger99@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('99000000-0000-4000-8000-0000000000b2', '99000000-0000-4000-8000-0000000000a2', 'ops99@test.local', 'Ops 99'),
  ('99000000-0000-4000-8000-0000000000b3', '99000000-0000-4000-8000-0000000000a3', 'ceo99@test.local', 'CEO 99'),
  ('99000000-0000-4000-8000-0000000000b4', '99000000-0000-4000-8000-0000000000a4', 'legal99@test.local', 'Legal 99');

/* A super_admin grant needs a second person to approve it
   (tg_role_grant_requires_second_approver): Ops 99 does. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select g.staff_id, r.id, null, '00000000-0000-4000-8000-00000000000a', g.approver
from (values
  ('99000000-0000-4000-8000-0000000000b2'::uuid, 'merchant_ops', null::uuid),
  ('99000000-0000-4000-8000-0000000000b3'::uuid, 'super_admin', '99000000-0000-4000-8000-0000000000b2'::uuid),
  ('99000000-0000-4000-8000-0000000000b4'::uuid, 'legal', null::uuid)
) as g (staff_id, role_key, approver)
join public.role r on r.key = g.role_key;

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status, went_live_at)
values ('99000000-0000-4000-8000-0000000000c1', 'Glow Beauty Limited', 'Glow Beauty', 'beauty',
  'Wanjiku Owner', '+254712990001', 'glow99@test.local',
  (select id from public.city where slug = 'nairobi'), 'live', now());

insert into public.merchant_user (merchant_id, user_id, role)
values ('99000000-0000-4000-8000-0000000000c1', '99000000-0000-4000-8000-0000000000a1', 'owner');

insert into public.merchant_agreement_acceptance (id, merchant_id, category, agreement_id, version, accepted_by)
select '99000000-0000-4000-8000-0000000000d1', '99000000-0000-4000-8000-0000000000c1', 'beauty', a.id, a.version,
       '99000000-0000-4000-8000-0000000000a1'
from public.fn_merchant_agreement_for_category('beauty') a;

/* What storage would hold after the console's uploads. */
insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
  ('merchant-agreements', 'signer/99000000-0000-4000-8000-0000000000e1.png',
   '99000000-0000-4000-8000-0000000000a3', '99000000-0000-4000-8000-0000000000a3',
   '{"size": 18000, "mimetype": "image/png"}'),
  ('merchant-agreements', 'signer/99000000-0000-4000-8000-0000000000e2.png',
   '99000000-0000-4000-8000-0000000000a2', '99000000-0000-4000-8000-0000000000a2',
   '{"size": 18000, "mimetype": "image/png"}'),
  ('merchant-agreements', 'signed/99000000-0000-4000-8000-0000000000c1/99000000-0000-4000-8000-0000000000f1.pdf',
   '99000000-0000-4000-8000-0000000000a2', '99000000-0000-4000-8000-0000000000a2',
   '{"size": 84000, "mimetype": "application/pdf"}'),
  ('merchant-agreements', 'signed/99000000-0000-4000-8000-0000000000c1/99000000-0000-4000-8000-0000000000f2.pdf',
   '99000000-0000-4000-8000-0000000000a2', '99000000-0000-4000-8000-0000000000a2',
   '{"size": 84000, "mimetype": "application/pdf"}');

-- ------------------------------------------------------------------ wiring

select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in
      ('merchant_agreement_party', 'merchant_agreement_signer', 'merchant_agreement_signed')
      and c.relrowsecurity),
  3,
  'the three agreement tables have row-level security');

select results_eq(
  $$select public, file_size_limit from storage.buckets where id = 'merchant-agreements'$$,
  $$values (false, 5242880::bigint)$$,
  'signed agreements and the signature live in a private bucket of 5 MB files');

select results_eq(
  $$select action collate "C", module, default_severity::text, needs_review, pii_fields
    from audit.action_registry
    where action in ('merchant.agreement_details_saved', 'merchant.agreement_signed',
                     'merchant.agreement_signer_saved')
    order by 1$$,
  $$values
    ('merchant.agreement_details_saved' collate "C", 'merchants', 'info', false, '{}'::text[]),
    ('merchant.agreement_signed', 'merchants', 'notice', false, '{}'::text[]),
    ('merchant.agreement_signer_saved', 'settings', 'high', true, '{}'::text[])$$,
  'the three actions are registered; a change to NexG''s signature is flagged for review');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ilike '%agreement%'),
  0,
  'the wiring check finds nothing wrong with merchant agreements');

select is(
  (select public.fn_merchant_agreement_commission('99000000-0000-4000-8000-0000000000c1') ->> 'basis'),
  'nexg_delivery',
  'without a negotiated rate or its own riders, the agreement states the NexG-delivery commission');

-- ------------------------------------------------------------------ the owner

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  public.rpc_merchant_agreement_details_read('99000000-0000-4000-8000-0000000000c1')
    #>> '{suggested,legal_name}',
  'Glow Beauty Limited',
  'before saving, the form starts from the registered name on file');

select throws_ok(
  $$select public.rpc_merchant_agreement_details_save('99000000-0000-4000-8000-0000000000c1',
    '{"legal_name":"Glow Beauty Limited","registration_number":"PVT-GLOW99","kra_pin":"P05123",
      "address":"Shop 9, Yaya Centre, Nairobi","signatory_name":"Wanjiku Owner",
      "signatory_title":"Director","representative_name":"Wanjiku Owner",
      "representative_title":"Director","principal_name":"Wanjiku Owner"}')$$,
  '22023', 'Enter the KRA PIN: a letter, nine digits and a letter, for example P051234567X.',
  'a KRA PIN in the wrong shape is refused');

select throws_ok(
  $$select public.rpc_merchant_agreement_details_save('99000000-0000-4000-8000-0000000000c1',
    '{"legal_name":"Glow Beauty Limited","iban":"x"}')$$,
  '22023', 'Unknown agreement detail: iban.',
  'only the agreement''s own details are accepted');

select is(
  public.rpc_merchant_agreement_details_save('99000000-0000-4000-8000-0000000000c1',
    '{"legal_name":"  Glow   Beauty Limited ","registration_number":"pvt-glow99","kra_pin":"p 051234567x",
      "address":"Shop 9, Yaya Centre, Nairobi","postal_address":"P.O. Box 1234-00100, Nairobi",
      "signatory_name":"Wanjiku Owner","signatory_title":"Director",
      "representative_name":"Otieno Manager","representative_title":"Operations Manager",
      "principal_name":"Wanjiku Owner"}') #> '{details}',
  '{"legal_name":"Glow Beauty Limited","registration_number":"PVT-GLOW99","kra_pin":"P051234567X",
    "address":"Shop 9, Yaya Centre, Nairobi","postal_address":"P.O. Box 1234-00100, Nairobi",
    "signatory_name":"Wanjiku Owner","signatory_title":"Director",
    "representative_name":"Otieno Manager","representative_title":"Operations Manager",
    "principal_name":"Wanjiku Owner"}'::jsonb,
  'the owner saves the details, trimmed, with the registration number and KRA PIN in capitals');

select throws_ok(
  $$select public.rpc_merchant_agreement_signing_context('99000000-0000-4000-8000-0000000000c1')$$,
  '42501', 'Merchant staff only.',
  'the merchant cannot read the signing context, which names NexG''s signature');

select throws_ok(
  $$select public.rpc_merchant_agreement_signer_save('{}'::jsonb)$$,
  '42501', 'Only a super admin can set NexG''s signatory and signature.',
  'nor set NexG''s signatory');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id, metadata)
    values ('merchant-agreements', 'signer/99000000-0000-4000-8000-0000000000e9.png',
            '99000000-0000-4000-8000-0000000000a1', '{"size": 10, "mimetype": "image/png"}')$$,
  '42501', null,
  'nor upload a signature');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'merchant-agreements'),
  0,
  'and the bucket shows the owner nothing before its agreement is signed');

-- ----------------------------------------------------------------- a stranger

select set_config('request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_merchant_agreement_details_read('99000000-0000-4000-8000-0000000000c1')$$,
  '42501', 'Not yours to look at.',
  'somebody else cannot read the merchant''s details');

select is(
  (select count(*)::int from public.merchant_agreement_party),
  0,
  'nor see them in the table');

-- ---------------------------------------------------------------------- legal

select set_config('request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);

select is(
  public.rpc_merchant_agreement_signer_read() -> 'can_edit',
  'false'::jsonb,
  'legal can see the signing details but not change them');

-- ---------------------------------------------------------------- super admin

select set_config('request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_merchant_agreement_signer_save('{"signatory_name":"Amina CEO",
    "signatory_title":"CEO and Executive Director","representative_name":"Brian Ops",
    "representative_title":"Head of Merchant Operations","po_box":"12345-00100",
    "registered_office":"Example House, Nairobi","email":"legal@nexg.test","phone":"+254 700 000 000",
    "website":"www.nexg.test","in_room_commission_pct":10}')$$,
  '22023', 'Upload the signature image.',
  'the first version needs a signature image');

select throws_ok(
  $$select public.rpc_merchant_agreement_signer_save('{"signatory_name":"Amina CEO",
    "signatory_title":"CEO and Executive Director","representative_name":"Brian Ops",
    "representative_title":"Head of Merchant Operations","po_box":"12345-00100",
    "registered_office":"Example House, Nairobi","email":"legal@nexg.test","phone":"+254 700 000 000",
    "website":"www.nexg.test","in_room_commission_pct":10}',
    'signer/99000000-0000-4000-8000-0000000000e2.png', repeat('a', 64))$$,
  '42501', 'Upload the signature yourself before saving it.',
  'a signature somebody else uploaded is refused');

select is(
  public.rpc_merchant_agreement_signer_save('{"signatory_name":"Amina CEO",
    "signatory_title":"CEO and Executive Director","representative_name":"Brian Ops",
    "representative_title":"Head of Merchant Operations","po_box":"12345-00100",
    "registered_office":"Example House, Nairobi","email":"Legal@NexG.test","phone":"+254 700 000 000",
    "website":"www.nexg.test","in_room_commission_pct":10}',
    'signer/99000000-0000-4000-8000-0000000000e1.png', repeat('b', 64))
    #>> '{current,email}',
  'legal@nexg.test',
  'a super admin sets the signatory, letterhead and signature');

select is(
  public.rpc_merchant_agreement_signer_save('{"signatory_name":"Amina CEO",
    "signatory_title":"CEO and Executive Director","representative_name":"Brian Ops",
    "representative_title":"Head of Merchant Operations","po_box":"12345-00100",
    "registered_office":"Example House, Westlands, Nairobi","email":"legal@nexg.test",
    "phone":"+254 700 000 000","website":"www.nexg.test","in_room_commission_pct":10}')
    #>> '{current,signature_sha256}',
  repeat('b', 64),
  'and later changes the letterhead without uploading the signature again');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'merchant.agreement_signer_saved'
      and actor_id = '99000000-0000-4000-8000-0000000000b3'),
  2,
  'each version is in the audit trail');

-- ------------------------------------------------------------- merchant staff

select set_config('request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

select is(
  (select jsonb_build_object('ready', c -> 'ready', 'missing', c -> 'missing',
     'cycle', c -> 'settlement_cycle', 'signer', c #> '{signer,registered_office}',
     'email', c #> '{acceptance,account_email}')
   from public.rpc_merchant_agreement_signing_context('99000000-0000-4000-8000-0000000000c1') c),
  '{"ready": true, "missing": [], "cycle": "weekly", "signer": "Example House, Westlands, Nairobi",
    "email": "owner99@test.local"}'::jsonb,
  'merchant staff see the merchant is ready to sign, with the current letterhead and the account that accepted');

select throws_ok(
  $$select public.rpc_merchant_agreement_signer_read()$$,
  '42501', 'Only a super admin or legal can see NexG''s signing details.',
  'merchant staff do not get the signing settings page');

select throws_ok(
  $$select public.rpc_merchant_agreement_sign_record('99000000-0000-4000-8000-0000000000c1',
    '99000000-0000-4000-8000-0000000000d1',
    (select (public.rpc_merchant_agreement_signing_context('99000000-0000-4000-8000-0000000000c1') #>> '{signer,id}')::uuid),
    'signed/99000000-0000-4000-8000-0000000000c9/99000000-0000-4000-8000-0000000000f1.pdf',
    repeat('c', 64), 16, 'NXG-MA-TEST0001', '1+abc', current_date, '{}')$$,
  '22023', 'Upload the signed PDF to the merchant''s own folder.',
  'a PDF outside the merchant''s folder is refused');

select throws_ok(
  $$select public.rpc_merchant_agreement_sign_record('99000000-0000-4000-8000-0000000000c1',
    '99000000-0000-4000-8000-0000000000d9',
    (select (public.rpc_merchant_agreement_signing_context('99000000-0000-4000-8000-0000000000c1') #>> '{signer,id}')::uuid),
    'signed/99000000-0000-4000-8000-0000000000c1/99000000-0000-4000-8000-0000000000f1.pdf',
    repeat('c', 64), 16, 'NXG-MA-TEST0001', '1+abc', current_date, '{}')$$,
  '40001', 'The merchant''s acceptance changed while signing. Reload and try again.',
  'so is a PDF made for another acceptance');

select is(
  public.rpc_merchant_agreement_sign_record('99000000-0000-4000-8000-0000000000c1',
    '99000000-0000-4000-8000-0000000000d1',
    (select (public.rpc_merchant_agreement_signing_context('99000000-0000-4000-8000-0000000000c1') #>> '{signer,id}')::uuid),
    'signed/99000000-0000-4000-8000-0000000000c1/99000000-0000-4000-8000-0000000000f1.pdf',
    repeat('c', 64), 16, 'NXG-MA-TEST0001', '1+abc', current_date, '{"commission_pct":"28"}')
    ->> 'bytes',
  '84000',
  'merchant staff record the signed copy, its size read from storage');

select is(
  public.rpc_merchant_agreement_sign_record('99000000-0000-4000-8000-0000000000c1',
    '99000000-0000-4000-8000-0000000000d1',
    (select (public.rpc_merchant_agreement_signing_context('99000000-0000-4000-8000-0000000000c1') #>> '{signer,id}')::uuid),
    'signed/99000000-0000-4000-8000-0000000000c1/99000000-0000-4000-8000-0000000000f1.pdf',
    repeat('c', 64), 16, 'NXG-MA-TEST0001', '1+abc', current_date, '{}') ->> 'reference',
  'NXG-MA-TEST0001',
  'recording the same copy again changes nothing');

select throws_ok(
  $$select public.rpc_merchant_agreement_sign_record('99000000-0000-4000-8000-0000000000c1',
    '99000000-0000-4000-8000-0000000000d1',
    (select (public.rpc_merchant_agreement_signing_context('99000000-0000-4000-8000-0000000000c1') #>> '{signer,id}')::uuid),
    'signed/99000000-0000-4000-8000-0000000000c1/99000000-0000-4000-8000-0000000000f2.pdf',
    repeat('d', 64), 16, 'NXG-MA-TEST0002', '1+abc', current_date, '{}')$$,
  '23505', 'This agreement is already signed; the signed copy is never replaced.',
  'but a second, different copy for the same acceptance is refused');

select is(
  (select count(*)::int from audit.audit_event
    where action = 'merchant.agreement_signed'
      and target_id = '99000000-0000-4000-8000-0000000000c1'
      and after ->> 'reference' = 'NXG-MA-TEST0001'),
  1,
  'signing is in the audit trail once');

select is(
  (select c -> 'ready' from public.rpc_merchant_agreement_signing_context('99000000-0000-4000-8000-0000000000c1') c),
  'false'::jsonb,
  'once signed, the merchant is no longer waiting to be signed');

/* As the Storage API deletes: it marks the session, then row-level security decides. */
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects
  where bucket_id = 'merchant-agreements' and name like 'signed/99000000-0000-4000-8000-0000000000c1/%';
select set_config('storage.allow_delete_query', 'false', true);

select is(
  (select string_agg(name, ',') from storage.objects
    where bucket_id = 'merchant-agreements' and name like 'signed/99000000-0000-4000-8000-0000000000c1/%'),
  'signed/99000000-0000-4000-8000-0000000000c1/99000000-0000-4000-8000-0000000000f1.pdf',
  'staff can clear an upload no signed copy records, never the signed copy');

-- ------------------------------------------------------------ the owner again

select set_config('request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select public.rpc_merchant_agreement_details_save('99000000-0000-4000-8000-0000000000c1',
    '{"legal_name":"Glow Beauty Limited","registration_number":"PVT-GLOW99","kra_pin":"P051234567Y",
      "address":"Shop 9, Yaya Centre, Nairobi","signatory_name":"Wanjiku Owner",
      "signatory_title":"Director","representative_name":"Wanjiku Owner",
      "representative_title":"Director","principal_name":"Wanjiku Owner"}')$$,
  '55000', 'Your merchant agreement has been signed with these details. Contact NexG to correct them.',
  'once signed, the details the agreement used are locked');

select is(
  (select jsonb_build_object('n', jsonb_array_length(l), 'current', l -> 0 -> 'current',
     'title', l -> 0 -> 'title')
   from public.rpc_merchant_agreement_signed_list('99000000-0000-4000-8000-0000000000c1') l),
  '{"n": 1, "current": true, "title": "Beauty"}'::jsonb,
  'the owner sees its signed agreement');

select is(
  (select count(*)::int from storage.objects where bucket_id = 'merchant-agreements'),
  1,
  'and can download its signed copy, and nothing else in the bucket');

select is(
  public.rpc_merchant_agreement_details_read('99000000-0000-4000-8000-0000000000c1') -> 'locked',
  'true'::jsonb,
  'the details read as locked');

-- --------------------------------------------------------------- a stranger

select set_config('request.jwt.claims',
  '{"sub":"99000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);

select is(
  (select count(*)::int from storage.objects where bucket_id = 'merchant-agreements'),
  0,
  'somebody else cannot see the signed copy');

select throws_ok(
  $$select public.rpc_merchant_agreement_signed_list('99000000-0000-4000-8000-0000000000c1')$$,
  '42501', 'Not yours to look at.',
  'nor list it');

-- ------------------------------------------------------------------ records

reset role;

select throws_ok(
  $$update public.merchant_agreement_signed set sha256 = repeat('e', 64)$$,
  '42501', 'merchant_agreement_signed rows are never changed; a new one is added instead.',
  'a signed copy is never changed, even by the database owner');

select throws_ok(
  $$update public.merchant_agreement_signer set signatory_name = 'Somebody Else'$$,
  '42501', 'merchant_agreement_signer rows are never changed; a new one is added instead.',
  'nor are NexG''s signing details it names');

update public.merchant set commission_pct = 12.5 where id = '99000000-0000-4000-8000-0000000000c1';

select is(
  public.fn_merchant_agreement_commission('99000000-0000-4000-8000-0000000000c1'),
  '{"pct": 12.5, "basis": "negotiated"}'::jsonb,
  'a negotiated rate is the one the agreement states');

select * from finish();
rollback;
