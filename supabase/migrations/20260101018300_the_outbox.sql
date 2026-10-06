-- The outbox.
--
-- `notification_log` records that a message was called for. It
-- does not carry the message, and it cannot: every staff member
-- can read it, and some of what we send is a one-time code.
--
-- That gap is currently hidden by a fallback. When no SMS
-- provider is configured, `rpc_merchant_request_phone_code`
-- returns the code to the caller so the screen can show it. The
-- flow works. But the moment somebody sets `sms_provider`, the
-- code stops being returned *and* the queued row has nothing in
-- it to send — so switching the provider on is what breaks OTP
-- delivery, not leaving it off. A config change that breaks the
-- thing it was meant to enable is the worst kind, because the
-- person who makes it is the last person who would suspect it.
--
-- So: a second table that holds the rendered message, readable
-- by nothing but the sender, redacted the moment it is sent.
-- `notification_log` stays exactly as it is — the record that
-- something was sent, for anyone who may see that. The outbox is
-- the envelope, and it is sealed.

create table if not exists notification_outbox (
  id uuid primary key default gen_random_uuid(),

  channel text not null check (channel in ('sms', 'email', 'whatsapp')),
  recipient text not null,
  template text not null,

  /* The rendered message. Nulled on send when `sensitive`. */
  subject text,
  body text,

  /* Context for the provider and for debugging. Never secrets:
     this survives redaction. */
  payload jsonb not null default '{}'::jsonb,

  /*
   * Whether the body must be destroyed after sending. True for
   * anything containing a credential — a one-time code, a
   * password link. The row stays, so the audit question "was it
   * sent?" is still answerable; only the contents go.
   */
  sensitive boolean not null default false,

  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'abandoned')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,

  provider text,
  provider_ref text,

  /*
   * How long this is worth sending. A one-time code that expires
   * in five minutes must not go out eleven minutes later: the
   * person has already given up, and a code arriving after the
   * fact teaches them the system is unreliable at exactly the
   * moment they were deciding whether to trust it.
   */
  expires_at timestamptz,

  notification_log_id uuid references notification_log (id) on delete set null,

  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_outbox_due_idx
  on notification_outbox (next_attempt_at)
  where status = 'pending';

create index if not exists notification_outbox_recent_idx
  on notification_outbox (created_at desc);

comment on table notification_outbox is
  'The rendered messages waiting to go out. Readable by the sender alone; the body of a sensitive message is destroyed the moment it is sent. notification_log says a message happened, this one holds it.';

/*
 * Nobody reads this table.
 *
 * RLS is on with no policy at all, which denies every
 * authenticated and anonymous caller. `service_role` bypasses
 * RLS, which is how the sender gets in, and the grants below
 * make sure nothing else has even the option.
 */
alter table notification_outbox enable row level security;

revoke all on notification_outbox from public, anon, authenticated;
grant select, insert, update on notification_outbox to service_role;

-- ════════════════════════════════════════ what staff may see

/*
 * The envelope, not the letter.
 *
 * Staff need to answer "did the code reach them?" without being
 * able to read the code. Recipients are masked for the same
 * reason the rest of this console masks them: a support screen
 * is also a screen somebody can be looking over.
 */
/*
 * The envelope, not the letter.
 *
 * Staff need to answer "did the code reach them?" without being
 * able to read the code. The view runs as its owner so it can
 * read a table the caller cannot — which means the view has to
 * do the checking the table's RLS would have done, and this is
 * that check. Recipients are masked for the same reason the
 * rest of this console masks them: a support screen is also a
 * screen somebody can be standing behind.
 */
create or replace function authz_outbox_readable()
returns boolean
language sql
stable
set search_path = ''
as $$ select authz.staff_id() is not null $$;

create or replace view notification_outbox_v
with (security_invoker = false) as
select * from (
  select
    o.id,
    o.channel,
    case
      when o.recipient like '+%' and length(o.recipient) > 6
        then left(o.recipient, 4) || repeat('•', greatest(0, length(o.recipient) - 7))
             || right(o.recipient, 3)
      when position('@' in o.recipient) > 1
        then left(o.recipient, 1) || '•••@' || split_part(o.recipient, '@', 2)
      else '•••'
    end as recipient_masked,
    o.template,
    o.sensitive,
    o.status,
    o.attempts,
    o.next_attempt_at,
    o.last_error,
    o.provider,
    o.expires_at,
    o.created_at,
    o.sent_at,
    case
      when o.sensitive and o.sent_at is not null then 'destroyed after sending'
      when o.sensitive then 'hidden — contains a one-time code'
      else o.body
    end as body_or_reason
  from public.notification_outbox o
) rows
where public.authz_outbox_readable();

alter view notification_outbox_v owner to postgres;
grant select on notification_outbox_v to authenticated;

-- ══════════════════════════════════════════════ enqueueing

/*
 * The one way in.
 *
 * Writes both halves in one statement: the log row that staff
 * can see and the outbox row that only the sender can. They
 * cannot drift because nothing else is allowed to write either.
 */
create or replace function fn_notify_enqueue(
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
begin
  if p_recipient is null or btrim(p_recipient) = '' then
    /*
     * Not an exception. A missing phone number is a data
     * problem, not a sending problem, and raising here would
     * roll back whatever action was trying to notify somebody —
     * failing to tell a rider their shift changed should not
     * also fail to change their shift.
     */
    insert into public.notification_log (channel, recipient, template, payload, status, error)
    values (p_channel, '(none on file)', p_template, p_payload, 'skipped',
            'No address on file for this person')
    returning id into v_log;
    return null;
  end if;

  insert into public.notification_log (channel, recipient, template, payload, status)
  values (p_channel, p_recipient, p_template, p_payload, 'queued')
  returning id into v_log;

  insert into public.notification_outbox (
    channel, recipient, template, subject, body, payload,
    sensitive, expires_at, notification_log_id)
  values (
    p_channel, p_recipient, p_template, p_subject, p_body, p_payload,
    p_sensitive, p_expires_at, v_log)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function fn_notify_enqueue(text, text, text, text, text, jsonb, boolean, timestamptz)
  from public, anon, authenticated;

comment on function fn_notify_enqueue is
  'The only way a message enters the queue. Writes the visible log row and the sealed outbox row together so the two cannot drift.';

-- ══════════════════════════════════ what the sender may call

create or replace function rpc_outbox_due(p_limit integer default 50)
returns table (
  id uuid,
  channel text,
  recipient text,
  template text,
  subject text,
  body text,
  payload jsonb,
  attempts integer
)
language sql
security definer
set search_path = ''
as $$
  select o.id, o.channel, o.recipient, o.template, o.subject, o.body, o.payload, o.attempts
    from public.notification_outbox o
   where o.status = 'pending'
     and o.next_attempt_at <= now()
     and (o.expires_at is null or o.expires_at > now())
   order by o.next_attempt_at
   limit greatest(1, least(p_limit, 200));
$$;

create or replace function rpc_outbox_sent(
  p_id uuid,
  p_provider text,
  p_provider_ref text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_outbox
     set status = 'sent',
         sent_at = now(),
         provider = p_provider,
         provider_ref = p_provider_ref,
         attempts = attempts + 1,
         /* The whole point of the table. */
         body = case when sensitive then null else body end,
         subject = case when sensitive then null else subject end
   where id = p_id;

  update public.notification_log
     set status = 'sent', sent_at = now(), provider_id = p_provider_ref
   where id = (select notification_log_id
                 from public.notification_outbox where id = p_id);
end;
$$;

create or replace function rpc_outbox_failed(
  p_id uuid,
  p_error text,
  p_retryable boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_status text;
  v_next timestamptz;
begin
  select attempts + 1 into v_attempts
    from public.notification_outbox where id = p_id;

  /*
   * Five attempts, backing off 1, 4, 9, 16 minutes. Quadratic
   * rather than exponential: a provider blip clears in minutes
   * and doubling overshoots it, while a real outage is going to
   * need a person either way.
   */
  if not p_retryable or v_attempts >= 5 then
    v_status := 'abandoned';
    v_next := now();
  else
    v_status := 'pending';
    v_next := now() + (v_attempts * v_attempts || ' minutes')::interval;
  end if;

  update public.notification_outbox
     set status = v_status,
         attempts = v_attempts,
         next_attempt_at = v_next,
         last_error = p_error
   where id = p_id;

  if v_status = 'abandoned' then
    update public.notification_log
       set status = 'failed', error = p_error
     where id = (select notification_log_id
                   from public.notification_outbox where id = p_id);
  end if;
end;
$$;

revoke execute on function rpc_outbox_due(integer) from public, anon, authenticated;
revoke execute on function rpc_outbox_sent(uuid, text, text) from public, anon, authenticated;
revoke execute on function rpc_outbox_failed(uuid, text, boolean) from public, anon, authenticated;
grant execute on function rpc_outbox_due(integer) to service_role;
grant execute on function rpc_outbox_sent(uuid, text, text) to service_role;
grant execute on function rpc_outbox_failed(uuid, text, boolean) to service_role;

insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  ('fn_notify_enqueue', 'Queueing a message, recorded in notification_log itself',
   'notification_log'),
  ('rpc_outbox_due', 'The sender reading its own queue', 'notification_outbox'),
  ('rpc_outbox_sent', 'The sender recording a delivery', 'notification_outbox.sent_at'),
  ('rpc_outbox_failed', 'The sender recording a failure', 'notification_outbox.last_error')
on conflict (function_name) do nothing;

-- ═══════════════════════════════════════════════ the clock

create or replace function cron_notify_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request bigint;
  v_waiting integer;
begin
  select count(*) into v_waiting
    from public.notification_outbox
   where status = 'pending' and next_attempt_at <= now()
     and (expires_at is null or expires_at > now());

  if v_waiting = 0 then
    return jsonb_build_object('ok', true, 'waiting', 0);
  end if;

  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_dispatch_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_dispatch_secret';

  if v_url is null or v_secret is null then
    return jsonb_build_object(
      'ok', false,
      'waiting', v_waiting,
      'message', 'notify_dispatch_url or notify_dispatch_secret is missing from Vault — '
                 || v_waiting || ' message(s) are waiting and nothing was sent.');
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-dispatch-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  ) into v_request;

  return jsonb_build_object('ok', true, 'waiting', v_waiting, 'request_id', v_request);
end;
$$;

revoke execute on function cron_notify_dispatch() from public, anon, authenticated;
grant execute on function cron_notify_dispatch() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; notification dispatch is not scheduled.';
    return;
  end if;
  perform cron.schedule('notify-dispatch', '* * * * *',
    $sched$select public.cron_notify_dispatch()$sched$);
end
$cron$;

comment on function cron_notify_dispatch is
  'Calls the notify-dispatch edge function every minute. Counts what is waiting first, so a missing secret reports how much is piling up behind it rather than only that it is missing.';
