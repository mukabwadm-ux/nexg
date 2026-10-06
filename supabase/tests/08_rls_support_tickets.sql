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
create temp table t_support (k text primary key, v text);

/* The temp schema is per-session and named unpredictably, so
   the grant has to be looked up. Without it the first write
   after `set role anon` is refused. */
do $grant$
begin
  execute format('grant usage on schema %I to anon, authenticated',
                 (select nspname from pg_namespace n join pg_class c on c.relnamespace = n.oid
                   where c.relname = 't_support' and n.nspname like 'pg_temp%'));
end
$grant$;
grant all on t_support to anon, authenticated;
select plan(12);

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
--
-- The Help page writes a conversation now, not a ticket
-- (20260101017200), so the public write path under test is
-- `rpc_msg_contact`. The ticket below is planted directly: it is
-- legacy history, and what the rest of this file checks is who
-- may read it.

insert into public.support_ticket
  (reference, channel, from_role, topic, full_name, email, phone, body, city_id, status)
values
  ('TKT-TEST-1', 'web_form', 'guest', 'order_problem', 'Wanjiru Kamau',
   'wanjiru@example.com', '+254700111222',
   'The rider never arrived and nobody is answering.',
   (select id from public.city where slug = 'nairobi'), 'open');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select is(
  (public.rpc_msg_contact('Wanjiru', 'wanjiru@example.com', 'my_order',
     'The rider never arrived and nobody is answering.', 'nairobi', true) ->> 'ok')::boolean,
  true,
  'the Help page can reach the desk with no session at all'
);

select is(
  (select count(*)::int from public.support_ticket),
  0,
  'and an anonymous caller reads back not one row of what is in there'
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

select lives_ok(
  $$ select public.rpc_support_ticket_reply(
       (select id from public.support_ticket limit 1), 'We are calling the rider now.') $$,
  'and can reply to it'
);

select is(
  (select status::text from public.support_ticket limit 1),
  'answered',
  'which moves the ticket on'
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

-- ───────────────────────── what the forms capture
--
-- The homepage card used to write to `waitlist_signup`, a table
-- nobody works through, and took no contact detail at all — so
-- a concierge request arrived with what somebody wanted and no
-- way to tell them it was coming. It raises a ticket now, and
-- carries the answers as fields rather than only as a
-- paragraph.

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into t_support (k, v) select 'ref',
  public.rpc_support_ticket_create(
    p_body => 'Drinks — as soon as possible.',
    p_from_role => 'guest',
    p_topic => 'concierge_request',
    p_phone => '+254700000888',
    p_full_name => 'Asha',
    p_source_form => 'homepage_order',
    p_details => jsonb_build_object('need', 'Drinks', 'when', 'asap',
                                    'zone', 'Kilimani', 'notes', 'nut allergy')
  ) ->> 'reference';

select isnt((select v from t_support where k = 'ref'), null,
  'The homepage card raises a ticket with no session, and gets a reference back.');

reset role;

select is(
  (select source_form from public.support_ticket
    where reference = (select v from t_support where k = 'ref')),
  'homepage_order',
  'The desk can see which form it came from.');

select is(
  (select details ->> 'notes' from public.support_ticket
    where reference = (select v from t_support where k = 'ref')),
  'nut allergy',
  'And every answer the form asked for, as a field rather than buried in a paragraph.');

select * from finish();
rollback;
