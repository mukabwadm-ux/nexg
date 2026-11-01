-- Booking engine: bookable resources, slots and bookings with overbooking protection.
--
-- Two resource models:
--   exclusive  one guest at a time (a car, a room, a provider). Overlaps, including the
--              turnaround buffer after each booking, are rejected by an exclusion constraint.
--   capacity   a session, departure or class with a seat count. Seats are counted under a
--              row lock on the slot, so concurrent bookings cannot oversell.
-- Maintenance and time off are bookings with status 'blocked'.
-- Writes to booking go through the rpc_booking_* functions only.
--
-- Rollback:
--   drop function public.rpc_booking_create, public.rpc_booking_set_status,
--     public.rpc_booking_block, public.rpc_booking_busy, public.rpc_booking_slots;
--   drop table public.booking, public.booking_slot, public.bookable_resource;
--   drop type public.reservation_status;

create extension if not exists btree_gist with schema extensions;

create type public.reservation_status as enum
  ('pending', 'confirmed', 'cancelled', 'completed', 'no_show', 'blocked');

create table public.bookable_resource (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  model text not null default 'exclusive' check (model in ('exclusive', 'capacity')),
  kind text not null default 'general',
  name text not null check (length(btrim(name)) > 0),
  description text,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  price_unit text not null default 'booking' check (price_unit in ('booking', 'seat', 'hour', 'day')),
  quote_required boolean not null default false,
  capacity int not null default 1 check (capacity >= 1),
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  buffer_minutes int not null default 0 check (buffer_minutes >= 0),
  min_notice_minutes int not null default 0 check (min_notice_minutes >= 0),
  max_advance_days int not null default 365 check (max_advance_days > 0),
  cancel_cutoff_minutes int not null default 0 check (cancel_cutoff_minutes >= 0),
  instant_confirm boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookable_resource_merchant_idx on public.bookable_resource (merchant_id);

create table public.booking_slot (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.bookable_resource (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  capacity int check (capacity is null or capacity >= 1),
  cutoff_minutes int not null default 0 check (cutoff_minutes >= 0),
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (resource_id, starts_at)
);

create table public.booking (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique
    default 'NX-B-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  resource_id uuid not null references public.bookable_resource (id) on delete restrict,
  slot_id uuid references public.booking_slot (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  held_during tstzrange not null,
  exclusive boolean not null default true,
  quantity int not null default 1 check (quantity >= 1),
  status public.reservation_status not null default 'pending',
  guest_user_id uuid references auth.users (id) on delete set null,
  guest_name text,
  guest_phone text,
  notes text,
  total_cents bigint check (total_cents is null or total_cents >= 0),
  source text not null default 'app' check (source in ('app', 'merchant')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint booking_no_overlap exclude using gist (
    resource_id extensions.gist_uuid_ops with =,
    held_during with &&
  ) where (exclusive and status in ('pending', 'confirmed', 'blocked'))
);
create index booking_merchant_idx on public.booking (merchant_id, starts_at);
create index booking_guest_idx on public.booking (guest_user_id);
create index booking_slot_idx on public.booking (slot_id);

-- Fills in the derived columns and enforces seat capacity.
create function public.fn_booking_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.bookable_resource;
  s public.booking_slot;
  taken int;
  cap int;
begin
  select * into r from public.bookable_resource where id = new.resource_id;
  if not found then
    raise exception 'Unknown resource' using errcode = 'P0002';
  end if;
  new.merchant_id := r.merchant_id;
  new.exclusive := r.model = 'exclusive';
  new.held_during := tstzrange(
    new.starts_at,
    new.ends_at + make_interval(mins => case when r.model = 'exclusive' then r.buffer_minutes else 0 end),
    '[)'
  );
  new.updated_at := now();

  if r.model = 'capacity' and new.status in ('pending', 'confirmed')
     and (tg_op = 'INSERT' or old.status not in ('pending', 'confirmed') or old.quantity <> new.quantity) then
    if new.slot_id is null then
      raise exception 'A slot is required for this booking' using errcode = '22023';
    end if;
    select * into s from public.booking_slot where id = new.slot_id for update;
    if not found or s.resource_id <> new.resource_id then
      raise exception 'Slot does not belong to this resource' using errcode = '22023';
    end if;
    cap := coalesce(s.capacity, r.capacity);
    select coalesce(sum(quantity), 0) into taken
      from public.booking
      where slot_id = new.slot_id
        and status in ('pending', 'confirmed')
        and id is distinct from new.id;
    if taken + new.quantity > cap then
      raise exception 'Not enough seats left (% of % free)', greatest(cap - taken, 0), cap
        using errcode = '23P01';
    end if;
  end if;
  return new;
end;
$$;

create trigger booking_guard
  before insert or update of status, quantity, starts_at, ends_at, resource_id, slot_id
  on public.booking
  for each row execute function public.fn_booking_guard();

-- -------------------------------------------------------------------------- RLS

alter table public.bookable_resource enable row level security;
alter table public.booking_slot enable row level security;
alter table public.booking enable row level security;

create policy bookable_resource_member_all on public.bookable_resource
  for all to authenticated
  using (authz.is_merchant_member(merchant_id))
  with check (authz.is_merchant_member(merchant_id));

create policy bookable_resource_public_read on public.bookable_resource
  for select to anon, authenticated
  using (active and exists (
    select 1 from public.merchant m where m.id = merchant_id and m.status = 'live' and m.deleted_at is null
  ));

create policy booking_slot_member_all on public.booking_slot
  for all to authenticated
  using (exists (select 1 from public.bookable_resource r
                 where r.id = resource_id and authz.is_merchant_member(r.merchant_id)))
  with check (exists (select 1 from public.bookable_resource r
                      where r.id = resource_id and authz.is_merchant_member(r.merchant_id)));

create policy booking_slot_public_read on public.booking_slot
  for select to anon, authenticated
  using (status = 'open' and exists (
    select 1 from public.bookable_resource r
    join public.merchant m on m.id = r.merchant_id
    where r.id = resource_id and r.active and m.status = 'live' and m.deleted_at is null
  ));

create policy booking_member_read on public.booking
  for select to authenticated
  using (authz.is_merchant_member(merchant_id));

create policy booking_guest_read on public.booking
  for select to authenticated
  using (guest_user_id = auth.uid());

create policy booking_staff_read on public.booking
  for select to authenticated
  using (exists (select 1 from public.merchant m
                 where m.id = merchant_id and authz.can_manage_merchants(m.city_id)));

revoke insert, update, delete on public.booking from anon, authenticated;
revoke all on public.booking from anon;

-- --------------------------------------------------------------------------- RPCs

create function public.rpc_booking_create(
  p_resource_id uuid,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_slot_id uuid default null,
  p_quantity int default 1,
  p_guest_name text default null,
  p_guest_phone text default null,
  p_notes text default null
)
returns public.booking
language plpgsql
security definer
set search_path = ''
as $$
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
  return b;
exception
  when exclusion_violation then
    raise exception 'That time is already taken' using errcode = '23P01';
end;
$$;

create function public.rpc_booking_set_status(p_booking_id uuid, p_status public.reservation_status)
returns public.booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.booking;
  r public.bookable_resource;
  v_member boolean;
  v_guest boolean;
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

  update public.booking set status = p_status where id = b.id returning * into b;
  return b;
exception
  when exclusion_violation then
    raise exception 'That time is already taken' using errcode = '23P01';
end;
$$;

create function public.rpc_booking_block(
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_notes text default null
)
returns public.booking
language plpgsql
security definer
set search_path = ''
as $$
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
  return b;
exception
  when exclusion_violation then
    raise exception 'That time already has a booking' using errcode = '23P01';
end;
$$;

-- Busy ranges for an exclusive resource, readable for live businesses.
create function public.rpc_booking_busy(p_resource_id uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select lower(b.held_during), upper(b.held_during)
  from public.booking b
  join public.bookable_resource r on r.id = b.resource_id
  join public.merchant m on m.id = r.merchant_id
  where b.resource_id = p_resource_id
    and b.exclusive
    and b.status in ('pending', 'confirmed', 'blocked')
    and b.held_during && tstzrange(p_from, p_to)
    and r.active
    and (m.status = 'live' or authz.is_merchant_member(m.id))
  order by 1;
$$;

-- Open sessions with seats left.
create function public.rpc_booking_slots(p_resource_id uuid, p_from timestamptz, p_to timestamptz)
returns table (slot_id uuid, starts_at timestamptz, ends_at timestamptz, seats_left int)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.starts_at, s.ends_at,
         greatest(coalesce(s.capacity, r.capacity) - coalesce((
           select sum(b.quantity) from public.booking b
           where b.slot_id = s.id and b.status in ('pending', 'confirmed')
         ), 0), 0)::int
  from public.booking_slot s
  join public.bookable_resource r on r.id = s.resource_id
  join public.merchant m on m.id = r.merchant_id
  where s.resource_id = p_resource_id
    and s.status = 'open'
    and s.starts_at >= p_from and s.starts_at < p_to
    and r.active
    and (m.status = 'live' or authz.is_merchant_member(m.id))
  order by s.starts_at;
$$;

revoke execute on function public.rpc_booking_create, public.rpc_booking_set_status,
  public.rpc_booking_block, public.rpc_booking_busy, public.rpc_booking_slots from public, anon;
grant execute on function public.rpc_booking_create, public.rpc_booking_set_status,
  public.rpc_booking_block to authenticated;
grant execute on function public.rpc_booking_busy, public.rpc_booking_slots to anon, authenticated;
