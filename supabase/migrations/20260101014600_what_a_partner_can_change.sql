-- What a partner can change about themselves, once they are in.
--
-- The row policies let a merchant and a rider edit their own record
-- only while they are still applying. That is the right instinct —
-- a live merchant should not be able to rename the business guests
-- are ordering from, or move it to another city, without anybody
-- noticing — but it leaves nothing they *can* do afterwards, and
-- the things they most often need are ordinary:
--
--   * open another store
--   * change the hours one of them keeps
--   * fix the prep time when the kitchen is slower than they said
--   * tell us which areas they ride now, or that they have a bigger
--     bike
--   * ask for a featured slot
--
-- Each one below is an RPC rather than a widened policy, because
-- each has a rule attached. A store outside every zone cannot be
-- delivered from; a prep time of four hours is not a prep time; a
-- rider cannot quietly widen the distance they are offered past
-- what their licence and their bike actually allow. A policy cannot
-- say any of that.

/*
 * A store that has closed.
 *
 * There was no way to say this. The first attempt used sort order
 * and deleted the hours, which is a convention three other queries
 * would have had to know about and a lie about what happened —
 * hours are kept per merchant here, not per branch, so deleting
 * them would have closed every store at once.
 */
alter table public.merchant_branch
  add column if not exists closed_at timestamptz,
  add column if not exists closed_reason text;

comment on column public.merchant_branch.closed_at is
  'A closed store keeps its row: orders were delivered from here and statements refer to it. Nothing is deleted, the door is shut.';

create or replace function public.fn_merchant_mine(p_merchant_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not authz.is_merchant_member(p_merchant_id) then
    raise exception 'That business is not yours.' using errcode = '42501';
  end if;
  return p_merchant_id;
end;
$$;

create or replace function public.fn_rider_mine(p_rider_id uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not authz.is_rider_self(p_rider_id) then
    raise exception 'That account is not yours.' using errcode = '42501';
  end if;
  return p_rider_id;
end;
$$;

-- ════════════════════════════════════════ another store

/*
 * Opening a second branch.
 *
 * The zone is looked up, not asked for: a merchant should not have
 * to know NexG's delivery geometry, and letting them pick would
 * mean a store could claim to be somewhere it is not. An address
 * outside every zone is refused with the reason, because the
 * alternative is a store that takes orders nobody can deliver.
 *
 * A new store starts closed to the catalogue and is added to the
 * review queue rather than going live on the merchant's say-so —
 * the first one was checked by a person and so is this one.
 */
create or replace function public.rpc_merchant_add_store(
  p_merchant_id uuid,
  p_name text,
  p_address text,
  p_lat double precision,
  p_lng double precision,
  p_make_primary boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid;
  m public.merchant;
  z record;
  v_branch uuid;
  v_count integer;
begin
  perform public.fn_merchant_mine(p_merchant_id);
  v_me := (select auth.uid());
  select * into m from public.merchant where id = p_merchant_id;

  if m.status in ('suspended', 'delisted') then
    raise exception 'Your account is %. Talk to us before opening another store.', m.status;
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'What do guests call this one?';
  end if;
  if coalesce(trim(p_address), '') = '' then
    raise exception 'Where is it? A rider has to find the door.';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'Drop a pin on the map. An address without one is a street, not a door.';
  end if;

  if exists (select 1 from public.merchant_branch b
              where b.merchant_id = p_merchant_id and b.closed_at is null
                and lower(trim(b.name)) = lower(trim(p_name))) then
    raise exception 'You already have a store called %.', trim(p_name);
  end if;

  select * into z from public.zone_for_point(p_lng, p_lat);
  if z.id is null then
    raise exception 'That address is outside every area NexG delivers to. Tell us where you are opening and we will look at the map — we would rather add the area than take orders we cannot deliver.';
  end if;

  /* A store in another city is a different business as far as fees,
     zones and settlement are concerned. */
  if z.city_id <> m.city_id then
    raise exception 'That is in a different city from the rest of your business. Opening there means a separate registration, so that the fees and the payouts are right.';
  end if;

  insert into public.merchant_branch
    (merchant_id, name, address_text, latitude, longitude, zone_id,
     is_primary, inherits_hours, source, sort)
  values (
    p_merchant_id, trim(p_name), trim(p_address), p_lat, p_lng, z.id,
    coalesce(p_make_primary, false) or not exists (
      select 1 from public.merchant_branch b
       where b.merchant_id = p_merchant_id and b.closed_at is null),
    true, 'manual',
    coalesce((select max(sort) + 1 from public.merchant_branch b
               where b.merchant_id = p_merchant_id), 1))
  returning id into v_branch;

  if coalesce(p_make_primary, false) then
    update public.merchant_branch set is_primary = (id = v_branch)
     where merchant_id = p_merchant_id;
  end if;

  select count(*) into v_count from public.merchant_branch
   where merchant_id = p_merchant_id and closed_at is null;

  insert into public.merchant_message
    (merchant_id, direction, channel, subject, body)
  values (p_merchant_id, 'out', 'in_app', 'New store added',
          trim(p_name) || ' is on file and waiting for a check before it takes orders.');

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'merchant.store_added',
    p_actor_label => '[Merchant] ' || coalesce(m.trading_name, m.legal_name),
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id, p_severity => 'notice',
    p_after => jsonb_build_object('branch_id', v_branch, 'name', trim(p_name),
                                  'zone', z.name, 'stores_now', v_count));

  return jsonb_build_object('ok', true, 'branch_id', v_branch, 'zone', z.name,
    'stores', v_count,
    'message', trim(p_name) || ' added in ' || z.name
      || '. We check a new store before it starts taking orders — usually the same day.');
end;
$$;

create or replace function public.rpc_merchant_rename_store(
  p_branch_id uuid, p_name text, p_address text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare b public.merchant_branch;
begin
  select * into b from public.merchant_branch where id = p_branch_id;
  if not found then raise exception 'No such store.'; end if;
  perform public.fn_merchant_mine(b.merchant_id);

  if coalesce(trim(p_name), '') = '' then raise exception 'A store needs a name.'; end if;

  update public.merchant_branch
     set name = trim(p_name),
         address_text = coalesce(nullif(trim(p_address), ''), address_text)
   where id = p_branch_id;

  return jsonb_build_object('ok', true, 'message', 'Saved.');
end;
$$;

/*
 * Closing a store for good. Not a delete: an order was delivered
 * from here and a statement refers to it, so the record stays and
 * the door closes.
 */
create or replace function public.rpc_merchant_close_store(p_branch_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.merchant_branch;
  v_open integer;
  v_left integer;
begin
  select * into b from public.merchant_branch where id = p_branch_id;
  if not found then raise exception 'No such store.'; end if;
  perform public.fn_merchant_mine(b.merchant_id);

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Tell us why, so we know whether it is coming back.';
  end if;

  select count(*) into v_open from public.order o
   where o.branch_id = p_branch_id
     and o.stage not in ('delivered', 'cancelled', 'refunded');
  if v_open > 0 then
    raise exception 'There % still running from this store. Finish % first.',
      case when v_open = 1 then 'is 1 order' else 'are ' || v_open || ' orders' end,
      case when v_open = 1 then 'it' else 'them' end;
  end if;

  if b.closed_at is not null then
    raise exception 'That store is already closed.';
  end if;

  select count(*) into v_left from public.merchant_branch
   where merchant_id = b.merchant_id and id <> p_branch_id and closed_at is null;
  if v_left = 0 then
    raise exception 'That is your only store. Closing the business is a conversation rather than a button — message us and we will sort it out properly.';
  end if;

  update public.merchant_branch
     set closed_at = now(), closed_reason = trim(p_reason), sort = 9999
   where id = p_branch_id;

  if b.is_primary then
    update public.merchant_branch set is_primary = true
     where id = (select id from public.merchant_branch
                  where merchant_id = b.merchant_id and id <> p_branch_id
                    and closed_at is null
                  order by sort limit 1);
    update public.merchant_branch set is_primary = false where id = p_branch_id;
  end if;

  insert into public.merchant_message (merchant_id, direction, channel, subject, body)
  values (b.merchant_id, 'in', 'in_app', 'Store closed',
          b.name || ' closed · ' || p_reason);

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'merchant.store_closed',
    p_target_type => 'merchant', p_target_id => b.merchant_id,
    p_reason => p_reason, p_severity => 'notice',
    p_after => jsonb_build_object('branch_id', p_branch_id, 'name', b.name));

  return jsonb_build_object('ok', true,
    'message', b.name || ' is closed. The record stays, because orders and statements refer to it.');
end;
$$;

-- ═════════════════════════════ how long the kitchen takes

create or replace function public.rpc_merchant_set_prep(
  p_merchant_id uuid, p_minutes integer, p_capacity integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare m public.merchant;
begin
  perform public.fn_merchant_mine(p_merchant_id);
  select * into m from public.merchant where id = p_merchant_id;

  /*
   * The guest is quoted this. Too low and every order is late; too
   * high and nobody orders. Both ends are refused rather than
   * accepted and quietly corrected by somebody later.
   */
  if p_minutes is null or p_minutes < 5 or p_minutes > 120 then
    raise exception 'A prep time between 5 and 120 minutes. The guest is quoted this, so it has to be one you can keep.';
  end if;
  if p_capacity is not null and (p_capacity < 1 or p_capacity > 100) then
    raise exception 'Orders per 15 minutes, between 1 and 100.';
  end if;

  update public.merchant
     set prep_minutes = p_minutes,
         capacity_per_15min = coalesce(p_capacity, capacity_per_15min)
   where id = p_merchant_id;

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'merchants',
    p_action => 'merchant.prep_changed',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id,
    p_before => jsonb_build_object('prep_minutes', m.prep_minutes,
                                   'capacity_per_15min', m.capacity_per_15min),
    p_after => jsonb_build_object('prep_minutes', p_minutes,
                                  'capacity_per_15min', coalesce(p_capacity, m.capacity_per_15min)));

  return jsonb_build_object('ok', true,
    'message', 'Guests are now told ' || p_minutes || ' minutes.');
end;
$$;

-- ══════════════════════════ a merchant asks for a slot

/*
 * Featured, from the merchant's side.
 *
 * This creates a *request*, not a booking. No payment rail is
 * connected, so a merchant cannot pay for a slot here and a screen
 * that let them click "buy" would be promising something NexG
 * cannot deliver. What it can do honestly is put them in the queue
 * with the price they were shown, and tell them a person will call.
 */
create or replace function public.rpc_merchant_request_featured(
  p_merchant_id uuid,
  p_placement_id uuid,
  p_week_start date,
  p_weeks integer default 1,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  p public.featured_placement;
  v_price bigint;
  v_booking uuid;
  v_elig jsonb;
begin
  perform public.fn_merchant_mine(p_merchant_id);
  select * into m from public.merchant where id = p_merchant_id;
  select * into p from public.featured_placement where id = p_placement_id;
  if not found then raise exception 'No such placement.'; end if;

  if m.status <> 'live' then
    raise exception 'Featured slots are for live businesses. Yours is %.', m.status;
  end if;
  if p.city_id <> m.city_id then
    raise exception 'That slot is in another city.';
  end if;
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Slots run Monday to Sunday, so pick a Monday.';
  end if;
  if p_week_start < current_date then
    raise exception 'That week has already started.';
  end if;
  if coalesce(p_weeks, 0) < 1 or p_weeks > 12 then
    raise exception 'Between 1 and 12 weeks.';
  end if;

  if exists (select 1 from public.featured_booking b
              where b.merchant_id = p_merchant_id
                and b.status in ('requested', 'quoted', 'booked', 'live')) then
    raise exception 'You already have a featured request with us. We will come back to you on that one first.';
  end if;

  /* The price and the eligibility each have one definition
     already, shared with the staff console and the nightly cron.
     Recomputing either here is how a merchant gets quoted one
     number and billed another. */
  v_price := public.fn_featured_price(p.city_id, p.kind, m.category);
  v_elig := public.fn_featured_eligibility(p_merchant_id, p.kind, m.category);

  if not coalesce((v_elig ->> 'passed')::boolean, false) then
    raise exception '%', coalesce(
      v_elig ->> 'remedy',
      'Your account is not eligible for a featured slot yet.');
  end if;

  insert into public.featured_booking (
    merchant_id, placement_id, placement_kind, category, city_id,
    status, requested_via, requested_at, requested_by,
    wanted_start, weeks, eligibility, quoted_price, notes)
  values (
    p_merchant_id, p_placement_id, p.kind, m.category, m.city_id,
    'requested', 'merchant_dashboard', now(), (select auth.uid()),
    p_week_start, p_weeks, v_elig, v_price, p_note)
  returning id into v_booking;

  insert into public.merchant_message (merchant_id, direction, channel, subject, body)
  values (p_merchant_id, 'in', 'in_app', 'Featured slot requested',
          'Week of ' || to_char(p_week_start, 'DD Mon') || ' · '
          || p_weeks || ' week' || case when p_weeks = 1 then '' else 's' end
          || coalesce(' · ' || p_note, ''));

  perform audit.log(
    p_actor_type => 'merchant_user'::public.actor_type, p_module => 'featured',
    p_action => 'featured.requested_by_merchant',
    p_target_type => 'merchant', p_target_id => p_merchant_id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id, p_reason => p_note, p_severity => 'notice',
    p_after => jsonb_build_object('booking_id', v_booking, 'weeks', p_weeks,
                                  'week_start', p_week_start,
                                  'amount_cents', v_price * 100, 'currency', 'KES'));

  return jsonb_build_object('ok', true, 'booking_id', v_booking,
    'priced', v_price is not null,
    'message', case when v_price is null
      then 'Asked for. There is no published rate for that slot in your city yet, so somebody will call you with the price before anything is booked.'
      else 'Asked for at KES ' || v_price || ' a week. Nothing is charged yet — somebody will call to confirm and take payment.' end);
end;
$$;

create or replace function public.rpc_merchant_withdraw_featured(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare b public.featured_booking;
begin
  select * into b from public.featured_booking where id = p_booking_id;
  if not found then raise exception 'No such request.'; end if;
  perform public.fn_merchant_mine(b.merchant_id);

  if b.status not in ('requested', 'quoted', 'waitlisted') then
    raise exception 'That one is already %. Message us to change it.', b.status;
  end if;

  update public.featured_booking
     set status = 'cancelled', ended_at = now(), end_reason = 'withdrawn by the merchant'
   where id = p_booking_id;

  return jsonb_build_object('ok', true, 'message', 'Withdrawn. Ask again whenever you like.');
end;
$$;

-- ═══════════════════════════ a rider keeps themselves current

/*
 * Areas, shifts, and the furthest they ride.
 *
 * `bike_max_km` is the one with teeth: the cascade reads it to
 * decide whether to offer a job at all, so a rider who sets it to
 * 50 is asking for rides they may not be able to finish. It is
 * capped, and the cap says why.
 */
/* An earlier draft of this took shifts as jsonb; the column is a
   text[] of named shifts, so the overload is dropped rather than
   left to resolve ambiguously at call time. */
drop function if exists public.rpc_rider_update_profile(uuid, text[], jsonb, integer);

create or replace function public.rpc_rider_update_profile(
  p_rider_id uuid,
  p_areas text[] default null,
  p_shifts text[] default null,
  p_max_km integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_cap integer := 25;
begin
  perform public.fn_rider_mine(p_rider_id);
  select * into r from public.rider where id = p_rider_id;

  if p_max_km is not null then
    if p_max_km < 1 then
      raise exception 'The furthest you ride has to be at least 1 km.';
    end if;
    if p_max_km > v_cap then
      raise exception 'We cap this at % km. Past that a delivery takes long enough that the food arrives cold and you have earned less per hour than a shorter one — if you want longer runs, message us.',
        v_cap;
    end if;
  end if;

  update public.rider
     set areas = coalesce(p_areas, areas),
         shifts = coalesce(p_shifts, shifts),
         bike_max_km = coalesce(p_max_km, bike_max_km)
   where id = p_rider_id;

  perform audit.log(
    p_actor_type => 'rider'::public.actor_type, p_module => 'riders',
    p_action => 'rider.profile_updated',
    p_target_type => 'rider', p_target_id => p_rider_id,
    p_target_label => nullif(trim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')), ''),
    p_city_id => r.city_id,
    p_before => jsonb_build_object('areas', r.areas, 'shifts', r.shifts,
                                   'bike_max_km', r.bike_max_km),
    p_after => jsonb_build_object('areas', coalesce(p_areas, r.areas),
                                  'shifts', coalesce(p_shifts, r.shifts),
                                  'bike_max_km', coalesce(p_max_km, r.bike_max_km)));

  return jsonb_build_object('ok', true, 'message', 'Saved.');
end;
$$;

/*
 * Going on and off shift.
 *
 * A rider may pause their own offers and start them again. They may
 * not clear a cooldown or a suspension — those were applied by
 * somebody for a reason, and a switch that undid them would make
 * the reason pointless.
 */
create or replace function public.rpc_rider_go_online(p_online boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rider;
  v_uid uuid := (select auth.uid());
begin
  select * into r from public.rider where user_id = v_uid order by updated_at desc limit 1;
  if r.id is null then raise exception 'No rider account on this login.'; end if;

  if r.status <> 'active' then
    raise exception 'Your account is %, so you cannot go online yet.', r.status;
  end if;

  if p_online then
    if r.cooldown_until is not null and r.cooldown_until > now() then
      raise exception 'You are on a cooldown until %.',
        to_char(r.cooldown_until at time zone 'Africa/Nairobi', 'HH24:MI');
    end if;
    if r.can_receive_offers = false and r.can_receive_offers_source = 'staff' then
      raise exception 'Offers are paused on your account by the team%. Message us and we will sort it.',
        coalesce(' · ' || r.offers_paused_reason, '');
    end if;
    if r.presence = 'on_trip' then
      return jsonb_build_object('ok', true, 'presence', 'on_trip',
        'message', 'You are already on a trip.');
    end if;

    update public.rider
       set presence = 'online', presence_changed_at = now(),
           can_receive_offers = true, offers_paused_reason = null,
           can_receive_offers_source = 'rider',
           last_seen_at = now()
     where id = r.id;
  else
    if r.presence = 'on_trip' then
      raise exception 'Finish the trip you are on first — somebody is waiting for it.';
    end if;
    update public.rider
       set presence = 'offline', presence_changed_at = now(),
           can_receive_offers = false,
           offers_paused_reason = coalesce(nullif(trim(p_reason), ''), 'off shift'),
           can_receive_offers_source = 'rider'
     where id = r.id;
  end if;

  insert into public.rider_presence_event (rider_id, presence, source)
  values (r.id, case when p_online then 'online' else 'offline' end::public.rider_presence,
          'rider');

  return jsonb_build_object('ok', true,
    'presence', case when p_online then 'online' else 'offline' end,
    'message', case when p_online
      then 'You are on. Offers will come through.'
      else 'You are off. No more offers until you turn it back on.' end);
end;
$$;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('merchant.store_added', 'merchants', 'notice', true, false, false, 'A merchant opened another store'),
  ('merchant.store_closed', 'merchants', 'notice', false, false, false, 'A merchant closed a store'),
  ('merchant.prep_changed', 'merchants', 'info', false, false, false, 'A merchant changed their prep time'),
  ('featured.requested_by_merchant', 'featured', 'notice', false, false, true, 'A merchant asked for a featured slot'),
  ('rider.profile_updated', 'riders', 'info', false, false, false, 'A rider changed their areas, shifts or distance')
on conflict (action) do nothing;

grant execute on function public.fn_merchant_mine(uuid) to authenticated;
grant execute on function public.fn_rider_mine(uuid) to authenticated;
grant execute on function public.rpc_merchant_add_store(uuid, text, text, double precision, double precision, boolean) to authenticated;
grant execute on function public.rpc_merchant_rename_store(uuid, text, text) to authenticated;
grant execute on function public.rpc_merchant_close_store(uuid, text) to authenticated;
grant execute on function public.rpc_merchant_set_prep(uuid, integer, integer) to authenticated;
grant execute on function public.rpc_merchant_request_featured(uuid, uuid, date, integer, text) to authenticated;
grant execute on function public.rpc_merchant_withdraw_featured(uuid) to authenticated;
grant execute on function public.rpc_rider_update_profile(uuid, text[], text[], integer) to authenticated;
grant execute on function public.rpc_rider_go_online(boolean, text) to authenticated;
