-- The orders domain.
--
-- Every module built so far has a hole shaped like this table. The
-- Money trail shows [—] because it cannot count orders. QR
-- attribution records a reference and has nothing to point it at.
-- Featured performance cannot say whether a sponsored card earned
-- anything. The merchant console shows `null::integer as orders_30d`
-- with a comment saying the domain is not built.
--
-- The Live operations prompt describes all of this as "extensions to
-- `order` from the front-door build". There is no `order` table and
-- no `services/` directory; what it calls an extension is a
-- creation. Better to say so and build the thing than to bolt a
-- dispatch map onto nothing.
--
-- Two decisions worth stating because everything downstream depends
-- on them:
--
--   * The reference is the identity people use. `order_reference
--     text` already appears in support tickets, cash events and QR
--     attribution, so the column here matches rather than
--     introducing a uuid nobody can read down a phone.
--   * What a guest was charged is frozen on the row. Fees move; an
--     order priced in March must still explain itself in June, so
--     the money columns are stored values and `pricing_version_ids`
--     records which settings produced them.

create type public.order_stage as enum (
  'placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving',
  'delivered', 'cancelled', 'disputed', 'refunded');

create type public.order_channel as enum (
  'web', 'qr', 'qr_return', 'desk', 'concierge', 'api', 'manual');

create type public.order_payment_method as enum (
  'mpesa_stk', 'card', 'charge_to_room', 'cash_on_delivery', 'on_account');

create type public.order_payment_status as enum (
  'pending', 'authorised', 'paid', 'collected', 'failed', 'refunded', 'partially_refunded');

create type public.handoff_target as enum (
  'guest', 'askari', 'reception', 'lockbox', 'caretaker');

-- ════════════════════════════════════════════════ the order

create table public.order (
  id uuid primary key default gen_random_uuid(),
  /* What a person reads out. Every other module already keys on
     this string, so it is the column rather than a second id. */
  reference text not null unique,

  guest_id uuid references public.guest (id) on delete set null,
  merchant_id uuid not null references public.merchant (id) on delete restrict,
  branch_id uuid references public.merchant_branch (id) on delete set null,
  city_id uuid not null references public.city (id) on delete restrict,
  zone_id uuid references public.zone (id) on delete set null,

  channel public.order_channel not null default 'web',
  created_by_staff_id uuid references public.staff_user (id) on delete set null,

  /* Where it came from, when it came from a card. The QR build
     already attributes by reference; these make the join cheap. */
  qr_scan_id bigint,
  property_qr_id uuid references public.property_qr (id) on delete set null,
  /* {owner_type, owner_id, label} — frozen, because a unit can be
     renamed and the order still has to say where it went. */
  delivery_context jsonb,

  dropoff_label text not null,
  dropoff_point geography(point, 4326),
  dropoff_note text,

  stage public.order_stage not null default 'placed',
  payment_method public.order_payment_method not null,
  payment_status public.order_payment_status not null default 'pending',

  /*
   * Money, in cents, frozen. Recomputing a March order with June's
   * fees is how a statement stops reconciling.
   */
  subtotal_cents bigint not null default 0,
  delivery_fee_cents bigint not null default 0,
  service_fee_cents bigint not null default 0,
  small_basket_fee_cents bigint not null default 0,
  night_surcharge_cents bigint not null default 0,
  concierge_fee_cents bigint not null default 0,
  cash_handling_cents bigint not null default 0,
  tip_cents bigint not null default 0,
  total_cents bigint not null default 0,
  commission_cents bigint,
  commission_pct numeric(5,2),
  currency text not null default 'KES',
  /* Which settings versions produced the figures above. */
  pricing_version_ids jsonb not null default '{}'::jsonb,

  promised_ready_at timestamptz,
  promised_delivery_at timestamptz,
  eta_at timestamptz,
  delay_notified_at timestamptz,
  delay_minutes_total integer not null default 0,
  guest_contact_attempts integer not null default 0,
  guest_unreachable boolean not null default false,
  scheduled_for timestamptz,

  rider_id uuid references public.rider (id) on delete set null,
  handed_to public.handoff_target,
  handoff_photo_path text,
  handoff_code_verified boolean,
  items_checked jsonb,

  placed_at timestamptz not null default now(),
  confirmed_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason_code text,
  cancel_note text,
  cancelled_by uuid references public.staff_user (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint order_cancel_has_a_reason check (
    stage <> 'cancelled' or coalesce(trim(cancel_reason_code), '') <> ''),
  constraint order_delivered_says_who_took_it check (
    stage <> 'delivered' or handed_to is not null),
  constraint order_total_is_the_sum check (
    total_cents = subtotal_cents + delivery_fee_cents + service_fee_cents
      + small_basket_fee_cents + night_surcharge_cents + concierge_fee_cents
      + cash_handling_cents + tip_cents)
);

comment on constraint order_total_is_the_sum on public.order is
  'The total is the sum of its lines, enforced. "No fee is hidden in the item price" is a rule on the Fees tab; this is the same rule where it cannot be worked around.';

comment on column public.order.pricing_version_ids is
  'Which settings versions produced the money on this row. Recomputing a March order with June fees is how a statement stops reconciling, so the figures are frozen and this says what produced them.';

create index order_live_idx on public.order (city_id, stage, placed_at desc)
  where stage not in ('delivered', 'cancelled', 'refunded');
create index order_merchant_idx on public.order (merchant_id, placed_at desc);
create index order_rider_idx on public.order (rider_id, placed_at desc);
create index order_guest_idx on public.order (guest_id, placed_at desc);
create index order_reference_idx on public.order (reference);
create index order_scheduled_idx on public.order (scheduled_for)
  where scheduled_for is not null and stage = 'placed';

create table public.order_item (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  catalogue_item_id uuid references public.catalogue_item (id) on delete set null,
  /* The name and price as they were, not as they are. A merchant
     renaming a dish must not rewrite what somebody bought. */
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null,
  line_total_cents bigint not null,
  note text,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);

create index order_item_order_idx on public.order_item (order_id);

-- ══════════════════════════════════════════ the timeline

create table public.order_event (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.order (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null,
  /* The line as it reads in the console. Written at the time, so a
     merchant renaming itself does not rewrite history. */
  title text not null,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  actor_type public.actor_type not null default 'system',
  actor_id uuid,
  actor_label text,
  photo_path text
);

create index order_event_idx on public.order_event (order_id, at);

comment on table public.order_event is
  'The timeline. Each line carries the words it should read as, written at the time — a merchant renaming itself must not rewrite what happened in March.';

create table public.order_adjustment (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete cascade,
  kind text not null check (kind in (
    'item_removed', 'item_added', 'quantity', 'price_override',
    'fee_waived', 'tip_added')),
  before jsonb,
  after jsonb,
  delta_cents bigint not null,
  reason text not null,
  actor_id uuid references public.staff_user (id) on delete set null,
  requires_merchant_ack boolean not null default false,
  merchant_acked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint adjustment_has_a_reason check (coalesce(trim(reason), '') <> '')
);

create table public.refund (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete restrict,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('original', 'wallet_credit', 'mpesa_b2c')),
  reason_code text not null,
  reason_text text not null,
  requested_by uuid references public.staff_user (id) on delete set null,
  approved_by uuid references public.staff_user (id) on delete set null,
  status text not null default 'requested'
    check (status in ('requested', 'awaiting_approval', 'approved', 'issued', 'failed', 'rejected')),
  provider_ref text,
  rejected_reason text,
  requested_at timestamptz not null default now(),
  issued_at timestamptz,

  constraint refund_has_a_reason check (coalesce(trim(reason_text), '') <> ''),
  /* The second person is a different person, checked by id. */
  constraint refund_approval_is_two_people check (
    approved_by is null or requested_by is null or approved_by <> requested_by)
);

create index refund_order_idx on public.refund (order_id);
create index refund_pending_idx on public.refund (status) where status = 'awaiting_approval';

-- ══════════════════════════════════ a readable reference

/*
 * NX-251005-0042: the day and a counter within it. Short enough to
 * read down a phone, sortable, and it tells a dispatcher when the
 * order was placed without a lookup.
 */
create sequence if not exists public.order_reference_seq;

create or replace function public.fn_order_reference()
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_day text := to_char(now() at time zone 'Africa/Nairobi', 'YYMMDD');
  v_n bigint;
begin
  select nextval('public.order_reference_seq') into v_n;
  return 'NX-' || v_day || '-' || lpad(((v_n % 10000))::text, 4, '0');
end;
$$;

-- ═════════════════════════════ what the order costs

/*
 * Pricing, from Settings and nowhere else.
 *
 * Returns the fee lines and the version ids that produced them, so
 * the caller stores both. A fee that is not set resolves to null —
 * and a null fee stops the order rather than defaulting to zero,
 * because a guest charged nothing for delivery is a rider paid
 * nothing for it.
 */
create or replace function public.fn_price_order(
  p_city_id uuid,
  p_category text,
  p_subtotal_cents bigint,
  p_band smallint default 1,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb := '{}'::jsonb;
  v_delivery bigint;
  v_service numeric;
  v_threshold bigint;
  v_small bigint;
  v_cash bigint;
  v_commission numeric;
  v_missing text[] := '{}';
  v_key text;
begin
  v_key := 'fees.delivery.band_' || greatest(1, least(3, coalesce(p_band, 1)));
  v_delivery := settings.fn_int(v_key, p_city_id);
  v_service := settings.fn_num('fees.service_pct', p_city_id);
  v_threshold := settings.fn_int('fees.small_basket_threshold', p_city_id);
  v_small := settings.fn_int('fees.small_basket_fee', p_city_id);
  v_cash := coalesce(settings.fn_int('fees.cash_handling', p_city_id), 0);
  v_commission := settings.fn_num('fees.commission', p_city_id, p_category);

  /* The casts matter: `text[] || 'literal'` resolves to array-||-array
     and fails on a bare string, which is a runtime error nothing
     catches until somebody tries to price an order. */
  if v_delivery is null then v_missing := v_missing || v_key; end if;
  if v_service is null then v_missing := v_missing || 'fees.service_pct'::text; end if;
  if v_commission is null then v_missing := v_missing || 'fees.commission'::text; end if;

  if array_length(v_missing, 1) > 0 then
    return jsonb_build_object(
      'ok', false,
      'missing', to_jsonb(v_missing),
      'message', 'This city has no published price for '
        || array_to_string(v_missing, ', ')
        || '. An order cannot be priced against a fee nobody agreed.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'subtotal_cents', p_subtotal_cents,
    'delivery_fee_cents', v_delivery,
    'service_fee_cents', round(p_subtotal_cents * v_service / 100.0),
    'small_basket_fee_cents',
      case when v_threshold is not null and v_small is not null
                and p_subtotal_cents < v_threshold
           then v_small else 0 end,
    'cash_handling_cents', v_cash,
    'commission_pct', v_commission,
    'commission_cents', round(p_subtotal_cents * v_commission / 100.0),
    /* The version of every figure above, so the order can explain
       itself after the rate card moves. */
    'pricing_version_ids', jsonb_build_object(
      'delivery', settings.fn_get(v_key, 'city', p_city_id, null, null, p_at) ->> 'version_id',
      'service', settings.fn_get('fees.service_pct', 'city', p_city_id, null, null, p_at) ->> 'version_id',
      'commission', settings.fn_get('fees.commission', 'city_category', p_city_id, null, p_category, p_at) ->> 'version_id'));
end;
$$;

comment on function public.fn_price_order is
  'The only place an order is priced. A fee nobody has set resolves to null and stops the order rather than defaulting to zero — a guest charged nothing for delivery is a rider paid nothing for it.';

-- ═══════════════════════════════════════════════════ RLS

alter table public.order enable row level security;
alter table public.order_item enable row level security;
alter table public.order_event enable row level security;
alter table public.order_adjustment enable row level security;
alter table public.refund enable row level security;

revoke all on public.order, public.order_item, public.order_event,
  public.order_adjustment, public.refund from anon, authenticated;
grant select on public.order, public.order_item, public.order_event,
  public.order_adjustment, public.refund to authenticated;

/*
 * Staff see their cities. A merchant sees their own orders and a
 * rider sees the ones they carried — both already have helpers for
 * that, and reusing them is what keeps one answer to "whose order is
 * this".
 */
create policy order_read on public.order
  for select to authenticated
  using (
    authz.works_merchant(merchant_id)
    or (rider_id is not null and authz.is_rider_self(rider_id))
    or authz.can_manage_merchants(city_id)
    or authz.can_manage_riders(city_id)
    or authz.reaches_module('orders')
    or authz.reaches_module('live_ops'));

create policy order_item_read on public.order_item
  for select to authenticated
  using (exists (select 1 from public.order o where o.id = order_item.order_id));

create policy order_event_read on public.order_event
  for select to authenticated
  using (exists (select 1 from public.order o where o.id = order_event.order_id));

create policy order_adjustment_read on public.order_adjustment
  for select to authenticated
  using (exists (select 1 from public.order o where o.id = order_adjustment.order_id));

/* Refunds are money. Finance and the people who can act on the
   order's city, and nobody else. */
create policy refund_read on public.refund
  for select to authenticated
  using (
    authz.reaches_module('finance')
    or exists (select 1 from public.order o
               where o.id = refund.order_id and authz.can_manage_merchants(o.city_id)));

/*
 * Not one insert, update or delete policy. Orders move through
 * states that have rules — a rider cannot mark their own delivery
 * paid, a merchant cannot cancel after pickup — and those rules
 * live in RPCs.
 */

create trigger order_set_updated_at before update on public.order
  for each row execute function public.tg_set_updated_at();

grant execute on function public.fn_price_order(uuid, text, bigint, smallint, timestamptz)
  to authenticated, service_role;
grant execute on function public.fn_order_reference() to service_role;
