-- Chasing a document, from the other direction.
--
-- `rpc_document_request_via_whatsapp` already exists and does most
-- of this — but it is written for the applicant asking us to send
-- them a link. It authorises with `is_merchant_member` and
-- `rider.user_id = auth.uid()`, so a reviewer looking at a stalled
-- application cannot call it at all. The console's own copy says as
-- much: "the merchant asked us to chase this on WhatsApp".
--
-- This is the reviewer's version. Same table, same notification
-- queue, same one-chase-per-document discipline — a different
-- caller, a different actor on the audit row, and a cooldown,
-- because the one thing a reviewer with a button can do that an
-- applicant cannot is send the same person four reminders in a
-- minute.

alter table public.document_request
  /* Who asked. Null means the applicant asked for it themselves,
     which is the only kind that existed before now. */
  add column if not exists requested_by uuid references public.staff_user (id) on delete set null,
  add column if not exists note text;

comment on column public.document_request.requested_by is
  'The staff member who chased. Null means the applicant asked us to send them a link, which is the only kind of request that existed before reviewers could send one.';

insert into settings.definition
  (key, "group", scope_kind, value_type, unit, label, help,
   sensitive, can_be_immediate, approval_pair, reader_modules, default_value, sort)
values
  ('documents.reminder_cooldown_hours', 'notifications', 'global', 'int', 'hours',
   'Wait between document reminders',
   'How long before the same document can be chased again. Short enough to be useful, long enough that somebody clicking twice does not send two messages.',
   false, true, 'single:ops_manager', '{merchants,riders}', '24'::jsonb, 800)
on conflict (key) do nothing;

insert into settings.version (key, scope_kind, value, status, effective_from, reason, activated_at)
select 'documents.reminder_cooldown_hours', 'global', '24'::jsonb, 'active', now(),
       'Seeded from the registry default.', now()
where not exists (
  select 1 from settings.version where key = 'documents.reminder_cooldown_hours');

-- ════════════════════════════ what a reviewer can see

/*
 * Per requirement: whether it has been chased, when, by whom, and
 * whether the cooldown has passed. The console needs all four to
 * render a button that says something true.
 */
create or replace function public.fn_document_chase_state(
  p_owner_type public.document_owner_type,
  p_owner_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(r.kind, jsonb_build_object(
    'last_sent_at', c.sent_at,
    'last_channel', c.channel,
    'by', su.email,
    'by_applicant', c.id is not null and c.requested_by is null,
    'times', c.times,
    'can_send_again', c.sent_at is null
      or c.sent_at < now() - make_interval(
           hours => coalesce(settings.fn_int('documents.reminder_cooldown_hours')::int, 24)),
    'next_allowed_at', case when c.sent_at is null then null
      else c.sent_at + make_interval(
             hours => coalesce(settings.fn_int('documents.reminder_cooldown_hours')::int, 24)) end
  )), '{}'::jsonb)
  from public.document_requirement r
  left join lateral (
    select dr.id, dr.sent_at, dr.channel, dr.requested_by,
           (select count(*) from public.document_request x
             where x.owner_type = p_owner_type and x.owner_id = p_owner_id
               and x.requirement_id = r.id) as times
    from public.document_request dr
    where dr.owner_type = p_owner_type and dr.owner_id = p_owner_id
      and dr.requirement_id = r.id
    order by dr.sent_at desc
    limit 1
  ) c on true
  left join public.staff_user su on su.id = c.requested_by
  where r.owner_type = p_owner_type
$$;

-- ═══════════════════════════════ sending the reminder

create or replace function public.rpc_document_remind(
  p_owner_type public.document_owner_type,
  p_owner_id uuid,
  p_requirement_kind text,
  p_channel text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_req public.document_requirement;
  v_recipient text;
  v_name text;
  v_city uuid;
  v_doc public.document;
  v_last public.document_request;
  v_cooldown integer := coalesce(settings.fn_int('documents.reminder_cooldown_hours')::int, 24);
  v_channel text;
  v_provider text;
  v_queued boolean;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;

  if p_owner_type = 'merchant' then
    select m.contact_phone, coalesce(m.trading_name, m.legal_name), m.city_id
      into v_recipient, v_name, v_city
      from public.merchant m where m.id = p_owner_id;
    if v_name is null then raise exception 'No such merchant.'; end if;
    if not authz.can_manage_merchants(v_city) then
      raise exception 'You cannot chase documents for merchants in that city.'
        using errcode = '42501';
    end if;
  else
    select r.phone, trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), r.city_id
      into v_recipient, v_name, v_city
      from public.rider r where r.id = p_owner_id;
    if v_name is null then raise exception 'No such rider.'; end if;
    if not authz.can_manage_riders(v_city) then
      raise exception 'You cannot chase documents for riders in that city.'
        using errcode = '42501';
    end if;
  end if;

  select * into v_req from public.document_requirement
   where owner_type = p_owner_type and kind = p_requirement_kind;
  if v_req.id is null then
    raise exception 'We do not ask for that document.';
  end if;

  /*
   * Nothing to chase if it is already in. Reminding somebody to
   * send a thing they sent is how a reviewer loses their trust.
   */
  select * into v_doc from public.document
   where owner_type = p_owner_type and owner_id = p_owner_id
     and requirement_id = v_req.id and superseded_at is null
   order by created_at desc limit 1;

  if v_doc.id is not null and v_doc.status in ('uploaded', 'verified') then
    raise exception '% already sent their %. It is waiting for review, not for them.',
      v_name, lower(v_req.label);
  end if;

  /* A reviewer with a button can do one thing an applicant cannot:
     send the same person four messages in a minute. */
  select * into v_last from public.document_request
   where owner_type = p_owner_type and owner_id = p_owner_id
     and requirement_id = v_req.id
   order by sent_at desc limit 1;

  if v_last.id is not null and v_last.sent_at > now() - make_interval(hours => v_cooldown) then
    raise exception 'They were reminded about this %. Chasing again so soon is more likely to lose them than to hurry them — you can send another from %.',
      case
        when now() - v_last.sent_at < interval '2 minutes' then 'a moment ago'
        when now() - v_last.sent_at < interval '1 hour'
          then (extract(epoch from now() - v_last.sent_at) / 60)::int || ' minutes ago'
        else (extract(epoch from now() - v_last.sent_at) / 3600)::int || ' hours ago'
      end,
      to_char(v_last.sent_at + make_interval(hours => v_cooldown), 'FMDay HH24:MI');
  end if;

  if coalesce(trim(v_recipient), '') = '' then
    raise exception 'We have no phone number for %, so there is nowhere to send it.', v_name;
  end if;

  /*
   * WhatsApp if it is configured, SMS otherwise. The channel is
   * recorded either way so nobody has to guess later which one the
   * person was supposed to have received.
   */
  v_channel := coalesce(p_channel, 'whatsapp');
  select i.status into v_provider from public.integration i
   where i.key = case when v_channel = 'whatsapp' then 'whatsapp_business' else 'sms' end;

  if v_channel = 'whatsapp' and coalesce(v_provider, 'to_do') <> 'connected' then
    v_channel := 'sms';
    select i.status into v_provider from public.integration i where i.key = 'sms';
  end if;

  v_queued := coalesce(v_provider, 'to_do') = 'connected';

  insert into public.document_request
    (owner_type, owner_id, requirement_id, channel, requested_by, note)
  values (p_owner_type, p_owner_id, v_req.id, v_channel, v_me,
          'Chased by a reviewer.');

  insert into public.notification_log (channel, recipient, template, payload, status)
  values (
    v_channel, v_recipient,
    case when p_owner_type = 'merchant' then 'merchant_doc_reminder' else 'rider_doc_reminder' end,
    jsonb_build_object(
      'owner_type', p_owner_type, 'owner_id', p_owner_id,
      'name', v_name, 'document', v_req.label,
      'why', v_req.why_text, 'essential', v_req.essential),
    /* `skipped`, not `queued`, when nothing is wired. A row sitting
       at "queued" forever reads as a delivery that is on its way. */
    case when v_queued then 'queued' else 'skipped' end);

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => case when p_owner_type = 'merchant' then 'merchants' else 'riders' end,
    p_action => 'document.reminder_sent',
    p_actor_id => v_me,
    p_target_type => p_owner_type::text,
    p_target_id => p_owner_id,
    p_target_label => v_name || ' · ' || v_req.label,
    p_city_id => v_city,
    p_after => jsonb_build_object('channel', v_channel, 'delivered', v_queued));

  return jsonb_build_object(
    'ok', true,
    'channel', v_channel,
    'queued', v_queued,
    'next_allowed_at', now() + make_interval(hours => v_cooldown),
    /*
     * "Queued", never "sent".
     *
     * Nothing drains `notification_log` — there is no notifications
     * worker in this codebase yet, whatever the integration row
     * says about a provider being connected. Telling a reviewer
     * their reminder was sent would have them stop chasing a
     * merchant who never heard from us, which is worse than no
     * button at all.
     */
    'message', case when v_queued
      then 'Queued for ' || v_name || ' by ' || upper(v_channel)
           || '. It goes out when the notifications worker runs — nothing drains the queue yet, so treat this as recorded rather than delivered.'
      else 'Recorded against ' || v_name || ', and nothing will go out: no '
           || upper(v_channel) || ' provider is connected. Settings → '
           || 'Payments & integrations shows which are.' end);
end;
$$;

comment on function public.rpc_document_remind is
  'A reviewer chasing a missing document. Refuses when the document is already in, when the same one was chased inside the cooldown, and when there is no number to send to — and says plainly when nothing was actually delivered, because a queue nobody drains is not a sent message.';

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values ('document.reminder_sent', 'merchants', 'info', false, false, false,
        'A merchant or rider was reminded to upload a document')
on conflict (action) do nothing;

grant execute on function public.rpc_document_remind(public.document_owner_type, uuid, text, text) to authenticated;
grant execute on function public.fn_document_chase_state(public.document_owner_type, uuid) to authenticated;
