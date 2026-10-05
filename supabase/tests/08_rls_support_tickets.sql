-- RLS on the support desk.
--
-- A ticket carries somebody's name, email, phone number and whatever they
-- chose to tell us. The permission matrix says finance, merchant success,
-- rider ops, HR and the DPO cannot reach the module; before migration
-- 20260101005600 the policies said any staff member could read every row.
-- These tests exist so that cannot come back.
--
-- The module is `messaging` now. Support & tickets folded into it
-- (20260101016900), and these rows are legacy and read-only — but the
-- rule travels with them, and it caught a regression on the way: the
-- new module had been seeded granting finance, merchant ops, rider ops
-- and partnerships access to the whole inbox. Those teams reach a
-- conversation by being escalated into it, which is per-conversation
-- and recorded, not by holding a module grant.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

delete from public.support_message;
delete from public.support_ticket;
delete from public.role_grant;
delete from public.staff_user;

-- ------------------------------------------------------------------- fixtures

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'desk.ops@nexgapp.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'desk.finance@nexgapp.com', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b3333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'desk.guest@example.com', '', now(), now(), now());

insert into public.staff_user (id, user_id, email, display_name) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111', 'desk.ops@nexgapp.com', 'Desk ops'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b2222222-2222-2222-2222-222222222222', 'desk.finance@nexgapp.com', 'Desk finance');

/* ops_manager reaches the messaging module at `full`; finance is `none`. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by) values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   (select id from public.role where key = 'ops_manager'), null,
   'bbbbbbbb-0000-0000-0000-000000000001');

/* finance needs two people, which is not what this file is testing. */
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by) values
  ('bbbbbbbb-0000-0000-0000-000000000002',
   (select id from public.role where key = 'finance'), null,
   'bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');

-- ------------------------------------------------- the Help page writes one

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select isnt(
  public.rpc_support_ticket_create(
    'The rider never arrived and nobody is answering.',
    'guest', 'order_problem', 'Wanjiru Kamau', 'wanjiru@example.com', '+254700111222'
  ),
  null,
  'the Help page can raise a ticket with no session at all'
);

select is(
  (select count(*)::int from public.support_ticket),
  0,
  'and cannot read back a single row of what it just wrote'
);

reset role;
reset request.jwt.claims;

-- ------------------------------------------------------------ the desk reads

set local role authenticated;
set local request.jwt.claims = '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}';

select ok(authz.reaches_module('messaging'), 'ops_manager reaches the messaging module');

select is(
  (select count(*)::int from public.support_ticket),
  1,
  'and sees the ticket'
);

/*
 * Replying here used to work and now must not.
 *
 * Tickets became conversations (20260101016900) and this table
 * is read-only history. Left writable it would be a second
 * place a reply can land, and a reply on a ticket whose
 * transcript now lives in a conversation is a divergence
 * nobody notices until somebody quotes the wrong one.
 */
select throws_matching(
  $$select public.rpc_support_ticket_reply(
      (select id from public.support_ticket limit 1), 'We are calling the rider now.')$$,
  'conversations now',
  'the old reply path is closed, and says where to go instead'
);

select is(
  (select status::text from public.support_ticket limit 1),
  'open',
  'and the ticket is untouched by the attempt'
);

reset role;
reset request.jwt.claims;

-- ------------------------------------------------- finance reaches none of it

set local role authenticated;
set local request.jwt.claims = '{"sub":"b2222222-2222-2222-2222-222222222222","role":"authenticated"}';

select ok(not authz.reaches_module('messaging'),
  'finance does not reach the messaging module — they are escalated into a conversation, not given the inbox');

select is(
  (select count(*)::int from public.support_ticket),
  0,
  'and sees no ticket — the matrix is not just the sidebar'
);

select throws_ok(
  $$select public.rpc_support_ticket_reply(
      (select id from public.support_ticket limit 1), 'Let me help.')$$,
  '42501',
  null,
  'and is refused by the reply RPC, which runs as its owner'
);

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
