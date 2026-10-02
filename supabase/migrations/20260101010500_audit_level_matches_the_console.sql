-- Two places ranked the same access levels differently.
--
-- `apps/admin/lib/staff.ts` has a STRENGTH table that decides which
-- level wins when somebody holds two roles that both reach a module:
--
--     full 6, own_city 5, limited 4, view_invoices 3, view 2,
--     own_actions 1
--
-- `authz.audit_level()` put `limited` above `own_city`. Neither
-- ordering is obviously right — "my modules in every city" and
-- "every module in my city" do not contain one another — but having
-- two is definitely wrong, and in a way that is hard to see: the
-- console chrome, which reads the TypeScript table, would label
-- somebody `own_city` while the RLS policy underneath applied
-- `limited`. They would be told one thing and shown another.
--
-- On this database that is not hypothetical. jotham@nexgapp.com holds
-- both city_lead and ops_manager.
--
-- The existing table wins. It was there first, every other module
-- already behaves that way, and a fresh opinion about one module is
-- not worth a second source of truth.

create or replace function authz.audit_level()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case
       when bool_or(rma.level = 'full') then 'full'
       /* own_city before limited, matching lib/staff.ts STRENGTH. */
       when bool_or(rma.level = 'own_city') then 'own_city'
       when bool_or(rma.level = 'limited') then 'limited'
       when bool_or(rma.level = 'view_invoices') then 'money'
       when bool_or(rma.level = 'own_actions') then 'own_actions'
       else null
     end
     from public.role_grant rg
     join public.role r on r.id = rg.role_id
     join public.role_module_access rma on rma.role_key = r.key
     where rg.staff_user_id = authz.staff_id()
       and rma.module_key = 'audit'
       and rma.level <> 'none'
       and rg.revoked_at is null
       and (rg.expires_at is null or rg.expires_at > now())),
    case when authz.staff_id() is not null then 'own_actions' else null end)
$$;

comment on function authz.audit_level is
  'How much of the log this person sees. The ordering matches the STRENGTH table in apps/admin/lib/staff.ts, so the level the console labels somebody with is the level the RLS policy actually applies. Any member of staff falls back to own_actions — you can always read your own trail.';

/*
 * A city lead reading at `own_city` sees events in their city. An
 * event with no city — a settings change, a role grant, anything
 * national — is shown, because hiding it would mean a city lead could
 * not see a commission change that affects them. That was already the
 * behaviour; this records that it is deliberate.
 */
comment on function audit.fn_visible is
  'Whether this reader may see this event. One predicate, used by the RLS policy and by every console view, so there is exactly one place the question is answered. An event with no city is visible to a city-scoped reader: a national change affects them, and hiding it would be the greater error.';
