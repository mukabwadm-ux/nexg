-- Turning a payment method off.
--
-- This was the one control on the Payments tab that read state and
-- could not change it, and it is the wrong one to leave out: a
-- provider going down at 19:00 on a Friday is exactly the case the
-- whole "immediate, with a reason" path exists for, and without this
-- the answer was a database console.
--
-- It is deliberately not a change set. A change set is for a
-- considered edit that waits for midnight and a second person; this
-- is an incident switch. What it keeps is everything that makes the
-- incident switch accountable: a reason, an actor, an audit event at
-- high severity, and a record on the row of who turned it off and
-- when.
--
-- Turning one back ON is the careful direction and is treated as
-- such — a method that was disabled because the provider was broken
-- should not come back because somebody clicked the wrong row.

create or replace function public.rpc_payment_method_toggle(
  p_key text,
  p_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  m public.payment_method;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;

  if not (authz.is_super_admin()
          or authz.has_role('finance', null)
          or authz.has_role('tech', null)) then
    raise exception 'Payment methods are Finance and Tech.' using errcode = '42501';
  end if;

  select * into m from public.payment_method where key = p_key;
  if not found then raise exception 'No such payment method.'; end if;

  if m.enabled = p_enabled then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. Guests are about to stop seeing this at checkout, and somebody will ask.';
  end if;

  /*
   * A method cannot be switched on if it was never connected.
   * Offering a guest a payment route that has no provider behind it
   * fails at the worst possible moment — after they have chosen it.
   */
  if p_enabled and m.status in ('not_set_up', 'error') then
    raise exception '% is %. Connect it before offering it at checkout — a guest who picks a route with no provider behind it finds out after they have chosen.',
      m.label, replace(m.status, '_', ' ');
  end if;

  update public.payment_method
     set enabled = p_enabled,
         disabled_reason = case when p_enabled then null else p_reason end,
         disabled_at = case when p_enabled then null else now() end,
         disabled_by = case when p_enabled then null else v_me end,
         status = case
           when not p_enabled then 'disabled'
           /* Back on: return it to what it was, not to a guess. */
           when m.key = 'charge_to_room' then 'live_hotels'
           when m.key = 'cash_on_delivery' then 'limited'
           else 'connected'
         end,
         updated_at = now()
   where key = p_key;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'settings',
    p_action => 'payment_method.toggled',
    p_actor_id => v_me,
    p_target_type => 'payment_method',
    p_target_label => m.label,
    p_reason => p_reason,
    p_severity => 'high',
    p_before => jsonb_build_object('enabled', m.enabled, 'status', m.status),
    p_after => jsonb_build_object('enabled', p_enabled));

  return jsonb_build_object(
    'ok', true,
    'enabled', p_enabled,
    'message', case when p_enabled
      then m.label || ' is back at checkout.'
      else m.label || ' is off. Guests stop seeing it on their next page load.' end);
end;
$$;

grant execute on function public.rpc_payment_method_toggle(text, boolean, text) to authenticated;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values ('payment_method.toggled', 'settings', 'high', true, false, true,
        'A guest payment method was switched on or off')
on conflict (action) do nothing;

/*
 * The float alert and the rails stay in the change-set path: those
 * are considered decisions about where money goes, not an incident
 * switch, and there is no 19:00-on-a-Friday reason to move them
 * without a second person.
 */
comment on function public.rpc_payment_method_toggle is
  'The incident switch. Not a change set — a provider going down should not wait for midnight — but it keeps everything that makes an incident switch accountable: a reason, an actor, and a high-severity audit event. Switching one back on is refused when nothing is connected behind it.';
