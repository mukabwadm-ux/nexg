-- Foreground sharing keeps one current pose for one current assignment.
-- Source identities are checked at every boundary. Avoid foreign-key row locks
-- here so dispatch updates can revoke under the same rider lock as a publish.
create table dispatch.maps_rider_share (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null unique,
  rider_account_id uuid not null,
  customer_account_id uuid not null,
  order_id uuid not null,
  assignment_id uuid not null,
  assigned_at timestamptz not null,
  lease_expires_at timestamptz not null,
  sequence integer not null default 0 check (sequence >= 0),
  observed_at timestamptz,
  expires_at timestamptz,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  check (num_nonnulls(observed_at, expires_at, latitude, longitude) in (0, 4)),
  check ((sequence = 0) = (observed_at is null)),
  check (expires_at > observed_at and expires_at <= lease_expires_at)
);

create index maps_rider_share_order_idx on dispatch.maps_rider_share(order_id);

alter table dispatch.maps_rider_share enable row level security;
revoke all on dispatch.maps_rider_share from public, anon, authenticated, service_role;

create function dispatch.maps_order_is_active(p_stage public.order_stage)
returns boolean language sql immutable set search_path = '' as $$
  select p_stage in ('placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving');
$$;

create function dispatch.maps_rider_actor()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_rider_id uuid;
begin
  if authz.maps_has_real_account() then
    select r.id into v_rider_id
    from public.rider r
    where r.user_id = auth.uid() and r.status = 'active' and r.offboarded_at is null;
  end if;
  if v_rider_id is null then
    raise exception 'An active rider account is required.' using errcode = '42501';
  end if;
  return v_rider_id;
end;
$$;

create function dispatch.maps_rider_assignments(p_rider_id uuid)
returns table (
  order_id uuid, assignment_id uuid, assigned_at timestamptz, stage public.order_stage,
  customer_account_id uuid, can_share boolean
)
language sql stable security definer set search_path = '' as $$
  select o.id, j.id, j.assigned_at, o.stage, customer.id,
    o.stage in ('picked_up', 'arriving') and customer.id is not null
      and not exists (
        select 1 from public.order other_order
        where other_order.rider_id = p_rider_id and other_order.id <> o.id
          and dispatch.maps_order_is_active(other_order.stage)
      )
      and not exists (
        select 1 from dispatch.job other_job
        join public.order other_order on other_order.id = other_job.order_id
        where other_job.assigned_rider_id = p_rider_id and other_job.id <> j.id
          and other_job.state in ('assigned', 'manual_assigned') and other_job.ended_at is null
          and dispatch.maps_order_is_active(other_order.stage)
      )
  from public.order o
  join dispatch.job j on j.order_id = o.id and j.city_id = o.city_id
  left join public.guest g on g.id = o.guest_id and g.anonymised_at is null
  left join auth.users customer on customer.id = g.user_id and not coalesce(customer.is_anonymous, false)
  where o.rider_id = p_rider_id and dispatch.maps_order_is_active(o.stage)
    and j.assigned_rider_id = p_rider_id and j.state in ('assigned', 'manual_assigned')
    and j.ended_at is null and isfinite(j.assigned_at);
$$;

create function dispatch.maps_lock_rider(p_rider_id uuid)
returns void language sql volatile set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('maps-rider-share:' || p_rider_id::text, 0)
  );
$$;

create function dispatch.tg_maps_revoke_sharing()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_before uuid;
  v_after uuid;
  v_rider_id uuid;
begin
  if tg_table_name = 'job' then
    if tg_op <> 'INSERT' and old.state in ('assigned', 'manual_assigned') and old.ended_at is null then
      v_before := old.assigned_rider_id;
    end if;
    if tg_op <> 'DELETE' and new.state in ('assigned', 'manual_assigned') and new.ended_at is null then
      v_after := new.assigned_rider_id;
    end if;
    if tg_op = 'UPDATE' and v_before is not distinct from v_after
      and old.assigned_at is not distinct from new.assigned_at
      and old.order_id = new.order_id and old.city_id = new.city_id then
      return null;
    end if;
  elsif tg_table_name = 'order' then
    if tg_op <> 'INSERT' and dispatch.maps_order_is_active(old.stage) then
      v_before := old.rider_id;
    end if;
    if tg_op <> 'DELETE' and dispatch.maps_order_is_active(new.stage) then
      v_after := new.rider_id;
    end if;
    if tg_op = 'UPDATE' and v_before is not distinct from v_after
      and old.guest_id is not distinct from new.guest_id and old.city_id = new.city_id
      and (old.stage in ('picked_up', 'arriving')) = (new.stage in ('picked_up', 'arriving')) then
      return null;
    end if;
  else
    if tg_op = 'UPDATE' and old.user_id is not distinct from new.user_id
      and old.status = new.status and old.offboarded_at is not distinct from new.offboarded_at then
      return null;
    end if;
    v_before := old.id;
  end if;

  -- Dispatch already holds its source row locks. Sharing uses this rider lock
  -- and ordinary source reads, so it never waits on those source row locks.
  for v_rider_id in
    select distinct ids.rider_id
    from unnest(array[v_before, v_after]) ids(rider_id)
    where ids.rider_id is not null
    order by ids.rider_id
  loop
    perform dispatch.maps_lock_rider(v_rider_id);
    delete from dispatch.maps_rider_share s where s.rider_id = v_rider_id;
  end loop;
  return null;
end;
$$;

create trigger maps_revoke_share_on_job
after insert or update of order_id, city_id, state, assigned_rider_id, assigned_at, ended_at or delete
on dispatch.job for each row execute function dispatch.tg_maps_revoke_sharing();

create trigger maps_revoke_share_on_order
after insert or update of rider_id, stage, guest_id, city_id or delete
on public.order for each row execute function dispatch.tg_maps_revoke_sharing();

create trigger maps_revoke_share_on_rider
after update of user_id, status, offboarded_at or delete
on public.rider for each row execute function dispatch.tg_maps_revoke_sharing();

revoke execute on function dispatch.maps_order_is_active(public.order_stage), dispatch.maps_rider_actor(),
  dispatch.maps_rider_assignments(uuid), dispatch.maps_lock_rider(uuid), dispatch.tg_maps_revoke_sharing()
from public, anon, authenticated, service_role;

create function public.rpc_my_rider_map_assignments()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_rider_id uuid := dispatch.maps_rider_actor();
begin
  return jsonb_build_object(
    'contractVersion', '1',
    'accountId', auth.uid(),
    'assignments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'orderId', a.order_id, 'assignmentId', a.assignment_id, 'assignedAt', a.assigned_at,
        'stage', a.stage, 'canShare', a.can_share
      ) order by a.assigned_at desc, a.order_id)
      from dispatch.maps_rider_assignments(v_rider_id) a
    ), '[]'::jsonb)
  );
end;
$$;

create function public.rpc_rider_map_share_start(
  p_order_id uuid, p_assignment_id uuid, p_assigned_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_rider_id uuid := dispatch.maps_rider_actor();
  v_customer_id uuid;
  v_share_id uuid;
  v_lease timestamptz;
begin
  perform dispatch.maps_lock_rider(v_rider_id);
  if dispatch.maps_rider_actor() <> v_rider_id then
    raise exception 'An active rider account is required.' using errcode = '42501';
  end if;
  select a.customer_account_id into v_customer_id
  from dispatch.maps_rider_assignments(v_rider_id) a
  where a.order_id = p_order_id and a.assignment_id = p_assignment_id
    and a.assigned_at = p_assigned_at and a.can_share;
  if not found then
    raise exception 'Order sharing is unavailable.' using errcode = 'P0002';
  end if;

  v_lease := clock_timestamp() + interval '60 seconds';
  delete from dispatch.maps_rider_share s where s.rider_id = v_rider_id;
  insert into dispatch.maps_rider_share (
    rider_id, rider_account_id, customer_account_id, order_id, assignment_id, assigned_at, lease_expires_at
  ) values (
    v_rider_id, auth.uid(), v_customer_id, p_order_id, p_assignment_id, p_assigned_at, v_lease
  ) returning id into v_share_id;
  return jsonb_build_object('contractVersion', '1', 'shareId', v_share_id, 'leaseExpiresAt', v_lease);
end;
$$;

create function public.rpc_rider_map_share_publish(
  p_share_id uuid, p_sequence integer, p_observed_at timestamptz,
  p_latitude double precision, p_longitude double precision
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_rider_id uuid := dispatch.maps_rider_actor();
  v_share dispatch.maps_rider_share%rowtype;
  v_now timestamptz;
  v_expires_at timestamptz;
  v_lease timestamptz;
begin
  perform dispatch.maps_lock_rider(v_rider_id);
  if dispatch.maps_rider_actor() <> v_rider_id then
    raise exception 'An active rider account is required.' using errcode = '42501';
  end if;
  select s.* into v_share
  from dispatch.maps_rider_share s
  where s.id = p_share_id and s.rider_id = v_rider_id and s.rider_account_id = auth.uid()
  for update;
  v_now := clock_timestamp();
  if not found or v_share.lease_expires_at <= v_now or v_share.expires_at <= v_now
    or not exists (
      select 1 from dispatch.maps_rider_assignments(v_rider_id) a
      where a.order_id = v_share.order_id and a.assignment_id = v_share.assignment_id
        and a.assigned_at = v_share.assigned_at and a.customer_account_id = v_share.customer_account_id
        and a.can_share
    ) then
    raise exception 'Order sharing is unavailable.' using errcode = 'P0002';
  end if;

  if p_sequence is null or p_sequence <= v_share.sequence
    or p_observed_at is null or not isfinite(p_observed_at)
    or p_observed_at > v_now or p_observed_at <= v_now - interval '30 seconds'
    or p_observed_at <= v_share.observed_at
    or not coalesce(p_latitude between -90 and 90 and p_longitude between -180 and 180, false) then
    raise exception 'Location sample is invalid or out of order.' using errcode = '22023';
  end if;

  v_expires_at := p_observed_at + interval '30 seconds';
  v_lease := v_now + interval '60 seconds';
  update dispatch.maps_rider_share
  set sequence = p_sequence, observed_at = p_observed_at, expires_at = v_expires_at,
      lease_expires_at = v_lease, latitude = p_latitude, longitude = p_longitude
  where id = p_share_id;
  return jsonb_build_object(
    'contractVersion', '1', 'shareId', p_share_id, 'sequence', p_sequence,
    'observedAt', p_observed_at, 'expiresAt', v_expires_at, 'leaseExpiresAt', v_lease
  );
end;
$$;

create function public.rpc_rider_map_share_stop(p_share_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rider_id uuid := dispatch.maps_rider_actor();
begin
  perform dispatch.maps_lock_rider(v_rider_id);
  delete from dispatch.maps_rider_share
  where id = p_share_id and rider_id = v_rider_id and rider_account_id = auth.uid();
  return jsonb_build_object('contractVersion', '1', 'ok', true);
end;
$$;

-- The existing single-argument V1 RPC and its fixed-location contract stay intact.
create function public.rpc_my_order_map(p_order_id uuid, p_contract_version text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_map jsonb;
  v_courier jsonb;
  v_now timestamptz := statement_timestamp();
begin
  if p_contract_version is distinct from '2' then
    raise exception 'Unsupported order map version.' using errcode = '22023';
  end if;
  v_map := public.rpc_my_order_map(p_order_id) || '{"contractVersion":"2"}'::jsonb;
  if v_map->>'reason' = 'completed' then return v_map; end if;

  select jsonb_build_object(
    'latitude', s.latitude, 'longitude', s.longitude, 'observedAt', s.observed_at,
    'expiresAt', s.expires_at, 'vehicle',
    case when r.vehicle::text in ('motorbike', 'bicycle', 'car', 'tuktuk') then r.vehicle::text else 'unknown' end
  ) into v_courier
  from dispatch.maps_rider_share s
  join public.rider r on r.id = s.rider_id and r.user_id = s.rider_account_id
    and r.status = 'active' and r.offboarded_at is null
  join auth.users rider_account on rider_account.id = s.rider_account_id
    and not coalesce(rider_account.is_anonymous, false)
  join lateral dispatch.maps_rider_assignments(r.id) a
    on a.order_id = s.order_id and a.assignment_id = s.assignment_id
    and a.assigned_at = s.assigned_at and a.customer_account_id = s.customer_account_id
    and a.can_share
  where s.order_id = p_order_id and s.customer_account_id = auth.uid()
    and s.observed_at <= v_now and s.expires_at > v_now and s.lease_expires_at > v_now;

  if v_courier is null then return v_map; end if;
  return (v_map - 'reason') || jsonb_build_object('status', 'live', 'courier', v_courier);
end;
$$;

revoke execute on function public.rpc_my_rider_map_assignments(),
  public.rpc_rider_map_share_start(uuid, uuid, timestamptz),
  public.rpc_rider_map_share_publish(uuid, integer, timestamptz, double precision, double precision),
  public.rpc_rider_map_share_stop(uuid), public.rpc_my_order_map(uuid, text)
from public, anon, service_role;
grant execute on function public.rpc_my_rider_map_assignments(),
  public.rpc_rider_map_share_start(uuid, uuid, timestamptz),
  public.rpc_rider_map_share_publish(uuid, integer, timestamptz, double precision, double precision),
  public.rpc_rider_map_share_stop(uuid), public.rpc_my_order_map(uuid, text)
to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_rider_map_share_start', 'Rider opts into a single short-lived order sharing lease.', '20261220000400_maps_rider_sharing'),
  ('rpc_rider_map_share_publish', 'One ephemeral fix only. A separate per-sample audit would retain location metadata.', '20261220000400_maps_rider_sharing'),
  ('rpc_rider_map_share_stop', 'Rider revokes the ephemeral sharing lease without retaining a tracking history.', '20261220000400_maps_rider_sharing');

-- Clear discarded private coordinates even when a device disappears before stop.
select cron.schedule('maps-rider-sharing-expire', '* * * * *', $prune$
  delete from dispatch.maps_rider_share
  where lease_expires_at <= clock_timestamp() or expires_at <= clock_timestamp();
$prune$);
