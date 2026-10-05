-- The desk can act.
--
-- Every write in this module goes through one of these. No
-- browser inserts a message, because a client that chooses its
-- own `visibility` can mark an internal note external, and the
-- RLS that protects reads does not protect against that.
--
-- They are also where the rules that are easy to state and easy
-- to forget actually live: an escalated team can read the
-- guest's thread but cannot reply to the guest; a resolution
-- needs a topic; an action taken from chat is the module's own
-- RPC and writes the module's own audit event, never a second
-- code path that drifts.

-- ════════════════════════════════════════ starting a conversation

create or replace function fn_msg_route(
  p_topic msg_topic,
  p_has_live_order boolean,
  p_city uuid
)
returns msg_routing_rule
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.msg_routing_rule r
   where r.enabled
     and (not coalesce((r.conditions ->> 'live_order')::boolean, false)
          or coalesce(p_has_live_order, false))
     and (r.conditions -> 'topics' is null
          or r.conditions -> 'topics' ? p_topic::text)
   order by r.priority
   limit 1
$$;

comment on function fn_msg_route is
  'The first matching routing rule, by priority. Returns nothing when none match, and the caller falls back to the desk at normal — an unmatched conversation must still reach somebody.';

create or replace function rpc_msg_start(
  p_kind msg_conversation_kind,
  p_subject text,
  p_topic msg_topic default null,
  p_channel msg_channel default 'internal',
  p_city_id uuid default null,
  p_guest_id uuid default null,
  p_object_type text default null,
  p_object_id uuid default null,
  p_object_label text default null,
  p_staff_participants uuid[] default '{}',
  p_team_participants text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_conv uuid;
  v_rule public.msg_routing_rule;
  v_live boolean := false;
  v_sla integer := 120;
  v_team text := 'concierge';
  v_priority public.msg_priority := 'normal';
  s uuid;
  t text;
begin
  if coalesce(trim(p_subject), '') = '' then
    raise exception 'A conversation needs a subject — it is what the queue shows.';
  end if;

  if p_object_type = 'order' and p_object_id is not null then
    select o.stage not in ('delivered', 'cancelled') into v_live
      from public.order o where o.id = p_object_id;
  end if;

  if p_kind = 'external' then
    v_rule := public.fn_msg_route(p_topic, v_live, p_city_id);
    if v_rule.id is not null then
      v_team := v_rule.owner_team;
      v_priority := v_rule.priority_out;
      v_sla := v_rule.first_response_sla_s;
    end if;
  else
    v_team := 'concierge';
  end if;

  insert into public.msg_conversation (
    kind, subject, topic, city_id, origin_channel, current_channel,
    owner_team, priority, first_response_due_at, created_by)
  values (
    p_kind, trim(p_subject), p_topic, p_city_id, p_channel, p_channel,
    v_team, v_priority,
    /* Only an external conversation owes somebody a reply, so
       only it carries a first-response clock. */
    case when p_kind = 'external' then now() + make_interval(secs => v_sla) end,
    v_me)
  returning id into v_conv;

  /* The opener is a participant. For an internal thread they
     see internal content; for an external one they are the
     desk and may reply outward. */
  if v_me is not null then
    insert into public.msg_participant (
      conversation_id, kind, staff_user_id, display_name, role_label,
      can_see_internal, can_reply_external)
    select v_conv, 'staff', v_me, su.display_name, 'Concierge', true, true
      from public.staff_user su where su.id = v_me;
  end if;

  if p_guest_id is not null then
    insert into public.msg_participant (
      conversation_id, kind, guest_id, display_name, can_see_internal, can_reply_external)
    select v_conv, 'guest', g.id, coalesce(split_part(g.name, ' ', 1), 'Guest'), false, true
      from public.guest g where g.id = p_guest_id;
  end if;

  foreach s in array coalesce(p_staff_participants, '{}') loop
    insert into public.msg_participant (
      conversation_id, kind, staff_user_id, display_name, can_see_internal, can_reply_external)
    select v_conv, 'staff', su.id, su.display_name, true, false
      from public.staff_user su where su.id = s
    on conflict do nothing;
  end loop;

  foreach t in array coalesce(p_team_participants, '{}') loop
    insert into public.msg_participant (
      conversation_id, kind, team_key, display_name, can_see_internal, can_reply_external)
    values (v_conv, 'team', t, t, true, false)
    on conflict do nothing;
  end loop;

  if p_object_type is not null and p_object_id is not null then
    insert into public.msg_object_link (
      conversation_id, object_type, object_id, label, is_primary, linked_by)
    values (v_conv, p_object_type, p_object_id,
            coalesce(p_object_label, p_object_type), true, v_me)
    on conflict do nothing;
  end if;

  /* The opening system line. It says where the conversation came
     from, which is the first thing anybody picking it up asks. */
  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (v_conv, 'system',
          'Started from ' || p_channel::text
            || coalesce(' · ' || replace(p_topic::text, '_', ' '), '')
            || coalesce(' · ' || p_object_label || ' attached', ''),
          'external');

  return jsonb_build_object('ok', true, 'conversation_id', v_conv,
    'owner_team', v_team, 'priority', v_priority);
end;
$$;

-- ══════════════════════════════════════════════ sending

create or replace function rpc_msg_send(
  p_conversation uuid,
  p_body text,
  p_visibility msg_visibility default 'external',
  p_idempotency_key text default null,
  p_kind msg_message_kind default 'text'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_guest uuid := authz.guest_id();
  v_participant public.msg_participant;
  v_existing public.msg_message;
  v_id uuid;
  v_channel public.msg_channel;
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'An empty message helps nobody.';
  end if;

  /* A repeat of the same key is the same message. A desk agent
     on a flaky connection pressing send twice must not send
     twice. */
  if p_idempotency_key is not null then
    select * into v_existing from public.msg_message
     where conversation_id = p_conversation
       and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'message_id', v_existing.id,
        'seq', v_existing.seq, 'repeat', true);
    end if;
  end if;

  select * into v_participant from public.msg_participant p
   where p.conversation_id = p_conversation
     and p.left_at is null
     and ((v_me is not null and p.staff_user_id = v_me)
          or (v_guest is not null and p.guest_id = v_guest))
   limit 1;

  if not found then
    raise exception 'You are not in this conversation.' using errcode = '42501';
  end if;

  /*
   * The two refusals this function exists for.
   *
   * A guest cannot write an internal message — they would not
   * see it afterwards, and the attempt means something is wired
   * wrong upstream. And escalated staff cannot reply outward
   * until a hand-over: Finance joining a thread to approve a
   * credit must not be able to message the guest by accident,
   * because the guest is the desk agent's conversation and two
   * voices in it is how a promise gets made twice.
   */
  if p_visibility = 'internal' and not v_participant.can_see_internal then
    raise exception 'Only staff in this conversation can write an internal note.'
      using errcode = '42501';
  end if;
  if p_visibility = 'external' and not v_participant.can_reply_external then
    raise exception
      'You joined this conversation to help, not to answer the guest. Hand over first if you need to reply to them.'
      using errcode = '42501';
  end if;

  select c.current_channel into v_channel
    from public.msg_conversation c where c.id = p_conversation;

  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, visibility,
    channel_out, idempotency_key)
  values (
    p_conversation,
    /* Cast the whole CASE, not the branches: a CASE yields text
       and will not bind to an enum column. This has caught this
       repository out often enough to be in the notes. */
    (case when p_visibility = 'internal' and p_kind = 'text'
          then 'internal_note' else p_kind::text end)::public.msg_message_kind,
    v_participant.id, trim(p_body), p_visibility,
    case when p_visibility = 'external' then v_channel end,
    p_idempotency_key)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'message_id', v_id);
end;
$$;

-- ═══════════════════════════════════ taking, escalating, handing over

create or replace function rpc_msg_take(p_conversation uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_assignee uuid;
  v_active integer;
  v_cap integer;
begin
  if v_me is null then
    raise exception 'Only staff take conversations.' using errcode = '42501';
  end if;

  select assignee_id into v_assignee from public.msg_conversation where id = p_conversation;
  if v_assignee is not null and v_assignee <> v_me then
    return jsonb_build_object('ok', false,
      'message', 'Somebody else picked this up first.');
  end if;

  select coalesce(capacity, 4), coalesce(active_count, 0) into v_cap, v_active
    from public.msg_presence where staff_user_id = v_me;

  /*
   * Capacity is a refusal, not a warning. An agent holding
   * eight live chats answers all of them late, and the queue
   * cannot tell that from an agent holding none.
   */
  if v_cap is not null and v_active >= v_cap then
    return jsonb_build_object('ok', false,
      'message', 'You are at your limit of ' || v_cap
        || ' live chats. Resolve one first, or ask a lead to raise your capacity.');
  end if;

  /* Taking a conversation changes who owns it, not what state
     it is in — an escalated conversation that somebody picks up
     is still escalated. */
  update public.msg_conversation set assignee_id = v_me where id = p_conversation;

  insert into public.msg_participant (
    conversation_id, kind, staff_user_id, display_name, role_label,
    can_see_internal, can_reply_external)
  select p_conversation, 'staff', v_me, su.display_name, 'Concierge', true, true
    from public.staff_user su where su.id = v_me
  on conflict (conversation_id, staff_user_id) where staff_user_id is not null
  do update set can_reply_external = true, can_see_internal = true, left_at = null;

  update public.msg_presence set active_count = active_count + 1 where staff_user_id = v_me;

  return jsonb_build_object('ok', true, 'message', 'Yours.');
end;
$$;

create or replace function rpc_msg_escalate(
  p_conversation uuid,
  p_to_team text default null,
  p_to_staff uuid default null,
  p_note text default null,
  p_hand_over boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_conv public.msg_conversation;
  v_thread uuid;
  v_label text := coalesce(p_to_team, (select display_name from public.staff_user where id = p_to_staff));
begin
  if v_me is null then
    raise exception 'Only staff escalate.' using errcode = '42501';
  end if;
  if p_to_team is null and p_to_staff is null then
    raise exception 'Escalate to whom?';
  end if;

  select * into v_conv from public.msg_conversation where id = p_conversation;
  if not found then raise exception 'No such conversation.'; end if;

  /*
   * An escalation reuses the thread if one is already open.
   *
   * Three people escalating the same stuck order in five
   * minutes should land in one room, not three — the second and
   * third would each be answered separately by somebody who
   * could not see the first.
   */
  select id into v_thread from public.msg_conversation
   where parent_conversation_id = p_conversation and status <> 'resolved'
   order by created_at desc limit 1;

  if v_thread is null then
    insert into public.msg_conversation (
      kind, subject, topic, city_id, origin_channel, current_channel,
      owner_team, priority, parent_conversation_id, created_by)
    values ('internal_thread', v_conv.subject, v_conv.topic, v_conv.city_id,
            'internal', 'internal', coalesce(p_to_team, v_conv.owner_team),
            v_conv.priority, p_conversation, v_me)
    returning id into v_thread;

    insert into public.msg_participant (
      conversation_id, kind, staff_user_id, display_name, role_label,
      can_see_internal, can_reply_external)
    select v_thread, 'staff', v_me, su.display_name, 'Concierge', true, true
      from public.staff_user su where su.id = v_me;
  end if;

  /*
   * Joining gives sight of the guest's thread and of internal
   * content, and withholds the right to reply to the guest
   * unless this is a hand-over. The desk agent stays the one
   * voice the guest hears.
   */
  if p_to_team is not null then
    insert into public.msg_participant (
      conversation_id, kind, team_key, display_name, can_see_internal, can_reply_external)
    values (v_thread, 'team', p_to_team, p_to_team, true, false)
    on conflict do nothing;
    insert into public.msg_participant (
      conversation_id, kind, team_key, display_name, can_see_internal, can_reply_external)
    values (p_conversation, 'team', p_to_team, p_to_team, true, p_hand_over)
    on conflict (conversation_id, team_key) where team_key is not null
    do update set can_reply_external = excluded.can_reply_external;
  end if;

  if p_to_staff is not null then
    insert into public.msg_participant (
      conversation_id, kind, staff_user_id, display_name, can_see_internal, can_reply_external)
    select v_thread, 'staff', su.id, su.display_name, true, true
      from public.staff_user su where su.id = p_to_staff
    on conflict do nothing;
    insert into public.msg_participant (
      conversation_id, kind, staff_user_id, display_name, can_see_internal, can_reply_external)
    select p_conversation, 'staff', su.id, su.display_name, true, p_hand_over
      from public.staff_user su where su.id = p_to_staff
    on conflict (conversation_id, staff_user_id) where staff_user_id is not null
    do update set can_reply_external = excluded.can_reply_external;
  end if;

  update public.msg_conversation
     set status = 'escalated',
         escalated_to = (select array_agg(distinct e)
                           from unnest(escalated_to || array[v_label]) e)
   where id = p_conversation;

  if p_hand_over then
    update public.msg_conversation set assignee_id = coalesce(p_to_staff, assignee_id)
     where id = p_conversation;
  end if;

  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (p_conversation, 'system',
          v_label || ' joined to help'
            || case when p_hand_over then ' and took over the reply' else '' end
            || coalesce(' · ' || p_note, ''),
          'internal');

  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (v_thread, 'system',
          'Escalated from the guest conversation'
            || coalesce(' · ' || p_note, ''),
          'internal');

  return jsonb_build_object('ok', true, 'thread_id', v_thread, 'hand_over', p_hand_over);
end;
$$;

-- ════════════════════════════════════════ linking and deciding

create or replace function rpc_msg_link_object(
  p_conversation uuid,
  p_object_type text,
  p_object_id uuid,
  p_label text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := authz.staff_id();
begin
  if v_me is null then
    raise exception 'Only staff link conversations to records.' using errcode = '42501';
  end if;
  if not authz.msg_can_read(p_conversation) then
    raise exception 'Not your conversation.' using errcode = '42501';
  end if;

  insert into public.msg_object_link (
    conversation_id, object_type, object_id, label, linked_by)
  values (p_conversation, p_object_type, p_object_id, p_label, v_me)
  on conflict (conversation_id, object_type, object_id) do nothing;

  /*
   * Said out loud in the conversation, because linking changes
   * who can see it. A private message between two people that
   * quietly becomes part of a merchant's record is a surprise
   * nobody should get.
   */
  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (p_conversation, 'system',
          'Linked to ' || p_label || ' — this conversation is now part of that record.',
          'internal');

  return jsonb_build_object('ok', true,
    'message', 'Linked. It stays with that record and in its evidence pack.');
end;
$$;

create or replace function rpc_msg_pin_decision(
  p_conversation uuid,
  p_summary text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_participant uuid;
begin
  if v_me is null then raise exception 'Only staff pin decisions.' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A decision needs a reason — that is the half somebody reads six months later.';
  end if;

  select id into v_participant from public.msg_participant
   where conversation_id = p_conversation and staff_user_id = v_me;

  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, visibility)
  values (p_conversation, 'decision', v_participant,
          trim(p_summary) || ' · reason: ' || trim(p_reason), 'internal');

  return jsonb_build_object('ok', true);
end;
$$;

-- ═══════════════════════════════════════════════ resolving

create or replace function rpc_msg_resolve(
  p_conversation uuid,
  p_topic msg_topic,
  p_subtopic text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_conv public.msg_conversation;
  v_staff_replies integer;
begin
  if v_me is null then raise exception 'Only staff resolve.' using errcode = '42501'; end if;
  if p_topic is null then
    /* The tag is how Insights can say what people keep asking
       about. Resolving without one buys ten seconds and costs
       the only signal this module produces. */
    raise exception 'Tag it before resolving — the topic is what makes the pattern visible.';
  end if;

  select * into v_conv from public.msg_conversation where id = p_conversation;
  if not found then raise exception 'No such conversation.'; end if;

  select count(*) into v_staff_replies
    from public.msg_message m
    join public.msg_participant p on p.id = m.author_participant_id
   where m.conversation_id = p_conversation
     and m.visibility = 'external' and p.kind = 'staff';

  update public.msg_conversation
     set status = 'resolved', resolved_at = now(), resolved_by = v_me,
         resolution_note = p_note, topic = p_topic,
         resolved_in_one = (v_staff_replies <= 1 and reopened_count = 0)
   where id = p_conversation;

  insert into public.msg_topic_tag (conversation_id, topic, subtopic, tagged_by)
  values (p_conversation, p_topic, p_subtopic, v_me)
  on conflict (conversation_id) do update
    set topic = excluded.topic, subtopic = excluded.subtopic,
        tagged_by = excluded.tagged_by, at = now();

  if v_conv.assignee_id is not null then
    update public.msg_presence set active_count = greatest(0, active_count - 1)
     where staff_user_id = v_conv.assignee_id;
  end if;

  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (p_conversation, 'system',
          'Resolved · ' || replace(p_topic::text, '_', ' ')
            || coalesce(' · ' || p_subtopic, ''), 'external');

  return jsonb_build_object('ok', true,
    'resolved_in_one', (v_staff_replies <= 1 and v_conv.reopened_count = 0));
end;
$$;

-- ════════════════════════════════════════════════ presence

create or replace function rpc_msg_presence(
  p_state text,
  p_on_shift_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := authz.staff_id();
begin
  if v_me is null then return jsonb_build_object('ok', false); end if;

  insert into public.msg_presence (staff_user_id, state, on_shift_until, last_seen_at)
  values (v_me, p_state, p_on_shift_until, now())
  on conflict (staff_user_id) do update
    set state = excluded.state,
        on_shift_until = coalesce(excluded.on_shift_until, public.msg_presence.on_shift_until),
        last_seen_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- ════════════════════════════════════════════════ who may call

revoke execute on function rpc_msg_start(
  msg_conversation_kind, text, msg_topic, msg_channel, uuid, uuid, text, uuid, text, uuid[], text[])
  from public, anon;
revoke execute on function rpc_msg_send(uuid, text, msg_visibility, text, msg_message_kind)
  from public, anon;
revoke execute on function rpc_msg_take(uuid) from public, anon;
revoke execute on function rpc_msg_escalate(uuid, text, uuid, text, boolean) from public, anon;
revoke execute on function rpc_msg_link_object(uuid, text, uuid, text) from public, anon;
revoke execute on function rpc_msg_pin_decision(uuid, text, text) from public, anon;
revoke execute on function rpc_msg_resolve(uuid, msg_topic, text, text) from public, anon;
revoke execute on function rpc_msg_presence(text, timestamptz) from public, anon;
revoke execute on function fn_msg_route(msg_topic, boolean, uuid) from public, anon, authenticated;

grant execute on function rpc_msg_start(
  msg_conversation_kind, text, msg_topic, msg_channel, uuid, uuid, text, uuid, text, uuid[], text[])
  to authenticated;
grant execute on function rpc_msg_send(uuid, text, msg_visibility, text, msg_message_kind)
  to authenticated;
grant execute on function rpc_msg_take(uuid) to authenticated;
grant execute on function rpc_msg_escalate(uuid, text, uuid, text, boolean) to authenticated;
grant execute on function rpc_msg_link_object(uuid, text, uuid, text) to authenticated;
grant execute on function rpc_msg_pin_decision(uuid, text, text) to authenticated;
grant execute on function rpc_msg_resolve(uuid, msg_topic, text, text) to authenticated;
grant execute on function rpc_msg_presence(text, timestamptz) to authenticated;
