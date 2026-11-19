-- Rider fixes: what the rider portal and the Rider app found broken or missing.
--
-- 1. Messages could not be marked read. The portal updated rider_message
--    directly, but riders only have select on it, so nothing changed and the
--    unread count never fell. rpc_rider_messages_read(ids) marks them.
-- 2. A ticket never came back to the person who raised it. rider_ticket_v
--    (and merchant_ticket_v, host_ticket_v) read support_ticket.created_by_user,
--    which nothing wrote. A trigger now records the signed-in account (not
--    staff, not a temporary session). The thread is readable in
--    my_ticket_message_v, and rpc_my_ticket_reply(ticket, body) answers it.
-- 3. Two setup steps could not finish for a rider: the test trip was readable
--    by staff only, and nothing wrote rider_device. A rider now reads their
--    own test trips, and rpc_rider_device_register records the phone.
-- 4. rpc_incident_open checked nobody: any signed-in session could open an
--    incident against any rider, posing as staff. Now staff with the riders
--    module, or the rider themselves (always as 'rider', about themselves).
-- 5. Going online had two doors with different rules. rpc_rider_set_presence
--    let a rider set any presence, including offline mid-trip. It now takes
--    online/offline only and goes through rpc_rider_go_online, which gains
--    the agreement and expired-document checks set_presence had.
-- 6. Nothing marked a rider on a trip. A trigger on dispatch.job sets
--    presence 'on_trip' when a job is assigned, and back to online (or
--    offline, or cooldown) when their last job ends.
-- 7. "Go offline after this delivery": going offline mid-trip now waits for
--    the trip to end instead of refusing (rider.offline_after_trip).
-- 8. A rider could not accept the rider agreement. rpc_rider_agreement_current
--    and rpc_rider_agreement_accept(version).
-- 9. rpc_shift_commit took any date, from anyone with a rider row. Now an
--    active rider, today to 14 days ahead.
--
-- Rollback: drop the functions, trigger functions, view and column added
-- here; re-run rpc_incident_open, rpc_rider_set_presence and rpc_shift_commit
-- from 20260101007800 and rpc_rider_go_online from 20260101014600; drop policy
-- rider_test_trip_read_own.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('ticket.replied_by_requester', 'support', 'info', false, 'The person who raised a ticket replied'),
  ('rider.device_registered', 'riders', 'info', false, 'A rider registered a phone'),
  ('rider.agreement_accepted', 'riders', 'notice', false, 'A rider accepted the rider agreement'),
  ('rider.shift_committed', 'riders', 'info', false, 'A rider committed to a shift'),
  ('rider.trip_presence', 'riders', 'info', false, 'A rider went on or came off a trip')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 1. messages read

create or replace function public.rpc_rider_messages_read(p_ids uuid[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid;
  v_n integer;
begin
  select r.id into v_rider from public.rider r
   where r.user_id = (select auth.uid()) and r.offboarded_at is null
   order by r.updated_at desc limit 1;
  if v_rider is null then
    raise exception 'No rider account on this login.' using errcode = '42501';
  end if;

  update public.rider_message m
     set read_at = now()
   where m.rider_id = v_rider and m.direction = 'out' and m.read_at is null
     and (p_ids is null or m.id = any (p_ids));
  get diagnostics v_n = row_count;

  return jsonb_build_object('ok', true, 'marked', v_n);
end;
$$;

comment on function public.rpc_rider_messages_read(uuid[]) is
  'The rider marks messages from NexG as read: the ones given, or all of them.';
revoke execute on function public.rpc_rider_messages_read(uuid[]) from public, anon;
grant execute on function public.rpc_rider_messages_read(uuid[]) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_rider_messages_read', 'Only sets read_at on the rider''s own messages; a read receipt, not an action.',
   '20270112000300_rider_fixes')
on conflict do nothing;

-- ═══════════════════════════════════════════════ 2. tickets come back

create or replace function public.tg_support_ticket_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by_user is null
     and (select auth.uid()) is not null
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
     and authz.staff_id() is null then
    new.created_by_user := (select auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists support_ticket_creator on public.support_ticket;
create trigger support_ticket_creator
  before insert on public.support_ticket
  for each row execute function public.tg_support_ticket_creator();

/* The conversation on the tickets this account raised, without the desk's
   internal notes. A definer view: the filter is the access rule. */
create or replace view public.my_ticket_message_v
with (security_invoker = false) as
  select m.id,
         m.ticket_id,
         t.reference as ticket_reference,
         (m.from_staff_id is not null) as from_support,
         m.body,
         m.created_at
    from public.support_message m
    join public.support_ticket t on t.id = m.ticket_id
   where t.created_by_user = (select auth.uid())
     and not m.internal;

revoke all on public.my_ticket_message_v from anon, public;
grant select on public.my_ticket_message_v to authenticated;

create or replace function public.rpc_my_ticket_reply(p_ticket_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.support_ticket;
  v_id uuid;
begin
  select * into t from public.support_ticket
   where id = p_ticket_id and created_by_user = (select auth.uid())
   for update;
  if not found then
    raise exception 'Ticket not found.' using errcode = 'P0002';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Write a message.' using errcode = 'check_violation';
  end if;
  if length(p_body) > 4000 then
    raise exception 'Keep it under 4,000 characters.' using errcode = 'check_violation';
  end if;
  if t.status = 'closed' then
    raise exception 'This ticket is closed. Open a new one.' using errcode = 'check_violation',
      hint = 'ticket_closed';
  end if;

  insert into public.support_message (ticket_id, from_staff_id, body, internal)
  values (t.id, null, trim(p_body), false)
  returning id into v_id;

  /* An answer from them puts it back in front of the desk. */
  update public.support_ticket
     set status = case when status in ('answered', 'resolved') then 'open' else status end,
         resolved_at = case when status = 'resolved' then null else resolved_at end,
         updated_at = now()
   where id = t.id;

  perform audit.log('guest'::public.actor_type, 'support', 'ticket.replied_by_requester',
    p_actor_id => (select auth.uid()),
    p_target_type => 'ticket', p_target_id => t.id, p_target_label => t.reference);

  return jsonb_build_object('ok', true, 'messageId', v_id, 'ticketId', t.id);
end;
$$;

comment on function public.rpc_my_ticket_reply(uuid, text) is
  'The account that raised a ticket answers it. Reopens an answered or resolved ticket.';
revoke execute on function public.rpc_my_ticket_reply(uuid, text) from public, anon;
grant execute on function public.rpc_my_ticket_reply(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════ 3. setup steps a rider can finish

create policy rider_test_trip_read_own on public.rider_test_trip
  for select to authenticated using (authz.is_rider_self(rider_id));

create or replace function public.rpc_rider_device_register(
  p_platform text,
  p_label text default null,
  p_push_token text default null,
  p_notification_permission boolean default false,
  p_location_permission boolean default false,
  p_job_device boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid;
  v_id uuid;
  v_label text := nullif(trim(coalesce(p_label, '')), '');
  v_token text := nullif(trim(coalesce(p_push_token, '')), '');
begin
  select r.id into v_rider from public.rider r
   where r.user_id = (select auth.uid()) and r.offboarded_at is null
   order by r.updated_at desc limit 1;
  if v_rider is null then
    raise exception 'No rider account on this login.' using errcode = '42501';
  end if;
  if p_platform not in ('android', 'ios', 'web') then
    raise exception 'Platform is android, ios or web.' using errcode = '22023';
  end if;
  if v_token is not null and length(v_token) > 4096 then
    raise exception 'That push token is too long.' using errcode = '22023';
  end if;

  perform 1 from public.rider where id = v_rider for update;

  /* The same phone again: matched by its push token, else its label. */
  select d.id into v_id from public.rider_device d
   where d.rider_id = v_rider and d.unbound_at is null and d.platform = p_platform
     and ((v_token is not null and d.push_token = v_token)
          or (v_label is not null and d.label = v_label))
   order by d.last_seen_at desc nulls last limit 1;

  if p_job_device then
    update public.rider_device set is_job_device = false
     where rider_id = v_rider and is_job_device and id is distinct from v_id;
  end if;

  if v_id is null then
    insert into public.rider_device (rider_id, platform, label, push_token,
      notification_permission, location_permission, is_job_device, last_seen_at)
    values (v_rider, p_platform, v_label, v_token,
      coalesce(p_notification_permission, false), coalesce(p_location_permission, false),
      p_job_device, now())
    returning id into v_id;
  else
    update public.rider_device
       set label = coalesce(v_label, label),
           push_token = coalesce(v_token, push_token),
           notification_permission = coalesce(p_notification_permission, false),
           location_permission = coalesce(p_location_permission, false),
           is_job_device = p_job_device or is_job_device,
           last_seen_at = now()
     where id = v_id;
  end if;

  perform audit.log('rider'::public.actor_type, 'riders', 'rider.device_registered',
    p_actor_id => v_rider, p_target_type => 'rider', p_target_id => v_rider,
    p_after => jsonb_build_object('platform', p_platform, 'job_device', p_job_device,
                                  'notifications', p_notification_permission,
                                  'location', p_location_permission));

  return jsonb_build_object('ok', true, 'deviceId', v_id, 'jobDevice', p_job_device);
end;
$$;

comment on function public.rpc_rider_device_register(text, text, text, boolean, boolean, boolean) is
  'The Rider app records this phone, its permissions and push token. The job phone moves to it unless told otherwise.';
revoke execute on function public.rpc_rider_device_register(text, text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.rpc_rider_device_register(text, text, text, boolean, boolean, boolean) to authenticated;

-- ═══════════════════════════════════════════════ 4. who may open an incident

create or replace function public.rpc_incident_open(
  p_kind public.incident_kind,
  p_rider_id uuid default null,
  p_description text default null,
  p_severity public.incident_severity default 'minor',
  p_order_reference text default null,
  p_reported_by_type text default 'staff'
)
returns public.incident
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.incident;
  v_self uuid;
  v_rider uuid := p_rider_id;
  v_type text := p_reported_by_type;
begin
  if authz.staff_id() is not null and authz.reaches_module('riders') then
    null;  -- staff, as before
  else
    select r.id into v_self from public.rider r
     where r.user_id = (select auth.uid()) and r.offboarded_at is null
       and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
     order by r.updated_at desc limit 1;
    if v_self is null then
      raise exception 'Only the riders team or the rider can open an incident.'
        using errcode = '42501';
    end if;
    if p_rider_id is not null and p_rider_id <> v_self then
      raise exception 'You can only report for yourself.' using errcode = '42501';
    end if;
    /* A rider reports as a rider, about themselves, on their own trip. */
    v_rider := v_self;
    v_type := 'rider';
    if p_order_reference is not null and not exists (
         select 1 from public.order o
          where o.reference = p_order_reference and o.rider_id = v_self) then
      raise exception 'That order is not yours.' using errcode = '42501';
    end if;
  end if;

  if length(coalesce(p_description, '')) > 4000 then
    raise exception 'Keep it under 4,000 characters.' using errcode = 'check_violation';
  end if;

  insert into public.incident
    (kind, rider_id, description, severity, order_reference, reported_by_type, reported_by_id)
  values (p_kind, v_rider, nullif(trim(coalesce(p_description, '')), ''),
          case when p_kind = 'sos' then 'critical' else p_severity end,
          p_order_reference, v_type, (select auth.uid()))
  returning * into v_incident;

  insert into public.notification (kind, rider_id, status)
  values ('incident_received', v_rider, 'pending');

  perform audit.log(
    case v_type
      when 'rider' then 'rider' when 'guest' then 'guest'
      when 'merchant' then 'merchant_user' else 'staff' end::public.actor_type,
    'riders',
    case when p_kind = 'sos' then 'incident.sos' else 'incident.opened' end,
    p_target_type => 'incident', p_target_id => v_incident.id,
    p_severity => case when p_kind = 'sos' then 'high' else 'notice' end
      ::public.audit_severity);

  return v_incident;
end;
$$;

revoke execute on function public.rpc_incident_open(public.incident_kind, uuid, text, public.incident_severity, text, text)
  from public, anon;
grant execute on function public.rpc_incident_open(public.incident_kind, uuid, text, public.incident_severity, text, text)
  to authenticated;

-- ═══════════════════════════════════════════════ 5 & 7. one door for going online

alter table public.rider
  add column if not exists offline_after_trip boolean not null default false;

comment on column public.rider.offline_after_trip is
  'The rider asked to go offline mid-trip; they go offline when their last job ends.';

create or replace function public.rpc_rider_go_online(p_online boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_uid uuid := (select auth.uid());
begin
  select * into r from public.rider where user_id = v_uid order by updated_at desc limit 1;
  if r.id is null then raise exception 'No rider account on this login.'; end if;

  if r.status <> 'active' then
    raise exception 'Your account is %, so you cannot go online yet.', r.status;
  end if;

  if p_online then
    if r.cooldown_until is not null and r.cooldown_until > now() then
      raise exception 'You are on a cooldown until %.',
        to_char(r.cooldown_until at time zone 'Africa/Nairobi', 'HH24:MI');
    end if;
    if r.can_receive_offers = false and r.can_receive_offers_source = 'staff' then
      raise exception 'Offers are paused on your account by the team%. Message us and we will sort it.',
        coalesce(' · ' || r.offers_paused_reason, '');
    end if;
    if exists (
      select 1 from public.rider_agreement_version v
       where v.status = 'current'
         and not exists (select 1 from public.rider_agreement_acceptance a
                          where a.rider_id = r.id and a.agreement_version_id = v.id)) then
      raise exception 'Accept the current rider agreement first.' using hint = 'agreement';
    end if;
    if exists (
      select 1 from public.document d
        join public.document_requirement dr on dr.id = d.requirement_id
       where d.owner_type = 'rider' and d.owner_id = r.id
         and d.superseded_at is null and dr.essential
         and d.expires_at is not null and d.expires_at < current_date) then
      raise exception 'One of your documents has expired. Retake it to go back online.'
        using hint = 'document_expired';
    end if;
    if r.presence = 'on_trip' then
      update public.rider set offline_after_trip = false where id = r.id;
      return jsonb_build_object('ok', true, 'presence', 'on_trip', 'afterTrip', false,
        'message', 'You are on a trip, and you stay online after it.');
    end if;

    update public.rider
       set presence = 'online', presence_changed_at = now(),
           can_receive_offers = true, offers_paused_reason = null,
           can_receive_offers_source = 'rider',
           offline_after_trip = false,
           last_seen_at = now()
     where id = r.id;
  else
    if r.presence = 'on_trip' then
      /* Finish the trip, then go offline: nobody is left waiting. */
      update public.rider set offline_after_trip = true where id = r.id;
      insert into public.rider_presence_event (rider_id, presence, source)
      values (r.id, 'on_trip', 'rider');
      return jsonb_build_object('ok', true, 'presence', 'on_trip', 'afterTrip', true,
        'message', 'You go offline when this delivery is done.');
    end if;
    update public.rider
       set presence = 'offline', presence_changed_at = now(),
           can_receive_offers = false,
           offers_paused_reason = coalesce(nullif(trim(p_reason), ''), 'off shift'),
           can_receive_offers_source = 'rider',
           offline_after_trip = false
     where id = r.id;
  end if;

  insert into public.rider_presence_event (rider_id, presence, source)
  values (r.id, case when p_online then 'online' else 'offline' end::public.rider_presence,
          'rider');

  return jsonb_build_object('ok', true,
    'presence', case when p_online then 'online' else 'offline' end,
    'afterTrip', false,
    'message', case when p_online
      then 'You are on. Offers will come through.'
      else 'You are off. No more offers until you turn it back on.' end);
end;
$$;

/* The older door, kept for whatever still calls it, now the same rules. */
create or replace function public.rpc_rider_set_presence(p_presence public.rider_presence)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_presence not in ('online', 'offline') then
    return jsonb_build_object('ok', false,
      'reason', 'Only online or offline can be chosen. Trips and cooldowns set themselves.');
  end if;
  begin
    v_result := public.rpc_rider_go_online(p_presence = 'online', null);
  exception when others then
    return jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;
  return v_result;
end;
$$;

-- ═══════════════════════════════════════════════ 6. on a trip, and off it

create or replace function dispatch.tg_job_trip_presence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_on boolean := tg_op = 'UPDATE' and old.state in ('assigned', 'manual_assigned')
                      and old.assigned_rider_id is not null;
  v_is_on boolean := new.state in ('assigned', 'manual_assigned')
                     and new.assigned_rider_id is not null and new.ended_at is null;
  v_ref text;
  r public.rider;
  v_next public.rider_presence;
begin
  /* Coming off: the rider who had it, when it ends or moves to someone else. */
  if v_was_on and (not v_is_on or new.assigned_rider_id is distinct from old.assigned_rider_id) then
    select * into r from public.rider where id = old.assigned_rider_id for update;
    if r.id is not null and r.presence = 'on_trip' and not exists (
         select 1 from dispatch.job j
          where j.assigned_rider_id = r.id and j.id <> new.id
            and j.state in ('assigned', 'manual_assigned') and j.ended_at is null) then
      v_next := case
        when r.cooldown_until is not null and r.cooldown_until > now() then 'cooldown'
        when r.offline_after_trip then 'offline'
        else 'online' end::public.rider_presence;
      update public.rider
         set presence = v_next, presence_changed_at = now(),
             current_order_reference = null,
             offline_after_trip = false,
             can_receive_offers = case when v_next = 'offline' then false else can_receive_offers end,
             offers_paused_reason = case when v_next = 'offline' then 'off shift' else offers_paused_reason end,
             can_receive_offers_source = case when v_next = 'offline' then 'rider' else can_receive_offers_source end
       where id = r.id;
      insert into public.rider_presence_event (rider_id, presence, source)
      values (r.id, v_next, 'system');
      perform audit.log('system'::public.actor_type, 'riders', 'rider.trip_presence',
        p_target_type => 'rider', p_target_id => r.id,
        p_after => jsonb_build_object('presence', v_next, 'job_id', new.id));
    end if;
  end if;

  /* Going on: the rider who now has it. */
  if v_is_on and (not v_was_on or new.assigned_rider_id is distinct from old.assigned_rider_id) then
    select o.reference into v_ref from public.order o where o.id = new.order_id;
    update public.rider
       set presence = 'on_trip', presence_changed_at = now(),
           current_order_reference = v_ref, last_seen_at = now()
     where id = new.assigned_rider_id and presence <> 'on_trip';
    if found then
      insert into public.rider_presence_event (rider_id, presence, source)
      values (new.assigned_rider_id, 'on_trip', 'system');
      perform audit.log('system'::public.actor_type, 'riders', 'rider.trip_presence',
        p_target_type => 'rider', p_target_id => new.assigned_rider_id,
        p_after => jsonb_build_object('presence', 'on_trip', 'job_id', new.id));
    else
      update public.rider set current_order_reference = coalesce(current_order_reference, v_ref)
       where id = new.assigned_rider_id;
    end if;
  end if;

  return null;
end;
$$;

revoke execute on function dispatch.tg_job_trip_presence() from public, anon, authenticated;

drop trigger if exists job_trip_presence on dispatch.job;
create trigger job_trip_presence
  after insert or update of state, assigned_rider_id, ended_at on dispatch.job
  for each row execute function dispatch.tg_job_trip_presence();

-- ═══════════════════════════════════════════════ 8. the rider agreement

create or replace function public.rpc_rider_agreement_current()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rider uuid;
  v record;
begin
  select r.id into v_rider from public.rider r
   where r.user_id = (select auth.uid()) and r.offboarded_at is null
   order by r.updated_at desc limit 1;
  if v_rider is null then
    raise exception 'No rider account on this login.' using errcode = '42501';
  end if;
  select * into v from public.rider_agreement_version where status = 'current';
  if not found then
    return jsonb_build_object('ok', true, 'current', null, 'accepted', true);
  end if;
  return jsonb_build_object('ok', true,
    'current', jsonb_build_object('versionId', v.id, 'version', v.version,
                                  'effectiveFrom', v.effective_from, 'pdfPath', v.pdf_path),
    'accepted', exists (select 1 from public.rider_agreement_acceptance a
                         where a.rider_id = v_rider and a.agreement_version_id = v.id),
    'acceptedAt', (select a.accepted_at from public.rider_agreement_acceptance a
                    where a.rider_id = v_rider and a.agreement_version_id = v.id));
end;
$$;

create or replace function public.rpc_rider_agreement_accept(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider uuid;
  v record;
begin
  select r.id into v_rider from public.rider r
   where r.user_id = (select auth.uid()) and r.offboarded_at is null
     and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
   order by r.updated_at desc limit 1;
  if v_rider is null then
    raise exception 'No rider account on this login.' using errcode = '42501';
  end if;
  select * into v from public.rider_agreement_version where id = p_version_id;
  if not found or v.status <> 'current' then
    raise exception 'That is not the current agreement. Reload and read the current one.'
      using errcode = 'check_violation', hint = 'not_current';
  end if;

  insert into public.rider_agreement_acceptance (rider_id, agreement_version_id, accepted_by)
  values (v_rider, v.id, (select auth.uid()))
  on conflict (rider_id, agreement_version_id) do nothing;

  if found then
    perform audit.log('rider'::public.actor_type, 'riders', 'rider.agreement_accepted',
      p_actor_id => v_rider, p_target_type => 'rider', p_target_id => v_rider,
      p_after => jsonb_build_object('version', v.version));
  end if;

  return jsonb_build_object('ok', true, 'version', v.version);
end;
$$;

revoke execute on function public.rpc_rider_agreement_current() from public, anon;
grant execute on function public.rpc_rider_agreement_current() to authenticated;
revoke execute on function public.rpc_rider_agreement_accept(uuid) from public, anon;
grant execute on function public.rpc_rider_agreement_accept(uuid) to authenticated;

-- ═══════════════════════════════════════════════ 9. shifts: an active rider, soon

create or replace function public.rpc_shift_commit(
  p_zone_id uuid, p_date date, p_window text
)
returns public.shift_commitment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_shift public.shift_commitment;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  select * into v_rider from public.rider where user_id = (select auth.uid())
   order by updated_at desc limit 1;
  if v_rider.id is null then
    raise exception 'You are not a rider.' using errcode = 'insufficient_privilege';
  end if;
  if v_rider.status <> 'active' then
    raise exception 'Shifts open once your account is active.' using errcode = 'check_violation';
  end if;
  if p_date is null or p_date < v_today or p_date > v_today + 14 then
    raise exception 'Pick a day from today to two weeks ahead.' using errcode = 'check_violation';
  end if;
  if coalesce(trim(p_window), '') = '' then
    raise exception 'Pick a time window.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.zone z where z.id = p_zone_id and z.city_id = v_rider.city_id) then
    raise exception 'That area is not in your city.' using errcode = 'check_violation';
  end if;

  insert into public.shift_commitment (rider_id, zone_id, date, time_window)
  values (v_rider.id, p_zone_id, p_date, p_window)
  on conflict (rider_id, zone_id, date, time_window)
    do update set status = 'committed', committed_at = now()
  returning * into v_shift;

  perform audit.log('rider'::public.actor_type, 'riders', 'rider.shift_committed',
    p_actor_id => v_rider.id, p_target_type => 'rider', p_target_id => v_rider.id,
    p_after => jsonb_build_object('date', p_date, 'window', p_window, 'zone_id', p_zone_id));

  return v_shift;
end;
$$;
