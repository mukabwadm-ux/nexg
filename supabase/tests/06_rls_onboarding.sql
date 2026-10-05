-- The onboarding tables, the merchant write guard, and the zone lookup.
--
-- The write guard is the one worth reading twice. It was added because
-- `authenticated` holds table-wide UPDATE on public.merchant and the owner
-- policy only restricts which rows, not which columns — so an applicant could
-- set featured = true on their own draft and collect paid placement for free
-- the moment staff took them live. These tests would fail if the trigger were
-- ever made SECURITY DEFINER, which silently disables it by rewriting
-- current_user to the function owner.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

delete from public.merchant_fleet_rider;
delete from public.document_request;
delete from public.document;
delete from public.merchant_user;
delete from public.merchant_branch;
delete from public.merchant;
delete from public.role_grant;
delete from public.staff_user;

set local session_replication_role = origin;


-- ------------------------------------------------------------------ fixtures

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

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, answers
)
values (
  'cccccccc-0000-0000-0000-000000000001',
  'Mama Oliech Limited', 'Mama Oliech', 'restaurant', 'Grace Oliech',
  '+254700000001', 'grace@shop.example',
  (select id from public.city where slug = 'nairobi'),
  '{"serves_alcohol": "yes"}'::jsonb
);

insert into public.merchant_user (merchant_id, user_id, role)
values ('cccccccc-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'owner');

insert into public.merchant_fleet_rider (merchant_id, name, phone, vehicle, plate_no)
values ('cccccccc-0000-0000-0000-000000000001', 'Peter Kamau', '+254700000441', 'motorbike', 'KMDA 123X');

-- ------------------------------------------------------- zones and coverage

select is(
  (select name from public.zone_for_point(36.8030, -1.2680)),
  'Westlands',
  'a pin on Mpaka Road lands in the Westlands zone'
);

select is(
  (select cod_allowed from public.zone_for_point(36.7250, -1.3190)),
  false,
  'Karen is an extended zone, so cash on delivery is off'
);

select is(
  (select count(*)::int from public.zone_for_point(36.9600, -1.4700)),
  0,
  'Kitengela is outside every zone'
);

-- --------------------------------------------- which documents this business owes

select is(
  (select count(*)::int from public.fn_merchant_required_docs('cccccccc-0000-0000-0000-000000000001')),
  5,
  'a restaurant that serves alcohol owes five documents'
);

select ok(
  exists (
    select 1 from public.fn_merchant_required_docs('cccccccc-0000-0000-0000-000000000001')
    where kind = 'liquor_licence'
  ),
  'the liquor licence comes from the answer, not from the category'
);

update public.merchant set answers = '{"serves_alcohol": "no"}'::jsonb
where id = 'cccccccc-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.fn_merchant_required_docs('cccccccc-0000-0000-0000-000000000001')),
  4,
  'saying no to alcohol drops the liquor licence again'
);

update public.merchant set answers = '{"serves_alcohol": "yes"}'::jsonb
where id = 'cccccccc-0000-0000-0000-000000000001';

-- ------------------------------------------------------------- the write guard

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select throws_ok(
  $$update public.merchant set featured = true where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  '42501',
  'That is not yours to set.',
  'an owner cannot grant themselves paid placement'
);

select throws_ok(
  $$update public.merchant set submitted_at = now() - interval '30 days'
    where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  '42501',
  'That is not yours to set.',
  'an owner cannot backdate their own submission'
);

select throws_ok(
  $$update public.merchant set phone_verified_at = now()
    where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  '42501',
  'That is not yours to set.',
  'an owner cannot declare their own phone verified'
);

select lives_ok(
  $$update public.merchant set landmark = 'opposite Sarit Centre', prep_minutes = 25
    where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  'an owner can still set the things that are theirs'
);

-- ------------------------------------------------------------- fleet riders

select is(
  (select count(*)::int from public.merchant_fleet_rider),
  1,
  'an owner sees the riders they declared'
);

select lives_ok(
  $$update public.merchant_fleet_rider set plate_no = 'KMDA 999Z'
    where merchant_id = 'cccccccc-0000-0000-0000-000000000001'$$,
  'an owner can correct a rider they have only invited'
);

-- Once the rider has started their own onboarding the row is about someone
-- else's account, and the merchant can read it but not rewrite it.
set local role postgres;
update public.merchant_fleet_rider set invite_status = 'under_review'
where merchant_id = 'cccccccc-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  (select count(*)::int from public.merchant_fleet_rider),
  1,
  'the merchant can still see a rider who has started onboarding'
);

/* A policy that filters rows makes the update a no-op rather than an error,
   so the assertion is on the name not having changed. */
update public.merchant_fleet_rider set name = 'Someone Else'
where merchant_id = 'cccccccc-0000-0000-0000-000000000001';

select is(
  (select name from public.merchant_fleet_rider
   where merchant_id = 'cccccccc-0000-0000-0000-000000000001'),
  'Peter Kamau',
  'but cannot rename them once they have started'
);

-- ---------------------------------------------------------------- a stranger

set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';

select is(
  (select count(*)::int from public.merchant where id = 'cccccccc-0000-0000-0000-000000000001'),
  0,
  'a stranger cannot see the application'
);

select is(
  (select count(*)::int from public.merchant_fleet_rider),
  0,
  'a stranger cannot see who rides for them'
);

select throws_ok(
  $$select public.fn_merchant_readiness('cccccccc-0000-0000-0000-000000000001')$$,
  '42501',
  'Not yours to look at.',
  'a stranger cannot read their readiness either'
);

-- -------------------------------------------------------------------- staff

set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

select is(
  (select count(*)::int from public.merchant_fleet_rider),
  1,
  'merchant ops in the right city sees the declared riders'
);

select is(
  ((select public.fn_merchant_readiness('cccccccc-0000-0000-0000-000000000001')) ->> 'location')::boolean,
  false,
  'and reads the same readiness the merchant does'
);

select * from finish();
rollback;
