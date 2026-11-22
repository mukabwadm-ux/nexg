-- Merchants can suspend their own business from Settings, and resume it.
--
-- Suspending takes the business offline without touching merchant.status:
-- a 'paused' status blocks the whole workspace (authz.merchant_application_access),
-- so the owner could not sign in to resume. Instead it stops new orders
-- (accepting_orders) and hides the business from Discovery (explore_visible),
-- remembering both so resuming puts back exactly what was there.
--
-- While suspended, a guard keeps both switches off whoever writes the row,
-- so the store toggle or a staff control cannot quietly reopen it. Only the
-- resume function (which clears self_suspended first) lifts it. Staff
-- pause/deactivate/delete are separate and unchanged.
--
-- Owner only (authz.is_merchant_owner): managers and cashiers cannot.

alter table public.merchant
  add column if not exists self_suspended jsonb;

comment on column public.merchant.self_suspended is
  'Set while the owner has suspended the business from Settings: {at, by, reason, accepting_orders, explore_visible} (the values to restore). Null when not suspended.';

insert into audit.action_registry (action, module, default_severity, description) values
  ('merchant.self_suspended', 'merchants', 'notice',
   'The owner suspended their business from Settings: no new orders, hidden from Discovery'),
  ('merchant.self_resumed', 'merchants', 'notice',
   'The owner resumed their business from Settings')
on conflict (action) do nothing;

create or replace function public.fn_merchant_self_suspended_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.self_suspended is not null then
    new.accepting_orders := false;
    new.explore_visible := false;
    new.concierge_pick := false;
  end if;
  return new;
end;
$$;

drop trigger if exists merchant_self_suspended_guard on public.merchant;
create trigger merchant_self_suspended_guard
  before update on public.merchant
  for each row execute function public.fn_merchant_self_suspended_guard();

create or replace function public.rpc_merchant_self_suspend(
  p_merchant_id uuid,
  p_suspend boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.merchant;
  v_reason text := nullif(left(trim(coalesce(p_reason, '')), 300), '');
  v_restore jsonb;
begin
  if not authz.is_merchant_owner(p_merchant_id) then
    raise exception 'Only the business owner can suspend or resume the business.'
      using errcode = '42501';
  end if;

  select * into v_m from public.merchant where id = p_merchant_id for update;
  if v_m.id is null or v_m.deleted_at is not null then
    raise exception 'That business does not exist.' using errcode = 'no_data_found';
  end if;

  if p_suspend then
    if v_m.self_suspended is not null then
      return v_m.self_suspended;
    end if;
    if v_m.deactivated_at is not null or v_m.status not in ('live', 'applied', 'documents_pending', 'under_review') then
      raise exception 'This business is %, so it cannot be suspended here. Contact support.', v_m.status
        using errcode = 'check_violation';
    end if;
    v_restore := jsonb_build_object(
      'at', now(),
      'by', (select auth.uid()),
      'reason', v_reason,
      'accepting_orders', v_m.accepting_orders,
      'explore_visible', v_m.explore_visible);
    update public.merchant
    set self_suspended = v_restore,
        accepting_orders_changed_at = case when accepting_orders then now() else accepting_orders_changed_at end,
        accepting_orders_source = case when accepting_orders then 'merchant'::public.merchant_control_source
                                       else accepting_orders_source end
    where id = p_merchant_id;
    perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.self_suspended',
      p_target_type => 'merchant', p_target_id => p_merchant_id,
      p_target_label => v_m.trading_name, p_reason => v_reason,
      p_city_id => v_m.city_id, p_severity => 'notice'::public.audit_severity);
    return v_restore;
  end if;

  if v_m.self_suspended is null then
    return null;
  end if;
  v_restore := v_m.self_suspended;
  -- Clear first: the guard only lets the switches back on once this is null.
  update public.merchant set self_suspended = null where id = p_merchant_id;
  update public.merchant
  set accepting_orders = status = 'live' and coalesce((v_restore->>'accepting_orders')::boolean, false),
      explore_visible = coalesce((v_restore->>'explore_visible')::boolean, explore_visible),
      accepting_orders_changed_at = now(),
      accepting_orders_source = 'merchant'::public.merchant_control_source
  where id = p_merchant_id;
  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.self_resumed',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => v_m.trading_name,
    p_city_id => v_m.city_id, p_severity => 'notice'::public.audit_severity);
  return null;
end;
$$;

revoke all on function public.rpc_merchant_self_suspend(uuid, boolean, text) from public, anon;
grant execute on function public.rpc_merchant_self_suspend(uuid, boolean, text) to authenticated;
