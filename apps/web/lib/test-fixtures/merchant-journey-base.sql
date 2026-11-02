-- Test-only historical dependency fixture, adapted from the Phase 4 SQL check.
-- This is not a canonical schema or a replacement for deployed Supabase Auth.
create role anon; create role authenticated; create role service_role;
create schema auth; create schema authz; create schema audit; create schema extensions;
create type public.actor_type as enum ('merchant_user','staff');
create type public.partner_status as enum ('applied','documents_pending','under_review','live','paused','delisted','rejected');
create type public.merchant_category as enum ('restaurants_food','adults_only','restaurant');
create type public.document_owner_type as enum ('merchant','rider');
create type public.document_status as enum ('uploaded','verified','rejected','expired');
create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id),created_at timestamptz not null default now(),not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}') $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
create table public.staff_user(id uuid primary key,user_id uuid,status text);
create table public.role(id uuid primary key default gen_random_uuid(),key text unique);
create table public.role_grant(staff_user_id uuid,role_id uuid,city_id uuid,revoked_at timestamptz,expires_at timestamptz);
create schema settings;
create type settings.value_type as enum ('int');
create type settings.scope_kind as enum ('global');
create type settings.version_status as enum ('active');
create table settings.definition(
  key text primary key,"group" text not null,scope_kind settings.scope_kind not null,
  value_type settings.value_type not null,constraints jsonb not null default '{}'::jsonb,
  unit text,label text not null,help text,sensitive boolean not null default false,
  can_be_immediate boolean not null default false,approval_pair text not null default 'single:ops_manager',
  reader_modules text[] not null default '{}',default_value jsonb,sort integer not null default 100);
create table settings.version(
  key text not null references settings.definition(key),scope_kind settings.scope_kind not null,
  value jsonb,status settings.version_status not null,effective_from timestamptz not null default now(),
  reason text,activated_at timestamptz);
create unique index settings_version_one_active_fixture
  on settings.version(key,scope_kind) where status='active';
create view public.setting as
  select scope_kind::text as scope,key,value,effective_from from settings.version
  where status='active' and scope_kind='global';
grant select on public.setting to anon,authenticated;
create table public.category_config(category text primary key);
create table public.merchant(
  id uuid primary key default gen_random_uuid(),trading_name text not null,contact_name text not null,
  contact_phone text not null check(contact_phone ~ '^\+[1-9][0-9]{7,14}$'),contact_email text unique,
  category public.merchant_category,subcategory text,city_id uuid,status public.partner_status default 'applied',
  onboarding_step integer,submitted_at timestamptz,accepting_orders boolean not null default false,
  status_reason text,featured boolean default false,went_live_by uuid,went_live_at timestamptz,settlement_account jsonb,
  waitlisted_at timestamptz,credentials_sent_at timestamptz,password_set_at timestamptz,payout_name_lookup jsonb,
  requires_ops_mapping boolean default false,resume_token_hash text,resume_token_expires_at timestamptz,
  phone_code_hash text,phone_code_expires_at timestamptz,phone_code_attempts integer,phone_verified_at timestamptz,
  payout_account jsonb,payout_rail text);
create table public.merchant_user(id uuid primary key default gen_random_uuid(),merchant_id uuid references public.merchant(id),user_id uuid references auth.users(id),role text,unique(merchant_id,user_id));
create table public."order"(id uuid primary key default gen_random_uuid(),merchant_id uuid references public.merchant(id));
create table public.rider(id uuid primary key,user_id uuid);
alter table public.merchant enable row level security;
alter table public.merchant_user enable row level security;
alter table public."order" enable row level security;
create function authz.is_merchant_member(p_merchant_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.merchant_user where merchant_id=p_merchant_id and user_id=auth.uid()) $$;
create function authz.staff_id() returns uuid language sql stable security definer set search_path='' as $$
  select id from public.staff_user where user_id=auth.uid() and status='active' $$;
create function authz.can_manage_merchants(uuid) returns boolean language sql stable security definer as $$ select false $$;
create function public.tg_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
create policy merchant_read_own on public.merchant for select to authenticated using(authz.is_merchant_member(id));
create policy merchant_update_own on public.merchant for update to authenticated using(authz.is_merchant_member(id)) with check(authz.is_merchant_member(id));
create policy merchant_insert_authenticated on public.merchant for insert to authenticated with check(true);
create policy merchant_user_insert_self on public.merchant_user for insert to authenticated with check(user_id=auth.uid());
create policy merchant_user_read_own on public.merchant_user for select to authenticated using(user_id=auth.uid());
create policy order_read_own on public."order" for select to authenticated using(authz.is_merchant_member(merchant_id));
grant usage on schema public,auth,authz to anon,authenticated;
grant all on public.merchant,public.merchant_user to authenticated;
grant select on public."order",public.rider to authenticated;
create table audit.fixture_event(action text,after jsonb);
create function audit.log(p_actor_type public.actor_type,p_module text,p_action text,p_actor_id uuid default null,
  p_target_type text default null,p_target_id uuid default null,p_after jsonb default null,p_reason text default null)
returns bigint language plpgsql as $$ begin insert into audit.fixture_event values(p_action,p_after);return 1;end $$;
insert into public.role(key) values ('merchant_ops');
insert into public.category_config values ('restaurants_food'),('adults_only'),('restaurant');
