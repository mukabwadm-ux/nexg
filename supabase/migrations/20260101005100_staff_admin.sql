-- Adding a colleague, from the console instead of from SQL.
--
-- Until now the only way to create a staff account was to paste
-- bootstrap-staff.sql into the Supabase editor. That is fine once; it is not
-- a way to run a team, and it means the person doing it needs database
-- credentials to do something that should need a role.

-- ─────────────────────────────────────────────── the first super admin

/*
 * A bootstrap exception, and only one.
 *
 * super_admin needs a second approver, which is right — it is the role that
 * can rewrite commission rates and promote anyone, so one compromised
 * account should not be able to reach it alone. But the rule made the first
 * one impossible: with nobody else on the project there is nobody to
 * approve, and the console's own staff page needs super_admin to be usable.
 *
 * So: when no active super_admin exists anywhere, one self-granted grant is
 * allowed. The moment it lands the exception closes and the two-person rule
 * applies forever. The audit row says which kind it was, because "the first
 * one let itself in" is exactly the sort of thing that should be visible
 * years later rather than inferred.
 */
create or replace function public.tg_role_grant_requires_second_approver()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role_key text;
  v_bootstrap boolean := false;
begin
  select key into v_role_key from public.role where id = new.role_id;

  if v_role_key not in ('finance', 'super_admin') then
    return new;
  end if;

  if v_role_key = 'super_admin' then
    select not exists (
      select 1
      from public.role_grant g
      join public.role r on r.id = g.role_id
      where r.key = 'super_admin'
        and g.revoked_at is null
        and (g.expires_at is null or g.expires_at > now())
    ) into v_bootstrap;
  end if;

  if v_bootstrap then
    raise notice
      'Granting the first super_admin on this project without a second approver. Every later one needs two people.';
    return new;
  end if;

  if new.approved_by is null then
    raise exception
      'A % grant requires a second approver (approved_by).', v_role_key
      using errcode = 'check_violation';
  end if;

  if new.approved_by = new.granted_by then
    raise exception
      'A % grant must be approved by someone other than the person granting it.', v_role_key
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.tg_role_grant_requires_second_approver is
  'finance and super_admin need a second approver. The single exception is the first super_admin on a project, who has nobody to ask; after that the rule is absolute.';

-- ─────────────────────────────────────────────── inviting a colleague

/*
 * Creating the login without a service role key.
 *
 * The console deliberately holds no service role key — it reads as the
 * signed-in staff member and nothing more, which is what makes it safe to
 * put on the internet. But creating an auth user normally needs one.
 *
 * A security-definer function is the way through: it runs as its owner, so
 * it can write auth.users, and it polices itself. It grants nothing a
 * super_admin did not already have — they can write staff_user and
 * role_grant directly — it just does the three steps in one.
 *
 * The password is generated here and returned once. There is no mail
 * provider on this project, so an invitation email is not an option; the
 * admin reads the password out and the colleague changes it on first
 * sign-in. It is never stored in plain text.
 */
create or replace function public.rpc_staff_invite(
  p_email text,
  p_display_name text,
  p_roles text[] default array['merchant_ops', 'rider_ops']
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_actor uuid := authz.staff_id();
  v_user uuid;
  v_staff uuid;
  v_password text;
  v_granted text[];
begin
  if v_actor is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can add staff.' using errcode = 'insufficient_privilege';
  end if;

  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That is not an email address.' using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'Give them a name, so the audit trail reads like people.'
      using errcode = 'check_violation';
  end if;

  /* finance and super_admin are not handed out here — they go through
     rpc_role_grant_request and a second pair of eyes. */
  if p_roles && array['super_admin', 'finance'] then
    raise exception 'super_admin and finance are requested, not granted. Add them after the account exists.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.staff_user where email = v_email) then
    raise exception 'There is already a staff account for %.', v_email
      using errcode = 'unique_violation';
  end if;

  select id into v_user from auth.users where lower(email) = v_email;

  if v_user is null then
    /*
     * Base64 of 18 random bytes, with the characters people misread taken
     * out. Long enough that the shortening does not matter.
     */
    v_password := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=Il0O', 'xyzabcd');

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change,
      email_change_token_new, email_change_token_current,
      phone_change, phone_change_token, reauthentication_token
    )
    values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(),
      'authenticated', 'authenticated', v_email,
      extensions.crypt(v_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', trim(p_display_name)),
      '', '', '', '', '', '', '', ''
    )
    returning id into v_user;
  end if;

  insert into public.staff_user (user_id, email, display_name)
  values (v_user, v_email, trim(p_display_name))
  returning id into v_staff;

  insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
  select v_staff, r.id, null, v_actor
  from public.role r
  where r.key = any (p_roles)
    and r.key not in ('super_admin', 'finance');

  select array_agg(r.key order by r.key) into v_granted
  from public.role_grant g join public.role r on r.id = g.role_id
  where g.staff_user_id = v_staff and g.revoked_at is null;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'staff.invited',
    p_actor_id => v_actor,
    p_target_type => 'staff_user',
    p_target_id => v_staff,
    p_after => jsonb_build_object('email', v_email, 'roles', v_granted),
    p_severity => 'notice'::public.audit_severity
  );

  return jsonb_build_object(
    'staff_id', v_staff,
    'email', v_email,
    'roles', v_granted,
    /* Shown once. Reading this row again will not produce it. */
    'one_time_password', v_password
  );
end;
$$;

-- ─────────────────────────────────────────────── changing what they may do

create or replace function public.rpc_staff_set_roles(
  p_staff_id uuid,
  p_roles text[]
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := authz.staff_id();
  v_before text[];
  v_after text[];
begin
  if v_actor is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can change roles.' using errcode = 'insufficient_privilege';
  end if;

  if p_roles && array['super_admin', 'finance'] then
    raise exception 'super_admin and finance go through an approval, not this.'
      using errcode = 'check_violation';
  end if;

  select array_agg(r.key order by r.key) into v_before
  from public.role_grant g join public.role r on r.id = g.role_id
  where g.staff_user_id = p_staff_id and g.revoked_at is null;

  /*
   * Revoked, never deleted. A role somebody used to hold is part of why the
   * audit trail reads the way it does, and deleting the grant would make
   * last month's actions look like they came from nowhere.
   *
   * super_admin and finance are left alone: they were countersigned, and
   * this call is not the place to undo that.
   */
  update public.role_grant g
  set revoked_at = now()
  from public.role r
  where r.id = g.role_id
    and g.staff_user_id = p_staff_id
    and g.revoked_at is null
    and r.key not in ('super_admin', 'finance')
    and not (r.key = any (p_roles));

  insert into public.role_grant (staff_user_id, role_id, city_id, granted_by)
  select p_staff_id, r.id, null, v_actor
  from public.role r
  where r.key = any (p_roles)
    and r.key not in ('super_admin', 'finance')
    and not exists (
      select 1 from public.role_grant g
      where g.staff_user_id = p_staff_id and g.role_id = r.id
        and g.city_id is null and g.revoked_at is null
    );

  select array_agg(r.key order by r.key) into v_after
  from public.role_grant g join public.role r on r.id = g.role_id
  where g.staff_user_id = p_staff_id and g.revoked_at is null;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'staff.roles_changed',
    p_actor_id => v_actor,
    p_target_type => 'staff_user',
    p_target_id => p_staff_id,
    p_before => jsonb_build_object('roles', v_before),
    p_after => jsonb_build_object('roles', v_after),
    p_severity => 'notice'::public.audit_severity
  );

  return v_after;
end;
$$;

/*
 * Suspending someone. Not deleting them: has_role already checks
 * status = 'active', so a suspension takes effect on their next request
 * while every row they touched keeps pointing at a person who exists.
 */
create or replace function public.rpc_staff_set_status(
  p_staff_id uuid,
  p_status public.staff_status,
  p_reason text default null
)
returns public.staff_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := authz.staff_id();
  v_before public.staff_status;
begin
  if v_actor is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can suspend staff.' using errcode = 'insufficient_privilege';
  end if;

  if p_staff_id = v_actor then
    raise exception 'You cannot suspend your own account — ask another admin.'
      using errcode = 'check_violation';
  end if;

  select status into v_before from public.staff_user where id = p_staff_id;
  if v_before is null then
    raise exception 'No such staff member.' using errcode = 'no_data_found';
  end if;

  update public.staff_user set status = p_status where id = p_staff_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'staff.status_changed',
    p_actor_id => v_actor,
    p_target_type => 'staff_user',
    p_target_id => p_staff_id,
    p_before => jsonb_build_object('status', v_before),
    p_after => jsonb_build_object('status', p_status),
    p_reason => nullif(trim(p_reason), ''),
    p_severity => 'high'::public.audit_severity
  );

  return p_status;
end;
$$;

grant execute on function public.rpc_staff_invite(text, text, text[]) to authenticated;
grant execute on function public.rpc_staff_set_roles(uuid, text[]) to authenticated;
grant execute on function public.rpc_staff_set_status(uuid, public.staff_status, text) to authenticated;
