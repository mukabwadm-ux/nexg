-- Nobody writes to the money tables.
--
-- Supabase grants every new table in `public` to `anon` and
-- `authenticated` by default — all of insert, update, delete and
-- truncate. Row security then denies it, because `payment` and
-- `payment_event` have read-only policies and nothing else, so in
-- practice a write was already refused.
--
-- "In practice" is the wrong standard for a payments table. A
-- policy is one `create policy` away from being widened by
-- somebody solving a different problem, and the grant underneath
-- it would still be there. So the grant goes, and what is left is
-- exactly what is used: these tables are read through policies and
-- written only by security-definer functions, which run as their
-- owner and do not need a grant at all.
--
-- The same for `live_pulse`. It carries nothing but a city id and
-- a clock, but a table anybody can write to is a table anybody can
-- use to wake every open console in the country.

revoke all on public.payment from anon, authenticated;
revoke all on public.payment_event from anon, authenticated;
revoke all on public.live_pulse from anon, authenticated;

/* Read only, and only through the policies already written. */
grant select on public.payment to authenticated;
grant select on public.payment_event to authenticated;
grant select on public.live_pulse to authenticated;

/*
 * `anon` keeps nothing at all.
 *
 * The webhook arrives with no session and still works, because it
 * goes through `rpc_payment_webhook` — security definer, so it
 * writes as the owner. The grant it needs is EXECUTE on that one
 * function, which it has, and which can only move a payment we
 * created from pending to paid or failed.
 */

-- ══════════════════════ an integration that claims to be on

/*
 * `maps` has said "connected" since the day it was seeded, with
 * no key behind it anywhere. That is the same class of lie this
 * project keeps tripping over: a status that reads as fact and is
 * actually an intention.
 *
 * The honest value is "to_do" until somebody sets the variables,
 * and the application is the only half that can see whether they
 * are set — so the status says what the database knows, which is
 * that nobody has confirmed it.
 */
update public.integration
   set status = 'to_do',
       notes = coalesce(nullif(notes, ''), '')
         || case when coalesce(notes, '') = '' then '' else ' ' end
         || 'Needs a key and a Map ID. Until both are set the live screen draws a list instead, and says which variable is missing.'
 where key = 'maps'
   and status = 'connected'
   and not exists (
     select 1 from public.integration i2
      where i2.key = 'maps' and i2.config ? 'verified_at');

comment on column public.integration.status is
  'What somebody has confirmed, not what we intend. A row that claims connected with nothing behind it costs an afternoon — `requires_env` names what the deployment must set, and only the application can see whether it has.';
