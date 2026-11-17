-- An owner can change their team, and the change is saved.
--
-- rpc_merchant_membership_update (20260101020100) failed on every call.
-- It wrote coalesce(nullif(p_role, ''), role) into merchant_user.role;
-- p_role is text and role is merchant_user_role, and Postgres will not
-- resolve COALESCE across the two ("COALESCE types text and
-- merchant_user_role cannot be matched"). Role, branches and capabilities
-- all went through that one statement, so none of them could change. Seen
-- in production on 17 Nov 2026.
--
-- Now that it works, three rules matter:
-- 1. Only an owner changes the team. The team screen says so (owner:
--    "everything, including money and team"; manager: "orders, catalogue,
--    hours, disputes"), and owners alone hold the API keys, webhooks and
--    integrations, so a manager must not be able to make themselves one.
--    It used to check membership only.
-- 2. A role is one of merchant_user_role's values, cashier included since
--    20270101000300, and is cast to it.
-- 3. A blank role means "no change", so it no longer runs the last-owner
--    check: the only owner can change their own branches and capabilities.
--
-- Rollback: re-run rpc_merchant_membership_update from
-- 20260101020100_branches_and_team_can_be_managed.sql.

create or replace function public.rpc_merchant_membership_update(
  p_merchant_id uuid,
  p_user_id uuid,
  p_role text default null,
  p_branches uuid[] default null,
  p_caps jsonb default null
)
returns public.merchant_user
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.merchant_user;
  v_owners integer;
  v_role text := nullif(trim(p_role), '');
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.merchant_user
     where merchant_id = p_merchant_id
       and user_id = (select auth.uid())
       and role = 'owner'
  ) then
    raise exception 'Only an owner can change the team.' using errcode = '42501';
  end if;

  if v_role is not null
     and not (v_role = any (enum_range(null::public.merchant_user_role)::text[])) then
    raise exception 'There is no % role on a team.', v_role using errcode = '22023';
  end if;

  /*
   * An account with no owner is one nobody can change payout
   * details on, invite to, or close. Demoting the last one is
   * refused rather than discovered later.
   */
  if v_role is not null and v_role <> 'owner' then
    select count(*) into v_owners from public.merchant_user
     where merchant_id = p_merchant_id and role = 'owner' and user_id <> p_user_id;
    if v_owners = 0 then
      raise exception 'That is the only owner. Make somebody else an owner first.'
        using errcode = '23503';
    end if;
  end if;

  update public.merchant_user set
    role = coalesce(v_role::public.merchant_user_role, role),
    branches = coalesce(p_branches, branches),
    caps = coalesce(p_caps, caps),
    updated_at = now()
  where merchant_id = p_merchant_id and user_id = p_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'That person is not on this account.' using errcode = '22023';
  end if;

  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'merchant.member_updated',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('role', v_row.role));

  return v_row;
end;
$$;
