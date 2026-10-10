-- Rider onboarding: what the vehicle demands, what a rider may not set about
-- themselves, and what stops an activation.
--
-- The write guard is the one worth reading twice. `authenticated` holds
-- table-wide UPDATE on public.rider and the owner policy restricts which rows,
-- not which columns — so a rider could set kit_issued_at and
-- payout_name_lookup, which are two of the three things rpc_activate_rider
-- checks before letting them take orders. These tests fail if the trigger is
-- ever made SECURITY DEFINER, which silently disables it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

delete from public.document;

/*
 * Cash events are append-only — `tg_cash_event_immutable` refuses
 * both UPDATE and DELETE, including the cascade from deleting a
 * rider. That guard is right: a cash movement is corrected by
 * writing a correcting row, never by removing the original, and
 * nothing in production should ever delete one.
 *
 * It does mean a test that wipes every rider as setup has to
 * stand the trigger down first. Scoped to this transaction, which
 * rolls back, so the guard is untouched everywhere else — and the
 * suite fails loudly if anybody tries this outside a test.
 */
alter table public.cash_event disable trigger user;
delete from public.cash_event;
alter table public.cash_event enable trigger user;

delete from public.rider;
delete from public.role_grant;
delete from public.staff_user;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '88888888-8888-8888-8888-888888888888', 'authenticated', 'authenticated', 'brian@rider.example', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated', 'rider.ops@nexgapp.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '12121212-1212-1212-1212-121212121212', 'authenticated', 'authenticated', 'nosy@rider.example', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values ('aaaaaaaa-0000-0000-0000-000000000009', '99999999-9999-9999-9999-999999999999', 'rider.ops@nexgapp.com', 'Rider ops');

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select 'aaaaaaaa-0000-0000-0000-000000000009', r.id,
       (select id from public.city where slug = 'nairobi'),
       'aaaaaaaa-0000-0000-0000-000000000009'
from public.role r where r.key = 'rider_ops';

insert into public.rider (
  id, user_id, first_name, phone, city_id, vehicle, plate_no,
  ownership, insurance, phone_verified_at, payout_msisdn
)
values (
  'dddddddd-0000-0000-0000-000000000001',
  '88888888-8888-8888-8888-888888888888',
  'Brian', '+254700000801',
  (select id from public.city where slug = 'nairobi'),
  'motorbike', 'KMDA 421K', 'own', 'third_party', now(), '+254700000801'
);

-- ------------------------------------------------ which photos the ride needs

select is(
  (select count(*)::int from public.fn_rider_required_docs('dddddddd-0000-0000-0000-000000000001')),
  6,
  'a motorbike on third-party cover owes six photos'
);

update public.rider set ownership = 'rented' where id = 'dddddddd-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.fn_rider_required_docs('dddddddd-0000-0000-0000-000000000001')),
  7,
  'renting the bike adds the owner''s permission letter'
);

/*
 * The condition evaluator returned NULL for an unanswered question, and a
 * coalesce turned that into "matches" — so every rider who had not yet said
 * who owns the bike was asked for a letter from an owner they had not named.
 */
update public.rider set ownership = null where id = 'dddddddd-0000-0000-0000-000000000001';

select ok(
  not exists (
    select 1 from public.fn_rider_required_docs('dddddddd-0000-0000-0000-000000000001')
    where kind = 'owner_letter'
  ),
  'an unanswered ownership question demands no owner letter'
);

update public.rider set ownership = 'own' where id = 'dddddddd-0000-0000-0000-000000000001';

update public.rider set vehicle = 'bicycle', plate_no = null, insurance = null
where id = 'dddddddd-0000-0000-0000-000000000001';

select is(
  (select count(*)::int from public.fn_rider_required_docs('dddddddd-0000-0000-0000-000000000001')),
  3,
  'a bicycle rider owes three: ID, selfie, good conduct'
);

update public.rider set vehicle = 'motorbike', plate_no = 'KMDA 421K', insurance = 'third_party'
where id = 'dddddddd-0000-0000-0000-000000000001';

-- ------------------------------------------------------------ plate matching

select ok(public.fn_plate_matches('KMDA 421K', 'kmda421k'), 'spacing and case are ignored');
select ok(public.fn_plate_matches('KMDA 421K', 'KMDA 42IK'), 'a 1 read as an I still matches');
select ok(public.fn_plate_matches('KMDA 421K', 'KMDA-421K'), 'a dash is ignored');
select ok(not public.fn_plate_matches('KMDA 421K', 'KBXX 999Z'), 'a different plate does not match');
select ok(not public.fn_plate_matches('KMDA 421K', null), 'nothing read means no match');

-- ------------------------------------------------------------ the write guard

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888","role":"authenticated"}';

select throws_ok(
  $$update public.rider set kit_issued_at = now() where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  '42501', 'That is not yours to set.',
  'a rider cannot say their own kit was handed over'
);

select throws_ok(
  $$update public.rider set payout_name_lookup = '{"matched": true}'::jsonb
    where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  '42501', 'That is not yours to set.',
  'a rider cannot declare their own M-Pesa name checked'
);

select throws_ok(
  $$update public.rider set status = 'active' where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  '42501', 'That is not yours to set.',
  'a rider cannot activate themselves'
);

select lives_ok(
  $$update public.rider set areas = array['Westlands'], cash_ok = false
    where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  'a rider can still set the things that are theirs'
);

-- ---------------------------------------------------------------- a stranger

set local request.jwt.claims = '{"sub":"12121212-1212-1212-1212-121212121212","role":"authenticated"}';

select is(
  (select count(*)::int from public.rider where id = 'dddddddd-0000-0000-0000-000000000001'),
  0,
  'a stranger cannot see the application'
);

select throws_ok(
  $$select public.fn_rider_readiness('dddddddd-0000-0000-0000-000000000001')$$,
  '42501', 'Not yours to look at.',
  'a stranger cannot read their readiness'
);

-- ------------------------------------------------------- what blocks going live

set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

select throws_like(
  $$select public.rpc_activate_rider('dddddddd-0000-0000-0000-000000000001')$$,
  '%essential documents verified%',
  'unverified documents block activation'
);

/* Verify everything essential, so the next two refusals are about the two
   gates this flow added rather than about paperwork. */
set local role postgres;
/* A verified document must name who verified it — document_review_is_attributed
   refuses one that does not, which is the constraint doing its job. */
insert into public.document (owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
                             status, side, expires_at, reviewed_by, reviewed_at)
select 'rider', 'dddddddd-0000-0000-0000-000000000001', q.id,
       'rider/x/' || q.kind, 'image/jpeg', 1000, 'verified',
       case when q.kind = 'national_id' then 'front' end,
       case when q.has_expiry then current_date + 400 end,
       'aaaaaaaa-0000-0000-0000-000000000009', now()
from public.fn_rider_required_docs('dddddddd-0000-0000-0000-000000000001') q
where q.essential;

set local role authenticated;
set local request.jwt.claims = '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}';

select throws_like(
  $$select public.rpc_activate_rider('dddddddd-0000-0000-0000-000000000001')$$,
  '%M-Pesa line has not been confirmed%',
  'an unconfirmed M-Pesa line blocks activation'
);

select lives_ok(
  $$select public.rpc_activate_rider('dddddddd-0000-0000-0000-000000000001',
      'Name checked against the ID at the Westlands hub; kit handed over.')$$,
  'a written reason is allowed to override both gates'
);

select is(
  (select status::text from public.rider where id = 'dddddddd-0000-0000-0000-000000000001'),
  'active',
  'and the rider goes active'
);

-- --------------------------------------------------------------- rider_public

set local role anon;
/* An empty claims object, not NULL — `set local` takes a string. */
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (select count(*)::int from public.rider_public where id = 'dddddddd-0000-0000-0000-000000000001'),
  1,
  'an active rider is visible to a guest at the gate'
);

select ok(
  not exists (
    select 1 from information_schema.columns
    where table_name = 'rider_public' and column_name in ('phone', 'payout_msisdn')
  ),
  'and their phone number is not part of what a guest can see'
);

select * from finish();
rollback;
