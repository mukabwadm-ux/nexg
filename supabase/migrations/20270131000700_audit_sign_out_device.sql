-- Signing out one device from the Audit log's Devices tab.
--
-- The admin account may be shared. When one of the browsers using it
-- should not be, a super admin ends that browser's sign-in sessions and
-- leaves every other device signed in. "Sign out everywhere"
-- (rpc_staff_sign_out_everywhere) already does this for a whole account;
-- this is the same thing narrowed to one device.
--
-- Ending a session deletes it from auth.sessions (its refresh tokens go
-- with it). The console checks the session with Supabase on every page
-- (requireStaff → getUser), so that browser is sent to sign-in on its
-- next click. It can sign in again if it still knows the password, which
-- is why the console says to change the password too.
--
-- Staff sessions only: a device that a merchant also used is not signed
-- out of the merchant portal by this.

create or replace function public.rpc_audit_sign_out_device(p_device_id text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := authz.staff_id();
  v_ctx jsonb := audit.fn_request_context();
  v_sessions uuid[];
  v_count integer;
  v_label text;
begin
  if v_actor is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can sign a device out.'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why this device is being signed out.' using errcode = 'check_violation';
  end if;
  if p_device_id is null or p_device_id = '' then
    raise exception 'No device given.' using errcode = 'no_data_found';
  end if;
  if p_device_id = v_ctx ->> 'device_id' then
    raise exception 'This is the browser you are using. Use Sign out instead.'
      using errcode = 'check_violation';
  end if;

  /* Every session this device was seen with: its sign-ins, and any
     session its actions carried. Staff sessions only. */
  select coalesce(array_agg(distinct s.id), '{}') into v_sessions
    from auth.sessions s
    join public.staff_user su on su.user_id = s.user_id
   where s.id in (
       select audit.fn_uuid(si.session_id) from audit.sign_in si
        where si.device_fingerprint = p_device_id and si.session_id is not null
       union
       select audit.fn_uuid(o.session_id) from audit.event_origin o
        where o.device_id = p_device_id and o.session_id is not null);

  if (v_ctx ->> 'session_id') is not null
     and audit.fn_uuid(v_ctx ->> 'session_id') = any (v_sessions) then
    raise exception 'That device is using your own session. Use Sign out instead.'
      using errcode = 'check_violation';
  end if;

  delete from auth.sessions where id = any (v_sessions);
  get diagnostics v_count = row_count;

  update audit.sign_in
     set ended_at = now(), ended_reason = 'revoked'
   where device_fingerprint = p_device_id
     and ended_at is null
     and outcome = 'success';

  select coalesce(
      (select si.device_label from audit.sign_in si
        where si.device_fingerprint = p_device_id and si.device_label is not null
        order by si.at desc limit 1),
      (select o.device_label from audit.event_origin o
        where o.device_id = p_device_id and o.device_label is not null
        order by o.event_id desc limit 1))
    into v_label;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'auth.sessions_revoked',
    p_actor_id => v_actor,
    p_target_type => 'device',
    p_target_label => coalesce(v_label, 'Device') || ' · ' || left(p_device_id, 8),
    p_after => jsonb_build_object('device_id', p_device_id, 'sessions_ended', v_count),
    p_reason => p_reason,
    p_severity => 'high'::public.audit_severity);

  return jsonb_build_object('ok', true, 'sessions_ended', v_count);
end;
$$;

revoke execute on function public.rpc_audit_sign_out_device(text, text) from public, anon;
grant execute on function public.rpc_audit_sign_out_device(text, text) to authenticated;

comment on function public.rpc_audit_sign_out_device is
  'Ends every staff sign-in session seen with one device. Super admin only, reason required, refuses the caller''s own device and session. Writes auth.sessions_revoked.';
