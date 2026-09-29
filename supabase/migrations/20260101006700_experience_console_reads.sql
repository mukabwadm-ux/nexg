-- What the console reads.
--
-- Three roll-ups the Experiences module draws its screens from. They are
-- functions rather than queries in the page because each one groups and
-- aggregates across four tables, and doing that in TypeScript means
-- shipping every plan of every guest to the server to count them.
--
-- All three are invoker, so RLS decides who sees which city exactly as it
-- would for a direct select. A Mombasa lead calling these gets Mombasa.

/*
 * One row per guest, for the All experiences table.
 *
 * Grouped by the auth user rather than by a guest table, because there is
 * no guest table — an identity here is the anonymous-then-upgraded session
 * that built the day. That is also why the name can be null: somebody who
 * built a day and never sent it has not told us who they are, and the
 * artboard draws exactly that as [Guest name].
 */
create or replace function public.rpc_experience_guests(
  p_city_id uuid default null,
  p_filter text default 'all'
)
returns table (
  user_id uuid,
  guest_name text,
  guest_phone text,
  stay_label text,
  city_name text,
  days integer,
  completed_days integer,
  spent_kes bigint,
  first_day timestamptz,
  last_plan_id uuid,
  last_reference text,
  last_status public.plan_status,
  last_title text,
  last_date date,
  review_id uuid,
  review_rating integer,
  review_status public.review_status,
  review_asked_at timestamptz,
  is_repeat boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select p.*, c.name as city_name
    from public.plan p
    join public.city c on c.id = p.city_id
    where p.user_id is not null
      and (p_city_id is null or p.city_id = p_city_id)
  ),
  latest as (
    select distinct on (user_id) *
    from mine
    order by user_id, created_at desc
  ),
  rolled as (
    select
      m.user_id,
      count(*)::integer as days,
      count(*) filter (where m.status = 'completed')::integer as completed_days,
      coalesce(sum(m.quote_total_kes) filter (
        where m.status in ('paid', 'in_progress', 'completed')), 0)::bigint as spent_kes,
      min(m.created_at) as first_day
    from mine m
    group by m.user_id
  )
  select
    r.user_id,
    l.guest_name,
    l.guest_phone,
    l.stay_label,
    l.city_name,
    r.days,
    r.completed_days,
    r.spent_kes,
    r.first_day,
    l.id,
    l.reference,
    l.status,
    /* The day's own name where it came from a curated one, else its
       reference — never an invented title. */
    coalesce(cd.title, l.reference),
    l.date,
    rv.id,
    rv.rating,
    rv.status,
    rq.sent_at,
    r.days > 1
  from rolled r
  join latest l on l.user_id = r.user_id
  left join public.curated_day cd on cd.id = l.curated_day_id
  left join public.review rv on rv.plan_id = l.id
  left join public.review_request rq on rq.plan_id = l.id
  where case p_filter
    when 'needs_review'  then rv.status = 'received'
    when 'not_asked'     then l.status = 'completed' and rq.id is null
    when 'published'     then rv.status = 'approved'
    when 'repeat'        then r.days > 1
    when 'not_booked'    then r.spent_kes = 0
    else true
  end
  order by l.created_at desc
$$;

grant execute on function public.rpc_experience_guests(uuid, text) to authenticated, service_role;

/*
 * The queue, with the SLA arithmetic done here rather than in the browser.
 *
 * A countdown computed from a due-at the server already knows is one
 * number; computed in the page it is a clock-skew bug waiting for a
 * laptop with the wrong time.
 */
create or replace function public.rpc_experience_queue(p_city_id uuid default null)
returns table (
  id uuid,
  reference text,
  guest_name text,
  stay_label text,
  city_name text,
  title text,
  party_type text,
  party_size integer,
  date date,
  budget_kes bigint,
  estimate_total_kes bigint,
  quote_total_kes bigint,
  moods public.mood[],
  status public.plan_status,
  concierge_name text,
  concierge_id uuid,
  sent_at timestamptz,
  first_reply_due_in_s integer,
  quote_expires_in_s integer,
  first_reply_at timestamptz,
  holds_pending integer,
  blocks_total integer,
  blocks_settled integer,
  flags jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id, p.reference, p.guest_name, p.stay_label, c.name,
    coalesce(cd.title, p.reference), p.party_type, p.party_size, p.date,
    p.budget_kes, p.estimate_total_kes, p.quote_total_kes, p.moods, p.status,
    s.display_name, p.concierge_id, p.sent_at,
    case when p.first_reply_at is null and p.sla_first_reply_due_at is not null
         then extract(epoch from (p.sla_first_reply_due_at - now()))::integer end,
    case when p.status = 'quoted' and p.expires_at is not null
         then extract(epoch from (p.expires_at - now()))::integer end,
    p.first_reply_at,
    (select count(*)::integer from public.plan_block b
     where b.plan_id = p.id and b.hold_status = 'requested'),
    (select count(*)::integer from public.plan_block b
     where b.plan_id = p.id and b.kind <> 'free' and b.included_by is null
       and b.status <> 'removed'),
    (select count(*)::integer from public.plan_block b
     where b.plan_id = p.id and b.kind <> 'free' and b.included_by is null
       and b.status in ('confirmed', 'changed', 'done')),
    p.flags
  from public.plan p
  join public.city c on c.id = p.city_id
  left join public.staff_user s on s.id = p.concierge_id
  left join public.curated_day cd on cd.id = p.curated_day_id
  where p.status <> 'draft'
    and (p_city_id is null or p.city_id = p_city_id)
  order by
    /* Unassigned first, then whoever is closest to a missed promise. */
    p.concierge_id nulls first,
    coalesce(p.sla_first_reply_due_at, p.expires_at, p.sent_at)
$$;

grant execute on function public.rpc_experience_queue(uuid) to authenticated, service_role;

/*
 * The numbers on the tiles. Every one is a count of something real; where
 * there is nothing to count the caller gets null and renders [—], which
 * is not the same as zero and must not be drawn as it.
 */
create or replace function public.rpc_experience_stats(p_city_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select p.* from public.plan p
    where p.user_id is not null and (p_city_id is null or p.city_id = p_city_id)
  ),
  done as (select * from mine where status = 'completed'),
  rv as (
    select r.* from public.review r
    join mine m on m.id = r.plan_id
  )
  select jsonb_build_object(
    'guests', (select count(distinct user_id) from mine),
    'completed_30d', (select count(*) from done where completed_at > now() - interval '30 days'),
    'repeat_guests', (
      select count(*) from (
        select user_id from mine group by user_id having count(*) > 1
      ) x
    ),
    'reviews_to_approve', (select count(*) from rv where status = 'received'),
    'oldest_review_days', (
      select extract(day from now() - min(received_at))::integer
      from rv where status = 'received'
    ),
    'published_reviews', (select count(*) from rv where status = 'approved'),
    /* Null rather than 0.0 when nothing is published: an average of no
       reviews is not zero stars. */
    'average_rating', (
      select round(avg(rating)::numeric, 1) from rv where status = 'approved'
    ),
    'review_rate_pct', (
      select case when count(*) = 0 then null
                  else round(100.0 * count(*) filter (where r.id is not null) / count(*))
             end
      from done d left join public.review r on r.plan_id = d.id
    ),
    'in_queue', (select count(*) from mine where status in
      ('sent', 'confirming', 'quoted', 'changes_requested')),
    'unassigned', (select count(*) from mine where concierge_id is null and status <> 'draft'),
    'live_today', (select count(*) from mine where status in ('paid', 'in_progress')
      and date = current_date),
    'avg_day_value_kes', (
      select round(avg(quote_total_kes)) from mine
      where status in ('paid', 'in_progress', 'completed') and quote_total_kes is not null
    )
  )
$$;

grant execute on function public.rpc_experience_stats(uuid) to authenticated, service_role;
