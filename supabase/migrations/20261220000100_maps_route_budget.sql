-- A Maps account must still exist in Auth and must not be a temporary session.
create function authz.maps_has_real_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true'
    and exists (
      select 1
      from auth.users u
      where u.id = (select auth.uid()) and not coalesce(u.is_anonymous, false)
    );
$$;

comment on function authz.maps_has_real_account() is
  'Verifies the caller is a non-anonymous, existing Auth account for customer Maps reads and quotas.';

revoke execute on function authz.maps_has_real_account() from public, anon, service_role;
grant execute on function authz.maps_has_real_account() to authenticated;

-- Consume all route budget counters atomically before any paid route request.
-- Persist current bucket counts only. Context keys are hashes of opaque client IDs.
create table public.maps_route_budget (
  account_id uuid primary key references auth.users(id) on delete cascade,
  day_bucket date,
  minute_bucket timestamp without time zone,
  day_count integer not null default 0 check (day_count between 0 and 60),
  minute_count integer not null default 0 check (minute_count between 0 and 10),
  context_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context_counts) = 'object')
);

comment on table public.maps_route_budget is
  'Private, per-account usage buckets for Google Routes. Holds counts and hashed context IDs only.';

alter table public.maps_route_budget enable row level security;
revoke all on public.maps_route_budget from public, anon, authenticated, service_role;

create function public.rpc_maps_route_budget(p_context_id text)
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
begin
  if not authz.maps_has_real_account() then
    raise exception 'Sign in with your account to request a map route.' using errcode = '42501';
  end if;

  if p_context_id is null or char_length(p_context_id) not between 1 and 120
    or p_context_id <> btrim(p_context_id) or p_context_id ~ '[[:cntrl:]]' then
    raise exception 'Invalid route context.' using errcode = '22023';
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
  'Reserve one Maps Routes request for the signed-in account in the current UTC minute, day and context.';

revoke execute on function public.rpc_maps_route_budget(text) from public, anon, service_role;
grant execute on function public.rpc_maps_route_budget(text) to authenticated;

insert into public.wiring_audit_exempt (function_name, reason, recorded_in)
values ('rpc_maps_route_budget',
        'Operational rate counters only. A per-hit audit row would create retained customer usage history.',
        '20261220000100_maps_route_budget');
