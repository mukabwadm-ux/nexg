-- Anonymous requests cannot run the maintenance jobs.
--
-- Found while closing a hole in the payment functions, and much
-- wider than that one.
--
-- Supabase sets `alter default privileges in schema public grant
-- all on functions to anon, authenticated, service_role`. Every
-- function created in `public` since this project started has
-- therefore been executable by an unauthenticated request, and
-- `grant execute ... to authenticated` in a migration adds a
-- second grant without removing the first. Nothing in the
-- codebase ever said otherwise, so nothing ever looked wrong.
--
-- Most of those functions guard themselves — they call
-- `authz.something()` and raise. The ones below do not, because
-- they were written to be called by pg_cron or from inside
-- another function that had already checked. Reachable from the
-- open internet, they are a different proposition:
--
--   * `cron_retention` deletes data on the retention schedule
--   * `fn_anonymise_guest` anonymises a named guest
--   * `fn_expire_documents` marks documents expired
--   * `fn_compute_rider_health` and `fn_partner_recompute_status`
--     rewrite scores and statuses
--   * `fn_order_reprice` tells anybody with a guessed order id
--     exactly what it costs
--
-- None of them needed a grant to `anon` or `authenticated` in the
-- first place. A SECURITY DEFINER function calling another runs
-- it as the definer, so the privilege is checked against the
-- owner and not against whoever started the request — the callers
-- are unaffected.
--
-- `fn_merchant_is_live` deliberately keeps `anon`: it is used
-- inside the row policy that lets logged-out visitors see a live
-- merchant's menu, and a policy's functions run as the querying
-- role. Revoking it would empty the public site.

do $$
declare
  fn record;
  /*
   * Maintenance, sweeps and internals. Each either runs on a
   * schedule or is called from inside something that has already
   * decided the caller may do this.
   */
  v_internal text[] := array[
    'cron_featured_activate', 'cron_featured_eligibility', 'cron_featured_expire',
    'cron_qr_refresh_reports', 'cron_qr_scan_partitions', 'cron_qr_scan_rollup',
    'cron_retention',
    'fn_anonymise_guest', 'fn_expire_documents', 'fn_compute_rider_health',
    'fn_partner_recompute_status', 'fn_folio_escalation_sweep', 'fn_match_deposit',
    'fn_featured_fill_schedule', 'fn_featured_rollup', 'fn_featured_fee_for_week',
    'fn_document_chase_state', 'fn_review_checks', 'fn_cash_guard',
    'fn_event_anchor_effects', 'fn_order_reprice',
    /* A sweep like the crons, named differently. */
    'rpc_expire_quotes'
  ];
begin
  for fn in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = any (v_internal)
  loop
    execute format('revoke execute on function %s from public, anon', fn.sig);

    /* The schedulers still need to run. pg_cron executes as the
       job owner, and the application never calls these. */
    if fn.proname like 'cron\_%' or fn.proname = 'rpc_expire_quotes' then
      execute format('revoke execute on function %s from authenticated', fn.sig);
      execute format('grant execute on function %s to service_role', fn.sig);
    end if;
  end loop;
end
$$;

/*
 * `fn_order_reprice` is the one with a caller, so it keeps
 * `authenticated` — the Orders console and the merchant dashboard
 * both ask it what an adjustment would cost. It is still definer
 * and still reads past row security, which is why it is worth
 * saying out loud that it answers only what an order costs and
 * never who it belongs to.
 */
grant execute on function public.fn_order_reprice(uuid, jsonb) to authenticated;

/*
 * And the default stops being generous for anything added from
 * here on. A function that genuinely needs an anonymous caller —
 * a QR scan, a payment webhook — says so with its own grant,
 * which is a line somebody writes on purpose and a reviewer can
 * see.
 */
alter default privileges in schema public
  revoke execute on functions from anon;

comment on schema public is
  'Default privileges here no longer grant EXECUTE to anon. A function that needs an anonymous caller grants it explicitly, so that reachability is a decision in a diff rather than a default nobody saw.';

/*
 * What is deliberately left open to an anonymous request, so the
 * next audit does not have to work it out again:
 *
 *   · the public site's geography and copy — `fn_city_for_point`,
 *     `neighbourhoods_for_zone`, `distance_to_nearest_zone`,
 *     `fn_translations`, `fn_merchant_effective_hours`
 *   · `fn_merchant_is_live`, which a row policy calls on behalf of
 *     a logged-out visitor reading a menu
 *   · the experience builder — `fn_build_plan` and its helpers —
 *     which a guest uses before they have an account
 *   · the careers flow, where an applicant checks or withdraws
 *     with a one-time token and has no session by design
 *   · `fn_qr_attribute_order` and `rpc_resolve_qr`, which are a
 *     stranger scanning a sticker
 *   · `rpc_payment_webhook` and `rpc_payment_authorised`, which
 *     are Paystack, arriving with no session and a signature the
 *     route has already checked
 *   · `rpc_record_sign_in`, because a failed sign-in has no
 *     session and is the one most worth recording
 *
 * Each of those takes a token, verifies a signature, or returns
 * only what is already public.
 */
