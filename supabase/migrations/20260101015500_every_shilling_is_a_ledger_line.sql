-- The money paths start writing to the ledger.
--
-- A ledger nothing posts to is a decoration. These are the
-- places money already moves in this system — a payment
-- settling, a refund issuing, a rider earning, cash changing
-- hands — rewired so that each one leaves a balanced pair of
-- entries behind it.
--
-- The arithmetic of an order, once, here:
--
--   total = (subtotal − commission)   → owed to the merchant
--         + commission                → ours
--         + delivery + service + small basket
--           + night + concierge + cash handling
--                                     → ours
--         + tip                       → the rider's, passed through
--
-- which is exactly `order_total_is_the_sum` rearranged, so the
-- posting balances for the same reason the order does. Rider pay
-- is a separate transaction, because it is a cost we incur
-- rather than a split of what the guest paid — and keeping them
-- apart is what makes delivery margin a number anybody can see.

create or replace function ledger.fn_sale_entries(o public.order, p_cash_account text default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_array(
    /* Where the money landed. */
    jsonb_build_object(
      'account', coalesce(p_cash_account, case o.payment_method
        when 'card' then 'cash.card_processor_receivable'
        when 'mpesa_stk' then 'cash.mpesa_paybill'
        when 'charge_to_room' then 'receivable.hotel'
        when 'on_account' then 'receivable.guest_on_account'
        else 'cash.mpesa_paybill' end),
      'debit', o.total_cents,
      'memo', o.reference),

    jsonb_build_object('account', 'payable.merchant', 'party_type', 'merchant',
      'party_id', o.merchant_id,
      'credit', o.subtotal_cents - coalesce(o.commission_cents, 0),
      'memo', 'items less commission'),

    jsonb_build_object('account', 'revenue.commission', 'credit', coalesce(o.commission_cents, 0)),
    jsonb_build_object('account', 'revenue.delivery_fee', 'credit', o.delivery_fee_cents),
    jsonb_build_object('account', 'revenue.service_fee', 'credit', o.service_fee_cents),
    jsonb_build_object('account', 'revenue.small_basket', 'credit', o.small_basket_fee_cents),
    jsonb_build_object('account', 'revenue.night_surcharge', 'credit', o.night_surcharge_cents),
    jsonb_build_object('account', 'revenue.concierge_fee', 'credit', o.concierge_fee_cents),
    jsonb_build_object('account', 'revenue.cash_handling', 'credit', o.cash_handling_cents),

    /* A tip is the rider's. It passes through us and is never
       ours, so it never touches a revenue account. */
    jsonb_build_object('account', 'payable.rider', 'party_type', 'rider',
      'party_id', o.rider_id, 'credit',
      case when o.rider_id is null then 0 else o.tip_cents end,
      'memo', 'tip'))
$$;

comment on function ledger.fn_sale_entries is
  'One order, split the way the money actually divides. It balances for the same reason `order_total_is_the_sum` does — this is that constraint rearranged.';

/*
 * The sale.
 *
 * Posted when the money is actually ours to split: on settlement
 * for anything paid online, on delivery for cash. Idempotent per
 * order, so a replayed webhook and a re-marked delivery produce
 * one transaction.
 */
create or replace function ledger.fn_post_sale(
  p_order_id uuid,
  p_cash_account text default null,
  p_effective_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.order;
  v_tip_orphan bigint;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;

  /*
   * A tip with no rider has nowhere to go. It would unbalance
   * the posting, and quietly dropping it would mean the guest
   * paid for something nobody received — so it is held as an
   * unapplied receipt until a rider is assigned.
   */
  v_tip_orphan := case when o.rider_id is null then o.tip_cents else 0 end;

  return ledger.post(
    p_kind => 'order_sale_recognised',
    p_idempotency_key => 'sale:' || p_order_id::text,
    p_entries => ledger.fn_sale_entries(o, p_cash_account)
      || case when v_tip_orphan > 0
              then jsonb_build_array(jsonb_build_object(
                     'account', 'unapplied_receipts', 'credit', v_tip_orphan,
                     'memo', 'tip with no rider yet'))
              else '[]'::jsonb end,
    p_effective_at => coalesce(o.delivered_at, o.placed_at, p_effective_at),
    p_order_id => p_order_id,
    p_city_id => o.city_id,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'sale',
    p_related => jsonb_build_object('reference', o.reference,
                                    'payment_method', o.payment_method));
end;
$$;

/*
 * What the delivery cost us.
 *
 * Separate from the sale on purpose. Delivery margin is the
 * guest's delivery fee less this, and a single transaction that
 * netted them would make that number impossible to see.
 */
create or replace function ledger.fn_post_rider_pay(
  p_order_id uuid,
  p_pay_cents bigint,
  p_bonus_cents bigint default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare o public.order;
begin
  select * into o from public.order where id = p_order_id;
  if not found then raise exception 'No such order.'; end if;
  if o.rider_id is null then
    raise exception 'That order has no rider, so there is nobody to pay.';
  end if;
  if coalesce(p_pay_cents, 0) + coalesce(p_bonus_cents, 0) <= 0 then
    raise exception 'Nothing to post.';
  end if;

  return ledger.post(
    p_kind => 'rider_pay_recognised',
    p_idempotency_key => 'rider_pay:' || p_order_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'expense.rider_pay', 'debit', coalesce(p_pay_cents, 0)),
      jsonb_build_object('account', 'expense.rider_bonus', 'debit', coalesce(p_bonus_cents, 0)),
      jsonb_build_object('account', 'payable.rider', 'party_type', 'rider',
        'party_id', o.rider_id,
        'credit', coalesce(p_pay_cents, 0) + coalesce(p_bonus_cents, 0),
        'memo', o.reference)),
    p_effective_at => coalesce(o.delivered_at, now()),
    p_order_id => p_order_id,
    p_city_id => o.city_id,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'rider_pay');
end;
$$;

/*
 * Cash a rider is carrying becomes ours when they bank it.
 *
 * Until then it sits on their own asset account, which is what
 * makes the cash cap a real number rather than a guess, and what
 * the Friday run nets against.
 */
create or replace function ledger.fn_post_cash_deposited(
  p_rider_id uuid, p_amount_cents bigint, p_reference text, p_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_amount_cents, 0) <= 0 then raise exception 'Nothing to deposit.'; end if;

  return ledger.post(
    p_kind => 'cash_deposited',
    p_idempotency_key => 'cash_deposit:' || p_reference,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', p_amount_cents,
                         'memo', p_reference),
      jsonb_build_object('account', 'cash.rider_on_hand', 'party_type', 'rider',
                         'party_id', p_rider_id, 'credit', p_amount_cents)),
    p_effective_at => p_at,
    p_actor_kind => 'rider',
    p_actor_id => p_rider_id,
    p_reason_code => 'cash_deposit');
end;
$$;

-- ════════════════════════════════════ refunds, in two steps

/*
 * Approved, and then sent. Two transactions because they are two
 * events: the first creates an obligation, the second discharges
 * it. Collapsing them would make "approved but not yet out of
 * the account" — which is most of them, most of the time —
 * invisible.
 */
create or replace function ledger.fn_post_refund_approved(p_refund_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  o public.order;
begin
  select * into r from public.refund where id = p_refund_id;
  if not found then raise exception 'No such refund.'; end if;
  select * into o from public.order where id = r.order_id;

  return ledger.post(
    p_kind => 'refund_approved',
    p_idempotency_key => 'refund_approved:' || p_refund_id::text,
    p_entries => jsonb_build_array(
      /* Taken back out of what we recognised. A refund reduces
         revenue; it is not an expense. */
      jsonb_build_object('account', 'revenue.commission', 'debit', r.amount_cents,
                         'memo', 'refund · ' || r.reason_code),
      jsonb_build_object('account', 'refunds_pending', 'credit', r.amount_cents,
                         'memo', o.reference)),
    p_effective_at => r.requested_at,
    p_order_id => r.order_id,
    p_city_id => o.city_id,
    p_actor_kind => 'staff',
    p_actor_id => r.requested_by,
    p_reason_code => r.reason_code,
    p_reason_text => r.reason_text,
    p_related => jsonb_build_object('refund_id', p_refund_id));
end;
$$;

create or replace function ledger.fn_post_refund_issued(p_refund_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.refund;
  o public.order;
begin
  select * into r from public.refund where id = p_refund_id;
  if not found then raise exception 'No such refund.'; end if;
  select * into o from public.order where id = r.order_id;

  return ledger.post(
    p_kind => 'refund_executed',
    p_idempotency_key => 'refund_issued:' || p_refund_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'refunds_pending', 'debit', r.amount_cents),
      jsonb_build_object('account',
        case r.method when 'wallet_credit' then 'guest_wallet'
                      else 'cash.mpesa_paybill' end,
        'party_type', case when r.method = 'wallet_credit' then 'guest' end,
        'party_id', case when r.method = 'wallet_credit' then o.guest_id end,
        'credit', r.amount_cents,
        'memo', coalesce(r.provider_ref, r.method))),
    p_effective_at => coalesce(r.issued_at, now()),
    p_order_id => r.order_id,
    p_city_id => o.city_id,
    p_actor_kind => 'system',
    p_actor_label => '[System] · payments',
    p_reason_code => r.reason_code,
    p_related => jsonb_build_object('refund_id', p_refund_id,
                                    'provider_ref', r.provider_ref));
end;
$$;

-- ══════════════════════════════ hooking it to what exists

/*
 * These are the joins to the rest of the system. Each is a
 * trigger rather than a call added to every RPC, because the
 * thing that must never happen is money moving on a path
 * somebody forgot to wire.
 */
create or replace function public.tg_order_posts_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /* The sale is recognised when the money is ours to split:
     on settlement for anything paid online, on delivery for
     cash. */
  if new.payment_status in ('paid', 'collected')
     and (old is null or old.payment_status is distinct from new.payment_status) then
    perform ledger.fn_post_sale(
      new.id,
      case when new.payment_method = 'cash_on_delivery'
           then ledger.fn_account('cash.rider_on_hand', 'rider', new.rider_id) end);
  end if;

  return new;
end;
$$;

create trigger order_posts_to_ledger
  after insert or update of payment_status on public.order
  for each row execute function public.tg_order_posts_to_ledger();

create or replace function public.tg_refund_posts_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and (old is null or old.status is distinct from 'approved') then
    perform ledger.fn_post_refund_approved(new.id);
  elsif new.status = 'issued' and (old is null or old.status is distinct from 'issued') then
    perform ledger.fn_post_refund_issued(new.id);
  end if;
  return new;
end;
$$;

create trigger refund_posts_to_ledger
  after insert or update of status on public.refund
  for each row execute function public.tg_refund_posts_to_ledger();

/*
 * Rider earnings are kept in whole shillings on their own table.
 * This is the one place that converts, and the reason
 * `ledger.from_kes` exists.
 */
create or replace function public.tg_rider_earning_posts_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_order uuid;
begin
  if new.is_test then return new; end if;

  select id into v_order from public.order where reference = new.order_reference;
  if v_order is null then return new; end if;

  perform ledger.fn_post_rider_pay(
    v_order,
    ledger.from_kes(new.total_kes - coalesce(new.tip_kes, 0)
                    - coalesce(new.pickup_bonus_kes, 0) - coalesce(new.peak_bonus_kes, 0)),
    ledger.from_kes(coalesce(new.pickup_bonus_kes, 0) + coalesce(new.peak_bonus_kes, 0)));

  return new;
end;
$$;

create trigger rider_earning_posts_to_ledger
  after insert on public.rider_earning
  for each row execute function public.tg_rider_earning_posts_to_ledger();

-- ══════════════════════════════════ what an order's money is

/*
 * One order, one money story. Derived, never stored — so the
 * guest page, the merchant dashboard, the rider app and the
 * console cannot each hold a different version of it.
 */
create or replace view public.order_money_v
with (security_invoker = true) as
with per_order as (
  /*
   * Summed once, then read six ways. `sum()` over bigint returns
   * numeric, and a numeric money column is a fractional cent
   * waiting to turn up in a statement — so everything is cast
   * back to bigint on the way out.
   */
  select
    t.order_id,
    sum(e.debit) filter (
      where t.kind = 'order_sale_recognised'
        and (e.account_code like 'cash.%' or e.account_code like 'receivable.%'))
      as collected,
    sum(e.credit) filter (where e.account_code like 'payable.merchant:%')
      as merchant_net,
    sum(e.credit) filter (where e.account_code like 'payable.rider:%')
      as rider_pay,
    sum(e.credit) filter (where e.account_code like 'revenue.%')
      - sum(e.debit) filter (where e.account_code like 'revenue.%') as nexg_revenue,
    max(t.effective_at) as last_event_at,
    count(distinct t.id) as transactions
  from ledger.transaction t
  join ledger.entry e on e.transaction_id = t.id
  group by t.order_id
),
per_refund as (
  select order_id,
         sum(amount_cents) filter (where status = 'issued') as refunded,
         sum(amount_cents) filter (
           where status in ('requested','awaiting_approval','approved')) as pending
    from public.refund group by order_id
)
select
  o.id as order_id,
  o.reference,
  o.city_id,
  o.currency,
  o.total_cents,
  o.payment_method::text as payment_method,
  o.payment_status::text as payment_status,

  coalesce(p.collected, 0)::bigint as collected_cents,
  coalesce(rf.refunded, 0)::bigint as refunded_cents,
  coalesce(rf.pending, 0)::bigint as refund_pending_cents,
  coalesce(p.merchant_net, 0)::bigint as merchant_net_cents,
  coalesce(p.rider_pay, 0)::bigint as rider_pay_cents,
  coalesce(p.nexg_revenue, 0)::bigint as nexg_revenue_cents,

  /*
   * Derived, in the order the states supersede one another. A
   * refunded order is refunded whatever else is also true of it.
   */
  case
    when o.stage = 'cancelled' then 'void'
    when coalesce(rf.refunded, 0) >= o.total_cents and coalesce(rf.refunded, 0) > 0
      then 'refunded'
    when coalesce(rf.refunded, 0) > 0 then 'partially_refunded'
    when o.payment_status = 'collected' then 'cash_collected'
    when o.payment_status = 'paid' then 'paid'
    when o.payment_status = 'authorised' then 'authorised'
    when o.payment_method = 'cash_on_delivery' then 'cash_due'
    when o.payment_method = 'charge_to_room' then 'folio_awaiting'
    else 'unpaid'
  end as money_state,

  p.last_event_at as last_money_event_at,
  coalesce(p.transactions, 0)::int as ledger_transactions
from public.order o
left join per_order p on p.order_id = o.id
left join per_refund rf on rf.order_id = o.id;

comment on view public.order_money_v is
  'One order, one money story, derived from the ledger. Every surface reads this rather than adding up columns, so they can disagree about wording and never about money.';

grant select on public.order_money_v to authenticated;
grant execute on function ledger.from_kes(numeric) to authenticated;
revoke execute on function ledger.fn_post_sale(uuid, text, timestamptz) from public, anon;
revoke execute on function ledger.fn_post_rider_pay(uuid, bigint, bigint) from public, anon;
revoke execute on function ledger.fn_post_cash_deposited(uuid, bigint, text, timestamptz) from public, anon;
revoke execute on function ledger.fn_post_refund_approved(uuid) from public, anon;
revoke execute on function ledger.fn_post_refund_issued(uuid) from public, anon;
