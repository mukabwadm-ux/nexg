-- Weekend, seasonal and long-stay rates for stay units, used everywhere a
-- stay is priced (owner's request, 26 Nov 2026). Until now a stay always
-- cost unit.nightly_rate_kes × nights.
--
-- What this adds:
--
-- 1. Unit columns, all optional (null = the standard nightly rate / no
--    discount):
--      weekend_rate_kes      the rate for Friday and Saturday nights
--      weekly_discount_pct   off the whole stay from 7 nights (1–90)
--      monthly_discount_pct  off the whole stay from 28 nights (1–90)
-- 2. stays_season (staff-only; RLS on, no policies): a named date range,
--    inclusive, that moves each night's rate by adjust_pct (-90 to +300),
--    for one unit, one property, one city or everywhere.
-- 3. fn_stay_quote(unit, check_in, check_out): the one price of a stay.
--    Each night starts at the weekend rate on Friday and Saturday nights,
--    else the nightly rate; the most specific active season covering that
--    night moves it (unit > property > city > everywhere; the newest wins a
--    tie), rounded to whole KES; then the long-stay discount comes off the
--    sum (monthly from 28 nights, else weekly from 7), rounded to whole KES.
--    Returns {nights, total_kes, subtotal_kes, avg_nightly_kes,
--    base_nightly_kes, discount_pct, discount_kes, per_night:[{day,
--    rate_kes, weekend, season}]}, or null when the unit has no rate.
--    rpc_stay_quote is the guest-facing read (live, listed, bookable units).
-- 4. Pricing redefined to use it (each from its newest definition, same
--    signature): rpc_stay_hold (20270116000400: quote_total_kes = total,
--    rate_kes = average night), rpc_stay_search (20261122000100: total_kes;
--    nightly_rate_kes stays the base rate), rpc_native_stay_quote and
--    rpc_native_stay_hold (20270123000100: nightly_minor is the average
--    night; the price re-check compares totals).
-- 5. Hosts: rpc_unit_upsert_guarded (20270320000100) also saves the three
--    unit columns when their keys are sent (null or empty clears).
-- 6. Staff (authz.works_hospitality, audited): rpc_console_unit_rate_rules_set,
--    rpc_console_stays_season_save, rpc_console_stays_season_end. Readers
--    (authz.reaches_module('hotels')): rpc_console_stays_seasons,
--    rpc_console_unit_rates; rpc_console_stays_calendar (20270329000100)
--    now gives each day that night's real rate and each row its rules.
--
-- Rollback: re-run the six redefined functions from the migrations named
-- above; drop rpc_console_unit_rates, rpc_console_stays_seasons,
-- rpc_console_stays_season_end, rpc_console_stays_season_save,
-- rpc_console_unit_rate_rules_set, rpc_stay_quote, fn_stay_quote, the table
-- stays_season, the three unit columns and the three action_registry rows.

-- ═══════════════════════════════════════════════════════════════ 0. audit

insert into audit.action_registry (action, module, default_severity, money, description) values
  ('unit.rate_rules_set_by_staff', 'hotels', 'notice', true,
   'Staff changed a unit''s weekend rate or long-stay discounts'),
  ('stays_season.saved', 'hotels', 'notice', true, 'Staff added or changed a seasonal price'),
  ('stays_season.ended', 'hotels', 'notice', true, 'Staff ended a seasonal price')
on conflict (action) do nothing;

-- ═══════════════════════════════════════════════════════════════ 1. data

alter table public.unit
  add column if not exists weekend_rate_kes bigint,
  add column if not exists weekly_discount_pct integer,
  add column if not exists monthly_discount_pct integer;

alter table public.unit drop constraint if exists unit_weekend_rate_kes_check;
alter table public.unit add constraint unit_weekend_rate_kes_check
  check (weekend_rate_kes is null or weekend_rate_kes between 1 and 10000000);
alter table public.unit drop constraint if exists unit_weekly_discount_pct_check;
alter table public.unit add constraint unit_weekly_discount_pct_check
  check (weekly_discount_pct is null or weekly_discount_pct between 1 and 90);
alter table public.unit drop constraint if exists unit_monthly_discount_pct_check;
alter table public.unit add constraint unit_monthly_discount_pct_check
  check (monthly_discount_pct is null or monthly_discount_pct between 1 and 90);

comment on column public.unit.weekend_rate_kes is
  'Rate for Friday and Saturday nights; null = the nightly rate. Priced by fn_stay_quote.';
comment on column public.unit.weekly_discount_pct is
  'Percent off a stay of 7 to 27 nights; null = none. Priced by fn_stay_quote.';
comment on column public.unit.monthly_discount_pct is
  'Percent off a stay of 28 nights or more; null = none. Priced by fn_stay_quote.';

create table if not exists public.stays_season (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  adjust_pct integer not null check (adjust_pct between -90 and 300 and adjust_pct <> 0),
  city_id uuid references public.city (id) on delete cascade,
  property_id uuid references public.property (id) on delete cascade,
  unit_id uuid references public.unit (id) on delete cascade,
  active boolean not null default true,
  created_by uuid references public.staff_user (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stays_season_dates check (ends_on >= starts_on and ends_on - starts_on <= 366),
  constraint stays_season_one_scope check (num_nonnulls(city_id, property_id, unit_id) <= 1)
);
create index if not exists stays_season_active_idx on public.stays_season (starts_on, ends_on)
  where active;
alter table public.stays_season enable row level security;
revoke all on public.stays_season from public, anon, authenticated;
comment on table public.stays_season is
  'Seasonal prices: each night in [starts_on, ends_on] moves by adjust_pct for one unit, property, city or everywhere. Staff only, through rpc_console_stays_season_*; read by fn_stay_quote.';

-- ═══════════════════════════════════════════════════════════════ 2. the price

create or replace function public.fn_stay_quote(p_unit_id uuid, p_check_in date, p_check_out date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_city uuid;
  v_nights integer := p_check_out - p_check_in;
  v_per jsonb;
  v_sub bigint;
  v_pct integer;
  v_total bigint;
begin
  if p_unit_id is null or p_check_in is null or p_check_out is null or v_nights <= 0 then
    return null;
  end if;
  select * into v_unit from public.unit where id = p_unit_id;
  if v_unit.id is null or v_unit.nightly_rate_kes is null then
    return null;
  end if;
  v_city := coalesce(v_unit.city_id,
                     (select p.city_id from public.property p where p.id = v_unit.property_id));

  select jsonb_agg(jsonb_build_object(
           'day', n.day, 'rate_kes', n.rate, 'weekend', n.weekend, 'season', n.season)
           order by n.day),
         sum(n.rate)
    into v_per, v_sub
    from (
      select g.day, g.weekend, s.name as season,
             round(g.base * (100 + coalesce(s.adjust_pct, 0)) / 100.0)::bigint as rate
        from (
          select d::date as day,
                 extract(isodow from d) in (5, 6) as weekend,
                 case when extract(isodow from d) in (5, 6)
                      then coalesce(v_unit.weekend_rate_kes, v_unit.nightly_rate_kes)
                      else v_unit.nightly_rate_kes end as base
            from generate_series(p_check_in, p_check_out - 1, interval '1 day') d
        ) g
        left join lateral (
          select ss.name, ss.adjust_pct
            from public.stays_season ss
           where ss.active
             and g.day between ss.starts_on and ss.ends_on
             and (ss.unit_id = v_unit.id
                  or ss.property_id = v_unit.property_id
                  or ss.city_id = v_city
                  or (ss.unit_id is null and ss.property_id is null and ss.city_id is null))
           order by case when ss.unit_id is not null then 0
                         when ss.property_id is not null then 1
                         when ss.city_id is not null then 2
                         else 3 end,
                    ss.created_at desc, ss.id
           limit 1
        ) s on true
    ) n;

  v_pct := case when v_nights >= 28 and v_unit.monthly_discount_pct is not null
                  then v_unit.monthly_discount_pct
                when v_nights >= 7 and v_unit.weekly_discount_pct is not null
                  then v_unit.weekly_discount_pct
                else 0 end;
  v_total := round(v_sub * (100 - v_pct) / 100.0)::bigint;

  return jsonb_build_object(
    'nights', v_nights,
    'base_nightly_kes', v_unit.nightly_rate_kes,
    'subtotal_kes', v_sub,
    'discount_pct', v_pct,
    'discount_kes', v_sub - v_total,
    'total_kes', v_total,
    'avg_nightly_kes', round(v_total / v_nights::numeric)::bigint,
    'per_night', v_per);
end;
$$;
revoke all on function public.fn_stay_quote(uuid, date, date) from public, anon, authenticated;

/* What a guest sees before holding: the same price the hold will charge. */
create or replace function public.rpc_stay_quote(p_unit_id uuid, p_check_in date, p_check_out date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_unit_id is null or p_check_in is null or p_check_out is null
     or p_check_out <= p_check_in or p_check_out - p_check_in > 90 then
    return null;
  end if;
  if not exists (select 1 from public.property_unit_public
                  where id = p_unit_id and not coalesce(is_sample, false)) then
    return null;
  end if;
  return public.fn_stay_quote(p_unit_id, p_check_in, p_check_out);
end;
$$;
revoke all on function public.rpc_stay_quote(uuid, date, date) from public;
grant execute on function public.rpc_stay_quote(uuid, date, date) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════ 3. guest pricing

-- rpc_stay_search: 20261122000100, with total_kes from fn_stay_quote.
create or replace function public.rpc_stay_search(
  p_check_in date,
  p_check_out date,
  p_guests integer default 1,
  p_property_id uuid default null
)
returns table (unit_id uuid, property_id uuid, nights integer, nightly_rate_kes bigint, total_kes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.fn_stay_dates_check(p_check_in, p_check_out);

  return query
    select u.id, u.property_id, (p_check_out - p_check_in)::integer,
           u.nightly_rate_kes::bigint,
           (public.fn_stay_quote(u.id, p_check_in, p_check_out) ->> 'total_kes')::bigint
      from public.property_unit_public u
     where not u.is_sample
       and (p_property_id is null or u.property_id = p_property_id)
       and coalesce(u.max_guests, 1) >= greatest(coalesce(p_guests, 1), 1)
       and coalesce(u.min_nights, 1) <= p_check_out - p_check_in
       and not exists (
         select 1 from public.stay s
          where s.unit_id = u.id
            and public.fn_stay_occupies(s.status, s.hold_expires_at)
            and tstzrange(s.check_in, s.check_out, '[)')
                && public.fn_stay_window(u.id, p_check_in, p_check_out))
     order by u.nightly_rate_kes nulls last, u.id;
end;
$$;

-- rpc_stay_hold: 20270116000400, priced by fn_stay_quote.
create or replace function public.rpc_stay_hold(
  p_unit_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_unit public.unit;
  v_nights integer := p_check_out - p_check_in;
  v_adults integer := coalesce(nullif(p_guest ->> 'adults', '')::integer, 1);
  v_children integer := coalesce(nullif(p_guest ->> 'children', '')::integer, 0);
  v_name text := public.fn_reservation_name(p_guest ->> 'first_name');
  v_window tstzrange;
  v_stay public.stay;
  v_quote jsonb;
begin
  if v_user is null then
    raise exception 'Sign in to hold these dates.' using errcode = '42501';
  end if;
  if authz.is_anonymous_session() and v_name is null then
    raise exception 'Add the name to book under.' using errcode = '22023';
  end if;
  perform public.fn_stay_dates_check(p_check_in, p_check_out);
  if not exists (select 1 from public.property_unit_public where id = p_unit_id) then
    raise exception 'This home is not taking bookings.' using errcode = '22023';
  end if;
  if exists (select 1 from public.property_unit_public where id = p_unit_id and is_sample) then
    raise exception 'This is a sample listing that shows how stays look on NexG. It cannot be booked.'
      using errcode = '22023';
  end if;

  select * into v_unit from public.unit where id = p_unit_id for update;

  if v_unit.nightly_rate_kes is null then
    raise exception 'This home is priced on request. Send an enquiry instead.' using errcode = '22023';
  end if;
  if v_nights < coalesce(v_unit.min_nights, 1) then
    raise exception 'This home takes stays of at least % nights.', v_unit.min_nights
      using errcode = '22023';
  end if;
  if v_adults < 1 or v_children < 0 then
    raise exception 'A stay needs at least one adult.' using errcode = '22023';
  end if;
  if v_unit.max_guests is not null and v_adults + v_children > v_unit.max_guests then
    raise exception 'This home sleeps up to % guests.', v_unit.max_guests using errcode = '22023';
  end if;
  if (select count(*) from public.stay
       where guest_user_id = v_user and status = 'held' and hold_expires_at > now()) >= 2 then
    raise exception 'You already have two stays on hold. Finish or release one first.'
      using errcode = '22023';
  end if;

  perform public.fn_stay_release_expired_holds(p_unit_id);

  v_window := public.fn_stay_window(p_unit_id, p_check_in, p_check_out);
  if exists (
    select 1 from public.stay s
     where s.unit_id = p_unit_id
       and public.fn_stay_occupies(s.status, s.hold_expires_at)
       and tstzrange(s.check_in, s.check_out, '[)') && v_window
  ) then
    raise exception 'Those dates are no longer available.' using errcode = '23P01';
  end if;

  v_quote := public.fn_stay_quote(p_unit_id, p_check_in, p_check_out);

  insert into public.stay (
    host_id, property_id, unit_id, guest_user_id, guest_first_name,
    party_adults, party_children, check_in, check_out, source, status,
    hold_expires_at, rate_kes, quote_total_kes)
  values (
    v_unit.host_id, v_unit.property_id, v_unit.id, v_user,
    v_name,
    v_adults, v_children, lower(v_window), upper(v_window), 'nexg', 'held',
    now() + interval '15 minutes', (v_quote ->> 'avg_nightly_kes')::bigint,
    (v_quote ->> 'total_kes')::bigint)
  returning * into v_stay;

  /* The guest sees it once paid (rpc_my_stay_code). */
  insert into public.reservation_code (stay_id, code)
  values (v_stay.id, public.fn_reservation_code_new());

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay.held',
    p_actor_id => v_user, p_target_type => 'stay', p_target_id => v_stay.id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('unit', v_unit.id, 'nights', v_nights,
                                  'total_kes', v_stay.quote_total_kes,
                                  'discount_pct', v_quote -> 'discount_pct'));

  return jsonb_build_object(
    'stay_id', v_stay.id, 'expires_at', v_stay.hold_expires_at,
    'check_in', v_stay.check_in, 'check_out', v_stay.check_out,
    'nights', v_nights, 'nightly_rate_kes', v_unit.nightly_rate_kes,
    'avg_nightly_kes', v_quote -> 'avg_nightly_kes',
    'discount_pct', v_quote -> 'discount_pct',
    'per_night', v_quote -> 'per_night',
    'total_kes', v_stay.quote_total_kes);
end;
$$;

-- rpc_native_stay_quote: 20270123000100, nightly_minor is the average night.
create or replace function public.rpc_native_stay_quote(
  p_property_id uuid, p_unit_id uuid, p_check_in date, p_check_out date,
  p_adults integer, p_children integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.fn_native_stay_customer();
  v_price record;
  v_checkout public.native_stay_checkout;
begin
  if p_property_id is null or p_unit_id is null or p_adults is null or p_children is null
     or p_adults not between 1 and 20 or p_children not between 0 and 20 then
    raise exception 'Choose a property, unit and guests.' using errcode = '22023';
  end if;

  select n.nightly_rate_kes, n.total_kes, n.nights into v_price
    from public.rpc_stay_search(p_check_in, p_check_out, p_adults + p_children, p_property_id) n
    where n.unit_id = p_unit_id and n.property_id = p_property_id
      and n.nightly_rate_kes > 0 and n.total_kes > 0;
  if not found then
    raise exception 'This stay is unavailable for these dates and guests.' using errcode = 'NX001';
  end if;

  insert into public.native_stay_checkout (
    guest_user_id, property_id, unit_id, check_in, check_out, adults, children,
    nightly_minor, total_minor, expires_at
  ) values (
    v_uid, p_property_id, p_unit_id, p_check_in, p_check_out, p_adults, p_children,
    greatest(round(v_price.total_kes / v_price.nights::numeric), 1)::bigint * 100,
    v_price.total_kes * 100, clock_timestamp() + interval '10 minutes'
  ) returning * into v_checkout;

  perform audit.log('guest'::public.actor_type, 'hotels', 'stay.quote_issued',
    p_actor_id => v_uid, p_target_type => 'native_stay_checkout', p_target_id => v_checkout.id,
    p_city_id => (select u.city_id from public.unit u where u.id = v_checkout.unit_id),
    p_after => jsonb_build_object(
      'property', v_checkout.property_id, 'unit', v_checkout.unit_id,
      'nights', v_checkout.check_out - v_checkout.check_in,
      'total_minor', v_checkout.total_minor, 'currency', 'KES', 'expires_at', v_checkout.expires_at
    ));

  return jsonb_build_object(
    'quoteId', v_checkout.id, 'propertyId', v_checkout.property_id, 'unitId', v_checkout.unit_id,
    'checkIn', v_checkout.check_in, 'checkOut', v_checkout.check_out,
    'adults', v_checkout.adults, 'children', v_checkout.children,
    'nights', v_checkout.check_out - v_checkout.check_in, 'expiresAt', v_checkout.expires_at,
    'currency', 'KES', 'nightlyMinor', v_checkout.nightly_minor,
    'roomSubtotalMinor', v_checkout.total_minor, 'taxesMinor', 0, 'totalMinor', v_checkout.total_minor);
end;
$$;

-- rpc_native_stay_hold: 20270123000100, re-checking the total only.
create or replace function public.rpc_native_stay_hold(p_quote_id uuid, p_first_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.fn_native_stay_customer();
  v_checkout public.native_stay_checkout;
  v_first_name text := nullif(btrim(p_first_name), '');
  v_price record;
  v_hold jsonb;
begin
  if v_first_name is null or char_length(v_first_name) > 80 then
    raise exception 'Enter the first name of the staying guest.' using errcode = '22023';
  end if;
  select * into v_checkout from public.native_stay_checkout
   where id = p_quote_id and guest_user_id = v_uid for update;
  if not found then
    raise exception 'The quote was not found.' using errcode = 'NX004';
  end if;
  if v_checkout.stay_id is not null then
    if v_checkout.guest_name_hash is distinct from encode(sha256(convert_to(v_first_name, 'UTF8')), 'hex') then
      raise exception 'This operation is already in use.' using errcode = 'NX005';
    end if;
    return public.fn_native_stay_checkout_view(v_checkout.id);
  end if;

  if v_checkout.expires_at <= clock_timestamp() then
    raise exception 'The quote expired. Request a fresh price.' using errcode = 'NX002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('native-stay-hold:' || v_uid::text, 0));
  perform 1 from public.unit where id = v_checkout.unit_id for update;
  if v_checkout.expires_at <= clock_timestamp() then
    raise exception 'The quote expired. Request a fresh price.' using errcode = 'NX002';
  end if;

  select n.nightly_rate_kes, n.total_kes into v_price from public.rpc_stay_search(
    v_checkout.check_in, v_checkout.check_out, v_checkout.adults + v_checkout.children,
    v_checkout.property_id
  ) n where n.unit_id = v_checkout.unit_id and n.property_id = v_checkout.property_id;
  if not found then
    raise exception 'This stay is unavailable for these dates and guests.' using errcode = 'NX001';
  end if;
  if v_price.total_kes * 100 is distinct from v_checkout.total_minor then
    raise exception 'The price changed. Request a fresh quote.' using errcode = 'NX003';
  end if;

  v_hold := public.rpc_stay_hold(
    v_checkout.unit_id, v_checkout.check_in, v_checkout.check_out,
    jsonb_build_object('first_name', v_first_name, 'adults', v_checkout.adults, 'children', v_checkout.children));
  if (v_hold ->> 'total_kes')::bigint * 100 is distinct from v_checkout.total_minor then
    raise exception 'The price changed. Request a fresh quote.' using errcode = 'NX003';
  end if;
  update public.native_stay_checkout
     set stay_id = (v_hold ->> 'stay_id')::uuid, guest_name_hash = encode(sha256(convert_to(v_first_name, 'UTF8')), 'hex')
   where id = p_quote_id returning * into v_checkout;

  return public.fn_native_stay_checkout_view(v_checkout.id);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 4. hosts

-- rpc_unit_upsert_guarded: 20270320000100, also saving the weekend rate and
-- the long-stay discounts when their keys are sent.
create or replace function public.rpc_unit_upsert_guarded(
  p_host_id uuid,
  p_unit jsonb,
  p_unit_id uuid default null
)
returns public.unit
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_name text := nullif(trim(p_unit ->> 'name'), '');
  v_property_id uuid := nullif(p_unit ->> 'property_id', '')::uuid;
  v_amenities text[];
  v_bed_setup text;
  v_summary text;
  v_size integer;
  v_min_nights integer;
  v_weekend bigint;
  v_weekly integer;
  v_monthly integer;
begin
  if not authz.is_host_member(p_host_id) and not authz.works_hospitality(null) then
    raise exception 'Not your unit.' using errcode = '42501';
  end if;

  if v_property_id is not null and not exists (
    select 1 from public.property
    where id = v_property_id and host_id = p_host_id and deleted_at is null
    for share
  ) then
    raise exception 'Choose a property on your account.' using errcode = '22023';
  end if;

  if p_unit_id is null and v_name is not null and exists (
    select 1 from public.unit
    where host_id = p_host_id and name = v_name and archived_at is null
  ) then
    raise exception 'You already have a unit called %.', v_name using errcode = '23505';
  end if;

  /* Checked before anything is written, so a bad field saves nothing. */
  perform public.fn_host_listing_point(p_unit);
  v_amenities := public.fn_host_amenity_labels(p_unit -> 'unit_amenities');
  v_bed_setup := public.fn_host_listing_text(p_unit -> 'bed_setup', 'Bed setup', 200);
  v_summary := public.fn_host_listing_text(p_unit -> 'unit_summary', 'Unit summary', 2000);
  begin
    v_size := nullif(p_unit ->> 'size_sqm', '')::integer;
    v_min_nights := nullif(p_unit ->> 'min_nights', '')::integer;
  exception when others then
    raise exception 'Enter size and minimum nights as whole numbers.' using errcode = '22023';
  end;
  if v_size is not null and (v_size < 1 or v_size > 100000) then
    raise exception 'Enter the size in square metres, between 1 and 100,000.' using errcode = '22023';
  end if;
  if v_min_nights is not null and (v_min_nights < 1 or v_min_nights > 365) then
    raise exception 'Minimum nights is between 1 and 365.' using errcode = '22023';
  end if;
  /* Weekend rate and long-stay discounts: 0 or empty clears them. */
  begin
    v_weekend := nullif(nullif(p_unit ->> 'weekend_rate_kes', ''), '0')::bigint;
    v_weekly := nullif(nullif(p_unit ->> 'weekly_discount_pct', ''), '0')::integer;
    v_monthly := nullif(nullif(p_unit ->> 'monthly_discount_pct', ''), '0')::integer;
  exception when others then
    raise exception 'Enter the weekend rate and discounts as whole numbers.' using errcode = '22023';
  end;
  if v_weekend is not null and (v_weekend < 1 or v_weekend > 10000000) then
    raise exception 'Give a weekend rate between KES 1 and KES 10,000,000.' using errcode = '22023';
  end if;
  if (v_weekly is not null and (v_weekly < 1 or v_weekly > 90))
     or (v_monthly is not null and (v_monthly < 1 or v_monthly > 90)) then
    raise exception 'A long-stay discount is between 1%% and 90%%.' using errcode = '22023';
  end if;

  v_unit := public.rpc_unit_upsert(p_host_id, p_unit, p_unit_id);
  if v_unit.id is null then
    raise exception 'That unit is not on your account.' using errcode = '42501';
  end if;

  if p_unit ?| array['property_id', 'bedrooms', 'bathrooms', 'max_guests', 'nightly_rate_kes'] then
    update public.unit set
      property_id = coalesce(v_property_id, property_id),
      bedrooms = coalesce(nullif(p_unit ->> 'bedrooms', '')::integer, bedrooms),
      bathrooms = coalesce(nullif(p_unit ->> 'bathrooms', '')::numeric, bathrooms),
      max_guests = coalesce(nullif(p_unit ->> 'max_guests', '')::integer, max_guests),
      nightly_rate_kes = coalesce(nullif(p_unit ->> 'nightly_rate_kes', '')::bigint, nightly_rate_kes)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  /* Sent keys are written (null, empty or 0 clears), missing keys kept. */
  if p_unit ?| array['weekend_rate_kes', 'weekly_discount_pct', 'monthly_discount_pct'] then
    update public.unit set
      weekend_rate_kes = case when p_unit ? 'weekend_rate_kes' then v_weekend else weekend_rate_kes end,
      weekly_discount_pct = case when p_unit ? 'weekly_discount_pct' then v_weekly else weekly_discount_pct end,
      monthly_discount_pct = case when p_unit ? 'monthly_discount_pct' then v_monthly else monthly_discount_pct end
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  /* What a guest reads. Sent keys are written (empty clears), missing keys kept;
     minimum nights is never cleared, only changed. */
  if p_unit ?| array['unit_amenities', 'bed_setup', 'size_sqm', 'unit_summary', 'min_nights'] then
    update public.unit set
      unit_amenities = case when p_unit ? 'unit_amenities' then v_amenities else unit_amenities end,
      bed_setup = case when p_unit ? 'bed_setup' then v_bed_setup else bed_setup end,
      size_sqm = case when p_unit ? 'size_sqm' then v_size else size_sqm end,
      unit_summary = case when p_unit ? 'unit_summary' then v_summary else unit_summary end,
      min_nights = coalesce(v_min_nights, min_nights)
    where id = v_unit.id and host_id = p_host_id
    returning * into v_unit;
  end if;

  /* rpc_host_verify only promotes the units that exist at approval. A unit
     added or completed afterwards goes live here, on the same rule. */
  if v_unit.status = 'setting_up'
    and exists (select 1 from public.host where id = p_host_id and status = 'live')
    and v_unit.address_line is not null
    and v_unit.handoff is not null then
    update public.unit set status = 'live' where id = v_unit.id returning * into v_unit;
  end if;

  /* rpc_unit_upsert logs the save itself; this records what the wrapper adds
     (portfolio fields, rates and going live), which the wiring check requires. */
  perform audit.log('host_user'::public.actor_type, 'hotels', 'unit.portfolio_saved',
    p_actor_id => auth.uid(), p_target_type => 'unit', p_target_id => v_unit.id,
    p_city_id => v_unit.city_id,
    p_after => jsonb_build_object('status', v_unit.status, 'property_id', v_unit.property_id,
                                  'nightly_rate_kes', v_unit.nightly_rate_kes,
                                  'weekend_rate_kes', v_unit.weekend_rate_kes,
                                  'weekly_discount_pct', v_unit.weekly_discount_pct,
                                  'monthly_discount_pct', v_unit.monthly_discount_pct));

  return v_unit;
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 5. staff writers

create or replace function public.rpc_console_unit_rate_rules_set(
  p_unit_id uuid, p_weekend_rate_kes integer, p_weekly_discount_pct integer,
  p_monthly_discount_pct integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_before public.unit;
  v_unit public.unit;
  v_weekend integer := nullif(p_weekend_rate_kes, 0);
  v_weekly integer := nullif(p_weekly_discount_pct, 0);
  v_monthly integer := nullif(p_monthly_discount_pct, 0);
begin
  if v_weekend is not null and (v_weekend < 100 or v_weekend > 10000000) then
    raise exception 'Give a weekend rate between KES 100 and KES 10,000,000, or leave it empty.'
      using errcode = 'check_violation';
  end if;
  if (v_weekly is not null and v_weekly not between 1 and 90)
     or (v_monthly is not null and v_monthly not between 1 and 90) then
    raise exception 'A long-stay discount is between 1%% and 90%%, or empty for none.'
      using errcode = 'check_violation';
  end if;
  select * into v_before from public.unit where id = p_unit_id;
  update public.unit set weekend_rate_kes = v_weekend, weekly_discount_pct = v_weekly,
                         monthly_discount_pct = v_monthly, updated_at = now()
   where id = p_unit_id and archived_at is null returning * into v_unit;
  if v_unit.id is null then
    raise exception 'That unit is not open.' using errcode = 'no_data_found';
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'unit.rate_rules_set_by_staff',
    p_target_type => 'unit', p_target_id => v_unit.id, p_city_id => v_unit.city_id,
    p_before => jsonb_build_object('weekend_rate_kes', v_before.weekend_rate_kes,
                                   'weekly_discount_pct', v_before.weekly_discount_pct,
                                   'monthly_discount_pct', v_before.monthly_discount_pct),
    p_after => jsonb_build_object('weekend_rate_kes', v_weekend, 'weekly_discount_pct', v_weekly,
                                  'monthly_discount_pct', v_monthly));
  return jsonb_build_object('unit_id', v_unit.id, 'weekend_rate_kes', v_weekend,
    'weekly_discount_pct', v_weekly, 'monthly_discount_pct', v_monthly, 'staff', v_staff);
end;
$$;

/* Add (no id) or change a season. p: {id?, name, starts_on, ends_on,
   adjust_pct, scope: everywhere|city|property|unit, scope_id}. */
create or replace function public.rpc_console_stays_season_save(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_id uuid;
  v_name text := nullif(btrim(coalesce(p ->> 'name', '')), '');
  v_from date;
  v_to date;
  v_pct integer;
  v_scope text := coalesce(nullif(p ->> 'scope', ''), 'everywhere');
  v_scope_id uuid;
  v_before public.stays_season;
  v_row public.stays_season;
  v_city uuid;
begin
  begin
    v_id := nullif(p ->> 'id', '')::uuid;
    v_from := nullif(p ->> 'starts_on', '')::date;
    v_to := nullif(p ->> 'ends_on', '')::date;
    v_pct := nullif(p ->> 'adjust_pct', '')::integer;
    v_scope_id := nullif(p ->> 'scope_id', '')::uuid;
  exception when others then
    raise exception 'Check the dates, the percentage (a whole number) and what it applies to.'
      using errcode = 'invalid_parameter_value';
  end;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Give the season a name (up to 80 characters).' using errcode = 'check_violation';
  end if;
  if v_from is null or v_to is null or v_to < v_from then
    raise exception 'Pick the first and last night of the season.' using errcode = 'check_violation';
  end if;
  if v_to - v_from > 366 then
    raise exception 'A season runs for a year at most.' using errcode = 'check_violation';
  end if;
  if v_pct is null or v_pct = 0 or v_pct not between -90 and 300 then
    raise exception 'The change is between -90%% and +300%%, and not 0.' using errcode = 'check_violation';
  end if;
  if v_scope not in ('everywhere', 'city', 'property', 'unit') then
    raise exception 'A season applies everywhere, to a city, a building or a unit.'
      using errcode = 'check_violation';
  end if;
  if v_scope <> 'everywhere' and v_scope_id is null then
    raise exception 'Choose the % it applies to.', case v_scope when 'property' then 'building' else v_scope end
      using errcode = 'check_violation';
  end if;
  if (v_scope = 'city' and not exists (select 1 from public.city where id = v_scope_id))
     or (v_scope = 'property' and not exists (
           select 1 from public.property where id = v_scope_id and deleted_at is null))
     or (v_scope = 'unit' and not exists (
           select 1 from public.unit where id = v_scope_id and archived_at is null)) then
    raise exception 'That % was not found.', case v_scope when 'property' then 'building' else v_scope end
      using errcode = 'no_data_found';
  end if;
  v_city := case v_scope
    when 'city' then v_scope_id
    when 'property' then (select city_id from public.property where id = v_scope_id)
    when 'unit' then (select coalesce(u.city_id, pr.city_id) from public.unit u
                       left join public.property pr on pr.id = u.property_id where u.id = v_scope_id)
  end;

  if v_id is null then
    insert into public.stays_season (name, starts_on, ends_on, adjust_pct, city_id, property_id,
                                     unit_id, created_by)
    values (v_name, v_from, v_to, v_pct,
            case when v_scope = 'city' then v_scope_id end,
            case when v_scope = 'property' then v_scope_id end,
            case when v_scope = 'unit' then v_scope_id end, v_staff)
    returning * into v_row;
  else
    select * into v_before from public.stays_season where id = v_id for update;
    if v_before.id is null then
      raise exception 'That season was not found.' using errcode = 'no_data_found';
    end if;
    update public.stays_season set
      name = v_name, starts_on = v_from, ends_on = v_to, adjust_pct = v_pct,
      city_id = case when v_scope = 'city' then v_scope_id end,
      property_id = case when v_scope = 'property' then v_scope_id end,
      unit_id = case when v_scope = 'unit' then v_scope_id end,
      updated_at = now()
     where id = v_id returning * into v_row;
  end if;

  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_season.saved',
    p_target_type => 'stays_season', p_target_id => v_row.id, p_city_id => v_city,
    p_before => case when v_before.id is null then null else jsonb_build_object(
      'name', v_before.name, 'starts_on', v_before.starts_on, 'ends_on', v_before.ends_on,
      'adjust_pct', v_before.adjust_pct, 'city_id', v_before.city_id,
      'property_id', v_before.property_id, 'unit_id', v_before.unit_id) end,
    p_after => jsonb_build_object('name', v_row.name, 'starts_on', v_row.starts_on,
      'ends_on', v_row.ends_on, 'adjust_pct', v_row.adjust_pct, 'scope', v_scope,
      'scope_id', v_scope_id));
  return jsonb_build_object('season_id', v_row.id, 'staff', v_staff);
end;
$$;

/* End a season: new quotes no longer use it; stays already held or booked keep their price. */
create or replace function public.rpc_console_stays_season_end(p_season_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := public.fn_stays_writer_gate();
  v_row public.stays_season;
begin
  update public.stays_season set active = false, updated_at = now()
   where id = p_season_id and active returning * into v_row;
  if v_row.id is null then
    raise exception 'That season is not running.' using errcode = 'no_data_found';
  end if;
  perform audit.log('staff'::public.actor_type, 'hotels', 'stays_season.ended',
    p_target_type => 'stays_season', p_target_id => v_row.id,
    p_city_id => coalesce(v_row.city_id,
                          (select city_id from public.property where id = v_row.property_id),
                          (select city_id from public.unit where id = v_row.unit_id)),
    p_before => jsonb_build_object('active', true),
    p_after => jsonb_build_object('active', false, 'name', v_row.name));
  return jsonb_build_object('season_id', v_row.id, 'staff', v_staff);
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 6. staff readers

/* Seasonal Pricing: every season, newest first, with what it applies to. */
create or replace function public.rpc_console_stays_seasons(p_city uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  perform public.fn_stays_reader_gate();
  return (
    with s as (
      select ss.*,
             case when ss.unit_id is not null then 'unit'
                  when ss.property_id is not null then 'property'
                  when ss.city_id is not null then 'city' else 'everywhere' end as scope,
             coalesce(ss.unit_id, ss.property_id, ss.city_id) as scope_id,
             case when ss.unit_id is not null then
                    (select coalesce(u.label_public, u.name) || coalesce(' · ' || pr.name, '')
                       from public.unit u left join public.property pr on pr.id = u.property_id
                      where u.id = ss.unit_id)
                  when ss.property_id is not null then (select name from public.property where id = ss.property_id)
                  when ss.city_id is not null then (select name from public.city where id = ss.city_id)
                  else 'Everywhere' end as scope_name,
             coalesce(ss.city_id,
                      (select city_id from public.property where id = ss.property_id),
                      (select coalesce(u.city_id, pr.city_id) from public.unit u
                         left join public.property pr on pr.id = u.property_id where u.id = ss.unit_id)) as in_city,
             case when not ss.active then 'ended'
                  when ss.ends_on < v_today then 'past'
                  when ss.starts_on > v_today then 'upcoming'
                  else 'current' end as state,
             (select display_name from public.staff_user where id = ss.created_by) as created_by_name
        from public.stays_season ss
    )
    select jsonb_build_object(
      'counts', jsonb_build_object(
        'current', count(*) filter (where state = 'current'),
        'upcoming', count(*) filter (where state = 'upcoming'),
        'past', count(*) filter (where state in ('past', 'ended'))),
      'rows', coalesce(jsonb_agg(jsonb_build_object(
          'id', id, 'name', name, 'starts_on', starts_on, 'ends_on', ends_on,
          'adjust_pct', adjust_pct, 'scope', scope, 'scope_id', scope_id, 'scope_name', scope_name,
          'state', state, 'active', active, 'created_by', created_by_name, 'created_at', created_at)
        order by (state in ('past', 'ended')), starts_on desc, created_at desc), '[]'::jsonb))
      from s
     where p_city is null or in_city is null or in_city = p_city
  );
end;
$$;

/* One unit's rates: its rules, the seasons that reach it, and what a week
   and a month from today actually cost. */
create or replace function public.rpc_console_unit_rates(p_unit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit public.unit;
  v_city uuid;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
begin
  perform public.fn_stays_reader_gate();
  select * into v_unit from public.unit where id = p_unit_id;
  if v_unit.id is null then
    raise exception 'That unit was not found.' using errcode = 'no_data_found';
  end if;
  v_city := coalesce(v_unit.city_id,
                     (select city_id from public.property where id = v_unit.property_id));
  return jsonb_build_object(
    'unit_id', v_unit.id,
    'nightly_rate_kes', v_unit.nightly_rate_kes,
    'weekend_rate_kes', v_unit.weekend_rate_kes,
    'weekly_discount_pct', v_unit.weekly_discount_pct,
    'monthly_discount_pct', v_unit.monthly_discount_pct,
    'min_nights', v_unit.min_nights,
    'week_quote', public.fn_stay_quote(v_unit.id, v_today, v_today + 7) - 'per_night',
    'month_quote', public.fn_stay_quote(v_unit.id, v_today, v_today + 28) - 'per_night',
    'seasons', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', ss.id, 'name', ss.name, 'starts_on', ss.starts_on, 'ends_on', ss.ends_on,
          'adjust_pct', ss.adjust_pct,
          'scope', case when ss.unit_id is not null then 'unit'
                        when ss.property_id is not null then 'property'
                        when ss.city_id is not null then 'city' else 'everywhere' end)
        order by ss.starts_on), '[]'::jsonb)
        from public.stays_season ss
       where ss.active and ss.ends_on >= v_today
         and (ss.unit_id = v_unit.id or ss.property_id = v_unit.property_id or ss.city_id = v_city
              or (ss.unit_id is null and ss.property_id is null and ss.city_id is null))));
end;
$$;

/* Availability & Rates: 20270329000100, with each night's real rate (weekend
   rate and seasons applied) and each unit's rules. */
create or replace function public.rpc_console_stays_calendar(
  p_start date, p_city uuid default null, p_q text default null,
  p_page integer default 1, p_size integer default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_size integer := least(greatest(coalesce(p_size, 8), 1), 100);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_result jsonb;
begin
  perform public.fn_stays_reader_gate();
  if p_start is null then
    raise exception 'Pick a start day.' using errcode = 'invalid_parameter_value';
  end if;

  with u as (
    select un.id, coalesce(un.label_public, un.name) as label, un.bedrooms, un.nightly_rate_kes,
           un.weekend_rate_kes, un.weekly_discount_pct, un.monthly_discount_pct,
           p.name as property_name, un.photos -> 0 as photo
    from public.unit un left join public.property p on p.id = un.property_id
    where un.archived_at is null and un.deleted_at is null and un.status = 'live'
      and (p_city is null or un.city_id = p_city)
      and (v_q is null or coalesce(un.label_public, un.name) ilike '%' || v_q || '%'
           or coalesce(p.name, '') ilike '%' || v_q || '%')
  ),
  page as (select u.*, public.fn_stay_quote(u.id, p_start, p_start + 7) -> 'per_night' as nights
           from u order by property_name nulls last, label
           offset (v_page - 1) * v_size limit v_size),
  days as (select (p_start + i) as day from generate_series(0, 6) i)
  select jsonb_build_object(
    'total', (select count(*) from u),
    'days', (select jsonb_agg(day order by day) from days),
    'kpis', jsonb_build_object(
      'units', (select count(*) from u),
      'available_today', (select count(*) from u where not exists (
          select 1 from public.stay s where s.unit_id = u.id
            and s.status in ('held', 'booked', 'in_stay', 'blocked')
            and (s.check_in at time zone 'Africa/Nairobi')::date <= v_today
            and (s.check_out at time zone 'Africa/Nairobi')::date > v_today)),
      'occupied_today', (select count(*) from u where exists (
          select 1 from public.stay s where s.unit_id = u.id and s.status in ('booked', 'in_stay')
            and (s.check_in at time zone 'Africa/Nairobi')::date <= v_today
            and (s.check_out at time zone 'Africa/Nairobi')::date > v_today)),
      'avg_rate_kes', (select round(avg(nightly_rate_kes)) from u where nightly_rate_kes is not null),
      'booked_ahead_kes', (select coalesce(sum(coalesce(s.paid_kes, s.quote_total_kes)), 0) from public.stay s
          join u on u.id = s.unit_id where s.status = 'booked' and s.check_in > now())),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'unit_id', pg.id, 'label', pg.label, 'bedrooms', pg.bedrooms, 'rate_kes', pg.nightly_rate_kes,
        'weekend_rate_kes', pg.weekend_rate_kes, 'weekly_discount_pct', pg.weekly_discount_pct,
        'monthly_discount_pct', pg.monthly_discount_pct,
        'property_name', pg.property_name, 'photo', pg.photo,
        'days', (select jsonb_agg(jsonb_build_object('day', d.day,
            'state', coalesce((select case s.status when 'blocked' then 'blocked' when 'held' then 'hold' else 'booked' end
                       from public.stay s where s.unit_id = pg.id
                         and s.status in ('held', 'booked', 'in_stay', 'blocked')
                         and (s.status <> 'held' or s.hold_expires_at > now())
                         and (s.check_in at time zone 'Africa/Nairobi')::date <= d.day
                         and (s.check_out at time zone 'Africa/Nairobi')::date > d.day
                       limit 1), 'available'),
            'rate_kes', (select (e ->> 'rate_kes')::bigint from jsonb_array_elements(pg.nights) e
                          where (e ->> 'day')::date = d.day),
            'season', (select e ->> 'season' from jsonb_array_elements(pg.nights) e
                        where (e ->> 'day')::date = d.day)) order by d.day) from days d)
      ) order by pg.property_name nulls last, pg.label), '[]'::jsonb) from page pg)
  ) into v_result;
  return v_result;
end;
$$;

-- ═══════════════════════════════════════════════════════════════ 7. grants

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.rpc_console_unit_rate_rules_set(uuid, integer, integer, integer)',
    'public.rpc_console_stays_season_save(jsonb)',
    'public.rpc_console_stays_season_end(uuid)',
    'public.rpc_console_stays_seasons(uuid)',
    'public.rpc_console_unit_rates(uuid)',
    'public.rpc_console_stays_calendar(date, uuid, text, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
