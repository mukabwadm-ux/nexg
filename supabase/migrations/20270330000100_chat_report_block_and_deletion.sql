-- Report and block in chats, and account deletion that works for trip group organisers (owner, 26 Nov 2026: fix
-- report and block "ASAP"). Google Play and Apple require both for an app where people post messages, and account
-- deletion for an app with accounts.
--
-- Report:
--   * A signed-in person reports a message, or a person, in a trip group they are in or a stay chat they take part in
--     (the guest, or a host member who can see the stay).
--   * The reported words are copied onto the report as they were: the one message, or the person's last 20 messages in
--     that conversation. Staff cannot open trip groups, so the copy is what they decide on.
--   * Only staff read reports: the same people who may open stay chats (authz.stay_chat_nexg_staff: super admin, the
--     Concierge desk, hospitality operations). The table has no policy and no grant, so a reporter cannot read it,
--     their own reports included.
--   * Staff dismiss a report, or act on it: remove the reported message, remove the person from the trip group (an
--     organiser's removal closes the group), or record what else they did.
--   * 20 reports per person in 24 hours. The same report sent again while open is stored once.
--
-- Block (trip groups only):
--   * A member blocks another member. The blocker no longer gets that person's messages, cards, unread count or push,
--     in any group they share, nor the lines saying they joined, left or were removed, and the member list keeps the
--     name they were blocked under. It is applied in the trip group read functions. The blocked person is not told and
--     still sees the group as before. Reading msg_message directly under its own row policy is unchanged: the app
--     reads groups through these functions.
--   * A block outlives the blocked person's account, so what they wrote stays hidden. It then reads "Former member".
--   * No block in a stay chat between a guest and a host, on purpose. The two are parties to a booked stay: hiding
--     either side's messages could lose arrival, access, safety or cancellation messages that the other relies on,
--     and a dispute needs both sides to have been able to reach each other. Either side can report, ask NexG into the
--     chat (rpc_stay_chat_*_ask_nexg), and NexG staff can remove a message.
--
-- Closed means closed:
--   * rpc_host_message_reply and rpc_host_message_read (the host support thread) accepted any conversation the caller
--     had a participant row in, trip groups included: a member could write into a closed group, past the length limit,
--     and reopen its conversation. Both now refuse groups, as they already refuse stay chats.
--
-- Account deletion:
--   * trip_group.created_by referenced auth.users with "on delete restrict", so anyone who had ever made a trip group
--     got a database error (23503) when deleting their account. Their open groups are now closed with a line saying
--     why, the organiser column empties, and their name on group and stay chat messages becomes "Former member". The
--     messages stay, as the rest of those conversations does. Their first name also leaves the lines in those chats
--     (joined, left, removed, asked NexG to help) and their stays, which the stay chat's header reads.
--   * The same request failed (23514) for anyone who had accepted a legal document as themselves: removing the sign-in
--     emptied legal_acceptance.user_id, which its one-party check refuses. Those rows now go with the account.
--   * And (42501) for someone who accepted a merchant's Data Processing Agreement and has since left its team: the
--     record refused to let accepted_by empty. It may now do that and nothing else; the email on it stays.
--   * Host sign-ins are still not deleted from the app, because listings, bookings and payouts would lose their owner.
--     They now get their own reason (`host_account`) that says what to do, instead of the shared business one.
--
-- Rollback: drop public.rpc_chat_report, rpc_chat_block, rpc_chat_unblock, rpc_chat_blocked, rpc_chat_reports and
-- rpc_chat_report_resolve; re-run authz.trip_group_thread, authz.trip_group_page, authz.trip_group_post and
-- public.rpc_trip_group_members, rpc_trip_group_join, rpc_trip_group_leave and rpc_trip_group_remove from
-- 20270315000300, rpc_host_message_reply and rpc_host_message_read from 20270314000700, authz.stay_chat_page from
-- 20270314001000, tg_merchant_dpa_acceptance_immutable from 20270327000100, and fn_customer_deletion_blockers,
-- rpc_my_account_deletion and rpc_my_account_deletion_request from 20270116000200; drop authz.trip_group_say_about
-- and tables public.chat_report and public.user_block; delete the audit.action_registry and wiring_audit_exempt rows
-- added below. trip_group.created_by can go back to not null and "on delete restrict" only while no row has an empty
-- organiser. Names already taken out of chats and stays do not come back.

-- ═══════════════════════════════════════════════════ reports

create table public.chat_report (
  id uuid primary key default gen_random_uuid(),
  /* Empties when the reporter deletes their account; the report stays. */
  reporter_user_id uuid references auth.users (id) on delete set null,
  conversation_id uuid not null references public.msg_conversation (id) on delete restrict,
  context text not null check (context in ('trip_group', 'stay_chat')),
  city_id uuid,
  /* Set when one message was reported; null when a person was. */
  message_id uuid references public.msg_message (id) on delete restrict,
  reported_user_id uuid references auth.users (id) on delete set null,
  reported_side text not null check (reported_side in ('member', 'guest', 'host', 'nexg')),
  reported_name text not null,
  /* The reported words as they were: [{message_id, seq, at, body, links}]. */
  snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(snapshot) = 'array'),
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'scam', 'other')),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolved_at timestamptz,
  resolved_by uuid references public.staff_user (id) on delete set null,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 1000),
  message_removed boolean not null default false,
  member_removed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint chat_report_resolved_when_closed check ((status = 'open') = (resolved_at is null))
);

create index chat_report_status_idx on public.chat_report (status, created_at desc);
create index chat_report_reporter_idx on public.chat_report (reporter_user_id, created_at desc);

comment on table public.chat_report is
  'A reported chat message or person, with the words as they were. Staff only, through rpc_chat_reports and rpc_chat_report_resolve.';

alter table public.chat_report enable row level security;
revoke all on public.chat_report from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ blocks

create table public.user_block (
  blocker_user_id uuid not null references auth.users (id) on delete cascade,
  /* No foreign key on purpose: a block must outlast the blocked account, whose messages stay in the group. */
  blocked_user_id uuid not null,
  /* The name they went by where they were blocked, for the blocker's own list. */
  blocked_name text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint user_block_not_self check (blocker_user_id <> blocked_user_id)
);

create index user_block_blocked_idx on public.user_block (blocked_user_id);

comment on table public.user_block is
  'Who a person has blocked. Their trip group messages are hidden from the blocker. Written only through rpc_chat_block and rpc_chat_unblock.';

alter table public.user_block enable row level security;
revoke all on public.user_block from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ trip group reads leave blocked people out

/* As 20270315000300, with blocked people left out of the last message and the unread count, and an organiser who
   deleted their account counting as nobody. */
create or replace function authz.trip_group_thread(p_group uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', g.id,
    'name', g.name,
    'closed', g.closed_at is not null,
    'is_admin', coalesce(g.created_by = (select auth.uid()), false),
    'members', (select count(*)::int from public.trip_group_member m where m.group_id = g.id and m.status = 'active'),
    'muted', coalesce((select p.muted from public.msg_participant p where p.id = me.participant_id), false),
    'last_message_at', c.last_message_at,
    'last_message', (
      select jsonb_build_object('body', case when m.redacted_at is null then m.body end,
               'kind', m.kind, 'at', m.created_at, 'author', a.display_name,
               'mine', coalesce(a.user_id = (select auth.uid()), false))
        from public.msg_message m
        left join public.msg_participant a on a.id = m.author_participant_id
       where m.conversation_id = g.id and m.visibility = 'external' and m.kind in ('text', 'link')
         and not exists (select 1 from public.user_block b
                          where b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = a.user_id)
       order by m.seq desc limit 1),
    'unread', (
      select count(*)::int from public.msg_message m
        join public.msg_participant a on a.id = m.author_participant_id
       where m.conversation_id = g.id and m.visibility = 'external' and m.kind in ('text', 'link')
         and a.user_id is distinct from (select auth.uid())
         and not exists (select 1 from public.user_block b
                          where b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = a.user_id)
         and m.seq > coalesce((select p.last_read_seq from public.msg_participant p where p.id = me.participant_id), 0)),
    'invite', case when g.created_by = (select auth.uid()) then jsonb_build_object(
        'active', g.invite_token_hash is not null and g.invite_revoked_at is null and g.closed_at is null
                  and g.invite_expires_at > now(),
        'expires_at', g.invite_expires_at) end)
  from public.trip_group g
  join public.msg_conversation c on c.id = g.id
  join public.trip_group_member me on me.group_id = g.id and me.user_id = (select auth.uid()) and me.status = 'active'
  where g.id = p_group
$$;

/* As 20270315000300, without blocked people's messages, and with `author_id` so a message's writer can be reported
   or blocked (members already see each other's ids in rpc_trip_group_members). A system line about one person now
   carries their participant id, so the block covers it; apps still get no author on it. A system line's words are
   NexG's, so it is shown after account deletion has taken the name out of it. */
create or replace function authz.trip_group_page(p_group uuid, p_before bigint, p_limit integer)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with page as (
    select m.id, m.seq, m.kind, m.body, m.object_links, m.redacted_at, m.created_at, a.user_id, a.display_name
      from public.msg_message m
      left join public.msg_participant a on a.id = m.author_participant_id
     where m.conversation_id = p_group and m.visibility = 'external'
       and m.kind in ('text', 'link', 'system')
       and not exists (select 1 from public.user_block b
                        where b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = a.user_id)
       and (p_before is null or m.seq < p_before)
     order by m.seq desc
     limit greatest(1, least(coalesce(p_limit, 30), 100)) + 1
  ), kept as (
    select * from page order by seq desc limit greatest(1, least(coalesce(p_limit, 30), 100))
  )
  select jsonb_build_object(
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', k.id, 'seq', k.seq, 'kind', k.kind,
          'body', case when k.redacted_at is null or k.kind = 'system' then k.body end,
          'redacted', k.redacted_at is not null and k.kind <> 'system',
          'links', case when k.redacted_at is null then k.object_links else '[]'::jsonb end,
          'at', k.created_at,
          'mine', k.kind <> 'system' and coalesce(k.user_id = (select auth.uid()), false),
          'author', case when k.kind <> 'system' then k.display_name end,
          'author_id', case when k.kind <> 'system' then k.user_id end) order by k.seq)
        from kept k), '[]'::jsonb),
    'earlier_before', case
      when (select count(*) from page) > (select count(*) from kept) then (select min(seq) from kept) end)
$$;

/* As 20270315000300, with no push to a member who has blocked the sender. */
create or replace function authz.trip_group_post(
  p_group uuid, p_kind public.msg_message_kind, p_body text, p_links jsonb, p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_me uuid := authz.trip_group_me(p_group);
  v_existing public.msg_message;
  v_id uuid;
  v_seq bigint;
  v_member record;
begin
  if (select g.closed_at from public.trip_group g where g.id = p_group) is not null then
    raise exception 'This group is closed.' using errcode = '55000';
  end if;
  if p_idempotency_key is not null and (length(p_idempotency_key) not between 1 and 200) then
    raise exception 'Send the message again.' using errcode = '22023';
  end if;

  /* Serialises sends into one conversation, so seq and the idempotency check cannot race. */
  perform pg_advisory_xact_lock(hashtextextended('trip-group:' || p_group::text, 0));

  if p_idempotency_key is not null then
    select * into v_existing from public.msg_message
     where conversation_id = p_group and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'group_id', p_group, 'message_id', v_existing.id,
        'seq', v_existing.seq, 'repeat', true);
    end if;
  end if;

  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, object_links, visibility, channel_out, delivery, idempotency_key)
  values (p_group, p_kind, v_me, p_body, coalesce(p_links, '[]'::jsonb), 'external', 'guest_app', 'stored', p_idempotency_key)
  returning id, seq into v_id, v_seq;

  update public.msg_participant set last_read_seq = greatest(last_read_seq, v_seq) where id = v_me;

  begin
    for v_member in
      select m.user_id from public.trip_group_member m
        join public.msg_participant p on p.id = m.participant_id
       where m.group_id = p_group and m.status = 'active' and m.user_id <> v_uid and not p.muted
         and not exists (select 1 from public.user_block b
                          where b.blocker_user_id = m.user_id and b.blocked_user_id = v_uid)
    loop
      perform native_push.enqueue(v_member.user_id, 'stays', 'conversation', p_group, 'group_message',
        false, true, null, 'stay_messages');
    end loop;
  exception when others then
    raise warning 'trip group notification skipped: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'group_id', p_group, 'message_id', v_id, 'seq', v_seq, 'repeat', false);
exception
  when unique_violation then
    select * into v_existing from public.msg_message
     where conversation_id = p_group and idempotency_key = p_idempotency_key;
    if not found then raise; end if;
    return jsonb_build_object('ok', true, 'group_id', p_group, 'message_id', v_existing.id,
      'seq', v_existing.seq, 'repeat', true);
end;
$$;

/** Who is in the group: first names only, and whether the caller has blocked each one. A blocked person keeps the
    name they were blocked under, so changing it puts nothing new in front of the blocker. */
create or replace function public.rpc_trip_group_members(p_group_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform authz.trip_group_me(p_group_id);
  return jsonb_build_object('members', coalesce((
    select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', coalesce(b.blocked_name, m.display_name),
        'organiser', coalesce(m.user_id = g.created_by, false), 'me', m.user_id = (select auth.uid()),
        'blocked', b.blocked_user_id is not null)
        order by coalesce(m.user_id = g.created_by, false) desc, m.joined_at)
      from public.trip_group_member m join public.trip_group g on g.id = m.group_id
      left join public.user_block b on b.blocker_user_id = (select auth.uid()) and b.blocked_user_id = m.user_id
     where m.group_id = p_group_id and m.status = 'active'), '[]'::jsonb));
end;
$$;

-- ═══════════════════════════════════════════════════ lines about a person say who

/* A system line about one member ("Amina joined"). The participant id lets a block hide it and account deletion
   take the name out of it. */
create or replace function authz.trip_group_say_about(p_group uuid, p_participant uuid, p_text text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, visibility, channel_out, delivery)
  values (p_group, 'system', p_participant, p_text, 'external', 'guest_app', 'stored')
$$;
revoke all on function authz.trip_group_say_about(uuid, uuid, text) from public, anon, authenticated;

/* The lines already written, where the name points at one participant only. */
update public.msg_message m
   set author_participant_id = a.id
  from public.msg_conversation c, public.msg_participant a
 where c.id = m.conversation_id and c.kind = 'group' and a.conversation_id = c.id
   and m.kind = 'system' and m.author_participant_id is null
   and m.body in (a.display_name || ' joined', a.display_name || ' left', a.display_name || ' was removed')
   and not exists (select 1 from public.msg_participant o
                    where o.conversation_id = c.id and o.id <> a.id and o.display_name = a.display_name);

/* As 20270315000300, except that each of these lines records who it is about. */
create or replace function public.rpc_trip_group_join(p_token text, p_my_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_group uuid;
  v_me text;
  v_status text;
begin
  perform authz.trip_group_real_account();
  v_me := authz.trip_group_clean_name(p_my_name, 40, 'your first name');
  v_group := authz.trip_group_for_token(p_token);
  if v_group is null then
    raise exception 'This invite link no longer works.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('trip-group:' || v_group::text, 0));
  select m.status into v_status from public.trip_group_member m where m.group_id = v_group and m.user_id = v_uid;
  if v_status = 'active' then
    return jsonb_build_object('ok', true, 'group_id', v_group, 'joined', false,
      'thread', authz.trip_group_thread(v_group));
  end if;
  if v_status = 'removed' then
    raise exception 'You can''t join this group.' using errcode = '42501';
  end if;
  if (select count(*) from public.trip_group_member m where m.group_id = v_group and m.status = 'active') >= 20 then
    raise exception 'This group is full (20 people).' using errcode = '22023';
  end if;

  perform authz.trip_group_add(v_group, v_uid, v_me);
  perform authz.trip_group_say_about(v_group,
    (select m.participant_id from public.trip_group_member m where m.group_id = v_group and m.user_id = v_uid),
    v_me || ' joined');
  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.joined',
    p_actor_id => v_uid, p_target_type => 'conversation', p_target_id => v_group);

  return jsonb_build_object('ok', true, 'group_id', v_group, 'joined', true,
    'thread', authz.trip_group_thread(v_group));
end;
$$;

create or replace function public.rpc_trip_group_leave(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_me uuid := authz.trip_group_me(p_group_id);
  v_name text;
begin
  if authz.trip_group_is_admin(p_group_id) then
    raise exception 'You run this group. Close it, or remove the others first.' using errcode = '22023';
  end if;
  update public.trip_group_member set status = 'left' where group_id = p_group_id and user_id = v_uid
    returning display_name into v_name;
  update public.msg_participant set left_at = now() where id = v_me;
  perform authz.trip_group_say_about(p_group_id, v_me, v_name || ' left');
  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.left',
    p_actor_id => v_uid, p_target_type => 'conversation', p_target_id => p_group_id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.rpc_trip_group_remove(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_part uuid;
begin
  perform authz.trip_group_me(p_group_id);
  if not authz.trip_group_is_admin(p_group_id) then
    raise exception 'Only the organiser can remove someone.' using errcode = '42501';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception 'You can''t remove yourself. Close the group instead.' using errcode = '22023';
  end if;
  update public.trip_group_member set status = 'removed'
   where group_id = p_group_id and user_id = p_user_id and status = 'active'
  returning display_name, participant_id into v_name, v_part;
  if v_part is null then
    raise exception 'That person isn''t in the group.' using errcode = '22023';
  end if;
  update public.msg_participant set left_at = now() where id = v_part;
  perform authz.trip_group_say_about(p_group_id, v_part, v_name || ' was removed');
  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.removed',
    p_actor_id => (select auth.uid()), p_target_type => 'conversation', p_target_id => p_group_id,
    p_after => jsonb_build_object('user_id', p_user_id));
  return jsonb_build_object('ok', true);
end;
$$;

-- ═══════════════════════════════════════════════════ block and unblock

/** Block a member of a group the caller is in. It applies to every group the two share. */
create or replace function public.rpc_chat_block(p_group_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_new integer;
begin
  perform authz.trip_group_me(p_group_id);
  if p_user_id = v_uid then
    raise exception 'You can''t block yourself.' using errcode = '22023';
  end if;
  /* Someone who left or was removed can still be blocked: their messages are still there. */
  select m.display_name into v_name from public.trip_group_member m
   where m.group_id = p_group_id and m.user_id = p_user_id;
  if v_name is null then
    raise exception 'That person isn''t in this group.' using errcode = '22023';
  end if;
  insert into public.user_block (blocker_user_id, blocked_user_id, blocked_name)
  values (v_uid, p_user_id, v_name)
  on conflict (blocker_user_id, blocked_user_id) do nothing;
  get diagnostics v_new = row_count;
  if v_new > 0 then
    perform audit.log('guest'::public.actor_type, 'messaging', 'chat.user_blocked',
      p_actor_id => v_uid, p_target_type => 'conversation', p_target_id => p_group_id,
      p_after => jsonb_build_object('blocked_user_id', p_user_id));
  end if;
  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'blocked', true, 'already', v_new = 0);
end;
$$;

/** Unblock. Needs no group, so it works after either of them has left. */
create or replace function public.rpc_chat_unblock(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gone integer;
begin
  if v_uid is null then
    raise exception 'Sign in to manage who you have blocked.' using errcode = '42501';
  end if;
  delete from public.user_block where blocker_user_id = v_uid and blocked_user_id = p_user_id;
  get diagnostics v_gone = row_count;
  if v_gone > 0 then
    perform audit.log('guest'::public.actor_type, 'messaging', 'chat.user_unblocked',
      p_actor_id => v_uid, p_target_type => 'user', p_target_id => p_user_id);
  end if;
  return jsonb_build_object('ok', true, 'user_id', p_user_id, 'blocked', false, 'already', v_gone = 0);
end;
$$;

/** The people the caller has blocked, newest first. */
create or replace function public.rpc_chat_blocked()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Sign in to manage who you have blocked.' using errcode = '42501';
  end if;
  return jsonb_build_object('blocked', coalesce((
    select jsonb_agg(jsonb_build_object('user_id', b.blocked_user_id, 'name', b.blocked_name, 'at', b.created_at)
             order by b.created_at desc, b.blocked_user_id)
      from public.user_block b where b.blocker_user_id = v_uid), '[]'::jsonb));
end;
$$;

-- ═══════════════════════════════════════════════════ report

/**
 * Report a message, or a person, in a trip group or stay chat the caller belongs to.
 * p_thread_id: the group id or the stay chat's thread id. In a group give p_message_id or p_user_id. In a stay chat
 * give p_message_id, or neither to report the other side (the apps never learn the other side's user id).
 */
create or replace function public.rpc_chat_report(
  p_thread_id uuid,
  p_reason text,
  p_message_id uuid default null,
  p_user_id uuid default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv public.msg_conversation;
  v_stay public.stay;
  v_context text;
  v_side text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_message record;
  v_user uuid;
  v_name text;
  v_reported_side text;
  v_snapshot jsonb;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Sign in to report.' using errcode = '42501';
  end if;

  /* Membership first, so nobody else learns whether a conversation exists. */
  select * into v_conv from public.msg_conversation c where c.id = p_thread_id;
  if v_conv.stay_id is not null then
    select * into v_stay from public.stay s where s.id = v_conv.stay_id;
    if v_stay.guest_user_id = v_uid then
      v_side := 'guest';
    elsif authz.stay_chat_host_sees(v_conv.stay_id) then
      v_side := 'host';
    else
      raise exception 'This chat is unavailable.' using errcode = '42501';
    end if;
    v_context := 'stay_chat';
  else
    /* Raises 42501 for anyone who is not an active member, and for anything that is not a group. */
    perform authz.trip_group_me(p_thread_id);
    v_context := 'trip_group';
  end if;

  if p_reason is null or p_reason not in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'scam', 'other') then
    raise exception 'Choose a reason.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;

  if p_message_id is not null then
    select m.id, a.user_id, a.display_name, a.kind into v_message
      from public.msg_message m
      join public.msg_participant a on a.id = m.author_participant_id
     where m.id = p_message_id and m.conversation_id = p_thread_id
       and m.visibility = 'external' and m.kind in ('text', 'link');
    if not found then
      raise exception 'That message can''t be reported.' using errcode = '22023';
    end if;
    if v_message.user_id = v_uid then
      raise exception 'You can''t report your own message.' using errcode = '22023';
    end if;
    if p_user_id is not null and p_user_id is distinct from v_message.user_id then
      raise exception 'That message is from somebody else.' using errcode = '22023';
    end if;
    v_reported_side := case
      when v_context = 'trip_group' then 'member'
      when v_message.kind = 'staff' then 'nexg'
      when v_message.kind = 'guest' then 'guest'
      else 'host' end;
    v_user := v_message.user_id;
    v_name := case when v_reported_side = 'nexg' then 'NexG' else v_message.display_name end;
  elsif v_context = 'trip_group' then
    if p_user_id is null then
      raise exception 'Choose a message or a person to report.' using errcode = '22023';
    end if;
    if p_user_id = v_uid then
      raise exception 'You can''t report yourself.' using errcode = '22023';
    end if;
    select m.display_name into v_name from public.trip_group_member m
     where m.group_id = p_thread_id and m.user_id = p_user_id;
    if v_name is null then
      raise exception 'That person isn''t in this group.' using errcode = '22023';
    end if;
    v_user := p_user_id;
    v_reported_side := 'member';
  else
    if p_user_id is not null then
      raise exception 'In a stay chat, report a message or the other side.' using errcode = '22023';
    end if;
    if v_side = 'guest' then
      v_reported_side := 'host';
      select coalesce(nullif(trim(h.display_name), ''), 'Host') into v_name
        from public.host h where h.id = v_stay.host_id;
    else
      v_reported_side := 'guest';
      v_user := v_stay.guest_user_id;
      v_name := coalesce(nullif(trim(v_stay.guest_first_name), ''), 'Guest');
    end if;
  end if;

  /* Serialises one person's reports, so the repeat check and the limit cannot race. */
  perform pg_advisory_xact_lock(hashtextextended('chat-report:' || v_uid::text, 0));

  select r.id into v_id from public.chat_report r
   where r.reporter_user_id = v_uid and r.status = 'open' and r.conversation_id = p_thread_id
     and r.message_id is not distinct from p_message_id
     and r.reported_side = v_reported_side
     and (p_message_id is not null or r.reported_user_id is not distinct from v_user);
  if v_id is not null then
    return jsonb_build_object('ok', true, 'report_id', v_id, 'repeat', true,
      'message', 'You already reported this. NexG will review it.');
  end if;

  if (select count(*) from public.chat_report r
       where r.reporter_user_id = v_uid and r.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'You have sent 20 reports today. NexG has them. Try again tomorrow.' using errcode = '54000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('message_id', x.id, 'seq', x.seq, 'at', x.created_at,
           'body', x.body, 'links', x.object_links) order by x.seq), '[]'::jsonb)
    into v_snapshot
    from (
      select m.id, m.seq, m.created_at, m.body, m.object_links
        from public.msg_message m
        join public.msg_participant a on a.id = m.author_participant_id
       where m.conversation_id = p_thread_id and m.visibility = 'external' and m.kind in ('text', 'link')
         and case
               when p_message_id is not null then m.id = p_message_id
               when v_context = 'trip_group' then a.user_id = v_user
               when v_reported_side = 'guest' then a.kind = 'guest'
               else a.kind = 'host_user'
             end
       order by m.seq desc
       limit 20
    ) x;

  insert into public.chat_report (
    reporter_user_id, conversation_id, context, city_id, message_id, reported_user_id, reported_side,
    reported_name, snapshot, reason, note)
  values (v_uid, p_thread_id, v_context, v_conv.city_id, p_message_id,
    /* A message can outlive its writer's sign-in: the report is still taken, with no account to point at. */
    (select u.id from auth.users u where u.id = v_user), v_reported_side, v_name, v_snapshot, p_reason, v_note)
  returning id into v_id;

  /* Who, where and why. Never the words: those stay on the report. */
  perform audit.log(
    (case when v_side = 'host' then 'host_user' else 'guest' end)::public.actor_type, 'messaging', 'chat.reported',
    p_actor_id => v_uid, p_target_type => 'chat_report', p_target_id => v_id, p_city_id => v_conv.city_id,
    p_after => jsonb_build_object('conversation_id', p_thread_id, 'context', v_context, 'reason', p_reason,
      'message_id', p_message_id, 'reported_side', v_reported_side));

  begin
    perform public.fn_notify_staff('messaging', 'staff.chat_report.new',
      'A chat message or person was reported', 'Open Chat reports to review it.',
      '/messaging/reports?id=' || v_id::text,
      'warning'::public.notification_tone, 'chat_report', v_id, v_conv.city_id,
      'chat-report:' || v_id::text);
  exception when others then
    raise warning 'chat report bell skipped: %', sqlerrm;
  end;

  return jsonb_build_object('ok', true, 'report_id', v_id, 'repeat', false,
    'message', 'Thanks. NexG will review it.');
end;
$$;

-- ═══════════════════════════════════════════════════ staff

/** Reports for staff, oldest open first. p_status: open | resolved | all. */
create or replace function public.rpc_chat_reports(p_status text default 'open', p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(authz.stay_chat_nexg_staff(null), false) then
    raise exception 'Only NexG support and hospitality operations can open chat reports.' using errcode = '42501';
  end if;
  if coalesce(p_status, 'open') not in ('open', 'resolved', 'all') then
    raise exception 'Choose open, resolved or all.' using errcode = '22023';
  end if;
  return (
    with visible as (
      select r.* from public.chat_report r where authz.stay_chat_nexg_staff(r.city_id)
    ), page as (
      select v.* from visible v
       where case coalesce(p_status, 'open')
               when 'open' then v.status = 'open'
               when 'resolved' then v.status <> 'open'
               else true end
       order by (v.status <> 'open'), case when v.status = 'open' then v.created_at end,
                v.created_at desc, v.id
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    )
    select jsonb_build_object(
      'reports', coalesce(jsonb_agg(jsonb_build_object(
          'id', p.id,
          'created_at', p.created_at,
          'status', p.status,
          'context', p.context,
          'conversation_id', p.conversation_id,
          'subject', c.subject,
          'reason', p.reason,
          'note', p.note,
          'message_id', p.message_id,
          /* A host member who has only read the chat has no participant row yet. */
          'reporter_name', coalesce((
            select a.display_name from public.msg_participant a
             where a.conversation_id = p.conversation_id and a.user_id = p.reporter_user_id
             order by a.joined_at limit 1),
            case when p.reporter_user_id is null then 'Former member'
                 when p.context = 'stay_chat' then 'Host' else 'Member' end),
          'reported_name', p.reported_name,
          'reported_side', p.reported_side,
          'reports_about_them', (
            select count(*)::int from visible o
             where o.reported_user_id is not null and o.reported_user_id = p.reported_user_id),
          'snapshot', p.snapshot,
          'can_remove_message', p.status = 'open' and exists (
            select 1 from public.msg_message m where m.id = p.message_id and m.redacted_at is null),
          'can_remove_member', p.status = 'open' and p.context = 'trip_group' and exists (
            select 1 from public.trip_group_member m
             where m.group_id = p.conversation_id and m.user_id = p.reported_user_id and m.status <> 'removed'),
          'is_organiser', exists (
            select 1 from public.trip_group g
             where g.id = p.conversation_id and g.created_by = p.reported_user_id),
          'resolved_at', p.resolved_at,
          'resolved_by', (select coalesce(nullif(trim(su.display_name), ''), su.email)
                            from public.staff_user su where su.id = p.resolved_by),
          'resolution_note', p.resolution_note,
          'message_removed', p.message_removed,
          'member_removed', p.member_removed)
        order by (p.status <> 'open'), case when p.status = 'open' then p.created_at end,
                 p.created_at desc, p.id), '[]'::jsonb),
      'counts', jsonb_build_object(
        'open', (select count(*) from visible where status = 'open'),
        'resolved', (select count(*) from visible where status <> 'open')))
    from page p
    join public.msg_conversation c on c.id = p.conversation_id);
end;
$$;

/**
 * Resolve one report. p_outcome: actioned | dismissed. Actioned needs a removal here or a note saying what was done.
 * A removed message keeps its row, so the conversation stays in order; its words stay on the report.
 */
create or replace function public.rpc_chat_report_resolve(
  p_report_id uuid,
  p_outcome text,
  p_note text default null,
  p_remove_message boolean default false,
  p_remove_member boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.chat_report;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_message_removed boolean := false;
  v_member_removed boolean := false;
  v_group_closed boolean := false;
  v_part uuid;
  v_name text;
begin
  select * into v_report from public.chat_report r where r.id = p_report_id for update;
  if v_report.id is null or not coalesce(authz.stay_chat_nexg_staff(v_report.city_id), false) then
    raise exception 'Only NexG support and hospitality operations can resolve chat reports.' using errcode = '42501';
  end if;
  if v_report.status <> 'open' then
    raise exception 'This report is already resolved.' using errcode = '55000';
  end if;
  if p_outcome is null or p_outcome not in ('actioned', 'dismissed') then
    raise exception 'Choose actioned or dismissed.' using errcode = '22023';
  end if;
  if p_outcome = 'dismissed' and (coalesce(p_remove_message, false) or coalesce(p_remove_member, false)) then
    raise exception 'A dismissed report removes nothing.' using errcode = '22023';
  end if;
  if p_outcome = 'actioned' and v_note is null
     and not (coalesce(p_remove_message, false) or coalesce(p_remove_member, false)) then
    raise exception 'Say what you did, or remove the message or the member.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;

  if coalesce(p_remove_message, false) then
    if v_report.message_id is null then
      raise exception 'This report is about a person, not one message.' using errcode = '22023';
    end if;
    update public.msg_message
       set body = 'Removed by NexG', object_links = '[]'::jsonb, attachments = '[]'::jsonb,
           redacted_at = now(), redacted_by = authz.staff_id(),
           redaction_reason = 'Reported: ' || v_report.reason
     where id = v_report.message_id and redacted_at is null;
    v_message_removed := true;
  end if;

  if coalesce(p_remove_member, false) then
    if v_report.context <> 'trip_group' then
      raise exception 'Nobody can be removed from a stay chat.' using errcode = '22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('trip-group:' || v_report.conversation_id::text, 0));
    /* Someone who already left is marked removed too, so the link will not let them back. */
    update public.trip_group_member set status = 'removed'
     where group_id = v_report.conversation_id and user_id = v_report.reported_user_id and status <> 'removed'
    returning display_name, participant_id into v_name, v_part;
    if v_name is null then
      raise exception 'That person is no longer in the group.' using errcode = '22023';
    end if;
    update public.msg_participant set left_at = coalesce(left_at, now()) where id = v_part;
    perform authz.trip_group_say_about(v_report.conversation_id, v_part, 'NexG removed ' || v_name);
    v_member_removed := true;

    /* A group has one organiser and nobody to take over, so removing them closes it. */
    update public.trip_group
       set closed_at = now(), invite_revoked_at = coalesce(invite_revoked_at, now())
     where id = v_report.conversation_id and created_by = v_report.reported_user_id and closed_at is null;
    if found then
      update public.msg_conversation set status = 'closed' where id = v_report.conversation_id;
      perform authz.trip_group_say(v_report.conversation_id, 'NexG closed this group');
      v_group_closed := true;
    end if;
  end if;

  update public.chat_report
     set status = p_outcome, resolved_at = now(), resolved_by = authz.staff_id(), resolution_note = v_note,
         message_removed = v_message_removed, member_removed = v_member_removed
   where id = p_report_id;

  perform audit.log('staff'::public.actor_type, 'messaging', 'chat.report_resolved',
    p_actor_id => authz.staff_id(), p_target_type => 'chat_report', p_target_id => p_report_id,
    p_city_id => v_report.city_id,
    p_after => jsonb_build_object('outcome', p_outcome, 'conversation_id', v_report.conversation_id,
      'message_removed', v_message_removed, 'member_removed', v_member_removed, 'group_closed', v_group_closed),
    p_severity => 'notice'::public.audit_severity);

  return jsonb_build_object('ok', true, 'report_id', p_report_id, 'status', p_outcome,
    'message_removed', v_message_removed, 'member_removed', v_member_removed, 'group_closed', v_group_closed,
    'message', case when p_outcome = 'dismissed' then 'Report dismissed.' else 'Report resolved.' end);
end;
$$;

-- ═══════════════════════════════════════════════════ the host support functions stay out of groups

/* As 20270314000700, refusing trip groups too: they are written and read through rpc_trip_group_* only, which hold
   the closed, length and block rules. create or replace keeps the existing grants. */
create or replace function public.rpc_host_message_reply(
  p_conversation uuid,
  p_body text,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_participant public.msg_participant;
  v_existing public.msg_message;
  v_id uuid;
  v_seq bigint;
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'An empty message helps nobody.' using errcode = '22023';
  end if;

  select p.* into v_participant
    from public.msg_participant p
    join public.msg_conversation c on c.id = p.conversation_id
   where p.conversation_id = p_conversation
     and c.stay_id is null
     and c.kind <> 'group'
     and p.left_at is null
     and p.user_id is not null
     and p.user_id = v_uid
   limit 1;

  if not found then
    raise exception 'You are not in this conversation.' using errcode = '42501';
  end if;

  /* A repeat of the same key is the same message. Somebody on
     a bad connection pressing send twice must not send twice. */
  if p_idempotency_key is not null then
    select * into v_existing from public.msg_message
     where conversation_id = p_conversation and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'message_id', v_existing.id,
        'seq', v_existing.seq, 'repeat', true);
    end if;
  end if;

  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, visibility,
    channel_out, delivery, idempotency_key)
  values (
    p_conversation, 'text', v_participant.id, trim(p_body), 'external',
    'host_view', 'stored', p_idempotency_key)
  returning id, seq into v_id, v_seq;

  /* Reopen it: a host replying to something marked resolved is telling us it was not. */
  update public.msg_conversation
     set last_message_at = now(),
         last_external_message_at = now(),
         status = case when status in ('resolved', 'closed') then 'open' else status end,
         resolved_at = case when status in ('resolved', 'closed') then null else resolved_at end,
         first_response_due_at = case
           when status in ('resolved', 'closed') then now() + interval '2 hours'
           else first_response_due_at end
   where id = p_conversation;

  /* Their own message is not unread to them. */
  update public.msg_participant
     set last_read_seq = greatest(last_read_seq, v_seq)
   where id = v_participant.id;

  return jsonb_build_object('ok', true, 'message_id', v_id, 'seq', v_seq);
end;
$$;

/** Mark a host support thread read. Stay chats use rpc_stay_chat_*_read, trip groups rpc_trip_group_read. */
create or replace function public.rpc_host_message_read(p_conversation uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_max bigint;
begin
  if exists (
    select 1 from public.msg_conversation c
     where c.id = p_conversation and (c.stay_id is not null or c.kind = 'group')) then
    raise exception 'You are not in this conversation.' using errcode = '42501';
  end if;

  select max(seq) into v_max from public.msg_message
   where conversation_id = p_conversation and visibility = 'external';

  update public.msg_participant
     set last_read_seq = greatest(last_read_seq, coalesce(v_max, 0))
   where conversation_id = p_conversation
     and user_id is not null and user_id = v_uid;

  if not found then
    raise exception 'You are not in this conversation.' using errcode = '42501';
  end if;

  return jsonb_build_object('ok', true, 'read_to', coalesce(v_max, 0));
end;
$$;

-- ═══════════════════════════════════════════════════ stay chat lines stay readable

/* As 20270314001000, showing a system line whose name account deletion took out. */
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
          'body', case when k.redacted_at is null or k.kind = 'system' then k.body end,
          'redacted', k.redacted_at is not null and k.kind <> 'system',
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

-- ═══════════════════════════════════════════════════ account deletion

/* The organiser's account can go; the group and what was said in it stay. */
alter table public.trip_group drop constraint if exists trip_group_created_by_fkey;
alter table public.trip_group alter column created_by drop not null;
alter table public.trip_group add constraint trip_group_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

comment on column public.trip_group.created_by is
  'The organiser. Empty once they delete their account, which closes the group.';

/* As 20270116000200, with host sign-ins given their own reason. */
create or replace function public.fn_customer_deletion_blockers(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select g.id as guest_id from public.guest g where g.user_id = p_user_id and g.anonymised_at is null
  )
  select jsonb_strip_nulls(jsonb_build_object(
    'active_order', case when exists (
        select 1 from public."order" o join me on o.guest_id = me.guest_id
         where o.stage in ('placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving', 'disputed')
           /* An order never paid for, still waiting at 'placed', is cancelled with the account. */
           and not (o.stage = 'placed' and o.payment_status in ('pending', 'failed'))
      ) then 'You have an order in progress. You can delete your account once it is delivered or cancelled.' end,
    'unsettled_payment', case when exists (
        select 1 from public."order" o join me on o.guest_id = me.guest_id
         where o.payment_status = 'authorised' and o.stage not in ('cancelled', 'refunded')
      ) or exists (
        select 1 from public.payment p join me on p.guest_id = me.guest_id
         where p.state in ('pending', 'authorised') and p.created_at > now() - interval '30 minutes'
      ) then 'A payment is still being processed. Try again in a few minutes.' end,
    'pending_refund', case when exists (
        select 1 from public.refund r join public."order" o on o.id = r.order_id join me on o.guest_id = me.guest_id
         where r.status in ('requested', 'awaiting_approval', 'approved')
      ) then 'A refund to you is still on its way. You can delete your account once it has been paid.' end,
    'upcoming_booking', case when exists (
        select 1 from public.booking b
         where b.guest_user_id = p_user_id and b.status in ('pending', 'confirmed') and b.ends_at > now()
      ) then 'You have an upcoming booking. Cancel it or wait until it has passed.' end,
    'upcoming_stay', case when exists (
        select 1 from public.stay st
         where st.guest_user_id = p_user_id and st.status in ('held', 'booked', 'in_stay') and st.check_out > now()
      ) then 'You have an upcoming stay. Cancel it or wait until you have checked out.' end,
    'open_dispute', case when exists (
        select 1 from public.dispute d
         where d.guest_user_id = p_user_id and d.status in ('open', 'awaiting_merchant')
      ) then 'An open dispute or refund must close first.' end,
    /* Listings, bookings and payouts would lose their owner, so support closes these. */
    'host_account', case when exists (select 1 from public.host_user h where h.user_id = p_user_id)
      then 'This sign-in manages a host account, so it can''t be deleted here: its listings, bookings and payouts have to be closed first. Email derrick@nexgapp.com from your account''s email address and NexG support will close it.'
      end,
    /* These sign-ins own business records, or records with no delete rule. */
    'business_account', case when exists (select 1 from public.staff_user s where s.user_id = p_user_id)
        or exists (select 1 from public.merchant_user mu where mu.user_id = p_user_id)
        or exists (select 1 from public.rider r where r.user_id = p_user_id)
        or exists (select 1 from public.hotel_user h where h.user_id = p_user_id)
        or exists (select 1 from public.experience_partner e where e.portal_user_id = p_user_id)
        or exists (select 1 from public.merchant_application_submission a where a.submitted_by = p_user_id)
        or exists (select 1 from public.merchant_application_operation a where a.actor_id = p_user_id)
        or exists (select 1 from public.merchant_application_payout a where a.declared_by = p_user_id)
        or exists (select 1 from public.connector_connection_consent cc where cc.agreed_by = p_user_id)
        or exists (select 1 from public.feature_flag f where f.updated_by = p_user_id)
      then 'This sign-in is also used for a business, rider, host or staff account. Contact NexG support to close it.' end
  ))
$$;
revoke execute on function public.fn_customer_deletion_blockers(uuid) from public, anon, authenticated;

/* As 20270116000200, saying that chat messages and safety reports are kept. */
create or replace function public.rpc_my_account_deletion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_blockers jsonb;
  v_request public.data_request;
begin
  if v_me is null then
    raise exception 'Sign in to manage your account.' using errcode = '42501';
  end if;
  v_blockers := public.fn_customer_deletion_blockers(v_me);
  select dr.* into v_request from public.data_request dr
    left join public.guest g on g.id = dr.guest_id
   where dr.kind = 'erasure'
     and (g.user_id = v_me or dr.requester_email = (select u.email from auth.users u where u.id = v_me))
   order by dr.received_at desc limit 1;
  return jsonb_build_object(
    'eligible', v_blockers = '{}'::jsonb,
    'blockers', v_blockers,
    'deleted', jsonb_build_array(
      'Your sign-in, so you can no longer sign in with it',
      'Your name and phone number on your customer record',
      'Your saved places and delivery addresses',
      'Your saved items, preferences and notifications',
      'Delivery addresses and notes on your past orders',
      'Orders you placed but never paid for'),
    'kept', jsonb_build_array(
      'Receipts and payment records, for 7 years as Kenyan tax law requires, with your name, phone and addresses removed',
      'Reviews you wrote, shown without your name',
      'Support conversations, without your sign-in',
      'Messages you sent in trip groups and stay chats, shown as from a former member. Trip groups you run are closed',
      'Safety reports you sent, or that were sent about your messages'),
    'retention', 'Receipts and payment records are kept for 7 years, as Kenyan tax law requires, with your name, phone and addresses removed. Chat messages and safety reports are kept without your sign-in. Everything else is deleted.',
    'request', case when v_request.id is null then null else jsonb_build_object(
      'id', v_request.id, 'status', v_request.status, 'received_at', v_request.received_at,
      'fulfilled_at', v_request.fulfilled_at) end
  );
end;
$$;
revoke execute on function public.rpc_my_account_deletion() from public, anon;
grant execute on function public.rpc_my_account_deletion() to authenticated;

/* What leaving takes out of chats. Only the deletion request calls it. */
create or replace function authz.account_deletion_leave_chats(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group record;
  v_closed integer := 0;
begin
  for v_group in
    select g.id from public.trip_group g where g.created_by = p_user and g.closed_at is null order by g.id
  loop
    update public.trip_group set closed_at = now(), invite_revoked_at = coalesce(invite_revoked_at, now())
     where id = v_group.id;
    update public.msg_conversation set status = 'closed' where id = v_group.id;
    perform authz.trip_group_say(v_group.id, 'The organiser deleted their account, so this group is closed');
    v_closed := v_closed + 1;
  end loop;

  /* Lines naming them (joined, left, removed, asked NexG to help). A stored body only changes as a redaction. Their
     own `guest` rows only: a host member's line carries the host's name. */
  update public.msg_message m
     set body = case
           when m.body like '% joined' then 'Former member joined'
           when m.body like '% left' then 'Former member left'
           when m.body like '% was removed' then 'Former member was removed'
           when m.body like '% asked NexG to help.' then 'Former member asked NexG to help.'
           else 'NexG removed Former member' end,
         redacted_at = coalesce(m.redacted_at, now()),
         redaction_reason = coalesce(m.redaction_reason, 'Account deleted')
    from public.msg_participant p
    join public.msg_conversation c on c.id = p.conversation_id
   where m.author_participant_id = p.id and m.kind = 'system'
     and p.user_id = p_user and p.kind = 'guest' and (c.kind = 'group' or c.stay_id is not null)
     and m.body like any (array['% joined', '% left', '% was removed', '% asked NexG to help.', 'NexG removed %']);

  /* Their stays are over (an upcoming one blocks deletion). The stay chat's header and the host read this name. */
  update public.stay set guest_first_name = 'Former member' where guest_user_id = p_user;

  /* Blocks of them stay, so their messages stay hidden, without their name. */
  update public.user_block set blocked_name = 'Former member' where blocked_user_id = p_user;

  /* Group and stay chat messages stay; the name on them does not. */
  update public.msg_participant p
     set display_name = 'Former member', left_at = coalesce(p.left_at, now())
    from public.msg_conversation c
   where c.id = p.conversation_id and p.user_id = p_user and (c.kind = 'group' or c.stay_id is not null);

  return v_closed;
end;
$$;
revoke all on function authz.account_deletion_leave_chats(uuid) from public, anon, authenticated;

/* As 20270116000200, leaving the chats before the sign-in goes. */
create or replace function public.rpc_my_account_deletion_request()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_email text;
  v_guest uuid;
  v_blockers jsonb;
  v_request public.data_request;
  v_cancelled integer := 0;
  v_groups integer := 0;
begin
  if v_me is null then
    raise exception 'Sign in to delete your account.' using errcode = '42501';
  end if;
  select u.email into v_email from auth.users u where u.id = v_me;
  select g.id into v_guest from public.guest g where g.user_id = v_me and g.anonymised_at is null;

  v_blockers := public.fn_customer_deletion_blockers(v_me);
  if v_blockers <> '{}'::jsonb then
    raise exception '%', (select string_agg(value #>> '{}', ' ') from jsonb_each(v_blockers))
      using errcode = 'check_violation';
  end if;

  insert into public.data_request (guest_id, requester_email, kind, status, channel,
    identity_verified_at, identity_method, blocking_reasons)
  values (v_guest, v_email, 'erasure', 'in_progress', 'app', now(), 'signed_in', '{}'::jsonb)
  returning * into v_request;

  if v_guest is not null then
    /* Orders never paid for go with the account. */
    with gone as (
      update public."order"
         set stage = 'cancelled', cancelled_at = now(), cancel_reason_code = 'account_deleted'
       where guest_id = v_guest and stage = 'placed' and payment_status in ('pending', 'failed')
      returning id)
    insert into public.order_event (order_id, kind, title, actor_type)
    select id, 'cancelled', 'Cancelled: the customer deleted their account', 'system' from gone;
    get diagnostics v_cancelled = row_count;

    delete from public.guest_place where guest_id = v_guest;
    /* Orders stay (finance), without where they went or the customer's words about it. */
    update public."order"
       set dropoff_note = null, dropoff_point = null,
           dropoff_label = 'Removed at the customer''s request'
     where guest_id = v_guest;
    perform public.fn_anonymise_guest(v_guest);
  end if;

  v_groups := authz.account_deletion_leave_chats(v_me);
  /* A document accepted as a person must name them (legal_acceptance_has_one_subject), so it goes with them. */
  delete from public.legal_acceptance where user_id = v_me;

  update public.data_request set status = 'fulfilled', fulfilled_at = now(), requester_email = null
   where id = v_request.id returning * into v_request;

  perform audit.log('guest'::public.actor_type, 'support', 'account.deleted_by_customer',
    p_actor_id => v_me, p_target_type => 'data_request', p_target_id => v_request.id,
    p_after => jsonb_build_object('guest_anonymised', v_guest is not null,
                                  'unpaid_orders_cancelled', v_cancelled,
                                  'trip_groups_closed', v_groups),
    p_severity => 'high'::public.audit_severity);

  /* Last: the sign-in itself. Saved items, preferences, notifications, their own block list, group membership and
     push subscriptions cascade; bookings, disputes, reviews, tickets, groups and reports keep their history with the
     link set to null. */
  delete from auth.users where id = v_me;

  return jsonb_build_object('ok', true, 'request_id', v_request.id, 'status', 'fulfilled');
end;
$$;
revoke execute on function public.rpc_my_account_deletion_request() from public, anon;
grant execute on function public.rpc_my_account_deletion_request() to authenticated;

-- ═══════════════════════════════════════════════════ a DPA record outlives its signer's account

/* As 20270327000100, allowing accepted_by to empty. */
create or replace function public.tg_merchant_dpa_acceptance_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  /* accepted_by empties when that sign-in is deleted (its foreign key). account_email stays on the record. */
  if old.accepted_by is not null and new.accepted_by is null
     and (to_jsonb(new) - 'accepted_by') = (to_jsonb(old) - 'accepted_by') then
    return new;
  end if;
  if old.storage_path is null and new.storage_path is not null
     and (to_jsonb(new) - array['storage_path', 'sha256', 'bytes', 'pages', 'render_version',
                                'signer_id', 'signed_by', 'copy_stored_at'])
       = (to_jsonb(old) - array['storage_path', 'sha256', 'bytes', 'pages', 'render_version',
                                'signer_id', 'signed_by', 'copy_stored_at']) then
    return new;
  end if;
  raise exception 'A DPA acceptance is never changed; its signed copy is attached once.'
    using errcode = '42501';
end;
$$;

-- ═══════════════════════════════════════════════════ who may call what

revoke execute on function
  public.rpc_chat_block(uuid, uuid),
  public.rpc_chat_unblock(uuid),
  public.rpc_chat_blocked(),
  public.rpc_chat_report(uuid, text, uuid, uuid, text),
  public.rpc_chat_reports(text, integer),
  public.rpc_chat_report_resolve(uuid, text, text, boolean, boolean)
from public, anon;

grant execute on function
  public.rpc_chat_block(uuid, uuid),
  public.rpc_chat_unblock(uuid),
  public.rpc_chat_blocked(),
  public.rpc_chat_report(uuid, text, uuid, uuid, text),
  public.rpc_chat_reports(text, integer),
  public.rpc_chat_report_resolve(uuid, text, text, boolean, boolean)
to authenticated;

-- ═══════════════════════════════════════════════════ accounted for

insert into audit.action_registry (action, module, default_severity, needs_review, description) values
  ('chat.reported', 'messaging', 'notice', true, 'Somebody reported a message or a person in a trip group or stay chat'),
  ('chat.report_resolved', 'messaging', 'notice', false, 'A NexG staff member dismissed or acted on a chat report'),
  ('chat.user_blocked', 'messaging', 'info', false, 'A member blocked another member of a trip group'),
  ('chat.user_unblocked', 'messaging', 'info', false, 'A person unblocked somebody they had blocked')
on conflict (action) do nothing;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_chat_blocked', 'Read only: the caller''s own block list', 'user_block'),
  ('rpc_chat_reports', 'Read only: the reports staff are asked to review', 'chat_report')
on conflict (function_name) do nothing;

comment on function public.rpc_chat_report(uuid, text, uuid, uuid, text) is
  'Report a message or a person in a trip group or stay chat the caller belongs to. Keeps the reported words; 20 a day.';
comment on function public.rpc_chat_block(uuid, uuid) is
  'Block a member of a trip group: their messages, cards, unread count and push no longer reach the caller. Not offered in stay chats.';
comment on function public.rpc_chat_report_resolve(uuid, text, text, boolean, boolean) is
  'Staff dismiss or act on a chat report: remove the message, remove the member (closing a group they run), or note what was done.';
