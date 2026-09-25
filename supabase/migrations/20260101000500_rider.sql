-- Riders — spec section 3.2.

create table public.rider (
  id uuid primary key default gen_random_uuid(),
  -- Null until the phone OTP is verified and an auth user exists.
  user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null,
  last_name text not null,
  phone text not null unique,
  city_id uuid not null references public.city (id) on delete restrict,
  vehicle public.vehicle_type not null,
  plate_no text,
  status public.rider_status not null default 'applied',
  status_reason text,
  activated_by uuid references public.staff_user (id) on delete set null,
  activated_at timestamptz,
  onboarding_session_at timestamptz,
  kit_issued boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Phone is the rider's identity and their M-Pesa number: E.164 only.
  constraint rider_phone_is_e164 check (phone ~ '^\+[1-9][0-9]{7,14}$'),

  -- A bicycle has no plate; anything motorised must have one before it can be
  -- activated. Enforced at activation rather than application, because the
  -- plate is collected in step 2 (section 4.2).
  constraint rider_plate_required_when_active check (
    status <> 'active'
    or vehicle = 'bicycle'
    or (plate_no is not null and length(trim(plate_no)) > 0)
  ),

  -- An active rider must carry who activated them and when.
  constraint rider_activation_is_attributed check (
    (status = 'active') = (activated_at is not null)
  )
);

create index rider_status_city_idx on public.rider (status, city_id);
create index rider_city_idx on public.rider (city_id);
create index rider_user_idx on public.rider (user_id);

create trigger rider_set_updated_at
  before update on public.rider
  for each row execute function public.tg_set_updated_at();

comment on table public.rider is
  'A rider application and, once activated, a working rider. Status only reaches active through rpc_activate_rider.';

comment on column public.rider.plate_no is
  'Required for motorised vehicles before activation; always null for bicycles.';
