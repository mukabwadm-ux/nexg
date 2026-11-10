-- Hosts can cancel a scheduled placement before it becomes a billed placement.
create function public.rpc_host_workspace_package_cancel(p_host_id uuid, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.package_order;
begin
  select placement.* into v_order from public.package_order placement
  join public.host_user member on member.host_id = placement.host_id
  where placement.id = p_order_id and placement.host_id = p_host_id
    and member.user_id = (select auth.uid())
    and (member.units is null or placement.unit_id = any(member.units))
  for update of placement;
  if v_order.id is null then
    raise exception 'This placement is outside your workspace access.' using errcode = '42501';
  end if;
  if v_order.status = 'cancelled' then return; end if;
  if v_order.status <> 'scheduled' then
    raise exception 'Only scheduled placements can be cancelled here.' using errcode = '22023';
  end if;
  update public.package_order set status = 'cancelled' where id = v_order.id;
  perform audit.log('host_user'::public.actor_type, 'hotels', 'package.cancelled',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_order.unit_id,
    p_after => jsonb_build_object('placement_id', v_order.id));
end;
$$;

revoke execute on function public.rpc_host_workspace_package_cancel(uuid,uuid) from public, anon;
grant execute on function public.rpc_host_workspace_package_cancel(uuid,uuid) to authenticated;
