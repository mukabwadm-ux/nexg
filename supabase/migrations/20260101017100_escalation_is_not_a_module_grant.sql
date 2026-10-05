-- Escalation is not a module grant.
--
-- The Messaging module was seeded giving `finance`,
-- `merchant_ops`, `rider_ops` and `partnerships` access at
-- `limited`. That reads harmlessly and is wrong.
--
-- The permission matrix keeps exactly those roles out of the
-- support inbox on purpose, and migration 20260101005600 exists
-- because the policies once let any staff member read every
-- ticket. A conversation carries somebody's name, their phone
-- number, their address and whatever they chose to tell us at a
-- bad moment. Finance does not need to browse that to approve a
-- credit.
--
-- The module's own design already said how those teams get in:
-- they are **escalated into a conversation**, and
-- `authz.msg_can_read` lets a participant read what they are a
-- participant of. That is per-conversation, it is recorded, and
-- it ends. A module grant is none of those things.
--
-- `supabase/tests/08_rls_support_tickets.sql` caught this, which
-- is the whole reason that suite was written.

delete from public.role_module_access
 where module_key = 'messaging'
   and role_key in ('finance', 'merchant_ops', 'rider_ops', 'partnerships', 'read_only');

/*
 * `read_only` goes too, for now. The prompt gives a viewer the
 * inbox read-only with masking — but masking of message bodies
 * is not built, and a viewer role that can read every transcript
 * unmasked is a worse outcome than a viewer who cannot reach the
 * tab. It comes back with the masking.
 */

comment on table public.role_module_access is
  'Who reaches which console module. Note that reaching Messaging is not how an escalated team sees a conversation — they are added as a participant, which is per-conversation, recorded, and ends.';

-- ══════════════════════════════ the legacy tables follow the module
--
-- `support_ticket` and `support_message` are superseded and
-- read-only, but their policies still pointed at the `support`
-- module, which no longer exists — so nobody could read the
-- history that was just brought across.

drop policy if exists support_ticket_read_staff on public.support_ticket;
create policy support_ticket_read_staff on public.support_ticket
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('messaging'));

drop policy if exists support_ticket_update_staff on public.support_ticket;
create policy support_ticket_update_staff on public.support_ticket
  for update to authenticated
  using (authz.is_super_admin() or authz.reaches_module('messaging'));

do $policies$
declare r record;
begin
  for r in
    select polname, pg_get_expr(polqual, polrelid) as qual, polcmd
      from pg_policy
     where polrelid = 'public.support_message'::regclass
       and pg_get_expr(polqual, polrelid) like '%''support''%'
  loop
    execute format('drop policy %I on public.support_message', r.polname);
    execute format(
      'create policy %I on public.support_message for %s to authenticated using (%s)',
      r.polname,
      case r.polcmd when 'r' then 'select' when 'w' then 'update' else 'all' end,
      replace(r.qual, '''support''::text', '''messaging''::text'));
  end loop;
end
$policies$;
