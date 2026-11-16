-- Every audit action a merchant command logs is registered (20261221000100).
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select results_eq(
  $$select action collate "C", module, default_severity::text, pii_fields, needs_review
    from audit.action_registry
    where action in (
      'merchant.hours_set', 'merchant.hours_copied', 'merchant.holiday_hours_set',
      'merchant.hours_override_cleared', 'merchant.member_updated', 'merchant.member_removed',
      'merchant.invite_revoked', 'merchant.settings_changed')
    order by 1$$,
  $$values
    ('merchant.holiday_hours_set' collate "C", 'merchants', 'info', '{}'::text[], false),
    ('merchant.hours_copied', 'merchants', 'info', '{}'::text[], false),
    ('merchant.hours_override_cleared', 'merchants', 'info', '{}'::text[], false),
    ('merchant.hours_set', 'merchants', 'info', '{}'::text[], false),
    ('merchant.invite_revoked', 'merchants', 'notice', '{}'::text[], false),
    ('merchant.member_removed', 'merchants', 'notice', '{}'::text[], false),
    ('merchant.member_updated', 'merchants', 'notice', '{}'::text[], false),
    ('merchant.settings_changed', 'merchants', 'info', '{}'::text[], false)$$,
  'the hours, team and settings actions are registered under Merchants'
);

-- A merchant action named in any function's audit.log call must be in the
-- registry, or every use raises an audit.unknown_action alert. This reads each
-- call up to its semicolon and takes every 'merchant.*' literal in it, so both
-- positional and named calls count, and so does each branch of a CASE. The
-- actor type ('merchant_user') and target type ('merchant') have no dot.
select is_empty(
  $$select distinct a[1]
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral regexp_matches(p.prosrc, 'audit\.log\s*\(([^;]*)', 'g') c
    cross join lateral regexp_matches(c[1], '''(merchant\.[a-z_]+)''', 'g') a
    where n.nspname in ('public', 'authz', 'audit')
      and not exists (select 1 from audit.action_registry r where r.action = a[1])$$,
  'every merchant action a function logs is registered'
);

create temp table t_logged as
select audit.log('system'::public.actor_type, 'merchants', a, p_target_type => 'merchant') as id
from unnest(array[
  'merchant.hours_set', 'merchant.hours_copied', 'merchant.holiday_hours_set',
  'merchant.hours_override_cleared', 'merchant.member_updated', 'merchant.member_removed',
  'merchant.invite_revoked', 'merchant.settings_changed']) a;

select is(
  (select count(*)::int from audit.audit_event e where e.id in (select id from t_logged)),
  8,
  'each of them is written to the audit trail'
);

select is(
  (select count(*)::int from audit.audit_event e
   where e.action = 'audit.unknown_action'
     and (e.after ->> 'event_id')::bigint in (select id from t_logged)),
  0,
  'none of them raises an unknown-action alert any more'
);

select * from finish();
rollback;
