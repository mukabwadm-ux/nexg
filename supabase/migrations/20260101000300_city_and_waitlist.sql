-- Cities and the homepage waitlist — spec section 3.2.

create table public.city (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  country text not null,
  currency text not null,
  timezone text not null,
  status public.city_status not null default 'waitlist',
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index city_status_sort_idx on public.city (status, sort);

create trigger city_set_updated_at
  before update on public.city
  for each row execute function public.tg_set_updated_at();

comment on table public.city is 'Cities NexG serves or plans to serve. The homepage counts these.';

-- ------------------------------------------------------------------ waitlist

create table public.waitlist_signup (
  id uuid primary key default gen_random_uuid(),
  email text,
  city_id uuid references public.city (id) on delete set null,
  source text not null,
  consent_marketing boolean not null default false,
  -- The homepage lead form captures a free-text request; section 4.1 stores it
  -- here with source = 'homepage_request' until the concierge desk exists.
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint waitlist_signup_source_check check (
    source in ('homepage_app', 'homepage_city', 'homepage_request')
  ),
  -- A city sign-up needs a city; an app notify needs an email. A concierge
  -- request needs the request itself.
  constraint waitlist_signup_has_contact check (
    email is not null or payload is not null
  )
);

create index waitlist_signup_city_idx on public.waitlist_signup (city_id);
create index waitlist_signup_source_idx on public.waitlist_signup (source, created_at desc);

create trigger waitlist_signup_set_updated_at
  before update on public.waitlist_signup
  for each row execute function public.tg_set_updated_at();

comment on table public.waitlist_signup is
  'Homepage captures: app notify, city waitlist, and concierge lead requests.';

-- ------------------------------------------------------------- seed: cities
--
-- Reference data lives in migrations, not seed.sql, because production needs
-- it too and seed.sql only runs on a local reset. Eleven cities, because the
-- homepage says "11 cities" (spec section 3.2).

insert into public.city (slug, name, country, currency, timezone, status, sort) values
  ('nairobi',      'Nairobi',      'Kenya',    'KES', 'Africa/Nairobi',  'live',        10),
  ('mombasa',      'Mombasa',      'Kenya',    'KES', 'Africa/Nairobi',  'live',        20),
  ('kisumu',       'Kisumu',       'Kenya',    'KES', 'Africa/Nairobi',  'live',        30),
  ('nakuru',       'Nakuru',       'Kenya',    'KES', 'Africa/Nairobi',  'soft_launch', 40),
  ('kampala',      'Kampala',      'Uganda',   'UGX', 'Africa/Kampala',  'waitlist',    50),
  ('dar-es-salaam','Dar es Salaam','Tanzania', 'TZS', 'Africa/Dar_es_Salaam', 'waitlist', 60),
  ('kigali',       'Kigali',       'Rwanda',   'RWF', 'Africa/Kigali',   'waitlist',    70),
  ('arusha',       'Arusha',       'Tanzania', 'TZS', 'Africa/Dar_es_Salaam', 'waitlist', 80),
  ('entebbe',      'Entebbe',      'Uganda',   'UGX', 'Africa/Kampala',  'waitlist',    90),
  ('eldoret',      'Eldoret',      'Kenya',    'KES', 'Africa/Nairobi',  'waitlist',   100),
  ('zanzibar',     'Zanzibar',     'Tanzania', 'TZS', 'Africa/Dar_es_Salaam', 'waitlist', 110)
on conflict (slug) do nothing;
