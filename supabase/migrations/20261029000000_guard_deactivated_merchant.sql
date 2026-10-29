alter table public.merchant
  add constraint merchant_deactivated_is_not_live
  check (deactivated_at is null or status <> 'live');

create or replace function public.rpc_merchant_set_paused(
  p_merchant_id uuid,
  p_paused boolean,
  p_reason text default null
)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
begin
  select * into v_merchant
  from public.merchant
  where id = p_merchant_id
  for update;

  if v_merchant.id is null then
    raise exception 'That business does not exist.' using errcode = 'no_data_found';
  end if;

  if not authz.can_manage_merchants(v_merchant.city_id) then
    raise exception 'You cannot change that business.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_paused and v_merchant.status <> 'live' then
    raise exception 'Only a live business can be paused. This one is %.', v_merchant.status
      using errcode = 'check_violation';
  end if;

  if not p_paused and v_merchant.deactivated_at is not null then
    raise exception 'This business is deactivated. Reactivate it from Merchant access.'
      using errcode = 'check_violation';
  end if;

  if not p_paused and v_merchant.status <> 'paused' then
    raise exception 'That business is %, not paused.', v_merchant.status
      using errcode = 'check_violation';
  end if;

  update public.merchant
  set status = (case when p_paused then 'paused' else 'live' end)::public.partner_status,
      status_reason = nullif(trim(coalesce(p_reason, '')), ''),
      accepting_orders = case when p_paused then false else accepting_orders end,
      concierge_pick = case when p_paused then false else concierge_pick end
  where id = p_merchant_id
  returning * into v_merchant;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'merchant',
    p_action => case when p_paused then 'merchant.paused' else 'merchant.resumed' end,
    p_target_type => 'merchant',
    p_target_id => p_merchant_id,
    p_after => jsonb_build_object('status', v_merchant.status),
    p_reason => nullif(trim(coalesce(p_reason, '')), ''),
    p_city_id => v_merchant.city_id
  );

  return v_merchant;
end;
$$;
