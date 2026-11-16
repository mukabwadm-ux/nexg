-- Reuses the Saved identity schema proposed in PR 132, without its unrelated
-- account deletion, preferences or export changes. Reconcile that PR's Saved
-- section before merging both migrations; do not install duplicate policies.
create table if not exists public.customer_saved (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('merchant', 'item')),
  merchant_id uuid not null references public.merchant(id) on delete cascade,
  item_id uuid references public.catalogue_item(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_item_has_item check ((kind = 'item') = (item_id is not null))
);
create unique index if not exists customer_saved_once on public.customer_saved
  (user_id, kind, merchant_id, coalesce(item_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists customer_saved_recent on public.customer_saved(user_id, created_at desc, id desc);
alter table public.customer_saved enable row level security;
revoke all on public.customer_saved from public, anon, authenticated;
grant select, delete on public.customer_saved to authenticated;
create policy customer_saved_own_read on public.customer_saved for select to authenticated
  using (user_id = (select auth.uid()));
create policy customer_saved_own_delete on public.customer_saved for delete to authenticated
  using (user_id = (select auth.uid()));
create policy customer_saved_real_account on public.customer_saved as restrictive for all to authenticated
  using (authz.maps_has_real_account()) with check (authz.maps_has_real_account());

create or replace function public.rpc_saved_add(p_merchant_id uuid, p_item_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_id uuid;
begin
  if not authz.maps_has_real_account() then
    raise exception 'Sign in to save places.' using errcode = '42501';
  end if;
  -- Serializes capacity checks for this account; stores no separate lock row.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saved:' || v_me::text, 0));
  select s.id into v_id from public.customer_saved s
    where s.user_id = v_me and s.merchant_id = p_merchant_id and s.item_id is not distinct from p_item_id;
  if v_id is null then
    if not exists (select 1 from public.merchant_public m where m.id = p_merchant_id)
      or (p_item_id is not null and not exists (
        select 1 from public.catalogue_public c where c.id = p_item_id and c.merchant_id = p_merchant_id)) then
      raise exception 'This place or item is unavailable.' using errcode = 'P0002';
    end if;
    if (select count(*) from public.customer_saved where user_id = v_me) >= 500 then
      raise exception 'Saved is full. Remove a saved item first.' using errcode = '54000';
    end if;
    insert into public.customer_saved(user_id, kind, merchant_id, item_id)
      values(v_me, case when p_item_id is null then 'merchant' else 'item' end, p_merchant_id, p_item_id)
      returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Full account-bounded read of merchant saves. Current public facts are joined
-- at read time; hidden merchants remain removable identity records, unlocated.
create function public.rpc_my_saved_places(
  p_saved_id uuid default null,
  p_search text default null,
  p_sort text default 'recently-saved',
  p_cursor jsonb default null,
  p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_search text := lower(btrim(coalesce(p_search, '')));
  v_name_limit constant integer := 2048;
  v_control_pattern constant text := U&'[\0001-\001F\007F-\009F]';
  v_blank_name_pattern constant text := U&'^[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]*$';
  v_after_id uuid;
  v_after_key text;
  v_after_time timestamptz;
  v_rows jsonb;
  v_total integer;
  v_next jsonb;
begin
  if not authz.maps_has_real_account() then
    raise exception 'Sign in to view Saved.' using errcode = '42501';
  end if;
  if p_sort is null or p_sort not in ('recently-saved', 'name') or p_limit is null or p_limit not between 1 and 100
    or length(v_search) > 100 or v_search collate "C" ~ v_control_pattern
    or (p_saved_id is not null and (p_cursor is not null or v_search <> '')) then
    raise exception 'Unsupported Saved query.' using errcode = '22023';
  end if;
  if p_cursor is not null then
    if jsonb_typeof(p_cursor) <> 'object' or p_cursor->>'version' is distinct from '1'
      or p_cursor->>'accountId' is distinct from v_me::text
      or p_cursor->>'sort' is distinct from p_sort or p_cursor->>'search' is distinct from v_search
      or coalesce(p_cursor->>'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(p_cursor->'key') is distinct from 'string'
      or length(p_cursor->>'key') > v_name_limit or (p_cursor->>'key') collate "C" ~ v_control_pattern then
      raise exception 'Unsupported Saved cursor.' using errcode = '22023';
    end if;
    v_after_id := (p_cursor->>'id')::uuid;
    v_after_key := p_cursor->>'key';
    if p_sort = 'recently-saved' then
      begin
        v_after_time := v_after_key::timestamptz;
      exception when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Unsupported Saved cursor.' using errcode = '22023';
      end;
      if not isfinite(v_after_time) then
        raise exception 'Unsupported Saved cursor.' using errcode = '22023';
      end if;
    end if;
  end if;

  with eligible as (
    select s.id, s.created_at, left(lower(coalesce(display.name, '')), v_name_limit) as name_key,
      jsonb_build_object('id', s.id, 'accountId', s.user_id, 'merchantId', s.merchant_id, 'savedAt', s.created_at,
        'merchant', case when display.name is null then null else jsonb_build_object(
          'id', m.id, 'name', display.name, 'categoryKey', m.category_key,
          'latitude', m.branch_latitude, 'longitude', m.branch_longitude,
          'area', coalesce(m.branch_name, m.city_name), 'image', m.cover_photo_path
        ) end) as entry
    from public.customer_saved s left join public.merchant_public m on m.id = s.merchant_id
    -- An unusable current name withholds listing details, while the saved row remains removable.
    left join lateral (
      select m.trading_name as name
      where length(m.trading_name) <= v_name_limit
        and m.trading_name collate "C" !~ v_control_pattern
        and m.trading_name collate "C" !~ v_blank_name_pattern
    ) display on true
    where s.user_id = v_me and s.kind = 'merchant' and (p_saved_id is null or s.id = p_saved_id)
      and (v_search = '' or position(v_search in lower(coalesce(display.name, ''))) > 0)
  ), ordered as (
    select *, row_number() over(order by
      case when p_sort = 'recently-saved' then created_at end desc,
      case when p_sort = 'name' then name_key end asc,
      case when p_sort = 'recently-saved' then id end desc,
      case when p_sort = 'name' then id end asc) as rank
    from eligible where v_after_id is null
      or (p_sort = 'recently-saved' and (created_at, id) < (v_after_time, v_after_id))
      or (p_sort = 'name' and (name_key, id) > (v_after_key, v_after_id))
  ), page as (select * from ordered where rank <= p_limit)
  select coalesce((select jsonb_agg(entry order by rank) from page), '[]'::jsonb),
    (select count(*)::integer from eligible),
    case when exists(select 1 from ordered where rank > p_limit) then (
      select jsonb_build_object('version', '1', 'accountId', v_me, 'sort', p_sort, 'search', v_search,
        'id', id, 'key', case when p_sort = 'recently-saved' then created_at::text else name_key end)
      from page order by rank desc limit 1
    ) end
  into v_rows, v_total, v_next;
  return jsonb_build_object('contractVersion', '1', 'accountId', v_me,
    'rows', v_rows, 'totalCount', v_total, 'nextCursor', v_next);
end;
$$;

create function public.rpc_saved_remove(p_saved_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_me uuid := auth.uid();
begin
  if not authz.maps_has_real_account() then
    raise exception 'Sign in to change Saved.' using errcode = '42501';
  end if;
  delete from public.customer_saved where id = p_saved_id and user_id = v_me;
  -- Idempotent and deliberately indistinguishable for absent/foreign records.
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.rpc_saved_add(uuid, uuid) from public, anon, service_role;
revoke execute on function public.rpc_my_saved_places(uuid, text, text, jsonb, integer) from public, anon, service_role;
revoke execute on function public.rpc_saved_remove(uuid) from public, anon, service_role;
grant execute on function public.rpc_saved_add(uuid, uuid) to authenticated;
grant execute on function public.rpc_my_saved_places(uuid, text, text, jsonb, integer) to authenticated;
grant execute on function public.rpc_saved_remove(uuid) to authenticated;
insert into public.wiring_audit_exempt(function_name, reason, recorded_in) values
  ('rpc_saved_add', 'Customer saves a public place for their own account; no third-party action.', 'customer_saved'),
  ('rpc_my_saved_places', 'Customer reads their own saved identities and current public merchant facts.', 'read only'),
  ('rpc_saved_remove', 'Customer removes their own saved identity.', 'customer_saved')
on conflict(function_name) do nothing;
