-- Telling people what happened to their ticket.
--
-- Two moments matter: we received it, and we finished with it. Both are
-- recorded here whether or not an email actually goes out, because a record
-- that a notification was *due* is what lets the desk see who has not been
-- told — and there is no email provider configured yet.
--
-- The row says who should hear and about what. It does not hold the words:
-- email copy is prose, it changes, and it belongs in the repository where it
-- can be reviewed in a pull request rather than in a database column.

create type public.notification_kind as enum (
  'ticket_received',
  'ticket_resolved'
);

create type public.notification_status as enum (
  'pending',
  'sent',
  'failed',
  -- No address to write to. Not a failure: plenty of people leave a phone
  -- number instead, and counting those as errors hides the real ones.
  'no_address'
);

create table public.notification (
  id uuid primary key default gen_random_uuid(),
  kind public.notification_kind not null,
  ticket_id uuid references public.support_ticket (id) on delete cascade,
  to_email text,
  status public.notification_status not null default 'pending',
  /* Whatever the provider called it, so a bounce can be traced back. */
  provider_message_id text,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz not null default now(),

  constraint notification_sent_is_attributed check (
    status <> 'sent' or sent_at is not null
  ),
  constraint notification_failure_has_reason check (
    status <> 'failed' or coalesce(trim(error), '') <> ''
  )
);

create index notification_pending_idx
  on public.notification (created_at)
  where status = 'pending';

create index notification_ticket_idx on public.notification (ticket_id, created_at desc);

comment on table public.notification is
  'A message that is due to someone. Recorded even when it cannot be sent, so the desk can see who has not been told.';

alter table public.notification enable row level security;

/*
 * Staff only. A notification row names an email address and what it was
 * about; nobody outside the desk has business reading the list.
 */
create policy notification_read_staff on public.notification
  for select to authenticated
  using (authz.staff_id() is not null);

-- ------------------------------------------------- enqueue on ticket create
--
-- Dropped rather than replaced: the return type changes from the bare
-- reference to an object carrying the notification id, and Postgres will not
-- let `create or replace` change a signature's return type.

drop function if exists public.rpc_support_ticket_create(
  text, public.ticket_from, public.ticket_topic, text, text, text, text
);

create function public.rpc_support_ticket_create(
  p_body text,
  p_from_role public.ticket_from default 'guest',
  p_topic public.ticket_topic default 'something_else',
  p_full_name text default null,
  p_email text default null,
  p_phone text default null,
  p_order_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    order_reference, body
  )
  values (
    v_reference, 'web_form', p_from_role, p_topic,
    nullif(trim(coalesce(p_full_name, '')), ''), v_email, v_phone,
    nullif(trim(coalesce(p_order_reference, '')), ''), trim(p_body)
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
$$;

comment on function public.rpc_support_ticket_create is
  'Creates a ticket and queues the acknowledgement. Returns the reference and the notification id, never the ticket: the table is staff-read-only.';

-- ------------------------------------------- enqueue on resolve, and report

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
  if v_staff is null then
    raise exception 'Only staff can change a ticket.' using errcode = 'insufficient_privilege';
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

create or replace function public.rpc_notification_mark(
  p_notification_id uuid,
  p_status public.notification_status,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status = 'pending' then
    raise exception 'Report an outcome, not a re-queue.' using errcode = 'check_violation';
  end if;

  update public.notification
  set status = p_status,
      provider_message_id = nullif(trim(coalesce(p_provider_message_id, '')), ''),
      error = nullif(trim(coalesce(p_error, '')), ''),
      attempts = attempts + 1,
      sent_at = now()
  where id = p_notification_id
    -- Only ever moves a pending row on. The id is a capability, and this is
    -- the limit of what holding it allows.
    and status = 'pending';
end;
$$;

comment on function public.rpc_notification_mark is
  'Records what happened when a queued notification was attempted. Moves pending rows only, so holding the id cannot rewrite history.';

grant execute on function public.rpc_support_ticket_create(
  text, public.ticket_from, public.ticket_topic, text, text, text, text
) to anon, authenticated;

grant execute on function public.rpc_notification_mark(
  uuid, public.notification_status, text, text
) to anon, authenticated;

grant execute on function public.rpc_support_ticket_set_status(
  uuid, public.ticket_status, boolean
) to authenticated, service_role;
