-- What the Audit console reads.
--
-- Five tabs, five views, and no table queried directly from the
-- browser. Each view carries its row already rendered — the actor's
-- label, the sentence describing what happened, whether it needs a
-- person — because the alternative is the console deciding what an
-- event means, and then two consoles deciding differently.
--
-- Every view inherits RLS from `audit.audit_event` underneath it, so
-- a finance lead and the DPO run the same query and get different
-- rows. None of these are SECURITY DEFINER, deliberately.

-- ════════════════════════════════════ one-line renderings

/*
 * The sentence. Built from what the event carries rather than from
 * the tables it points at, because by the time somebody reads this
 * the merchant may be gone and the row must still make sense.
 */
create or replace function audit.fn_sentence(e audit.audit_event)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(e.actor_label, '[Unknown]')
    || ' '
    || coalesce(
         (select lower(r.description) from audit.action_registry r where r.action = e.action),
         replace(e.action, '.', ' '))
    || coalesce(' · ' || e.target_label, '')
    || coalesce(' · ' || nullif(trim(e.reason), ''), '')
$$;

/* How long ago, in words a person reads faster than a timestamp. */
create or replace function audit.fn_ago(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_at is null then '[—]'
    when now() - p_at < interval '1 minute' then 'just now'
    when now() - p_at < interval '1 hour'
      then (extract(epoch from now() - p_at) / 60)::int || ' min ago'
    when now() - p_at < interval '1 day'
      then (extract(epoch from now() - p_at) / 3600)::int || ' h ago'
    when now() - p_at < interval '7 days'
      then (extract(epoch from now() - p_at) / 86400)::int || ' d ago'
    else to_char(p_at at time zone 'Africa/Nairobi', 'DD Mon')
  end
$$;

-- ═══════════════════════════════════════ J1 · Activity

create or replace view audit.console_activity_v as
select
  e.id,
  e.at,
  audit.fn_ago(e.at) as ago,
  e.hash_version,
  e.actor_type,
  e.actor_id,
  coalesce(e.actor_label, '[Unknown]') as actor_label,
  e.actor_role,
  e.on_behalf_of,
  e.module,
  e.action,
  coalesce(r.description, e.action) as action_label,
  e.target_type,
  e.target_id,
  e.target_label,
  e.severity,
  e.city_id,
  c.name as city_name,
  e.reason,
  e.approved_by,
  e.approver_label,
  e.before,
  e.after,
  e.diff,
  e.context,
  e.related,
  audit.fn_sentence(e) as sentence,
  /* How many fields moved — the console shows a count before it
     shows the diff, because most rows nobody needs to open. */
  coalesce(jsonb_array_length(
    case when e.diff is null then '[]'::jsonb
    else (select jsonb_agg(k) from jsonb_object_keys(e.diff) k) end), 0) as changed_fields,
  coalesce(r.money, false) as is_money,
  coalesce(array_length(r.pii_fields, 1), 0) > 0 as touches_pii,
  coalesce(r.two_person, false) as needs_two_people,
  r.action is null as unregistered,
  coalesce(m.review_state, 'none') as review_state,
  m.reviewed_by,
  m.reviewed_at,
  m.review_note,
  su.display_name as reviewed_by_name,
  /* The chain, per row. A reader should be able to see that this
     particular event still hashes to what it claims. */
  e.hash,
  e.prev_hash
from audit.audit_event e
left join audit.action_registry r on r.action = e.action
left join audit.event_meta m on m.event_id = e.id
left join public.city c on c.id = e.city_id
left join public.staff_user su on su.id = m.reviewed_by;

comment on view audit.console_activity_v is
  'The stream, rendered. Everything the row list and the detail panel need, with no second query to resolve a name.';

-- ═════════════════════════════ J2 · Sign-ins & security

create or replace view audit.console_sign_in_v as
select
  s.id,
  s.at,
  audit.fn_ago(s.at) as ago,
  s.staff_user_id,
  coalesce(su.display_name, s.email_attempted, '[Unknown]') as who,
  s.email_attempted,
  su.status as staff_status,
  s.outcome,
  s.outcome = 'success' as succeeded,
  s.auth_method,
  s.mfa_used,
  /* The last octet goes. It is enough to group by network and not
     enough to follow somebody home. */
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
  /* Failures against the same address in the ten minutes before
     this one — the number that makes a row worth looking at. */
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
  end as flag
from audit.sign_in s
left join public.staff_user su on su.id = s.staff_user_id;

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
  a.actor_label,
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
  ack.display_name as acknowledged_by_name,
  a.acknowledged_at,
  a.resolved_by,
  res.display_name as resolved_by_name,
  a.resolved_at,
  a.resolution_note,
  /* An open alert that nobody has touched in a day is its own
     problem, and the console says so rather than letting it sink. */
  a.state = 'open' and a.raised_at < now() - interval '24 hours' as stale
from audit.alert a
join audit.alert_rule ar on ar.key = a.rule_key
left join public.city c on c.id = a.city_id
left join public.staff_user ack on ack.id = a.acknowledged_by
left join public.staff_user res on res.id = a.resolved_by;

create or replace view audit.console_break_glass_v as
select
  b.id,
  b.staff_user_id,
  su.display_name as who,
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
  rev.display_name as reviewed_by_name,
  b.reviewed_at,
  b.review_outcome,
  b.review_note,
  /* Every event logged by that person inside the window — the whole
     reason a break-glass session is bounded in time. */
  (select count(*) from audit.audit_event e
    where e.actor_id = b.staff_user_id
      and e.at between b.opened_at and coalesce(b.closed_at, b.expires_at)) as events_during
from audit.break_glass b
left join public.staff_user su on su.id = b.staff_user_id
left join public.staff_user rev on rev.id = b.reviewed_by
left join public.city c on c.id = b.city_id;

-- ════════════════════════════════════ J3 · Money trail

/*
 * Every event the registry marks as money, in order, with the amounts
 * pulled out of the payload where they are there.
 *
 * It does not reconcile. Reconciliation needs the orders domain,
 * which does not exist yet, so the amounts are what the event
 * recorded and the tab says plainly that the other side is missing
 * rather than showing a balanced-looking number nobody computed.
 */
create or replace view audit.console_money_v as
select
  e.id,
  e.at,
  audit.fn_ago(e.at) as ago,
  e.module,
  e.action,
  coalesce(r.description, e.action) as action_label,
  coalesce(e.actor_label, '[Unknown]') as actor_label,
  e.actor_id,
  e.target_type,
  e.target_id,
  e.target_label,
  e.city_id,
  c.name as city_name,
  e.reason,
  e.approved_by,
  e.approver_label,
  r.two_person as needs_two_people,
  /* Two people were required and only one is recorded. This is the
     column the tab sorts by. */
  coalesce(r.two_person, false) and e.approved_by is null as missing_second_person,
  /* Amounts, in cents, where the payload carried them. Null is not
     zero and the console must not render it as such. */
  nullif(e.after ->> 'amount_cents', '')::bigint as amount_cents,
  nullif(e.after ->> 'currency', '') as currency,
  (e.after ->> 'amount_cents') is null as amount_not_recorded,
  e.related ->> 'order_reference' as order_reference,
  (e.related ->> 'statement_id')::uuid as statement_id,
  (e.related ->> 'settlement_run_id')::uuid as settlement_run_id,
  (e.related ->> 'dispute_id')::uuid as dispute_id,
  e.diff,
  e.severity,
  coalesce(m.review_state, 'none') as review_state
from audit.audit_event e
join audit.action_registry r on r.action = e.action and r.money
left join audit.event_meta m on m.event_id = e.id
left join public.city c on c.id = e.city_id;

comment on view audit.console_money_v is
  'The money trail. Amounts come from the event payload and are null when nothing recorded them — the tab says so rather than showing a zero that looks like a fact.';

-- ═══════════════════════════════════ J4 · Data access

/*
 * Who looked at whose personal details, and why.
 *
 * The reason column is the point of the tab. A reveal without one is
 * not forbidden — sometimes there genuinely is not time — but it is
 * sorted to the top and somebody has to explain it afterwards.
 */
create or replace view audit.console_data_access_v as
select
  e.id,
  e.at,
  audit.fn_ago(e.at) as ago,
  e.module,
  e.action,
  coalesce(r.description, e.action) as action_label,
  e.actor_id,
  coalesce(e.actor_label, '[Unknown]') as actor_label,
  e.actor_role,
  e.on_behalf_of,
  e.target_type,
  e.target_id,
  e.target_label as subject_label,
  r.pii_fields,
  e.reason,
  coalesce(trim(e.reason), '') = '' as no_reason_given,
  e.context ->> 'surface' as surface,
  e.context ->> 'ip_country' as ip_country,
  e.city_id,
  c.name as city_name,
  e.severity,
  coalesce(m.review_state, 'none') as review_state,
  m.reviewed_at,
  /* How many times this person revealed anything in the hour around
     it. One is a job; forty is a pattern. */
  (select count(*) from audit.audit_event x
    join audit.action_registry xr on xr.action = x.action
   where x.actor_id = e.actor_id
     and coalesce(array_length(xr.pii_fields, 1), 0) > 0
     and x.at between e.at - interval '30 minutes' and e.at + interval '30 minutes'
  ) as reveals_in_the_hour
from audit.audit_event e
join audit.action_registry r on r.action = e.action
  and (coalesce(array_length(r.pii_fields, 1), 0) > 0 or r.action like 'pii.%' or r.action = 'export.created')
left join audit.event_meta m on m.event_id = e.id
left join public.city c on c.id = e.city_id;

create or replace view audit.console_export_v as
select
  x.id,
  x.at,
  audit.fn_ago(x.at) as ago,
  x.staff_user_id,
  coalesce(su.display_name, x.actor_label, '[Unknown]') as who,
  x.module,
  x.what,
  x.row_count,
  x.format,
  x.reason,
  x.contains_pii,
  x.destination,
  x.event_id,
  /* 22:00–06:00 Nairobi. Not wrong, but worth a glance. */
  extract(hour from x.at at time zone 'Africa/Nairobi') >= 22
    or extract(hour from x.at at time zone 'Africa/Nairobi') < 6 as outside_hours
from audit.export_log x
left join public.staff_user su on su.id = x.staff_user_id;

-- ═══════════════════════════ J5 · Evidence & retention

create or replace view audit.console_evidence_v as
select
  p.id,
  p.reference,
  p.title,
  p.purpose,
  p.requested_by,
  p.reason,
  p.legal_hold_id,
  h.reference as legal_hold_reference,
  p.filter,
  p.from_at,
  p.to_at,
  p.event_count,
  p.first_event_id,
  p.last_event_id,
  encode(p.content_hash, 'hex') as content_hash_hex,
  /* The first twelve characters, which is what a person reads aloud
     down a telephone to confirm two copies match. */
  left(encode(p.content_hash, 'hex'), 12) as content_hash_short,
  p.chain_ok,
  p.chain_checked_at,
  p.state,
  p.created_by,
  cre.display_name as created_by_name,
  p.created_at,
  p.frozen_at,
  p.shared_at,
  p.shared_with,
  p.shared_how,
  p.withdrawn_at,
  p.withdrawn_reason,
  /* Does the pack still match the log? Recomputed on read, which is
     cheap at this size and is the only honest way to answer it. */
  not exists (
    select 1 from audit.evidence_pack_event pe
    join audit.audit_event e on e.id = pe.event_id
    where pe.pack_id = p.id and e.hash is distinct from pe.hash_at_freeze
  ) as still_matches_the_log
from audit.evidence_pack p
left join audit.legal_hold h on h.id = p.legal_hold_id
left join public.staff_user cre on cre.id = p.created_by;

create or replace view audit.console_retention_v as
select
  rr.key,
  rr.module,
  rr.subject,
  rr.description,
  rr.retain_for,
  /* Rendered, because an interval printed raw reads badly and this
     is a number a lawyer checks. */
  case when rr.retain_for is null then '[—]'
       else trim(both from replace(rr.retain_for::text, 'mons', 'months')) end as retain_for_label,
  rr.basis,
  rr.anonymise,
  rr.last_run_at,
  rr.last_run_rows,
  rr.last_run_held,
  rr.approved_by,
  app.display_name as approved_by_name,
  rr.second_approver_id,
  sec.display_name as second_approver_name,
  rr.approved_at,
  rr.updated_at,
  /* The three ways a rule is not actually in force. */
  rr.retain_for is null as period_not_set,
  rr.approved_at is null as not_approved,
  rr.last_run_at is null or rr.last_run_at < now() - interval '8 days' as not_running
from public.retention_rule rr
left join public.staff_user app on app.id = rr.approved_by
left join public.staff_user sec on sec.id = rr.second_approver_id;

create or replace view audit.console_legal_hold_v as
select
  h.id,
  h.reference,
  h.title,
  h.reason,
  h.subject_type,
  h.subject_id,
  h.city_id,
  c.name as city_name,
  h.from_at,
  h.to_at,
  h.instructed_by,
  h.placed_by,
  pl.display_name as placed_by_name,
  h.placed_at,
  h.released_by,
  rl.display_name as released_by_name,
  h.released_at,
  h.release_reason,
  h.released_at is null as active,
  (select count(*) from audit.evidence_pack p where p.legal_hold_id = h.id) as packs
from audit.legal_hold h
left join public.city c on c.id = h.city_id
left join public.staff_user pl on pl.id = h.placed_by
left join public.staff_user rl on rl.id = h.released_by;

/*
 * The health of the log itself. One row, read at the top of the
 * Evidence tab, and the only place that says out loud whether the
 * thing everything else depends on is sound.
 */
create or replace view audit.console_health_v as
select
  (select count(*) from audit.audit_event) as events_total,
  (select min(at) from audit.audit_event) as oldest_event,
  (select max(at) from audit.audit_event) as newest_event,
  (select count(*) from audit.audit_event where at > now() - interval '24 hours') as events_today,
  (select count(*) from audit.event_meta where review_state = 'needs_review') as needs_review,
  (select count(*) from audit.alert where state = 'open') as alerts_open,
  (select count(*) from audit.break_glass
    where closed_at is null and expires_at <= now()) as break_glass_expired_unclosed,
  (select count(*) from audit.break_glass where reviewed_at is null) as break_glass_unreviewed,
  (select count(*) from audit.legal_hold where released_at is null) as holds_active,
  (select count(*) from audit.audit_event e
    left join audit.action_registry r on r.action = e.action
   where r.action is null) as unregistered_events,
  (select count(*) from public.retention_rule where retain_for is null) as retention_rules_unset,
  c.ok as chain_ok,
  c.ran_at as chain_checked_at,
  c.events_checked as chain_events_checked,
  c.first_bad_id as chain_first_bad_id,
  c.detail as chain_detail,
  /* A verification older than two days is itself a finding. */
  c.ran_at is null or c.ran_at < now() - interval '2 days' as chain_check_overdue
from (
  select * from audit.chain_check order by ran_at desc limit 1
) c
right join (select 1) one on true;

comment on view audit.console_health_v is
  'Whether the log can be trusted, in one row. If chain_ok is false nothing else on this screen means anything.';

-- ══════════════════════════════════════════ grants

grant select on
  audit.console_activity_v, audit.console_sign_in_v, audit.console_alert_v,
  audit.console_break_glass_v, audit.console_money_v, audit.console_data_access_v,
  audit.console_export_v, audit.console_evidence_v, audit.console_retention_v,
  audit.console_legal_hold_v, audit.console_health_v
  to authenticated;

grant execute on function audit.fn_sentence(audit.audit_event) to authenticated;
grant execute on function audit.fn_ago(timestamptz) to authenticated;
grant execute on function audit.fn_visible(uuid, text, uuid, boolean) to authenticated;
grant execute on function audit.fn_under_hold(text, uuid) to authenticated;
grant execute on function authz.audit_level() to authenticated;
