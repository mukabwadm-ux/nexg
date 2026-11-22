-- Phone push for the Consumer, Stays and Rider apps: plain alerts, iPhone Live
-- Activity updates and Android progress updates.
--
-- Replaces PR #151 (codex/d8-native-notifications, 20261220000500), rebuilt on
-- main after the guest orders, order stages, rider offers, handover codes and
-- app bookings work (20270109000100 to 20270116000900). The account bell
-- (user_notification) and the browser push sender (push-dispatch, VAPID) are
-- not touched; this is a separate, private queue for phone tokens.
--
-- What it adds
--   * Schema native_push: installation (one per app install), watch (one live
--     activity per installation), delivery (the queue), reminder_sent.
--   * rpc_native_push_register / _revision / _revoke / _watch / _unwatch for
--     the apps. A Consumer or Stays guest (a temporary, anonymous session) may
--     register too: a guest has no account, so the installation is bound to
--     the guest session that placed the order. Riders must be signed in.
--   * Producers, in the same transaction as the change they observe:
--       order stage           -> Consumer (alert + live), Rider job (ready,
--                                picked up, arriving, delivered, cancelled)
--       public.booking        -> Consumer: payment due, quote, confirmed,
--                                changed, cancelled; reminder 1 hour before
--       public.stay           -> Stays: held (payment due), booked, checked
--                                in/out, cancelled, hold expired, changed;
--                                check-in details 24 h before, check-out
--                                reminder 3 h before
--       support_message       -> the ticket's owner, in any of the apps
--       dispatch.offer        -> Rider: new offer, then "about to expire"
--       dispatch.job          -> Rider: assigned, completed, cancelled,
--                                reassigned
--       order_disposal        -> Rider: disposal approved or rejected
--       rider_payout_request  -> Rider: payout approved, paid or rejected
--       rider.status          -> Rider: account active, suspended, offboarded
--   * The customer's notification choices (customer_notification_pref,
--     20270116000700) are honoured for alerts: a category switched off, or its
--     push channel switched off, sends nothing. Cancellations, refunds,
--     disputes and payment-due alerts are transactional and always sent. A
--     live activity the customer started themselves keeps updating.
--   * fn_native_push_claim / _finish / _retention for the native-push-dispatch
--     edge function (service role only), and two cron entries. The sender is
--     off until the release owner sets the Vault pair and D8_DELIVERY_ENABLED.
--
-- What a push never carries: a handover or reservation code, an address, a
-- price, a name. The words are fixed per stage in the edge function and end in
-- "Open NexG for details"; the app reloads the record after a tap.
--
-- Rollback: select cron.unschedule('native-push-dispatch');
--   select cron.unschedule('native-push-retention');
--   select cron.unschedule('native-push-reminders');
--   drop the triggers *_native_push, drop schema native_push cascade, drop the
--   public rpc_native_push_* / fn_native_push_* / cron_native_push_dispatch
--   functions, and delete the four audit.action_registry rows.

create schema native_push;
revoke all on schema native_push from public, anon, authenticated;

create table native_push.installation (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  proof_hash bytea not null,
  app text not null check (app in ('consumer', 'stays', 'rider')),
  platform text not null check (platform in ('ios', 'android')),
  environment text not null check (environment in ('sandbox', 'production')),
  token text,
  locale text not null check (locale in ('en', 'sw')),
  alerts boolean not null,
  rider_device_id uuid references public.rider_device (id) on delete cascade,
  revision integer not null default 1,
  binding integer not null default 1,
  last_seen_at timestamptz not null default now()
);
create unique index native_push_token_key on native_push.installation (app, platform, environment, token)
  where token is not null;
create unique index native_push_job_device_key on native_push.installation (rider_device_id, environment)
  where rider_device_id is not null and token is not null;
create index native_push_installation_owner on native_push.installation (owner_id, app)
  where token is not null;

create table native_push.watch (
  installation_id uuid primary key references native_push.installation (id) on delete cascade,
  id uuid not null unique,
  subject text not null check (subject in ('order', 'booking', 'stay', 'job')),
  subject_id uuid not null,
  activity_token text,
  valid_until timestamptz not null
);
create unique index native_push_activity_token_key on native_push.watch (activity_token)
  where activity_token is not null;

create table native_push.delivery (
  id bigint generated always as identity primary key,
  installation_id uuid not null references native_push.installation (id) on delete cascade,
  binding integer not null,
  surface text not null check (surface in ('alert', 'live')),
  watch_id uuid,
  subject text not null check (subject in
    ('order', 'booking', 'stay', 'ticket', 'job', 'offer', 'disposal', 'payout', 'account')),
  subject_id uuid not null,
  stage text not null,
  terminal boolean not null,
  deadline timestamptz,
  occurred_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  due_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0,
  lease uuid,
  lease_until timestamptz,
  leased_token_hash bytea,
  result text check (result in ('sent', 'expired', 'superseded', 'gone', 'failed')),
  finished_at timestamptz
);
create index native_push_due on native_push.delivery (due_at, id) where result is null;
create index native_push_stream on native_push.delivery
  (installation_id, binding, surface, subject, subject_id, id desc);
create index native_push_retention on native_push.delivery (expires_at);

-- A reminder is sent once per record and stage, whoever is registered then.
create table native_push.reminder_sent (
  subject text not null,
  subject_id uuid not null,
  stage text not null,
  sent_at timestamptz not null default now(),
  primary key (subject, subject_id, stage)
);

alter table native_push.installation enable row level security;
alter table native_push.watch enable row level security;
alter table native_push.delivery enable row level security;
alter table native_push.reminder_sent enable row level security;
revoke all on all tables in schema native_push from public, anon, authenticated;

create function native_push.hash(p_value text)
returns bytea language sql immutable strict set search_path = '' as $$
  select sha256(convert_to(p_value, 'UTF8'))
$$;

create function native_push.rider_device_current(p_device_id uuid, p_owner_id uuid, p_platform text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.rider_device d join public.rider r on r.id = d.rider_id
    where d.id = p_device_id and r.user_id = p_owner_id and r.status = 'active' and d.platform = p_platform
      and d.is_job_device and d.unbound_at is null and d.notification_permission
  )
$$;

-- Account news reaches the rider's phone whatever the account's state.
create function native_push.rider_device_owned(p_device_id uuid, p_owner_id uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.rider_device d join public.rider r on r.id = d.rider_id
    where d.id = p_device_id and r.user_id = p_owner_id and d.unbound_at is null
  )
$$;

-- The customer's choice for one category: false only when they turned it, or
-- its push channel, off. A null category is transactional and always on.
create function native_push.alert_allowed(p_owner uuid, p_category text)
returns boolean language sql stable set search_path = '' as $$
  select p_category is null or coalesce((
    select not (coalesce((p.choices -> p_category ->> 'all')::boolean, true) = false
             or coalesce((p.choices -> p_category ->> 'push')::boolean, true) = false)
    from public.customer_notification_pref p where p.user_id = p_owner
  ), true)
$$;

create function public.rpc_native_push_register(
  p_installation uuid, p_proof text, p_app text, p_platform text, p_environment text,
  p_token text, p_locale text, p_alerts boolean, p_expected_revision integer,
  p_rider_device uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_guest boolean := coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true';
  v_row native_push.installation;
begin
  -- A guest (temporary session) may register the Consumer or Stays app; the
  -- Rider app needs a signed-in rider.
  if v_owner is null or (v_guest and p_app = 'rider') then
    raise exception 'Sign in to register a phone.' using errcode = '42501';
  end if;
  if p_installation is null or p_proof is null or p_proof !~ '^[a-f0-9]{64}$'
      or p_app is null or p_app not in ('consumer', 'stays', 'rider')
      or p_platform is null or p_platform not in ('ios', 'android')
      or p_environment is null or p_environment not in ('sandbox', 'production')
      or p_locale is null or p_locale not in ('en', 'sw') or p_alerts is null
      or p_expected_revision is null or p_expected_revision < 0
      or p_token is null or (case when p_platform = 'ios' then
        length(p_token) not between 64 and 256 or length(p_token) % 2 <> 0 or p_token !~ '^[a-f0-9]+$'
      else length(p_token) not between 16 and 4096 or p_token !~ '^[A-Za-z0-9_:-]+$' end) then
    raise exception 'Invalid native push registration.' using errcode = '22023';
  end if;
  if (p_app = 'rider' and not native_push.rider_device_current(p_rider_device, v_owner, p_platform))
      or (p_app <> 'rider' and p_rider_device is not null) then
    raise exception 'This phone is not the Rider job device.' using errcode = '42501';
  end if;

  -- Bound fan-out per account and serialize updates to each installation.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text || ':' || p_app, 88111));
  perform pg_advisory_xact_lock(hashtextextended(p_installation::text, 88112));
  select * into v_row from native_push.installation where id = p_installation for no key update;
  if (not found or v_row.owner_id <> v_owner or v_row.token is null) and (
    select count(*) from native_push.installation where owner_id = v_owner and app = p_app
      and token is not null and last_seen_at > now() - interval '30 days'
  ) >= 8 then
    raise exception 'Revoke an existing phone before registering another.' using errcode = '54000';
  end if;
  if v_row.id is not null then
    if v_row.proof_hash <> native_push.hash(p_proof)
        or (v_row.app, v_row.platform, v_row.environment) <> (p_app, p_platform, p_environment) then
      raise exception 'Installation could not be verified.' using errcode = '42501';
    end if;
    if (v_row.owner_id, v_row.token, v_row.locale, v_row.alerts, v_row.rider_device_id)
        is not distinct from (v_owner, p_token, p_locale, p_alerts, p_rider_device) then
      update native_push.installation set last_seen_at = now() where id = p_installation;
      return jsonb_build_object('revision', v_row.revision, 'binding', v_row.binding);
    end if;
    if v_row.revision <> p_expected_revision then
      raise exception 'The installation changed. Reload its binding.' using errcode = '40001';
    end if;
    if v_row.owner_id <> v_owner or v_row.rider_device_id is distinct from p_rider_device then
      delete from native_push.watch where installation_id = p_installation;
      v_row.binding := v_row.binding + 1;
    end if;
    update native_push.installation
      set owner_id = v_owner, token = p_token, locale = p_locale, alerts = p_alerts,
          rider_device_id = p_rider_device, revision = revision + 1, binding = v_row.binding, last_seen_at = now()
      where id = p_installation returning * into v_row;
  else
    if p_expected_revision <> 0 then
      raise exception 'The installation changed. Reload its binding.' using errcode = '40001';
    end if;
    insert into native_push.installation
      (id, owner_id, proof_hash, app, platform, environment, token, locale, alerts, rider_device_id)
    values (p_installation, v_owner, native_push.hash(p_proof), p_app, p_platform, p_environment,
      p_token, p_locale, p_alerts, p_rider_device)
    returning * into v_row;
  end if;
  perform audit.log('guest', 'settings', 'native_push.registered', p_actor_id => v_owner,
    p_target_type => 'native_installation', p_target_id => p_installation,
    p_after => jsonb_build_object('app', p_app, 'platform', p_platform, 'revision', v_row.revision,
      'guest', v_guest));
  return jsonb_build_object('revision', v_row.revision, 'binding', v_row.binding);
exception
  when unique_violation then
    raise exception 'This token already has an installation.' using errcode = '23505';
end
$$;

-- The proof may read the binding revision, never the account, token or choices.
create function public.rpc_native_push_revision(p_installation uuid, p_proof text)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((
    select revision from native_push.installation
    where id = p_installation and proof_hash = native_push.hash(p_proof)
      and owner_id = auth.uid()
  ), 0)
$$;

create function public.rpc_native_push_revoke(p_installation uuid, p_proof text, p_expected_revision integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  update native_push.installation
    set token = null, alerts = false, binding = binding + 1, revision = revision + 1
    where id = p_installation and owner_id = v_owner and proof_hash = native_push.hash(p_proof)
      and revision = p_expected_revision and token is not null;
  if not found then return false; end if;
  delete from native_push.watch where installation_id = p_installation;
  perform audit.log('guest', 'settings', 'native_push.revoked', p_actor_id => v_owner,
    p_target_type => 'native_installation', p_target_id => p_installation);
  return true;
end
$$;

-- A live activity the customer, guest or rider starts from the app.
create function public.rpc_native_push_watch(
  p_installation uuid, p_proof text, p_binding integer,
  p_watch uuid, p_subject text, p_subject_id uuid, p_activity_token text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_install native_push.installation;
  v_owner uuid := auth.uid();
  v_stage text;
  v_deadline timestamptz;
  v_publish_snapshot boolean;
begin
  select * into v_install from native_push.installation
    where id = p_installation and owner_id = v_owner and proof_hash = native_push.hash(p_proof)
      and binding = p_binding and token is not null
    for no key update;
  if not found then return false; end if;
  if p_watch is null or p_subject_id is null or p_subject is null
      or (v_install.platform = 'ios' and (p_activity_token is null or length(p_activity_token) not between 64 and 256
        or length(p_activity_token) % 2 <> 0 or p_activity_token !~ '^[a-f0-9]+$'))
      or (v_install.platform = 'android' and p_activity_token is not null) then
    raise exception 'Invalid native watch.' using errcode = '22023';
  end if;

  if v_install.app = 'consumer' and p_subject = 'order' then
    -- The guest session or the account that placed it (guest.user_id).
    select o.stage::text into v_stage
    from public."order" o join public.guest g on g.id = o.guest_id
    where o.id = p_subject_id and g.user_id = v_owner
      and o.stage in ('confirmed', 'preparing', 'ready', 'picked_up', 'arriving')
    for share of o;
  elsif v_install.app = 'consumer' and p_subject = 'booking' then
    -- A confirmed booking from 12 hours before its time until it ends.
    select 'upcoming', b.starts_at into v_stage, v_deadline from public.booking b
    where b.id = p_subject_id and b.guest_user_id = v_owner and b.status = 'confirmed'
      and b.starts_at <= now() + interval '12 hours' and b.ends_at > now()
    for share of b;
  elsif v_install.app = 'stays' and p_subject = 'stay' then
    select s.status::text, s.hold_expires_at into v_stage, v_deadline from public.stay s
    where s.id = p_subject_id and s.guest_user_id = v_owner and s.status = 'held'
      and s.hold_expires_at > now()
    for share of s;
  elsif v_install.app = 'rider' and p_subject = 'job' then
    select case when o.stage in ('ready', 'picked_up', 'arriving') then o.stage::text else 'assigned' end
      into v_stage from dispatch.job j
    join public."order" o on o.id = j.order_id
    join public.rider_device d on d.rider_id = j.assigned_rider_id
    where j.id = p_subject_id and d.id = v_install.rider_device_id
      and native_push.rider_device_current(d.id, v_owner, v_install.platform)
      and j.state in ('assigned', 'manual_assigned')
      and o.stage not in ('delivered', 'cancelled', 'disputed', 'refunded')
    for share of j, o;
  end if;
  if v_stage is null then return false; end if;

  select not exists (
    select 1 from native_push.watch w where w.installation_id = p_installation and w.id = p_watch
      and w.activity_token is not distinct from p_activity_token and w.valid_until > now()
  ) into v_publish_snapshot;
  insert into native_push.watch (installation_id, id, subject, subject_id, activity_token, valid_until)
  values (p_installation, p_watch, p_subject, p_subject_id, p_activity_token, now() + interval '12 hours')
  on conflict (installation_id) do update
    set id = excluded.id, subject = excluded.subject, subject_id = excluded.subject_id,
        activity_token = excluded.activity_token, valid_until = excluded.valid_until
    where native_push.watch.id <> excluded.id or
          (native_push.watch.subject, native_push.watch.subject_id) = (excluded.subject, excluded.subject_id);
  if not found then return false; end if;
  if v_publish_snapshot then
    insert into native_push.delivery
      (installation_id, binding, surface, watch_id, subject, subject_id, stage, terminal, deadline, expires_at)
    values (p_installation, p_binding, 'live', p_watch, p_subject, p_subject_id, v_stage, false, v_deadline,
      least(case when p_subject = 'stay' then coalesce(v_deadline, 'infinity') else 'infinity' end,
        clock_timestamp() + interval '15 minutes'));
  end if;
  perform audit.log('guest', 'settings', 'native_push.watch_registered', p_actor_id => v_owner,
    p_target_type => 'native_installation', p_target_id => p_installation,
    p_after => jsonb_build_object('subject', p_subject));
  return true;
exception
  when unique_violation then
    raise exception 'This ActivityKit token already has a watch.' using errcode = '23505';
end
$$;

create function public.rpc_native_push_unwatch(p_installation uuid, p_proof text, p_binding integer, p_watch uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  delete from native_push.watch w using native_push.installation i
  where w.installation_id = i.id and i.id = p_installation and w.id = p_watch
    and i.owner_id = v_owner and i.proof_hash = native_push.hash(p_proof) and i.binding = p_binding;
  if not found then return false; end if;
  perform audit.log('guest', 'settings', 'native_push.watch_released', p_actor_id => v_owner,
    p_target_type => 'native_installation', p_target_id => p_installation);
  return true;
end
$$;

-- Fan-out in the same transaction as the producer. Alerts and live state are
-- separate streams. p_category is the customer's notification category (null
-- for transactional news); p_due delays an alert (reminders, offer expiry).
create function native_push.enqueue(
  p_owner uuid, p_app text, p_subject text, p_subject_id uuid, p_stage text,
  p_terminal boolean, p_alert boolean, p_deadline timestamptz default null,
  p_category text default null, p_due timestamptz default null
)
returns void language sql set search_path = '' as $$
  insert into native_push.delivery
    (installation_id, binding, surface, watch_id, subject, subject_id, stage, terminal, deadline, expires_at, due_at)
  select i.id, i.binding, targets.surface, targets.watch_id, p_subject, p_subject_id, p_stage,
    p_terminal, p_deadline,
    case when p_subject = 'offer' then p_deadline
      else coalesce(p_due, clock_timestamp())
        + case when targets.surface = 'live' then interval '15 minutes' else interval '1 hour' end
    end,
    case when targets.surface = 'alert' then coalesce(p_due, clock_timestamp()) else clock_timestamp() end
  from native_push.installation i
  left join native_push.watch w on w.installation_id = i.id and w.subject = p_subject
    and w.subject_id = p_subject_id and w.valid_until > now()
  cross join lateral (values
    ('alert', null::uuid, p_alert and i.alerts
      and (i.app = 'rider' or native_push.alert_allowed(i.owner_id, p_category))),
    ('live', w.id, w.id is not null)) targets(surface, watch_id, enabled)
  where p_owner is not null and i.owner_id = p_owner and i.app = p_app and i.token is not null and targets.enabled
    and i.last_seen_at > now() - interval '30 days'
    and (p_subject <> 'offer' or p_deadline > coalesce(p_due, clock_timestamp()))
    and (i.app <> 'rider'
      or (p_subject in ('account', 'payout', 'ticket') and native_push.rider_device_owned(i.rider_device_id, i.owner_id))
      or native_push.rider_device_current(i.rider_device_id, i.owner_id, i.platform))
$$;

-- ═══════════════════════════════════════════════ producers: Consumer orders

create function native_push.order_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_job record;
  v_stage text := new.stage::text;
  v_terminal boolean := new.stage in ('delivered', 'cancelled', 'disputed', 'refunded');
begin
  if new.stage is not distinct from old.stage or v_stage not in
      ('confirmed', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered', 'cancelled', 'disputed', 'refunded') then
    return null;
  end if;
  -- guest.user_id is the account, or the guest session that placed the order.
  select g.user_id into v_owner from public.guest g where g.id = new.guest_id;
  perform native_push.enqueue(v_owner, 'consumer', 'order', new.id, v_stage, v_terminal, true, null,
    case when v_stage in ('confirmed', 'preparing') then 'order_confirmations'
      when v_stage in ('ready', 'picked_up') then 'delivery_updates'
      when v_stage in ('arriving', 'delivered') then 'delivery_arrival'
      else null end);
  if v_stage in ('ready', 'picked_up', 'arriving', 'delivered', 'cancelled') then
    for v_job in
      select j.id, r.user_id from dispatch.job j join public.rider r on r.id = j.assigned_rider_id
      where j.order_id = new.id and j.state in ('assigned', 'manual_assigned')
    loop
      perform native_push.enqueue(v_job.user_id, 'rider', 'job', v_job.id, v_stage, v_terminal, true);
    end loop;
  end if;
  return null;
exception when others then
  -- A push must never fail the order step it observes.
  raise warning 'native_push.order_transition skipped: %', sqlerrm;
  return null;
end
$$;
create trigger order_native_push after update of stage on public."order"
  for each row execute function native_push.order_transition();

-- ═══════════════════════════════════════════════ producers: Consumer bookings

create function native_push.booking_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_stage text;
  v_category text;
  v_terminal boolean := false;
  v_alert boolean := true;
begin
  if new.guest_user_id is null or new.source <> 'app' then return null; end if;
  if tg_op = 'INSERT' then
    if new.status = 'pending' and new.payment_due_by is not null then
      v_stage := 'payment_due';
    elsif new.status = 'confirmed' then
      v_stage := 'confirmed'; v_category := 'booking_confirmations';
    end if;
  elsif new.status is distinct from old.status then
    v_stage := case new.status
      when 'confirmed' then 'confirmed'
      when 'cancelled' then 'cancelled'
      when 'completed' then 'completed'
      when 'no_show' then 'completed'
      else null end;
    v_terminal := new.status in ('cancelled', 'completed', 'no_show');
    v_alert := new.status in ('confirmed', 'cancelled');
    v_category := case new.status when 'confirmed' then 'booking_confirmations'
      when 'cancelled' then 'booking_changes' else null end;
  elsif new.status = 'pending' and old.total_cents is null and new.total_cents is not null then
    v_stage := 'quote'; v_category := 'booking_confirmations';
  elsif new.status = 'pending' and new.payment_due_by is not null and old.payment_due_by is null then
    v_stage := 'payment_due';
  elsif new.status = 'confirmed' and (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
    v_stage := 'changed'; v_category := 'booking_changes';
  end if;
  if v_stage is null then return null; end if;
  perform native_push.enqueue(new.guest_user_id, 'consumer', 'booking', new.id, v_stage, v_terminal, v_alert,
    case when v_stage = 'payment_due' then new.payment_due_by else new.starts_at end, v_category);
  return null;
exception when others then
  raise warning 'native_push.booking_transition skipped: %', sqlerrm;
  return null;
end
$$;
create trigger booking_native_push
  after insert or update of status, starts_at, ends_at, total_cents, payment_due_by on public.booking
  for each row execute function native_push.booking_transition();

-- ═══════════════════════════════════════════════ producers: Stays

create function native_push.stay_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_status text := new.status::text;
  v_stage text;
begin
  if new.guest_user_id is null then return null; end if;
  if tg_op = 'UPDATE' and (new.status, new.hold_expires_at) is not distinct from (old.status, old.hold_expires_at) then
    if new.status = 'booked' and (new.check_in, new.check_out) is distinct from (old.check_in, old.check_out) then
      perform native_push.enqueue(new.guest_user_id, 'stays', 'stay', new.id, 'changed', false, true,
        new.check_in, 'booking_changes');
    end if;
    return null;
  end if;
  if v_status not in ('held', 'booked', 'in_stay', 'departed', 'cancelled') then return null; end if;
  v_stage := case v_status when 'in_stay' then 'checked_in' when 'departed' then 'checked_out' else v_status end;
  if tg_op = 'UPDATE' and v_status = 'cancelled' and old.status = 'held' and old.hold_expires_at <= now() then
    v_stage := 'hold_expired';
  end if;
  -- A new hold is "payment due": the guest is told once, the live countdown
  -- follows the hold. Extensions update the live activity only.
  perform native_push.enqueue(new.guest_user_id, 'stays', 'stay', new.id, v_stage,
    v_status <> 'held', v_status <> 'held' or tg_op = 'INSERT' or old.status is distinct from 'held',
    new.hold_expires_at,
    case v_stage when 'booked' then 'booking_confirmations' when 'checked_in' then 'booking_reminders'
      when 'checked_out' then 'booking_reminders' else null end);
  return null;
exception when others then
  raise warning 'native_push.stay_transition skipped: %', sqlerrm;
  return null;
end
$$;
create trigger stay_native_push
  after insert or update of status, hold_expires_at, check_in, check_out on public.stay
  for each row execute function native_push.stay_transition();

-- ═══════════════════════════════════════════════ producers: support replies

create function native_push.ticket_reply()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.from_staff_id is null or new.internal then return null; end if;
  select t.created_by_user into v_owner from public.support_ticket t where t.id = new.ticket_id;
  if v_owner is null then return null; end if;
  perform native_push.enqueue(v_owner, 'consumer', 'ticket', new.ticket_id, 'reply', false, true, null, 'concierge_messages');
  perform native_push.enqueue(v_owner, 'stays', 'ticket', new.ticket_id, 'reply', false, true, null, 'concierge_messages');
  perform native_push.enqueue(v_owner, 'rider', 'ticket', new.ticket_id, 'reply', false, true);
  return null;
exception when others then
  raise warning 'native_push.ticket_reply skipped: %', sqlerrm;
  return null;
end
$$;
create trigger support_message_native_push after insert on public.support_message
  for each row execute function native_push.ticket_reply();

-- ═══════════════════════════════════════════════ producers: Rider

create function native_push.offer_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.outcome <> 'pending' or new.expires_at is null then return null; end if;
  if tg_op = 'UPDATE' and (new.outcome, new.expires_at) is not distinct from (old.outcome, old.expires_at) then
    return null;
  end if;
  select r.user_id into v_owner from public.rider r where r.id = new.rider_id;
  perform native_push.enqueue(v_owner, 'rider', 'offer', new.id, 'offered', false, true, new.expires_at);
  -- "About to expire", 10 seconds before, only for an offer long enough to
  -- need it. It is dropped as superseded if the rider answered first.
  if new.expires_at > clock_timestamp() + interval '25 seconds' then
    perform native_push.enqueue(v_owner, 'rider', 'offer', new.id, 'expiring', false, true, new.expires_at,
      null, new.expires_at - interval '10 seconds');
  end if;
  return null;
exception when others then
  raise warning 'native_push.offer_transition skipped: %', sqlerrm;
  return null;
end
$$;
create trigger offer_native_push after insert or update of outcome, expires_at on dispatch.offer
  for each row execute function native_push.offer_transition();

create function native_push.job_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_stage text;
begin
  if tg_op = 'UPDATE' then
    if (new.state, new.assigned_rider_id) is not distinct from (old.state, old.assigned_rider_id) then
      return null;
    end if;
    if old.assigned_rider_id is not null and old.assigned_rider_id is distinct from new.assigned_rider_id then
      select r.user_id into v_owner from public.rider r where r.id = old.assigned_rider_id;
      perform native_push.enqueue(v_owner, 'rider', 'job', old.id, 'reassigned', true, true);
    end if;
  end if;
  if new.assigned_rider_id is null then return null; end if;
  v_stage := case when new.state in ('assigned', 'manual_assigned') then 'assigned'
    when new.state in ('cancelled', 'completed') then new.state::text
    else null end;
  if v_stage is null then return null; end if;
  if tg_op = 'UPDATE' and v_stage = 'assigned' and old.state in ('assigned', 'manual_assigned')
      and old.assigned_rider_id is not distinct from new.assigned_rider_id then
    return null;
  end if;
  select r.user_id into v_owner from public.rider r where r.id = new.assigned_rider_id;
  perform native_push.enqueue(v_owner, 'rider', 'job', new.id, v_stage, v_stage <> 'assigned', v_stage <> 'completed');
  return null;
exception when others then
  raise warning 'native_push.job_transition skipped: %', sqlerrm;
  return null;
end
$$;
create trigger job_native_push after insert or update of state, assigned_rider_id on dispatch.job
  for each row execute function native_push.job_transition();

create function native_push.disposal_decided()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.status = old.status or new.status not in ('approved', 'rejected') then return null; end if;
  select r.user_id into v_owner from public.rider r where r.id = new.rider_id;
  perform native_push.enqueue(v_owner, 'rider', 'disposal', new.id, 'disposal_' || new.status, true, true);
  return null;
exception when others then
  raise warning 'native_push.disposal_decided skipped: %', sqlerrm;
  return null;
end
$$;
create trigger order_disposal_native_push after update of status on public.order_disposal
  for each row execute function native_push.disposal_decided();

create function native_push.payout_decided()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.status = old.status or new.status not in ('approved', 'paid', 'rejected') then return null; end if;
  select r.user_id into v_owner from public.rider r where r.id = new.rider_id;
  perform native_push.enqueue(v_owner, 'rider', 'payout', new.id, 'payout_' || new.status,
    new.status <> 'approved', true);
  return null;
exception when others then
  raise warning 'native_push.payout_decided skipped: %', sqlerrm;
  return null;
end
$$;
create trigger rider_payout_native_push after update of status on public.rider_payout_request
  for each row execute function native_push.payout_decided();

create function native_push.rider_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = old.status or new.status not in ('active', 'suspended', 'offboarded') or new.user_id is null then
    return null;
  end if;
  perform native_push.enqueue(new.user_id, 'rider', 'account', new.id, 'account_' || new.status::text, false, true);
  return null;
exception when others then
  raise warning 'native_push.rider_account skipped: %', sqlerrm;
  return null;
end
$$;
create trigger rider_status_native_push after update of status on public.rider
  for each row execute function native_push.rider_account();

-- ═══════════════════════════════════════════════ reminders (cron, every 5 min)

create function public.fn_native_push_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_row record;
  v_count integer := 0;
begin
  -- A booking an hour before its time.
  for v_row in
    select b.id, b.guest_user_id, b.starts_at from public.booking b
    where b.status = 'confirmed' and b.source = 'app' and b.guest_user_id is not null
      and b.starts_at between now() + interval '45 minutes' and now() + interval '65 minutes'
      and not exists (select 1 from native_push.reminder_sent r
        where r.subject = 'booking' and r.subject_id = b.id and r.stage = 'reminder')
  loop
    insert into native_push.reminder_sent (subject, subject_id, stage) values ('booking', v_row.id, 'reminder');
    perform native_push.enqueue(v_row.guest_user_id, 'consumer', 'booking', v_row.id, 'reminder', false, true,
      v_row.starts_at, 'booking_reminders');
    v_count := v_count + 1;
  end loop;
  -- A stay's check-in details the day before, and check-out three hours before.
  for v_row in
    select s.id, s.guest_user_id, s.check_in, 'check_in_soon' as stage from public.stay s
    where s.status = 'booked' and s.guest_user_id is not null
      and s.check_in between now() + interval '23 hours' and now() + interval '25 hours'
    union all
    select s.id, s.guest_user_id, s.check_out, 'check_out_soon' from public.stay s
    where s.status = 'in_stay' and s.guest_user_id is not null
      and s.check_out between now() + interval '2 hours' and now() + interval '3 hours'
  loop
    if not exists (select 1 from native_push.reminder_sent r
        where r.subject = 'stay' and r.subject_id = v_row.id and r.stage = v_row.stage) then
      insert into native_push.reminder_sent (subject, subject_id, stage) values ('stay', v_row.id, v_row.stage);
      perform native_push.enqueue(v_row.guest_user_id, 'stays', 'stay', v_row.id, v_row.stage, false, true,
        v_row.check_in, 'booking_reminders');
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end
$$;

-- ═══════════════════════════════════════════════ the sender's queue

-- Expire unsendable work, then claim only the latest revision of each stream.
create function public.fn_native_push_claim(p_limit integer default 20)
returns table (
  id text, lease uuid, installation_id uuid, app text, platform text, environment text, token text, locale text,
  surface text, watch_id uuid, subject text, subject_id uuid, stage text, terminal boolean,
  deadline timestamptz, occurred_at timestamptz, expires_at timestamptz, binding integer
) language sql security definer set search_path = '' as $$
  with expired as (
    update native_push.delivery d set result = 'expired', finished_at = clock_timestamp()
    where d.result is null and (d.expires_at <= clock_timestamp() or d.attempts >= 6)
      and coalesce(d.lease_until, '-infinity') <= clock_timestamp()
  ), obsolete as (
    update native_push.delivery d set result = 'superseded', finished_at = clock_timestamp()
    where d.result is null and d.expires_at > clock_timestamp() and d.attempts < 6
      and d.due_at <= clock_timestamp()
      and coalesce(d.lease_until, '-infinity') <= clock_timestamp()
      and (
        not exists (select 1 from native_push.installation i where i.id = d.installation_id
          and i.binding = d.binding and i.token is not null and i.last_seen_at > now() - interval '30 days'
          and (d.surface <> 'alert' or i.alerts)
          and (i.app <> 'rider'
            or (d.subject in ('account', 'payout', 'ticket') and native_push.rider_device_owned(i.rider_device_id, i.owner_id))
            or native_push.rider_device_current(i.rider_device_id, i.owner_id, i.platform)))
        or (d.surface = 'live' and not exists (
          select 1 from native_push.watch w where w.installation_id = d.installation_id and w.id = d.watch_id
            and w.valid_until > now()))
        or (d.subject = 'order' and not exists (
          select 1 from public."order" o join public.guest g on g.id = o.guest_id
          join native_push.installation i on i.owner_id = g.user_id
          where o.id = d.subject_id and i.id = d.installation_id))
        or (d.subject = 'booking' and not exists (
          select 1 from public.booking b join native_push.installation i on i.owner_id = b.guest_user_id
          where b.id = d.subject_id and i.id = d.installation_id))
        or (d.subject = 'booking' and d.stage = 'reminder' and not exists (
          select 1 from public.booking b where b.id = d.subject_id and b.status = 'confirmed'))
        or (d.subject = 'stay' and not exists (
          select 1 from public.stay s join native_push.installation i on i.owner_id = s.guest_user_id
          where s.id = d.subject_id and i.id = d.installation_id))
        or (d.subject = 'job' and not d.terminal and not exists (
          select 1 from dispatch.job j join public.rider_device r on r.rider_id = j.assigned_rider_id
          join native_push.installation i on i.rider_device_id = r.id
          where j.id = d.subject_id and i.id = d.installation_id and j.state in ('assigned', 'manual_assigned')))
        or (d.subject = 'stay' and d.stage = 'held' and d.deadline <= clock_timestamp())
        or (d.subject = 'offer' and not exists (
          select 1 from dispatch.offer o join dispatch.job j on j.id = o.job_id
          join public.rider_device r on r.rider_id = o.rider_id
          join native_push.installation i on i.rider_device_id = r.id
          where i.id = d.installation_id and o.id = d.subject_id and o.outcome = 'pending'
            and o.expires_at > clock_timestamp()
            and j.state in ('queued', 'offering', 'escalated')))
        or exists (
          select 1 from native_push.delivery newer where newer.installation_id = d.installation_id
          and (newer.binding, newer.surface, newer.subject, newer.subject_id) = (d.binding, d.surface, d.subject, d.subject_id)
          and newer.id > d.id and newer.due_at <= clock_timestamp())
      )
    returning d.id
  ), candidates as (
    select d.id,
      case when i.platform = 'ios' and d.surface = 'live' then w.activity_token else i.token end as destination
    from native_push.delivery d
    join native_push.installation i on i.id = d.installation_id
    left join native_push.watch w on w.installation_id = d.installation_id and w.id = d.watch_id
    where d.result is null and d.due_at <= clock_timestamp() and d.expires_at > clock_timestamp() and d.attempts < 6
      and coalesce(d.lease_until, '-infinity') <= clock_timestamp()
      and not exists (select 1 from obsolete where obsolete.id = d.id)
      and not exists (
        select 1 from native_push.delivery busy where busy.installation_id = d.installation_id
        and (busy.binding, busy.surface, busy.subject, busy.subject_id) = (d.binding, d.surface, d.subject, d.subject_id)
        and busy.id <> d.id
        and (busy.lease_until > clock_timestamp() and busy.result is null
          or busy.result = 'sent' and busy.finished_at > clock_timestamp() - interval '1 second'))
    order by (d.subject = 'offer') desc, d.due_at, d.id
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update of d skip locked
  ), claimed as (
    update native_push.delivery d set lease = gen_random_uuid(), lease_until = clock_timestamp() + interval '60 seconds',
      attempts = d.attempts + 1, leased_token_hash = native_push.hash(c.destination)
    from candidates c where d.id = c.id and c.destination is not null
    returning d.*, c.destination
  )
  select d.id::text, d.lease, i.id, i.app, i.platform, i.environment, d.destination, i.locale,
    d.surface, d.watch_id, d.subject, d.subject_id, d.stage, d.terminal,
    d.deadline, d.occurred_at, d.expires_at, d.binding
  from claimed d join native_push.installation i on i.id = d.installation_id
$$;

create function public.fn_native_push_finish(p_id text, p_lease uuid, p_result text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_delivery native_push.delivery;
  v_install native_push.installation;
  v_result text;
begin
  if p_id is null or p_id !~ '^[1-9][0-9]{0,17}$' or p_result is null
      or p_result not in ('sent', 'retry', 'gone', 'failed', 'expired') then
    return false;
  end if;
  select * into v_delivery from native_push.delivery
    where id = p_id::bigint and lease = p_lease and lease_until > clock_timestamp() and result is null
    for update;
  if not found then return false; end if;
  select * into v_install from native_push.installation where id = v_delivery.installation_id for no key update;
  if not found then return false; end if;
  v_result := case when p_result = 'retry'
    then case when v_delivery.attempts >= 6 or v_delivery.expires_at <= clock_timestamp() then 'expired' else null end
    else p_result end;
  if v_install.binding = v_delivery.binding and p_result = 'gone' then
    if v_install.platform = 'ios' and v_delivery.surface = 'live' then
      delete from native_push.watch where installation_id = v_install.id and id = v_delivery.watch_id
        and native_push.hash(activity_token) = v_delivery.leased_token_hash;
    else
      update native_push.installation set token = null, revision = revision + 1, binding = binding + 1
        where id = v_install.id and native_push.hash(token) = v_delivery.leased_token_hash;
      if found then delete from native_push.watch where installation_id = v_install.id; end if;
    end if;
  end if;
  if v_install.binding = v_delivery.binding and p_result = 'sent' and v_delivery.terminal and v_delivery.surface = 'live' then
    delete from native_push.watch where installation_id = v_install.id and id = v_delivery.watch_id;
  end if;
  update native_push.delivery set result = v_result, finished_at = case when v_result is not null then clock_timestamp() end,
    lease = null, lease_until = null, leased_token_hash = null,
    due_at = clock_timestamp() + make_interval(secs => case when v_delivery.subject = 'offer' then 2 else 2 ^ v_delivery.attempts end)
    where id = v_delivery.id;
  return true;
end
$$;

create function public.fn_native_push_retention()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  delete from native_push.delivery where expires_at < now() - interval '7 days';
  get diagnostics v_count = row_count;
  delete from native_push.reminder_sent where sent_at < now() - interval '30 days';
  delete from native_push.watch where valid_until <= now();
  update native_push.installation set token = null, revision = revision + 1, binding = binding + 1
    where token is not null and last_seen_at <= now() - interval '30 days';
  return v_count;
end
$$;

insert into audit.action_registry (action, module, description) values
  ('native_push.registered', 'settings', 'Register or rotate a phone notification binding'),
  ('native_push.revoked', 'settings', 'Revoke a phone notification binding'),
  ('native_push.watch_registered', 'settings', 'Start or rotate a native live watch'),
  ('native_push.watch_released', 'settings', 'End a native live watch')
on conflict (action) do nothing;

revoke all on all functions in schema native_push from public, anon, authenticated, service_role;
revoke execute on function public.rpc_native_push_register(uuid, text, text, text, text, text, text, boolean, integer, uuid),
  public.rpc_native_push_revision(uuid, text), public.rpc_native_push_revoke(uuid, text, integer),
  public.rpc_native_push_watch(uuid, text, integer, uuid, text, uuid, text),
  public.rpc_native_push_unwatch(uuid, text, integer, uuid) from public, anon;
grant execute on function public.rpc_native_push_register(uuid, text, text, text, text, text, text, boolean, integer, uuid),
  public.rpc_native_push_revision(uuid, text), public.rpc_native_push_revoke(uuid, text, integer),
  public.rpc_native_push_watch(uuid, text, integer, uuid, text, uuid, text),
  public.rpc_native_push_unwatch(uuid, text, integer, uuid) to authenticated;

revoke execute on function public.fn_native_push_claim(integer), public.fn_native_push_finish(text, uuid, text),
  public.fn_native_push_retention(), public.fn_native_push_reminders() from public, anon, authenticated;
grant execute on function public.fn_native_push_claim(integer), public.fn_native_push_finish(text, uuid, text),
  public.fn_native_push_retention(), public.fn_native_push_reminders() to service_role;

-- The scheduler has no destination until the release owner supplies the Vault pair.
create function public.cron_native_push_dispatch()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'native_push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'native_push_dispatch_secret';
  if coalesce(v_url, '') !~ '^https://[^/]+/functions/v1/native-push-dispatch$'
      or coalesce(length(v_secret), 0) < 32 then
    return false;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'x-native-push-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  return true;
end
$$;
revoke execute on function public.cron_native_push_dispatch() from public, anon, authenticated;
grant execute on function public.cron_native_push_dispatch() to service_role;

do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('native-push-dispatch', '5 seconds', 'select public.cron_native_push_dispatch()');
    perform cron.schedule('native-push-reminders', '*/5 * * * *', 'select public.fn_native_push_reminders()');
    perform cron.schedule('native-push-retention', '27 3 * * *', 'select public.fn_native_push_retention()');
  end if;
end
$schedule$;
