-- Support tickets — the `Help & Contact` and `Concierge desk` artboards.
--
-- The contact form had nowhere to send anything. Every message it collects
-- becomes a ticket here, and the concierge desk in the console is the other
-- end of the same table.
--
-- Deliberately not the same thing as a concierge *request* for goods. That is
-- an order with a quote and a rider, and it needs the orders domain. This is
-- somebody asking a question or reporting a problem, which is answerable with
-- a conversation and nothing else.

create type public.ticket_channel as enum ('web_form', 'whatsapp', 'phone', 'email', 'in_app');

create type public.ticket_from as enum ('guest', 'rider', 'merchant', 'hotel');

create type public.ticket_status as enum ('open', 'assigned', 'answered', 'resolved', 'closed');

create type public.ticket_topic as enum (
  'order_problem',
  'payment_or_refund',
  'account',
  'concierge_request',
  'partner_rider',
  'partner_merchant',
  'hotel_partnership',
  'something_else'
);

create table public.support_ticket (
  id uuid primary key default gen_random_uuid(),
  /*
   * A short reference a person can read down a phone line. Generated from a
   * sequence rather than the uuid: "NX-T-1042" survives being repeated aloud
   * in a noisy hotel lobby and a uuid does not.
   */
  reference text not null unique,
  channel public.ticket_channel not null default 'web_form',
  from_role public.ticket_from not null default 'guest',
  topic public.ticket_topic not null default 'something_else',

  full_name text,
  email text,
  phone text,
  /* Free text: there are no orders yet, so this is whatever they were given. */
  order_reference text,

  body text not null,
  status public.ticket_status not null default 'open',
  assigned_to uuid references public.staff_user (id) on delete set null,
  city_id uuid references public.city (id) on delete set null,

  /* Set the first time a staff member replies; the desk measures itself on it. */
  first_reply_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint support_ticket_body_not_blank check (length(trim(body)) > 0),
  constraint support_ticket_has_a_way_back check (
    coalesce(trim(email), '') <> '' or coalesce(trim(phone), '') <> ''
  ),
  constraint support_ticket_email_shape check (
    email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint support_ticket_resolution_is_timed check (
    status not in ('resolved', 'closed') or resolved_at is not null
  )
);

create sequence public.support_ticket_reference_seq start 1000;

create index support_ticket_queue_idx
  on public.support_ticket (status, created_at)
  where status in ('open', 'assigned');

create index support_ticket_assigned_idx on public.support_ticket (assigned_to, status);

create trigger support_ticket_set_updated_at
  before update on public.support_ticket
  for each row execute function public.tg_set_updated_at();

comment on table public.support_ticket is
  'A question or a problem from a guest, rider, merchant or hotel. Not a concierge order — that needs a quote and a rider, and lives in the orders domain.';

-- ------------------------------------------------------------------ replies

create table public.support_message (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_ticket (id) on delete cascade,
  /*
   * `staff` or the person who raised it. No enum for "system" — an automatic
   * note is not a message someone sent, and pretending otherwise makes the
   * transcript untrustworthy.
   */
  from_staff_id uuid references public.staff_user (id) on delete set null,
  body text not null,
  /* A note the desk keeps to itself; never shown to the person. */
  internal boolean not null default false,
  created_at timestamptz not null default now(),

  constraint support_message_body_not_blank check (length(trim(body)) > 0),
  constraint support_message_internal_is_staff check (not internal or from_staff_id is not null)
);

create index support_message_ticket_idx on public.support_message (ticket_id, created_at);

comment on table public.support_message is
  'A reply on a ticket. `internal` notes are for the desk and are never returned to the person who wrote in.';

-- --------------------------------------------------------------------- RLS

alter table public.support_ticket enable row level security;
alter table public.support_message enable row level security;

/*
 * Nobody reads tickets except staff. The rows hold other people's contact
 * details and whatever they chose to tell us, so there is no owner-read
 * policy: a guest gets their answer by email or phone, not by querying the
 * table. Creating one goes through the RPC below.
 */
create policy support_ticket_read_staff on public.support_ticket
  for select to authenticated
  using (authz.staff_id() is not null);

create policy support_ticket_update_staff on public.support_ticket
  for update to authenticated
  using (authz.staff_id() is not null)
  with check (authz.staff_id() is not null);

create policy support_message_read_staff on public.support_message
  for select to authenticated
  using (authz.staff_id() is not null);

create policy support_message_insert_staff on public.support_message
  for insert to authenticated
  with check (authz.staff_id() is not null and from_staff_id = authz.staff_id());

-- --------------------------------------------------------------------- RPCs

create or replace function public.rpc_support_ticket_create(
  p_body text,
  p_from_role public.ticket_from default 'guest',
  p_topic public.ticket_topic default 'something_else',
  p_full_name text default null,
  p_email text default null,
  p_phone text default null,
  p_order_reference text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reference text;
  v_recent integer;
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

  /*
   * The form takes no session, so without a limit one script fills the desk's
   * queue overnight. Counted per contact detail rather than per IP, which the
   * database cannot see.
   */
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
  );

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type,
    p_module => 'support',
    p_action => 'support.ticket_created',
    p_target_type => 'support_ticket',
    p_after => jsonb_build_object('reference', v_reference, 'topic', p_topic, 'from', p_from_role)
  );

  -- Only the reference goes back. Returning the row would hand an anonymous
  -- caller a read of a table that has no read policy for them.
  return v_reference;
end;
$$;

comment on function public.rpc_support_ticket_create is
  'Creates a ticket from the public contact form. Returns only the reference: the table itself is staff-read-only.';

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
  if v_staff is null then
    raise exception 'Only staff can reply to a ticket.' using errcode = 'insufficient_privilege';
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
begin
  if v_staff is null then
    raise exception 'Only staff can change a ticket.' using errcode = 'insufficient_privilege';
  end if;

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

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'support',
    p_action => 'support.status_changed',
    p_target_type => 'support_ticket',
    p_target_id => p_ticket_id,
    p_after => jsonb_build_object('status', p_status, 'reference', v_ticket.reference)
  );

  return v_ticket;
end;
$$;

grant execute on function public.rpc_support_ticket_create(
  text, public.ticket_from, public.ticket_topic, text, text, text, text
) to anon, authenticated;

grant execute on function public.rpc_support_ticket_reply(uuid, text, boolean)
  to authenticated, service_role;
grant execute on function public.rpc_support_ticket_set_status(
  uuid, public.ticket_status, boolean
) to authenticated, service_role;
