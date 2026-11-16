-- A host team member limited to some units no longer reaches the others.
--
-- host_user.units (20260101007900) limits a property manager's staff to some
-- units; null means every unit. authz.can_see_unit honours it, and so do the
-- hosts-workspace functions from 20261113* (tasks, photos, finance). But
-- authz.is_host_member answered only "is this person on the host's team",
-- and that is the check behind the older host screens and changes: the stay
-- list (host_stay_v), the unit list (host_unit_list_v), the stay row policy
-- (stay_host_read), rpc_unit_upsert_guarded (20261114000100), and the stay
-- functions in 20261118000100 (host hold, confirm, block, upsert, cancel). A
-- member limited to one unit could read and change every unit's guests and
-- stays.
--
-- Nothing sets host_user.units yet: every host_user row is written by an
-- application or onboarding step, as an owner. So no account can do this
-- today; it is closed before team invites can create one.
--
-- The fix is in one place. is_host_member now means a member with every
-- unit, so each check built on it refuses a unit-limited member, while the
-- per-unit paths (authz.can_see_unit and the workspace functions) keep
-- serving them their own units. Owners and full members see no change. No
-- function checked is_host_member and then narrowed by units, so none loses
-- a path it meant to give unit-limited staff. A screen that should also
-- serve them opens up when team invites are built, by checking
-- authz.can_see_unit for the unit in question.
--
-- Rollback: re-run authz.is_host_member from 20260101008000.

create or replace function authz.is_host_member(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.host_user hu
    where hu.host_id = p_host_id
      and hu.user_id = (select auth.uid())
      and hu.units is null
  )
$$;

comment on function authz.is_host_member(uuid) is
  'A member of this host with every unit (host_user.units is null). Staff limited to some units are checked per unit with authz.can_see_unit.';
