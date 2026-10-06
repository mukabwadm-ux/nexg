-- The other four Messaging tabs.
--
-- Channels, Insights, Canned replies and Settings. The first two
-- are read-only questions about the desk; the second two are the
-- desk's own configuration, which until now existed as rows
-- nobody could see.
--
-- One thing shapes all four: a median over three conversations
-- is not a median, it is one of the three. Every figure here
-- carries the count it was computed from, and the screens refuse
-- to draw a trend under a threshold rather than drawing a
-- confident line through noise. A dashboard that will not say
-- "too few to tell" ends up being quoted in a meeting.

-- ════════════════════════════════════════════════ Channels

create or replace view msg_channel_v
with (security_invoker = true) as
select
  c.current_channel::text as channel,
  count(*)::bigint as total,
  count(*) filter (where c.status not in ('resolved', 'closed'))::bigint as open_now,
  count(*) filter (where c.assignee_id is null
                     and c.status not in ('resolved', 'closed'))::bigint as unassigned,
  count(*) filter (where c.created_at > now() - interval '24 hours')::bigint as last_24h,
  count(*) filter (where c.created_at > now() - interval '7 days')::bigint as last_7d,

  /*
   * Medians, not means. One conversation left open over a
   * weekend moves a mean by hours and tells you nothing about
   * what the desk normally does.
   */
  percentile_disc(0.5) within group (
    order by extract(epoch from (c.first_responded_at - c.created_at))
  ) filter (where c.first_responded_at is not null)::bigint as median_first_response_s,

  percentile_disc(0.5) within group (
    order by extract(epoch from (c.resolved_at - c.created_at)) / 60
  ) filter (where c.resolved_at is not null)::bigint as median_resolution_min,

  count(*) filter (where c.first_responded_at is not null)::bigint as answered,
  count(*) filter (where c.resolved_at is not null)::bigint as resolved,

  /* Breached its first-response promise and still has not been
     answered. Not "was once late" — still waiting, now. */
  count(*) filter (
    where c.first_responded_at is null
      and c.first_response_due_at is not null
      and c.first_response_due_at < now())::bigint as breaching_now,

  max(c.last_message_at) as latest_activity
from public.msg_conversation c
where c.kind = 'external'
group by c.current_channel;

comment on view msg_channel_v is
  'Each way in, and how the desk is doing on it. Medians rather than means: one conversation left open over a weekend moves a mean by hours and says nothing about the normal case.';

/*
 * WhatsApp has a rule nothing else has.
 *
 * Outside twenty-four hours from the last inbound message, a
 * free-text reply is refused by Meta and only an approved
 * template will go. A desk that cannot see which conversations
 * have closed their window will write replies that are silently
 * never delivered, and the agent will believe they answered.
 */
create or replace view msg_whatsapp_window_v
with (security_invoker = true) as
select
  w.conversation_id,
  w.msisdn_masked,
  w.opt_in_at,
  w.last_inbound_at,
  w.last_outbound_at,
  w.window_expires_at,
  w.window_expires_at > now() as window_open,
  greatest(0, extract(epoch from (w.window_expires_at - now()))/3600)::numeric(6,1)
    as hours_left,
  c.status::text as status,
  c.subject
from public.msg_whatsapp_session w
join public.msg_conversation c on c.id = w.conversation_id;

comment on view msg_whatsapp_window_v is
  'Which WhatsApp conversations can still be answered in free text. Outside the window Meta refuses anything but an approved template, and a reply written in ignorance is never delivered while the agent believes it was.';

-- ════════════════════════════════════════════════ Insights

create or replace view msg_insight_daily_v
with (security_invoker = true) as
select
  (c.created_at at time zone 'Africa/Nairobi')::date as day,
  count(*)::bigint as opened,
  count(*) filter (where c.resolved_at is not null)::bigint as resolved,
  count(*) filter (where c.resolved_in_one)::bigint as resolved_first_touch,
  count(*) filter (where c.reopened_count > 0)::bigint as reopened,
  percentile_disc(0.5) within group (
    order by extract(epoch from (c.first_responded_at - c.created_at))
  ) filter (where c.first_responded_at is not null)::bigint as median_first_response_s,
  count(*) filter (where c.first_responded_at is not null)::bigint as answered,
  avg(c.rating) filter (where c.rating is not null)::numeric(3,2) as avg_rating,
  count(*) filter (where c.rating is not null)::bigint as rated
from public.msg_conversation c
where c.kind = 'external'
group by 1
order by 1 desc;

create or replace view msg_insight_topic_v
with (security_invoker = true) as
select
  coalesce(c.topic::text, 'not tagged') as topic,
  count(*)::bigint as total,
  count(*) filter (where c.status not in ('resolved', 'closed'))::bigint as still_open,
  count(*) filter (where c.resolved_in_one)::bigint as resolved_first_touch,
  percentile_disc(0.5) within group (
    order by extract(epoch from (c.resolved_at - c.created_at)) / 60
  ) filter (where c.resolved_at is not null)::bigint as median_resolution_min,
  avg(c.rating) filter (where c.rating is not null)::numeric(3,2) as avg_rating,
  count(*) filter (where c.rating is not null)::bigint as rated
from public.msg_conversation c
where c.kind = 'external'
group by 1
order by 2 desc;

/*
 * Load by hour of the day, in Nairobi time.
 *
 * The one chart that changes a rota. Everything else on the
 * Insights tab describes how the desk performed; this says when
 * to have people on it.
 */
create or replace view msg_insight_hour_v
with (security_invoker = true) as
select
  extract(hour from (c.created_at at time zone 'Africa/Nairobi'))::integer as hour,
  count(*)::bigint as opened,
  count(*) filter (
    where c.created_at > now() - interval '28 days')::bigint as opened_28d,
  percentile_disc(0.5) within group (
    order by extract(epoch from (c.first_responded_at - c.created_at))
  ) filter (where c.first_responded_at is not null)::bigint as median_first_response_s
from public.msg_conversation c
where c.kind = 'external'
group by 1
order by 1;

comment on view msg_insight_hour_v is
  'Load by hour of the Nairobi day. The one view here that changes a rota rather than describing one.';

-- ══════════════════════════════════════════ Canned replies

create or replace view msg_canned_reply_v
with (security_invoker = true) as
select
  r.key,
  r.title,
  r.body_by_lang,
  r.audience::text as audience,
  r.topic::text as topic,
  r.action_key,
  r.owner_team::text as owner_team,
  r.needs_approval,
  r.approved_by,
  s.email as approved_by_email,
  r.approved_at,
  r.usage_count,
  r.last_used_at,
  /* Which languages this actually exists in. A reply with only
     English is a reply half the guests cannot read, and that is
     invisible unless it is counted. */
  (select array_agg(k order by k) from jsonb_object_keys(r.body_by_lang) k) as languages,
  r.needs_approval and r.approved_at is null as blocked
from public.msg_canned_reply r
left join public.staff_user s on s.id = r.approved_by;

comment on view msg_canned_reply_v is
  'The canned replies, with the languages each one actually exists in. A reply that is English-only is one half the guests cannot read, which is invisible unless counted.';

-- ════════════════════════════════════════════════ Settings

create or replace view msg_routing_rule_v
with (security_invoker = true) as
select
  r.id,
  r.priority,
  r.label,
  r.conditions,
  r.owner_team::text as owner_team,
  r.priority_out::text as priority_out,
  r.first_response_sla_s,
  r.resolution_sla_min,
  r.auto_link,
  r.enabled,
  /*
   * How often this rule has actually decided something. A rule
   * that has never matched is either dead or shadowed by one
   * above it, and both are worth seeing next to the rule.
   */
  (select count(*) from public.msg_conversation c
    where c.owner_team = r.owner_team
      and c.created_at > now() - interval '30 days')::bigint as team_volume_30d
from public.msg_routing_rule r
order by r.priority;

create or replace view msg_desk_roster_v
with (security_invoker = true) as
select
  p.staff_user_id,
  s.display_name,
  s.email,
  p.state::text as state,
  p.on_shift_until,
  p.capacity,
  p.active_count,
  p.last_seen_at,
  p.device,
  /*
   * Stale presence is its own state. Somebody shown "available"
   * who last pinged ninety minutes ago is not available, and
   * routing to them is how a conversation sits unanswered while
   * the board says it was assigned.
   */
  p.last_seen_at < now() - interval '15 minutes' as presence_stale,
  greatest(0, p.capacity - p.active_count) as headroom
from public.msg_presence p
join public.staff_user s on s.id = p.staff_user_id
order by p.state, s.display_name;

comment on view msg_desk_roster_v is
  'Who is on the desk, with stale presence called out. Somebody shown available who last pinged ninety minutes ago is not available, and routing to them is how a conversation sits unanswered while the board says it was assigned.';

grant select on
  msg_channel_v,
  msg_whatsapp_window_v,
  msg_insight_daily_v,
  msg_insight_topic_v,
  msg_insight_hour_v,
  msg_canned_reply_v,
  msg_routing_rule_v,
  msg_desk_roster_v
to authenticated;
