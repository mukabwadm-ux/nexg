-- Merchant facts the apps asked for (R8, shared services; owner 23 Nov 2026:
-- "lets get to work with R8 then R9", on the plan's defaults).
--
-- 1. merchant_traits_public: for each listed shop, short traits the apps show
--    on a card, and a popularity band from 0 to 3. Worked out from what NexG
--    already holds; no raw counts are exposed. A separate view, so the
--    existing merchant_public (which langs4u's unapplied migrations change)
--    is not touched.
--      traits:
--        pay_on_delivery     the shop takes payment on delivery
--        open_late           the shop has late-night hours
--        own_riders          the shop delivers with its own riders
--        new                 live for less than 30 days
--        top_rated           4.5 stars or more from at least 10 NexG ratings
--        vegetarian_options, vegan_options, halal_options
--                            at least one item on sale carries the label
--        alcohol             licensed, with age-restricted items on sale
--      popularity_band, from paid orders in the last 30 days:
--        0 fewer than 5, 1 for 5 to 19, 2 for 20 to 59, 3 for 60 or more.
-- 2. merchant_branch_place: a branch's Google place ID, for staff and the
--    server only (matching branches to maps). Set with
--    rpc_staff_branch_place_set by staff who manage merchants in the
--    branch's city; audited.
-- 3. rpc_my_recent_categories(limit): the signed-in customer's categories from
--    their own orders in the last 180 days, most recent first, with how many
--    orders. Guests' temporary sessions included. Only the caller's orders.
--
-- Rollback:
--   drop view if exists public.merchant_traits_public;
--   drop function if exists public.fn_merchant_sells_alcohol(uuid);
--   drop function if exists public.rpc_my_recent_categories(integer);
--   drop function if exists public.rpc_staff_branch_place_set(uuid, text);
--   drop table if exists public.merchant_branch_place;
--   delete from audit.action_registry where action = 'merchant.branch_place_set';

-- ── 1. Traits and popularity ───────────────────────────────────────────────

/* Licensed and selling age-restricted items: read-only, for the view below
   (a view's functions run as its caller, who may not call the licence check). */
create or replace function public.fn_merchant_sells_alcohol(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.catalogue_item i
                  where i.merchant_id = p_merchant_id and i.available and i.kind = 'buy'
                    and coalesce(i.age_restricted, false))
     and public.fn_merchant_liquor_licensed(p_merchant_id);
$$;

revoke execute on function public.fn_merchant_sells_alcohol(uuid) from public;
grant execute on function public.fn_merchant_sells_alcohol(uuid) to anon, authenticated;

create or replace view public.merchant_traits_public
with (security_invoker = false) as
select
  m.id as merchant_id,
  array_remove(array[
    case when m.pay_on_delivery then 'pay_on_delivery' end,
    case when m.late_night_until is not null then 'open_late' end,
    case when m.has_own_riders then 'own_riders' end,
    case when m.went_live_at > now() - interval '30 days' then 'new' end,
    case when r.n >= 10 and r.avg_stars >= 4.5 then 'top_rated' end,
    case when d.labels @> array['vegetarian'] then 'vegetarian_options' end,
    case when d.labels @> array['vegan'] then 'vegan_options' end,
    case when d.labels @> array['halal'] then 'halal_options' end,
    case when public.fn_merchant_sells_alcohol(m.id) then 'alcohol' end
  ], null)::text[] as traits,
  (case
     when o.n >= 60 then 3
     when o.n >= 20 then 2
     when o.n >= 5 then 1
     else 0
   end)::smallint as popularity_band
from public.merchant m
left join lateral (
  select count(*) as n, avg(rt.stars) as avg_stars
    from public.order_rating rt
   where rt.merchant_id = m.id
) r on true
left join lateral (
  select coalesce(array_agg(distinct l), '{}') as labels
    from public.catalogue_item i
    left join lateral unnest(i.dietary_labels) l on true
   where i.merchant_id = m.id and i.available and i.kind = 'buy'
) d on true
left join lateral (
  select count(*) as n
    from public.order od
   where od.merchant_id = m.id
     and od.placed_at > now() - interval '30 days'
     and od.payment_status in ('paid', 'collected')
) o on true
where m.status = 'live' and m.explore_visible and m.deleted_at is null;

comment on view public.merchant_traits_public is
  'R8: traits for a shop card and a popularity band 0-3 (paid orders in 30 days: <5, 5-19, 20-59, 60+). '
  'Listed shops only; no raw counts.';

revoke all on public.merchant_traits_public from public, anon, authenticated;
grant select on public.merchant_traits_public to anon, authenticated;

-- ── 2. A branch's Google place ID, staff and server only ──────────────────

create table public.merchant_branch_place (
  branch_id       uuid primary key references public.merchant_branch (id) on delete cascade,
  google_place_id text not null,
  set_by          uuid references public.staff_user (id) on delete set null,
  set_at          timestamptz not null default now(),
  constraint merchant_branch_place_id_shape
    check (google_place_id ~ '^[A-Za-z0-9_-]{10,255}$')
);

comment on table public.merchant_branch_place is
  'R8: a branch''s Google place ID, for matching branches to maps. Staff and the server only.';

alter table public.merchant_branch_place enable row level security;
revoke all on public.merchant_branch_place from public, anon, authenticated;
grant select on public.merchant_branch_place to authenticated;
create policy merchant_branch_place_staff_read on public.merchant_branch_place
  for select to authenticated
  using (exists (select 1 from public.merchant_branch b
                  join public.merchant m on m.id = b.merchant_id
                 where b.id = branch_id and authz.can_manage_merchants(m.city_id)));

insert into audit.action_registry (action, module, default_severity, description) values
  ('merchant.branch_place_set', 'merchants', 'info', 'Staff set or cleared a branch''s Google place ID')
on conflict (action) do nothing;

/* Set a branch's place ID, or clear it with null or ''. */
create or replace function public.rpc_staff_branch_place_set(p_branch_id uuid, p_place_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_city uuid;
  v_merchant uuid;
  v_staff uuid := authz.staff_id();
  v_place text := nullif(trim(coalesce(p_place_id, '')), '');
  v_before text;
begin
  select m.city_id, m.id into v_city, v_merchant
    from public.merchant_branch b join public.merchant m on m.id = b.merchant_id
   where b.id = p_branch_id;
  if not found then
    raise exception 'No such branch.' using errcode = 'P0002';
  end if;
  if v_staff is null or not authz.can_manage_merchants(v_city) then
    raise exception 'Only staff who manage merchants in this city can set a place ID.'
      using errcode = '42501';
  end if;
  if v_place is not null and v_place !~ '^[A-Za-z0-9_-]{10,255}$' then
    raise exception 'That does not look like a Google place ID.' using errcode = '22023';
  end if;

  select google_place_id into v_before from public.merchant_branch_place where branch_id = p_branch_id;
  if v_place is null then
    delete from public.merchant_branch_place where branch_id = p_branch_id;
  else
    insert into public.merchant_branch_place (branch_id, google_place_id, set_by, set_at)
    values (p_branch_id, v_place, v_staff, now())
    on conflict (branch_id) do update
      set google_place_id = excluded.google_place_id, set_by = excluded.set_by, set_at = excluded.set_at;
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_actor_id => v_staff,
    p_module => 'merchants', p_action => 'merchant.branch_place_set',
    p_target_type => 'merchant_branch', p_target_id => p_branch_id,
    p_city_id => v_city,
    p_before => jsonb_build_object('google_place_id', v_before),
    p_after => jsonb_build_object('google_place_id', v_place));

  return jsonb_build_object('ok', true, 'branch_id', p_branch_id, 'google_place_id', v_place);
end;
$$;

revoke execute on function public.rpc_staff_branch_place_set(uuid, text) from public, anon;
grant execute on function public.rpc_staff_branch_place_set(uuid, text) to authenticated;

-- ── 3. The customer's recent categories ────────────────────────────────────

create or replace function public.rpc_my_recent_categories(p_limit integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'category', c.category, 'last_ordered_at', c.last_at, 'orders', c.n)
           order by c.last_at desc), '[]'::jsonb)
    from (
      select m.category::text as category, max(o.placed_at) as last_at, count(*)::int as n
        from public.order o
        join public.guest g on g.id = o.guest_id
        join public.merchant m on m.id = o.merchant_id
       where g.user_id = (select auth.uid())
         and (select auth.uid()) is not null
         and o.placed_at > now() - interval '180 days'
         and o.stage <> 'cancelled'
       group by m.category
       order by max(o.placed_at) desc
       limit least(greatest(coalesce(p_limit, 5), 1), 20)
    ) c;
$$;

revoke execute on function public.rpc_my_recent_categories(integer) from public, anon;
grant execute on function public.rpc_my_recent_categories(integer) to authenticated;
