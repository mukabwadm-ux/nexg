-- Communications & Automations: two tidy-ups the DB release gate suggested
-- for 20270331000100.
--
-- 1. rpc_outbox_due counts the emails sent today and in the last minute on
--    every dispatch run (for the email limits). A partial index on sent email
--    keeps those counts cheap as the outbox grows.
-- 2. fn_comms_norm, fn_comms_mask and fn_comms_render are plain text helpers
--    used inside the staff RPCs. Nobody needs to call them directly, so they
--    are closed to anon and authenticated like the module's other helpers.
--
-- Rollback: drop index public.notification_outbox_email_sent_idx; grant
-- execute on the three functions back to public.

create index if not exists notification_outbox_email_sent_idx
  on public.notification_outbox (sent_at)
  where channel = 'email' and status = 'sent';

revoke all on function public.fn_comms_norm(text), public.fn_comms_mask(text),
  public.fn_comms_render(text, jsonb)
  from public, anon, authenticated;
