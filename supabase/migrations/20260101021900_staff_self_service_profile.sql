-- Staff self-service: profile details, profile photo, work email, password.
--
-- Everything here acts on the caller's own staff_user row, found through
-- authz.staff_id() - never through an id the client supplies - so nobody can
-- edit a colleague's profile through these. Roles, status and city scope are
-- untouched: those stay with a super admin.

alter table public.staff_user
  add column if not exists avatar_path text,
  add column if not exists phone text,
  add column if not exists job_title text,
  add column if not exists bio text,
  add column if not exists timezone text not null default 'Africa/Nairobi';

alter table public.staff_user
  add constraint staff_user_profile_lengths check (
    char_length(coalesce(phone, '')) <= 30
    and char_length(coalesce(job_title, '')) <= 80
    and char_length(coalesce(bio, '')) <= 500
  );

-- ───────────────────────────────────────────────────────── profile photos

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-avatars', 'staff-avatars', false, 2 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/* Path layout: {auth user id}/{uuid}. A person writes only inside their own
   folder; any active staff member can read, so colleagues see each other. */
create policy staff_avatars_own_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and authz.staff_id() is not null
  );

create policy staff_avatars_own_update on storage.objects
  for update to authenticated
  using (bucket_id = 'staff-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'staff-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy staff_avatars_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'staff-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy staff_avatars_staff_read on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-avatars' and authz.staff_id() is not null);

-- ───────────────────────────────────────────────────────────── my profile

create or replace function public.rpc_my_staff_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'staff_id', s.id, 'email', s.email, 'display_name', s.display_name,
    'phone', s.phone, 'job_title', s.job_title, 'bio', s.bio,
    'timezone', s.timezone, 'avatar_path', s.avatar_path)
  from public.staff_user s
  where s.id = authz.staff_id();
$$;

create or replace function public.rpc_my_staff_profile_update(
  p_display_name text,
  p_phone text default null,
  p_job_title text default null,
  p_bio text default null,
  p_timezone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
begin
  if v_me is null then
    raise exception 'Sign in as staff first.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'Your name cannot be empty - the audit trail uses it.'
      using errcode = 'check_violation';
  end if;
  if p_timezone is not null and not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown time zone.' using errcode = 'check_violation';
  end if;

  update public.staff_user
     set display_name = trim(p_display_name),
         phone = nullif(trim(p_phone), ''),
         job_title = nullif(trim(p_job_title), ''),
         bio = nullif(trim(p_bio), ''),
         timezone = coalesce(p_timezone, timezone)
   where id = v_me;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'staff',
    p_action => 'staff.profile_updated', p_actor_id => v_me,
    p_target_type => 'staff_user', p_target_id => v_me,
    p_severity => 'info'::public.audit_severity);

  return public.rpc_my_staff_profile();
end;
$$;

/* The photo is uploaded by the browser first; this records where it went.
   The path must sit inside the caller's own folder, so it cannot point at
   somebody else's picture. Passing null removes the photo. */
create or replace function public.rpc_my_staff_avatar_set(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_old text;
begin
  if v_me is null then
    raise exception 'Sign in as staff first.' using errcode = 'insufficient_privilege';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'That file is not in your folder.' using errcode = 'insufficient_privilege';
  end if;

  select avatar_path into v_old from public.staff_user where id = v_me;
  update public.staff_user set avatar_path = p_path where id = v_me;

  /* Tidy the replaced file; the policy already limits this to the owner. */
  if v_old is not null and v_old is distinct from p_path then
    delete from storage.objects where bucket_id = 'staff-avatars' and name = v_old;
  end if;

  return p_path;
end;
$$;

-- ───────────────────────────────────────────────────────────── work email

/*
 * Changing the sign-in email. There is no mail provider, so no confirmation
 * link: the proof of ownership is the current password, checked here against
 * the stored hash. The domain rule (STAFF_EMAIL_DOMAIN) is applied by the app,
 * because the domain is configuration rather than schema.
 */
create or replace function public.rpc_my_staff_email_change(
  p_new_email text,
  p_current_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_user uuid := (select auth.uid());
  v_new text := lower(trim(p_new_email));
  v_old text;
begin
  if v_me is null then
    raise exception 'Sign in as staff first.' using errcode = 'insufficient_privilege';
  end if;
  if v_new !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That is not an email address.' using errcode = 'check_violation';
  end if;

  select email into v_old from public.staff_user where id = v_me;
  if v_old = v_new then
    raise exception 'That is already your email.' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from auth.users u
     where u.id = v_user
       and u.encrypted_password = extensions.crypt(p_current_password, u.encrypted_password)
  ) then
    raise exception 'Your current password is not right.' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from public.staff_user where email = v_new)
     or exists (select 1 from auth.users where lower(email) = v_new) then
    raise exception 'Another account already uses that email.' using errcode = 'unique_violation';
  end if;

  update auth.users
     set email = v_new, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
   where id = v_user;

  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', v_new), updated_at = now()
   where user_id = v_user and provider = 'email';

  update public.staff_user set email = v_new where id = v_me;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'staff',
    p_action => 'staff.email_changed', p_actor_id => v_me,
    p_target_type => 'staff_user', p_target_id => v_me,
    p_before => jsonb_build_object('email', v_old),
    p_after => jsonb_build_object('email', v_new),
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('email', v_new);
end;
$$;

revoke execute on function public.rpc_my_staff_profile() from public, anon;
revoke execute on function public.rpc_my_staff_profile_update(text, text, text, text, text) from public, anon;
revoke execute on function public.rpc_my_staff_avatar_set(text) from public, anon;
revoke execute on function public.rpc_my_staff_email_change(text, text) from public, anon;
grant execute on function public.rpc_my_staff_profile() to authenticated;
grant execute on function public.rpc_my_staff_profile_update(text, text, text, text, text) to authenticated;
grant execute on function public.rpc_my_staff_avatar_set(text) to authenticated;
grant execute on function public.rpc_my_staff_email_change(text, text) to authenticated;
