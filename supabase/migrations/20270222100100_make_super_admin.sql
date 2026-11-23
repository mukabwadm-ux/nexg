-- Make admin: a super admin makes another person super admin in one step.
--
-- The owner asked for it (2026-11-22): on Staff & roles, "Make admin"
-- grants Super admin at once, instead of "Propose Super admin" and waiting
-- for a second person to accept.
--
-- What this gives up, stated rather than hidden: one super admin account,
-- if stolen or misused, can now make more super admins without anyone
-- agreeing. The owner chose that, with two things kept around it:
--
--   * a confirm step in the console before the grant;
--   * an email to every other active super admin, naming who made whom
--     admin, when, and from which device and IP (template
--     staff_super_admin_made, Settings > Email routing: staff_alerts).
--
-- Kept: nobody can make themselves admin; the person must be active staff;
-- only an active super admin can call it. The grant, the device and the IP
-- go in the audit trail (audit.log records the origin of the call itself).
-- Dropped by the owner's choice: the maximum of 3 super admins (it was only
-- ever shown on the screen; nothing enforced it).
--
-- Finance still needs a second person: the trigger keeps refusing a one-step
-- finance grant, and the Propose Finance flow is unchanged.
--
-- How the trigger lets it through: rpc_staff_make_super_admin sets a
-- transaction-local setting naming the granter, and the trigger accepts a
-- super_admin grant without a second approver only when that setting names
-- the row's granted_by AND that person is an active super admin. A setting
-- alone, however it got there, cannot let anyone else in.
--
-- Rollback:
--   drop function public.rpc_staff_make_super_admin(uuid, text);
--   re-run public.tg_role_grant_requires_second_approver from
--     20260101005100_staff_admin.sql;
--   delete from audit.action_registry where action = 'staff.super_admin_made';

-- ═══════════════════════════════════════════════════════════ the trigger

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

  /*
   * Make admin (rpc_staff_make_super_admin): one step, by an active super
   * admin, never for themselves. The setting is local to the RPC's
   * transaction; the checks below do not trust it on its own.
   */
  if v_role_key = 'super_admin'
     and new.approved_by is null
     and new.staff_user_id <> new.granted_by
     and current_setting('nexg.one_step_super_admin', true) = new.granted_by::text
     and exists (
       select 1
       from public.role_grant g
       join public.role r on r.id = g.role_id
       join public.staff_user su on su.id = g.staff_user_id
       where g.staff_user_id = new.granted_by
         and su.status = 'active'
         and r.key = 'super_admin'
         and g.revoked_at is null
         and (g.expires_at is null or g.expires_at > now())
     ) then
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
  'finance always needs a second approver. super_admin needs one too, except the first on a project and a grant made through rpc_staff_make_super_admin (one step, by another active super admin, emailed to the other super admins).';

-- ═══════════════════════════════════════════════════════════ make admin

create or replace function public.rpc_staff_make_super_admin(
  p_staff_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := authz.staff_id();
  v_me public.staff_user;
  v_target public.staff_user;
  v_role uuid;
  v_grant uuid;
  v_origin jsonb := audit.fn_request_context();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_where text;
  v_when text := to_char(now() at time zone 'Africa/Nairobi', 'DD Mon YYYY HH24:MI') || ' (Nairobi)';
  v_subject text;
  v_body text;
  v_other record;
  v_sent integer := 0;
begin
  if v_actor is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can make someone admin.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_staff_id = v_actor then
    raise exception 'Nobody can make themselves admin.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_me from public.staff_user where id = v_actor;

  -- Locked, so two presses at once make one grant.
  select * into v_target from public.staff_user where id = p_staff_id for update;
  if v_target.id is null then
    raise exception 'No such staff member.' using errcode = 'no_data_found';
  end if;
  if v_target.status <> 'active' then
    raise exception '% is not active. Reactivate them first.', v_target.display_name
      using errcode = 'check_violation';
  end if;

  select id into v_role from public.role where key = 'super_admin';

  if exists (
    select 1 from public.role_grant g
    where g.staff_user_id = p_staff_id and g.role_id = v_role
      and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
  ) then
    raise exception '% is already a super admin.', v_target.display_name
      using errcode = 'unique_violation';
  end if;

  perform set_config('nexg.one_step_super_admin', v_actor::text, true);

  /* An expired grant still counts as live for the unique index; close it. */
  update public.role_grant
     set revoked_at = now()
   where staff_user_id = p_staff_id and role_id = v_role and revoked_at is null;

  insert into public.role_grant (staff_user_id, role_id, city_id, granted_by, approved_by)
  values (p_staff_id, v_role, null, v_actor, null)
  returning id into v_grant;

  perform set_config('nexg.one_step_super_admin', '', true);

  /* Someone else's proposal for the same thing is now moot. (Your own
     cannot be closed by you: approval_needs_a_second_person. It stays
     pending and is refused if anyone later tries to accept it.) */
  update public.approval_request
     set status = 'withdrawn',
         decided_by = v_actor,
         decided_at = now(),
         decision_note = 'Made admin directly.'
   where kind = 'staff_role_grant' and target_id = p_staff_id
     and payload ->> 'role' = 'super_admin' and status = 'pending'
     and requested_by <> v_actor;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'staff.super_admin_made',
    p_actor_id => v_actor,
    p_target_type => 'staff_user',
    p_target_id => p_staff_id,
    p_target_label => v_target.display_name,
    p_after => jsonb_build_object('role', 'super_admin', 'role_grant_id', v_grant,
      'one_step', true),
    p_reason => v_reason,
    p_severity => 'high'::public.audit_severity
  );

  -- Tell every other active super admin.
  v_where := concat_ws(' · ',
    v_origin ->> 'device_label',
    case when v_origin ? 'ip' then 'IP ' || (v_origin ->> 'ip') end);
  v_subject := v_me.display_name || ' made ' || v_target.display_name || ' a super admin';
  v_body := v_me.display_name || ' made ' || v_target.display_name || ' (' || v_target.email
    || E') a super admin on the NexG console.\n\n'
    || 'When: ' || v_when || E'\n'
    || 'From: ' || coalesce(nullif(v_where, ''), 'device and IP not recorded') || E'\n'
    || coalesce('Why: ' || v_reason || E'\n', '')
    || E'\nIf you did not expect this, check Staff & roles and the audit trail now: '
    || E'https://admin.nexgapp.com/staff\n\n— NexG\n';

  for v_other in
    select distinct su.id, su.email, su.display_name
    from public.role_grant g
    join public.role r on r.id = g.role_id
    join public.staff_user su on su.id = g.staff_user_id
    where r.key = 'super_admin'
      and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
      and su.status = 'active'
      and su.id not in (v_actor, p_staff_id)
  loop
    if public.fn_notify_enqueue(
      p_channel => 'email',
      p_recipient => v_other.email,
      p_template => 'staff_super_admin_made',
      p_subject => v_subject,
      p_body => v_body,
      p_payload => jsonb_build_object(
        'kind', 'staff.super_admin_made',
        'staff_id', p_staff_id,
        'granted_by', v_actor,
        'content', jsonb_build_object(
          'title', v_subject,
          'greeting', 'Hi ' || split_part(coalesce(v_other.display_name, ''), ' ', 1) || ',',
          'intro', v_me.display_name || ' made ' || v_target.display_name
            || ' a super admin. Nobody else had to agree, so you are hearing about it here.',
          'steps', jsonb_build_array(
            'When: ' || v_when,
            'From: ' || coalesce(nullif(v_where, ''), 'device and IP not recorded'),
            'Who: ' || v_target.display_name || ' (' || v_target.email || ')'),
          'action', jsonb_build_object('label', 'Open Staff & roles',
            'url', 'https://admin.nexgapp.com/staff'),
          'closing', 'If you did not expect this, check the audit trail now.',
          'preheader', v_subject)),
      /* It names staff, never a customer. */
      p_sensitive => false) is not null then
      v_sent := v_sent + 1;
    end if;
  end loop;

  return jsonb_build_object('granted', true, 'role_grant_id', v_grant, 'notified', v_sent);
end;
$$;

comment on function public.rpc_staff_make_super_admin(uuid, text) is
  'Make admin: an active super admin makes another active staff member super admin in one step. Never themselves. Audited (with device and IP) and emailed to the other super admins.';

revoke all on function public.rpc_staff_make_super_admin(uuid, text) from public, anon;
grant execute on function public.rpc_staff_make_super_admin(uuid, text) to authenticated;
alter function public.rpc_staff_make_super_admin(uuid, text) set statement_timeout = '5s';

-- ═══════════════════════════════════════════════════════════════ audit

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, pii_fields, description)
values
  ('staff.super_admin_made', 'staff', 'high', true, false, false, '{}',
   'A super admin made another staff member super admin in one step (Make admin); the other super admins were emailed')
on conflict (action) do nothing;
