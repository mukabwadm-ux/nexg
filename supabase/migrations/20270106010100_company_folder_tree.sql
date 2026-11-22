-- Company files: folders inside folders, and the twelve folders NexG files by.
--
-- Until now Company files had one level of folders. The structure asked for
-- is twelve folders (Corporate and Legal, Human Resource, Finance and
-- Accounting, …), each holding named sub-folders (Company registration,
-- Licenses & permits, …) that documents are uploaded into. Every name stays
-- editable in the console.
--
--   1. company_folder.parent_id puts a folder inside a top-level folder. One
--      level only: a sub-folder holds files, not folders.
--   2. company_folder.sort keeps folders in the order they were listed; new
--      ones go last.
--   3. Names are unique within their folder rather than across the drive.
--   4. rpc_company_folder_save takes p_parent_id when adding a folder;
--      renaming keeps a folder where it is. rpc_company_folder_delete refuses
--      a folder that still has sub-folders, as it already refused one with
--      files.
--   5. company_folder_v gains parent_id, sort, the sub-folder count and totals
--      that include the sub-folders' files (new columns at the end).
--   6. The twelve folders and their sub-folders are created where missing,
--      matched by name, so running this twice changes nothing.
--
-- Rollback (in this order):
--   delete the folders this file created (empty ones only);
--   drop trigger company_folder_depth on public.company_folder;
--   drop function public.tg_company_folder_depth();
--   re-run company_folder_v, rpc_company_folder_save (3 arguments) and
--   rpc_company_folder_delete from 20261230000100;
--   drop index company_folder_name_in_parent_key and company_folder_parent_idx,
--   recreate company_folder_name_key on (lower(btrim(name)));
--   alter table public.company_folder drop column parent_id, drop column sort.

-- ═══════════════════════════════════════════════════════════ the tree

alter table public.company_folder
  add column if not exists parent_id uuid references public.company_folder (id) on delete restrict,
  add column if not exists sort integer not null default 1000;

alter table public.company_folder
  drop constraint if exists company_folder_not_its_own_parent,
  add constraint company_folder_not_its_own_parent check (parent_id is distinct from id);

drop index if exists public.company_folder_name_key;
create unique index if not exists company_folder_name_in_parent_key
  on public.company_folder (
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));
create index if not exists company_folder_parent_idx on public.company_folder (parent_id, sort);

comment on column public.company_folder.parent_id is
  'The top-level folder this one sits in; null for a top-level folder. One level deep.';

/* One level: a folder's parent is a top-level folder, and a folder that
   holds sub-folders cannot itself move inside another. */
create or replace function public.tg_company_folder_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.company_folder p
                where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'A sub-folder holds files, not folders.' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.company_folder c where c.parent_id = new.id) then
      raise exception 'A folder with sub-folders cannot go inside another folder.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists company_folder_depth on public.company_folder;
create trigger company_folder_depth
  before insert or update of parent_id on public.company_folder
  for each row execute function public.tg_company_folder_depth();

-- ═════════════════════════════════════════════════════════════ the view

/* Folders with what the caller can see in them. A top-level folder's
   all_* figures include its sub-folders. */
create or replace view public.company_folder_v
with (security_invoker = true) as
select
  f.id,
  f.name,
  f.color,
  f.created_by,
  f.created_at,
  f.updated_at,
  coalesce(c.files, 0) as file_count,
  coalesce(c.bytes, 0) as bytes,
  c.last_change,
  f.parent_id,
  f.sort,
  (select count(*) from public.company_folder s where s.parent_id = f.id) as sub_count,
  coalesce(t.files, 0) as all_file_count,
  coalesce(t.bytes, 0) as all_bytes,
  t.last_change as all_last_change
from public.company_folder f
left join lateral (
  select count(*) as files, sum(x.size_bytes)::bigint as bytes, max(x.updated_at) as last_change
  from public.company_file x
  where x.folder_id = f.id and x.deleted_at is null
) c on true
left join lateral (
  select count(*) as files, sum(x.size_bytes)::bigint as bytes, max(x.updated_at) as last_change
  from public.company_file x
  where x.deleted_at is null
    and (x.folder_id = f.id
         or x.folder_id in (select s.id from public.company_folder s where s.parent_id = f.id))
) t on true;

revoke all on public.company_folder_v from anon;
revoke insert, update, delete, truncate, references, trigger on public.company_folder_v from authenticated;
grant select on public.company_folder_v to authenticated;

-- ═══════════════════════════════════════════════════════ add and rename

drop function if exists public.rpc_company_folder_save(text, text, uuid);

/*
 * Adds a folder (inside p_parent_id when given) or renames one. A rename
 * keeps the folder where it is. Names are unique within their folder.
 */
create or replace function public.rpc_company_folder_save(
  p_name text,
  p_color text default null,
  p_id uuid default null,
  p_parent_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_name text := btrim(coalesce(p_name, ''));
  v_old public.company_folder;
  v_new public.company_folder;
  v_parent public.company_folder;
  v_where uuid;
begin
  if v_name = '' then
    raise exception 'Give the folder a name.' using errcode = '22023';
  end if;
  if length(v_name) > 60 then
    raise exception 'Keep the name to 60 characters.' using errcode = '22023';
  end if;

  if p_id is not null then
    select * into v_old from public.company_folder where id = p_id for update;
    if v_old.id is null then
      raise exception 'That folder no longer exists.' using errcode = 'P0002';
    end if;
    v_where := v_old.parent_id;
  elsif p_parent_id is not null then
    select * into v_parent from public.company_folder where id = p_parent_id;
    if v_parent.id is null then
      raise exception 'That folder no longer exists.' using errcode = 'P0002';
    end if;
    if v_parent.parent_id is not null then
      raise exception 'A sub-folder holds files, not folders.' using errcode = '22023';
    end if;
    v_where := v_parent.id;
  end if;

  if exists (select 1 from public.company_folder f
             where lower(btrim(f.name)) = lower(v_name)
               and f.parent_id is not distinct from v_where
               and f.id is distinct from p_id) then
    raise exception 'There is already a folder called "%" here.', v_name using errcode = '23505';
  end if;

  if p_id is null then
    insert into public.company_folder (name, color, parent_id, sort, created_by)
    values (
      v_name, coalesce(p_color, v_parent.color, 'gold'), v_where,
      coalesce((select max(f.sort) from public.company_folder f
                 where f.parent_id is not distinct from v_where and f.sort < 1000), 0) + 10,
      v_staff)
    returning * into v_new;
  else
    update public.company_folder
       set name = v_name, color = coalesce(p_color, color), updated_at = now()
     where id = p_id
    returning * into v_new;
  end if;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company',
    p_action => case when p_id is null then 'company.folder_created' else 'company.folder_updated' end,
    p_actor_id => v_staff,
    p_target_type => 'company_folder', p_target_id => v_new.id, p_target_label => v_new.name,
    p_before => case when v_old.id is null then null else to_jsonb(v_old) end,
    p_after => to_jsonb(v_new));

  return v_new.id;
end;
$$;

create or replace function public.rpc_company_folder_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.company_require('write');
  v_old public.company_folder;
begin
  select * into v_old from public.company_folder where id = p_id for update;
  if v_old.id is null then
    raise exception 'That folder no longer exists.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.company_folder c where c.parent_id = p_id) then
    raise exception 'Delete the folders inside "%" first.', v_old.name using errcode = '23503';
  end if;
  if exists (select 1 from public.company_file f where f.folder_id = p_id and f.deleted_at is null) then
    raise exception 'Move or delete the files in "%" first.', v_old.name using errcode = '23503';
  end if;

  delete from public.company_folder where id = p_id;

  perform audit.log(
    p_actor_type => 'staff', p_module => 'company', p_action => 'company.folder_deleted',
    p_actor_id => v_staff,
    p_target_type => 'company_folder', p_target_id => v_old.id, p_target_label => v_old.name,
    p_before => to_jsonb(v_old));
end;
$$;

revoke execute on function
  public.rpc_company_folder_save(text, text, uuid, uuid),
  public.rpc_company_folder_delete(uuid)
  from public, anon;
grant execute on function
  public.rpc_company_folder_save(text, text, uuid, uuid),
  public.rpc_company_folder_delete(uuid)
  to authenticated, service_role;
revoke execute on function public.tg_company_folder_depth() from public, anon, authenticated;

-- ══════════════════════════════════════════════════ the twelve folders

do $$
declare
  v_tree jsonb := $tree$[
    {"name": "Corporate and Legal",
     "subs": ["Company registration", "Licenses & permits", "Legal agreements", "Corporate governance"]},
    {"name": "Human Resource",
     "subs": ["Employee records", "Employment contracts", "Recruitment", "Leave & performance"]},
    {"name": "Finance and Accounting",
     "subs": ["Budgets", "Invoices & receipts", "Tax & KRA", "Banking & audits"]},
    {"name": "Merchants and Partners",
     "subs": ["Merchant contracts", "Onboarding documents", "Commission agreements", "Strategic partnerships"]},
    {"name": "NexG Stays and Hosts",
     "subs": ["Host agreements", "Property verification", "Property managers", "Listing documentation"]},
    {"name": "Operations and Logistics",
     "subs": ["Standard operating procedures", "Rider documentation", "Incident reports", "Daily operations"]},
    {"name": "Sales and Management",
     "subs": ["Brand assets", "Campaigns", "Sales materials", "Influencer agreements"]},
    {"name": "Technology and Product",
     "subs": ["Product specifications", "Architecture & engines", "Integrations", "Release documentation"]},
    {"name": "Customer Support and Compliance",
     "subs": ["Support procedures", "Disputes & claims", "Privacy & compliance", "Refund documentation"]},
    {"name": "Management and Strategy",
     "subs": ["Management meetings", "Performance reports", "Investor documents"]},
    {"name": "Procurement and Company Assets",
     "subs": ["Asset register", "Supplier contracts", "Purchase orders", "Warranties"]},
    {"name": "Templates and Forms",
     "subs": ["Contract templates", "Official letters", "Onboarding forms", "Reporting templates"]}
  ]$tree$;
  v_folder jsonb;
  v_sub text;
  v_parent uuid;
  v_i integer := 0;
  v_j integer;
begin
  for v_folder in select value from jsonb_array_elements(v_tree) loop
    v_i := v_i + 1;

    select f.id into v_parent
      from public.company_folder f
     where f.parent_id is null and lower(btrim(f.name)) = lower(v_folder ->> 'name');

    if v_parent is null then
      insert into public.company_folder (name, color, sort)
      values (v_folder ->> 'name', 'gold', v_i * 10)
      returning id into v_parent;
    else
      update public.company_folder set sort = v_i * 10 where id = v_parent;
    end if;

    v_j := 0;
    for v_sub in select value #>> '{}' from jsonb_array_elements(v_folder -> 'subs') loop
      v_j := v_j + 1;
      insert into public.company_folder (name, color, parent_id, sort)
      select v_sub, 'gold', v_parent, v_j * 10
       where not exists (select 1 from public.company_folder f
                          where f.parent_id = v_parent and lower(btrim(f.name)) = lower(v_sub));
    end loop;
  end loop;
end
$$;
