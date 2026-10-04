-- The QR system needs three things to keep running.
--
-- Without them nothing fails loudly, which is the problem:
--
--   · Partitions run out. `qr_scan` has monthly partitions made four
--     months ahead; past that every scan lands in the default
--     partition. It is not lost — that is what the default is for —
--     but the health tile has to tell somebody, and by then it is a
--     backlog rather than a cron that did not run.
--   · `qr_scan_daily_v` is materialised. Unrefreshed, the console
--     shows yesterday's numbers with nothing saying so, which is
--     worse than showing none.
--   · Raw scans are session-level records of individual browsers.
--     They are meant to be gone after twelve months, and a retention
--     promise nothing executes is just a sentence on a page.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; QR maintenance is not scheduled. The functions can be run by hand.';
    return;
  end if;

  /* Hourly. The console's tiles are the main reader and an hour-old
     scan count is fine; a day-old one is not. */
  perform cron.schedule(
    'qr-refresh-reports', '20 * * * *',
    $cron$select public.cron_qr_refresh_reports()$cron$);

  /* Monthly, on the 1st, keeping four months ahead. Running it
     monthly rather than daily is deliberate: it is idempotent, and a
     job that does nothing 29 days out of 30 is a job nobody notices
     has stopped. */
  perform cron.schedule(
    'qr-scan-partitions', '0 2 1 * *',
    $cron$select public.cron_qr_scan_partitions()$cron$);

  /*
   * The roll-up, monthly. It refreshes the aggregate before it drops
   * anything — that order is the whole safety of it, and it is
   * inside the function rather than in this schedule so it cannot be
   * separated by somebody editing the cron.
   */
  perform cron.schedule(
    'qr-scan-rollup', '30 2 1 * *',
    $cron$select public.cron_qr_scan_rollup()$cron$);
end $$;

/* The first partitions exist from the schema migration; make sure
   the window is open from the moment this lands rather than at 02:00
   on the first of next month. */
select public.cron_qr_scan_partitions();
