-- R42 (Explore B4): guests get road times for one complete Explore plan.
--
-- The owner, 22 Nov 2026: "people not signed in can only perform one complete
-- request for the explore and the rest open after they pay for whats pending
-- or sign in". Until now the maps-routes Edge Function refused every
-- temporary (guest) session, so a guest's day plan had no road times.
--
-- 1. maps_guest_route_context: the one Explore plan (route context, hashed as
--    in maps_route_budget) a guest session has used.
-- 2. rpc_maps_route_budget (latest 20261220000100) now lets a guest session
--    through for that one plan, with the usual minute, day and per-plan
--    limits. A route for a different plan answers allowed: false, reason
--    sign_in_required, until the guest signs in (an account has no guest
--    limit) or has an order that is paid.
-- 3. The Edge Function passes guests to the budget and answers
--    sign_in_required (403) when it says so (supabase/functions/maps-routes).
--
-- Rollback: restore rpc_maps_route_budget from 20261220000100 and drop
-- maps_guest_route_context.

create table public.maps_guest_route_context (
  account_id  uuid primary key references auth.users (id) on delete cascade,
  context_key text not null,
  first_at    timestamptz not null default now()
);
comment on table public.maps_guest_route_context is
  'The one Explore plan (hashed route context) a guest session may route before signing in or paying.';
alter table public.maps_guest_route_context enable row level security;
revoke all on public.maps_guest_route_context from public, anon, authenticated, service_role;

-- rpc_maps_route_budget: 20261220000100, plus a guest's one free plan.
create or replace function public.rpc_maps_route_budget(p_context_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := auth.uid();
  v_counts public.maps_route_budget%rowtype;
  v_now timestamp without time zone;
  v_day date;
  v_minute timestamp without time zone;
  v_context_key text;
  v_context_count integer;
  v_retry_at timestamp without time zone;
  v_guest boolean;
  v_guest_key text;
begin
  -- An existing Auth user: an account, or a temporary (guest) session.
  if v_account_id is null or not exists (select 1 from auth.users u where u.id = v_account_id) then
    raise exception 'Sign in with your account to request a map route.' using errcode = '42501';
  end if;
  v_guest := not authz.maps_has_real_account();

  if p_context_id is null or char_length(p_context_id) not between 1 and 120
    or p_context_id <> btrim(p_context_id) or p_context_id ~ '[[:cntrl:]]' then
    raise exception 'Invalid route context.' using errcode = '22023';
  end if;

  -- A guest routes one complete Explore plan; more opens once they sign in
  -- or have paid for an order (owner, 22 Nov 2026).
  if v_guest and not exists (
       select 1 from public.order o
         join public.guest g on g.id = o.guest_id
        where g.user_id = v_account_id
          and o.payment_status in ('authorised', 'paid', 'collected')) then
    v_guest_key := encode(extensions.digest(v_account_id::text || ':' || p_context_id, 'sha256'), 'hex');
    insert into public.maps_guest_route_context (account_id, context_key)
    values (v_account_id, v_guest_key)
    on conflict (account_id) do nothing;
    if (select context_key from public.maps_guest_route_context where account_id = v_account_id)
         is distinct from v_guest_key then
      return jsonb_build_object('accountId', v_account_id, 'allowed', false, 'reason', 'sign_in_required');
    end if;
  end if;

  insert into public.maps_route_budget (account_id)
  values (v_account_id)
  on conflict (account_id) do nothing;

  select * into strict v_counts
  from public.maps_route_budget
  where account_id = v_account_id
  for update;

  -- Determine the current buckets after taking the lock. All three limits use
  -- the same observation of UTC time, even when a request waited across a boundary.
  v_now := clock_timestamp() at time zone 'UTC';
  v_day := v_now::date;
  v_minute := date_trunc('minute', v_now);
  if v_counts.day_bucket is distinct from v_day then
    v_counts.day_count := 0;
    v_counts.context_counts := '{}'::jsonb;
  end if;
  if v_counts.minute_bucket is distinct from v_minute then
    v_counts.minute_count := 0;
  end if;
  v_context_key := encode(extensions.digest(v_account_id::text || ':' || p_context_id, 'sha256'), 'hex');
  v_context_count := coalesce((v_counts.context_counts ->> v_context_key)::integer, 0);

  if v_counts.day_count >= 60 or v_context_count >= 20 then
    v_retry_at := (v_day + 1)::timestamp;
  elsif v_counts.minute_count >= 10 then
    v_retry_at := v_minute + interval '1 minute';
  end if;
  if v_retry_at is not null then
    return jsonb_build_object(
      'accountId', v_account_id,
      'allowed', false,
      'retryAfterSeconds', greatest(1, ceil(extract(epoch from v_retry_at - v_now))::integer)
    );
  end if;

  update public.maps_route_budget
  set day_bucket = v_day,
      minute_bucket = v_minute,
      day_count = v_counts.day_count + 1,
      minute_count = v_counts.minute_count + 1,
      context_counts = jsonb_set(v_counts.context_counts, array[v_context_key], to_jsonb(v_context_count + 1))
  where account_id = v_account_id;

  return jsonb_build_object('accountId', v_account_id, 'allowed', true);
end;
$$;

comment on function public.rpc_maps_route_budget(text) is
  'Reserve one Maps Routes request in the current UTC minute, day and context: for a signed-in account, or for a guest session within its one free Explore plan.';
