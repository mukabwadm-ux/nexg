-- RLS on public.rider — spec section 3.4, allowed and denied for every clause.
--
-- Acceptance test 4 in section 6 depends on the last case here: rider_ops for
-- Nairobi must see Nairobi riders and nobody else's.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

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
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'rider.a@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'rider.b@example.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'ops.nairobi@nexgapp.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'nobody@example.com', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'ops.nairobi@nexgapp.com', 'Nairobi rider ops');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select
  'aaaaaaaa-0000-0000-0000-000000000001',
  (select id from public.role where key = 'rider_ops'),
  (select id from public.city where slug = 'nairobi'),
  'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.rider (id, user_id, first_name, last_name, phone, city_id, vehicle)
values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Rider', 'A', '+254712345678', (select id from public.city where slug = 'nairobi'), 'motorbike'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Rider', 'B', '+254712345679', (select id from public.city where slug = 'mombasa'), 'bicycle');

-- ------------------------------------------------------------------- as anon

set local role anon;
select is(
  (select count(*)::int from public.rider),
  0,
  'anon cannot read any rider'
);
reset role;

-- ---------------------------------------------------------------- as rider A

set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.rider),
  1,
  'a rider sees exactly one row: their own'
);

select is(
  (select first_name || ' ' || last_name from public.rider),
  'Rider A',
  'and it is theirs'
);

-- Editable while the application is open.
select lives_ok(
  $$update public.rider set plate_no = 'KMC 123A' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'a rider can update their own row while the application is open'
);

select is(
  (select count(*)::int from public.rider where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  0,
  'a rider cannot see another rider'
);

-- Updating someone else's row matches no rows rather than raising.
update public.rider set plate_no = 'HACKED' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
reset role;

select is(
  (select plate_no from public.rider where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  null,
  'a rider cannot update another rider'
);

-- ------------------------------------------- a rider past the editable window

update public.rider set status = 'suspended' where id = 'bbbbbbbb-0000-0000-0000-000000000002';

set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.rider),
  1,
  'a suspended rider can still read their own row'
);

update public.rider set first_name = 'Renamed' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
reset role;

select is(
  (select first_name from public.rider where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  'Rider',
  'a rider cannot edit their row once the application has closed'
);

-- ---------------------------------------------------- as rider_ops (Nairobi)

set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.rider),
  1,
  'rider_ops for Nairobi sees only Nairobi riders'
);

select is(
  (select last_name from public.rider),
  'A',
  'and it is the Nairobi rider'
);

select lives_ok(
  $$update public.rider set status_reason = 'checked' where id = 'bbbbbbbb-0000-0000-0000-000000000001'$$,
  'rider_ops can update a rider in their city'
);

update public.rider set status_reason = 'out of scope' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
reset role;

select is(
  (select status_reason from public.rider where id = 'bbbbbbbb-0000-0000-0000-000000000002'),
  null,
  'rider_ops cannot touch a rider in another city'
);

-- ----------------------------------------- a signed-in user who is not a rider

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from public.rider),
  0,
  'a signed-in stranger sees no riders at all'
);
reset role;

select * from finish();
rollback;
