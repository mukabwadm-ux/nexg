-- Internal helpers cannot be called by signed-in accounts.
--
-- These functions do not check who is calling: they rely on the functions
-- that call them to do it. Called directly, they would let any signed-in
-- account read what every partner is owed or the staff list, send
-- notifications and emails in NexG's name, or wipe a guest's or a candidate's
-- details. Only security definer functions, pg_cron and service_role reach
-- them, and the settlement run that reads balances through one of them still
-- builds for Finance.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

create temporary table t (k text primary key, v text) on commit drop;
grant all on t to authenticated;

-- ---------------------------------------------------------- the grants

select ok(
  not has_function_privilege('authenticated', 'public.fn_settlement_owed(timestamptz, timestamptz, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fn_settlement_owed(timestamptz, timestamptz, uuid)', 'EXECUTE'),
  'No account can read what every partner is owed');

select ok(
  not has_function_privilege('authenticated', 'public.fn_staff_for_module(text, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fn_staff_for_module(text, uuid)', 'EXECUTE'),
  'nor list staff names and email addresses');

select ok(
  not has_function_privilege('authenticated',
    'public.fn_notify_partner(uuid, text, text, text, text, public.notification_tone, text, text, uuid)', 'EXECUTE')
  and not has_function_privilege('anon',
    'public.fn_notify_partner(uuid, text, text, text, text, public.notification_tone, text, text, uuid)', 'EXECUTE'),
  'nor send a notification or an email in NexG''s name');

select ok(
  not has_function_privilege('authenticated', 'public.fn_anonymise_guest(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fn_anonymise_guest(uuid)', 'EXECUTE'),
  'nor wipe a hotel guest''s details');

select ok(
  not has_function_privilege('authenticated', 'public.fn_ledger_backfill(integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fn_ledger_backfill(integer)', 'EXECUTE'),
  'nor post history into the ledger');

select ok(
  not has_function_privilege('authenticated', 'public.fn_match_deposit(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.fn_match_deposit(uuid)', 'EXECUTE'),
  'nor match a rider''s cash deposit');

select ok(
  not has_function_privilege('authenticated', 'hr.fn_anonymise_candidate(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'hr.fn_anonymise_candidate(uuid)', 'EXECUTE'),
  'nor wipe a job candidate''s details');

select ok(
  (select bool_and(has_function_privilege('service_role', f::regprocedure, 'EXECUTE'))
     from unnest(array[
       'public.fn_settlement_owed(timestamptz, timestamptz, uuid)',
       'public.fn_staff_for_module(text, uuid)',
       'public.fn_notify_partner(uuid, text, text, text, text, public.notification_tone, text, text, uuid)',
       'public.fn_anonymise_guest(uuid)',
       'public.fn_ledger_backfill(integer)',
       'public.fn_match_deposit(uuid)',
       'hr.fn_anonymise_candidate(uuid)']) as f),
  'service_role keeps all seven for scripts');

-- ------------------------------------------------- a direct call is refused

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, '',
       now(), now(), now()
from (values
  ('99e00000-0000-4000-8000-0000000000a1'::uuid, 'helpers.customer@test.local')
) as u (id, email);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"99e00000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select throws_ok(
  $$select * from public.fn_settlement_owed(now() - interval '1 year', now(), null)$$,
  '42501', 'permission denied for function fn_settlement_owed',
  'A signed-in customer asking for every balance is refused');

select throws_ok(
  $$select * from public.fn_staff_for_module('finance', null)$$,
  '42501', 'permission denied for function fn_staff_for_module',
  'and so is one asking for the staff list');

select throws_ok(
  $$select public.fn_notify_partner('99e00000-0000-4000-8000-0000000000a1', 'test', 'Your payout is on hold',
      'Confirm your details', 'https://example.test', 'info', 'someone@example.test')$$,
  '42501', 'permission denied for function fn_notify_partner',
  'and one trying to send a notification');

-- --------------------------------------- the paths that use them still work

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into t (k, v) select 'run', public.rpc_settlement_build(
      timestamptz '2025-01-06 00:00+03', timestamptz '2025-01-13 00:00+03') ->> 'run_id'$$,
  'An admin still builds a settlement run, which reads balances through the closed helper');

select isnt((select v from t where k = 'run'), null, 'and gets a run back');

select * from finish();
rollback;
