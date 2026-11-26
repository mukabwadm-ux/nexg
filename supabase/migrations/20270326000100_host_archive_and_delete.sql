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
-- released first, under the unit lock, and does not count. Nor does a guest
-- the host has already checked out (departed): an early check-out leaves
-- check_out at the booked date.
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
--   · A placed card in a unit of an archived property: the guide by code
--     (rpc_host_workspace_published_guide, 20261113001000, and the guide
--     files that read through it) returns nothing, and rpc_resolve_qr
--     (20260101010700) answers paused, as for an archived unit. The card is
--     not voided, so both work again on restore.
--   · host_attention_v (20270320000100) no longer asks for a QR card in a
--     unit of an archived property.
-- Host and staff reads of units are not changed.
--
-- New stays: a trigger on public.stay refuses a new stay, hold or block (not
-- a cancelled row) on a unit that is archived or deleted, or whose property
-- is. It runs inside the insert, after rpc_stay_hold, rpc_stay_upsert,
-- rpc_stay_block and rpc_stay_host_hold have taken the unit lock that archive
-- and delete also take, so a guest hold that checked property_unit_public
-- just before an archive committed is refused too.
--
-- Deploy order: push this migration before the web change that reads
-- property.archived_at and unit.deleted_at, or the Hosts Workspace snapshot
-- fails on the older database.
--
-- Rollback: drop the five new functions and the stay trigger, restore
-- rpc_property_delete, fn_unit_listing_missing, authz.stay_guest_guide_unit,
-- rpc_host_workspace_published_guide, rpc_resolve_qr, host_attention_v and the
-- two views from their earlier migrations, then drop property.archived_at and
-- unit.deleted_at.

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
              where s.unit_id = v_unit.id and s.check_out >= now() and s.status not in ('cancelled', 'departed')) then
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
              where s.unit_id = v_unit.id and s.check_out >= now() and s.status not in ('cancelled', 'departed')) then
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
                and s.check_out >= now() and s.status not in ('cancelled', 'departed')) then
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
                and s.check_out >= now() and s.status not in ('cancelled', 'departed')) then
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

-- ═══════════════════════════════════════════════ a card in an archived property

-- rpc_host_workspace_published_guide: 20261113001000, plus the unit not
-- deleted and its property neither archived nor deleted. The guide files
-- (rpc_host_workspace_guide_asset, _asset_sign) read through it.
create or replace function public.rpc_host_workspace_published_guide(p_code text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('unitName', coalesce(u.label_public, q.label, 'Your unit'),
    'document', version.document, 'publishedAt', version.published_at)
  from public.property_qr q
  join public.unit u on u.id = q.owner_id and u.host_id = q.host_id
  join public.host h on h.id = u.host_id
  join public.host_unit_guide guide on guide.unit_id = u.id
  join public.host_unit_guide_version version on version.id = guide.published_id and version.unit_id = guide.unit_id
  where q.code = upper(trim(p_code)) and q.owner_type = 'unit' and q.voided_at is null
    and q.state = 'placed' and q.placed_confirmed_at is not null
    and h.status = 'live' and u.status = 'live' and u.archived_at is null
    and u.deleted_at is null
    and not exists (
      select 1 from public.property p
       where p.id = u.property_id and (p.archived_at is not null or p.deleted_at is not null))
$$;

-- rpc_resolve_qr: 20260101010700, plus an archived or deleted unit or
-- property answers paused.
create or replace function public.rpc_resolve_qr(
  p_code text,
  p_session_id text default null,
  p_device jsonb default '{}'::jsonb,
  p_referrer public.qr_referrer_kind default 'unknown',
  p_ip_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := upper(trim(p_code));
  v_qr public.property_qr;
  v_session text := coalesce(nullif(trim(p_session_id), ''),
                             encode(extensions.gen_random_bytes(16), 'hex'));
  v_now timestamptz := clock_timestamp();
  v_recent integer;
  v_bot boolean := false;
  v_token text;
  v_scan_id bigint;
  v_unit public.unit;
  v_room public.hotel_room;
  v_area public.hotel_area;
  v_hotel public.hotel;
  v_ctx jsonb;
  v_outcome public.qr_scan_outcome;
begin
  if v_code !~ '^NXG-[0-9A-Z]{6}$' then
    insert into public.qr_miss (code_attempted, session_id, ip_country, reason)
    values (left(coalesce(v_code, ''), 32), v_session, p_ip_country, 'not_found');
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'session_id', v_session,
      'message', 'That code is not one of ours. Check the card, or order to another address.');
  end if;

  select * into v_qr from public.property_qr where code = v_code;

  if v_qr.id is null then
    insert into public.qr_miss (code_attempted, session_id, ip_country, reason)
    values (v_code, v_session, p_ip_country, 'not_found');
    return jsonb_build_object('ok', false, 'reason', 'not_found', 'session_id', v_session,
      'message', 'That code is not one of ours. Check the card, or order to another address.');
  end if;

  /* Sixty a minute on one card. A card on a hotel lobby table during
     a conference can legitimately be busy; a thousand a minute is
     somebody walking the keyspace. */
  select count(*) into v_recent
    from public.qr_scan s
   where s.qr_id = v_qr.id and s.scanned_at > v_now - interval '1 minute';

  if v_recent >= 60 then
    insert into public.qr_miss (code_attempted, session_id, ip_country, reason)
    values (v_code, v_session, p_ip_country, 'rate_limited');
    return jsonb_build_object('ok', false, 'reason', 'busy', 'session_id', v_session,
      'message', 'Too many requests for this card just now. Try again in a moment.');
  end if;

  v_bot := coalesce((p_device ->> 'is_headless')::boolean, false)
        or coalesce(p_device ->> 'ua_family', '') in ('HeadlessChrome', 'PhantomJS', 'bot')
        or v_recent >= 20;

  /* What the scanner gets, decided before the row is written so the
     row records the outcome rather than a guess at it. */
  if v_qr.voided_at is not null then
    v_outcome := 'voided';
  else
    if v_qr.owner_type = 'unit' then
      select * into v_unit from public.unit where id = v_qr.owner_id;
      /* An archived or deleted unit, or one in an archived or deleted
         property (20270326000100), answers paused. */
      v_outcome := case when v_unit.status = 'live' and v_unit.archived_at is null
                          and v_unit.deleted_at is null
                          and not exists (
                            select 1 from public.property p
                             where p.id = v_unit.property_id
                               and (p.archived_at is not null or p.deleted_at is not null))
                        then 'landed' else 'paused_unit' end;
    elsif v_qr.owner_type = 'hotel_room' then
      select * into v_room from public.hotel_room where id = v_qr.owner_id;
      select * into v_hotel from public.hotel where id = v_room.hotel_id;
      v_outcome := case when v_hotel.status = 'partner' and v_room.status = 'active'
                        then 'landed' else 'paused_unit' end;
    else
      select * into v_area from public.hotel_area where id = v_qr.owner_id;
      select * into v_hotel from public.hotel where id = v_area.hotel_id;
      v_outcome := case when v_hotel.status = 'partner' and v_area.status = 'active'
                        then 'landed' else 'paused_unit' end;
    end if;
  end if;

  if v_bot then v_outcome := 'blocked'; end if;

  insert into public.qr_scan (
    scanned_at, qr_id, code, owner_type, owner_id, host_id, hotel_id, city_id,
    placement, session_id, device, ip_country, referrer_kind, outcome, is_bot)
  values (
    v_now, v_qr.id, v_qr.code, v_qr.owner_type, v_qr.owner_id,
    v_qr.host_id, v_qr.hotel_id, v_qr.city_id,
    v_qr.placement, v_session, coalesce(p_device, '{}'::jsonb), p_ip_country,
    p_referrer, v_outcome, v_bot)
  returning id into v_scan_id;

  /* Signed with this card's secret, over this session and this
     moment. Written back onto the row so a replay can be recognised
     rather than inferred. */
  v_token := encode(extensions.hmac(
    v_qr.id::text || '.' || v_session || '.' || extract(epoch from v_now)::bigint::text,
    v_qr.secret_hash, 'sha256'), 'hex');

  update public.qr_scan set scan_token = v_token
   where id = v_scan_id and scanned_at = v_now;

  /* A blocked or voided scan is still a scan: the counters move, so
     "this old card is still being scanned" is answerable. */
  update public.property_qr set
    scans = scans + 1,
    first_scanned_at = coalesce(first_scanned_at, v_now),
    last_scanned_at = v_now,
    placed_confirmed_at = coalesce(placed_confirmed_at, case when v_outcome = 'landed' then v_now end),
    state = case when state in ('generated', 'sent') and v_outcome = 'landed'
                 then 'scanned' else state end
  where id = v_qr.id;

  if v_outcome = 'blocked' then
    return jsonb_build_object('ok', false, 'reason', 'busy', 'session_id', v_session,
      'message', 'Try again in a moment.');
  end if;

  if v_outcome = 'voided' then
    return jsonb_build_object('ok', false, 'reason', 'replaced', 'session_id', v_session,
      'label', v_qr.label,
      'message', 'This code was replaced — ask your host for the new card.');
  end if;

  if v_outcome = 'paused_unit' then
    return jsonb_build_object('ok', false, 'reason', 'paused', 'session_id', v_session,
      'label', v_qr.label,
      'message', 'This place isn''t taking orders right now — you can still order to another address.');
  end if;

  if v_qr.owner_type = 'unit' then
    select to_jsonb(c) into v_ctx from public.unit_context_v c where c.unit_id = v_unit.id;
  else
    select jsonb_build_object(
      'hotel_id', h.hotel_id, 'hotel_name', h.hotel_name,
      'charge_to_room', h.offer_charge_to_room,
      'cap', h.charge_cap_per_stay,
      'preferred_suppliers', h.preferred_suppliers,
      'room_no', v_room.room_no,
      'area_name', v_area.name,
      'delivery_point_note', v_area.delivery_point_note
    ) into v_ctx
    from public.checkout_hotel_context_v h where h.hotel_id = v_hotel.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'kind', v_qr.owner_type,
    'label', v_qr.label,
    'placement', v_qr.placement,
    'qr_id', v_qr.id,
    'session_id', v_session,
    'scan_token', v_token,
    'context', v_ctx);
end;
$$;

-- host_attention_v: 20270320000100, plus no card or setup reminders for a
-- unit in an archived or deleted property.
create or replace view public.host_attention_v
with (security_invoker = true) as
-- The caretaker card (sort 1) is gone: a caretaker no longer confirms.
-- This branch now comes first, so it names the columns.
-- a card that was replaced and is still in a guest's hand
-- ('voided' is what the scan outcome is called; 'retired' is what
--  the guest is shown, and they are the same event)
select
  s.host_id,
  2 as sort,
  'retired_card_scanned'::text as kind,
  'A retired QR card is still being scanned'::text as title,
  'A card that has been replaced was scanned again. Guests see "this card is '
    || 'retired, ask your host". Place the new card or re-print it.' as body,
  s.owner_id as unit_id,
  null::text as unit_name
from public.qr_scan s
where s.outcome::text = 'voided'
  and s.scanned_at > now() - interval '7 days'
group by s.host_id, s.owner_id
union all
-- live, but a guest in the room has nothing to scan
select
  u.host_id, 3, 'no_qr_card',
  'A live unit has no QR card',
  u.name || ' is live but has no card placed, so guests there cannot order '
    || 'from the room.',
  u.id, u.name
from public.unit u
where u.archived_at is null and u.status = 'live'
  and not exists (select 1 from public.property p
                   where p.id = u.property_id
                     and (p.archived_at is not null or p.deleted_at is not null))
  and not coalesce((u.readiness ->> 'qr_placed')::boolean, false)
union all
-- stuck
select
  u.host_id, 4, 'unit_stuck',
  'A unit has been in setup for over five days',
  u.name || ' has not moved since it was created. Whatever is blocking it is '
    || 'not going to clear on its own.',
  u.id, u.name
from public.unit u
where u.archived_at is null and u.status = 'setting_up'
  and not exists (select 1 from public.property p
                   where p.id = u.property_id
                     and (p.archived_at is not null or p.deleted_at is not null))
  and u.created_at < now() - interval '5 days';

-- ═══════════════════════════════════════════════ no new stays

/*
 * A new stay, hold or block on an archived or deleted unit, or on a unit of
 * an archived or deleted property, is refused. Runs inside the insert, after
 * the stay RPCs have locked the unit, so it sees an archive or delete that
 * committed while they waited for that lock.
 */
create or replace function public.fn_stay_refuse_archived_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /* An edit that keeps the stay on its unit (rpc_stay_upsert sets unit_id
     on every edit) is not a new stay there. */
  if new.status = 'cancelled' or new.unit_id is null
     or (tg_op = 'UPDATE' and old.unit_id = new.unit_id) then
    return new;
  end if;
  if exists (
    select 1 from public.unit u
      left join public.property p on p.id = u.property_id
     where u.id = new.unit_id
       and (u.archived_at is not null or u.deleted_at is not null
            or p.archived_at is not null or p.deleted_at is not null)
  ) then
    raise exception 'This unit is archived or deleted. Restore it before adding a stay.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_stay_refuse_archived_unit() from public, anon, authenticated;

drop trigger if exists stay_refuse_archived_unit on public.stay;
create trigger stay_refuse_archived_unit
  before insert or update of unit_id on public.stay
  for each row execute function public.fn_stay_refuse_archived_unit();
