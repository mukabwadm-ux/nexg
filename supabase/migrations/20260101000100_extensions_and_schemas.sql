-- Extensions, private schemas and shared helpers.
--
-- Two schemas are created here and neither is exposed through the API
-- (config.toml lists only `public` and `graphql_public`):
--
--   audit  — the append-only event log from spec section 3.2.
--   authz  — role-checking helpers used inside RLS policies. They are
--            SECURITY DEFINER so a policy can read staff_user and role_grant
--            without the policy on those tables recursing into itself.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

create schema if not exists audit;
create schema if not exists authz;

comment on schema audit is 'Append-only, hash-chained event log. Never exposed through the API.';
comment on schema authz is 'SECURITY DEFINER helpers used by RLS policies.';

-- Nothing outside the database may touch these schemas directly.
revoke all on schema audit from anon, authenticated;
revoke all on schema authz from anon, authenticated;
grant usage on schema authz to anon, authenticated, service_role;

-- ---------------------------------------------------------------- updated_at

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tg_set_updated_at is
  'BEFORE UPDATE trigger: stamps updated_at. Attached to every table with that column.';
