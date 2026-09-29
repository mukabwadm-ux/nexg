-- `Concierge desk` becomes `Support & tickets`.
--
-- The module was always the support queue: it reads support_ticket, which the
-- Help page writes, and the RPCs behind it already log to the audit trail
-- under the module name `support`. Only the label said otherwise.
--
-- The name mattered because "concierge" means something else here. A
-- concierge request is an order — a quote, a price, a rider — and it belongs
-- in the orders domain when that exists. Leaving this module called the
-- concierge desk both mis-described what it does and took the name the real
-- one will need.

/*
 * role.landing_module has a foreign key onto console_module (key), so the key
 * cannot be renamed underneath it. Dropping the constraint would depend on
 * its generated name; clearing the column and putting it back does not.
 */
update public.role set landing_module = null where landing_module = 'concierge';

update public.console_module
set key = 'support',
    label = 'Support & tickets',
    href = '/support'
where key = 'concierge';

update public.role_module_access set module_key = 'support' where module_key = 'concierge';

update public.role set landing_module = 'support' where key = 'concierge_agent';

/*
 * The role keeps its key and its label. `concierge_agent` is a job, and the
 * job is the desk: support today, guest requests and quotes when the orders
 * domain lands. Renaming the key would touch every grant that names it and
 * would not make anything truer.
 */

-- ─────────────────────────────────────────── who may read a ticket

/*
 * The permission matrix says finance, merchant success, rider ops, HR and the
 * DPO cannot reach this module, and the sidebar honoured that. The policies
 * did not: every ticket was readable by any staff member at all, and a ticket
 * carries a name, an email, a phone number and whatever the person chose to
 * tell us.
 *
 * A sidebar is not a control. This makes the matrix mean what it says on the
 * one table where it matters most.
 */
create or replace function authz.reaches_module(p_module text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    join public.staff_user su on su.id = rg.staff_user_id
    join public.role_module_access a on a.role_key = r.key
    where su.user_id = (select auth.uid())
      and su.status = 'active'
      and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at > now())
      and a.module_key = p_module
      and a.level <> 'none'
  )
$$;

comment on function authz.reaches_module is
  'True when one of the caller''s live role grants reaches the module at any level above none. The same table the sidebar is built from.';

grant execute on function authz.reaches_module(text) to anon, authenticated, service_role;

/*
 * Super admin is a floor rather than a matrix lookup. It holds `full` on
 * every module today, but a gap in one row must not be able to lock the
 * account that is supposed to be able to fix it.
 */
drop policy support_ticket_read_staff on public.support_ticket;
create policy support_ticket_read_staff on public.support_ticket
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('support'));

drop policy support_ticket_update_staff on public.support_ticket;
create policy support_ticket_update_staff on public.support_ticket
  for update to authenticated
  using (authz.is_super_admin() or authz.reaches_module('support'))
  with check (authz.is_super_admin() or authz.reaches_module('support'));

drop policy support_message_read_staff on public.support_message;
create policy support_message_read_staff on public.support_message
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('support'));

drop policy support_message_insert_staff on public.support_message;
create policy support_message_insert_staff on public.support_message
  for insert to authenticated
  with check (
    from_staff_id = authz.staff_id()
    and (authz.is_super_admin() or authz.reaches_module('support'))
  );

/*
 * The two write RPCs are SECURITY DEFINER, so the policies above do not run
 * for them: they check `authz.staff_id() is not null` and that was the whole
 * gate. Same rule, stated where it is actually enforced.
 */
create or replace function public.rpc_support_ticket_reply(
  p_ticket_id uuid,
  p_body text,
  p_internal boolean default false
)
returns public.support_ticket
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_ticket public.support_ticket;
begin
  if v_staff is null or not (authz.is_super_admin() or authz.reaches_module('support')) then
    raise exception 'You do not work the support desk.' using errcode = 'insufficient_privilege';
  end if;

  if coalesce(trim(p_body), '') = '' then
    raise exception 'Write something.' using errcode = 'check_violation';
  end if;

  insert into public.support_message (ticket_id, from_staff_id, body, internal)
  values (p_ticket_id, v_staff, trim(p_body), p_internal);

  update public.support_ticket
  set
    -- An internal note is not an answer, so it does not start the clock or
    -- move the ticket on.
    first_reply_at = case
      when p_internal then first_reply_at
      else coalesce(first_reply_at, now())
    end,
    status = case
      when p_internal then status
      when status in ('open', 'assigned') then 'answered'::public.ticket_status
      else status
    end,
    assigned_to = coalesce(assigned_to, v_staff)
  where id = p_ticket_id
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'That ticket does not exist.' using errcode = 'no_data_found';
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'support',
    p_action => case when p_internal then 'support.note_added' else 'support.replied' end,
    p_target_type => 'support_ticket',
    p_target_id => p_ticket_id,
    p_after => jsonb_build_object('reference', v_ticket.reference)
  );

  return v_ticket;
end;
$$;

create or replace function public.rpc_support_ticket_set_status(
  p_ticket_id uuid,
  p_status public.ticket_status,
  p_assign_to_me boolean default false
)
returns public.support_ticket
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_ticket public.support_ticket;
  v_was public.ticket_status;
begin
  if v_staff is null or not (authz.is_super_admin() or authz.reaches_module('support')) then
    raise exception 'You do not work the support desk.' using errcode = 'insufficient_privilege';
  end if;

  select status into v_was from public.support_ticket where id = p_ticket_id;

  update public.support_ticket
  set status = p_status,
      assigned_to = case when p_assign_to_me then v_staff else assigned_to end,
      resolved_at = case
        when p_status in ('resolved', 'closed') then coalesce(resolved_at, now())
        else null
      end
  where id = p_ticket_id
  returning * into v_ticket;

  if v_ticket.id is null then
    raise exception 'That ticket does not exist.' using errcode = 'no_data_found';
  end if;

  -- Only on the transition into resolved, and only once. Re-resolving a
  -- ticket must not email somebody twice about the same thing.
  if p_status in ('resolved', 'closed')
     and v_was not in ('resolved', 'closed') then
    insert into public.notification (kind, ticket_id, to_email, status)
    values (
      'ticket_resolved', p_ticket_id, v_ticket.email,
      (case when v_ticket.email is null then 'no_address' else 'pending' end)::public.notification_status
    );
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'support',
    p_action => 'support.status_changed',
    p_target_type => 'support_ticket',
    p_target_id => p_ticket_id,
    p_after => jsonb_build_object('status', p_status, 'reference', v_ticket.reference),
    p_before => jsonb_build_object('status', v_was)
  );

  return v_ticket;
end;
$$;

comment on function public.rpc_support_ticket_reply is
  'Adds a reply or an internal note. Refuses anyone whose roles do not reach the support module.';
comment on function public.rpc_support_ticket_set_status is
  'Moves a ticket and queues the resolved notice once. Refuses anyone whose roles do not reach the support module.';
