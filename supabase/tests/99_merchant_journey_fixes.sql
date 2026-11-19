-- A new merchant's team, setup checklist and review, fixed after the
-- 18 Nov 2026 system test (20270110000100 to 0300).

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ── fixtures

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status, accepting_orders)
values
  ('c1100000-0000-4000-8000-0000000000a1', '[Legal 110a] Ltd', '[Shop 110a]', 'restaurant',
   '[Contact]', '+254700011001', 'shop110a@example.test',
   (select id from public.city where slug = 'nairobi'), 'documents_pending', false),
  ('c1100000-0000-4000-8000-0000000000a2', '[Legal 110b] Ltd', '[Shop 110b]', 'restaurant',
   '[Contact]', '+254700011002', 'shop110b@example.test',
   (select id from public.city where slug = 'nairobi'), 'documents_pending', false);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000101',
   'authenticated', 'authenticated', 'owner110@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000102',
   'authenticated', 'authenticated', 'manager110@example.test', now(), false, now(), now()),
  -- the invited person, signed up with the address in another case
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000103',
   'authenticated', 'authenticated', 'New.Person110@Example.test', now(), false, now(), now()),
  -- somebody who typed the same address but never confirmed it
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000104',
   'authenticated', 'authenticated', 'pending.person110@example.test', null, false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000105',
   'authenticated', 'authenticated', 'later.person110@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c1100000-0000-4000-8000-000000000106',
   'authenticated', 'authenticated', 'owner110b@example.test', now(), false, now(), now());

-- Members first: once a business has an application, only an owner or staff
-- session (or an accepted invitation) may add one.
insert into public.merchant_user (merchant_id, user_id, role)
values
  ('c1100000-0000-4000-8000-0000000000a1', 'c1100000-0000-4000-8000-000000000101', 'owner'),
  ('c1100000-0000-4000-8000-0000000000a1', 'c1100000-0000-4000-8000-000000000102', 'manager'),
  ('c1100000-0000-4000-8000-0000000000a2', 'c1100000-0000-4000-8000-000000000106', 'owner');

insert into public.merchant_application (merchant_id, payload, revision, review_state,
                                         submitted_revision, submitted_at)
values ('c1100000-0000-4000-8000-0000000000a1', '{}'::jsonb, 1, 'pending', 1, now());

-- ── an owner invites by email; nobody else may

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000101","role":"authenticated"}', true);

select is((public.rpc_merchant_invite_member('c1100000-0000-4000-8000-0000000000a1',
            '  New.Person110@Example.test ', 'manager')).contact,
  'new.person110@example.test', 'An owner invites by email, saved in lower case.');
select throws_ok(
  $$select public.rpc_merchant_invite_member('c1100000-0000-4000-8000-0000000000a1', '+254700011099')$$,
  '22023', 'Invite by email address. Team members join by signing in to NexG with it.',
  'A phone number is refused: nobody can sign in with one to accept.');
select throws_ok(
  $$select public.rpc_merchant_invite_member('c1100000-0000-4000-8000-0000000000a1', 'Manager110@example.test')$$,
  '23505', 'manager110@example.test is already on the team.',
  'Somebody already on the team is not invited again.');
select lives_ok(
  $$select public.rpc_merchant_invite_member('c1100000-0000-4000-8000-0000000000a1', 'pending.person110@example.test')$$,
  'The owner invites a second person.');

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('test110.invite',
  (select id::text from public.merchant_invite where contact = 'pending.person110@example.test'), true);
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000102","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_merchant_invite_member('c1100000-0000-4000-8000-0000000000a1', 'second.me110@example.test', 'owner')$$,
  '42501', 'Only an owner can change the team.',
  'A manager cannot invite a second account of their own as owner.');
select throws_ok(
  $$select public.rpc_merchant_invite_revoke(current_setting('test110.invite')::uuid)$$,
  '42501', 'Only an owner can change the team.', 'Nor withdraw the owner''s invitation.');

-- ── signing in with the invited address joins the team

select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000104","role":"authenticated"}', true);
select is(public.rpc_merchant_invites_accept() -> 'joined', '[]'::jsonb,
  'An address that was never confirmed joins nothing.');

select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000103","role":"authenticated"}', true);
select is(jsonb_array_length(public.rpc_merchant_invites_accept() -> 'joined'), 1,
  'The invited person, signed in with the confirmed address, joins one business.');

reset role;
select set_config('request.jwt.claims', '', true);
select is((select role::text from public.merchant_user
            where merchant_id = 'c1100000-0000-4000-8000-0000000000a1'
              and user_id = 'c1100000-0000-4000-8000-000000000103'),
  'manager', 'In the role the owner chose, past the application membership guard.');
select is((select accepted_user_id from public.merchant_invite
            where contact = 'new.person110@example.test'),
  'c1100000-0000-4000-8000-000000000103'::uuid, 'The invitation is marked accepted by them.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000103","role":"authenticated"}', true);
select is(public.rpc_merchant_invites_accept() -> 'joined', '[]'::jsonb,
  'Signing in again joins nothing new.');

-- ── a withdrawn invitation, and leaving

select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000101","role":"authenticated"}', true);
select lives_ok(
  $$select public.rpc_merchant_invite_revoke((public.rpc_merchant_invite_member(
      'c1100000-0000-4000-8000-0000000000a1', 'later.person110@example.test')).id)$$,
  'The owner invites somebody and withdraws it.');

select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000105","role":"authenticated"}', true);
select is(public.rpc_merchant_invites_accept() -> 'joined', '[]'::jsonb,
  'A withdrawn invitation joins nothing.');

select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000102","role":"authenticated"}', true);
select throws_ok(
  $$select public.rpc_merchant_membership_remove('c1100000-0000-4000-8000-0000000000a1',
      'c1100000-0000-4000-8000-000000000103')$$,
  '42501', 'Only an owner can change the team.', 'A manager cannot remove somebody else.');
select is((public.rpc_merchant_membership_remove('c1100000-0000-4000-8000-0000000000a1',
            'c1100000-0000-4000-8000-000000000102') ->> 'ok')::boolean,
  true, 'But anybody can leave.');

reset role;
select set_config('request.jwt.claims', '', true);
select ok(exists (select 1 from audit.action_registry where action = 'merchant.member_joined'),
  'Joining is a registered audit action.');

-- ── readiness sees the hours and payout the setup screens save

select is((public.fn_merchant_readiness('c1100000-0000-4000-8000-0000000000a2') ->> 'hours_prep')::boolean,
  false, 'No hours saved: hours are missing.');
insert into public.merchant_hours (merchant_id, day_of_week, opens, closes, closed)
values ('c1100000-0000-4000-8000-0000000000a2', 1, '08:00', '17:00', false);
select is((public.fn_merchant_readiness('c1100000-0000-4000-8000-0000000000a2') ->> 'hours_prep')::boolean,
  true, 'An open weekly hours row counts, with no hours_pattern.');

select is((public.fn_merchant_readiness('c1100000-0000-4000-8000-0000000000a2') ->> 'business_basics')::boolean,
  false, 'Before an application is submitted the basics are not done.');
insert into public.merchant_application (merchant_id, payload, revision, review_state,
                                         submitted_revision, submitted_at)
values ('c1100000-0000-4000-8000-0000000000a2', '{}'::jsonb, 1, 'pending', 1, now());
select is((public.fn_merchant_readiness('c1100000-0000-4000-8000-0000000000a2') ->> 'business_basics')::boolean,
  true, 'A submitted application, validated on submit, counts as the basics.');

select is((public.fn_merchant_readiness('c1100000-0000-4000-8000-0000000000a2') ->> 'payout')::boolean,
  false, 'No payout yet.');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000106","role":"authenticated"}', true);
select is(public.fn_merchant_payout_declared('c1100000-0000-4000-8000-0000000000a2'), false,
  'Nothing declared yet.');

-- Home's "Needs attention" rows, read the way the dashboard query reads them
-- once a business is approved (before approval its owner sees the setup Home).
reset role;
select set_config('request.jwt.claims', '', true);
select is((select count(*) from public.merchant_attention_v
            where merchant_id = 'c1100000-0000-4000-8000-0000000000a2' and kind = 'payout'),
  1::bigint, 'Home asks for a payout method.');

insert into public.merchant_application_payout (merchant_id, rail, account, declared_by)
values ('c1100000-0000-4000-8000-0000000000a2', 'mpesa_till', '{"tillNumber": "174379"}',
        'c1100000-0000-4000-8000-000000000106');
select is((public.fn_merchant_readiness('c1100000-0000-4000-8000-0000000000a2') ->> 'payout')::boolean,
  true, 'A declared payout counts.');
select is((select count(*) from public.merchant_attention_v
            where merchant_id = 'c1100000-0000-4000-8000-0000000000a2' and kind = 'payout'),
  0::bigint, 'And Home stops saying "Payout method not set".');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000106","role":"authenticated"}', true);
select is(public.fn_merchant_payout_declared('c1100000-0000-4000-8000-0000000000a2'), true,
  'Its owner is told a payout was declared.');

select set_config('request.jwt.claims',
  '{"sub":"c1100000-0000-4000-8000-000000000105","role":"authenticated"}', true);
select is(public.fn_merchant_payout_declared('c1100000-0000-4000-8000-0000000000a2'), false,
  'Somebody outside the business learns nothing about its payout.');

reset role;
select set_config('request.jwt.claims', '', true);

-- ── the review function fails fast on a held lock

select ok((select proconfig from pg_proc
            where oid = 'public.rpc_merchant_application_review(uuid, bigint, uuid, text, text)'::regprocedure)
          @> array['statement_timeout=5s', 'lock_timeout=2s'],
  'Application review keeps its 5-second statement and 2-second lock timeouts.');

select * from finish();
rollback;
