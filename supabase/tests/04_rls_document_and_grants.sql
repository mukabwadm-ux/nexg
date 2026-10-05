-- RLS on public.document, and the role_grant approval rule.
-- Spec section 3.4.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- The seed places demo partners in Nairobi. Clear partner data so the counts
-- below describe this test's own fixtures. The file rolls back at the end, so
-- nothing here escapes the transaction.
/*
 * Foreign keys and triggers are suspended for the cleanup below,
 * and switched back on immediately after.
 *
 * These ordered deletes worked until orders, dispatch and the
 * ledger arrived. Now sixty-odd tables reference a merchant or a
 * rider, and one of them — `ledger.entry` — refuses deletion
 * outright, by design: the ledger is append-only, and an order it
 * has posted against cannot be removed. There is no ordering of
 * deletes that satisfies both that rule and this fixture.
 *
 * `session_replication_role = replica` is the standard way out.
 * It is scoped to this transaction, the transaction rolls back,
 * and it is restored before the first assertion so that nothing
 * being tested runs with enforcement off.
 */
set local session_replication_role = replica;

delete from public.document;
delete from public.rider;
delete from public.merchant_user;
delete from public.merchant_branch;
delete from public.merchant;
delete from public.role_grant;
delete from public.staff_user;

set local session_replication_role = origin;


-- ------------------------------------------------------------------- fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'doc.rider@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'doc.ops@nexgapp.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'doc.stranger@example.com', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'a2222222-2222-2222-2222-222222222222', 'doc.ops@nexgapp.com', 'Doc ops');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select
  'aaaaaaaa-0000-0000-0000-000000000003',
  (select id from public.role where key = 'rider_ops'),
  (select id from public.city where slug = 'nairobi'),
  'aaaaaaaa-0000-0000-0000-000000000003';

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle)
values ('dddddddd-0000-0000-0000-000000000001', 'a1111111-1111-1111-1111-111111111111',
        'Doc', 'Rider', '+254722000001', (select id from public.city where slug = 'nairobi'), 'bicycle');

insert into public.document (id, owner_type, owner_id, requirement_id, storage_path, mime, size_bytes)
select
  'eeeeeeee-0000-0000-0000-000000000001', 'rider', 'dddddddd-0000-0000-0000-000000000001',
  (select id from public.document_requirement where owner_type = 'rider' and kind = 'national_id'),
  'rider/dddddddd-0000-0000-0000-000000000001/national_id/file.jpg', 'image/jpeg', 120000;

-- ---------------------------------------------------------------- the owner

set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.document),
  1,
  'a rider reads their own documents'
);

-- The owner must not be able to mark their own document verified.
update public.document
set status = 'verified', reviewed_at = now()
where id = 'eeeeeeee-0000-0000-0000-000000000001';
reset role;

select is(
  (select status::text from public.document where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'uploaded',
  'a rider cannot verify their own document'
);

-- ------------------------------------------------------------- a stranger

set local request.jwt.claims = '{"sub":"a3333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from public.document),
  0,
  'an unrelated user reads no documents'
);
reset role;

set local role anon;
select is(
  (select count(*)::int from public.document),
  0,
  'anon reads no documents'
);
reset role;

-- --------------------------------------------------------------- the reviewer

set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.document),
  1,
  'rider_ops reads documents for riders in their city'
);

select lives_ok(
  $$select public.rpc_document_verify('eeeeeeee-0000-0000-0000-000000000001')$$,
  'rider_ops can verify a document through the RPC'
);
reset role;

select is(
  (select status::text from public.document where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'verified',
  'the document is verified'
);

-- A rejection without a reason is refused (section 5.2).
set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.rpc_document_reject('eeeeeeee-0000-0000-0000-000000000001', '  ')$$,
  '23514',
  null,
  'a rejection without a reason is refused'
);
reset role;

-- ----------------------------------------------- role_grant second approver
--
-- Section 3.4: finance and super_admin grants need an approver who is not the
-- person granting them.

select throws_ok(
  format(
    $$insert into public.role_grant (staff_user_id, role_id, granted_by)
      values ('aaaaaaaa-0000-0000-0000-000000000003', %L, 'aaaaaaaa-0000-0000-0000-000000000003')$$,
    (select id from public.role where key = 'finance')
  ),
  '23514',
  null,
  'a finance grant without a second approver is refused'
);

select throws_ok(
  format(
    $$insert into public.role_grant (staff_user_id, role_id, granted_by, approved_by)
      values ('aaaaaaaa-0000-0000-0000-000000000003', %L,
              'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003')$$,
    (select id from public.role where key = 'super_admin')
  ),
  '23514',
  null,
  'a super_admin grant cannot be self-approved'
);


-- ══════════════════════ chasing a document that has not come

/*
 * The reviewer's version of the chase. The applicant's version
 * already existed and authorises with `is_merchant_member`, so a
 * reviewer could not call it at all — and the one thing a reviewer
 * with a button can do that an applicant cannot is send the same
 * person four messages in a minute.
 */
select throws_ok(
  $$ select public.rpc_document_remind('merchant',
       (select id from public.merchant limit 1), 'not_a_real_document') $$,
  null,
  'A document we do not ask for cannot be chased.');

select ok(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'rpc_document_remind') = 1,
  'There is one reminder function, not an overload pair waiting to go ambiguous.');

select ok(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'document_request'
     and column_name = 'requested_by') = 1,
  'A chase records who sent it — null still means the applicant asked us to.');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'document_request' and cmd = 'INSERT'
     and policyname not like '%own%'),
  0,
  'Nothing but the applicant may insert a chase directly; a reviewer goes through the RPC.');


-- ════════════ a document that arrived some other way

/*
 * Staff filing a document on somebody's behalf. The thing that
 * matters is that it stays a different fact from one the applicant
 * uploaded — otherwise nobody can later tell who put a licence on
 * file.
 */
select ok(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'document'
     and column_name in ('uploaded_by_staff_id', 'received_via')) = 2,
  'A filed document records who filed it and how it reached us.');

select ok(
  exists (select 1 from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname = 'partner_documents_staff_insert'),
  'Staff can write to the bucket they could already read from.');

select throws_ok(
  format($$ select public.rpc_document_upload_for('merchant', %L, 'business_permit',
            'somewhere/else/permit.pdf', 'application/pdf', 1000) $$,
    (select id from public.merchant limit 1)),
  null,
  'A file outside the owner''s own folder is refused — nobody would be able to open it later.');

select * from finish();
rollback;
