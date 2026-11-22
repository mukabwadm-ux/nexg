-- Signing out one device from the Devices tab (20270131000700).

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- ── fixtures: one shared super admin account, signed in on two devices

create temp table t_ids as
select su.user_id as uid
  from public.staff_user su
  join public.role_grant rg on rg.staff_user_id = su.id and rg.revoked_at is null
  join public.role r on r.id = rg.role_id and r.key = 'super_admin'
 where su.status = 'active'
 limit 1;
grant select on t_ids to authenticated;

insert into auth.sessions (id, user_id, created_at, updated_at)
select s.id, (select uid from t_ids), now(), now()
  from (values ('c1330000-0000-4000-8000-0000000005a1'::uuid),
               ('c1330000-0000-4000-8000-0000000005b1'::uuid)) s(id);

insert into audit.sign_in (staff_user_id, email_attempted, outcome, device_fingerprint,
                           device_label, session_id)
select su.id, su.email, 'success', d.device, d.label, d.sid
  from public.staff_user su,
       (values ('devicemine0000000000000000000001', 'Chrome · Windows', 'c1330000-0000-4000-8000-0000000005a1'),
               ('deviceother000000000000000000001', 'Safari · iPhone', 'c1330000-0000-4000-8000-0000000005b1'))
         d(device, label, sid)
 where su.user_id = (select uid from t_ids);

-- I am on my laptop (device "mine", session a1).
select set_config('request.headers',
  '{"x-nexg-device":"devicemine0000000000000000000001"}', true);
select set_config('request.jwt.claims', json_build_object(
  'sub', (select uid from t_ids), 'role', 'authenticated',
  'session_id', 'c1330000-0000-4000-8000-0000000005a1')::text, true);

set local role authenticated;

select throws_ok(
  $$select public.rpc_audit_sign_out_device('deviceother000000000000000000001', '  ')$$,
  '23514', 'Say why this device is being signed out.', 'A reason is required.');
select throws_ok(
  $$select public.rpc_audit_sign_out_device('devicemine0000000000000000000001', 'test')$$,
  '23514', 'This is the browser you are using. Use Sign out instead.',
  'The browser I am using cannot sign itself out here.');

select is(
  (public.rpc_audit_sign_out_device('deviceother000000000000000000001', 'Not ours any more') ->> 'sessions_ended')::int,
  1, 'The other device''s session is ended.');

reset role;

select ok(not exists (select 1 from auth.sessions where id = 'c1330000-0000-4000-8000-0000000005b1'),
  'Its Supabase session is gone.');
select ok(exists (select 1 from auth.sessions where id = 'c1330000-0000-4000-8000-0000000005a1'),
  'Mine is untouched.');
select is(
  (select ended_reason from audit.sign_in where session_id = 'c1330000-0000-4000-8000-0000000005b1'),
  'revoked', 'Its sign-in shows as revoked.');
select is(
  (select ended_at from audit.sign_in where session_id = 'c1330000-0000-4000-8000-0000000005a1'),
  null, 'Mine is still open.');
select is(
  (select reason from audit.audit_event where action = 'auth.sessions_revoked'
     and after ->> 'device_id' = 'deviceother000000000000000000001' order by id desc limit 1),
  'Not ours any more', 'The sign-out is in the audit log with its reason.');

-- Somebody who is not a super admin cannot.
select set_config('request.jwt.claims',
  '{"sub":"c1330000-0000-4000-8000-000000000999","role":"authenticated"}', true);
set local role authenticated;
select throws_ok(
  $$select public.rpc_audit_sign_out_device('devicemine0000000000000000000001', 'test')$$,
  '42501', 'Only a super admin can sign a device out.', 'Only a super admin can.');
reset role;

select * from finish();
rollback;
