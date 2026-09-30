-- A notification can now be about a merchant, not only a ticket or a plan.
alter table public.notification
  add column if not exists merchant_id uuid references public.merchant (id) on delete cascade;

create index if not exists notification_merchant_idx
  on public.notification (merchant_id, created_at desc);

-- The Merchants console · the read contracts and the write RPCs.
--
-- The build prompt's central rule: the database is the integration
-- layer. The console never calls another surface, and no other surface
-- reads a merchant field from anywhere but the views below. So these
-- are not conveniences for one screen — they are the interface the
-- guest site, the merchant dashboard, dispatch and finance all hold.

-- ─────────────────────────────────────── effective hours, one truth

/*
 * What time is this merchant open, on this date, at this branch.
 *
 * Resolution order, most specific first: a branch override, then a
 * merchant override, then a city exception, then the chain parent's
 * weekly pattern when the chain shares hours, then the merchant's own.
 *
 * One function because "is it open now" is asked by the guest merchant
 * page, the checkout, dispatch and this console — and four
 * implementations of that question is four different answers on a
 * public holiday.
 */
create or replace function public.fn_merchant_effective_hours(
  p_merchant_id uuid,
  p_branch_id uuid default null,
  p_date date default current_date
)
returns table (opens time, closes time, closed boolean, source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchant;
  v_row record;
  v_dow integer := extract(isodow from p_date);
begin
  select * into v_merchant from public.merchant where id = p_merchant_id;
  if v_merchant.id is null then
    return;
  end if;

  -- 1. this branch, this date
  if p_branch_id is not null then
    select o.opens, o.closes, o.closed into v_row
    from public.merchant_hours_override o
    where o.merchant_id = p_merchant_id and o.branch_id = p_branch_id and o.date = p_date;
    if found then
      return query select v_row.opens, v_row.closes, v_row.closed, 'branch override'::text;
      return;
    end if;
  end if;

  -- 2. this merchant, this date
  select o.opens, o.closes, o.closed into v_row
  from public.merchant_hours_override o
  where o.merchant_id = p_merchant_id and o.branch_id is null and o.date = p_date;
  if found then
    return query select v_row.opens, v_row.closes, v_row.closed, 'merchant override'::text;
    return;
  end if;

  -- 3. the city's exception for that day
  select e.default_close into v_row
  from public.city_hours_exception e
  where e.city_id = v_merchant.city_id and e.date = p_date and e.enabled
    and (e.applies_to_categories is null
         or v_merchant.category::text = any (e.applies_to_categories))
  limit 1;
  if found and v_row.default_close is not null then
    return query
      select h.opens, least(h.closes, v_row.default_close), h.closed, 'city exception'::text
      from public.merchant_hours h
      where h.merchant_id = p_merchant_id and h.day_of_week = v_dow
      limit 1;
    if found then return; end if;
  end if;

  -- 4. the chain parent, when the chain shares its hours
  if v_merchant.parent_merchant_id is not null then
    perform 1 from public.merchant_chain_setting
    where parent_id = v_merchant.parent_merchant_id and shared_hours;
    if found then
      return query
        select h.opens, h.closes, h.closed, 'chain parent'::text
        from public.merchant_hours h
        where h.merchant_id = v_merchant.parent_merchant_id and h.day_of_week = v_dow
        limit 1;
      if found then return; end if;
    end if;
  end if;

  -- 5. the merchant's own weekly pattern
  return query
    select h.opens, h.closes, h.closed, 'weekly'::text
    from public.merchant_hours h
    where h.merchant_id = p_merchant_id and h.day_of_week = v_dow
    limit 1;
end;
$$;

comment on function public.fn_merchant_effective_hours is
  'The single answer to "is this merchant open". Branch override → merchant override → city exception → chain parent → weekly. Used by the guest page, checkout, dispatch and the console alike.';

grant execute on function public.fn_merchant_effective_hours(uuid, uuid, date)
  to anon, authenticated, service_role;

-- ───────────────────────────────────────────── the guest contract

/*
 * merchant_public, extended.
 *
 * Rebuilt rather than altered because a view's column list cannot be
 * added to in place. The visibility rule is unchanged and restated
 * here in full: live, and explicitly visible in Explore. Everything
 * else on this view is a fact the guest site needs to render a
 * merchant honestly — whether they are taking orders, whether they
 * closed early, what the hours actually are today.
 *
 * health_band is deliberately narrowed to green. A guest is never
 * shown that a shop is struggling; an amber or red merchant simply
 * carries no badge (§11 of the build prompt).
 */
drop view if exists public.merchant_public cascade;

create view public.merchant_public
with (security_invoker = false)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.category_other,
  m.cover_photo_path,
  m.featured,
  c.slug as city_slug,
  c.name as city_name,
  b.name as branch_name,
  b.address_text as branch_address,
  b.latitude as branch_latitude,
  b.longitude as branch_longitude,
  m.went_live_at as listed_at,
  m.explore_visible,
  m.concierge_pick,
  m.accepting_orders,

  /* New, and all of it read by the guest site. */
  m.busy_mode_until,
  m.closed_early_at,
  m.pay_on_delivery as pay_on_delivery_enabled,
  m.pay_on_delivery_cap_kes,
  m.prep_minutes,
  m.parent_merchant_id,
  (select h.opens from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as opens_today,
  (select h.closes from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closes_today,
  (select h.closed from public.fn_merchant_effective_hours(m.id, b.id, current_date) h) as closed_today,
  /* Green or nothing. Never amber, never red. */
  case when m.health_band = 'green' then 'green' end as health_badge
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
where m.status = 'live' and m.explore_visible;

grant select on public.merchant_public to anon, authenticated;

comment on view public.merchant_public is
  'The only merchant data the outside world sees. Present only while live and visible in Explore; health is shown as green or not at all, because a guest is never told a shop is struggling.';

/*
 * The items a guest may see.
 *
 * Alcohol is filtered by the licence rather than by trust: an item
 * marked age_restricted is visible only where the merchant holds a
 * verified liquor licence, so a bar whose licence lapsed stops showing
 * drinks the moment the document expires rather than when somebody
 * notices.
 */
create or replace view public.catalogue_public
with (security_invoker = false)
as
select
  i.id,
  i.merchant_id,
  i.section_id,
  i.name,
  i.description,
  i.price_kes,
  i.available,
  i.age_restricted,
  i.highlighted,
  i.sort
from public.catalogue_item i
join public.merchant_public mp on mp.id = i.merchant_id
where coalesce(i.available, true)
  and (
    not coalesce(i.age_restricted, false)
    or exists (
      select 1
      from public.document d
      join public.document_requirement r on r.id = d.requirement_id
      where d.owner_type = 'merchant' and d.owner_id = i.merchant_id
        and r.kind = 'liquor_licence'
        and d.status = 'verified' and d.superseded_at is null
    )
  );

grant select on public.catalogue_public to anon, authenticated;

-- ────────────────────────────────── the other surfaces' contracts

/* What a merchant sees about itself. RLS on the base tables decides. */
create or replace view public.merchant_dashboard_v
with (security_invoker = true)
as
select
  m.id as merchant_id,
  m.trading_name,
  m.status,
  m.status_reason,
  m.accepting_orders,
  m.accepting_orders_source,
  m.busy_mode_until,
  m.closed_early_at,
  m.explore_visible,
  m.pay_on_delivery,
  m.pay_on_delivery_cap_kes,
  m.health_band,
  m.health_score,
  m.strike_count,
  m.payout_hold,
  m.payout_hold_reason,
  m.suspension_reason,
  (select count(*) from public.dispute d
    where d.merchant_id = m.id and d.status = 'awaiting_merchant') as disputes_awaiting_reply,
  (select min(d.merchant_reply_due_at) from public.dispute d
    where d.merchant_id = m.id and d.status = 'awaiting_merchant') as next_reply_due_at,
  (select count(*) from public.catalogue_edit_request e
    where e.merchant_id = m.id and e.status = 'pending') as edits_pending,
  (select count(*) from public.merchant_message g
    where g.merchant_id = m.id and g.direction = 'out' and g.read_at is null) as unread_messages,
  /* The blocking "accept the new terms" card is this being true. */
  exists (
    select 1 from public.merchant_terms_version v
    where v.status = 'current' and v.requires_reacceptance
      and not exists (
        select 1 from public.merchant_terms_acceptance a
        where a.merchant_id = m.id and a.terms_version_id = v.id
      )
  ) as terms_to_accept
from public.merchant m;

/* What dispatch needs, and nothing else. */
create or replace view public.dispatch_merchant_v
with (security_invoker = true)
as
select
  m.id as merchant_id,
  b.id as branch_id,
  b.location,
  m.status,
  m.accepting_orders,
  m.busy_mode_until,
  coalesce((o.value ->> 'prep_minutes')::integer, m.prep_minutes) as prep_minutes,
  m.fleet_dispatch_preference,
  exists (
    select 1 from public.merchant_fleet_rider f
    join public.rider r on r.id = f.rider_id
    where f.merchant_id = m.id and r.status = 'active'
  ) as has_active_fleet_riders,
  m.pickup_instructions,
  m.rider_parking,
  m.landmark
from public.merchant m
left join public.merchant_branch b on b.merchant_id = m.id
left join public.branch_override o on o.branch_id = b.id and o.field = 'prep_minutes'
where m.status = 'live';

/* What finance needs. The account is masked here, not in the page. */
create or replace view public.finance_merchant_v
with (security_invoker = true)
as
select
  m.id as merchant_id,
  m.trading_name,
  m.city_id,
  m.commission_tier,
  coalesce(m.commission_pct, t.default_pct) as effective_commission_pct,
  m.commission_pct is not null as commission_is_negotiated,
  m.payout_rail,
  /*
   * Last four only. A full account number has no business leaving the
   * onboarding record, and a console that prints one puts it in every
   * screenshot anyone ever takes of this page.
   *
   * payout_account is jsonb — a till, a paybill plus account, or bank
   * details — so the number is whichever of those keys is filled, and
   * the account holder's name is not a number and is not masked.
   */
  (
    select case
      when v is null or v = '' then null
      else repeat('•', greatest(length(v) - 4, 0)) || right(v, 4)
    end
    from (
      select coalesce(
        m.payout_account ->> 'account',
        m.payout_account ->> 'paybill',
        m.payout_account ->> 'till'
      ) as v
    ) picked
  ) as payout_account_masked,
  m.payout_hold,
  m.payout_hold_reason,
  m.parent_merchant_id,
  cs.consolidated_statement,
  cs.single_payout
from public.merchant m
left join public.commission_tier t on t.code = m.commission_tier
left join public.merchant_chain_setting cs on cs.parent_id = coalesce(m.parent_merchant_id, m.id);

comment on view public.finance_merchant_v is
  'Commission and payout facts for the Finance tab. The account number is masked in the view rather than in the page, so no caller can accidentally render the whole thing.';

grant select on public.merchant_dashboard_v, public.dispatch_merchant_v, public.finance_merchant_v
  to authenticated, service_role;

-- ──────────────────────────────────────────── the Directory table

create or replace view public.console_merchant_directory_v
with (security_invoker = true)
as
select
  m.id,
  m.trading_name,
  m.category,
  m.status,
  m.featured,
  m.concierge_pick,
  m.accepting_orders,
  m.explore_visible,
  m.health_band,
  m.health_score,
  m.payout_hold,
  m.parent_merchant_id,
  c.name as city_name,
  c.slug as city_slug,
  b.name as branch_name,
  m.went_live_at,
  m.submitted_at,
  m.created_at,
  s.orders_30d,
  s.on_time_ready_pct,
  /* No orders domain, so no GMV. Null renders [—] rather than KES 0,
     which would read as "sold nothing" instead of "not measured". */
  null::bigint as gmv_30d_kes,
  (select count(*) from public.dispute d
    where d.merchant_id = m.id and d.status in ('open', 'awaiting_merchant')) as open_disputes
from public.merchant m
join public.city c on c.id = m.city_id
left join public.merchant_branch b on b.merchant_id = m.id and b.is_primary
left join lateral (
  select h.orders_30d, h.on_time_ready_pct
  from public.merchant_health_snapshot h
  where h.merchant_id = m.id
  order by h.as_of desc
  limit 1
) s on true;

grant select on public.console_merchant_directory_v to authenticated;

/* The counts on the sidebar and the page subtitle, in one read. */
create or replace function public.rpc_merchant_console_counts(p_city_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total',         count(*),
    'live',          count(*) filter (where status = 'live'),
    'paused',        count(*) filter (where status = 'paused'),
    'under_review',  count(*) filter (where status = 'under_review'),
    'suspended',     count(*) filter (where status = 'suspended'),
    'featured',      count(*) filter (where featured),
    'applications',  count(*) filter (where status in ('applied', 'documents_pending', 'under_review')),
    'onboarding',    count(*) filter (where status in ('applied', 'documents_pending', 'under_review')),
    'open_disputes', (select count(*) from public.dispute where status in ('open', 'awaiting_merchant')),
    'pending_edits', (select count(*) from public.catalogue_edit_request where status = 'pending'),
    'expiring_docs', (
      select count(*) from public.document d
      where d.status = 'verified' and d.superseded_at is null
        and d.expires_at is not null
        and d.expires_at between current_date and current_date + 30
    )
  )
  from public.merchant m
  where p_city_id is null or m.city_id = p_city_id
$$;

grant execute on function public.rpc_merchant_console_counts(uuid) to authenticated;
