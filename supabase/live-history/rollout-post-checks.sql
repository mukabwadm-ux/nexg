-- Checks after the 23 Nov 2026 rollout. Read-only: one row per check, PASS or FAIL.
-- Run by scripts/live-rollout-rehearsal.sh, and by the owner on live after the push
-- (Supabase SQL editor). See docs/database/live-rollout-2026-11-23.md.
select case when ok then 'PASS ' else 'FAIL ' end || what
from (values
  ('host onboarding ran (20261114000100): table public.host_document',
   to_regclass('public.host_document') is not null),
  ('connector foundation ran (20261102000050): table public.connector_adapter',
   to_regclass('public.connector_adapter') is not null),
  ('main''s 20261111000000 ran: rpc_connector_outbox_claim is audit-exempt',
   exists (select 1 from public.wiring_audit_exempt where function_name = 'rpc_connector_outbox_claim')),
  ('staff reset function exists (20260101021800)',
   exists (select 1 from pg_proc where proname = 'rpc_staff_reset_credentials')),
  ('rpc_host_workspace_guide_asset takes p_code default null (20270224100100)',
   coalesce((select pronargdefaults from pg_proc where proname = 'rpc_host_workspace_guide_asset'), 0) = 1),
  ('rpc_host_workspace_task_save has its two defaults (20261114000100)',
   coalesce((select max(pronargdefaults) from pg_proc where proname = 'rpc_host_workspace_task_save'), 0) = 2),
  ('connector_connection has the merchant application session gate (20270224100200)',
   exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'connector_connection'
           and policyname = 'merchant_application_session_gate')),
  ('Paystack review ran (20270222000500): table public.payment_reviewer',
   to_regclass('public.payment_reviewer') is not null),
  ('no migration is recorded twice',
   not exists (select version from supabase_migrations.schema_migrations group by version having count(*) > 1))
) as c(what, ok)
order by 1;
