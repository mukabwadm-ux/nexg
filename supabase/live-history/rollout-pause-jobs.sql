-- Run on live straight after the push (Supabase SQL editor), unless the owner
-- decided otherwise for a job. Pauses the scheduled jobs the push creates that
-- send to people, call a payment provider or a partner, or change customers'
-- orders. Each is switched on later, one at a time, with
--   select cron.alter_job(jobid, active := true) from cron.job where jobname = '<name>';
-- Proven in CI by scripts/live-rollout-rehearsal.sh. See docs/database/live-rollout-2026-11-23.md.
select jobname, cron.alter_job(jobid, active := false) as paused
from cron.job
where jobname in (
  'payments-worker',          -- asks M-Pesa about payment prompts (needs the Vault URL)
  'payments-expire-unpaid',   -- expires unpaid orders
  'paystack-sweep',           -- asks Paystack about open attempts
  'api-webhooks',             -- posts order and booking events to partners
  'native-push-dispatch',     -- phone pushes, every 5 seconds
  'native-push-reminders',    -- phone push reminders
  'app-email-reminders',      -- customer emails (routes start switched off)
  'merchant-live-emails',     -- "you are live" emails to merchants
  'merchant-setup-reminders', -- setup reminder emails to approved merchants, 06:00 UTC
  'holiday-reminders'         -- holiday hours emails to merchants, 04:00 UTC
)
order by jobname;
