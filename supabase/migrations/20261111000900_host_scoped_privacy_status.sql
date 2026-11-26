-- A verified request can share its status with a specific host without sharing its contents.
create table public.host_workspace_data_share (
  request_id uuid not null references public.data_request(id) on delete cascade,
  host_id uuid not null references public.host(id) on delete cascade,
  shared_at timestamptz not null default now(),
  primary key (request_id, host_id)
);
create index host_workspace_data_share_host_idx on public.host_workspace_data_share(host_id, request_id);
alter table public.host_workspace_data_share enable row level security;
revoke all on public.host_workspace_data_share from anon, authenticated;

create function public.rpc_host_workspace_data_share_options(p_request_id uuid)
returns table(host_id uuid, host_name text, shared boolean)
language sql stable security definer set search_path = ''
as $$
  select account.id, account.display_name, link.host_id is not null
  from public.data_request request
  join public.host account on (
    request.identity_verified_at is not null and request.guest_id is not null and exists (
      select 1 from public.qr_scan scan where scan.host_id = account.id and scan.guest_id = request.guest_id
      union all
      select 1 from public."order" booking
      join public.property_qr qr on qr.id = booking.property_qr_id
      where qr.host_id = account.id and booking.guest_id = request.guest_id
    )
  ) or exists (
    select 1 from public.host_workspace_data_share existing
    where existing.request_id = request.id and existing.host_id = account.id
  )
  left join public.host_workspace_data_share link on link.request_id = request.id and link.host_id = account.id
  where request.id = p_request_id and authz.handles_guest_data()
  order by account.display_name, account.id
$$;

create function public.rpc_host_workspace_data_share_set(p_request_id uuid, p_host_id uuid, p_shared boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not authz.handles_guest_data() then
    raise exception 'Only authorized data-request staff can share status.' using errcode = '42501';
  end if;
  if p_shared then
    if not exists (
      select 1 from public.rpc_host_workspace_data_share_options(p_request_id) candidate
      where candidate.host_id = p_host_id
    ) then
      raise exception 'This verified request has no linked guest activity with that host.' using errcode = '22023';
    end if;
    insert into public.host_workspace_data_share(request_id,host_id) values (p_request_id,p_host_id)
      on conflict do nothing;
  else
    delete from public.host_workspace_data_share where request_id = p_request_id and host_id = p_host_id;
  end if;
  if found then
    perform audit.log('staff'::public.actor_type, 'hotels', 'data_request.host_status_sharing_changed',
      p_target_type => 'data_request', p_target_id => p_request_id,
      p_after => jsonb_build_object('host_id',p_host_id,'shared',p_shared));
  end if;
end;
$$;

create function public.rpc_host_workspace_shared_data_requests(p_host_id uuid)
returns table(id uuid, kind text, status text, verified boolean, received_at timestamptz, due_at timestamptz, fulfilled_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select request.id, request.kind::text, request.status::text, request.identity_verified_at is not null,
    request.received_at, request.due_at, request.fulfilled_at
  from public.host_workspace_data_share link
  join public.data_request request on request.id = link.request_id
  where link.host_id = p_host_id and exists (
    select 1 from public.host_user member where member.host_id = link.host_id
      and member.user_id = (select auth.uid()) and member.units is null
  )
  order by request.received_at desc, request.id
$$;

revoke execute on function public.rpc_host_workspace_data_share_options(uuid),
  public.rpc_host_workspace_data_share_set(uuid,uuid,boolean),
  public.rpc_host_workspace_shared_data_requests(uuid) from public, anon;
grant execute on function public.rpc_host_workspace_data_share_options(uuid),
  public.rpc_host_workspace_data_share_set(uuid,uuid,boolean),
  public.rpc_host_workspace_shared_data_requests(uuid) to authenticated;
