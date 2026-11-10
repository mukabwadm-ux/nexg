-- Letting a super admin reset another staff member's login credentials.
--
-- Mirrors rpc_staff_invite's account creation: a password is generated
-- here, written straight to auth.users, and returned once. It is never
-- stored in plain text and re-reading this call's result is not possible
-- a second time. Existing sessions are ended in the same transaction, so
-- a reset actually locks out whoever is currently signed in, not just
-- whoever signs in next.

create or replace function public.rpc_staff_reset_credentials(p_staff_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := authz.staff_id();
  v_user uuid;
  v_email text;
  v_password text;
  v_sessions integer;
begin
  if v_actor is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can reset someone else''s login.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_staff_id = v_actor then
    raise exception 'You cannot reset your own credentials this way — change your own password from your profile.'
      using errcode = 'check_violation';
  end if;

  select user_id, email into v_user, v_email from public.staff_user where id = p_staff_id;
  if v_user is null then
    raise exception 'No such staff member.' using errcode = 'no_data_found';
  end if;

  /* Same shape as the one handed out on invite: 18 random bytes, base64,
     with the characters people misread taken out. */
  v_password := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/=Il0O', 'xyzabcd');

  update auth.users
     set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
         updated_at = now(),
         /* A reset is also a recovery; nothing half-finished should
            outlive it. */
         recovery_token = '', recovery_sent_at = null,
         email_change_token_current = '', email_change_token_new = ''
   where id = v_user;

  delete from auth.sessions where user_id = v_user;
  get diagnostics v_sessions = row_count;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'staff.credentials_reset',
    p_actor_id => v_actor,
    p_target_type => 'staff_user',
    p_target_id => p_staff_id,
    p_after => jsonb_build_object('email', v_email, 'sessions_ended', v_sessions),
    p_severity => 'high'::public.audit_severity
  );

  return jsonb_build_object(
    'staff_id', p_staff_id,
    'email', v_email,
    'sessions_ended', v_sessions,
    /* Shown once. Reading this row again will not produce it. */
    'one_time_password', v_password
  );
end;
$$;

comment on function public.rpc_staff_reset_credentials(uuid) is
  'Super admin only. Issues a new one-time password for another staff member and ends their sessions. Cannot target the caller themselves.';

grant execute on function public.rpc_staff_reset_credentials(uuid) to authenticated;
