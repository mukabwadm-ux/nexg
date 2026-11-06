alter table public.host add column workspace_profile jsonb not null default '{}'::jsonb
  check (jsonb_typeof(workspace_profile) = 'object' and octet_length(workspace_profile::text) <= 360000);

-- The existing RPC owns shared host settings. The workspace adds only the fields it needs.
create function public.rpc_host_workspace_profile_save(
  p_host_id uuid, p_host_patch jsonb, p_profile_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = (select auth.uid())
      and member.role = 'owner' and member.units is null
  ) then
    raise exception 'Only the workspace owner can change these settings.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_host_patch) is distinct from 'object'
    or jsonb_typeof(p_profile_patch) is distinct from 'object'
    or octet_length(p_host_patch::text) > 12000
    or octet_length(p_profile_patch::text) > 360000
    or (p_host_patch - array[
      'display_name','email','language','time_zone','features','notification_rules','quiet_hours',
      'landing_headline','landing_brand_colour'
    ]) <> '{}'::jsonb
    or (p_host_patch -> 'features') ? 'charge_to_room'
    or (p_profile_patch - array[
      'business','checkIn','checkOut','signature','bookings','daily','tasks','guestBrand','logo','billingPreference'
    ]) <> '{}'::jsonb then
    raise exception 'Check the workspace settings.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_each(p_profile_patch) field
    where (field.key in ('bookings','daily','tasks') and jsonb_typeof(field.value) <> 'boolean')
       or (field.key not in ('bookings','daily','tasks') and jsonb_typeof(field.value) <> 'string')
  )
    or length(p_profile_patch ->> 'business') > 120
    or length(p_profile_patch ->> 'guestBrand') > 120
    or length(p_profile_patch ->> 'signature') > 200
    or p_profile_patch ->> 'checkIn' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_profile_patch ->> 'checkOut' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_profile_patch ->> 'billingPreference' not in ('Manual record','M-Pesa preference','Card preference')
    or (
      p_profile_patch ->> 'logo' <> ''
      and p_profile_patch ->> 'logo' !~ '^data:image/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$'
    ) then
    raise exception 'Check the workspace profile fields.' using errcode = '22023';
  end if;

  if p_host_patch <> '{}'::jsonb then
    perform public.rpc_host_settings_update(p_host_id, p_host_patch);
  end if;
  if p_profile_patch <> '{}'::jsonb then
    update public.host
    set workspace_profile = workspace_profile || p_profile_patch, updated_at = now()
    where id = p_host_id;

    perform audit.log('host_user'::public.actor_type, 'hotels', 'host.workspace_profile_changed',
      p_actor_id => auth.uid(),
      p_target_type => 'host', p_target_id => p_host_id,
      p_after => jsonb_build_object('keys', (select jsonb_agg(key) from jsonb_object_keys(p_profile_patch) key)));
  end if;
end;
$$;

create function public.rpc_host_workspace_settings_activity(p_host_id uuid)
returns table(id bigint, at timestamptz, action text, own boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select event.id, event.at, event.action, coalesce(event.actor_id = (select auth.uid()), false)
  from audit.audit_event event
  where event.target_type = 'host' and event.target_id = p_host_id
    and event.action in ('host.settings_changed', 'host.workspace_profile_changed')
    and exists (
      select 1 from public.host_user member
      where member.host_id = p_host_id and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.units is null
    )
  order by event.at desc, event.id desc
  limit 50
$$;

revoke execute on function public.rpc_host_workspace_profile_save(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.rpc_host_workspace_settings_activity(uuid) from public, anon;
grant execute on function public.rpc_host_workspace_profile_save(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.rpc_host_workspace_settings_activity(uuid) to authenticated;
