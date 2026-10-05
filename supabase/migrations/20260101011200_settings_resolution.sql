-- Resolving a setting.
--
-- This is the hot path of the whole platform: every price quoted,
-- every dispatch round, every fee line on a statement comes through
-- `fn_get`. It has to be fast, and it has to be correct about time —
-- a change scheduled for tomorrow must not affect today's pricing,
-- and a statement written last month must still resolve to what it
-- was priced against.
--
-- Precedence, most specific first: zone → city+category → city →
-- category → global. The first scope that has a version effective at
-- the moment asked for wins, and the answer says which one it was,
-- because "where does this number come from" is the question the
-- console exists to answer.

create or replace function settings.fn_get(
  p_key text,
  p_scope_kind settings.scope_kind default 'global',
  p_city_id uuid default null,
  p_zone_id uuid default null,
  p_category text default null,
  p_at timestamptz default now()
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with candidates as (
    select
      v.value,
      v.id as version_id,
      v.scope_kind,
      v.effective_from,
      /* Most specific wins. The order of this CASE is the
         inheritance rule, written once. */
      case v.scope_kind
        when 'zone' then 1
        when 'city_category' then 2
        when 'city' then 3
        when 'category' then 4
        when 'global' then 5
      end as specificity
    from settings.version v
    where v.key = p_key
      and v.status in ('active', 'superseded')
      and v.effective_from <= p_at
      /* Superseded rows are kept so a past moment still resolves;
         one that was replaced before `p_at` is not the answer. */
      and (v.superseded_at is null or v.superseded_at > p_at)
      and (
        (v.scope_kind = 'global')
        or (v.scope_kind = 'category' and v.scope_category = p_category)
        or (v.scope_kind = 'city' and v.scope_city_id = p_city_id)
        or (v.scope_kind = 'city_category'
            and v.scope_city_id = p_city_id and v.scope_category = p_category)
        or (v.scope_kind = 'zone' and v.scope_zone_id = p_zone_id)
      )
    order by specificity, v.effective_from desc
    limit 1
  )
  select case
    when c.version_id is null then
      /* Nothing set anywhere. The definition's default is the last
         resort, and a null there is reported as a null — the console
         renders [—] and the reader refuses rather than guessing. */
      jsonb_build_object(
        'value', d.default_value,
        'version_id', null,
        'source', 'default',
        'source_label', 'registry default',
        'is_set', d.default_value is not null)
    else
      jsonb_build_object(
        'value', c.value,
        'version_id', c.version_id,
        'source', c.scope_kind,
        'source_label', case c.scope_kind
          when 'global' then 'global default'
          when 'city' then 'this city'
          when 'zone' then 'this zone'
          when 'category' then 'this category'
          when 'city_category' then 'this city and category'
        end,
        'effective_from', c.effective_from,
        'is_set', c.value is not null)
  end
  from settings.definition d
  left join candidates c on true
  where d.key = p_key

  union all

  /*
   * A key nobody registered. Without this branch the function
   * returns a bare NULL, which a reader cannot tell apart from "set,
   * but to nothing" — so a typo in a key name would quietly price at
   * null instead of failing where somebody would see it.
   */
  select jsonb_build_object(
    'value', null, 'version_id', null, 'source', 'unknown',
    'source_label', 'no such setting', 'is_set', false, 'unknown_key', true)
  where not exists (select 1 from settings.definition x where x.key = p_key)
$$;

comment on function settings.fn_get is
  'The one resolver. Returns the value, the version it came from and which scope won, because "where does this number come from" is the question the console exists to answer. A key with nothing set anywhere reports is_set false rather than a zero.';

/* The shapes callers actually want. */
create or replace function settings.fn_value(
  p_key text, p_city_id uuid default null,
  p_category text default null, p_at timestamptz default now()
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select settings.fn_get(
    p_key,
    case when p_city_id is not null and p_category is not null then 'city_category'
         when p_city_id is not null then 'city'
         when p_category is not null then 'category'
         else 'global' end::settings.scope_kind,
    p_city_id, null, p_category, p_at) -> 'value'
$$;

create or replace function settings.fn_int(
  p_key text, p_city_id uuid default null, p_category text default null)
returns bigint
language sql stable set search_path = ''
as $$ select nullif(settings.fn_value(p_key, p_city_id, p_category) #>> '{}', '')::bigint $$;

create or replace function settings.fn_num(
  p_key text, p_city_id uuid default null, p_category text default null)
returns numeric
language sql stable set search_path = ''
as $$ select nullif(settings.fn_value(p_key, p_city_id, p_category) #>> '{}', '')::numeric $$;

create or replace function settings.fn_bool(
  p_key text, p_city_id uuid default null, p_category text default null)
returns boolean
language sql stable set search_path = ''
as $$ select nullif(settings.fn_value(p_key, p_city_id, p_category) #>> '{}', '')::boolean $$;

create or replace function settings.fn_text(
  p_key text, p_city_id uuid default null, p_category text default null)
returns text
language sql stable set search_path = ''
as $$ select settings.fn_value(p_key, p_city_id, p_category) #>> '{}' $$;

/*
 * The whole resolved document for a city. Used by the daily
 * snapshot and by "Compare with Mombasa", and deliberately the same
 * function for both so the comparison cannot drift from what was
 * recorded.
 */
create or replace function settings.fn_resolve_all(
  p_city_id uuid, p_at timestamptz default now()
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(d.key, settings.fn_get(
    d.key,
    case when d.scope_kind = 'global' then 'global' else 'city' end::settings.scope_kind,
    case when d.scope_kind = 'global' then null else p_city_id end,
    null, null, p_at)), '{}'::jsonb)
  from settings.definition d
  where d.deprecated_at is null
    and d.scope_kind in ('global', 'city')
$$;

-- ══════════════════════════════════════ typed read views

/*
 * What other modules read. Each is the contract for one service, so
 * a change to the key names here is a change somebody has to notice
 * rather than a silent null arriving in a price.
 *
 * Every money column resolves to null when nothing is set. That is
 * the point: the order service must refuse to price rather than
 * charge a guest a number nobody agreed.
 */
create or replace view settings.city_v
with (security_invoker = true) as
select
  c.id as city_id,
  c.slug,
  c.name,
  c.status,
  c.currency,
  c.timezone,
  c.hours,
  c.late_night_from,
  c.max_radius_km,
  c.launched_at,
  c.city_manager_id,
  c.template_id,
  settings.fn_int('city.order_cutoff_min', c.id) as order_cutoff_min,
  settings.fn_text('city.outside_zone_behaviour', c.id) as outside_zone_behaviour,
  settings.fn_value('city.languages', c.id) as languages,
  settings.fn_text('city.holiday_calendar', c.id) as holiday_calendar,
  (select count(*) from public.zone z where z.city_id = c.id) as zones,
  (select count(*) from public.zone z where z.city_id = c.id and z.active) as zones_active,
  (select count(*) from public.zone z where z.city_id = c.id and z.tier = 'trial') as zones_trial,
  /* Appended rather than slotted in beside the other city columns:
     CREATE OR REPLACE VIEW cannot insert a column mid-list, and the
     error it gives ("cannot change name of view column") points at
     the wrong column entirely. */
  c.sort
from public.city c;

create or replace view settings.zone_v
with (security_invoker = true) as
select
  z.id as zone_id,
  z.city_id,
  z.name,
  z.tier,
  z.active as enabled,
  z.eta_min,
  z.eta_max,
  z.delivery_band,
  z.cod_allowed,
  z.polygon,
  z.trial_started_at,
  z.trial_reviewed_at,
  /* A pilot nobody reviews is a commitment nobody decided to make. */
  z.tier = 'trial'
    and z.trial_started_at is not null
    and z.trial_reviewed_at is null
    and z.trial_started_at < now() - interval '30 days' as trial_review_due
from public.zone z;

create or replace view settings.dispatch_v
with (security_invoker = true) as
select
  c.id as city_id,
  settings.fn_text('dispatch.selection', c.id) as selection,
  settings.fn_int('dispatch.accept_window_s', c.id) as accept_window_s,
  settings.fn_int('dispatch.rounds_before_boost', c.id) as rounds_before_boost,
  settings.fn_num('dispatch.search_radius_km', c.id) as search_radius_km,
  settings.fn_num('dispatch.radius_increment_km', c.id) as radius_increment_km,
  settings.fn_int('dispatch.boost_fee', c.id) as boost_fee,
  settings.fn_int('dispatch.escalate_min', c.id) as escalate_min,
  settings.fn_int('dispatch.rider_cash_cap', c.id) as rider_cash_cap,
  settings.fn_bool('dispatch.stacking', c.id) as stacking,
  c.max_radius_km
from public.city c;

create or replace view settings.settlement_v
with (security_invoker = true) as
select
  c.id as city_id,
  settings.fn_text('settlement.cycle', c.id) as cycle,
  settings.fn_text('settlement.cutoff', c.id) as cutoff,
  settings.fn_text('settlement.approvals', c.id) as approvals,
  settings.fn_bool('settlement.instant_cashout', c.id) as instant_cashout
from public.city c;

/*
 * Pricing, per city and category. The join against the category list
 * is a lateral over the registry rather than a hard-coded array, so
 * adding a merchant category is a settings change and not a
 * migration.
 */
create or replace view settings.pricing_v
with (security_invoker = true) as
select
  c.id as city_id,
  cat.category,
  settings.fn_num('fees.commission', c.id, cat.category) as commission_pct,
  settings.fn_int('fees.min_order', c.id, cat.category) as min_order,
  coalesce(settings.fn_bool('fees.featured_eligible', c.id, cat.category), false) as featured_eligible,
  settings.fn_text('fees.category_note', c.id, cat.category) as note,
  settings.fn_int('fees.delivery.band_1', c.id) as delivery_band_1,
  settings.fn_int('fees.delivery.band_2', c.id) as delivery_band_2,
  settings.fn_int('fees.delivery.band_3', c.id) as delivery_band_3,
  settings.fn_int('fees.night_surcharge', c.id) as night_surcharge,
  settings.fn_num('fees.service_pct', c.id) as service_pct,
  settings.fn_int('fees.concierge_flat', c.id) as concierge_flat,
  settings.fn_int('fees.small_basket_threshold', c.id) as small_basket_threshold,
  settings.fn_int('fees.small_basket_fee', c.id) as small_basket_fee,
  settings.fn_int('fees.cash_handling', c.id) as cash_handling,
  settings.fn_text('fees.host_credit_rule', c.id) as host_credit_rule
from public.city c
cross join lateral (
  select unnest(coalesce(
    (select array_agg(x) from jsonb_array_elements_text(
       settings.fn_value('fees.categories')) x),
    array['food_drinks', 'laundry_cleaning', 'flowers_gifts',
          'pharmacy', 'beauty_fashion', 'concierge_offplatform'])) as category
) cat;

create or replace view settings.payments_v
with (security_invoker = true) as
select
  m.key,
  m.label,
  m.provider,
  m.status,
  m.enabled,
  m.checkout_order,
  m.limits,
  m.health,
  m.note,
  m.disabled_reason,
  (m.health ->> 'success_24h_pct')::numeric as success_24h_pct,
  (m.health ->> 'callbacks_failed')::integer as callbacks_failed
from public.payment_method m
order by m.checkout_order;

create or replace view settings.integrations_v
with (security_invoker = true) as
select * from public.integration_v;

create or replace view settings.legal_v
with (security_invoker = true) as
select
  l.key, l.version, l.effective_from, l.status, l.pdf_path,
  l.requires_reacceptance_by, l.changelog, l.approved_at,
  a.display_name as approved_by_name,
  b.display_name as second_approver_name
from public.legal_document l
left join public.staff_user a on a.id = l.approved_by
left join public.staff_user b on b.id = l.second_approver_id;

/*
 * What the guest checkout renders. One line each — the footer on the
 * Fees tab ("no fee is hidden in the item price") is a rule this
 * view enforces by shape: there is no combined total column to
 * render instead.
 */
create or replace view public.fees_display_v
with (security_invoker = true) as
select
  c.id as city_id,
  c.slug as city_slug,
  c.currency,
  settings.fn_int('fees.delivery.band_1', c.id) as delivery_band_1,
  settings.fn_int('fees.delivery.band_2', c.id) as delivery_band_2,
  settings.fn_int('fees.delivery.band_3', c.id) as delivery_band_3,
  settings.fn_int('fees.night_surcharge', c.id) as night_surcharge,
  settings.fn_num('fees.service_pct', c.id) as service_pct,
  settings.fn_int('fees.concierge_flat', c.id) as concierge_flat,
  settings.fn_int('fees.small_basket_threshold', c.id) as small_basket_threshold,
  settings.fn_int('fees.small_basket_fee', c.id) as small_basket_fee,
  settings.fn_int('fees.cash_handling', c.id) as cash_handling,
  c.late_night_from
from public.city c
where c.status in ('live', 'soft_launch');

comment on view public.fees_display_v is
  'Every guest fee as its own column. There is deliberately no combined total: "no fee is hidden in the item price" is a rule, and a view with a single rolled-up number would be the easiest way to break it by accident.';

-- ═════════════════════════════════════════ console views

create or replace view settings.console_definition_v
with (security_invoker = true) as
select
  d.*,
  coalesce(p.pair, g.pair, 'single:ops_manager') as effective_pair
from settings.definition d
left join settings.approval_policy p on p.key = d.key
left join settings.approval_policy g on g."group" = d."group";

/* Every scheduled change, so the banner can say what is coming. */
create or replace view settings.console_scheduled_v
with (security_invoker = true) as
select
  cs.id as change_set_id,
  cs.title,
  cs."group",
  cs.city_id,
  c.name as city_name,
  cs.status,
  cs.effective_from,
  cs.immediate,
  cs.reason,
  cs.diff,
  cs.impact,
  cs.requested_by,
  req.display_name as requested_by_name,
  cs.requested_at,
  cs.approved_by,
  app.display_name as approved_by_name,
  cs.approved_at,
  (select count(*) from jsonb_object_keys(cs.diff)) as changes
from settings.change_set cs
left join public.city c on c.id = cs.city_id
left join public.staff_user req on req.id = cs.requested_by
left join public.staff_user app on app.id = cs.approved_by
where cs.status in ('draft', 'awaiting_approval', 'approved', 'scheduled');

grant execute on function settings.fn_get(text, settings.scope_kind, uuid, uuid, text, timestamptz) to authenticated, service_role;
grant execute on function settings.fn_value(text, uuid, text, timestamptz) to authenticated, service_role;
grant execute on function settings.fn_int(text, uuid, text) to authenticated, service_role;
grant execute on function settings.fn_num(text, uuid, text) to authenticated, service_role;
grant execute on function settings.fn_bool(text, uuid, text) to authenticated, service_role;
grant execute on function settings.fn_text(text, uuid, text) to authenticated, service_role;
grant execute on function settings.fn_resolve_all(uuid, timestamptz) to authenticated, service_role;

grant select on
  settings.city_v, settings.zone_v, settings.dispatch_v, settings.settlement_v,
  settings.pricing_v, settings.payments_v, settings.integrations_v, settings.legal_v,
  settings.console_definition_v, settings.console_scheduled_v
  to authenticated;

grant select on public.fees_display_v to anon, authenticated;
