-- Trip groups: people talk about stays, experiences and plans together (owner, 24 Nov 2026: "groups where people
-- talk about stays, experiences or plans").
--
-- Built on the one conversation model (20260101016500) and the stay-chat pattern (20270314000700, which must land
-- first: this reuses its push subject 'conversation'). A group is a `msg_conversation` of kind 'group'. Its id IS the
-- conversation's id. Members are `guest` participants by user id, so the tables' own policies let a member read
-- and nobody else. Every write goes through the rpc_trip_group_* functions below.
--
-- The people:
--   * Who can make a group: anyone with a real account (a temporary guest session is refused, as in Order together).
--     At most 10 open groups per organiser. The organiser is the only admin.
--   * Who can join: anyone with a real account and the invite link. At most 20 members.
--   * The link: 18 random bytes shown once, only its sha256 kept (as Order together and caretaker links). It works
--     for 7 days. The organiser makes a new link to replace it (the old one stops at once) or turns it off. Closing
--     the group turns it off. A member leaving does not change the link.
--   * Removed people: the organiser can remove a member. They lose access at once (their participant row is marked
--     left, the group leaves their list) and the link will not let them back. Someone who left on their own can rejoin
--     with a working link.
--   * Hosts and NexG staff are not in groups. A host cannot see or join a group about their property; a group is
--     friends talking. No staff role is a member. (The existing rule that a super admin can read any conversation
--     through authz.msg_sees_internal still applies, as for every conversation; it is not widened here.)
--   * What a member sees: the group's name, the members' first names, messages in order, and shared cards: a stay, an
--     experience, a trip plan or a "pay together" note. A removed member sees none of it.
--   * Shared cards carry a title and a short summary the sender wrote and the id of the thing; the app opens the live
--     listing from the id. A plan is a snapshot of the plan's text, at most 8,000 characters.
--
-- Notifications: the phone push queue (native_push.enqueue, subject 'conversation', stage 'group_message'). Its words
-- are fixed in the native-push-dispatch edge function and never carry the message text. A muted member gets none.
--
-- Not here: payments of any kind (split pay is parked until after the Apple launch), staff in groups, files or
-- photos in messages.
--
-- Rollback: drop the rpc_trip_group_* functions and authz.trip_group_* helpers, drop tables public.trip_group_member
-- and public.trip_group, delete the msg_conversation rows of kind 'group' and their messages and participants only if
-- no one needs them, remove the stage from native-push-dispatch, delete the audit.action_registry and
-- wiring_audit_exempt rows added below.

-- ═══════════════════════════════════════════════════ the group and its members

create table public.trip_group (
  /* The conversation's own id. */
  id uuid primary key references public.msg_conversation (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid not null references auth.users (id) on delete restrict,
  /* sha256 of the link's token. Never the token. */
  invite_token_hash text unique,
  invite_expires_at timestamptz,
  invite_revoked_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index trip_group_creator_idx on public.trip_group (created_by) where closed_at is null;

create table public.trip_group_member (
  group_id uuid not null references public.trip_group (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  participant_id uuid references public.msg_participant (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index trip_group_member_user_idx on public.trip_group_member (user_id) where status = 'active';

comment on table public.trip_group is
  'A trip group: one conversation of kind group. Written only through rpc_trip_group_*. The link is kept as a hash.';
comment on table public.trip_group_member is
  'Who is in a trip group, and who was removed (a removed person cannot rejoin by the link).';

alter table public.trip_group enable row level security;
alter table public.trip_group_member enable row level security;
revoke all on public.trip_group, public.trip_group_member from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ push words

/* The push queue's subject 'conversation' comes from stay chat (20270314000700). Stage words live in the edge function. */

-- ═══════════════════════════════════════════════════ helpers (not callable by apps)

/* The caller's active participant row in a group, or an error that says nothing about whether the group exists. */
create or replace function authz.trip_group_me(p_group uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_p uuid;
begin
  select m.participant_id into v_p
    from public.trip_group_member m
   where m.group_id = p_group and m.user_id = (select auth.uid()) and m.status = 'active';
  if v_p is null then
    raise exception 'This group is unavailable.' using errcode = '42501';
  end if;
  return v_p;
end;
$$;

create or replace function authz.trip_group_is_admin(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.trip_group g
                  where g.id = p_group and g.created_by = (select auth.uid()))
$$;

/* A real account: signed in and not a temporary session. */
create or replace function authz.trip_group_real_account()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or authz.is_anonymous_session() then
    raise exception 'Sign in with your account to use groups.' using errcode = '42501';
  end if;
end;
$$;

create or replace function authz.trip_group_clean_name(p_name text, p_max integer, p_what text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare v text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if v = '' or char_length(v) > p_max then
    raise exception 'Give %, up to % characters.', p_what, p_max using errcode = '22023';
  end if;
  return v;
end;
$$;

/* A system line ("Amina joined"). No author, shown to everyone in the group. */
create or replace function authz.trip_group_say(p_group uuid, p_text text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.msg_message (conversation_id, kind, body, visibility, channel_out, delivery)
  values (p_group, 'system', p_text, 'external', 'guest_app', 'stored')
$$;

/* One group as the app reads it, from the caller's side. */
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
    'is_admin', g.created_by = (select auth.uid()),
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
       order by m.seq desc limit 1),
    'unread', (
      select count(*)::int from public.msg_message m
        join public.msg_participant a on a.id = m.author_participant_id
       where m.conversation_id = g.id and m.visibility = 'external' and m.kind in ('text', 'link')
         and a.user_id is distinct from (select auth.uid())
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

/* A page of messages, oldest first, with the seq to ask for before to get the earlier page. */
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
          'body', case when k.redacted_at is null then k.body end,
          'redacted', k.redacted_at is not null,
          'links', case when k.redacted_at is null then k.object_links else '[]'::jsonb end,
          'at', k.created_at,
          'mine', coalesce(k.user_id = (select auth.uid()), false),
          'author', k.display_name) order by k.seq)
        from kept k), '[]'::jsonb),
    'earlier_before', case
      when (select count(*) from page) > (select count(*) from kept) then (select min(seq) from kept) end)
$$;

/* Store one message once per idempotency key, then ring the other active members (never fails the message). */
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
  if p_idempotency_key is not null and length(p_idempotency_key) not between 1 and 200 then
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

/* Put a person in a group (or back in, after they left). The caller has already checked they may join. */
create or replace function authz.trip_group_add(p_group uuid, p_user uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_part uuid;
begin
  select m.participant_id into v_part from public.trip_group_member m
   where m.group_id = p_group and m.user_id = p_user;
  if v_part is null then
    insert into public.msg_participant (
      conversation_id, kind, user_id, display_name, role_label, can_see_internal, can_reply_external)
    values (p_group, 'guest', p_user, p_name,
            case when p_user = (select g.created_by from public.trip_group g where g.id = p_group)
                 then 'Organiser' else 'Member' end, false, true)
    returning id into v_part;
    insert into public.trip_group_member (group_id, user_id, display_name, status, participant_id)
    values (p_group, p_user, p_name, 'active', v_part)
    on conflict (group_id, user_id) do update
      set status = 'active', display_name = excluded.display_name, participant_id = excluded.participant_id,
          joined_at = now();
  else
    update public.msg_participant set left_at = null, display_name = p_name where id = v_part;
    update public.trip_group_member set status = 'active', display_name = p_name, joined_at = now()
     where group_id = p_group and user_id = p_user;
  end if;
end;
$$;

/* Make a link: 18 random bytes, 7 days. Returns the token, which is not kept anywhere. */
create or replace function authz.trip_group_new_link(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text := encode(extensions.gen_random_bytes(18), 'hex');
begin
  update public.trip_group
     set invite_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
         invite_expires_at = now() + interval '7 days',
         invite_revoked_at = null
   where id = p_group;
  return v_token;
end;
$$;

revoke all on function
  authz.trip_group_me(uuid), authz.trip_group_is_admin(uuid), authz.trip_group_real_account(),
  authz.trip_group_clean_name(text, integer, text), authz.trip_group_say(uuid, text),
  authz.trip_group_thread(uuid), authz.trip_group_page(uuid, bigint, integer),
  authz.trip_group_post(uuid, public.msg_message_kind, text, jsonb, text),
  authz.trip_group_add(uuid, uuid, text), authz.trip_group_new_link(uuid)
from public, anon, authenticated;

-- ═══════════════════════════════════════════════════ make, link, join

/** Start a group. The caller is its organiser and first member. Returns the group and its link (shown once). */
create or replace function public.rpc_trip_group_create(p_name text, p_my_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text;
  v_me text;
  v_conv uuid;
  v_token text;
begin
  perform authz.trip_group_real_account();
  v_name := authz.trip_group_clean_name(p_name, 60, 'the group a name');
  v_me := authz.trip_group_clean_name(p_my_name, 40, 'your first name');

  perform pg_advisory_xact_lock(hashtextextended('trip-group-create:' || v_uid::text, 0));
  if (select count(*) from public.trip_group g where g.created_by = v_uid and g.closed_at is null) >= 10 then
    raise exception 'You already run 10 groups. Close one to start another.' using errcode = '22023';
  end if;

  insert into public.msg_conversation (kind, subject, origin_channel, current_channel, owner_team)
  values ('group', 'Trip group · ' || v_name, 'guest_app', 'guest_app', 'guests')
  returning id into v_conv;

  insert into public.trip_group (id, name, created_by) values (v_conv, v_name, v_uid);
  perform authz.trip_group_add(v_conv, v_uid, v_me);
  v_token := authz.trip_group_new_link(v_conv);

  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.created',
    p_actor_id => v_uid, p_target_type => 'conversation', p_target_id => v_conv,
    p_after => jsonb_build_object('name', v_name));

  return jsonb_build_object('ok', true, 'group_id', v_conv, 'invite_token', v_token,
    'thread', authz.trip_group_thread(v_conv));
end;
$$;

/** Organiser only: a new link. The old one stops working at once. Returns the token once. */
create or replace function public.rpc_trip_group_invite(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_token text;
begin
  perform authz.trip_group_me(p_group_id);
  if not authz.trip_group_is_admin(p_group_id) then
    raise exception 'Only the organiser can make a new link.' using errcode = '42501';
  end if;
  if (select g.closed_at from public.trip_group g where g.id = p_group_id) is not null then
    raise exception 'This group is closed.' using errcode = '55000';
  end if;
  v_token := authz.trip_group_new_link(p_group_id);
  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.invite_made',
    p_actor_id => (select auth.uid()), p_target_type => 'conversation', p_target_id => p_group_id);
  return jsonb_build_object('ok', true, 'invite_token', v_token,
    'expires_at', (select g.invite_expires_at from public.trip_group g where g.id = p_group_id));
end;
$$;

/** Organiser only: turn the link off. */
create or replace function public.rpc_trip_group_invite_revoke(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform authz.trip_group_me(p_group_id);
  if not authz.trip_group_is_admin(p_group_id) then
    raise exception 'Only the organiser can turn the link off.' using errcode = '42501';
  end if;
  update public.trip_group set invite_revoked_at = now() where id = p_group_id;
  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.invite_revoked',
    p_actor_id => (select auth.uid()), p_target_type => 'conversation', p_target_id => p_group_id);
  return jsonb_build_object('ok', true);
end;
$$;

/* The group a working link points at, or null. One answer for every way a link can fail. */
create or replace function authz.trip_group_for_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id from public.trip_group g
   where p_token is not null and length(p_token) = 36
     and g.invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and g.invite_revoked_at is null and g.closed_at is null and g.invite_expires_at > now()
$$;

revoke all on function authz.trip_group_for_token(text) from public, anon, authenticated;

/** What a link shows before joining: the group's name, how many are in it and who runs it. Nothing else. */
create or replace function public.rpc_trip_group_preview(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_group uuid;
begin
  perform authz.trip_group_real_account();
  v_group := authz.trip_group_for_token(p_token);
  if v_group is null then
    raise exception 'This invite link no longer works.' using errcode = '22023';
  end if;
  return (
    select jsonb_build_object('name', g.name,
      'members', (select count(*)::int from public.trip_group_member m where m.group_id = g.id and m.status = 'active'),
      'organiser', (select m.display_name from public.trip_group_member m
                     where m.group_id = g.id and m.user_id = g.created_by),
      'full', (select count(*) from public.trip_group_member m where m.group_id = g.id and m.status = 'active') >= 20,
      'already_in', exists (select 1 from public.trip_group_member m
                             where m.group_id = g.id and m.user_id = (select auth.uid()) and m.status = 'active'))
      from public.trip_group g where g.id = v_group);
end;
$$;

/** Join by link. */
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
  perform authz.trip_group_say(v_group, v_me || ' joined');
  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.joined',
    p_actor_id => v_uid, p_target_type => 'conversation', p_target_id => v_group);

  return jsonb_build_object('ok', true, 'group_id', v_group, 'joined', true,
    'thread', authz.trip_group_thread(v_group));
end;
$$;

-- ═══════════════════════════════════════════════════ read and write messages

/** The caller's groups, newest activity first. */
create or replace function public.rpc_trip_group_list(p_limit integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('groups', coalesce(jsonb_agg(t.thread order by t.at desc nulls last, t.id), '[]'::jsonb))
    from (
      select g.id, coalesce(c.last_message_at, c.created_at) as at, authz.trip_group_thread(g.id) as thread
        from public.trip_group_member m
        join public.trip_group g on g.id = m.group_id
        join public.msg_conversation c on c.id = g.id
       where (select auth.uid()) is not null
         and m.user_id = (select auth.uid()) and m.status = 'active'
       order by coalesce(c.last_message_at, c.created_at) desc nulls last, g.id
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) t
$$;

/** One group and a page of its messages. */
create or replace function public.rpc_trip_group_messages(
  p_group_id uuid, p_before bigint default null, p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform authz.trip_group_me(p_group_id);
  return jsonb_build_object('thread', authz.trip_group_thread(p_group_id))
    || authz.trip_group_page(p_group_id, p_before, p_limit);
end;
$$;

/** Who is in the group: first names only. */
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
    select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', m.display_name,
        'organiser', m.user_id = g.created_by, 'me', m.user_id = (select auth.uid()))
        order by (m.user_id = g.created_by) desc, m.joined_at)
      from public.trip_group_member m join public.trip_group g on g.id = m.group_id
     where m.group_id = p_group_id and m.status = 'active'), '[]'::jsonb));
end;
$$;

/** Send a message. The same idempotency key twice stores it once. */
create or replace function public.rpc_trip_group_send(
  p_group_id uuid, p_body text, p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_body text := trim(coalesce(p_body, ''));
begin
  perform authz.trip_group_me(p_group_id);
  if v_body = '' then
    raise exception 'Write a message first.' using errcode = '22023';
  end if;
  if length(v_body) > 4000 then
    raise exception 'Keep a message under 4,000 characters.' using errcode = '22023';
  end if;
  return authz.trip_group_post(p_group_id, 'text', v_body, null, p_idempotency_key);
end;
$$;

/**
 * Share a stay, an experience or a trip plan into the group, with an optional note.
 * p_kind: stay | experience | plan. p_ref: the id of the thing (text). p_snapshot: a plan's text, plans only.
 */
create or replace function public.rpc_trip_group_share(
  p_group_id uuid, p_kind text, p_ref text, p_title text, p_summary text default null,
  p_note text default null, p_snapshot jsonb default null, p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_title text := trim(coalesce(p_title, ''));
  v_summary text := nullif(trim(coalesce(p_summary, '')), '');
  v_ref text := trim(coalesce(p_ref, ''));
  v_link jsonb;
begin
  perform authz.trip_group_me(p_group_id);
  if p_kind is null or p_kind not in ('stay', 'experience', 'plan') then
    raise exception 'Share a stay, an experience or a plan.' using errcode = '22023';
  end if;
  if v_ref = '' or length(v_ref) > 120 then
    raise exception 'That can''t be shared.' using errcode = '22023';
  end if;
  if v_title = '' or length(v_title) > 120 or length(coalesce(v_summary, '')) > 240 then
    raise exception 'Give a title up to 120 characters and a summary up to 240.' using errcode = '22023';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;
  if p_snapshot is not null and (p_kind <> 'plan' or length(p_snapshot::text) > 8000) then
    raise exception 'Only a plan can carry its text, up to 8,000 characters.' using errcode = '22023';
  end if;

  v_link := jsonb_strip_nulls(jsonb_build_object('type', p_kind, 'id', v_ref, 'title', v_title,
    'summary', v_summary, 'snapshot', p_snapshot));
  return authz.trip_group_post(p_group_id, 'link', v_note, jsonb_build_array(v_link), p_idempotency_key);
end;
$$;

/** Mark the group read up to its last message. */
create or replace function public.rpc_trip_group_read(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.trip_group_me(p_group_id);
  v_max bigint;
begin
  select coalesce(max(seq), 0) into v_max from public.msg_message
   where conversation_id = p_group_id and visibility = 'external';
  update public.msg_participant set last_read_seq = greatest(last_read_seq, v_max) where id = v_me;
  return jsonb_build_object('ok', true, 'group_id', p_group_id, 'read_to', v_max);
end;
$$;

/** Mute or unmute push for this group, for the caller only. */
create or replace function public.rpc_trip_group_mute(p_group_id uuid, p_muted boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := authz.trip_group_me(p_group_id);
begin
  update public.msg_participant set muted = coalesce(p_muted, false) where id = v_me;
  return jsonb_build_object('ok', true, 'muted', coalesce(p_muted, false));
end;
$$;

-- ═══════════════════════════════════════════════════ leave, remove, close

/** Leave. The organiser can't (remove the others or close the group). The caller can rejoin with a working link. */
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
  perform authz.trip_group_say(p_group_id, v_name || ' left');
  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.left',
    p_actor_id => v_uid, p_target_type => 'conversation', p_target_id => p_group_id);
  return jsonb_build_object('ok', true);
end;
$$;

/** Organiser only: remove a member. They lose access at once and the link will not let them back. */
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
  perform authz.trip_group_say(p_group_id, v_name || ' was removed');
  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.removed',
    p_actor_id => (select auth.uid()), p_target_type => 'conversation', p_target_id => p_group_id,
    p_after => jsonb_build_object('user_id', p_user_id));
  return jsonb_build_object('ok', true);
end;
$$;

/** Organiser only: close the group. Everyone can still read it; nobody can write; the link stops. */
create or replace function public.rpc_trip_group_close(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform authz.trip_group_me(p_group_id);
  if not authz.trip_group_is_admin(p_group_id) then
    raise exception 'Only the organiser can close the group.' using errcode = '42501';
  end if;
  update public.trip_group set closed_at = coalesce(closed_at, now()), invite_revoked_at = coalesce(invite_revoked_at, now())
   where id = p_group_id;
  update public.msg_conversation set status = 'closed' where id = p_group_id;
  perform authz.trip_group_say(p_group_id, 'The organiser closed this group');
  perform audit.log('guest'::public.actor_type, 'messaging', 'trip_group.closed',
    p_actor_id => (select auth.uid()), p_target_type => 'conversation', p_target_id => p_group_id);
  return jsonb_build_object('ok', true);
end;
$$;

-- ═══════════════════════════════════════════════════ who may call what

revoke execute on function
  public.rpc_trip_group_create(text, text),
  public.rpc_trip_group_invite(uuid),
  public.rpc_trip_group_invite_revoke(uuid),
  public.rpc_trip_group_preview(text),
  public.rpc_trip_group_join(text, text),
  public.rpc_trip_group_list(integer),
  public.rpc_trip_group_messages(uuid, bigint, integer),
  public.rpc_trip_group_members(uuid),
  public.rpc_trip_group_send(uuid, text, text),
  public.rpc_trip_group_share(uuid, text, text, text, text, text, jsonb, text),
  public.rpc_trip_group_read(uuid),
  public.rpc_trip_group_mute(uuid, boolean),
  public.rpc_trip_group_leave(uuid),
  public.rpc_trip_group_remove(uuid, uuid),
  public.rpc_trip_group_close(uuid)
from public, anon;

grant execute on function
  public.rpc_trip_group_create(text, text),
  public.rpc_trip_group_invite(uuid),
  public.rpc_trip_group_invite_revoke(uuid),
  public.rpc_trip_group_preview(text),
  public.rpc_trip_group_join(text, text),
  public.rpc_trip_group_list(integer),
  public.rpc_trip_group_messages(uuid, bigint, integer),
  public.rpc_trip_group_members(uuid),
  public.rpc_trip_group_send(uuid, text, text),
  public.rpc_trip_group_share(uuid, text, text, text, text, text, jsonb, text),
  public.rpc_trip_group_read(uuid),
  public.rpc_trip_group_mute(uuid, boolean),
  public.rpc_trip_group_leave(uuid),
  public.rpc_trip_group_remove(uuid, uuid),
  public.rpc_trip_group_close(uuid)
to authenticated;

-- ═══════════════════════════════════════════════════ accounted for

insert into audit.action_registry (action, module, description) values
  ('trip_group.created', 'messaging', 'A guest started a trip group'),
  ('trip_group.joined', 'messaging', 'Somebody joined a trip group by its link'),
  ('trip_group.left', 'messaging', 'A member left a trip group'),
  ('trip_group.removed', 'messaging', 'The organiser removed a member from a trip group'),
  ('trip_group.closed', 'messaging', 'The organiser closed a trip group'),
  ('trip_group.invite_made', 'messaging', 'The organiser made a new link for a trip group; the old one stopped'),
  ('trip_group.invite_revoked', 'messaging', 'The organiser turned a trip group''s link off')
on conflict (action) do nothing;

insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_trip_group_send', 'Auditing every line of a conversation is volume without accountability',
   'msg_message, append-only with its author participant'),
  ('rpc_trip_group_share', 'Auditing every line of a conversation is volume without accountability',
   'msg_message, append-only with its author participant'),
  ('rpc_trip_group_read', 'Marking a group read is not a state change anybody is accountable for',
   'msg_participant.last_read_seq'),
  ('rpc_trip_group_mute', 'Muting is the caller''s own notification preference',
   'msg_participant.muted'),
  ('rpc_trip_group_list', 'Read only', 'none'),
  ('rpc_trip_group_messages', 'Read only', 'none'),
  ('rpc_trip_group_members', 'Read only', 'none'),
  ('rpc_trip_group_preview', 'Read only', 'none')
on conflict (function_name) do nothing;

comment on function public.rpc_trip_group_create(text, text) is
  'Start a trip group with the caller as organiser. Real accounts only. Returns the invite token once; only its hash is kept.';
comment on function public.rpc_trip_group_join(text, text) is
  'Join a trip group by its link. Real accounts only. A removed member cannot rejoin; a full group, an expired, turned-off or replaced link is refused.';
