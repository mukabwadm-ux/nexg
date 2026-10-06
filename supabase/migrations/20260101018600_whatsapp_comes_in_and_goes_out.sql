-- WhatsApp comes in and goes out.
--
-- `msg_whatsapp_session` has existed since the messaging module
-- was built and nothing ever wrote to it. This is the pair of
-- functions that do: one for a message arriving from Meta, one
-- for a reply going back.
--
-- The whole of WhatsApp's difficulty is one rule. Twenty-four
-- hours after somebody's last message to us, free text is
-- refused and only a pre-approved template will go. Meta returns
-- an error for this, but by then the agent has written a reply,
-- pressed send and moved on — so the check belongs before the
-- message is composed, not after it is rejected.

-- ════════════════════════════════════════════════ inbound

/*
 * A message arriving from Meta.
 *
 * Called by the webhook with the service role. Finds or opens a
 * conversation for that number and appends the message, which
 * is also what re-opens the twenty-four hour window.
 *
 * The number is stored hashed and masked, never in full. A
 * phone number is the one identifier that reaches somebody
 * outside the system, and a support console is a screen people
 * stand behind.
 */
create or replace function rpc_wa_inbound(
  p_msisdn text,
  p_body text,
  p_provider_message_id text,
  p_provider_conversation_id text default null,
  p_display_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_masked text;
  v_conv uuid;
  v_visitor uuid;
  v_participant uuid;
  v_rule public.msg_routing_rule;
  v_team text := 'concierge';
  v_priority public.msg_priority := 'normal';
  v_sla integer := 120;
  v_new boolean := false;
begin
  if coalesce(btrim(p_msisdn), '') = '' or coalesce(btrim(p_body), '') = '' then
    raise exception 'A WhatsApp message needs a number and a body.'
      using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(btrim(p_msisdn), 'sha256'), 'hex');
  v_masked := case
    when length(btrim(p_msisdn)) > 6
      then left(btrim(p_msisdn), 4)
           || repeat('•', length(btrim(p_msisdn)) - 7)
           || right(btrim(p_msisdn), 3)
    else '•••'
  end;

  /*
   * An existing unresolved conversation for this number is
   * continued rather than a new one opened. Somebody sending
   * three messages in a row is one person with one problem, and
   * three threads is three agents answering the same question.
   */
  select w.conversation_id into v_conv
    from public.msg_whatsapp_session w
    join public.msg_conversation c on c.id = w.conversation_id
   where w.msisdn_hash = v_hash
     and c.status not in ('resolved', 'closed')
   order by c.last_message_at desc nulls last
   limit 1;

  if v_conv is null then
    v_new := true;
    v_rule := public.fn_msg_route('something_else'::public.msg_topic, false, null);
    if v_rule.id is not null then
      v_team := v_rule.owner_team;
      v_priority := v_rule.priority_out;
      v_sla := v_rule.first_response_sla_s;
    end if;

    insert into public.msg_visitor (
      session_hash, display_name, contact, contact_kind, consent_at)
    values (v_hash, nullif(btrim(p_display_name), ''), v_masked, 'phone', now())
    on conflict (session_hash) do update
      set display_name = coalesce(excluded.display_name, public.msg_visitor.display_name)
    returning id into v_visitor;

    insert into public.msg_conversation (
      kind, subject, topic, origin_channel, current_channel,
      owner_team, priority, first_response_due_at)
    values ('external',
            coalesce(nullif(btrim(p_display_name), ''), v_masked) || ' · WhatsApp',
            'something_else'::public.msg_topic, 'whatsapp', 'whatsapp',
            v_team, v_priority, now() + make_interval(secs => v_sla))
    returning id into v_conv;

    insert into public.msg_participant (
      conversation_id, kind, user_id, display_name,
      can_see_internal, can_reply_external)
    values (v_conv, 'visitor', v_visitor,
            coalesce(nullif(btrim(p_display_name), ''), v_masked), false, true)
    returning id into v_participant;
  else
    select p.id into v_participant
      from public.msg_participant p
     where p.conversation_id = v_conv and p.kind = 'visitor'
     limit 1;
  end if;

  /*
   * Dedupe on Meta's own message id. Webhooks are delivered at
   * least once and a retried delivery must not become a second
   * message in the thread — the agent would answer it twice.
   */
  if exists (
    select 1 from public.msg_message m
     where m.conversation_id = v_conv
       and m.provider_ref = p_provider_message_id
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true, 'conversation_id', v_conv);
  end if;

  insert into public.msg_message (
    conversation_id, kind, author_participant_id, body, visibility,
    channel_out, provider_ref, delivery, delivered_at)
  values (v_conv, 'text', v_participant, btrim(p_body), 'external',
          'whatsapp', p_provider_message_id, 'delivered', now());

  /* Their message is what re-opens the window. */
  insert into public.msg_whatsapp_session (
    conversation_id, msisdn_hash, msisdn_masked, opt_in_at,
    window_expires_at, last_inbound_at, provider_conversation_id)
  values (v_conv, v_hash, v_masked, now(),
          now() + interval '24 hours', now(), p_provider_conversation_id)
  on conflict (conversation_id) do update
    set last_inbound_at = now(),
        window_expires_at = now() + interval '24 hours',
        provider_conversation_id = coalesce(
          excluded.provider_conversation_id,
          public.msg_whatsapp_session.provider_conversation_id);

  return jsonb_build_object(
    'ok', true, 'conversation_id', v_conv, 'new_conversation', v_new);
end;
$$;

revoke execute on function rpc_wa_inbound(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function rpc_wa_inbound(text, text, text, text, text) to service_role;

-- ═══════════════════════════════════════════════ outbound

/*
 * Can this conversation be answered in free text?
 *
 * Asked before the agent writes, not after Meta refuses. The
 * answer carries the reason and the time left, so the console
 * can say "4 hours left" rather than only "yes".
 */
create or replace function fn_wa_window(p_conversation uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when w.conversation_id is null then
      jsonb_build_object('whatsapp', false)
    when w.window_expires_at > now() then
      jsonb_build_object(
        'whatsapp', true, 'open', true,
        'hours_left', round(extract(epoch from (w.window_expires_at - now())) / 3600, 1))
    else
      jsonb_build_object(
        'whatsapp', true, 'open', false,
        'reason', 'Their last message was over 24 hours ago. WhatsApp will only accept an '
                  || 'approved template until they write again.')
  end
  from public.msg_whatsapp_session w
  where w.conversation_id = p_conversation;
$$;

grant execute on function fn_wa_window(uuid) to authenticated, service_role;

/*
 * A reply going out.
 *
 * Refuses rather than queues when the window has closed. A
 * queued message that WhatsApp will reject is worse than a
 * refusal: the agent believes it is handled and the guest hears
 * nothing, and the failure surfaces hours later in a log.
 */
create or replace function rpc_wa_reply(
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
  v_me uuid := authz.staff_id();
  v_window jsonb;
  v_session public.msg_whatsapp_session;
  v_msg jsonb;
begin
  if v_me is null then
    raise exception 'Only staff may reply.' using errcode = '42501';
  end if;

  select * into v_session
    from public.msg_whatsapp_session where conversation_id = p_conversation;

  if v_session.conversation_id is null then
    raise exception 'This conversation is not on WhatsApp.' using errcode = '22023';
  end if;

  v_window := public.fn_wa_window(p_conversation);

  if not (v_window ->> 'open')::boolean then
    raise exception '%', v_window ->> 'reason' using errcode = '22023';
  end if;

  /* The ordinary send does the participant checks, the
     idempotency and the audit. This adds only the WhatsApp
     part on top of it. */
  v_msg := public.rpc_msg_send(
    p_conversation, p_body, 'external'::public.msg_visibility,
    p_idempotency_key, 'text'::public.msg_message_kind);

  update public.msg_whatsapp_session
     set last_outbound_at = now()
   where conversation_id = p_conversation;

  /*
   * Queued through the same outbox as everything else, so there
   * is one place a message can be stuck and one place to look.
   * Not sensitive: a reply to a guest is the conversation they
   * are already having.
   */
  perform public.fn_notify_enqueue(
    'whatsapp', v_session.msisdn_masked, 'wa_reply',
    p_body, null,
    jsonb_build_object('conversation_id', p_conversation),
    false, now() + interval '24 hours');

  return v_msg || jsonb_build_object('channel', 'whatsapp');
end;
$$;

revoke execute on function rpc_wa_reply(uuid, text, text) from public, anon;
grant execute on function rpc_wa_reply(uuid, text, text) to authenticated;

insert into audit.action_registry (action, module, default_severity, description)
values ('msg.wa_inbound', 'messaging', 'info',
        'A WhatsApp message arrived and was attached to a conversation.')
on conflict (action) do nothing;

insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_wa_inbound', 'A provider delivering a message, recorded as the message itself',
   'msg_message'),
  ('fn_wa_window', 'A read-only question about whether a reply may be sent', 'nothing changes')
on conflict (function_name) do nothing;

comment on function rpc_wa_inbound is
  'A WhatsApp message arriving. Continues an open conversation rather than opening a second one, dedupes on Meta''s message id because webhooks are delivered at least once, and re-opens the 24-hour window.';

comment on function rpc_wa_reply is
  'A reply going out over WhatsApp. Refuses when the window has closed rather than queueing something Meta will reject — a queued rejection reads as handled to the agent and as silence to the guest.';

/*
 * The send is already accounted for.
 *
 * `rpc_wa_reply` delegates the message itself to
 * `rpc_msg_send`, which writes the audit line for a staff
 * member replying to a guest. What this wrapper writes on top
 * is `last_outbound_at` — bookkeeping about the window, not a
 * second action. A duplicate audit entry would make one reply
 * look like two.
 */
insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_wa_reply',
   'The reply itself is audited by rpc_msg_send; this adds only window bookkeeping',
   'msg_whatsapp_session.last_outbound_at')
on conflict (function_name) do nothing;
