-- Support & tickets becomes Messaging.
--
-- The tickets are conversations now, and `/support` could only
-- reply and change a status — both of which the Messaging inbox
-- does, against the same rows. Two rail entries onto one set of
-- data is how half the team answers from one screen and half
-- from the other, and neither sees the whole queue.
--
-- The old route stays and redirects, because a bookmark, a
-- runbook and a link in somebody's notes all point at it.

/*
 * `msg_can_read` granted queue access partly on
 * `reaches_module('support')`. That module is going away, so
 * the check moves to the module that replaces it. The other
 * branches — concierge agent, concierge lead, super admin —
 * already covered the desk, so nobody loses access in the gap.
 */
create or replace function authz.msg_can_read(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.msg_is_participant(p_conversation)
      or authz.msg_sees_internal(p_conversation)
      or (
        authz.staff_id() is not null
        and (authz.has_role('concierge_agent') or authz.has_role('concierge_lead')
             or authz.is_super_admin() or authz.reaches_module('messaging'))
        and exists (
          select 1 from public.msg_conversation c
           where c.id = p_conversation and c.kind = 'external')
      )
$$;

/* Anybody who could reach Support can reach Messaging, so the
   move does not quietly take the inbox away from a role. */
insert into public.role_module_access (role_key, module_key, level, note)
select rma.role_key, 'messaging', rma.level, rma.note
  from public.role_module_access rma
 where rma.module_key = 'support'
on conflict do nothing;

delete from public.role_module_access where module_key = 'support';
delete from public.console_module where key = 'support';
