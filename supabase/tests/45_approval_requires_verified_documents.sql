-- Approving a merchant application needs every essential document verified.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id, answers)
values ('cccccccc-4545-0000-0000-000000000001', 'Gate Pharmacy Ltd', 'Gate Pharmacy', 'pharmacy',
        'Ann Gate', '+254744454501', 'gate.pharmacy@example.com',
        (select id from public.city where slug = 'nairobi'),
        '{"dispenses_rx": "yes"}'::jsonb);

select ok(
  (select count(*) from public.fn_merchant_required_docs('cccccccc-4545-0000-0000-000000000001') where essential) > 0,
  'The fixture business has essential documents to supply.');

select ok(
  not authz.merchant_documents_verified('cccccccc-4545-0000-0000-000000000001'),
  'With nothing uploaded the business is not ready for approval.');

-- Every essential document uploaded but not yet checked.
insert into public.document (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes)
select 'merchant', 'cccccccc-4545-0000-0000-000000000001', q.id,
       'merchant/cccccccc-4545-0000-0000-000000000001/' || q.kind || '/f.pdf', 'application/pdf', 100000
from public.fn_merchant_required_docs('cccccccc-4545-0000-0000-000000000001') q
where q.essential;

select ok(
  not authz.merchant_documents_verified('cccccccc-4545-0000-0000-000000000001'),
  'Uploaded is not verified: approval still waits for staff to check them.');

-- All but one verified.
update public.document set status = 'verified', reviewed_at = now()
 where owner_type = 'merchant' and owner_id = 'cccccccc-4545-0000-0000-000000000001'
   and id <> (select id from public.document
               where owner_type = 'merchant' and owner_id = 'cccccccc-4545-0000-0000-000000000001'
               order by id limit 1);

select ok(
  not authz.merchant_documents_verified('cccccccc-4545-0000-0000-000000000001'),
  'One unverified essential document is enough to hold approval.');

update public.document set status = 'verified', reviewed_at = now()
 where owner_type = 'merchant' and owner_id = 'cccccccc-4545-0000-0000-000000000001';

select ok(
  authz.merchant_documents_verified('cccccccc-4545-0000-0000-000000000001'),
  'With every essential document verified the business can be approved.');

select ok(
  (select prosrc from pg_proc where proname = 'rpc_merchant_application_review')
    ~ 'p_decision=''approved'' and not authz\.merchant_documents_verified\(p_merchant_id\)',
  'The review command refuses approval until the documents are verified.');

select ok(
  not has_function_privilege('anon', 'authz.merchant_documents_verified(uuid)', 'execute')
    and not has_function_privilege('authenticated', 'authz.merchant_documents_verified(uuid)', 'execute'),
  'The gate itself is not callable from the API.');

select ok(
  not has_function_privilege('anon', 'public.rpc_merchant_document_readiness(uuid)', 'execute'),
  'The anonymous key cannot read document readiness.');

select throws_ok(
  $$select public.rpc_merchant_document_readiness('cccccccc-4545-0000-0000-000000000001')$$,
  '42501', 'Merchant review permission is required.',
  'Only reviewing staff can read document readiness.');

select * from finish();
rollback;
