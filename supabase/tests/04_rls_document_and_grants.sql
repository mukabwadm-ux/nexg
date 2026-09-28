-- RLS on public.document, and the role_grant approval rule.
-- Spec section 3.4.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- The seed places demo partners in Nairobi. Clear partner data so the counts
-- below describe this test's own fixtures. The file rolls back at the end, so
-- nothing here escapes the transaction.
delete from public.document;
delete from public.rider;
delete from public.merchant_user;
delete from public.merchant_branch;
delete from public.merchant;
delete from public.role_grant;
delete from public.staff_user;

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

select * from finish();
rollback;
