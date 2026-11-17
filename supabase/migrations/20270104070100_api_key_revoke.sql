-- Revoking API keys from the developer console, merchant Settings and Admin.
--
-- rpc_api_key_revoke has existed since 20260101022900, but no screen called
-- it, so a leaked key could only be stopped by hand. The screens now call it,
-- and it is tightened for that:
--   * a merchant's key may be revoked by the merchant's owner, as only the
--     owner may issue one (fn_api_key_issue); before, any member could,
--     managers and cashiers too;
--   * the person who issued a key with no merchant (a platform key) may
--     revoke it; before, only staff could;
--   * the owner, or that person, needs a current signed-in session, as
--     issuing a key does;
--   * the audit entry names who revoked the key, merchant user or staff,
--     with the key's merchant, environment and prefix; before, a merchant's
--     revoke was logged with no actor;
--   * an unknown key is refused (P0002), and revoking a key that is not
--     active changes nothing, logs nothing and returns false;
--   * the reason is trimmed and kept to 200 characters.
-- Staff may still revoke any key.
--
-- And the issuer of a platform key may read it, so the developer console can
-- list it: api_key_read covered only staff and the members of a key's merchant.
-- The restrictive merchant_application_session_gate passes rows with no
-- merchant, so it does not hide them.
--
-- CREATE OR REPLACE keeps the function's grants (authenticated, service_role).
-- The audit action api.key_revoked is registered under the settings module
-- (20261112000100), which this now logs it under.
--
-- Rollback: re-run rpc_api_key_revoke from 20260101022900_api_authentication.sql;
-- drop policy api_key_read_own_platform on public.api_key.

create or replace function public.rpc_api_key_revoke(
  p_key_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  k public.api_key;
  v_staff uuid := authz.staff_id();
  v_user uuid := auth.uid();
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
begin
  select * into k from public.api_key where id = p_key_id for update;
  if not found then
    raise exception 'No such key.' using errcode = 'P0002';
  end if;

  -- Staff may revoke any key. Anyone else, in a current session: the owner of
  -- the key's merchant, or the person who issued a key that has no merchant.
  if v_staff is null then
    perform authz.require_merchant_application_session();
    if not (
      (k.merchant_id is not null and exists (
        select 1 from public.merchant_user mu
         where mu.merchant_id = k.merchant_id and mu.user_id = v_user and mu.role = 'owner'))
      or (k.merchant_id is null and k.created_by_user is not null and k.created_by_user = v_user)
    ) then
      raise exception 'Not allowed to revoke this key.' using errcode = '42501';
    end if;
  end if;

  if k.state <> 'active' then
    return false;
  end if;

  update public.api_key
     set state = 'revoked',
         revoked_at = now(),
         revoked_by = v_staff,
         revoke_reason = v_reason
   where id = p_key_id;

  perform audit.log(
    p_actor_type => case when v_staff is not null then 'staff'::public.actor_type
                         else 'merchant_user'::public.actor_type end,
    p_actor_id => coalesce(v_staff, v_user),
    p_module => 'settings',
    p_action => 'api.key_revoked',
    p_target_type => 'api_key',
    p_target_id => p_key_id,
    p_reason => v_reason,
    p_before => jsonb_build_object('state', k.state, 'merchant_id', k.merchant_id,
      'environment', k.environment, 'key_prefix', k.key_prefix),
    p_after => jsonb_build_object('state', 'revoked'));

  return true;
end;
$$;

comment on function public.rpc_api_key_revoke(uuid, text) is
  'Revoke an API key at once. Staff: any key. Otherwise, in a current session: the owner of the key''s merchant, or the issuer of a key with no merchant. False when the key was not active.';

create policy api_key_read_own_platform on public.api_key
  for select to authenticated
  using (merchant_id is null and created_by_user = (select auth.uid()));
