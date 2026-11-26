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

  if v_unit.archived_at is not null or v_unit.status = 'archived' then
    raise exception 'This unit is already archived.' using errcode = '22023';
  end if;

  select * into v_property from public.property where id = v_unit.property_id;
  if v_property.id is not null and v_property.deleted_at is not null then
    raise exception 'This unit''s property has been removed, so the unit was archived with it.'
      using errcode = '22023';
  end if;

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
