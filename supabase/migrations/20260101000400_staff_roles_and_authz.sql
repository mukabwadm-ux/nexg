-- Staff, roles, role grants, and the authorisation helpers RLS depends on.
-- Spec sections 3.2 and 3.4.

create table public.staff_user (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  status public.staff_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger staff_user_set_updated_at
  before update on public.staff_user
  for each row execute function public.tg_set_updated_at();

comment on table public.staff_user is
  'A person allowed into the console. Section 5.1 also requires the email to be on the configured Workspace domain; that check lives in the app, because the domain is configuration rather than schema.';

-- ---------------------------------------------------------------------- role

create table public.role (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger role_set_updated_at
  before update on public.role
  for each row execute function public.tg_set_updated_at();

insert into public.role (key, label, description) values
  ('super_admin',  'Super admin',  'Everything, in every city. Grant sparingly.'),
  ('ops_manager',  'Ops manager',  'Day-to-day operations across modules.'),
  ('merchant_ops', 'Merchant ops', 'Merchant onboarding, documents and go-live.'),
  ('rider_ops',    'Rider ops',    'Rider onboarding, documents and activation.'),
  ('finance',      'Finance',      'Settlements, ledger and payouts.'),
  ('growth',       'Growth',       'Featured slots, campaigns and acquisition.'),
  ('hr',           'HR',           'Careers and staff records.'),
  ('dpo',          'Data protection officer', 'Data requests, retention and the audit log.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- role_grant

create table public.role_grant (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references public.staff_user (id) on delete cascade,
  role_id uuid not null references public.role (id) on delete restrict,
  -- null city means every city.
  city_id uuid references public.city (id) on delete cascade,
  granted_by uuid not null references public.staff_user (id) on delete restrict,
  approved_by uuid references public.staff_user (id) on delete restrict,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint role_grant_approver_is_not_granter check (
    approved_by is null or approved_by <> granted_by
  )
);

-- One live grant per staff member, role and city.
create unique index role_grant_unique_live
  on public.role_grant (staff_user_id, role_id, coalesce(city_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;

create index role_grant_staff_idx on public.role_grant (staff_user_id) where revoked_at is null;

create trigger role_grant_set_updated_at
  before update on public.role_grant
  for each row execute function public.tg_set_updated_at();

/*
 * Spec section 3.4 asks for a check constraint requiring a second approver on
 * finance and super_admin grants. A CHECK cannot read another table, and
 * faking it with a function marked IMMUTABLE breaks dump/restore — so the rule
 * is a trigger. The guarantee is the same: the write fails.
 */
create or replace function public.tg_role_grant_requires_second_approver()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role_key text;
begin
  select key into v_role_key from public.role where id = new.role_id;

  if v_role_key in ('finance', 'super_admin') then
    if new.approved_by is null then
      raise exception
        'A % grant requires a second approver (approved_by).', v_role_key
        using errcode = 'check_violation';
    end if;
    if new.approved_by = new.granted_by then
      raise exception
        'A % grant must be approved by someone other than the person granting it.', v_role_key
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger role_grant_requires_second_approver
  before insert or update on public.role_grant
  for each row execute function public.tg_role_grant_requires_second_approver();

-- ----------------------------------------------------------- authz helpers
--
-- SECURITY DEFINER so that a policy on role_grant can call has_role() without
-- recursing into that same policy. They read only the caller's own grants.

create or replace function authz.staff_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select su.id
  from public.staff_user su
  where su.user_id = (select auth.uid())
    and su.status = 'active'
$$;

comment on function authz.staff_id is
  'The calling user''s staff_user id, or null if they are not active staff.';

create or replace function authz.has_role(p_role text, p_city uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    join public.staff_user su on su.id = rg.staff_user_id
    where su.user_id = (select auth.uid())
      and su.status = 'active'
      and r.key = p_role
      and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at > now())
      -- A null city_id on the grant means every city.
      and (rg.city_id is null or p_city is null or rg.city_id = p_city)
  )
$$;

comment on function authz.has_role is
  'True when the caller holds a live grant for the role, in that city or globally.';

create or replace function authz.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.has_role('super_admin')
$$;

-- Section 3.4 names exactly these two role pairs for partner records.

create or replace function authz.can_manage_riders(p_city uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.has_role('rider_ops', p_city) or authz.has_role('super_admin', p_city)
$$;

create or replace function authz.can_manage_merchants(p_city uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.has_role('merchant_ops', p_city) or authz.has_role('super_admin', p_city)
$$;

grant execute on function
  authz.staff_id(),
  authz.has_role(text, uuid),
  authz.is_super_admin(),
  authz.can_manage_riders(uuid),
  authz.can_manage_merchants(uuid)
to anon, authenticated, service_role;
