-- Ledger and Finance fixes found while the Finance pages were rebuilt.
--
-- Nothing here has met real money yet. Production has no host invoices,
-- merchant or hotel statements, featured fee lines, settlement runs or
-- recognised sales, and no order with a weather surcharge, so each fix lands
-- before it could matter and nothing needs correcting after it.
--
--  1. ledger.reverse is security definer, checks nobody, and EXECUTE was
--     granted to authenticated. Only the API's list of exposed schemas kept
--     a signed-in customer from reversing any transaction. The three host
--     postings (fn_post_host_invoice, fn_post_host_invoice_paid and
--     fn_post_host_referral_reward) were reachable the same way, through the
--     default grant to PUBLIC. All four are closed to public, anon and
--     authenticated. Security definer triggers call the host postings as
--     their owner, so issuing and paying invoices and crediting rewards work
--     as before; a reversal is made from the SQL Editor.
--
--  2. Marking a host invoice paid posted to cash.mpesa, which is not in the
--     chart, so the update raised and no invoice could be marked paid. It
--     posts to cash.mpesa_paybill.
--
--  3. An order with a weather surcharge could not be placed. public."order"
--     had two total checks: order_total_is_the_sum, which leaves the
--     surcharge out, and order_total_adds_up, which counts it.
--     20261026000000 meant to replace the first but dropped a name that did
--     not exist. The stale check is dropped. ledger.fn_sale_entries also left
--     the surcharge out, so the sale would not have balanced when the order
--     was paid. It now posts to a new revenue.weather_surcharge account, net
--     of VAT, with the VAT on tax.vat_output, as the night surcharge does.
--     And a bank transfer now lands on cash.bank, not cash.mpesa_paybill.
--
--  4. fin_invoice_v read merchant_statement.net_kes, which is in shillings,
--     as cents. fin_tax_position_v did the same with merchant statements'
--     gross and withholding, and with featured fee lines, which are priced
--     in shillings (a featured slot is charged quoted_price x 100 cents).
--     Each is multiplied by 100, as rpc_finance_invoices already does.
--
--  5. fn_fin_build_party_owed named merchants and riders but not hosts, so a
--     host owed a referral reward appeared as "[name not found]".
--
--  6. fn_fin_build_calendar matched settlement runs on period_end::date. A
--     run ends at Monday 00:00 in Nairobi, which is still Sunday in UTC, so a
--     built week showed as "Not built yet". It compares the Nairobi date.
--
-- Function and view bodies are copied from their latest definitions with
-- only the lines above changed.
--
-- Rollback, in this order:
--   grant execute on function ledger.reverse(uuid, text, text,
--     public.actor_type, uuid) to authenticated, and on the three host
--     postings to public;
--   re-run ledger.fn_post_host_invoice_paid from 20260101019600 and
--   ledger.fn_sale_entries from 20260101022300;
--   re-run fin_invoice_v from 20260101018100 and fin_tax_position_v from
--   20260101022400;
--   re-run fn_fin_build_party_owed and fn_fin_build_calendar from
--   20260101015900;
--   re-add order_total_is_the_sum from 20260101013100, which only succeeds
--   while no order carries a weather surcharge.
--   The revenue.weather_surcharge account stays: accounts are not deleted.

-- ═══════════════════════════════════════════ 1. nobody calls these directly

revoke execute on function
  ledger.reverse(uuid, text, text, public.actor_type, uuid),
  ledger.fn_post_host_invoice(uuid),
  ledger.fn_post_host_invoice_paid(uuid),
  ledger.fn_post_host_referral_reward(uuid)
  from public, anon, authenticated;

comment on function ledger.reverse(uuid, text, text, public.actor_type, uuid) is
  'Mirrors a transaction once, with a reason. It does not check who is asking, so nobody calls it directly: a reversal is made from the SQL Editor, or by a security definer function that checks the caller first.';

-- ═════════════════════════════════════ 2. a paid host invoice clears to M-Pesa

create or replace function ledger.fn_post_host_invoice_paid(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.host_invoice;
  v_city uuid;
begin
  select * into v_inv from public.host_invoice where id = p_invoice_id;
  if not found then
    raise exception 'No such invoice.' using errcode = 'no_data_found';
  end if;
  if v_inv.paid_at is null then
    raise exception 'That invoice is not marked paid, so there is nothing to clear.'
      using errcode = '22023';
  end if;

  select city_id into v_city from public.host where id = v_inv.host_id;

  return ledger.post(
    p_kind => 'host_invoice_paid',
    p_idempotency_key => 'host_invoice_paid:' || p_invoice_id::text,
    p_entries => jsonb_build_array(
      jsonb_build_object('account', 'cash.mpesa_paybill', 'debit', v_inv.total),
      jsonb_build_object('account', 'receivable.host', 'party_type', 'host',
        'party_id', v_inv.host_id, 'credit', v_inv.total,
        'memo', 'Paid ' || to_char(v_inv.period, 'Mon YYYY'))),
    p_effective_at => v_inv.paid_at,
    p_city_id => v_city,
    p_actor_kind => 'system',
    p_actor_label => '[System] · ledger',
    p_reason_code => 'host_invoice_paid');
end;
$$;

-- ════════════════════════════════════════════════ 3. the weather surcharge

insert into ledger.account (code, base, name, kind, party_type, party_id, normal_side) values
  ('revenue.weather_surcharge', 'revenue.weather_surcharge', 'Weather surcharge', 'revenue', 'nexg', null, 'C')
on conflict (code) do nothing;

create or replace function ledger.fn_sale_entries(o public.order, p_cash_account text default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with v as (
    select coalesce(settings.fn_num('tax.vat_pct', o.city_id), 16) as pct
  ), l as (
    select
      ledger.fn_vat_part(coalesce(o.commission_cents, 0), v.pct) as commission,
      ledger.fn_vat_part(o.delivery_fee_cents, v.pct) as delivery,
      ledger.fn_vat_part(o.service_fee_cents, v.pct) as service,
      ledger.fn_vat_part(o.small_basket_fee_cents, v.pct) as small,
      ledger.fn_vat_part(o.night_surcharge_cents, v.pct) as night,
      ledger.fn_vat_part(o.weather_fee_cents, v.pct) as weather,
      ledger.fn_vat_part(o.concierge_fee_cents, v.pct) as concierge,
      ledger.fn_vat_part(o.cash_handling_cents, v.pct) as cash
    from v
  )
  select jsonb_build_array(
    jsonb_build_object(
      'account', coalesce(p_cash_account, case o.payment_method
        when 'card' then 'cash.card_processor_receivable'
        when 'mpesa_stk' then 'cash.mpesa_paybill'
        when 'bank_transfer' then 'cash.bank'
        when 'charge_to_room' then 'receivable.hotel'
        when 'on_account' then 'receivable.guest_on_account'
        else 'cash.mpesa_paybill' end),
      'debit', o.total_cents,
      'memo', o.reference),

    jsonb_build_object('account', 'payable.merchant', 'party_type', 'merchant',
      'party_id', o.merchant_id,
      'credit', o.subtotal_cents - coalesce(o.commission_cents, 0),
      'memo', 'items less commission'),

    jsonb_build_object('account', 'revenue.commission', 'credit', coalesce(o.commission_cents, 0) - l.commission),
    jsonb_build_object('account', 'revenue.delivery_fee', 'credit', o.delivery_fee_cents - l.delivery),
    jsonb_build_object('account', 'revenue.service_fee', 'credit', o.service_fee_cents - l.service),
    jsonb_build_object('account', 'revenue.small_basket', 'credit', o.small_basket_fee_cents - l.small),
    jsonb_build_object('account', 'revenue.night_surcharge', 'credit', o.night_surcharge_cents - l.night),
    jsonb_build_object('account', 'revenue.weather_surcharge', 'credit', o.weather_fee_cents - l.weather),
    jsonb_build_object('account', 'revenue.concierge_fee', 'credit', o.concierge_fee_cents - l.concierge),
    jsonb_build_object('account', 'revenue.cash_handling', 'credit', o.cash_handling_cents - l.cash),
    jsonb_build_object('account', 'tax.vat_output',
      'credit', l.commission + l.delivery + l.service + l.small + l.night + l.weather + l.concierge + l.cash,
      'memo', 'VAT on NexG commission and fees'),

    jsonb_build_object('account', 'payable.rider', 'party_type', 'rider',
      'party_id', o.rider_id, 'credit',
      case when o.rider_id is null then 0 else o.tip_cents end,
      'memo', 'tip'))
  from l
$$;

comment on function ledger.fn_sale_entries(public.order, text) is
  'One order, split the way the money actually divides: what the merchant is owed, NexG''s fees and commission net of VAT, the VAT, and the rider''s tip. It balances for the same reason order_total_adds_up holds.';

-- ═══════════════════════════════════════════ 4. shillings are not cents

create or replace view public.fin_invoice_v
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
  ms.net_kes::bigint * 100,
  ms.status::text,
  null::timestamptz,
  ms.paid_at,
  ms.provider_ref,
  ms.created_at
from public.merchant_statement ms
left join public.merchant m on m.id = ms.merchant_id;

create or replace view public.fin_tax_position_v
with (security_invoker = true) as
select
  1 as sort,
  'Featured placement'::text as source,
  'VAT charged on featured fees'::text as basis,
  (coalesce(sum(f.fee_ex_vat), 0) * 100)::bigint as base_cents,
  (coalesce(sum(f.vat), 0) * 100)::bigint as tax_cents,
  true as configured,
  'featured_rate_card.vat_pct'::text as rate_source
from public.featured_fee_line f
union all
select
  2,
  'Merchant settlements',
  'Withholding deducted before payout',
  (coalesce(sum(ms.gross_kes), 0) * 100)::bigint,
  (coalesce(sum(ms.tax_withheld_kes), 0) * 100)::bigint,
  true,
  'merchant_statement.tax_withheld_kes'
from public.merchant_statement ms
union all
select
  3,
  'Commission, delivery and service fees',
  'Output VAT on orders, from the tax documents',
  coalesce(sum(case when t.kind = 'credit_note' then -t.net_cents else t.net_cents end), 0)::bigint,
  coalesce(sum(case when t.kind = 'credit_note' then -t.vat_cents else t.vat_cents end), 0)::bigint,
  true,
  'settings tax.vat_pct'
from public.tax_invoice t;

-- ════════════════════════════════════════ 5. a host owed money has a name

create or replace function public.fn_fin_build_party_owed()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  delete from public.fin_party_owed;

  with owed as (
    select
      e.party_type,
      e.party_id,
      /* Payables are credit-normal, so credits less debits is
         what is still owed. An entry already claimed by a
         settlement line is excluded — it is owed no longer, it
         is scheduled. */
      sum(e.credit - e.debit)::bigint as owed,
      min(e.effective_at) as oldest,
      count(*)::integer as n
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
     where a.kind = 'liability'
       and a.base in ('payable.merchant', 'payable.rider', 'payable.host_credit')
       and e.party_type is not null
       and e.party_id is not null
       and not exists (select 1 from public.fin_settled_entry s where s.entry_id = e.id)
     group by e.party_type, e.party_id
    having sum(e.credit - e.debit) <> 0
  ),
  inserted as (
    insert into public.fin_party_owed
      (party_type, party_id, label, owed_cents, oldest_unsettled, entry_count,
       as_of_entry_id, built_at)
    select o.party_type, o.party_id,
           coalesce(
             case o.party_type
               when 'merchant' then (select coalesce(m.trading_name, m.legal_name)
                                       from public.merchant m where m.id = o.party_id)
               when 'rider' then (select nullif(trim(coalesce(r.first_name, '') || ' '
                                                  || coalesce(r.last_name, '')), '')
                                    from public.rider r where r.id = o.party_id)
               when 'host' then (select nullif(trim(h.display_name), '')
                                   from public.host h where h.id = o.party_id)
               else null
             end,
             /* Never a bare uuid on a payout screen. If the name
                will not resolve, say so — an unnamed payee is a
                reason to stop, not a cosmetic gap. */
             '[name not found]'),
           o.owed, o.oldest, o.n,
           coalesce((select max(id) from ledger.entry), 0), now()
      from owed o
    returning 1
  )
  select count(*)::integer into v_rows from inserted;

  return v_rows;
end;
$$;

-- ═════════════════════════════════ 6. the calendar finds the run it dates

create or replace function public.fn_fin_build_calendar()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_rows integer;
begin
  delete from public.fin_calendar_entry;

  /*
   * Settlement, eight weeks either side of today.
   *
   * Dated by the Monday a week closes, because that is the
   * boundary `rpc_settlement_build` is actually called with —
   * a calendar keyed to a day no run can ever match would show
   * every week as never built. That Monday is the Nairobi date:
   * a run ends at 00:00 in Nairobi, which is still Sunday in UTC.
   */
  insert into public.fin_calendar_entry (id, due_on, kind, label, detail, amount_cents, state, href)
  select
    'settlement:' || x.d::text,
    x.d,
    'settlement',
    'Weekly settlement · week of ' || to_char(x.d - 7, 'DD Mon'),
    coalesce(
      (select r.reference || ' · ' || r.state::text
         from public.fin_settlement_run r where (r.period_end at time zone 'Africa/Nairobi')::date = x.d),
      'Not built yet'),
    (select sum(l.net_cents)::bigint from public.fin_settlement_line l
      join public.fin_settlement_run r on r.id = l.run_id
     where (r.period_end at time zone 'Africa/Nairobi')::date = x.d),
    case
      when exists (select 1 from public.fin_settlement_run r
                    where (r.period_end at time zone 'Africa/Nairobi')::date = x.d
                      and r.state in ('sent', 'reconciled', 'closed')) then 'done'
      when exists (select 1 from public.fin_settlement_run r
                    where (r.period_end at time zone 'Africa/Nairobi')::date = x.d) then 'in_progress'
      when x.d < v_today then 'overdue'
      else 'upcoming'
    end,
    '/finance?tab=settlement'
  from generate_series(
         date_trunc('week', v_today::timestamp)::date - 56,
         date_trunc('week', v_today::timestamp)::date + 56,
         interval '7 days') g(d_ts)
  cross join lateral (select g.d_ts::date as d) x;

  /* VAT and withholding, both due on the 20th for the month
     before. The amount is what is sitting in the tax accounts
     for that month, so the calendar shows a figure rather than
     a reminder. */
  insert into public.fin_calendar_entry (id, due_on, kind, label, detail, amount_cents, state, href)
  select
    k.kind || ':' || to_char(m.month, 'YYYY-MM'),
    (m.month + interval '1 month' + interval '19 days')::date,
    k.kind,
    k.label,
    'For ' || to_char(m.month, 'FMMonth YYYY'),
    coalesce((select sum(e.credit - e.debit)::bigint
                from ledger.entry e
                join ledger.account a on a.code = e.account_code
               where a.base = k.account
                 and e.effective_at >= m.month
                 and e.effective_at < m.month + interval '1 month'), 0),
    case when (m.month + interval '1 month' + interval '19 days')::date < v_today
         then 'overdue' else 'upcoming' end,
    '/finance?tab=tax'
  from (
    select date_trunc('month', (now() at time zone 'Africa/Nairobi'))::date
             - (n || ' months')::interval as month
      from generate_series(0, 3) n
  ) m
  cross join (values
    ('vat', 'VAT return', 'tax.vat_output'),
    ('withholding', 'Withholding remittance', 'tax.withholding')
  ) k(kind, label, account);

  /* Month-end close. */
  insert into public.fin_calendar_entry (id, due_on, kind, label, detail, state, href)
  select
    'close:' || to_char(m.month, 'YYYY-MM'),
    (m.month + interval '1 month' - interval '1 day')::date,
    'close',
    'Month-end close',
    to_char(m.month, 'FMMonth YYYY'),
    case when (m.month + interval '1 month' - interval '1 day')::date < v_today
         then 'overdue' else 'upcoming' end,
    '/finance?tab=exports'
  from (
    select date_trunc('month', (now() at time zone 'Africa/Nairobi'))::date
             + (n || ' months')::interval as month
      from generate_series(-2, 1) n
  ) m;

  select count(*)::integer into v_rows from public.fin_calendar_entry;
  return v_rows;
end;
$$;

-- ═════════════════════════════════════════ 3, continued: one total check
--
-- Last, so the lock on public."order" is held for as short a time as possible.

alter table public."order" drop constraint if exists order_total_is_the_sum;

comment on constraint order_total_adds_up on public."order" is
  'The total is the sum of its lines, weather surcharge included, enforced. "No fee is hidden in the item price" is a rule on the Fees tab; this is the same rule where it cannot be worked around.';
