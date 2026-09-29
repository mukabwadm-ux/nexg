-- The allocator: how a handful of taps becomes a day.
--
-- Called on every tap in the builder, so it has to be fast and it has to be
-- deterministic — the same answers must always produce the same day, or the
-- guest watches their morning change for no reason they can see.
--
-- The one thing it may never do is overwrite a concierge. Blocks that a
-- person has confirmed, changed, marked unavailable or removed survive a
-- rebuild untouched; only `proposed` blocks are replaced.
--
-- Travel time is straight-line distance, not drive time. The build prompt
-- specifies the Distance Matrix; no key is wired, and a made-up drive time
-- is worse than an honest crow-flies one. Where that matters — deciding
-- whether the day needs a driver — the threshold is deliberately generous.

/* The clock the timeline is drawn against. */
create or replace function public.fn_slot_time(p_slot public.block_slot)
returns time
language sql
immutable
set search_path = ''
as $$
  select case p_slot
    when 'early'     then time '06:30'
    when 'morning'   then time '09:30'
    when 'midday'    then time '13:00'
    when 'afternoon' then time '16:00'
    when 'evening'   then time '19:00'
    when 'night'     then time '21:00'
    when 'late'      then time '23:00'
  end
$$;

/*
 * The slot's usual hour, moved inside the component's own opening window.
 * An elephant orphanage with one feeding at 11:00 must not be drawn at
 * 06:30 just because the guest asked for a wild morning — the concierge
 * would find out on the phone, and the guest would already have seen it.
 */
create or replace function public.fn_block_time(
  p_slot public.block_slot, p_earliest time, p_latest time
)
returns time
language sql
immutable
set search_path = ''
as $$
  select greatest(
    least(coalesce(p_latest, time '23:59'), public.fn_slot_time(p_slot)),
    coalesce(p_earliest, time '00:00')
  )
$$;

create or replace function public.fn_slot_order(p_slot public.block_slot)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_slot
    when 'early' then 1 when 'morning' then 2 when 'midday' then 3
    when 'afternoon' then 4 when 'evening' then 5 when 'night' then 6
    when 'late' then 7
  end
$$;

-- ────────────────────────────────────────────── what is bookable today

/*
 * Live components a given plan could actually use: right city, right party
 * type, enough notice before the date, and not marked unavailable on it.
 *
 * `price_kes` here is the per-date override where one exists, because a
 * budget built on the list price and charged at the holiday price is a
 * budget that was never real.
 */
create or replace function public.fn_available_components(p_plan_id uuid)
returns table (
  id uuid, swap_group text, mood public.mood, kind public.block_kind,
  default_slot public.block_slot, tier integer, title text, subtitle text,
  price_kes bigint, price_basis public.price_basis, duration_min integer,
  pay_on_day jsonb, location extensions.geography, partner_id uuid,
  earliest_start time, latest_start time
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    k.id, k.swap_group, k.mood, k.kind, k.default_slot, k.tier, k.title, k.subtitle,
    coalesce(a.price_override_kes, k.price_kes) as price_kes,
    k.price_basis, k.duration_min, k.pay_on_day, k.location, k.partner_id,
    k.earliest_start, k.latest_start
  from public.plan p
  join public.experience_component k on k.city_id = p.city_id and k.status = 'live'
  join public.experience_partner pr on pr.id = k.partner_id and pr.status = 'live'
  left join public.component_availability a on a.component_id = k.id and a.date = p.date
  where p.id = p_plan_id
    and p.party_type = any (k.party_types)
    and p.party_size >= k.min_party
    and (k.max_party is null or p.party_size <= k.max_party)
    and coalesce(a.available, true)
    and (
      p.date is null
      or (p.date::timestamptz + time '06:00') >= now() + make_interval(hours => k.booking_lead_hours)
    )
$$;

comment on function public.fn_available_components is
  'Live, bookable components for one plan: city, party fit, lead time and the per-date override applied. The allocator reads nothing else.';

-- ───────────────────────────────────────── what a component costs here

/*
 * Party size is not a multiplier you can guess at. A car for the day costs
 * what it costs; a park drive is per head. The basis is the partner's own
 * statement of which, so it is read rather than assumed.
 */
create or replace function public.fn_component_cost(
  p_price bigint, p_basis public.price_basis, p_party integer
)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_price is null then null
    when p_basis = 'per_person' then p_price * greatest(p_party, 1)
    else p_price
  end
$$;

-- ──────────────────────────────────────────────────── the allocator

-- ───────────────────────────────── the allocator's working set

/*
 * fn_available_components joins plan, component, partner and availability,
 * and the allocator reads it once per mood, twice per group and twice per
 * budget step — roughly thirty times a build. Running it once into a temp
 * table takes a 522-component city from 130 ms to comfortably inside the
 * 150 ms the builder needs to feel like it is responding to the tap rather
 * than thinking about it.
 *
 * Temp, not materialised: the set is different for every plan and lives
 * for one transaction.
 */
create or replace function public.fn_load_available(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * `create ... if not exists` raises a NOTICE on every rebuild after the
   * first in a transaction, which is noise in every log the builder
   * touches. Ask first instead.
   */
  if to_regclass('pg_temp._avail') is null then
    create temporary table _avail (
      id uuid, swap_group text, mood public.mood, kind public.block_kind,
      default_slot public.block_slot, tier integer, title text, subtitle text,
      price_kes bigint, price_basis public.price_basis, duration_min integer,
      pay_on_day jsonb, location extensions.geography, partner_id uuid,
      earliest_start time, latest_start time
    ) on commit drop;
    create index _avail_group on _avail (swap_group, tier);
  end if;

  truncate table _avail;
  insert into _avail select * from public.fn_available_components(p_plan_id);
end;
$$;

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

comment on function public.fn_build_plan is
  'Rebuilds the proposed half of a day from the guest''s answers. Never touches a block a concierge has confirmed, changed, removed or marked unavailable.';

-- ─────────────────────────────────────────────────── fitting a budget

/*
 * Step down the priciest block that has a cheaper sibling while we are over;
 * step up the cheapest that has a dearer one while a quarter of the budget
 * is still unspent. Bounded by the number of blocks so it cannot spin.
 */
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

  /* Called directly rather than from a build — load our own working set. */
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
      /* Over: the most expensive swappable block comes down one tier. */
      select b.id, b.component_id, k.tier, b.swap_group, b.price_estimate_kes
      into v_target
      from public.plan_block b
      join public.experience_component k on k.id = b.component_id
      where b.plan_id = p_plan_id and b.status = 'proposed' and b.swap_group is not null
      order by b.price_estimate_kes desc nulls last
      limit 1;

      exit when v_target.id is null;

      select c.* into v_alt
      from _avail c
      where c.swap_group = v_target.swap_group and c.tier < v_target.tier
      order by c.tier desc
      limit 1;

      exit when v_alt.id is null;

    elsif (v_plan.budget_kes - v_total) * 4 >= v_plan.budget_kes then
      /* A quarter unspent: the cheapest swappable block goes up one tier. */
      select b.id, b.component_id, k.tier, b.swap_group, b.price_estimate_kes
      into v_target
      from public.plan_block b
      join public.experience_component k on k.id = b.component_id
      where b.plan_id = p_plan_id and b.status = 'proposed' and b.swap_group is not null
      order by b.price_estimate_kes asc nulls first
      limit 1;

      exit when v_target.id is null;

      select c.* into v_alt
      from _avail c
      where c.swap_group = v_target.swap_group and c.tier > v_target.tier
      order by c.tier asc
      limit 1;

      exit when v_alt.id is null;

      /* Only if it still fits. Spending the spare is not the goal. */
      exit when v_total
        - coalesce(v_target.price_estimate_kes, 0)
        + public.fn_component_cost(v_alt.price_kes, v_alt.price_basis, v_plan.party_size)
        > v_plan.budget_kes;
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
        v_alt.default_slot, v_alt.earliest_start, v_alt.latest_start)
    where id = v_target.id;
  end loop;
end;
$$;

-- ───────────────────────────────────────────── the "Swap:" line

create or replace function public.fn_swap_options(p_block_id uuid)
returns table (
  id uuid, title text, subtitle text, tier integer,
  price_kes bigint, delta_kes bigint, direction text
)
language sql
stable
security definer
set search_path = ''
as $$
  with b as (
    select pb.*, p.party_size, p.id as plan
    from public.plan_block pb join public.plan p on p.id = pb.plan_id
    where pb.id = p_block_id
  ),
  alts as (
    select
      c.id, c.title, c.subtitle, c.tier,
      public.fn_component_cost(c.price_kes, c.price_basis, b.party_size) as cost,
      b.price_estimate_kes as current_cost,
      c.tier - coalesce((select k.tier from public.experience_component k
                         where k.id = b.component_id), 3) as tier_delta
    from b
    join public.fn_available_components(b.plan) c on c.swap_group = b.swap_group
    where c.id is distinct from b.component_id
  )
  select id, title, subtitle, tier, cost,
         cost - coalesce(current_cost, 0),
         case when tier_delta < 0 then 'cheaper' else 'pricier' end
  from (
    select *, row_number() over (
      partition by case when tier_delta < 0 then 'cheaper' else 'pricier' end
      order by abs(tier_delta)
    ) as n
    from alts
  ) ranked
  where n = 1
  order by tier_delta;
$$;

comment on function public.fn_swap_options is
  'The next cheaper and next pricier alternative in the same swap group, with the price difference. One of each — a list of ten is a menu, not a swap.';

-- ─────────────────────────────────────── the budget bar, by mood

create or replace function public.fn_plan_totals(p_plan_id uuid)
returns table (mood text, total_kes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  /*
   * The bar's legend is Wild / Taste / Night / Slow / Stay / Events /
   * Driver, so transport is its own segment whatever mood the component
   * happens to be filed under — a car is not a slow afternoon.
   */
  select
    case
      when b.kind = 'transport' then 'transport'
      when b.event_id is not null then 'events'
      else coalesce(k.mood::text, 'other')
    end,
    sum(coalesce(b.price_quoted_kes, b.price_estimate_kes, 0))
  from public.plan_block b
  left join public.experience_component k on k.id = b.component_id
  where b.plan_id = p_plan_id and b.status <> 'removed' and b.included_by is null
  group by 1
  having sum(coalesce(b.price_quoted_kes, b.price_estimate_kes, 0)) > 0
  order by 2 desc;
$$;

-- ────────────────────────────────── an event moves what surrounds it

/*
 * Doors at 21:00 means dinner ends at 20:45 and the car is outside when the
 * music stops, not at some default hour. This runs after every rebuild and
 * after a concierge changes an event block's time.
 */
create or replace function public.fn_event_anchor_effects(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anchor record;
  v_doors time;
  v_out time;
begin
  select b.*, e.doors_at, e.ends_at into v_anchor
  from public.plan_block b
  join public.event e on e.id = b.event_id
  where b.plan_id = p_plan_id and b.anchored and b.status <> 'removed'
  order by public.fn_slot_order(b.slot)
  limit 1;

  if v_anchor.id is null then
    return;
  end if;

  v_doors := coalesce(
    (v_anchor.doors_at at time zone 'Africa/Nairobi')::time,
    v_anchor.start_time
  );
  v_out := coalesce(
    (v_anchor.ends_at at time zone 'Africa/Nairobi')::time,
    v_doors + interval '4 hours'
  );

  /* The meal before it finishes with a quarter of an hour to spare. */
  update public.plan_block b set
    end_time = v_doors - interval '15 minutes',
    start_time = v_doors - interval '15 minutes' - make_interval(
      mins => coalesce((select k.duration_min from public.experience_component k
                        where k.id = b.component_id), 90)),
    subtitle_snapshot = coalesce(b.subtitle_snapshot, '')
      || case when b.subtitle_snapshot like '%done by%' then ''
              else ' · done by ' || to_char(v_doors - interval '15 minutes', 'HH24:MI') end
  where b.plan_id = p_plan_id
    and b.kind = 'meal'
    and b.status = 'proposed'
    and public.fn_slot_order(b.slot) = public.fn_slot_order(v_anchor.slot) - 1;

  /* The ride home waits for the end, not for a guess. */
  update public.plan_block set start_time = v_out
  where plan_id = p_plan_id and included_by = v_anchor.id and kind = 'transport';
end;
$$;

grant execute on function
  public.fn_build_plan(uuid),
  public.fn_load_available(uuid),
  public.fn_swap_options(uuid),
  public.fn_plan_totals(uuid),
  public.fn_event_anchor_effects(uuid),
  public.fn_available_components(uuid),
  public.fn_slot_time(public.block_slot),
  public.fn_block_time(public.block_slot, time, time),
  public.fn_slot_order(public.block_slot),
  public.fn_component_cost(bigint, public.price_basis, integer)
to authenticated, service_role;
