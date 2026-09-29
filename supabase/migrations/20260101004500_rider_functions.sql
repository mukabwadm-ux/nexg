-- Which photos this rider owes us, how close they are, and does the plate match.

/*
 * The rider's own answers as a jsonb object, so applies_when can be written
 * the same way for riders as for merchants.
 *
 * The two differ in one respect and it is worth naming: a merchant condition
 * is a single expected value tested against a possibly-multi answer, while a
 * rider condition lists the acceptable values for a single answer. Hence a
 * separate matcher rather than a shared one bent to cover both.
 */
create or replace function public.fn_rider_condition_matches(
  p_rider public.rider,
  p_condition jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(
    /*
     * coalesce on the comparison, not only on the aggregate. to_jsonb of a
     * SQL NULL is SQL NULL, so an unanswered question made the containment
     * test NULL, bool_and NULL, and the outer coalesce turned that into
     * TRUE — every rider who had not yet said who owns the bike was asked
     * for an owner's permission letter. An unanswered question matches
     * nothing.
     */
    coalesce(
      case c.key
        when 'insurance'  then to_jsonb(p_rider.insurance::text)
        when 'ownership'  then to_jsonb(p_rider.ownership::text)
        when 'vehicle'    then to_jsonb(p_rider.vehicle::text)
        else null::jsonb
      end <@ case jsonb_typeof(c.value)
               when 'array' then c.value
               else jsonb_build_array(c.value)
             end,
      false)
  ), true)  -- no conditions at all still means "always"
  from jsonb_each(coalesce(p_condition, '{}'::jsonb)) as c(key, value);
$$;

/*
 * The photos this rider must provide.
 *
 * A bicycle rider gets three: a selfie, an ID and a good conduct
 * certificate. A motorbike rider on third-party cover gets six. Renting the
 * bike adds a seventh, because the logbook will be in somebody else's name
 * and a guest at the gate has no way to know that is fine.
 */
create or replace function public.fn_rider_required_docs(p_rider_id uuid)
returns setof public.document_requirement
language sql
stable
set search_path = ''
as $$
  select dr.*
  from public.document_requirement dr
  cross join (select * from public.rider where id = p_rider_id) r
  where dr.owner_type = 'rider'
    and dr.required
    and (
      dr.applies_when = '{}'::jsonb
      or (
        (not dr.applies_when ? 'vehicle'
         or dr.applies_when -> 'vehicle' @> to_jsonb(r.vehicle::text))
        and (not dr.applies_when ? 'answer'
         or public.fn_rider_condition_matches(r, dr.applies_when -> 'answer'))
      )
    )
  order by dr.sort;
$$;

/*
 * Does the plate we read off the logbook match the one the rider typed?
 *
 * Plates are read from a phone photo of a document that has been in a
 * pocket. O and 0, I and 1, and spacing are the three things that differ
 * between what is printed and what is read, so they are normalised away
 * before comparing. This decides whether to show a green tick, never whether
 * to verify a document — a person still does that.
 */
create or replace function public.fn_plate_matches(p_plate text, p_read text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_plate is null or p_read is null then false
    else translate(upper(regexp_replace(p_plate, '[^A-Za-z0-9]', '', 'g')), 'OI', '01')
       = translate(upper(regexp_replace(p_read,  '[^A-Za-z0-9]', '', 'g')), 'OI', '01')
  end;
$$;

-- ------------------------------------------------------------- readiness

/*
 * The six checks behind the ring.
 *
 * Two of them are worth explaining because they read as stricter than they
 * look. `documents` counts every required photo rather than only the
 * essential ones, so a rider whose good conduct certificate is still with
 * the DCI sees five of six ticks and an honest 66% — they can still be
 * activated, and the ring is not claiming they are finished.
 *
 * `kit_onboarding` is the kit actually being handed over at the hub, not a
 * slot being booked. Booking is a plan; the bag and the jacket are the
 * thing, and activation depends on them.
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
     and not (
       r.user_id = (select auth.uid())
       or authz.can_manage_riders(r.city_id)
     )
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

  /* array_length of an empty array is null, not 0 — without the coalesce
     this check is null, which makes the sum null and the whole ring blank
     for every rider who has not picked an area yet. */
  v_areas := coalesce(array_length(r.areas, 1), 0) >= 1
             and coalesce(array_length(r.shifts, 1), 0) >= 1;

  /* The ID is one requirement and two photos; it only counts when both
     sides are on file. */
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

  v_payout := r.payout_msisdn is not null
              and coalesce((r.payout_name_lookup ->> 'matched')::boolean, false);

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

grant execute on function public.fn_rider_condition_matches(public.rider, jsonb) to anon, authenticated, service_role;
grant execute on function public.fn_plate_matches(text, text) to anon, authenticated, service_role;
grant execute on function public.fn_rider_readiness(uuid) to authenticated, service_role;
