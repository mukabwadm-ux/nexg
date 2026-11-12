-- Staff keep the public holiday calendar from Settings → Cities.
--
-- holiday_calendar has been readable by staff and writable by nobody, so an
-- Eid date (seeded as an estimate) could only be confirmed, a gazetted
-- holiday added, or next year's list loaded with SQL by hand. Three RPCs
-- give the console a way to do it:
--
--   rpc_holiday_calendar(city)   the holidays that apply to a city from today
--                                on, its own and its country's, with how many
--                                merchants answered closed and open
--   rpc_holiday_save(...)        add one, or change a date, a name or whether
--                                the date is still an estimate
--   rpc_holiday_remove(holiday)  take one off; merchants' answers go with it
--
-- Writes take the same permission as the city settings beside them:
-- settings.fn_may_edit('cities'). A date is corrected in place, so the
-- merchants' answers, which belong to the row, follow it. Every write is in
-- the audit log under module 'settings'. No message contains a colon: the
-- console's actions strip everything up to the first one.

create or replace function public.rpc_holiday_calendar(p_city_id uuid)
returns table (holiday_id uuid, date date, label text, scope text, estimated boolean,
               source text, closed_count integer, open_count integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_city public.city;
begin
  if authz.staff_id() is null then
    raise exception 'Staff only.' using errcode = '42501';
  end if;
  select * into v_city from public.city where id = p_city_id;
  if v_city.id is null then
    raise exception 'There is no such city.' using errcode = '22023';
  end if;

  return query
    select h.id, h.date, h.label,
           case when h.city_id is null then 'country' else 'city' end,
           h.estimated, h.source,
           (count(a.holiday_id) filter (where a.closed))::integer,
           (count(a.holiday_id) filter (where not a.closed))::integer
    from public.holiday_calendar h
    left join public.merchant_holiday_hours a on a.holiday_id = h.id
    where (h.city_id = v_city.id or (h.city_id is null and h.country = v_city.country))
      and h.date >= (now() at time zone v_city.timezone)::date
    group by h.id
    order by h.date, h.label;
end;
$$;

/* Add (no p_holiday_id) or change one holiday. A new holiday applies to
   the whole country of p_city_id, or to that city alone; an existing one
   keeps its scope, and p_city_id and p_country_wide are then ignored. */
create or replace function public.rpc_holiday_save(
  p_date date,
  p_label text,
  p_estimated boolean default false,
  p_holiday_id uuid default null,
  p_city_id uuid default null,
  p_country_wide boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_label text := nullif(trim(coalesce(p_label, '')), '');
  v_city public.city;
  v_before public.holiday_calendar;
  v_after public.holiday_calendar;
  v_tz text;
begin
  if v_me is null or not settings.fn_may_edit('cities') then
    raise exception 'Only staff who edit city settings can change the holiday calendar.'
      using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'Pick a date.' using errcode = '22023';
  end if;
  if v_label is null then
    raise exception 'Give the holiday a name.' using errcode = '22023';
  end if;
  if char_length(v_label) > 60 then
    raise exception 'Keep the name to 60 characters.' using errcode = '22023';
  end if;

  if p_holiday_id is null then
    select * into v_city from public.city where id = p_city_id;
    if v_city.id is null then
      raise exception 'Pick a city.' using errcode = '22023';
    end if;
    v_tz := v_city.timezone;
  else
    select * into v_before from public.holiday_calendar where id = p_holiday_id for update;
    if v_before.id is null then
      raise exception 'That holiday is not on the calendar.' using errcode = '22023';
    end if;
    select c.timezone into v_tz from public.city c
    where c.id = v_before.city_id or (v_before.city_id is null and c.country = v_before.country)
    order by (c.id = v_before.city_id) desc nulls last
    limit 1;
  end if;
  if p_date < (now() at time zone coalesce(v_tz, 'Africa/Nairobi'))::date then
    raise exception 'Pick a date from today on.' using errcode = '22023';
  end if;

  begin
    if p_holiday_id is null then
      insert into public.holiday_calendar (city_id, country, date, label, source, estimated, created_by)
      values (case when coalesce(p_country_wide, true) then null else v_city.id end,
              case when coalesce(p_country_wide, true) then v_city.country end,
              p_date, v_label, 'manual', coalesce(p_estimated, false), v_me)
      returning * into v_after;
    else
      update public.holiday_calendar
      set date = p_date, label = v_label, estimated = coalesce(p_estimated, false)
      where id = p_holiday_id
      returning * into v_after;
    end if;
  exception when unique_violation then
    raise exception 'There is already a holiday on that date.' using errcode = '23505';
  end;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'settings',
    p_action => case when p_holiday_id is null then 'holiday.added' else 'holiday.changed' end,
    p_actor_id => v_me, p_target_type => 'holiday', p_target_id => v_after.id,
    p_target_label => v_after.label,
    p_before => case when p_holiday_id is null then null else to_jsonb(v_before) end,
    p_after => to_jsonb(v_after));

  return jsonb_build_object(
    'ok', true, 'id', v_after.id,
    'note', case when p_holiday_id is null then 'Added. Merchants see it on their hours page.'
                 else 'Saved. Merchants'' answers stay with it.' end);
end;
$$;

create or replace function public.rpc_holiday_remove(p_holiday_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_before public.holiday_calendar;
  v_answers integer;
begin
  if v_me is null or not settings.fn_may_edit('cities') then
    raise exception 'Only staff who edit city settings can change the holiday calendar.'
      using errcode = '42501';
  end if;
  select * into v_before from public.holiday_calendar where id = p_holiday_id for update;
  if v_before.id is null then
    raise exception 'That holiday is not on the calendar.' using errcode = '22023';
  end if;
  select count(*) into v_answers from public.merchant_holiday_hours where holiday_id = p_holiday_id;

  delete from public.holiday_calendar where id = p_holiday_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'settings',
    p_action => 'holiday.removed', p_actor_id => v_me,
    p_target_type => 'holiday', p_target_id => v_before.id, p_target_label => v_before.label,
    p_before => to_jsonb(v_before) || jsonb_build_object('merchant_answers', v_answers));

  return jsonb_build_object(
    'ok', true,
    'note', case v_answers
              when 0 then 'Removed.'
              when 1 then 'Removed, with the one merchant answer it had.'
              else format('Removed, with the %s merchant answers it had.', v_answers) end);
end;
$$;

revoke execute on function
  public.rpc_holiday_calendar(uuid),
  public.rpc_holiday_save(date, text, boolean, uuid, uuid, boolean),
  public.rpc_holiday_remove(uuid)
from public, anon;

grant execute on function
  public.rpc_holiday_calendar(uuid),
  public.rpc_holiday_save(date, text, boolean, uuid, uuid, boolean),
  public.rpc_holiday_remove(uuid)
to authenticated, service_role;
