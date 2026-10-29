begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000',
   'f6666666-6666-4666-8666-666666666666',
   'authenticated', 'authenticated', 'retention.ops@example.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   'f7777777-7777-4777-8777-777777777777',
   'authenticated', 'authenticated', 'retention.owner@example.test', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name)
values (
  'ffff6666-0000-0000-0000-000000000001',
  'f6666666-6666-4666-8666-666666666666',
  'retention.ops@example.test',
  'Retention Ops'
);

insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
select
  'ffff6666-0000-0000-0000-000000000001',
  r.id,
  c.id,
  'ffff6666-0000-0000-0000-000000000001'
from public.role r
cross join public.city c
where r.key = 'merchant_ops' and c.slug = 'nairobi';

insert into public.merchant (
  id, legal_name, trading_name, category, contact_name, contact_phone,
  contact_email, city_id, status, accepting_orders, went_live_at
)
select
  'aaaa6666-0000-4000-8000-000000000001',
  'Retention Merchant Ltd',
  'Retention Merchant',
  'restaurant',
  'Retention Owner',
  '+254700000066',
  'retention.merchant@example.test',
  c.id,
  'live',
  true,
  now()
from public.city c
where c.slug = 'nairobi';

insert into public.merchant_user (merchant_id, user_id)
values (
  'aaaa6666-0000-4000-8000-000000000001',
  'f7777777-7777-4777-8777-777777777777'
);

insert into ledger.account (
  code, base, name, kind, party_type, party_id, normal_side
)
values (
  'test:aaaa6666-0000-4000-8000-000000000001',
  'test',
  'Merchant retention history',
  'asset',
  'merchant',
  'aaaa6666-0000-4000-8000-000000000001',
  'D'
);

select is(
  (select retain_for from public.retention_rule where key = 'merchant_deleted'),
  interval '90 days',
  'the deletion window follows the configured 90-day retention rule'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.rpc_merchant_delete_draft(uuid,text,text)',
    'execute'
  ),
  'the old immediate-delete RPC is unavailable to application roles'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f6666666-6666-4666-8666-666666666666","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_soft_delete(
    'aaaa6666-0000-4000-8000-000000000001',
    'Retention Merchant',
    'Business closure')$$,
  'authorized staff can move a merchant to Deleted'
);

reset role;
reset request.jwt.claims;

select ok(
  (select deleted_at is not null
      and deleted_until > deleted_at
      and status = 'paused'
      and not accepting_orders
      and not featured
      and not explore_visible
      and not concierge_pick
   from public.merchant where id = 'aaaa6666-0000-4000-8000-000000000001'),
  'deletion hides and disables the merchant for a 90-day window'
);

select is(
  (select count(*)::int from public.merchant_public
   where id = 'aaaa6666-0000-4000-8000-000000000001'),
  0,
  'deleted merchants are never publicly listed'
);

select is(
  (select count(*)::int from public.console_merchant_deleted_v
   where id = 'aaaa6666-0000-4000-8000-000000000001'),
  1,
  'the deleted merchant appears in the recovery tab'
);

select is(
  (select count(*)::int from public.console_merchant_directory_v
   where id = 'aaaa6666-0000-4000-8000-000000000001'),
  0,
  'deleted merchant is removed from the active directory'
);

select is(
  (select count(*)::int from public.console_merchant_deactivated_v
   where id = 'aaaa6666-0000-4000-8000-000000000001'),
  0,
  'deleted merchant is not mixed into the Deactivated tab'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f7777777-7777-4777-8777-777777777777","role":"authenticated"}';

select ok(
  not authz.is_merchant_member('aaaa6666-0000-4000-8000-000000000001'),
  'merchant members lose access while the merchant is deleted'
);

select is(
  (select count(*)::int from public.merchant_user
   where merchant_id = 'aaaa6666-0000-4000-8000-000000000001'),
  0,
  'merchant memberships are removed during deletion'
);

reset role;
reset request.jwt.claims;

select throws_ok(
  $$insert into public.merchant_user (merchant_id, user_id)
    values (
      'aaaa6666-0000-4000-8000-000000000001',
      'f7777777-7777-4777-8777-777777777777'
    )$$,
  '23514',
  'Deleted merchants cannot add team members or invitations.',
  'team membership cannot be added while a merchant is deleted'
);

select throws_ok(
  $$insert into public.merchant_invite (merchant_id, contact)
    values ('aaaa6666-0000-4000-8000-000000000001', '+254700000077')$$,
  '23514',
  'Deleted merchants cannot add team members or invitations.',
  'team invitations cannot be created while a merchant is deleted'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f6666666-6666-4666-8666-666666666666","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_restore_deleted(
    'aaaa6666-0000-4000-8000-000000000001',
    'Deletion was requested in error')$$,
  'authorized staff can restore within the recovery window'
);

reset role;
reset request.jwt.claims;

select ok(
  (select deleted_at is null
      and status = 'paused'
      and not accepting_orders
      and not explore_visible
   from public.merchant where id = 'aaaa6666-0000-4000-8000-000000000001'),
  'restoration does not automatically make the merchant public or accepting orders'
);

select is(
  (select count(*)::int from public.merchant_user
   where merchant_id = 'aaaa6666-0000-4000-8000-000000000001'
     and user_id = 'f7777777-7777-4777-8777-777777777777'),
  1,
  'restoration reinstates existing team access during the recovery window'
);

select ok(
  exists (
    select 1 from audit.audit_event
    where action = 'merchant.restored'
      and target_id = 'aaaa6666-0000-4000-8000-000000000001'
  ),
  'restoration is recorded in the audit log'
);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f6666666-6666-4666-8666-666666666666","role":"authenticated"}';

select lives_ok(
  $$select public.rpc_merchant_soft_delete(
    'aaaa6666-0000-4000-8000-000000000001',
    'Retention Merchant',
    'Final closure')$$,
  'a restored merchant can be moved to Deleted again'
);

reset role;
reset request.jwt.claims;

update public.merchant
set deleted_until = now() - interval '1 second'
where id = 'aaaa6666-0000-4000-8000-000000000001';

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"f6666666-6666-4666-8666-666666666666","role":"authenticated"}';

select throws_ok(
  $$select public.rpc_merchant_restore_deleted(
    'aaaa6666-0000-4000-8000-000000000001',
    'Late recovery')$$,
  '23514',
  null,
  'restoration is refused after the recovery window expires'
);

reset role;
reset request.jwt.claims;

select is(
  public.cron_merchant_deleted_retention(),
  1,
  'the retention job processes expired merchant profiles'
);

select ok(
  (select deleted_anonymized_at is not null
      and trading_name like 'Deleted merchant %'
      and contact_email like 'deleted+%@retained.invalid'
      and settlement_account is null
   from public.merchant where id = 'aaaa6666-0000-4000-8000-000000000001'),
  'expired profile identifiers are anonymized'
);

select ok(
  exists (
    select 1 from ledger.account
    where party_type = 'merchant'
      and party_id = 'aaaa6666-0000-4000-8000-000000000001'
  ),
  'financial history remains linked after profile anonymization'
);

select is(
  (select count(*)::int from public.merchant_user
   where merchant_id = 'aaaa6666-0000-4000-8000-000000000001'),
  0,
  'merchant membership is removed after retention expires'
);

select ok(
  exists (
    select 1 from audit.audit_event
    where action = 'merchant.retention_anonymized'
      and target_id = 'aaaa6666-0000-4000-8000-000000000001'
  ),
  'profile anonymization is recorded in the audit log'
);

select * from finish();
rollback;
