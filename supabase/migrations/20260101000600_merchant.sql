-- Merchants, their branches and their users — spec section 3.2.

create table public.merchant (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  trading_name text not null,
  category public.merchant_category not null,
  category_other text,
  contact_name text not null,
  contact_phone text not null,
  contact_email text not null unique,
  city_id uuid not null references public.city (id) on delete restrict,
  status public.partner_status not null default 'applied',
  status_reason text,
  went_live_by uuid references public.staff_user (id) on delete set null,
  went_live_at timestamptz,
  -- Till, paybill or bank details. Added by the merchant later; never part of
  -- the public application form (section 3.2).
  settlement_account jsonb,
  cover_photo_path text,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_phone_is_e164 check (contact_phone ~ '^\+[1-9][0-9]{7,14}$'),

  -- "Other" is only meaningful with the free text that explains it.
  constraint merchant_other_category_is_explained check (
    category <> 'other' or (category_other is not null and length(trim(category_other)) > 0)
  ),

  constraint merchant_go_live_is_attributed check (
    (status = 'live') = (went_live_at is not null)
  )
);

create index merchant_status_city_idx on public.merchant (status, city_id);
create index merchant_city_idx on public.merchant (city_id);
create index merchant_featured_idx on public.merchant (city_id) where featured and status = 'live';

create trigger merchant_set_updated_at
  before update on public.merchant
  for each row execute function public.tg_set_updated_at();

comment on table public.merchant is
  'A merchant application and, once live, a listed merchant. Status only reaches live through rpc_merchant_go_live.';

comment on column public.merchant.settlement_account is
  'Payout details. Never collected in the public application; readable only by the merchant and finance.';

-- ----------------------------------------------------------- merchant_branch

create table public.merchant_branch (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  name text not null,
  address_text text not null,
  -- Geography is added in M5 with the Maps picker; PostGIS is not enabled yet,
  -- so the pin is stored as plain coordinates until then.
  latitude double precision,
  longitude double precision,
  zone_id uuid,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint merchant_branch_latitude_range check (
    latitude is null or latitude between -90 and 90
  ),
  constraint merchant_branch_longitude_range check (
    longitude is null or longitude between -180 and 180
  )
);

-- Exactly one primary branch per merchant.
create unique index merchant_branch_one_primary
  on public.merchant_branch (merchant_id)
  where is_primary;

create index merchant_branch_merchant_idx on public.merchant_branch (merchant_id);

create trigger merchant_branch_set_updated_at
  before update on public.merchant_branch
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------- merchant_user

create table public.merchant_user (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.merchant_user_role not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (merchant_id, user_id)
);

create index merchant_user_user_idx on public.merchant_user (user_id);

create trigger merchant_user_set_updated_at
  before update on public.merchant_user
  for each row execute function public.tg_set_updated_at();

-- Helper used by merchant RLS policies: does the caller belong to this merchant?
create or replace function authz.is_merchant_member(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.merchant_user mu
    where mu.merchant_id = p_merchant_id
      and mu.user_id = (select auth.uid())
  )
$$;

grant execute on function authz.is_merchant_member(uuid) to anon, authenticated, service_role;
