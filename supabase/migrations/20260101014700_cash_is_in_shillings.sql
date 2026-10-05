-- Rider cash is kept in shillings, and the cascade was reading it
-- as cents.
--
-- `rider.cash_on_hand` and `rider.cash_cap` are whole shillings —
-- the rider console renders them raw, and the rate card either
-- side of them is in shillings too. `public.order.total_cents` is
-- cents. `dispatch.fn_candidates` added one to the other:
--
--   cash_on_hand (1,400 shillings) + total_cents (151,000)
--     > cash_cap (20,000 shillings)
--
-- which is true for any order above about two hundred shillings.
-- So every rider was being excluded from every cash-on-delivery
-- job with the reason "this order puts them over their cash cap",
-- and the reason read plausibly enough that nobody would have
-- questioned it — a cascade that quietly refuses to dispatch cash
-- orders and explains itself convincingly each time.
--
-- Caught by a seeded rider showing "KES 140,000" on their own
-- dashboard, which is the same mistake read from the other end.
--
-- The fix converts at the boundary rather than renaming the
-- columns: the order side of this system is in cents throughout
-- and the partner side is in shillings throughout, and the place
-- to reconcile that is where they meet.

create or replace function dispatch.fn_riders_live(p_city_id uuid)
returns table (
  rider_id uuid,
  name text,
  phone text,
  vehicle text,
  plate_no text,
  presence text,
  presence_since timestamptz,
  point extensions.geography,
  last_seen_at timestamptz,
  zone_id uuid,
  zone_name text,
  current_order_reference text,
  cash_on_hand_cents bigint,
  cash_cap_cents bigint,
  offers_paused boolean,
  offers_paused_reason text,
  cooldown_until timestamptz,
  cooldown_reason text,
  alcohol_eligible boolean,
  large_items_eligible boolean,
  max_km integer,
  health_band text,
  top_decile boolean
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    r.id,
    nullif(trim(coalesce(r.first_name, '') || ' ' || coalesce(r.last_name, '')), ''),
    r.phone,
    r.vehicle::text,
    r.plate_no,
    r.presence::text,
    r.presence_changed_at,
    r.last_location,
    coalesce(r.last_location_at, r.last_seen_at),
    z.id,
    z.name,
    r.current_order_reference,
    /* Shillings on the rider record, cents everywhere an order is
       involved. Converted here, once. */
    r.cash_on_hand * 100,
    coalesce(r.cash_cap, settings.fn_int('dispatch.rider_cash_cap', r.city_id)) * 100,
    not coalesce(r.can_receive_offers, true),
    r.offers_paused_reason,
    r.cooldown_until,
    r.cooldown_reason,
    coalesce(r.alcohol_eligible, false),
    coalesce(r.large_items_eligible, false),
    r.bike_max_km,
    r.health_band::text,
    coalesce(r.top_decile, false)
  from public.rider r
  left join public.zone z
    on z.city_id = r.city_id
   and r.last_location is not null
   and extensions.st_intersects(z.polygon, r.last_location)
  where r.city_id = p_city_id
    and r.status = 'active'
    and r.offboarded_at is null
    and authz.works_live_ops(p_city_id)
$fn$;

comment on function dispatch.fn_riders_live is
  'A rider, right now, read from the rider record rather than a copy of it. Cash is converted to cents here because the order side of the system counts in cents and the partner side counts in shillings — mixing them silently excluded every rider from every cash job.';

-- ════════════════════════ a rider can see where to collect from

/*
 * A rider carrying a job could not read the merchant's name.
 *
 * `rider_jobs_v` is invoker-rights, as it should be, and nothing
 * gave a rider any reach into `public.merchant` or
 * `public.merchant_branch`. So the merchant and the pickup address
 * came back null and the trip read "[—] → [Guest house] · Karen".
 *
 * Scoped to the job: a rider sees the merchant on an order that is
 * theirs, and no others. The whole directory is not theirs to
 * browse, and a policy that gave them every live merchant would be
 * a supplier list anybody who signs up as a rider could export.
 */
create policy merchant_read_rider_on_a_job on public.merchant
  for select to authenticated
  using (
    exists (
      select 1 from public.order o
       where o.merchant_id = merchant.id
         and o.rider_id is not null
         and authz.is_rider_self(o.rider_id)
    )
  );

create policy merchant_branch_read_rider_on_a_job on public.merchant_branch
  for select to authenticated
  using (
    exists (
      select 1 from public.order o
       where o.branch_id = merchant_branch.id
         and o.rider_id is not null
         and authz.is_rider_self(o.rider_id)
    )
  );

comment on policy merchant_read_rider_on_a_job on public.merchant is
  'A rider sees the merchant on a job that is theirs, and no others. The directory is not theirs to browse.';
