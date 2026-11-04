-- New setup schedules explicitly record the convention. Existing schedules are
-- left untagged because historic writers disagree about weekday numbering.
alter table public.merchant_hours add column weekday_convention text
  check (weekday_convention is null or weekday_convention = 'monday_zero');

create function public.rpc_merchant_setup_hours_load(p_merchant_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb; v_ambiguous boolean;
begin
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean,false) then
    raise exception 'Setup access is required.' using errcode='42501';
  end if;
  select exists(select 1 from public.merchant_hours where merchant_id=p_merchant_id
                and weekday_convention is null) into v_ambiguous;
  select coalesce(jsonb_agg(jsonb_build_object('day',h.day_of_week,'closed',h.closed,
           'opens',h.opens,'closes',h.closes,'updatedAt',h.updated_at) order by h.day_of_week), '[]'::jsonb)
    into v_rows from public.merchant_hours h where h.merchant_id=p_merchant_id
      and h.branch_id is null and h.weekday_convention='monday_zero' and h.service='All day';
  return jsonb_build_object('ambiguous',v_ambiguous,'rows',v_rows,'version',md5(v_rows::text));
end;
$$;

create function public.rpc_merchant_setup_hours_save(p_merchant_id uuid,p_days jsonb,p_version text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_before jsonb; v_day integer; v_start time; v_end time;
begin
  perform 1 from public.merchant_application where merchant_id=p_merchant_id for update;
  perform 1 from public.merchant where id=p_merchant_id for update;
  if not authz.merchant_application_owner(p_merchant_id)
     or not coalesce((authz.merchant_application_access(p_merchant_id)->>'setup')::boolean,false) then
    raise exception 'Setup access is required.' using errcode='42501';
  end if;
  if jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) <> 7
     or (select count(distinct (v->>'day')) from jsonb_array_elements(p_days) v) <> 7 then
    raise exception 'Choose a valid schedule for each day.' using errcode='22023';
  end if;
  if exists(select 1 from public.merchant_hours where merchant_id=p_merchant_id
            and weekday_convention is null) then
    raise exception 'Existing hours need review before using this editor.' using errcode='22023';
  end if;
  v_before := public.rpc_merchant_setup_hours_load(p_merchant_id);
  if v_before->>'version' is distinct from p_version then
    raise exception 'Hours changed in another session. Reload before saving.' using errcode='40001';
  end if;
  for v_row in select value from jsonb_array_elements(p_days) loop
    if coalesce(v_row->>'day','') !~ '^[0-6]$' or coalesce(v_row->>'state','') not in ('open','closed','unspecified') then
      raise exception 'Choose a valid schedule for each day.' using errcode='22023';
    end if;
    v_day := (v_row->>'day')::integer;
    if v_row->>'state'='unspecified' then
      delete from public.merchant_hours where merchant_id=p_merchant_id and branch_id is null
        and day_of_week=v_day and service='All day' and weekday_convention='monday_zero';
      continue;
    end if;
    if v_row->>'state'='open' then
      if coalesce(v_row->>'opens','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or coalesce(v_row->>'closes','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Enter valid opening and closing times.' using errcode='22023';
      end if;
      v_start := (v_row->>'opens')::time; v_end := (v_row->>'closes')::time;
      if v_end <= v_start then raise exception 'Overnight and 24-hour schedules are not supported here yet.' using errcode='22023'; end if;
    else v_start := null; v_end := null; end if;
    insert into public.merchant_hours(merchant_id,branch_id,day_of_week,service,opens,closes,closed,weekday_convention)
    values(p_merchant_id,null,v_day,'All day',v_start,v_end,v_row->>'state'='closed','monday_zero')
    on conflict (merchant_id,coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),day_of_week,service)
    do update set opens=excluded.opens,closes=excluded.closes,closed=excluded.closed,
      weekday_convention=excluded.weekday_convention,updated_at=now();
  end loop;
  perform audit.log('merchant_user'::public.actor_type,'merchants','merchant.hours_set',
    p_target_type=>'merchant',p_target_id=>p_merchant_id,
    p_after=>jsonb_build_object('scope','shared weekly hours','weekday_convention','monday_zero'));
  return public.rpc_merchant_setup_hours_load(p_merchant_id);
end;
$$;

revoke all on function public.rpc_merchant_setup_hours_load(uuid),public.rpc_merchant_setup_hours_save(uuid,jsonb,text) from public,anon;
grant execute on function public.rpc_merchant_setup_hours_load(uuid),public.rpc_merchant_setup_hours_save(uuid,jsonb,text) to authenticated;

-- Keep the convention when the existing workspace copies a weekly schedule.
create or replace function public.rpc_hours_copy(p_merchant_id uuid,p_to_branch uuid,p_from_branch uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your business.' using errcode='42501';
  end if;
  perform 1 from public.merchant where id=p_merchant_id for update;
  delete from public.merchant_hours where merchant_id=p_merchant_id and branch_id is not distinct from p_to_branch;
  insert into public.merchant_hours(merchant_id,branch_id,day_of_week,service,opens,closes,closed,sort,weekday_convention)
    select merchant_id,p_to_branch,day_of_week,service,opens,closes,closed,sort,weekday_convention
      from public.merchant_hours where merchant_id=p_merchant_id and branch_id is not distinct from p_from_branch;
  get diagnostics v_count = row_count;
  perform audit.log('merchant_user'::public.actor_type,'merchants','merchant.hours_copied',
    p_target_type=>'merchant',p_target_id=>p_merchant_id,
    p_after=>jsonb_build_object('rows',v_count,'to_branch',p_to_branch));
  return jsonb_build_object('ok',true,'note',v_count || ' service(s) copied.');
end;
$$;

-- The existing hours workspace already uses Monday=0. New rows in a scope
-- whose existing hours are all explicitly tagged keep that same convention.
create or replace function public.rpc_hours_set(p_merchant_id uuid,p_day smallint,p_service text,
  p_opens time default null,p_closes time default null,p_closed boolean default false,p_branch_id uuid default null)
returns public.merchant_hours language plpgsql security definer set search_path = '' as $$
declare v_row public.merchant_hours; v_convention text;
begin
  if not authz.is_merchant_member(p_merchant_id) and not authz.can_manage_merchants(null) then
    raise exception 'Not your business.' using errcode='42501';
  end if;
  perform 1 from public.merchant where id=p_merchant_id for update;
  if p_day < 0 or p_day > 6 then raise exception 'Day must be 0 (Monday) to 6 (Sunday).' using errcode='22023'; end if;
  if not p_closed and (p_opens is null or p_closes is null) then
    raise exception 'An open service needs both an opening and a closing time.' using errcode='22023';
  end if;
  if not p_closed and p_closes <= p_opens then
    raise exception 'Closing time has to be after opening time. For a service that runs past midnight, split it into two.' using errcode='22023';
  end if;
  if exists(select 1 from public.merchant_hours h where h.merchant_id=p_merchant_id
      and h.branch_id is not distinct from p_branch_id and h.weekday_convention='monday_zero')
    and not exists(select 1 from public.merchant_hours h where h.merchant_id=p_merchant_id
      and h.branch_id is not distinct from p_branch_id and h.weekday_convention is null) then
    v_convention := 'monday_zero';
  end if;
  insert into public.merchant_hours(merchant_id,branch_id,day_of_week,service,opens,closes,closed,weekday_convention)
  values(p_merchant_id,p_branch_id,p_day,coalesce(nullif(trim(p_service),''),'All day'),p_opens,p_closes,p_closed,v_convention)
  on conflict (merchant_id,coalesce(branch_id,'00000000-0000-0000-0000-000000000000'::uuid),day_of_week,service)
  do update set opens=excluded.opens,closes=excluded.closes,closed=excluded.closed,updated_at=now()
  returning * into v_row;
  perform audit.log('merchant_user'::public.actor_type,'merchants','merchant.hours_set',
    p_target_type=>'merchant',p_target_id=>p_merchant_id,
    p_after=>jsonb_build_object('day',p_day,'service',p_service,'closed',p_closed));
  return v_row;
end;
$$;

-- Interpret only tagged rows using their stated convention; historical rows
-- keep their prior interpretation and are never silently rewritten.
create or replace function public.fn_merchant_effective_hours(p_merchant_id uuid,p_branch_id uuid default null,p_date date default current_date)
returns table (opens time, closes time, closed boolean, source text)
language plpgsql stable security definer set search_path = '' as $$
declare v_merchant public.merchant; v_row record; v_dow integer := extract(isodow from p_date);
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
  select e.default_close into v_row from public.city_hours_exception e
    where e.city_id=v_merchant.city_id and e.date=p_date and e.enabled
      and (e.applies_to_categories is null or v_merchant.category::text=any(e.applies_to_categories)) limit 1;
  if found and v_row.default_close is not null then
    return query select h.opens,least(h.closes,v_row.default_close),h.closed,'city exception'::text
      from public.merchant_hours h where h.merchant_id=p_merchant_id and
      ((h.weekday_convention='monday_zero' and h.day_of_week=v_dow-1) or
       (h.weekday_convention is null and h.day_of_week=v_dow)) limit 1;
    if found then return; end if;
  end if;
  if v_merchant.parent_merchant_id is not null then
    perform 1 from public.merchant_chain_setting where parent_id=v_merchant.parent_merchant_id and shared_hours;
    if found then
      return query select h.opens,h.closes,h.closed,'chain parent'::text from public.merchant_hours h
        where h.merchant_id=v_merchant.parent_merchant_id and
        ((h.weekday_convention='monday_zero' and h.day_of_week=v_dow-1) or
         (h.weekday_convention is null and h.day_of_week=v_dow)) limit 1;
      if found then return; end if;
    end if;
  end if;
  return query select h.opens,h.closes,h.closed,'weekly'::text from public.merchant_hours h
    where h.merchant_id=p_merchant_id and
    ((h.weekday_convention='monday_zero' and h.day_of_week=v_dow-1) or
     (h.weekday_convention is null and h.day_of_week=v_dow)) limit 1;
end;
$$;
