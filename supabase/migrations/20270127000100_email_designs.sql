-- Email designs: an uploaded design for each kind of email NexG sends.
--
-- Admin > Settings > Notifications & templates lists every kind of email
-- (the list, and the house design every email uses by default, live in
-- packages/contracts/src/email-design.ts) and lets a super admin, or anyone
-- with full Settings access, upload their own design for one kind and make
-- it live. Each sender asks for the live design of the email's kind and
-- uses the house design when there is none, so nothing changes until a
-- design is made live, and taking it off works at once.
--
-- A design is an HTML file with {{content}} where the message goes. Designs
-- for the emails Supabase sends itself (sign-in codes, password reset) keep
-- Supabase's own fields instead and are pasted into its dashboard; NexG
-- never sends those itself.
--
-- Rollback:
--   drop function public.rpc_email_design_public(text);
--   drop function public.rpc_email_overview();
--   drop function public.rpc_email_design_set_status(uuid, text);
--   drop function public.rpc_email_design_upload(text, text, text, text, text, jsonb, boolean);
--   drop function public.rpc_email_design_html(uuid);
--   drop function public.rpc_email_designs();
--   drop table public.email_design;
--   drop policy email_assets_insert on storage.objects;
--   drop policy email_assets_read on storage.objects;
--   empty email-assets through the Storage API, then
--     delete from storage.buckets where id = 'email-assets';
--   delete from audit.action_registry where action like 'settings.email\_design\_%';

-- ═══════════════════════════════════════════════════════════════ the designs

create table if not exists public.email_design (
  id uuid primary key default gen_random_uuid(),
  /* A purpose key from packages/contracts/src/email-design.ts, such as merchant.live. */
  purpose text not null,
  name text not null,
  html text not null,
  file_name text,
  notes text,
  /* Images uploaded with the design: the file name it used -> the address it uses now. */
  images jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  live_since timestamptz,
  status_changed_by uuid references auth.users (id) on delete set null,
  status_changed_at timestamptz,
  constraint email_design_purpose_shape
    check (purpose ~ '^[a-z_]+(\.[a-z_]+)?$' and length(purpose) <= 60),
  constraint email_design_name_length check (length(btrim(name)) between 1 and 120),
  constraint email_design_file_name_length check (file_name is null or length(file_name) <= 200),
  constraint email_design_notes_length check (notes is null or length(notes) <= 2000),
  constraint email_design_images_object check (jsonb_typeof(images) = 'object'),
  constraint email_design_status check (status in ('draft', 'live', 'archived')),
  constraint email_design_html_size check (length(html) between 40 and 400000),
  constraint email_design_no_script check (html !~* '<script\M'),
  constraint email_design_has_message check (
    case when purpose like 'auth.%'
         then html ~ '\{\{\s*\.(Token|TokenHash|ConfirmationURL)\s*\}\}'
         else html ~ '\{\{\s*content\s*\}\}'
    end)
);

/* One live design per kind of email. */
create unique index if not exists email_design_one_live
  on public.email_design (purpose) where status = 'live';

create index if not exists email_design_listed
  on public.email_design (purpose, created_at desc) where status <> 'archived';

/* Read and changed only through the functions below. */
alter table public.email_design enable row level security;
revoke all on public.email_design from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ images

/* Images a design shows. Public, because every inbox has to fetch them. */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-assets', 'email-assets', true, 2 * 1024 * 1024,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists email_assets_insert on storage.objects;
create policy email_assets_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'email-assets' and (select authz.can_edit_email_routes()));

drop policy if exists email_assets_read on storage.objects;
create policy email_assets_read on storage.objects
  for select to authenticated
  using (bucket_id = 'email-assets' and (select authz.reaches_module('settings')));

-- ═══════════════════════════════════════════════════════════════ the record

insert into audit.action_registry (action, module, default_severity, description) values
  ('settings.email_design_uploaded', 'settings', 'info',
   'An email design was uploaded for one kind of email'),
  ('settings.email_design_live', 'settings', 'notice',
   'An uploaded email design was made live: that kind of email now uses it'),
  ('settings.email_design_taken_off', 'settings', 'notice',
   'An email design was taken off: that kind of email went back to the house design'),
  ('settings.email_design_archived', 'settings', 'info',
   'An email design was removed from the list')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════════ reading

create or replace function public.rpc_email_designs()
returns table (
  id uuid, purpose text, name text, file_name text, notes text, status text,
  size_bytes integer, image_count integer, uploaded_by text, created_at timestamptz,
  live_since timestamptz, status_changed_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.reaches_module('settings') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return query
    select d.id, d.purpose, d.name, d.file_name, d.notes, d.status,
           octet_length(d.html), (select count(*)::integer from jsonb_object_keys(d.images)),
           coalesce(su.display_name, u.email::text), d.created_at, d.live_since,
           d.status_changed_at
      from public.email_design d
      left join public.staff_user su on su.user_id = d.uploaded_by
      left join auth.users u on u.id = d.uploaded_by
     where d.status <> 'archived'
     order by d.purpose, (d.status = 'live') desc, d.created_at desc;
end;
$$;

/* One design's file, for the console's preview and download. */
create or replace function public.rpc_email_design_html(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.reaches_module('settings') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return (select d.html from public.email_design d where d.id = p_id);
end;
$$;

/* What the tab's tiles and rows count: email sent and failing, by template. */
create or replace function public.rpc_email_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not authz.reaches_module('settings') then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'sent_24h', (select count(*) from public.notification_outbox o
                  where o.channel = 'email' and o.status = 'sent'
                    and o.created_at > now() - interval '24 hours'),
    'failed_24h', (select count(*) from public.notification_outbox o
                    where o.channel = 'email' and o.status in ('failed', 'abandoned')
                      and o.created_at > now() - interval '24 hours'),
    'waiting', (select count(*) from public.notification_outbox o
                 where o.channel = 'email' and o.status = 'pending'),
    'skipped_24h', (select count(*) from public.notification_log l
                     where l.channel = 'email' and l.status = 'skipped'
                       and l.created_at > now() - interval '24 hours'),
    'by_template', coalesce((
      select jsonb_object_agg(t.template, jsonb_build_object('sent', t.sent, 'failed', t.failed))
        from (select o.template,
                     count(*) filter (where o.status = 'sent') as sent,
                     count(*) filter (where o.status in ('failed', 'abandoned')) as failed
                from public.notification_outbox o
               where o.channel = 'email' and o.created_at > now() - interval '30 days'
               group by o.template) t), '{}'::jsonb),
    'can_edit', authz.can_edit_email_routes());
end;
$$;

/*
 * The live design for one kind of email, or null for the house design.
 * Open to the website's own key: the website and the console send some
 * emails themselves (support replies, stay bookings, invoices), and a
 * design is no secret: it is in every inbox that receives one.
 */
create or replace function public.rpc_email_design_public(p_purpose text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.html from public.email_design d
   where d.purpose = p_purpose and d.status = 'live'
$$;

-- ═══════════════════════════════════════════════════════════════ changing

create or replace function public.rpc_email_design_upload(
  p_purpose text,
  p_name text,
  p_html text,
  p_file_name text default null,
  p_notes text default null,
  p_images jsonb default '{}'::jsonb,
  p_make_live boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_purpose text := lower(btrim(coalesce(p_purpose, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_html text := coalesce(p_html, '');
  v_live boolean := coalesce(p_make_live, false);
begin
  if not authz.can_edit_email_routes() then
    raise exception 'Only a super admin or someone with full Settings access can upload email designs.'
      using errcode = '42501';
  end if;
  if v_purpose !~ '^[a-z_]+(\.[a-z_]+)?$' or length(v_purpose) > 60 then
    raise exception 'Choose what the design is for.' using errcode = '22023';
  end if;
  if length(v_name) not between 1 and 120 then
    raise exception 'Give the design a name of up to 120 characters.' using errcode = '22023';
  end if;
  if length(v_html) < 40 then
    raise exception 'The file looks empty.' using errcode = '22023';
  end if;
  if length(v_html) > 400000 then
    raise exception 'The file is larger than 400 KB. Gmail cuts off emails that big.'
      using errcode = '22023';
  end if;
  if v_html ~* '<script\M' then
    raise exception 'Emails cannot run scripts. Remove the <script> tags.' using errcode = '22023';
  end if;
  if v_purpose like 'auth.%' then
    if v_html !~ '\{\{\s*\.(Token|TokenHash|ConfirmationURL)\s*\}\}' then
      raise exception 'A design for a Supabase email must keep {{ .Token }}, {{ .TokenHash }} or {{ .ConfirmationURL }}, which Supabase fills in.'
        using errcode = '22023';
    end if;
  elsif v_html !~ '\{\{\s*content\s*\}\}' then
    raise exception 'Put {{content}} where the message goes. Without it the email would arrive empty.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_images, '{}'::jsonb)) <> 'object' then
    raise exception 'The images must be a list of file names and addresses.' using errcode = '22023';
  end if;

  if v_live then
    update public.email_design
       set status = 'draft', live_since = null,
           status_changed_by = (select auth.uid()), status_changed_at = now()
     where purpose = v_purpose and status = 'live';
  end if;

  insert into public.email_design (
    purpose, name, html, file_name, notes, images, status, uploaded_by,
    live_since, status_changed_by, status_changed_at)
  values (
    v_purpose, v_name, v_html,
    nullif(btrim(coalesce(p_file_name, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(p_images, '{}'::jsonb),
    case when v_live then 'live' else 'draft' end,
    (select auth.uid()),
    case when v_live then now() end,
    case when v_live then (select auth.uid()) end,
    case when v_live then now() end)
  returning id into v_id;

  perform audit.log('staff'::public.actor_type, 'settings', 'settings.email_design_uploaded',
    p_target_type => 'email_design', p_target_id => v_id, p_target_label => v_purpose,
    p_after => jsonb_build_object('purpose', v_purpose, 'name', v_name,
                                  'file_name', p_file_name, 'size_bytes', octet_length(v_html),
                                  'images', (select count(*) from jsonb_object_keys(coalesce(p_images, '{}'::jsonb))),
                                  'live', v_live));
  if v_live then
    perform audit.log('staff'::public.actor_type, 'settings', 'settings.email_design_live',
      p_target_type => 'email_design', p_target_id => v_id, p_target_label => v_purpose,
      p_before => jsonb_build_object('status', 'draft'),
      p_after => jsonb_build_object('status', 'live', 'purpose', v_purpose, 'name', v_name));
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Someone else made another design live for this email a moment ago. Reload and try again.'
      using errcode = '40001';
end;
$$;

/*
 * Make a design live (the one live before it is taken off), take it off
 * (the house design is used again), or remove it from the list. A removed
 * design stays in the table for the record and cannot come back; upload
 * the file again instead.
 */
create or replace function public.rpc_email_design_set_status(p_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.email_design;
begin
  if not authz.can_edit_email_routes() then
    raise exception 'Only a super admin or someone with full Settings access can change email designs.'
      using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('live', 'draft', 'archived') then
    raise exception 'Unknown status.' using errcode = '22023';
  end if;

  select * into v_row from public.email_design d where d.id = p_id for update;
  if not found then
    raise exception 'That design is not there any more.' using errcode = 'P0002';
  end if;
  if v_row.status = 'archived' then
    raise exception 'That design was removed. Upload the file again to use it.' using errcode = '22023';
  end if;
  if v_row.status = p_status then
    return jsonb_build_object('ok', true, 'status', p_status, 'changed', false);
  end if;

  if p_status = 'live' then
    update public.email_design
       set status = 'draft', live_since = null,
           status_changed_by = (select auth.uid()), status_changed_at = now()
     where purpose = v_row.purpose and status = 'live' and id <> v_row.id;
  end if;

  update public.email_design
     set status = p_status,
         live_since = case when p_status = 'live' then now() end,
         status_changed_by = (select auth.uid()),
         status_changed_at = now()
   where id = v_row.id;

  perform audit.log('staff'::public.actor_type, 'settings',
    case p_status when 'live' then 'settings.email_design_live'
                  when 'archived' then 'settings.email_design_archived'
                  else 'settings.email_design_taken_off' end,
    p_target_type => 'email_design', p_target_id => v_row.id, p_target_label => v_row.purpose,
    p_before => jsonb_build_object('status', v_row.status),
    p_after => jsonb_build_object('status', p_status, 'purpose', v_row.purpose,
                                  'name', v_row.name));
  return jsonb_build_object('ok', true, 'status', p_status, 'changed', true);
exception
  when unique_violation then
    raise exception 'Someone else made another design live for this email a moment ago. Reload and try again.'
      using errcode = '40001';
end;
$$;

revoke execute on function public.rpc_email_designs() from public, anon;
revoke execute on function public.rpc_email_design_html(uuid) from public, anon;
revoke execute on function public.rpc_email_overview() from public, anon;
revoke execute on function public.rpc_email_design_upload(text, text, text, text, text, jsonb, boolean) from public, anon;
revoke execute on function public.rpc_email_design_set_status(uuid, text) from public, anon;
grant execute on function public.rpc_email_designs() to authenticated;
grant execute on function public.rpc_email_design_html(uuid) to authenticated;
grant execute on function public.rpc_email_overview() to authenticated;
grant execute on function public.rpc_email_design_upload(text, text, text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.rpc_email_design_set_status(uuid, text) to authenticated;
grant execute on function public.rpc_email_design_public(text) to anon, authenticated, service_role;
