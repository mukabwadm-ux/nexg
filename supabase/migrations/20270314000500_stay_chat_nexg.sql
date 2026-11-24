-- NexG in stay chats (owner, 24 Nov 2026: "I hope hosts can message guests and the other way, and NexG admin at the
-- same time").
--
-- Builds on 20270312000110, where a stay chat is a `direct` conversation between a stay's guest and its host. That
-- stays true: a stay chat is still `direct`, so the Concierge desk queue (msg_inbox_v, msg_can_read on external
-- conversations) and the host's support inbox never list it. NexG reaches it only through the functions below.
--
-- Who may read and join (privacy):
--   * authz.stay_chat_nexg_staff(city): a super admin, the Concierge desk (concierge_agent, concierge_lead, any
--     city), and hospitality operations for that city (ops_manager, city_lead). Partnerships is left out on
--     purpose, as in authz.handles_guest_data: signing up a host is not a reason to read their guests' messages.
--     Finance, dispatch and every other staff role are refused.
--   * A staff member can read a stay chat's messages without joining, so they can triage, but every opening of a
--     transcript is audited (stay.chat_staff_viewed). Nobody can post without joining first.
--   * Joining adds one participant per staff member, shown to the guest and the host as "NexG". It posts a line
--     both sides see ("NexG joined this chat."), and audits stay.chat_staff_joined. Leaving does the same.
--   * Every staff message is audited (stay.chat_staff_message: who, which chat, the message id and its length,
--     never the text), unlike guest and host messages, which the conversation itself records.
--   * There are no internal notes in a stay chat: everything NexG writes here, the guest and the host both read.
--
-- What each side sees:
--   * guest and host: NexG's messages marked as NexG (side 'nexg', author "NexG"), never the staff member's name;
--     the "joined", "left" and "asked NexG to help" lines (side 'system'); and on the thread, `nexg`:
--     {present, requested_at, requested_side}. NexG's messages count as unread for both.
--   * staff: the same thread, with the staff member's own name on NexG lines, and filters for chats that need NexG
--     (asked and not yet answered by a NexG message) and chats where the guest is still waiting on the host.
--
-- Asking NexG: either side can ask from the thread ("Get NexG's help"). It stamps the conversation, posts the line,
-- rings the Messaging desk bell, and audits stay.chat_nexg_requested. Asking again before NexG answers changes
-- nothing. A party can ask even after the chat closed for new messages, since disputes come after check-out; NexG
-- can then reply, but the guest and host still cannot write after the 30 days.
--
-- Replaced from 20270312000110, with only the changes above: authz.stay_chat_thread (side 'nexg', `nexg` key,
-- unread includes NexG) and authz.stay_chat_page (side 'nexg' and 'system', system lines included).
--
-- Rollback: re-run authz.stay_chat_thread and authz.stay_chat_page from 20270312000110; drop the nine functions
-- created here (rpc_stay_chat_staff_*, rpc_stay_chat_*_ask_nexg, authz.stay_chat_nexg_staff, authz.stay_chat_nexg,
-- authz.stay_chat_staff_me, authz.stay_chat_notify_nexg, authz.stay_chat_ask); drop trigger msg_message_rings_nexg
-- and its function; drop columns msg_conversation.nexg_requested_at and nexg_requested_side; delete the
-- audit.action_registry rows added below.

-- ═══════════════════════════════════════════════════ asking NexG, on the conversation

alter table public.msg_conversation
  add column if not exists nexg_requested_at timestamptz,
  add column if not exists nexg_requested_side text;

alter table public.msg_conversation drop constraint if exists msg_conversation_nexg_request_side;
alter table public.msg_conversation add constraint msg_conversation_nexg_request_side check (
  (nexg_requested_at is null) = (nexg_requested_side is null)
  and (nexg_requested_side is null or nexg_requested_side in ('guest', 'host'))
  and (nexg_requested_at is null or stay_id is not null));

create index if not exists msg_conversation_nexg_requested_idx
  on public.msg_conversation (nexg_requested_at desc) where stay_id is not null and nexg_requested_at is not null;

comment on column public.msg_conversation.nexg_requested_at is
  'A stay chat: when the guest or host last asked NexG to help. Answered once a NexG message follows it.';

-- ═══════════════════════════════════════════════════ who at NexG

create or replace function authz.stay_chat_nexg_staff(p_city_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.staff_id() is not null and (
    authz.is_super_admin()
    or authz.has_role('concierge_agent', null)
    or authz.has_role('concierge_lead', null)
    or authz.has_role('ops_manager', p_city_id)
    or authz.has_role('city_lead', p_city_id))
$$;

comment on function authz.stay_chat_nexg_staff(uuid) is
  'Staff who may read and join guest and host stay chats: super admin, the Concierge desk, and hospitality operations (ops manager, city lead) for that city. Not partnerships.';

/* What NexG's part in a chat looks like, for every side. */
create or replace function authz.stay_chat_nexg(p_conversation uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'present', exists (
      select 1 from public.msg_participant p
       where p.conversation_id = c.id and p.kind = 'staff' and p.left_at is null),
    'requested_at', c.nexg_requested_at,
    'requested_side', c.nexg_requested_side,
    /* Asked, and no NexG message since. */
    'waiting', c.nexg_requested_at is not null and not exists (
      select 1 from public.msg_message m
        join public.msg_participant a on a.id = m.author_participant_id
       where m.conversation_id = c.id and m.kind = 'text' and a.kind = 'staff'
         and m.created_at >= c.nexg_requested_at))
  from public.msg_conversation c
  where c.id = p_conversation
$$;

-- ═══════════════════════════════════════════════════ the thread and its page, NexG included

/* Replaces 20270312000110's: side 'nexg' for staff, the `nexg` key, and NexG's messages count as unread. */
create or replace function authz.stay_chat_thread(p_conversation uuid, p_side text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'stay_id', s.id,
    'host_id', s.host_id,
    'property_id', s.property_id,
    'unit_id', s.unit_id,
    'property_name', p.name,
    'unit_name', u.name,
    'host_name', coalesce(nullif(trim(h.display_name), ''), 'Host'),
    'guest_name', coalesce(nullif(trim(s.guest_first_name), ''), 'Guest'),
    'check_in', s.check_in,
    'check_out', s.check_out,
    'stay_status', s.status,
    'can_send', authz.stay_chat_open(s.id),
    'last_message_at', c.last_message_at,
    'last_message', (
      select jsonb_build_object(
        'body', case when m.redacted_at is null then m.body end,
        'at', m.created_at,
        'side', case a.kind when 'guest' then 'guest' when 'staff' then 'nexg' else 'host' end,
        'mine', coalesce(a.user_id = (select auth.uid()), false))
        from public.msg_message m
        left join public.msg_participant a on a.id = m.author_participant_id
       where m.conversation_id = c.id and m.visibility = 'external' and m.kind = 'text'
       order by m.seq desc
       limit 1),
    /* Unread: what anyone on another side wrote after this person last read. A colleague's reply is not unread. */
    'unread', (
      select count(*)::int
        from public.msg_message m
        join public.msg_participant a on a.id = m.author_participant_id
       where m.conversation_id = c.id
         and m.visibility = 'external'
         and m.kind = 'text'
         and a.kind <> (case p_side when 'guest' then 'guest' when 'nexg' then 'staff' else 'host_user' end)
                         ::public.msg_participant_kind
         and m.seq > coalesce((
           select max(me.last_read_seq) from public.msg_participant me
            where me.conversation_id = c.id
              and me.user_id = (select auth.uid())
              and me.kind = (case p_side when 'guest' then 'guest' when 'nexg' then 'staff' else 'host_user' end)
                              ::public.msg_participant_kind
         ), 0)),
    'nexg', authz.stay_chat_nexg(c.id)
  )
  from public.msg_conversation c
  join public.stay s on s.id = c.stay_id
  join public.host h on h.id = s.host_id
  left join public.unit u on u.id = s.unit_id
  left join public.property p on p.id = s.property_id
  where c.id = p_conversation
$$;

/*
 * Replaces 20270312000110's: NexG's lines are side 'nexg' with the author "NexG", and the joined / left / asked
 * lines (kind system) are included as side 'system'.
 */
create or replace function authz.stay_chat_page(p_conversation uuid, p_before bigint, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with page as (
    select m.id, m.seq, m.kind, m.body, m.redacted_at, m.created_at, a.kind as author_kind, a.user_id, a.display_name
      from public.msg_message m
      left join public.msg_participant a on a.id = m.author_participant_id
     where m.conversation_id = p_conversation
       and m.visibility = 'external'
       and m.kind in ('text', 'system')
       and (p_before is null or m.seq < p_before)
     order by m.seq desc
     limit greatest(1, least(coalesce(p_limit, 30), 100)) + 1
  ), kept as (
    select * from page order by seq desc limit greatest(1, least(coalesce(p_limit, 30), 100))
  )
  select jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', k.id,
          'seq', k.seq,
          'body', case when k.redacted_at is null then k.body end,
          'redacted', k.redacted_at is not null,
          'at', k.created_at,
          'side', case
            when k.kind = 'system' then 'system'
            when k.author_kind = 'guest' then 'guest'
            when k.author_kind = 'staff' then 'nexg'
            else 'host' end,
          'mine', k.kind = 'text' and coalesce(k.user_id = (select auth.uid()), false),
          'author', case when k.author_kind = 'staff' then 'NexG' else k.display_name end)
        order by k.seq)
        from kept k), '[]'::jsonb),
    'earlier_before', case
      when (select count(*) from page) > (select count(*) from kept) then (select min(seq) from kept) end)
$$;

-- ═══════════════════════════════════════════════════ shared steps (not callable by apps)

/* The caller's NexG participant row. Joins (or rejoins) only when p_join; otherwise null when not present. */
create or replace function authz.stay_chat_staff_me(p_conversation uuid, p_join boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_id uuid;
  v_left timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('stay-chat:' || p_conversation::text, 0));
  select p.id, p.left_at into v_id, v_left from public.msg_participant p
   where p.conversation_id = p_conversation and p.staff_user_id = v_staff;
  if v_id is not null and v_left is null then
    return v_id;
  end if;
  if not p_join then
    return null;
  end if;
  if v_id is not null then
    update public.msg_participant set left_at = null, joined_at = now() where id = v_id;
    return v_id;
  end if;
  insert into public.msg_participant (
    conversation_id, kind, user_id, staff_user_id, display_name, role_label, can_see_internal, can_reply_external)
  /* "NexG" in both name fields: a guest or host who can read the participant rows still never sees who. */
  values (p_conversation, 'staff', (select auth.uid()), v_staff, 'NexG', 'NexG', false, true)
  returning id into v_id;
  return v_id;
end;
$$;

/* Ring a stay chat's guest and host members about something NexG did. A notification never fails the action. */
create or replace function authz.stay_chat_notify_nexg(p_conversation uuid, p_kind text, p_title text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_member record;
begin
  select s.* into v_stay from public.msg_conversation c join public.stay s on s.id = c.stay_id
   where c.id = p_conversation;
  perform native_push.enqueue(v_stay.guest_user_id, 'stays', 'conversation', p_conversation, p_kind,
    false, true, null, 'stay_messages');
  for v_member in
    select distinct hu.user_id from public.host_user hu
     where hu.host_id = v_stay.host_id
       and (hu.units is null or (v_stay.unit_id is not null and v_stay.unit_id = any (hu.units)))
  loop
    perform public.fn_notify_user(
      p_user_id => v_member.user_id, p_kind => 'host.stay_message',
      p_title => p_title, p_body => 'Open your inbox to read it.',
      p_href => '/host/messages', p_tone => 'info'::public.notification_tone,
      p_object_type => 'stay', p_object_id => v_stay.id,
      p_tag => 'stay-chat:' || p_conversation::text);
    perform native_push.enqueue(v_member.user_id, 'stays', 'conversation', p_conversation, p_kind,
      false, true, null, 'stay_messages');
  end loop;
exception when others then
  raise warning 'stay chat NexG notification skipped: %', sqlerrm;
end;
$$;

/* A guest or host asks NexG to join. The caller's access has been checked. */
create or replace function authz.stay_chat_ask(p_conversation uuid, p_side text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_nexg jsonb;
  v_conv public.msg_conversation;
  v_who text;
begin
  v_me := authz.stay_chat_me(p_conversation, p_side);
  v_nexg := authz.stay_chat_nexg(p_conversation);
  if (v_nexg ->> 'waiting')::boolean then
    return jsonb_build_object('ok', true, 'already', true, 'nexg', v_nexg,
      'message', 'NexG has been asked and will reply here.');
  end if;

  update public.msg_conversation
     set nexg_requested_at = now(), nexg_requested_side = p_side
   where id = p_conversation
  returning * into v_conv;

  v_who := case when p_side = 'guest'
    then (select coalesce(nullif(trim(s.guest_first_name), ''), 'The guest') from public.stay s where s.id = v_conv.stay_id)
    else (select coalesce(nullif(trim(h.display_name), ''), 'The host')
            from public.stay s join public.host h on h.id = s.host_id where s.id = v_conv.stay_id) end;

  insert into public.msg_message (conversation_id, kind, author_participant_id, body, visibility, delivery)
  values (p_conversation, 'system', v_me, v_who || ' asked NexG to help.', 'external', 'stored');

  perform audit.log(
    (case p_side when 'guest' then 'guest' else 'host_user' end)::public.actor_type, 'messaging',
    'stay.chat_nexg_requested',
    p_actor_id => (select auth.uid()), p_target_type => 'stay', p_target_id => v_conv.stay_id,
    p_city_id => v_conv.city_id,
    p_after => jsonb_build_object('conversation_id', p_conversation, 'side', p_side));

  begin
    perform public.fn_notify_staff('messaging', 'staff.stay_chat.help',
      v_who || ' asked NexG to help with a stay',
      'Open Stay chats to read the conversation and join.',
      '/messaging/stays?chip=needs&id=' || p_conversation::text,
      'warning'::public.notification_tone, 'stay', v_conv.stay_id, v_conv.city_id,
      'stay-chat-help:' || p_conversation::text);
  exception when others then
    raise warning 'stay chat help bell skipped: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'already', false, 'nexg', authz.stay_chat_nexg(p_conversation),
    'message', 'NexG has been asked to help. They will reply in this chat.');
end;
$$;

revoke all on function
  authz.stay_chat_nexg_staff(uuid),
  authz.stay_chat_nexg(uuid),
  authz.stay_chat_thread(uuid, text),
  authz.stay_chat_page(uuid, bigint, integer),
  authz.stay_chat_staff_me(uuid, boolean),
  authz.stay_chat_notify_nexg(uuid, text, text),
  authz.stay_chat_ask(uuid, text)
from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ the guest and the host ask NexG

create or replace function public.rpc_stay_chat_guest_ask_nexg(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.msg_conversation c join public.stay s on s.id = c.stay_id
     where c.id = p_thread_id and s.guest_user_id = (select auth.uid())) then
    raise exception 'This chat is unavailable.' using errcode = '42501';
  end if;
  return authz.stay_chat_ask(p_thread_id, 'guest');
end;
$$;

create or replace function public.rpc_stay_chat_host_ask_nexg(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_stay uuid;
begin
  select c.stay_id into v_stay from public.msg_conversation c where c.id = p_thread_id and c.stay_id is not null;
  if (select auth.uid()) is null or v_stay is null or not authz.stay_chat_host_sees(v_stay) then
    raise exception 'This chat is unavailable.' using errcode = '42501';
  end if;
  return authz.stay_chat_ask(p_thread_id, 'host');
end;
$$;

-- ═══════════════════════════════════════════════════ NexG's side

/* The stay chat as staff may see it, or an error. Returns the conversation's city. */
create or replace function authz.stay_chat_staff_require(p_thread_id uuid)
returns public.msg_conversation
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_conv public.msg_conversation;
begin
  select * into v_conv from public.msg_conversation c where c.id = p_thread_id and c.stay_id is not null;
  if v_conv.id is null or not authz.stay_chat_nexg_staff(v_conv.city_id) then
    raise exception 'Only NexG support and hospitality operations can open stay chats.' using errcode = '42501';
  end if;
  return v_conv;
end;
$$;
revoke all on function authz.stay_chat_staff_require(uuid) from public, anon, authenticated;

/*
 * Every stay chat this staff member may see, newest first.
 *   needs      asked NexG, and no NexG message since
 *   unanswered the last message is the guest's, waiting on the host (or on NexG)
 *   joined     NexG is in it now
 *   all        everything
 */
create or replace function public.rpc_stay_chat_staff_threads(p_filter text default 'all', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.stay_chat_nexg_staff(null) then
    raise exception 'Only NexG support and hospitality operations can open stay chats.' using errcode = '42501';
  end if;
  if coalesce(p_filter, 'all') not in ('needs', 'unanswered', 'joined', 'all') then
    raise exception 'Choose a filter: needs, unanswered, joined or all.' using errcode = '22023';
  end if;

  return (
    with visible as (
      select c.id, c.city_id, coalesce(c.last_message_at, c.created_at) as at, authz.stay_chat_nexg(c.id) as nexg,
             (select a.kind from public.msg_message m
                join public.msg_participant a on a.id = m.author_participant_id
               where m.conversation_id = c.id and m.kind = 'text' and m.visibility = 'external'
               order by m.seq desc limit 1) as last_author
        from public.msg_conversation c
       where c.stay_id is not null
         and authz.stay_chat_nexg_staff(c.city_id)
    ), filtered as (
      select v.* from visible v
       where case coalesce(p_filter, 'all')
         when 'needs' then (v.nexg ->> 'waiting')::boolean
         when 'unanswered' then v.last_author = 'guest'
         when 'joined' then (v.nexg ->> 'present')::boolean
         else true end
       order by case when (v.nexg ->> 'waiting')::boolean then 0 else 1 end, v.at desc nulls last, v.id
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    )
    select jsonb_build_object(
      'threads', coalesce(jsonb_agg(
        authz.stay_chat_thread(f.id, 'nexg')
          || jsonb_build_object(
               'city', (select ct.name from public.city ct where ct.id = f.city_id),
               'waiting_on', case when f.last_author = 'guest' then 'host' end)
        order by case when (f.nexg ->> 'waiting')::boolean then 0 else 1 end, f.at desc nulls last, f.id),
        '[]'::jsonb),
      'counts', jsonb_build_object(
        'needs', (select count(*) from visible where (nexg ->> 'waiting')::boolean),
        'unanswered', (select count(*) from visible where last_author = 'guest'),
        'joined', (select count(*) from visible where (nexg ->> 'present')::boolean),
        'all', (select count(*) from visible)))
    from filtered f);
end;
$$;

/*
 * One stay chat and a page of its messages, for staff. Opening the latest page is audited: reading a private chat
 * between a guest and a host is something somebody is accountable for, even without joining.
 */
create or replace function public.rpc_stay_chat_staff_messages(
  p_thread_id uuid, p_before bigint default null, p_limit integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.msg_conversation := authz.stay_chat_staff_require(p_thread_id);
  v_page jsonb;
begin
  if p_before is null then
    perform audit.log('staff'::public.actor_type, 'messaging', 'stay.chat_staff_viewed',
      p_actor_id => authz.staff_id(), p_target_type => 'stay', p_target_id => v_conv.stay_id,
      p_city_id => v_conv.city_id, p_after => jsonb_build_object('conversation_id', p_thread_id));
  end if;
  v_page := authz.stay_chat_page(p_thread_id, p_before, p_limit);
  /* Staff see which colleague wrote each NexG line; the guest and host only ever see "NexG". */
  v_page := jsonb_set(v_page, '{messages}', coalesce((
    select jsonb_agg(m || jsonb_build_object('staff_name', (
             select coalesce(nullif(trim(su.display_name), ''), su.email) from public.msg_message mm
               join public.msg_participant a on a.id = mm.author_participant_id
               join public.staff_user su on su.id = a.staff_user_id
              where mm.id = (m ->> 'id')::uuid and a.kind = 'staff'))
           order by (m ->> 'seq')::bigint)
      from jsonb_array_elements(v_page -> 'messages') m), '[]'::jsonb));
  return jsonb_build_object('thread', authz.stay_chat_thread(p_thread_id, 'nexg')
      || jsonb_build_object('me_present', authz.stay_chat_staff_me(p_thread_id, false) is not null))
    || v_page;
end;
$$;

/* Join a stay chat as NexG. Both sides see "NexG joined this chat." */
create or replace function public.rpc_stay_chat_staff_join(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.msg_conversation := authz.stay_chat_staff_require(p_thread_id);
  v_was_present boolean;
  v_me uuid;
begin
  v_was_present := (authz.stay_chat_nexg(p_thread_id) ->> 'present')::boolean;
  if authz.stay_chat_staff_me(p_thread_id, false) is not null then
    return jsonb_build_object('ok', true, 'already', true, 'message', 'You are already in this chat.');
  end if;
  v_me := authz.stay_chat_staff_me(p_thread_id, true);

  /* One line per NexG arrival, not per colleague: the guest and host deal with NexG, not with a rota. */
  if not v_was_present then
    insert into public.msg_message (conversation_id, kind, author_participant_id, body, visibility, delivery)
    values (p_thread_id, 'system', v_me, 'NexG joined this chat. The guest and the host can both read what NexG writes.',
            'external', 'stored');
    perform authz.stay_chat_notify_nexg(p_thread_id, 'nexg_joined', 'NexG joined a stay chat');
  end if;

  perform audit.log('staff'::public.actor_type, 'messaging', 'stay.chat_staff_joined',
    p_actor_id => authz.staff_id(), p_target_type => 'stay', p_target_id => v_conv.stay_id,
    p_city_id => v_conv.city_id, p_severity => 'notice',
    p_after => jsonb_build_object('conversation_id', p_thread_id));

  return jsonb_build_object('ok', true, 'already', false,
    'message', 'You joined as NexG. The guest and the host can both see that NexG is here.');
end;
$$;

/* Post as NexG. Only after joining. Audited per message: who, which chat, the message id and length. */
create or replace function public.rpc_stay_chat_staff_send(
  p_thread_id uuid, p_body text, p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.msg_conversation := authz.stay_chat_staff_require(p_thread_id);
  v_body text := trim(coalesce(p_body, ''));
  v_me uuid;
  v_existing public.msg_message;
  v_id uuid;
  v_seq bigint;
begin
  if v_body = '' then
    raise exception 'Write a message first.' using errcode = '22023';
  end if;
  if length(v_body) > 4000 then
    raise exception 'Keep a message under 4,000 characters.' using errcode = '22023';
  end if;
  if p_idempotency_key is not null and length(p_idempotency_key) not between 1 and 200 then
    raise exception 'Send the message again.' using errcode = '22023';
  end if;

  v_me := authz.stay_chat_staff_me(p_thread_id, false);
  if v_me is null then
    raise exception 'Join the chat before writing in it.' using errcode = '55000';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.msg_message
     where conversation_id = p_thread_id and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'message_id', v_existing.id, 'seq', v_existing.seq, 'repeat', true);
    end if;
  end if;

  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, visibility, channel_out, delivery, idempotency_key)
  values (p_thread_id, 'text', v_me, v_body, 'external', 'web', 'stored', p_idempotency_key)
  returning id, seq into v_id, v_seq;

  update public.msg_participant set last_read_seq = greatest(last_read_seq, v_seq) where id = v_me;

  perform audit.log('staff'::public.actor_type, 'messaging', 'stay.chat_staff_message',
    p_actor_id => authz.staff_id(), p_target_type => 'stay', p_target_id => v_conv.stay_id,
    p_city_id => v_conv.city_id,
    p_after => jsonb_build_object('conversation_id', p_thread_id, 'message_id', v_id, 'length', length(v_body)));

  perform authz.stay_chat_notify_nexg(p_thread_id, 'nexg_message', 'NexG wrote in a stay chat');

  return jsonb_build_object('ok', true, 'message_id', v_id, 'seq', v_seq, 'repeat', false);
exception
  when unique_violation then
    select * into v_existing from public.msg_message
     where conversation_id = p_thread_id and idempotency_key = p_idempotency_key;
    if not found then raise; end if;
    return jsonb_build_object('ok', true, 'message_id', v_existing.id, 'seq', v_existing.seq, 'repeat', true);
end;
$$;

/* Leave a stay chat. When the last NexG person leaves, both sides see "NexG left this chat." */
create or replace function public.rpc_stay_chat_staff_leave(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv public.msg_conversation := authz.stay_chat_staff_require(p_thread_id);
  v_me uuid := authz.stay_chat_staff_me(p_thread_id, false);
begin
  if v_me is null then
    return jsonb_build_object('ok', true, 'already', true, 'message', 'You are not in this chat.');
  end if;
  update public.msg_participant set left_at = now() where id = v_me;
  if not (authz.stay_chat_nexg(p_thread_id) ->> 'present')::boolean then
    insert into public.msg_message (conversation_id, kind, author_participant_id, body, visibility, delivery)
    values (p_thread_id, 'system', v_me, 'NexG left this chat. Either of you can ask NexG back.', 'external', 'stored');
  end if;
  perform audit.log('staff'::public.actor_type, 'messaging', 'stay.chat_staff_left',
    p_actor_id => authz.staff_id(), p_target_type => 'stay', p_target_id => v_conv.stay_id,
    p_city_id => v_conv.city_id, p_after => jsonb_build_object('conversation_id', p_thread_id));
  return jsonb_build_object('ok', true, 'already', false, 'message', 'You left the chat.');
end;
$$;

/* Mark read for this staff member, when they are in the chat. */
create or replace function public.rpc_stay_chat_staff_read(p_thread_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_max bigint;
begin
  perform authz.stay_chat_staff_require(p_thread_id);
  v_me := authz.stay_chat_staff_me(p_thread_id, false);
  if v_me is null then
    return jsonb_build_object('ok', true, 'read_to', null);
  end if;
  select coalesce(max(seq), 0) into v_max from public.msg_message
   where conversation_id = p_thread_id and visibility = 'external';
  update public.msg_participant set last_read_seq = greatest(last_read_seq, v_max) where id = v_me;
  return jsonb_build_object('ok', true, 'read_to', v_max);
end;
$$;

-- ═══════════════════════════════════════════════════ NexG hears the guest and host while it is in

/*
 * A guest or host line in a chat NexG is in rings the NexG people in it, so they need not watch the list.
 * Their own lines and system lines ring nobody.
 */
create or replace function public.tg_stay_chat_rings_nexg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff record;
  v_stay uuid;
begin
  if new.kind <> 'text' or new.visibility <> 'external' then
    return null;
  end if;
  select c.stay_id into v_stay from public.msg_conversation c where c.id = new.conversation_id;
  if v_stay is null or exists (
    select 1 from public.msg_participant a where a.id = new.author_participant_id and a.kind = 'staff') then
    return null;
  end if;
  begin
    for v_staff in
      select p.user_id from public.msg_participant p
       where p.conversation_id = new.conversation_id and p.kind = 'staff' and p.left_at is null
         and p.user_id is not null
    loop
      perform public.fn_notify_user(
        p_user_id => v_staff.user_id, p_kind => 'staff.stay_chat.message',
        p_title => 'New message in a stay chat you are in',
        p_body => 'Open Stay chats to read it.',
        p_href => '/messaging/stays?chip=joined&id=' || new.conversation_id::text,
        p_tone => 'info'::public.notification_tone,
        p_object_type => 'stay', p_object_id => v_stay,
        p_tag => 'stay-chat-staff:' || new.conversation_id::text);
    end loop;
  exception when others then
    raise warning 'stay chat NexG bell skipped: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists msg_message_rings_nexg on public.msg_message;
create trigger msg_message_rings_nexg
  after insert on public.msg_message
  for each row execute function public.tg_stay_chat_rings_nexg();

-- ═══════════════════════════════════════════════════ grants

revoke execute on function
  public.rpc_stay_chat_guest_ask_nexg(uuid),
  public.rpc_stay_chat_host_ask_nexg(uuid),
  public.rpc_stay_chat_staff_threads(text, integer),
  public.rpc_stay_chat_staff_messages(uuid, bigint, integer),
  public.rpc_stay_chat_staff_join(uuid),
  public.rpc_stay_chat_staff_send(uuid, text, text),
  public.rpc_stay_chat_staff_leave(uuid),
  public.rpc_stay_chat_staff_read(uuid),
  public.tg_stay_chat_rings_nexg()
from public, anon;

grant execute on function
  public.rpc_stay_chat_guest_ask_nexg(uuid),
  public.rpc_stay_chat_host_ask_nexg(uuid),
  public.rpc_stay_chat_staff_threads(text, integer),
  public.rpc_stay_chat_staff_messages(uuid, bigint, integer),
  public.rpc_stay_chat_staff_join(uuid),
  public.rpc_stay_chat_staff_send(uuid, text, text),
  public.rpc_stay_chat_staff_leave(uuid),
  public.rpc_stay_chat_staff_read(uuid)
to authenticated;

revoke execute on function public.tg_stay_chat_rings_nexg() from authenticated;

-- ═══════════════════════════════════════════════════ accounted for

insert into audit.action_registry (action, module, default_severity, needs_review, description) values
  ('stay.chat_nexg_requested', 'messaging', 'info', false, 'A guest or host asked NexG to help in a stay chat'),
  ('stay.chat_staff_viewed', 'messaging', 'info', false, 'A NexG staff member opened a guest and host stay chat'),
  ('stay.chat_staff_joined', 'messaging', 'notice', false, 'A NexG staff member joined a stay chat; both sides see NexG is there'),
  ('stay.chat_staff_left', 'messaging', 'info', false, 'A NexG staff member left a stay chat'),
  ('stay.chat_staff_message', 'messaging', 'info', false, 'A NexG staff member wrote in a stay chat, which the guest and host both read')
on conflict (action) do nothing;

/* Read marks are not a state change anybody is accountable for (as 20270312000110). */
insert into wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_stay_chat_staff_read',
   'Marking a thread read is not a state change anybody is accountable for',
   'msg_participant.last_read_seq')
on conflict (function_name) do nothing;

comment on function public.rpc_stay_chat_staff_join(uuid) is
  'NexG support or hospitality operations join a guest and host stay chat as "NexG". Both sides see it. Audited.';
comment on function public.rpc_stay_chat_staff_send(uuid, text, text) is
  'NexG writes in a stay chat it has joined; the guest and host both read it. Audited per message, without the text.';
