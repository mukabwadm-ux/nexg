-- Every unit sits in exactly one property.
--
-- NexG manages a host's whole building, not loose flats: a guest who opens
-- one unit should see the others in the same apartment, and the host
-- manages them together. `unit.property_id` has existed since
-- 20260101008400, but it was optional. A host application without an
-- imported Airbnb listing (rpc_host_apply) created its first unit with no
-- property, so those units belonged to nothing (11 such units in
-- production on 2026-11-22, one per applied host, none listed).
--
-- What this adds:
--   1. fn_unit_default_property(unit): the property a unit with none goes
--      into. The host's property named like the unit's building, else the
--      host's oldest property, else a new one named after the building or
--      the host. Never another host's property, never a deleted one.
--   2. A BEFORE trigger on unit: a unit saved with no property is put into
--      that default; a unit put into another host's property, or a deleted
--      one, is refused. Every existing insert path (rpc_host_apply,
--      rpc_unit_upsert, seeds, staff tools) keeps working unchanged.
--      rpc_unit_upsert_guarded inserts first and sets the chosen property
--      right after, so the default it gets for that moment is an existing
--      property of the host, and no stray property is created.
--   3. Backfill of the units that have no property.
--   4. unit_has_property: a check constraint, validated, so the rule holds
--      for every row from here on. (A check rather than NOT NULL, so the
--      generated insert types stay as they are: the trigger fills it.)
--
-- No change to bookings, payments, listing rules or any public view.

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('property.created_for_unit', 'hotels', 'info', false,
   'A property was created so a unit without one sits in its building')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ the default property

create or replace function public.fn_unit_default_property(
  p_host_id uuid,
  p_building text default null,
  p_area text default null,
  p_city_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_building text := nullif(trim(coalesce(p_building, '')), '');
  v_host public.host;
  v_id uuid;
  v_name text;
  v_try text;
  v_n integer := 1;
  v_slug text;
  v_unlock text := pg_catalog.current_setting('nexg.host_listing_unlock', true);
begin
  if p_host_id is null then
    return null;
  end if;

  /* The building the unit names, when the host already has it. */
  if v_building is not null then
    select id into v_id from public.property
     where host_id = p_host_id and deleted_at is null
       and lower(trim(name)) = lower(v_building)
     order by created_at
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  /* Otherwise the host's first property. */
  if v_building is null then
    select id into v_id from public.property
     where host_id = p_host_id and deleted_at is null
     order by created_at, id
     limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  select * into v_host from public.host where id = p_host_id;
  if v_host.id is null then
    return null;
  end if;

  v_name := left(coalesce(
    v_building,
    nullif(trim(coalesce(v_host.display_name, '')), ''),
    nullif(trim(coalesce(v_host.contact_name, '')), ''),
    'My property'), 120);

  /* (host_id, name) is unique, deleted properties included. */
  v_try := v_name;
  while exists (select 1 from public.property where host_id = p_host_id and name = v_try) loop
    v_n := v_n + 1;
    v_try := v_name || ' (' || v_n || ')';
  end loop;

  v_slug := trim(both '-' from regexp_replace(lower(v_try), '[^a-z0-9]+', '-', 'g'));
  v_slug := left(coalesce(nullif(v_slug, ''), 'stay'), 60) || '-'
            || left(replace(gen_random_uuid()::text, '-', ''), 8);

  /* The approval lock (tg_host_listing_lock) is for what a host types; this
     is the system keeping a unit inside a building. */
  perform pg_catalog.set_config('nexg.host_listing_unlock', 'on', true);
  insert into public.property (host_id, slug, name, kind, area, city_id)
  values (p_host_id, v_slug, v_try, 'apartment',
          nullif(trim(coalesce(p_area, '')), ''), coalesce(p_city_id, v_host.city_id))
  returning id into v_id;
  /* Put back whatever the caller had (rpc_host_apply turns it on itself). */
  perform pg_catalog.set_config('nexg.host_listing_unlock', coalesce(nullif(v_unlock, ''), 'off'), true);

  perform audit.log('system'::public.actor_type, 'hotels', 'property.created_for_unit',
    p_target_type => 'property', p_target_id => v_id, p_city_id => coalesce(p_city_id, v_host.city_id),
    p_after => jsonb_build_object('host_id', p_host_id, 'name', v_try));

  return v_id;
end;
$$;

revoke execute on function public.fn_unit_default_property(uuid, text, text, uuid)
from public, anon, authenticated;

comment on function public.fn_unit_default_property(uuid, text, text, uuid) is
  'The property a unit with none is put into: the host''s property named like the unit''s building, else the host''s first property, else a new one. Internal; called by the unit_property_guard trigger.';

-- ═══════════════════════════════════════════════ the guard

create or replace function public.tg_unit_property_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_deleted timestamptz;
begin
  if new.property_id is null then
    new.property_id := public.fn_unit_default_property(
      new.host_id, new.building, new.area, new.city_id);
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.property_id is not distinct from old.property_id
     and new.host_id is not distinct from old.host_id then
    return new;
  end if;

  select host_id, deleted_at into v_owner, v_deleted
    from public.property where id = new.property_id;
  if v_owner is distinct from new.host_id then
    raise exception 'A unit can only sit in a property on its own host account.'
      using errcode = '22023';
  end if;
  if v_deleted is not null and new.archived_at is null then
    raise exception 'That property was removed. Choose another property for the unit.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function public.tg_unit_property_guard() from public, anon, authenticated;

drop trigger if exists unit_property_guard on public.unit;
create trigger unit_property_guard
  before insert or update of property_id, host_id on public.unit
  for each row execute function public.tg_unit_property_guard();

-- ═══════════════════════════════════════════════ backfill

do $$
declare
  v_unit record;
begin
  perform pg_catalog.set_config('nexg.host_listing_unlock', 'on', true);
  for v_unit in
    select id, host_id, building, area, city_id
      from public.unit
     where property_id is null
     order by host_id, created_at, id
  loop
    update public.unit
       set property_id = public.fn_unit_default_property(
             v_unit.host_id, v_unit.building, v_unit.area, v_unit.city_id)
     where id = v_unit.id;
  end loop;
  perform pg_catalog.set_config('nexg.host_listing_unlock', 'off', true);
end;
$$;

-- ═══════════════════════════════════════════════ the rule

alter table public.unit
  drop constraint if exists unit_has_property,
  add constraint unit_has_property check (property_id is not null);

comment on constraint unit_has_property on public.unit is
  'Every unit sits in exactly one property (its building). unit_property_guard fills it in when a write leaves it empty.';

comment on column public.unit.property_id is
  'The property (building or apartment) the unit sits in. Always set, always a property of the same host.';
