-- Approve first (20270124000100): a merchant submits with the basics, NexG
-- approves, the rest is finished in the dashboard, and going live waits for it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

create function pg_temp.as_user(p_sub text) returns void language sql as $f$
  select set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true)
$f$;
create function pg_temp.keys(p jsonb) returns text[] language sql immutable as $f$
  select coalesce(array_agg(x.value ->> 'key' order by x.value ->> 'key'), '{}') from jsonb_array_elements(p) x
$f$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '', now(), now(), now()
from (values
  ('0e720000-0000-4000-8000-0000000000a1'::uuid, 'owner.approvefirst@test.local'),
  ('0e720000-0000-4000-8000-0000000000a2'::uuid, 'stranger.approvefirst@test.local'),
  ('0e720000-0000-4000-8000-0000000000a3'::uuid, 'ops.approvefirst@test.local')
) as u (id, email);

insert into public.staff_user (id, user_id, email, display_name) values
  ('0e720000-0000-4000-8000-0000000000b1', '0e720000-0000-4000-8000-0000000000a3', 'ops.approvefirst@test.local', 'Approve First Ops');
insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
select '0e720000-0000-4000-8000-0000000000b1', r.id, null,
       '00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b'
from public.role r where r.key = 'merchant_ops';

insert into public.merchant (id, legal_name, trading_name, category, contact_name, contact_phone, contact_email, status)
values ('0e720000-0000-4000-8000-0000000000c1', 'Approve First Ltd', 'Approve First Transfers', 'airport_transfers',
        'Owner', '+254712000721', 'approvefirst@shop.example', 'applied');
insert into public.merchant_user (merchant_id, user_id, role)
values ('0e720000-0000-4000-8000-0000000000c1', '0e720000-0000-4000-8000-0000000000a1', 'owner');

set local session_replication_role = replica;
insert into public.merchant_application (merchant_id, revision, payload, review_state)
values ('0e720000-0000-4000-8000-0000000000c1', 1, '{"categoryId": "airport_transfers"}', 'draft');
set local session_replication_role = origin;

-- ------------------------------------------------------------------ submitting

select lives_ok(
  $$ update public.merchant_application set submitted_revision = 1, submitted_at = now(), review_state = 'pending'
     where merchant_id = '0e720000-0000-4000-8000-0000000000c1' $$,
  'an application submits without the onboarding details or the agreement');

select ok(
  pg_temp.keys(public.fn_merchant_go_live_missing('0e720000-0000-4000-8000-0000000000c1'))
    @> array['agreement', 'agreement_details', 'application', 'branch', 'documents', 'onboarding_details'],
  'before approval the list starts with NexG''s approval and everything the merchant still owes');

-- ------------------------------------------------------------------ approval

update public.merchant_application
set review_state = 'approved', approved_revision = 1, reviewed_at = now()
where merchant_id = '0e720000-0000-4000-8000-0000000000c1';

select is(
  (select count(*) from public.user_notification n
   where n.user_id = '0e720000-0000-4000-8000-0000000000a1' and n.kind = 'merchant.application_approved'),
  1::bigint, 'approval tells the owner to finish setting up');

select ok(
  not (pg_temp.keys(public.fn_merchant_go_live_missing('0e720000-0000-4000-8000-0000000000c1')) && array['application']),
  'once approved, the application is off the list');

select is(
  (select i ->> 'who' from jsonb_array_elements(public.fn_merchant_go_live_missing('0e720000-0000-4000-8000-0000000000c1')) i
   where i ->> 'key' = 'onboarding_details'),
  'merchant', 'the onboarding details are the merchant''s to do');

-- ------------------------------------------------------------------ the to-do list

set local role authenticated;
select pg_temp.as_user('0e720000-0000-4000-8000-0000000000a1');

select is((public.rpc_merchant_setup_todo('0e720000-0000-4000-8000-0000000000c1') ->> 'approved')::boolean, true,
  'the owner reads their list and sees they are approved');
select ok(jsonb_array_length(public.rpc_merchant_setup_todo('0e720000-0000-4000-8000-0000000000c1') -> 'items') > 0,
  'and what is still open');

select pg_temp.as_user('0e720000-0000-4000-8000-0000000000a2');
select throws_ok($$ select public.rpc_merchant_setup_todo('0e720000-0000-4000-8000-0000000000c1') $$,
  '42501', null, 'someone else cannot read it');

-- ------------------------------------------------------------------ going live

select pg_temp.as_user('0e720000-0000-4000-8000-0000000000a3');
select throws_like($$ select public.rpc_merchant_go_live('0e720000-0000-4000-8000-0000000000c1') $$,
  'Not ready to go live yet. Still open: %Onboarding details%',
  'an approved merchant cannot go live while the dashboard list is open');

reset role;
select is((select status::text from public.merchant where id = '0e720000-0000-4000-8000-0000000000c1'),
  'applied', 'and it stays where it was');

-- ------------------------------------------------------------------ reminders

update public.merchant_application set reviewed_at = now() - interval '2 days'
where merchant_id = '0e720000-0000-4000-8000-0000000000c1';
select public.cron_merchant_setup_reminders();
select is(
  (select array_agg(step order by step) from public.merchant_setup_reminder
   where merchant_id = '0e720000-0000-4000-8000-0000000000c1'),
  array[1]::smallint[], 'a day after approval the owner gets the first reminder');

select public.cron_merchant_setup_reminders();
select is(
  (select count(*) from public.user_notification n
   where n.user_id = '0e720000-0000-4000-8000-0000000000a1' and n.kind = 'merchant.setup_reminder'),
  1::bigint, 'running again the same day sends nothing more');

update public.merchant_application set reviewed_at = now() - interval '9 days'
where merchant_id = '0e720000-0000-4000-8000-0000000000c1';
select public.cron_merchant_setup_reminders();
select is(
  (select array_agg(step order by step) from public.merchant_setup_reminder
   where merchant_id = '0e720000-0000-4000-8000-0000000000c1'),
  array[1, 7]::smallint[], 'a job that missed days sends only the latest reminder due');

select ok(
  (select bool_and(n.body like '%Onboarding details%') from public.user_notification n
   where n.user_id = '0e720000-0000-4000-8000-0000000000a1' and n.kind = 'merchant.setup_reminder'),
  'reminders say what is still to do');

select * from finish();
rollback;
