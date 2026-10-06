-- The push actually goes out.
--
-- `user_notification` fills, the bell lights up and nothing
-- reaches a screen, because capturing a subscription is not
-- sending. This is the half that sends: a queue the edge
-- function drains, and a clock that calls it.
--
-- The function runs in Supabase rather than in the web app
-- because sending needs the service role, and the service role
-- is not allowed anywhere near a bundle that reaches a browser.

alter table user_notification
  add column if not exists pushed_at timestamptz;

create index if not exists user_notification_unpushed_idx
  on user_notification (created_at)
  where pushed_at is null;

comment on column user_notification.pushed_at is
  'When this was handed to the push services. Null means due. Separate from read_at: a notification can be pushed and unread, which is the normal case.';

/* An update re-queues it, the same way it marks it unread —
   the newest state of a delivery is the one worth a buzz. */
create or replace function tg_notification_requeues_push()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at is distinct from old.updated_at then
    new.pushed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_requeues_push on user_notification;
create trigger notification_requeues_push
  before update on user_notification
  for each row execute function tg_notification_requeues_push();

-- ════════════════════════════════════ what the function reads

create or replace function rpc_push_due(p_limit integer default 200)
returns table (
  id uuid,
  user_id uuid,
  title text,
  body text,
  href text,
  tag text
)
language sql
security definer
set search_path = ''
as $$
  select n.id, n.user_id, n.title, n.body, n.href, n.tag
    from public.user_notification n
   where n.pushed_at is null
     /*
      * Nothing older than an hour. A backlog from an outage is
      * not worth buzzing somebody's phone about at 3am — the
      * bell still has it, and "your rider is nearly there" sent
      * two hours late is worse than not sent.
      */
     and n.created_at > now() - interval '1 hour'
   order by n.created_at
   limit greatest(1, least(p_limit, 500));
$$;

create or replace function rpc_push_mark_sent(p_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with marked as (
    update public.user_notification
       set pushed_at = now()
     where id = any (p_ids)
    returning 1
  )
  select count(*)::integer from marked;
$$;

create or replace function rpc_push_retire(p_endpoints text[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with retired as (
    update public.push_subscription
       set failed_at = now(),
           failure_reason = 'the push service says this subscription is gone'
     where endpoint = any (p_endpoints)
    returning 1
  )
  select count(*)::integer from retired;
$$;

/*
 * Only the function may call these. They read every user's
 * notifications and every device's address, which is exactly
 * what a sender needs and exactly what nothing else should
 * have.
 */
revoke execute on function rpc_push_due(integer) from public, anon, authenticated;
revoke execute on function rpc_push_mark_sent(uuid[]) from public, anon, authenticated;
revoke execute on function rpc_push_retire(text[]) from public, anon, authenticated;
grant execute on function rpc_push_due(integer) to service_role;
grant execute on function rpc_push_mark_sent(uuid[]) to service_role;
grant execute on function rpc_push_retire(text[]) to service_role;

insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_push_mark_sent', 'Bookkeeping by the sender, not a person acting',
   'user_notification.pushed_at'),
  ('rpc_push_retire', 'A push service telling us a subscription is gone',
   'push_subscription.failed_at and failure_reason')
on conflict (function_name) do nothing;

-- ══════════════════════════════════════════════ the clock
--
-- pg_cron calls the function over HTTP through pg_net. The
-- shared secret lives in Vault rather than in a settings row,
-- because a row is readable by anything that can read rows.

create extension if not exists pg_net with schema extensions;

create or replace function cron_push_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_request bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_dispatch_secret';

  if v_url is null or v_secret is null then
    /*
     * Not an exception. A cron that raises every minute fills
     * the log and tells nobody; this returns the reason, and
     * the reason names the two secrets to create.
     */
    return jsonb_build_object(
      'ok', false,
      'message', 'push_dispatch_url or push_dispatch_secret is missing from Vault — nothing was sent.');
  end if;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-push-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into v_request;

  return jsonb_build_object('ok', true, 'request_id', v_request);
end;
$$;

revoke execute on function cron_push_dispatch() from public, anon, authenticated;
grant execute on function cron_push_dispatch() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; push dispatch is not scheduled.';
    return;
  end if;
  /*
   * Every minute. A delivery notification that arrives ninety
   * seconds late is still useful; one that waits for a
   * five-minute tick is somebody already at the door.
   */
  perform cron.schedule('push-dispatch', '* * * * *',
    $sched$select public.cron_push_dispatch()$sched$);
end
$cron$;

comment on function cron_push_dispatch is
  'Calls the push-dispatch edge function every minute. Reads its URL and shared secret from Vault, and says which is missing rather than raising into a log nobody reads.';
