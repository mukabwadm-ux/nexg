begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, is_anonymous, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c0720000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'first72@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0720000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'second72@example.test', now(), false, now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0720000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', null, null, true, now(), now());

select ok(not has_function_privilege('anon', 'public.rpc_maps_route_budget(text)', 'EXECUTE'),
  'A signed-out client cannot execute the RPC.');
select ok(not has_table_privilege('authenticated', 'public.maps_route_budget', 'SELECT'),
  'Signed-in clients cannot inspect the private buckets directly.');
select ok(not has_table_privilege('authenticated', 'public.maps_route_budget', 'UPDATE'),
  'Signed-in clients cannot directly increase their own quota or edit another account.');
select is((select relrowsecurity from pg_class where oid = 'public.maps_route_budget'::regclass),
  true, 'The quota table has RLS.');

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$ select public.rpc_maps_route_budget('day') $$,
  '42501', 'Sign in with your account to request a map route.', 'A JWT subject is required.');
select set_config('request.jwt.claims',
  '{"sub":"c0720000-0000-4000-8000-000000000099","role":"authenticated"}', true);
select throws_ok($$ select public.rpc_maps_route_budget('day') $$,
  '42501', 'Sign in with your account to request a map route.', 'An absent or deleted Auth account cannot reserve quota.');
select set_config('request.jwt.claims',
  '{"sub":"c0720000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}', true);
-- Since 20270130000800 (owner, 22 Nov 2026) a temporary session routes one
-- Explore plan, judged by the Auth record even when its token says otherwise.
select is(public.rpc_maps_route_budget('day') ->> 'allowed', 'true',
  'An anonymous Auth user routes one plan as a guest.');
select is(public.rpc_maps_route_budget('other') ->> 'reason', 'sign_in_required',
  'A second plan asks it to sign in, whatever its token says.');
select set_config('request.jwt.claims',
  '{"sub":"c0720000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select throws_ok($$ select public.rpc_maps_route_budget(repeat('x', 121)) $$,
  '22023', 'Invalid route context.', 'Invalid context IDs cannot consume quota.');
select is(public.rpc_maps_route_budget('private-day')::jsonb,
  '{"accountId":"c0720000-0000-4000-8000-000000000001","allowed":true}'::jsonb,
  'A reservation derives its account from the signed-in request.');

reset role;
select is((select day_count from public.maps_route_budget
  where account_id = 'c0720000-0000-4000-8000-000000000001'), 1,
  'The reservation increments the daily bucket.');
select is((select context_counts ? 'private-day' from public.maps_route_budget
  where account_id = 'c0720000-0000-4000-8000-000000000001'), false,
  'The private bucket never retains a context ID in plain text.');

update public.maps_route_budget
set minute_bucket = date_trunc('minute', clock_timestamp() at time zone 'UTC'), minute_count = 10
where account_id = 'c0720000-0000-4000-8000-000000000001';
set local role authenticated;
select ok((select result->>'allowed' = 'false' and
    (result->>'retryAfterSeconds')::int between 1 and 60
  from (select public.rpc_maps_route_budget('different-day') as result) as reserved),
  'The minute limit is shared across contexts and supplies a short retry delay.');

reset role;
update public.maps_route_budget
set minute_bucket = minute_bucket - interval '1 minute', day_count = 20,
    context_counts = jsonb_build_object(
      encode(extensions.digest('c0720000-0000-4000-8000-000000000001:private-day', 'sha256'), 'hex'),
      20
    )
where account_id = 'c0720000-0000-4000-8000-000000000001';
set local role authenticated;
select ok((select result->>'allowed' = 'false' and
    (result->>'retryAfterSeconds')::int between 1 and 86400
  from (select public.rpc_maps_route_budget('private-day') as result) as reserved),
  'A context at its daily limit remains blocked after the minute rolls over.');
select is(public.rpc_maps_route_budget('different-day')->>'allowed', 'true',
  'An unrelated context can still use the current minute and daily budget.');

reset role;
update public.maps_route_budget
set day_count = 60
where account_id = 'c0720000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.rpc_maps_route_budget('third-day')->>'allowed', 'false',
  'The daily limit combines all contexts.');
select set_config('request.jwt.claims',
  '{"sub":"c0720000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}', true);
select is(public.rpc_maps_route_budget('private-day'),
  '{"accountId":"c0720000-0000-4000-8000-000000000002","allowed":true}'::jsonb,
  'A second account has independent quota for the same context ID.');

reset role;
update public.maps_route_budget
set day_bucket = day_bucket - 1, minute_bucket = minute_bucket - interval '1 day'
where account_id = 'c0720000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c0720000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}', true);
select is(public.rpc_maps_route_budget('private-day')->>'allowed', 'true',
  'Previous UTC day usage cannot block a new day.');
reset role;
select is((select to_jsonb(b) - 'account_id' - 'day_bucket' - 'minute_bucket' - 'context_counts'
    from public.maps_route_budget b where account_id = 'c0720000-0000-4000-8000-000000000001'),
  '{"day_count":1,"minute_count":1}'::jsonb, 'Day and minute counts reset with the first reservation.');

select * from finish();
rollback;
