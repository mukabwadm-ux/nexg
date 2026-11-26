-- A team member limited to some units can only save those units.
--
-- The workspace already refuses this in app code (lib/host-workspace/commands.ts),
-- but the RPC is callable directly with the member's own session, so the database
-- has to say no as well. Membership of the host is not enough: host_user.units
-- narrows it, the same way authz.can_see_unit does for reads.
--
-- Same function also stops two saves at the same moment from both creating a
-- unit with one name. The earlier check read, then wrote, with nothing between;
-- a per-host, per-name transaction lock now sits in front of it. Renames are
-- checked too, but only when the name actually changes, so a unit that already
-- shares a legacy name can still be saved.
create or replace function public.rpc_unit_upsert_guarded(
  p_host_id uuid,
  p_unit jsonb,
  p_unit_id uuid default null
)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_name text := nullif(trim(p_unit ->> 'name'), '');
  v_property_id uuid := nullif(p_unit ->> 'property_id', '')::uuid;
  v_staff boolean := authz.works_hospitality(null);
  v_member boolean := authz.is_host_member(p_host_id);
  v_scope uuid[];
  v_current public.unit;
begin
  if not v_member and not v_staff then
    raise exception 'Not your unit.' using errcode = '42501';
  end if;

  if p_unit_id is not null then
    select * into v_current from public.unit
     where id = p_unit_id and host_id = p_host_id;
    if not found then
      raise exception 'That unit is not on your account.' using errcode = '42501';
    end if;
  end if;

  if v_member and not v_staff then
    select hu.units into v_scope from public.host_user hu
     where hu.host_id = p_host_id and hu.user_id = (select auth.uid());

    if v_scope is not null then
      if p_unit_id is null then
        raise exception 'Your access covers specific units, so you cannot add one.' using errcode = '42501';
      end if;
      if not (p_unit_id = any (v_scope)) then
        raise exception 'This unit is outside your workspace access.' using errcode = '42501';
      end if;
      if v_property_id is not null and v_property_id is distinct from v_current.property_id then
        raise exception 'Your access covers specific units, so you cannot move one to another property.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.property
    where id = v_property_id and host_id = p_host_id and deleted_at is null
    for share
  ) then
    raise exception 'Choose a property on your account.' using errcode = '22023';
  end if;

  if v_name is not null and (p_unit_id is null or v_name is distinct from v_current.name) then
    perform pg_advisory_xact_lock(hashtextextended('unit-name:' || p_host_id::text || ':' || v_name, 0));
    if exists (
      select 1 from public.unit
      where host_id = p_host_id and name = v_name and archived_at is null
        and (p_unit_id is null or id <> p_unit_id)
    ) then
      raise exception 'You already have a unit called %.', v_name using errcode = '23505';
    end if;
  end if;

  v_unit := public.rpc_unit_upsert(p_host_id, p_unit, p_unit_id);
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;

  if p_unit ?| array['property_id', 'bedrooms', 'bathrooms', 'max_guests', 'nightly_rate_kes'] then
    update public.unit set
      property_id = coalesce(v_property_id, property_id),
      bedrooms = coalesce(nullif(p_unit ->> 'bedrooms', '')::integer, bedrooms),
      bathrooms = coalesce(nullif(p_unit ->> 'bathrooms', '')::numeric, bathrooms),
      max_guests = coalesce(nullif(p_unit ->> 'max_guests', '')::integer, max_guests),
      nightly_rate_kes = coalesce(nullif(p_unit ->> 'nightly_rate_kes', '')::bigint, nightly_rate_kes)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  return v_unit;
end;
$$;

revoke execute on function public.rpc_unit_upsert_guarded(uuid, jsonb, uuid) from public, anon;
grant execute on function public.rpc_unit_upsert_guarded(uuid, jsonb, uuid) to authenticated;
