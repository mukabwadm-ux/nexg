-- What the desk reads.
--
-- Views rather than queries in the page, for the same reason
-- everywhere else in this system: the queue's sort order is a
-- product decision, and a product decision that lives in a React
-- file gets a second, slightly different copy the first time
-- somebody builds a mobile view.

-- ════════════════════════════════════════════════ the queue

drop view if exists msg_inbox_v cascade;
create view msg_inbox_v
with (security_invoker = true) as
select
  c.id,
  c.kind,
  c.status,
  c.topic,
  c.subject,
  c.priority,
  c.city_id,
  ct.name as city,
  c.origin_channel,
  c.current_channel,
  c.assignee_id,
  sa.display_name as assignee,
  c.owner_team,
  c.escalated_to,
  c.created_at,
  c.last_message_at,
  c.last_external_message_at,
  c.first_responded_at,
  c.resolved_at,
  c.rating,

  /* The primary object, so the row can say "NX-… · 12 min late"
     rather than only the guest's name. */
  l.label as object_label,
  l.object_type,
  l.object_id,

  /* The guest's first name, or the team for an internal thread.
     Never a surname: the queue is visible to every agent and a
     full name is not needed to answer a question. */
  (select p.display_name from public.msg_participant p
    where p.conversation_id = c.id and p.kind <> 'staff'
    order by p.joined_at limit 1) as with_whom,

  /*
   * For an external conversation this is the last thing said
   * *outwardly* — which is what "what is this person waiting
   * on" means. It showed the last message of any kind at first,
   * so a queue row read back the agent's own internal note
   * while the guest was still waiting on something else
   * entirely. An internal thread has no outside, so there it is
   * simply the last message.
   */
  (select m.body from public.msg_message m
    where m.conversation_id = c.id
      and m.kind <> 'system'
      and (c.kind <> 'external' or m.visibility = 'external')
    order by m.seq desc limit 1) as snippet,

  /* Shown beside it, so an agent can see at a glance that the
     thread has internal traffic they have not read. */
  (select count(*) from public.msg_message m
    where m.conversation_id = c.id and m.visibility = 'internal'
      and m.kind <> 'system')::integer as internal_notes,

  (select count(*) from public.msg_message m
    where m.conversation_id = c.id) as message_count,

  /*
   * Whether we are late, and by how much.
   *
   * Computed here so the colour on the row and the number in
   * the tile cannot disagree — they are the same expression.
   * Null once answered: a conversation that got its first reply
   * is no longer an SLA problem even if it is still open.
   */
  case
    when c.first_responded_at is not null then null
    when c.first_response_due_at is null then null
    else extract(epoch from (now() - c.first_response_due_at))::integer
  end as overdue_s,

  c.first_response_due_at,
  c.assignee_id is null and c.kind = 'external' as unassigned
from public.msg_conversation c
left join public.city ct on ct.id = c.city_id
left join public.staff_user sa on sa.id = c.assignee_id
left join lateral (
  select ol.* from public.msg_object_link ol
   where ol.conversation_id = c.id
   order by ol.is_primary desc, ol.linked_at
   limit 1
) l on true;

comment on view msg_inbox_v is
  'The queue, sorted by the page. overdue_s goes null once answered — a conversation that got its first reply is no longer an SLA problem even while it stays open.';

-- ═════════════════════════════════════════ the transcript
--
-- No visibility filter is written here, and that is the point.
-- RLS on msg_message already refuses internal rows to anyone
-- without a staff participant row, so this view cannot leak by
-- forgetting a predicate — there is no predicate to forget.

drop view if exists msg_message_v cascade;
create view msg_message_v
with (security_invoker = true) as
select
  m.id,
  m.conversation_id,
  m.seq,
  m.kind,
  m.visibility,
  m.body,
  m.attachments,
  m.object_links,
  m.action,
  m.channel_out,
  m.delivery,
  m.created_at,
  m.redacted_at,
  m.redaction_reason,
  p.kind as author_kind,
  p.display_name as author,
  p.role_label as author_role,
  p.staff_user_id as author_staff_id
from public.msg_message m
left join public.msg_participant p on p.id = m.author_participant_id;

-- ════════════════════════════════════════ is the desk open
--
-- Derived from presence, never from a schedule. The widget says
-- "a person replies in about two minutes" on the strength of
-- this, and a schedule would let it say that at 03:00 with
-- nobody there.

drop view if exists msg_desk_status_v cascade;
create view msg_desk_status_v
with (security_invoker = true) as
select
  count(*) filter (
    where pr.state = 'online' and pr.last_seen_at > now() - interval '2 minutes')::integer
    as online,
  count(*) filter (where pr.state = 'busy')::integer as busy,
  coalesce(sum(greatest(0, pr.capacity - pr.active_count))
    filter (where pr.state = 'online'), 0)::integer as capacity_left,
  count(*)::integer as on_roster,
  /* A median over the last half hour, which is what "replies in
     about N" should mean — not an all-time average that a good
     Tuesday keeps looking healthy. */
  (select percentile_cont(0.5) within group (
            order by extract(epoch from (c.first_responded_at - c.created_at)))
     from public.msg_conversation c
    where c.first_responded_at is not null
      and c.created_at > now() - interval '30 minutes'
      /* A reply cannot predate the question. Rows where it does
         are impossible — a backfill, a clock, a seed — and
         averaging them in produced a median of minus sixty-four
         minutes on the tile, which is worse than no number
         because somebody has to work out what it means. */
      and c.first_responded_at >= c.created_at)::integer as median_first_reply_s
from public.msg_presence pr;

-- ═══════════════════════════════════════ the sidebar badge

drop view if exists msg_badges_v cascade;
create view msg_badges_v
with (security_invoker = true) as
select
  count(*) filter (where c.kind = 'external' and c.status not in ('resolved','closed','archived')
                     and c.assignee_id is null)::integer as unassigned,
  count(*) filter (where c.kind = 'external' and c.status not in ('resolved','closed','archived')
                     and c.first_responded_at is null
                     and c.first_response_due_at < now())::integer as overdue,
  count(*) filter (where c.kind = 'external'
                     and c.status not in ('resolved','closed','archived'))::integer as open_now
from public.msg_conversation c;

-- ════════════════════════════ conversations about a record

drop view if exists msg_object_conversations_v cascade;
create view msg_object_conversations_v
with (security_invoker = true) as
select
  ol.object_type,
  ol.object_id,
  ol.label,
  c.id as conversation_id,
  c.kind,
  c.subject,
  c.status,
  c.last_message_at
from public.msg_object_link ol
join public.msg_conversation c on c.id = ol.conversation_id;

grant select on msg_inbox_v, msg_message_v, msg_desk_status_v, msg_badges_v,
                msg_object_conversations_v
  to authenticated;

-- ══════════════════════════════════════════ how a chat is routed
--
-- Seeded as rows rather than written into a function, so the
-- desk lead can change where "rider cash" goes without a deploy
-- — and so the rules are a list somebody can read in one screen.

insert into msg_routing_rule
  (priority, label, conditions, owner_team, priority_out, first_response_sla_s, auto_link)
values
  (10, 'A live order in trouble',
   '{"live_order": true}'::jsonb, 'dispatch', 'urgent', 60, 'order'),
  (20, 'Payment taken, order unpaid',
   '{"topics": ["payment"]}'::jsonb, 'concierge', 'urgent', 60, 'order'),
  (30, 'Anything about an order',
   '{"topics": ["my_order", "change_order", "refund_status"]}'::jsonb,
   'concierge', 'high', 60, 'order'),
  (40, 'Merchant applications and documents',
   '{"topics": ["merchant_application", "merchant_documents", "merchant_payout"]}'::jsonb,
   'merchant_ops', 'high', 120, 'merchant'),
  (50, 'Rider cash and documents',
   '{"topics": ["rider_application", "rider_cash", "rider_documents"]}'::jsonb,
   'rider_ops', 'high', 120, 'rider'),
  (60, 'Hotels, hosts and partnerships',
   '{"topics": ["hotel_or_airbnb", "partnership"]}'::jsonb,
   'partnerships', 'normal', 120, null),
  (70, 'Somewhere we do not deliver',
   '{"topics": ["outside_coverage"]}'::jsonb, 'concierge', 'low', 300, null),
  (80, 'Everything else',
   '{}'::jsonb, 'concierge', 'normal', 120, null)
on conflict (priority) do nothing;

-- ═══════════════════════════════════════════════ canned replies

insert into msg_canned_reply (key, title, body_by_lang, audience, topic, needs_approval)
values
  ('/where is my rider', 'Where is my rider',
   '{"en": "Your rider {{rider_first_name}} is {{eta}} away and on the way to you now. I am watching this one until it is at your door.", "sw": "Mwendeshaji wako {{rider_first_name}} yuko umbali wa {{eta}}. Nitaendelea kufuatilia hadi ifike mlangoni kwako."}'::jsonb,
   'guest', 'my_order', false),
  ('/delay +15', 'Tell them about a delay',
   '{"en": "I am sorry — your order is running about 15 minutes behind. {{reason}}. It is still coming and I will stay on it.", "sw": "Samahani — agizo lako limechelewa kwa takriban dakika 15. {{reason}}. Bado linakuja na nitaendelea kulifuatilia."}'::jsonb,
   'guest', 'my_order', false),
  ('/refund explained', 'How the refund works',
   '{"en": "I have put {{amount}} back to you. It reaches {{method}} within {{window}}. You do not need to do anything.", "sw": "Nimerejesha {{amount}}. Itafika {{method}} ndani ya {{window}}. Huhitaji kufanya chochote."}'::jsonb,
   /* Mentions money, so a second person signs the wording off
      before it can be used — same rule as a refund itself. */
   'guest', 'refund_status', true),
  ('/upload permit', 'Retake the permit photo',
   '{"en": "Nothing is wrong with the permit itself — just the glare on the stamp. Retake it in daylight, flat on a table, and it will pass. You can do it from this chat.", "sw": "Hakuna tatizo na kibali chenyewe — ni mwangaza tu kwenye mhuri. Pigia picha mchana, kikiwa mezani, na kitapita. Unaweza kufanya hivyo hapa."}'::jsonb,
   'merchant', 'merchant_documents', false),
  ('/sorry goodwill', 'Apologise with a credit',
   '{"en": "That should not have happened and it was not your fault. I have added {{amount}} to your account for next time.", "sw": "Hilo halikupaswa kutokea na halikuwa kosa lako. Nimeongeza {{amount}} kwenye akaunti yako kwa safari ijayo."}'::jsonb,
   'guest', null, true)
on conflict (key) do nothing;

-- ══════════════════════════════════════════════════ the door
--
-- The rail entry is added here but the href stays null until
-- the route is deployed. Pushing a migration that names a page
-- before the page exists is how this console served a 404 for
-- an afternoon.

insert into public.console_module (key, label, section, href, sort)
values ('messaging', 'Messaging', 'Operate', null, 25)
on conflict (key) do nothing;

insert into public.role_module_access (role_key, module_key, level)
values
  ('super_admin', 'messaging', 'full'),
  ('concierge_agent', 'messaging', 'full'),
  ('concierge_lead', 'messaging', 'full'),
  ('ops_manager', 'messaging', 'full'),
  ('city_lead', 'messaging', 'own_city'),
  ('merchant_ops', 'messaging', 'limited'),
  ('rider_ops', 'messaging', 'limited'),
  ('partnerships', 'messaging', 'limited'),
  ('finance', 'messaging', 'limited'),
  ('read_only', 'messaging', 'view')
on conflict do nothing;
