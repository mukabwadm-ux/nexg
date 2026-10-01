-- The console's views were not readable.
--
-- The schema migration granted select on every table in `hr` and
-- created the four console views afterwards, so the views themselves
-- were never granted. The console's tiles worked — they come from a
-- SECURITY DEFINER function — while every table under them was empty,
-- which is the worst shape for this bug to take: it reads as "no
-- applicants" rather than "you cannot see them".
--
-- The views run as their owner, so RLS on the underlying tables does
-- not apply to them. That is deliberate for the console's own reads
-- and is why the grant is to `authenticated` and the pages behind it
-- are gated by `requireModule('careers')` plus the RPC checks on
-- every write. `anon` gets nothing here; the public careers views
-- live in `public` and are granted separately.

grant select on hr.console_jobs_v to authenticated;
grant select on hr.console_applicants_v to authenticated;
grant select on hr.console_metrics_v to authenticated;
grant select on hr.console_badges_v to authenticated;

revoke all on hr.console_jobs_v from anon;
revoke all on hr.console_applicants_v from anon;
revoke all on hr.console_metrics_v from anon;
revoke all on hr.console_badges_v from anon;
