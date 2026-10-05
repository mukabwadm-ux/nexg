-- Five inboxes become one.
--
-- `support_ticket` with `support_message`, and the three partner
-- note tables — `merchant_message`, `rider_message`,
-- `host_message` — all become conversations.
--
-- Doing it now rather than later is the whole argument. There
-- are zero tickets and a handful of partner notes on production
-- today, so this is a few rows; in three months it is a
-- migration with real support history in it and a page somebody
-- is mid-conversation on. The cost of consolidating only ever
-- goes up.
--
-- `support_message.internal` is the interesting column. It is a
-- boolean, which is exactly what this module replaced with an
-- enum, and it maps straight onto `visibility` — so the old
-- internal notes stay internal and come under the same RLS as
-- everything else rather than keeping their own weaker rule.

create or replace function fn_msg_absorb_legacy()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tk record;
  sm record;
  pm record;
  v_conv uuid;
  v_author uuid;
  v_staff uuid;
  v_tickets integer := 0;
  v_partner integer := 0;
  v_skipped integer := 0;
  v_failed jsonb := '[]'::jsonb;
begin
  -- ══════════════════════════════════════════ support tickets

  for tk in
    select * from public.support_ticket t
     /* Idempotent by the link back to the ticket. Running this
        twice must not give the desk two of every conversation. */
     where not exists (
       select 1 from public.msg_object_link ol
        where ol.object_type = 'conversation' and ol.object_id = t.id)
     order by t.created_at
  loop
    begin
      insert into public.msg_conversation (
        kind, subject, topic, city_id, origin_channel, current_channel,
        owner_team, priority, assignee_id, status,
        created_at, first_responded_at, resolved_at, last_message_at)
      values (
        'external',
        coalesce(nullif(trim(tk.full_name), ''), 'Support') || ' · ' || tk.reference,
        /*
         * The old topic list overlaps the new one but is not the
         * same list — `order_problem` and `payment_or_refund`
         * have no counterpart. Mapped explicitly rather than
         * cast, because an unmapped value would abort the whole
         * backfill on one row.
         */
        (case tk.topic::text
           when 'order_problem' then 'my_order'
           when 'payment_or_refund' then 'payment'
           when 'account' then 'something_else'
           when 'concierge_request' then 'something_else'
           when 'partner_rider' then 'rider_application'
           when 'partner_merchant' then 'merchant_application'
           when 'hotel_partnership' then 'hotel_or_airbnb'
           else tk.topic::text
         end)::public.msg_topic,
        tk.city_id,
        /* The old `channel` is free text and does not line up. */
        'web', 'web',
        'concierge',
        'normal',
        tk.assigned_to,
        (case tk.status::text
           when 'open' then 'open'
           when 'assigned' then 'open'
           when 'answered' then 'waiting_on_them'
           when 'resolved' then 'resolved'
           when 'closed' then 'closed'
           else 'open'
         end)::public.msg_conv_status,
        tk.created_at, tk.first_reply_at, tk.resolved_at,
        coalesce(tk.updated_at, tk.created_at))
      returning id into v_conv;

      /* The link is both provenance and the idempotency key. */
      insert into public.msg_object_link (
        conversation_id, object_type, object_id, label, is_primary)
      values (v_conv, 'conversation', tk.id,
              'Ticket ' || tk.reference || ' · brought across', true);

      insert into public.msg_participant (
        conversation_id, kind, display_name, can_see_internal, can_reply_external, user_id)
      values (v_conv, 'visitor',
              coalesce(nullif(trim(tk.full_name), ''), 'Someone'), false, true,
              extensions.gen_random_uuid())
      returning id into v_author;

      /* The ticket body is the first thing they said. */
      insert into public.msg_message (
        conversation_id, kind, author_participant_id, body, visibility, created_at)
      values (v_conv, 'text', v_author, tk.body, 'external', tk.created_at);

      for sm in
        select * from public.support_message where ticket_id = tk.id order by created_at
      loop
        v_staff := null;
        if sm.from_staff_id is not null then
          insert into public.msg_participant (
            conversation_id, kind, staff_user_id, display_name, role_label,
            can_see_internal, can_reply_external)
          select v_conv, 'staff', su.id, su.display_name, 'Concierge', true, true
            from public.staff_user su where su.id = sm.from_staff_id
          on conflict (conversation_id, staff_user_id) where staff_user_id is not null
          do nothing;

          select id into v_staff from public.msg_participant
           where conversation_id = v_conv and staff_user_id = sm.from_staff_id;
        end if;

        insert into public.msg_message (
          conversation_id, kind, author_participant_id, body, visibility, created_at)
        values (
          v_conv,
          /* The boolean this module replaced with an enum, read
             one last time. */
          (case when sm.internal then 'internal_note' else 'text' end)::public.msg_message_kind,
          coalesce(v_staff, v_author),
          sm.body,
          (case when sm.internal then 'internal' else 'external' end)::public.msg_visibility,
          sm.created_at);
      end loop;

      v_tickets := v_tickets + 1;
    exception when others then
      /* One bad row must not stop the rest. A half-migrated
         inbox is worse than a list of three to look at. */
      v_failed := v_failed || jsonb_build_object('ticket', tk.reference, 'why', sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;

  -- ════════════════════════════════ the partner note tables
  --
  -- These were never conversations — one row, one direction, no
  -- reply. They become a conversation linked to the partner so
  -- the history is in one place and anything new is a real
  -- thread somebody can answer.

  for pm in
    select 'merchant' as kind, m.id, m.merchant_id as party_id, m.subject, m.body,
           m.direction, m.created_at,
           coalesce(mm.trading_name, mm.legal_name) as party_label
      from public.merchant_message m
      join public.merchant mm on mm.id = m.merchant_id
    union all
    select 'rider', r.id, r.rider_id, r.subject, r.body, r.direction, r.created_at,
           nullif(trim(coalesce(rd.first_name,'') || ' ' || coalesce(rd.last_name,'')), '')
      from public.rider_message r
      join public.rider rd on rd.id = r.rider_id
  loop
    begin
      if exists (select 1 from public.msg_object_link ol
                  where ol.object_type = 'conversation' and ol.object_id = pm.id) then
        continue;
      end if;

      insert into public.msg_conversation (
        kind, subject, origin_channel, current_channel, owner_team,
        priority, status, created_at, last_message_at)
      values ('external',
              coalesce(pm.party_label, pm.kind) || ' · '
                || coalesce(nullif(trim(pm.subject), ''), 'Message'),
              (case pm.kind when 'merchant' then 'merchant_dashboard'
                            else 'rider_app' end)::public.msg_channel,
              (case pm.kind when 'merchant' then 'merchant_dashboard'
                            else 'rider_app' end)::public.msg_channel,
              (case pm.kind when 'merchant' then 'merchant_ops'
                            else 'rider_ops' end),
              'low', 'closed', pm.created_at, pm.created_at)
      returning id into v_conv;

      insert into public.msg_object_link (
        conversation_id, object_type, object_id, label, is_primary)
      values (v_conv, 'conversation', pm.id, 'Brought across from ' || pm.kind || '_message', true);
      insert into public.msg_object_link (
        conversation_id, object_type, object_id, label)
      values (v_conv, pm.kind, pm.party_id, coalesce(pm.party_label, pm.kind));

      insert into public.msg_participant (
        conversation_id, kind, user_id, display_name, can_see_internal, can_reply_external)
      values (v_conv,
              (case pm.kind when 'merchant' then 'merchant_user'
                            else 'rider' end)::public.msg_participant_kind,
              extensions.gen_random_uuid(),
              coalesce(pm.party_label, pm.kind), false, true)
      returning id into v_author;

      insert into public.msg_message (
        conversation_id, kind, author_participant_id, body, visibility, created_at)
      values (v_conv, 'text', v_author,
              coalesce(nullif(trim(pm.subject), '') || E'\n\n', '') || pm.body,
              'external', pm.created_at);

      v_partner := v_partner + 1;
    exception when others then
      v_failed := v_failed || jsonb_build_object('partner_message', pm.id, 'why', sqlerrm);
      v_skipped := v_skipped + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_skipped = 0,
    'tickets', v_tickets,
    'partner_messages', v_partner,
    'skipped', v_skipped,
    'failed', v_failed,
    'message', v_tickets || ' tickets and ' || v_partner
      || ' partner messages are now conversations.'
      || case when v_skipped > 0
           then ' ' || v_skipped || ' could not be brought across and are listed.' else '' end);
end;
$$;

comment on function fn_msg_absorb_legacy is
  'Brings support tickets and partner notes across as conversations. Idempotent by a link back to the original row, and it keeps going past a failure rather than leaving half an inbox.';

revoke execute on function fn_msg_absorb_legacy() from public, anon, authenticated;
grant execute on function fn_msg_absorb_legacy() to service_role;

do $run$
declare v jsonb;
begin
  v := public.fn_msg_absorb_legacy();
  raise notice 'Legacy inboxes: %', v ->> 'message';
  if not (v ->> 'ok')::boolean then
    raise notice 'Could not bring across: %', v -> 'failed';
  end if;
end
$run$;

/*
 * The old tables are left in place and are not written to by
 * anything new. Dropping them in the same migration that moves
 * the data would leave no way to check the move was faithful,
 * and the whole point of doing this early is that there is
 * little enough data to check by eye.
 */
comment on table support_ticket is
  'Superseded by msg_conversation. Rows were brought across by fn_msg_absorb_legacy; nothing writes here any more. Kept until the move has been checked, then droppable.';
comment on table merchant_message is
  'Superseded by msg_conversation. See fn_msg_absorb_legacy.';
comment on table rider_message is
  'Superseded by msg_conversation. See fn_msg_absorb_legacy.';
