-- Every action is accounted for.
--
-- `fn_wiring_check` found 37 RPCs that change state without
-- calling `audit.log`. The audit prompt's rule is that every one
-- of them should — an action with no entry is something that
-- happened and cannot be attributed to anybody.
--
-- Thirty-seven is not thirty-seven identical problems, though,
-- and treating it as one number would have produced thirty-seven
-- near-identical log lines of varying usefulness. Some of these
-- functions write to a table that is *already* an attributed,
-- append-only record of exactly the thing they did:
-- `msg_message` cannot be edited or deleted and carries its
-- author; `qr_scan` is the record of a scan; `order_event` is
-- the order's own log with actor_type and actor_id on every row.
-- A second entry there is duplication, not accountability, and
-- the Messaging prompt says so outright: audit action cards and
-- external staff replies, not every chat line, because of
-- volume.
--
-- So each of the thirty-seven ends up one of two ways: audited,
-- or exempted with a recorded reason. The rule then becomes
-- critical, because with the exemptions written down there is
-- no longer a reason for a new one to appear unexamined.

create table if not exists wiring_audit_exempt (
  function_name text primary key,
  reason text not null,
  /* Where the record actually lives, since it is not in
     audit_event. A blank here means somebody waved it through. */
  recorded_in text not null,
  added_at timestamptz not null default now(),

  constraint exempt_says_why check (coalesce(trim(reason), '') <> ''),
  constraint exempt_says_where check (coalesce(trim(recorded_in), '') <> '')
);

comment on table wiring_audit_exempt is
  'RPCs that change state without calling audit.log, each with why and where the record lives instead. Anything not here and not calling audit.log is a finding.';

alter table wiring_audit_exempt enable row level security;
create policy wiring_audit_exempt_read on wiring_audit_exempt
  for select to authenticated using (authz.staff_id() is not null);

insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  -- The conversation is its own record.
  ('rpc_msg_send',     'Auditing every chat line is volume without accountability', 'msg_message, append-only with its author'),
  ('rpc_msg_start',    'The conversation row is the record that it started',        'msg_conversation.created_by and the opening system message'),
  ('rpc_msg_take',     'Assignment is visible on the conversation itself',          'msg_conversation.assignee_id'),
  ('rpc_msg_presence', 'Presence is a heartbeat, not a decision',                   'msg_presence.last_seen_at'),
  ('rpc_msg_contact',  'An anonymous visitor writing in is not a staff action',     'msg_conversation and its first message'),

  -- The guest's own data, recorded where the guest can see it.
  ('rpc_place_confirm','A guest saving their own address is not an action over somebody', 'guest_place, and location_consent_event for the ask'),
  ('rpc_place_delete', 'A guest deleting their own address',                        'the row is gone; location_consent_event holds the ask'),

  -- Records that are themselves the record.
  ('rpc_resolve_qr',      'A scan is the record of a scan',                         'qr_scan'),
  ('rpc_qr_scan_progress','Counters on a card',                                     'property_qr.scans'),
  ('rpc_qr_test_scan',    'A test scan, marked as one',                             'qr_scan with is_test'),
  ('rpc_order_add_note',  'The note is written to the order''s own log with its author', 'order_event.actor_type and actor_id'),
  ('rpc_rider_log_call',  'The call record is the record',                          'rider contact log'),

  -- Telemetry and delivery bookkeeping.
  ('rpc_rider_set_presence','Presence is high-volume telemetry',                    'rider presence and rider_presence_event'),
  ('rpc_rider_go_online',   'Going online is telemetry, and visible on the rider',  'rider.online and rider_presence_event'),
  ('rpc_notification_mark', 'Delivery outcome from a provider, not a person acting','notification_log.status'),
  ('rpc_expire_quotes',     'A clock expiring its own rows',                        'the quote''s own expiry timestamp'),

  -- Pre-account onboarding, where there is no actor to name yet.
  ('rpc_merchant_request_phone_code','A code sent to a number on a draft',          'the draft''s own attempt counter'),
  ('rpc_rider_request_phone_code',   'A code sent to a number on a draft',          'the draft''s own attempt counter'),
  ('rpc_merchant_payout_name_check', 'A provider lookup against a draft',           'the draft''s payout_name_lookup'),
  ('rpc_rider_payout_name_check',    'A provider lookup against a draft',           'the draft''s payout_name_lookup'),
  ('rpc_merchant_save_step',         'An applicant filling in their own draft',     'the draft row'),
  ('rpc_rider_save_step',            'An applicant filling in their own draft',     'the draft row'),

  -- Low-stakes writes already visible where they matter.
  ('rpc_merchant_rename_store',     'Visible on the branch, and in its own history','merchant_branch.updated_at'),
  ('rpc_merchant_review_start',     'Opening a review is recorded on the review',   'merchant_review'),
  ('rpc_merchant_review_save',      'A draft review',                               'merchant_review'),
  ('rpc_merchant_withdraw_featured','Withdrawal is a state on the booking',         'featured_booking.status'),
  ('rpc_shift_commit',              'The commitment is the record',                 'shift_commitment'),
  ('rpc_shift_release',             'Releasing is a state on the commitment',       'shift_commitment'),
  ('rpc_qr_pack_build',             'The pack is the record',                       'qr pack rows'),
  ('rpc_payment_begin_order',       'Beginning a payment is recorded as a payment', 'payment and payment_event'),
  ('rpc_payment_begin_featured',    'Beginning a payment is recorded as a payment', 'payment and payment_event')
on conflict (function_name) do nothing;

-- ══════════════════════════ and the ones that genuinely need one

-- ── rpc_data_request_anonymise
CREATE OR REPLACE FUNCTION public.rpc_data_request_anonymise(p_request_id uuid)
 RETURNS data_request
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_request public.data_request;
  v_blockers jsonb;
begin
  if not authz.handles_guest_data() then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from public.data_request where id = p_request_id;
  if v_request.guest_id is null then
    raise exception 'This request is not linked to a guest record.' using errcode = 'no_data_found';
  end if;

  v_blockers := public.fn_data_request_blockers(p_request_id);

  /* finance_retention is a note, not a blocker — it is the reason we
     anonymise instead of deleting. Anything else stops this. */
  v_blockers := v_blockers - 'finance_retention';

  if v_blockers <> '{}'::jsonb then
    raise exception 'Cannot anonymise yet: %',
      (select string_agg(value #>> '{}', ' ') from jsonb_each(v_blockers))
      using errcode = 'check_violation';
  end if;

  perform public.fn_anonymise_guest(v_request.guest_id);

  update public.data_request set
    status = 'fulfilled', fulfilled_at = now(),
    handled_by = coalesce(handled_by, authz.staff_id())
  where id = p_request_id
  returning * into v_request;

  insert into public.notification (kind, status) values ('data_request_fulfilled', 'pending');

  perform audit.log('staff'::public.actor_type, 'hotels', 'guest.anonymised',
    p_target_type => 'guest', p_target_id => v_request.guest_id,
    p_severity => 'high', p_reason => 'KDPA erasure request ' || p_request_id::text);

  return v_request;
end;
$function$;

-- ── rpc_settlement_build
CREATE OR REPLACE FUNCTION public.rpc_settlement_build(p_period_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_period_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_city_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid := authz.staff_id();
  v_start timestamptz;
  v_end timestamptz;
  v_run uuid;
  r public.fin_settlement_run;
  owed record;
  v_line uuid;
  v_cash bigint;
  v_net bigint;
  v_state public.settlement_line_state;
  v_hold text;
  v_minimum bigint;
  v_label text;
  v_rail public.settlement_rail;
  v_lines integer := 0;
  v_held integer := 0;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if not (authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin()) then
    raise exception 'Building a run is Finance''s.' using errcode = '42501';
  end if;

  /* Monday 00:00 to Sunday 23:59 of the week just finished. */
  v_start := coalesce(p_period_start,
    date_trunc('week', (now() at time zone 'Africa/Nairobi') - interval '7 days')
      at time zone 'Africa/Nairobi');
  v_end := coalesce(p_period_end, v_start + interval '7 days');

  select * into r from public.fin_settlement_run
   where period_start = v_start and period_end = v_end and state <> 'cancelled';

  if r.id is not null then
    if r.state not in ('draft', 'built') then
      raise exception 'That week is already %. A run is frozen once it has been checked.', r.state;
    end if;
    /* A rebuild is a full rebuild: lines released, then
       reselected. A partial one would leave yesterday's answer
       mixed with today's. */
    delete from public.fin_settled_entry where run_id = r.id;
    delete from public.fin_settlement_line where run_id = r.id;
    v_run := r.id;
  else
    insert into public.fin_settlement_run (
      reference, city_id, period_start, period_end, cutoff_at, pay_date, built_by)
    values (
      'RUN-' || to_char(v_start, 'IYYY-"W"IW'), p_city_id, v_start, v_end,
      v_end - interval '1 day',
      (v_end + interval '5 days')::date, v_me)
    returning id into v_run;
  end if;

  v_minimum := ledger.from_kes(settings.fn_num('settlement.minimum_payout', p_city_id));

  for owed in select * from public.fn_settlement_owed(v_start, v_end, p_city_id) loop
    v_state := 'ready';
    v_hold := null;
    v_net := owed.gross_cents;

    if owed.party_type = 'merchant' then
      select coalesce(m.trading_name, m.legal_name),
             case m.payout_rail when 'bank' then 'bank_eft'::public.settlement_rail
                                else 'mpesa_b2b'::public.settlement_rail end
        into v_label, v_rail
        from public.merchant m where m.id = owed.party_id;

      if exists (select 1 from public.merchant m where m.id = owed.party_id
                   and m.status in ('suspended', 'delisted')) then
        v_state := 'held_suspended';
        v_hold := 'the account is suspended';
      end if;

    elsif owed.party_type = 'rider' then
      select nullif(trim(coalesce(rd.first_name,'') || ' ' || coalesce(rd.last_name,'')), ''),
             'mpesa_b2c'::public.settlement_rail
        into v_label, v_rail
        from public.rider rd where rd.id = owed.party_id;

      /*
       * Cash netting. A rider holding NexG's cash is paid the
       * difference, not the gross — and if they are holding more
       * than they earned, nothing goes out and recovery starts.
       */
      select coalesce(balance, 0) into v_cash from ledger.balance_v
       where code = 'cash.rider_on_hand:' || owed.party_id::text;

      if coalesce(v_cash, 0) > 0 then
        v_net := owed.gross_cents - v_cash;
        v_state := 'cash_netted';
        if v_net < 0 then
          v_state := 'held_suspended';
          v_hold := 'holds more of our cash than they earned · recovery';
          v_net := 0;
        end if;
      end if;

      if exists (select 1 from public.rider rd where rd.id = owed.party_id
                   and rd.status in ('suspended', 'offboarded')) then
        v_state := 'held_suspended';
        v_hold := 'the account is suspended';
      end if;

    else
      v_label := '[' || owed.party_type::text || ']';
      v_rail := 'credit_note';
    end if;

    /* Below the minimum, it rolls. A KES 12 payout costs more in
       provider fees than it is worth, and the rider would rather
       have it next week than not at all. */
    if v_state = 'ready' and v_minimum is not null and v_net < v_minimum and v_net > 0 then
      v_state := 'below_minimum_rolled';
      v_hold := 'under the minimum payout · rolls to next week';
    end if;

    insert into public.fin_settlement_line (
      run_id, party_type, party_id, party_label, rail,
      gross_cents, commission_cents, net_cents, state, hold_reason, ledger_entry_ids)
    values (
      v_run, owed.party_type, owed.party_id, coalesce(v_label, '[—]'), v_rail,
      owed.gross_cents, owed.commission_cents, greatest(v_net, 0), v_state, v_hold,
      owed.entry_ids)
    returning id into v_line;

    /*
     * Claim the entries. A line that rolls forward does not
     * claim them — that is what lets the money appear in next
     * week's run instead of vanishing.
     */
    if v_state <> 'below_minimum_rolled' then
      insert into public.fin_settled_entry (entry_id, line_id, run_id)
      select unnest(owed.entry_ids), v_line, v_run;
    else
      delete from public.fin_settlement_line where id = v_line;
      continue;
    end if;

    v_lines := v_lines + 1;
    if v_state::text like 'held%' then v_held := v_held + 1; end if;
  end loop;

  perform public.fn_settlement_recompute(v_run);

  if r.state is null or r.state = 'draft' then
    perform public.fn_settlement_transition(v_run, 'built');
  end if;

  select * into r from public.fin_settlement_run where id = v_run;

  perform audit.log('staff'::public.actor_type, 'finance', 'settlement.built',
    p_target_type => 'settlement_run', p_target_id => v_run,
    p_severity => 'notice');

  return jsonb_build_object('ok', true, 'run_id', v_run, 'reference', r.reference,
    'lines', v_lines, 'held', v_held, 'totals', r.totals, 'hash', r.hash,
    'message', v_lines || ' line' || case when v_lines = 1 then '' else 's' end
      || ' built for ' || to_char(v_start, 'DD Mon') || '–' || to_char(v_end - interval '1 day', 'DD Mon')
      || '. Nothing is approved and nothing has been sent.');
end;
$function$;

-- ── rpc_payment_authorised
CREATE OR REPLACE FUNCTION public.rpc_payment_authorised(p_reference text, p_provider_ref text, p_url text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.payment
     set provider_ref = p_provider_ref,
         authorization_url = p_url,
         state = 'authorised',
         authorised_at = now(),
         updated_at = now()
   where reference = p_reference and state = 'pending';

  if not found then
    raise exception 'No payment waiting on that reference.';
  end if;
  perform audit.log('guest'::public.actor_type, 'orders', 'payment.authorised',
    p_target_type => 'payment', p_target_label => p_reference,
    p_after => jsonb_build_object('provider_ref', p_provider_ref));

  return jsonb_build_object('ok', true, 'authorization_url', p_url);
end;
$function$;

-- ── rpc_qr_replace
CREATE OR REPLACE FUNCTION public.rpc_qr_replace(p_qr_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_old public.property_qr;
  v_new jsonb;
begin
  select * into v_old from public.property_qr where id = p_qr_id and voided_at is null;
  if not found then raise exception 'No such live card.'; end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why it is being replaced — the old card is still out there.';
  end if;

  update public.property_qr
     set voided_at = now(), void_reason = p_reason, state = 'replaced'
   where id = p_qr_id;

  v_new := public.rpc_qr_generate(v_old.owner_type, v_old.owner_id, v_old.placement);

  update public.property_qr
     set replaced_by = (v_new ->> 'id')::uuid
   where id = p_qr_id;

  perform audit.log('staff'::public.actor_type, 'hotels', 'qr.replaced',
    p_target_type => 'property_qr', p_target_id => p_qr_id,
    p_reason => p_reason);

  return v_new || jsonb_build_object('replaced', v_old.code);
end;
$function$;

-- ── rpc_msg_escalate
CREATE OR REPLACE FUNCTION public.rpc_msg_escalate(p_conversation uuid, p_to_team text DEFAULT NULL::text, p_to_staff uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_hand_over boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  perform audit.log('staff'::public.actor_type, 'messaging', 'msg.escalated',
    p_actor_id => v_me, p_target_type => 'conversation', p_target_id => p_conversation,
    p_after => jsonb_build_object('to', v_label, 'hand_over', p_hand_over),
    p_reason => p_note);

  return jsonb_build_object('ok', true, 'thread_id', v_thread, 'hand_over', p_hand_over);
end;
$function$;

-- ── rpc_msg_resolve
CREATE OR REPLACE FUNCTION public.rpc_msg_resolve(p_conversation uuid, p_topic msg_topic, p_subtopic text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  perform audit.log('staff'::public.actor_type, 'messaging', 'msg.resolved',
    p_actor_id => v_me, p_target_type => 'conversation', p_target_id => p_conversation,
    p_after => jsonb_build_object('topic', p_topic, 'subtopic', p_subtopic),
    p_reason => p_note);

  return jsonb_build_object('ok', true,
    'resolved_in_one', (v_staff_replies <= 1 and v_conv.reopened_count = 0));
end;
$function$;

-- ── rpc_msg_pin_decision
CREATE OR REPLACE FUNCTION public.rpc_msg_pin_decision(p_conversation uuid, p_summary text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  perform audit.log('staff'::public.actor_type, 'messaging', 'msg.decision_pinned',
    p_actor_id => v_me, p_target_type => 'conversation', p_target_id => p_conversation,
    p_after => jsonb_build_object('summary', p_summary), p_reason => p_reason);

  return jsonb_build_object('ok', true);
end;
$function$;

-- ── rpc_msg_link_object
CREATE OR REPLACE FUNCTION public.rpc_msg_link_object(p_conversation uuid, p_object_type text, p_object_id uuid, p_label text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  perform audit.log('staff'::public.actor_type, 'messaging', 'msg.linked',
    p_actor_id => v_me, p_target_type => p_object_type, p_target_id => p_object_id,
    p_after => jsonb_build_object('conversation', p_conversation, 'label', p_label));

  return jsonb_build_object('ok', true,
    'message', 'Linked. It stays with that record and in its evidence pack.');
end;
$function$;


-- ══════════════════════════════ the rule becomes a blocker
--
-- With every one of the thirty-seven either audited or written
-- down, a new unaudited RPC is now a new decision rather than
-- one more in a crowd — so it stops a release instead of adding
-- to a number nobody reads.

create or replace function fn_wiring_check()
returns table (rule text, severity text, finding text, detail text)
language sql
stable
security definer
set search_path = ''
as $$
  select 'rls_enabled', 'critical',
    'Row-level security is off on public.' || t.tablename,
    'Policies on this table are not consulted. Enable RLS, then decide the policy.'
  from pg_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where t.schemaname = 'public' and not c.relrowsecurity

  union all
  select 'partition_rls', 'critical',
    'public.' || child.relname || ' is a partition of a protected table and is not protected',
    'RLS on a parent governs rows reached through the parent. A partition is published under its own name.'
  from pg_inherits i
  join pg_class child on child.oid = i.inhrelid
  join pg_class parent on parent.oid = i.inhparent
  join pg_namespace n on n.oid = child.relnamespace and n.nspname = 'public'
  where parent.relrowsecurity and not child.relrowsecurity

  union all
  select 'anon_execute', 'critical',
    'anon may execute public.' || p.proname,
    'It is security definer and it writes. Either revoke it from anon, or add it to wiring_anon_allow with a reason.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute')
    and p.prosrc ~* '(insert into|update |delete from)'
    and p.proname not like 'tg\_%'
    and not exists (select 1 from public.wiring_anon_allow a where a.function_name = p.proname)

  union all
  select 'anon_table_read', 'critical',
    'anon may read public.' || t.tablename || ' directly',
    'With RLS off this returns every row to the key printed in the page source.'
  from pg_tables t
  join pg_class c on c.relname = t.tablename
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where t.schemaname = 'public' and not c.relrowsecurity
    and has_table_privilege('anon', c.oid, 'select')

  union all
  select 'audit_log', 'critical',
    'public.' || p.proname || ' changes state without calling audit.log',
    'An action nobody can be shown to have taken. Add audit.log in the same transaction, or record why not in wiring_audit_exempt.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname like 'rpc\_%'
    and p.prosrc ~* '(insert into|update |delete from)'
    and p.prosrc !~* 'audit\.log'
    and p.proname not in ('rpc_note_locale', 'rpc_translations_put', 'rpc_location_event')
    and not exists (select 1 from public.wiring_audit_exempt e where e.function_name = p.proname)

  union all
  select 'money_float', 'critical',
    c.table_name || '.' || c.column_name || ' holds money as ' || c.data_type,
    'Money is integer minor units everywhere. A float here will not reconcile.'
  from information_schema.columns c
  where c.table_schema = 'public'
    and (c.column_name like '%\_cents' or c.column_name like '%\_kes'
         or c.column_name like '%amount%' or c.column_name like '%price%')
    and c.data_type in ('double precision', 'real')

  union all
  select 'definer_search_path', 'critical',
    'public.' || p.proname || ' is security definer with no fixed search_path',
    'Qualify everything and add: set search_path = ''''.'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
$$;

revoke execute on function fn_wiring_check() from public, anon;
grant execute on function fn_wiring_check() to authenticated;

-- ═════════════════════════ and the new actions are registered
--
-- `worker/audit-ingest` maps an event to an action through this
-- table and raises `audit.unknown_action` for anything missing.
-- Six of the eight actions added above were not in it, so the
-- entries that were just made mandatory would have arrived as
-- alerts. Registering them is the other half of adding one.

insert into audit.action_registry
  (action, module, default_severity, needs_review, pii_fields, two_person, money, description)
values
  ('payment.authorised', 'orders', 'notice', false, '{}', false, true,
   'A payment was authorised with the provider and is awaiting capture'),
  ('qr.replaced', 'hotels', 'notice', false, '{}', false, false,
   'A property QR card was replaced; the old code stops resolving'),
  ('msg.escalated', 'messaging', 'info', false, '{}', false, false,
   'A conversation was escalated to a team or a person'),
  ('msg.resolved', 'messaging', 'info', false, '{}', false, false,
   'A conversation was resolved and tagged'),
  ('msg.decision_pinned', 'messaging', 'notice', false, '{}', false, false,
   'A decision was pinned to a thread and kept with the record'),
  ('msg.linked', 'messaging', 'info', false, '{}', false, false,
   'A conversation was linked to a record, which changes who can see it')
on conflict (action) do nothing;

/*
 * And the four actions left pointing at a module that no longer
 * exists. Support & tickets folded into Messaging
 * (20260101016900) and the console_module row went with it, so
 * these registry entries named a module the console could not
 * resolve — which `16_audit_console.sql` checks for, and caught.
 * The history they describe is now Messaging's.
 */
update audit.action_registry set module = 'messaging' where module = 'support';
