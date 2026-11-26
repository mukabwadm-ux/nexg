insert into audit.action_registry(action,module,default_severity,money,description) values
  ('customer.service_rated','merchants','notice',false,'Customer rated their own completed service')
on conflict(action) do nothing;

-- Customer ratings after every completed service. No arbitrary expiry.
-- Orders retain their existing merchant-review storage; bookings and merchant
-- plan stops have their own natural keys. Rider eligibility is intentionally
-- gated until the owner confirms the completion milestone.
create table public.service_rating (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique references public."order"(id) on delete cascade,
  booking_id uuid unique references public.booking(id) on delete cascade,
  plan_block_id uuid unique references public.plan_block(id) on delete cascade,
  merchant_id uuid not null references public.merchant(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text check (comment is null or length(comment) <= 500),
  created_at timestamptz not null default now(),
  check ((order_id is not null)::int + (booking_id is not null)::int + (plan_block_id is not null)::int = 1)
);
alter table public.service_rating enable row level security;
create policy service_rating_read_owner on public.service_rating for select to authenticated
using (user_id = (select auth.uid()));
revoke all on public.service_rating from anon, authenticated;
grant select on public.service_rating to authenticated;
create index service_rating_merchant_idx on public.service_rating(merchant_id);

-- Resolve ownership from trusted source rows, never from caller-supplied
-- merchant IDs, names, phone numbers or a device's local activity history.
create function public.fn_explore_rating_target(p_kind text, p_id uuid)
returns table(merchant_id uuid, completed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to rate your service.' using errcode = '42501';
  end if;
  if p_kind = 'order' then
    return query select o.merchant_id,
      o.stage in ('delivered','disputed','refunded') and o.delivered_at is not null and o.delivered_at <= now()
    from public."order" o join public.guest g on g.id = o.guest_id
    where o.id = p_id and g.user_id = auth.uid();
  elsif p_kind = 'booking' then
    return query select b.merchant_id, b.status = 'completed' and b.ends_at <= now()
    from public.booking b where b.id = p_id and b.guest_user_id = auth.uid();
  elsif p_kind = 'plan_block' then
    return query select b.merchant_id,
      (b.status = 'done' and b.done_at <= now())
      or (p.status = 'completed' and p.completed_at <= now() and b.status in ('confirmed','changed','done'))
    from public.plan_block b join public.plan p on p.id = b.plan_id
    where b.id = p_id and p.user_id = auth.uid() and b.merchant_id is not null;
  else
    raise exception 'This kind of service is not available for rating.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'That service is not yours to rate.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.fn_explore_rating_target(text, uuid) from public, anon, authenticated;

create function public.rpc_my_rating_context(p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_target record; v_rating jsonb;
begin
  select * into v_target from public.fn_explore_rating_target(p_kind,p_id);
  if p_kind = 'order' then
    select jsonb_build_object('stars',r.stars,'comment',r.comment,'created_at',r.created_at)
      into v_rating from public.order_rating r where r.order_id=p_id and r.about in ('order','food');
    if v_rating is null then
      select jsonb_build_object('stars',r.stars,'comment',r.comment,'created_at',r.created_at)
        into v_rating from public.service_rating r where r.order_id=p_id;
    end if;
  else
    select jsonb_build_object('stars',r.stars,'comment',r.comment,'created_at',r.created_at)
      into v_rating from public.service_rating r
      where (p_kind='booking' and r.booking_id=p_id) or (p_kind='plan_block' and r.plan_block_id=p_id);
  end if;
  return jsonb_build_object('kind',p_kind,'id',p_id,
    'eligible',coalesce(v_target.completed,false) and v_rating is null,
    'reason',case when v_rating is not null then 'already_rated'
                  when not coalesce(v_target.completed,false) then 'service_not_completed' end,
    'rating',v_rating,
    'rider',jsonb_build_object('eligible',false,'reason','awaiting_completion_policy'));
end;
$$;
revoke all on function public.rpc_my_rating_context(text,uuid) from public, anon;
grant execute on function public.rpc_my_rating_context(text,uuid) to authenticated;

create function public.rpc_service_rate(p_kind text,p_id uuid,p_stars int,p_comment text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_target record; v_context jsonb; v_comment text := nullif(btrim(p_comment),'');
begin
  select * into v_target from public.fn_explore_rating_target(p_kind,p_id);
  if p_stars is null or p_stars not between 1 and 5 or length(v_comment)>500 then
    raise exception 'Choose 1 to 5 stars and a comment of at most 500 characters.' using errcode='22023';
  end if;
  -- Serialize the natural service key, including requests whose response was
  -- lost. A repeat of the same payload acknowledges the existing result.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('explore-rating:'||p_kind||':'||p_id::text,0));
  v_context := public.rpc_my_rating_context(p_kind,p_id);
  if v_context->'rating' <> 'null'::jsonb then
    if (v_context->'rating'->>'stars')::int = p_stars
       and (v_context->'rating'->>'comment') is not distinct from v_comment then
      return v_context;
    end if;
    raise exception 'This service has already been rated.' using errcode='23505';
  end if;
  if not coalesce((v_context->>'eligible')::boolean,false) then
    raise exception 'This service is not eligible for rating yet.' using errcode='22023';
  end if;
  if p_kind='order' and not exists (select 1 from public.order_rating r where r.order_id=p_id) then
    insert into public.order_rating(order_id,merchant_id,branch_id,rider_id,stars,comment,about)
    select o.id,o.merchant_id,o.branch_id,o.rider_id,p_stars,v_comment,'order'
    from public."order" o where o.id=p_id;
  else
    insert into public.service_rating(order_id,booking_id,plan_block_id,merchant_id,user_id,stars,comment)
    values(case when p_kind='order' then p_id end,case when p_kind='booking' then p_id end,case when p_kind='plan_block' then p_id end,
           v_target.merchant_id,auth.uid(),p_stars,v_comment);
  end if;
  perform audit.log('guest'::public.actor_type,'merchants','customer.service_rated',
    p_actor_id=>auth.uid(),p_target_type=>p_kind,p_target_id=>p_id,
    p_after=>jsonb_build_object('stars',p_stars));
  return public.rpc_my_rating_context(p_kind,p_id);
end;
$$;
revoke all on function public.rpc_service_rate(text,uuid,int,text) from public,anon;
grant execute on function public.rpc_service_rate(text,uuid,int,text) to authenticated;

-- Service scores contribute to merchant quality, never rider feedback.
create or replace view public.merchant_rating_public with (security_barrier = true) as
select r.merchant_id, round(avg(r.stars),1) as rating_avg, count(*) as rating_count
from (
  select merchant_id,stars from public.order_rating where about in ('order','food')
  union all select merchant_id,stars from public.service_rating
) r
where exists(select 1 from public.merchant_public m where m.id=r.merchant_id)
group by r.merchant_id having count(*)>=5;


-- Actual completed merchant stops for the customer's Activity review flow.
-- No local/draft itinerary entry can enter this feed.
create function public.rpc_my_completed_rating_stops(
  p_before timestamptz default null, p_before_id uuid default null, p_limit int default 100
)
returns table(id uuid,merchant_id uuid,title text,completed_at timestamptz,rating_context jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in to read your services.' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100
     or (p_before is null) <> (p_before_id is null) then
    raise exception 'Invalid completed-service cursor or limit.' using errcode='22023';
  end if;
  return query
  with completed as (
    select b.id,b.merchant_id,b.title_snapshot as title,
      date_trunc('milliseconds',case when b.status='done' and b.done_at<=now() then b.done_at else p.completed_at end) as at
    from public.plan_block b join public.plan p on p.id=b.plan_id
    where p.user_id=auth.uid() and b.merchant_id is not null
      and ((b.status='done' and b.done_at<=now()) or
           (p.status='completed' and p.completed_at<=now() and b.status in ('confirmed','changed','done')))
  )
  select c.id,c.merchant_id,c.title,c.at,public.rpc_my_rating_context('plan_block',c.id)
  from completed c
  where p_before is null or (c.at,c.id)<(p_before,p_before_id)
  order by c.at desc,c.id desc limit p_limit;
end;
$$;
revoke all on function public.rpc_my_completed_rating_stops(timestamptz,uuid,int) from public,anon;
grant execute on function public.rpc_my_completed_rating_stops(timestamptz,uuid,int) to authenticated;
