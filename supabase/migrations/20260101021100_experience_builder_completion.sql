create or replace function public.fn_plan_view(p_plan_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', (
      select to_jsonb(x) from (
        select
          p.id, p.reference, p.status, p.duration, p.party_type, p.party_size,
          p.date, p.end_date, p.budget_kes, p.moods, p.answers, p.notes, p.stay_label,
          p.estimate_total_kes, p.quote_total_kes, p.pay_on_day_total_kes,
          p.concierge_fee_kes, p.expires_at, p.guest_name, p.guest_phone,
          p.curated_day_id, p.city_id,
          s.display_name as concierge_name
        from public.plan p
        left join public.staff_user s on s.id = p.concierge_id
        where p.id = p_plan_id
      ) x
    ),
    'blocks', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.sort) from (
        select
          pb.id, pb.slot, pb.start_time, pb.end_time, pb.kind, pb.component_id,
          pb.event_id, pb.title_snapshot, pb.subtitle_snapshot,
          pb.price_estimate_kes, pb.price_quoted_kes, pb.pay_on_day,
          pb.included_by, pb.anchored, pb.swap_group, pb.status,
          pb.change_note, pb.changed_from, pb.hold_status, pb.sort,
          coalesce((
            select jsonb_agg(to_jsonb(o)) from public.fn_swap_options(pb.id) o
          ), '[]'::jsonb) as swaps,
          case
            when pb.kind = 'transport' then 'transport'
            when pb.event_id is not null then 'events'
            else k.mood::text
          end as mood
        from public.plan_block pb
        left join public.experience_component k on k.id = pb.component_id
        where pb.plan_id = p_plan_id and pb.status <> 'removed'
      ) b
    ), '[]'::jsonb),
    'totals', coalesce((
      select jsonb_object_agg(t.mood, t.total_kes) from public.fn_plan_totals(p_plan_id) t
    ), '{}'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at) from (
        select pm.id, pm.author_type, pm.body, pm.created_at,
               s.display_name as author_name
        from public.plan_message pm
        left join public.staff_user s
          on s.id = pm.author_id and pm.author_type = 'staff'
        where pm.plan_id = p_plan_id
      ) m
    ), '[]'::jsonb)
  )
$$;

create or replace function public.fn_fit_budget(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_total bigint;
  v_target record;
  v_alt record;
  v_guard integer := 0;
begin
  select * into v_plan from public.plan where id = p_plan_id;

  if v_plan.budget_kes is null then
    return;
  end if;

  if to_regclass('pg_temp._avail') is null then
    perform public.fn_load_available(p_plan_id);
  end if;

  loop
    v_guard := v_guard + 1;
    exit when v_guard > 24;

    select coalesce(sum(coalesce(price_estimate_kes, 0)), 0) into v_total
    from public.plan_block
    where plan_id = p_plan_id and status = 'proposed' and included_by is null;

    if v_total > v_plan.budget_kes then
      select b.id, k.tier, b.swap_group, b.price_estimate_kes
      into v_target
      from public.plan_block b
      join public.experience_component k on k.id = b.component_id
      where b.plan_id = p_plan_id
        and b.status = 'proposed'
        and b.swap_group is not null
        and exists (
          select 1 from _avail c
          where c.swap_group = b.swap_group
            and c.tier < k.tier
            and coalesce(
              public.fn_component_cost(c.price_kes, c.price_basis, v_plan.party_size), 0
            ) < coalesce(b.price_estimate_kes, 0)
        )
      order by b.price_estimate_kes desc nulls last, b.id
      limit 1;

      exit when not found;

      select c.* into v_alt
      from _avail c
      where c.swap_group = v_target.swap_group
        and c.tier < v_target.tier
        and coalesce(
          public.fn_component_cost(c.price_kes, c.price_basis, v_plan.party_size), 0
        ) < coalesce(v_target.price_estimate_kes, 0)
      order by c.tier desc
      limit 1;

      exit when not found;
    elsif (v_plan.budget_kes - v_total) * 4 >= v_plan.budget_kes then
      select b.id, k.tier, b.swap_group, b.price_estimate_kes
      into v_target
      from public.plan_block b
      join public.experience_component k on k.id = b.component_id
      where b.plan_id = p_plan_id
        and b.status = 'proposed'
        and b.swap_group is not null
        and exists (
          select 1
          from _avail c
          where c.swap_group = b.swap_group
            and c.tier > k.tier
            and public.fn_component_cost(c.price_kes, c.price_basis, v_plan.party_size) is not null
            and public.fn_component_cost(c.price_kes, c.price_basis, v_plan.party_size)
              > coalesce(b.price_estimate_kes, 0)
            and v_total - coalesce(b.price_estimate_kes, 0)
              + public.fn_component_cost(c.price_kes, c.price_basis, v_plan.party_size)
              <= v_plan.budget_kes
        )
      order by coalesce(b.price_estimate_kes, 0), b.id
      limit 1;

      exit when not found;

      select c.* into v_alt
      from _avail c
      where c.swap_group = v_target.swap_group
        and c.tier > v_target.tier
        and public.fn_component_cost(c.price_kes, c.price_basis, v_plan.party_size) is not null
        and public.fn_component_cost(c.price_kes, c.price_basis, v_plan.party_size)
          > coalesce(v_target.price_estimate_kes, 0)
        and v_total - coalesce(v_target.price_estimate_kes, 0)
          + public.fn_component_cost(c.price_kes, c.price_basis, v_plan.party_size)
          <= v_plan.budget_kes
      order by c.tier
      limit 1;

      exit when not found;
    else
      exit;
    end if;

    update public.plan_block set
      component_id = v_alt.id,
      title_snapshot = v_alt.title,
      subtitle_snapshot = v_alt.subtitle,
      price_estimate_kes = public.fn_component_cost(
        v_alt.price_kes, v_alt.price_basis, v_plan.party_size),
      pay_on_day = v_alt.pay_on_day,
      slot = v_alt.default_slot,
      start_time = public.fn_block_time(
        v_alt.default_slot, v_alt.earliest_start, v_alt.latest_start),
      end_time = public.fn_block_time(
        v_alt.default_slot, v_alt.earliest_start, v_alt.latest_start)
        + make_interval(mins => v_alt.duration_min)
    where id = v_target.id;
  end loop;
end;
$$;

create or replace function public.rpc_send_plan(
  p_plan_id uuid,
  p_guest_name text default null,
  p_guest_phone text default null
)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_concierge uuid;
  v_blocks integer;
  v_request_only boolean;
begin
  select * into v_plan from public.plan where id = p_plan_id;

  if v_plan.id is null or v_plan.user_id is distinct from (select auth.uid()) then
    raise exception 'That day is not yours to send.' using errcode = 'insufficient_privilege';
  end if;

  if v_plan.status <> 'draft' then
    return v_plan;
  end if;

  select count(*) into v_blocks
  from public.plan_block
  where plan_id = p_plan_id and kind <> 'free' and status <> 'removed';

  v_request_only := v_blocks = 0;
  if v_request_only
     and (
       v_plan.budget_kes is null
       or (cardinality(v_plan.moods) = 0 and coalesce(trim(v_plan.notes), '') = '')
     ) then
    raise exception 'Choose a mood or add a note, and set a budget before asking for options.'
      using errcode = 'check_violation';
  end if;

  if coalesce(trim(p_guest_phone), coalesce(trim(v_plan.guest_phone), '')) = '' then
    raise exception 'We need a phone number so a concierge can reach you.'
      using errcode = 'check_violation';
  end if;

  v_concierge := public.fn_pick_concierge(v_plan.city_id);

  update public.plan set
    status = 'sent',
    sent_at = now(),
    guest_name = coalesce(nullif(trim(p_guest_name), ''), guest_name),
    guest_phone = coalesce(nullif(trim(p_guest_phone), ''), guest_phone),
    concierge_id = v_concierge,
    sla_first_reply_due_at =
      now() + make_interval(mins => public.fn_setting_int('experience_first_reply_min', 30)),
    sla_quote_due_at =
      now() + make_interval(hours => public.fn_setting_int('experience_quote_hours', 2)),
    flags = public.fn_plan_flags(p_plan_id)
      || case when v_request_only then jsonb_build_array(jsonb_build_object(
        'severity', 'amber',
        'kind', 'catalogue_gap',
        'text', 'No published experiences matched the guest preferences; find suitable options within the guest budget.'
      )) else '[]'::jsonb end
  where id = p_plan_id
  returning * into v_plan;

  insert into public.plan_assignment_event (plan_id, to_concierge_id, reason)
  values (p_plan_id, v_concierge,
          case when v_concierge is null then 'Nobody on shift' else 'Round robin' end);

  insert into public.notification (kind, plan_id, to_phone, status)
  values ('plan_received', p_plan_id, v_plan.guest_phone, 'pending');

  insert into public.notification (kind, plan_id, status)
  values ('desk_new_plan', p_plan_id, 'pending');

  perform audit.log(
    p_actor_type => 'guest'::public.actor_type,
    p_module => 'experiences',
    p_action => 'plan.received',
    p_target_type => 'plan',
    p_target_id => p_plan_id,
    p_city_id => v_plan.city_id,
    p_after => jsonb_build_object(
      'reference', v_plan.reference, 'budget', v_plan.budget_kes,
      'estimate', v_plan.estimate_total_kes, 'assigned', v_concierge is not null,
      'request_only', v_request_only));

  return v_plan;
end;
$$;

comment on function public.rpc_send_plan(uuid, text, text) is
  'Sends a built day or a budgeted preference request to the concierge. Request-only submissions require preferences and a budget and are flagged for catalogue sourcing.';
