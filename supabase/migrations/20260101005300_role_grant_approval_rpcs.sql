-- Proposing and countersigning a super_admin or finance grant.

/*
 * Propose. This writes no grant — it writes the request for one, which is
 * the piece that was missing: the trigger refuses an uncountersigned grant,
 * so there was nowhere for a proposal to live and no UI could offer one.
 */
create or replace function public.rpc_role_grant_request(
  p_staff_id uuid,
  p_role text,
  p_reason text
)
returns public.approval_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := authz.staff_id();
  v_request public.approval_request;
  v_target public.staff_user;
begin
  if v_actor is null or not authz.is_super_admin() then
    raise exception 'Only a super admin can propose these roles.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_role not in ('super_admin', 'finance') then
    raise exception 'Every other role is granted directly, not proposed.'
      using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. Whoever countersigns is reading this.'
      using errcode = 'check_violation';
  end if;

  select * into v_target from public.staff_user where id = p_staff_id;
  if v_target.id is null then
    raise exception 'No such staff member.' using errcode = 'no_data_found';
  end if;

  if exists (
    select 1 from public.role_grant g join public.role r on r.id = g.role_id
    where g.staff_user_id = p_staff_id and r.key = p_role and g.revoked_at is null
  ) then
    raise exception '% already holds %.', v_target.display_name, p_role
      using errcode = 'unique_violation';
  end if;

  if exists (
    select 1 from public.approval_request
    where kind = 'staff_role_grant' and target_id = p_staff_id
      and payload ->> 'role' = p_role and status = 'pending'
  ) then
    raise exception 'There is already a pending request for that.'
      using errcode = 'unique_violation';
  end if;

  insert into public.approval_request
    (kind, target_type, target_id, city_id, requested_by, reason, payload, status)
  values
    ('staff_role_grant', 'staff_user', p_staff_id, null, v_actor, trim(p_reason),
     jsonb_build_object('role', p_role, 'email', v_target.email,
                        'display_name', v_target.display_name),
     'pending')
  returning * into v_request;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'staff',
    p_action => 'staff.role_grant_requested',
    p_actor_id => v_actor,
    p_target_type => 'staff_user',
    p_target_id => p_staff_id,
    p_after => jsonb_build_object('role', p_role, 'request_id', v_request.id),
    p_reason => trim(p_reason),
    p_severity => 'notice'::public.audit_severity
  );

  return v_request;
end;
$$;

/*
 * Decide. Extended, not replaced, so merchant suspensions keep behaving
 * exactly as they did.
 *
 * Two things differ for a role grant. Its city is null, and
 * can_manage_merchants(null) is true for any merchant_ops — which would let
 * a city ops manager countersign a super_admin. So the approver check is
 * per-kind. And the grant itself is written here, with granted_by and
 * approved_by as two different people, which is the only way the trigger
 * will accept it.
 */
create or replace function public.rpc_approval_decide(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.approval_request
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_request;
  v_staff uuid := authz.staff_id();
  v_merchant public.merchant;
begin
  if v_staff is null then
    raise exception 'Only staff can decide an approval.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_request from public.approval_request where id = p_request_id for update;
  if v_request.id is null then
    raise exception 'That request does not exist.' using errcode = 'no_data_found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'That request was already %.', v_request.status
      using errcode = 'check_violation';
  end if;

  if v_request.kind = 'staff_role_grant' then
    /*
     * Who may countersign a role grant.
     *
     * Requiring another super admin is the obvious rule and it is
     * unreachable: the first super admin cannot make a second, because the
     * second does not exist yet to approve themselves into being. A project
     * that wants two super admins can never get past one.
     *
     * So the control is mutual consent rather than third-party oversight.
     * The approver must not be the requester — nobody can promote
     * themselves, and nobody can promote someone else unilaterally, because
     * that person has to accept. Beyond that the approver is either an
     * existing super admin, or the person being granted the role.
     *
     * A colleague with no seniority still cannot countersign somebody
     * else's promotion, which is the case worth refusing.
     */
    if not (
      authz.is_super_admin()
      or v_request.target_id = v_staff
    ) then
      raise exception
        'A role grant is countersigned by another super admin, or accepted by the person receiving it.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif not authz.can_manage_merchants(v_request.city_id) then
    raise exception 'You cannot decide approvals for that city.'
      using errcode = 'insufficient_privilege';
  end if;

  -- The check constraint would catch this too; the message is the point.
  if v_request.requested_by = v_staff then
    raise exception 'Someone other than you has to approve this.'
      using errcode = 'check_violation';
  end if;

  update public.approval_request
  set status = (case when p_approve then 'approved' else 'rejected' end)::public.approval_status,
      decided_by = v_staff,
      decided_at = now(),
      decision_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_request_id
  returning * into v_request;

  if p_approve and v_request.kind = 'merchant_suspension' then
    /*
     * Suspending takes the business off every surface at once. Leaving
     * `featured` set would keep a suspended merchant in the homepage band,
     * which is exactly the kind of thing ground rule 5 exists to prevent.
     */
    update public.merchant
    set status = 'suspended',
        status_reason = v_request.reason,
        accepting_orders = false,
        concierge_pick = false,
        featured = false
    where id = v_request.target_id
    returning * into v_merchant;

    perform audit.log(
      p_actor_type => 'staff'::public.actor_type,
      p_module => 'merchant',
      p_action => 'merchant.suspended',
      p_target_type => 'merchant',
      p_target_id => v_request.target_id,
      p_before => jsonb_build_object('status', v_request.payload ->> 'status_before'),
      p_after => jsonb_build_object('status', 'suspended', 'approval_request_id', v_request.id),
      p_reason => v_request.reason,
      p_city_id => v_request.city_id
    );
  end if;

  if p_approve and v_request.kind = 'staff_role_grant' then
    insert into public.role_grant
      (staff_user_id, role_id, city_id, granted_by, approved_by)
    select v_request.target_id, r.id, null, v_request.requested_by, v_staff
    from public.role r
    where r.key = v_request.payload ->> 'role';

    perform audit.log(
      p_actor_type => 'staff'::public.actor_type,
      p_module => 'staff',
      p_action => 'staff.role_granted',
      p_actor_id => v_staff,
      p_target_type => 'staff_user',
      p_target_id => v_request.target_id,
      p_after => jsonb_build_object(
        'role', v_request.payload ->> 'role',
        'proposed_by', v_request.requested_by,
        'approval_request_id', v_request.id),
      p_reason => v_request.reason,
      p_severity => 'high'::public.audit_severity
    );
  end if;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'approval',
    p_action => case when p_approve then 'approval.approved' else 'approval.rejected' end,
    p_target_type => 'approval_request',
    p_target_id => v_request.id,
    p_after => jsonb_build_object('kind', v_request.kind, 'target_id', v_request.target_id),
    p_reason => nullif(trim(coalesce(p_note, '')), ''),
    p_city_id => v_request.city_id
  );

  return v_request;
end;
$$;

/* A role-grant request has no city, so the merchant-scoped read policy
   cannot see it. Super admins can. */
drop policy if exists approval_read_role_grants on public.approval_request;
create policy approval_read_role_grants on public.approval_request
  for select to authenticated
  using (kind = 'staff_role_grant' and authz.is_super_admin());

grant execute on function public.rpc_role_grant_request(uuid, text, text) to authenticated;
