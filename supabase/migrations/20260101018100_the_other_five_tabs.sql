-- The other five Finance tabs.
--
-- Overview and Settlement were built on projections: figures
-- rolled up ahead of time so a tile paints instantly. These five
-- read live, on purpose.
--
-- Reconciliation asks "does what we think we hold match what the
-- providers say?" — a question whose whole value is that it is
-- asked of the present. A reconciliation served from a cache
-- built an hour ago is a reconciliation of an hour ago, and the
-- gap it is looking for is exactly the thing that appears
-- between builds. Invoices, Fees and Tax are small enough to
-- read directly. Exports must read live or it is exporting the
-- cache rather than the books.
--
-- One thing to know before reading further: account codes are
-- per party. A merchant's payable is `payable.merchant:<uuid>`,
-- not `payable.merchant`, and `base` is the column that holds
-- the family name. Every join below matches on `base`. Matching
-- on `code` compiles, runs, and returns zero — which reads as
-- "this merchant was paid nothing" rather than as a mistake.
--
-- Everything here is `security_invoker`, so the RLS already on
-- ledger.entry and the payment tables decides what each caller
-- sees, rather than each view deciding for itself.

-- ═══════════════════════════════════════════ 1. Reconciliation

/*
 * Money in flight.
 *
 * The clearing accounts are the ones whose story is not
 * finished: an STK push with no callback, an authorisation never
 * captured, a payout sent and unconfirmed. A balance sitting in
 * one of these is not wrong — it is only wrong once it is old.
 * So the figure that matters is not the balance, it is the age
 * of the oldest thing inside it.
 */
create or replace view fin_clearing_aging_v
with (security_invoker = true) as
with open_entry as (
  select
    e.account_code,
    e.effective_at,
    e.debit - e.credit as net_cents
  from ledger.entry e
  join ledger.account a on a.code = e.account_code
  where a.kind = 'clearing'
)
select
  a.base as account_code,
  min(a.name) as account_name,
  coalesce(sum(o.net_cents), 0)::bigint as balance_cents,
  count(o.*)::bigint as entry_count,
  min(o.effective_at) as oldest_at,
  /*
   * Buckets, not one average age. A single ancient entry under a
   * pile of fresh ones is the case worth seeing, and an average
   * is precisely the thing that hides it.
   */
  coalesce(sum(o.net_cents) filter (
    where o.effective_at > now() - interval '24 hours'), 0)::bigint as under_1d_cents,
  coalesce(sum(o.net_cents) filter (
    where o.effective_at <= now() - interval '24 hours'
      and o.effective_at > now() - interval '7 days'), 0)::bigint as d1_to_7_cents,
  coalesce(sum(o.net_cents) filter (
    where o.effective_at <= now() - interval '7 days'), 0)::bigint as over_7d_cents
from ledger.account a
left join open_entry o on o.account_code = a.code
where a.kind = 'clearing'
group by a.base
order by a.base;

comment on view fin_clearing_aging_v is
  'What is in flight and how long it has been there. Bucketed rather than averaged: one stuck entry under a pile of fresh ones is the case worth seeing.';

/*
 * Provider against ledger, per day.
 *
 * Two independent accounts of the same money: what the payment
 * table says was collected, and what the ledger says arrived.
 * They are written by different code paths, which is the whole
 * point — a single source agreeing with itself proves nothing.
 */
create or replace view fin_provider_recon_v
with (security_invoker = true) as
with by_provider as (
  select
    (p.paid_at at time zone 'Africa/Nairobi')::date as day,
    p.provider::text as provider,
    count(*)::bigint as payment_count,
    sum(p.amount_cents)::bigint as provider_cents
  from public.payment p
  where p.state = 'paid' and p.paid_at is not null
  group by 1, 2
),
by_ledger as (
  select
    (e.effective_at at time zone 'Africa/Nairobi')::date as day,
    sum(e.debit - e.credit)::bigint as ledger_cents
  from ledger.entry e
  join ledger.account a on a.code = e.account_code
  where a.kind = 'asset' and a.base like 'cash.%'
  group by 1
)
select
  coalesce(p.day, l.day) as day,
  coalesce(p.provider, 'ledger only') as provider,
  coalesce(p.payment_count, 0) as payment_count,
  coalesce(p.provider_cents, 0) as provider_cents,
  coalesce(l.ledger_cents, 0) as ledger_cents,
  coalesce(p.provider_cents, 0) - coalesce(l.ledger_cents, 0) as difference_cents
from by_provider p
full outer join by_ledger l on l.day = p.day
order by 1 desc, 2;

comment on view fin_provider_recon_v is
  'Payments against ledger cash movements, per day. Two independent writers of the same fact; the difference between them is the entire output.';

/*
 * Callbacks that arrived and did nothing.
 *
 * An unhandled event is money that moved somewhere else and was
 * never recorded here. A bad signature is worse: something
 * claiming to be a provider. Both are silent — nothing in the
 * product changes when one lands — so they exist only if
 * somebody looks, and this is the looking.
 */
create or replace view fin_webhook_gap_v
with (security_invoker = true) as
select
  ev.id,
  ev.provider::text as provider,
  ev.event,
  ev.reference,
  ev.received_at,
  ev.signature_ok,
  ev.handled,
  ev.handled_note,
  p.reference as payment_reference,
  p.amount_cents,
  p.state::text as payment_state,
  case
    when not ev.signature_ok then 'signature did not verify'
    else 'received, never acted on'
  end as gap
from public.payment_event ev
left join public.payment p on p.id = ev.payment_id
where not ev.handled or not ev.signature_ok
order by ev.received_at desc;

comment on view fin_webhook_gap_v is
  'Provider callbacks that arrived and changed nothing, plus any that failed signature. Both are silent in the product, so they exist only if somebody looks.';

-- ═══════════════════════════════════════ 2. Fees & commissions

/*
 * Where revenue came from, by the account it was credited to,
 * with the order count beside it.
 *
 * A fee total is uninterpretable without its denominator:
 * "KES 40,000 of delivery fees" means nothing until you know
 * whether that was fifty orders or five thousand.
 */
create or replace view fin_fee_line_v
with (security_invoker = true) as
select
  (e.effective_at at time zone 'Africa/Nairobi')::date as day,
  t.city_id,
  c.name as city_name,
  a.base as account_code,
  min(a.name) as account_name,
  sum(e.credit - e.debit)::bigint as amount_cents,
  count(distinct t.order_id)::bigint as order_count,
  case
    when count(distinct t.order_id) > 0
      then round(sum(e.credit - e.debit)::numeric / count(distinct t.order_id))::bigint
  end as per_order_cents
from ledger.entry e
join ledger.transaction t on t.id = e.transaction_id
join ledger.account a on a.code = e.account_code
left join public.city c on c.id = t.city_id
where a.kind = 'revenue'
group by 1, 2, 3, a.base
order by 1 desc, 6 desc;

comment on view fin_fee_line_v is
  'Revenue by the account it landed in, per city per day, with the order count beside it.';

/*
 * Commission charged against commission agreed.
 *
 * `merchant.commission_pct` is what was signed. The ledger is
 * what was taken. These drift — a tier changes and old orders
 * keep the old rate, a manual adjustment lands, a promotion
 * waives a fee — and the drift is invisible until the two sit
 * side by side.
 */
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
  m.commission_pct as agreed_pct,
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
group by m.id, m.trading_name, m.commission_tier, m.commission_pct
order by 6 desc;

comment on view fin_merchant_take_v is
  'What each merchant agreed to pay against what was actually taken. The two drift through tier changes and waivers, and the drift is invisible until they are put side by side.';

-- ══════════════════════════════════════════════ 3. Invoices

/*
 * Three invoice tables, one question.
 *
 * Hosts, hotels and merchants are billed by different code with
 * different column names, but "who owes us, how much, and for
 * how long" is one question and deserves one answer.
 */
create or replace view fin_invoice_v
with (security_invoker = true) as
select
  'host'::text as party_kind,
  i.id,
  i.host_id as party_id,
  h.display_name as party_name,
  i.period::text as period,
  i.total::bigint as total_cents,
  i.status::text as status,
  i.due_at,
  i.paid_at,
  i.provider_ref,
  i.created_at
from public.host_invoice i
left join public.host h on h.id = i.host_id
union all
select
  'hotel',
  s.id,
  s.hotel_id,
  ht.name,
  s.period::text,
  s.net_invoiced::bigint,
  s.status::text,
  s.due_at,
  s.paid_at,
  s.provider_ref,
  s.created_at
from public.hotel_statement s
left join public.hotel ht on ht.id = s.hotel_id
union all
select
  'merchant',
  ms.id,
  ms.merchant_id,
  m.trading_name,
  ms.period_start::text || ' to ' || ms.period_end::text,
  ms.net_kes::bigint,
  ms.status::text,
  null::timestamptz,
  ms.paid_at,
  ms.provider_ref,
  ms.created_at
from public.merchant_statement ms
left join public.merchant m on m.id = ms.merchant_id;

/*
 * Overdue is computed here, not stored. A stored flag is only
 * as current as the last job that set it, and an invoice that
 * became overdue an hour ago is overdue now whether or not
 * anything has run since.
 */
create or replace view fin_invoice_aging_v
with (security_invoker = true) as
select
  party_kind,
  id,
  party_id,
  party_name,
  period,
  total_cents,
  status,
  due_at,
  paid_at,
  created_at,
  paid_at is null and due_at is not null and due_at < now() as overdue,
  case
    when paid_at is not null then 'paid'
    when due_at is null then 'no due date set'
    when due_at >= now() then 'not yet due'
    when due_at > now() - interval '30 days' then 'overdue, under 30 days'
    when due_at > now() - interval '60 days' then 'overdue, 30 to 60 days'
    else 'overdue, over 60 days'
  end as bucket
from public.fin_invoice_v;

comment on view fin_invoice_aging_v is
  'Hosts, hotels and merchants in one shape. Overdue is computed rather than stored: a stored flag is only as current as the last job that set it.';

-- ══════════════════════════════════════════════════ 4. Tax

/*
 * What the books actually know about tax.
 *
 * This is short, and it is short because the honest answer is
 * short. Two things in this system carry a tax figure:
 * featured-placement fees, which have a VAT rate on their rate
 * card, and merchant statements, which carry withholding.
 *
 * Output VAT on delivery and service revenue is configured
 * nowhere. There is no rate to apply, so this view does not
 * apply one — but it reports the gap as a row rather than
 * omitting the line, because a tax screen that silently leaves
 * out the largest revenue category is worse than no tax screen
 * at all. An empty space reads as zero; a stated gap does not.
 */
create or replace view fin_tax_position_v
with (security_invoker = true) as
select
  1 as sort,
  'Featured placement'::text as source,
  'VAT charged on featured fees'::text as basis,
  coalesce(sum(f.fee_ex_vat), 0)::bigint as base_cents,
  coalesce(sum(f.vat), 0)::bigint as tax_cents,
  true as configured,
  'featured_rate_card.vat_pct'::text as rate_source
from public.featured_fee_line f
union all
select
  2,
  'Merchant settlements',
  'Withholding deducted before payout',
  coalesce(sum(ms.gross_kes), 0)::bigint,
  coalesce(sum(ms.tax_withheld_kes), 0)::bigint,
  true,
  'merchant_statement.tax_withheld_kes'
from public.merchant_statement ms
union all
select
  3,
  'Delivery, service and concierge revenue',
  'Output VAT — no rate is configured, so nothing is computed',
  coalesce((
    select sum(e.credit - e.debit)
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
     where a.kind = 'revenue'
       and a.base <> 'revenue.commission'), 0)::bigint,
  null::bigint,
  false,
  'not set';

comment on view fin_tax_position_v is
  'What the books know about tax, including what they do not. The unconfigured line is reported rather than omitted: an empty space reads as zero, a stated gap does not.';

-- ═══════════════════════════════════════════════ 5. Exports

/*
 * An export is a disclosure.
 *
 * Somebody takes a copy of the books out of the system, and from
 * that moment the system cannot say who holds it. So the export
 * is recorded before the rows are handed over: who, which range,
 * which kind, how many rows. The log is the only thing that
 * outlives the file.
 */
create table if not exists fin_export_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  from_date date not null,
  to_date date not null,
  row_count integer not null,
  taken_by uuid not null references staff_user (id),
  taken_at timestamptz not null default now()
);

comment on table fin_export_log is
  'Every export of the books, recorded before the rows are handed over. The log is the only thing that outlives the file.';

alter table fin_export_log enable row level security;

drop policy if exists fin_export_log_read on fin_export_log;
create policy fin_export_log_read on fin_export_log
  for select to authenticated using (authz.reads_ledger());

create or replace view fin_export_log_v
with (security_invoker = true) as
select
  l.*,
  s.email as taken_by_email
from public.fin_export_log l
left join public.staff_user s on s.id = l.taken_by;

comment on view fin_export_log_v is
  'The export log with the taker named. Shown on the Exports tab rather than buried in the audit trail: the deterrent only works if people know it is there.';

insert into audit.action_registry (action, module, default_severity, description)
values ('fin.export', 'finance', 'notice',
        'A copy of the books left the system. Who, what range, how many rows.')
on conflict (action) do nothing;

create or replace function rpc_fin_export(
  p_kind text,
  p_from date,
  p_to date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := authz.staff_id();
  v_rows jsonb;
  v_count integer;
begin
  if v_staff is null or not authz.reads_ledger() then
    raise exception 'Only finance staff may export the books.'
      using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Give a date range, earliest first.' using errcode = '22023';
  end if;

  /*
   * Capped at a quarter — not for performance, for blast radius.
   * "Everything, all time" is the shape of an export that should
   * be a conversation rather than a button.
   */
  if p_to - p_from > 92 then
    raise exception 'A single export covers at most 92 days. Take it in parts.'
      using errcode = '22023';
  end if;

  if p_kind = 'ledger' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows from (
      select
        e.id,
        e.effective_at,
        t.kind::text as transaction_kind,
        t.reason_code,
        e.account_code,
        e.debit,
        e.credit,
        e.memo,
        e.party_type::text as party_type,
        e.party_id,
        t.order_id,
        c.name as city
      from ledger.entry e
      join ledger.transaction t on t.id = e.transaction_id
      left join public.city c on c.id = t.city_id
      where (e.effective_at at time zone 'Africa/Nairobi')::date between p_from and p_to
      order by e.effective_at, e.id
    ) x;

  elsif p_kind = 'settlement' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows from (
      select
        r.reference, r.state::text as state, r.period_start, r.period_end, r.pay_date,
        l.party_type::text as party_type, l.party_label,
        l.gross_cents, l.commission_cents, l.adjustment_cents, l.net_cents,
        l.state::text as line_state
      from public.fin_settlement_run r
      join public.fin_settlement_line l on l.run_id = r.id
      where r.period_end between p_from and p_to
      order by r.period_end, l.net_cents desc
    ) x;

  elsif p_kind = 'revenue' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows from (
      select day, city_name, account_code, account_name,
             amount_cents, order_count, per_order_cents
      from public.fin_fee_line_v
      where day between p_from and p_to
      order by day, amount_cents desc
    ) x;

  elsif p_kind = 'invoices' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows from (
      select party_kind, party_name, period, total_cents, status,
             due_at, paid_at, bucket
      from public.fin_invoice_aging_v
      where created_at::date between p_from and p_to
      order by created_at
    ) x;

  else
    raise exception 'Unknown export: %. One of ledger, settlement, revenue, invoices.', p_kind
      using errcode = '22023';
  end if;

  v_count := jsonb_array_length(v_rows);

  /* Recorded before the rows are returned, not after. A failure
     between the two should leave the disclosure logged rather
     than the file handed over unlogged. */
  insert into public.fin_export_log (kind, from_date, to_date, row_count, taken_by)
  values (p_kind, p_from, p_to, v_count, v_staff);

  perform audit.log('staff'::public.actor_type, 'finance', 'fin.export',
    p_target_type => 'fin_export_log',
    p_after => jsonb_build_object(
      'kind', p_kind, 'from', p_from, 'to', p_to, 'rows', v_count),
    p_severity => 'notice');

  return jsonb_build_object('ok', true, 'kind', p_kind, 'count', v_count, 'rows', v_rows);
end;
$$;

revoke execute on function rpc_fin_export(text, date, date) from public, anon;
grant execute on function rpc_fin_export(text, date, date) to authenticated;

-- ════════════════════════════════════════════════════ grants

grant select on
  fin_clearing_aging_v,
  fin_provider_recon_v,
  fin_webhook_gap_v,
  fin_fee_line_v,
  fin_merchant_take_v,
  fin_invoice_v,
  fin_invoice_aging_v,
  fin_tax_position_v,
  fin_export_log,
  fin_export_log_v
to authenticated;

revoke all on fin_export_log from anon;
