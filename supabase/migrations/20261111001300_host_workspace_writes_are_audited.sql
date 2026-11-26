-- Host workspace writes leave an audit trail, as the wiring check (tests/26) requires.
--
-- Guide saves and task saves now call audit.log in the same transaction. Two
-- other new RPCs write only through functions that already log, so they are
-- recorded as exempt with that reason rather than logging twice.
-- Function bodies are otherwise unchanged from 20261111001000 and 20261111001100.

create or replace function public.rpc_host_workspace_guide_commit(
  p_unit_id uuid, p_revision integer, p_action text, p_document jsonb, p_restore_id uuid
)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  guide public.host_unit_guide;
  content jsonb;
  publication uuid;
begin
  perform 1 from public.unit where id = p_unit_id and archived_at is null for share;
  if not found or not authz.can_see_unit(p_unit_id) then
    raise exception 'This unit is outside your workspace access.' using errcode = '42501';
  end if;
  insert into public.host_unit_guide(unit_id) values (p_unit_id) on conflict do nothing;
  select * into guide from public.host_unit_guide where unit_id = p_unit_id for update;
  if guide.revision is distinct from p_revision then
    raise exception 'The guide has changed. Reload before saving.' using errcode = '40001';
  end if;

  publication := guide.published_id;
  content := guide.document;
  case p_action
    when 'draft' then content := p_document;
    when 'publish' then null;
    when 'unpublish' then publication := null;
    when 'restore' then
      select document into content from public.host_unit_guide_version
        where id = p_restore_id and unit_id = p_unit_id;
      if not found then
        raise exception 'Choose a published version of this guide.' using errcode = '22023';
      end if;
    else raise exception 'Choose a valid guide action.' using errcode = '22023';
  end case;

  if jsonb_typeof(content) is distinct from 'object'
    or content - array['articles','planId','modelId'] <> '{}'::jsonb
    or jsonb_typeof(content -> 'articles') is distinct from 'array'
    or octet_length(content::text) > 170000 then
    raise exception 'Check the guide contents.' using errcode = '22023';
  end if;
  if jsonb_array_length(content -> 'articles') > 40 then
    raise exception 'Use up to 40 amenity instructions.' using errcode = '22023';
  end if;
  if (content ->> 'planId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'planId')::uuid and unit_id = p_unit_id and kind = 'plan'
  )) or (content ->> 'modelId' is not null and not exists (
    select 1 from public.host_unit_guide_asset where id = (content ->> 'modelId')::uuid and unit_id = p_unit_id and kind = 'model'
  )) then
    raise exception 'Choose files attached to this unit.' using errcode = '22023';
  end if;
  if p_action in ('publish','restore') then
    if jsonb_array_length(content -> 'articles') = 0 then
      raise exception 'Add amenity instructions before publishing.' using errcode = '22023';
    end if;
    insert into public.host_unit_guide_version(unit_id,document) values (p_unit_id,content) returning id into publication;
  end if;
  update public.host_unit_guide set document = content, published_id = publication, revision = guide.revision + 1
    where unit_id = p_unit_id;
  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.guide_' || p_action,
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('revision', guide.revision + 1, 'published', publication is not null));
  return guide.revision + 1;
end;
$$;

create or replace function public.rpc_host_workspace_task_save(p_id uuid, p_unit_id uuid, p_version integer, p_patch jsonb)
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
  perform audit.log('host_user'::public.actor_type, 'hotels', 'host.task_saved',
    p_actor_id => actor, p_target_type => 'unit', p_target_id => p_unit_id,
    p_after => jsonb_build_object('task_id', p_id, 'status', coalesce(task.status, 'To do')));
end;
$$;

insert into wiring_audit_exempt (function_name, reason, recorded_in) values
  ('rpc_host_workspace_photos_set',
   'A concurrency and path check in front of rpc_property_photos_set / rpc_unit_photos_set, which write and log',
   'audit entries written by rpc_property_photos_set and rpc_unit_photos_set'),
  ('rpc_host_workspace_guide_asset_put',
   'Stores the file, then saves the draft through rpc_host_workspace_guide_commit in the same transaction',
   'audit entry host.guide_draft, written by rpc_host_workspace_guide_commit')
on conflict (function_name) do nothing;
