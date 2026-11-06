-- Private operational tasks. NexG guest requests continue to use host_request.
create table public.host_workspace_task (
  id uuid primary key,
  unit_id uuid not null references public.unit(id) on delete cascade,
  stay_id uuid references public.stay(id) on delete set null,
  repeat_of uuid unique references public.host_workspace_task(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('Cleaning','Inspection','Maintenance','Guest request')),
  due_at timestamptz not null,
  priority text not null default 'Normal' check (priority in ('Normal','High','Urgent')),
  status text not null default 'To do' check (status in ('To do','In progress','Done','Cancelled')),
  checklist text[] not null default '{}',
  completed_checks text[] not null default '{}',
  evidence text not null default '',
  comments text not null default '' check (char_length(comments) <= 3000),
  cadence text not null default 'None' check (cadence in ('None','Weekly','Monthly')),
  inspection boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  check (cardinality(checklist) <= 40 and length(array_to_string(checklist,E'\n')) <= 4000),
  check (cardinality(completed_checks) <= 40 and completed_checks <@ checklist),
  check (evidence = '' or (length(evidence) <= 333000 and evidence ~ '^data:image/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+=*$')),
  check (status <> 'Done' or (checklist <@ completed_checks and
    (not inspection and kind not in ('Cleaning','Inspection') or evidence <> '')))
);
create index host_workspace_task_unit_idx on public.host_workspace_task(unit_id, due_at, id);
alter table public.host_workspace_task enable row level security;
revoke all on public.host_workspace_task from anon, authenticated;
grant select on public.host_workspace_task to authenticated;
create policy workspace_task_scoped_read on public.host_workspace_task for select to authenticated
  using (authz.can_see_unit(unit_id));

create function public.rpc_host_workspace_task_save(p_id uuid, p_unit_id uuid, p_version integer default null, p_patch jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  task public.host_workspace_task;
  account uuid;
  zone text;
  actor uuid := (select auth.uid());
begin
  select host_id into account from public.unit where id = p_unit_id and archived_at is null for share;
  if account is null or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or
    p_patch - array['stay_id','assignee_id','title','kind','due_at','priority','status','checklist','completed_checks','evidence','comments','cadence','inspection'] <> '{}'::jsonb then
    raise exception 'Check the task details.' using errcode = '22023';
  end if;
  select * into task from public.host_workspace_task where id = p_id for update;
  if found then
    if task.unit_id <> p_unit_id then
      raise exception 'This task is outside your workspace access.' using errcode = '42501';
    end if;
    if p_version is null and task.created_by = actor then return; end if;
    if task.version is distinct from p_version then
      raise exception 'This task has changed. Reload and try again.' using errcode = '40001';
    end if;
  elsif p_version is not null then
    raise exception 'This task could not be found.' using errcode = '42501';
  end if;

  task := jsonb_populate_record(task, p_patch);
  if task.stay_id is not null and not exists (
    select 1 from public.stay where id = task.stay_id and unit_id = p_unit_id for share
  ) then
    raise exception 'Choose a reservation for this unit.' using errcode = '22023';
  end if;
  if (task.assignee_id is not null or task.status in ('In progress','Done')) and not exists (
    select 1 from public.host_user where host_id = account and user_id = task.assignee_id
      and accepted_at is not null and (units is null or p_unit_id = any(units)) for share
  ) then
    raise exception 'Choose an active team member with access to this unit.' using errcode = '22023';
  end if;
  if task.status = 'Done' and not coalesce(task.checklist,'{}') <@ coalesce(task.completed_checks,'{}') then
    raise exception 'Complete every checklist item before finishing the task.' using errcode = '22023';
  end if;
  if task.status = 'Done' and (task.inspection or task.kind in ('Cleaning','Inspection')) and coalesce(task.evidence,'') = '' then
    raise exception 'Add completion evidence before finishing this task.' using errcode = '22023';
  end if;

  insert into public.host_workspace_task as previous (
    id, unit_id, created_by, stay_id, assignee_id, title, kind, due_at, priority, status, checklist,
    completed_checks, evidence, comments, cadence, inspection
  ) values (
    p_id, p_unit_id, actor, task.stay_id, task.assignee_id, task.title, task.kind, task.due_at,
    coalesce(task.priority,'Normal'), coalesce(task.status,'To do'), coalesce(task.checklist,'{}'),
    coalesce(task.completed_checks,'{}'), coalesce(task.evidence,''), coalesce(task.comments,''),
    coalesce(task.cadence,'None'), coalesce(task.inspection,false)
  ) on conflict (id) do update set
    stay_id = excluded.stay_id, assignee_id = excluded.assignee_id, title = excluded.title, kind = excluded.kind,
    due_at = excluded.due_at, priority = excluded.priority, status = excluded.status,
    checklist = excluded.checklist, completed_checks = excluded.completed_checks, evidence = excluded.evidence,
    comments = excluded.comments, cadence = excluded.cadence, inspection = excluded.inspection,
    version = previous.version + 1, updated_at = now()
  where previous.version = p_version;
  if not found and not (p_version is null and exists (
    select 1 from public.host_workspace_task where id = p_id and unit_id = p_unit_id and created_by = actor
  )) then
    raise exception 'This task has changed. Reload and try again.' using errcode = '40001';
  end if;
  if task.status = 'Done' and task.cadence in ('Weekly','Monthly') then
    select time_zone into zone from public.host where id = account;
    if zone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
      zone := 'Africa/Nairobi';
    end if;
    insert into public.host_workspace_task (
      id, unit_id, repeat_of, assignee_id, created_by, title, kind, due_at, priority, checklist, cadence, inspection
    ) values (
      gen_random_uuid(), p_unit_id, p_id, task.assignee_id, actor, task.title, task.kind,
      (task.due_at at time zone zone + case task.cadence when 'Weekly' then interval '1 week' else interval '1 month' end) at time zone zone,
      coalesce(task.priority,'Normal'), coalesce(task.checklist,'{}'), task.cadence, coalesce(task.inspection,false)
    ) on conflict (repeat_of) do nothing;
  end if;
end;
$$;
revoke execute on function public.rpc_host_workspace_task_save(uuid,uuid,integer,jsonb) from public, anon;
grant execute on function public.rpc_host_workspace_task_save(uuid,uuid,integer,jsonb) to authenticated;
