-- Stays › Reports: scheduled reports and saved reports (26 Nov 2026).
--
-- What this adds:
--
-- 1. stays_report_schedule: a stays report emailed to staff every week (each
--    Monday, for the week before) or every month (on the 1st, for the month
--    before). Recipients are staff users, never free email addresses, and
--    each must reach the Hotels module (the email links to the console).
-- 2. stays_report_saved: a report's settings kept under a name (report,
--    city, period preset or fixed dates), private to its owner or shared
--    with everyone who reaches Hotels.
--    Both tables are staff-only: RLS on, no policies, reached through the
--    RPCs below.
-- 3. stays_report_run.schedule_id / emailed_to: a scheduled email is logged
--    in the report log like an export, with the schedule that sent it.
-- 4. RPCs: rpc_console_stays_report_plans (reader, authz.reaches_module
--    ('hotels')); rpc_console_stays_report_schedule_save / _set (pause,
--    resume, delete) and rpc_console_stays_report_saved_save / _delete.
--    Anyone who reaches Hotels may add one; changing or deleting it takes
--    authz.works_hospitality(null) or being the one who added it. Every
--    write is audited.
-- 5. cron_stays_report_schedules(): daily at 05:00 Africa/Nairobi (02:00
--    UTC), emails each due schedule's recipients a link to the console
--    export for the period with two summary rows (bookings, booking value),
--    logs the run and moves next_run_at on. Template staff_stays_report
--    (route staff_alerts). Emails carry a link, never a file.
--
-- Rollback: select cron.unschedule('stays-report-schedules'); drop the
-- functions below; alter table public.stays_report_run drop column
-- schedule_id, drop column emailed_to; drop table public.stays_report_saved,
-- public.stays_report_schedule; re-create rpc_console_stays_report_runs from
-- 20270329000100; delete the five stays_report.* action_registry rows added
-- here.

-- ═══════════════════════════════════════════════════════════════ 0. audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('stays_report.schedule_saved', 'hotels', 'info', false, 'Staff added or changed a scheduled stays report'),
  ('stays_report.schedule_changed', 'hotels', 'info', false, 'Staff paused, resumed or deleted a scheduled stays report'),
  ('stays_report.saved', 'hotels', 'info', false, 'Staff saved a stays report''s settings'),
  ('stays_report.saved_deleted', 'hotels', 'info', false, 'Staff deleted a saved stays report'),
  ('stays_report.emailed', 'hotels', 'info', false, 'A scheduled stays report was emailed to staff')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════════ 1. tables

create table if not exists public.stays_report_schedule (
  id uuid primary key default gen_random_uuid(),
  report text not null check (report in ('bookings', 'revenue', 'occupancy', 'hosts', 'managers',
                                         'units', 'guests', 'concierge', 'reviews', 'cases')),
  city_id uuid references public.city (id) on delete cascade,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  recipients uuid[] not null check (cardinality(recipients) between 1 and 20),
  active boolean not null default true,
  next_run_at timestamptz not null,
  last_sent_at timestamptz,
  last_error text,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stays_report_schedule_due_idx
  on public.stays_report_schedule (next_run_at) where active;
alter table public.stays_report_schedule enable row level security;
comment on table public.stays_report_schedule is
  'Stays reports emailed to staff every week or month. Staff only, through the RPCs.';

create table if not exists public.stays_report_saved (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  report text not null check (report in ('bookings', 'revenue', 'occupancy', 'hosts', 'managers',
                                         'units', 'guests', 'concierge', 'reviews', 'cases')),
  city_id uuid references public.city (id) on delete cascade,
  period text not null check (period in ('this_month', 'last_month', 'last_7', 'last_30', 'custom')),
  from_date date,
  to_date date,
  owner_id uuid not null references public.staff_user (id) on delete cascade,
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stays_report_saved_custom_dates check (
    (period = 'custom') = (from_date is not null and to_date is not null)
    and (from_date is null or (from_date <= to_date and to_date - from_date <= 400)))
);
create index if not exists stays_report_saved_owner_idx on public.stays_report_saved (owner_id);
alter table public.stays_report_saved enable row level security;
comment on table public.stays_report_saved is
  'A stays report''s settings kept under a name; private to its owner unless shared. Staff only.';

revoke all on public.stays_report_schedule, public.stays_report_saved from public, anon, authenticated;

alter table public.stays_report_run
  add column if not exists schedule_id uuid references public.stays_report_schedule (id) on delete set null,
  add column if not exists emailed_to integer;

-- ═══════════════════════════════════════════════════════════════ 2. helpers

/* The report's title as the library shows it (lib/stays-module.ts REPORTS). */
create or replace function public.fn_stays_report_title(p_report text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_report
    when 'bookings' then 'Bookings Report'
    when 'revenue' then 'Revenue Report'
    when 'occupancy' then 'Occupancy Report'
    when 'hosts' then 'Host Report'
    when 'managers' then 'Property Manager Report'
    when 'units' then 'Building & Units Report'
    when 'guests' then 'Guest Report'
    when 'concierge' then 'Concierge & Services Report'
    when 'reviews' then 'Reviews Report'
    when 'cases' then 'Incidents & Disputes Report'
    else p_report end
$$;

/* Whether a staff user may receive a stays report: active and reaching Hotels. */
create or replace function public.fn_stays_staff_reads_reports(p_staff_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    join public.staff_user su on su.id = rg.staff_user_id
    join public.role_module_access a on a.role_key = r.key
    where su.id = p_staff_id
      and su.status = 'active'
      and rg.revoked_at is null
      and (rg.expires_at is null or rg.expires_at > now())
      and a.module_key = 'hotels'
      and a.level <> 'none')
$$;

/* The next send after a moment: Monday 05:00 (weekly) or the 1st at 05:00 (monthly), Nairobi time. */
create or replace function public.fn_stays_report_next_run(p_frequency text, p_after timestamptz)
returns timestamptz
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_local timestamp := p_after at time zone 'Africa/Nairobi';
  v_next timestamp;
begin
  if p_frequency = 'weekly' then
    v_next := date_trunc('week', v_local) + interval '5 hours';
    if v_next <= v_local then v_next := v_next + interval '7 days'; end if;
  elsif p_frequency = 'monthly' then
    v_next := date_trunc('month', v_local) + interval '5 hours';
    if v_next <= v_local then v_next := (date_trunc('month', v_local) + interval '1 month') + interval '5 hours'; end if;
  else
    raise exception 'Choose weekly or monthly.' using errcode = '22023';
  end if;
  return v_next at time zone 'Africa/Nairobi';
end;
$$;

/* The period a send covers: the week (Monday–Sunday) or the month before the day it runs. */
create or replace function public.fn_stays_report_send_period(p_frequency text, p_day date)
returns table (period_from date, period_to date)
language sql
immutable
set search_path = ''
as $$
  select case when p_frequency = 'weekly' then date_trunc('week', p_day)::date - 7
              else (date_trunc('month', p_day) - interval '1 month')::date end,
         case when p_frequency = 'weekly' then date_trunc('week', p_day)::date - 1
              else date_trunc('month', p_day)::date - 1 end
$$;

/* Recipients checked: staff users who reach Hotels, no repeats, 1 to 20. */
create or replace function public.fn_stays_report_recipients(p_value jsonb)
returns uuid[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_bad uuid;
begin
  if p_value is null or jsonb_typeof(p_value) <> 'array' then
    raise exception 'Choose who gets the report.' using errcode = '23514';
  end if;
  begin
    select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(p_value) x;
  exception when invalid_text_representation then
    raise exception 'Recipients are staff users, not email addresses.' using errcode = '22023';
  end;
  if coalesce(cardinality(v_ids), 0) = 0 then
    raise exception 'Choose who gets the report.' using errcode = '23514';
  end if;
  if cardinality(v_ids) > 20 then
    raise exception 'Twenty recipients at most.' using errcode = '23514';
  end if;
  select r into v_bad from unnest(v_ids) r where not public.fn_stays_staff_reads_reports(r) limit 1;
  if v_bad is not null then
    raise exception 'Every recipient must be active staff who can open Stays.' using errcode = '23514';
  end if;
  return v_ids;
end;
$$;

revoke all on function
  public.fn_stays_report_title(text),
  public.fn_stays_staff_reads_reports(uuid),
  public.fn_stays_report_next_run(text, timestamptz),
  public.fn_stays_report_send_period(text, date),
  public.fn_stays_report_recipients(jsonb)
from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ 3. reader

/* Scheduled and saved reports, and the staff a schedule may go to. */
create or replace function public.rpc_console_stays_report_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_ops boolean;
begin
  perform public.fn_stays_reader_gate();
  v_me := authz.staff_id();
  v_ops := authz.works_hospitality(null);
  return jsonb_build_object(
    'schedules', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
        select s.id, s.report, s.city_id, c.name as city_name, s.frequency, s.active, s.next_run_at,
               s.last_sent_at, s.last_error, s.created_at, cb.display_name as created_by_name,
               coalesce(v_ops or s.created_by = v_me, false) as can_change,
               (select coalesce(jsonb_agg(jsonb_build_object('id', su.id, 'name', su.display_name,
                         'active', su.status = 'active') order by su.display_name), '[]'::jsonb)
                  from public.staff_user su where su.id = any (s.recipients)) as recipients
        from public.stays_report_schedule s
        left join public.city c on c.id = s.city_id
        left join public.staff_user cb on cb.id = s.created_by) x),
    'saved', (select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]'::jsonb) from (
        select v.id, v.name, v.report, v.city_id, c.name as city_name, v.period, v.from_date, v.to_date,
               v.shared, v.created_at, v.updated_at, o.display_name as owner_name,
               coalesce(v.owner_id = v_me, false) as mine,
               coalesce(v_ops or v.owner_id = v_me, false) as can_change
        from public.stays_report_saved v
        left join public.city c on c.id = v.city_id
        left join public.staff_user o on o.id = v.owner_id
        where v.owner_id = v_me or v.shared) x),
    'recipients', (select coalesce(jsonb_agg(jsonb_build_object('id', su.id, 'name', su.display_name,
                     'email', su.email) order by su.display_name), '[]'::jsonb)
                   from public.staff_user su where public.fn_stays_staff_reads_reports(su.id)));
end;
$$;

/* Reports: exports staff ran and scheduled emails, newest first (from 20270329000100). */
create or replace function public.rpc_console_stays_report_runs(p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_stays_reader_gate();
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.generated_at desc), '[]'::jsonb) from (
    select r.id, r.report, r.period_from, r.period_to, r.rows_exported, r.generated_at,
           case when r.schedule_id is not null or r.emailed_to is not null
                then 'Scheduled email' else su.display_name end as generated_by_name,
           r.schedule_id, r.emailed_to
    from public.stays_report_run r left join public.staff_user su on su.id = r.generated_by
    order by r.generated_at desc limit least(greatest(coalesce(p_limit, 10), 1), 100)) x);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 4. writers

/* Add or change a scheduled report. p: id?, report, city_id?, frequency, recipients[]. */
create or replace function public.rpc_console_stays_report_schedule_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_before public.stays_report_schedule;
  v_row public.stays_report_schedule;
  v_report text := nullif(btrim(coalesce(p ->> 'report', '')), '');
  v_city uuid := nullif(p ->> 'city_id', '')::uuid;
  v_freq text := coalesce(nullif(p ->> 'frequency', ''), 'weekly');
  v_recipients uuid[];
begin
  perform public.fn_stays_reader_gate();
  v_me := authz.staff_id();
  if v_report is null or v_report not in ('bookings', 'revenue', 'occupancy', 'hosts', 'managers',
                                          'units', 'guests', 'concierge', 'reviews', 'cases') then
    raise exception 'Choose a report.' using errcode = '22023';
  end if;
  if v_freq not in ('weekly', 'monthly') then
    raise exception 'Choose weekly or monthly.' using errcode = '22023';
  end if;
  if v_city is not null and not exists (select 1 from public.city where id = v_city) then
    raise exception 'That city does not exist.' using errcode = '22023';
  end if;
  v_recipients := public.fn_stays_report_recipients(p -> 'recipients');

  if v_id is null then
    insert into public.stays_report_schedule (report, city_id, frequency, recipients, next_run_at, created_by)
    values (v_report, v_city, v_freq, v_recipients, public.fn_stays_report_next_run(v_freq, now()), v_me)
    returning * into v_row;
  else
    select * into v_before from public.stays_report_schedule where id = v_id for update;
    if not found then
      raise exception 'That schedule is gone.' using errcode = 'P0002';
    end if;
    if not (authz.works_hospitality(null) or v_before.created_by = v_me) then
      raise exception 'Only hospitality staff or whoever added it can change this schedule.'
        using errcode = 'insufficient_privilege';
    end if;
    update public.stays_report_schedule
       set report = v_report, city_id = v_city, frequency = v_freq, recipients = v_recipients,
           next_run_at = case when frequency = v_freq then next_run_at
                              else public.fn_stays_report_next_run(v_freq, now()) end,
           updated_at = now()
     where id = v_id
    returning * into v_row;
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_report.schedule_saved',
    p_target_type => 'stays_report_schedule', p_target_id => v_row.id,
    p_target_label => public.fn_stays_report_title(v_row.report), p_city_id => v_row.city_id,
    p_before => case when v_before.id is null then null else to_jsonb(v_before) end,
    p_after => to_jsonb(v_row));
  return jsonb_build_object('id', v_row.id, 'next_run_at', v_row.next_run_at);
end;
$$;

/* Pause, resume or delete a scheduled report. */
create or replace function public.rpc_console_stays_report_schedule_set(p_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_before public.stays_report_schedule;
  v_row public.stays_report_schedule;
begin
  perform public.fn_stays_reader_gate();
  v_me := authz.staff_id();
  if p_action is null or p_action not in ('pause', 'resume', 'delete') then
    raise exception 'Pause, resume or delete.' using errcode = '22023';
  end if;
  select * into v_before from public.stays_report_schedule where id = p_id for update;
  if not found then
    raise exception 'That schedule is gone.' using errcode = 'P0002';
  end if;
  if not (authz.works_hospitality(null) or v_before.created_by = v_me) then
    raise exception 'Only hospitality staff or whoever added it can change this schedule.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_action = 'delete' then
    delete from public.stays_report_schedule where id = p_id;
  else
    update public.stays_report_schedule
       set active = (p_action = 'resume'),
           /* A schedule resumed after a pause sends at its next slot, not for the weeks it missed. */
           next_run_at = case when p_action = 'resume' and next_run_at <= now()
                              then public.fn_stays_report_next_run(frequency, now()) else next_run_at end,
           updated_at = now()
     where id = p_id
    returning * into v_row;
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_report.schedule_changed',
    p_target_type => 'stays_report_schedule', p_target_id => p_id,
    p_target_label => public.fn_stays_report_title(v_before.report), p_city_id => v_before.city_id,
    p_before => to_jsonb(v_before),
    p_after => case when p_action = 'delete' then jsonb_build_object('deleted', true) else to_jsonb(v_row) end,
    p_context => jsonb_build_object('action', p_action));
  return jsonb_build_object('id', p_id, 'action', p_action, 'active', v_row.active);
end;
$$;

/* Save a report's settings. p: id?, name, report, city_id?, period, from?, to?, shared. */
create or replace function public.rpc_console_stays_report_saved_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_before public.stays_report_saved;
  v_row public.stays_report_saved;
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_report text := nullif(btrim(coalesce(p ->> 'report', '')), '');
  v_city uuid := nullif(p ->> 'city_id', '')::uuid;
  v_period text := coalesce(nullif(p ->> 'period', ''), 'this_month');
  v_from date;
  v_to date;
  v_shared boolean := coalesce((p ->> 'shared')::boolean, false);
begin
  perform public.fn_stays_reader_gate();
  v_me := authz.staff_id();
  if v_me is null then
    raise exception 'Saved reports belong to a staff user.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'Give the report a name (80 characters at most).' using errcode = '23514';
  end if;
  if v_report is null or v_report not in ('bookings', 'revenue', 'occupancy', 'hosts', 'managers',
                                          'units', 'guests', 'concierge', 'reviews', 'cases') then
    raise exception 'Choose a report.' using errcode = '22023';
  end if;
  if v_period not in ('this_month', 'last_month', 'last_7', 'last_30', 'custom') then
    raise exception 'Choose a period.' using errcode = '22023';
  end if;
  if v_city is not null and not exists (select 1 from public.city where id = v_city) then
    raise exception 'That city does not exist.' using errcode = '22023';
  end if;
  if v_period = 'custom' then
    v_from := nullif(p ->> 'from', '')::date;
    v_to := nullif(p ->> 'to', '')::date;
    if v_from is null or v_to is null then
      raise exception 'Give the from and to dates.' using errcode = '23514';
    end if;
    perform public.fn_stays_check_period(v_from, v_to);
  end if;

  if v_id is null then
    insert into public.stays_report_saved (name, report, city_id, period, from_date, to_date, owner_id, shared)
    values (v_name, v_report, v_city, v_period, v_from, v_to, v_me, v_shared)
    returning * into v_row;
  else
    select * into v_before from public.stays_report_saved where id = v_id for update;
    if not found then
      raise exception 'That saved report is gone.' using errcode = 'P0002';
    end if;
    if not (authz.works_hospitality(null) or v_before.owner_id = v_me) then
      raise exception 'Only hospitality staff or its owner can change this saved report.'
        using errcode = 'insufficient_privilege';
    end if;
    update public.stays_report_saved
       set name = v_name, report = v_report, city_id = v_city, period = v_period,
           from_date = v_from, to_date = v_to, shared = v_shared, updated_at = now()
     where id = v_id
    returning * into v_row;
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_report.saved',
    p_target_type => 'stays_report_saved', p_target_id => v_row.id, p_target_label => v_row.name,
    p_city_id => v_row.city_id,
    p_before => case when v_before.id is null then null else to_jsonb(v_before) end,
    p_after => to_jsonb(v_row));
  return jsonb_build_object('id', v_row.id);
end;
$$;

create or replace function public.rpc_console_stays_report_saved_delete(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  v_before public.stays_report_saved;
begin
  perform public.fn_stays_reader_gate();
  v_me := authz.staff_id();
  select * into v_before from public.stays_report_saved where id = p_id for update;
  if not found then
    raise exception 'That saved report is gone.' using errcode = 'P0002';
  end if;
  if not (authz.works_hospitality(null) or v_before.owner_id = v_me) then
    raise exception 'Only hospitality staff or its owner can delete this saved report.'
      using errcode = 'insufficient_privilege';
  end if;
  delete from public.stays_report_saved where id = p_id;
  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_report.saved_deleted',
    p_target_type => 'stays_report_saved', p_target_id => p_id, p_target_label => v_before.name,
    p_city_id => v_before.city_id, p_before => to_jsonb(v_before));
  return jsonb_build_object('id', p_id, 'deleted', true);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 5. the daily send

/*
 * Every due, active schedule: email each recipient who still reaches Hotels
 * a link to the export for the period before, with the bookings and booking
 * value in it (the Overview's definitions), log the run, move next_run_at on.
 * A schedule that fails keeps its next_run_at and its error, and is tried
 * again the next day; the others still go.
 */
create or replace function public.cron_stays_report_schedules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.stays_report_schedule;
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_from date;
  v_to date;
  v_bookings bigint;
  v_value bigint;
  v_city text;
  v_title text;
  v_url text;
  v_period_text text;
  v_sent integer;
  v_done integer := 0;
  r record;
begin
  for s in
    select * from public.stays_report_schedule
     where active and next_run_at <= now()
     order by next_run_at
     for update skip locked
  loop
    begin
      select x.period_from, x.period_to into v_from, v_to
        from public.fn_stays_report_send_period(s.frequency, v_day) x;
      select count(*), coalesce(sum(b.value_kes), 0) into v_bookings, v_value
        from public.console_stays_rows(s.city_id) b
       where b.status in ('booked', 'in_stay', 'departed')
         and b.check_in >= (v_from::timestamp) at time zone 'Africa/Nairobi'
         and b.check_in < ((v_to + 1)::timestamp) at time zone 'Africa/Nairobi';
      v_city := coalesce((select name from public.city where id = s.city_id), 'All cities');
      v_title := public.fn_stays_report_title(s.report);
      v_period_text := to_char(v_from, 'FMDD Mon YYYY') || ' – ' || to_char(v_to, 'FMDD Mon YYYY');
      v_url := 'https://control.nexgapp.com/stays/export?report=' || s.report
        || '&from=' || v_from || '&to=' || v_to
        || coalesce('&city=' || s.city_id::text, '');
      v_sent := 0;

      for r in
        select su.id, su.email, su.display_name
          from public.staff_user su
         where su.id = any (s.recipients) and public.fn_stays_staff_reads_reports(su.id)
      loop
        perform public.fn_notify_enqueue(
          p_channel => 'email', p_recipient => r.email, p_template => 'staff_stays_report',
          p_subject => 'Stays ' || case when s.frequency = 'weekly' then 'weekly' else 'monthly' end
            || ' report: ' || v_title || ', ' || v_period_text,
          p_body => 'Hi ' || r.display_name || ',' || E'\n\n'
            || 'Your ' || case when s.frequency = 'weekly' then 'weekly' else 'monthly' end
            || ' ' || v_title || ' for ' || v_period_text || ' (' || v_city || ') is ready.' || E'\n\n'
            || 'Bookings: ' || v_bookings || E'\n'
            || 'Booking value: KES ' || to_char(v_value, 'FM999,999,999,999,990') || E'\n\n'
            || 'Download it from the console (sign in first): ' || v_url || E'\n\n'
            || 'Change or pause this email on Stays > Reports > Scheduled Reports.',
          p_payload => jsonb_build_object(
            'schedule_id', s.id, 'report', s.report, 'from', v_from, 'to', v_to,
            'content', jsonb_build_object(
              'title', v_title,
              'intro', 'Your ' || case when s.frequency = 'weekly' then 'weekly' else 'monthly' end
                || ' stays report for ' || v_period_text || ' is ready to download.',
              'rows', jsonb_build_array(
                jsonb_build_array('Period', v_period_text),
                jsonb_build_array('City', v_city),
                jsonb_build_array('Bookings', v_bookings::text),
                jsonb_build_array('Booking value', 'KES ' || to_char(v_value, 'FM999,999,999,999,990'))),
              'action', jsonb_build_object('label', 'Download the report', 'url', v_url),
              'actionNote', 'Opens the NexG console; sign in with your staff account.',
              'closing', 'Change or pause this email on Stays › Reports › Scheduled Reports.')));
        v_sent := v_sent + 1;
      end loop;

      insert into public.stays_report_run
        (report, period_from, period_to, rows_exported, generated_by, schedule_id, emailed_to)
      values (s.report, v_from, v_to, 0, null, s.id, v_sent);

      update public.stays_report_schedule
         set next_run_at = public.fn_stays_report_next_run(s.frequency, now()),
             last_sent_at = now(), last_error = null, updated_at = now()
       where id = s.id;

      perform audit.log('system'::public.actor_type, 'hotels', 'stays_report.emailed',
        p_actor_label => 'Stays report schedule',
        p_target_type => 'stays_report_schedule', p_target_id => s.id, p_target_label => v_title,
        p_city_id => s.city_id,
        p_after => jsonb_build_object('from', v_from, 'to', v_to, 'emailed_to', v_sent,
                                      'bookings', v_bookings, 'booking_value_kes', v_value));
      v_done := v_done + 1;
    exception when others then
      raise warning 'stays report schedule % not sent: %', s.id, sqlerrm;
      update public.stays_report_schedule set last_error = left(sqlerrm, 300) where id = s.id;
    end;
  end loop;
  return v_done;
end;
$$;

revoke all on function public.cron_stays_report_schedules() from public, anon, authenticated;
grant execute on function public.cron_stays_report_schedules() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; the stays report emails are not scheduled.';
    return;
  end if;
  if exists (select 1 from cron.job where jobname = 'stays-report-schedules') then
    perform cron.unschedule('stays-report-schedules');
  end if;
  /* 05:00 in Nairobi (UTC+3, no daylight saving). */
  perform cron.schedule('stays-report-schedules', '0 2 * * *',
    $sched$select public.cron_stays_report_schedules()$sched$);
end
$cron$;

-- ═══════════════════════════════════════════════════════════════ 6. grants

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.rpc_console_stays_report_plans()',
    'public.rpc_console_stays_report_runs(integer)',
    'public.rpc_console_stays_report_schedule_save(jsonb)',
    'public.rpc_console_stays_report_schedule_set(uuid, text)',
    'public.rpc_console_stays_report_saved_save(jsonb)',
    'public.rpc_console_stays_report_saved_delete(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
