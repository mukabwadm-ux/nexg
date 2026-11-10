-- Customers book for themselves on the main database.
--
-- The booking tables and rpc_booking_create already let a signed-in customer
-- book. What was missing:
--   * opening hours: a customer could ask for a car or a provider at 03:00.
--     A customer booking of an exclusive resource (a room, a car, a provider)
--     must now start and end while the business is open, by the same
--     effective hours the store page shows (weekly hours, date overrides,
--     city exceptions). Sessions are exempt: the merchant publishes them.
--   * the times a customer can actually pick, for one day;
--   * the customer's own list of bookings, with whether each can still be
--     cancelled online.
-- Merchants booking on someone's behalf are not restricted by hours.
--
-- It also fixes the public read policies on bookable_resource and
-- booking_slot. They asked "is this merchant live?" with a subquery against
-- public.merchant, which anon cannot read, so a signed-out visitor got
-- "permission denied" instead of the services. Same fault and same fix as
-- the catalogue in 20260101003300_catalogue_visibility_fix.sql.
--
-- Rollback:
--   drop trigger booking_hours_guard on public.booking;
--   drop function public.fn_booking_hours_guard, public.rpc_booking_open_times,
--     public.rpc_my_bookings, public.fn_booking_open_at;
--   (the two read policies can stay: the old ones never worked for anon)

drop policy if exists bookable_resource_public_read on public.bookable_resource;
create policy bookable_resource_public_read on public.bookable_resource
  for select to anon, authenticated
  using (active and public.fn_merchant_is_live(merchant_id));

drop policy if exists booking_slot_public_read on public.booking_slot;
create policy booking_slot_public_read on public.booking_slot
  for select to anon, authenticated
  using (status = 'open' and exists (
    select 1 from public.bookable_resource r
    where r.id = resource_id and r.active and public.fn_merchant_is_live(r.merchant_id)
  ));

-- Whether a business is open at an instant, in Nairobi time. A closing time
-- earlier than the opening time runs past midnight (18:00-01:00), and equal
-- times mean open all day. An end may fall exactly on closing time.
-- No published hours for the day means closed.
create function public.fn_booking_open_at(p_merchant_id uuid, p_at timestamptz, p_is_end boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local timestamp := p_at at time zone 'Africa/Nairobi';
  v_time time := v_local::time;
  h record;
begin
  select * into h from public.fn_merchant_effective_hours(p_merchant_id, null, v_local::date) limit 1;
  if found and not h.closed and h.opens is not null and h.closes is not null then
    if h.opens = h.closes then
      return true;
    elsif h.closes > h.opens then
      if v_time >= h.opens and (v_time < h.closes or (p_is_end and v_time = h.closes)) then
        return true;
      end if;
    elsif v_time >= h.opens then
      return true;
    end if;
  end if;

  -- The part after midnight of yesterday's late opening.
  select * into h from public.fn_merchant_effective_hours(p_merchant_id, null, v_local::date - 1) limit 1;
  if found and not h.closed and h.opens is not null and h.closes is not null
     and h.closes < h.opens
     and (v_time < h.closes or (p_is_end and v_time = h.closes)) then
    return true;
  end if;
  return false;
end;
$$;

revoke execute on function public.fn_booking_open_at from public, anon, authenticated;

create function public.fn_booking_hours_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'app' and new.exclusive and new.status in ('pending', 'confirmed')
     and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at
          or new.ends_at is distinct from old.ends_at) then
    if not public.fn_booking_open_at(new.merchant_id, new.starts_at, false)
       or not public.fn_booking_open_at(new.merchant_id, new.ends_at, true) then
      raise exception 'Pick a time when the business is open' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- Runs after booking_guard (alphabetical), which fills merchant_id and exclusive.
create trigger booking_hours_guard
  before insert or update of starts_at, ends_at
  on public.booking
  for each row execute function public.fn_booking_hours_guard();

-- Start times a customer can book on one Nairobi date, for an exclusive
-- resource: within opening hours, after the notice period, within the
-- advance window, and clear of other bookings and their turnaround buffer.
-- p_minutes is the length asked for; it defaults to the resource's duration.
create function public.rpc_booking_open_times(p_resource_id uuid, p_date date, p_minutes int default null)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.bookable_resource;
  m public.merchant;
  v_minutes int;
  v_step interval;
  v_day_start timestamptz := p_date::timestamp at time zone 'Africa/Nairobi';
  v_start timestamptz;
  v_end timestamptz;
begin
  select * into r from public.bookable_resource where id = p_resource_id;
  if not found or not r.active or r.model <> 'exclusive' then
    return;
  end if;
  select * into m from public.merchant where id = r.merchant_id;
  if (m.status <> 'live' or m.deleted_at is not null) and not authz.is_merchant_member(m.id) then
    return;
  end if;

  v_minutes := coalesce(p_minutes, r.duration_minutes);
  if v_minutes is null or v_minutes < 1 or v_minutes > 90 * 24 * 60 then
    raise exception 'Choose how long you need it' using errcode = '22023';
  end if;
  v_step := make_interval(mins => case when v_minutes < 30 then 15 else 30 end);

  for v_start in
    select g from generate_series(v_day_start, v_day_start + interval '1 day' - v_step, v_step) g
  loop
    v_end := v_start + make_interval(mins => v_minutes);
    continue when v_start < now() + make_interval(mins => r.min_notice_minutes);
    continue when v_start > now() + make_interval(days => r.max_advance_days);
    continue when not public.fn_booking_open_at(m.id, v_start, false);
    continue when not public.fn_booking_open_at(m.id, v_end, true);
    continue when exists (
      select 1 from public.booking b
      where b.resource_id = r.id
        and b.exclusive
        and b.status in ('pending', 'confirmed', 'blocked')
        and b.held_during && tstzrange(v_start, v_end + make_interval(mins => r.buffer_minutes), '[)')
    );
    starts_at := v_start;
    ends_at := v_end;
    return next;
  end loop;
end;
$$;

-- The signed-in customer's own bookings, newest first.
create function public.rpc_my_bookings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.starts_at desc), '[]'::jsonb)
  from (
    select b.id, b.reference, b.starts_at, b.ends_at, b.quantity, b.status, b.total_cents,
           r.name as resource_name, r.model, m.id as merchant_id, m.trading_name as merchant_name,
           (b.status in ('pending', 'confirmed')
             and now() <= b.starts_at - make_interval(mins => r.cancel_cutoff_minutes)) as can_cancel
    from public.booking b
    join public.bookable_resource r on r.id = b.resource_id
    join public.merchant m on m.id = b.merchant_id
    where b.guest_user_id = auth.uid()
    order by b.starts_at desc
    limit 100
  ) x;
$$;

revoke execute on function public.rpc_booking_open_times, public.rpc_my_bookings from public, anon;
grant execute on function public.rpc_booking_open_times to anon, authenticated;
grant execute on function public.rpc_my_bookings to authenticated;
