-- Undo the rollout's two repair commands, ONLY if the dry run after them is wrong
-- and nothing has been pushed yet. History table only: no schema or data change.
-- Puts back live's 18 rows of the 20261111 block exactly as archived
-- (supabase/live-history/20261111-block.json) and removes the 9 rows the
-- "applied" repair added. Run in the Supabase SQL editor, on the owner's yes.
begin;
delete from supabase_migrations.schema_migrations
 where version in ('20261113000100', '20261113000200', '20261113000300', '20261113000400', '20261113000600', '20261113000700', '20261113000800', '20261113000900', '20261113001000');
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000000', 'activities_games_sports_enum', array[
$rollout_undo$alter type public.merchant_category add value if not exists 'activities_games_sports'$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000100', 'activities_games_sports_config', array[
$rollout_undo$-- Initial Activities, Games & Sports configuration from the shared taxonomy.
insert into public.category_config (
  category, label, icon, card_kind, eta_style, sort, color, bg, description,
  subcategories, featured_eligible, requires_ops_mapping
) values (
  'activities_games_sports', 'Activities, Games & Sports', 'Trophy', 'services', 'turnaround', 22,
  '#0f766e', '#f0fdfa', 'Indoor games, outdoor sports, adrenaline activities and swimming.',
  $activities$
[
  {
    "id": "bowling",
    "name": "Bowling",
    "icon": "CircleDot",
    "group": "Indoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "arcade_games",
    "name": "Arcade & timed play",
    "icon": "Gamepad2",
    "group": "Indoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "escape_rooms",
    "name": "Escape rooms",
    "icon": "KeyRound",
    "group": "Indoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "indoor_courts",
    "name": "Indoor sports courts",
    "icon": "Trophy",
    "group": "Indoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "outdoor_courts",
    "name": "Outdoor sports courts",
    "icon": "Trophy",
    "group": "Outdoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "football_pitches",
    "name": "Football pitches",
    "icon": "Goal",
    "group": "Outdoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  },
  {
    "id": "outdoor_team_games",
    "name": "Outdoor team games",
    "icon": "Trees",
    "group": "Outdoor",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "go_karting",
    "name": "Go-karting",
    "icon": "Flag",
    "group": "Adrenaline",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "paintball",
    "name": "Paintball",
    "icon": "Target",
    "group": "Adrenaline",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "ziplining",
    "name": "Ziplining & high ropes",
    "icon": "Mountain",
    "group": "Adrenaline",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "REQUEST_QUOTE",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Send activity requirements → operator reviews eligibility and conditions → accept quote → confirm with operator"
  },
  {
    "id": "swimming_sessions",
    "name": "Public swim sessions",
    "icon": "Waves",
    "group": "Swimming",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SESSION_CAPACITY",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a dated session → check places and eligibility → confirm booking → check in"
  },
  {
    "id": "swimming_lessons",
    "name": "Swimming lessons",
    "icon": "Waves",
    "group": "Swimming",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "APPOINTMENT",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a lesson → check instructor and pool availability → confirm appointment → attend"
  },
  {
    "id": "pool_lane_hire",
    "name": "Pool lane hire",
    "icon": "Waves",
    "group": "Swimming",
    "categoryId": "activities_games_sports",
    "fulfillmentHint": "merchant_venue",
    "workflowHint": "SPACE_RESERVATION",
    "fields": [],
    "suggestedItemCount": 10,
    "defaultWorkflow": "Choose a venue and time → check space and party limits → confirm reservation → check in"
  }
]
  $activities$::jsonb,
  true, true
)
on conflict (category) do nothing$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000200', 'host_unit_portfolio_save', array[
$rollout_undo$-- Keep the existing unit save and its portfolio details in the same transaction.
create or replace function public.rpc_unit_upsert_guarded(
  p_host_id uuid,
  p_unit jsonb,
  p_unit_id uuid default null
)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_name text := nullif(trim(p_unit ->> 'name'), '');
  v_property_id uuid := nullif(p_unit ->> 'property_id', '')::uuid;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your unit.' using errcode = '42501';
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.property
    where id = v_property_id and host_id = p_host_id and deleted_at is null
    for share
  ) then
    raise exception 'Choose a property on your account.' using errcode = '22023';
  end if;

  if p_unit_id is null and v_name is not null and exists (
    select 1 from public.unit
    where host_id = p_host_id and name = v_name and archived_at is null
  ) then
    raise exception 'You already have a unit called %.', v_name using errcode = '23505';
  end if;

  v_unit := public.rpc_unit_upsert(p_host_id, p_unit, p_unit_id);
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;

  if p_unit ?| array['property_id', 'bedrooms', 'bathrooms', 'max_guests', 'nightly_rate_kes'] then
    update public.unit set
      property_id = coalesce(v_property_id, property_id),
      bedrooms = coalesce(nullif(p_unit ->> 'bedrooms', '')::integer, bedrooms),
      bathrooms = coalesce(nullif(p_unit ->> 'bathrooms', '')::numeric, bathrooms),
      max_guests = coalesce(nullif(p_unit ->> 'max_guests', '')::integer, max_guests),
      nightly_rate_kes = coalesce(nullif(p_unit ->> 'nightly_rate_kes', '')::bigint, nightly_rate_kes)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  return v_unit;
end;
$$$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000300', 'host_manual_finance', array[
$rollout_undo$-- Manual host records. NexG invoices and money movement stay in their existing ledgers.
create table public.host_manual_finance (
  id uuid primary key,
  host_id uuid not null references public.host(id) on delete cascade,
  unit_id uuid not null references public.unit(id),
  stay_id uuid references public.stay(id),
  kind text not null check (kind in ('Receipt','Refund','Deposit','Deposit refund','Expense')),
  amount_minor bigint not null check (amount_minor between 1 and 10000000000),
  recorded_on date not null,
  description text not null default '',
  category text not null default '',
  reference text not null default '',
  status text not null default 'Recorded' check (status in ('Recorded','Due','Pending','Failed')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  check (
    (kind = 'Expense' and stay_id is null and length(trim(description)) between 1 and 240
      and category in ('Cleaning','Maintenance','Utilities','Supplies','Other') and status in ('Recorded','Due'))
    or
    (kind <> 'Expense' and stay_id is not null and length(trim(reference)) between 1 and 100
      and status in ('Recorded','Pending','Failed'))
  )
)$rollout_undo$,
$rollout_undo$create index host_manual_finance_scope on public.host_manual_finance(host_id, unit_id, recorded_on desc)$rollout_undo$,
$rollout_undo$create index host_manual_finance_stay on public.host_manual_finance(stay_id) where stay_id is not null$rollout_undo$,
$rollout_undo$create unique index host_manual_finance_reference on public.host_manual_finance(host_id, kind, lower(reference))
  where stay_id is not null and status <> 'Failed'$rollout_undo$,
$rollout_undo$alter table public.host_manual_finance enable row level security$rollout_undo$,
$rollout_undo$revoke all on public.host_manual_finance from anon, authenticated$rollout_undo$,
$rollout_undo$grant select on public.host_manual_finance to authenticated$rollout_undo$,
$rollout_undo$create policy host_manual_finance_read on public.host_manual_finance
for select to authenticated
using (
  exists (
    select 1 from public.host_user member
    where member.host_id = host_manual_finance.host_id and member.user_id = (select auth.uid())
      and member.role in ('owner', 'manager')
      and (member.units is null or host_manual_finance.unit_id = any(member.units))
  )
)$rollout_undo$,
$rollout_undo$create function public.rpc_host_manual_finance_record(p_host_id uuid, p_entry jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_id uuid := (p_entry ->> 'id')::uuid;
  v_unit_id uuid := (p_entry ->> 'unit_id')::uuid;
  v_stay_id uuid := (p_entry ->> 'stay_id')::uuid;
  v_kind text := p_entry ->> 'kind';
  v_amount bigint := (p_entry ->> 'amount_minor')::bigint;
  v_date date := (p_entry ->> 'recorded_on')::date;
  v_description text := coalesce(trim(p_entry ->> 'description'), '');
  v_category text := coalesce(trim(p_entry ->> 'category'), '');
  v_reference text := coalesce(trim(p_entry ->> 'reference'), '');
  v_status text := p_entry ->> 'status';
  v_stay public.stay;
  v_existing public.host_manual_finance;
  v_balance bigint;
begin
  if v_stay_id is not null then
    select * into v_stay from public.stay
    where id = v_stay_id and host_id = p_host_id for update;
    v_unit_id := v_stay.unit_id;
  end if;

  if v_unit_id is null or not exists (
    select 1 from public.host_user member
    join public.unit unit on unit.host_id = member.host_id
    where member.host_id = p_host_id and member.user_id = v_actor and unit.id = v_unit_id
      and member.role in ('owner', 'manager')
      and (member.units is null or v_unit_id = any(member.units))
  ) then
    raise exception 'Choose a stay or unit in your workspace.' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text, 0));
  select * into v_existing from public.host_manual_finance where id = v_id;
  if found then
    if (v_existing.host_id, v_existing.unit_id, v_existing.stay_id, v_existing.kind,
        v_existing.amount_minor, v_existing.recorded_on, v_existing.reference, v_existing.status,
        v_existing.description, v_existing.category, v_existing.created_by)
      is not distinct from
       (p_host_id, v_unit_id, v_stay_id, v_kind, v_amount, v_date, v_reference, v_status,
        v_description, v_category, v_actor) then
      return v_id;
    end if;
    raise exception 'This entry already has a recorded outcome. Reopen the form to add a new entry.'
      using errcode = '22023';
  end if;

  if v_status = 'Recorded' and v_kind in ('Refund','Deposit refund') then
    select coalesce(sum(
      case
        when kind = (case v_kind when 'Refund' then 'Receipt' else 'Deposit' end) then amount_minor
        when kind = v_kind then -amount_minor
        else 0
      end
    ), 0) into v_balance from public.host_manual_finance
    where host_id = p_host_id and stay_id = v_stay_id and status = 'Recorded';
    if v_amount > v_balance then
      raise exception 'The refund exceeds the recorded balance for this stay.' using errcode = '22023';
    end if;
  end if;

  insert into public.host_manual_finance (
    id, host_id, unit_id, stay_id, kind, amount_minor, recorded_on, description, category, reference,
    status, created_by
  ) values (
    v_id, p_host_id, v_unit_id, v_stay_id, v_kind, v_amount, v_date, v_description, v_category, v_reference,
    v_status, v_actor
  );
  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.manual_finance_recorded',
    p_target_type => 'host_manual_finance', p_target_id => v_id,
    p_after => jsonb_build_object('kind', v_kind, 'amount_minor', v_amount, 'status', v_status));
  return v_id;
exception
  when unique_violation then
    raise exception 'That payment reference is already recorded.' using errcode = '23505';
  when check_violation or not_null_violation then
    raise exception 'Check the amount, date, type and reference for this entry.' using errcode = '22023';
end;
$$$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_manual_finance_record(uuid, jsonb) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_manual_finance_record(uuid, jsonb) to authenticated$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000400', 'host_workspace_preferences', array[
$rollout_undo$alter table public.host add column workspace_profile jsonb not null default '{}'::jsonb
  check (jsonb_typeof(workspace_profile) = 'object' and octet_length(workspace_profile::text) <= 360000)$rollout_undo$,
$rollout_undo$-- The existing RPC owns shared host settings. The workspace adds only the fields it needs.
create function public.rpc_host_workspace_profile_save(
  p_host_id uuid, p_host_patch jsonb, p_profile_patch jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.host_user member
    where member.host_id = p_host_id and member.user_id = (select auth.uid())
      and member.role = 'owner' and member.units is null
  ) then
    raise exception 'Only the workspace owner can change these settings.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_host_patch) is distinct from 'object'
    or jsonb_typeof(p_profile_patch) is distinct from 'object'
    or octet_length(p_host_patch::text) > 12000
    or octet_length(p_profile_patch::text) > 360000
    or (p_host_patch - array[
      'display_name','email','language','time_zone','features','notification_rules','quiet_hours',
      'landing_headline','landing_brand_colour'
    ]) <> '{}'::jsonb
    or (p_host_patch -> 'features') ? 'charge_to_room'
    or (p_profile_patch - array[
      'business','checkIn','checkOut','signature','bookings','daily','tasks','guestBrand','logo','billingPreference'
    ]) <> '{}'::jsonb then
    raise exception 'Check the workspace settings.' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_each(p_profile_patch) field
    where (field.key in ('bookings','daily','tasks') and jsonb_typeof(field.value) <> 'boolean')
       or (field.key not in ('bookings','daily','tasks') and jsonb_typeof(field.value) <> 'string')
  )
    or length(p_profile_patch ->> 'business') > 120
    or length(p_profile_patch ->> 'guestBrand') > 120
    or length(p_profile_patch ->> 'signature') > 200
    or p_profile_patch ->> 'checkIn' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_profile_patch ->> 'checkOut' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or p_profile_patch ->> 'billingPreference' not in ('Manual record','M-Pesa preference','Card preference')
    or (
      p_profile_patch ->> 'logo' <> ''
      and p_profile_patch ->> 'logo' !~ '^data:image/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$'
    ) then
    raise exception 'Check the workspace profile fields.' using errcode = '22023';
  end if;

  if p_host_patch <> '{}'::jsonb then
    perform public.rpc_host_settings_update(p_host_id, p_host_patch);
  end if;
  if p_profile_patch <> '{}'::jsonb then
    update public.host
    set workspace_profile = workspace_profile || p_profile_patch, updated_at = now()
    where id = p_host_id;

    perform audit.log('host_user'::public.actor_type, 'hotels', 'host.workspace_profile_changed',
      p_actor_id => auth.uid(),
      p_target_type => 'host', p_target_id => p_host_id,
      p_after => jsonb_build_object('keys', (select jsonb_agg(key) from jsonb_object_keys(p_profile_patch) key)));
  end if;
end;
$$$rollout_undo$,
$rollout_undo$create function public.rpc_host_workspace_settings_activity(p_host_id uuid)
returns table(id bigint, at timestamptz, action text, own boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select event.id, event.at, event.action, coalesce(event.actor_id = (select auth.uid()), false)
  from audit.audit_event event
  where event.target_type = 'host' and event.target_id = p_host_id
    and event.action in ('host.settings_changed', 'host.workspace_profile_changed')
    and exists (
      select 1 from public.host_user member
      where member.host_id = p_host_id and member.user_id = (select auth.uid())
        and member.role = 'owner' and member.units is null
    )
  order by event.at desc, event.id desc
  limit 50
$$$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_workspace_profile_save(uuid, jsonb, jsonb) from public, anon$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_workspace_settings_activity(uuid) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_workspace_profile_save(uuid, jsonb, jsonb) to authenticated$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_workspace_settings_activity(uuid) to authenticated$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000500', 'host_workspace_gallery', array[
$rollout_undo$-- Serialize edits to a gallery and keep the existing photo RPCs as the write authority.
create function public.rpc_host_workspace_photos_set(
  p_kind text, p_id uuid, p_expected jsonb, p_photos jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_current jsonb;
begin
  if p_kind = 'property' then
    select property.host_id, property.photos into v_host, v_current
    from public.property property
    join public.host_user member on member.host_id = property.host_id
    where property.id = p_id and property.deleted_at is null
      and member.user_id = (select auth.uid()) and member.units is null
    for update of property;
  elsif p_kind = 'unit' then
    select unit.host_id, unit.photos into v_host, v_current
    from public.unit unit
    where unit.id = p_id and unit.archived_at is null and authz.can_see_unit(unit.id)
    for update;
  end if;

  if v_host is null then
    raise exception 'This gallery is outside your workspace access.' using errcode = '42501';
  end if;
  if coalesce(v_current, '[]'::jsonb) is distinct from coalesce(p_expected, '[]'::jsonb) then
    raise exception 'The gallery changed. Reload it and try again.' using errcode = '40001';
  end if;
  if jsonb_typeof(p_photos) is distinct from 'array' or exists (
    select 1 from jsonb_array_elements(p_photos) as item
    where coalesce(item ->> 'path', '') = ''
      or (split_part(item ->> 'path','/',1) <> v_host::text and not exists (
        select 1 from jsonb_array_elements(coalesce(v_current,'[]'::jsonb)) as previous
        where previous ->> 'path' = item ->> 'path'
      ))
  ) then
    raise exception 'Choose photos from this gallery.' using errcode = '22023';
  end if;

  if p_kind = 'property' then
    perform public.rpc_property_photos_set(p_id,p_photos);
  else
    perform public.rpc_unit_photos_set(p_id,p_photos);
  end if;
end;
$$$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_workspace_photos_set(text,uuid,jsonb,jsonb) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_workspace_photos_set(text,uuid,jsonb,jsonb) to authenticated$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000600', 'scope_merchant_media_policy_check', array[
$rollout_undo$-- The merchant media policy must be able to call its owner checks.
-- Keep the underlying application authorization functions private.
create function authz.owns_merchant_offering_media(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.merchant m
    where m.id::text = (storage.foldername(p_name))[1]
      and authz.merchant_application_owner(m.id)
      and coalesce((authz.merchant_application_access(m.id)->>'setup')::boolean, false)
  )
$$$rollout_undo$,
$rollout_undo$revoke execute on function authz.owns_merchant_offering_media(text) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function authz.owns_merchant_offering_media(text) to authenticated$rollout_undo$,
$rollout_undo$alter policy merchant_offering_media_owner_insert on storage.objects with check (
  bucket_id = 'merchant-offering-media'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}[.](jpg|png|webp)$'
  and authz.owns_merchant_offering_media(name)
)$rollout_undo$,
$rollout_undo$alter policy merchant_offering_media_owner_read on storage.objects using (
  bucket_id = 'merchant-offering-media'
  and authz.owns_merchant_offering_media(name)
)$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000700', 'host_workspace_cancel_placement', array[
$rollout_undo$-- Hosts can cancel a scheduled placement before it becomes a billed placement.
create function public.rpc_host_workspace_package_cancel(p_host_id uuid, p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.package_order;
begin
  select placement.* into v_order from public.package_order placement
  join public.host_user member on member.host_id = placement.host_id
  where placement.id = p_order_id and placement.host_id = p_host_id
    and member.user_id = (select auth.uid())
    and (member.units is null or placement.unit_id = any(member.units))
  for update of placement;
  if v_order.id is null then
    raise exception 'This placement is outside your workspace access.' using errcode = '42501';
  end if;
  if v_order.status = 'cancelled' then return; end if;
  if v_order.status <> 'scheduled' then
    raise exception 'Only scheduled placements can be cancelled here.' using errcode = '22023';
  end if;
  update public.package_order set status = 'cancelled' where id = v_order.id;
  perform audit.log('host_user'::public.actor_type, 'hotels', 'package.cancelled',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_order.unit_id,
    p_after => jsonb_build_object('placement_id', v_order.id));
end;
$$$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_workspace_package_cancel(uuid,uuid) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_workspace_package_cancel(uuid,uuid) to authenticated$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000800', 'retire_packages_with_valid_status', array[
$rollout_undo$-- Retirement uses the existing status and serializes against new placements.
create or replace function public.rpc_host_package_archive(p_package_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_scheduled integer;
begin
  select host_id into v_host from public.welcome_package
   where id = p_package_id and archived_at is null for update;
  if v_host is null then
    raise exception 'No such package, or it is already retired.' using errcode = '22023';
  end if;
  if not authz.is_host_member(v_host) then
    raise exception 'NexG catalogue packages cannot be retired from here.'
      using errcode = 'insufficient_privilege';
  end if;

  select count(*) into v_scheduled from public.package_order
   where package_id = p_package_id and status = 'scheduled';
  if v_scheduled > 0 then
    raise exception 'This package is scheduled for % upcoming check-in(s). Cancel those first.', v_scheduled
      using errcode = '23503';
  end if;

  update public.welcome_package set archived_at = now(), status = 'retired'
   where id = p_package_id;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'package.archived',
    p_target_type => 'host', p_target_id => v_host);

  return jsonb_build_object('ok', true,
    'note', 'Retired. Past orders keep their description on your statements.');
end;
$$$rollout_undo$,
$rollout_undo$create or replace function public.rpc_package_schedule(
  p_host_id uuid,
  p_unit_id uuid,
  p_package_id uuid,
  p_for_checkin_at timestamptz
)
returns public.package_order
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.package_order;
  v_lead integer;
begin
  if not authz.is_host_member(p_host_id) then
    raise exception 'Not your account.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.unit
                  where id = p_unit_id and host_id = p_host_id and archived_at is null) then
    raise exception 'That unit is not on your account.' using errcode = '22023';
  end if;

  select lead_hours into v_lead from public.welcome_package
   where id = p_package_id and archived_at is null and status = 'live'
     and (host_id is null or host_id = p_host_id) for share;
  if v_lead is null then
    raise exception 'That package is not available to you.' using errcode = '22023';
  end if;

  /*
   * The lead time is the real one — how long it takes to buy,
   * assemble and get into a unit across this city on a weekday.
   * Refusing now is the whole point; the alternative is telling
   * a guest at check-in.
   */
  if p_for_checkin_at < now() + (v_lead || ' hours')::interval then
    raise exception 'This package needs % hours. Pick a check-in at least that far ahead, or ask host ops whether it can be rushed.', v_lead
      using errcode = '22023';
  end if;

  insert into public.package_order (host_id, unit_id, package_id, for_checkin_at, status)
  values (p_host_id, p_unit_id, p_package_id, p_for_checkin_at, 'scheduled')
  returning * into v_order;

  perform audit.log('host_user'::public.actor_type, 'hotels', 'package.scheduled',
    p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('package_id', p_package_id, 'for', p_for_checkin_at));

  return v_order;
end;
$$$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111000900', 'host_scoped_privacy_status', array[
$rollout_undo$-- A verified request can share its status with a specific host without sharing its contents.
create table public.host_workspace_data_share (
  request_id uuid not null references public.data_request(id) on delete cascade,
  host_id uuid not null references public.host(id) on delete cascade,
  shared_at timestamptz not null default now(),
  primary key (request_id, host_id)
)$rollout_undo$,
$rollout_undo$create index host_workspace_data_share_host_idx on public.host_workspace_data_share(host_id, request_id)$rollout_undo$,
$rollout_undo$alter table public.host_workspace_data_share enable row level security$rollout_undo$,
$rollout_undo$revoke all on public.host_workspace_data_share from anon, authenticated$rollout_undo$,
$rollout_undo$create function public.rpc_host_workspace_data_share_options(p_request_id uuid)
returns table(host_id uuid, host_name text, shared boolean)
language sql stable security definer set search_path = ''
as $$
  select account.id, account.display_name, link.host_id is not null
  from public.data_request request
  join public.host account on (
    request.identity_verified_at is not null and request.guest_id is not null and exists (
      select 1 from public.qr_scan scan where scan.host_id = account.id and scan.guest_id = request.guest_id
      union all
      select 1 from public."order" booking
      join public.property_qr qr on qr.id = booking.property_qr_id
      where qr.host_id = account.id and booking.guest_id = request.guest_id
    )
  ) or exists (
    select 1 from public.host_workspace_data_share existing
    where existing.request_id = request.id and existing.host_id = account.id
  )
  left join public.host_workspace_data_share link on link.request_id = request.id and link.host_id = account.id
  where request.id = p_request_id and authz.handles_guest_data()
  order by account.display_name, account.id
$$$rollout_undo$,
$rollout_undo$create function public.rpc_host_workspace_data_share_set(p_request_id uuid, p_host_id uuid, p_shared boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not authz.handles_guest_data() then
    raise exception 'Only authorized data-request staff can share status.' using errcode = '42501';
  end if;
  if p_shared then
    if not exists (
      select 1 from public.rpc_host_workspace_data_share_options(p_request_id) candidate
      where candidate.host_id = p_host_id
    ) then
      raise exception 'This verified request has no linked guest activity with that host.' using errcode = '22023';
    end if;
    insert into public.host_workspace_data_share(request_id,host_id) values (p_request_id,p_host_id)
      on conflict do nothing;
  else
    delete from public.host_workspace_data_share where request_id = p_request_id and host_id = p_host_id;
  end if;
  if found then
    perform audit.log('staff'::public.actor_type, 'hotels', 'data_request.host_status_sharing_changed',
      p_target_type => 'data_request', p_target_id => p_request_id,
      p_after => jsonb_build_object('host_id',p_host_id,'shared',p_shared));
  end if;
end;
$$$rollout_undo$,
$rollout_undo$create function public.rpc_host_workspace_shared_data_requests(p_host_id uuid)
returns table(id uuid, kind text, status text, verified boolean, received_at timestamptz, due_at timestamptz, fulfilled_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select request.id, request.kind::text, request.status::text, request.identity_verified_at is not null,
    request.received_at, request.due_at, request.fulfilled_at
  from public.host_workspace_data_share link
  join public.data_request request on request.id = link.request_id
  where link.host_id = p_host_id and exists (
    select 1 from public.host_user member where member.host_id = link.host_id
      and member.user_id = (select auth.uid()) and member.units is null
  )
  order by request.received_at desc, request.id
$$$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_workspace_data_share_options(uuid),
  public.rpc_host_workspace_data_share_set(uuid,uuid,boolean),
  public.rpc_host_workspace_shared_data_requests(uuid) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_workspace_data_share_options(uuid),
  public.rpc_host_workspace_data_share_set(uuid,uuid,boolean),
  public.rpc_host_workspace_shared_data_requests(uuid) to authenticated$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111001000', 'host_workspace_tasks', array[
$rollout_undo$-- Private operational tasks. NexG guest requests continue to use host_request.
create table public.host_workspace_task (
  id uuid primary key,
  unit_id uuid not null references public.unit(id) on delete cascade,
  stay_id uuid references public.stay(id) on delete set null,
  repeat_of uuid unique references public.host_workspace_task(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('Cleaning','Inspection','Maintenance','Guest request')),
  due_at timestamptz not null,
  priority text not null default 'Normal' check (priority in ('Normal','High','Urgent')),
  status text not null default 'To do' check (status in ('To do','In progress','Done','Cancelled')),
  checklist text[] not null default '{}',
  completed_checks text[] not null default '{}',
  evidence text not null default '',
  comments text not null default '' check (char_length(comments) <= 3000),
  cadence text not null default 'None' check (cadence in ('None','Weekly','Monthly')),
  inspection boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  check (cardinality(checklist) <= 40 and length(array_to_string(checklist,E'\n')) <= 4000),
  check (cardinality(completed_checks) <= 40 and completed_checks <@ checklist),
  check (evidence = '' or (length(evidence) <= 333000 and evidence ~ '^data:image/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$')),
  check (status <> 'Done' or (checklist <@ completed_checks and
    (not inspection and kind not in ('Cleaning','Inspection') or evidence <> '')))
)$rollout_undo$,
$rollout_undo$create index host_workspace_task_unit_idx on public.host_workspace_task(unit_id, due_at, id)$rollout_undo$,
$rollout_undo$alter table public.host_workspace_task enable row level security$rollout_undo$,
$rollout_undo$revoke all on public.host_workspace_task from anon, authenticated$rollout_undo$,
$rollout_undo$grant select on public.host_workspace_task to authenticated$rollout_undo$,
$rollout_undo$create policy workspace_task_scoped_read on public.host_workspace_task for select to authenticated
  using (authz.can_see_unit(unit_id))$rollout_undo$,
$rollout_undo$create function public.rpc_host_workspace_task_save(p_id uuid, p_unit_id uuid, p_version integer, p_patch jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  task public.host_workspace_task;
  account uuid;
  zone text;
  actor uuid := (select auth.uid());
begin
  select host_id into account from public.unit where id = p_unit_id and archived_at is null for share;
  if account is null or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or
    p_patch - array['stay_id','assignee_id','title','kind','due_at','priority','status','checklist','completed_checks','evidence','comments','cadence','inspection'] <> '{}'::jsonb then
    raise exception 'Check the task details.' using errcode = '22023';
  end if;
  select * into task from public.host_workspace_task where id = p_id for update;
  if found then
    if task.unit_id <> p_unit_id then
      raise exception 'This task is outside your workspace access.' using errcode = '42501';
    end if;
    if p_version is null and task.created_by = actor then return; end if;
    if task.version is distinct from p_version then
      raise exception 'This task has changed. Reload and try again.' using errcode = '40001';
    end if;
  elsif p_version is not null then
    raise exception 'This task could not be found.' using errcode = '42501';
  end if;

  task := jsonb_populate_record(task, p_patch);
  if task.stay_id is not null and not exists (
    select 1 from public.stay where id = task.stay_id and unit_id = p_unit_id for share
  ) then
    raise exception 'Choose a reservation for this unit.' using errcode = '22023';
  end if;
  if (task.assignee_id is not null or task.status in ('In progress','Done')) and not exists (
    select 1 from public.host_user where host_id = account and user_id = task.assignee_id
      and accepted_at is not null and (units is null or p_unit_id = any(units)) for share
  ) then
    raise exception 'Choose an active team member with access to this unit.' using errcode = '22023';
  end if;
  if task.status = 'Done' and not coalesce(task.checklist,'{}') <@ coalesce(task.completed_checks,'{}') then
    raise exception 'Complete every checklist item before finishing the task.' using errcode = '22023';
  end if;
  if task.status = 'Done' and (task.inspection or task.kind in ('Cleaning','Inspection')) and coalesce(task.evidence,'') = '' then
    raise exception 'Add completion evidence before finishing this task.' using errcode = '22023';
  end if;

  insert into public.host_workspace_task as previous (
    id, unit_id, created_by, stay_id, assignee_id, title, kind, due_at, priority, status, checklist,
    completed_checks, evidence, comments, cadence, inspection
  ) values (
    p_id, p_unit_id, actor, task.stay_id, task.assignee_id, task.title, task.kind, task.due_at,
    coalesce(task.priority,'Normal'), coalesce(task.status,'To do'), coalesce(task.checklist,'{}'),
    coalesce(task.completed_checks,'{}'), coalesce(task.evidence,''), coalesce(task.comments,''),
    coalesce(task.cadence,'None'), coalesce(task.inspection,false)
  ) on conflict (id) do update set
    stay_id = excluded.stay_id, assignee_id = excluded.assignee_id, title = excluded.title, kind = excluded.kind,
    due_at = excluded.due_at, priority = excluded.priority, status = excluded.status,
    checklist = excluded.checklist, completed_checks = excluded.completed_checks, evidence = excluded.evidence,
    comments = excluded.comments, cadence = excluded.cadence, inspection = excluded.inspection,
    version = previous.version + 1, updated_at = now()
  where previous.version = p_version;
  if not found and not (p_version is null and exists (
    select 1 from public.host_workspace_task where id = p_id and unit_id = p_unit_id and created_by = actor
  )) then
    raise exception 'This task has changed. Reload and try again.' using errcode = '40001';
  end if;
  if task.status = 'Done' and task.cadence in ('Weekly','Monthly') then
    select time_zone into zone from public.host where id = account;
    if zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
      zone := 'Africa/Nairobi';
    end if;
    insert into public.host_workspace_task (
      id, unit_id, repeat_of, assignee_id, created_by, title, kind, due_at, priority, checklist, cadence, inspection
    ) values (
      gen_random_uuid(), p_unit_id, p_id, task.assignee_id, actor, task.title, task.kind,
      (task.due_at at time zone zone + case task.cadence when 'Weekly' then interval '1 week' else interval '1 month' end) at time zone zone,
      coalesce(task.priority,'Normal'), coalesce(task.checklist,'{}'), task.cadence, coalesce(task.inspection,false)
    ) on conflict (repeat_of) do nothing;
  end if;
end;
$$$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_workspace_task_save(uuid,uuid,integer,jsonb) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_workspace_task_save(uuid,uuid,integer,jsonb) to authenticated$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111001100', 'host_workspace_guides', array[
$rollout_undo$-- Guest guides use the existing unit and QR identifiers. Drafts and old versions are private.
create table public.host_unit_guide (
  unit_id uuid primary key references public.unit(id) on delete cascade,
  revision integer not null default 0,
  document jsonb not null default '{"articles":[]}',
  published_id uuid
)$rollout_undo$,
$rollout_undo$create table public.host_unit_guide_version (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.host_unit_guide(unit_id) on delete cascade,
  document jsonb not null,
  article_count integer generated always as (jsonb_array_length(document -> 'articles')) stored,
  published_at timestamptz not null default now()
)$rollout_undo$,
$rollout_undo$create index host_unit_guide_history_idx on public.host_unit_guide_version(unit_id, published_at desc, id)$rollout_undo$,
$rollout_undo$create table public.host_unit_guide_asset (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.host_unit_guide(unit_id) on delete cascade,
  kind text not null check (kind in ('plan', 'model')),
  mime text not null check (
    kind = 'plan' and mime in ('image/png','image/jpeg','image/webp') or
    kind = 'model' and mime = 'model/gltf-binary'
  ),
  digest bytea not null,
  body bytea not null check (octet_length(body) between 1 and 12582912),
  unique (unit_id, kind, digest)
)$rollout_undo$,
$rollout_undo$alter table public.host_unit_guide enable row level security$rollout_undo$,
$rollout_undo$alter table public.host_unit_guide_version enable row level security$rollout_undo$,
$rollout_undo$alter table public.host_unit_guide_asset enable row level security$rollout_undo$,
$rollout_undo$revoke all on public.host_unit_guide, public.host_unit_guide_version, public.host_unit_guide_asset from anon, authenticated$rollout_undo$,
$rollout_undo$grant select on public.host_unit_guide, public.host_unit_guide_version to authenticated$rollout_undo$,
$rollout_undo$create policy host_unit_guide_read on public.host_unit_guide for select to authenticated
  using (authz.can_see_unit(unit_id))$rollout_undo$,
$rollout_undo$create policy host_unit_guide_history_read on public.host_unit_guide_version for select to authenticated
  using (authz.can_see_unit(unit_id))$rollout_undo$,
$rollout_undo$create function public.rpc_host_workspace_guide_commit(
  p_unit_id uuid, p_revision integer, p_action text, p_document jsonb, p_restore_id uuid
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  guide public.host_unit_guide;
  content jsonb;
  publication uuid;
begin
  perform 1 from public.unit where id = p_unit_id and archived_at is null for share;
  if not found or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  insert into public.host_unit_guide(unit_id) values (p_unit_id) on conflict do nothing;
  select * into guide from public.host_unit_guide where unit_id = p_unit_id for update;
  if guide.revision is distinct from p_revision then
    raise exception 'The guide has changed. Reload before saving.' using errcode = '40001';
  end if;

  publication := guide.published_id;
  content := guide.document;
  case p_action
    when 'draft' then content := p_document;
    when 'publish' then null;
    when 'unpublish' then publication := null;
    when 'restore' then
      select document into content from public.host_unit_guide_version
        where id = p_restore_id and unit_id = p_unit_id;
      if not found then
        raise exception 'Choose a published version of this guide.' using errcode = '22023';
      end if;
    else raise exception 'Choose a valid guide action.' using errcode = '22023';
  end case;

  if jsonb_typeof(content) is distinct from 'object'
    or content - array['articles','planId','modelId'] <> '{}'::jsonb
    or jsonb_typeof(content -> 'articles') is distinct from 'array'
    or octet_length(content::text) > 170000 then
    raise exception 'Check the guide contents.' using errcode = '22023';
  end if;
  if jsonb_array_length(content -> 'articles') > 40 then
    raise exception 'Use up to 40 amenity instructions.' using errcode = '22023';
  end if;
  if (content ->> 'planId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'planId')::uuid and unit_id = p_unit_id and kind = 'plan'
  )) or (content ->> 'modelId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'modelId')::uuid and unit_id = p_unit_id and kind = 'model'
  )) then
    raise exception 'Choose files attached to this unit.' using errcode = '22023';
  end if;
  if p_action in ('publish','restore') then
    if jsonb_array_length(content -> 'articles') = 0 then
      raise exception 'Add amenity instructions before publishing.' using errcode = '22023';
    end if;
    insert into public.host_unit_guide_version(unit_id,document) values (p_unit_id,content) returning id into publication;
  end if;
  update public.host_unit_guide set document = content, published_id = publication, revision = guide.revision + 1
    where unit_id = p_unit_id;
  return guide.revision + 1;
end;
$$$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_workspace_guide_commit(uuid,integer,text,jsonb,uuid) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_workspace_guide_commit(uuid,integer,text,jsonb,uuid) to authenticated$rollout_undo$,
$rollout_undo$create function public.rpc_host_workspace_guide_asset_put(
  p_unit_id uuid, p_revision integer, p_kind text, p_mime text, p_base64 text
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  guide public.host_unit_guide;
  bytes bytea;
  asset_id uuid;
  checksum bytea;
begin
  perform 1 from public.unit where id = p_unit_id and archived_at is null for share;
  if not found or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  if p_kind not in ('plan','model') or p_base64 is null or length(p_base64) > 16777216 then
    raise exception 'Choose a supported guide file.' using errcode = '22023';
  end if;
  insert into public.host_unit_guide(unit_id) values (p_unit_id) on conflict do nothing;
  select * into guide from public.host_unit_guide where unit_id = p_unit_id for update;
  if guide.revision is distinct from p_revision then
    raise exception 'The guide has changed. Reload before attaching a file.' using errcode = '40001';
  end if;
  bytes := decode(p_base64, 'base64');
  if octet_length(bytes) > (case when p_kind = 'plan' then 2097152 else 12582912 end) then
    raise exception 'This guide file is too large.' using errcode = '22023';
  end if;
  checksum := extensions.digest(bytes, 'sha256');
  select id into asset_id from public.host_unit_guide_asset
    where unit_id = p_unit_id and kind = p_kind and digest = checksum;
  if asset_id is null then
    insert into public.host_unit_guide_asset(unit_id,kind,mime,digest,body)
      values (p_unit_id,p_kind,p_mime,checksum,bytes) returning id into asset_id;
  end if;
  return public.rpc_host_workspace_guide_commit(p_unit_id,p_revision,'draft',
    jsonb_set(guide.document, array[case when p_kind = 'plan' then 'planId' else 'modelId' end], to_jsonb(asset_id)), null);
end;
$$$rollout_undo$,
$rollout_undo$create function public.rpc_host_workspace_published_guide(p_code text)
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
$$$rollout_undo$,
$rollout_undo$create function public.rpc_host_workspace_guide_asset(p_id uuid, p_code text)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('mime',asset.mime,'base64',encode(asset.body,'base64'))
  from public.host_unit_guide_asset asset
  join public.unit u on u.id = asset.unit_id and u.archived_at is null
  where asset.id = p_id and (
    p_code is null and authz.can_see_unit(asset.unit_id) or
    p_code is not null and p_id::text in (
      select unnest(array[doc ->> 'planId', doc ->> 'modelId'])
      from (select public.rpc_host_workspace_published_guide(p_code) -> 'document' as doc) guide
    )
  )
$$$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_workspace_guide_asset_put(uuid,integer,text,text,text) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_workspace_guide_asset_put(uuid,integer,text,text,text) to authenticated$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_host_workspace_published_guide(text),
  public.rpc_host_workspace_guide_asset(uuid,text) from public$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_host_workspace_published_guide(text),
  public.rpc_host_workspace_guide_asset(uuid,text) to anon, authenticated$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111001200', 'unit_save_respects_unit_scope', array[
$rollout_undo$-- A team member limited to some units can only save those units.
--
-- The workspace already refuses this in app code (lib/host-workspace/commands.ts),
-- but the RPC is callable directly with the member's own session, so the database
-- has to say no as well. Membership of the host is not enough: host_user.units
-- narrows it, the same way authz.can_see_unit does for reads.
--
-- Same function also stops two saves at the same moment from both creating a
-- unit with one name. The earlier check read, then wrote, with nothing between;
-- a per-host, per-name transaction lock now sits in front of it. Renames are
-- checked too, but only when the name actually changes, so a unit that already
-- shares a legacy name can still be saved.
create or replace function public.rpc_unit_upsert_guarded(
  p_host_id uuid,
  p_unit jsonb,
  p_unit_id uuid default null
)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_name text := nullif(trim(p_unit ->> 'name'), '');
  v_property_id uuid := nullif(p_unit ->> 'property_id', '')::uuid;
  v_staff boolean := authz.works_hospitality(null);
  v_member boolean := authz.is_host_member(p_host_id);
  v_scope uuid[];
  v_current public.unit;
begin
  if not v_member and not v_staff then
    raise exception 'Not your unit.' using errcode = '42501';
  end if;

  if p_unit_id is not null then
    select * into v_current from public.unit
     where id = p_unit_id and host_id = p_host_id;
    if not found then
      raise exception 'That unit is not on your account.' using errcode = '42501';
    end if;
  end if;

  if v_member and not v_staff then
    select hu.units into v_scope from public.host_user hu
     where hu.host_id = p_host_id and hu.user_id = (select auth.uid());

    if v_scope is not null then
      if p_unit_id is null then
        raise exception 'Your access covers specific units, so you cannot add one.' using errcode = '42501';
      end if;
      if not (p_unit_id = any (v_scope)) then
        raise exception 'This unit is outside your workspace access.' using errcode = '42501';
      end if;
      if v_property_id is not null and v_property_id is distinct from v_current.property_id then
        raise exception 'Your access covers specific units, so you cannot move one to another property.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.property
    where id = v_property_id and host_id = p_host_id and deleted_at is null
    for share
  ) then
    raise exception 'Choose a property on your account.' using errcode = '22023';
  end if;

  if v_name is not null and (p_unit_id is null or v_name is distinct from v_current.name) then
    perform pg_advisory_xact_lock(hashtextextended('unit-name:' || p_host_id::text || ':' || v_name, 0));
    if exists (
      select 1 from public.unit
      where host_id = p_host_id and name = v_name and archived_at is null
        and (p_unit_id is null or id <> p_unit_id)
    ) then
      raise exception 'You already have a unit called %.', v_name using errcode = '23505';
    end if;
  end if;

  v_unit := public.rpc_unit_upsert(p_host_id, p_unit, p_unit_id);
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;

  if p_unit ?| array['property_id', 'bedrooms', 'bathrooms', 'max_guests', 'nightly_rate_kes'] then
    update public.unit set
      property_id = coalesce(v_property_id, property_id),
      bedrooms = coalesce(nullif(p_unit ->> 'bedrooms', '')::integer, bedrooms),
      bathrooms = coalesce(nullif(p_unit ->> 'bathrooms', '')::numeric, bathrooms),
      max_guests = coalesce(nullif(p_unit ->> 'max_guests', '')::integer, max_guests),
      nightly_rate_kes = coalesce(nullif(p_unit ->> 'nightly_rate_kes', '')::bigint, nightly_rate_kes)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  return v_unit;
end;
$$$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_unit_upsert_guarded(uuid, jsonb, uuid) from public, anon$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_unit_upsert_guarded(uuid, jsonb, uuid) to authenticated$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111001300', 'host_workspace_writes_are_audited', array[
$rollout_undo$-- Host workspace writes leave an audit trail, as the wiring check (tests/26) requires.
--
-- Guide saves and task saves now call audit.log in the same transaction. Two
-- other new RPCs write only through functions that already log, so they are
-- recorded as exempt with that reason rather than logging twice.
-- Function bodies are otherwise unchanged from 20261111001000 and 20261111001100.

create or replace function public.rpc_host_workspace_guide_commit(
  p_unit_id uuid, p_revision integer, p_action text, p_document jsonb, p_restore_id uuid
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  guide public.host_unit_guide;
  content jsonb;
  publication uuid;
begin
  perform 1 from public.unit where id = p_unit_id and archived_at is null for share;
  if not found or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  insert into public.host_unit_guide(unit_id) values (p_unit_id) on conflict do nothing;
  select * into guide from public.host_unit_guide where unit_id = p_unit_id for update;
  if guide.revision is distinct from p_revision then
    raise exception 'The guide has changed. Reload before saving.' using errcode = '40001';
  end if;

  publication := guide.published_id;
  content := guide.document;
  case p_action
    when 'draft' then content := p_document;
    when 'publish' then null;
    when 'unpublish' then publication := null;
    when 'restore' then
      select document into content from public.host_unit_guide_version
        where id = p_restore_id and unit_id = p_unit_id;
      if not found then
        raise exception 'Choose a published version of this guide.' using errcode = '22023';
      end if;
    else raise exception 'Choose a valid guide action.' using errcode = '22023';
  end case;

  if jsonb_typeof(content) is distinct from 'object'
    or content - array['articles','planId','modelId'] <> '{}'::jsonb
    or jsonb_typeof(content -> 'articles') is distinct from 'array'
    or octet_length(content::text) > 170000 then
    raise exception 'Check the guide contents.' using errcode = '22023';
  end if;
  if jsonb_array_length(content -> 'articles') > 40 then
    raise exception 'Use up to 40 amenity instructions.' using errcode = '22023';
  end if;
  if (content ->> 'planId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'planId')::uuid and unit_id = p_unit_id and kind = 'plan'
  )) or (content ->> 'modelId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'modelId')::uuid and unit_id = p_unit_id and kind = 'model'
  )) then
    raise exception 'Choose files attached to this unit.' using errcode = '22023';
  end if;
  if p_action in ('publish','restore') then
    if jsonb_array_length(content -> 'articles') = 0 then
      raise exception 'Add amenity instructions before publishing.' using errcode = '22023';
    end if;
    insert into public.host_unit_guide_version(unit_id,document) values (p_unit_id,content) returning id into publication;
  end if;
  update public.host_unit_guide set document = content, published_id = publication, revision = guide.revision + 1
    where unit_id = p_unit_id;
  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.guide_' || p_action,
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('revision', guide.revision + 1, 'published', publication is not null));
  return guide.revision + 1;
end;
$$$rollout_undo$,
$rollout_undo$create or replace function public.rpc_host_workspace_task_save(p_id uuid, p_unit_id uuid, p_version integer, p_patch jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  task public.host_workspace_task;
  account uuid;
  zone text;
  actor uuid := (select auth.uid());
begin
  select host_id into account from public.unit where id = p_unit_id and archived_at is null for share;
  if account is null or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or
    p_patch - array['stay_id','assignee_id','title','kind','due_at','priority','status','checklist','completed_checks','evidence','comments','cadence','inspection'] <> '{}'::jsonb then
    raise exception 'Check the task details.' using errcode = '22023';
  end if;
  select * into task from public.host_workspace_task where id = p_id for update;
  if found then
    if task.unit_id <> p_unit_id then
      raise exception 'This task is outside your workspace access.' using errcode = '42501';
    end if;
    if p_version is null and task.created_by = actor then return; end if;
    if task.version is distinct from p_version then
      raise exception 'This task has changed. Reload and try again.' using errcode = '40001';
    end if;
  elsif p_version is not null then
    raise exception 'This task could not be found.' using errcode = '42501';
  end if;

  task := jsonb_populate_record(task, p_patch);
  if task.stay_id is not null and not exists (
    select 1 from public.stay where id = task.stay_id and unit_id = p_unit_id for share
  ) then
    raise exception 'Choose a reservation for this unit.' using errcode = '22023';
  end if;
  if (task.assignee_id is not null or task.status in ('In progress','Done')) and not exists (
    select 1 from public.host_user where host_id = account and user_id = task.assignee_id
      and accepted_at is not null and (units is null or p_unit_id = any(units)) for share
  ) then
    raise exception 'Choose an active team member with access to this unit.' using errcode = '22023';
  end if;
  if task.status = 'Done' and not coalesce(task.checklist,'{}') <@ coalesce(task.completed_checks,'{}') then
    raise exception 'Complete every checklist item before finishing the task.' using errcode = '22023';
  end if;
  if task.status = 'Done' and (task.inspection or task.kind in ('Cleaning','Inspection')) and coalesce(task.evidence,'') = '' then
    raise exception 'Add completion evidence before finishing this task.' using errcode = '22023';
  end if;

  insert into public.host_workspace_task as previous (
    id, unit_id, created_by, stay_id, assignee_id, title, kind, due_at, priority, status, checklist,
    completed_checks, evidence, comments, cadence, inspection
  ) values (
    p_id, p_unit_id, actor, task.stay_id, task.assignee_id, task.title, task.kind, task.due_at,
    coalesce(task.priority,'Normal'), coalesce(task.status,'To do'), coalesce(task.checklist,'{}'),
    coalesce(task.completed_checks,'{}'), coalesce(task.evidence,''), coalesce(task.comments,''),
    coalesce(task.cadence,'None'), coalesce(task.inspection,false)
  ) on conflict (id) do update set
    stay_id = excluded.stay_id, assignee_id = excluded.assignee_id, title = excluded.title, kind = excluded.kind,
    due_at = excluded.due_at, priority = excluded.priority, status = excluded.status,
    checklist = excluded.checklist, completed_checks = excluded.completed_checks, evidence = excluded.evidence,
    comments = excluded.comments, cadence = excluded.cadence, inspection = excluded.inspection,
    version = previous.version + 1, updated_at = now()
  where previous.version = p_version;
  if not found and not (p_version is null and exists (
    select 1 from public.host_workspace_task where id = p_id and unit_id = p_unit_id and created_by = actor
  )) then
    raise exception 'This task has changed. Reload and try again.' using errcode = '40001';
  end if;
  if task.status = 'Done' and task.cadence in ('Weekly','Monthly') then
    select time_zone into zone from public.host where id = account;
    if zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
      zone := 'Africa/Nairobi';
    end if;
    insert into public.host_workspace_task (
      id, unit_id, repeat_of, assignee_id, created_by, title, kind, due_at, priority, checklist, cadence, inspection
    ) values (
      gen_random_uuid(), p_unit_id, p_id, task.assignee_id, actor, task.title, task.kind,
      (task.due_at at time zone zone + case task.cadence when 'Weekly' then interval '1 week' else interval '1 month' end) at time zone zone,
      coalesce(task.priority,'Normal'), coalesce(task.checklist,'{}'), task.cadence, coalesce(task.inspection,false)
    ) on conflict (repeat_of) do nothing;
  end if;
  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.task_saved',
    p_actor_id => actor, p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('task_id', p_id, 'status', coalesce(task.status, 'To do')));
end;
$$$rollout_undo$,
$rollout_undo$insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_host_workspace_photos_set',
   'A concurrency and path check in front of rpc_property_photos_set / rpc_unit_photos_set, which write and log',
   'audit entries written by rpc_property_photos_set and rpc_unit_photos_set'),
  ('rpc_host_workspace_guide_asset_put',
   'Stores the file, then saves the draft through rpc_host_workspace_guide_commit in the same transaction',
   'audit entry host.guide_draft, written by rpc_host_workspace_guide_commit')
on conflict (function_name) do nothing$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111001400', 'gross_includes_vat', array[
$rollout_undo$-- Gross on the finance screens is what guests paid, VAT included.
--
-- Since 20260101022300 the ledger splits VAT out of commission and fees into
-- tax.vat_output. Gross was still built as merchant share + NexG revenue, so
-- after the split it quietly dropped the VAT and stopped matching money in
-- (tests/23 caught the gap, which was exactly the month's VAT).
--
-- Revenue and net stay VAT-free: VAT is owed to KRA, not earned. The
-- finance-projections cron job rebuilds fin_kpi_daily every two minutes, so
-- the stored rows pick this up without a manual rebuild.
-- Body otherwise unchanged from 20260101015900.

create or replace function fn_fin_kpi_for(p_day date, p_city_id uuid)
returns table (
  orders integer,
  gross_cents bigint,
  revenue_cents bigint,
  merchant_cost_cents bigint,
  rider_cost_cents bigint,
  leakage_cents bigint,
  refund_cents bigint,
  net_cents bigint,
  cash_collected_cents bigint,
  as_of_entry_id bigint,
  source_hash text
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select e.id, e.debit, e.credit, a.base, t.kind, t.order_id
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
      join ledger.transaction t on t.id = e.transaction_id
     where e.effective_at >= (p_day::timestamp at time zone 'Africa/Nairobi')
       and e.effective_at <  ((p_day + 1)::timestamp at time zone 'Africa/Nairobi')
       and t.city_id is not distinct from p_city_id
  ),
  sums as (
    select
      count(distinct case when kind = 'order_sale_recognised' then order_id end)::integer as n_orders,
      coalesce(sum(case when base like 'revenue.%' then credit - debit else 0 end), 0)::bigint as revenue,
      coalesce(sum(case when base = 'tax.vat_output' then credit - debit else 0 end), 0)::bigint as vat,
      coalesce(sum(case when base = 'payable.merchant' then credit - debit else 0 end), 0)::bigint as merchant_cost,
      coalesce(sum(case when base in ('expense.rider_pay', 'expense.rider_bonus')
                        then debit - credit else 0 end), 0)::bigint as rider_cost,
      coalesce(sum(case when base in ('expense.compensation_merchant', 'expense.compensation_rider',
                                      'expense.goodwill', 'expense.provider_fees',
                                      'expense.chargeback_loss', 'expense.write_off')
                        then debit - credit else 0 end), 0)::bigint as leakage,
      coalesce(sum(case when base = 'refunds_pending' then credit - debit else 0 end), 0)::bigint as refunds,
      coalesce(sum(case when base in ('cash.mpesa_paybill', 'cash.bank', 'cash.rider_on_hand',
                                      'cash.card_processor_receivable')
                        then debit - credit else 0 end), 0)::bigint as cash_in,
      coalesce(max(id), 0)::bigint as max_entry,
      count(*)::bigint as n_entries,
      coalesce(sum(debit), 0)::bigint as total_debit,
      coalesce(sum(credit), 0)::bigint as total_credit
    from scope
  )
  select
    n_orders,
    (merchant_cost + revenue + vat)::bigint,
    revenue,
    merchant_cost,
    rider_cost,
    leakage,
    refunds,
    (revenue - rider_cost - leakage)::bigint,
    cash_in,
    max_entry,
    encode(extensions.digest(
      p_day::text || '|' || coalesce(p_city_id::text, '-') || '|' ||
      n_entries || '|' || max_entry || '|' || total_debit || '|' || total_credit,
      'sha256'), 'hex')
  from sums;
$$$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111001500', 'api_console_module', array[
$rollout_undo$-- Give the 'api' audit module a home in the console registry.
--
-- API key issue/revoke and API-placed service orders log under module 'api'
-- (20260101022900, 20260101023000, 20261102000200), but console_module had no
-- such key, so the audit console could not label or group those events
-- (tests/16 caught it).
--
-- No href: there is no API page yet, and no role_module_access rows, so this
-- does not add a sidebar entry for anyone. It only names the module.
insert into public.console_module (key, label, section, href, sort, icon)
values ('api', 'API & integrations', 'Control', null, 125, null)
on conflict (key) do nothing$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111001600', 'business_types_for_activities', array[
$rollout_undo$-- Activities, games & sports gets the "What kind of ... business" question.
--
-- 20261106000000 added a multi-select business_types question (one option per
-- specialty, onboarding step 2) to every category that existed then.
-- activities_games_sports arrived later (20261111000100) with 13 specialties
-- but no such question, so its merchants could not pick their specialties
-- (tests/40 caught it). This reruns the same idempotent update; categories
-- that already have the question are untouched.

update public.category_config as category
set questions = category.questions || jsonb_build_array(
  jsonb_build_object(
    'key', 'business_types',
    'label', format('What kind of %s business do you run?', category.label),
    'type', 'multi',
    'step', 2,
    'hint', 'Select all that apply.',
    'options',
      (
        select jsonb_agg(
          jsonb_build_object(
            'value', specialty.value ->> 'id',
            'label', specialty.value ->> 'name'
          )
          order by specialty.ordinality
        )
        from jsonb_array_elements(category.subcategories) with ordinality as specialty(value, ordinality)
      )
  )
)
where jsonb_array_length(category.subcategories) > 0
  and not exists (
    select 1
    from jsonb_array_elements(category.questions) question(value)
    where question.value ->> 'key' = 'business_types'
  )$rollout_undo$
]::text[]) on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name, statements) values ('20261111001700', 'payment_callbacks_and_audit_wiring', array[
$rollout_undo$-- Payment callbacks only from the server, and the remaining wiring-check gaps.
--
-- 1. Payment bypass. rpc_payment_webhook (Paystack) and rpc_payment_mpesa_callback
--    trust a p_signature_ok / p_secret_ok flag supplied by the caller, and both
--    were executable by anon. Anyone holding the public anon key could call them
--    directly with the flag set and mark a payment (and its order) paid. The web
--    routes that verify the provider now call them with the service role
--    (apps/web/lib/supabase/service.ts), so the grants are narrowed to that.
-- 2. fn_tax_issue_order_compliant was executable by anon. Its sibling
--    fn_tax_issue_order is service_role only; this one now matches.
-- 3. State-changing RPCs without an audit entry (tests/26): bookings, web order
--    placement and KRA status now log. Drafts, heartbeats and functions that
--    only write through an audited callee are recorded as exempt with a reason.
-- 4. Actions these and the host workspace log are registered, so they are not
--    raised as audit.unknown_action.
-- Function bodies are copied from their current definitions; only the audit
-- calls (and one variable to hold the previous booking status) are added.

-- ═══════════════════════════ 1–2. grants

revoke execute on function public.rpc_payment_webhook(text,text,text,boolean,jsonb,boolean,text,bigint,text)
  from public, anon, authenticated$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_payment_webhook(text,text,text,boolean,jsonb,boolean,text,bigint,text)
  to service_role$rollout_undo$,
$rollout_undo$revoke execute on function public.rpc_payment_mpesa_callback(text,integer,text,boolean,jsonb,numeric,text,text)
  from public, anon, authenticated$rollout_undo$,
$rollout_undo$grant execute on function public.rpc_payment_mpesa_callback(text,integer,text,boolean,jsonb,numeric,text,text)
  to service_role$rollout_undo$,
$rollout_undo$delete from public.wiring_anon_allow where function_name = 'rpc_payment_webhook'$rollout_undo$,
$rollout_undo$revoke execute on function public.fn_tax_issue_order_compliant(uuid) from public, anon, authenticated$rollout_undo$,
$rollout_undo$grant execute on function public.fn_tax_issue_order_compliant(uuid) to service_role$rollout_undo$,
$rollout_undo$-- ═══════════════════════════ 3. audited writes

CREATE OR REPLACE FUNCTION public.rpc_booking_create(p_resource_id uuid, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_slot_id uuid DEFAULT NULL::uuid, p_quantity integer DEFAULT 1, p_guest_name text DEFAULT NULL::text, p_guest_phone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS booking
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.bookable_resource;
  s public.booking_slot;
  m public.merchant;
  v_start timestamptz := p_starts_at;
  v_end timestamptz := p_ends_at;
  v_by_merchant boolean;
  v_total bigint;
  v_status public.reservation_status;
  v_qty int := greatest(coalesce(p_quantity, 1), 1);
  b public.booking;
begin
  if auth.uid() is null then
    raise exception 'Sign in to book' using errcode = '28000';
  end if;
  select * into r from public.bookable_resource where id = p_resource_id;
  if not found then
    raise exception 'Unknown resource' using errcode = 'P0002';
  end if;
  select * into m from public.merchant where id = r.merchant_id;
  v_by_merchant := authz.is_merchant_member(r.merchant_id);

  if not r.active then
    raise exception 'This is not bookable right now' using errcode = '22023';
  end if;
  if not v_by_merchant and (m.status <> 'live' or m.deleted_at is not null) then
    raise exception 'This business is not taking bookings yet' using errcode = '22023';
  end if;

  if r.model = 'capacity' then
    select * into s from public.booking_slot where id = p_slot_id;
    if not found or s.resource_id <> r.id then
      raise exception 'Pick a session' using errcode = '22023';
    end if;
    if s.status <> 'open' then
      raise exception 'This session is closed' using errcode = '22023';
    end if;
    v_start := s.starts_at;
    v_end := s.ends_at;
    if not v_by_merchant and now() > s.starts_at - make_interval(mins => s.cutoff_minutes) then
      raise exception 'Booking for this session has closed' using errcode = '22023';
    end if;
  else
    if v_start is null then
      raise exception 'Pick a start time' using errcode = '22023';
    end if;
    if v_end is null then
      if r.duration_minutes is null then
        raise exception 'Pick an end time' using errcode = '22023';
      end if;
      v_end := v_start + make_interval(mins => r.duration_minutes);
    end if;
    v_qty := 1;
  end if;

  if v_end <= v_start then
    raise exception 'End must be after start' using errcode = '22023';
  end if;
  if not v_by_merchant then
    if v_start < now() + make_interval(mins => r.min_notice_minutes) then
      raise exception 'This needs more notice than that' using errcode = '22023';
    end if;
    if v_start > now() + make_interval(days => r.max_advance_days) then
      raise exception 'That is too far ahead to book' using errcode = '22023';
    end if;
  end if;

  if r.quote_required or r.price_cents is null then
    v_total := null;
  else
    v_total := case r.price_unit
      when 'seat' then r.price_cents * v_qty
      when 'hour' then ceil(extract(epoch from (v_end - v_start)) / 3600.0)::bigint * r.price_cents
      when 'day' then ceil(extract(epoch from (v_end - v_start)) / 86400.0)::bigint * r.price_cents
      else r.price_cents
    end;
  end if;

  v_status := case
    when v_by_merchant then 'confirmed'
    when r.instant_confirm and not r.quote_required then 'confirmed'
    else 'pending'
  end;

  insert into public.booking (
    resource_id, slot_id, starts_at, ends_at, quantity, status, guest_user_id,
    guest_name, guest_phone, notes, total_cents, source, merchant_id, held_during
  ) values (
    r.id, case when r.model = 'capacity' then s.id end, v_start, v_end, v_qty, v_status,
    case when v_by_merchant then null else auth.uid() end,
    p_guest_name, p_guest_phone, p_notes, v_total,
    case when v_by_merchant then 'merchant' else 'app' end,
    r.merchant_id, tstzrange(v_start, v_end)
  ) returning * into b;
  perform audit.log(case when v_by_merchant then 'merchant_user' else 'guest' end::public.actor_type,
    'merchants', 'booking.created', p_actor_id => auth.uid(),
    p_target_type => 'booking', p_target_id => b.id,
    p_after => jsonb_build_object('status', b.status, 'source', b.source, 'merchant_id', b.merchant_id));
  return b;
exception
  when exclusion_violation then
    raise exception 'That time is already taken' using errcode = '23P01';
end;
$function$$rollout_undo$,
$rollout_undo$CREATE OR REPLACE FUNCTION public.rpc_booking_block(p_resource_id uuid, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS booking
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.bookable_resource;
  b public.booking;
begin
  select * into r from public.bookable_resource where id = p_resource_id;
  if not found or not authz.is_merchant_member(r.merchant_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if r.model <> 'exclusive' then
    raise exception 'Close the session instead of blocking it' using errcode = '22023';
  end if;
  if p_ends_at <= p_starts_at then
    raise exception 'End must be after start' using errcode = '22023';
  end if;
  insert into public.booking (resource_id, starts_at, ends_at, status, notes, source, merchant_id, held_during)
  values (r.id, p_starts_at, p_ends_at, 'blocked', p_notes, 'merchant', r.merchant_id,
          tstzrange(p_starts_at, p_ends_at))
  returning * into b;
  perform audit.log('merchant_user'::public.actor_type, 'merchants', 'booking.blocked',
    p_actor_id => auth.uid(), p_target_type => 'booking', p_target_id => b.id,
    p_after => jsonb_build_object('starts_at', b.starts_at, 'ends_at', b.ends_at));
  return b;
exception
  when exclusion_violation then
    raise exception 'That time already has a booking' using errcode = '23P01';
end;
$function$$rollout_undo$,
$rollout_undo$CREATE OR REPLACE FUNCTION public.rpc_booking_set_status(p_booking_id uuid, p_status reservation_status)
 RETURNS booking
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  b public.booking;
  r public.bookable_resource;
  v_member boolean;
  v_guest boolean;
  v_before public.reservation_status;
begin
  select * into b from public.booking where id = p_booking_id for update;
  if not found then
    raise exception 'Unknown booking' using errcode = 'P0002';
  end if;
  select * into r from public.bookable_resource where id = b.resource_id;
  v_member := authz.is_merchant_member(b.merchant_id);
  v_guest := b.guest_user_id is not null and b.guest_user_id = auth.uid();
  if not v_member and not v_guest then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  if not (
    (b.status = 'pending' and p_status in ('confirmed', 'cancelled')) or
    (b.status = 'confirmed' and p_status in ('cancelled', 'completed', 'no_show')) or
    (b.status = 'blocked' and p_status = 'cancelled')
  ) then
    raise exception 'A % booking cannot become %', b.status, p_status using errcode = '22023';
  end if;

  if not v_member then
    if p_status <> 'cancelled' then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
    if now() > b.starts_at - make_interval(mins => r.cancel_cutoff_minutes) then
      raise exception 'It is too late to cancel this online' using errcode = '22023';
    end if;
  end if;

  v_before := b.status;
  update public.booking set status = p_status where id = b.id returning * into b;
  perform audit.log(case when v_member then 'merchant_user' else 'guest' end::public.actor_type,
    'merchants', 'booking.status_changed', p_actor_id => auth.uid(),
    p_target_type => 'booking', p_target_id => b.id,
    p_before => jsonb_build_object('status', v_before), p_after => jsonb_build_object('status', b.status));
  return b;
exception
  when exclusion_violation then
    raise exception 'That time is already taken' using errcode = '23P01';
end;
$function$$rollout_undo$,
$rollout_undo$CREATE OR REPLACE FUNCTION public.rpc_tax_set_kra_status(p_invoice_id uuid, p_status text, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not authz.has_full_finance() then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'submitted', 'accepted', 'rejected', 'not_required') then
    raise exception 'Unknown KRA status.';
  end if;
  update public.tax_invoice
     set kra_status = p_status,
         kra_reference = coalesce(nullif(trim(p_reference), ''), kra_reference),
         kra_submitted_at = case when p_status in ('submitted', 'accepted') then coalesce(kra_submitted_at, now())
                                 else kra_submitted_at end,
         kra_response = coalesce(kra_response, '{}'::jsonb)
           || jsonb_build_object('note', p_note, 'set_at', now(), 'set_by', (select auth.uid()))
   where id = p_invoice_id;
  if not found then raise exception 'No such document.'; end if;
  perform audit.log('staff'::public.actor_type, 'finance', 'tax.kra_status_set',
    p_actor_id => auth.uid(), p_target_type => 'tax_invoice', p_target_id => p_invoice_id,
    p_after => jsonb_build_object('kra_status', p_status, 'reference', nullif(trim(p_reference), '')));
end;
$function$$rollout_undo$,
$rollout_undo$CREATE OR REPLACE FUNCTION public.rpc_order_place_web(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_phone text := nullif(regexp_replace(coalesce(p_payload ->> 'guest_phone', ''), '[^0-9+]', '', 'g'), '');
  v_name text := nullif(trim(p_payload ->> 'guest_name'), '');
  v_label text := nullif(trim(p_payload ->> 'dropoff_label'), '');
  q jsonb;
  v_guest public.guest;
  v_point extensions.geography;
  v_order uuid;
  v_ref text;
  v_needs text[] := '{}';
begin
  if v_uid is null then
    raise exception 'Sign in to place your order.' using errcode = '42501';
  end if;
  if v_phone is null or v_phone !~ '^\+?[0-9]{9,15}$' then
    raise exception 'A phone number the rider can reach you on.';
  end if;
  if v_label is null then
    raise exception 'Where should we bring it? Set your delivery address first.';
  end if;
  if nullif(p_payload ->> 'lat', '') is null or nullif(p_payload ->> 'lng', '') is null then
    raise exception 'Set your delivery address on the map first.';
  end if;

  q := public.fn_web_order_quote(p_payload);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'message';
  end if;

  v_point := extensions.st_setsrid(extensions.st_makepoint(
    (p_payload ->> 'lng')::float, (p_payload ->> 'lat')::float), 4326)::extensions.geography;

  /* One guest per account. A number already held by somebody else's
     account is not ours to hand over. */
  select * into v_guest from public.guest where user_id = v_uid;
  if not found then
    select * into v_guest from public.guest where phone = v_phone;
    if found and v_guest.user_id is not null and v_guest.user_id <> v_uid then
      raise exception 'That number is already linked to another account.';
    end if;
    if found then
      update public.guest set user_id = v_uid, name = coalesce(name, v_name)
       where id = v_guest.id returning * into v_guest;
    else
      insert into public.guest (user_id, phone, name)
      values (v_uid, v_phone, v_name) returning * into v_guest;
    end if;
  else
    update public.guest
       set phone = coalesce(phone, v_phone), name = coalesce(name, v_name)
     where id = v_guest.id returning * into v_guest;
  end if;

  if v_guest.blocked then
    raise exception 'This account cannot place orders. Contact support.';
  end if;

  if (q ->> 'has_age_restricted')::boolean then
    v_needs := v_needs || 'alcohol'::text;
  end if;

  v_ref := public.fn_order_reference();

  insert into public.order (
    reference, guest_id, merchant_id, branch_id, city_id, zone_id, channel,
    dropoff_label, dropoff_point, dropoff_note, delivery_context,
    stage, payment_method, payment_status,
    subtotal_cents, delivery_fee_cents, service_fee_cents,
    small_basket_fee_cents, cash_handling_cents, total_cents,
    commission_cents, commission_pct, currency, pricing_version_ids,
    carry_requirements)
  values (
    v_ref, v_guest.id, (q ->> 'merchant_id')::uuid, nullif(q ->> 'branch_id', '')::uuid,
    (q ->> 'city_id')::uuid, nullif(q ->> 'zone_id', '')::uuid, 'web',
    v_label, v_point, nullif(trim(p_payload ->> 'dropoff_note'), ''), '{}'::jsonb,
    'placed', (q ->> 'payment_method')::public.order_payment_method, 'pending',
    (q ->> 'subtotal_cents')::bigint, (q ->> 'delivery_fee_cents')::bigint,
    (q ->> 'service_fee_cents')::bigint, (q ->> 'small_basket_fee_cents')::bigint,
    (q ->> 'cash_handling_cents')::bigint, (q ->> 'total_cents')::bigint,
    (q ->> 'commission_cents')::bigint, (q ->> 'commission_pct')::numeric,
    'KES', q -> 'pricing_version_ids', v_needs)
  returning id into v_order;

  insert into public.order_item (
    order_id, catalogue_item_id, name, quantity, unit_price_cents, line_total_cents, note)
  select v_order, (l ->> 'catalogue_item_id')::uuid, l ->> 'name',
         (l ->> 'quantity')::integer, (l ->> 'unit_price_cents')::bigint,
         (l ->> 'line_total_cents')::bigint, nullif(l ->> 'note', '')
    from jsonb_array_elements(q -> 'lines') l;

  insert into public.order_event (order_id, kind, title, detail, actor_type, actor_id, payload)
  values (v_order, 'placed', 'Placed on the website',
          replace(q ->> 'payment_method', '_', ' '),
          'guest', v_guest.id, jsonb_build_object('channel', 'web'));

  perform audit.log('guest'::public.actor_type, 'orders', 'order.placed_web',
    p_actor_id => v_uid, p_target_type => 'order', p_target_id => v_order, p_target_label => v_ref,
    p_after => jsonb_build_object('total_cents', (q ->> 'total_cents')::bigint,
                                  'payment_method', q ->> 'payment_method'));

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order,
    'reference', v_ref,
    'total_cents', (q ->> 'total_cents')::bigint,
    'payment_method', q ->> 'payment_method',
    'pay_online', (q ->> 'payment_method') in ('card', 'mpesa_stk'));
end;
$function$$rollout_undo$,
$rollout_undo$-- ═══════════════════════════ 3. exemptions, each with the reason

insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_payment_mpesa_callback',
   'Settles through rpc_payment_webhook, which writes the audit entry; it then only copies the receipt number and phone onto the payment',
   'audit entries written by rpc_payment_webhook'),
  ('rpc_payment_mpesa_sent',
   'Records that an STK push was sent; the provider event goes into payment_event, the payment''s own append-only log',
   'payment_event'),
  ('rpc_merchant_session_activity',
   'A session heartbeat. One audit row per ping would bury the log; the activity row itself is the record',
   'merchant_application_session_activity'),
  ('rpc_my_staff_avatar_set',
   'A staff member changing their own profile picture; no business or access effect',
   'staff_user.avatar_path'),
  ('rpc_merchant_setup_adopt_offering',
   'Edits to a merchant''s own setup draft; submission and approval are audited',
   'merchant setup draft tables'),
  ('rpc_merchant_setup_offering_save',
   'Edits to a merchant''s own setup draft; submission and approval are audited',
   'merchant setup draft tables'),
  ('rpc_merchant_setup_location_save',
   'Edits to a merchant''s own setup draft locations; submission and approval are audited',
   'merchant_branch (setup source)')
on conflict (function_name) do nothing$rollout_undo$,
$rollout_undo$-- ═══════════════════════════ 4. registry

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('booking.created', 'merchants', 'info', false, false, false, '{}', 'A booking was made'),
  ('booking.blocked', 'merchants', 'info', false, false, false, '{}', 'A merchant blocked time on a resource'),
  ('booking.status_changed', 'merchants', 'info', false, false, false, '{}', 'A booking was confirmed, cancelled, completed or marked no-show'),
  ('order.placed_web', 'orders', 'info', false, false, true, '{}', 'A guest placed an order on the website'),
  ('tax.kra_status_set', 'finance', 'notice', false, false, true, '{}', 'Finance set the KRA status of a tax document'),
  ('host.guide_draft', 'hotels', 'info', false, false, false, '{}', 'A host saved a guest guide draft'),
  ('host.guide_publish', 'hotels', 'info', false, false, false, '{}', 'A host published a guest guide'),
  ('host.guide_unpublish', 'hotels', 'info', false, false, false, '{}', 'A host unpublished a guest guide'),
  ('host.guide_restore', 'hotels', 'info', false, false, false, '{}', 'A host restored an earlier guest guide'),
  ('host.task_saved', 'hotels', 'info', false, false, false, '{}', 'A host workspace task was saved'),
  ('host.manual_finance_recorded', 'hotels', 'notice', false, false, true, '{}', 'A host recorded money manually'),
  ('host.workspace_profile_changed', 'hotels', 'info', false, false, false, '{}', 'A host changed workspace profile settings'),
  ('host.settings_changed', 'hotels', 'info', false, false, false, '{}', 'A host changed account settings'),
  ('package.scheduled', 'hotels', 'info', false, false, true, '{}', 'A host scheduled a welcome package'),
  ('package.cancelled', 'hotels', 'info', false, false, false, '{}', 'A host cancelled a scheduled welcome package'),
  ('package.archived', 'hotels', 'info', false, false, false, '{}', 'A host retired a welcome package')
on conflict (action) do nothing$rollout_undo$
]::text[]) on conflict (version) do nothing;
-- Must return 18 rows whose md5 equals the archive's sql_md5.
select version, name, md5(array_to_string(statements, E'
')) = case version
  when '20261111000000' then '6da919dc4dc8034e8b0c1e594dbf8ba5'
  when '20261111000100' then '5c38f941a77d16b541bbe9947586a256'
  when '20261111000200' then '5ac94ecd7aac32e5bf5e82359ad0fe5f'
  when '20261111000300' then 'f8c990b024a783a45a1f954a8d3a35a2'
  when '20261111000400' then '2f7f36afbf71c10c2ceb7d931d0bdc9a'
  when '20261111000500' then 'd18e92f6594a88ce443c8e2bcf7e8534'
  when '20261111000600' then '7ed1c552c1abfde537140471e73ea563'
  when '20261111000700' then '220eda72c4805da1ed639bc5e7424a3f'
  when '20261111000800' then 'b49b4ca48ca53f830dee2e56ff50a11a'
  when '20261111000900' then 'b5aa051699d128620be65b19b1efd46a'
  when '20261111001000' then '3da82988d94c8a60835ddc5e62745d49'
  when '20261111001100' then '73cf5a281002df5048993a52749e7e75'
  when '20261111001200' then '677fef44204e98f052d4d0c9a1409b0e'
  when '20261111001300' then '29ce2320ceca0f950dafc2869e9b6e68'
  when '20261111001400' then 'c645acc3a5df518c787f798ad873a9b4'
  when '20261111001500' then 'c6761c796e6cee3f1201304ec2f62b0c'
  when '20261111001600' then 'd8b8aebaa75fdeaeedcc2f7c782b172c'
  when '20261111001700' then '92580e4c511709d666008016f1f04747'
end as same_as_before
from supabase_migrations.schema_migrations where version like '20261111%' order by version;
commit;
