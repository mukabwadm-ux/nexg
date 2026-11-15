-- D8. Native delivery is separate from the account inbox and browser subscriptions.
create schema native_push;
revoke all on schema native_push from public, anon, authenticated;

create table native_push.installation (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  proof_hash bytea not null,
  app text not null check (app in ('consumer', 'stays', 'rider')),
  platform text not null check (platform in ('ios', 'android')),
  environment text not null check (environment in ('sandbox', 'production')),
  token text,
  locale text not null check (locale in ('en', 'sw')),
  alerts boolean not null,
  rider_device_id uuid references public.rider_device(id) on delete cascade,
  revision integer not null default 1,
  binding integer not null default 1,
  last_seen_at timestamptz not null default now()
);
create unique index native_push_token_key on native_push.installation(app, platform, environment, token)
  where token is not null;
create unique index native_push_job_device_key on native_push.installation(rider_device_id, environment)
  where rider_device_id is not null and token is not null;
create index native_push_installation_owner on native_push.installation(owner_id, app)
  where token is not null;

create table native_push.watch (
  installation_id uuid primary key references native_push.installation(id) on delete cascade,
  id uuid not null unique,
  subject text not null check (subject in ('order', 'stay', 'job')),
  subject_id uuid not null,
  activity_token text,
  valid_until timestamptz not null
);
create unique index native_push_activity_token_key on native_push.watch(activity_token) where activity_token is not null;

create table native_push.delivery (
  id bigint generated always as identity primary key,
  installation_id uuid not null references native_push.installation(id) on delete cascade,
  binding integer not null,
  surface text not null check (surface in ('alert', 'live')),
  watch_id uuid,
  subject text not null check (subject in ('order', 'stay', 'job', 'offer')),
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
create index native_push_due on native_push.delivery(due_at, id) where result is null;
create index native_push_stream on native_push.delivery(installation_id, binding, surface, subject, subject_id, id desc);
create index native_push_retention on native_push.delivery(expires_at);

alter table native_push.installation enable row level security;
alter table native_push.watch enable row level security;
alter table native_push.delivery enable row level security;
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

create function public.rpc_native_push_register(
  p_installation uuid, p_proof text, p_app text, p_platform text, p_environment text,
  p_token text, p_locale text, p_alerts boolean, p_expected_revision integer,
  p_rider_device uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_row native_push.installation;
begin
  if v_owner is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true' then
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

  -- Bound fan-out per verified account and serialize updates to each installation.
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
    insert into native_push.installation (id, owner_id, proof_hash, app, platform, environment, token, locale, alerts, rider_device_id)
    values (p_installation, v_owner, native_push.hash(p_proof), p_app, p_platform, p_environment, p_token, p_locale, p_alerts, p_rider_device)
    returning * into v_row;
  end if;
  perform audit.log('guest', 'settings', 'native_push.registered', p_actor_id => v_owner,
    p_target_type => 'native_installation', p_target_id => p_installation,
    p_after => jsonb_build_object('app', p_app, 'platform', p_platform, 'revision', v_row.revision));
  return jsonb_build_object('revision', v_row.revision, 'binding', v_row.binding);
exception
  when unique_violation then
    raise exception 'This token already has an installation.' using errcode = '23505';
end
$$;

-- The proof may read the binding revision, never the account, token or preferences.
create function public.rpc_native_push_revision(p_installation uuid, p_proof text)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((
    select revision from native_push.installation
    where id = p_installation and proof_hash = native_push.hash(p_proof)
      and auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous', 'false') = 'false'
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

-- App-initiated watches use the same closed set of domain identifiers as the producers.
create function public.rpc_native_push_watch(
  p_installation uuid, p_proof text, p_binding integer,
  p_watch uuid, p_subject text, p_subject_id uuid, p_activity_token text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_install native_push.installation;
  v_owner uuid := auth.uid();
  v_title_stage text;
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
    select o.stage::text into v_title_stage
    from public."order" o join public.guest g on g.id = o.guest_id
    where o.id = p_subject_id and g.user_id = v_owner
      and o.stage in ('confirmed', 'preparing', 'ready', 'picked_up', 'arriving')
    for share of o;
  elsif v_install.app = 'stays' and p_subject = 'stay' then
    select s.status::text, s.hold_expires_at into v_title_stage, v_deadline from public.stay s
    where s.id = p_subject_id and s.guest_user_id = v_owner and s.status = 'held'
      and s.hold_expires_at > now()
    for share of s;
  elsif v_install.app = 'rider' and p_subject = 'job' then
    select case when o.stage in ('ready', 'picked_up', 'arriving') then o.stage::text else 'assigned' end
      into v_title_stage from dispatch.job j
    join public."order" o on o.id = j.order_id
    join public.rider_device d on d.rider_id = j.assigned_rider_id
    where j.id = p_subject_id and d.id = v_install.rider_device_id
      and native_push.rider_device_current(d.id, v_owner, v_install.platform)
      and j.state in ('assigned', 'manual_assigned')
      and o.stage not in ('delivered', 'cancelled', 'disputed', 'refunded')
    for share of j, o;
  end if;
  if v_title_stage is null then return false; end if;

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
    values (p_installation, p_binding, 'live', p_watch, p_subject, p_subject_id, v_title_stage, false, v_deadline,
      least(coalesce(v_deadline, 'infinity'), clock_timestamp() + interval '15 minutes'));
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

-- Fan-out in the same transaction as the producer. Plain alerts and live state have separate leases.
create function native_push.enqueue(
  p_owner uuid, p_app text, p_subject text, p_subject_id uuid, p_stage text,
  p_terminal boolean, p_alert boolean, p_deadline timestamptz default null
)
returns void language sql set search_path = '' as $$
  insert into native_push.delivery
    (installation_id, binding, surface, watch_id, subject, subject_id, stage, terminal, deadline, expires_at)
  select i.id, i.binding, targets.surface, targets.watch_id, p_subject, p_subject_id, p_stage,
    p_terminal, p_deadline,
    case when p_subject = 'offer' then p_deadline
      else clock_timestamp() + case when targets.surface = 'live' then interval '15 minutes' else interval '1 hour' end
    end
  from native_push.installation i
  left join native_push.watch w on w.installation_id = i.id and w.subject = p_subject
    and w.subject_id = p_subject_id and w.valid_until > now()
  cross join lateral (values ('alert', null::uuid, p_alert and i.alerts), ('live', w.id, w.id is not null)) targets(surface, watch_id, enabled)
  where i.owner_id = p_owner and i.app = p_app and i.token is not null and targets.enabled
    and i.last_seen_at > now() - interval '30 days'
    and (p_subject <> 'offer' or p_deadline > clock_timestamp())
    and (i.app <> 'rider' or native_push.rider_device_current(i.rider_device_id, i.owner_id, i.platform))
$$;

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
  select g.user_id into v_owner from public.guest g where g.id = new.guest_id;
  perform native_push.enqueue(v_owner, 'consumer', 'order', new.id, v_stage, v_terminal, true);
  if v_stage in ('ready', 'picked_up', 'arriving', 'delivered', 'cancelled') then
    for v_job in
      select j.id, r.user_id from dispatch.job j join public.rider r on r.id = j.assigned_rider_id
      where j.order_id = new.id and j.state in ('assigned', 'manual_assigned')
    loop
      perform native_push.enqueue(v_job.user_id, 'rider', 'job', v_job.id, v_stage, v_terminal, true);
    end loop;
  end if;
  return null;
end
$$;
create trigger order_native_push after update of stage on public."order"
  for each row execute function native_push.order_transition();

create function native_push.stay_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_status text := new.status::text;
  v_stage text;
begin
  if new.guest_user_id is null or (tg_op = 'UPDATE'
      and (new.status, new.hold_expires_at) is not distinct from (old.status, old.hold_expires_at)) then
    return null;
  end if;
  if v_status not in ('held', 'booked', 'in_stay', 'departed', 'cancelled') then return null; end if;
  v_stage := case v_status when 'in_stay' then 'checked_in' when 'departed' then 'checked_out' else v_status end;
  if tg_op = 'UPDATE' and v_status = 'cancelled' and old.status = 'held' and old.hold_expires_at <= now() then
    v_stage := 'hold_expired';
  end if;
  perform native_push.enqueue(new.guest_user_id, 'stays', 'stay', new.id, v_stage,
    v_status <> 'held', v_status <> 'held', new.hold_expires_at);
  return null;
end
$$;
create trigger stay_native_push after insert or update of status, hold_expires_at on public.stay
  for each row execute function native_push.stay_transition();

create function native_push.offer_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.outcome <> 'pending' or new.expires_at is null then return null; end if;
  if tg_op = 'UPDATE' and (new.outcome, new.expires_at) is not distinct from (old.outcome, old.expires_at) then return null; end if;
  select r.user_id into v_owner from public.rider r where r.id = new.rider_id;
  perform native_push.enqueue(v_owner, 'rider', 'offer', new.id, 'offered', false, true, new.expires_at);
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
      perform native_push.enqueue(v_owner, 'rider', 'job', old.id, 'reassigned', true, false);
    end if;
  end if;
  if new.assigned_rider_id is null then return null; end if;
  v_stage := case when new.state in ('assigned', 'manual_assigned') then 'assigned'
    when new.state in ('cancelled', 'completed') then new.state::text
    else null end;
  if v_stage is null then return null; end if;
  select r.user_id into v_owner from public.rider r where r.id = new.assigned_rider_id;
  perform native_push.enqueue(v_owner, 'rider', 'job', new.id, v_stage, v_stage <> 'assigned', true);
  return null;
end
$$;
create trigger job_native_push after insert or update of state, assigned_rider_id on dispatch.job
  for each row execute function native_push.job_transition();

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
      and coalesce(d.lease_until, '-infinity') <= clock_timestamp()
      and (
        not exists (select 1 from native_push.installation i where i.id = d.installation_id
          and i.binding = d.binding and i.token is not null and i.last_seen_at > now() - interval '30 days'
          and (d.surface <> 'alert' or i.alerts)
          and (i.app <> 'rider' or native_push.rider_device_current(i.rider_device_id, i.owner_id, i.platform)))
        or (d.surface = 'live' and not exists (
          select 1 from native_push.watch w where w.installation_id = d.installation_id and w.id = d.watch_id
            and w.valid_until > now()))
        or (d.subject = 'order' and not exists (
          select 1 from public."order" o join public.guest g on g.id = o.guest_id
          join native_push.installation i on i.owner_id = g.user_id
          where o.id = d.subject_id and i.id = d.installation_id))
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
          where i.id = d.installation_id and o.id = d.subject_id and o.outcome = 'pending' and o.expires_at > clock_timestamp()
            and j.state in ('queued', 'offering', 'escalated')))
        or exists (
          select 1 from native_push.delivery newer where newer.installation_id = d.installation_id
          and (newer.binding, newer.surface, newer.subject, newer.subject_id) = (d.binding, d.surface, d.subject, d.subject_id)
          and newer.id > d.id)
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
  if p_id is null or p_id !~ '^[1-9][0-9]{0,17}$' or p_result is null or p_result not in ('sent', 'retry', 'gone', 'failed', 'expired') then
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
  ('native_push.watch_released', 'settings', 'End a native live watch');

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
  public.fn_native_push_retention() from public, anon, authenticated;
grant execute on function public.fn_native_push_claim(integer), public.fn_native_push_finish(text, uuid, text),
  public.fn_native_push_retention() to service_role;

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
    perform cron.schedule('native-push-retention', '27 3 * * *', 'select public.fn_native_push_retention()');
  end if;
end
$schedule$;
