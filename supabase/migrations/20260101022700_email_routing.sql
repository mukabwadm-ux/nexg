-- Which address each kind of website email is sent from.
--
-- A row per kind of email, editable in Admin > Settings > Email
-- routing. The queue reads it when a message is enqueued, so a
-- change applies to everything sent after it without a deploy.

create table if not exists public.email_route (
  key text primary key,
  label text not null,
  description text,
  from_name text not null default 'NexG',
  from_email text not null,
  reply_to text,
  /* Internal inbox for alerts that go to the team, where relevant. */
  recipient text,
  enabled boolean not null default true,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint email_route_from_valid check (from_email ~* '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$'),
  constraint email_route_reply_valid check (reply_to is null or reply_to ~* '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$'),
  constraint email_route_recipient_valid check (recipient is null or recipient ~* '^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$'),
  constraint email_route_name_clean check (from_name !~ '[<>\r\n]')
);

alter table public.email_route enable row level security;

insert into public.email_route (key, label, description, from_name, from_email, reply_to, recipient) values
  ('forms', 'Form alerts to the team', 'Contact, host, rider, merchant, job and waitlist submissions. "Deliver to" is the inbox that receives them.', 'NexG Website', 'info@nexgapp.com', null, 'info@nexgapp.com'),
  ('receipts', 'Applicant receipts', 'The "we got your application" email to job and host applicants.', 'NexG', 'info@nexgapp.com', 'info@nexgapp.com', null),
  ('support', 'Support ticket replies', 'Acknowledgements and replies to people who wrote to help.', 'NexG Support', 'info@nexgapp.com', 'info@nexgapp.com', null),
  ('guest_updates', 'Guest order and refund updates', 'Order confirmed, delivered, cancelled and refund emails to guests.', 'NexG', 'info@nexgapp.com', 'info@nexgapp.com', null),
  ('partner_updates', 'Merchant, rider and host updates', 'Approved, paused, suspended and similar status emails to partners.', 'NexG Partners', 'info@nexgapp.com', 'info@nexgapp.com', null),
  ('staff_alerts', 'Staff notifications', 'New merchants, riders, hosts, refunds and other alerts to staff inboxes.', 'NexG Alerts', 'info@nexgapp.com', null, null),
  ('finance', 'Finance, invoices and statements', 'Tax invoices, host statements and anything about money. "Deliver to" is the internal copy inbox.', 'NexG Finance', 'finance@nexgapp.com', 'finance@nexgapp.com', 'finance@nexgapp.com'),
  ('general', 'Everything else', 'Any email that does not fit a kind above.', 'NexG', 'info@nexgapp.com', 'info@nexgapp.com', null)
on conflict (key) do nothing;

create or replace function public.fn_email_route_for(p_template text)
returns text
language sql
immutable
as $$
  select case
    when p_template like 'form\_%' then 'forms'
    when p_template in ('job_receipt', 'host_receipt') then 'receipts'
    when p_template like 'ticket%' or p_template like 'support%' then 'support'
    when p_template like 'bell\_staff.%' or p_template like 'staff\_%' then 'staff_alerts'
    when p_template like 'bell\_order.%' or p_template like 'bell\_refund.%' then 'guest_updates'
    when p_template like 'bell\_rider.%' or p_template like 'bell\_merchant.%'
      or p_template like 'partner\_%' or p_template like 'host\_%' then 'partner_updates'
    when p_template like 'finance%' or p_template like 'invoice%'
      or p_template like 'tax%' or p_template like 'statement%' then 'finance'
    else 'general'
  end
$$;

-- ───────────────────────────────────── the queue reads the route

create or replace function public.fn_notify_enqueue(
  p_channel text,
  p_recipient text,
  p_template text,
  p_body text,
  p_subject text default null,
  p_payload jsonb default '{}'::jsonb,
  p_sensitive boolean default false,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log uuid;
  v_id uuid;
  v_route public.email_route;
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_channel = 'email' then
    select * into v_route from public.email_route
     where key = public.fn_email_route_for(p_template);

    if found then
      if not v_route.enabled then
        insert into public.notification_log (channel, recipient, template, payload, status, error)
        values (p_channel, coalesce(p_recipient, '(none on file)'), p_template, v_payload, 'skipped',
                'Switched off in Settings > Email routing (' || v_route.key || ')');
        return null;
      end if;
      if not (v_payload ? 'from') then
        v_payload := v_payload || jsonb_build_object(
          'from', v_route.from_name || ' <' || v_route.from_email || '>');
      end if;
      if not (v_payload ? 'reply_to') and v_route.reply_to is not null then
        v_payload := v_payload || jsonb_build_object('reply_to', v_route.reply_to);
      end if;
    end if;
  end if;

  if p_recipient is null or btrim(p_recipient) = '' then
    insert into public.notification_log (channel, recipient, template, payload, status, error)
    values (p_channel, '(none on file)', p_template, v_payload, 'skipped',
            'No address on file for this person')
    returning id into v_log;
    return null;
  end if;

  insert into public.notification_log (channel, recipient, template, payload, status)
  values (p_channel, p_recipient, p_template, v_payload, 'queued')
  returning id into v_log;

  insert into public.notification_outbox (
    channel, recipient, template, subject, body, payload,
    sensitive, expires_at, notification_log_id)
  values (
    p_channel, p_recipient, p_template, p_subject, p_body, v_payload,
    p_sensitive, p_expires_at, v_log)
  returning id into v_id;

  return v_id;
end;
$$;

-- Form alerts go to whichever inbox the "forms" route names.
create or replace function public.fn_form_alert(
  p_template text,
  p_subject text,
  p_lines text[],
  p_reply_to text default null,
  p_href text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to text;
begin
  select coalesce(r.recipient, 'info@nexgapp.com') into v_to
    from public.email_route r where r.key = 'forms';

  perform public.fn_notify_enqueue(
    p_channel => 'email',
    p_recipient => coalesce(v_to, 'info@nexgapp.com'),
    p_template => p_template,
    p_subject => p_subject,
    p_body => array_to_string(p_lines, E'\n')
      || case when p_href is null then ''
              else E'\n\nOpen in admin: https://admin.nexgapp.com' || p_href end,
    p_payload => jsonb_strip_nulls(jsonb_build_object(
      'reply_to', nullif(trim(coalesce(p_reply_to, '')), ''))),
    p_sensitive => false);
end;
$$;

-- ───────────────────────────────────── reading and editing

create or replace function authz.can_edit_email_routes()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin() or exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    join public.staff_user su on su.id = rg.staff_user_id
    join public.role_module_access a on a.role_key = r.key
    where su.user_id = (select auth.uid())
      and su.status = 'active'
      and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at > now())
      and a.module_key = 'settings'
      and a.level = 'full')
$$;

grant execute on function authz.can_edit_email_routes() to authenticated, service_role;

create or replace function public.rpc_email_routes()
returns table (
  key text, label text, description text, from_name text, from_email text,
  reply_to text, recipient text, enabled boolean, updated_at timestamptz,
  sent_30d bigint, failed_30d bigint, can_edit boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.reaches_module('settings') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return query
    select r.key, r.label, r.description, r.from_name, r.from_email, r.reply_to,
           r.recipient, r.enabled, r.updated_at,
           (select count(*) from public.notification_outbox o
             where o.channel = 'email' and o.status = 'sent'
               and o.created_at > now() - interval '30 days'
               and public.fn_email_route_for(o.template) = r.key),
           (select count(*) from public.notification_outbox o
             where o.channel = 'email' and o.status in ('failed', 'abandoned')
               and o.created_at > now() - interval '30 days'
               and public.fn_email_route_for(o.template) = r.key),
           authz.can_edit_email_routes()
      from public.email_route r
     order by r.label;
end;
$$;

create or replace function public.rpc_email_route_set(
  p_key text,
  p_from_name text,
  p_from_email text,
  p_reply_to text,
  p_recipient text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not authz.can_edit_email_routes() then
    raise exception 'Only a super admin or someone with full Settings access can change this.'
      using errcode = '42501';
  end if;

  update public.email_route set
    from_name = coalesce(nullif(trim(p_from_name), ''), from_name),
    from_email = lower(trim(p_from_email)),
    reply_to = nullif(lower(trim(coalesce(p_reply_to, ''))), ''),
    recipient = nullif(lower(trim(coalesce(p_recipient, ''))), ''),
    enabled = coalesce(p_enabled, enabled),
    updated_by = (select auth.uid()),
    updated_at = now()
   where key = p_key;

  if not found then
    raise exception 'Unknown email kind.' using errcode = '22023';
  end if;

  perform audit.log('staff'::public.actor_type, 'audit', 'email_route.updated',
    p_target_type => 'email_route', p_target_label => p_key,
    p_after => jsonb_build_object('from_email', p_from_email, 'reply_to', p_reply_to,
                                  'recipient', p_recipient, 'enabled', p_enabled));

  return jsonb_build_object('ok', true);
exception when check_violation then
  raise exception 'One of those addresses is not a valid email.' using errcode = '22023';
end;
$$;

-- Callable by the website for its own direct sends (ticket replies).
create or replace function public.rpc_email_route_public(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'from', r.from_name || ' <' || r.from_email || '>',
    'reply_to', r.reply_to,
    'enabled', r.enabled)
  from public.email_route r where r.key = p_key
$$;

revoke execute on function public.rpc_email_routes() from public, anon;
revoke execute on function public.rpc_email_route_set(text, text, text, text, text, boolean) from public, anon;
grant execute on function public.rpc_email_routes() to authenticated;
grant execute on function public.rpc_email_route_set(text, text, text, text, text, boolean) to authenticated;
grant execute on function public.rpc_email_route_public(text) to anon, authenticated, service_role;
