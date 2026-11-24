-- A stay's guest and its host can message each other (owner, 24 Nov 2026: "same with the messaging and inbox").
--
-- Built on the one conversation model (20260101016500), not beside it. A stay chat is a `direct` conversation tied
-- to one stay by `msg_conversation.stay_id`, with exactly two sides:
--   * the guest: the account that booked the stay (`stay.guest_user_id`), one `guest` participant by user id;
--   * the host: every member of the host who can see the stay's unit (authz.can_see_unit, or authz.is_host_member
--     when the stay has no unit). Each member who reads or writes gets their own `host_user` participant row, so
--     read state is per person. The guest sees the host's name on those messages, never the member's.
--
-- Why `direct` and not `external`: `authz.msg_can_read` lets the Concierge desk read every external conversation,
-- the staff bell rings for external messages, and the host's support inbox (host_conversation_v) lists external
-- ones. None of those should see a private chat between a guest and a host, and `direct` keeps it out of all three.
--
-- Who can use it:
--   * Only stays a guest booked through NexG (guest_user_id set) in booked, in_stay, departed or cancelled status.
--     Held and blocked rows have no chat, nor does a hold that lapsed unpaid (cancelled with no confirmed_at).
--   * Sending and opening close 30 days after check-out (for a cancelled stay: 30 days after the earlier of
--     check-out and the cancellation). Reading the history stays possible.
--   * Every RPC is security definer and checks the caller itself: the guest by auth.uid() = stay.guest_user_id, the
--     host by unit access at the moment of the call. A member who leaves the team, or loses the unit, is marked as
--     having left their participant rows (trigger on host_user), so direct table reads stop too.
--
-- Notifications reuse what exists: the account bell (fn_notify_user) for host members, and the phone push queue
-- (native_push.enqueue) for both sides in the Stays app. The push queue gains one subject, `conversation`; its
-- words are fixed in the native-push-dispatch edge function ("New message about your stay" / "New message from a
-- guest") and never carry the message text.
--
-- Rollback: drop the ten rpc_stay_chat_* functions, the authz.stay_chat_* helpers, the host_user trigger and its
-- function, `msg_conversation.stay_id` with its index and check, restore native_push.delivery_subject_check without
-- 'conversation', and delete the audit.action_registry and wiring_audit_exempt rows added below.

-- ═══════════════════════════════════════════════════ the link to the stay

/*
 * No foreign key on purpose. Messages are append-only and never deleted (tg_msg_append_only), and a cascade from
 * `stay` would delete a transcript somebody may need in a dispute. Every RPC joins the stay, so a conversation whose
 * stay is gone is simply unreachable.
 */
alter table public.msg_conversation add column if not exists stay_id uuid;

alter table public.msg_conversation drop constraint if exists msg_conversation_stay_is_direct;
alter table public.msg_conversation add constraint msg_conversation_stay_is_direct
  check (stay_id is null or kind = 'direct');

/* One chat per stay. Also what makes "start or get" safe when both sides open it at once. */
create unique index if not exists msg_conversation_stay_idx
  on public.msg_conversation (stay_id) where stay_id is not null;

comment on column public.msg_conversation.stay_id is
  'The stay a guest and host chat is about (kind direct). One conversation per stay. No foreign key: transcripts outlive the row.';

-- ═══════════════════════════════════════════════════ the push queue learns one subject

alter table native_push.delivery drop constraint if exists delivery_subject_check;
alter table native_push.delivery add constraint delivery_subject_check check (subject in
  ('order', 'booking', 'stay', 'ticket', 'job', 'offer', 'disposal', 'payout', 'account', 'conversation'));

-- ═══════════════════════════════════════════════════ who may take part

/* The caller is on the host's side of this stay: they can see its unit, or the whole account when it has none. */
create or replace function authz.stay_chat_host_sees(p_stay_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stay s
     where s.id = p_stay_id
       and ((s.unit_id is not null and authz.can_see_unit(s.unit_id))
         or (s.unit_id is null and authz.is_host_member(s.host_id)))
  )
$$;

/* The stay can take new messages: booked through NexG, not a hold or a block, within 30 days of the end. */
create or replace function authz.stay_chat_open(p_stay_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.stay s
     where s.id = p_stay_id
       and s.guest_user_id is not null
       and s.status in ('booked', 'in_stay', 'departed', 'cancelled')
       /* A hold that lapsed unpaid is cancelled too, but was never booked (20261118000100). */
       and (s.status <> 'cancelled' or s.confirmed_at is not null)
       and now() < (case when s.status = 'cancelled' then least(s.check_out, s.updated_at) else s.check_out end)
                   + interval '30 days'
  )
$$;

/*
 * Why a stay has no chat, as the words a person reads. Null when it can take messages. The guest-or-host check
 * comes first and is the caller's job; this only explains the stay itself.
 */
create or replace function authz.stay_chat_refusal(p_stay_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.id is null then 'This stay is unavailable.'
    when s.guest_user_id is null then 'This guest did not book through NexG, so this stay has no chat.'
    when s.status not in ('booked', 'in_stay', 'departed', 'cancelled')
      or (s.status = 'cancelled' and s.confirmed_at is null) then 'The chat opens once the stay is booked.'
    when not authz.stay_chat_open(s.id) then 'This chat is closed. Chats close 30 days after check-out.'
  end
  from (select 1) one
  left join public.stay s on s.id = p_stay_id
$$;

-- ═══════════════════════════════════════════════════ shared steps (not callable by apps)

/* Find or create the stay's conversation and its guest participant. The caller has already checked access. */
create or replace function authz.stay_chat_ensure(p_stay_id uuid, p_channel public.msg_channel)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv uuid;
  v_stay public.stay;
begin
  select * into v_stay from public.stay where id = p_stay_id;

  insert into public.msg_conversation (
    kind, subject, city_id, origin_channel, current_channel, owner_team, stay_id)
  select 'direct',
         'Stay · ' || coalesce(nullif(trim(u.name), ''), nullif(trim(p.name), ''), 'Your stay'),
         coalesce(u.city_id, h.city_id), p_channel, p_channel, 'host', v_stay.id
    from public.host h
    left join public.unit u on u.id = v_stay.unit_id
    left join public.property p on p.id = v_stay.property_id
   where h.id = v_stay.host_id
  on conflict (stay_id) where stay_id is not null do nothing
  returning id into v_conv;

  if v_conv is null then
    select c.id into v_conv from public.msg_conversation c where c.stay_id = p_stay_id;
    return v_conv;
  end if;

  insert into public.msg_participant (
    conversation_id, kind, user_id, display_name, role_label, can_see_internal, can_reply_external)
  values (v_conv, 'guest', v_stay.guest_user_id,
          coalesce(nullif(trim(v_stay.guest_first_name), ''), 'Guest'), 'Guest', false, true);

  return v_conv;
end;
$$;

/* The caller's participant row on their side of a stay chat, made (or rejoined) when missing. */
create or replace function authz.stay_chat_me(p_conversation uuid, p_side text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_left timestamptz;
  v_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended('stay-chat:' || p_conversation::text, 0));

  select p.id, p.left_at into v_id, v_left
    from public.msg_participant p
   where p.conversation_id = p_conversation
     and p.user_id = v_uid
     and p.kind = (case p_side when 'guest' then 'guest' else 'host_user' end)::public.msg_participant_kind
   order by p.joined_at
   limit 1;

  if v_id is not null then
    if v_left is not null then
      update public.msg_participant set left_at = null where id = v_id;
    end if;
    return v_id;
  end if;

  if p_side = 'guest' then
    select coalesce(nullif(trim(s.guest_first_name), ''), 'Guest') into v_name
      from public.msg_conversation c join public.stay s on s.id = c.stay_id
     where c.id = p_conversation;
  else
    select coalesce(nullif(trim(h.display_name), ''), 'Host') into v_name
      from public.msg_conversation c
      join public.stay s on s.id = c.stay_id
      join public.host h on h.id = s.host_id
     where c.id = p_conversation;
  end if;

  insert into public.msg_participant (
    conversation_id, kind, user_id, display_name, role_label, can_see_internal, can_reply_external)
  values (p_conversation,
          (case p_side when 'guest' then 'guest' else 'host_user' end)::public.msg_participant_kind,
          v_uid, coalesce(v_name, case p_side when 'guest' then 'Guest' else 'Host' end),
          case p_side when 'guest' then 'Guest' else 'Host' end, false, true)
  returning id into v_id;
  return v_id;
end;
$$;

/* One thread as the apps read it, from one side. */
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
        'side', case when a.kind = 'guest' then 'guest' else 'host' end,
        'mine', coalesce(a.user_id = (select auth.uid()), false))
        from public.msg_message m
        left join public.msg_participant a on a.id = m.author_participant_id
       where m.conversation_id = c.id and m.visibility = 'external' and m.kind = 'text'
       order by m.seq desc
       limit 1),
    /* Unread: what the other side wrote after this person last read. A colleague's reply is not unread. */
    'unread', (
      select count(*)::int
        from public.msg_message m
        join public.msg_participant a on a.id = m.author_participant_id
       where m.conversation_id = c.id
         and m.visibility = 'external'
         and m.kind = 'text'
         and a.kind = (case p_side when 'guest' then 'host_user' else 'guest' end)::public.msg_participant_kind
         and m.seq > coalesce((
           select max(me.last_read_seq) from public.msg_participant me
            where me.conversation_id = c.id
              and me.user_id = (select auth.uid())
              and me.kind = (case p_side when 'guest' then 'guest' else 'host_user' end)::public.msg_participant_kind
         ), 0))
  )
  from public.msg_conversation c
  join public.stay s on s.id = c.stay_id
  join public.host h on h.id = s.host_id
  left join public.unit u on u.id = s.unit_id
  left join public.property p on p.id = s.property_id
  where c.id = p_conversation
$$;

/* A page of messages, oldest first, with the seq to ask for before to get the earlier page (null at the start). */
create or replace function authz.stay_chat_page(p_conversation uuid, p_before bigint, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with page as (
    select m.id, m.seq, m.body, m.redacted_at, m.created_at, a.kind as author_kind, a.user_id, a.display_name
      from public.msg_message m
      left join public.msg_participant a on a.id = m.author_participant_id
     where m.conversation_id = p_conversation
       and m.visibility = 'external'
       and m.kind = 'text'
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
          'side', case when k.author_kind = 'guest' then 'guest' else 'host' end,
          'mine', coalesce(k.user_id = (select auth.uid()), false),
          'author', k.display_name)
        order by k.seq)
        from kept k), '[]'::jsonb),
    'earlier_before', case
      when (select count(*) from page) > (select count(*) from kept) then (select min(seq) from kept) end)
$$;

/*
 * Store one message from one side, once per idempotency key, then ring the other side. A notification that fails
 * never fails the message.
 */
create or replace function authz.stay_chat_post(
  p_conversation uuid, p_side text, p_body text, p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_body text := trim(coalesce(p_body, ''));
  v_author uuid;
  v_existing public.msg_message;
  v_id uuid;
  v_seq bigint;
  v_stay public.stay;
  v_unit text;
  v_member record;
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

  /* Serialises sends into one conversation, so seq and the idempotency check cannot race. */
  v_author := authz.stay_chat_me(p_conversation, p_side);

  if p_idempotency_key is not null then
    select * into v_existing from public.msg_message
     where conversation_id = p_conversation and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'thread_id', p_conversation, 'message_id', v_existing.id,
        'seq', v_existing.seq, 'repeat', true);
    end if;
  end if;

  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, visibility, channel_out, delivery, idempotency_key)
  values (
    p_conversation, 'text', v_author, v_body, 'external',
    (case p_side when 'guest' then 'guest_app' else 'host_view' end)::public.msg_channel,
    'stored', p_idempotency_key)
  returning id, seq into v_id, v_seq;

  /* Their own message is not unread to them. */
  update public.msg_participant set last_read_seq = greatest(last_read_seq, v_seq) where id = v_author;

  begin
    select s.* into v_stay from public.msg_conversation c join public.stay s on s.id = c.stay_id
     where c.id = p_conversation;
    select coalesce(nullif(trim(u.name), ''), 'your property') into v_unit
      from (select 1) one left join public.unit u on u.id = v_stay.unit_id;

    if p_side = 'guest' then
      for v_member in
        select distinct hu.user_id from public.host_user hu
         where hu.host_id = v_stay.host_id
           and hu.user_id is distinct from v_uid
           and (hu.units is null or (v_stay.unit_id is not null and v_stay.unit_id = any (hu.units)))
      loop
        perform public.fn_notify_user(
          p_user_id => v_member.user_id, p_kind => 'host.stay_message',
          p_title => 'New message from ' || coalesce(nullif(trim(v_stay.guest_first_name), ''), 'a guest'),
          p_body => 'About ' || v_unit || '. Open your inbox to reply.',
          p_href => '/host/messages', p_tone => 'info'::public.notification_tone,
          p_object_type => 'stay', p_object_id => v_stay.id,
          p_tag => 'stay-chat:' || p_conversation::text);
        perform native_push.enqueue(v_member.user_id, 'stays', 'conversation', p_conversation, 'guest_message',
          false, true, null, 'stay_messages');
      end loop;
    else
      perform native_push.enqueue(v_stay.guest_user_id, 'stays', 'conversation', p_conversation, 'host_message',
        false, true, null, 'stay_messages');
    end if;
  exception when others then
    raise warning 'stay chat notification skipped: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'thread_id', p_conversation, 'message_id', v_id, 'seq', v_seq,
    'repeat', false);
exception
  when unique_violation then
    /* The same key sent twice at once: the first one stored it. */
    select * into v_existing from public.msg_message
     where conversation_id = p_conversation and idempotency_key = p_idempotency_key;
    if not found then raise; end if;
    return jsonb_build_object('ok', true, 'thread_id', p_conversation, 'message_id', v_existing.id,
      'seq', v_existing.seq, 'repeat', true);
end;
$$;

/* Mark everything in the thread read for the caller on their side. */
create or replace function authz.stay_chat_mark_read(p_conversation uuid, p_side text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_max bigint;
begin
  v_me := authz.stay_chat_me(p_conversation, p_side);
  select coalesce(max(seq), 0) into v_max from public.msg_message
   where conversation_id = p_conversation and visibility = 'external';
  update public.msg_participant set last_read_seq = greatest(last_read_seq, v_max) where id = v_me;
  return jsonb_build_object('ok', true, 'thread_id', p_conversation, 'read_to', v_max);
end;
$$;

revoke all on function
  authz.stay_chat_host_sees(uuid),
  authz.stay_chat_open(uuid),
  authz.stay_chat_refusal(uuid),
  authz.stay_chat_ensure(uuid, public.msg_channel),
  authz.stay_chat_me(uuid, text),
  authz.stay_chat_thread(uuid, text),
  authz.stay_chat_page(uuid, bigint, integer),
  authz.stay_chat_post(uuid, text, text, text),
  authz.stay_chat_mark_read(uuid, text)
from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ the guest's side

/** Start or get the chat for a stay the caller booked. */
create or replace function public.rpc_stay_chat_guest_open(p_stay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv uuid;
  v_refusal text;
  v_created boolean := false;
begin
  if v_uid is null or not exists (
    select 1 from public.stay s where s.id = p_stay_id and s.guest_user_id = v_uid) then
    raise exception 'This stay is not yours.' using errcode = '42501';
  end if;

  select c.id into v_conv from public.msg_conversation c where c.stay_id = p_stay_id;
  if v_conv is null then
    v_refusal := authz.stay_chat_refusal(p_stay_id);
    if v_refusal is not null then
      raise exception '%', v_refusal
        using errcode = case when v_refusal like 'This chat is closed%' then '55000' else '22023' end;
    end if;
    v_conv := authz.stay_chat_ensure(p_stay_id, 'guest_app');
    v_created := true;
    perform audit.log('guest'::public.actor_type, 'messaging', 'stay.chat_started',
      p_actor_id => v_uid, p_target_type => 'stay', p_target_id => p_stay_id,
      p_after => jsonb_build_object('conversation_id', v_conv, 'side', 'guest'));
  end if;
  perform authz.stay_chat_me(v_conv, 'guest');

  return jsonb_build_object('ok', true, 'thread_id', v_conv, 'created', v_created,
    'thread', authz.stay_chat_thread(v_conv, 'guest'));
end;
$$;

/** The caller's stay chats, newest first. */
create or replace function public.rpc_stay_chat_guest_threads(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('threads', coalesce(jsonb_agg(t.thread order by t.at desc nulls last, t.id), '[]'::jsonb))
    from (
      select c.id, coalesce(c.last_message_at, c.created_at) as at, authz.stay_chat_thread(c.id, 'guest') as thread
        from public.msg_conversation c
        join public.stay s on s.id = c.stay_id
       where (select auth.uid()) is not null
         and s.guest_user_id = (select auth.uid())
       order by coalesce(c.last_message_at, c.created_at) desc nulls last, c.id
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) t
$$;

/** One chat and a page of its messages. */
create or replace function public.rpc_stay_chat_guest_messages(
  p_thread_id uuid, p_before bigint default null, p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.msg_conversation c join public.stay s on s.id = c.stay_id
     where c.id = p_thread_id and s.guest_user_id = (select auth.uid())) then
    raise exception 'This chat is unavailable.' using errcode = '42501';
  end if;
  return jsonb_build_object('thread', authz.stay_chat_thread(p_thread_id, 'guest'))
    || authz.stay_chat_page(p_thread_id, p_before, p_limit);
end;
$$;

/** Send a message to the host. The same idempotency key twice stores it once. */
create or replace function public.rpc_stay_chat_guest_send(
  p_thread_id uuid, p_body text, p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay uuid;
  v_refusal text;
begin
  select s.id into v_stay from public.msg_conversation c join public.stay s on s.id = c.stay_id
   where c.id = p_thread_id and (select auth.uid()) is not null and s.guest_user_id = (select auth.uid());
  if v_stay is null then
    raise exception 'This chat is unavailable.' using errcode = '42501';
  end if;
  v_refusal := authz.stay_chat_refusal(v_stay);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = case when v_refusal like 'This chat is closed%' then '55000' else '22023' end;
  end if;
  return authz.stay_chat_post(p_thread_id, 'guest', p_body, p_idempotency_key);
end;
$$;

/** Mark the chat read up to its last message. */
create or replace function public.rpc_stay_chat_guest_read(p_thread_id uuid)
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
  return authz.stay_chat_mark_read(p_thread_id, 'guest');
end;
$$;

-- ═══════════════════════════════════════════════════ the host's side

/** Start or get the chat for a stay in a unit the caller can see. */
create or replace function public.rpc_stay_chat_host_open(p_stay_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv uuid;
  v_refusal text;
  v_created boolean := false;
  v_host uuid;
begin
  if (select auth.uid()) is null or not authz.stay_chat_host_sees(p_stay_id) then
    raise exception 'This stay is outside your workspace access.' using errcode = '42501';
  end if;

  select c.id into v_conv from public.msg_conversation c where c.stay_id = p_stay_id;
  if v_conv is null then
    v_refusal := authz.stay_chat_refusal(p_stay_id);
    if v_refusal is not null then
      raise exception '%', v_refusal
        using errcode = case when v_refusal like 'This chat is closed%' then '55000' else '22023' end;
    end if;
    v_conv := authz.stay_chat_ensure(p_stay_id, 'host_view');
    v_created := true;
    select s.host_id into v_host from public.stay s where s.id = p_stay_id;
    perform audit.log('host_user'::public.actor_type, 'messaging', 'stay.chat_started',
      p_actor_id => (select auth.uid()), p_target_type => 'stay', p_target_id => p_stay_id,
      p_after => jsonb_build_object('conversation_id', v_conv, 'side', 'host', 'host_id', v_host));
  end if;
  perform authz.stay_chat_me(v_conv, 'host');

  return jsonb_build_object('ok', true, 'thread_id', v_conv, 'created', v_created,
    'thread', authz.stay_chat_thread(v_conv, 'host'));
end;
$$;

/** The host's stay chats the caller can see, newest first. */
create or replace function public.rpc_stay_chat_host_threads(p_host_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.host_user hu where hu.host_id = p_host_id and hu.user_id = (select auth.uid())) then
    raise exception 'Not your account.' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object('threads', coalesce(jsonb_agg(t.thread order by t.at desc nulls last, t.id), '[]'::jsonb))
      from (
        select c.id, coalesce(c.last_message_at, c.created_at) as at, authz.stay_chat_thread(c.id, 'host') as thread
          from public.msg_conversation c
          join public.stay s on s.id = c.stay_id
         where s.host_id = p_host_id
           and authz.stay_chat_host_sees(s.id)
         order by coalesce(c.last_message_at, c.created_at) desc nulls last, c.id
         limit greatest(1, least(coalesce(p_limit, 100), 200))
      ) t);
end;
$$;

/** One chat and a page of its messages, for a host member who can see the stay. */
create or replace function public.rpc_stay_chat_host_messages(
  p_thread_id uuid, p_before bigint default null, p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_stay uuid;
begin
  select c.stay_id into v_stay from public.msg_conversation c where c.id = p_thread_id and c.stay_id is not null;
  if (select auth.uid()) is null or v_stay is null or not authz.stay_chat_host_sees(v_stay) then
    raise exception 'This chat is unavailable.' using errcode = '42501';
  end if;
  return jsonb_build_object('thread', authz.stay_chat_thread(p_thread_id, 'host'))
    || authz.stay_chat_page(p_thread_id, p_before, p_limit);
end;
$$;

/** Send a message to the guest, as the host. The same idempotency key twice stores it once. */
create or replace function public.rpc_stay_chat_host_send(
  p_thread_id uuid, p_body text, p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay uuid;
  v_refusal text;
begin
  select c.stay_id into v_stay from public.msg_conversation c where c.id = p_thread_id and c.stay_id is not null;
  if (select auth.uid()) is null or v_stay is null or not authz.stay_chat_host_sees(v_stay) then
    raise exception 'This chat is unavailable.' using errcode = '42501';
  end if;
  v_refusal := authz.stay_chat_refusal(v_stay);
  if v_refusal is not null then
    raise exception '%', v_refusal
      using errcode = case when v_refusal like 'This chat is closed%' then '55000' else '22023' end;
  end if;
  return authz.stay_chat_post(p_thread_id, 'host', p_body, p_idempotency_key);
end;
$$;

/** Mark the chat read for this host member, up to its last message. */
create or replace function public.rpc_stay_chat_host_read(p_thread_id uuid)
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
  return authz.stay_chat_mark_read(p_thread_id, 'host');
end;
$$;

revoke execute on function
  public.rpc_stay_chat_guest_open(uuid),
  public.rpc_stay_chat_guest_threads(integer),
  public.rpc_stay_chat_guest_messages(uuid, bigint, integer),
  public.rpc_stay_chat_guest_send(uuid, text, text),
  public.rpc_stay_chat_guest_read(uuid),
  public.rpc_stay_chat_host_open(uuid),
  public.rpc_stay_chat_host_threads(uuid, integer),
  public.rpc_stay_chat_host_messages(uuid, bigint, integer),
  public.rpc_stay_chat_host_send(uuid, text, text),
  public.rpc_stay_chat_host_read(uuid)
from public, anon;

grant execute on function
  public.rpc_stay_chat_guest_open(uuid),
  public.rpc_stay_chat_guest_threads(integer),
  public.rpc_stay_chat_guest_messages(uuid, bigint, integer),
  public.rpc_stay_chat_guest_send(uuid, text, text),
  public.rpc_stay_chat_guest_read(uuid),
  public.rpc_stay_chat_host_open(uuid),
  public.rpc_stay_chat_host_threads(uuid, integer),
  public.rpc_stay_chat_host_messages(uuid, bigint, integer),
  public.rpc_stay_chat_host_send(uuid, text, text),
  public.rpc_stay_chat_host_read(uuid)
to authenticated;

-- ═══════════════════════════════════════════════════ a member who leaves stops reading

/*
 * The RPCs check unit access on every call, but a participant row also lets its user read the conversation
 * through the tables' own policies (authz.msg_is_participant). When a member leaves the team, moves to another
 * account or loses a unit, their rows on the affected stay chats are marked as left. Coming back rejoins them on
 * their next read or send.
 */
create or replace function public.tg_stay_chat_member_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_all boolean;
  v_units uuid[];
begin
  if tg_op = 'DELETE' then
    v_all := true;
  else
    v_all := new.user_id is distinct from old.user_id or new.host_id is distinct from old.host_id;
    v_units := new.units;
  end if;
  if not v_all and v_units is null then
    return null;
  end if;

  update public.msg_participant p
     set left_at = now()
    from public.msg_conversation c
    join public.stay s on s.id = c.stay_id
   where p.conversation_id = c.id
     and p.kind = 'host_user'
     and p.left_at is null
     and p.user_id = old.user_id
     and s.host_id = old.host_id
     and (v_all or s.unit_id is null or not (s.unit_id = any (v_units)));
  return null;
end;
$$;

drop trigger if exists host_user_stay_chat_scope on public.host_user;
create trigger host_user_stay_chat_scope
  after update of units, user_id, host_id or delete on public.host_user
  for each row execute function public.tg_stay_chat_member_scope();

-- ═══════════════════════════════════════════════════ accounted for

insert into audit.action_registry (action, module, description) values
  ('stay.chat_started', 'messaging', 'A guest or host opened the chat for a stay')
on conflict (action) do nothing;

/* Same reasons as the host support thread (20260101019900): the conversation is its own record. */
insert into wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_stay_chat_guest_send',
   'Auditing every line of a conversation is volume without accountability',
   'msg_message, append-only with its author participant'),
  ('rpc_stay_chat_host_send',
   'Auditing every line of a conversation is volume without accountability',
   'msg_message, append-only with its author participant'),
  ('rpc_stay_chat_guest_read',
   'Marking a thread read is not a state change anybody is accountable for',
   'msg_participant.last_read_seq'),
  ('rpc_stay_chat_host_read',
   'Marking a thread read is not a state change anybody is accountable for',
   'msg_participant.last_read_seq')
on conflict (function_name) do nothing;

comment on function public.rpc_stay_chat_guest_open(uuid) is
  'Start or get the chat between a stay''s guest and its host. Only the guest who booked it (auth.uid() = stay.guest_user_id).';
comment on function public.rpc_stay_chat_host_open(uuid) is
  'Start or get the chat between a stay''s guest and its host. Only host members who can see the stay''s unit.';
