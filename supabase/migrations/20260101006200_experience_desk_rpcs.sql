-- The desk: how a day a guest sent gets worked.
--
-- Every write is an RPC rather than a table grant, because each one carries
-- a rule a policy cannot express — a change needs a note the guest will
-- read, a confirmation needs a price, a quote needs every block settled.
-- Those rules are the product, not paperwork around it.

/* Who may act on a plan, as opposed to merely see one. */
create or replace function authz.works_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plan p
    where p.id = p_plan_id
      and (
        authz.is_super_admin()
        or p.concierge_id = authz.staff_id()
        or authz.has_role('ops_manager', p.city_id)
        or authz.has_role('concierge_lead', p.city_id)
      )
  )
$$;

grant execute on function authz.works_plan(uuid) to authenticated, service_role;

create or replace function public.fn_setting_int(p_key text, p_default integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select (value #>> '{}')::integer from public.setting
     where key = p_key and scope = 'global'),
    p_default)
$$;

-- ──────────────────────────────────────────── who takes the next one

/*
 * Round-robin among the people actually at the desk, by who is holding the
 * fewest live plans. Returns null when nobody is online, which is a real
 * answer: the plan is still received, still in the queue, and the lead is
 * told. A day that arrives at 02:00 must not wait on someone clocking in.
 */
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
  order by load.live, s.since
  limit 1
$$;

-- ───────────────────────────────────────────────────── advisories

/*
 * What the concierge should know before they pick up the phone. Read on
 * every queue render, so it is one pass over the blocks and nothing else.
 *
 * These are advisories, never blocks. A flag that stops work would get
 * routed around within a week; a flag that is simply true is read.
 */
create or replace function public.fn_plan_flags(p_plan_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_flags jsonb := '[]'::jsonb;
  v_row record;
  v_word text;
begin
  select * into v_plan from public.plan where id = p_plan_id;
  if v_plan.id is null then return v_flags; end if;

  /* A block scheduled before the gate opens. */
  for v_row in
    select b.title_snapshot, k.earliest_start, b.start_time
    from public.plan_block b
    join public.experience_component k on k.id = b.component_id
    where b.plan_id = p_plan_id and b.status <> 'removed'
      and k.earliest_start is not null and b.start_time < k.earliest_start
  loop
    v_flags := v_flags || jsonb_build_object(
      'severity', 'amber', 'kind', 'opening_time',
      'text', v_row.title_snapshot || ' is set for '
              || to_char(v_row.start_time, 'HH24:MI') || ' and opens at '
              || to_char(v_row.earliest_start, 'HH24:MI'));
  end loop;

  /* Sold out or already spoken for on the date. */
  for v_row in
    select b.title_snapshot
    from public.plan_block b
    join public.component_availability a
      on a.component_id = b.component_id and a.date = v_plan.date
    where b.plan_id = p_plan_id and b.status <> 'removed' and not a.available
  loop
    v_flags := v_flags || jsonb_build_object(
      'severity', 'red', 'kind', 'unavailable',
      'text', v_row.title_snapshot || ' is marked unavailable on that date');
  end loop;

  /* A partner who is slow to answer, so the quote clock is at risk. */
  for v_row in
    select distinct pr.name, pr.response_time_median_min
    from public.plan_block b
    join public.experience_component k on k.id = b.component_id
    join public.experience_partner pr on pr.id = k.partner_id
    where b.plan_id = p_plan_id and b.status <> 'removed'
      and pr.response_time_median_min > 60
  loop
    v_flags := v_flags || jsonb_build_object(
      'severity', 'amber', 'kind', 'slow_partner',
      'text', v_row.name || ' usually answers in ' || v_row.response_time_median_min || ' min');
  end loop;

  /* An event we cannot hold tickets for: the guest has to buy them. */
  for v_row in
    select e.name, e.organiser_name
    from public.plan_block b
    join public.event e on e.id = b.event_id
    where b.plan_id = p_plan_id and b.status <> 'removed' and not e.nexg_can_hold_tickets
  loop
    v_flags := v_flags || jsonb_build_object(
      'severity', 'amber', 'kind', 'no_ticket_hold',
      'text', 'Tickets for ' || v_row.name || ' come from '
              || coalesce(v_row.organiser_name, 'the organiser') || ' — we cannot hold them');
  end loop;

  if v_plan.budget_kes is not null and v_plan.estimate_total_kes is not null then
    if v_plan.estimate_total_kes > v_plan.budget_kes * 1.2 then
      v_flags := v_flags || jsonb_build_object(
        'severity', 'red', 'kind', 'over_budget',
        'text', 'The day is more than 20% over the budget they set');
    elsif v_plan.estimate_total_kes * 1.25 < v_plan.budget_kes then
      v_flags := v_flags || jsonb_build_object(
        'severity', 'green', 'kind', 'under_budget',
        'text', 'A fifth of the budget is unspent — there is room to offer more');
    end if;
  end if;

  /*
   * Things somebody wrote in a free-text box that a person must act on.
   * Surfaced, never interpreted: the flag says "they mentioned an allergy",
   * it does not decide what to do about it.
   */
  foreach v_word in array array['birthday', 'allerg', 'halal', 'wheelchair',
                                'vegetarian', 'vegan', 'anniversary', 'pork']
  loop
    if v_plan.notes is not null and position(v_word in lower(v_plan.notes)) > 0 then
      v_flags := v_flags || jsonb_build_object(
        'severity', 'amber', 'kind', 'guest_note',
        'text', 'Their note mentions "' || v_word || '" — read it before you book');
    end if;
  end loop;

  return v_flags;
end;
$$;

-- ───────────────────────────────────────── the guest sends the day

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
begin
  select * into v_plan from public.plan where id = p_plan_id;

  if v_plan.id is null or v_plan.user_id is distinct from (select auth.uid()) then
    raise exception 'That day is not yours to send.' using errcode = 'insufficient_privilege';
  end if;

  /* Already sent. Returning it rather than raising keeps a double-tap or a
     retried request from looking like a failure to the guest. */
  if v_plan.status <> 'draft' then
    return v_plan;
  end if;

  select count(*) into v_blocks
  from public.plan_block where plan_id = p_plan_id and kind <> 'free';
  if v_blocks = 0 then
    raise exception 'There is nothing in this day yet.' using errcode = 'check_violation';
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
  where id = p_plan_id
  returning * into v_plan;

  insert into public.plan_assignment_event (plan_id, to_concierge_id, reason)
  values (p_plan_id, v_concierge,
          case when v_concierge is null then 'Nobody on shift' else 'Round robin' end);

  /* Told the guest, and told the desk. Both are logged either way. */
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
      'estimate', v_plan.estimate_total_kes, 'assigned', v_concierge is not null));

  return v_plan;
end;
$$;

comment on function public.rpc_send_plan is
  'The guest sends their day. Assigns a concierge if one is on shift, leaves it in the queue if not — a plan is never lost for want of somebody logged in.';

-- ───────────────────────────────────────────── claiming and handing over

create or replace function public.rpc_claim_plan(p_plan_id uuid)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_plan public.plan;
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

  /* One concierge at a time. Taking one that is already taken is a
     handover, and a handover has a reason. */
  if v_plan.concierge_id is not null and v_plan.concierge_id <> v_me
     and not (authz.is_super_admin() or authz.has_role('concierge_lead', v_plan.city_id)) then
    raise exception 'This day is already with somebody else.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.plan_assignment_event (plan_id, from_concierge_id, to_concierge_id, reason)
  values (p_plan_id, v_plan.concierge_id, v_me, 'Claimed');

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

create or replace function public.rpc_handover_plan(
  p_plan_id uuid, p_to uuid, p_reason text
)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_from uuid;
begin
  if not authz.works_plan(p_plan_id) then
    raise exception 'Not your day to hand over.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. Whoever picks this up is reading it.'
      using errcode = 'check_violation';
  end if;

  select concierge_id into v_from from public.plan where id = p_plan_id;

  insert into public.plan_assignment_event (plan_id, from_concierge_id, to_concierge_id, reason)
  values (p_plan_id, v_from, p_to, trim(p_reason));

  update public.plan set concierge_id = p_to, handover_note = trim(p_reason), claimed_at = now()
  where id = p_plan_id returning * into v_plan;

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan.handed_over',
    p_target_type => 'plan', p_target_id => p_plan_id, p_reason => trim(p_reason),
    p_city_id => v_plan.city_id);

  return v_plan;
end;
$$;

-- ───────────────────────────────────────────────────── the thread

create or replace function public.rpc_plan_message(
  p_plan_id uuid, p_body text
)
returns public.plan_message
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_me uuid := authz.staff_id();
  v_msg public.plan_message;
  v_is_guest boolean;
begin
  select * into v_plan from public.plan where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'No such day.' using errcode = 'no_data_found';
  end if;

  v_is_guest := v_plan.user_id is not distinct from (select auth.uid());

  if not v_is_guest and not authz.works_plan(p_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Write something.' using errcode = 'check_violation';
  end if;

  insert into public.plan_message (plan_id, author_type, author_id, body)
  values (p_plan_id,
          case when v_is_guest then 'guest' else 'staff' end::public.actor_type,
          case when v_is_guest then v_plan.user_id else v_me end,
          trim(p_body))
  returning * into v_msg;

  /*
   * The first staff message is what the first-reply SLA is measuring, so
   * it is stamped here rather than by a separate call somebody has to
   * remember to make.
   */
  if not v_is_guest and v_plan.first_reply_at is null then
    update public.plan set first_reply_at = now() where id = p_plan_id;
    perform audit.log('staff'::public.actor_type, 'experiences', 'plan.first_reply',
      p_target_type => 'plan', p_target_id => p_plan_id, p_city_id => v_plan.city_id);
  end if;

  return v_msg;
end;
$$;

-- ────────────────────────────────────────────── working the blocks

create or replace function public.rpc_confirm_block(
  p_block_id uuid, p_price_kes bigint default null
)
returns public.plan_block
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block public.plan_block;
  v_plan_id uuid;
begin
  select plan_id into v_plan_id from public.plan_block where id = p_block_id;
  if not authz.works_plan(v_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;

  update public.plan_block set
    status = 'confirmed',
    /* The estimate stands unless the partner quoted something else. A
       confirmed block with no price is refused by the table itself. */
    price_quoted_kes = coalesce(p_price_kes, price_quoted_kes, price_estimate_kes),
    hold_status = case when hold_status = 'requested' then 'held'::public.hold_status
                       else hold_status end
  where id = p_block_id
  returning * into v_block;

  if v_block.id is null then
    raise exception 'No such block.' using errcode = 'no_data_found';
  end if;

  /*
   * Whatever this block includes is confirmed with it. The ride home is
   * part of the night out, not a separate thing to remember — and the
   * quote gate below counts anything still merely proposed.
   */
  update public.plan_block
  set status = 'confirmed', price_quoted_kes = coalesce(price_quoted_kes, 0)
  where included_by = p_block_id and status = 'proposed';

  /* A concierge saying "confirmed" is itself the answer to a hold. */
  update public.partner_hold
  set status = 'held', responded_at = now(),
      response_note = coalesce(response_note, 'attested by concierge')
  where plan_block_id = p_block_id and status = 'requested';

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan_block.confirmed',
    p_target_type => 'plan_block', p_target_id => p_block_id,
    p_after => jsonb_build_object('price', v_block.price_quoted_kes));

  return v_block;
end;
$$;

create or replace function public.rpc_change_block(
  p_block_id uuid, p_patch jsonb, p_note text
)
returns public.plan_block
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block public.plan_block;
  v_plan public.plan;
  v_new_component uuid;
  /*
   * Typed, not `record`. A record that is never assigned — which is every
   * change that adjusts only a time or a price — raises "tuple structure
   * of a not-yet-assigned record is indeterminate" the moment it is read.
   * A typed row variable is simply all nulls, which is what the coalesces
   * below are written for.
   */
  v_alt public.experience_component;
begin
  select * into v_block from public.plan_block where id = p_block_id;

  if v_block.id is null then
    raise exception 'No such block.' using errcode = 'no_data_found';
  end if;
  if not authz.works_plan(v_block.plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'A change needs a reason. The guest reads it.'
      using errcode = 'check_violation';
  end if;

  select * into v_plan from public.plan where id = v_block.plan_id;

  v_new_component := nullif(p_patch ->> 'component_id', '')::uuid;

  /* A swap has to stay inside the group; anything else is a different
     block wearing this one's time slot. */
  if v_new_component is not null then
    select k.* into v_alt from public.experience_component k
    where k.id = v_new_component and k.swap_group = v_block.swap_group and k.status = 'live';
    if v_alt.id is null then
      raise exception 'That is not an alternative for this part of the day.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.plan_block set
    /* What it was, so the guest is shown a change and not just a difference. */
    changed_from = jsonb_build_object(
      'start_time', to_char(start_time, 'HH24:MI'),
      'price_estimate_kes', price_estimate_kes,
      'price_quoted_kes', price_quoted_kes,
      'component_id', component_id,
      'title', title_snapshot),
    component_id = coalesce(v_new_component, component_id),
    title_snapshot = coalesce(v_alt.title, title_snapshot),
    subtitle_snapshot = coalesce(v_alt.subtitle, subtitle_snapshot),
    start_time = coalesce((p_patch ->> 'start_time')::time, start_time),
    price_quoted_kes = coalesce(
      (p_patch ->> 'price_quoted_kes')::bigint,
      public.fn_component_cost(v_alt.price_kes, v_alt.price_basis, v_plan.party_size),
      price_quoted_kes, price_estimate_kes),
    status = 'changed',
    change_note = trim(p_note)
  where id = p_block_id
  returning * into v_block;

  perform public.fn_event_anchor_effects(v_block.plan_id);

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan_block.changed',
    p_target_type => 'plan_block', p_target_id => p_block_id,
    p_reason => trim(p_note), p_before => v_block.changed_from,
    p_after => jsonb_build_object('title', v_block.title_snapshot,
                                  'price', v_block.price_quoted_kes));

  return v_block;
end;
$$;

create or replace function public.rpc_block_unavailable(
  p_block_id uuid, p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_id uuid;
begin
  select plan_id into v_plan_id from public.plan_block where id = p_block_id;
  if not authz.works_plan(v_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Say why it is not available. The guest reads it.'
      using errcode = 'check_violation';
  end if;

  update public.plan_block
  set status = 'unavailable', change_note = trim(p_note)
  where id = p_block_id;

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan_block.unavailable',
    p_target_type => 'plan_block', p_target_id => p_block_id, p_reason => trim(p_note));

  /* Hand back what could go there instead, so the refusal arrives with
     an answer rather than as a dead end. */
  return coalesce(
    (select jsonb_agg(to_jsonb(o)) from public.fn_swap_options(p_block_id) o),
    '[]'::jsonb);
end;
$$;

create or replace function public.rpc_remove_block(p_block_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_plan_id uuid;
begin
  select plan_id into v_plan_id from public.plan_block where id = p_block_id;
  if not authz.works_plan(v_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Say why it is gone.' using errcode = 'check_violation';
  end if;

  update public.plan_block set status = 'removed', change_note = trim(p_note)
  where id = p_block_id;

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan_block.removed',
    p_target_type => 'plan_block', p_target_id => p_block_id, p_reason => trim(p_note));
end;
$$;

create or replace function public.rpc_add_block(
  p_plan_id uuid, p_component_id uuid, p_start_time time default null
)
returns public.plan_block
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_c public.experience_component;
  v_block public.plan_block;
begin
  if not authz.works_plan(p_plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_plan from public.plan where id = p_plan_id;
  select * into v_c from public.experience_component
  where id = p_component_id and status = 'live';

  if v_c.id is null then
    raise exception 'That component is not live.' using errcode = 'check_violation';
  end if;

  insert into public.plan_block (
    plan_id, slot, start_time, end_time, kind, component_id, title_snapshot,
    subtitle_snapshot, price_estimate_kes, price_quoted_kes, pay_on_day,
    swap_group, status, sort
  )
  values (
    p_plan_id, v_c.default_slot,
    coalesce(p_start_time, public.fn_slot_time(v_c.default_slot)),
    coalesce(p_start_time, public.fn_slot_time(v_c.default_slot))
      + make_interval(mins => v_c.duration_min),
    v_c.kind, v_c.id, v_c.title, v_c.subtitle,
    public.fn_component_cost(v_c.price_kes, v_c.price_basis, v_plan.party_size),
    public.fn_component_cost(v_c.price_kes, v_c.price_basis, v_plan.party_size),
    v_c.pay_on_day, v_c.swap_group, 'confirmed',
    (select coalesce(max(sort), 0) + 1 from public.plan_block where plan_id = p_plan_id)
  )
  returning * into v_block;

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan_block.added',
    p_target_type => 'plan_block', p_target_id => v_block.id,
    p_after => jsonb_build_object('title', v_c.title));

  return v_block;
end;
$$;

-- ──────────────────────────────────────────────────────── holds

create or replace function public.rpc_request_hold(
  p_block_id uuid, p_channel text, p_message text default null
)
returns public.partner_hold
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_block public.plan_block;
  v_partner public.experience_partner;
  v_hold public.partner_hold;
  v_hours integer;
begin
  select * into v_block from public.plan_block where id = p_block_id;
  if not authz.works_plan(v_block.plan_id) then
    raise exception 'Not your day.' using errcode = 'insufficient_privilege';
  end if;

  select pr.* into v_partner
  from public.experience_component k
  join public.experience_partner pr on pr.id = k.partner_id
  where k.id = v_block.component_id;

  if v_partner.id is null then
    raise exception 'Nothing to hold — this block has no partner.'
      using errcode = 'check_violation';
  end if;

  v_hours := coalesce(
    (v_partner.terms ->> 'cancellation_hours')::integer,
    public.fn_setting_int('experience_hold_default_hours', 24));

  insert into public.partner_hold (
    plan_block_id, partner_id, requested_by, channel, message_sent, holds_until
  )
  values (p_block_id, v_partner.id, authz.staff_id(), p_channel, p_message,
          now() + make_interval(hours => v_hours))
  returning * into v_hold;

  update public.plan_block set
    hold_status = 'requested',
    hold_requested_at = now(),
    hold_expires_at = v_hold.holds_until,
    partner_contact_log = partner_contact_log || jsonb_build_object(
      'at', now(), 'channel', p_channel, 'by', authz.staff_id(), 'note', 'hold requested')
  where id = p_block_id;

  insert into public.notification (kind, plan_id, to_phone, to_email, status)
  values ('partner_hold_request', v_block.plan_id,
          v_partner.contact_phone, v_partner.contact_email, 'pending');

  perform audit.log('staff'::public.actor_type, 'experiences', 'partner_hold.requested',
    p_target_type => 'partner_hold', p_target_id => v_hold.id,
    p_after => jsonb_build_object('partner', v_partner.name, 'channel', p_channel));

  return v_hold;
end;
$$;

create or replace function public.rpc_answer_hold(
  p_hold_id uuid, p_status public.hold_status, p_note text default null
)
returns public.partner_hold
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold public.partner_hold;
  v_block_plan uuid;
  v_is_partner boolean;
begin
  select h.*, b.plan_id into v_hold
  from public.partner_hold h join public.plan_block b on b.id = h.plan_block_id
  where h.id = p_hold_id;

  if v_hold.id is null then
    raise exception 'No such hold.' using errcode = 'no_data_found';
  end if;

  select plan_id into v_block_plan from public.plan_block where id = v_hold.plan_block_id;

  v_is_partner := exists (
    select 1 from public.experience_partner
    where id = v_hold.partner_id and portal_user_id = (select auth.uid()) and can_answer_holds);

  if not v_is_partner and not authz.works_plan(v_block_plan) then
    raise exception 'Not yours to answer.' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('held', 'declined') then
    raise exception 'A hold is held or declined.' using errcode = 'check_violation';
  end if;

  update public.partner_hold
  set status = p_status, responded_at = now(), response_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_hold_id
  returning * into v_hold;

  update public.plan_block set hold_status = p_status where id = v_hold.plan_block_id;

  perform audit.log(
    case when v_is_partner then 'host_user' else 'staff' end::public.actor_type,
    'experiences', 'partner_hold.answered',
    p_target_type => 'partner_hold', p_target_id => p_hold_id,
    p_after => jsonb_build_object('status', p_status));

  return v_hold;
end;
$$;

-- ─────────────────────────────────────────────────────── the quote

/*
 * The gate. A quote is a promise about money, so it refuses rather than
 * rounds: nothing still merely proposed, every block that costs something
 * carrying a quoted price, and a fee rule somebody actually set.
 */
create or replace function public.rpc_quote_plan(p_plan_id uuid)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_open integer;
  v_unpriced integer;
  v_fee_rule jsonb;
  v_subtotal bigint;
  v_fee bigint;
begin
  if not authz.works_plan(p_plan_id) then
    raise exception 'Not your day to quote.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_plan from public.plan where id = p_plan_id;

  /*
   * An included block carries no price and no decision — it lives or dies
   * with its parent — so it is not something the concierge has to settle.
   */
  select count(*) into v_open
  from public.plan_block
  where plan_id = p_plan_id and status = 'proposed'
    and kind <> 'free' and included_by is null;
  if v_open > 0 then
    raise exception 'Settle every block first: % still only proposed.', v_open
      using errcode = 'check_violation';
  end if;

  select count(*) into v_unpriced
  from public.plan_block
  where plan_id = p_plan_id and status in ('confirmed', 'changed')
    and kind <> 'free' and included_by is null and price_quoted_kes is null;
  if v_unpriced > 0 then
    raise exception '% block(s) have no price.', v_unpriced using errcode = 'check_violation';
  end if;

  select value into v_fee_rule from public.setting
  where key = 'experience_fee_rule' and scope = 'global';
  if v_fee_rule is null then
    raise exception 'The concierge fee rule is not set, so this quote would be a guess.'
      using errcode = 'check_violation';
  end if;

  select coalesce(sum(price_quoted_kes), 0) into v_subtotal
  from public.plan_block
  where plan_id = p_plan_id and status in ('confirmed', 'changed') and included_by is null;

  v_fee := case
    when v_fee_rule ? 'pct' then (v_subtotal * (v_fee_rule ->> 'pct')::numeric / 100)::bigint
    when v_fee_rule ? 'flat_kes' then (v_fee_rule ->> 'flat_kes')::bigint
    else null
  end;

  if v_fee is null then
    raise exception 'The fee rule is set to something this cannot read: %', v_fee_rule
      using errcode = 'check_violation';
  end if;

  update public.plan set
    status = 'quoted',
    quoted_at = now(),
    concierge_fee_kes = v_fee,
    quote_total_kes = v_subtotal + v_fee,
    pay_on_day_total_kes = coalesce((
      select sum((item ->> 'amount')::bigint)
      from public.plan_block b, jsonb_array_elements(b.pay_on_day) item
      where b.plan_id = p_plan_id and b.status not in ('removed', 'unavailable')), 0),
    expires_at =
      now() + make_interval(hours => public.fn_setting_int('experience_quote_validity_hours', 24))
  where id = p_plan_id
  returning * into v_plan;

  insert into public.notification (kind, plan_id, to_phone, status)
  values ('plan_quoted', p_plan_id, v_plan.guest_phone, 'pending');

  perform audit.log('staff'::public.actor_type, 'experiences', 'plan.quoted',
    p_target_type => 'plan', p_target_id => p_plan_id, p_city_id => v_plan.city_id,
    p_after => jsonb_build_object('total', v_plan.quote_total_kes, 'fee', v_fee));

  return v_plan;
end;
$$;

comment on function public.rpc_quote_plan is
  'Turns a worked day into a price. Refuses on an unsettled block, an unpriced one, or an unset fee rule — all three would otherwise become a number the guest is asked to pay.';

-- ────────────────────────────────────── the guest answers the quote

create or replace function public.rpc_request_changes(p_plan_id uuid, p_message text)
returns public.plan
language plpgsql
security definer
set search_path = ''
as $$
declare v_plan public.plan;
begin
  select * into v_plan from public.plan where id = p_plan_id;
  if v_plan.user_id is distinct from (select auth.uid()) then
    raise exception 'That day is not yours.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Tell them what to change.' using errcode = 'check_violation';
  end if;

  perform public.rpc_plan_message(p_plan_id, trim(p_message));

  update public.plan set status = 'changes_requested' where id = p_plan_id
  returning * into v_plan;

  insert into public.notification (kind, plan_id, status)
  values ('plan_changes_needed', p_plan_id, 'pending');

  perform audit.log('guest'::public.actor_type, 'experiences', 'plan.changes_requested',
    p_target_type => 'plan', p_target_id => p_plan_id, p_reason => trim(p_message),
    p_city_id => v_plan.city_id);

  return v_plan;
end;
$$;

grant execute on function
  public.fn_pick_concierge(uuid),
  public.fn_plan_flags(uuid),
  public.fn_setting_int(text, integer),
  public.rpc_send_plan(uuid, text, text),
  public.rpc_claim_plan(uuid),
  public.rpc_handover_plan(uuid, uuid, text),
  public.rpc_plan_message(uuid, text),
  public.rpc_confirm_block(uuid, bigint),
  public.rpc_change_block(uuid, jsonb, text),
  public.rpc_block_unavailable(uuid, text),
  public.rpc_remove_block(uuid, text),
  public.rpc_add_block(uuid, uuid, time),
  public.rpc_request_hold(uuid, text, text),
  public.rpc_answer_hold(uuid, public.hold_status, text),
  public.rpc_quote_plan(uuid),
  public.rpc_request_changes(uuid, text)
to authenticated, service_role;
