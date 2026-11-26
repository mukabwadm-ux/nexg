-- Retirement uses the existing status and serializes against new placements.
create or replace function public.rpc_host_package_archive(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_scheduled integer;
begin
  select host_id into v_host from public.welcome_package
   where id = p_package_id and archived_at is null for update;
  if v_host is null then
    raise exception 'No such package, or it is already retired.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_host) then
    raise exception 'NexG catalogue packages cannot be retired from here.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_scheduled from public.package_order
   where package_id = p_package_id and status = 'scheduled';
  if v_scheduled > 0 then
    raise exception 'This package is scheduled for % upcoming check-in(s). Cancel those first.', v_scheduled
      using errcode = '23503';
  end if;

  update public.welcome_package set archived_at = now(), status = 'retired'
   where id = p_package_id;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'package.archived',
    p_target_type => 'host', p_target_id => v_host);

  return jsonb_build_object('ok', true,
    'note', 'Retired. Past orders keep their description on your statements.');
end;
$$;

create or replace function public.rpc_package_schedule(
  p_host_id uuid,
  p_unit_id uuid,
  p_package_id uuid,
  p_for_checkin_at timestamptz
)
returns public.package_order
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.package_order;
  v_lead integer;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.unit
                  where id = p_unit_id and host_id = p_host_id and archived_at is null) then
    raise exception 'That unit is not on your account.' using errcode = '22023';
  end if;

  select lead_hours into v_lead from public.welcome_package
   where id = p_package_id and archived_at is null and status = 'live'
     and (host_id is null or host_id = p_host_id) for share;
  if v_lead is null then
    raise exception 'That package is not available to you.' using errcode = '22023';
  end if;

  /*
   * The lead time is the real one — how long it takes to buy,
   * assemble and get into a unit across this city on a weekday.
   * Refusing now is the whole point; the alternative is telling
   * a guest at check-in.
   */
  if p_for_checkin_at < now() + (v_lead || ' hours')::interval then
    raise exception 'This package needs % hours. Pick a check-in at least that far ahead, or ask host ops whether it can be rushed.', v_lead
      using errcode = '22023';
  end if;

  insert into public.package_order (host_id, unit_id, package_id, for_checkin_at, status)
  values (p_host_id, p_unit_id, p_package_id, p_for_checkin_at, 'scheduled')
  returning * into v_order;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'package.scheduled',
    p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('package_id', p_package_id, 'for', p_for_checkin_at));

  return v_order;
end;
$$;
