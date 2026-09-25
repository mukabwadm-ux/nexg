-- The approval gate — spec section 3.3, acceptance tests 5 and 6.
--
-- Nothing reaches active or live except through the RPCs, and only with every
-- required document verified.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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
  ('00000000-0000-0000-0000-000000000000', 'b1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'gate.rider@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'gate.ops@nexgapp.com', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values ('aaaaaaaa-0000-0000-0000-000000000004', 'b2222222-2222-2222-2222-222222222222', 'gate.ops@nexgapp.com', 'Gate ops');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select
  'aaaaaaaa-0000-0000-0000-000000000004',
  (select id from public.role where key = 'rider_ops'),
  (select id from public.city where slug = 'nairobi'),
  'aaaaaaaa-0000-0000-0000-000000000004';

-- A motorbike rider: six required documents (section 3.2 seed).
insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle, plate_no)
values ('ffffffff-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111',
        'Gate', 'Rider', '+254733000001',
        (select id from public.city where slug = 'nairobi'), 'motorbike', 'KMC 123A');

-- ---------------------------------------------------- which documents apply

select is(
  (select count(*)::int from public.fn_rider_required_docs('ffffffff-0000-0000-0000-000000000001')),
  6,
  'a motorbike rider needs six documents'
);

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle)
values ('ffffffff-0000-0000-0000-000000000002', null,
        'Bike', 'Rider', '+254733000002',
        (select id from public.city where slug = 'nairobi'), 'bicycle');

select is(
  (select count(*)::int from public.fn_rider_required_docs('ffffffff-0000-0000-0000-000000000002')),
  3,
  'a bicycle rider needs only the three that always apply'
);

-- A pharmacy needs the category-specific licence (acceptance test 3).
insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id)
values ('cccccccc-0000-0000-0000-00000000000f', 'Afya Pharmacy Ltd', 'Afya Pharmacy', 'pharmacy',
        'Ann Owner', '+254744000001', 'afya@example.com',
        (select id from public.city where slug = 'nairobi'));

select is(
  (select count(*)::int from public.fn_merchant_required_docs('cccccccc-0000-0000-0000-00000000000f')),
  5,
  'a pharmacy needs the four universal documents plus its licence'
);

select ok(
  exists (
    select 1 from public.fn_merchant_required_docs('cccccccc-0000-0000-0000-00000000000f')
    where kind = 'pharmacy_licence'
  ),
  'and the pharmacy licence is one of them'
);

-- ------------------------------------------------- uploading moves the status

insert into public.document (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes)
select 'rider', 'ffffffff-0000-0000-0000-000000000001', q.id,
       'rider/ffffffff-0000-0000-0000-000000000001/' || q.kind || '/f.jpg', 'image/jpeg', 100000
from public.fn_rider_required_docs('ffffffff-0000-0000-0000-000000000001') q
limit 1;

select is(
  (select status::text from public.rider where id = 'ffffffff-0000-0000-0000-000000000001'),
  'documents_pending',
  'one document of six leaves the rider in documents_pending'
);

-- The rest.
insert into public.document (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes)
select 'rider', 'ffffffff-0000-0000-0000-000000000001', q.id,
       'rider/ffffffff-0000-0000-0000-000000000001/' || q.kind || '/f.jpg', 'image/jpeg', 100000
from public.fn_rider_required_docs('ffffffff-0000-0000-0000-000000000001') q
where not exists (
  select 1 from public.document d
  where d.owner_id = 'ffffffff-0000-0000-0000-000000000001' and d.requirement_id = q.id
);

select is(
  (select status::text from public.rider where id = 'ffffffff-0000-0000-0000-000000000001'),
  'under_review',
  'all six uploaded moves the rider to under_review'
);

-- ------------------------------------------- activation needs every document

set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$select public.rpc_activate_rider('ffffffff-0000-0000-0000-000000000001')$$,
  '23514',
  null,
  'a rider cannot be activated while documents are unverified'
);
reset role;

-- A rejection sends them back, with the reason (acceptance test 5).
update public.document
set status = 'rejected', rejection_reason = 'Photo is blurred', reviewed_at = now()
where owner_id = 'ffffffff-0000-0000-0000-000000000001'
  and requirement_id = (select id from public.document_requirement where owner_type = 'rider' and kind = 'national_id');

select is(
  (select status::text from public.rider where id = 'ffffffff-0000-0000-0000-000000000001'),
  'documents_pending',
  'a rejected document sends the rider back to documents_pending'
);

select is(
  (select status_reason from public.rider where id = 'ffffffff-0000-0000-0000-000000000001'),
  'Photo is blurred',
  'and the reason is surfaced on the rider'
);

-- Verify everything.
update public.document
set status = 'verified', reviewed_at = now(), rejection_reason = null
where owner_id = 'ffffffff-0000-0000-0000-000000000001';

select is(
  (select status::text from public.rider where id = 'ffffffff-0000-0000-0000-000000000001'),
  'under_review',
  'all documents verified still waits for an explicit activation'
);

-- ----------------------------------------------------- who may activate

set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;
select throws_ok(
  $$select public.rpc_activate_rider('ffffffff-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'a rider cannot activate themselves'
);
reset role;

set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;
select lives_ok(
  $$select public.rpc_activate_rider('ffffffff-0000-0000-0000-000000000001', 'Documents all check out')$$,
  'rider_ops for the city can activate'
);
reset role;

select is(
  (select status::text from public.rider where id = 'ffffffff-0000-0000-0000-000000000001'),
  'active',
  'the rider is active'
);

-- Acceptance test 6: the audit event exists and the chain still verifies.
select ok(
  exists (
    select 1 from audit.audit_event
    where action = 'rider.activated'
      and target_id = 'ffffffff-0000-0000-0000-000000000001'
  )
  and (select ok from audit.verify_chain()),
  'activation wrote rider.activated and the chain still verifies'
);

select * from finish();
rollback;
