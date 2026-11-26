insert into audit.action_registry(action,module,default_severity,money,description) values
  ('customer.order_rated','orders','notice',false,'Customer rated their own completed order'),
  ('merchant.google_place_id_changed','merchants','notice',false,'Staff changed a branch Google place identifier')
on conflict(action) do nothing;
-- Explore facts. Read source rows, not the unmaintained health snapshots.
-- Public aggregates are gated by the existing publication view.
create view public.merchant_rating_public with (security_barrier = true) as
select r.merchant_id, round(avg(r.stars), 1) as rating_avg, count(*) as rating_count
from public.order_rating r
where r.about in ('order', 'food')
  and exists (select 1 from public.merchant_public m where m.id = r.merchant_id)
group by r.merchant_id having count(*) >= 5;
grant select on public.merchant_rating_public to anon, authenticated;

create function public.rpc_order_rate(p_order_id uuid, p_stars int, p_comment text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_order public."order";
  v_id uuid;
  v_comment text := nullif(btrim(p_comment), '');
begin
  if auth.uid() is null then
    raise exception 'Sign in to rate your order.' using errcode = '42501';
  end if;
  select o.* into v_order from public."order" o
  join public.guest g on g.id = o.guest_id
  where o.id = p_order_id and g.user_id = auth.uid()
  for update of o;
  if not found then
    raise exception 'That order is not yours to rate.' using errcode = '42501';
  end if;
  if v_order.stage <> 'delivered' or v_order.delivered_at is null
     or v_order.delivered_at > now() then
    raise exception 'Rate an order after delivery is complete.' using errcode = '22023';
  end if;
  if p_stars is null or p_stars not between 1 and 5 then
    raise exception 'Stars must be between 1 and 5.' using errcode = '22023';
  end if;
  if length(v_comment) > 500 then
    raise exception 'A rating comment may contain at most 500 characters.' using errcode = '22023';
  end if;
  insert into public.order_rating (order_id, merchant_id, branch_id, rider_id, stars, comment, about)
  values (v_order.id, v_order.merchant_id, v_order.branch_id, v_order.rider_id,
          p_stars, v_comment, 'order')
  on conflict (order_id) do nothing returning id into v_id;
  if v_id is null then
    raise exception 'This order has already been rated.' using errcode = '23505';
  end if;
  perform audit.log('guest'::public.actor_type,'orders','customer.order_rated',
    p_actor_id=>auth.uid(),p_target_type=>'order',p_target_id=>p_order_id,
    p_after=>jsonb_build_object('stars',p_stars));
  return v_id;
end;
$$;
revoke all on function public.rpc_order_rate(uuid, int, text) from public, anon;
grant execute on function public.rpc_order_rate(uuid, int, text) to authenticated;

alter table public.merchant_branch add column google_place_id text
  check (google_place_id is null or
    (length(btrim(google_place_id)) between 1 and 255 and google_place_id = btrim(google_place_id)));
comment on column public.merchant_branch.google_place_id is
  'Google place identifier only. Staff managed; never cache Google reviews or other place data here.';

-- Preserve merchant branch editing while protecting this one staff-managed fact.
create function public.tg_explore_place_id_staff_only()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.google_place_id is not null)
     or (tg_op = 'UPDATE' and new.google_place_id is distinct from old.google_place_id) then
    if not exists (select 1 from public.merchant m where m.id = new.merchant_id
                   and authz.can_manage_merchants(m.city_id)) then
      raise exception 'Only merchant-management staff can set a Google place ID.' using errcode = '42501';
    end if;
    perform audit.log('staff'::public.actor_type,'merchants','merchant.google_place_id_changed',
      p_target_type=>'merchant_branch',p_target_id=>new.id,
      p_after=>jsonb_build_object('has_place_id',new.google_place_id is not null));
  end if;
  return new;
end;
$$;
revoke all on function public.tg_explore_place_id_staff_only() from public, anon, authenticated;
create trigger explore_place_id_staff_only before insert or update on public.merchant_branch
for each row execute function public.tg_explore_place_id_staff_only();

create view public.merchant_traits_public with (security_barrier = true) as
select m.id as merchant_id,
  case m.answers ->> 'has_physical_seating' when 'true' then true when 'yes' then true when 'false' then false when 'no' then false end as has_physical_seating,
  case m.answers ->> 'table_service' when 'true' then true when 'yes' then true when 'false' then false when 'no' then false end as table_service,
  case m.answers ->> 'reservation_system' when 'true' then true when 'yes' then true when 'false' then false when 'no' then false end as reservation_system,
  case m.answers ->> 'with_driver' when 'true' then true when 'yes' then true when 'false' then false when 'no' then false end as with_driver,
  case m.answers ->> 'family_meals' when 'true' then true when 'yes' then true when 'false' then false when 'no' then false end as family_meals,
  case m.answers ->> 'wifi_available' when 'true' then true when 'yes' then true when 'false' then false when 'no' then false end as wifi_available,
  case m.answers ->> 'vegan_menu' when 'true' then true when 'yes' then true when 'false' then false when 'no' then false end as vegan_menu,
  b.google_place_id
from public.merchant m
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where exists (select 1 from public.merchant_public p where p.id = m.id);
grant select on public.merchant_traits_public to anon, authenticated;

-- Rank visible merchants with positive completed work within their city.
-- Ties share a band; the positive percentile is rounded up to thirds.
-- Bookings have no completed_at: use their scheduled end, not mutable updated_at.
create view public.merchant_popularity_public with (security_barrier = true) as
with visible as (
  select m.id, m.city_id from public.merchant m
  where exists (select 1 from public.merchant_public p where p.id = m.id)
), work as (
  select o.merchant_id from public."order" o
  where o.stage = 'delivered' and o.delivered_at between now() - interval '30 days' and now()
  union all
  select b.merchant_id from public.booking b
  where b.status = 'completed' and b.ends_at between now() - interval '30 days' and now()
), volumes as (
  select v.id, v.city_id, count(w.merchant_id) as completed
  from visible v left join work w on w.merchant_id = v.id group by v.id, v.city_id
), ranked as (
  select id, ceil(3 * cume_dist() over (partition by city_id order by completed))::int as band
  from volumes where completed > 0
)
select v.id as merchant_id, coalesce(r.band, 0) as band
from volumes v left join ranked r on r.id = v.id;
grant select on public.merchant_popularity_public to anon, authenticated;

create function public.rpc_my_recent_categories()
returns table(category_key text, subcategory text, times bigint)
language sql stable security definer set search_path = '' as $$
  with recent as (
    select o.merchant_id from public."order" o
    join public.guest g on g.id = o.guest_id
    where g.user_id = auth.uid() and o.placed_at between now() - interval '90 days' and now()
    union all
    select b.merchant_id from public.booking b
    where b.guest_user_id = auth.uid() and b.created_at between now() - interval '90 days' and now()
  )
  select m.category_key::text, m.subcategory::text, count(*)
  from recent r join public.merchant m on m.id = r.merchant_id
  group by m.category_key, m.subcategory
  order by count(*) desc, m.category_key nulls last, m.subcategory nulls last limit 10;
$$;
revoke all on function public.rpc_my_recent_categories() from public, anon;
grant execute on function public.rpc_my_recent_categories() to authenticated;
