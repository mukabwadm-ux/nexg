-- The merchant workspace's 7-minute idle limit binds merchant workspace
-- users only, not staff or customers (20270131000600).

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- ── fixtures: a merchant that came through the new application form

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status)
values ('c1320000-0000-4000-8000-00000000000a', '[Legal 132] Ltd', '[Shop 132]', 'restaurant',
        '[Contact]', '+254700013201', 'shop132@example.test',
        (select id from public.city where slug = 'nairobi'), 'documents_pending');

insert into public.merchant_application (merchant_id, payload)
values ('c1320000-0000-4000-8000-00000000000a', '{}'::jsonb);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1320000-0000-4000-8000-000000000101',
   'authenticated', 'authenticated', 'owner132@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1320000-0000-4000-8000-000000000102',
   'authenticated', 'authenticated', 'customer132@example.test', now(), false, now(), now());

insert into public.merchant_user (merchant_id, user_id, role)
values ('c1320000-0000-4000-8000-00000000000a', 'c1320000-0000-4000-8000-000000000101', 'owner');

-- Every session signed in 20 minutes ago, with no workspace activity since.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('c1320000-0000-4000-8000-0000000005a1', 'c1320000-0000-4000-8000-000000000101',
   now() - interval '20 minutes', now() - interval '20 minutes'),
  ('c1320000-0000-4000-8000-0000000005a2', 'c1320000-0000-4000-8000-000000000102',
   now() - interval '20 minutes', now() - interval '20 minutes'),
  ('c1320000-0000-4000-8000-0000000005a3',
   (select su.user_id from public.staff_user su
      join public.role_grant rg on rg.staff_user_id = su.id and rg.revoked_at is null
      join public.role r on r.id = rg.role_id and r.key = 'super_admin'
     where su.status = 'active' limit 1),
   now() - interval '20 minutes', now() - interval '20 minutes');

create temp table t_as (who text primary key, claims text);
insert into t_as values
  ('owner', '{"sub":"c1320000-0000-4000-8000-000000000101","role":"authenticated","session_id":"c1320000-0000-4000-8000-0000000005a1"}'),
  ('customer', '{"sub":"c1320000-0000-4000-8000-000000000102","role":"authenticated","session_id":"c1320000-0000-4000-8000-0000000005a2"}'),
  ('staff', json_build_object('sub', (select user_id from auth.sessions
      where id = 'c1320000-0000-4000-8000-0000000005a3'), 'role', 'authenticated',
      'session_id', 'c1320000-0000-4000-8000-0000000005a3')::text);
grant select on t_as to authenticated;

-- ── a merchant member idle for 20 minutes is signed out, as before

select set_config('request.jwt.claims', (select claims from t_as where who = 'owner'), true);
select is((authz.merchant_application_session() ->> 'valid')::boolean, false,
  'A merchant member idle past the limit is no longer current.');
select is(authz.merchant_application_session() ->> 'reason', 'session_expired',
  'And is told it expired.');

insert into public.merchant_application_session_activity (session_id, user_id, last_activity_at)
values ('c1320000-0000-4000-8000-0000000005a1', 'c1320000-0000-4000-8000-000000000101', now());
select is((authz.merchant_application_session() ->> 'valid')::boolean, true,
  'Workspace activity a moment ago keeps the member current.');

-- ── staff are not bound by the merchant workspace limit

select set_config('request.jwt.claims', (select claims from t_as where who = 'staff'), true);
select is((authz.merchant_application_session() ->> 'valid')::boolean, true,
  'Staff signed in 20 minutes ago are still current for merchant reads.');
select ok(authz.merchant_application_session() ? 'expires_at',
  'The expiry times are still returned.');

set local role authenticated;
select lives_ok(
  $$select public.rpc_merchant_application_review_lookup('c1320000-0000-4000-8000-00000000000a')$$,
  'The admin merchant page''s lookup answers a staff member 20 minutes after sign-in.');
select is(
  (select count(*)::int from public.merchant where id = 'c1320000-0000-4000-8000-00000000000a'),
  1, 'And staff still see the merchant through RLS.');
reset role;

-- ── nor are customers

select set_config('request.jwt.claims', (select claims from t_as where who = 'customer'), true);
select is((authz.merchant_application_session() ->> 'valid')::boolean, true,
  'A signed-in customer belonging to no merchant is not timed out by the merchant rule.');
select is(authz.merchant_application_record_session_valid('c1320000-0000-4000-8000-00000000000a'),
  true, 'So the restrictive session gate does not hide this merchant''s rows from them.');

-- ── an unknown session is still refused

select set_config('request.jwt.claims',
  '{"sub":"c1320000-0000-4000-8000-000000000102","role":"authenticated","session_id":"c1320000-0000-4000-8000-0000000005ff"}',
  true);
select is((authz.merchant_application_session() ->> 'valid')::boolean, false,
  'A session that does not exist is still not current, for anybody.');

select * from finish();
rollback;
