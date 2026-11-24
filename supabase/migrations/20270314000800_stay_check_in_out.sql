-- Check a guest in and out from the Hosts Workspace and the phone (24 Nov 2026).
--
-- Until now a stay moved to in_stay only through a reservation code (rpc_host_stay_check_in, 20270116000400),
-- and nothing moved it to departed. A host can now do both from the reservation itself:
--   * rpc_host_stay_mark_checked_in: booked -> in_stay. Only from the check-in date (in the host's time zone)
--     and before the check-out date, and not while another stay on the same unit is checked in. The stay's
--     reservation code is marked used, so it cannot check the guest in a second time.
--   * rpc_host_stay_mark_checked_out: in_stay -> departed.
-- Both need a member of the stay's host who can see its unit (managers may be scoped to some units).
-- Both write audit.log. Nothing else changes.

alter table public.stay
  add column if not exists checked_out_at timestamptz,
  add column if not exists checked_out_by uuid references auth.users (id) on delete set null;

-- 'stay.checked_in' (20270116000400) already covers the workspace check-in; check-out is new. Without this row,
-- audit.log treats every check-out as an unknown action and raises the unregistered_action alert.
insert into audit.action_registry (action, module, default_severity, money, description) values
  ('stay.checked_out', 'hotels', 'info', false, 'Host checked a guest out')
on conflict (action) do nothing;

create or replace function public.rpc_host_stay_mark_checked_in(p_stay_id uuid)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
  v_zone text;
  v_today date;
begin
  select * into v_stay from public.stay where id = p_stay_id for update;
  if v_stay.id is null or not authz.is_host_member(v_stay.host_id)
     or v_stay.unit_id is null or not authz.can_see_unit(v_stay.unit_id) then
    raise exception 'This record is outside your workspace access.' using errcode = '42501';
  end if;
  if v_stay.status = 'in_stay' then
    raise exception 'This guest is already checked in.' using errcode = '22023';
  end if;
  if v_stay.status = 'held' then
    raise exception 'This stay is not confirmed yet.' using errcode = '22023';
  end if;
  if v_stay.status <> 'booked' then
    raise exception 'Only a confirmed reservation can be checked in.' using errcode = '22023';
  end if;

  select time_zone into v_zone from public.host where id = v_stay.host_id;
  if v_zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_zone) then
    v_zone := 'Africa/Nairobi';
  end if;
  v_today := (now() at time zone v_zone)::date;
  if v_today < v_stay.check_in then
    raise exception 'The guest can be checked in from %.', to_char(v_stay.check_in, 'FMDD Mon YYYY')
      using errcode = '22023';
  end if;
  if v_today >= v_stay.check_out then
    raise exception 'This stay has already ended.' using errcode = '22023';
  end if;

  perform 1 from public.unit where id = v_stay.unit_id for update;
  if exists (select 1 from public.stay o
              where o.unit_id = v_stay.unit_id and o.id <> v_stay.id and o.status = 'in_stay') then
    raise exception 'Another guest is still checked in to this unit. Check them out first.'
      using errcode = '22023';
  end if;

  update public.stay
     set status = 'in_stay', checked_in_at = now(), checked_in_by = auth.uid(), updated_at = now()
   where id = v_stay.id returning * into v_stay;
  update public.reservation_code set used_at = now(), used_by = auth.uid()
   where stay_id = v_stay.id and used_at is null;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'stay.checked_in',
    p_actor_id => auth.uid(), p_target_type => 'stay', p_target_id => v_stay.id,
    p_after => jsonb_build_object('how', 'workspace'));
  return v_stay;
end;
$$;

create or replace function public.rpc_host_stay_mark_checked_out(p_stay_id uuid)
returns public.stay
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stay public.stay;
begin
  select * into v_stay from public.stay where id = p_stay_id for update;
  if v_stay.id is null or not authz.is_host_member(v_stay.host_id)
     or v_stay.unit_id is null or not authz.can_see_unit(v_stay.unit_id) then
    raise exception 'This record is outside your workspace access.' using errcode = '42501';
  end if;
  if v_stay.status = 'departed' then
    raise exception 'This guest is already checked out.' using errcode = '22023';
  end if;
  if v_stay.status <> 'in_stay' then
    raise exception 'Only a checked-in guest can be checked out.' using errcode = '22023';
  end if;

  update public.stay
     set status = 'departed', checked_out_at = now(), checked_out_by = auth.uid(), updated_at = now()
   where id = v_stay.id returning * into v_stay;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'stay.checked_out',
    p_actor_id => auth.uid(), p_target_type => 'stay', p_target_id => v_stay.id,
    p_after => jsonb_build_object('how', 'workspace'));
  return v_stay;
end;
$$;

revoke execute on function public.rpc_host_stay_mark_checked_in(uuid),
  public.rpc_host_stay_mark_checked_out(uuid) from public, anon;
grant execute on function public.rpc_host_stay_mark_checked_in(uuid),
  public.rpc_host_stay_mark_checked_out(uuid) to authenticated;
