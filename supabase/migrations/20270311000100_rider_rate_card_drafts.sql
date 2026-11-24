-- Rider rate card: a draft can be written.
--
-- 20270311000100 (first written as 20270226000100; renumbered 24 Nov 2026 to
-- sort after main's latest migration, 20270310000100).
--
-- What a trip pays comes from the city's current rider_rate_card
-- (fn_rider_trip_pay); with none, a delivery is recorded but writes no
-- earning at all. Production has none. rpc_rate_card_publish
-- (20260101007800) already publishes a draft with two different people,
-- and refuses one without base and per-km pay, but nothing could create
-- or change a draft: the table has a read policy only. This adds that.
--
--   rpc_rate_card_draft_save     create the city's draft, or change it;
--                                any change clears a first approval, so
--                                the second person always approves what
--                                goes live.
--   rpc_rate_card_draft_discard  drop a draft that should not go live.
--
-- Who: the riders module or finance, the same staff who reach the card
-- in the console ("Ops manager + Finance"). Publishing stays as it was.
-- Nothing here touches the payout run, payout rules or Paystack
-- transfers (#200, #202): they read what a rider is owed, which is
-- written from this card when a trip is delivered.

create or replace function public.rpc_rate_card_draft_save(
  p_city_id uuid,
  p_version text,
  p_effective_from timestamptz,
  p_base_per_trip_kes bigint,
  p_per_km_after_2km_kes bigint,
  p_paid_waiting_per_5min_kes bigint default null,
  p_second_pickup_bonus_kes bigint default null,
  p_peak_bonus_dinner_kes bigint default null,
  p_peak_bonus_rain_kes bigint default null,
  p_cancellation_after_pickup_kes bigint default null,
  p_guest_tips_pass_through_pct integer default 100
)
returns public.rider_rate_card
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.rider_rate_card;
  v_before jsonb;
  v_version text := nullif(trim(coalesce(p_version, '')), '');
begin
  if not (authz.reaches_module('riders') or authz.reaches_module('finance')) then
    raise exception 'Not yours to change.' using errcode = 'insufficient_privilege';
  end if;
  if p_city_id is null or not exists (select 1 from public.city c where c.id = p_city_id) then
    raise exception 'Pick a city.' using errcode = '22023';
  end if;
  if v_version is null or length(v_version) > 40 then
    raise exception 'Give the card a short version name, like 2026-12.' using errcode = '22023';
  end if;
  if p_effective_from is null then
    raise exception 'Say when the card takes effect.' using errcode = '22023';
  end if;
  if coalesce(p_base_per_trip_kes, 0) <= 0 or p_per_km_after_2km_kes is null
     or p_per_km_after_2km_kes < 0 then
    raise exception 'Base pay per trip and pay per km are both needed.' using errcode = '22023';
  end if;
  if least(coalesce(p_paid_waiting_per_5min_kes, 0), coalesce(p_second_pickup_bonus_kes, 0),
           coalesce(p_peak_bonus_dinner_kes, 0), coalesce(p_peak_bonus_rain_kes, 0),
           coalesce(p_cancellation_after_pickup_kes, 0)) < 0 then
    raise exception 'Amounts cannot be negative.' using errcode = '22023';
  end if;
  if coalesce(p_guest_tips_pass_through_pct, -1) not between 0 and 100 then
    raise exception 'Tips passed to the rider is a percentage, 0 to 100.' using errcode = '22023';
  end if;

  /* One draft per city at a time: change it, or start one. */
  select * into v_card from public.rider_rate_card
   where city_id = p_city_id and status = 'draft'
   order by created_at desc limit 1
   for update;

  if v_card.id is not null then
    v_before := to_jsonb(v_card);
    update public.rider_rate_card set
      version = v_version,
      effective_from = p_effective_from,
      base_per_trip_kes = p_base_per_trip_kes,
      per_km_after_2km_kes = p_per_km_after_2km_kes,
      paid_waiting_per_5min_kes = p_paid_waiting_per_5min_kes,
      second_pickup_bonus_kes = p_second_pickup_bonus_kes,
      peak_bonus_dinner_kes = p_peak_bonus_dinner_kes,
      peak_bonus_rain_kes = p_peak_bonus_rain_kes,
      cancellation_after_pickup_kes = p_cancellation_after_pickup_kes,
      guest_tips_pass_through_pct = p_guest_tips_pass_through_pct,
      /* A changed card is a different promise: the first approval goes. */
      approved_by = null
    where id = v_card.id
    returning * into v_card;
  else
    insert into public.rider_rate_card (
      city_id, version, effective_from, status,
      base_per_trip_kes, per_km_after_2km_kes, paid_waiting_per_5min_kes,
      second_pickup_bonus_kes, peak_bonus_dinner_kes, peak_bonus_rain_kes,
      cancellation_after_pickup_kes, guest_tips_pass_through_pct)
    values (
      p_city_id, v_version, p_effective_from, 'draft',
      p_base_per_trip_kes, p_per_km_after_2km_kes, p_paid_waiting_per_5min_kes,
      p_second_pickup_bonus_kes, p_peak_bonus_dinner_kes, p_peak_bonus_rain_kes,
      p_cancellation_after_pickup_kes, p_guest_tips_pass_through_pct)
    returning * into v_card;
  end if;

  perform audit.log('staff'::public.actor_type, 'riders', 'rate_card.draft_saved',
    p_target_type => 'rate_card', p_target_id => v_card.id,
    p_city_id => v_card.city_id, p_before => v_before, p_after => to_jsonb(v_card));

  return v_card;
exception
  when unique_violation then
    raise exception 'There is already a card called % for this city. Use another version name.',
      v_version using errcode = '23505';
end;
$$;

revoke all on function public.rpc_rate_card_draft_save(
  uuid, text, timestamptz, bigint, bigint, bigint, bigint, bigint, bigint, bigint, integer)
  from public, anon;
grant execute on function public.rpc_rate_card_draft_save(
  uuid, text, timestamptz, bigint, bigint, bigint, bigint, bigint, bigint, bigint, integer)
  to authenticated;

create or replace function public.rpc_rate_card_draft_discard(p_card_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.rider_rate_card;
begin
  if not (authz.reaches_module('riders') or authz.reaches_module('finance')) then
    raise exception 'Not yours to change.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_card from public.rider_rate_card where id = p_card_id for update;
  if v_card.id is null then
    raise exception 'No such rate card.' using errcode = 'no_data_found';
  end if;
  if v_card.status <> 'draft' then
    raise exception 'Only a draft can be discarded; this card is %.', v_card.status
      using errcode = 'check_violation';
  end if;

  /* Archived, not deleted: what was proposed stays on record. */
  update public.rider_rate_card set status = 'archived' where id = p_card_id;

  perform audit.log('staff'::public.actor_type, 'riders', 'rate_card.draft_discarded',
    p_target_type => 'rate_card', p_target_id => p_card_id,
    p_city_id => v_card.city_id, p_before => to_jsonb(v_card));

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.rpc_rate_card_draft_discard(uuid) from public, anon;
grant execute on function public.rpc_rate_card_draft_discard(uuid) to authenticated;
