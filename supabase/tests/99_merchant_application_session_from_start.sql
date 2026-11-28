-- A new application is not signed out the moment it starts (20270346000100):
-- the merchant workspace limits run from the sign-in's first application
-- start, an account with no merchant yet is exempt even when anonymous, and
-- an anonymous applicant's activity is recorded.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into public.merchant (id, legal_name, trading_name, category, contact_name,
                             contact_phone, contact_email, city_id, status)
values ('c3450000-0000-4000-8000-00000000000a', '[Legal 345] Ltd', '[Shop 345]', 'restaurant',
        '[Contact]', '+254700034501', 'shop345@example.test',
        (select id from public.city where slug = 'nairobi'), 'applied');

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  -- signed in two days ago, then started a business a minute ago
  ('00000000-0000-0000-0000-000000000000', 'c3450000-0000-4000-8000-000000000101',
   'authenticated', 'authenticated', 'owner345@example.test', now(), false, now(), now()),
  -- an anonymous visitor who opened the form 30 minutes ago, no merchant yet
  ('00000000-0000-0000-0000-000000000000', 'c3450000-0000-4000-8000-000000000102',
   'authenticated', 'authenticated', null, null, true, now(), now()),
  -- an anonymous applicant whose draft exists
  ('00000000-0000-0000-0000-000000000000', 'c3450000-0000-4000-8000-000000000103',
   'authenticated', 'authenticated', null, null, true, now(), now());

insert into public.merchant_user (merchant_id, user_id, role)
values ('c3450000-0000-4000-8000-00000000000a', 'c3450000-0000-4000-8000-000000000101', 'owner'),
       ('c3450000-0000-4000-8000-00000000000a', 'c3450000-0000-4000-8000-000000000103', 'owner');

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('c3450000-0000-4000-8000-0000000005a1', 'c3450000-0000-4000-8000-000000000101',
   now() - interval '2 days', now() - interval '2 days'),
  ('c3450000-0000-4000-8000-0000000005a2', 'c3450000-0000-4000-8000-000000000102',
   now() - interval '30 minutes', now() - interval '30 minutes'),
  ('c3450000-0000-4000-8000-0000000005a3', 'c3450000-0000-4000-8000-000000000103',
   now() - interval '3 minutes', now() - interval '3 minutes');

create temp table t_as (who text primary key, claims text);
insert into t_as values
  ('owner', '{"sub":"c3450000-0000-4000-8000-000000000101","role":"authenticated","session_id":"c3450000-0000-4000-8000-0000000005a1"}'),
  ('visitor', '{"sub":"c3450000-0000-4000-8000-000000000102","role":"authenticated","is_anonymous":true,"session_id":"c3450000-0000-4000-8000-0000000005a2"}'),
  ('applicant', '{"sub":"c3450000-0000-4000-8000-000000000103","role":"authenticated","is_anonymous":true,"session_id":"c3450000-0000-4000-8000-0000000005a3"}');
grant select on t_as to authenticated;

-- ── an old sign-in that just started a business

select set_config('request.jwt.claims', (select claims from t_as where who = 'owner'), true);
select is((authz.merchant_application_session() ->> 'valid')::boolean, false,
  'A two-day-old sign-in with no start recorded is past the merchant limits, as before.');

insert into public.merchant_application_session_activity
  (session_id, user_id, last_activity_at, merchant_started_at)
values ('c3450000-0000-4000-8000-0000000005a1', 'c3450000-0000-4000-8000-000000000101',
        now() - interval '1 minute', now() - interval '1 minute');
select is((authz.merchant_application_session() ->> 'valid')::boolean, true,
  'Once its application start is recorded, the same sign-in is current.');
select ok((authz.merchant_application_session() ->> 'absolute_expires_at')::timestamptz
          > now() + interval '23 hours',
  'Its 24-hour limit counts from the start, not from the sign-in.');

-- ── an anonymous visitor with no merchant yet

select set_config('request.jwt.claims', (select claims from t_as where who = 'visitor'), true);
select is((authz.merchant_application_session() ->> 'valid')::boolean, true,
  'An anonymous visitor 30 minutes into the form, before starting, is not timed out.');
select is(authz.merchant_application_session() ->> 'reason', null, 'And is given no expiry reason.');

-- ── an anonymous applicant whose draft exists

select set_config('request.jwt.claims', (select claims from t_as where who = 'applicant'), true);
set local role authenticated;
select lives_ok(
  $$select public.rpc_merchant_session_activity('c3450000-0000-4000-8000-00000000000a')$$,
  'An anonymous applicant can report activity on their own draft.');
reset role;
select ok(
  (select last_activity_at > now() - interval '5 seconds'
     from public.merchant_application_session_activity
    where session_id = 'c3450000-0000-4000-8000-0000000005a3'),
  'And the activity is recorded.');

update public.merchant_application_session_activity
   set last_activity_at = now() - interval '10 minutes'
 where session_id = 'c3450000-0000-4000-8000-0000000005a3';
select is((authz.merchant_application_session() ->> 'valid')::boolean, false,
  'An anonymous applicant idle past the limit is still timed out.');

select set_config('request.jwt.claims', (select claims from t_as where who = 'visitor'), true);
set local role authenticated;
select throws_ok(
  $$select public.rpc_merchant_session_activity('c3450000-0000-4000-8000-00000000000a')$$,
  '42501', 'Not your business.',
  'Someone else''s anonymous sign-in cannot report activity on the draft.');
reset role;

select * from finish();
rollback;
