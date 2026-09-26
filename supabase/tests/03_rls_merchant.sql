-- RLS on merchant, merchant_branch and merchant_user, and the public view.
-- Spec sections 3.3 and 3.4; acceptance test 7.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

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
  ('00000000-0000-0000-0000-000000000000', '55555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'owner@shop.example', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '66666666-6666-6666-6666-666666666666', 'authenticated', 'authenticated', 'merchant.ops@nexgapp.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '77777777-7777-7777-7777-777777777777', 'authenticated', 'authenticated', 'rival@shop.example', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values ('aaaaaaaa-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666', 'merchant.ops@nexgapp.com', 'Merchant ops');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select
  'aaaaaaaa-0000-0000-0000-000000000002',
  (select id from public.role where key = 'merchant_ops'),
  (select id from public.city where slug = 'nairobi'),
  'aaaaaaaa-0000-0000-0000-000000000002';

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, city_id)
values (
  'cccccccc-0000-0000-0000-000000000001',
  'Mama Oliech Limited', 'Mama Oliech', 'restaurant',
  'Jane Owner', '+254712000001', 'owner@shop.example',
  (select id from public.city where slug = 'nairobi')
);

insert into public.merchant_user (merchant_id, user_id, role)
values ('cccccccc-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'owner');

insert into public.merchant_branch (merchant_id, name, address_text, is_primary)
values ('cccccccc-0000-0000-0000-000000000001', 'Westlands', 'Woodvale Grove, Westlands', true);

-- --------------------------------------------- the merchant table is private

-- Stronger than "returns no rows": the grant itself was revoked in migration
-- 001200, so anon is refused at the table before RLS is even consulted.
select throws_ok(
  $$set local role anon; select count(*) from public.merchant$$,
  '42501',
  null,
  'anon is refused outright on the merchant table'
);
reset role;

-- ------------------------------------------ merchant_public hides non-live
-- Acceptance test 7: nothing before go-live, the merchant after.

set local role anon;
select is(
  (select count(*)::int from public.merchant_public),
  0,
  'an applied merchant is not publicly visible'
);
reset role;

update public.merchant
set status = 'live', went_live_at = now()
where id = 'cccccccc-0000-0000-0000-000000000001';

set local role anon;
select is(
  (select count(*)::int from public.merchant_public),
  1,
  'a live merchant is publicly visible'
);

select is(
  (select trading_name from public.merchant_public),
  'Mama Oliech',
  'the public view exposes the trading name'
);

select hasnt_column('public', 'merchant_public', 'legal_name',
  'the public view does not expose the legal name');
select hasnt_column('public', 'merchant_public', 'contact_email',
  'the public view does not expose contact details');
select hasnt_column('public', 'merchant_public', 'settlement_account',
  'the public view does not expose the settlement account');
reset role;

-- Put it back so the ownership checks below run against a normal record.
update public.merchant
set status = 'applied', went_live_at = null
where id = 'cccccccc-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------- as the owner

set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.merchant),
  1,
  'an owner reads their own merchant'
);

select is(
  (select count(*)::int from public.merchant_branch),
  1,
  'an owner reads their own branches'
);
reset role;

-- ------------------------------------------------------- as an unrelated user

set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from public.merchant),
  0,
  'another merchant''s owner sees nothing of this one'
);
reset role;

-- ------------------------------------------------------ as merchant_ops staff

set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';
set local role authenticated;
select is(
  (select count(*)::int from public.merchant),
  1,
  'merchant_ops reads merchants in their city'
);
reset role;

select * from finish();
rollback;
