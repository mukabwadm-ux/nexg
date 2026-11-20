-- "Upload any CSV", phase 1 (owner's request, 20 Nov 2026).
--
-- A merchant can import offerings from their own spreadsheet. The web app
-- matches its columns to NexG's fields, cleans the values and plans the import
-- as before (rpc_merchant_setup_offerings_import still saves the offerings).
-- What this adds is that nothing in the file is lost:
--
--   * merchant_import_batch: one per import, with the original file kept in
--     the private bucket merchant-imports and the column mapping used;
--   * merchant_import_row: every row of the file as written, with what
--     happened to it (imported, unchanged, or needs attention and why);
--   * merchant_item_extra: columns NexG has no field for, kept on each item;
--   * merchant_import_mapping: the confirmed mapping per merchant, keyed by the
--     file's set of column names, so the next export from the same POS maps
--     itself;
--   * undo: a batch's new offerings are removed again, as long as they were
--     never published or ordered. Updates are not reverted.
--
-- Rollback: drop the four tables, the four functions and the bucket's
-- policies; delete the bucket once empty; delete the registry row.

create table public.merchant_import_mapping (
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  header_key text not null check (length(header_key) between 1 and 2000),
  headers jsonb not null check (jsonb_typeof(headers) = 'array'),
  mapping jsonb not null check (jsonb_typeof(mapping) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (merchant_id, header_key)
);

create table public.merchant_import_batch (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  file_name text not null check (length(file_name) between 1 and 255),
  storage_path text,
  headers jsonb not null default '[]'::jsonb,
  mapping jsonb not null default '{}'::jsonb,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  attention_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_removed integer
);
create index merchant_import_batch_merchant on public.merchant_import_batch (merchant_id, created_at desc);

create table public.merchant_import_row (
  batch_id uuid not null references public.merchant_import_batch (id) on delete cascade,
  row_no integer not null check (row_no >= 1),
  raw jsonb not null check (jsonb_typeof(raw) = 'object'),
  status text not null check (status in ('imported', 'unchanged', 'attention')),
  message text check (length(message) <= 500),
  item_id uuid,
  created boolean not null default false,
  primary key (batch_id, row_no)
);

create table public.merchant_item_extra (
  item_id uuid primary key references public.catalogue_item (id) on delete cascade,
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  extras jsonb not null check (jsonb_typeof(extras) = 'object'),
  batch_id uuid references public.merchant_import_batch (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index merchant_item_extra_merchant on public.merchant_item_extra (merchant_id);

alter table public.merchant_import_mapping enable row level security;
alter table public.merchant_import_batch enable row level security;
alter table public.merchant_import_row enable row level security;
alter table public.merchant_item_extra enable row level security;

-- The merchant's own team reads; writes go through the functions below.
create policy merchant_import_mapping_read on public.merchant_import_mapping
  for select to authenticated using (authz.is_merchant_member(merchant_id));
create policy merchant_import_batch_read on public.merchant_import_batch
  for select to authenticated using (authz.is_merchant_member(merchant_id));
create policy merchant_import_row_read on public.merchant_import_row
  for select to authenticated using (exists (
    select 1 from public.merchant_import_batch b
    where b.id = batch_id and authz.is_merchant_member(b.merchant_id)));
create policy merchant_item_extra_read on public.merchant_item_extra
  for select to authenticated using (authz.is_merchant_member(merchant_id));

revoke all on public.merchant_import_mapping, public.merchant_import_batch,
  public.merchant_import_row, public.merchant_item_extra from anon;
revoke insert, update, delete on public.merchant_import_mapping, public.merchant_import_batch,
  public.merchant_import_row, public.merchant_item_extra from authenticated;
grant select on public.merchant_import_mapping, public.merchant_import_batch,
  public.merchant_import_row, public.merchant_item_extra to authenticated;

-- ------------------------------------------------------------------ the original files

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('merchant-imports', 'merchant-imports', false, 2097152,
        array['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'])
on conflict (id) do nothing;

-- Path: <merchant id>/<batch id>.csv. The merchant's team uploads and reads its own.
create policy merchant_imports_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'merchant-imports'
              and authz.is_merchant_member(((storage.foldername(name))[1])::uuid));
create policy merchant_imports_read on storage.objects
  for select to authenticated
  using (bucket_id = 'merchant-imports'
         and authz.is_merchant_member(((storage.foldername(name))[1])::uuid));

-- ------------------------------------------------------------------ importing

/* Saves the planned offerings (as rpc_merchant_setup_offerings_import does)
   and records the batch: every raw row, the extras and the mapping, in one
   transaction. p_rows may be empty when every row needs attention. */
create or replace function public.rpc_merchant_offerings_import_any(
  p_merchant_id uuid, p_rows jsonb, p_batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new uuid[];
  v_result jsonb := jsonb_build_object('created', 0, 'updated', 0, 'published', 0, 'unpublished', 0);
  v_batch uuid;
  v_attention integer;
begin
  perform public.fn_merchant_setup_offering_authorize(p_merchant_id);
  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_typeof(p_batch) is distinct from 'object'
     or jsonb_typeof(p_batch->'rows') is distinct from 'array'
     or jsonb_array_length(p_batch->'rows') not between 1 and 2000
     or length(coalesce(p_batch->>'file_name', '')) not between 1 and 255
     or coalesce(jsonb_typeof(p_batch->'extras'), 'array') <> 'array'
     or coalesce(jsonb_typeof(p_batch->'mapping'), 'object') <> 'object'
     or coalesce(jsonb_typeof(p_batch->'headers'), 'array') <> 'array' then
    raise exception 'Check the import.' using errcode = '22023';
  end if;
  if coalesce(p_batch->>'storage_path', '') <> ''
     and split_part(p_batch->>'storage_path', '/', 1) <> p_merchant_id::text then
    raise exception 'Check the import file.' using errcode = '22023';
  end if;

  -- Which offerings are new, so an undo knows what this batch added.
  select coalesce(array_agg((r->'data'->>'id')::uuid), '{}') into v_new
  from jsonb_array_elements(p_rows) r
  where not exists (select 1 from public.catalogue_item i where i.id = (r->'data'->>'id')::uuid);

  if jsonb_array_length(p_rows) > 0 then
    v_result := public.rpc_merchant_setup_offerings_import(p_merchant_id, p_rows);
  end if;

  select count(*) into v_attention
  from jsonb_array_elements(p_batch->'rows') x where x->>'status' = 'attention';

  insert into public.merchant_import_batch
    (merchant_id, file_name, storage_path, headers, mapping, created_count, updated_count, attention_count)
  values (p_merchant_id, p_batch->>'file_name', nullif(p_batch->>'storage_path', ''),
          coalesce(p_batch->'headers', '[]'::jsonb), coalesce(p_batch->'mapping', '{}'::jsonb),
          (v_result->>'created')::int, (v_result->>'updated')::int, v_attention)
  returning id into v_batch;

  insert into public.merchant_import_row (batch_id, row_no, raw, status, message, item_id, created)
  select v_batch, x.row_no, x.raw, x.status, left(x.message, 500),
         case when exists (select 1 from public.catalogue_item i
                           where i.id = x.item_id and i.merchant_id = p_merchant_id)
              then x.item_id end,
         x.item_id = any (v_new)
  from jsonb_to_recordset(p_batch->'rows') as x(row_no integer, raw jsonb, status text, message text, item_id uuid)
  on conflict (batch_id, row_no) do nothing;

  insert into public.merchant_item_extra (item_id, merchant_id, extras, batch_id)
  select e.item_id, p_merchant_id, e.extras, v_batch
  from jsonb_to_recordset(coalesce(p_batch->'extras', '[]'::jsonb)) as e(item_id uuid, extras jsonb)
  where jsonb_typeof(e.extras) = 'object' and e.extras <> '{}'::jsonb
    and exists (select 1 from public.catalogue_item i where i.id = e.item_id and i.merchant_id = p_merchant_id)
  on conflict (item_id) do update
    set extras = public.merchant_item_extra.extras || excluded.extras,
        batch_id = excluded.batch_id, updated_at = now();

  if length(coalesce(p_batch->>'header_key', '')) between 1 and 2000 then
    insert into public.merchant_import_mapping (merchant_id, header_key, headers, mapping)
    values (p_merchant_id, p_batch->>'header_key', coalesce(p_batch->'headers', '[]'::jsonb),
            coalesce(p_batch->'mapping', '{}'::jsonb))
    on conflict (merchant_id, header_key) do update
      set headers = excluded.headers, mapping = excluded.mapping, updated_at = now();
  end if;

  return v_result || jsonb_build_object('batch_id', v_batch, 'attention', v_attention);
end;
$$;

/* The mapping saved for this set of column names, or null. */
create or replace function public.rpc_merchant_import_mapping_read(p_merchant_id uuid, p_header_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select m.mapping from public.merchant_import_mapping m
  where m.merchant_id = p_merchant_id and m.header_key = p_header_key
    and authz.is_merchant_member(p_merchant_id);
$$;

/* Recent imports with the rows that still need attention. */
create or replace function public.rpc_merchant_import_batches(p_merchant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'file_name', b.file_name, 'created_at', b.created_at,
    'created', b.created_count, 'updated', b.updated_count, 'attention', b.attention_count,
    'undone_at', b.undone_at, 'undone_removed', b.undone_removed,
    'can_undo', b.undone_at is null and b.created_count > 0,
    'attention_rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'row', r.row_no, 'message', r.message, 'raw', r.raw) order by r.row_no), '[]'::jsonb)
      from (select * from public.merchant_import_row r
            where r.batch_id = b.id and r.status = 'attention' order by r.row_no limit 200) r)
  ) order by b.created_at desc), '[]'::jsonb)
  from (select * from public.merchant_import_batch
        where merchant_id = p_merchant_id and authz.is_merchant_member(p_merchant_id)
        order by created_at desc limit 10) b;
$$;

/* Removes the offerings a batch added, unless published or ordered since. */
create or replace function public.rpc_merchant_import_batch_undo(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.merchant_import_batch;
  v_removed integer := 0;
  v_kept integer := 0;
  r record;
begin
  select * into b from public.merchant_import_batch where id = p_batch_id for update;
  if b.id is null then
    raise exception 'Import not found.' using errcode = 'P0002';
  end if;
  perform public.fn_merchant_setup_offering_authorize(b.merchant_id);
  if b.undone_at is not null then
    raise exception 'This import was already undone.' using errcode = '22023';
  end if;

  for r in
    select x.item_id from public.merchant_import_row x
    where x.batch_id = b.id and x.created and x.item_id is not null
  loop
    if exists (select 1 from public.catalogue_item i
               where i.id = r.item_id and i.merchant_id = b.merchant_id and not i.available)
       and not exists (select 1 from public.order_item o where o.catalogue_item_id = r.item_id) then
      delete from public.catalogue_item where id = r.item_id and merchant_id = b.merchant_id;
      v_removed := v_removed + 1;
    else
      v_kept := v_kept + 1;
    end if;
  end loop;

  update public.merchant_import_batch set undone_at = now(), undone_removed = v_removed
  where id = b.id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type,
    p_module => 'merchant',
    p_action => 'merchant.offerings_import_undone',
    p_target_type => 'merchant',
    p_target_id => b.merchant_id,
    p_after => jsonb_build_object('batch_id', b.id, 'removed', v_removed, 'kept', v_kept));

  return jsonb_build_object('removed', v_removed, 'kept', v_kept);
end;
$$;

insert into audit.action_registry
  (action, module, default_severity, needs_review, pii_fields, two_person, money, description)
values ('merchant.offerings_import_undone', 'merchants', 'info', false, '{}', false, false,
        'A merchant undid an offerings import: the new, never published offerings it added were removed')
on conflict (action) do nothing;

revoke all on function public.rpc_merchant_offerings_import_any(uuid, jsonb, jsonb),
  public.rpc_merchant_import_mapping_read(uuid, text),
  public.rpc_merchant_import_batches(uuid),
  public.rpc_merchant_import_batch_undo(uuid)
  from public, anon;
grant execute on function public.rpc_merchant_offerings_import_any(uuid, jsonb, jsonb),
  public.rpc_merchant_import_mapping_read(uuid, text),
  public.rpc_merchant_import_batches(uuid),
  public.rpc_merchant_import_batch_undo(uuid)
  to authenticated, service_role;
