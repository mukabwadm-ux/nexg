-- Featured slots · the writes.
--
-- A request becomes a slot through: requested → eligibility (nightly
-- while live) → quoted and held → booked → creative approved → live →
-- ended. Each step below refuses rather than guesses, and the refusals
-- carry the sentence the merchant is shown.
--
-- Three things are deliberately hard:
--
--   A quote with no rate-card price is refused. Staff cannot type one.
--   An auto-paused slot does not restore itself. A merchant flipping
--   green and amber daily would flicker on the homepage.
--   A refund needs two different people and a reason from a list.

-- ═══════════════════════════════ the schedule, filled forward

/*
 * Twelve weeks of slot weeks, created once and extended by cron. The
 * homepage reads this table rather than deriving availability from
 * bookings at request time.
 */
create or replace function public.fn_featured_fill_schedule(p_weeks integer default 12)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.featured_slot_week (placement_id, week_start, status, price)
  select p.id, w.week_start, 'open',
         public.fn_featured_price(p.city_id, p.kind, p.category, w.week_start)
  from public.featured_placement p
  cross join (
    select (date_trunc('week', now())::date + (n * 7)) as week_start
    from generate_series(0, p_weeks - 1) n
  ) w
  where p.enabled
  on conflict (placement_id, week_start) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

select public.fn_featured_fill_schedule(12);

-- ═══════════════════════════════════════════════ requests

create or replace function public.rpc_featured_request(
  p_merchant_id uuid,
  p_placement_kind public.placement_kind,
  p_category public.merchant_category default null,
  p_wanted_start date default null,
  p_weeks integer default 1,
  p_auto_renew boolean default true
)
returns public.featured_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
  v_merchant public.merchant;
  v_eligibility jsonb;
  v_open integer;
  v_max_open integer;
  v_max_weeks integer;
  v_free boolean;
  v_rank integer;
begin
  select * into v_merchant from public.merchant where id = p_merchant_id;
  if v_merchant.id is null then
    raise exception 'No such merchant.' using errcode = 'no_data_found';
  end if;
  /*
   * The merchant's own people, or staff who run this module — "+ Book
   * slot" in the console is a request made on a merchant's behalf, and
   * growth holds `featured` rather than any merchant-ops role.
   */
  if not authz.reaches_module('featured')
     and not authz.works_merchant(p_merchant_id)
     and not authz.is_merchant_member(p_merchant_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;

  select (value #>> '{}')::integer into v_max_open
  from public.featured_rule where key = 'waitlist.max_per_merchant';
  select (value #>> '{}')::integer into v_max_weeks
  from public.featured_rule where key = 'max_weeks';

  if p_weeks > coalesce(v_max_weeks, 8) then
    raise exception 'The longest booking is % weeks.', coalesce(v_max_weeks, 8)
      using errcode = 'check_violation';
  end if;

  select count(*)::integer into v_open from public.featured_booking
  where merchant_id = p_merchant_id and status in ('requested', 'waitlisted', 'quoted');

  if v_open >= coalesce(v_max_open, 2) then
    raise exception 'You already have % open requests. Settle one before asking for another.',
      v_open using errcode = 'check_violation';
  end if;

  v_eligibility := public.fn_featured_eligibility(p_merchant_id, p_placement_kind, p_category);

  /* Is any week of the wanted window actually free? If not this is a
     waitlist entry, and the merchant is told so rather than left to
     wonder. */
  v_free := exists (
    select 1
    from public.featured_slot_week sw
    join public.featured_placement p on p.id = sw.placement_id
    where p.city_id = v_merchant.city_id
      and p.kind = p_placement_kind
      and p.category is not distinct from p_category
      and p.enabled
      and sw.status = 'open'
      and sw.week_start >= coalesce(p_wanted_start, current_date)
  );

  if not v_free then
    select coalesce(max(waitlist_rank), 0) + 1 into v_rank
    from public.featured_booking
    where city_id = v_merchant.city_id
      and placement_kind = p_placement_kind
      and category is not distinct from p_category
      and status = 'waitlisted';
  end if;

  insert into public.featured_booking (
    merchant_id, placement_kind, category, city_id, status, requested_via,
    requested_by, wanted_start, weeks, auto_renew, eligibility, waitlist_rank
  )
  values (
    p_merchant_id, p_placement_kind, p_category, v_merchant.city_id,
    (case when v_free then 'requested' else 'waitlisted' end)::public.booking_status,
    case when authz.is_merchant_member(p_merchant_id) then 'dashboard' else 'staff' end::text,
    (select auth.uid()), p_wanted_start, p_weeks, p_auto_renew, v_eligibility, v_rank
  )
  returning * into v_booking;

  insert into public.notification (kind, status) values ('featured_request_received', 'pending');
  if not v_free then
    insert into public.notification (kind, status) values ('featured_waitlisted', 'pending');
  end if;

  perform audit.log('staff'::public.actor_type, 'featured', 'featured.requested',
    p_target_type => 'featured_booking', p_target_id => v_booking.id,
    p_city_id => v_merchant.city_id,
    p_after => jsonb_build_object('kind', p_placement_kind, 'weeks', p_weeks,
                                  'eligible', v_eligibility -> 'passed'));

  return v_booking;
end;
$$;

/*
 * Hold the weeks and send the price.
 *
 * Refuses when any week in range is taken, and refuses when the rate
 * card has no price for the placement. The second is the important
 * one: without it, somebody would type a number.
 */
create or replace function public.rpc_featured_hold_and_quote(
  p_booking_id uuid,
  p_placement_id uuid,
  p_start_date date,
  p_weeks integer
)
returns public.featured_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
  v_placement public.featured_placement;
  v_price bigint;
  v_card public.featured_rate_card;
  v_hold integer;
  v_quote integer;
  v_taken text;
begin
  if not authz.reaches_module('featured') then
    raise exception 'Not yours to quote.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.featured_booking where id = p_booking_id;
  select * into v_placement from public.featured_placement where id = p_placement_id;

  if v_booking.id is null or v_placement.id is null then
    raise exception 'No such booking or placement.' using errcode = 'no_data_found';
  end if;
  if extract(isodow from p_start_date) <> 1 then
    raise exception 'A featured week starts on a Monday.' using errcode = 'check_violation';
  end if;

  if not coalesce((v_booking.eligibility ->> 'passed')::boolean, false) then
    raise exception 'That merchant does not pass the eligibility checks. Override it first if you mean to.'
      using errcode = 'check_violation';
  end if;

  v_price := public.fn_featured_price(v_placement.city_id, v_placement.kind,
                                      v_placement.category, p_start_date);
  if v_price is null then
    raise exception 'No price is set for % in this city. Finance sets the rate card — nobody types a price here.',
      v_placement.label using errcode = 'check_violation';
  end if;

  /* Every week, or none. A half-held booking is worse than a refusal. */
  select string_agg(to_char(sw.week_start, 'DD Mon'), ', ') into v_taken
  from public.featured_slot_week sw
  where sw.placement_id = p_placement_id
    and sw.week_start >= p_start_date
    and sw.week_start < p_start_date + (p_weeks * 7)
    and sw.status <> 'open';

  if v_taken is not null then
    raise exception 'Those weeks are not all free — % already taken.', v_taken
      using errcode = 'check_violation';
  end if;

  if (select count(*) from public.featured_slot_week sw
      where sw.placement_id = p_placement_id
        and sw.week_start >= p_start_date
        and sw.week_start < p_start_date + (p_weeks * 7)) <> p_weeks then
    raise exception 'The schedule does not reach that far yet.' using errcode = 'check_violation';
  end if;

  select (value #>> '{}')::integer into v_hold from public.featured_rule where key = 'hold_hours';
  select (value #>> '{}')::integer into v_quote from public.featured_rule where key = 'quote_hours';

  select * into v_card from public.featured_rate_card
  where city_id = v_placement.city_id and status in ('current', 'scheduled')
  order by effective_from desc limit 1;

  update public.featured_slot_week set status = 'held', booking_id = p_booking_id,
         price = v_price
  where placement_id = p_placement_id
    and week_start >= p_start_date
    and week_start < p_start_date + (p_weeks * 7);

  update public.featured_booking set
    placement_id = p_placement_id,
    status = 'quoted',
    start_date = p_start_date,
    end_date = p_start_date + (p_weeks * 7) - 3,
    weeks = p_weeks,
    /* Frozen. A rate change after this does not change what was sold. */
    quoted_price = v_price,
    quoted_rate_card_id = v_card.id,
    hold_expires_at = now() + make_interval(hours => coalesce(v_hold, 48)),
    quote_expires_at = now() + make_interval(hours => coalesce(v_quote, 48)),
    booked_by = authz.staff_id()
  where id = p_booking_id
  returning * into v_booking;

  insert into public.notification (kind, status) values ('featured_quote', 'pending');

  perform audit.log('staff'::public.actor_type, 'featured', 'featured.quoted',
    p_target_type => 'featured_booking', p_target_id => p_booking_id,
    p_city_id => v_placement.city_id,
    p_after => jsonb_build_object('price', v_price, 'weeks', p_weeks,
                                  'start', p_start_date, 'placement', v_placement.label),
    p_severity => 'notice'::public.audit_severity);

  return v_booking;
end;
$$;

create or replace function public.rpc_featured_confirm(p_booking_id uuid)
returns public.featured_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
  v_merchant public.merchant;
begin
  select * into v_booking from public.featured_booking where id = p_booking_id;
  if v_booking.id is null then
    raise exception 'No such booking.' using errcode = 'no_data_found';
  end if;
  if not authz.is_merchant_member(v_booking.merchant_id)
     and not authz.reaches_module('featured')
     and not authz.works_merchant(v_booking.merchant_id) then
    raise exception 'Not your booking.' using errcode = 'insufficient_privilege';
  end if;
  if v_booking.status <> 'quoted' then
    raise exception 'That quote is %, not open.', v_booking.status
      using errcode = 'check_violation';
  end if;
  if v_booking.quote_expires_at < now() then
    raise exception 'That quote expired on %. Ask us for a new one.',
      to_char(v_booking.quote_expires_at at time zone 'Africa/Nairobi', 'DD Mon HH24:MI')
      using errcode = 'check_violation';
  end if;

  select * into v_merchant from public.merchant where id = v_booking.merchant_id;

  update public.featured_booking set
    status = 'booked',
    confirmed_at = now(),
    renews_at = case when auto_renew then end_date + 3 end
  where id = p_booking_id
  returning * into v_booking;

  update public.featured_slot_week set status = 'booked'
  where booking_id = p_booking_id and status = 'held';

  /* A draft creative, prefilled, so the merchant has something to
     edit rather than a blank form. */
  insert into public.featured_creative (booking_id, merchant_id, cover_photo_path, headline)
  values (p_booking_id, v_booking.merchant_id, v_merchant.cover_photo_path,
          v_merchant.trading_name)
  on conflict do nothing;

  insert into public.notification (kind, status) values ('featured_booked', 'pending');

  perform audit.log('merchant_user'::public.actor_type, 'featured', 'featured.booked',
    p_target_type => 'featured_booking', p_target_id => p_booking_id,
    p_city_id => v_booking.city_id,
    p_after => jsonb_build_object('price', v_booking.quoted_price,
                                  'start', v_booking.start_date),
    p_severity => 'notice'::public.audit_severity);

  return v_booking;
end;
$$;

create or replace function public.rpc_featured_decline(p_booking_id uuid, p_reason text)
returns public.featured_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
begin
  if not authz.reaches_module('featured') then
    raise exception 'Not yours to decline.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'The merchant is sent this reason word for word. Write one.'
      using errcode = 'check_violation';
  end if;

  update public.featured_booking
  set status = 'declined', declined_reason = trim(p_reason)
  where id = p_booking_id and status in ('requested', 'waitlisted', 'quoted')
  returning * into v_booking;

  if v_booking.id is null then
    raise exception 'That request is not open.' using errcode = 'no_data_found';
  end if;

  /* Give the weeks back. */
  update public.featured_slot_week set status = 'open', booking_id = null
  where booking_id = p_booking_id and status in ('held', 'booked');

  insert into public.notification (kind, status) values ('featured_declined', 'pending');

  perform audit.log('staff'::public.actor_type, 'featured', 'featured.declined',
    p_target_type => 'featured_booking', p_target_id => p_booking_id,
    p_reason => trim(p_reason), p_city_id => v_booking.city_id);

  return v_booking;
end;
$$;

grant execute on function public.rpc_featured_request(uuid, public.placement_kind, public.merchant_category, date, integer, boolean) to authenticated;
grant execute on function public.rpc_featured_hold_and_quote(uuid, uuid, date, integer) to authenticated;
grant execute on function public.rpc_featured_confirm(uuid) to authenticated;
grant execute on function public.rpc_featured_decline(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════ creative

create or replace function public.rpc_featured_creative_submit(
  p_booking_id uuid,
  p_patch jsonb
)
returns public.featured_creative
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creative public.featured_creative;
  v_blurb text := nullif(trim(coalesce(p_patch ->> 'blurb', '')), '');
  v_banned text;
  v_max integer;
begin
  select * into v_creative from public.featured_creative where booking_id = p_booking_id
  order by version desc limit 1;

  if v_creative.id is null then
    raise exception 'No creative for that booking.' using errcode = 'no_data_found';
  end if;
  if not authz.is_merchant_member(v_creative.merchant_id)
     and not authz.reaches_module('featured') then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select (value #>> '{}')::integer into v_max
  from public.featured_rule where key = 'creative.max_blurb_chars';

  if v_blurb is not null and length(v_blurb) > coalesce(v_max, 60) then
    raise exception 'The blurb is longer than % characters.', coalesce(v_max, 60)
      using errcode = 'check_violation';
  end if;

  /*
   * Checked here as well as in the form. A paid card claiming to be
   * "the best" is the thing that makes a labelled placement feel like
   * a lie, and the form is not a security boundary.
   */
  if v_blurb is not null then
    select string_agg(t, ', ') into v_banned
    from (select jsonb_array_elements_text(value) as t
          from public.featured_rule where key = 'creative.banned_terms') x
    where lower(v_blurb) like '%' || lower(t) || '%';

    if v_banned is not null then
      raise exception 'A sponsored card cannot say: %. Describe what you offer instead.', v_banned
        using errcode = 'check_violation';
    end if;
  end if;

  update public.featured_creative set
    blurb = v_blurb,
    cover_photo_path = coalesce(nullif(p_patch ->> 'cover_photo_path', ''), cover_photo_path),
    pinned_item_id = coalesce(nullif(p_patch ->> 'pinned_item_id', '')::uuid, pinned_item_id),
    status = 'pending_review',
    rejection_reason = null,
    version = version + 1
  where id = v_creative.id
  returning * into v_creative;

  perform audit.log('merchant_user'::public.actor_type, 'featured',
    'featured.creative_submitted',
    p_target_type => 'featured_creative', p_target_id => v_creative.id);

  return v_creative;
end;
$$;

/* A superseded creative is archived, not deleted — the merchant and
   the reviewer can both see what was on the card last week. */
alter type public.creative_status add value if not exists 'archived';

create or replace function public.rpc_featured_creative_review(
  p_creative_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns public.featured_creative
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creative public.featured_creative;
begin
  if not authz.reaches_module('featured') then
    raise exception 'Not yours to review.' using errcode = 'insufficient_privilege';
  end if;
  if not p_approve and coalesce(trim(coalesce(p_reason, '')), '') = '' then
    raise exception 'The merchant has to be told what to change. Write a reason.'
      using errcode = 'check_violation';
  end if;

  if p_approve then
    /* Only one approved creative per booking; the old one steps down. */
    update public.featured_creative set status = 'archived'
    where booking_id = (select booking_id from public.featured_creative where id = p_creative_id)
      and status = 'approved' and id <> p_creative_id;
  end if;

  update public.featured_creative set
    status = (case when p_approve then 'approved' else 'rejected' end)::public.creative_status,
    reviewed_by = authz.staff_id(),
    reviewed_at = now(),
    rejection_reason = case when p_approve then null else trim(p_reason) end
  where id = p_creative_id
  returning * into v_creative;

  insert into public.notification (kind, status)
  values (case when p_approve then 'featured_creative_approved'
               else 'featured_creative_rejected' end::public.notification_kind, 'pending');

  perform audit.log('staff'::public.actor_type, 'featured',
    case when p_approve then 'featured.creative_approved' else 'featured.creative_rejected' end,
    p_target_type => 'featured_creative', p_target_id => p_creative_id,
    p_reason => p_reason);

  return v_creative;
end;
$$;

grant execute on function public.rpc_featured_creative_submit(uuid, jsonb) to authenticated;
grant execute on function public.rpc_featured_creative_review(uuid, boolean, text) to authenticated;

-- ═══════════════════════════════════ pause, restore, end

create or replace function public.fn_featured_fee_for_week(
  p_booking_id uuid,
  p_week_start date,
  p_days_live integer default 7
)
returns public.featured_fee_line
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
  v_placement public.featured_placement;
  v_card public.featured_rate_card;
  v_ex bigint;
  v_vat bigint;
  v_line public.featured_fee_line;
begin
  select * into v_booking from public.featured_booking where id = p_booking_id;
  select * into v_placement from public.featured_placement where id = v_booking.placement_id;
  select * into v_card from public.featured_rate_card where id = v_booking.quoted_rate_card_id;

  /* Pro-rata by days actually live. Rounding goes down, in the
     merchant's favour. */
  v_ex := floor(coalesce(v_booking.quoted_price, 0) * p_days_live / 7.0)::bigint;
  if v_booking.discount_pct is not null then
    v_ex := floor(v_ex * (100 - v_booking.discount_pct) / 100.0)::bigint;
  end if;

  v_vat := case when v_card.vat_pct is not null
    then round(v_ex * v_card.vat_pct / 100.0)::bigint end;

  insert into public.featured_fee_line (
    booking_id, merchant_id, week_start, placement_label,
    fee_ex_vat, vat, fee_total, days_live, pro_rata, status
  )
  values (
    p_booking_id, v_booking.merchant_id, p_week_start,
    coalesce(v_placement.label, v_booking.placement_kind::text),
    v_ex, v_vat, v_ex + coalesce(v_vat, 0), p_days_live, p_days_live < 7,
    (case when p_days_live < 7 then 'pro_rata_review' else 'scheduled' end)::public.fee_line_status
  )
  on conflict (booking_id, week_start) do update set
    fee_ex_vat = excluded.fee_ex_vat,
    vat = excluded.vat,
    fee_total = excluded.fee_total,
    days_live = excluded.days_live,
    pro_rata = excluded.pro_rata,
    status = case when public.featured_fee_line.status = 'settled'
      then public.featured_fee_line.status else excluded.status end
  returning * into v_line;

  return v_line;
end;
$$;

create or replace function public.rpc_featured_auto_pause(
  p_booking_id uuid,
  p_failing_check text
)
returns public.featured_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
  v_days integer;
begin
  select * into v_booking from public.featured_booking where id = p_booking_id;
  if v_booking.status <> 'live' then
    return v_booking;
  end if;

  update public.featured_booking set
    status = 'auto_paused', paused_at = now(),
    pause_reason = p_failing_check, pause_source = 'system'
  where id = p_booking_id
  returning * into v_booking;

  update public.featured_slot_week set status = 'auto_paused'
  where booking_id = p_booking_id
    and week_start = date_trunc('week', now())::date;

  /* Credit the days not served, now, rather than at month end. */
  v_days := greatest(0, (current_date - date_trunc('week', now())::date))::integer;
  perform public.fn_featured_fee_for_week(p_booking_id, date_trunc('week', now())::date, v_days);

  insert into public.notification (kind, status) values ('featured_auto_paused', 'pending');

  perform audit.log('system'::public.actor_type, 'featured', 'featured.auto_paused',
    p_target_type => 'featured_booking', p_target_id => p_booking_id,
    p_city_id => v_booking.city_id, p_reason => p_failing_check,
    p_after => jsonb_build_object('days_live', v_days),
    p_severity => 'high'::public.audit_severity);

  return v_booking;
end;
$$;

/*
 * Restoring is a person's decision, never automatic.
 *
 * A merchant who drops to amber on Tuesday and recovers on Wednesday
 * would otherwise appear, vanish and reappear on the homepage inside a
 * week. Somebody looks, and only then does it come back.
 */
create or replace function public.rpc_featured_restore(p_booking_id uuid)
returns public.featured_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
  v_eligibility jsonb;
begin
  if not authz.reaches_module('featured') then
    raise exception 'Not yours to restore.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_booking from public.featured_booking where id = p_booking_id;
  if v_booking.status <> 'auto_paused' then
    raise exception 'That slot is %, not paused.', v_booking.status
      using errcode = 'check_violation';
  end if;

  v_eligibility := public.fn_featured_eligibility(
    v_booking.merchant_id, v_booking.placement_kind, v_booking.category);

  if not (v_eligibility ->> 'passed')::boolean then
    raise exception 'They still do not pass: %',
      (select string_agg(v ->> 'reason', ' · ')
       from jsonb_each(v_eligibility -> 'checks') e(k, v)
       where not (v ->> 'passed')::boolean)
      using errcode = 'check_violation';
  end if;

  update public.featured_booking set
    status = 'live', paused_at = null, pause_reason = null, pause_source = null,
    eligibility = v_eligibility
  where id = p_booking_id
  returning * into v_booking;

  update public.featured_slot_week set status = 'live'
  where booking_id = p_booking_id and status = 'auto_paused';

  insert into public.notification (kind, status) values ('featured_restored', 'pending');

  perform audit.log('staff'::public.actor_type, 'featured', 'featured.restored',
    p_target_type => 'featured_booking', p_target_id => p_booking_id,
    p_city_id => v_booking.city_id, p_severity => 'notice'::public.audit_severity);

  return v_booking;
end;
$$;

create or replace function public.rpc_featured_end_at_week_close(
  p_booking_id uuid,
  p_reason text
)
returns public.featured_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
begin
  if not authz.reaches_module('featured') then
    raise exception 'Not yours to end.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Say why — the merchant is told.' using errcode = 'check_violation';
  end if;

  update public.featured_booking set
    auto_renew = false, renews_at = null,
    end_reason = trim(p_reason),
    end_date = least(coalesce(end_date, current_date), date_trunc('week', now())::date + 4)
  where id = p_booking_id
  returning * into v_booking;

  /* This week stands — they paid for it. Future weeks go back. */
  update public.featured_slot_week set status = 'open', booking_id = null
  where booking_id = p_booking_id
    and week_start > date_trunc('week', now())::date;

  insert into public.notification (kind, status) values ('featured_ended', 'pending');

  perform audit.log('staff'::public.actor_type, 'featured', 'featured.ended',
    p_target_type => 'featured_booking', p_target_id => p_booking_id,
    p_reason => trim(p_reason), p_city_id => v_booking.city_id);

  return v_booking;
end;
$$;

create or replace function public.rpc_featured_cancel_renewal(p_booking_id uuid)
returns public.featured_booking
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.featured_booking;
begin
  select * into v_booking from public.featured_booking where id = p_booking_id;
  if not authz.is_merchant_member(v_booking.merchant_id)
     and not authz.reaches_module('featured') then
    raise exception 'Not your booking.' using errcode = 'insufficient_privilege';
  end if;

  update public.featured_booking set auto_renew = false, renews_at = null
  where id = p_booking_id returning * into v_booking;

  update public.featured_slot_week set status = 'open', booking_id = null
  where booking_id = p_booking_id and week_start > date_trunc('week', now())::date;

  insert into public.notification (kind, status) values ('featured_renewal_cancelled', 'pending');

  perform audit.log('merchant_user'::public.actor_type, 'featured',
    'featured.renewal_cancelled',
    p_target_type => 'featured_booking', p_target_id => p_booking_id);

  return v_booking;
end;
$$;

grant execute on function public.rpc_featured_auto_pause(uuid, text) to service_role;
grant execute on function public.rpc_featured_restore(uuid) to authenticated;
grant execute on function public.rpc_featured_end_at_week_close(uuid, text) to authenticated;
grant execute on function public.rpc_featured_cancel_renewal(uuid) to authenticated;
grant execute on function public.fn_featured_fee_for_week(uuid, date, integer) to service_role;

-- ═══════════════════════════════════════════════ the crons

/*
 * Nightly, after the health run. Re-checks everything that is not yet
 * finished, and auto-pauses what is live and has stopped qualifying.
 */
create or replace function public.cron_featured_eligibility()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking record;
  v_result jsonb;
  v_action text;
  v_n integer := 0;
  v_failing text;
begin
  for v_booking in
    select * from public.featured_booking
    where status in ('waitlisted', 'requested', 'quoted', 'booked', 'live')
  loop
    v_result := public.fn_featured_eligibility(
      v_booking.merchant_id, v_booking.placement_kind, v_booking.category);

    v_action := 'none';

    if not (v_result ->> 'passed')::boolean then
      select string_agg(k, ', ') into v_failing
      from jsonb_each(v_result -> 'checks') e(k, v)
      where not (v ->> 'passed')::boolean;

      if v_booking.status = 'live' then
        perform public.rpc_featured_auto_pause(v_booking.id, v_failing);
        v_action := 'auto_paused';
      else
        /* Waitlisted and quoted merchants keep their place and are
           flagged. Dropping them would punish a bad week twice. */
        v_action := 'flagged';
      end if;
    end if;

    update public.featured_booking set eligibility = v_result where id = v_booking.id;

    insert into public.featured_eligibility_run (booking_id, result, passed, action)
    values (v_booking.id, v_result, (v_result ->> 'passed')::boolean, v_action);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

/* Monday 00:00 · a booked week with an approved creative goes live. */
create or replace function public.cron_featured_activate()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date := date_trunc('week', now())::date;
  v_booking record;
  v_n integer := 0;
begin
  for v_booking in
    select b.* from public.featured_booking b
    join public.featured_slot_week sw
      on sw.booking_id = b.id and sw.week_start = v_week
    where b.status in ('booked', 'live')
      and exists (select 1 from public.featured_creative cr
                  where cr.booking_id = b.id and cr.status = 'approved')
  loop
    update public.featured_booking set status = 'live' where id = v_booking.id;
    update public.featured_slot_week set status = 'live'
    where booking_id = v_booking.id and week_start = v_week;

    perform public.fn_featured_fee_for_week(v_booking.id, v_week, 7);

    insert into public.notification (kind, status) values ('featured_live', 'pending');

    perform audit.log('system'::public.actor_type, 'featured', 'featured.live',
      p_target_type => 'featured_booking', p_target_id => v_booking.id,
      p_city_id => v_booking.city_id);

    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

/* Hourly for today, nightly to finalise. */
create or replace function public.fn_featured_rollup(p_day date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  insert into public.featured_metrics_daily
    (booking_id, placement_id, merchant_id, day, views, taps, orders, order_value,
     ctr, conversion, refreshed_at)
  select
    e.booking_id,
    max(e.placement_id),
    max(e.merchant_id),
    p_day,
    count(*) filter (where e.kind = 'view')::integer,
    count(*) filter (where e.kind = 'tap')::integer,
    count(*) filter (where e.kind = 'order')::integer,
    0,
    case when count(*) filter (where e.kind = 'view') > 0
      then round(count(*) filter (where e.kind = 'tap')::numeric
                 / count(*) filter (where e.kind = 'view'), 4) end,
    case when count(*) filter (where e.kind = 'tap') > 0
      then round(count(*) filter (where e.kind = 'order')::numeric
                 / count(*) filter (where e.kind = 'tap'), 4) end,
    now()
  from public.featured_event e
  where e.at >= p_day and e.at < p_day + 1
  group by e.booking_id
  on conflict (booking_id, day) do update set
    views = excluded.views, taps = excluded.taps, orders = excluded.orders,
    ctr = excluded.ctr, conversion = excluded.conversion, refreshed_at = now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

grant execute on function public.cron_featured_eligibility() to service_role;
grant execute on function public.cron_featured_activate() to service_role;
grant execute on function public.fn_featured_rollup(date) to service_role;
grant execute on function public.fn_featured_fill_schedule(integer) to service_role;

-- ═════════════════════════════════════ rate card and money

create or replace function public.rpc_featured_rate_card_propose(
  p_city_id uuid,
  p_version text,
  p_effective_from date,
  p_prices jsonb,
  p_vat_pct numeric default null
)
returns public.featured_rate_card
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.featured_rate_card;
begin
  if not authz.reaches_module('featured') then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;
  if extract(isodow from p_effective_from) <> 1 then
    raise exception 'A rate card takes effect on a Monday.' using errcode = 'check_violation';
  end if;
  if p_effective_from <= current_date then
    raise exception 'A rate card takes effect in the future — merchants are told two weeks ahead.'
      using errcode = 'check_violation';
  end if;

  insert into public.featured_rate_card
    (city_id, version, status, effective_from, prices, vat_pct)
  values (p_city_id, p_version, 'awaiting_approval', p_effective_from, p_prices, p_vat_pct)
  on conflict (city_id, version) do update set
    prices = excluded.prices, vat_pct = excluded.vat_pct,
    effective_from = excluded.effective_from, status = 'awaiting_approval'
  returning * into v_card;

  perform audit.log('staff'::public.actor_type, 'featured', 'featured.rate_card_proposed',
    p_target_type => 'featured_rate_card', p_target_id => v_card.id,
    p_city_id => p_city_id, p_after => p_prices,
    p_severity => 'high'::public.audit_severity);

  return v_card;
end;
$$;

create or replace function public.rpc_featured_rate_card_approve(p_card_id uuid)
returns public.featured_rate_card
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.featured_rate_card;
  v_me uuid := authz.staff_id();
begin
  if not authz.reaches_module('featured') then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_card from public.featured_rate_card where id = p_card_id;
  if v_card.status <> 'awaiting_approval' then
    raise exception 'That card is %.', v_card.status using errcode = 'check_violation';
  end if;

  if v_card.approved_by is null then
    update public.featured_rate_card set approved_by = v_me
    where id = p_card_id returning * into v_card;

  elsif v_card.approved_by = v_me then
    raise exception 'You approved this. Changing what merchants pay needs a second person.'
      using errcode = 'insufficient_privilege';

  else
    update public.featured_rate_card set status = 'archived'
    where city_id = v_card.city_id and status = 'current';

    update public.featured_rate_card
    set second_approver_id = v_me, status = 'scheduled'
    where id = p_card_id returning * into v_card;

    insert into public.notification (kind, status)
    values ('featured_rate_card_changing', 'pending');
  end if;

  perform audit.log('staff'::public.actor_type, 'featured', 'featured.rate_card_published',
    p_target_type => 'featured_rate_card', p_target_id => p_card_id,
    p_city_id => v_card.city_id, p_approved_by => v_me,
    p_after => jsonb_build_object('status', v_card.status, 'from', v_card.effective_from),
    p_severity => 'high'::public.audit_severity);

  return v_card;
end;
$$;

create or replace function public.rpc_featured_fee_resolve(
  p_line_id uuid,
  p_final_days integer,
  p_note text default null
)
returns public.featured_fee_line
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.featured_fee_line;
begin
  if not authz.reaches_module('featured') then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;

  select * into v_line from public.featured_fee_line where id = p_line_id;
  v_line := public.fn_featured_fee_for_week(v_line.booking_id, v_line.week_start, p_final_days);

  update public.featured_fee_line set status = 'scheduled'
  where id = p_line_id returning * into v_line;

  perform audit.log('staff'::public.actor_type, 'featured', 'featured.fee_resolved',
    p_target_type => 'featured_fee_line', p_target_id => p_line_id,
    p_reason => p_note, p_after => jsonb_build_object('days', p_final_days),
    p_severity => 'notice'::public.audit_severity);

  return v_line;
end;
$$;

/*
 * A refund needs two different people and a reason from a fixed list.
 * Open-ended refunds on a paid product are how a placement becomes
 * negotiable after the fact.
 */
create or replace function public.rpc_featured_refund(
  p_line_id uuid,
  p_amount bigint,
  p_reason text
)
returns public.featured_fee_line
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.featured_fee_line;
  v_me uuid := authz.staff_id();
begin
  if not authz.reaches_module('featured') then
    raise exception 'Not yours.' using errcode = 'insufficient_privilege';
  end if;
  if p_reason not in ('nexg_outage', 'placement_not_rendered', 'wrong_slot') then
    raise exception 'A refund reason has to be one of: NexG outage, placement not rendered, wrong slot.'
      using errcode = 'check_violation';
  end if;

  select * into v_line from public.featured_fee_line where id = p_line_id;
  if v_line.id is null then
    raise exception 'No such fee line.' using errcode = 'no_data_found';
  end if;

  if v_line.refund_approved_by is null then
    update public.featured_fee_line set
      refund_approved_by = v_me, refund_amount = p_amount, refund_reason = p_reason
    where id = p_line_id returning * into v_line;

  elsif v_line.refund_approved_by = v_me then
    raise exception 'You asked for this refund. Finance has to approve it.'
      using errcode = 'insufficient_privilege';

  else
    update public.featured_fee_line set
      refund_second_approver_id = v_me, status = 'refunded'
    where id = p_line_id returning * into v_line;

    insert into public.notification (kind, status) values ('featured_refund_issued', 'pending');
  end if;

  perform audit.log('staff'::public.actor_type, 'featured', 'featured.refunded',
    p_target_type => 'featured_fee_line', p_target_id => p_line_id,
    p_reason => p_reason, p_approved_by => v_me,
    p_after => jsonb_build_object('amount', p_amount, 'status', v_line.status),
    p_severity => 'high'::public.audit_severity);

  return v_line;
end;
$$;

grant execute on function public.rpc_featured_rate_card_propose(uuid, text, date, jsonb, numeric) to authenticated;
grant execute on function public.rpc_featured_rate_card_approve(uuid) to authenticated;
grant execute on function public.rpc_featured_fee_resolve(uuid, integer, text) to authenticated;
grant execute on function public.rpc_featured_refund(uuid, bigint, text) to authenticated;

-- ═══════════════════════════════════════════════ security

do $$
declare
  t text;
begin
  foreach t in array array[
    'featured_placement', 'featured_rate_card', 'featured_booking', 'featured_slot_week',
    'featured_creative', 'featured_event', 'featured_metrics_daily', 'featured_fee_line',
    'featured_eligibility_run', 'featured_report', 'featured_rule'
  ]
  loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

/* Inventory, prices and rules are NexG's. A merchant sees a price
   through a quote, never the rate card. */
create policy featured_placement_read on public.featured_placement
  for select to authenticated using (authz.reaches_module('featured'));
create policy featured_rate_card_read on public.featured_rate_card
  for select to authenticated using (authz.reaches_module('featured'));
create policy featured_rule_read on public.featured_rule
  for select to authenticated using (authz.reaches_module('featured'));
create policy featured_slot_week_read on public.featured_slot_week
  for select to authenticated using (authz.reaches_module('featured'));
create policy featured_eligibility_run_read on public.featured_eligibility_run
  for select to authenticated using (authz.reaches_module('featured'));

create policy featured_booking_read on public.featured_booking
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.reaches_module('featured')
         or authz.works_merchant(merchant_id));

create policy featured_creative_read on public.featured_creative
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.reaches_module('featured'));

/* Raw events are staff-only. A merchant gets the rollup, which is the
   same number the console shows. */
create policy featured_event_read on public.featured_event
  for select to authenticated using (authz.reaches_module('featured'));

create policy featured_metrics_read on public.featured_metrics_daily
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.reaches_module('featured'));

create policy featured_fee_read on public.featured_fee_line
  for select to authenticated
  using (authz.is_merchant_member(merchant_id) or authz.reaches_module('featured')
         or authz.has_role('finance', null));

create policy featured_report_read on public.featured_report
  for select to authenticated
  using (authz.reaches_module('featured')
         or exists (select 1 from public.featured_booking b
                    where b.id = featured_report.booking_id
                      and authz.is_merchant_member(b.merchant_id)));
