-- The developer console keeps a merchant's sign-in alive while it is used
-- (20270203000500): rpc_developer_session says where the caller's own sign-in
-- stands without needing a merchant, records activity only for a current
-- one, and gives no deadline where nothing binds the sign-in.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- ── fixtures: a merchant from the application form, its owner, a customer

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status)
values ('c1370000-0000-4000-8000-00000000000a', '[Legal 137] Ltd', '[Shop 137]', 'restaurant',
        '[Contact]', '+254700013701', 'shop137@example.test',
        (select id from public.city where slug = 'nairobi'), 'documents_pending');

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1370000-0000-4000-8000-000000000101',
   'authenticated', 'authenticated', 'owner137@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1370000-0000-4000-8000-000000000102',
   'authenticated', 'authenticated', 'customer137@example.test', now(), false, now(), now());

insert into public.merchant_user (merchant_id, user_id, role)
values ('c1370000-0000-4000-8000-00000000000a', 'c1370000-0000-4000-8000-000000000101', 'owner');

-- After the member: a merchant with an application only takes members from a live session.
insert into public.merchant_application (merchant_id, payload)
values ('c1370000-0000-4000-8000-00000000000a', '{}'::jsonb);

-- The owner signed in 20 minutes ago (idle since) and again 2 minutes ago;
-- the customer and a staff member 20 minutes ago.
insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('c1370000-0000-4000-8000-0000000005a1', 'c1370000-0000-4000-8000-000000000101',
   now() - interval '20 minutes', now() - interval '20 minutes'),
  ('c1370000-0000-4000-8000-0000000005a2', 'c1370000-0000-4000-8000-000000000101',
   now() - interval '2 minutes', now() - interval '2 minutes'),
  ('c1370000-0000-4000-8000-0000000005a3', 'c1370000-0000-4000-8000-000000000102',
   now() - interval '20 minutes', now() - interval '20 minutes'),
  ('c1370000-0000-4000-8000-0000000005a4',
   (select su.user_id from public.staff_user su
      join public.role_grant rg on rg.staff_user_id = su.id and rg.revoked_at is null
      join public.role r on r.id = rg.role_id and r.key = 'super_admin'
     where su.status = 'active' limit 1),
   now() - interval '20 minutes', now() - interval '20 minutes');

create temp table t_as (who text primary key, claims text);
insert into t_as values
  ('idle owner', '{"sub":"c1370000-0000-4000-8000-000000000101","role":"authenticated","session_id":"c1370000-0000-4000-8000-0000000005a1"}'),
  ('busy owner', '{"sub":"c1370000-0000-4000-8000-000000000101","role":"authenticated","session_id":"c1370000-0000-4000-8000-0000000005a2"}'),
  ('customer', '{"sub":"c1370000-0000-4000-8000-000000000102","role":"authenticated","session_id":"c1370000-0000-4000-8000-0000000005a3"}'),
  ('staff', json_build_object('sub', (select user_id from auth.sessions
      where id = 'c1370000-0000-4000-8000-0000000005a4'), 'role', 'authenticated',
      'session_id', 'c1370000-0000-4000-8000-0000000005a4')::text);
grant select on t_as to authenticated;

-- ── wiring

select ok(
  has_function_privilege('authenticated', 'public.rpc_developer_session(boolean)', 'execute')
    and not has_function_privilege('anon', 'public.rpc_developer_session(boolean)', 'execute'),
  'signed-in callers can ask about their own sign-in; anonymous ones cannot');

select is(
  (select count(*)::int from public.fn_wiring_check() where finding ilike '%rpc_developer_session%'),
  0,
  'the wiring check accepts it: a session heartbeat, recorded in the activity table');

set local role authenticated;

-- ── a merchant's developer idle past the limit

select set_config('request.jwt.claims', (select claims from t_as where who = 'idle owner'), true);

select is(
  public.rpc_developer_session(),
  '{"valid": false, "reason": "session_expired"}'::jsonb,
  'an owner idle for 20 minutes has lapsed, and the console is told why');

select is(
  public.rpc_developer_session(true) -> 'valid',
  'false'::jsonb,
  'reporting activity cannot bring a lapsed sign-in back');

reset role;
select is(
  (select count(*)::int from public.merchant_application_session_activity
    where session_id = 'c1370000-0000-4000-8000-0000000005a1'),
  0,
  'and nothing was recorded for it');
set local role authenticated;

-- ── a busy one

select set_config('request.jwt.claims', (select claims from t_as where who = 'busy owner'), true);

select is(
  public.rpc_developer_session(true),
  jsonb_build_object('valid', true, 'expires_at', now() + interval '7 minutes'),
  'activity keeps a current sign-in going for another 7 minutes, without naming a merchant');

reset role;
select is(
  (select last_activity_at from public.merchant_application_session_activity
    where session_id = 'c1370000-0000-4000-8000-0000000005a2'),
  now(),
  'the activity is recorded against that sign-in');

update public.merchant_application_command_budget set remaining = 0, updated_at = clock_timestamp()
where actor_id = 'c1370000-0000-4000-8000-000000000101';
set local role authenticated;
select set_config('request.jwt.claims', (select claims from t_as where who = 'busy owner'), true);

select is(
  public.rpc_developer_session(true) -> 'valid',
  'true'::jsonb,
  'over the activity budget the sign-in still answers: the last report stands');

-- ── sign-ins nothing binds

select set_config('request.jwt.claims', (select claims from t_as where who = 'customer'), true);

select is(
  public.rpc_developer_session(true),
  '{"valid": true, "expires_at": null}'::jsonb,
  'an account with no merchant is current, with no deadline for the console to watch');

select set_config('request.jwt.claims', (select claims from t_as where who = 'staff'), true);

select is(
  public.rpc_developer_session(),
  '{"valid": true, "expires_at": null}'::jsonb,
  'so is staff');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);

select is(
  public.rpc_developer_session() -> 'valid',
  'false'::jsonb,
  'and a call with no sign-in is not current');

reset role;

select * from finish();
rollback;
