-- Conversations for the desk to look at.
--
-- Shapes, not content. Every name is a placeholder and every
-- number is masked, because a seed that reads like a real
-- transcript ends up quoted in a screenshot in a deck.
--
-- What matters here is that the queue has the states an agent
-- has to tell apart at a glance: one urgent and unanswered, one
-- answered and waiting, one escalated with internal traffic, one
-- from a merchant, and one resolved.

do $seed$
declare
  v_desk uuid;
  v_dispatch uuid;
  v_guest uuid;
  v_city uuid := (select id from public.city where slug = 'nairobi');
  v_order uuid := (select id from public.order order by placed_at desc limit 1);
  v_merchant uuid := (select id from public.merchant limit 1);
  v_conv uuid;
  v_thread uuid;
  v_p_desk uuid;
  v_p_guest uuid;
  v_p_dispatch uuid;
begin
  /* Run once. A second run would stack five more conversations
     on the queue every time somebody resets. */
  if exists (select 1 from public.msg_conversation limit 1) then
    raise notice 'Messaging already seeded.';
    return;
  end if;

  select id into v_desk from public.staff_user where email like 'dev.admin%' limit 1;
  if v_desk is null then
    select id into v_desk from public.staff_user limit 1;
  end if;
  select id into v_dispatch from public.staff_user where id <> v_desk limit 1;
  select id into v_guest from public.guest limit 1;

  if v_desk is null or v_guest is null then
    raise notice 'No staff or guest to seed messaging against.';
    return;
  end if;

  insert into public.msg_presence (staff_user_id, state, capacity, active_count)
  values (v_desk, 'online', 4, 1)
  on conflict (staff_user_id) do update set state = 'online';

  -- ════════════════════════ 1 · urgent, nobody has answered yet
  insert into public.msg_conversation
    (kind, subject, topic, city_id, origin_channel, current_channel,
     owner_team, priority, first_response_due_at, status)
  values ('external', '[Guest] · Rm 412 · My order', 'my_order', v_city, 'web', 'web',
          'dispatch', 'urgent', now() - interval '40 seconds', 'open')
  returning id into v_conv;

  insert into public.msg_participant
    (conversation_id, kind, guest_id, display_name, can_see_internal, can_reply_external)
  values (v_conv, 'guest', v_guest, '[Guest]', false, true)
  returning id into v_p_guest;

  if v_order is not null then
    insert into public.msg_object_link
      (conversation_id, object_type, object_id, label, is_primary)
    values (v_conv, 'order', v_order, 'NX-[—] · 12 min late', true);
  end if;

  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (v_conv, 'system', 'Started from web · my order · signed in · order attached', 'external');
  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility)
  values (v_conv, 'text', v_p_guest,
    'Still nothing. The hotel desk says no rider has come?', 'external');

  -- ══════════════════ 2 · answered, escalated, internal traffic
  insert into public.msg_conversation
    (kind, subject, topic, city_id, origin_channel, current_channel,
     owner_team, priority, assignee_id, created_at, first_response_due_at,
     first_responded_at, status, escalated_to)
  /* created_at written explicitly: it defaults to now(), and a
     reply dated eight minutes ago against a conversation created
     this second is a negative response time. */
  values ('external', '[Guest] · Kilimani · Payment', 'payment', v_city, 'web', 'whatsapp',
          'concierge', 'urgent', v_desk, now() - interval '10 minutes',
          now() - interval '9 minutes',
          now() - interval '8 minutes', 'escalated', array['Dispatch'])
  returning id into v_conv;

  insert into public.msg_participant
    (conversation_id, kind, guest_id, display_name, can_see_internal, can_reply_external)
  values (v_conv, 'guest', v_guest, '[Guest]', false, true)
  returning id into v_p_guest;
  insert into public.msg_participant
    (conversation_id, kind, staff_user_id, display_name, role_label,
     can_see_internal, can_reply_external)
  values (v_conv, 'staff', v_desk, '[Desk]', 'Concierge', true, true)
  returning id into v_p_desk;

  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (v_conv, 'system', 'Started from web · payment · continued on WhatsApp', 'external');
  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility)
  values (v_conv, 'text', v_p_guest,
    'M-Pesa took the money but the page still says unpaid.', 'external');
  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility, channel_out)
  values (v_conv, 'text', v_p_desk,
    'I can see the payment. The callback from Safaricom is running slow tonight — I am confirming it by hand now so your order goes through.',
    'external', 'whatsapp');
  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility)
  values (v_conv, 'internal_note', v_p_desk,
    'STK callback lag again, third tonight. Matched the paybill reference by hand. @Finance worth a provider ticket if it keeps up.',
    'internal');

  /* The thread the escalation opened, with a decision on it. */
  insert into public.msg_conversation
    (kind, subject, topic, city_id, origin_channel, current_channel,
     owner_team, priority, parent_conversation_id, status)
  values ('internal_thread', 'M-Pesa callback lag · tonight', 'payment', v_city,
          'internal', 'internal', 'finance', 'high', v_conv, 'open')
  returning id into v_thread;

  insert into public.msg_participant
    (conversation_id, kind, staff_user_id, display_name, role_label,
     can_see_internal, can_reply_external)
  values (v_thread, 'staff', v_desk, '[Desk]', 'Concierge', true, true)
  returning id into v_p_desk;
  insert into public.msg_participant
    (conversation_id, kind, team_key, display_name, can_see_internal, can_reply_external)
  values (v_thread, 'team', 'finance', 'Finance', true, false);

  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (v_thread, 'system', 'Escalated from the guest conversation · callback lag', 'internal');
  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility)
  values (v_thread, 'text', v_p_desk,
    'Three tonight, all Safaricom, all cleared by hand within ten minutes. Raising a provider ticket rather than keeping on matching these one at a time.',
    'internal');
  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility)
  values (v_thread, 'decision', v_p_desk,
    'Raise a provider ticket and switch checkout copy to say M-Pesa is slow · reason: three manual matches in one evening is a pattern, not an incident',
    'internal');

  -- ═══════════════════════════════════ 3 · a merchant, waiting
  insert into public.msg_conversation
    (kind, subject, topic, city_id, origin_channel, current_channel,
     owner_team, priority, first_response_due_at, status)
  values ('external', '[Bakery] · owner · Documents', 'merchant_documents', v_city,
          'merchant_dashboard', 'merchant_dashboard', 'merchant_ops', 'high',
          now() + interval '50 seconds', 'open')
  returning id into v_conv;

  insert into public.msg_participant
    (conversation_id, kind, user_id, display_name, can_see_internal, can_reply_external)
  values (v_conv, 'merchant_user', gen_random_uuid(), '[Bakery] owner', false, true)
  returning id into v_p_guest;

  if v_merchant is not null then
    insert into public.msg_object_link
      (conversation_id, object_type, object_id, label, is_primary)
    values (v_conv, 'merchant', v_merchant, 'Business permit · v2 · rejected', true);
  end if;

  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (v_conv, 'system',
    'Started from merchant dashboard · documents · Business permit v2 attached', 'external');
  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility)
  values (v_conv, 'text', v_p_guest,
    'My permit was rejected, the photo looks fine to me. What is wrong with it?', 'external');

  -- ═════════════════════════════════════ 4 · outside coverage
  insert into public.msg_conversation
    (kind, subject, topic, city_id, origin_channel, current_channel,
     owner_team, priority, first_response_due_at, status)
  values ('external', 'Visitor · Nairobi · Something else', 'outside_coverage', v_city,
          'web', 'web', 'concierge', 'low', now() + interval '4 minutes', 'open')
  returning id into v_conv;

  insert into public.msg_participant
    (conversation_id, kind, user_id, display_name, can_see_internal, can_reply_external)
  values (v_conv, 'visitor', gen_random_uuid(), 'Visitor', false, true)
  returning id into v_p_guest;

  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (v_conv, 'system', 'Started from web · outside coverage · away message sent', 'external');
  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility)
  values (v_conv, 'text', v_p_guest, 'Do you deliver to Syokimau?', 'external');

  -- ═══════════════════════════════════════════ 5 · resolved
  insert into public.msg_conversation
    (kind, subject, topic, city_id, origin_channel, current_channel,
     owner_team, priority, assignee_id, created_at, first_responded_at,
     resolved_at, resolved_by, resolved_in_one, rating, status)
  values ('external', '[Guest] · Westlands · Refund status', 'refund_status', v_city,
          'web', 'web', 'concierge', 'normal', v_desk,
          now() - interval '2 hours' - interval '2 minutes',
          now() - interval '2 hours', now() - interval '110 minutes', v_desk, true, 5, 'resolved')
  returning id into v_conv;

  insert into public.msg_participant
    (conversation_id, kind, guest_id, display_name, can_see_internal, can_reply_external)
  values (v_conv, 'guest', v_guest, '[Guest]', false, true)
  returning id into v_p_guest;
  insert into public.msg_participant
    (conversation_id, kind, staff_user_id, display_name, role_label,
     can_see_internal, can_reply_external)
  values (v_conv, 'staff', v_desk, '[Desk]', 'Concierge', true, true)
  returning id into v_p_desk;

  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility)
  values (v_conv, 'text', v_p_guest, 'How long does a refund take?', 'external');
  insert into public.msg_message
    (conversation_id, kind, author_participant_id, body, visibility)
  values (v_conv, 'text', v_p_desk,
    'It is already on its way back to you — it reaches M-Pesa within an hour. You do not need to do anything.',
    'external');
  insert into public.msg_message (conversation_id, kind, body, visibility)
  values (v_conv, 'system', 'Resolved · refund status · how long it takes', 'external');

  insert into public.msg_topic_tag (conversation_id, topic, subtopic, tagged_by)
  values (v_conv, 'refund_status', 'how long it takes', v_desk);

  raise notice 'Messaging seeded: 5 conversations and one internal thread.';
end
$seed$;
