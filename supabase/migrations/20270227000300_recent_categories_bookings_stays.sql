-- Recent categories count bookings and stays too (R8 follow-up, owner 23 Nov
-- 2026).
--
-- rpc_my_recent_categories (20270227000100) counted only orders. It now also
-- counts, for the signed-in caller:
--   * bookings made on the website (public.booking, by guest_user_id), under
--     the merchant's category, unless cancelled or a staff block;
--   * bookings made in the apps through the booking engine
--     (public.customer_engine_booking, by user_id), under the merchant's
--     category, unless cancelled or forgotten;
--   * stays (public.stay, by guest_user_id), under the category 'stays',
--     unless cancelled or a host block.
-- All within the last 180 days.
--
-- The answer keeps its keys and adds new ones:
--   { category, last_at, count, orders, bookings, stays, last_ordered_at }
-- where last_at and count cover everything, orders, bookings and stays are
-- the counts by kind, and last_ordered_at is the newest order's time (null
-- when the category has only bookings or stays). Most recent first.
--
-- Rollback: re-run rpc_my_recent_categories from 20270227000100.

create or replace function public.rpc_my_recent_categories(p_limit integer default 5)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  activity as (
    select m.category::text as category, o.placed_at as at, 'order'::text as kind
      from public.order o
      join public.guest g on g.id = o.guest_id
      join public.merchant m on m.id = o.merchant_id, me
     where g.user_id = me.uid
       and o.placed_at > now() - interval '180 days'
       and o.stage <> 'cancelled'
    union all
    select m.category::text, b.created_at, 'booking'
      from public.booking b
      join public.merchant m on m.id = b.merchant_id, me
     where b.guest_user_id = me.uid
       and b.created_at > now() - interval '180 days'
       and b.status not in ('cancelled', 'blocked')
    union all
    select m.category::text, e.created_at, 'booking'
      from public.customer_engine_booking e
      join public.merchant m on m.id = e.merchant_id, me
     where e.user_id = me.uid
       and e.created_at > now() - interval '180 days'
       and coalesce(e.status, '') <> 'cancelled'
       and e.forgotten_at is null
    union all
    select 'stays', s.created_at, 'stay'
      from public.stay s, me
     where s.guest_user_id = me.uid
       and s.created_at > now() - interval '180 days'
       and s.status not in ('cancelled', 'blocked')
  ),
  grouped as (
    select category,
           max(at) as last_at,
           count(*)::int as n,
           (count(*) filter (where kind = 'order'))::int as orders,
           (count(*) filter (where kind = 'booking'))::int as bookings,
           (count(*) filter (where kind = 'stay'))::int as stays,
           max(at) filter (where kind = 'order') as last_ordered_at
      from activity, me
     where me.uid is not null
     group by category
     order by max(at) desc
     limit least(greatest(coalesce(p_limit, 5), 1), 20)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'category', category, 'last_at', last_at, 'count', n,
           'orders', orders, 'bookings', bookings, 'stays', stays,
           'last_ordered_at', last_ordered_at)
           order by last_at desc), '[]'::jsonb)
    from grouped;
$$;

revoke execute on function public.rpc_my_recent_categories(integer) from public, anon;
grant execute on function public.rpc_my_recent_categories(integer) to authenticated;
