begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   'f4444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'lifecycle.ops@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'f5555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'lifecycle.stranger@example.test', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values (
  'ffff4444-0000-0000-0000-000000000001',
  'f4444444-4444-4444-4444-444444444444',
  'lifecycle.ops@example.test',
  'Lifecycle Ops'
);

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select
  'ffff4444-0000-0000-0000-000000000001',
  r.id,
  c.id,
  'ffff4444-0000-0000-0000-000000000001'
from public.role r
cross join public.city c
where r.key = 'merchant_ops' and c.slug = 'nairobi';

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status, accepting_orders, went_live_at
)
select
  'aaaa4444-0000-4000-8000-000000000001',
  'Lifecycle Live Ltd',
  'Lifecycle Live',
  'restaurant',
  'Lifecycle Contact',
  '+254700000044',
  'lifecycle.live@example.test',
  c.id,
  'live',
  true,
  now()
from public.city c
where c.slug = 'nairobi';

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status
)
select
  'aaaa4444-0000-4000-8000-000000000002',
  'Lifecycle Draft Ltd',
  'Lifecycle Draft',
  'restaurant',
  'Lifecycle Contact',
  '+254700000045',
  'lifecycle.draft@example.test',
  c.id,
  'applied'
from public.city c
where c.slug = 'nairobi';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f4444444-4444-4444-4444-444444444444","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_set_deactivated(
    'aaaa4444-0000-4000-8000-000000000001', true, 'Admin review')$$,
  'merchant operations can deactivate a merchant in their city'
);

reset role;
reset request.jwt.claims;

select is(
  (select status::text from public.merchant
   where id = 'aaaa4444-0000-4000-8000-000000000001'),
  'paused',
  'deactivation pauses a live listing'
);

select ok(
  (select deactivated_at is not null from public.merchant
   where id = 'aaaa4444-0000-4000-8000-000000000001'),
  'deactivation is explicitly marked'
);

select is(
  (select count(*)::int from public.merchant_public
   where id = 'aaaa4444-0000-4000-8000-000000000001'),
  0,
  'deactivated merchant is no longer public'
);

select is(
  (select count(*)::int from public.console_merchant_deactivated_v
   where id = 'aaaa4444-0000-4000-8000-000000000001'),
  1,
  'deactivated merchant appears in the Deactivated tab'
);

select is(
  (select count(*)::int from public.console_merchant_directory_v
   where id = 'aaaa4444-0000-4000-8000-000000000001'),
  0,
  'deactivated merchant is removed from the active directory'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f4444444-4444-4444-4444-444444444444","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_merchant_set_paused(
    'aaaa4444-0000-4000-8000-000000000001', false, 'Resume')$$,
  '23514',
  null,
  'the ordinary pause action cannot bypass deactivation'
);

reset role;
reset request.jwt.claims;

select ok(
  (select status = 'paused' and deactivated_at is not null
   from public.merchant where id = 'aaaa4444-0000-4000-8000-000000000001'),
  'failed pause-resume attempt leaves the merchant deactivated'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f4444444-4444-4444-4444-444444444444","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_set_deactivated(
    'aaaa4444-0000-4000-8000-000000000001', false, 'Reapproved')$$,
  'merchant operations can reactivate it'
);

reset role;
reset request.jwt.claims;

select is(
  (select status::text from public.merchant
   where id = 'aaaa4444-0000-4000-8000-000000000001'),
  'live',
  'reactivation restores the prior live status'
);

select ok(
  (select not accepting_orders and deactivated_at is null
   from public.merchant where id = 'aaaa4444-0000-4000-8000-000000000001'),
  'reactivation leaves order intake off and clears the deactivation marker'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f4444444-4444-4444-4444-444444444444","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_soft_delete(
    'aaaa4444-0000-4000-8000-000000000002',
    'Lifecycle Draft',
    'Duplicate application')$$,
  'merchant operations can move an unsubmitted draft to Deleted'
);

reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.merchant
   where id = 'aaaa4444-0000-4000-8000-000000000002'),
  1,
  'deleted draft remains available during the retention window'
);

select ok(
  (select deleted_at is not null and deleted_until > now()
   from public.merchant where id = 'aaaa4444-0000-4000-8000-000000000002'),
  'deleted draft has a 90-day recovery window'
);

select ok(
  exists (
    select 1 from audit.audit_event
    where action = 'merchant.deleted'
      and target_id = 'aaaa4444-0000-4000-8000-000000000002'
  ),
  'deletion remains in the immutable audit log'
);

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status, submitted_at
)
select
  'aaaa4444-0000-4000-8000-000000000003',
  'Submitted Draft Ltd',
  'Submitted Draft',
  'restaurant',
  'Lifecycle Contact',
  '+254700000046',
  'lifecycle.submitted@example.test',
  c.id,
  'under_review',
  now()
from public.city c
where c.slug = 'nairobi';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f4444444-4444-4444-4444-444444444444","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_soft_delete(
    'aaaa4444-0000-4000-8000-000000000003',
    'Submitted Draft',
    'No longer needed')$$,
  'a submitted application can be moved to Deleted without removing its history'
);

reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.merchant
   where id = 'aaaa4444-0000-4000-8000-000000000003'),
  1,
  'submitted application remains available during retention'
);

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status
)
select
  'aaaa4444-0000-4000-8000-000000000004',
  'Financial Draft Ltd',
  'Financial Draft',
  'restaurant',
  'Lifecycle Contact',
  '+254700000047',
  'lifecycle.financial@example.test',
  c.id,
  'applied'
from public.city c
where c.slug = 'nairobi';

insert into ledger.account (
  code, base, name, kind, party_type, party_id, normal_side
)
values (
  'test:aaaa4444-0000-4000-8000-000000000004',
  'test',
  'Lifecycle financial guard',
  'asset',
  'merchant',
  'aaaa4444-0000-4000-8000-000000000004',
  'D'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f4444444-4444-4444-4444-444444444444","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_soft_delete(
    'aaaa4444-0000-4000-8000-000000000004',
    'Financial Draft',
    'No longer needed')$$,
  'a merchant with financial history can be moved to Deleted'
);

reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.merchant
   where id = 'aaaa4444-0000-4000-8000-000000000004'),
  1,
  'financially linked merchant remains intact'
);

select ok(
  exists (
    select 1 from ledger.account
    where party_type = 'merchant'
      and party_id = 'aaaa4444-0000-4000-8000-000000000004'
  ),
  'financial history remains linked after deletion'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f5555555-5555-5555-5555-555555555555","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_merchant_set_deactivated(
    'aaaa4444-0000-4000-8000-000000000001', true, 'Unauthorized')$$,
  '42501',
  null,
  'a non-staff user cannot deactivate a merchant'
);

reset role;
reset request.jwt.claims;

select ok(
  (select deactivated_at is null from public.merchant
   where id = 'aaaa4444-0000-4000-8000-000000000001'),
  'unauthorized attempt changes nothing'
);

select * from finish();
rollback;
