-- Settings: every number in the platform, versioned and dated.
--
-- There is already a `public.setting` table. It holds one row per
-- key with a unique constraint and is updated in place — which means
-- there is no answer to "what was the Food commission on 12
-- September?", and no way to schedule a change for next Monday. For
-- a table that decides what merchants are charged, both of those are
-- the whole job.
--
-- So the storage becomes append-only, and `public.setting` becomes a
-- VIEW over whichever version is active. Twelve call sites across
-- nine migrations read that table by name; rewriting them all to
-- prove a point would be churn, and leaving two tables holding the
-- same numbers would be the divergence this codebase keeps having to
-- undo. One table, one view, nothing to reconcile later.
--
-- The scope is three nullable columns rather than one polymorphic
-- id. A single `scope_id text` holding either a uuid or a
-- "city:category" pair reads tidily and loses every foreign key —
-- and a settings row pointing at a deleted city is a fee nobody can
-- explain.

create schema if not exists settings;

comment on schema settings is
  'Versioned platform configuration. Nothing here is edited in place: a change is a new version with an effective time, an author, an approver and a reason, and the old one stays readable forever.';

-- ══════════════════════════════════════════════ the registry

create type settings.value_type as enum (
  'int', 'money', 'pct', 'bool', 'text', 'enum', 'json', 'time', 'duration', 'geojson');

create type settings.scope_kind as enum ('global', 'city', 'zone', 'category', 'city_category');

create type settings.version_status as enum (
  'draft', 'awaiting_approval', 'scheduled', 'active', 'superseded', 'rejected', 'rolled_back');

create type settings.change_status as enum (
  'draft', 'awaiting_approval', 'approved', 'scheduled', 'applied', 'rejected', 'cancelled');

/*
 * Every setting the platform has, declared. A key that is not in
 * here cannot be written — which is what stops the registry drifting
 * from reality the way the audit action list had, and what lets the
 * console render a field it has never seen before.
 */
create table settings.definition (
  key text primary key,
  "group" text not null check ("group" in (
    'cities', 'fees', 'dispatch', 'settlement', 'payments', 'payouts',
    'integrations', 'notifications', 'branding', 'legal', 'retention')),
  scope_kind settings.scope_kind not null,
  value_type settings.value_type not null,
  constraints jsonb not null default '{}'::jsonb,
  unit text,
  label text not null,
  help text,
  /* Money or exposure. Drives the approval pair and the severity of
     the audit event. */
  sensitive boolean not null default false,
  /*
   * Whether a change may skip the next-midnight rule. False for
   * anything a merchant or rider has already quoted a price
   * against — a fee that changes mid-afternoon means two guests
   * paid different amounts for the same thing on the same day.
   */
  can_be_immediate boolean not null default false,
  approval_pair text not null default 'single:ops_manager',
  /* Which services must refresh when this changes. */
  reader_modules text[] not null default '{}',
  default_value jsonb,
  sort integer not null default 100,
  deprecated_at timestamptz
);

comment on column settings.definition.can_be_immediate is
  'False for anything already quoted against. A fee that changes at 3pm means two guests paid different amounts for the same thing on the same day.';

-- ═══════════════════════════════════════════════ the versions

create table settings.version (
  id uuid primary key default gen_random_uuid(),
  key text not null references settings.definition (key) on delete restrict,
  scope_kind settings.scope_kind not null,

  /* Three columns, not one polymorphic id: a settings row pointing
     at a deleted city is a fee nobody can explain. */
  scope_city_id uuid references public.city (id) on delete cascade,
  scope_zone_id uuid references public.zone (id) on delete cascade,
  scope_category text,

  value jsonb,
  status settings.version_status not null default 'draft',
  effective_from timestamptz not null default now(),
  immediate boolean not null default false,
  reason text,
  change_set_id uuid,

  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  approved_by uuid references public.staff_user (id) on delete set null,
  approved_at timestamptz,
  activated_at timestamptz,
  superseded_at timestamptz,
  superseded_by uuid references settings.version (id) on delete set null,
  rolled_back_from uuid references settings.version (id) on delete set null,

  constraint version_scope_matches_kind check (
    case scope_kind
      when 'global' then scope_city_id is null and scope_zone_id is null and scope_category is null
      when 'city' then scope_city_id is not null and scope_zone_id is null and scope_category is null
      when 'zone' then scope_zone_id is not null
      when 'category' then scope_category is not null and scope_city_id is null
      when 'city_category' then scope_city_id is not null and scope_category is not null
    end),

  constraint version_approval_is_two_people check (
    approved_by is null or created_by is null or approved_by <> created_by)
);

/*
 * The resolution index. Every read of every fee in the platform
 * comes through this, so it is the one index in the schema whose
 * column order is not negotiable.
 */
create index version_resolve_idx on settings.version
  (key, scope_kind,
   coalesce(scope_city_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(scope_zone_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(scope_category, ''),
   effective_from desc);

create index version_change_set_idx on settings.version (change_set_id);
create index version_due_idx on settings.version (effective_from)
  where status = 'scheduled';

/* Exactly one active version per key and scope. Two actives means
   two answers to what something costs. */
create unique index version_one_active on settings.version
  (key, scope_kind,
   coalesce(scope_city_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(scope_zone_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(scope_category, ''))
  where status = 'active';

comment on table settings.version is
  'Append-only. A change is a new row; nothing is ever edited and nothing is ever deleted, so "what was the fee on the 12th" is always answerable and a rollback is a new version rather than an erasure.';

-- ════════════════════════════════════ one Save, one decision

/*
 * What a single press of "Save · request approval" produces.
 *
 * Approved or rejected as a whole, deliberately: six fee changes
 * reviewed together is one decision somebody can reason about, and
 * six approved one at a time is a state nobody intended to ship.
 */
create table settings.change_set (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  "group" text not null,
  city_id uuid references public.city (id) on delete cascade,
  status settings.change_status not null default 'draft',
  effective_from timestamptz,
  immediate boolean not null default false,
  reason text,
  requested_by uuid references public.staff_user (id) on delete set null,
  requested_at timestamptz,
  approval_request_id uuid,
  approved_by uuid references public.staff_user (id) on delete set null,
  approved_at timestamptz,
  rejected_reason text,
  applied_at timestamptz,
  cancelled_at timestamptz,
  /* key → {from, to, scope_label} */
  diff jsonb not null default '{}'::jsonb,
  /* What this will touch, computed at submit so the approver reads
     the same numbers the requester saw. */
  impact jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint change_set_rejection_has_a_reason check (
    status <> 'rejected' or coalesce(trim(rejected_reason), '') <> ''),
  constraint change_set_immediate_has_a_reason check (
    not immediate or coalesce(trim(reason), '') <> ''),
  constraint change_set_approval_is_two_people check (
    approved_by is null or requested_by is null or approved_by <> requested_by)
);

create index change_set_open_idx on settings.change_set (status, requested_at desc)
  where status in ('draft', 'awaiting_approval', 'approved', 'scheduled');

alter table settings.version
  add constraint version_change_set_fk
  foreign key (change_set_id) references settings.change_set (id) on delete set null;

comment on table settings.change_set is
  'One press of Save. Approved or rejected whole: six fee changes reviewed together is one decision somebody can reason about; six approved separately is a state nobody intended to ship.';

-- ══════════════════════════════════════ who has to agree

create table settings.approval_policy (
  id uuid primary key default gen_random_uuid(),
  /* Either a whole group or one key; the key wins. */
  "group" text,
  key text references settings.definition (key) on delete cascade,
  pair text not null,
  /* e.g. {"commission_delta_pts": 1, "escalate_to": "super_admin"} —
     a small change needs Finance and Ops; a big one needs a founder. */
  threshold jsonb not null default '{}'::jsonb,
  notify_roles text[] not null default '{}',
  constraint approval_policy_targets_one check (num_nonnulls("group", key) = 1)
);

create unique index approval_policy_group_idx on settings.approval_policy ("group")
  where "group" is not null;
create unique index approval_policy_key_idx on settings.approval_policy (key)
  where key is not null;

-- ═══════════════════════════════ templates and snapshots

create table settings.city_template (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  source_city_id uuid references public.city (id) on delete set null,
  /* Every city-scoped key at capture time. A template is a
     photograph, not a link: changing Nairobi later must not silently
     change what the next city launches with. */
  snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table settings.city_template is
  'A photograph, not a link. Changing Nairobi afterwards must not silently change what the next city launches with.';

create table settings.snapshot_daily (
  city_id uuid not null references public.city (id) on delete cascade,
  day date not null,
  resolved jsonb not null,
  written_at timestamptz not null default now(),
  primary key (city_id, day)
);

comment on table settings.snapshot_daily is
  'The fully resolved document per city per day. What an order priced on the 12th was priced against, kept so a statement can be explained a year later without replaying the version chain.';

-- ════════════════════════ the old table becomes a view

/*
 * Twelve call sites read `public.setting` by name. They keep
 * working: the rows move into `settings.version` as active versions,
 * and the table is replaced by a view with the same columns.
 *
 * Deliberately read-only. An INSTEAD OF trigger would make the old
 * INSERTs keep working, and every one of them would be an unversioned
 * write — which is the exact thing this migration exists to stop.
 * A write now goes through the RPCs, and anything still trying the
 * old way fails loudly at the point of the attempt.
 */
do $$
declare r record;
begin
  /* Definitions first: every existing key needs one, since
     `version.key` references it. */
  insert into settings.definition (key, "group", scope_kind, value_type, label, help, sensitive, sort)
  select distinct
    s.key,
    case
      when s.key like 'commission%' or s.key like '%fee%' or s.key like '%_pct%' then 'fees'
      when s.key like '%provider%' or s.key like 'sms%' or s.key like 'whatsapp%' then 'integrations'
      when s.key like 'experience%' then 'fees'
      else 'cities'
    end,
    case when s.scope = 'city' then 'city' else 'global' end::settings.scope_kind,
    case
      when jsonb_typeof(s.value) = 'number' then 'int'
      when jsonb_typeof(s.value) = 'boolean' then 'bool'
      when jsonb_typeof(s.value) = 'object' or jsonb_typeof(s.value) = 'array' then 'json'
      else 'text'
    end::settings.value_type,
    /* Humanised from the key until somebody writes a real label. */
    initcap(replace(s.key, '_', ' ')),
    'Carried over from the original settings table. Label and help not yet written.',
    s.key like '%commission%' or s.key like '%fee%',
    900
  from public.setting s
  on conflict (key) do nothing;

  for r in select * from public.setting loop
    insert into settings.version (
      key, scope_kind, scope_city_id, value, status,
      effective_from, reason, approved_by, created_at, activated_at)
    values (
      r.key,
      case when r.scope = 'city' then 'city' else 'global' end::settings.scope_kind,
      r.city_id,
      r.value,
      'active',
      r.effective_from,
      'Carried over from the original settings table.',
      r.approved_by,
      r.created_at,
      r.created_at)
    on conflict do nothing;
  end loop;
end $$;

drop table public.setting cascade;

create view public.setting
with (security_invoker = true) as
select
  v.id,
  v.scope_kind::text::public.setting_scope as scope,
  v.scope_city_id as city_id,
  v.key,
  v.value,
  v.effective_from,
  v.approved_by,
  v.created_at,
  coalesce(v.activated_at, v.created_at) as updated_at
from settings.version v
where v.status = 'active'
  and v.scope_kind in ('global', 'city');

comment on view public.setting is
  'The active version of every global and city setting, in the shape the original table had, so the twelve call sites that read it by name keep working. Read-only: a write goes through settings.rpc_change_set_*, and the old INSERT path fails loudly rather than writing something nobody approved.';

grant select on public.setting to authenticated, anon;

-- ═══════════════════════════════════════════════════ RLS

alter table settings.definition enable row level security;
alter table settings.version enable row level security;
alter table settings.change_set enable row level security;
alter table settings.approval_policy enable row level security;
alter table settings.city_template enable row level security;
alter table settings.snapshot_daily enable row level security;

grant usage on schema settings to authenticated;
revoke all on all tables in schema settings from anon, authenticated;
grant select on
  settings.definition, settings.version, settings.change_set,
  settings.approval_policy, settings.city_template, settings.snapshot_daily
  to authenticated;

/*
 * Settings values are not secrets — a merchant is entitled to know
 * the commission, and hiding it from staff helps nobody. Every
 * member of staff reads; nobody writes except through the RPCs,
 * which is why there is not one insert, update or delete policy in
 * this file.
 */
create policy definition_read on settings.definition
  for select to authenticated using (authz.staff_id() is not null);
create policy version_read on settings.version
  for select to authenticated using (authz.staff_id() is not null);
create policy change_set_read on settings.change_set
  for select to authenticated using (authz.staff_id() is not null);
create policy approval_policy_read on settings.approval_policy
  for select to authenticated using (authz.staff_id() is not null);
create policy city_template_read on settings.city_template
  for select to authenticated using (authz.staff_id() is not null);
create policy snapshot_read on settings.snapshot_daily
  for select to authenticated using (authz.staff_id() is not null);
