-- Internal helpers that any signed-in account could call directly.
--
-- Supabase grants EXECUTE on every new function in public to anon,
-- authenticated and service_role. The migrations that made these helpers
-- revoked them from public and anon but left that grant to authenticated, so
-- any signed-in account (a customer, a rider, a merchant) could call them at
-- /rest/v1/rpc and skip the checks made by the functions meant to call them:
--
--   fn_settlement_owed        every merchant's, rider's and host's unpaid
--                             balance, with the ledger entries behind it
--   fn_staff_for_module       staff names and email addresses
--   fn_notify_partner         a notification to any account, and an email to
--                             any address, sent in NexG's name
--   fn_anonymise_guest        wipes a hotel guest's personal details
--   fn_ledger_backfill        posts pre-ledger orders into the ledger
--   fn_match_deposit          matches a rider's cash deposit
--   hr.fn_anonymise_candidate wipes a job candidate's personal details
--
-- None of them checks who is calling. Each is called only by security
-- definer functions (which run as their owner), by pg_cron or by hand in the
-- SQL Editor, or not at all, and nothing in the apps or edge functions calls
-- them. Revoking the grant changes nothing for the console, the portals or the
-- jobs. service_role keeps EXECUTE for scripts.
--
-- Function bodies are unchanged.
--
-- Rollback: grant execute on the same functions to authenticated.

revoke execute on function
  public.fn_settlement_owed(timestamptz, timestamptz, uuid),
  public.fn_staff_for_module(text, uuid),
  public.fn_notify_partner(uuid, text, text, text, text, public.notification_tone, text, text, uuid),
  public.fn_anonymise_guest(uuid),
  public.fn_ledger_backfill(integer),
  public.fn_match_deposit(uuid),
  hr.fn_anonymise_candidate(uuid)
  from public, anon, authenticated;

grant execute on function
  public.fn_settlement_owed(timestamptz, timestamptz, uuid),
  public.fn_staff_for_module(text, uuid),
  public.fn_notify_partner(uuid, text, text, text, text, public.notification_tone, text, text, uuid),
  public.fn_anonymise_guest(uuid),
  public.fn_ledger_backfill(integer),
  public.fn_match_deposit(uuid),
  hr.fn_anonymise_candidate(uuid)
  to service_role;
