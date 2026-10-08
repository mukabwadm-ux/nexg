-- The rider's phone.
--
-- Activation step 3 is "app installed, notifications and
-- location allowed". There was nothing to read it from, so the
-- view returned false for everybody — which was the honest
-- answer and also meant no rider could ever reach seven of
-- seven. An activation checklist with a step that cannot be
-- completed is not a checklist.
--
-- This is the table it should have been reading. One row per
-- phone, and a rider may have exactly one bound for job work:
-- an offer going to a handset somebody left at home is a late
-- delivery nobody can explain.

create table if not exists rider_device (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references rider (id) on delete cascade,

  platform text not null check (platform in ('android', 'ios', 'web')),
  label text,

  /*
   * The two permissions that decide whether this phone can
   * actually do the job. Both are the browser's or the OS's
   * answer, recorded when the app last asked — not what we
   * hope is true.
   */
  notification_permission boolean not null default false,
  location_permission boolean not null default false,
  push_token text,

  /*
   * Only one phone takes jobs. Signing in on a second one
   * moves this flag, which signs the first out of job mode —
   * the rider is told, because a phone that silently stops
   * receiving offers looks like NexG having no work.
   */
  is_job_device boolean not null default false,

  bound_at timestamptz not null default now(),
  last_seen_at timestamptz,
  unbound_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists rider_device_by_rider on rider_device (rider_id);

/* One job device per rider, enforced rather than hoped for. */
create unique index if not exists rider_device_one_job_phone
  on rider_device (rider_id)
  where is_job_device and unbound_at is null;

comment on table rider_device is
  'The phones a rider has signed in on. Exactly one may be the job device: an offer sent to a handset left at home is a late delivery nobody can explain afterwards.';

alter table rider_device enable row level security;

drop policy if exists rider_device_own on rider_device;
create policy rider_device_own on rider_device
  for select to authenticated
  using (exists (select 1 from rider r
                  where r.id = rider_device.rider_id
                    and r.user_id = (select auth.uid())));

drop policy if exists rider_device_staff on rider_device;
create policy rider_device_staff on rider_device
  for select to authenticated
  using (authz.staff_id() is not null);

grant select on rider_device to authenticated;

-- ════════════════════════ step 3 can now be answered

/*
 * Ready means: a bound job device, both permissions granted.
 * Partial does not count — a phone that can take an offer but
 * cannot be navigated from, or one that can navigate but never
 * rings, is a phone that produces a failed delivery rather
 * than a rider who is ready.
 */
create or replace view rider_setup_progress_v
with (security_invoker = true) as
with per_rider as (
  select
    r.id as rider_id,
    r.first_name,
    r.last_name,
    r.status::text as status,
    r.vehicle::text as vehicle,
    r.submitted_at,
    r.activated_at,
    rd.readiness,

    (coalesce((rd.readiness ->> 'about_you')::boolean, false)
      and coalesce((rd.readiness ->> 'areas_hours')::boolean, false)) as step_profile,

    coalesce((rd.readiness ->> 'your_ride')::boolean, false) as step_vehicle,

    exists (
      select 1 from public.rider_device d
       where d.rider_id = r.id
         and d.is_job_device and d.unbound_at is null
         and d.notification_permission and d.location_permission
    ) as step_app,

    coalesce((rd.readiness ->> 'documents')::boolean, false) as step_documents,
    coalesce((rd.readiness ->> 'mpesa_payout')::boolean, false) as step_payout,
    coalesce((rd.readiness ->> 'kit_onboarding')::boolean, false) as step_session,

    ((select count(*) from public.rider_training t
       where t.rider_id = r.id and t.passed) >= 3
     and exists (select 1 from public.rider_test_trip tt
                  where tt.rider_id = r.id and tt.outcome = 'pass')) as step_training,

    (select count(*) from public.rider_training t
      where t.rider_id = r.id and t.passed) as modules_passed
  from public.rider r
  left join lateral (
    select public.fn_rider_readiness(r.id) as readiness
  ) rd on true
)
select
  p.*,
  (p.step_profile::int + p.step_vehicle::int + p.step_app::int
   + p.step_documents::int + p.step_payout::int
   + p.step_session::int + p.step_training::int) as done_count,
  7 as of_count,
  case
    when not p.step_profile then 1
    when not p.step_vehicle then 2
    when not p.step_app then 3
    when not p.step_documents then 4
    when not p.step_payout then 5
    when not p.step_session then 6
    when not p.step_training then 7
  end as next_step,
  (p.step_documents and p.step_payout and p.step_session) as can_train,
  p.status = 'active' as is_active
from per_rider p;

comment on view rider_setup_progress_v is
  'The seven activation steps. Step 3 reads rider_device: a bound job phone with both notification and location permission. Partial does not count — a phone that rings but cannot navigate produces a failed delivery, not a ready rider.';

grant select on rider_setup_progress_v to authenticated;
