-- The wiring gate.
--
-- `fn_wiring_check` asks the live schema a set of questions.
-- This is the thing that makes a non-zero answer stop a release.
--
-- Criticals fail. Warnings are counted and reported but do not
-- block, because a warning that blocks gets silenced and then
-- the whole mechanism is decoration — the 37 RPCs without an
-- `audit.log` call are real and worth fixing, and none of them
-- is a reason to stop a deploy tonight.
--
-- Every rule here earned its place by finding something on its
-- first run.

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- ════════════════════════════════════════ nothing critical

select is(
  (select count(*)::int from public.fn_wiring_check() where severity = 'critical'),
  0,
  'No critical wiring findings.');

-- ═══════════════ and each rule asserted on its own, so a
--                 failure says which thing broke

select is(
  (select count(*)::int from public.fn_wiring_check() where rule = 'rls_enabled'),
  0,
  'Every public table has row-level security on, so its policies are actually consulted.');

/*
 * The one that found a live leak. `qr_scan` is partitioned and
 * had RLS on the parent; the partitions had it off and anon had
 * SELECT, so the month's scan log was readable with the key
 * printed in the page source — and the monthly generator made a
 * fresh one every month.
 */
select is(
  (select count(*)::int from public.fn_wiring_check() where rule = 'partition_rls'),
  0,
  'No partition of a protected table is left unprotected.');

select is(
  (select count(*)::int from public.fn_wiring_check() where rule = 'anon_table_read'),
  0,
  'No table with RLS off is readable by the anonymous key.');

/*
 * 163 on the first run. The anon key is not a secret — it ships
 * in the browser bundle — so a security-definer function it can
 * execute is one anybody on the internet can invoke. Most
 * refused on their own guard; "most" is not a security property.
 */
select is(
  (select count(*)::int from public.fn_wiring_check() where rule = 'anon_execute'),
  0,
  'Nothing anon can execute writes, unless it is written down in wiring_anon_allow with a reason.');

select is(
  (select count(*)::int from public.fn_wiring_check() where rule = 'money_float'),
  0,
  'No money is stored as a float.');

select is(
  (select count(*)::int from public.fn_wiring_check() where rule = 'definer_search_path'),
  0,
  'Every security-definer function has a fixed search_path.');

-- ═══════════════════════ the allowlist is a decision, not a list

select is(
  (select count(*)::int from public.wiring_anon_allow
    where coalesce(trim(guarded_by), '') = ''),
  0,
  'Every anon-callable function says what guards the call now that the grant does not.');

/*
 * Reported, not enforced. Printed so the number is in front of
 * somebody on every run rather than discovered during an
 * incident.
 */
select ok(
  (select count(*) from public.fn_wiring_check() where severity = 'warning') < 100,
  'Warnings are under control — currently '
    || (select count(*) from public.fn_wiring_check() where severity = 'warning')
    || ', mostly RPCs that change state without calling audit.log.');

select * from finish();
rollback;
