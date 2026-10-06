-- A bell for every user.
--
-- `notification` already exists and is not this. It is the
-- outbound queue — who to email, which provider took it, did it
-- fail — keyed by a ticket or a plan. It answers "did we manage
-- to tell them", which is a different question from "what has
-- happened on my account".
--
-- This is the second one. One row per person per thing that
-- happened to them, readable by that person and nobody else,
-- with somewhere to go when they tap it.
--
-- Keyed on `auth.users.id` rather than on guest or merchant or
-- rider, because a person is one person. Somebody who orders
-- dinner and also runs a shop has one bell, and a notification
-- about their payout and one about their delivery sit in the
-- same list in the order they happened.

create type notification_tone as enum ('info', 'good', 'warning', 'urgent');

create table user_notification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  kind text not null,
  title text not null,
  body text,
  tone notification_tone not null default 'info',

  /* Where tapping it goes. A notification that tells somebody
     something happened and leaves them to find it is half a
     notification. */
  href text,

  object_type text,
  object_id uuid,

  /*
   * The tag is how an update replaces rather than stacks. Ten
   * steps of one delivery are one row that keeps changing, not
   * ten rows — the platform spec is emphatic about this for the
   * lock screen, and it is just as true for the bell.
   */
  tag text,

  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notification_has_a_title check (coalesce(trim(title), '') <> '')
);

create index user_notification_inbox_idx
  on user_notification (user_id, created_at desc);
create index user_notification_unread_idx
  on user_notification (user_id) where read_at is null;
create unique index user_notification_tag_idx
  on user_notification (user_id, tag) where tag is not null;

comment on table user_notification is
  'What has happened on a person''s account. Distinct from `notification`, which is the outbound email and SMS queue — that answers whether we managed to tell them, this is the thing they come back and read.';

alter table user_notification enable row level security;

/*
 * Yours and only yours. No staff policy: a support agent who
 * needs to know what a guest was told reads the order, the
 * ticket or the audit log, all of which say it with context. A
 * blanket read over everybody's bell is a feed of every
 * person's business with no reason attached.
 */
create policy user_notification_own on user_notification
  for select to authenticated using (user_id = (select auth.uid()));

create policy user_notification_own_update on user_notification
  for update to authenticated using (user_id = (select auth.uid()));

revoke all on user_notification from anon;
grant select, update (read_at) on user_notification to authenticated;

-- ══════════════════════════════════════════ push subscriptions

create table push_subscription (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  /* The endpoint is the address the browser's push service gave
     us, and it is unique per browser per install. */
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,

  /* Which kind of surface, so a send can say "your phone" and
     so a dead one can be explained rather than just deleted. */
  surface text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failed_at timestamptz,
  failure_reason text
);

create index push_subscription_user_idx on push_subscription (user_id) where failed_at is null;

comment on table push_subscription is
  'Where to push to. One row per browser per install — the same person on a phone and a laptop has two, and both are theirs.';

alter table push_subscription enable row level security;
create policy push_subscription_own on push_subscription
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on push_subscription from anon, authenticated;
grant select on push_subscription to authenticated;

-- ═══════════════════════════════════════════ the one way to add

create or replace function fn_notify_user(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text default null,
  p_href text default null,
  p_tone notification_tone default 'info',
  p_object_type text default null,
  p_object_id uuid default null,
  p_tag text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_user_id is null then
    /*
     * Not an error. Plenty of things happen to people with no
     * account — a guest who ordered without signing in, a
     * contact form from a stranger — and they are told by SMS
     * or WhatsApp instead. A bell with nobody to ring for is
     * simply skipped.
     */
    return null;
  end if;

  insert into public.user_notification
    (user_id, kind, title, body, tone, href, object_type, object_id, tag)
  values
    (p_user_id, p_kind, p_title, p_body, p_tone, p_href, p_object_type, p_object_id, p_tag)
  on conflict (user_id, tag) where tag is not null
  do update set
    title = excluded.title,
    body = excluded.body,
    tone = excluded.tone,
    href = coalesce(excluded.href, public.user_notification.href),
    /* An update makes it unread again — the point of replacing
       rather than stacking is that the latest state is the one
       worth seeing, not that it should go unnoticed. */
    read_at = null,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function fn_notify_user(uuid, text, text, text, text, notification_tone, text, uuid, text) is
  'The one way a notification is created. Tagged notifications replace rather than stack, so ten steps of one delivery are one row that keeps changing.';

revoke execute on function fn_notify_user(uuid, text, text, text, text, notification_tone, text, uuid, text)
  from public, anon, authenticated;
grant execute on function fn_notify_user(uuid, text, text, text, text, notification_tone, text, uuid, text)
  to service_role;

-- ════════════════════════════ what actually rings the bell
--
-- Triggers rather than calls sprinkled through the RPCs, for
-- the reason the ledger uses them: the thing that must never
-- happen is a state change that reaches every console and never
-- reaches the person it happened to. A trigger cannot be
-- forgotten by whoever adds the next code path.

/*
 * An order, as the guest experiences it.
 *
 * One tagged notification per order, so a delivery that moves
 * through six stages is one line in the bell that keeps
 * changing rather than six that bury everything else.
 */
create or replace function tg_notify_order_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_title text;
  v_body text;
  v_tone public.notification_tone := 'info';
begin
  if new.stage is not distinct from old.stage then
    return null;
  end if;

  select g.user_id into v_user from public.guest g where g.id = new.guest_id;
  if v_user is null then return null; end if;

  v_title := case new.stage
    when 'confirmed'  then 'Your order is confirmed'
    when 'preparing'  then 'Your order is being prepared'
    when 'ready'      then 'Your order is ready'
    when 'picked_up'  then 'Your rider has your order'
    when 'arriving'   then 'Your rider is nearly there'
    when 'delivered'  then 'Delivered'
    when 'cancelled'  then 'Your order was cancelled'
    when 'disputed'   then 'We are looking into your order'
    when 'refunded'   then 'Your refund is on its way'
    else null
  end;

  /* A stage with nothing worth saying rings nothing. Silence is
     better than "Your order moved to state preparing". */
  if v_title is null then return null; end if;

  v_tone := (case new.stage
    when 'delivered' then 'good'
    when 'cancelled' then 'warning'
    when 'disputed' then 'warning'
    when 'refunded' then 'good'
    when 'arriving' then 'urgent'
    else 'info' end)::public.notification_tone;

  v_body := case new.stage
    when 'arriving' then 'Keep your phone close — they will call if they cannot find you.'
    when 'delivered' then 'Tap to see the receipt or tell us if something was wrong.'
    when 'cancelled' then 'Nothing has been charged. Tap to see why.'
    else null
  end;

  perform public.fn_notify_user(
    v_user, 'order.' || new.stage::text, v_title, v_body,
    '/o/' || new.reference, v_tone, 'order', new.id,
    /* Tagged by the order, so it replaces itself. */
    'order:' || new.id::text);

  return null;
end;
$$;

drop trigger if exists order_rings_the_bell on public.order;
create trigger order_rings_the_bell
  after update of stage on public.order
  for each row execute function tg_notify_order_stage();

/*
 * A refund, which is money and therefore its own line rather
 * than an update to the order's.
 */
create or replace function tg_notify_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_ref text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.status not in ('approved', 'issued', 'rejected') then return null; end if;

  select g.user_id, o.reference into v_user, v_ref
    from public.order o join public.guest g on g.id = o.guest_id
   where o.id = new.order_id;
  if v_user is null then return null; end if;

  perform public.fn_notify_user(
    v_user,
    'refund.' || new.status,
    (case new.status
       when 'approved' then 'Your refund is approved'
       when 'issued'   then 'Your refund has been sent'
       else 'We could not refund that' end),
    (case new.status
       when 'issued' then 'It should reach you shortly. Tap for the details.'
       when 'rejected' then coalesce(new.rejected_reason, 'Tap to see why, and reply if you disagree.')
       else null end),
    '/o/' || v_ref,
    (case when new.status = 'rejected' then 'warning' else 'good' end)::public.notification_tone,
    'refund', new.id,
    'refund:' || new.id::text);

  return null;
end;
$$;

drop trigger if exists refund_rings_the_bell on public.refund;
create trigger refund_rings_the_bell
  after update of status on public.refund
  for each row execute function tg_notify_refund();

/*
 * A partner's own standing. These are the ones somebody
 * genuinely needs to know about without opening a dashboard —
 * a merchant who has been paused is losing orders this minute.
 */
create or replace function tg_notify_merchant_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_title text;
begin
  if new.status is not distinct from old.status then return null; end if;

  v_title := case new.status::text
    when 'live'      then 'You are live on NexG'
    when 'paused'    then 'Your shop is paused'
    when 'suspended' then 'Your shop has been suspended'
    when 'delisted'  then 'Your shop has been delisted'
    else null end;
  if v_title is null then return null; end if;

  /* Everybody on the account, not only whoever applied — a
     paused shop is news for whoever is working today. */
  for m in select user_id from public.merchant_user where merchant_id = new.id
  loop
    perform public.fn_notify_user(
      m.user_id, 'merchant.' || new.status::text, v_title,
      case new.status::text
        when 'live' then 'Guests can order from you now.'
        when 'paused' then 'You are not taking orders. Tap to see what to do.'
        else 'Tap to see why and what happens next.' end,
      '/merchant',
      (case new.status::text when 'live' then 'good'
            when 'paused' then 'warning' else 'urgent' end)::public.notification_tone,
      'merchant', new.id,
      'merchant-status:' || new.id::text);
  end loop;

  return null;
end;
$$;

drop trigger if exists merchant_status_rings_the_bell on public.merchant;
create trigger merchant_status_rings_the_bell
  after update of status on public.merchant
  for each row execute function tg_notify_merchant_status();

create or replace function tg_notify_rider_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_title text;
begin
  if new.status is not distinct from old.status then return null; end if;
  if new.user_id is null then return null; end if;

  v_title := case new.status::text
    when 'active'     then 'You are approved to ride'
    when 'suspended'  then 'Your account is suspended'
    when 'offboarded' then 'Your account has been closed'
    else null end;
  if v_title is null then return null; end if;

  perform public.fn_notify_user(
    new.user_id, 'rider.' || new.status::text, v_title,
    case new.status::text
      when 'active' then 'Go online when you are ready and offers will start coming.'
      else 'Tap to see why and what happens next.' end,
    '/rider',
    (case new.status::text when 'active' then 'good' else 'urgent' end)::public.notification_tone,
    'rider', new.id,
    'rider-status:' || new.id::text);

  return null;
end;
$$;

drop trigger if exists rider_status_rings_the_bell on public.rider;
create trigger rider_status_rings_the_bell
  after update of status on public.rider
  for each row execute function tg_notify_rider_status();

-- ══════════════════════════════════════════════ reading it

create or replace view user_notification_v
with (security_invoker = true) as
select
  n.id, n.kind, n.title, n.body, n.tone, n.href,
  n.object_type, n.object_id, n.read_at, n.created_at, n.updated_at,
  n.read_at is null as unread
from public.user_notification n
where n.user_id = (select auth.uid())
order by n.created_at desc;

grant select on user_notification_v to authenticated;

create or replace function rpc_notifications_read(p_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_count integer;
begin
  if v_me is null then
    raise exception 'Sign in to read your notifications.' using errcode = '42501';
  end if;

  /* No id marks the lot. "Mark all read" is the button people
     actually press. */
  with marked as (
    update public.user_notification
       set read_at = now()
     where user_id = v_me
       and read_at is null
       and (p_id is null or id = p_id)
    returning 1
  )
  select count(*)::integer into v_count from marked;

  return jsonb_build_object('ok', true, 'marked', v_count);
end;
$$;

revoke execute on function rpc_notifications_read(uuid) from public, anon;
grant execute on function rpc_notifications_read(uuid) to authenticated;

-- ═══════════════════════════════════════ registering a device

create or replace function rpc_push_subscribe(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_surface text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Sign in to get notifications on this device.' using errcode = '42501';
  end if;
  if coalesce(trim(p_endpoint), '') = '' then
    raise exception 'That subscription has no endpoint to push to.';
  end if;

  insert into public.push_subscription (user_id, endpoint, p256dh, auth_key, surface)
  values (v_me, p_endpoint, p_p256dh, p_auth, p_surface)
  on conflict (endpoint) do update
    /* The same browser re-subscribing after the push service
       rotated its endpoint, or after a different person signed
       in on a shared machine. The latest owner wins and any
       earlier failure is cleared. */
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        surface = coalesce(excluded.surface, public.push_subscription.surface),
        last_seen_at = now(),
        failed_at = null,
        failure_reason = null;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function rpc_push_unsubscribe(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_me uuid := (select auth.uid());
begin
  delete from public.push_subscription
   where endpoint = p_endpoint and user_id = v_me;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function rpc_push_subscribe(text, text, text, text) from public, anon;
revoke execute on function rpc_push_unsubscribe(text) from public, anon;
grant execute on function rpc_push_subscribe(text, text, text, text) to authenticated;
grant execute on function rpc_push_unsubscribe(text) to authenticated;

-- ══════════════════════════════════════════════ live, not polled

/*
 * Realtime carries the row to the open tab. The table is in
 * `public` precisely so it can — Realtime serves no other
 * schema — and RLS is applied per subscriber, so a socket only
 * ever receives its own owner's rows.
 */
alter table user_notification replica identity full;

do $publication$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.user_notification;
  end if;
exception when duplicate_object then
  null;
end
$publication$;

insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_notifications_read', 'Somebody reading their own notifications is not an action over anybody',
   'user_notification.read_at'),
  ('rpc_push_subscribe', 'Registering a browser to receive pushes', 'push_subscription'),
  ('rpc_push_unsubscribe', 'Unregistering a browser', 'the row is gone')
on conflict (function_name) do nothing;
