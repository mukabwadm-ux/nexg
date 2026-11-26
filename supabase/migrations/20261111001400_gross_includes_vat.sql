-- Gross on the finance screens is what guests paid, VAT included.
--
-- Since 20260101022300 the ledger splits VAT out of commission and fees into
-- tax.vat_output. Gross was still built as merchant share + NexG revenue, so
-- after the split it quietly dropped the VAT and stopped matching money in
-- (tests/23 caught the gap, which was exactly the month's VAT).
--
-- Revenue and net stay VAT-free: VAT is owed to KRA, not earned. The
-- finance-projections cron job rebuilds fin_kpi_daily every two minutes, so
-- the stored rows pick this up without a manual rebuild.
-- Body otherwise unchanged from 20260101015900.

create or replace function fn_fin_kpi_for(p_day date, p_city_id uuid)
returns table (
  orders integer,
  gross_cents bigint,
  revenue_cents bigint,
  merchant_cost_cents bigint,
  rider_cost_cents bigint,
  leakage_cents bigint,
  refund_cents bigint,
  net_cents bigint,
  cash_collected_cents bigint,
  as_of_entry_id bigint,
  source_hash text
)
language sql
stable
security definer
set search_path = ''
as $$
  with scope as (
    select e.id, e.debit, e.credit, a.base, t.kind, t.order_id
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
      join ledger.transaction t on t.id = e.transaction_id
     where e.effective_at >= (p_day::timestamp at time zone 'Africa/Nairobi')
       and e.effective_at <  ((p_day + 1)::timestamp at time zone 'Africa/Nairobi')
       and t.city_id is not distinct from p_city_id
  ),
  sums as (
    select
      count(distinct case when kind = 'order_sale_recognised' then order_id end)::integer as n_orders,
      coalesce(sum(case when base like 'revenue.%' then credit - debit else 0 end), 0)::bigint as revenue,
      coalesce(sum(case when base = 'tax.vat_output' then credit - debit else 0 end), 0)::bigint as vat,
      coalesce(sum(case when base = 'payable.merchant' then credit - debit else 0 end), 0)::bigint as merchant_cost,
      coalesce(sum(case when base in ('expense.rider_pay', 'expense.rider_bonus')
                        then debit - credit else 0 end), 0)::bigint as rider_cost,
      coalesce(sum(case when base in ('expense.compensation_merchant', 'expense.compensation_rider',
                                      'expense.goodwill', 'expense.provider_fees',
                                      'expense.chargeback_loss', 'expense.write_off')
                        then debit - credit else 0 end), 0)::bigint as leakage,
      coalesce(sum(case when base = 'refunds_pending' then credit - debit else 0 end), 0)::bigint as refunds,
      coalesce(sum(case when base in ('cash.mpesa_paybill', 'cash.bank', 'cash.rider_on_hand',
                                      'cash.card_processor_receivable')
                        then debit - credit else 0 end), 0)::bigint as cash_in,
      coalesce(max(id), 0)::bigint as max_entry,
      count(*)::bigint as n_entries,
      coalesce(sum(debit), 0)::bigint as total_debit,
      coalesce(sum(credit), 0)::bigint as total_credit
    from scope
  )
  select
    n_orders,
    (merchant_cost + revenue + vat)::bigint,
    revenue,
    merchant_cost,
    rider_cost,
    leakage,
    refunds,
    (revenue - rider_cost - leakage)::bigint,
    cash_in,
    max_entry,
    encode(extensions.digest(
      p_day::text || '|' || coalesce(p_city_id::text, '-') || '|' ||
      n_entries || '|' || max_entry || '|' || total_debit || '|' || total_credit,
      'sha256'), 'hex')
  from sums;
$$;
