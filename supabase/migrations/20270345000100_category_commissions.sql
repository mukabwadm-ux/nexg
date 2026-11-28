-- Commission per category: a dated default rate for every master category,
-- the band it should sit in, and the console's Categories & Commissions
-- screens (System > Configuration).
--
-- The owner (28 Nov 2026): every category group on the rate card ("8.2
-- Indicative Commission Bands by Category Group") gets the HIGHER end of its
-- band as its default, the band is stored with it, and staff change any rate
-- in the console without a code change. Every change is audited (who, when,
-- old value, new value) and applies only from its effective date: orders
-- already placed keep the rate they were charged (the order stores
-- commission_pct / commission_cents when it is placed; the split and the
-- ledger read those, never this).
--
-- How a merchant's commission is decided now (fn_merchant_commission):
--   1. its approved commission term in force that Nairobi day
--      (merchant_commission_term, 20270306000100), unless its category has
--      merchant overrides switched off;
--   2. else its old undated merchant.commission_pct, if it never had a term;
--   3. else its category's approved rate in force that day (NEW, this file):
--      `pct` for a merchant that delivers itself (own riders, pickup,
--      dining), `nexg_delivery_pct` for one a NexG rider delivers for;
--   4. else the preset (fees.commission 14% / fees.commission_nexg_delivery
--      28%) as before.
-- A category rate quoted "VAT exclusive" is grossed up by tax.vat_pct, so the
-- order's commission_pct stays the VAT-inclusive figure the ledger already
-- splits VAT out of. Every category starts VAT inclusive (as today).
--
-- Seed (the rate card mapped onto the 22 master categories):
--   20 groups match one category each and get pct = top of the band from
--   the day this is applied; nexg_delivery_pct is left blank, so orders a
--   NexG rider delivers stay on the 28% preset until someone sets one.
--   Food & Restaurant (restaurants_food) and Pets (pets) have no group on the
--   card: they keep the preset, with no band.
--
-- New: category_commission (band, VAT note, fulfilment, approval rule,
-- merchant-override switch), category_commission_rate (dated rate versions,
-- one asks and a second approves unless the category is set to single
-- approval), category_commission_log (the Change History), the resolver
-- fn_category_commission, rpc_category_commission_* for the console.
--
-- Replaced bodies: fn_merchant_commission, rpc_merchant_commission_read
-- (20270306000100), fn_price_order (20270306000100). Same signatures and
-- grants.
--
-- Rollback: re-run those three definitions from 20270306000100, then
--   drop function public.rpc_category_commission_overview(),
--     public.rpc_category_commission_history(text, integer),
--     public.rpc_category_commission_overrides(),
--     public.rpc_category_commission_save(text, jsonb),
--     public.rpc_category_commission_add(text, jsonb),
--     public.rpc_category_commission_decide(uuid, boolean, text),
--     public.rpc_category_commission_withdraw(uuid),
--     public.fn_category_commission(text, uuid, boolean, timestamptz),
--     public.fn_category_commission_log(text, text, jsonb, jsonb, text, uuid),
--     public.fn_category_commission_editor(),
--     public.fn_category_commission_decider();
--   drop table public.category_commission_log, public.category_commission_rate,
--     public.category_commission;
--   delete from audit.action_registry where action like 'category.commission\_%' escape '\'
--     or action in ('category.settings_changed', 'category.created');

-- ═══════════════════════════════════════════════════════════ the tables

create table if not exists public.category_commission (
  category text primary key
    references public.category_config (category) on update cascade on delete cascade,
  /* The group on the owner's rate card this category belongs to. */
  rate_group text check (rate_group is null or length(rate_group) <= 120),
  /* The indicative band; both blank when the card has no group for it. */
  band_min_pct numeric(5, 2) check (band_min_pct is null or (band_min_pct >= 0 and band_min_pct <= 100)),
  band_max_pct numeric(5, 2) check (band_max_pct is null or (band_max_pct >= 0 and band_max_pct <= 100)),
  fulfilment_methods text[] not null default '{}'
    check (fulfilment_methods <@ array['delivery', 'pickup', 'dine_in', 'booking', 'ticketing',
                                       'transport', 'digital']::text[]),
  /* two_person: one asks, another approves a rate. single: an approver's change applies at once. */
  approval text not null default 'two_person' check (approval in ('two_person', 'single')),
  /* Off: merchants in this category are charged the category rate even with an agreed term. */
  merchant_overrides boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.staff_user (id) on delete set null,
  check (band_min_pct is null or band_max_pct is null or band_min_pct <= band_max_pct)
);

comment on table public.category_commission is
  'Commission settings per master category: the indicative band from the owner''s rate card, fulfilment methods, the approval rule for rate changes and whether merchants may have their own agreed rate. The rate itself is dated, in category_commission_rate. Read and written only through rpc_category_commission_*.';

create table if not exists public.category_commission_rate (
  id uuid primary key default gen_random_uuid(),
  category text not null
    references public.category_config (category) on update cascade on delete cascade,
  /* Orders the merchant delivers itself (own riders, pickup, dining). */
  pct numeric(5, 2) not null check (pct >= 0 and pct <= 100),
  /* Orders a NexG rider delivers. Blank: the preset (fees.commission_nexg_delivery). */
  nexg_delivery_pct numeric(5, 2)
    check (nexg_delivery_pct is null or (nexg_delivery_pct >= 0 and nexg_delivery_pct <= 100)),
  /* inclusive: the rate already includes VAT (as the ledger reads it). exclusive: VAT is added. */
  vat_treatment text not null default 'inclusive' check (vat_treatment in ('inclusive', 'exclusive')),
  /* Nairobi calendar days, both inclusive. No end: until a later rate. */
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by uuid references public.staff_user (id) on delete set null,
  requested_at timestamptz not null default clock_timestamp(),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  check (status = 'pending' or decided_at is not null)
);

comment on table public.category_commission_rate is
  'Dated commission rates per category. The approved rate in force on a Nairobi day, the latest-starting one winning, is what merchants in the category are charged unless they have their own agreed term. Append-only history.';

create index if not exists category_commission_rate_category_idx
  on public.category_commission_rate (category, status, starts_on desc);
create unique index if not exists category_commission_rate_one_pending
  on public.category_commission_rate (category) where status = 'pending';

create table if not exists public.category_commission_log (
  id bigint generated always as identity primary key,
  category text not null,
  /* rate_requested, rate_approved, rate_rejected, rate_withdrawn, settings_changed, created */
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  rate_id uuid,
  actor uuid references public.staff_user (id) on delete set null,
  at timestamptz not null default clock_timestamp()
);

comment on table public.category_commission_log is
  'Every change to a category''s commission or settings: who, when, the old and the new values. The Change History tab reads it. Written only by rpc_category_commission_*.';

create index if not exists category_commission_log_at_idx
  on public.category_commission_log (at desc);
create index if not exists category_commission_log_category_idx
  on public.category_commission_log (category, at desc);

alter table public.category_commission enable row level security;
alter table public.category_commission_rate enable row level security;
alter table public.category_commission_log enable row level security;
revoke all on public.category_commission, public.category_commission_rate,
  public.category_commission_log from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════ the seed

/* Every category gets a settings row; fulfilment from the agreed checkout model. */
insert into public.category_commission (category, fulfilment_methods)
select c.category,
  case c.category
    when 'restaurants_food' then array['delivery', 'pickup', 'dine_in']
    when 'alcohol_beverages' then array['delivery', 'pickup']
    when 'pharmacy' then array['delivery', 'pickup']
    when 'laundry_cleaning' then array['delivery', 'pickup']
    when 'airport_transfers' then array['transport']
    when 'travel_tours' then array['booking']
    when 'experiences' then array['booking', 'ticketing']
    when 'adults_only' then array['delivery']
    when 'games_sports' then array['delivery', 'pickup', 'booking']
    when 'beauty' then array['delivery', 'pickup', 'booking']
    when 'wellness' then array['booking']
    when 'concierge_services' then array['booking']
    when 'movers_relocation' then array['booking']
    when 'premium_services' then array['booking']
    when 'vehicle_rentals' then array['booking', 'transport']
    when 'fashion_apparel' then array['delivery', 'pickup']
    when 'groceries_essentials' then array['delivery', 'pickup']
    when 'marketplace' then array['delivery', 'pickup']
    when 'pets' then array['delivery', 'pickup']
    when 'tech_electronics' then array['delivery', 'pickup']
    when 'flowers_gifts' then array['delivery', 'pickup']
    when 'logistics_shipping' then array['delivery']
    else '{}'::text[] end
from public.category_config c
on conflict (category) do nothing;

/* The owner's rate card, 8.2, onto the master categories. */
create temporary table _rate_card (category text, rate_group text, lo numeric, hi numeric)
  on commit drop;
insert into _rate_card values
  ('alcohol_beverages', 'Alcohol & Beverages', 12, 15),
  ('pharmacy', 'Pharmaceutical Services', 10, 14),
  ('laundry_cleaning', 'Laundry Services', 12, 15),
  ('airport_transfers', 'Airport Transfers', 10, 13),
  ('travel_tours', 'Travels & Tours', 10, 13),
  ('experiences', 'Events & Experiences', 12, 15),
  ('adults_only', 'Adult Section', 12, 15),
  ('games_sports', 'Games & Sports', 10, 14),
  ('beauty', 'Beauty & Cosmetics', 12, 15),
  ('wellness', 'Wellness, Spa, Fitness & Nutrition', 12, 15),
  ('concierge_services', 'Concierge Services', 12, 15),
  ('movers_relocation', 'Movers & Relocation', 10, 14),
  ('premium_services', 'Premium Services & Reservations', 10, 14),
  ('vehicle_rentals', 'Car Hire & Vehicle Services', 10, 13),
  ('fashion_apparel', 'Apparels & Clothing', 12, 15),
  ('groceries_essentials', 'Green & Groceries', 10, 13),
  ('marketplace', 'Marketplace (General)', 10, 13),
  ('tech_electronics', 'Electronics & Technology', 7, 11),
  ('flowers_gifts', 'Flowers & Gifts', 12, 15),
  ('logistics_shipping', 'Courier Services', 10, 14);

update public.category_commission cc
   set rate_group = r.rate_group, band_min_pct = r.lo, band_max_pct = r.hi
  from _rate_card r
 where r.category = cc.category and cc.rate_group is null;

insert into public.category_commission_rate
  (category, pct, starts_on, reason, status, decided_at)
select r.category, r.hi, (now() at time zone 'Africa/Nairobi')::date,
       'Owner''s rate card 8.2 (' || r.rate_group || ', ' || r.lo || '–' || r.hi
         || '%): the top of the band, 28 Nov 2026.',
       'approved', now()
from _rate_card r
where exists (select 1 from public.category_config c where c.category = r.category)
  and not exists (select 1 from public.category_commission_rate x where x.category = r.category);

insert into public.category_commission_log (category, action, before, after, reason, rate_id)
select x.category, 'rate_approved', null,
       jsonb_build_object('pct', x.pct, 'nexg_delivery_pct', x.nexg_delivery_pct,
         'vat_treatment', x.vat_treatment, 'starts_on', x.starts_on, 'ends_on', x.ends_on),
       x.reason, x.id
from public.category_commission_rate x
where not exists (select 1 from public.category_commission_log l where l.rate_id = x.id);

-- ═══════════════════════════════════════════════════════════ the rate

/*
 * A category's default for one way of delivering, on a moment: its approved
 * rate in force that Nairobi day (latest start wins), else the preset for
 * the city and category. Internal.
 */
create or replace function public.fn_category_commission(
  p_category text,
  p_city_id uuid,
  p_own boolean,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.category_commission_rate;
  v_day date := (coalesce(p_at, now()) at time zone 'Africa/Nairobi')::date;
  v_preset numeric;
  v_pct numeric;
begin
  v_preset := case when coalesce(p_own, false)
    then settings.fn_num('fees.commission', p_city_id, p_category)
    else coalesce(settings.fn_num('fees.commission_nexg_delivery', p_city_id, p_category),
                  settings.fn_num('fees.commission', p_city_id, p_category)) end;

  select * into r from public.category_commission_rate x
   where x.category = p_category and x.status = 'approved'
     and x.starts_on <= v_day and (x.ends_on is null or x.ends_on >= v_day)
   order by x.starts_on desc, x.decided_at desc
   limit 1;

  v_pct := case when r.id is null then null
                when coalesce(p_own, false) then r.pct
                else r.nexg_delivery_pct end;

  return jsonb_build_object(
    'pct', coalesce(v_pct, v_preset),
    'source', case when v_pct is not null then 'category' else 'preset' end,
    'rate_id', r.id,
    'vat_treatment', coalesce(r.vat_treatment, 'inclusive'),
    'preset_pct', v_preset);
end;
$$;

comment on function public.fn_category_commission(text, uuid, boolean, timestamptz) is
  'A category''s commission default on a moment, for own delivery (p_own) or NexG delivery: its approved rate in force that Nairobi day, else the city/category preset. {pct, source category|preset, rate_id, vat_treatment, preset_pct}.';

revoke all on function public.fn_category_commission(text, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fn_category_commission(text, uuid, boolean, timestamptz)
  to service_role;

/*
 * The commission one merchant is charged at a moment (see the header for
 * the order). `pct` is what the order is charged, VAT included; `quoted_pct`
 * is the rate as written, before any VAT is added. Internal: pricing and
 * the RPCs call it.
 */
create or replace function public.fn_merchant_commission(
  p_merchant_id uuid,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  t public.merchant_commission_term;
  v_day date := (coalesce(p_at, now()) at time zone 'Africa/Nairobi')::date;
  v_category text;
  v_own boolean;
  v_default jsonb;
  v_allow boolean;
  v_agreed numeric;
  v_quoted numeric;
  v_exclusive boolean;
  v_vat numeric;
  v_pct numeric;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;
  v_category := coalesce(nullif(m.category_key, ''), m.category::text);
  v_own := coalesce(m.has_own_riders, false);
  v_default := public.fn_category_commission(v_category, m.city_id, v_own, p_at);
  v_allow := coalesce((select c.merchant_overrides from public.category_commission c
                        where c.category = v_category), true);

  if v_allow then
    select * into t from public.merchant_commission_term x
     where x.merchant_id = p_merchant_id and x.status = 'approved'
       and x.starts_on <= v_day and (x.ends_on is null or x.ends_on >= v_day)
     order by x.starts_on desc, x.decided_at desc
     limit 1;

    if t.id is not null then
      v_agreed := case when v_own then t.own_delivery_pct else t.nexg_delivery_pct end;
    elsif m.commission_pct is not null and not exists (
        select 1 from public.merchant_commission_term x
         where x.merchant_id = p_merchant_id and x.status = 'approved') then
      v_agreed := m.commission_pct;
    end if;
  end if;

  v_quoted := coalesce(v_agreed, (v_default ->> 'pct')::numeric);
  v_exclusive := v_default ->> 'vat_treatment' = 'exclusive'
                 and (v_agreed is not null or v_default ->> 'source' = 'category');
  if v_exclusive and v_quoted is not null then
    v_vat := coalesce(settings.fn_num('tax.vat_pct', m.city_id), 16);
    v_pct := round(v_quoted * (100 + v_vat) / 100, 2);
  else
    v_pct := v_quoted;
  end if;

  return jsonb_build_object(
    'pct', v_pct,
    'quoted_pct', v_quoted,
    'vat_treatment', case when v_exclusive then 'exclusive' else 'inclusive' end,
    'basis', case when v_agreed is not null then 'negotiated'
                  when v_default ->> 'source' = 'category' then 'category'
                  when v_own then 'own_riders' else 'nexg_delivery' end,
    'agreed', v_agreed is not null,
    'term_id', case when v_agreed is not null then t.id end,
    'own_riders', v_own,
    'category', v_category,
    'category_rate_id', case when v_default ->> 'source' = 'category'
                             then v_default ->> 'rate_id' end,
    'overrides_allowed', v_allow,
    'preset_pct', (v_default ->> 'pct')::numeric);
end;
$$;

comment on function public.fn_merchant_commission(uuid, timestamptz) is
  'The commission rate a merchant is charged at a moment: its approved term in force that Nairobi day (unless its category has merchant overrides off), else its old undated rate, else its category''s rate in force, else the city/category preset; grossed up by VAT when the category quotes VAT exclusive. {pct, quoted_pct, vat_treatment, basis, agreed, term_id, own_riders, category, category_rate_id, overrides_allowed, preset_pct (the category default)}.';

-- ═══════════════════════════════════════════════════════════ pricing

/* As 20270306000100, with the category's rate when there is no merchant. */
create or replace function public.fn_price_order(
  p_city_id uuid,
  p_category text,
  p_subtotal_cents bigint,
  p_band smallint default 1,
  p_at timestamptz default now(),
  p_merchant_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_delivery numeric;
  v_threshold numeric;
  v_small numeric;
  v_cash numeric;
  v_commission numeric;
  v_standard numeric;
  v_rate jsonb;
  v_reduced boolean;
  v_service numeric;
  v_service_fee bigint;
  v_flat_above numeric;
  v_missing text[] := '{}';
  v_key text;
  v_category_rate text;
begin
  v_key := 'fees.delivery.band_' || greatest(1, least(4, coalesce(p_band, 1)));
  v_delivery := settings.fn_num(v_key, p_city_id);
  v_threshold := settings.fn_num('fees.small_basket_threshold', p_city_id);
  v_small := settings.fn_num('fees.small_basket_fee', p_city_id);
  v_cash := coalesce(settings.fn_num('fees.cash_handling', p_city_id), 0);
  v_standard := coalesce(settings.fn_num('fees.commission_standard', p_city_id), 14);
  v_flat_above := settings.fn_num('fees.service_flat_above', p_city_id);

  /* The merchant's agreed term, then its category's rate, then the preset. */
  if p_merchant_id is not null then
    v_rate := public.fn_merchant_commission(p_merchant_id, p_at);
    v_category_rate := v_rate ->> 'category_rate_id';
  end if;

  if v_rate is not null then
    v_commission := (v_rate ->> 'pct')::numeric;
  else
    v_rate := public.fn_category_commission(p_category, p_city_id, false, p_at);
    v_commission := (v_rate ->> 'pct')::numeric;
    if v_rate ->> 'source' = 'category' then
      v_category_rate := v_rate ->> 'rate_id';
      if v_rate ->> 'vat_treatment' = 'exclusive' then
        v_commission := round(v_commission
          * (100 + coalesce(settings.fn_num('tax.vat_pct', p_city_id), 16)) / 100, 2);
      end if;
    end if;
    v_rate := null;
  end if;
  v_reduced := v_commission < v_standard;

  if v_delivery is null then v_missing := v_missing || v_key; end if;
  if v_commission is null then v_missing := v_missing || 'fees.commission'::text; end if;

  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'missing', to_jsonb(v_missing),
      'message', 'This city has no published price for '
        || array_to_string(v_missing, ', ')
        || '. An order cannot be priced against a fee nobody agreed.');
  end if;

  if v_flat_above is not null and p_subtotal_cents > v_flat_above * 100 then
    v_service_fee := round(coalesce(settings.fn_num('fees.service_flat', p_city_id), 150) * 100);
  elsif v_reduced then
    v_service_fee := least(
      round(p_subtotal_cents * coalesce(settings.fn_num('fees.service_pct_reduced', p_city_id), 4) / 100.0),
      round(coalesce(settings.fn_num('fees.service_cap_reduced', p_city_id), 200) * 100));
  else
    v_service := coalesce(settings.fn_num('fees.service_pct', p_city_id), 2.5);
    v_service_fee := least(
      round(p_subtotal_cents * v_service / 100.0),
      round(coalesce(settings.fn_num('fees.service_cap', p_city_id), 150) * 100));
  end if;

  return jsonb_build_object(
    'ok', true,
    'subtotal_cents', p_subtotal_cents,
    'delivery_fee_cents', round(v_delivery * 100),
    'service_fee_cents', v_service_fee,
    'small_basket_fee_cents',
      case when v_threshold is not null and v_small is not null
                and p_subtotal_cents < v_threshold * 100
           then round(v_small * 100) else 0 end,
    'cash_handling_cents', round(v_cash * 100),
    'commission_pct', v_commission,
    'commission_cents', round(p_subtotal_cents * v_commission / 100.0),
    'pricing_version_ids', jsonb_build_object(
      'delivery', settings.fn_get(v_key, 'city', p_city_id, null, null, p_at) ->> 'version_id',
      'service', settings.fn_get('fees.service_pct', 'city', p_city_id, null, null, p_at) ->> 'version_id',
      'commission', settings.fn_get('fees.commission', 'city_category', p_city_id, null, p_category, p_at) ->> 'version_id')
      || case when v_rate ->> 'term_id' is not null
              then jsonb_build_object('commission_term', v_rate ->> 'term_id') else '{}'::jsonb end
      || case when v_category_rate is not null
              then jsonb_build_object('commission_category_rate', v_category_rate) else '{}'::jsonb end);
end;
$$;

-- ═══════════════════════════════════════ the merchant's commission card

/* As 20270306000100; the "preset" each rate falls back to is now the category default. */
create or replace function public.rpc_merchant_commission_read(p_merchant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  t public.merchant_commission_term;
  v_me uuid := authz.staff_id();
  v_staff boolean;
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_category text;
  v_own_default jsonb;
  v_nexg_default jsonb;
  v_p_own numeric;
  v_p_nexg numeric;
  v_legacy boolean;
  v_terms jsonb;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    raise exception 'That merchant does not exist.' using errcode = 'P0002';
  end if;
  v_staff := v_me is not null and (authz.works_merchant(m.id)
    or authz.has_role('finance') or authz.has_role('finance_lead'));
  if not v_staff and not authz.is_merchant_member(m.id) then
    raise exception 'Not your merchant.' using errcode = '42501';
  end if;

  v_category := coalesce(nullif(m.category_key, ''), m.category::text);
  v_own_default := public.fn_category_commission(v_category, m.city_id, true);
  v_nexg_default := public.fn_category_commission(v_category, m.city_id, false);
  v_p_own := (v_own_default ->> 'pct')::numeric;
  v_p_nexg := (v_nexg_default ->> 'pct')::numeric;

  select * into t from public.merchant_commission_term x
   where x.merchant_id = m.id and x.status = 'approved'
     and x.starts_on <= v_day and (x.ends_on is null or x.ends_on >= v_day)
   order by x.starts_on desc, x.decided_at desc
   limit 1;
  v_legacy := t.id is null and m.commission_pct is not null and not exists (
    select 1 from public.merchant_commission_term x
     where x.merchant_id = m.id and x.status = 'approved');

  select jsonb_agg(jsonb_build_object(
           'id', x.id,
           'own_delivery_pct', x.own_delivery_pct,
           'nexg_delivery_pct', x.nexg_delivery_pct,
           'starts_on', x.starts_on,
           'ends_on', x.ends_on,
           'status', x.status,
           'in_force', x.id = t.id,
           'terms_ref', x.terms_ref,
           'requested_at', x.requested_at,
           'decided_at', x.decided_at)
         || case when v_staff then jsonb_build_object(
           'reason', x.reason,
           'decision_note', x.decision_note,
           'requested_by', r.display_name,
           'decided_by', d.display_name,
           'mine', x.requested_by = v_me) else '{}'::jsonb end
         order by x.requested_at desc)
    into v_terms
    from (select * from public.merchant_commission_term
           where merchant_id = m.id and (v_staff or status = 'approved')
           order by requested_at desc limit 50) x
    left join public.staff_user r on r.id = x.requested_by
    left join public.staff_user d on d.id = x.decided_by;

  return jsonb_build_object(
    'merchant_id', m.id,
    'viewer', case when v_staff then 'staff' else 'merchant' end,
    'own_riders', coalesce(m.has_own_riders, false),
    'charged_now', (public.fn_merchant_commission(m.id) - 'term_id'),
    'own_delivery_pct', coalesce(case when t.id is not null then t.own_delivery_pct
                                      when v_legacy then m.commission_pct end, v_p_own),
    'own_delivery_agreed', coalesce(case when t.id is not null then t.own_delivery_pct
                                         when v_legacy then m.commission_pct end) is not null,
    'nexg_delivery_pct', coalesce(case when t.id is not null then t.nexg_delivery_pct
                                       when v_legacy then m.commission_pct end, v_p_nexg),
    'nexg_delivery_agreed', coalesce(case when t.id is not null then t.nexg_delivery_pct
                                          when v_legacy then m.commission_pct end) is not null,
    'preset', jsonb_build_object('own_delivery_pct', v_p_own, 'nexg_delivery_pct', v_p_nexg,
      'own_source', v_own_default ->> 'source', 'nexg_source', v_nexg_default ->> 'source',
      'category', v_category),
    'in_force', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'starts_on', t.starts_on, 'ends_on', t.ends_on) end,
    'legacy_pct', case when v_legacy then m.commission_pct end,
    'today', v_day,
    'can_request', v_staff,
    'can_decide', v_staff and public.fn_merchant_commission_decider(m.city_id),
    'terms', coalesce(v_terms, '[]'::jsonb));
end;
$$;

-- ═══════════════════════════════════════════════════════════ who may

/* Ask for a change: Merchant Ops, Finance or a super admin. */
create or replace function public.fn_category_commission_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.staff_id() is not null
     and (authz.can_manage_categories() or authz.has_role('finance')
          or authz.has_role('finance_lead') or authz.is_super_admin())
$$;

/* Approve a rate, or change the approval rule: Finance or a super admin. */
create or replace function public.fn_category_commission_decider()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.staff_id() is not null
     and (authz.has_role('finance') or authz.has_role('finance_lead') or authz.is_super_admin())
$$;

revoke all on function public.fn_category_commission_editor(),
  public.fn_category_commission_decider() from public, anon, authenticated;
grant execute on function public.fn_category_commission_editor(),
  public.fn_category_commission_decider() to service_role;

/* One line of the Change History; the caller writes the same to the audit log (audit.log). */
create or replace function public.fn_category_commission_log(
  p_category text,
  p_action text,
  p_before jsonb,
  p_after jsonb,
  p_reason text,
  p_rate_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_label text := (select c.label from public.category_config c where c.category = p_category);
  v_audit text := case p_action
    when 'rate_requested' then 'category.commission_requested'
    when 'rate_approved' then 'category.commission_approved'
    when 'rate_rejected' then 'category.commission_rejected'
    when 'rate_withdrawn' then 'category.commission_withdrawn'
    when 'created' then 'category.created'
    else 'category.settings_changed' end;
  v_id bigint;
begin
  insert into public.category_commission_log (category, action, before, after, reason, rate_id, actor)
  values (p_category, p_action, p_before, p_after, p_reason, p_rate_id, v_me)
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'module', case when p_action like 'rate_%' escape '' then 'finance' else 'settings' end,
    'action', v_audit,
    'label', coalesce(v_label, p_category),
    'context', jsonb_build_object('category', p_category, 'rate_id', p_rate_id));
end;
$$;

revoke all on function public.fn_category_commission_log(text, text, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.fn_category_commission_log(text, text, jsonb, jsonb, text, uuid)
  to service_role;

-- ═══════════════════════════════════════════════════════════ the screens

/*
 * Everything the Categories & Commissions screen shows: the KPI figures,
 * every category with its rate in force, the next dated rate, a waiting
 * request, the band and settings, and the presets it falls back to.
 */
create or replace function public.rpc_category_commission_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_rows jsonb;
  v_overrides integer;
begin
  if not (public.fn_category_commission_editor() or authz.has_role('ops_manager')) then
    raise exception 'Categories & Commissions is for Merchant Ops, Finance and super admins.'
      using errcode = '42501';
  end if;

  with cats as (
    select c.category, c.label, c.icon, c.description, c.is_active, c.sort,
           coalesce(c.subcategories, '[]'::jsonb) as subs,
           cc.rate_group, cc.band_min_pct, cc.band_max_pct, cc.fulfilment_methods,
           coalesce(cc.approval, 'two_person') as approval,
           coalesce(cc.merchant_overrides, true) as merchant_overrides,
           cc.updated_at
      from public.category_config c
      left join public.category_commission cc on cc.category = c.category
  ),
  now_rate as (
    select distinct on (x.category) x.*
      from public.category_commission_rate x
     where x.status = 'approved' and x.starts_on <= v_day
       and (x.ends_on is null or x.ends_on >= v_day)
     order by x.category, x.starts_on desc, x.decided_at desc
  ),
  next_rate as (
    select distinct on (x.category) x.*
      from public.category_commission_rate x
     where x.status = 'approved' and x.starts_on > v_day
     order by x.category, x.starts_on, x.decided_at desc
  ),
  pending as (
    select x.*, s.display_name as requested_by_name
      from public.category_commission_rate x
      left join public.staff_user s on s.id = x.requested_by
     where x.status = 'pending'
  ),
  merchants as (
    select coalesce(nullif(m.category_key, ''), m.category::text) as category,
           count(*) as merchants,
           count(*) filter (where exists (
             select 1 from public.merchant_commission_term t
              where t.merchant_id = m.id and t.status = 'approved'
                and (t.ends_on is null or t.ends_on >= v_day))
             or (m.commission_pct is not null and not exists (
               select 1 from public.merchant_commission_term t
                where t.merchant_id = m.id and t.status = 'approved'))) as overrides
      from public.merchant m
     group by 1
  )
  select jsonb_agg(jsonb_build_object(
           'category', c.category,
           'label', c.label,
           'icon', c.icon,
           'description', c.description,
           'is_active', c.is_active,
           'sort', c.sort,
           'subcategories', (select coalesce(jsonb_agg(jsonb_build_object(
                                'id', s ->> 'id', 'name', coalesce(s ->> 'name', s ->> 'id'))), '[]'::jsonb)
                               from jsonb_array_elements(c.subs) s),
           'rate_group', c.rate_group,
           'band_min_pct', c.band_min_pct,
           'band_max_pct', c.band_max_pct,
           'fulfilment_methods', to_jsonb(coalesce(c.fulfilment_methods, '{}'::text[])),
           'approval', c.approval,
           'merchant_overrides', c.merchant_overrides,
           'rate', case when n.id is null then null else jsonb_build_object(
             'id', n.id, 'pct', n.pct, 'nexg_delivery_pct', n.nexg_delivery_pct,
             'vat_treatment', n.vat_treatment, 'starts_on', n.starts_on, 'ends_on', n.ends_on) end,
           'next_rate', case when nx.id is null then null else jsonb_build_object(
             'id', nx.id, 'pct', nx.pct, 'nexg_delivery_pct', nx.nexg_delivery_pct,
             'vat_treatment', nx.vat_treatment, 'starts_on', nx.starts_on, 'ends_on', nx.ends_on) end,
           'pending', case when p.id is null then null else jsonb_build_object(
             'id', p.id, 'pct', p.pct, 'nexg_delivery_pct', p.nexg_delivery_pct,
             'vat_treatment', p.vat_treatment, 'starts_on', p.starts_on, 'ends_on', p.ends_on,
             'reason', p.reason, 'requested_by', p.requested_by_name,
             'requested_at', p.requested_at, 'mine', p.requested_by = authz.staff_id()) end,
           'merchants', coalesce(mm.merchants, 0),
           'overrides', coalesce(mm.overrides, 0),
           'updated_at', c.updated_at)
         order by c.is_active desc, c.sort, c.label)
    into v_rows
    from cats c
    left join now_rate n on n.category = c.category
    left join next_rate nx on nx.category = c.category
    left join pending p on p.category = c.category
    left join merchants mm on mm.category = c.category;

  select count(*) into v_overrides
    from public.merchant m
   where exists (select 1 from public.merchant_commission_term t
                  where t.merchant_id = m.id and t.status = 'approved'
                    and t.starts_on <= v_day and (t.ends_on is null or t.ends_on >= v_day))
      or (m.commission_pct is not null and not exists (
            select 1 from public.merchant_commission_term t
             where t.merchant_id = m.id and t.status = 'approved'));

  return jsonb_build_object(
    'today', v_day,
    'categories', coalesce(v_rows, '[]'::jsonb),
    'overrides_in_force', v_overrides,
    'presets', jsonb_build_object(
      'own_delivery_pct', settings.fn_num('fees.commission', null),
      'nexg_delivery_pct', settings.fn_num('fees.commission_nexg_delivery', null),
      'standard_pct', settings.fn_num('fees.commission_standard', null),
      'vat_pct', coalesce(settings.fn_num('tax.vat_pct', null), 16)),
    'can_edit', public.fn_category_commission_editor(),
    'can_decide', public.fn_category_commission_decider(),
    'can_add', authz.can_manage_categories() or authz.is_super_admin());
end;
$$;

comment on function public.rpc_category_commission_overview() is
  'The Categories & Commissions screen: every category with its rate in force, the next dated rate, a waiting request, band and settings; the presets; and what the viewer may do.';

/* The Change History: newest first, one category or all. */
create or replace function public.rpc_category_commission_history(
  p_category text default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.fn_category_commission_editor() or authz.has_role('ops_manager')) then
    raise exception 'Categories & Commissions is for Merchant Ops, Finance and super admins.'
      using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', l.id,
             'category', l.category,
             'label', coalesce(c.label, l.category),
             'action', l.action,
             'before', l.before,
             'after', l.after,
             'reason', l.reason,
             'rate_id', l.rate_id,
             'actor', coalesce(s.display_name, case when l.actor is null then 'NexG (setup)' end),
             'at', l.at)
           order by l.at desc, l.id desc)
      from (select * from public.category_commission_log
             where p_category is null or category = p_category
             order by at desc, id desc
             limit greatest(1, least(coalesce(p_limit, 200), 1000))) l
      left join public.category_config c on c.category = l.category
      left join public.staff_user s on s.id = l.actor), '[]'::jsonb);
end;
$$;

/* Merchant Overrides: every merchant with its own agreed rate, in force, coming or waiting. */
create or replace function public.rpc_category_commission_overrides()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
begin
  if not (public.fn_category_commission_editor() or authz.has_role('ops_manager')) then
    raise exception 'Categories & Commissions is for Merchant Ops, Finance and super admins.'
      using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(s.r order by s.r ->> 'merchant', s.r ->> 'starts_on')
      from (
        select jsonb_build_object(
                 'merchant_id', m.id,
                 'merchant', coalesce(m.trading_name, m.legal_name),
                 'category', coalesce(nullif(m.category_key, ''), m.category::text),
                 'category_label', c.label,
                 'own_riders', coalesce(m.has_own_riders, false),
                 'term_id', t.id,
                 'own_delivery_pct', t.own_delivery_pct,
                 'nexg_delivery_pct', t.nexg_delivery_pct,
                 'starts_on', t.starts_on,
                 'ends_on', t.ends_on,
                 'status', case when t.status = 'pending' then 'pending'
                                when t.starts_on > v_day then 'scheduled'
                                else 'in_force' end,
                 'reason', t.reason,
                 'category_pct', (public.fn_category_commission(
                    coalesce(nullif(m.category_key, ''), m.category::text), m.city_id, true) ->> 'pct')::numeric,
                 'charged_pct', (public.fn_merchant_commission(m.id) ->> 'pct')::numeric,
                 'overrides_allowed', coalesce(cc.merchant_overrides, true)) as r
          from public.merchant_commission_term t
          join public.merchant m on m.id = t.merchant_id
          left join public.category_config c
            on c.category = coalesce(nullif(m.category_key, ''), m.category::text)
          left join public.category_commission cc on cc.category = c.category
         where t.status = 'pending'
            or (t.status = 'approved' and (t.ends_on is null or t.ends_on >= v_day))
        union all
        select jsonb_build_object(
                 'merchant_id', m.id,
                 'merchant', coalesce(m.trading_name, m.legal_name),
                 'category', coalesce(nullif(m.category_key, ''), m.category::text),
                 'category_label', c.label,
                 'own_riders', coalesce(m.has_own_riders, false),
                 'term_id', null,
                 'own_delivery_pct', m.commission_pct,
                 'nexg_delivery_pct', m.commission_pct,
                 'starts_on', null,
                 'ends_on', null,
                 'status', 'in_force',
                 'reason', 'Agreed before commission terms had dates.',
                 'category_pct', (public.fn_category_commission(
                    coalesce(nullif(m.category_key, ''), m.category::text), m.city_id, true) ->> 'pct')::numeric,
                 'charged_pct', (public.fn_merchant_commission(m.id) ->> 'pct')::numeric,
                 'overrides_allowed', coalesce(cc.merchant_overrides, true))
          from public.merchant m
          left join public.category_config c
            on c.category = coalesce(nullif(m.category_key, ''), m.category::text)
          left join public.category_commission cc on cc.category = c.category
         where m.commission_pct is not null
           and not exists (select 1 from public.merchant_commission_term t
                            where t.merchant_id = m.id and t.status = 'approved')
      ) s), '[]'::jsonb);
end;
$$;

/*
 * Save the Edit Category panel. p_payload may hold any of:
 *   label, is_active                       (the category itself)
 *   band_min_pct, band_max_pct, fulfilment_methods, merchant_overrides, approval
 *   rate: {pct, nexg_delivery_pct, vat_treatment, starts_on, ends_on, reason}
 * Settings apply at once, each audited with its old and new value. A rate is
 * a new dated version from starts_on (today or later): it waits for a second
 * person, unless the category is set to single approval and the saver may
 * approve, when it is approved at once.
 */
create or replace function public.rpc_category_commission_save(p_category text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_log jsonb;
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  c public.category_config;
  cc public.category_commission;
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_label text;
  v_active boolean;
  v_min numeric;
  v_max numeric;
  v_methods text[];
  v_overrides boolean;
  v_approval text;
  v_rate jsonb := p_payload -> 'rate';
  v_pct numeric;
  v_nexg numeric;
  v_vat text;
  v_start date;
  v_end date;
  v_reason text := nullif(btrim(coalesce(p_payload ->> 'reason', '')), '');
  v_row public.category_commission_rate;
  v_status text := null;
  v_in_force jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not public.fn_category_commission_editor() then
    raise exception 'Changing categories and commissions is for Merchant Ops, Finance and super admins.'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Nothing to save.' using errcode = '22023';
  end if;

  select * into c from public.category_config where category = p_category for update;
  if c.category is null then
    raise exception 'That category does not exist.' using errcode = 'P0002';
  end if;
  insert into public.category_commission (category) values (p_category)
  on conflict (category) do nothing;
  select * into cc from public.category_commission where category = p_category for update;

  -- the category itself
  if p_payload ? 'label' then
    v_label := nullif(btrim(p_payload ->> 'label'), '');
    if v_label is null or length(v_label) > 100 then
      raise exception 'A category name is 1 to 100 characters.' using errcode = '22023';
    end if;
    if v_label is distinct from c.label then
      v_before := v_before || jsonb_build_object('label', c.label);
      v_after := v_after || jsonb_build_object('label', v_label);
      update public.category_config set label = v_label, updated_at = now() where category = p_category;
    end if;
  end if;
  if p_payload ? 'is_active' then
    v_active := (p_payload ->> 'is_active')::boolean;
    if v_active is null then
      raise exception 'Say whether the category is active.' using errcode = '22023';
    end if;
    if v_active is distinct from c.is_active then
      v_before := v_before || jsonb_build_object('is_active', c.is_active);
      v_after := v_after || jsonb_build_object('is_active', v_active);
      update public.category_config set is_active = v_active, updated_at = now() where category = p_category;
    end if;
  end if;

  -- the settings
  if p_payload ? 'band_min_pct' or p_payload ? 'band_max_pct' then
    v_min := case when p_payload ? 'band_min_pct' then (p_payload ->> 'band_min_pct')::numeric else cc.band_min_pct end;
    v_max := case when p_payload ? 'band_max_pct' then (p_payload ->> 'band_max_pct')::numeric else cc.band_max_pct end;
    if (v_min is not null and (v_min < 0 or v_min > 100 or v_min <> round(v_min, 2)))
       or (v_max is not null and (v_max < 0 or v_max > 100 or v_max <> round(v_max, 2))) then
      raise exception 'A band is a percentage from 0 to 100, to at most two decimal places.'
        using errcode = '22023';
    end if;
    if v_min is not null and v_max is not null and v_min > v_max then
      raise exception 'The band''s lowest rate is above its highest.' using errcode = '22023';
    end if;
    if v_min is distinct from cc.band_min_pct or v_max is distinct from cc.band_max_pct then
      v_before := v_before || jsonb_build_object('band_min_pct', cc.band_min_pct, 'band_max_pct', cc.band_max_pct);
      v_after := v_after || jsonb_build_object('band_min_pct', v_min, 'band_max_pct', v_max);
      update public.category_commission set band_min_pct = v_min, band_max_pct = v_max
       where category = p_category;
    end if;
  end if;
  if p_payload ? 'fulfilment_methods' then
    if jsonb_typeof(p_payload -> 'fulfilment_methods') is distinct from 'array' then
      raise exception 'Fulfilment methods are a list.' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct v order by v), '{}') into v_methods
      from jsonb_array_elements_text(p_payload -> 'fulfilment_methods') v;
    if not v_methods <@ array['delivery', 'pickup', 'dine_in', 'booking', 'ticketing',
                              'transport', 'digital']::text[] then
      raise exception 'Unknown fulfilment method.' using errcode = '22023';
    end if;
    if v_methods is distinct from (select coalesce(array_agg(x order by x), '{}')
                                     from unnest(cc.fulfilment_methods) x) then
      v_before := v_before || jsonb_build_object('fulfilment_methods', to_jsonb(cc.fulfilment_methods));
      v_after := v_after || jsonb_build_object('fulfilment_methods', to_jsonb(v_methods));
      update public.category_commission set fulfilment_methods = v_methods where category = p_category;
    end if;
  end if;
  if p_payload ? 'merchant_overrides' then
    v_overrides := (p_payload ->> 'merchant_overrides')::boolean;
    if v_overrides is null then
      raise exception 'Say whether merchants may have their own rate.' using errcode = '22023';
    end if;
    if v_overrides is distinct from cc.merchant_overrides then
      if not public.fn_category_commission_decider() then
        raise exception 'Switching merchant-specific rates on or off is Finance''s or a super admin''s.'
          using errcode = '42501';
      end if;
      v_before := v_before || jsonb_build_object('merchant_overrides', cc.merchant_overrides);
      v_after := v_after || jsonb_build_object('merchant_overrides', v_overrides);
      update public.category_commission set merchant_overrides = v_overrides where category = p_category;
    end if;
  end if;
  if p_payload ? 'approval' then
    v_approval := p_payload ->> 'approval';
    if v_approval not in ('two_person', 'single') then
      raise exception 'Approval is two_person or single.' using errcode = '22023';
    end if;
    if v_approval is distinct from cc.approval then
      if not public.fn_category_commission_decider() then
        raise exception 'Changing who approves a rate is Finance''s or a super admin''s.'
          using errcode = '42501';
      end if;
      v_before := v_before || jsonb_build_object('approval', cc.approval);
      v_after := v_after || jsonb_build_object('approval', v_approval);
      update public.category_commission set approval = v_approval where category = p_category;
    end if;
  end if;

  if v_after <> '{}'::jsonb then
    update public.category_commission set updated_at = now(), updated_by = v_me
     where category = p_category;
    v_log := public.fn_category_commission_log(p_category, 'settings_changed', v_before, v_after, v_reason);
    perform audit.log('staff'::public.actor_type, v_log ->> 'module', v_log ->> 'action',
      p_actor_id => v_me, p_target_type => 'category', p_target_label => v_log ->> 'label',
      p_before => (select l.before from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_after => (select l.after from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_reason => (select l.reason from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_context => v_log -> 'context');
  end if;

  -- a new rate
  if v_rate is not null and jsonb_typeof(v_rate) = 'object' then
    v_pct := (v_rate ->> 'pct')::numeric;
    v_nexg := nullif(v_rate ->> 'nexg_delivery_pct', '')::numeric;
    v_vat := coalesce(nullif(v_rate ->> 'vat_treatment', ''), 'inclusive');
    v_start := (v_rate ->> 'starts_on')::date;
    v_end := nullif(v_rate ->> 'ends_on', '')::date;
    v_reason := coalesce(nullif(btrim(coalesce(v_rate ->> 'reason', '')), ''), v_reason);
    if v_pct is null or v_pct < 0 or v_pct > 100 or v_pct <> round(v_pct, 2)
       or (v_nexg is not null and (v_nexg < 0 or v_nexg > 100 or v_nexg <> round(v_nexg, 2))) then
      raise exception 'A rate is a percentage from 0 to 100, to at most two decimal places.'
        using errcode = '22023';
    end if;
    if v_vat not in ('inclusive', 'exclusive') then
      raise exception 'VAT treatment is inclusive or exclusive.' using errcode = '22023';
    end if;
    if v_start is null then
      raise exception 'Say which day the rate starts.' using errcode = '22023';
    end if;
    if v_start < v_day then
      raise exception 'A rate starts today or later. Orders already placed keep the rate they were charged.'
        using errcode = '22023';
    end if;
    if v_end is not null and v_end < v_start then
      raise exception 'The end date is before the start date.' using errcode = '22023';
    end if;
    if v_reason is null or length(v_reason) > 1000 then
      raise exception 'Say why the rate changes (under 1,000 characters), so the approver knows what they approve.'
        using errcode = '22023';
    end if;
    if exists (select 1 from public.category_commission_rate
                where category = p_category and status = 'pending') then
      raise exception 'A rate change is already waiting for this category. Approve, reject or withdraw it first.'
        using errcode = '23505';
    end if;

    select to_jsonb(x) - 'reason' - 'decision_note' into v_in_force
      from public.category_commission_rate x
     where x.category = p_category and x.status = 'approved'
       and x.starts_on <= v_start and (x.ends_on is null or x.ends_on >= v_start)
     order by x.starts_on desc, x.decided_at desc limit 1;

    if cc.approval = 'single' and public.fn_category_commission_decider() then
      insert into public.category_commission_rate
        (category, pct, nexg_delivery_pct, vat_treatment, starts_on, ends_on, reason,
         status, requested_by, decided_by, decided_at, decision_note)
      values (p_category, v_pct, v_nexg, v_vat, v_start, v_end, v_reason,
              'approved', v_me, v_me, clock_timestamp(), 'Single approval: applied by the person who set it.')
      returning * into v_row;
      v_status := 'approved';
    else
      insert into public.category_commission_rate
        (category, pct, nexg_delivery_pct, vat_treatment, starts_on, ends_on, reason, requested_by)
      values (p_category, v_pct, v_nexg, v_vat, v_start, v_end, v_reason, v_me)
      returning * into v_row;
      v_status := 'pending';
    end if;

    v_log := public.fn_category_commission_log(p_category,
      case when v_status = 'approved' then 'rate_approved' else 'rate_requested' end,
      case when v_in_force is null then null else jsonb_build_object(
        'pct', v_in_force -> 'pct', 'nexg_delivery_pct', v_in_force -> 'nexg_delivery_pct',
        'vat_treatment', v_in_force -> 'vat_treatment', 'starts_on', v_in_force -> 'starts_on',
        'ends_on', v_in_force -> 'ends_on') end,
      jsonb_build_object('pct', v_row.pct, 'nexg_delivery_pct', v_row.nexg_delivery_pct,
        'vat_treatment', v_row.vat_treatment, 'starts_on', v_row.starts_on, 'ends_on', v_row.ends_on),
      v_reason, v_row.id);
    perform audit.log('staff'::public.actor_type, v_log ->> 'module', v_log ->> 'action',
      p_actor_id => v_me, p_target_type => 'category', p_target_label => v_log ->> 'label',
      p_before => (select l.before from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_after => (select l.after from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_reason => (select l.reason from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_context => v_log -> 'context');
  end if;

  return jsonb_build_object('ok', true, 'changed', v_after <> '{}'::jsonb, 'rate', v_status,
    'rate_id', v_row.id);
end;
$$;

comment on function public.rpc_category_commission_save(text, jsonb) is
  'Saves the Edit Category panel: name, status, band, fulfilment, approval rule, merchant-override switch (at once, audited old/new), and a new dated rate (from today or later; a second person approves unless the category is single-approval and the saver may approve).';

/*
 * Add Category: a new category, switched off until it is ready. Merchants
 * pick categories from the master list, so a new one is listed for them
 * once it is added there; this records its name, settings and rate.
 */
create or replace function public.rpc_category_commission_add(p_category text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_log jsonb;
  v_label text := nullif(btrim(coalesce(p_payload ->> 'label', '')), '');
  v_rest jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not (authz.can_manage_categories() or authz.is_super_admin()) then
    raise exception 'Adding a category is Merchant Ops'' or a super admin''s.' using errcode = '42501';
  end if;
  if p_category is null or p_category !~ '^[a-z][a-z0-9_]{1,63}$' then
    raise exception 'A category code is lower case letters, digits and underscores, starting with a letter.'
      using errcode = '22023';
  end if;
  if v_label is null or length(v_label) > 100 then
    raise exception 'A category name is 1 to 100 characters.' using errcode = '22023';
  end if;
  if exists (select 1 from public.category_config where category = p_category) then
    raise exception 'A category with that code already exists.' using errcode = '23505';
  end if;

  insert into public.category_config (category, label, icon, card_kind, eta_style, is_active, sort)
  values (p_category, v_label, 'Store', 'products', 'minutes', false,
          coalesce((select max(sort) + 1 from public.category_config where is_active), 0));
  insert into public.category_commission (category, updated_by) values (p_category, v_me);

  v_log := public.fn_category_commission_log(p_category, 'created', null,
    jsonb_build_object('label', v_label, 'is_active', false), 'Category added');
    perform audit.log('staff'::public.actor_type, v_log ->> 'module', v_log ->> 'action',
      p_actor_id => v_me, p_target_type => 'category', p_target_label => v_log ->> 'label',
      p_before => (select l.before from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_after => (select l.after from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_reason => (select l.reason from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_context => v_log -> 'context');

  v_rest := (coalesce(p_payload, '{}'::jsonb) - 'label' - 'is_active');
  if v_rest <> '{}'::jsonb then
    perform public.rpc_category_commission_save(p_category, v_rest);
  end if;
  return jsonb_build_object('ok', true, 'category', p_category);
end;
$$;

/* The second person approves or rejects a waiting rate: Finance or a super admin, never the requester. */
create or replace function public.rpc_category_commission_decide(
  p_rate_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.category_commission_rate;
  v_me uuid := authz.staff_id();
  v_log jsonb;
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_after jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'Approve or reject.' using errcode = '22023';
  end if;
  if not public.fn_category_commission_decider() then
    raise exception 'Approving a category rate is Finance''s or a super admin''s.' using errcode = '42501';
  end if;
  select * into r from public.category_commission_rate where id = p_rate_id for update;
  if r.id is null then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  if r.status <> 'pending' then
    raise exception 'That request is already %.', r.status using errcode = '22023';
  end if;
  if r.requested_by = v_me then
    raise exception 'You asked for this. Somebody else has to approve it.' using errcode = '42501';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;

  if p_approve then
    if r.ends_on is not null and r.ends_on < v_day then
      raise exception 'Those dates have already passed. Reject it and ask again with new dates.'
        using errcode = '22023';
    end if;
    update public.category_commission_rate
       set status = 'approved', starts_on = greatest(starts_on, v_day),
           decided_by = v_me, decided_at = clock_timestamp(), decision_note = v_note
     where id = r.id
    returning * into r;
  else
    update public.category_commission_rate
       set status = 'rejected', decided_by = v_me, decided_at = clock_timestamp(), decision_note = v_note
     where id = r.id
    returning * into r;
  end if;

  v_after := jsonb_build_object('pct', r.pct, 'nexg_delivery_pct', r.nexg_delivery_pct,
    'vat_treatment', r.vat_treatment, 'starts_on', r.starts_on, 'ends_on', r.ends_on,
    'status', r.status);
  v_log := public.fn_category_commission_log(r.category,
    case when p_approve then 'rate_approved' else 'rate_rejected' end,
    jsonb_build_object('status', 'pending'), v_after, coalesce(v_note, r.reason), r.id);
    perform audit.log('staff'::public.actor_type, v_log ->> 'module', v_log ->> 'action',
      p_actor_id => v_me, p_target_type => 'category', p_target_label => v_log ->> 'label',
      p_before => (select l.before from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_after => (select l.after from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_reason => (select l.reason from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_context => v_log -> 'context');

  return jsonb_build_object('ok', true, 'status', r.status);
end;
$$;

/* The requester, or anyone who could approve it, takes back a waiting rate. */
create or replace function public.rpc_category_commission_withdraw(p_rate_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.category_commission_rate;
  v_me uuid := authz.staff_id();
  v_log jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into r from public.category_commission_rate where id = p_rate_id for update;
  if r.id is null then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  if not (r.requested_by = v_me or public.fn_category_commission_decider()) then
    raise exception 'Only the person who asked, or someone who could approve it, can withdraw it.'
      using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'That request is already %.', r.status using errcode = '22023';
  end if;
  update public.category_commission_rate
     set status = 'withdrawn', decided_by = v_me, decided_at = clock_timestamp()
   where id = r.id;
  v_log := public.fn_category_commission_log(r.category, 'rate_withdrawn',
    jsonb_build_object('status', 'pending', 'pct', r.pct, 'nexg_delivery_pct', r.nexg_delivery_pct),
    jsonb_build_object('status', 'withdrawn'), null, r.id);
    perform audit.log('staff'::public.actor_type, v_log ->> 'module', v_log ->> 'action',
      p_actor_id => v_me, p_target_type => 'category', p_target_label => v_log ->> 'label',
      p_before => (select l.before from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_after => (select l.after from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_reason => (select l.reason from public.category_commission_log l where l.id = (v_log ->> 'id')::bigint),
      p_context => v_log -> 'context');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.rpc_category_commission_overview(),
  public.rpc_category_commission_history(text, integer),
  public.rpc_category_commission_overrides(),
  public.rpc_category_commission_save(text, jsonb),
  public.rpc_category_commission_add(text, jsonb),
  public.rpc_category_commission_decide(uuid, boolean, text),
  public.rpc_category_commission_withdraw(uuid) from public, anon;
grant execute on function public.rpc_category_commission_overview(),
  public.rpc_category_commission_history(text, integer),
  public.rpc_category_commission_overrides(),
  public.rpc_category_commission_save(text, jsonb),
  public.rpc_category_commission_add(text, jsonb),
  public.rpc_category_commission_decide(uuid, boolean, text),
  public.rpc_category_commission_withdraw(uuid) to authenticated, service_role;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('category.commission_requested', 'finance', 'notice', false, true, true,
   'Staff asked for a new dated commission rate for a category; a second person decides'),
  ('category.commission_approved', 'finance', 'high', false, true, true,
   'A category''s commission rate was approved; merchants in it are charged it from its start day'),
  ('category.commission_rejected', 'finance', 'notice', false, true, true,
   'A category commission rate request was rejected'),
  ('category.commission_withdrawn', 'finance', 'info', false, false, true,
   'A category commission rate request was withdrawn before anyone decided it'),
  ('category.settings_changed', 'settings', 'notice', false, false, false,
   'A category''s name, status, band, fulfilment, approval rule or merchant-override switch changed'),
  ('category.created', 'settings', 'notice', false, false, false,
   'A category was added in Categories & Commissions')
on conflict (action) do nothing;
