-- Rider pipeline: record the background check and the test delivery.
--
-- The admin Riders board sorts applicants into Background check and
-- Training & test by rider.background_check ->> 'status' and by a passed
-- row in rider_test_trip, but nothing let staff write either, so riders
-- could only move on by being activated directly. These two functions are
-- the missing writers. Training ("basics") already has
-- rpc_rider_training_record; suspension already has the two-person
-- rpc_rider_two_person_request / _approve and rpc_rider_reinstate.
--
-- Both need rider_ops or super_admin for the rider's city (the same check
-- as activation) and write an audit event in the same transaction.

create or replace function public.rpc_rider_background_check_set(
  p_rider_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_staff uuid := authz.staff_id();
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
  v_check jsonb;
begin
  select * into v_rider from public.rider where id = p_rider_id for update;
  if v_rider.id is null then
    raise exception 'No such rider.' using errcode = 'no_data_found';
  end if;
  if v_staff is null or not authz.can_manage_riders(v_rider.city_id) then
    raise exception 'You need rider_ops or super_admin for this city.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('clear', 'flagged') then
    raise exception 'The result is clear or flagged.' using errcode = 'invalid_parameter_value';
  end if;
  if p_status = 'flagged' and v_note is null then
    raise exception 'Say what the check found.' using errcode = 'check_violation';
  end if;

  v_check := coalesce(v_rider.background_check, '{}'::jsonb) || jsonb_build_object(
    'status', p_status,
    'note', v_note,
    'checked_by', v_staff,
    'checked_at', now()
  );
  update public.rider set background_check = v_check where id = p_rider_id;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.background_check_recorded',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_before => v_rider.background_check, p_after => v_check);

  return v_check;
end;
$$;

revoke all on function public.rpc_rider_background_check_set(uuid, text, text) from public, anon;
grant execute on function public.rpc_rider_background_check_set(uuid, text, text) to authenticated;

create or replace function public.rpc_rider_test_trip_record(
  p_rider_id uuid,
  p_passed boolean,
  p_order_reference text default null,
  p_notes text default null
)
returns public.rider_test_trip
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rider public.rider;
  v_staff uuid := authz.staff_id();
  v_notes text := nullif(left(trim(coalesce(p_notes, '')), 500), '');
  v_trip public.rider_test_trip;
begin
  select * into v_rider from public.rider where id = p_rider_id;
  if v_rider.id is null then
    raise exception 'No such rider.' using errcode = 'no_data_found';
  end if;
  if v_staff is null or not authz.can_manage_riders(v_rider.city_id) then
    raise exception 'You need rider_ops or super_admin for this city.'
      using errcode = 'insufficient_privilege';
  end if;
  if not p_passed and v_notes is null then
    raise exception 'Say what went wrong on the test delivery.' using errcode = 'check_violation';
  end if;

  insert into public.rider_test_trip (rider_id, order_reference, outcome, assessor_id, notes)
  values (
    p_rider_id,
    nullif(left(trim(coalesce(p_order_reference, '')), 60), ''),
    case when p_passed then 'passed' else 'failed' end,
    v_staff,
    v_notes
  )
  returning * into v_trip;

  perform audit.log('staff'::public.actor_type, 'riders', 'rider.test_trip_recorded',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_after => jsonb_build_object('outcome', v_trip.outcome, 'order_reference', v_trip.order_reference));

  return v_trip;
end;
$$;

revoke all on function public.rpc_rider_test_trip_record(uuid, boolean, text, text) from public, anon;
grant execute on function public.rpc_rider_test_trip_record(uuid, boolean, text, text) to authenticated;
