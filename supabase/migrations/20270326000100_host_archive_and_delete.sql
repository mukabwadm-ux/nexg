-- Pause, archive and delete: three separate host actions, the same for a
-- property and for a unit.
--
--   · Pause / resume: off NEXG Stays and back. Unchanged: the unit's publish
--     switch (rpc_unit_set_published, host_published). A property is paused
--     by pausing every unit in it.
--   · Archive / restore: off the host's properties page into Archived, and off
--     NEXG Stays. Restore brings it back paused. Nothing is deleted and the QR
--     cards stay as they are.
--       rpc_unit_archive(p_unit), rpc_unit_unarchive(p_unit)
--       rpc_property_archive(p_property), rpc_property_unarchive(p_property)
--   · Delete: gone for good from the host's pages, Archived included. The QR
--     cards are voided with a reason. Stays, statements and the audit trail are
--     kept (a soft delete). The host types the name to confirm.
--       rpc_unit_delete(p_unit, p_confirm_name)
--       rpc_property_delete(p_property_id, p_confirm_name), redefined
--
-- Archive and delete are refused (23503) while a guest has a stay that is not
-- cancelled and has not ended (check_out >= now()). A hold that has lapsed is
-- released first, under the unit lock, and does not count.
--
-- New columns: property.archived_at and unit.deleted_at. A unit of a deleted
-- property is deleted with it (and older ones are backfilled below).
--
-- Guests stop seeing archived and deleted properties and units:
--   · property_public and property_unit_public (latest 20270323000100) are
--     recreated as they were, plus p.archived_at, p.deleted_at and u.deleted_at
--     being null. rpc_stay_search, rpc_native_stay_quote and rpc_stay_hold read
--     property_unit_public, so they follow.
--   · authz.stay_guest_guide_unit (20270320000300) also needs the unit not
--     deleted and its property neither archived nor deleted.
--   · fn_unit_listing_missing (20270320000100) also lists "The property is
--     archived", so the publish switch refuses a unit in an archived property.
-- Host and staff reads of units are not changed.
--
-- Known gap, as before: rpc_stay_hold checks property_unit_public before it
-- locks the unit and does not check again, so a guest hold that started just
-- before an archive commits can still land on the unit. The fix belongs in
-- rpc_stay_hold and is left as a follow-up.
--
-- Rollback: drop the five new functions, restore rpc_property_delete,
-- fn_unit_listing_missing, authz.stay_guest_guide_unit and the two views from
-- their earlier migrations, then drop property.archived_at and unit.deleted_at.

-- ═══════════════════════════════════════════════ columns

alter table public.property add column if not exists archived_at timestamptz;
alter table public.unit add column if not exists deleted_at timestamptz;

comment on column public.property.archived_at is
  'Set when the host archives the property: it leaves the host''s properties page for Archived, and NEXG Stays. Null again on restore.';
comment on column public.unit.deleted_at is
  'Set when the host deletes the unit, or its property. The row, its stays and its audit trail are kept; the host no longer sees it.';

/* Units of a property deleted before this migration go with it. */
update public.unit u
   set deleted_at = p.deleted_at,
       archived_at = coalesce(u.archived_at, p.deleted_at),
       status = 'archived'
  from public.property p
 where p.id = u.property_id and p.deleted_at is not null and u.deleted_at is null;

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('unit.archived', 'hotels', 'notice', false,
   'Host archived a unit: it moved to Archived and left NEXG Stays'),
  ('unit.unarchived', 'hotels', 'info', false,
   'Host restored an archived unit; it stays off NEXG Stays until the host publishes it'),
  ('unit.deleted', 'hotels', 'notice', false,
   'Host deleted a unit; its QR cards were voided, its stays and records kept'),
  ('property.archived', 'hotels', 'notice', false,
   'Host archived a property: it moved to Archived and its units left NEXG Stays'),
  ('property.unarchived', 'hotels', 'info', false,
   'Host restored an archived property; its units stay off NEXG Stays until the host publishes them'),
  ('property.deleted', 'hotels', 'notice', false,
   'Host deleted a property; its units'' QR cards were voided, its stays and records kept')
on conflict (action) do update set description = excluded.description;

-- ═══════════════════════════════════════════════ archive a unit

/* Returns { unit_id, archived_at }. */
create or replace function public.rpc_unit_archive(p_unit uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_property public.property;
begin
  select * into v_unit from public.unit where id = p_unit for update;
  if v_unit.id is null or v_unit.deleted_at is not null
     or not authz.is_host_member(v_unit.host_id)
     or not authz.can_see_unit(v_unit.id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;

  select * into v_property from public.property where id = v_unit.property_id;
  if v_property.id is not null and v_property.deleted_at is not null then
    raise exception 'This unit''s property has been deleted.' using errcode = '22023';
  end if;
  if v_property.id is not null and v_property.archived_at is not null then
    raise exception 'This unit''s property is archived. Restore its property first.'
      using errcode = '22023';
  end if;
  if v_unit.archived_at is not null or v_unit.status = 'archived' then
    raise exception 'This unit is already archived.' using errcode = '22023';
  end if;

  perform public.fn_stay_release_expired_holds(v_unit.id);
  if exists (select 1 from public.stay s
              where s.unit_id = v_unit.id and s.check_out >= now() and s.status <> 'cancelled') then
    raise exception 'A guest has a stay here that hasn''t ended. You can do this after they check out, or once the stay is cancelled.'
      using errcode = '23503';
  end if;

  /* The publish guard and the listing sync unlist it in this same update. */
  update public.unit
     set host_published = false, archived_at = now(), status = 'archived'
   where id = v_unit.id;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.archived',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_unit.id,
    p_city_id => v_unit.city_id,
    p_before => jsonb_build_object('name', v_unit.name, 'status', v_unit.status,
                                   'published', v_unit.host_published, 'listed', v_unit.listed),
    p_after => jsonb_build_object('property', v_unit.property_id));

  return jsonb_build_object('unit_id', v_unit.id,
    'archived_at', (select archived_at from public.unit where id = v_unit.id));
end;
$$;

revoke execute on function public.rpc_unit_archive(uuid) from public, anon;
grant execute on function public.rpc_unit_archive(uuid) to authenticated;

-- ═══════════════════════════════════════════════ restore a unit

/*
 * Back on the properties page, paused. Its status starts again at setting_up
 * and goes live on the rule rpc_unit_upsert_guarded uses (20270320000100): the
 * host is live and the unit has an address and a handoff. Returns
 * { unit_id, status, published }.
 */
create or replace function public.rpc_unit_unarchive(p_unit uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_property public.property;
  v_status public.unit_status := 'setting_up';
begin
  select * into v_unit from public.unit where id = p_unit for update;
  if v_unit.id is null or v_unit.deleted_at is not null
     or not authz.is_host_member(v_unit.host_id)
     or not authz.can_see_unit(v_unit.id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  if v_unit.archived_at is null then
    raise exception 'This unit is not archived.' using errcode = '22023';
  end if;

  select * into v_property from public.property where id = v_unit.property_id;
  if v_property.id is not null and v_property.deleted_at is not null then
    raise exception 'This unit''s property has been deleted.' using errcode = '22023';
  end if;
  if v_property.id is not null and v_property.archived_at is not null then
    raise exception 'This unit''s property is archived. Restore its property first.'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.host where id = v_unit.host_id and status = 'live')
     and v_unit.address_line is not null and v_unit.handoff is not null then
    v_status := 'live';
  end if;

  update public.unit
     set archived_at = null, host_published = false, status = v_status
   where id = v_unit.id;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.unarchived',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_unit.id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('property', v_unit.property_id, 'status', v_status));

  return jsonb_build_object('unit_id', v_unit.id, 'status', v_status, 'published', false);
end;
$$;

revoke execute on function public.rpc_unit_unarchive(uuid) from public, anon;
grant execute on function public.rpc_unit_unarchive(uuid) to authenticated;

-- ═══════════════════════════════════════════════ delete a unit

/* Returns { unit_id, cards_voided }. */
create or replace function public.rpc_unit_delete(p_unit uuid, p_confirm_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_cards integer;
begin
  select * into v_unit from public.unit where id = p_unit for update;
  if v_unit.id is null or v_unit.deleted_at is not null
     or not authz.is_host_member(v_unit.host_id)
     or not authz.can_see_unit(v_unit.id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  if lower(trim(coalesce(p_confirm_name, ''))) <> lower(trim(v_unit.name)) then
    raise exception 'Type the unit name exactly to confirm: %', v_unit.name using errcode = '22023';
  end if;

  perform public.fn_stay_release_expired_holds(v_unit.id);
  if exists (select 1 from public.stay s
              where s.unit_id = v_unit.id and s.check_out >= now() and s.status <> 'cancelled') then
    raise exception 'A guest has a stay here that hasn''t ended. You can do this after they check out, or once the stay is cancelled.'
      using errcode = '23503';
  end if;

  update public.unit
     set deleted_at = now(), archived_at = coalesce(archived_at, now()),
         status = 'archived', host_published = false
   where id = v_unit.id;

  update public.property_qr
     set voided_at = now(), void_reason = 'The unit was deleted'
   where owner_type = 'unit' and owner_id = v_unit.id and voided_at is null;
  get diagnostics v_cards = row_count;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.deleted',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_unit.id,
    p_city_id => v_unit.city_id,
    p_before => jsonb_build_object('name', v_unit.name, 'status', v_unit.status,
                                   'archived', v_unit.archived_at is not null),
    p_after => jsonb_build_object('property', v_unit.property_id, 'cards_voided', v_cards));

  return jsonb_build_object('unit_id', v_unit.id, 'cards_voided', v_cards);
end;
$$;

revoke execute on function public.rpc_unit_delete(uuid, text) from public, anon;
grant execute on function public.rpc_unit_delete(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════ archive a property

/*
 * Every unit goes off NEXG Stays. Each unit keeps its own archived_at, so
 * restoring the property brings back the units that were on the page.
 * Returns { property_id, archived_at }.
 */
create or replace function public.rpc_property_archive(p_property uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.property;
  v_unit uuid;
begin
  select * into v_property from public.property where id = p_property for update;
  if v_property.id is null or v_property.deleted_at is not null
     or not authz.is_host_member(v_property.host_id) then
    raise exception 'This property is outside your workspace access.' using errcode = '42501';
  end if;
  if v_property.archived_at is not null then
    raise exception 'This property is already archived.' using errcode = '22023';
  end if;

  for v_unit in select id from public.unit where property_id = v_property.id order by id for update loop
    perform public.fn_stay_release_expired_holds(v_unit);
  end loop;
  if exists (select 1 from public.stay s
              where (s.property_id = v_property.id
                     or s.unit_id in (select id from public.unit where property_id = v_property.id))
                and s.check_out >= now() and s.status <> 'cancelled') then
    raise exception 'A guest has a stay here that hasn''t ended. You can do this after they check out, or once the stay is cancelled.'
      using errcode = '23503';
  end if;

  update public.property set archived_at = now() where id = v_property.id;
  update public.unit set host_published = false
   where property_id = v_property.id and host_published;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'property.archived',
    p_actor_id => auth.uid(), p_target_type => 'property', p_target_id => v_property.id,
    p_city_id => v_property.city_id,
    p_before => jsonb_build_object('name', v_property.name));

  return jsonb_build_object('property_id', v_property.id,
    'archived_at', (select archived_at from public.property where id = v_property.id));
end;
$$;

revoke execute on function public.rpc_property_archive(uuid) from public, anon;
grant execute on function public.rpc_property_archive(uuid) to authenticated;

-- ═══════════════════════════════════════════════ restore a property

/* Its units stay paused. Returns { property_id }. */
create or replace function public.rpc_property_unarchive(p_property uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.property;
begin
  select * into v_property from public.property where id = p_property for update;
  if v_property.id is null or v_property.deleted_at is not null
     or not authz.is_host_member(v_property.host_id) then
    raise exception 'This property is outside your workspace access.' using errcode = '42501';
  end if;
  if v_property.archived_at is null then
    raise exception 'This property is not archived.' using errcode = '22023';
  end if;

  update public.property set archived_at = null where id = v_property.id;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'property.unarchived',
    p_actor_id => auth.uid(), p_target_type => 'property', p_target_id => v_property.id,
    p_city_id => v_property.city_id,
    p_before => jsonb_build_object('name', v_property.name));

  return jsonb_build_object('property_id', v_property.id);
end;
$$;

revoke execute on function public.rpc_property_unarchive(uuid) from public, anon;
grant execute on function public.rpc_property_unarchive(uuid) to authenticated;

-- ═══════════════════════════════════════════════ delete a property

/*
 * rpc_property_delete (20260101019500), redefined:
 *   · only units still on NEXG Stays block it. Hosts pause a unit with the
 *     publish switch and its status stays 'live' (no host path changes it), so
 *     counting status = 'live' meant a host could never delete a property;
 *   · an archived property can be deleted;
 *   · its units are deleted with it, and their cards are voided with a reason,
 *     which property_qr_void_has_a_reason requires (without one, deleting a
 *     property with a placed card failed);
 *   · the upcoming-stay refusal uses the same words as archive.
 * The typed name, the unpaid-invoice check and the note are kept.
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
  v_unpaid integer;
  v_unit uuid;
  v_cards integer;
begin
  select * into v_property from public.property
   where id = p_property_id and deleted_at is null
   for update;

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

  select count(*) into v_live from public.unit
   where property_id = p_property_id and archived_at is null
     and (host_published or listed);
  if v_live > 0 then
    raise exception 'This property has % unit(s) still on NEXG Stays. Pause them first, then delete the property.', v_live
      using errcode = '23503';
  end if;

  for v_unit in select id from public.unit where property_id = p_property_id order by id for update loop
    perform public.fn_stay_release_expired_holds(v_unit);
  end loop;
  if exists (select 1 from public.stay s
              where (s.property_id = p_property_id
                     or s.unit_id in (select id from public.unit where property_id = p_property_id))
                and s.check_out >= now() and s.status <> 'cancelled') then
    raise exception 'A guest has a stay here that hasn''t ended. You can do this after they check out, or once the stay is cancelled.'
      using errcode = '23503';
  end if;

  select count(*) into v_unpaid from public.host_invoice
   where host_id = v_property.host_id and paid_at is null;
  if v_unpaid > 0 then
    raise exception 'There is an unpaid invoice on this account. Settle it before deleting a property.'
      using errcode = '23503';
  end if;

  update public.property
     set deleted_at = now(), deleted_by = (select auth.uid()), updated_at = now()
   where id = p_property_id;

  update public.unit
     set deleted_at = coalesce(deleted_at, now()), archived_at = coalesce(archived_at, now()),
         status = 'archived', host_published = false
   where property_id = p_property_id;

  update public.property_qr set voided_at = now(), void_reason = 'The property was deleted'
   where owner_type = 'unit'
     and owner_id in (select id from public.unit where property_id = p_property_id)
     and voided_at is null;
  get diagnostics v_cards = row_count;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'property.deleted',
    p_actor_id => auth.uid(), p_target_type => 'property', p_target_id => p_property_id,
    p_city_id => v_property.city_id,
    p_before => jsonb_build_object('name', v_property.name,
                                   'archived', v_property.archived_at is not null),
    p_after => jsonb_build_object('cards_voided', v_cards));

  return jsonb_build_object(
    'ok', true,
    'note', 'Deleted from your account. Statements and the audit trail are kept for seven years, '
            'and the cards in its units now tell a guest the card is retired.');
end;
$$;

revoke execute on function public.rpc_property_delete(uuid, text) from public, anon;
grant execute on function public.rpc_property_delete(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════ the publish switch

/* fn_unit_listing_missing: 20270320000100, plus "The property is archived". */
create or replace function public.fn_unit_listing_missing(p_unit_id uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_host public.host;
  v_property public.property;
  v_missing text[] := '{}';
begin
  select * into v_unit from public.unit where id = p_unit_id;
  if v_unit.id is null then
    return array['The unit could not be found'];
  end if;
  if v_unit.archived_at is not null then
    return array['The unit is archived'];
  end if;

  select * into v_host from public.host where id = v_unit.host_id;
  if v_host.status is distinct from 'live' then
    v_missing := v_missing || 'NexG approval of your host account'::text;
  end if;

  if v_unit.status = 'archived' then
    v_missing := v_missing || 'The unit is archived'::text;
  elsif v_unit.status <> 'live' then
    if v_unit.address_line is null then
      v_missing := v_missing || 'A street address'::text;
    end if;
    if v_unit.handoff is null then
      v_missing := v_missing || 'A delivery handoff rule'::text;
    end if;
    if v_unit.status = 'paused' then
      v_missing := v_missing || 'The unit is paused'::text;
    end if;
    /* Setting up with everything above in place goes live on approval; any
       other state that is not live still is not ready. */
    if cardinality(v_missing) = 0 then
      v_missing := v_missing || 'One more save of the unit'::text;
    end if;
  end if;

  if v_unit.property_id is not null then
    select * into v_property from public.property
     where id = v_unit.property_id and deleted_at is null;
  end if;
  if v_property.id is null then
    v_missing := v_missing || 'A property'::text;
  elsif v_property.archived_at is not null then
    v_missing := v_missing || 'The property is archived'::text;
  elsif nullif(trim(v_property.name), '') is null then
    v_missing := v_missing || 'A property name'::text;
  end if;

  if nullif(trim(coalesce(v_property.area, v_unit.area)), '') is null then
    v_missing := v_missing || 'An area'::text;
  end if;
  if v_unit.nightly_rate_kes is null then
    v_missing := v_missing || 'A nightly rate'::text;
  end if;
  if coalesce(v_unit.max_guests, 0) <= 0 then
    v_missing := v_missing || 'Guest capacity'::text;
  end if;
  if v_unit.bedrooms is null then
    v_missing := v_missing || 'Bedrooms'::text;
  end if;
  if coalesce(jsonb_array_length(v_unit.photos), 0) = 0
     and coalesce(jsonb_array_length(v_property.photos), 0) = 0 then
    v_missing := v_missing || 'At least one photo'::text;
  end if;

  return v_missing;
end;
$$;

-- ═══════════════════════════════════════════════ what a guest sees

-- property_public: 20270323000100, plus not archived or deleted.
create or replace view public.property_public
with (security_invoker = false) as
select
  p.id,
  p.slug,
  p.name,
  p.kind,
  p.area,
  p.city_id,
  c.name as city_name,
  p.summary,
  p.description,
  p.amenities,
  p.photos,
  p.neighbourhood_note,
  p.check_in_from,
  p.check_out_by,
  count(u.id)::integer as units_available,
  min(u.bedrooms) as bedrooms_min,
  max(u.bedrooms) as bedrooms_max,
  max(u.max_guests) as sleeps_max,
  /* "from KES x" is a minimum, and only over units that actually have
     a rate. All null stays null, and the card says price on request. */
  min(u.nightly_rate_kes) as from_rate_kes,
  count(*) filter (where u.nightly_rate_kes is null)::integer as units_without_rate,
  /* A demonstration listing: shown, never bookable. */
  p.is_sample,
  /* The host's exact pin (owner, 20 Nov): public. */
  extensions.st_y(p.point::extensions.geometry) as latitude,
  extensions.st_x(p.point::extensions.geometry) as longitude,
  p.house_rules,
  p.cancellation_policy,
  p.accepts_test_payments as is_test
from public.property p
join public.host h on h.id = p.host_id
left join public.city c on c.id = p.city_id
join public.unit u
  on u.property_id = p.id
 and u.status = 'live'
 and u.listed
 and u.archived_at is null
 and u.deleted_at is null
where p.listed and h.status = 'live'
  and p.review_status = 'approved'
  and p.archived_at is null
  and p.deleted_at is null
  and (not p.accepts_test_payments or (select authz.sees_test_tenants()))
group by p.id, c.name;

-- property_unit_public: 20270323000100, plus not archived or deleted.
create or replace view public.property_unit_public
with (security_invoker = false) as
select
  u.id,
  u.property_id,
  u.label_public,
  u.name,
  u.unit_summary,
  u.bedrooms,
  u.bathrooms,
  u.max_guests,
  u.size_sqm,
  u.bed_setup,
  u.nightly_rate_kes,
  u.min_nights,
  u.unit_amenities,
  u.photos,
  u.floor,
  u.area,
  /* So a guest knows the concierge rule exists without being handed
     the askari's name before they have booked anything. */
  (u.handoff is not null) as handoff_arranged,
  p.is_sample,
  /* The unit's own pin and times; null means use the property's. */
  extensions.st_y(u.point::extensions.geometry) as latitude,
  extensions.st_x(u.point::extensions.geometry) as longitude,
  u.checkin_time,
  u.checkout_time,
  p.accepts_test_payments as is_test
from public.unit u
join public.property p on p.id = u.property_id
join public.host h on h.id = u.host_id
where u.status = 'live' and u.listed and u.archived_at is null and u.deleted_at is null
  and p.listed and h.status = 'live'
  and p.review_status = 'approved'
  and p.archived_at is null
  and p.deleted_at is null
  and (not p.accepts_test_payments or (select authz.sees_test_tenants()));

grant select on public.property_public to anon, authenticated;
grant select on public.property_unit_public to anon, authenticated;

-- authz.stay_guest_guide_unit: 20270320000300, plus the unit not deleted and
-- its property neither archived nor deleted.
create or replace function authz.stay_guest_guide_unit(p_stay_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from public.stay s
    join public.unit u on u.id = s.unit_id and u.host_id = s.host_id
    join public.host h on h.id = u.host_id
    join public.host_unit_guide guide on guide.unit_id = u.id
   where s.id = p_stay_id
     and s.guest_user_id is not null
     and s.status in ('booked', 'in_stay')
     and now() < s.check_out
     and h.status = 'live'
     and u.status = 'live'
     and u.archived_at is null
     and u.deleted_at is null
     and not exists (
       select 1 from public.property p
        where p.id = u.property_id and (p.archived_at is not null or p.deleted_at is not null))
     and guide.published_id is not null
$$;

revoke all on function authz.stay_guest_guide_unit(uuid) from public, anon, authenticated;
