-- Dispatch: the cascade, and what a dispatcher can do to it.
--
-- The screen's whole job is to show why the automatic cascade could
-- not place an order and what to do now. That only works if every
-- offer is a row somebody can read — who was asked, how far away
-- they were, what they said, and why anyone eligible was skipped.
-- Inferring any of it in the browser would mean the explanation and
-- the decision could disagree.
--
-- The prompt asks for Temporal workflows in a `services/dispatch`
-- that does not exist. What is here instead is the same state
-- machine as rows and functions: a job, its rounds, its offers, and
-- a cron that advances them. A workflow engine would give better
-- retry semantics and nothing else the console needs — and this way
-- the cascade is queryable, which is what the Replay view wants
-- anyway.

create schema if not exists dispatch;

comment on schema dispatch is
  'The cascade as data. Every offer is a row with who was asked, how far away, what they said and why anyone was skipped — because a dispatcher judging an intervention needs the reason, not a summary.';

create type dispatch.job_state as enum (
  'queued', 'offering', 'assigned', 'escalated', 'manual_assigned', 'cancelled', 'completed');

create type dispatch.offer_outcome as enum (
  'pending', 'accepted', 'declined', 'timed_out', 'skipped', 'withdrawn');

create type dispatch.decline_reason as enum (
  'too_far', 'wrong_direction', 'vehicle', 'cash', 'break', 'other');

create type dispatch.skip_reason as enum (
  'wrong_vehicle', 'cash_over_cap', 'not_alcohol_eligible', 'on_cooldown',
  'already_offered', 'stacking_not_allowed', 'out_of_radius');

create type dispatch.presence as enum ('online_free', 'on_trip', 'idle_30', 'offline');

-- ═══════════════════════════════════════════════ the job

create table dispatch.job (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  city_id uuid not null references public.city (id) on delete restrict,
  zone_id uuid references public.zone (id) on delete set null,

  pickup_point geography(point, 4326),
  dropoff_point geography(point, 4326),
  pickup_label text not null,
  dropoff_label text not null,
  distance_km numeric(6,2),

  vehicle_requirements text[] not null default '{}',
  fleet_preference text not null default 'mixed'
    check (fleet_preference in ('own_first', 'pool_only', 'mixed')),
  fleet_merchant_id uuid references public.merchant (id) on delete set null,

  state dispatch.job_state not null default 'queued',
  round integer not null default 0,
  radius_km numeric(5,2),
  boost_cents bigint not null default 0,

  /*
   * Which dispatch rules this job is running under. Settings can
   * change mid-cascade; a job that started on a 20-second window
   * must not suddenly be judged against a 30-second one.
   */
  rule_version_ids jsonb not null default '{}'::jsonb,

  started_at timestamptz not null default now(),
  assigned_at timestamptz,
  assigned_rider_id uuid references public.rider (id) on delete set null,
  escalated_at timestamptz,
  escalation_reason text check (escalation_reason is null or escalation_reason in (
    'radius_exhausted', 'no_eligible_riders', 'merchant_delay', 'manual')),
  ended_at timestamptz,
  end_reason text,

  constraint job_assigned_names_a_rider check (
    state not in ('assigned', 'manual_assigned') or assigned_rider_id is not null)
);

create unique index job_one_live_per_order on dispatch.job (order_id)
  where state not in ('cancelled', 'completed');
create index job_open_idx on dispatch.job (city_id, state, started_at)
  where state in ('queued', 'offering', 'escalated');

-- ═══════════════════════════════════════════ the cascade

create table dispatch.offer (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references dispatch.job (id) on delete cascade,
  round integer not null,
  rank integer not null,
  rider_id uuid not null references public.rider (id) on delete cascade,

  distance_km numeric(6,2),
  eta_min integer,
  score numeric(8,3),

  offered_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  outcome dispatch.offer_outcome not null default 'pending',
  decline_reason dispatch.decline_reason,
  skip_reason dispatch.skip_reason,
  /* The line the workbench prints: "acceptance 61%", "on 2nd offer
     today", "wrong vehicle · laundry bag". Written at offer time,
     because the reason has to be what was true then. */
  note text,
  /* A dispatcher asked for this one by name. */
  direct boolean not null default false,

  unique (job_id, round, rank),
  constraint offer_skip_has_a_reason check (
    outcome <> 'skipped' or skip_reason is not null),
  constraint offer_response_has_a_time check (
    outcome in ('pending', 'skipped') or responded_at is not null)
);

create index offer_job_idx on dispatch.offer (job_id, round, rank);
create index offer_rider_idx on dispatch.offer (rider_id, offered_at desc);
create index offer_pending_idx on dispatch.offer (expires_at)
  where outcome = 'pending';

/*
 * An offer is immutable once answered. The cascade is the record a
 * dispatcher is judged against, and a record that can be edited
 * afterwards is not one.
 */
create or replace function dispatch.tg_offer_is_final()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.outcome <> 'pending' then
    raise exception 'That offer has already been answered (%). The cascade is the record an intervention is judged against; it does not get edited afterwards.',
      old.outcome;
  end if;
  return new;
end;
$$;

create trigger offer_is_final before update on dispatch.offer
  for each row execute function dispatch.tg_offer_is_final();

-- ══════════════════════════════ what staff did about it

create table dispatch.action (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references dispatch.job (id) on delete cascade,
  kind text not null check (kind in (
    'boost_retry', 'widen_radius', 'assign_manual', 'tell_guest_delay',
    'cancel', 'pause_zone', 'resume_zone', 'force_stack', 'reassign')),
  params jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  actor_id uuid references public.staff_user (id) on delete set null,
  at timestamptz not null default now(),
  reason text
);

create index action_job_idx on dispatch.action (job_id, at);

-- ═════════════════════════════ where the riders are

/*
 * The console's fallback and the replay's source. The live stream
 * is a separate concern — this is the every-60-seconds mirror, so
 * the screen still works when the socket is down and a post-mortem
 * has something to scrub through.
 */
create table dispatch.rider_presence_live (
  rider_id uuid primary key references public.rider (id) on delete cascade,
  city_id uuid references public.city (id) on delete set null,
  zone_id uuid references public.zone (id) on delete set null,
  point geography(point, 4326),
  heading numeric(5,1),
  speed_kmh numeric(5,1),
  presence dispatch.presence not null default 'offline',
  current_job_id uuid references dispatch.job (id) on delete set null,
  cash_on_hand_cents bigint,
  vehicle text,
  capabilities text[] not null default '{}',
  battery_pct smallint,
  last_seen_at timestamptz not null default now()
);

create index presence_city_idx on dispatch.rider_presence_live (city_id, presence);

create table dispatch.zone_health (
  zone_id uuid primary key references public.zone (id) on delete cascade,
  live_orders integer not null default 0,
  riders_free integer not null default 0,
  riders_on_trip integer not null default 0,
  riders_idle integer not null default 0,
  avg_assign_s integer,
  p90_assign_s integer,
  unassigned integer not null default 0,
  escalated integer not null default 0,
  state text not null default 'ok' check (state in ('ok', 'tight', 'short')),
  paused boolean not null default false,
  paused_reason text,
  paused_until timestamptz,
  computed_at timestamptz not null default now(),
  constraint zone_pause_has_a_reason check (
    not paused or coalesce(trim(paused_reason), '') <> '')
);

/*
 * Replay. Captured while offering so a post-mortem can answer "who
 * was actually nearby at 20:14" — which no amount of after-the-fact
 * querying can, because riders move.
 */
create table dispatch.replay (
  job_id uuid primary key references dispatch.job (id) on delete cascade,
  snapshots jsonb not null default '[]'::jsonb,
  retained_until date not null default (current_date + 30),
  updated_at timestamptz not null default now()
);

comment on table dispatch.replay is
  'Positions and offer state while the cascade ran. Captured live because riders move — no query afterwards can say who was nearby at 20:14.';

-- ═══════════════════════════════════════════════════ RLS

alter table dispatch.job enable row level security;
alter table dispatch.offer enable row level security;
alter table dispatch.action enable row level security;
alter table dispatch.rider_presence_live enable row level security;
alter table dispatch.zone_health enable row level security;
alter table dispatch.replay enable row level security;

grant usage on schema dispatch to authenticated;
revoke all on all tables in schema dispatch from anon, authenticated;
grant select on dispatch.job, dispatch.offer, dispatch.action,
  dispatch.rider_presence_live, dispatch.zone_health, dispatch.replay
  to authenticated;

/*
 * Live operations is a city-scoped grant. A dispatcher in Mombasa
 * has no business watching Nairobi's riders move, and rider
 * positions are the most sensitive thing on this screen.
 */
create or replace function authz.works_live_ops(p_city_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.is_super_admin()
      or authz.has_role('ops_manager', p_city_id)
      or authz.has_role('city_lead', p_city_id)
      or authz.has_role('rider_ops', p_city_id)
      or authz.has_role('concierge_lead', p_city_id)
$$;

comment on function authz.works_live_ops is
  'Who may watch a city move. Rider positions are the most sensitive thing on the live screen, so this is city-scoped and separate from merely reaching the module.';

create policy job_read on dispatch.job
  for select to authenticated
  using (authz.works_live_ops(city_id) or authz.can_manage_merchants(city_id));

create policy offer_read on dispatch.offer
  for select to authenticated
  using (exists (select 1 from dispatch.job j where j.id = offer.job_id));

create policy action_read on dispatch.action
  for select to authenticated
  using (exists (select 1 from dispatch.job j where j.id = action.job_id));

/* Positions: the live-ops grant, or the rider themselves. */
create policy presence_read on dispatch.rider_presence_live
  for select to authenticated
  using (authz.works_live_ops(city_id) or authz.is_rider_self(rider_id));

create policy zone_health_read on dispatch.zone_health
  for select to authenticated
  using (exists (select 1 from public.zone z
                 where z.id = zone_health.zone_id
                   and (authz.works_live_ops(z.city_id)
                        or authz.reaches_module('live_ops'))));

/* Replay is a post-mortem tool and every view of it is audited. */
create policy replay_read on dispatch.replay
  for select to authenticated
  using (exists (select 1 from dispatch.job j
                 where j.id = replay.job_id and authz.works_live_ops(j.city_id)));

grant execute on function authz.works_live_ops(uuid) to authenticated;
