-- A host can write to us, and we can write back.
--
-- "Write to us" pointed at `/help/contact?from=host`, which is
-- the public contact form and does not exist at that path — so
-- the one button a host presses when something is wrong gave
-- them a 404.
--
-- The conversation model was already here and already had
-- everything needed: `host_user` is a participant kind,
-- `host_view` is a channel, and the routing rules know which
-- team owns which topic. What was missing is that a host could
-- not actually use it. `rpc_msg_send` matches a participant by
-- `staff_user_id` or `guest_id` only, and a host joins a
-- conversation by `user_id` — so a host could be put in a
-- thread, could read it, and could not reply to it.
--
-- Two RPCs rather than one: starting a conversation and adding
-- to one are different permissions. Anybody on the host account
-- may start one; only somebody already in a thread may add to
-- it, and that check is the reason this is not one function
-- with a nullable conversation id.

/**
 * Open a thread with NexG.
 *
 * Routed by topic through the same `fn_msg_route` the public
 * contact form uses, so a host's message lands in the same
 * queue, in the same order, under the same clock as everybody
 * else's. A separate "host inbox" would be a queue somebody
 * forgets to watch.
 */
create or replace function public.rpc_host_message_start(
  p_host_id uuid,
  p_topic public.msg_topic,
  p_subject text,
  p_body text,
  p_object_type text default null,
  p_object_id uuid default null,
  p_object_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conv uuid;
  v_rule public.msg_routing_rule;
  v_team text := 'concierge';
  v_sla integer := 120;
  v_priority public.msg_priority := 'normal';
  v_city uuid;
  v_name text;
  v_who text;
  v_msg jsonb;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = '42501';
  end if;
  if coalesce(trim(p_subject), '') = '' then
    raise exception 'Give it a subject — it is the line the desk sees in the queue, and a thread with none waits behind the ones that have one.'
      using errcode = '22023';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Write the message. An empty one helps nobody.' using errcode = '22023';
  end if;

  select h.city_id, h.display_name into v_city, v_name
    from public.host h where h.id = p_host_id;

  v_rule := public.fn_msg_route(p_topic, false, v_city);
  if v_rule.id is not null then
    v_team := v_rule.owner_team;
    v_priority := v_rule.priority_out;
    v_sla := v_rule.first_response_sla_s;
  end if;

  insert into public.msg_conversation (
    kind, subject, topic, city_id, origin_channel, current_channel,
    owner_team, priority, first_response_due_at)
  values (
    'external', trim(p_subject), p_topic, v_city, 'host_view', 'host_view',
    v_team, v_priority, now() + make_interval(secs => v_sla))
  returning id into v_conv;

  /*
   * The host, by their auth user.
   *
   * `can_see_internal` is false and the table's own constraint
   * refuses it for a non-staff participant whatever is passed
   * here — so an agent's note to a colleague stays invisible to
   * the host at the database rather than by a query somebody
   * remembers to write.
   */
  v_who := coalesce(nullif(trim(v_name), ''), 'Host');
  insert into public.msg_participant (
    conversation_id, kind, user_id, display_name, role_label,
    can_see_internal, can_reply_external)
  values (v_conv, 'host_user', v_uid, v_who, 'Host', false, true);

  /* And the team that owns the topic, so it is in their queue
     before anybody has picked it up. */
  insert into public.msg_participant (
    conversation_id, kind, team_key, display_name, role_label,
    can_see_internal, can_reply_external)
  values (v_conv, 'team', v_team, initcap(replace(v_team, '_', ' ')), 'Team', true, true);

  if p_object_type is not null and p_object_id is not null then
    insert into public.msg_object_link (
      conversation_id, object_type, object_id, label, is_primary)
    values (v_conv, p_object_type, p_object_id,
            coalesce(p_object_label, p_object_type), true)
    on conflict do nothing;
  end if;

  /* Always linked to the host, so the desk opening it can see
     whose account this is without asking. */
  insert into public.msg_object_link (
    conversation_id, object_type, object_id, label, is_primary)
  values (v_conv, 'host', p_host_id, v_who, p_object_id is null)
  on conflict do nothing;

  v_msg := public.rpc_host_message_reply(v_conv, p_body);

  perform audit.log('host_user'::public.actor_type, 'messaging', 'conversation.started',
    p_target_type => 'conversation', p_target_id => v_conv,
    p_target_label => trim(p_subject),
    p_city_id => v_city,
    p_after => jsonb_build_object('topic', p_topic, 'team', v_team));

  return jsonb_build_object(
    'ok', true, 'conversation_id', v_conv, 'team', v_team,
    'message_id', v_msg -> 'message_id');
end;
$$;

/**
 * Add to a thread the caller is already in.
 *
 * Deliberately not `rpc_msg_send` with another branch bolted
 * on: that function's participant lookup is the security check
 * for the desk, and widening it to match `user_id` would also
 * widen every path that calls it.
 *
 * Always external. A host has no internal to write to, and a
 * parameter that let them try is a parameter that eventually
 * gets passed.
 */
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

  select * into v_participant from public.msg_participant p
   where p.conversation_id = p_conversation
     and p.left_at is null
     and p.user_id is not null
     and p.user_id = v_uid
   limit 1;

  if not found then
    raise exception 'You are not in this conversation.' using errcode = '42501';
  end if;

  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, visibility,
    channel_out, delivery, idempotency_key)
  values (
    p_conversation, 'text', v_participant.id, trim(p_body), 'external',
    'host_view', 'stored', p_idempotency_key)
  returning id, seq into v_id, v_seq;

  /*
   * Reopen it. A host replying to something marked resolved is
   * telling us it was not — and a message onto a closed thread
   * that nobody is watching is the worst of both: they think
   * they have been heard and nobody has heard them.
   */
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

/** Mark a thread read, up to the last message in it. */
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

/*
 * Reading a message is not a state change worth an audit line.
 * The row carries who and how far, and a line per thread opened
 * would bury the entries that matter.
 */
insert into wiring_audit_exempt (function_name, reason, recorded_in)
values
  ('rpc_host_message_read',
   'Marking a thread read is not a state change anybody is accountable for',
   'msg_participant.last_read_seq'),
  ('rpc_host_message_reply',
   'Auditing every line of a conversation is volume without accountability',
   'msg_message, append-only with its author participant')
on conflict (function_name) do nothing;

revoke execute on function
  public.rpc_host_message_start(uuid, public.msg_topic, text, text, text, uuid, text),
  public.rpc_host_message_reply(uuid, text, text),
  public.rpc_host_message_read(uuid)
from public, anon;

grant execute on function
  public.rpc_host_message_start(uuid, public.msg_topic, text, text, text, uuid, text),
  public.rpc_host_message_reply(uuid, text, text),
  public.rpc_host_message_read(uuid)
to authenticated;
