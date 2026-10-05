-- One conversation model.
--
-- There are already four ways to say something to somebody in
-- this system: `support_ticket` with `support_message`, and
-- `merchant_message`, `rider_message`, `host_message` for the
-- one-way partner notes. A fifth would be the worst outcome of
-- this module — a desk agent with four inboxes answers the one
-- they remember.
--
-- So this is the model the others fold into. A conversation has
-- participants, messages, and links to the things it is about.
-- External chat and internal staff chat are the same tables with
-- a `kind`, because an escalation is not a different product: it
-- is the same thread with different people in it.
--
-- ─────────────────────────────────────────────────────────────
-- Two decisions that go against the prompt, both forced.
--
-- The prompt says schema `msg`. These are `public.msg_*` tables
-- instead. PostgREST only serves schemas on a list configured in
-- the dashboard, and a schema that is not on it does not error —
-- it returns **empty**. The console would render an inbox with
-- no conversations and no way to tell that from a quiet morning.
-- Supabase Realtime has the same restriction and this module is
-- useless without it. The Finance module settled this the same
-- way after it cost a day.
--
-- And the prompt names roles `desk_agent` and `desk_lead`. This
-- repo already has `concierge_agent` and `concierge_lead` doing
-- exactly that job, with grants and a permission matrix behind
-- them. Two names for one role is how somebody ends up with
-- neither.

-- ══════════════════════════════════════════════════════ the words

create type msg_conversation_kind as enum
  ('external', 'internal_thread', 'team_channel', 'direct', 'group');

create type msg_channel as enum
  ('web', 'guest_app', 'merchant_dashboard', 'rider_app', 'host_view',
   'hotel_desk', 'whatsapp', 'sms', 'email', 'internal');

create type msg_participant_kind as enum
  ('staff', 'guest', 'merchant_user', 'rider', 'host_user', 'hotel_user',
   'visitor', 'team');

create type msg_message_kind as enum
  ('text', 'attachment', 'system', 'internal_note', 'action_card',
   'suggested_reply', 'decision', 'link', 'redacted');

create type msg_conv_status as enum
  ('open', 'waiting_on_us', 'waiting_on_them', 'escalated', 'resolved',
   'closed', 'archived');

create type msg_delivery_status as enum
  ('stored', 'broadcast', 'sent', 'delivered', 'read', 'failed');

create type msg_priority as enum ('urgent', 'high', 'normal', 'low');

create type msg_topic as enum
  ('my_order', 'payment', 'refund_status', 'change_order',
   'merchant_application', 'merchant_documents', 'merchant_payout',
   'rider_application', 'rider_cash', 'rider_documents',
   'hotel_or_airbnb', 'partnership', 'outside_coverage', 'careers',
   'something_else');

/*
 * Visibility is its own type rather than a boolean.
 *
 * `support_message.internal` is a boolean, and the one thing
 * this module must never get wrong is showing a guest something
 * marked internal. A boolean defaults, coerces and inverts
 * quietly; `visibility = 'external'` has to be written on
 * purpose, and a missing value is a constraint error rather than
 * a leak.
 */
create type msg_visibility as enum ('external', 'internal');

-- ════════════════════════════════════════════ the conversation

create table msg_conversation (
  id uuid primary key default gen_random_uuid(),
  kind msg_conversation_kind not null,
  status msg_conv_status not null default 'open',
  topic msg_topic,
  subject text not null,

  city_id uuid references public.city (id) on delete set null,
  origin_channel msg_channel not null,
  /* Where the external party is *now*. A chat that started on
     the site and moved to WhatsApp is one conversation; the
     composer reads this to say how a reply will be delivered. */
  current_channel msg_channel not null,

  assignee_id uuid references public.staff_user (id) on delete set null,
  owner_team text not null default 'concierge',
  escalated_to text[] not null default '{}',

  priority msg_priority not null default 'normal',
  first_response_due_at timestamptz,
  first_responded_at timestamptz,
  resolution_due_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.staff_user (id) on delete set null,
  resolution_note text,
  resolved_in_one boolean,
  reopened_count integer not null default 0,

  rating smallint check (rating between 1 and 5),
  rating_comment text,
  language text not null default 'en',

  /* An internal thread points at the external conversation it
     was escalated from. That link is what lets the thread show
     the guest's transcript without copying it. */
  parent_conversation_id uuid references msg_conversation (id) on delete cascade,

  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_external_message_at timestamptz,
  last_staff_message_at timestamptz,

  retention_until date,
  legal_hold boolean not null default false,

  constraint conversation_has_a_subject check (coalesce(trim(subject), '') <> ''),
  /* Only an external conversation has an outside party, so only
     it can be waiting on them or rated. */
  constraint internal_has_no_rating check (kind = 'external' or rating is null)
);

create index msg_conv_queue_idx
  on msg_conversation (status, priority, last_external_message_at desc nulls last)
  where kind = 'external';
create index msg_conv_assignee_idx on msg_conversation (assignee_id, status);
create index msg_conv_city_idx on msg_conversation (city_id);
create index msg_conv_parent_idx on msg_conversation (parent_conversation_id)
  where parent_conversation_id is not null;

comment on table msg_conversation is
  'One row per conversation, external or internal. An escalation is not a different product — it is this same table with different people in it.';

-- ═══════════════════════════════════════════════ who is in it

create table msg_participant (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references msg_conversation (id) on delete cascade,
  kind msg_participant_kind not null,

  /* Exactly one of these identifies them. A team participant is
     how "@Dispatch Nairobi" joins before any individual does. */
  user_id uuid,
  staff_user_id uuid references public.staff_user (id) on delete cascade,
  guest_id uuid references public.guest (id) on delete cascade,
  team_key text,

  display_name text not null,
  role_label text,

  /*
   * The two flags the whole privacy boundary rests on.
   *
   * `can_see_internal` is false for every guest and partner, and
   * is checked in RLS rather than in a query somebody might
   * forget to write. `can_reply_external` is false for escalated
   * staff until a hand-over — Finance joining a thread must not
   * be able to message the guest by accident.
   */
  can_see_internal boolean not null default false,
  can_reply_external boolean not null default false,

  joined_at timestamptz not null default now(),
  left_at timestamptz,
  muted boolean not null default false,
  last_read_seq bigint not null default 0,

  constraint participant_is_identified check (
    num_nonnulls(user_id, staff_user_id, guest_id, team_key) >= 1),
  /* Belt and braces against the one mistake that matters: a
     non-staff participant can never be granted internal sight,
     whatever a caller passes. */
  constraint only_staff_see_internal check (
    not can_see_internal or kind in ('staff', 'team'))
);

create unique index msg_participant_staff_idx
  on msg_participant (conversation_id, staff_user_id) where staff_user_id is not null;
create unique index msg_participant_guest_idx
  on msg_participant (conversation_id, guest_id) where guest_id is not null;
create unique index msg_participant_team_idx
  on msg_participant (conversation_id, team_key) where team_key is not null;
create index msg_participant_lookup_idx on msg_participant (staff_user_id, conversation_id);

-- ════════════════════════════════════════════════ the messages

create table msg_message (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references msg_conversation (id) on delete cascade,
  /* Monotonic per conversation, assigned by trigger. Clients
     reconcile by it, so a gap means fetch rather than guess. */
  seq bigint not null,
  kind msg_message_kind not null default 'text',
  author_participant_id uuid references msg_participant (id) on delete set null,

  body text,
  body_lang text,
  attachments jsonb not null default '[]'::jsonb,
  object_links jsonb not null default '[]'::jsonb,
  action jsonb,

  visibility msg_visibility not null,

  channel_out msg_channel,
  provider_ref text,
  delivery msg_delivery_status not null default 'stored',
  delivered_at timestamptz,
  read_at timestamptz,
  failure_reason text,

  /* Scoped to the conversation, not global. A client that
     numbers its retries per thread — which is the obvious thing
     to do — would otherwise have a send into one conversation
     silently answered by a message already in another. The
     failure is invisible: the caller gets ok:true and a message
     id, and nothing arrives. */
  idempotency_key text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,

  redacted_at timestamptz,
  redacted_by uuid references public.staff_user (id) on delete set null,
  redaction_reason text,
  trace_id text,

  /* A redaction keeps the row and replaces the body. Nothing in
     here is ever deleted, so a transcript quoted in a dispute
     stays quotable. */
  constraint redaction_says_why check (
    redacted_at is null or coalesce(trim(redaction_reason), '') <> '')
);

create unique index msg_message_seq_idx on msg_message (conversation_id, seq);
create unique index msg_message_idem_idx
  on msg_message (conversation_id, idempotency_key)
  where idempotency_key is not null;
create index msg_message_conv_idx on msg_message (conversation_id, created_at);
create index msg_message_visibility_idx on msg_message (conversation_id, visibility);

comment on column msg_message.visibility is
  'external or internal. The single most consequential column in this module: an internal note rendered to a guest is a privacy incident, so it is an enum, it is NOT NULL, and RLS enforces it rather than the query layer.';

-- ════════════════════════════════════ what it is about

create table msg_object_link (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references msg_conversation (id) on delete cascade,
  object_type text not null check (object_type in (
    'order', 'merchant', 'rider', 'host', 'hotel', 'refund', 'dispute',
    'application', 'qr', 'settlement', 'zone', 'conversation')),
  object_id uuid not null,
  label text not null,
  is_primary boolean not null default false,
  linked_by uuid references public.staff_user (id) on delete set null,
  linked_at timestamptz not null default now(),

  unique (conversation_id, object_type, object_id)
);

/* Read the other way round by every module's panel:
   "Conversations about this". */
create index msg_object_link_object_idx on msg_object_link (object_type, object_id);

-- ═══════════════════════════════════════════ presence and routing

create table msg_presence (
  staff_user_id uuid primary key references public.staff_user (id) on delete cascade,
  state text not null default 'offline'
    check (state in ('online', 'busy', 'away', 'offline')),
  on_shift_until timestamptz,
  capacity integer not null default 4,
  active_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  device text
);

create table msg_routing_rule (
  id uuid primary key default gen_random_uuid(),
  priority integer not null,
  label text not null,
  conditions jsonb not null default '{}'::jsonb,
  owner_team text not null,
  priority_out msg_priority not null default 'normal',
  first_response_sla_s integer not null default 120,
  resolution_sla_min integer,
  auto_link text,
  enabled boolean not null default true
);

create unique index msg_routing_priority_idx on msg_routing_rule (priority);

create table msg_canned_reply (
  key text primary key,
  title text not null,
  body_by_lang jsonb not null,
  audience text not null,
  topic msg_topic,
  action_key text,
  owner_team text,
  /* Wording that mentions money or a legal term needs a second
     person, the same rule the refund path uses. */
  needs_approval boolean not null default false,
  approved_by uuid references public.staff_user (id) on delete set null,
  approved_at timestamptz,
  usage_count integer not null default 0,
  last_used_at timestamptz
);

create table msg_topic_tag (
  conversation_id uuid primary key references msg_conversation (id) on delete cascade,
  topic msg_topic not null,
  subtopic text,
  tagged_by uuid references public.staff_user (id) on delete set null,
  auto boolean not null default false,
  at timestamptz not null default now()
);

/*
 * Anonymous visitors. No raw IP and no user agent, by schema —
 * the two fields somebody always adds "for debugging" and which
 * turn a support table into a tracking table.
 */
create table msg_visitor (
  id uuid primary key default gen_random_uuid(),
  session_hash text not null unique,
  display_name text,
  contact text,
  contact_kind text check (contact_kind in ('phone', 'email')),
  consent_at timestamptz,
  linked_guest_id uuid references public.guest (id) on delete set null,
  ip_country text,
  created_at timestamptz not null default now()
);

create table msg_whatsapp_session (
  conversation_id uuid primary key references msg_conversation (id) on delete cascade,
  msisdn_hash text not null,
  msisdn_masked text not null,
  opt_in_at timestamptz not null default now(),
  /* The 24-hour customer-service window. Outside it, re-opening
     needs an approved template, and the console has to say so
     rather than letting an agent type into a void. */
  window_expires_at timestamptz not null,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  provider_conversation_id text
);

create index msg_whatsapp_msisdn_idx on msg_whatsapp_session (msisdn_hash);

-- ═══════════════════════════════════════════ seq, and append-only

create or replace function tg_msg_seq()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * Assigned here rather than by the caller.
   *
   * Clients reconcile a transcript by `seq` and fetch when they
   * see a gap, so two messages sharing a number is a transcript
   * that renders in the wrong order for one person and the right
   * order for another — the kind of disagreement that surfaces
   * in a dispute months later. The unique index is the real
   * guarantee; this just fills it.
   */
  select coalesce(max(m.seq), 0) + 1 into new.seq
    from public.msg_message m
   where m.conversation_id = new.conversation_id;

  return new;
end;
$$;

create trigger msg_message_seq
  before insert on msg_message
  for each row when (new.seq is null or new.seq = 0)
  execute function tg_msg_seq();

create or replace function tg_msg_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Messages are append-only. Redact it with a reason — a deleted line is one nobody can account for.';
  end if;

  /* An edit may only ever touch delivery bookkeeping or the
     redaction fields. The body is settled the moment it is
     stored. */
  if new.body is distinct from old.body and new.redacted_at is null then
    raise exception 'A message body cannot be edited. Redact it with a reason instead.';
  end if;
  if new.conversation_id is distinct from old.conversation_id
     or new.seq is distinct from old.seq
     or new.visibility is distinct from old.visibility then
    raise exception
      'A message cannot change conversation, position or visibility after it is stored.';
  end if;

  return new;
end;
$$;

create trigger msg_message_append_only
  before update or delete on msg_message
  for each row execute function tg_msg_append_only();

/* Keeps the conversation's clocks without every caller
   remembering to. The queue sorts on these. */
create or replace function tg_msg_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_is_staff boolean;
begin
  select p.kind = 'staff' into v_is_staff
    from public.msg_participant p where p.id = new.author_participant_id;

  update public.msg_conversation c
     set last_message_at = new.created_at,
         last_external_message_at = case
           when new.visibility = 'external' and not coalesce(v_is_staff, false)
           then new.created_at else c.last_external_message_at end,
         last_staff_message_at = case
           when coalesce(v_is_staff, false)
           then new.created_at else c.last_staff_message_at end,
         /* First response is the first time staff answered
            outwardly. An internal note is work, but it is not a
            reply to the person waiting. */
         first_responded_at = case
           when c.first_responded_at is null
            and coalesce(v_is_staff, false)
            and new.visibility = 'external'
           then new.created_at else c.first_responded_at end
   where c.id = new.conversation_id;

  return null;
end;
$$;

create trigger msg_message_touches_conversation
  after insert on msg_message
  for each row execute function tg_msg_touch_conversation();

-- ═══════════════════════════════════ who may see what
--
-- The whole privacy boundary is these three functions and the
-- policies that call them. It is written here, once, rather than
-- as a `where` clause in every query, because the failure mode
-- of a forgotten `where` is not an error — it is a guest reading
-- the internal note about them.

create or replace function authz.msg_is_participant(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.msg_participant p
     where p.conversation_id = p_conversation
       and p.left_at is null
       and (
         (p.staff_user_id is not null and p.staff_user_id = authz.staff_id())
         or (p.guest_id is not null and p.guest_id = authz.guest_id())
         or (p.user_id is not null and p.user_id = (select auth.uid()))
       ))
$$;

/**
 * Whether the caller may see internal content in a conversation.
 *
 * Requires a staff identity *and* a participant row carrying the
 * flag. Both halves matter: staff who are not in the thread have
 * no business in it, and a guest can never satisfy the first
 * half however the participant row was written.
 */
create or replace function authz.msg_sees_internal(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.staff_id() is not null and (
    authz.is_super_admin()
    or exists (
      select 1 from public.msg_participant p
       where p.conversation_id = p_conversation
         and p.left_at is null
         and p.can_see_internal
         and (p.staff_user_id = authz.staff_id()
              or (p.team_key is not null and authz.has_role(p.team_key)))
    ))
$$;

/**
 * Whether the caller may read a conversation at all.
 *
 * Staff on the Concierge desk also see unassigned external
 * conversations in their cities — otherwise nobody can pick up
 * the queue, which is the point of a queue.
 */
create or replace function authz.msg_can_read(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.msg_is_participant(p_conversation)
      or authz.msg_sees_internal(p_conversation)
      or (
        authz.staff_id() is not null
        and (authz.has_role('concierge_agent') or authz.has_role('concierge_lead')
             or authz.is_super_admin() or authz.reaches_module('support'))
        and exists (
          select 1 from public.msg_conversation c
           where c.id = p_conversation and c.kind = 'external')
      )
$$;

grant execute on function authz.msg_is_participant(uuid) to authenticated, anon;
grant execute on function authz.msg_sees_internal(uuid) to authenticated, anon;
grant execute on function authz.msg_can_read(uuid) to authenticated, anon;

-- ═════════════════════════════════════════════════ the policies

alter table msg_conversation      enable row level security;
alter table msg_participant       enable row level security;
alter table msg_message           enable row level security;
alter table msg_object_link       enable row level security;
alter table msg_presence          enable row level security;
alter table msg_routing_rule      enable row level security;
alter table msg_canned_reply      enable row level security;
alter table msg_topic_tag         enable row level security;
alter table msg_visitor           enable row level security;
alter table msg_whatsapp_session  enable row level security;

create policy msg_conversation_read on msg_conversation
  for select to authenticated using (authz.msg_can_read(id));

create policy msg_participant_read on msg_participant
  for select to authenticated using (authz.msg_can_read(conversation_id));

/*
 * The one that matters.
 *
 * An internal message is readable only by someone who passes
 * `msg_sees_internal`, which requires a staff identity. An
 * external message is readable by anyone who can read the
 * conversation. There is no third branch, and no query anywhere
 * needs to remember this.
 */
create policy msg_message_read on msg_message
  for select to authenticated using (
    case visibility
      when 'internal' then authz.msg_sees_internal(conversation_id)
      else authz.msg_can_read(conversation_id)
    end
  );

create policy msg_object_link_read on msg_object_link
  for select to authenticated using (authz.msg_can_read(conversation_id));

create policy msg_topic_tag_read on msg_topic_tag
  for select to authenticated using (authz.msg_can_read(conversation_id));

/* Presence is staff-only. A guest knowing which agent is idle
   is not something a support tool should offer. */
create policy msg_presence_read on msg_presence
  for select to authenticated using (authz.staff_id() is not null);

create policy msg_routing_read on msg_routing_rule
  for select to authenticated using (authz.staff_id() is not null);
create policy msg_canned_read on msg_canned_reply
  for select to authenticated using (authz.staff_id() is not null);
create policy msg_visitor_read on msg_visitor
  for select to authenticated using (authz.handles_guest_data() or authz.is_super_admin());
create policy msg_whatsapp_read on msg_whatsapp_session
  for select to authenticated using (authz.msg_can_read(conversation_id));

/*
 * Everything is written through the RPCs below, which decide
 * visibility, participants and routing. No table here takes a
 * direct insert from a browser: a client that could write its
 * own `visibility` could write 'external' onto an internal note.
 */
revoke all on msg_conversation, msg_participant, msg_message, msg_object_link,
               msg_presence, msg_routing_rule, msg_canned_reply, msg_topic_tag,
               msg_visitor, msg_whatsapp_session
  from anon, authenticated;

grant select on msg_conversation, msg_participant, msg_message, msg_object_link,
                msg_presence, msg_routing_rule, msg_canned_reply, msg_topic_tag,
                msg_whatsapp_session
  to authenticated;
