-- Merchants say whether they open on public holidays.
--
-- The holidays already had a table: public.holiday_calendar, added with the
-- settings domain and never filled. It now holds Kenya's national public
-- holidays from December 2026 to December 2027. Eid al-Fitr and Eid al-Adha
-- follow the moon sighting, so their dates are estimates (estimated = true)
-- until they are announced. Correct such a date in place: merchants' answers
-- belong to the row, so they move with it.
--
-- A merchant answers each holiday open or closed, for all branches at once,
-- in merchant_holiday_hours. Closed takes effect in fn_merchant_effective_hours
-- straight after the date overrides, so guests see the business closed that
-- day and app bookings are refused. Open, or no answer, keeps the usual
-- hours. A date override for that day still wins: it is the more specific
-- instruction.
--
-- The calendar is staff-only under its own RLS, so merchants read it through
-- rpc_merchant_holidays and answer through rpc_merchant_holiday_set.

-- ─────────────────────────────────────────────────────────── the calendar

alter table public.holiday_calendar
  add column if not exists estimated boolean not null default false;

comment on column public.holiday_calendar.estimated is
  'True while the date is a forecast. Eid al-Fitr and Eid al-Adha follow the moon sighting and are announced days before: correct the date in place and set this false. Merchants'' answers follow the row, not the date.';

/* When a holiday falls on a Sunday, the Monday after it is a holiday too, so
   those Mondays are rows of their own. Reference data lives in migrations
   because production needs it as well as a local reset. */
insert into public.holiday_calendar (country, date, label, source, estimated) values
  ('Kenya', date '2026-12-12', 'Jamhuri Day',              'national', false),
  ('Kenya', date '2026-12-25', 'Christmas Day',            'national', false),
  ('Kenya', date '2026-12-26', 'Boxing Day',               'national', false),
  ('Kenya', date '2027-01-01', 'New Year''s Day',          'national', false),
  ('Kenya', date '2027-03-10', 'Eid al-Fitr',              'national', true),
  ('Kenya', date '2027-03-26', 'Good Friday',              'national', false),
  ('Kenya', date '2027-03-29', 'Easter Monday',            'national', false),
  ('Kenya', date '2027-05-01', 'Labour Day',               'national', false),
  ('Kenya', date '2027-05-17', 'Eid al-Adha',              'national', true),
  ('Kenya', date '2027-06-01', 'Madaraka Day',             'national', false),
  ('Kenya', date '2027-10-10', 'Mazingira Day',            'national', false),
  ('Kenya', date '2027-10-11', 'Mazingira Day (observed)', 'national', false),
  ('Kenya', date '2027-10-20', 'Mashujaa Day',             'national', false),
  ('Kenya', date '2027-12-12', 'Jamhuri Day',              'national', false),
  ('Kenya', date '2027-12-13', 'Jamhuri Day (observed)',   'national', false),
  ('Kenya', date '2027-12-25', 'Christmas Day',            'national', false),
  ('Kenya', date '2027-12-26', 'Boxing Day',               'national', false),
  ('Kenya', date '2027-12-27', 'Boxing Day (observed)',    'national', false)
on conflict do nothing;

-- ─────────────────────────────────────────────────────────── the answers

create table if not exists public.merchant_holiday_hours (
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  holiday_id uuid not null references public.holiday_calendar (id) on delete cascade,
  /* Open means the usual hours for that weekday, so there is nothing else
     to keep for it. */
  closed boolean not null,
  answered_at timestamptz not null default now(),
  primary key (merchant_id, holiday_id)
);

comment on table public.merchant_holiday_hours is
  'Whether a merchant opens on a public holiday, for every branch. Closed beats the weekly hours in fn_merchant_effective_hours; open, or no row, keeps them. Written only by rpc_merchant_holiday_set.';

alter table public.merchant_holiday_hours enable row level security;

revoke all on public.merchant_holiday_hours from anon, authenticated;
grant select on public.merchant_holiday_hours to authenticated;

create policy merchant_holiday_hours_read on public.merchant_holiday_hours
  for select to authenticated
  using (authz.works_merchant(merchant_id) or authz.is_merchant_member(merchant_id));

-- ──────────────────────────────────────────────────────────────── the RPCs

/* The holidays on the merchant's calendar for the next twelve months, with
   their answer: closed true or false, or null when they have not said. */
create or replace function public.rpc_merchant_holidays(p_merchant_id uuid)
returns table (holiday_id uuid, date date, label text, estimated boolean,
               closed boolean, answered_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_city public.city;
  v_today date;
begin
  if not authz.is_merchant_member(p_merchant_id) and not authz.can_manage_merchants(null) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;

  select c.* into v_city
  from public.merchant m
  join public.city c on c.id = m.city_id
  where m.id = p_merchant_id;
  v_today := (now() at time zone coalesce(v_city.timezone, 'Africa/Nairobi'))::date;

  return query
    select h.id, h.date, h.label, h.estimated, a.closed, a.answered_at
    from public.holiday_calendar h
    left join public.merchant_holiday_hours a
      on a.holiday_id = h.id and a.merchant_id = p_merchant_id
    where (h.city_id = v_city.id or (h.city_id is null and h.country = v_city.country))
      and h.date between v_today and v_today + 365
    order by h.date, h.label;
end;
$$;

/* Open or closed on one holiday. Answering again replaces the answer. */
create or replace function public.rpc_merchant_holiday_set(
  p_merchant_id uuid,
  p_holiday_id uuid,
  p_closed boolean
)
returns public.merchant_holiday_hours
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member boolean := authz.is_merchant_member(p_merchant_id);
  v_city public.city;
  v_holiday public.holiday_calendar;
  v_row public.merchant_holiday_hours;
begin
  if not v_member and not authz.can_manage_merchants(null) then
    raise exception 'Not your business.' using errcode = '42501';
  end if;
  if p_closed is null then
    raise exception 'Say whether you are open or closed that day.' using errcode = '22023';
  end if;

  select c.* into v_city
  from public.merchant m
  join public.city c on c.id = m.city_id
  where m.id = p_merchant_id;

  select h.* into v_holiday
  from public.holiday_calendar h
  where h.id = p_holiday_id
    and (h.city_id = v_city.id or (h.city_id is null and h.country = v_city.country));
  if v_holiday.id is null then
    raise exception 'That holiday is not on your calendar.' using errcode = '22023';
  end if;
  if v_holiday.date < (now() at time zone v_city.timezone)::date then
    raise exception 'That holiday has passed.' using errcode = '22023';
  end if;

  insert into public.merchant_holiday_hours (merchant_id, holiday_id, closed)
  values (p_merchant_id, p_holiday_id, p_closed)
  on conflict (merchant_id, holiday_id)
  do update set closed = excluded.closed, answered_at = now()
  returning * into v_row;

  perform audit.log(
    case when v_member then 'merchant_user' else 'staff' end::public.actor_type,
    'merchants', 'merchant.holiday_hours_set',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('holiday_id', v_holiday.id, 'date', v_holiday.date,
                                  'label', v_holiday.label, 'closed', p_closed));

  return v_row;
end;
$$;

revoke execute on function
  public.rpc_merchant_holidays(uuid),
  public.rpc_merchant_holiday_set(uuid, uuid, boolean)
from public, anon;

grant execute on function
  public.rpc_merchant_holidays(uuid),
  public.rpc_merchant_holiday_set(uuid, uuid, boolean)
to authenticated, service_role;

-- ─────────────────────────────────────────────────────── effective hours

/* The body is 20261207000100's with one step added after the date
   overrides. Same signature, volatility, security definer and search_path;
   `create or replace` keeps the owner and the grants. */
create or replace function public.fn_merchant_effective_hours(p_merchant_id uuid,p_branch_id uuid default null,p_date date default current_date)
returns table (opens time, closes time, closed boolean, source text)
language plpgsql stable security definer set search_path = '' as $$
declare v_merchant public.merchant; v_row record; v_dow integer := extract(isodow from p_date);
  /* Untagged rows number the week like Postgres dow: Sunday = 0. */
  v_sunday_zero integer := extract(dow from p_date);
begin
  select * into v_merchant from public.merchant where id=p_merchant_id;
  if v_merchant.id is null then return; end if;
  if p_branch_id is not null then
    select o.opens,o.closes,o.closed into v_row from public.merchant_hours_override o
      where o.merchant_id=p_merchant_id and o.branch_id=p_branch_id and o.date=p_date;
    if found then return query select v_row.opens,v_row.closes,v_row.closed,'branch override'::text; return; end if;
  end if;
  select o.opens,o.closes,o.closed into v_row from public.merchant_hours_override o
    where o.merchant_id=p_merchant_id and o.branch_id is null and o.date=p_date;
  if found then return query select v_row.opens,v_row.closes,v_row.closed,'merchant override'::text; return; end if;
  /* A public holiday the merchant said they close for. Open, or no answer,
     leaves the day to the steps below. */
  perform 1 from public.merchant_holiday_hours a
    join public.holiday_calendar hc on hc.id=a.holiday_id
    join public.city c on c.id=v_merchant.city_id
    where a.merchant_id=p_merchant_id and a.closed and hc.date=p_date
      and (hc.city_id=c.id or (hc.city_id is null and hc.country=c.country));
  if found then return query select null::time,null::time,true,'holiday'::text; return; end if;
  select e.default_close into v_row from public.city_hours_exception e
    where e.city_id=v_merchant.city_id and e.date=p_date and e.enabled
      and (e.applies_to_categories is null or v_merchant.category::text=any(e.applies_to_categories)) limit 1;
  if found and v_row.default_close is not null then
    return query select h.opens,least(h.closes,v_row.default_close),h.closed,'city exception'::text
      from public.merchant_hours h where h.merchant_id=p_merchant_id and
      ((h.weekday_convention='monday_zero' and h.day_of_week=v_dow-1) or
       (h.weekday_convention is null and h.day_of_week=v_sunday_zero)) limit 1;
    if found then return; end if;
  end if;
  if v_merchant.parent_merchant_id is not null then
    perform 1 from public.merchant_chain_setting where parent_id=v_merchant.parent_merchant_id and shared_hours;
    if found then
      return query select h.opens,h.closes,h.closed,'chain parent'::text from public.merchant_hours h
        where h.merchant_id=v_merchant.parent_merchant_id and
        ((h.weekday_convention='monday_zero' and h.day_of_week=v_dow-1) or
         (h.weekday_convention is null and h.day_of_week=v_sunday_zero)) limit 1;
      if found then return; end if;
    end if;
  end if;
  return query select h.opens,h.closes,h.closed,'weekly'::text from public.merchant_hours h
    where h.merchant_id=p_merchant_id and
    ((h.weekday_convention='monday_zero' and h.day_of_week=v_dow-1) or
     (h.weekday_convention is null and h.day_of_week=v_sunday_zero)) limit 1;
end;
$$;

comment on function public.fn_merchant_effective_hours is
  'The single answer to "is this merchant open". Branch override → merchant override → a public holiday the merchant closes for → city exception → chain parent → weekly. Used by the guest page, checkout, dispatch and the console alike.';
