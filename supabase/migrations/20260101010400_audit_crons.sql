-- The nightly check stops shouting into the Postgres log.
--
-- `audit.run_chain_check()` has run at 23:00 every night since the
-- front door was built, and on a failure it raises a WARNING. Its own
-- comment says so plainly:
--
--     "Alert stub. … M7 replaces this with a real page-out; until
--      then it is a loud WARNING in the Postgres log and a row in
--      chain_check that the console surfaces."
--
-- This is M7. A warning in the Postgres log is read by nobody, and a
-- broken audit chain is the one event in this system that genuinely
-- cannot wait until somebody happens to look.
--
-- Rather than repoint the cron job — which would leave any other
-- caller on the old behaviour — the old function delegates to the new
-- one. The schedule is untouched, the name keeps working, and the
-- failure now writes a high-severity event that raises the
-- `chain_broken` alert with its next step attached.

create or replace function audit.run_chain_check()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  v := audit.cron_chain_check();

  /* The warning stays. Somebody reading the Postgres log during an
     incident should still see it, and it costs nothing. */
  if not (v ->> 'ok')::boolean then
    raise warning 'AUDIT CHAIN BROKEN: % events checked', v ->> 'events_checked';
  end if;
end;
$$;

comment on function audit.run_chain_check is
  'The nightly chain walk. Delegates to cron_chain_check, which records the result and — on a failure — writes the event that raises the chain_broken alert. The old name is kept so the existing cron job needs no change.';

-- ════════════════════════════════════ the alerts actually run

/*
 * Eight rules have existed since the console was built and nothing
 * evaluated them. A rule that never runs is worse than no rule: it
 * reads, on the settings screen, as cover that is not there.
 *
 * Hourly. Every rule's window is an hour or shorter except the
 * unregistered-action one, which is 24 hours and is deliberately
 * re-evaluated often — the open alert's count is updated in place
 * rather than filed again.
 */
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; audit alerts are not scheduled. Run audit.cron_run_alerts() by hand or from the console.';
    return;
  end if;

  perform cron.schedule(
    'audit-run-alerts',
    '5 * * * *',
    $cron$select audit.cron_run_alerts()$cron$);

  /*
   * And the chain, already scheduled under job 1 as
   * `select audit.run_chain_check()`. Left exactly as it is: the
   * function behind that name now does the right thing, so changing
   * the schedule would be churn for no gain.
   */
end $$;
