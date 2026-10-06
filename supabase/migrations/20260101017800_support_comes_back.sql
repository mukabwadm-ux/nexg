-- Support comes back.
--
-- I folded Support & tickets into Messaging and that was wrong.
-- They are two things and were always meant to be: **Support**
-- holds tickets raised from forms on the website, where somebody
-- states what they need and a person works it to resolved;
-- **Messaging** holds live chat and internal staff
-- conversations. The floating chat is realtime and belongs to
-- Messaging. A form submission is not a chat — nobody is waiting
-- on the other end of it at that second — and collapsing the two
-- lost the queue, the SLA clock and the status a form needs.
--
-- Migrations 016900, 017000 and 017200 did the folding. This
-- undoes the parts that removed Support, and keeps the parts
-- that were independently right: the wiring check, the anon
-- revokes, and Messaging itself.

-- ═══════════════════════════════ the two write paths, restored
--
-- Taken from 20260101005600, not from the original 003000.
-- 005600 is the migration that added the module check after the
-- policies were found to let any staff member read every
-- ticket, and restoring the earlier version silently dropped it
-- again — a finance user could have replied to any ticket whose
-- id they knew, because a security-definer function bypasses
-- the RLS that would otherwise have stopped them. The suite
-- caught it, for the second time.

create or replace function public.rpc_support_ticket_reply(
  p_ticket_id uuid,
  p_body text,
  p_internal boolean default false
)
returns public.support_ticket
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_ticket public.support_ticket;
begin
  if v_staff is null or not (authz.is_super_admin() or authz.reaches_module('support')) then
    raise exception 'You do not work the support desk.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_body), '') = '' then
    raise exception 'Write something.' using errcode = 'check_violation';
  end if;

  insert into public.support_message (ticket_id, from_staff_id, body, internal)
  values (p_ticket_id, v_staff, trim(p_body), p_internal);

  update public.support_ticket
  set
    -- An internal note is not an answer, so it does not start the clock or
    -- move the ticket on.
    first_reply_at = case
      when p_internal then first_reply_at
      else coalesce(first_reply_at, now())
    end,
    status = case
      when p_internal then status
      when status in ('open', 'assigned') then 'answered'::public.ticket_status
      else status
    end,
    assigned_to = coalesce(assigned_to, v_staff)
  where id = p_ticket_id
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'That ticket does not exist.' using errcode = 'no_data_found';
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'support',
    p_action => case when p_internal then 'support.note_added' else 'support.replied' end,
    p_target_type => 'support_ticket',
    p_target_id => p_ticket_id,
    p_after => jsonb_build_object('reference', v_ticket.reference)
  );

  return v_ticket;
end;
$$;

create or replace function public.rpc_support_ticket_set_status(
  p_ticket_id uuid,
  p_status public.ticket_status,
  p_assign_to_me boolean default false
)
returns public.support_ticket
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_ticket public.support_ticket;
  v_was public.ticket_status;
begin
  if v_staff is null or not (authz.is_super_admin() or authz.reaches_module('support')) then
    raise exception 'You do not work the support desk.' using errcode = 'insufficient_privilege';
  end if;

  select status into v_was from public.support_ticket where id = p_ticket_id;

  update public.support_ticket
  set status = p_status,
      assigned_to = case when p_assign_to_me then v_staff else assigned_to end,
      resolved_at = case
        when p_status in ('resolved', 'closed') then coalesce(resolved_at, now())
        else null
      end
  where id = p_ticket_id
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'That ticket does not exist.' using errcode = 'no_data_found';
  end if;

  -- Only on the transition into resolved, and only once. Re-resolving a
  -- ticket must not email somebody twice about the same thing.
  if p_status in ('resolved', 'closed')
     and v_was not in ('resolved', 'closed') then
    insert into public.notification (kind, ticket_id, to_email, status)
    values (
      'ticket_resolved', p_ticket_id, v_ticket.email,
      (case when v_ticket.email is null then 'no_address' else 'pending' end)::public.notification_status
    );
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'support',
    p_action => 'support.status_changed',
    p_target_type => 'support_ticket',
    p_target_id => p_ticket_id,
    p_after => jsonb_build_object('status', p_status, 'reference', v_ticket.reference),
    p_before => jsonb_build_object('status', v_was)
  );

  return v_ticket;
end;
$$;

/*
 * Restoring the bodies restored the original grants with them,
 * and the original granted to PUBLIC — which the wiring check
 * caught straight away. Replying to a ticket and closing one
 * are staff actions; only creating a ticket is public.
 */
revoke execute on function public.rpc_support_ticket_reply(uuid, text, boolean)
  from public, anon;
revoke execute on function public.rpc_support_ticket_set_status(
  uuid, public.ticket_status, boolean) from public, anon;

grant execute on function public.rpc_support_ticket_reply(uuid, text, boolean)
  to authenticated;
grant execute on function public.rpc_support_ticket_set_status(
  uuid, public.ticket_status, boolean) to authenticated;

-- ══════════════════════════════════ the module is back in the rail

insert into public.console_module (key, label, section, href, sort)
values ('support', 'Support & tickets', 'Operate', '/support', 20)
on conflict (key) do update
  set label = excluded.label, href = excluded.href, section = excluded.section;

/* Messaging sorts after it: a ticket queue is the thing somebody
   works through, and live chat is the thing that interrupts. */
update public.console_module set sort = 25 where key = 'messaging';

insert into public.role_module_access (role_key, module_key, level) values
  ('super_admin', 'support', 'full'),
  ('concierge_agent', 'support', 'full'),
  ('concierge_lead', 'support', 'full'),
  ('ops_manager', 'support', 'full'),
  ('city_lead', 'support', 'own_city')
on conflict do nothing;

/*
 * And the roles the permission matrix keeps out stay out. This
 * is the rule 20260101005600 exists for: a ticket carries
 * somebody's name, email and phone, so finance, merchant
 * success, rider ops, HR and the DPO do not reach the module.
 */
delete from public.role_module_access
 where module_key = 'support'
   and role_key in ('finance','merchant_ops','rider_ops','partnerships','hr','dpo','read_only');

-- ════════════════════════════════ its own policies again

drop policy if exists support_ticket_read_staff on public.support_ticket;
create policy support_ticket_read_staff on public.support_ticket
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('support'));

drop policy if exists support_ticket_update_staff on public.support_ticket;
create policy support_ticket_update_staff on public.support_ticket
  for update to authenticated
  using (authz.is_super_admin() or authz.reaches_module('support'));

do $policies$
declare r record;
begin
  for r in
    select polname, pg_get_expr(polqual, polrelid) as qual, polcmd
      from pg_policy
     where polrelid = 'public.support_message'::regclass
       and pg_get_expr(polqual, polrelid) like '%''messaging''%'
  loop
    execute format('drop policy %I on public.support_message', r.polname);
    execute format(
      'create policy %I on public.support_message for %s to authenticated using (%s)',
      r.polname,
      case r.polcmd when 'r' then 'select' when 'w' then 'update' else 'all' end,
      replace(r.qual, '''messaging''::text', '''support''::text'));
  end loop;
end
$policies$;

update audit.action_registry set module = 'support' where action like 'support.%';

-- ════════════════════ what a form actually captured
--
-- A ticket had a body and a handful of columns, which is enough
-- for "something went wrong" and not enough for "a table for
-- four at eight, charged to room 412". The forms on this site
-- ask different questions and a desk agent needs the answers
-- without a second conversation to get them.

alter table support_ticket add column if not exists details jsonb not null default '{}'::jsonb;
alter table support_ticket add column if not exists source_form text;

comment on column support_ticket.details is
  'What the form asked and what they answered, as given. Structured so the desk sees the answers rather than a paragraph somebody has to re-read, and so a form can add a question without a migration.';
comment on column support_ticket.source_form is
  'Which form raised it — homepage_order, help, stay_enquiry. A spike in one form is a question about that form.';

create index if not exists support_ticket_source_idx on support_ticket (source_form, created_at desc);

-- ══════════════════════ the public forms can write again
--
-- Revoked from anon by the wiring sweep, which was right for
-- 154 functions and wrong for this one: the forms on the website
-- are the whole point of a ticket queue, and nobody filling one
-- in has an account.

grant execute on function public.rpc_support_ticket_create(
  text, public.ticket_from, public.ticket_topic, text, text, text, text) to anon, authenticated;

insert into wiring_anon_allow (function_name, reason, guarded_by) values
  ('rpc_support_ticket_create',
   'Every form on the public website raises a ticket, and nobody filling one in has an account',
   'writes only a ticket row; cannot read one back, and the reference is returned rather than the id')
on conflict (function_name) do update
  set reason = excluded.reason, guarded_by = excluded.guarded_by;

-- ═══════════════════ one creator, carrying what the form asked

CREATE OR REPLACE FUNCTION public.rpc_support_ticket_create(p_body text, p_from_role ticket_from DEFAULT 'guest'::ticket_from, p_topic ticket_topic DEFAULT 'something_else'::ticket_topic, p_full_name text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_order_reference text DEFAULT NULL::text, p_details jsonb DEFAULT '{}'::jsonb, p_source_form text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reference text;
  v_recent integer;
  v_ticket_id uuid;
  v_notification_id uuid;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Tell us what happened.' using errcode = 'check_violation';
  end if;

  if v_email is null and v_phone is null then
    raise exception 'Leave an email or a phone number so we can reply.'
      using errcode = 'check_violation';
  end if;

  select count(*) into v_recent
  from public.support_ticket t
  where t.created_at > now() - interval '1 hour'
    and (
      (v_email is not null and t.email = v_email)
      or (v_phone is not null and t.phone = v_phone)
    );

  if v_recent >= 5 then
    raise exception 'We already have your messages and someone is reading them. Give us a moment before sending another.'
      using errcode = 'check_violation';
  end if;

  v_reference := 'NX-T-' || nextval('public.support_ticket_reference_seq')::text;

  insert into public.support_ticket (
    reference, channel, from_role, topic, full_name, email, phone,
    order_reference, body, details, source_form
  )
  values (
    v_reference, 'web_form', p_from_role, p_topic,
    nullif(trim(coalesce(p_full_name, '')), ''), v_email, v_phone,
    nullif(trim(coalesce(p_order_reference, '')), ''), trim(p_body),
    coalesce(p_details, '{}'::jsonb), nullif(trim(coalesce(p_source_form, '')), '')
  )
  returning id into v_ticket_id;

  insert into public.notification (kind, ticket_id, to_email, status)
  values (
    'ticket_received', v_ticket_id, v_email,
    -- A CASE yields text, which will not bind to notification_status.
    (case when v_email is null then 'no_address' else 'pending' end)::public.notification_status
  )
  returning id into v_notification_id;

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type,
    p_module => 'support',
    p_action => 'support.ticket_created',
    p_target_type => 'support_ticket',
    p_target_id => v_ticket_id,
    p_after => jsonb_build_object('reference', v_reference, 'topic', p_topic, 'from', p_from_role)
  );

  /*
   * The notification id goes back so the caller can send the email and report
   * what happened. It is an unguessable uuid and marking it is all it permits
   * — the ticket itself stays unreadable to anyone but staff.
   */
  return jsonb_build_object(
    'reference', v_reference,
    'notification_id', v_notification_id,
    'to_email', v_email
  );
end;
$function$;

/* One creator, not two with different ideas of what a ticket holds. */
drop function if exists public.rpc_support_ticket_create(
  text, public.ticket_from, public.ticket_topic, text, text, text, text);

grant execute on function public.rpc_support_ticket_create(
  text, public.ticket_from, public.ticket_topic, text, text, text, text, jsonb, text)
  to anon, authenticated;

comment on function public.rpc_support_ticket_create is
  'Raises a ticket from any public form. `details` carries what that form asked and what they answered, so the desk reads answers rather than a paragraph, and a form can add a question without a migration.';
