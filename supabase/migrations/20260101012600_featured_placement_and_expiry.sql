-- Putting a merchant in a slot, and taking them out again.
--
-- The featured module has a careful flow — request, quote, hold,
-- confirm, creative, review — which is right for a merchant buying
-- a slot through a form. It is wrong for the conversation that
-- actually sells most of them: somebody is on the phone, they agree
-- a price, and they want to be on the homepage today.
--
-- Three things were missing or wrong, and all three bite in that
-- conversation.
--
--  1. Nothing ever ends a slot. `cron_featured_activate` turns
--     bookings on and there is no counterpart, so a week that has
--     passed leaves the booking `live` and the merchant looking
--     featured in every console forever. The homepage was right
--     only because `featured_live_v` re-checks the dates on every
--     read — the state underneath it was wrong the whole time.
--
--  2. Neither featured cron is scheduled. Both functions exist and
--     nothing calls them, so even turning a slot ON was manual.
--
--  3. `featured_live_v` required an approved creative. A merchant
--     who paid and had no custom artwork never appeared — which is
--     the opposite of what paying is supposed to do.
--
-- And there were two answers to "is this merchant featured":
-- `merchant.featured`, a boolean somebody sets by hand, and the
-- booking system. They could disagree, and the console showed one
-- while the homepage showed the other.

-- ════════════════════════ a creative is an extra, not a gate

/*
 * A booking with approved artwork uses it. A booking without one
 * falls back to the merchant's own name, photo and category — which
 * `merchant_public` already carries, because that is what the
 * Explore grid renders.
 *
 * Charging somebody and then not showing them because a designer
 * has not been round is not a policy, it is a bug with a rationale.
 */
create or replace view public.featured_live_v
with (security_invoker = true) as
select
  p.city_id,
  mp.city_slug,
  p.kind,
  p.category,
  p."position",
  b.id as booking_id,
  b.merchant_id,
  mp.trading_name,
  mp.category as merchant_category,
  mp.branch_name,
  coalesce(cr.cover_photo_path, mp.cover_photo_path) as cover_photo_path,
  cr.blurb,
  ci.name as pinned_item_name,
  ci.price_kes as pinned_item_price,
  ci.id as pinned_item_id,
  mp.accepting_orders,
  mp.opens_today,
  mp.closes_today,
  mp.closed_today,
  mp.prep_minutes,
  mp.branch_latitude,
  mp.branch_longitude,
  'SPONSORED'::text as badge,
  sw.week_start + 4 as valid_to,
  /* So the console can say which of the two a row is. */
  cr.id is not null as has_creative
from public.featured_slot_week sw
join public.featured_placement p on p.id = sw.placement_id
join public.featured_booking b on b.id = sw.booking_id
join public.merchant_public mp on mp.id = b.merchant_id
left join public.featured_creative cr
  on cr.booking_id = b.id and cr.status = 'approved'
left join public.catalogue_item ci on ci.id = cr.pinned_item_id
where sw.status = 'live'
  and sw.week_start <= current_date
  and current_date <= sw.week_start + 6
  and p.enabled;

comment on view public.featured_live_v is
  'What the homepage band renders. Approved artwork is used when it exists and the merchant''s own photo and name when it does not — charging somebody and then not showing them because a designer has not been round is a bug with a rationale, not a policy.';

-- ══════════════════════════ one truth about being featured

/*
 * `merchant.featured` is now derived, not decided. A merchant is
 * featured when they hold a live slot this week, and nothing else
 * sets the column — a trigger on the slot week keeps it honest.
 *
 * The column stays because three screens read it by name. What
 * changes is that it can no longer disagree with the homepage.
 */
create or replace function public.fn_merchant_is_featured(p_merchant_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.featured_slot_week sw
    join public.featured_booking b on b.id = sw.booking_id
    where b.merchant_id = p_merchant_id
      and sw.status = 'live'
      and sw.week_start <= current_date
      and current_date <= sw.week_start + 6)
$$;

create or replace function public.tg_merchant_featured_follows_slots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_merchant uuid;
begin
  select b.merchant_id into v_merchant
    from public.featured_booking b
   where b.id = coalesce(new.booking_id, old.booking_id);

  if v_merchant is not null then
    update public.merchant
       set featured = public.fn_merchant_is_featured(v_merchant)
     where id = v_merchant
       and featured is distinct from public.fn_merchant_is_featured(v_merchant);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists merchant_featured_follows_slots on public.featured_slot_week;
create trigger merchant_featured_follows_slots
  after insert or update or delete on public.featured_slot_week
  for each row execute function public.tg_merchant_featured_follows_slots();

comment on function public.fn_merchant_is_featured is
  'The single answer to "is this merchant featured". A boolean somebody sets by hand and a booking system that also decides it is two answers, and they disagreed.';

-- ══════════════════════════════ placing a merchant directly

/*
 * The upsell, in one action.
 *
 * Deliberately not the request/quote/confirm path: that exists for
 * a merchant filling in a form, and making somebody walk it on
 * behalf of a merchant who has already agreed a price on the phone
 * is ceremony, not control.
 *
 * What it keeps is everything that makes the money real — an agreed
 * price that cannot be null, a fee line, a named actor and a
 * high-severity audit event. What it drops is the waiting.
 */
create or replace function public.rpc_featured_place_merchant(
  p_placement_id uuid,
  p_merchant_id uuid,
  p_week_start date,
  p_price bigint,
  p_weeks integer default 1,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_placement public.featured_placement;
  v_merchant public.merchant;
  v_booking uuid;
  v_week date;
  v_taken date[];
  i integer;
begin
  if v_me is null then raise exception 'Sign in first.' using errcode = '42501'; end if;

  select * into v_placement from public.featured_placement where id = p_placement_id;
  if not found then raise exception 'No such placement.'; end if;

  if not (authz.is_super_admin()
          or authz.reaches_module('featured')
          or authz.can_manage_merchants(v_placement.city_id)) then
    raise exception 'You cannot sell featured placement.' using errcode = '42501';
  end if;

  select * into v_merchant from public.merchant where id = p_merchant_id;
  if not found then raise exception 'No such merchant.'; end if;

  if v_merchant.status <> 'live' then
    raise exception '% is %. Only a live merchant can be featured — a guest tapping a sponsored card and finding it closed is worse than no card.',
      coalesce(v_merchant.trading_name, v_merchant.legal_name),
      replace(v_merchant.status::text, '_', ' ');
  end if;

  /*
   * A price, always. The whole point of a paid placement is that
   * somebody paid, and a booking with a null fee is one nobody can
   * invoice or reconcile later.
   */
  if p_price is null or p_price <= 0 then
    raise exception 'Say what they agreed to pay. A placement with no price is one nobody can invoice.';
  end if;

  if extract(isodow from p_week_start) <> 1 then
    raise exception 'A slot week starts on a Monday. % is a %.',
      p_week_start, to_char(p_week_start, 'Day');
  end if;

  if coalesce(p_weeks, 1) < 1 or p_weeks > 12 then
    raise exception 'Between one and twelve weeks.';
  end if;

  /* Check every week before taking any of them. */
  for i in 0..(p_weeks - 1) loop
    v_week := p_week_start + (i * 7);
    if exists (
      select 1 from public.featured_slot_week sw
      where sw.placement_id = p_placement_id and sw.week_start = v_week
        and sw.status not in ('open', 'ended')
    ) then
      v_taken := v_taken || v_week;
    end if;
  end loop;

  if coalesce(array_length(v_taken, 1), 0) > 0 then
    raise exception 'That slot is already sold for %. Pick another week or another placement.',
      array_to_string(v_taken, ', ');
  end if;

  insert into public.featured_booking (
    merchant_id, placement_id, placement_kind, category, city_id,
    status, requested_via, requested_at, requested_by,
    wanted_start, weeks, quoted_price,
    start_date, end_date, booked_by, confirmed_at, notes)
  values (
    p_merchant_id, p_placement_id, v_placement.kind, v_placement.category,
    v_placement.city_id,
    'booked', 'staff', now(), (select auth.uid()),
    p_week_start, p_weeks, p_price,
    p_week_start, p_week_start + (p_weeks * 7) - 1, v_me, now(),
    coalesce(p_note, 'Agreed directly with the merchant.'))
  returning id into v_booking;

  for i in 0..(p_weeks - 1) loop
    v_week := p_week_start + (i * 7);
    insert into public.featured_slot_week (placement_id, week_start, booking_id, status, price)
    values (p_placement_id, v_week, v_booking,
            /* Live now if the week has already started; otherwise it
               waits for the activation cron on Monday.

               The cast wraps the whole CASE: a CASE yields text and
               will not bind to an enum column, and it fails at call
               time rather than at creation. */
            (case when v_week <= current_date then 'live' else 'booked' end)::public.slot_status,
            p_price)
    on conflict (placement_id, week_start) do update
      set booking_id = excluded.booking_id,
          status = excluded.status,
          price = excluded.price;
  end loop;

  update public.featured_booking
     set status = (case when p_week_start <= current_date
                        then 'live' else 'booked' end)::public.booking_status
   where id = v_booking;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type,
    p_module => 'featured',
    p_action => 'featured.placed_directly',
    p_actor_id => v_me,
    p_target_type => 'featured_booking',
    p_target_id => v_booking,
    p_target_label => coalesce(v_merchant.trading_name, v_merchant.legal_name)
      || ' · ' || v_placement.kind::text || coalesce(' · ' || v_placement.category, ''),
    p_reason => p_note,
    p_city_id => v_placement.city_id,
    p_severity => 'high',
    p_after => jsonb_build_object(
      'amount_cents', p_price * p_weeks, 'currency', 'KES',
      'price_per_week', p_price, 'weeks', p_weeks, 'from', p_week_start));

  return jsonb_build_object(
    'ok', true,
    'booking_id', v_booking,
    'live_now', p_week_start <= current_date,
    'message', case when p_week_start <= current_date
      then coalesce(v_merchant.trading_name, v_merchant.legal_name)
           || ' is on the homepage now.'
      else coalesce(v_merchant.trading_name, v_merchant.legal_name)
           || ' goes live on ' || to_char(p_week_start, 'FMDay DD Mon') || '.' end);
end;
$$;

-- ═══════════════════════════════ taking them out again

/*
 * Ending a placement before its week is up. Staff do this when a
 * merchant asks, or when something has gone wrong — and unlike the
 * cron below it needs a reason, because somebody paid for the week
 * that is being cut short.
 */
create or replace function public.rpc_featured_end_now(
  p_booking_id uuid, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  b public.featured_booking;
begin
  select * into b from public.featured_booking where id = p_booking_id;
  if not found then raise exception 'No such booking.'; end if;

  if not (authz.is_super_admin()
          or authz.reaches_module('featured')
          or authz.can_manage_merchants(b.city_id)) then
    raise exception 'You cannot change featured placement.' using errcode = '42501';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why. Somebody paid for the week you are ending.';
  end if;

  if b.status in ('ended', 'cancelled', 'declined') then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  update public.featured_slot_week
     set status = 'ended', booking_id = booking_id
   where booking_id = p_booking_id and status <> 'ended';

  update public.featured_booking set status = 'ended' where id = p_booking_id;

  perform audit.log(
    p_actor_type => 'staff'::public.actor_type, p_module => 'featured',
    p_action => 'featured.ended', p_actor_id => v_me,
    p_target_type => 'featured_booking', p_target_id => p_booking_id,
    p_reason => p_reason, p_city_id => b.city_id, p_severity => 'high',
    p_before => jsonb_build_object('status', b.status),
    p_after => jsonb_build_object('status', 'ended', 'ended_early', true));

  return jsonb_build_object('ok', true,
    'message', 'Off the homepage. Finance will see the week was cut short.');
end;
$$;

/*
 * And the one that was missing entirely: the week ends by itself.
 *
 * Runs every hour rather than weekly, so a slot that should have
 * finished is wrong for an hour at worst rather than until the next
 * Monday. Idempotent — it only touches rows whose week has actually
 * passed.
 */
create or replace function public.cron_featured_expire()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slots integer := 0;
  v_bookings integer := 0;
  b record;
begin
  update public.featured_slot_week
     set status = 'ended'
   where status in ('live', 'booked', 'held', 'auto_paused', 'paused')
     and week_start + 6 < current_date;
  get diagnostics v_slots = row_count;

  /* A booking is over when none of its weeks is still running. */
  for b in
    select bk.id, bk.merchant_id, bk.city_id,
           (select coalesce(m.trading_name, m.legal_name)
              from public.merchant m where m.id = bk.merchant_id) as name
    from public.featured_booking bk
    where bk.status in ('live', 'booked', 'auto_paused', 'paused')
      and not exists (
        select 1 from public.featured_slot_week sw
        where sw.booking_id = bk.id and sw.status <> 'ended')
  loop
    update public.featured_booking set status = 'ended' where id = b.id;
    v_bookings := v_bookings + 1;

    perform audit.log(
      p_actor_type => 'system'::public.actor_type,
      p_module => 'featured',
      p_action => 'featured.ended',
      p_actor_label => '[System] · featured',
      p_target_type => 'featured_booking',
      p_target_id => b.id,
      p_target_label => b.name,
      p_reason => 'The booked weeks have passed.',
      p_city_id => b.city_id);
  end loop;

  return jsonb_build_object('ok', true, 'slots_ended', v_slots, 'bookings_ended', v_bookings);
end;
$$;

comment on function public.cron_featured_expire is
  'The counterpart that never existed. Without it a booking stays live forever and the merchant looks featured in every console — the homepage was only right because its view re-checks the dates on every read.';

-- ══════════════════════════════════ and run them

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; featured scheduling is manual.';
    return;
  end if;

  /* Monday morning, before anybody looks at the homepage. */
  perform cron.schedule('featured-activate', '5 0 * * 1',
    $cron$select public.cron_featured_activate()$cron$);

  /* Hourly: a slot that should have finished is wrong for an hour
     at worst, rather than until next Monday. */
  perform cron.schedule('featured-expire', '10 * * * *',
    $cron$select public.cron_featured_expire()$cron$);

  perform cron.schedule('featured-eligibility', '0 3 * * *',
    $cron$select public.cron_featured_eligibility()$cron$);
end $$;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('featured.placed_directly', 'featured', 'high', false, false, true,
   'A merchant was placed in a featured slot directly'),
  ('featured.ended', 'featured', 'notice', false, false, true,
   'A featured placement ended')
on conflict (action) do nothing;

grant execute on function public.rpc_featured_place_merchant(uuid, uuid, date, bigint, integer, text) to authenticated;
grant execute on function public.rpc_featured_end_now(uuid, text) to authenticated;
grant execute on function public.fn_merchant_is_featured(uuid) to authenticated;
grant execute on function public.cron_featured_expire() to authenticated, service_role;

/*
 * Bring the flag in line with reality once, for the bookings that
 * existed before the trigger did. Without this the column keeps
 * whatever somebody last set by hand, which is the disagreement
 * this migration is supposed to end.
 */
update public.merchant m
   set featured = public.fn_merchant_is_featured(m.id)
 where m.featured is distinct from public.fn_merchant_is_featured(m.id);
