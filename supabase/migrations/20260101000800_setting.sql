-- Settings — spec section 3.2.
--
-- Ground rule 3: the UI renders [—] wherever a value is null. These rows exist
-- with null values on purpose, so the interface has something to read and
-- nothing to invent.

create table public.setting (
  id uuid primary key default gen_random_uuid(),
  scope public.setting_scope not null default 'global',
  city_id uuid references public.city (id) on delete cascade,
  key text not null,
  value jsonb,
  effective_from timestamptz not null default now(),
  approved_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint setting_city_matches_scope check (
    (scope = 'global' and city_id is null) or (scope = 'city' and city_id is not null)
  )
);

create unique index setting_unique_key
  on public.setting (key, scope, coalesce(city_id, '00000000-0000-0000-0000-000000000000'::uuid));

create trigger setting_set_updated_at
  before update on public.setting
  for each row execute function public.tg_set_updated_at();

comment on table public.setting is
  'Operational configuration. A null value is a valid, expected state: the UI renders [—] rather than a made-up number.';

insert into public.setting (scope, key, value) values
  ('global', 'commission_pct_by_category', null),
  ('global', 'homepage_featured_slots_per_city', null)
on conflict do nothing;
