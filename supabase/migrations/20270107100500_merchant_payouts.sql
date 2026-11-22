/*
 * Merchants → Payouts & Settlements: what each merchant earned in a period,
 * what NexG kept, what is owed to them and where their money stands.
 *
 * Money, per merchant, from orders placed in the period that were not
 * cancelled, refunded or disputed (as Performance counts sales):
 *   GMV          the item subtotal.
 *   Commission   order.commission_cents, which includes VAT; shown without
 *                it, with the VAT apart (16%, ledger.fn_vat_part).
 *   Payout       GMV less the commission with its VAT: what the ledger
 *                owes the merchant (payable.merchant).
 * So GMV = payout + commission without VAT + VAT, the Settlement Summary.
 *
 * Status, from the merchant's settlement line in a run covering the period
 * (fin_settlement_line, built weekly by rpc_settlement_build):
 *   settled    paid, sent, netted against cash they collected, or the run
 *              was sent, reconciled or closed
 *   scheduled  in a run that is ready, approved or queued; pays on its date
 *   failed     the payment failed
 *   pending    not in a run yet, or held (the hold reason is given)
 *
 * Figures:
 *   Pending payouts    payouts of the pending rows in the period.
 *   Settled this month settlement lines settled in this calendar month.
 *   Next settlement    the earliest pay date of a run not yet sent, else the
 *                      next Friday (runs are weekly and pay the Friday after).
 *   Estimated payout   what the ledger owes merchants and no run holds yet
 *                      (fin_party_owed).
 *
 * Access: people who reach Merchants see the merchants they may work;
 * finance readers and super admins see all.
 *
 * Rollback:
 *   drop function if exists public.rpc_merchant_payouts(date, date, text[], text, text, text, integer, integer);
 */

create or replace function public.rpc_merchant_payouts(
  p_from date,
  p_to date,
  p_keys text[] default null,
  p_rail text default null,
  p_status text default null,
  p_q text default null,
  p_limit integer default 5,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_pfrom date;
  v_all boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_month timestamptz := date_trunc('month', now() at time zone 'Africa/Nairobi') at time zone 'Africa/Nairobi';
  v_q text := nullif(trim(coalesce(p_q, '')), '');
  v_like text;
  v_limit integer := least(greatest(coalesce(p_limit, 5), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  if not (authz.is_super_admin() or authz.reaches_module('merchants') or authz.finance_reads()) then
    raise exception 'Only people who reach Merchants or Finance can see this.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a period that starts before it ends.' using errcode = '22023';
  end if;
  v_days := (p_to - p_from) + 1;
  if v_days > 400 then
    raise exception 'Choose a period of 400 days or less.' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('pending', 'settled', 'failed', 'scheduled') then
    raise exception 'Choose pending, settled, failed or scheduled.' using errcode = '22023';
  end if;
  if p_rail is not null and p_rail not in ('mpesa', 'bank', 'none') then
    raise exception 'Choose M-Pesa, bank or not set.' using errcode = '22023';
  end if;
  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  v_pfrom := p_from - v_days;
  v_all := authz.is_super_admin() or authz.finance_reads();
  v_start := p_from::timestamp at time zone 'Africa/Nairobi';
  v_end := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';

  with scope as (
    select
      m.id,
      coalesce(nullif(trim(m.trading_name), ''), m.legal_name) as name,
      coalesce(nullif(m.category_key, ''), m.category::text) as ckey,
      m.category_other,
      m.cover_photo_path,
      m.city_id,
      m.payout_rail
    from public.merchant m
    where (v_all or authz.works_merchant(m.id))
      and (p_keys is null or coalesce(nullif(m.category_key, ''), m.category::text) = any (p_keys))
  ),
  o as (
    select
      o.merchant_id,
      o.placed_at >= v_start as is_cur,
      o.subtotal_cents::bigint as gmv,
      coalesce(o.commission_cents, 0)::bigint as comm
    from public.order o
    join scope s on s.id = o.merchant_id
    where o.placed_at >= v_pfrom::timestamp at time zone 'Africa/Nairobi'
      and o.placed_at < v_end
      and o.stage not in ('cancelled', 'refunded', 'disputed')
  ),
  money as (
    select
      s.id,
      coalesce(sum(o.gmv) filter (where o.is_cur), 0)::bigint as gmv,
      coalesce(sum(o.comm) filter (where o.is_cur), 0)::bigint as comm,
      coalesce(sum(o.gmv) filter (where not o.is_cur), 0)::bigint as prev_gmv,
      coalesce(sum(o.comm) filter (where not o.is_cur), 0)::bigint as prev_comm
    from scope s
    left join o on o.merchant_id = s.id
    group by s.id
  ),
  line as (
    select distinct on (l.party_id)
      l.party_id,
      l.state::text as line_state,
      l.rail::text as line_rail,
      l.net_cents,
      l.hold_reason,
      l.paid_at,
      r.reference,
      r.state::text as run_state,
      r.pay_date,
      r.sent_at
    from public.fin_settlement_line l
    join public.fin_settlement_run r on r.id = l.run_id
    where l.party_type = 'merchant'
      and r.state <> 'cancelled'
      and r.period_start < v_end
      and r.period_end > v_start
    order by l.party_id, r.period_end desc, l.created_at desc
  ),
  rows as (
    select
      s.id as merchant_id,
      s.name,
      s.ckey as category_key,
      case
        when s.ckey = 'other' and nullif(trim(s.category_other), '') is not null then trim(s.category_other)
        else public.fn_merchant_category_label(s.ckey)
      end as category_label,
      s.cover_photo_path as photo_path,
      (
        select nullif(concat_ws(', ', zo.name, c.name), '')
        from public.merchant_branch br
        left join public.zone zo on zo.id = br.zone_id
        left join public.city c on c.id = s.city_id
        where br.merchant_id = s.id and br.deleted_at is null
        order by br.is_primary desc, br.sort nulls last, br.created_at
        limit 1
      ) as area,
      mo.gmv,
      mo.comm - ledger.fn_vat_part(mo.comm) as commission,
      ledger.fn_vat_part(mo.comm) as vat,
      mo.gmv - mo.comm as payout,
      case
        when coalesce(l.line_rail, s.payout_rail) in ('mpesa_b2b', 'mpesa_b2c', 'mpesa_till', 'mpesa_paybill') then 'mpesa'
        when coalesce(l.line_rail, s.payout_rail) in ('bank_eft', 'bank') then 'bank'
        when coalesce(l.line_rail, s.payout_rail) is null then 'none'
        else 'other'
      end as rail,
      case
        when l.line_state = 'failed' then 'failed'
        when l.line_state in ('paid', 'sent', 'cash_netted') or l.paid_at is not null
          or l.run_state in ('sent', 'reconciled', 'closed') then 'settled'
        when l.line_state in ('ready', 'approved', 'queued') then 'scheduled'
        else 'pending'
      end as status,
      case
        when l.line_state = 'cash_netted' then 'Netted'
        when l.line_state in ('held_suspended', 'held_kyc', 'name_mismatch', 'below_minimum_rolled', 'mismatch',
                              'rolled_forward') then 'Held'
      end as status_note,
      l.hold_reason,
      case
        when l.line_state in ('paid', 'sent') or l.paid_at is not null
          or l.run_state in ('sent', 'reconciled', 'closed') then coalesce(l.paid_at::date, l.sent_at::date, l.pay_date)
        when l.line_state in ('ready', 'approved', 'queued', 'cash_netted') then l.pay_date
      end as payout_date,
      l.reference as run_reference
    from scope s
    join money mo on mo.id = s.id
    left join line l on l.party_id = s.id
    where mo.gmv > 0 or l.party_id is not null
  ),
  filtered as (
    select * from rows r
    where (p_rail is null or r.rail = p_rail)
      and (v_like is null or r.name ilike v_like or coalesce(r.run_reference, '') ilike v_like)
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'gtv', jsonb_build_object('now', (select coalesce(sum(gmv), 0) from money),
                                'before', (select coalesce(sum(prev_gmv), 0) from money)),
      'commission', jsonb_build_object(
        'now', (select coalesce(sum(comm - ledger.fn_vat_part(comm)), 0) from money),
        'before', (select coalesce(sum(prev_comm - ledger.fn_vat_part(prev_comm)), 0) from money)),
      'payouts', jsonb_build_object('now', (select coalesce(sum(gmv - comm), 0) from money),
                                    'before', (select coalesce(sum(prev_gmv - prev_comm), 0) from money)),
      'pending', (select coalesce(sum(payout), 0) from rows where status = 'pending'),
      'settled_month', (
        select coalesce(sum(l.net_cents), 0)
        from public.fin_settlement_line l
        join public.fin_settlement_run r on r.id = l.run_id
        join scope s on s.id = l.party_id
        where l.party_type = 'merchant'
          and (l.state in ('paid', 'sent', 'cash_netted') or l.paid_at is not null
               or r.state in ('sent', 'reconciled', 'closed'))
          and coalesce(l.paid_at, r.sent_at, r.pay_date::timestamp at time zone 'Africa/Nairobi') >= v_month
      )
    ),
    'summary', jsonb_build_object(
      'gmv', (select coalesce(sum(gmv), 0) from money),
      'payouts', (select coalesce(sum(gmv - comm), 0) from money),
      'commission', (select coalesce(sum(comm - ledger.fn_vat_part(comm)), 0) from money),
      'vat', (select coalesce(sum(ledger.fn_vat_part(comm)), 0) from money)
    ),
    'tabs', jsonb_build_object(
      'all', (select count(*) from filtered),
      'pending', (select count(*) from filtered where status = 'pending'),
      'settled', (select count(*) from filtered where status = 'settled'),
      'failed', (select count(*) from filtered where status = 'failed'),
      'scheduled', (select count(*) from filtered where status = 'scheduled')
    ),
    'total', (select count(*) from filtered where p_status is null or status = p_status),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.gmv desc, x.name)
      from (
        select * from filtered
        where p_status is null or status = p_status
        order by gmv desc, name
        limit v_limit offset v_offset
      ) x
    ), '[]'::jsonb),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reference', r.reference, 'pay_date', r.pay_date, 'state', r.state::text,
        'merchants_cents', coalesce((r.totals ->> 'merchants_cents')::bigint, 0)
      ) order by r.period_end desc)
      from (
        select * from public.fin_settlement_run r
        where r.state <> 'cancelled'
          and (v_all or r.city_id is null or exists (
            select 1 from scope s where s.city_id = r.city_id))
        order by r.period_end desc
        limit 5
      ) r
    ), '[]'::jsonb),
    'next_settlement', coalesce(
      (select min(r.pay_date) from public.fin_settlement_run r
        where r.state not in ('sent', 'reconciled', 'closed', 'cancelled') and r.pay_date >= v_today),
      v_today + ((12 - extract(isodow from v_today)::integer) % 7)
    ),
    'estimated_payout', (
      select coalesce(sum(f.owed_cents), 0)
      from public.fin_party_owed f
      join scope s on s.id = f.party_id
      where f.party_type = 'merchant'
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.rpc_merchant_payouts(date, date, text[], text, text, text, integer, integer) from public, anon;
grant execute on function public.rpc_merchant_payouts(date, date, text[], text, text, text, integer, integer)
  to authenticated, service_role;
