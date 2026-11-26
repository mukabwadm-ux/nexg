-- A host can archive one unit.
--
-- Until now only a whole property could be retired (rpc_property_delete,
-- 20260101019500), which archives every unit in it. A host with one flat
-- they no longer let out had no way to take just that flat away.
--
-- rpc_unit_archive(p_unit) does for one unit what rpc_property_delete does
-- for each of a property's units:
--   · status = 'archived', archived_at = now(), and host_published = false;
--   · the unit's QR cards are voided, so a guest who scans one is told the
--     card is retired;
--   · one audit row, unit.archived.
--
-- It is refused, with the reason, when the unit is outside the caller's
-- access, already archived, in a removed property, or has a booking, hold
-- or block today or still to come.
--
-- Guests stop seeing the unit in the same write:
--   · tg_unit_publish_guard turns `listed` off because host_published went
--     from true to false (20270125000100);
--   · unit_listing_sync fires on status, archived_at and host_published and
--     fn_listing_sync then leaves an unpublished unit unlisted;
--   · property_unit_public only shows units with status = 'live', listed and
--     archived_at is null (20270323000100).
-- Known gap, shared with rpc_property_delete: rpc_stay_hold checks
-- property_unit_public before it locks the unit and does not check again, so a
-- guest hold that started just before this archive commits can still land on
-- the archived unit. The fix belongs in rpc_stay_hold (re-check status and
-- archived_at after its FOR UPDATE) and is left as a follow-up.
--
-- The property itself is left listed, as rpc_unit_set_published leaves it
-- when a host unpublishes its last unit.
--
-- Rollback: drop function public.rpc_unit_archive(uuid); delete unit.archived
-- from audit.action_registry once its audit rows are archived. Archived units
-- stay archived: nothing here can be undone by the host, as with a property.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('unit.archived', 'hotels', 'notice', false,
   'Host archived a unit: it left the site and its QR cards were voided')
on conflict (action) do nothing;

/*
 * Archive one unit. Returns { unit_id, archived_at, cards_voided }.
 *
 * The voided cards get a reason because property_qr_void_has_a_reason
 * requires one on every voided row.
 */
create or replace function public.rpc_unit_archive(p_unit uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_property public.property;
  v_bookings integer;
  v_cards integer;
begin
  select * into v_unit from public.unit where id = p_unit for update;
  if v_unit.id is null
     or not authz.is_host_member(v_unit.host_id)
     or not authz.can_see_unit(v_unit.id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;

  /* Before the archived check: rpc_property_delete archives every unit with
     the property, so this is the reason such a unit cannot be archived. */
  select * into v_property from public.property where id = v_unit.property_id;
  if v_property.id is not null and v_property.deleted_at is not null then
    raise exception 'This unit''s property has been removed, so the unit was archived with it.'
      using errcode = '22023';
  end if;

  if v_unit.archived_at is not null or v_unit.status = 'archived' then
    raise exception 'This unit is already archived.' using errcode = '22023';
  end if;

  /* A hold that has lapsed is not a reason to refuse: release it first, under
     the unit lock, as the hold and block functions do (20261118000100). */
  perform public.fn_stay_release_expired_holds(v_unit.id);

  select count(*) into v_bookings from public.stay s
   where s.unit_id = v_unit.id and s.check_out >= now()
     and s.status <> 'cancelled';
  if v_bookings > 0 then
    raise exception 'This unit has % booking(s), hold(s) or block(s) today or still to come. Cancel or move them first: those guests have the address.', v_bookings
      using errcode = '23503';
  end if;

  update public.unit
     set host_published = false, archived_at = now(), status = 'archived'
   where id = v_unit.id;

  update public.property_qr
     set voided_at = now(), void_reason = 'The unit was archived'
   where owner_type = 'unit' and owner_id = v_unit.id and voided_at is null;
  get diagnostics v_cards = row_count;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.archived',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_unit.id,
    p_city_id => v_unit.city_id,
    p_before => jsonb_build_object('name', v_unit.name, 'status', v_unit.status,
                                   'published', v_unit.host_published, 'listed', v_unit.listed),
    p_after => jsonb_build_object('property', v_unit.property_id, 'cards_voided', v_cards));

  select * into v_unit from public.unit where id = v_unit.id;
  return jsonb_build_object(
    'unit_id', v_unit.id,
    'archived_at', v_unit.archived_at,
    'cards_voided', v_cards);
end;
$$;

revoke execute on function public.rpc_unit_archive(uuid) from public, anon;
grant execute on function public.rpc_unit_archive(uuid) to authenticated;

/*
 * rpc_property_delete (20260101019500) voided its units' QR cards without a reason, which
 * property_qr_void_has_a_reason refuses: removing a property with a live card failed. Same function,
 * now giving the reason. Nothing else changes.
 */
create or replace function public.rpc_property_delete(
  p_property_id uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.property;
  v_live integer;
  v_bookings integer;
  v_unpaid integer;
begin
  select * into v_property from public.property
   where id = p_property_id and deleted_at is null;

  if v_property.id is null then
    raise exception 'No such property.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_property.host_id) then
    raise exception 'Not your property.' using errcode = 'insufficient_privilege';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_property.name)) then
    raise exception 'Type the property name exactly to confirm: %', v_property.name
      using errcode = '22023';
  end if;

  /* Hosts pause a unit by taking it off NEXG Stays (host_published); its status
     stays 'live', and no host path changes that. Counting status = 'live' here
     meant a host could never remove a property. Only units still on NEXG Stays
     block it now. Guests with bookings are protected by the check below. */
  select count(*) into v_live from public.unit
   where property_id = p_property_id and status = 'live' and archived_at is null
     and (host_published or listed);
  if v_live > 0 then
    raise exception 'This property has % unit(s) still on NEXG Stays. Pause them first, then remove the property.', v_live
      using errcode = '23503';
  end if;

  select count(*) into v_bookings from public.stay s
   where s.property_id = p_property_id and s.check_out >= now()
     and s.status <> 'cancelled';
  if v_bookings > 0 then
    raise exception 'There are % booking(s) here today or still to come. Those guests have the address.', v_bookings
      using errcode = '23503';
  end if;

  select count(*) into v_unpaid from public.host_invoice
   where host_id = v_property.host_id and paid_at is null;
  if v_unpaid > 0 then
    raise exception 'There is an unpaid invoice on this account. Settle it before removing a property.'
      using errcode = '23503';
  end if;

  update public.property
     set deleted_at = now(), deleted_by = (select auth.uid()), updated_at = now()
   where id = p_property_id;

  update public.unit set archived_at = now(), status = 'archived'
   where property_id = p_property_id and archived_at is null;

  update public.property_qr set voided_at = now(), void_reason = 'The property was removed'
   where owner_type = 'unit'
     and owner_id in (select id from public.unit where property_id = p_property_id)
     and voided_at is null;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'property.deleted',
    p_target_type => 'property', p_target_id => p_property_id,
    p_city_id => v_property.city_id,
    p_before => jsonb_build_object('name', v_property.name));

  return jsonb_build_object(
    'ok', true,
    'note', 'Removed from your account. Statements and the audit trail are kept for seven years, '
            'and the cards in those units now tell a guest the card is retired.');
end;
$$;
