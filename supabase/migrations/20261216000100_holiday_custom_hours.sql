-- Holidays get custom hours, and a merchant can take a day of their own off.
--
-- Until now a public holiday had two answers: open (the usual weekly hours)
-- or closed. Merchants also open on a holiday with different hours, so an
-- answer can now carry its own opening and closing time.
--
-- A merchant's own holiday (a staff day, a family event) is a date override
-- with a reason, which merchant_hours_override already holds: closed, or
-- open with its own hours. What was missing is a way for the merchant to
-- remove one, so rpc_merchant_hours_override_clear is added.
--
-- Backward compatible: open with no times still means the usual hours, and
-- rpc_merchant_holiday_set keeps its first three arguments, so existing
-- callers work unchanged.

-- ───────────────────────────────────────────────── the answer's own hours

alter table public.merchant_holiday_hours
  add column if not exists opens time,
  add column if not exists closes time;

alter table public.merchant_holiday_hours
  drop constraint if exists merchant_holiday_hours_times;
alter table public.merchant_holiday_hours
  add constraint merchant_holiday_hours_times check (
    (closed and opens is null and closes is null)
    or (not closed and (opens is null) = (closes is null)
        and (opens is null or opens <> closes))
  );

comment on table public.merchant_holiday_hours is
  'Whether a merchant opens on a public holiday, for every branch. Closed beats the weekly hours in fn_merchant_effective_hours; open with opens/closes uses those hours; open without them, or no row, keeps the week. Written only by rpc_merchant_holiday_set.';

comment on column public.merchant_holiday_hours.opens is
  'Opening time that holiday when the merchant keeps custom hours; null means the usual weekly hours. A closing time before the opening time runs past midnight, as in the weekly hours.';

-- ───────────────────────────────────────────────────────────── the list

drop function if exists public.rpc_merchant_holidays(uuid);

create function public.rpc_merchant_holidays(p_merchant_id uuid)
returns table (holiday_id uuid, date date, label text, estimated boolean,
               closed boolean, answered_at timestamptz, opens time, closes time)
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
    select h.id, h.date, h.label, h.estimated, a.closed, a.answered_at, a.opens, a.closes
    from public.holiday_calendar h
    left join public.merchant_holiday_hours a
      on a.holiday_id = h.id and a.merchant_id = p_merchant_id
    where (h.city_id = v_city.id or (h.city_id is null and h.country = v_city.country))
      and h.date between v_today and v_today + 365
    order by h.date, h.label;
end;
$$;

-- ──────────────────────────────────────────────────────────── the answer

drop function if exists public.rpc_merchant_holiday_set(uuid, uuid, boolean);

/* Open (usual hours), open with custom hours, or closed. Answering again
   replaces the answer. */
create function public.rpc_merchant_holiday_set(
  p_merchant_id uuid,
  p_holiday_id uuid,
  p_closed boolean,
  p_opens time default null,
  p_closes time default null
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
  if p_closed then
    p_opens := null;
    p_closes := null;
  elsif (p_opens is null) <> (p_closes is null) then
    raise exception 'Give both an opening and a closing time.' using errcode = '22023';
  elsif p_opens is not null and p_opens = p_closes then
    raise exception 'Opening and closing times cannot be the same.' using errcode = '22023';
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

  insert into public.merchant_holiday_hours (merchant_id, holiday_id, closed, opens, closes)
  values (p_merchant_id, p_holiday_id, p_closed, p_opens, p_closes)
  on conflict (merchant_id, holiday_id)
  do update set closed = excluded.closed, opens = excluded.opens, closes = excluded.closes,
                answered_at = now()
  returning * into v_row;

  perform audit.log(
    case when v_member then 'merchant_user' else 'staff' end::public.actor_type,
    'merchants', 'merchant.holiday_hours_set',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_after => jsonb_build_object('holiday_id', v_holiday.id, 'date', v_holiday.date,
                                  'label', v_holiday.label, 'closed', p_closed,
                                  'opens', p_opens, 'closes', p_closes));

  return v_row;
end;
$$;

revoke execute on function
  public.rpc_merchant_holidays(uuid),
  public.rpc_merchant_holiday_set(uuid, uuid, boolean, time, time)
from public, anon;

grant execute on function
  public.rpc_merchant_holidays(uuid),
  public.rpc_merchant_holiday_set(uuid, uuid, boolean, time, time)
to authenticated, service_role;

-- ────────────────────────────────────────────── removing a day of their own

/* A merchant removes one of their own date overrides: a holiday of theirs,
   or a close-early they no longer want. The day goes back to whatever
   applied before. */
create or replace function public.rpc_merchant_hours_override_clear(
  p_merchant_id uuid,
  p_override_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_merchant boolean;
  v_row public.merchant_hours_override;
begin
  v_is_merchant := exists (
    select 1 from public.merchant_user mu
    where mu.merchant_id = p_merchant_id and mu.user_id = (select auth.uid())
  );
  if not v_is_merchant and not authz.works_merchant(p_merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;

  delete from public.merchant_hours_override o
  where o.id = p_override_id and o.merchant_id = p_merchant_id
  returning * into v_row;
  if v_row.id is null then
    raise exception 'That day is not on your hours.' using errcode = '22023';
  end if;

  perform audit.log(
    case when v_is_merchant then 'merchant_user' else 'staff' end::public.actor_type,
    'merchants', 'merchant.hours_override_cleared',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_before => to_jsonb(v_row));
end;
$$;

revoke execute on function public.rpc_merchant_hours_override_clear(uuid, uuid) from public, anon;
grant execute on function public.rpc_merchant_hours_override_clear(uuid, uuid)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────── effective hours

/* The body is 20261211000100's; the holiday step now also returns custom
   hours. Same signature, volatility, security definer and search_path;
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
  /* A public holiday the merchant closes for, or keeps custom hours on.
     Open with usual hours, or no answer, leaves the day to the steps below. */
  select a.closed,a.opens,a.closes into v_row from public.merchant_holiday_hours a
    join public.holiday_calendar hc on hc.id=a.holiday_id
    join public.city c on c.id=v_merchant.city_id
    where a.merchant_id=p_merchant_id and hc.date=p_date
      and (a.closed or a.opens is not null)
      and (hc.city_id=c.id or (hc.city_id is null and hc.country=c.country))
    order by a.closed desc limit 1;
  if found then
    if v_row.closed then return query select null::time,null::time,true,'holiday'::text; return; end if;
    return query select v_row.opens,v_row.closes,false,'holiday'::text; return;
  end if;
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
  'The single answer to "is this merchant open". Branch override → merchant override → a public holiday the merchant closes for or keeps custom hours on → city exception → chain parent → weekly. Used by the guest page, checkout, dispatch and the console alike.';
