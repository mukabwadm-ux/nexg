-- An audit log identifies people by email, not by display name.
--
-- The sign-ins table and the break-glass list showed
-- `staff_user.display_name`, which is friendlier and is the wrong
-- choice here. Two people can be called the same thing; an email
-- address on this project is unique by constraint, it is the thing
-- an invitation was sent to, and it is what somebody reads out when
-- they are asking who did something.
--
-- The display name stays, beside it, because "derrick@nexgapp.com"
-- and "Derrick Mukabwa" together read better than either alone.

create or replace view audit.console_sign_in_v as
select
  s.id,
  s.at,
  audit.fn_ago(s.at) as ago,
  s.staff_user_id,
  /* The email first: unique by constraint, and the thing the
     invitation went to. */
  coalesce(su.email, s.email_attempted, '[Unknown]') as who,
  s.email_attempted,
  su.status as staff_status,
  s.outcome,
  s.outcome = 'success' as succeeded,
  s.auth_method,
  s.mfa_used,
  case when s.ip is null then null
       else host(network(set_masklen(s.ip, case when family(s.ip) = 4 then 24 else 48 end)))
  end as ip_masked,
  s.ip_country,
  s.device_label,
  s.first_from_device,
  s.first_from_country,
  s.session_id,
  s.ended_at,
  s.ended_reason,
  s.ended_at is null and s.outcome = 'success' as session_live,
  (select count(*) from audit.sign_in f
    where f.email_attempted is not distinct from s.email_attempted
      and f.outcome <> 'success'
      and f.at between s.at - interval '10 minutes' and s.at) as recent_failures,
  case
    when s.outcome = 'success' and s.first_from_country then 'New country'
    when s.outcome = 'success' and s.first_from_device then 'New device'
    when s.outcome = 'mfa_failed' then 'MFA failed'
    when s.outcome = 'unknown_email' then 'No such account'
    when s.outcome <> 'success' then 'Refused'
    else null
  end as flag,
  /* Appended, not slotted in beside `who`: CREATE OR REPLACE VIEW
     cannot insert a column mid-list, and the error names whichever
     column happened to shift rather than the one you added. */
  su.display_name as who_name
from audit.sign_in s
left join public.staff_user su on su.id = s.staff_user_id;

create or replace view audit.console_break_glass_v as
select
  b.id,
  b.staff_user_id,
  coalesce(su.email, b.staff_label, '[Removed]') as who,
  b.opened_at,
  audit.fn_ago(b.opened_at) as ago,
  b.reason,
  b.scope,
  b.module_key,
  b.city_id,
  c.name as city_name,
  b.expires_at,
  b.closed_at,
  b.closed_at is null and b.expires_at > now() as open_now,
  b.closed_at is null and b.expires_at <= now() as expired_unclosed,
  b.reviewed_by,
  coalesce(rev.email, '') as reviewed_by_name,
  b.reviewed_at,
  b.review_outcome,
  b.review_note,
  (select count(*) from audit.audit_event e
    where e.actor_id = b.staff_user_id
      and e.at between b.opened_at and coalesce(b.closed_at, b.expires_at)) as events_during,
  su.display_name as who_name
from audit.break_glass b
left join public.staff_user su on su.id = b.staff_user_id
left join public.staff_user rev on rev.id = b.reviewed_by
left join public.city c on c.id = b.city_id;

/* The review and alert columns too — same reasoning. */
create or replace view audit.console_alert_v as
select
  a.id,
  a.rule_key,
  ar.title,
  ar.next_step,
  a.raised_at,
  audit.fn_ago(a.raised_at) as ago,
  a.severity,
  a.actor_id,
  coalesce(a.actor_label, (select su.email from public.staff_user su where su.id = a.actor_id)) as actor_label,
  a.target_type,
  a.target_id,
  a.city_id,
  c.name as city_name,
  a.event_count,
  a.first_event_id,
  a.last_event_id,
  a.summary,
  a.state,
  a.acknowledged_by,
  ack.email as acknowledged_by_name,
  a.acknowledged_at,
  a.resolved_by,
  res.email as resolved_by_name,
  a.resolved_at,
  a.resolution_note,
  a.state = 'open' and a.raised_at < now() - interval '24 hours' as stale
from audit.alert a
join audit.alert_rule ar on ar.key = a.rule_key
left join public.city c on c.id = a.city_id
left join public.staff_user ack on ack.id = a.acknowledged_by
left join public.staff_user res on res.id = a.resolved_by;

comment on view audit.console_sign_in_v is
  'Every attempt, successful or not. Identified by email rather than display name: two people can share a name, an email on this project cannot, and it is what the invitation went to.';
