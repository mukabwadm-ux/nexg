-- An alert rule that did not check the thing its title claims.
--
-- `export_outside_hours` is described as "Data left the system
-- between 22:00 and 06:00", and `cron_run_alerts` matched it on the
-- action alone. Every export raised it, at any hour.
--
-- That is worse than a missing rule. A rule that fires on everything
-- gets muted within a week, and then the night-time export it was
-- built for goes past unnoticed along with all the rest.
--
-- The hour window becomes part of the rule rather than part of its
-- name, and the evaluator reads it.

alter table audit.alert_rule
  /* Nairobi hours, inclusive of `from`, exclusive of `to`. A window
     that wraps midnight is written 22 → 6 and read as such. */
  add column if not exists hour_from smallint
    check (hour_from is null or hour_from between 0 and 23),
  add column if not exists hour_to smallint
    check (hour_to is null or hour_to between 0 and 23);

do $$ begin
  alter table audit.alert_rule
    add constraint alert_rule_hours_come_in_pairs
    check ((hour_from is null) = (hour_to is null));
exception when duplicate_object then null; end $$;

update audit.alert_rule
   set hour_from = 22, hour_to = 6
 where key = 'export_outside_hours';

comment on column audit.alert_rule.hour_from is
  'Start of the Nairobi-time window this rule watches, or null for every hour. A window that wraps midnight (22 to 6) is written that way and read that way.';

create or replace function audit.cron_run_alerts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r audit.alert_rule;
  v_raised integer := 0;
  v_updated integer := 0;
  g record;
begin
  for r in select * from audit.alert_rule where active loop
    for g in
      execute format($q$
        select
          %s as actor_id,
          %s as target_id,
          max(case when e.actor_label is not null then e.actor_label end) as actor_label,
          max(e.target_type) as target_type,
          max(e.city_id::text)::uuid as city_id,
          count(*)::int as n,
          min(e.id) as first_id,
          max(e.id) as last_id
        from audit.audit_event e
        where e.at > now() - $1
          and (cardinality($2::text[]) = 0 or e.action = any ($2))
          and (cardinality($3::text[]) = 0 or e.module = any ($3))
          and e.severity >= $4
          and (
            $6::smallint is null
            or case
                 /* A window inside one day. */
                 when $6 < $7 then
                   extract(hour from e.at at time zone 'Africa/Nairobi') >= $6
                   and extract(hour from e.at at time zone 'Africa/Nairobi') < $7
                 /* One that wraps midnight. */
                 else
                   extract(hour from e.at at time zone 'Africa/Nairobi') >= $6
                   or extract(hour from e.at at time zone 'Africa/Nairobi') < $7
               end
          )
        group by 1, 2
        having count(*) >= $5
      $q$,
        case when r.group_by = 'actor' then 'e.actor_id' else 'null::uuid' end,
        case when r.group_by = 'target' then 'e.target_id' else 'null::uuid' end)
      using r.time_window, r.match_actions, r.match_modules, r.min_severity,
            coalesce(r.threshold, 1), r.hour_from, r.hour_to
    loop
      insert into audit.alert (
        rule_key, severity, actor_id, actor_label, target_type, target_id,
        city_id, event_count, first_event_id, last_event_id, summary)
      values (
        r.key, r.severity, g.actor_id, g.actor_label, g.target_type, g.target_id,
        g.city_id, g.n, g.first_id, g.last_id,
        r.title || ' — ' || g.n || ' in the last '
          || trim(both from r.time_window::text))
      on conflict (rule_key,
                   coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
                   coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid))
        where state = 'open'
      do update set
        event_count = excluded.event_count,
        last_event_id = excluded.last_event_id,
        summary = excluded.summary;

      if found then v_updated := v_updated + 1; else v_raised := v_raised + 1; end if;
    end loop;
  end loop;

  return jsonb_build_object('ok', true, 'raised', v_raised, 'updated', v_updated);
end;
$$;

/* And the view carries the window, so the Sign-ins tab can say what a
   rule actually watches rather than only what it is called. */
create or replace view audit.console_alert_rule_v as
select
  r.key,
  r.title,
  r.description,
  r.match_actions,
  r.match_modules,
  r.min_severity,
  r.threshold,
  r.time_window,
  r.hour_from,
  r.hour_to,
  case
    when r.hour_from is null then 'any hour'
    else lpad(r.hour_from::text, 2, '0') || ':00–' || lpad(r.hour_to::text, 2, '0') || ':00'
  end as hours_label,
  r.group_by,
  r.severity,
  r.active,
  r.next_step,
  (select count(*) from audit.alert a where a.rule_key = r.key and a.state = 'open') as open_alerts,
  (select max(a.raised_at) from audit.alert a where a.rule_key = r.key) as last_raised
from audit.alert_rule r;

grant select on audit.console_alert_rule_v to authenticated;
