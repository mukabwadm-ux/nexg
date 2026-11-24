-- Commission agreed with one merchant, dated, approved by a second person.
--
-- The owner (23 Nov): "For commissions they should be configurable /
-- adjustable per particular merchant based on agreed terms irregardless of
-- preset commission structure." Decisions the same day:
--   1. Two optional rates per merchant: one for orders the merchant delivers
--      itself (own riders, pickup, dining) and one for orders a NexG rider
--      delivers. A blank rate falls back to its preset (fees.commission /
--      fees.commission_nexg_delivery).
--   2. Two people: one asks, a different Finance / Ops manager / super admin
--      approves (like suspensions, the preset rate card and rider pay).
--   3. Merchants only. Hosts (fixed 15%) and hotels (own per-hotel rate)
--      are not touched.
--
-- What already existed: merchant.commission_pct, one negotiated rate with no
-- dates, read first by fn_price_order and the agreement, written only by the
-- unused commission_tier_change approval. It is carried over here as an
-- approved term and stays as a column; nothing drops it.
--
-- Orders keep the rate they were charged: the order already stores
-- commission_pct and commission_cents when it is placed, and the split and
-- the ledger read those. This adds the term id to pricing_version_ids, and
-- makes fn_order_reprice keep the order's own rate (it used to look up the
-- preset fees.commission version, which undid a negotiated rate and the 28%
-- NexG-delivery rate on any edited order).
--
-- Also fixed in passing: rpc_merchant_two_person_approve queued a
-- 'merchant_suspended' notification for every kind it approved; it now does
-- so only for a suspension.
--
-- Replaced bodies are main's: fn_price_order (20260101022200),
-- fn_merchant_agreement_commission (20270103000100), fn_order_reprice
-- (20260101014300), rpc_merchant_two_person_approve (20260101007400),
-- fin_merchant_take_v (20260101018100). Same signatures and grants.
--
-- Rollback: re-run those five definitions from the files named, then
--   drop function public.rpc_merchant_commission_read(uuid),
--     public.rpc_merchant_commission_request(uuid, numeric, numeric, date, date, text, text),
--     public.rpc_merchant_commission_decide(uuid, boolean, text),
--     public.rpc_merchant_commission_withdraw(uuid),
--     public.fn_merchant_agreed_pct(uuid),
--     public.fn_merchant_commission(uuid, timestamptz);
--   drop table public.merchant_commission_term;
--   delete from audit.action_registry where action like 'merchant.commission\_%' escape '\'
--     and action <> 'merchant.commission_tier_change_requested'
--     and action <> 'merchant.commission_tier_change_approved';

-- ═══════════════════════════════════════════════════════════════ the terms

create table if not exists public.merchant_commission_term (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchant (id) on delete cascade,
  /* Null: this rate stays on the preset. Both null: "back to the preset". */
  own_delivery_pct numeric(5, 2)
    check (own_delivery_pct is null or (own_delivery_pct >= 0 and own_delivery_pct <= 100)),
  nexg_delivery_pct numeric(5, 2)
    check (nexg_delivery_pct is null or (nexg_delivery_pct >= 0 and nexg_delivery_pct <= 100)),
  /* Nairobi calendar days, both inclusive. No end: until a later term. */
  starts_on date not null,
  ends_on date check (ends_on is null or ends_on >= starts_on),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  terms_ref text check (terms_ref is null or length(terms_ref) <= 200),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  requested_by uuid references public.staff_user (id) on delete set null,
  requested_at timestamptz not null default clock_timestamp(),
  decided_by uuid references public.staff_user (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 1000),
  check (status = 'pending' or decided_at is not null)
);

comment on table public.merchant_commission_term is
  'Commission agreed with one merchant, overriding the preset rates between two dates. Asked for by one member of staff and approved by another; append-only history. Read and written only through rpc_merchant_commission_*.';

create index if not exists merchant_commission_term_merchant_idx
  on public.merchant_commission_term (merchant_id, status, starts_on desc);
create unique index if not exists merchant_commission_term_one_pending
  on public.merchant_commission_term (merchant_id) where status = 'pending';

alter table public.merchant_commission_term enable row level security;
revoke all on public.merchant_commission_term from public, anon, authenticated;

/* What merchant.commission_pct said, carried over as an approved term. */
insert into public.merchant_commission_term
  (merchant_id, own_delivery_pct, nexg_delivery_pct, starts_on, reason, status, decided_at)
select m.id, m.commission_pct, m.commission_pct,
       (least(coalesce(m.went_live_at, m.created_at), now()) at time zone 'Africa/Nairobi')::date,
       'Agreed before commission terms had dates; carried over from the merchant record.',
       'approved', now()
from public.merchant m
where m.commission_pct is not null
  and not exists (select 1 from public.merchant_commission_term t where t.merchant_id = m.id);

-- ═══════════════════════════════════════════════════════════ the rate now

/*
 * The commission one merchant is charged at a moment: the approved term in
 * force that day (Nairobi), the latest-starting one winning, for the way
 * the merchant delivers; else the old undated merchant.commission_pct if
 * the merchant has never had a term; else the preset for its city and
 * category. Internal: pricing and the RPCs below call it.
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
  v_own boolean;
  v_preset numeric;
  v_agreed numeric;
begin
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    return null;
  end if;
  v_own := coalesce(m.has_own_riders, false);
  v_preset := case when v_own
    then settings.fn_num('fees.commission', m.city_id, m.category::text)
    else coalesce(settings.fn_num('fees.commission_nexg_delivery', m.city_id, m.category::text),
                  settings.fn_num('fees.commission', m.city_id, m.category::text)) end;

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

  return jsonb_build_object(
    'pct', coalesce(v_agreed, v_preset),
    'basis', case when v_agreed is not null then 'negotiated'
                  when v_own then 'own_riders' else 'nexg_delivery' end,
    'agreed', v_agreed is not null,
    'term_id', case when v_agreed is not null then t.id end,
    'own_riders', v_own,
    'preset_pct', v_preset);
end;
$$;

comment on function public.fn_merchant_commission(uuid, timestamptz) is
  'The commission rate a merchant is charged at a moment: its approved term in force that Nairobi day for the way it delivers, else its old undated rate, else the city/category preset. {pct, basis, agreed, term_id, own_riders, preset_pct}.';

revoke all on function public.fn_merchant_commission(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_merchant_commission(uuid, timestamptz) to service_role;

/* The agreed rate, for Finance's "agreed against taken" report. Staff only. */
create or replace function public.fn_merchant_agreed_pct(p_merchant_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when authz.staff_id() is not null then (
    select (c ->> 'pct')::numeric
      from public.fn_merchant_commission(p_merchant_id) c
     where (c ->> 'agreed')::boolean) end
$$;

revoke all on function public.fn_merchant_agreed_pct(uuid) from public, anon;
grant execute on function public.fn_merchant_agreed_pct(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════ pricing

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
begin
  v_key := 'fees.delivery.band_' || greatest(1, least(4, coalesce(p_band, 1)));
  v_delivery := settings.fn_num(v_key, p_city_id);
  v_threshold := settings.fn_num('fees.small_basket_threshold', p_city_id);
  v_small := settings.fn_num('fees.small_basket_fee', p_city_id);
  v_cash := coalesce(settings.fn_num('fees.cash_handling', p_city_id), 0);
  v_standard := coalesce(settings.fn_num('fees.commission_standard', p_city_id), 14);
  v_flat_above := settings.fn_num('fees.service_flat_above', p_city_id);

  /* The merchant's agreed term first, then the preset (fn_merchant_commission). */
  if p_merchant_id is not null then
    v_rate := public.fn_merchant_commission(p_merchant_id, p_at);
  end if;

  v_commission := case
    when v_rate is not null then (v_rate ->> 'pct')::numeric
    else coalesce(settings.fn_num('fees.commission_nexg_delivery', p_city_id, p_category),
                  settings.fn_num('fees.commission', p_city_id, p_category)) end;
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
              then jsonb_build_object('commission_term', v_rate ->> 'term_id') else '{}'::jsonb end);
end;
$$;

-- ═══════════════════════════════════════════════════════════ the agreement

/*
 * The commission the agreement states: the rate pricing charges this
 * merchant today (fn_merchant_commission).
 */
create or replace function public.fn_merchant_agreement_commission(p_merchant_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_rate jsonb := public.fn_merchant_commission(p_merchant_id);
begin
  if v_rate is null then
    return null;
  end if;
  return jsonb_build_object('pct', (v_rate ->> 'pct')::numeric, 'basis', v_rate ->> 'basis');
end;
$$;

-- ═══════════════════════════════════════════════════════════ repricing

create or replace function public.fn_order_reprice(p_order_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_subtotal bigint := 0;
  v_ids jsonb;
  v_delivery bigint;
  v_service numeric;
  v_commission numeric;
  v_threshold bigint;
  v_small bigint;
  v_cash bigint;
  v_missing text[] := '{}';
  v_small_fee bigint;
  v_total bigint;
begin
  select * into o from public.order where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'message', 'No such order.'); end if;

  select coalesce(sum(
           case when ch.q is not null then ch.q else oi.quantity end
           * oi.unit_price_cents), 0)
    into v_subtotal
    from public.order_item oi
    left join lateral (
      select (c ->> 'quantity')::integer as q
        from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) c
       where (c ->> 'item_id')::uuid = oi.id
    ) ch on true
   where oi.order_id = p_order_id and oi.removed_at is null;

  v_ids := coalesce(o.pricing_version_ids, '{}'::jsonb);

  /* The exact rows this order was priced from. */
  select (v.value #>> '{}')::bigint into v_delivery
    from settings.version v where v.id = (v_ids ->> 'delivery')::uuid;
  select (v.value #>> '{}')::numeric into v_service
    from settings.version v where v.id = (v_ids ->> 'service')::uuid;
  /* The rate the order was charged (an agreed term, or the NexG-delivery
     rate); the preset version only for an order that has none. */
  v_commission := o.commission_pct;
  if v_commission is null then
    select (v.value #>> '{}')::numeric into v_commission
      from settings.version v where v.id = (v_ids ->> 'commission')::uuid;
  end if;

  if v_delivery is null then v_missing := v_missing || 'the delivery fee'::text; end if;
  if v_service is null then v_missing := v_missing || 'the service fee'::text; end if;
  if v_commission is null then v_missing := v_missing || 'the commission'::text; end if;

  /*
   * An order placed before this machinery existed has no version
   * ids. Repricing it against today's card would change what the
   * guest was quoted, so it is refused and says why rather than
   * doing that quietly.
   */
  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'missing', to_jsonb(v_missing),
      'message', 'This order does not record which version of '
        || array_to_string(v_missing, ', ')
        || ' it was priced from, so it cannot be repriced without changing what the guest was quoted. Refund or waive instead.');
  end if;

  /* The two that only ever reduce a bill are read live: a small
     basket threshold or a cash fee that has since been lowered
     should not be re-imposed at the old, higher figure. */
  v_threshold := settings.fn_int('fees.small_basket_threshold', o.city_id);
  v_small := settings.fn_int('fees.small_basket_fee', o.city_id);
  v_cash := coalesce(settings.fn_int('fees.cash_handling', o.city_id), 0);

  v_small_fee := case
    when v_threshold is not null and v_small is not null and v_subtotal < v_threshold
    then v_small else 0 end;

  v_total := v_subtotal
    + v_delivery
    + round(v_subtotal * v_service / 100.0)
    + v_small_fee
    + case when o.payment_method = 'cash_on_delivery' then v_cash else 0 end
    /* Decided when the order was placed. A reprice is not a chance
       to re-decide whether it was night. */
    + o.night_surcharge_cents
    + o.concierge_fee_cents
    + o.tip_cents;

  return jsonb_build_object(
    'ok', true,
    'subtotal_cents', v_subtotal,
    'delivery_fee_cents', v_delivery,
    'service_fee_cents', round(v_subtotal * v_service / 100.0),
    'small_basket_fee_cents', v_small_fee,
    'cash_handling_cents',
      case when o.payment_method = 'cash_on_delivery' then v_cash else 0 end,
    'night_surcharge_cents', o.night_surcharge_cents,
    'concierge_fee_cents', o.concierge_fee_cents,
    'tip_cents', o.tip_cents,
    'commission_pct', v_commission,
    'commission_cents', round(v_subtotal * v_commission / 100.0),
    'total_cents', v_total,
    'was_total_cents', o.total_cents,
    'delta_cents', v_total - o.total_cents,
    'pricing_version_ids', v_ids,
    'priced_from', 'the versions this order was placed under',
    'currency', o.currency);
end;
$$;

comment on function public.fn_order_reprice is
  'Reprices against the exact settings versions the order was placed under, named by id. A timestamp would be a guess at which version applied; an id is the answer, and a backdated rate card cannot move a quote the guest already has.';


-- ═══════════════════════════════════ the old commission_tier_change approval

create or replace function public.rpc_merchant_two_person_approve(p_request_id uuid)
returns public.merchant
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.approval_request;
  v_merchant public.merchant;
  v_me uuid := authz.staff_id();
begin
  select * into v_request from public.approval_request
  where id = p_request_id and status = 'pending';

  if v_request.id is null then
    raise exception 'No such request, or it is already decided.'
      using errcode = 'no_data_found';
  end if;
  if not authz.works_merchant(v_request.target_id) then
    raise exception 'Not your merchant.' using errcode = 'insufficient_privilege';
  end if;
  if v_request.requested_by = v_me then
    raise exception 'You asked for this. Somebody else has to approve it.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_request.kind::text = 'merchant_suspension' then
    update public.merchant set
      status = 'suspended',
      status_reason = v_request.reason,
      suspended_at = now(),
      suspended_by = v_request.requested_by,
      suspension_reason = v_request.reason,
      suspension_second_approver = v_me,
      /* Money stops while a merchant is suspended. */
      payout_hold = true,
      payout_hold_reason = 'Suspended'
    where id = v_request.target_id
    returning * into v_merchant;

  elsif v_request.kind::text = 'merchant_delist' then
    update public.merchant set
      status = 'delisted', status_reason = v_request.reason, delisted_at = now()
    where id = v_request.target_id returning * into v_merchant;

  elsif v_request.kind::text = 'commission_tier_change' then
    update public.merchant set
      commission_tier = (v_request.payload ->> 'tier')::public.commission_tier_code,
      commission_pct = nullif(v_request.payload ->> 'pct', '')::numeric
    where id = v_request.target_id returning * into v_merchant;
    /* Pricing reads dated terms (fn_merchant_commission), so the rate
       becomes one from today, for both ways of delivering. */
    insert into public.merchant_commission_term
      (merchant_id, own_delivery_pct, nexg_delivery_pct, starts_on, reason, status,
       requested_by, requested_at, decided_by, decided_at)
    values (v_request.target_id, v_merchant.commission_pct, v_merchant.commission_pct,
      (now() at time zone 'Africa/Nairobi')::date, v_request.reason, 'approved',
      v_request.requested_by, v_request.created_at, v_me, now());
  end if;

  update public.approval_request
  set status = 'approved', decided_by = v_me, decided_at = now()
  where id = p_request_id;

  if v_request.kind::text = 'merchant_suspension' then
    insert into public.notification (kind, status) values ('merchant_suspended', 'pending');
  end if;

  perform audit.log('staff'::public.actor_type, 'merchants',
    'merchant.' || v_request.kind::text || '_approved',
    p_target_type => 'merchant', p_target_id => v_request.target_id,
    p_reason => v_request.reason, p_approved_by => v_me,
    p_city_id => v_merchant.city_id, p_severity => 'high'::public.audit_severity);

  return v_merchant;
end;
$$;

-- ═══════════════════════════════════════════════════════════ the screens

/* Who may decide: Finance, an Ops manager for the merchant's city, a super admin. */
create or replace function public.fn_merchant_commission_decider(p_city_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select authz.staff_id() is not null
     and (authz.has_role('finance') or authz.has_role('finance_lead')
          or authz.has_role('ops_manager', p_city_id) or authz.is_super_admin())
$$;

revoke all on function public.fn_merchant_commission_decider(uuid) from public, anon, authenticated;
grant execute on function public.fn_merchant_commission_decider(uuid) to service_role;

/*
 * The commission card: the rate charged now and its source, each rate
 * against its preset, and the terms. Staff who work the merchant (or
 * Finance) see everything, with who asked, who approved and why; the
 * merchant's own team sees its approved terms only.
 */
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

  v_p_own := settings.fn_num('fees.commission', m.city_id, m.category::text);
  v_p_nexg := coalesce(settings.fn_num('fees.commission_nexg_delivery', m.city_id, m.category::text), v_p_own);

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
    'preset', jsonb_build_object('own_delivery_pct', v_p_own, 'nexg_delivery_pct', v_p_nexg),
    'in_force', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'starts_on', t.starts_on, 'ends_on', t.ends_on) end,
    'legacy_pct', case when v_legacy then m.commission_pct end,
    'today', v_day,
    'can_request', v_staff,
    'can_decide', v_staff and public.fn_merchant_commission_decider(m.city_id),
    'terms', coalesce(v_terms, '[]'::jsonb));
end;
$$;

comment on function public.rpc_merchant_commission_read(uuid) is
  'The commission card for one merchant: the rate charged now and why, each rate against its preset, and its terms. Staff who work the merchant and Finance see everything; the merchant''s own team sees approved terms without staff names or reasons.';

/*
 * Ask for a commission agreed with this merchant. Either rate may be
 * blank (stays on the preset); both blank asks to go back to the preset
 * from that day. A term starts today or later: orders already placed keep
 * the rate they were charged. One request waits at a time.
 */
create or replace function public.rpc_merchant_commission_request(
  p_merchant_id uuid,
  p_own_delivery_pct numeric,
  p_nexg_delivery_pct numeric,
  p_starts_on date,
  p_ends_on date,
  p_reason text,
  p_terms_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.merchant;
  v_me uuid := authz.staff_id();
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref text := nullif(btrim(coalesce(p_terms_ref, '')), '');
  v_term public.merchant_commission_term;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into m from public.merchant where id = p_merchant_id;
  if m.id is null then
    raise exception 'That merchant does not exist.' using errcode = 'P0002';
  end if;
  if not (authz.works_merchant(m.id) or authz.has_role('finance') or authz.has_role('finance_lead')) then
    raise exception 'Not your merchant.' using errcode = '42501';
  end if;
  if (p_own_delivery_pct is not null and (p_own_delivery_pct < 0 or p_own_delivery_pct > 100
        or p_own_delivery_pct <> round(p_own_delivery_pct, 2)))
     or (p_nexg_delivery_pct is not null and (p_nexg_delivery_pct < 0 or p_nexg_delivery_pct > 100
        or p_nexg_delivery_pct <> round(p_nexg_delivery_pct, 2))) then
    raise exception 'A rate is a percentage from 0 to 100, to at most two decimal places.'
      using errcode = '22023';
  end if;
  if p_starts_on is null then
    raise exception 'Say which day the rate starts.' using errcode = '22023';
  end if;
  if p_starts_on < v_day then
    raise exception 'A rate starts today or later. Orders already placed keep the rate they were charged.'
      using errcode = '22023';
  end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'The end date is before the start date.' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'Write what was agreed, so the second person knows what they are approving.'
      using errcode = '22023';
  end if;
  if length(v_reason) > 1000 or length(coalesce(v_ref, '')) > 200 then
    raise exception 'Keep the reason under 1,000 characters and the reference under 200.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.merchant_commission_term
              where merchant_id = m.id and status = 'pending') then
    raise exception 'A commission request is already waiting for this merchant. Approve, reject or withdraw it first.'
      using errcode = '23505';
  end if;

  insert into public.merchant_commission_term
    (merchant_id, own_delivery_pct, nexg_delivery_pct, starts_on, ends_on, reason, terms_ref, requested_by)
  values (m.id, p_own_delivery_pct, p_nexg_delivery_pct, p_starts_on, p_ends_on, v_reason, v_ref, v_me)
  returning * into v_term;

  perform audit.log('staff'::public.actor_type, 'finance', 'merchant.commission_requested',
    p_actor_id => v_me,
    p_target_type => 'merchant', p_target_id => m.id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id,
    p_reason => v_reason,
    p_before => jsonb_build_object('charged', public.fn_merchant_commission(m.id)),
    p_after => jsonb_build_object('term_id', v_term.id,
      'own_delivery_pct', v_term.own_delivery_pct, 'nexg_delivery_pct', v_term.nexg_delivery_pct,
      'starts_on', v_term.starts_on, 'ends_on', v_term.ends_on, 'terms_ref', v_term.terms_ref),
    p_severity => 'notice'::public.audit_severity);

  return public.rpc_merchant_commission_read(m.id);
end;
$$;

comment on function public.rpc_merchant_commission_request(uuid, numeric, numeric, date, date, text, text) is
  'Asks for a commission agreed with one merchant (either rate blank stays on the preset), from today or later, with a reason. A second person approves it with rpc_merchant_commission_decide. Audited as merchant.commission_requested.';

/*
 * The second person: Finance, an Ops manager for the city or a super
 * admin, never the one who asked. Approving puts the term in force from
 * its start day (today, if that has passed while it waited).
 */
create or replace function public.rpc_merchant_commission_decide(
  p_term_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.merchant_commission_term;
  m public.merchant;
  v_me uuid := authz.staff_id();
  v_day date := (now() at time zone 'Africa/Nairobi')::date;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_before jsonb;
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'Approve or reject.' using errcode = '22023';
  end if;
  select * into t from public.merchant_commission_term where id = p_term_id for update;
  if t.id is null then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  select * into m from public.merchant where id = t.merchant_id;
  if not public.fn_merchant_commission_decider(m.city_id) then
    raise exception 'Approving a commission is Finance''s, an Ops manager''s or a super admin''s.'
      using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'That request is already %.', t.status using errcode = '22023';
  end if;
  if t.requested_by = v_me then
    raise exception 'You asked for this. Somebody else has to approve it.' using errcode = '42501';
  end if;
  if length(coalesce(v_note, '')) > 1000 then
    raise exception 'Keep the note under 1,000 characters.' using errcode = '22023';
  end if;

  v_before := public.fn_merchant_commission(m.id);

  if p_approve then
    if t.ends_on is not null and t.ends_on < v_day then
      raise exception 'Those dates have already passed. Reject it and ask again with new dates.'
        using errcode = '22023';
    end if;
    update public.merchant_commission_term
       set status = 'approved', starts_on = greatest(starts_on, v_day),
           decided_by = v_me, decided_at = clock_timestamp(), decision_note = v_note
     where id = t.id
    returning * into t;

    perform audit.log('staff'::public.actor_type, 'finance', 'merchant.commission_approved',
      p_actor_id => v_me,
      p_target_type => 'merchant', p_target_id => m.id,
      p_target_label => coalesce(m.trading_name, m.legal_name),
      p_city_id => m.city_id,
      p_reason => coalesce(v_note, t.reason),
      p_approved_by => v_me,
      p_before => jsonb_build_object('charged', v_before),
      p_after => jsonb_build_object('charged', public.fn_merchant_commission(m.id),
        'term_id', t.id, 'own_delivery_pct', t.own_delivery_pct,
        'nexg_delivery_pct', t.nexg_delivery_pct, 'starts_on', t.starts_on, 'ends_on', t.ends_on,
        'requested_by', t.requested_by),
      p_severity => 'high'::public.audit_severity);
  else
    update public.merchant_commission_term
       set status = 'rejected', decided_by = v_me, decided_at = clock_timestamp(), decision_note = v_note
     where id = t.id
    returning * into t;

    perform audit.log('staff'::public.actor_type, 'finance', 'merchant.commission_rejected',
      p_actor_id => v_me,
      p_target_type => 'merchant', p_target_id => m.id,
      p_target_label => coalesce(m.trading_name, m.legal_name),
      p_city_id => m.city_id,
      p_reason => v_note,
      p_before => jsonb_build_object('charged', v_before),
      p_after => jsonb_build_object('term_id', t.id, 'status', 'rejected'),
      p_severity => 'notice'::public.audit_severity);
  end if;

  return public.rpc_merchant_commission_read(m.id);
end;
$$;

comment on function public.rpc_merchant_commission_decide(uuid, boolean, text) is
  'Approves or rejects a waiting commission request. Finance, an Ops manager for the city or a super admin, never the requester. Audited as merchant.commission_approved / merchant.commission_rejected with the rate charged before and after.';

/* The requester (or a decider) takes back a request nobody has decided. */
create or replace function public.rpc_merchant_commission_withdraw(p_term_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.merchant_commission_term;
  m public.merchant;
  v_me uuid := authz.staff_id();
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  select * into t from public.merchant_commission_term where id = p_term_id for update;
  if t.id is null then
    raise exception 'No such request.' using errcode = 'P0002';
  end if;
  select * into m from public.merchant where id = t.merchant_id;
  if not (t.requested_by = v_me or public.fn_merchant_commission_decider(m.city_id)) then
    raise exception 'Only the person who asked, or someone who could approve it, can withdraw it.'
      using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'That request is already %.', t.status using errcode = '22023';
  end if;

  update public.merchant_commission_term
     set status = 'withdrawn', decided_by = v_me, decided_at = clock_timestamp()
   where id = t.id;

  perform audit.log('staff'::public.actor_type, 'finance', 'merchant.commission_withdrawn',
    p_actor_id => v_me,
    p_target_type => 'merchant', p_target_id => m.id,
    p_target_label => coalesce(m.trading_name, m.legal_name),
    p_city_id => m.city_id,
    p_before => jsonb_build_object('term_id', t.id, 'status', 'pending',
      'own_delivery_pct', t.own_delivery_pct, 'nexg_delivery_pct', t.nexg_delivery_pct),
    p_after => jsonb_build_object('term_id', t.id, 'status', 'withdrawn'),
    p_severity => 'info'::public.audit_severity);

  return public.rpc_merchant_commission_read(m.id);
end;
$$;

comment on function public.rpc_merchant_commission_withdraw(uuid) is
  'Withdraws a waiting commission request: the requester, or anyone who could have approved it. Audited as merchant.commission_withdrawn.';

revoke all on function public.rpc_merchant_commission_read(uuid),
  public.rpc_merchant_commission_request(uuid, numeric, numeric, date, date, text, text),
  public.rpc_merchant_commission_decide(uuid, boolean, text),
  public.rpc_merchant_commission_withdraw(uuid) from public, anon;
grant execute on function public.rpc_merchant_commission_read(uuid),
  public.rpc_merchant_commission_request(uuid, numeric, numeric, date, date, text, text),
  public.rpc_merchant_commission_decide(uuid, boolean, text),
  public.rpc_merchant_commission_withdraw(uuid) to authenticated, service_role;

insert into audit.action_registry
  (action, module, default_severity, needs_review, two_person, money, description)
values
  ('merchant.commission_requested', 'finance', 'notice', false, true, true,
   'Staff asked for a commission agreed with one merchant, overriding the preset; a second person decides'),
  ('merchant.commission_approved', 'finance', 'high', false, true, true,
   'A second person approved a merchant''s agreed commission; it is charged from its start day'),
  ('merchant.commission_rejected', 'finance', 'notice', false, true, true,
   'A merchant''s agreed commission request was rejected'),
  ('merchant.commission_withdrawn', 'finance', 'info', false, false, true,
   'A merchant''s agreed commission request was withdrawn before anyone decided it')
on conflict (action) do nothing;

-- ═══════════════════════════════════════ Finance: agreed against taken

/* As 20260101018100, with the agreed rate from the merchant's terms. */
create or replace view fin_merchant_take_v
with (security_invoker = true) as
with per_order as (
  select
    t.order_id,
    o.merchant_id,
    sum(e.credit - e.debit) filter (
      where a.base = 'revenue.commission') as commission_cents,
    sum(e.credit - e.debit) filter (
      where a.kind = 'revenue') as revenue_cents,
    sum(e.credit - e.debit) filter (
      where a.base = 'payable.merchant') as merchant_cents
  from ledger.entry e
  join ledger.transaction t on t.id = e.transaction_id
  join ledger.account a on a.code = e.account_code
  join public."order" o on o.id = t.order_id
  where t.order_id is not null
  group by t.order_id, o.merchant_id
)
select
  m.id as merchant_id,
  m.trading_name,
  m.commission_tier::text as commission_tier,
  public.fn_merchant_agreed_pct(m.id)::numeric(5, 2) as agreed_pct,
  count(*)::bigint as orders,
  coalesce(sum(po.commission_cents), 0)::bigint as commission_cents,
  coalesce(sum(po.revenue_cents), 0)::bigint as revenue_cents,
  coalesce(sum(po.merchant_cents), 0)::bigint as merchant_cents,
  case
    when coalesce(sum(po.merchant_cents), 0) + coalesce(sum(po.commission_cents), 0) > 0
      then round(
        coalesce(sum(po.commission_cents), 0)::numeric * 100
        / (sum(po.merchant_cents) + sum(po.commission_cents)), 2)
  end as effective_pct
from per_order po
join public.merchant m on m.id = po.merchant_id
group by m.id, m.trading_name, m.commission_tier
order by 6 desc;
