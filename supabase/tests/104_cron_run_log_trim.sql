-- The scheduler's run log keeps its last 30 days.

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Three runs of a job that does not exist: 31 days ago, 29 days ago and now.
-- The run ids are given because only pg_cron may draw from its sequence.
insert into cron.job_run_details (runid, jobid, job_pid, database, username, command, status,
                                  return_message, start_time, end_time)
select 9104000000 + n, 9104001, 0, current_database(), current_user, 'select 1', 'succeeded',
       '1 row', now() - d, now() - d + interval '1 second'
from unnest(array[interval '31 days', interval '29 days', interval '0 days']) with ordinality as t(d, n);

select cmp_ok(public.cron_trim_run_log(), '>=', 1, 'The trim finds the old run.');
select is(
  (select count(*)::int from cron.job_run_details
    where jobid = 9104001 and start_time < now() - interval '30 days'),
  0, 'A run that started more than 30 days ago is deleted.');
select is(
  (select count(*)::int from cron.job_run_details where jobid = 9104001),
  2, 'The runs of the last 30 days stay.');

select throws_ok(
  $$ select public.cron_trim_run_log(interval '1 hour') $$,
  '22023', null,
  'It refuses to keep less than a day, so a slip cannot empty the log.');

select ok(
  not has_function_privilege('anon', 'public.cron_trim_run_log(interval)', 'execute')
  and not has_function_privilege('authenticated', 'public.cron_trim_run_log(interval)', 'execute'),
  'Only the scheduler and the service role can run it.');

select is(
  (select schedule from cron.job where jobname = 'cron-run-log-trim'),
  '40 0 * * *', 'It runs daily at 00:40 UTC.');

select * from finish();
rollback;
