-- Link externally chosen NexG stops to the existing plan/concierge flow.
alter table public.plan_block add column merchant_id uuid
  references public.merchant(id) on delete set null;
create index plan_block_merchant_idx on public.plan_block(merchant_id) where merchant_id is not null;
comment on column public.plan_block.merchant_id is
  'NexG merchant chosen by Explore. The app stores origin=app-explore and its full brief in plan.answers.';

-- Keep staff policy and customer draft ownership unchanged; narrow only the
-- new merchant reference accepted by customer writes.
alter policy plan_block_write_owner on public.plan_block with check (
  exists (select 1 from public.plan p where p.id = plan_id
          and p.user_id = (select auth.uid()) and p.status = 'draft')
  and (merchant_id is null or exists (
    select 1 from public.merchant_public m where m.id = merchant_id
  ))
);

-- The original builder is reproduced with one early-return guard only.
create or replace function public.fn_build_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plan;
  v_budget bigint;
  v_mood public.mood;
  v_group text;
  v_groups_for_mood integer;
  v_taken integer;
  v_pick uuid;
  v_event_id uuid;
  v_event public.event;
  v_anchor_block uuid;
  v_night_or_event boolean := false;
  v_spend bigint;
  v_row record;
  v_sort integer := 0;
  v_transport text;
  v_far boolean;
  v_driver uuid;
  v_fee_rule jsonb;
begin
  select * into v_plan from public.plan where id = p_plan_id;
  if v_plan.id is null then
    raise exception 'No such plan.' using errcode = 'no_data_found';
  end if;

  /*
   * A concierge is already working this. Rebuilding underneath them would
   * throw away calls they have already made.
   */
  if v_plan.status not in ('draft', 'sent', 'confirming', 'changes_requested') then
    return;
  end if;

  -- Discovery already chose these stops. Do not rebuild, fit, or supplement
  -- this day with website catalogue choices. Website-only plans are unchanged.
  if exists (select 1 from public.plan_block b
             where b.plan_id = p_plan_id and b.merchant_id is not null) then
    return;
  end if;

  v_budget := coalesce(v_plan.budget_kes, 0);
  perform public.fn_load_available(p_plan_id);

  delete from public.plan_block where plan_id = p_plan_id and status = 'proposed';

  -- ── 1. events first: they pin a slot and everything else moves around it

  for v_event_id in
    select (jsonb_array_elements_text(coalesce(v_plan.answers -> 'events', '[]'::jsonb)))::uuid
  loop
    select * into v_event from public.event
    where id = v_event_id and status = 'published' and starts_at > now();
    continue when v_event.id is null;

    v_sort := v_sort + 1;
    insert into public.plan_block (
      plan_id, slot, start_time, kind, event_id, title_snapshot, subtitle_snapshot,
      price_estimate_kes, pay_on_day, anchored, swap_group, sort
    )
    values (
      p_plan_id, v_event.anchor_slot,
      coalesce((v_event.doors_at at time zone 'Africa/Nairobi')::time,
               public.fn_slot_time(v_event.anchor_slot)),
      'event', v_event.id,
      v_event.name || coalesce(' · ' || v_event.venue_name, ''),
      case
        when v_event.nexg_can_hold_tickets
          then v_plan.party_size || ' tickets held · face value'
        else 'Tickets via the organiser · we handle everything around it'
      end,
      /*
       * A ticket is never in the estimate. NexG does not sell it and does
       * not mark it up; it is listed at face value as paid on the day.
       */
      null,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
           'label', (b ->> 'label') || ' · ' || v_plan.party_size,
           'amount', (b ->> 'price_kes')::bigint * v_plan.party_size,
           'note', 'face value · sold by ' || coalesce(v_event.organiser_name, 'the organiser')))
         from jsonb_array_elements(v_event.ticket_bands) b
         limit 1),
        '[]'::jsonb
      ),
      true, 'event_' || v_event.anchor_slot::text, v_sort
    )
    returning id into v_anchor_block;

    v_night_or_event := true;
  end loop;

  -- ── 2. one component per mood, per slot that mood owns

  foreach v_mood in array v_plan.moods loop
    /* Taste earns two sittings on a full day; nobody else does. */
    v_groups_for_mood := case
      when v_mood = 'taste' and v_plan.duration in ('day', 'weekend', 'dates') then 2
      when v_mood = 'events' then 0
      else 1
    end;

    v_taken := 0;

    for v_group in
      select c.swap_group
      from _avail c
      where c.mood = v_mood
        /* Never a second block in a slot an event already owns. */
        and not exists (
          select 1 from public.plan_block b
          where b.plan_id = p_plan_id and b.slot = c.default_slot and b.anchored
        )
      group by c.swap_group, c.default_slot
      order by public.fn_slot_order(c.default_slot), c.swap_group
    loop
      exit when v_taken >= v_groups_for_mood;

      /*
       * Their chip wins if it is in this group and still bookable.
       * Otherwise start in the middle of the range, which the budget pass
       * below then moves up or down.
       */
      select c.id into v_pick
      from _avail c
      where c.swap_group = v_group
        and c.id::text in (
          select jsonb_array_elements_text(coalesce(v_plan.answers -> v_mood::text, '[]'::jsonb))
        )
      order by c.tier
      limit 1;

      if v_pick is null then
        select c.id into v_pick
        from _avail c
        where c.swap_group = v_group
        order by abs(c.tier - 3), c.tier, c.title
        limit 1;
      end if;

      continue when v_pick is null;

      select * into v_row from _avail c where c.id = v_pick;

      v_sort := v_sort + 1;
      insert into public.plan_block (
        plan_id, slot, start_time, end_time, kind, component_id,
        title_snapshot, subtitle_snapshot, price_estimate_kes, pay_on_day,
        swap_group, sort
      )
      values (
        p_plan_id, v_row.default_slot,
        public.fn_block_time(v_row.default_slot, v_row.earliest_start, v_row.latest_start),
        public.fn_block_time(v_row.default_slot, v_row.earliest_start, v_row.latest_start)
          + make_interval(mins => v_row.duration_min),
        v_row.kind, v_row.id, v_row.title, v_row.subtitle,
        public.fn_component_cost(v_row.price_kes, v_row.price_basis, v_plan.party_size),
        v_row.pay_on_day, v_row.swap_group, v_sort
      );

      if v_mood = 'night' then
        v_night_or_event := true;
      end if;

      v_taken := v_taken + 1;
    end loop;
  end loop;

  -- ── 3. fit the budget: down while over, up while a quarter is unspent

  if v_budget > 0 then
    perform public.fn_fit_budget(p_plan_id);
  end if;

  -- ── 4. getting around

  v_transport := coalesce(v_plan.answers ->> 'transport', 'auto');

  /*
   * Three or more stops with four kilometres between the furthest pair is
   * a day that wants one car, not four rides. Straight-line, see the note
   * at the top of this file.
   */
  select count(*) >= 3 and coalesce(max(d), 0) > 4000 into v_far
  from (
    select extensions.st_distance(a.location, b.location) as d
    from public.plan_block pa
    join public.experience_component a on a.id = pa.component_id
    join public.plan_block pb on pb.plan_id = pa.plan_id and pb.id <> pa.id
    join public.experience_component b on b.id = pb.component_id
    where pa.plan_id = p_plan_id and a.location is not null and b.location is not null
  ) pairs;

  if v_transport = 'driver' or (v_transport = 'auto' and coalesce(v_far, false)) then
    select c.id into v_driver
    from _avail c
    where c.kind = 'transport' and c.swap_group like '%driver%'
    order by abs(c.tier - 3), c.tier
    limit 1;

    if v_driver is not null then
      select * into v_row from _avail c where c.id = v_driver;
      v_sort := v_sort + 1;
      insert into public.plan_block (
        plan_id, slot, start_time, kind, component_id, title_snapshot,
        subtitle_snapshot, price_estimate_kes, swap_group, sort
      )
      values (
        p_plan_id, 'morning', public.fn_slot_time('morning'), 'transport', v_row.id,
        v_row.title, v_row.subtitle,
        public.fn_component_cost(v_row.price_kes, v_row.price_basis, v_plan.party_size),
        v_row.swap_group, v_sort
      );

      /*
       * Fit again. A car for the day is six thousand shillings of the
       * budget and it is added after the first pass, so without this the
       * day is over by exactly the cost of the transport every time.
       */
      if v_budget > 0 then
        perform public.fn_fit_budget(p_plan_id);
      end if;
    end if;
  end if;

  /*
   * A ride home after a night out is not an optional extra and is not a
   * separate charge — it is part of what the night block is. `included_by`
   * is what makes it render INCLUDED and count nothing.
   */
  if v_night_or_event then
    select b.id into v_anchor_block
    from public.plan_block b
    where b.plan_id = p_plan_id and (b.anchored or b.slot = 'night')
    order by public.fn_slot_order(b.slot) desc
    limit 1;

    if v_anchor_block is not null
       and not exists (
         select 1 from public.plan_block b
         where b.plan_id = p_plan_id and b.included_by is not null and b.kind = 'transport'
       )
    then
      v_sort := v_sort + 1;
      insert into public.plan_block (
        plan_id, slot, start_time, kind, title_snapshot, subtitle_snapshot,
        price_estimate_kes, included_by, sort
      )
      values (
        p_plan_id, 'late', time '01:00', 'transport',
        'Ride home to your ' || coalesce(nullif(v_plan.stay_label, ''), 'stay'),
        'Waits outside the venue · included', 0, v_anchor_block, v_sort
      );
    end if;
  end if;

  -- ── 5. gaps

  /*
   * An empty afternoon is a choice, so it is drawn as one rather than left
   * as a hole the guest has to notice.
   */
  if v_plan.duration in ('day', 'weekend', 'dates')
     and not exists (
       select 1 from public.plan_block where plan_id = p_plan_id and slot = 'afternoon'
     )
  then
    v_sort := v_sort + 1;
    insert into public.plan_block (
      plan_id, slot, start_time, kind, title_snapshot, subtitle_snapshot,
      price_estimate_kes, sort
    )
    values (
      p_plan_id, 'afternoon', public.fn_slot_time('afternoon'), 'free', 'Free afternoon',
      'Nothing booked — add a Slow block or leave it open', 0, v_sort
    );
  end if;

  -- ── 6. order the day by the clock, then total it

  with ordered as (
    select id, row_number() over (
      order by public.fn_slot_order(slot), start_time nulls last, sort
    ) as n
    from public.plan_block where plan_id = p_plan_id
  )
  update public.plan_block b set sort = o.n from ordered o where b.id = o.id;

  perform public.fn_event_anchor_effects(p_plan_id);

  select sum(coalesce(price_quoted_kes, price_estimate_kes, 0))
  into v_spend
  from public.plan_block
  where plan_id = p_plan_id and status <> 'removed' and included_by is null;

  select value into v_fee_rule from public.setting
  where key = 'experience_fee_rule' and scope = 'global';

  update public.plan set
    estimate_total_kes = coalesce(v_spend, 0),
    pay_on_day_total_kes = coalesce((
      select sum((item ->> 'amount')::bigint)
      from public.plan_block b, jsonb_array_elements(b.pay_on_day) item
      where b.plan_id = p_plan_id and b.status <> 'removed'
    ), 0),
    /*
     * Null until somebody sets the rule. It renders [—] and makes quoting
     * refuse — see rpc_quote_plan. Guessing a fee here is guessing with
     * the guest's money.
     */
    concierge_fee_kes = case
      when v_fee_rule is null then null
      when v_fee_rule ? 'pct'
        then (coalesce(v_spend, 0) * (v_fee_rule ->> 'pct')::numeric / 100)::bigint
      when v_fee_rule ? 'flat_kes' then (v_fee_rule ->> 'flat_kes')::bigint
      else null
    end
  where id = p_plan_id;
end;
$$;
