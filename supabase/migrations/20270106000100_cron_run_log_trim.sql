-- The scheduler's run log keeps its last 30 days.
--
-- pg_cron writes a row to cron.job_run_details for every run of every job,
-- and nothing ever deleted one. With several jobs running every minute that
-- is about 10,500 rows a day: on 18 Nov 2026 production held 338,805 rows
-- going back to 28 Sep, 64 MB of a 155 MB database. A daily job now deletes
-- the runs that started more than 30 days ago. A month is kept because this
-- log is where a failing job shows: expire-documents-nightly was found
-- failing night after night by reading it.
--
-- Deleted rows free their space for new ones rather than giving it back, so
-- the table stops growing at about its present size.
--
-- Rollback:
--   select cron.unschedule('cron-run-log-trim');
--   drop function public.cron_trim_run_log(interval);

create or replace function public.cron_trim_run_log(p_keep interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- A slip in the argument must not empty the log.
  if p_keep is null or p_keep < interval '1 day' then
    raise exception 'Keep at least a day of the scheduler''s run log (asked to keep %).', p_keep
      using errcode = '22023';
  end if;

  delete from cron.job_run_details
   where start_time < now() - p_keep;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.cron_trim_run_log(interval) is
  'Deletes scheduler (pg_cron) run-log rows that started longer ago than p_keep, 30 days by default. Run daily by the cron job cron-run-log-trim.';

revoke execute on function public.cron_trim_run_log(interval) from public, anon, authenticated;
grant execute on function public.cron_trim_run_log(interval) to service_role;

-- Daily at 00:40 UTC (03:40 in Nairobi), as long as pg_cron is here.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here, so there is no run log to trim.';
    return;
  end if;
  perform cron.schedule(
    'cron-run-log-trim',
    '40 0 * * *',
    $cron$select public.cron_trim_run_log()$cron$);
end $$;
