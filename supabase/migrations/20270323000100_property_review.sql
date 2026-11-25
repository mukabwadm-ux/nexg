-- Property review: a NexG staff member checks a property before guests see it
-- (owner, 25 Nov 2026: "a way to check that properties are legit").
--
--   1. property.review_status: pending / approved / rejected / suspended, with
--      the reason (required for rejected and suspended), who decided and when.
--      New properties start pending.
--   2. Backfill: every property that guests can see today (listed, host live,
--      a live listed unit) is approved, so nothing that is live disappears.
--      Each is written to audit.log as property.approved by the system.
--   3. property_public and property_unit_public also need review_status =
--      'approved'. Booking (rpc_stay_hold, rpc_stay_search, rpc_unit_busy)
--      reads property_unit_public, so it follows.
--   4. console_property_v: the review shows in blocked_reason, and four
--      columns are added at the end (review_status, review_reason, reviewed_at,
--      reviewed_by_name).
--   5. rpc_property_review(property, decision, reason): approve, reject,
--      suspend, reinstate. Hospitality staff only; audited.
--   6. Staff read for the property page: stay reviews (a staff read policy on
--      stay_review) and rpc_property_team (the host's people, with emails).
--
-- Re-created from their latest definitions with only these changes:
--   property_public        20270228000300 (+ review_status = 'approved')
--   property_unit_public   20270228000300 (+ review_status = 'approved')
--   console_property_v     20260101008400 (blocked_reason + 4 columns at the end)
--
-- Rollback: restore the three views from those files, drop
-- rpc_property_review and rpc_property_team, drop policy stay_review_staff_read,
-- delete the four property.* actions added here from audit.action_registry
-- (after their audit rows are archived), and drop the four columns and their
-- constraints.

-- ═══════════════════════════════════════════════ 1. columns

alter table public.property
  add column if not exists review_status text not null default 'pending',
  add column if not exists review_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.staff_user (id) on delete set null;

alter table public.property
  drop constraint if exists property_review_status_check,
  add constraint property_review_status_check
    check (review_status in ('pending', 'approved', 'rejected', 'suspended')),
  drop constraint if exists property_review_reason_needed,
  add constraint property_review_reason_needed
    check (review_status not in ('rejected', 'suspended') or review_reason is not null),
  drop constraint if exists property_review_reason_length,
  add constraint property_review_reason_length
    check (review_reason is null or char_length(review_reason) <= 500);

create index if not exists property_review_pending_idx
  on public.property (created_at) where review_status = 'pending';

comment on column public.property.review_status is
  'NexG''s check that the property is real and the host may let it: pending, approved, rejected or suspended. Guests see only approved properties (property_public). Set by staff through rpc_property_review.';
comment on column public.property.review_reason is
  'Why it was rejected or suspended, in words the host can act on. At most 500 characters.';

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('property.approved', 'hotels', 'notice', false, 'Staff approved a property after checking it, so guests can see it'),
  ('property.rejected', 'hotels', 'notice', false, 'Staff rejected a property that was waiting for review'),
  ('property.suspended', 'hotels', 'high', false, 'Staff suspended an approved property, taking it off the site'),
  ('property.reinstated', 'hotels', 'notice', false, 'Staff reinstated a suspended property')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════ 2. backfill

do $$
declare
  v_property record;
begin
  for v_property in
    update public.property p
       set review_status = 'approved', reviewed_at = now(), reviewed_by = null
     where p.review_status = 'pending'
       and p.listed
       and exists (select 1 from public.host h where h.id = p.host_id and h.status = 'live')
       and exists (select 1 from public.unit u
                    where u.property_id = p.id and u.status = 'live'
                      and u.listed and u.archived_at is null)
    returning p.id, p.city_id, p.name
  loop
    perform audit.log('system'::public.actor_type, 'hotels', 'property.approved',
      p_target_type => 'property', p_target_id => v_property.id,
      p_target_label => v_property.name, p_city_id => v_property.city_id,
      p_after => jsonb_build_object('review_status', 'approved'),
      p_reason => 'Already live when property review began');
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════ 3. what a guest sees

-- property_public: 20270228000300, plus the review.
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
where p.listed and h.status = 'live'
  and p.review_status = 'approved'
  and (not p.accepts_test_payments or (select authz.sees_test_tenants()))
group by p.id, c.name;

-- property_unit_public: 20270228000300, plus the review.
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
where u.status = 'live' and u.listed and u.archived_at is null
  and p.listed and h.status = 'live'
  and p.review_status = 'approved'
  and (not p.accepts_test_payments or (select authz.sees_test_tenants()));

-- ═══════════════════════════════════════════════ 4. the console's read

-- console_property_v: 20260101008400, plus the review.
create or replace view public.console_property_v
with (security_invoker = true) as
select
  p.id,
  p.slug,
  p.name,
  p.kind,
  p.area,
  p.city_id,
  c.name as city_name,
  p.host_id,
  h.display_name as host_name,
  h.status as host_status,
  p.listed,
  p.listed_at,
  p.summary,
  p.amenities,
  jsonb_array_length(p.photos) as photo_count,
  (select count(*) from public.unit u
    where u.property_id = p.id and u.archived_at is null) as units,
  (select count(*) from public.unit u
    where u.property_id = p.id and u.listed and u.status = 'live') as units_listed,
  (select min(u.nightly_rate_kes) from public.unit u
    where u.property_id = p.id and u.listed) as from_rate_kes,
  /* Why this property is not visible, worked out once here rather
     than guessed at in the console. NexG's review comes first: it is
     the one thing on this list only staff can do. */
  case
    when p.review_status = 'pending' then 'Waiting for NexG review'
    when p.review_status = 'rejected' then 'Rejected by NexG'
    when p.review_status = 'suspended' then 'Suspended by NexG'
    when not p.listed then 'Not listed'
    when h.status <> 'live' then 'Host is not live'
    when not exists (select 1 from public.unit u
      where u.property_id = p.id and u.listed and u.status = 'live')
      then 'No live listed unit'
    when jsonb_array_length(p.photos) = 0 then 'No photos'
  end as blocked_reason,
  p.review_status,
  p.review_reason,
  p.reviewed_at,
  (select su.display_name from public.staff_user su where su.id = p.reviewed_by) as reviewed_by_name
from public.property p
join public.host h on h.id = p.host_id
left join public.city c on c.id = p.city_id;

-- ═══════════════════════════════════════════════ 5. the decision

/*
 * approve    pending or rejected → approved
 * reject     pending             → rejected   (reason required)
 * suspend    approved            → suspended  (reason required)
 * reinstate  suspended           → approved
 */
create or replace function public.rpc_property_review(
  p_property_id uuid,
  p_decision text,
  p_reason text default null
)
returns public.property
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property public.property;
  v_staff uuid := authz.staff_id();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_from text;
  v_to text;
  v_action text;
begin
  select * into v_property from public.property where id = p_property_id for update;
  if v_property.id is null then
    raise exception 'No such property.' using errcode = 'P0002';
  end if;
  if v_staff is null or not authz.works_hospitality(v_property.city_id) then
    raise exception 'You do not review properties here.' using errcode = '42501';
  end if;

  v_from := v_property.review_status;
  case p_decision
    when 'approve' then
      if v_from not in ('pending', 'rejected') then
        raise exception 'Only a property waiting for review or rejected can be approved.' using errcode = '22023';
      end if;
      v_to := 'approved'; v_action := 'property.approved';
    when 'reject' then
      if v_from <> 'pending' then
        raise exception 'Only a property waiting for review can be rejected. Suspend an approved one.' using errcode = '22023';
      end if;
      v_to := 'rejected'; v_action := 'property.rejected';
    when 'suspend' then
      if v_from <> 'approved' then
        raise exception 'Only an approved property can be suspended.' using errcode = '22023';
      end if;
      v_to := 'suspended'; v_action := 'property.suspended';
    when 'reinstate' then
      if v_from <> 'suspended' then
        raise exception 'Only a suspended property can be reinstated.' using errcode = '22023';
      end if;
      v_to := 'approved'; v_action := 'property.reinstated';
    else
      raise exception 'Choose approve, reject, suspend or reinstate.' using errcode = '22023';
  end case;

  if v_to in ('rejected', 'suspended') and (v_reason is null or char_length(v_reason) < 5) then
    raise exception 'Give the reason, in words the host can act on.' using errcode = '22023';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Keep the reason to 500 characters.' using errcode = '22023';
  end if;

  update public.property set
    review_status = v_to,
    review_reason = case when v_to in ('rejected', 'suspended') then v_reason end,
    reviewed_at = now(),
    reviewed_by = v_staff
  where id = p_property_id
  returning * into v_property;

  perform audit.log('staff'::public.actor_type, 'hotels', v_action,
    p_target_type => 'property', p_target_id => v_property.id,
    p_target_label => v_property.name, p_city_id => v_property.city_id,
    p_before => jsonb_build_object('review_status', v_from),
    p_after => jsonb_build_object('review_status', v_to),
    p_reason => v_reason);

  return v_property;
end;
$$;

revoke execute on function public.rpc_property_review(uuid, text, text) from public, anon;
grant execute on function public.rpc_property_review(uuid, text, text) to authenticated;

-- ═══════════════════════════════════════════════ 6. what staff read

/* Guests' reviews of their stays: hospitality staff read them on the
   property page. Hosts already read their own (stay_review_host_read). */
drop policy if exists stay_review_staff_read on public.stay_review;
create policy stay_review_staff_read on public.stay_review
  for select to authenticated
  using (authz.works_hospitality(null));

/*
 * Who looks after a property: the host's people (owner and managers),
 * with the email they sign in with. A manager limited to some units is
 * listed only when one of those units is in this property.
 */
create or replace function public.rpc_property_team(p_property_id uuid)
returns table (
  user_id uuid,
  role text,
  email text,
  unit_scope integer,
  accepted_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_property public.property;
begin
  select * into v_property from public.property where id = p_property_id;
  if v_property.id is null then
    raise exception 'No such property.' using errcode = 'P0002';
  end if;
  if authz.staff_id() is null or not authz.works_hospitality(v_property.city_id) then
    raise exception 'You do not look after properties here.' using errcode = '42501';
  end if;

  return query
    select hu.user_id, hu.role, au.email::text,
           case when hu.units is null then null else cardinality(hu.units) end,
           hu.accepted_at, hu.created_at
      from public.host_user hu
      left join auth.users au on au.id = hu.user_id
     where hu.host_id = v_property.host_id
       and (hu.units is null
            or exists (select 1 from public.unit u
                        where u.id = any (hu.units) and u.property_id = v_property.id))
     order by case hu.role when 'owner' then 0 else 1 end, hu.created_at;
end;
$$;

revoke execute on function public.rpc_property_team(uuid) from public, anon;
grant execute on function public.rpc_property_team(uuid) to authenticated;
