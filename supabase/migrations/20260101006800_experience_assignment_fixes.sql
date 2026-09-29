-- Two bugs in who a day can be given to, both found by sending one.
--
-- 1. fn_pick_concierge chose from concierge_shift and checked only that
--    the person was online with spare capacity. Nothing checked that they
--    can reach the Experiences module at all — so a day was handed to a
--    rider-ops account, who then could not open it. A plan assigned to
--    somebody who cannot see it is worse than an unassigned one: the
--    unassigned queue is watched, and that plan is not in it.
--
-- 2. rpc_claim_plan let only a super admin or a concierge lead take over
--    a day already with someone else, but authz.works_plan has always
--    included ops_manager. So an ops manager could confirm blocks, quote
--    and take payment on a plan, and could not pick it up. The two rules
--    disagreed; this makes taking over match working it.

create or replace function public.fn_pick_concierge(p_city_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.staff_user_id
  from public.concierge_shift s
  join public.staff_user su on su.id = s.staff_user_id and su.status = 'active'
  left join lateral (
    select count(*) as live
    from public.plan p
    where p.concierge_id = s.staff_user_id
      and p.status in ('sent', 'confirming', 'quoted', 'changes_requested')
  ) load on true
  where s.city_id = p_city_id
    and s.online
    and load.live < s.capacity
    /*
     * And they can actually open it. Being on shift is a statement of
     * availability; it is not a grant, and the matrix is what says who
     * works this desk.
     */
    and exists (
      select 1
      from public.role_grant rg
      join public.role r on r.id = rg.role_id
      join public.role_module_access a
        on a.role_key = r.key and a.module_key = 'experiences' and a.level <> 'none'
      where rg.staff_user_id = s.staff_user_id
        and rg.revoked_at is null
        and (rg.expires_at is null or rg.expires_at > now())
        and (rg.city_id is null or rg.city_id = p_city_id)
    )
  order by load.live, s.since
  limit 1
$$;

comment on function public.fn_pick_concierge is
  'The next concierge for a city: online, with spare capacity, and whose roles actually reach the Experiences module. Null when nobody qualifies — the plan waits in the queue and the lead is paged.';

create or replace function public.rpc_claim_plan(p_plan_id uuid)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_plan public.plan;
  v_may_take_over boolean;
begin
  select * into v_plan from public.plan where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'No such day.' using errcode = 'no_data_found';
  end if;

  if v_me is null or not (
    authz.is_super_admin()
    or authz.has_role('concierge_agent', v_plan.city_id)
    or authz.has_role('concierge_lead', v_plan.city_id)
    or authz.has_role('ops_manager', v_plan.city_id)
  ) then
    raise exception 'You do not work the experiences desk.'
      using errcode = 'insufficient_privilege';
  end if;

  /*
   * The same people who may work a day may take it over. Anyone else
   * taking one that is already with a colleague is a handover, and a
   * handover carries a reason.
   */
  v_may_take_over :=
    authz.is_super_admin()
    or authz.has_role('concierge_lead', v_plan.city_id)
    or authz.has_role('ops_manager', v_plan.city_id);

  if v_plan.concierge_id is not null and v_plan.concierge_id <> v_me
     and not v_may_take_over then
    raise exception 'This day is with % — ask them, or a lead can move it.',
      coalesce((select display_name from public.staff_user where id = v_plan.concierge_id),
               'somebody else')
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.plan_assignment_event (plan_id, from_concierge_id, to_concierge_id, reason)
  values (p_plan_id, v_plan.concierge_id, v_me,
          case when v_plan.concierge_id is null or v_plan.concierge_id = v_me
               then 'Claimed' else 'Taken over' end);

  update public.plan
  set concierge_id = v_me,
      claimed_at = now(),
      status = case when status = 'sent' then 'confirming'::public.plan_status else status end
  where id = p_plan_id
  returning * into v_plan;

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan.claimed',
    p_target_type => 'plan', p_target_id => p_plan_id, p_city_id => v_plan.city_id);

  return v_plan;
end;
$$;

/*
 * Nobody currently on shift may be able to reach the module, which is
 * the state the first bug created and left behind. Take those rows off
 * shift rather than leaving them to be picked again.
 */
update public.concierge_shift s
set online = false
where s.online
  and not exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    join public.role_module_access a
      on a.role_key = r.key and a.module_key = 'experiences' and a.level <> 'none'
    where rg.staff_user_id = s.staff_user_id
      and rg.revoked_at is null
      and (rg.city_id is null or rg.city_id = s.city_id)
  );

/* And hand back any day that was given to one of them. */
update public.plan p
set concierge_id = null
where p.concierge_id is not null
  and p.status in ('sent', 'confirming', 'quoted', 'changes_requested')
  and not exists (
    select 1
    from public.role_grant rg
    join public.role r on r.id = rg.role_id
    join public.role_module_access a
      on a.role_key = r.key and a.module_key = 'experiences' and a.level <> 'none'
    where rg.staff_user_id = p.concierge_id
      and rg.revoked_at is null
      and (rg.city_id is null or rg.city_id = p.city_id)
  );
