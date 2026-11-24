-- Hosts set up their properties and units while NexG reviews them.
--
-- Until now tg_host_listing_lock (20261114000100) refused every property and
-- unit insert, update or delete by a member of a host whose status was
-- 'applied' or 'verifying', so a new host could do nothing but wait. The
-- owner wants hosts to get their listings ready during review instead.
--
-- The rule now:
--   * applied / verifying: the host's members can add, edit and remove their
--     properties and units. Nothing of it reaches guests until NexG approves
--     the host (status 'live'), because every guest-facing read already
--     requires a live host, and none of that changes here:
--       - property_public and property_unit_public (20270228000300) require
--         h.status = 'live', p.listed, u.listed and u.status = 'live'. The
--         Discovery engine reads only these views.
--       - rpc_unit_set_published refuses to publish while the host is not
--         live: fn_unit_listing_missing lists "NexG approval of your host
--         account" (20270125000100), so host_published stays false and
--         fn_listing_sync never auto-lists the unit or its property.
--       - a unit of a host under review stays 'setting_up':
--         rpc_unit_upsert_guarded only promotes it when the host is live,
--         and rpc_host_verify promotes ready units on approval.
--       - authz.host_photo_is_public (host-photos bucket) returns false for a
--         host that is not live.
--       - rpc_host_workspace_published_guide (QR guide pages) requires
--         h.status = 'live' and u.status = 'live'; a QR scan of a unit that
--         is not live does not land on it.
--   * live / paused: unchanged, the host edits freely (paused already hides
--     everything from guests through the same h.status = 'live' checks).
--   * offboarded: the account is closed, so changes make no sense. The lock
--     now applies here instead.
--
-- Staff, system writes (no auth.uid()) and the nexg.host_listing_unlock
-- escape hatch are still let through, as before.

create or replace function public.tg_host_listing_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid := coalesce(new.host_id, old.host_id);
  v_uid uuid := auth.uid();
begin
  if v_uid is null
    or authz.staff_id() is not null
    or pg_catalog.current_setting('nexg.host_listing_unlock', true) = 'on' then
    return coalesce(new, old);
  end if;
  /* A host under review may set up its listings (they stay hidden from
     guests until the host is live); only a closed account is locked. */
  if exists (
    select 1 from public.host h
    join public.host_user member on member.host_id = h.id and member.user_id = v_uid
    where h.id = v_host and h.status = 'offboarded'
  ) then
    raise exception 'This host account is closed. Contact NexG support to reopen it.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.tg_host_listing_lock() is
  'Refuses property and unit changes by members of an offboarded host. Hosts under review (applied, verifying) may set up properties and units: guests see none of it until the host is live (property_public, property_unit_public, rpc_unit_set_published, host_photo_is_public and the QR guide all require a live host).';
