-- Reading the audit trail from the console — spec section 5.1.
--
-- audit.audit_event is not exposed to PostgREST and has no row-level security,
-- which is deliberate: the append-only trigger and the hash chain assume
-- nothing writes to it but audit.log, and the simplest way to guarantee that
-- is for the table not to be reachable over the API at all.
--
-- So the console does not read the table. It calls this, which is scoped the
-- same way every other staff read is: a super admin sees everything, everyone
-- else sees the cities their roles cover. Adding the schema to PostgREST's
-- exposed list instead would have handed every signed-in user — including an
-- anonymous applicant, who is `authenticated` too — the whole log.

create or replace function public.rpc_audit_recent(
  p_limit integer default 20,
  p_module text default null
)
returns table (
  id bigint,
  at timestamptz,
  actor_type public.actor_type,
  module text,
  action text,
  target_type text,
  target_id uuid,
  reason text,
  severity public.audit_severity,
  city_id uuid,
  city_name text
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    e.id,
    e.at,
    e.actor_type,
    e.module,
    e.action,
    e.target_type,
    e.target_id,
    e.reason,
    e.severity,
    e.city_id,
    c.name
  from audit.audit_event e
  left join public.city c on c.id = e.city_id
  where authz.staff_id() is not null
    and (
      authz.is_super_admin()
      -- A city-less event is system-wide; only a super admin has the scope
      -- for it. Everyone else sees their own cities.
      or (e.city_id is not null and authz.has_role('merchant_ops', e.city_id))
      or (e.city_id is not null and authz.has_role('rider_ops', e.city_id))
    )
    and (p_module is null or e.module = p_module)
  order by e.id desc
  limit greatest(1, least(coalesce(p_limit, 20), 200));
$$;

comment on function public.rpc_audit_recent is
  'Recent audit events the caller is allowed to see. The table itself stays off the API so that nothing but audit.log can ever write to the chain.';

grant execute on function public.rpc_audit_recent(integer, text) to authenticated, service_role;
