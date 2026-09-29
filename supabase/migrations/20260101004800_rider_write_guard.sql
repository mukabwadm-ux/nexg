-- What a rider may not set about themselves, and what a guest may see.

/*
 * Same hole as the merchant table had, and worse in one respect: a rider who
 * can write their own row can set kit_issued_at and payout_name_lookup, which
 * are two of the three things rpc_activate_rider checks before letting them
 * take orders. The policy restricts which rows, not which columns.
 *
 * Deliberately NOT security definer — the check reads current_user, and
 * definer would rewrite it to this function's owner, so every check would
 * pass for everyone. See tg_merchant_protected_columns, which was written
 * that way first and silently did nothing.
 */
create or replace function public.tg_rider_protected_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if authz.can_manage_riders(coalesce(old.city_id, new.city_id)) then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.status_reason is distinct from old.status_reason
     or new.user_id is distinct from old.user_id
     or new.activated_by is distinct from old.activated_by
     or new.activated_at is distinct from old.activated_at
     or new.kit_issued_at is distinct from old.kit_issued_at
     or new.payout_name_lookup is distinct from old.payout_name_lookup
     or new.submitted_at is distinct from old.submitted_at
     or new.waitlisted_at is distinct from old.waitlisted_at
     or new.phone_verified_at is distinct from old.phone_verified_at
     or new.phone_code_hash is distinct from old.phone_code_hash
     or new.phone_code_expires_at is distinct from old.phone_code_expires_at
     or new.phone_code_attempts is distinct from old.phone_code_attempts
     or new.resume_token_hash is distinct from old.resume_token_hash
     or new.resume_token_expires_at is distinct from old.resume_token_expires_at
     or new.cash_cap is distinct from old.cash_cap
     or new.source is distinct from old.source
     or new.employer_merchant_id is distinct from old.employer_merchant_id
     or new.onboarding_slot_id is distinct from old.onboarding_slot_id
  then
    raise exception 'That is not yours to set.' using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger rider_protected_columns
  before update on public.rider
  for each row execute function public.tg_rider_protected_columns();

comment on function public.tg_rider_protected_columns is
  'Stops a rider setting the things activation depends on — kit issue, payout name checks, verification timestamps. Staff and the security-definer RPCs pass through.';

-- ------------------------------------------------------------- rider_public

/*
 * What a guest waiting at their gate may know about the rider coming to it.
 *
 * A first name, a face and a plate: enough to recognise the right person and
 * check the plate, and nothing more. Not the phone number — a guest who can
 * see it can call it for months afterwards, which is the thing riders ask us
 * about most. Calls go through a masked line instead.
 *
 * Only active riders. Somebody mid-application is not answering a door for
 * us and should not be findable.
 */
create or replace view public.rider_public
with (security_invoker = false)
as
select
  r.id,
  r.first_name,
  r.vehicle,
  r.plate_no,
  r.face_photo_path,
  r.city_id
from public.rider r
where r.status = 'active';

comment on view public.rider_public is
  'The rider as a guest sees them at the gate: first name, face, vehicle, plate. Never the phone number.';

grant select on public.rider_public to anon, authenticated;

-- --------------------------------------------------- onboarding slot seed
--
-- A week of Nairobi sessions from the pattern in settings. Real hub
-- scheduling replaces these rows without touching the flow.

insert into public.setting (scope, key, value, effective_from)
values ('global', 'onboarding_hub_times', '["09:00", "14:00"]'::jsonb, now())
on conflict do nothing;

insert into public.onboarding_slot (city_id, hub_name, starts_at, capacity)
select
  c.id,
  'Westlands hub',
  /* A wall-clock time in Nairobi, converted once. Writing it as a bare
     timestamp let the server's UTC read it as 09:00 UTC, and the flow
     offered riders a hub session at noon. */
  (((current_date + d.ahead)::timestamp + t.at::time) at time zone 'Africa/Nairobi'),
  8
from public.city c
/* `offset` is reserved; `ahead` reads the same and parses. */
cross join generate_series(1, 10) as d(ahead)
cross join (values ('09:00'), ('14:00')) as t(at)
where c.slug = 'nairobi'
  and extract(isodow from current_date + d.ahead) between 1 and 6
on conflict (city_id, hub_name, starts_at) do nothing;
