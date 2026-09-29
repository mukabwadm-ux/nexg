-- Two corrections to where a check belongs.

/*
 * 1. The payout name check leaves the readiness ring.
 *
 * It was counted as one of the rider's six steps, so a rider who had done
 * everything they could — entered their M-Pesa number, taken every photo —
 * still saw a tick missing, with nothing they could do to earn it. The thing
 * that was outstanding was *our* check of their name against their ID, not
 * their work.
 *
 * A progress bar should only contain things the person can act on. So
 * readiness asks whether they gave us a number; whether that number is in
 * their own name is a gate on activation, below, where the consequence
 * actually is.
 */
create or replace function public.fn_rider_readiness(p_rider_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_about boolean;
  v_ride boolean;
  v_areas boolean;
  v_docs boolean;
  v_payout boolean;
  v_kit boolean;
  v_done integer;
begin
  select * into r from public.rider where id = p_rider_id;
  if r.id is null then
    return null;
  end if;

  if (select auth.uid()) is not null
     and not (r.user_id = (select auth.uid()) or authz.can_manage_riders(r.city_id))
  then
    raise exception 'Not yours to look at.' using errcode = 'insufficient_privilege';
  end if;

  v_about := coalesce(length(trim(r.first_name)), 0) > 0
             and r.phone_verified_at is not null
             and r.city_id is not null;

  v_ride := r.vehicle is not null
            and (
              r.vehicle = 'bicycle'
              or (r.plate_no is not null and r.ownership is not null and r.insurance is not null)
            );

  /* array_length of an empty array is null, not 0. */
  v_areas := coalesce(array_length(r.areas, 1), 0) >= 1
             and coalesce(array_length(r.shifts, 1), 0) >= 1;

  /*
   * Every required photo, not only the essential ones. A rider waiting on a
   * good conduct certificate sees five of six ticks and an honest 66% —
   * they can still be activated, and the ring is not claiming they are done.
   */
  select coalesce(bool_and(
    case when q.kind = 'national_id' then
      (select count(distinct d.side) from public.document d
        where d.owner_type = 'rider' and d.owner_id = r.id
          and d.requirement_id = q.id and d.status in ('uploaded', 'verified')
          and d.side is not null) >= 2
    else
      exists (select 1 from public.document d
        where d.owner_type = 'rider' and d.owner_id = r.id
          and d.requirement_id = q.id and d.status in ('uploaded', 'verified'))
    end
  ), false)
  into v_docs
  from public.fn_rider_required_docs(r.id) q;

  v_payout := r.payout_msisdn is not null;

  /* The kit in their hands at the hub, not a slot in a calendar. */
  v_kit := r.kit_issued_at is not null;

  v_done := coalesce(v_about, false)::int + coalesce(v_ride, false)::int
          + coalesce(v_areas, false)::int + coalesce(v_docs, false)::int
          + coalesce(v_payout, false)::int + coalesce(v_kit, false)::int;

  return jsonb_build_object(
    'about_you', v_about,
    'your_ride', v_ride,
    'areas_hours', v_areas,
    'documents', v_docs,
    'mpesa_payout', v_payout,
    'kit_onboarding', v_kit,
    'pct', floor(v_done * 100.0 / 6)::int
  );
end;
$$;

/*
 * 2. Activation gains the two gates the readiness ring gave up.
 *
 * rpc_activate_rider already refused a motorised rider with no plate and
 * anyone with an unverified document. It did not check where the money
 * goes, and it did not check that anyone had handed over a kit.
 *
 * Paying a line registered to somebody else is how a rider loses a week's
 * earnings to whoever set up their phone, so it is refused — and because no
 * lookup provider is connected yet, the refusal is overridable with a
 * written reason. That is deliberate: rider ops can see the ID and the
 * M-Pesa name side by side at the hub, and the override records that they
 * did, which a silent skip would not.
 */
create or replace function public.rpc_activate_rider(
  p_rider_id uuid,
  p_reason text default null
)
returns public.rider
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_staff uuid;
  v_required int;
  v_verified int;
  v_matched boolean;
begin
  select * into v_rider from public.rider where id = p_rider_id for update;
  if v_rider.id is null then
    raise exception 'No rider with id %', p_rider_id using errcode = 'no_data_found';
  end if;

  v_staff := authz.staff_id();
  if v_staff is null or not authz.can_manage_riders(v_rider.city_id) then
    raise exception 'You need rider_ops or super_admin for this city to activate a rider.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_rider.status = 'active' then
    return v_rider;
  end if;

  if v_rider.vehicle <> 'bicycle'
     and (v_rider.plate_no is null or length(trim(v_rider.plate_no)) = 0) then
    raise exception 'This rider has no plate number, which is required for a %.', v_rider.vehicle
      using errcode = 'check_violation';
  end if;

  select
    count(*) filter (where q.essential),
    count(*) filter (
      where q.essential and exists (
        select 1 from public.document d
        where d.owner_type = 'rider' and d.owner_id = p_rider_id
          and d.requirement_id = q.id and d.superseded_at is null
          and d.status = 'verified'
      )
    )
  into v_required, v_verified
  from public.fn_rider_required_docs(p_rider_id) q;

  if v_verified < v_required then
    raise exception 'This rider has % of % essential documents verified.', v_verified, v_required
      using errcode = 'check_violation';
  end if;

  v_matched := coalesce((v_rider.payout_name_lookup ->> 'matched')::boolean, false);
  if not v_matched and coalesce(trim(p_reason), '') = '' then
    raise exception
      'The M-Pesa line has not been confirmed as registered to this rider. Check the name against their ID and activate with a reason, or fix the number first.'
      using errcode = 'check_violation';
  end if;

  if v_rider.kit_issued_at is null and coalesce(trim(p_reason), '') = '' then
    raise exception
      'No kit has been issued to this rider. Hand over the kit at the hub, or activate with a reason.'
      using errcode = 'check_violation';
  end if;

  update public.rider
  set status = 'active',
      activated_by = v_staff,
      activated_at = now(),
      status_reason = nullif(trim(p_reason), '')
  where id = p_rider_id
  returning * into v_rider;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.activated',
    p_actor_id => v_staff,
    p_target_type => 'rider',
    p_target_id => p_rider_id,
    p_after => jsonb_build_object(
      'status', 'active',
      'payout_name_matched', v_matched,
      'kit_issued', v_rider.kit_issued_at is not null),
    p_reason => nullif(trim(p_reason), ''),
    p_severity => 'notice'::public.audit_severity,
    p_city_id => v_rider.city_id
  );

  insert into public.notification_log (channel, recipient, template, payload, status)
  values ('sms', v_rider.phone, 'rider_activated',
          jsonb_build_object('rider_id', v_rider.id, 'first_name', v_rider.first_name), 'skipped');

  return v_rider;
end;
$$;

/* Rider ops marks the kit handed over. It is an assertion about the rider,
   so it is staff-only — the write guard refuses it from the rider. */
create or replace function public.rpc_rider_issue_kit(p_rider_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_staff uuid := authz.staff_id();
begin
  select * into v_rider from public.rider where id = p_rider_id;
  if v_rider.id is null then
    raise exception 'No rider with id %', p_rider_id using errcode = 'no_data_found';
  end if;

  if v_staff is null or not authz.can_manage_riders(v_rider.city_id) then
    raise exception 'You need rider_ops or super_admin for this city.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.rider set kit_issued_at = coalesce(kit_issued_at, now()) where id = p_rider_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'rider',
    p_action => 'rider.kit_issued',
    p_actor_id => v_staff,
    p_target_type => 'rider',
    p_target_id => p_rider_id,
    p_city_id => v_rider.city_id
  );

  return (select kit_issued_at from public.rider where id = p_rider_id);
end;
$$;

grant execute on function public.rpc_rider_issue_kit(uuid) to authenticated;
