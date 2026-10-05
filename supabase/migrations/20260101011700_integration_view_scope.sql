-- The integrations tile read 0 / 0 while seven were connected.
--
-- `integration_v` exists so the console can read integrations
-- WITHOUT `secret_refs` — the column is absent rather than masked,
-- which is the right shape. But the view was security_invoker over a
-- table nobody was granted, so every read came back empty: the tile
-- said "0 / 0 healthy" and the list said nothing was configured.
--
-- Not an error. An empty result, which on a health tile reads as
-- "everything is missing" rather than "we could not look" — the same
-- failure the Audit console's zeroes had, arriving by a different
-- route.
--
-- Granting the base table would undo the point of the view, so the
-- view runs as owner and carries the scope itself. That is safe here
-- for the reason it is safe anywhere: the filter is one line, in
-- view, next to the thing it protects.

create or replace view public.integration_v
with (security_invoker = false) as
select
  i.key,
  i.label,
  i.provider,
  i.status,
  i.enabled,
  i.config,
  coalesce(array_length(i.secret_refs, 1), 0) as secrets,
  i.key_rotated_at,
  i.rotation_days,
  public.fn_integration_rotation_due(i) as rotation_due,
  case
    when i.key_rotated_at is null then null
    else (i.key_rotated_at + make_interval(days => i.rotation_days))::date
  end as rotation_due_on,
  i.health,
  i.last_checked_at,
  i.blocks,
  i.notes,
  i.sort
from public.integration i
where authz.staff_id() is not null;

grant select on public.integration_v to authenticated;

comment on view public.integration_v is
  'Runs as owner and scopes itself, because granting the base table would expose secret_refs — which this view exists to drop. The filter is one line, next to the thing it protects.';

/*
 * And the same check applied to every other view in this module,
 * since the mistake is easy to repeat: a security_invoker view over
 * a table the caller cannot select returns nothing, silently.
 *
 * `payout_rail` has a finance-only policy and IS granted, so it
 * errors loudly for anybody else rather than lying — which is what
 * we want. Everything else here reads tables granted to
 * `authenticated`, so they are fine as invoker views.
 */
