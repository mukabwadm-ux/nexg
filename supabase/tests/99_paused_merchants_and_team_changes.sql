-- Expired documents pause a live merchant without breaking the nightly job,
-- and an owner can change their team (20270101000200 to 0400).

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- ── fixtures

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status,
                             explore_visible, accepting_orders, concierge_pick, went_live_at)
values
  ('c0990000-0000-4000-8000-00000000000a', '[Legal 99a] Ltd', '[Shop 99a]', 'restaurant',
   '[Contact]', '+254700009901', 'shop99a@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, true, now() - interval '90 days'),
  ('c0990000-0000-4000-8000-00000000000d', '[Legal 99d] Ltd', '[Shop 99d]', 'restaurant',
   '[Contact]', '+254700009904', 'shop99d@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, false, now() - interval '90 days'),
  ('c0990000-0000-4000-8000-00000000000e', '[Legal 99e] Ltd', '[Shop 99e]', 'restaurant',
   '[Contact]', '+254700009905', 'shop99e@example.test',
   (select id from public.city where slug = 'nairobi'), 'live', true, true, false, now() - interval '90 days');

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, accepting_orders)
values ('c0990000-0000-4000-8000-00000000000f', '[Legal 99f] Ltd', '[Shop 99f]', 'restaurant',
        '[Contact]', '+254700009906', 'shop99f@example.test',
        (select id from public.city where slug = 'nairobi'), 'documents_pending', false);

-- ── a live merchant taking orders, whose permit lapsed yesterday

insert into public.document (id, owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
                             status, reviewed_at, expires_at)
values ('c0990000-0000-4000-8000-0000000000d1', 'merchant', 'c0990000-0000-4000-8000-00000000000a',
        (select id from public.fn_merchant_required_docs('c0990000-0000-4000-8000-00000000000a') limit 1),
        'merchant/c0990000/a.pdf', 'application/pdf', 1024, 'verified', now() - interval '1 year',
        current_date - 1);

select lives_ok($$select public.fn_expire_documents()$$,
  'The nightly expiry runs while a live merchant taking orders has a lapsed document.');
select is((select status::text from public.document where id = 'c0990000-0000-4000-8000-0000000000d1'),
  'expired', 'The lapsed document is marked expired.');
select is((select status::text from public.merchant where id = 'c0990000-0000-4000-8000-00000000000a'),
  'paused', 'The merchant is paused.');
select is((select accepting_orders from public.merchant where id = 'c0990000-0000-4000-8000-00000000000a'),
  false, 'A paused merchant takes no orders.');
select is((select concierge_pick from public.merchant where id = 'c0990000-0000-4000-8000-00000000000a'),
  false, 'And is nobody''s concierge pick.');

-- ── one document that cannot expire no longer stops the rest

insert into public.document (id, owner_type, owner_id, requirement_id, storage_path, mime, size_bytes,
                             status, reviewed_at, expires_at)
values
  ('c0990000-0000-4000-8000-0000000000d4', 'merchant', 'c0990000-0000-4000-8000-00000000000d',
   (select id from public.fn_merchant_required_docs('c0990000-0000-4000-8000-00000000000d') limit 1),
   'merchant/c0990000/d.pdf', 'application/pdf', 1024, 'verified', now() - interval '1 year',
   current_date - 1),
  ('c0990000-0000-4000-8000-0000000000d5', 'merchant', 'c0990000-0000-4000-8000-00000000000e',
   (select id from public.fn_merchant_required_docs('c0990000-0000-4000-8000-00000000000e') limit 1),
   'merchant/c0990000/e.pdf', 'application/pdf', 1024, 'verified', now() - interval '1 year',
   current_date - 1);

create function public.tg_test99_refuse() returns trigger language plpgsql as $$
begin
  if new.id = 'c0990000-0000-4000-8000-0000000000d4' and new.status = 'expired' then
    raise exception 'Refused for test 99.';
  end if;
  return new;
end;
$$;
create trigger test99_refuse before update on public.document
  for each row execute function public.tg_test99_refuse();

select lives_ok($$select public.fn_expire_documents()$$,
  'A document whose expiry fails does not stop the job.');
select is((select status::text from public.document where id = 'c0990000-0000-4000-8000-0000000000d5'),
  'expired', 'The other lapsed documents still expire.');
select is((select status::text from public.document where id = 'c0990000-0000-4000-8000-0000000000d4'),
  'verified', 'The one that failed is left as it was, for the next run.');

drop trigger test99_refuse on public.document;

-- ── an owner changes the team

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0990000-0000-4000-8000-000000000101',
   'authenticated', 'authenticated', 'owner99@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0990000-0000-4000-8000-000000000102',
   'authenticated', 'authenticated', 'manager99@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0990000-0000-4000-8000-000000000103',
   'authenticated', 'authenticated', 'member99@example.test', now(), false, now(), now());

insert into public.merchant_user (merchant_id, user_id, role)
values
  ('c0990000-0000-4000-8000-00000000000f', 'c0990000-0000-4000-8000-000000000101', 'owner'),
  ('c0990000-0000-4000-8000-00000000000f', 'c0990000-0000-4000-8000-000000000102', 'manager'),
  ('c0990000-0000-4000-8000-00000000000f', 'c0990000-0000-4000-8000-000000000103', 'manager');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0990000-0000-4000-8000-000000000101","role":"authenticated"}', true);

select is((public.rpc_merchant_membership_update('c0990000-0000-4000-8000-00000000000f',
            'c0990000-0000-4000-8000-000000000101', '', null, '{"refunds": true}'::jsonb)).role::text,
  'owner', 'The only owner can change their own permissions without touching their role.');
select is((public.rpc_merchant_membership_update('c0990000-0000-4000-8000-00000000000f',
            'c0990000-0000-4000-8000-000000000103', 'owner')).role::text,
  'owner', 'An owner can make a manager an owner.');
select is((public.rpc_merchant_membership_update('c0990000-0000-4000-8000-00000000000f',
            'c0990000-0000-4000-8000-000000000103', 'cashier')).role::text,
  'cashier', 'Or a cashier, which the team screen offers.');
select throws_ok(
  $$select public.rpc_merchant_membership_update('c0990000-0000-4000-8000-00000000000f',
      'c0990000-0000-4000-8000-000000000103', 'chef')$$,
  '22023', 'There is no chef role on a team.', 'A role that does not exist is refused by name.');

select set_config('request.jwt.claims',
  '{"sub":"c0990000-0000-4000-8000-000000000102","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_merchant_membership_update('c0990000-0000-4000-8000-00000000000f',
      'c0990000-0000-4000-8000-000000000102', 'owner')$$,
  '42501', 'Only an owner can change the team.', 'A manager cannot make themselves an owner.');

select set_config('request.jwt.claims',
  '{"sub":"c0990000-0000-4000-8000-000000000101","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_merchant_membership_update('c0990000-0000-4000-8000-00000000000f',
      'c0990000-0000-4000-8000-000000000101', 'manager')$$,
  '23503', 'That is the only owner. Make somebody else an owner first.',
  'The only owner still cannot demote themselves.');

reset role;

select * from finish();
rollback;
