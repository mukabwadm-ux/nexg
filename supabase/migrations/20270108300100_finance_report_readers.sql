-- Finance → Reports: the Riders and Customers tabs.
--
-- Two read-only readers for a Nairobi-day period, each with the figures for
-- the period of the same length just before it, so every KPI card can say
-- how it moved:
--
--   rpc_finance_report_riders(p_from, p_to)
--     What riders earned, from public.rider_earning: one row per delivery,
--     in whole shillings. Test deliveries (is_test) are left out. Amounts
--     come back in cents (shillings × 100), like every other Finance reader.
--       kpis     active_riders, deliveries, earnings_cents, tips_cents,
--                cash_collected_cents, avg_per_delivery_cents; each
--                {now, before}. Average per delivery is null with no
--                deliveries.
--       series   [{day, earnings_cents, deliveries}] for every day of the
--                period.
--       riders   [{id, name, deliveries, earnings_cents, tips_cents,
--                bonus_cents, penalty_cents, cash_collected_cents}], most
--                earned first, at most 500. Bonuses are the pickup and peak
--                bonuses; earnings are the delivery's total, tips and
--                bonuses in, penalties out.
--
--   rpc_finance_report_customers(p_from, p_to)
--     Guests who paid for an order or a stay (public.payment, state paid,
--     by paid_at). Featured slots and rider float top-ups are merchants and
--     riders paying NexG, not customers, and are left out. A customer is
--     the guest on the payment, or else the paying phone (one number however
--     it was written, via fn_mpesa_phone); a payment with neither counts in
--     the totals but not as a customer.
--       kpis     customers, new_customers (first paid payment ever falls in
--                the period), returning_customers, repeat_rate_pct (share
--                of customers with two or more paid payments in the
--                period), avg_spend_cents (customers' spend ÷ customers),
--                total_paid_cents, unidentified_payments; each {now,
--                before}.
--       series   [{day, new, returning}] for every day of the period:
--                customers who paid that day, new when it was their first
--                payment ever.
--       top      [{label, payments, spend_cents, first_paid_at}], the 50
--                who spent most. The label is "Customer ···" and the last
--                three digits of the phone, as the Transactions list shows
--                customers; no name, phone or guest id leaves the database.
--       by_intent [{intent, payments, spend_cents}] for order and stay.
--
-- Access: security definer, because the Finance role cannot read riders,
-- earnings or guests row by row. Each checks Finance access and the period
-- first (fn_finance_period_check: anyone who reaches Finance, two years at
-- most). They read; they write nothing, so there is nothing to audit.
--
-- Rollback:
--   drop function public.rpc_finance_report_riders(date, date),
--     public.rpc_finance_report_customers(date, date);

-- ═══════════════════════════════════════════════════════════════ riders

create or replace function public.rpc_finance_report_riders(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_lo timestamptz;
  v_hi timestamptz;
  v_before timestamptz;
begin
  perform public.fn_finance_period_check(p_from, p_to);

  v_days := p_to - p_from + 1;
  v_lo := p_from::timestamp at time zone 'Africa/Nairobi';
  v_hi := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';
  v_before := (p_from - v_days)::timestamp at time zone 'Africa/Nairobi';

  return (
    /* Every real delivery in the period and the one before it, in cents. */
    with e as (
      select x.rider_id,
             (x.earned_at at time zone 'Africa/Nairobi')::date as day,
             x.earned_at >= v_lo as is_now,
             x.total_kes * 100 as earnings_cents,
             x.tip_kes * 100 as tips_cents,
             (x.pickup_bonus_kes + x.peak_bonus_kes) * 100 as bonus_cents,
             x.penalty_kes * 100 as penalty_cents,
             x.cash_collected_kes * 100 as cash_cents
        from public.rider_earning x
       where not x.is_test
         and x.earned_at >= v_before
         and x.earned_at < v_hi
    ),
    t as (
      select count(distinct e.rider_id) filter (where e.is_now) as riders_now,
             count(distinct e.rider_id) filter (where not e.is_now) as riders_before,
             count(*) filter (where e.is_now) as deliveries_now,
             count(*) filter (where not e.is_now) as deliveries_before,
             coalesce(sum(e.earnings_cents) filter (where e.is_now), 0)::bigint as earnings_now,
             coalesce(sum(e.earnings_cents) filter (where not e.is_now), 0)::bigint as earnings_before,
             coalesce(sum(e.tips_cents) filter (where e.is_now), 0)::bigint as tips_now,
             coalesce(sum(e.tips_cents) filter (where not e.is_now), 0)::bigint as tips_before,
             coalesce(sum(e.cash_cents) filter (where e.is_now), 0)::bigint as cash_now,
             coalesce(sum(e.cash_cents) filter (where not e.is_now), 0)::bigint as cash_before
        from e
    )
    select jsonb_build_object(
      'kpis', jsonb_build_object(
        'active_riders', jsonb_build_object('now', t.riders_now, 'before', t.riders_before),
        'deliveries', jsonb_build_object('now', t.deliveries_now, 'before', t.deliveries_before),
        'earnings_cents', jsonb_build_object('now', t.earnings_now, 'before', t.earnings_before),
        'tips_cents', jsonb_build_object('now', t.tips_now, 'before', t.tips_before),
        'cash_collected_cents', jsonb_build_object('now', t.cash_now, 'before', t.cash_before),
        'avg_per_delivery_cents', jsonb_build_object(
          'now', case when t.deliveries_now > 0
                      then round(t.earnings_now::numeric / t.deliveries_now)::bigint end,
          'before', case when t.deliveries_before > 0
                         then round(t.earnings_before::numeric / t.deliveries_before)::bigint end)),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'day', d.day::text,
                 'earnings_cents', coalesce(s.earnings_cents, 0),
                 'deliveries', coalesce(s.deliveries, 0)) order by d.day), '[]'::jsonb)
          from (select p_from + n as day from generate_series(0, p_to - p_from) n) d
          left join (
            select e.day, sum(e.earnings_cents)::bigint as earnings_cents, count(*) as deliveries
              from e
             where e.is_now
             group by e.day
          ) s on s.day = d.day),
      'riders', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', r.id,
                 'name', r.name,
                 'deliveries', r.deliveries,
                 'earnings_cents', r.earnings_cents,
                 'tips_cents', r.tips_cents,
                 'bonus_cents', r.bonus_cents,
                 'penalty_cents', r.penalty_cents,
                 'cash_collected_cents', r.cash_cents)
               order by r.earnings_cents desc, r.deliveries desc, r.name, r.id), '[]'::jsonb)
          from (
            select e.rider_id as id,
                   coalesce(nullif(btrim(coalesce(rd.first_name, '') || ' ' || coalesce(rd.last_name, '')), ''),
                            'Rider') as name,
                   count(*) as deliveries,
                   sum(e.earnings_cents)::bigint as earnings_cents,
                   sum(e.tips_cents)::bigint as tips_cents,
                   sum(e.bonus_cents)::bigint as bonus_cents,
                   sum(e.penalty_cents)::bigint as penalty_cents,
                   sum(e.cash_cents)::bigint as cash_cents
              from e
              join public.rider rd on rd.id = e.rider_id
             where e.is_now
             group by e.rider_id, rd.first_name, rd.last_name
             order by sum(e.earnings_cents) desc, count(*) desc, e.rider_id
             limit 500
          ) r))
      from t
  );
end;
$$;

comment on function public.rpc_finance_report_riders(date, date) is
  'Finance → Reports → Riders: active riders, deliveries, earnings, tips and cash collected for a Nairobi-day period and the one before it, per day and per rider, in cents, test deliveries left out. Reads only.';

-- ═════════════════════════════════════════════════════════════ customers

create or replace function public.rpc_finance_report_customers(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_lo timestamptz;
  v_hi timestamptz;
  v_before timestamptz;
begin
  perform public.fn_finance_period_check(p_from, p_to);

  v_days := p_to - p_from + 1;
  v_lo := p_from::timestamp at time zone 'Africa/Nairobi';
  v_hi := (p_to + 1)::timestamp at time zone 'Africa/Nairobi';
  v_before := (p_from - v_days)::timestamp at time zone 'Africa/Nairobi';

  return (
    /*
     * Every paid order and stay up to the end of the period, with who paid
     * it: the guest, else the paying phone, else nobody we can tell apart.
     * The earliest ones only say when each customer first paid.
     */
    with paid as (
      select p.intent::text as intent,
             p.amount_cents,
             p.paid_at,
             case
               when p.guest_id is not null then 'guest:' || p.guest_id::text
               when ph.number is not null then 'phone:' || ph.number
             end as who,
             coalesce(nullif(btrim(g.phone), ''), nullif(btrim(p.payer_phone), '')) as phone
        from public.payment p
        left join public.guest g on g.id = p.guest_id
        cross join lateral (
          select coalesce(public.fn_mpesa_phone(p.payer_phone),
                          nullif(regexp_replace(coalesce(p.payer_phone, ''), '\D', '', 'g'), '')) as number
        ) ph
       where p.state = 'paid'
         and p.intent in ('order', 'stay')
         and p.paid_at < v_hi
    ),
    firsts as (
      select x.who, min(x.paid_at) as first_paid_at
        from paid x
       where x.who is not null
       group by x.who
    ),
    /* The period and the one before it. */
    w as (
      select x.*,
             x.paid_at >= v_lo as is_now,
             (x.paid_at at time zone 'Africa/Nairobi')::date as day
        from paid x
       where x.paid_at >= v_before
    ),
    /* One row per customer per period. */
    per as (
      select w.is_now,
             w.who,
             f.first_paid_at,
             f.first_paid_at >= case when w.is_now then v_lo else v_before end as is_new,
             count(*) as payments,
             sum(w.amount_cents)::bigint as spend_cents,
             (array_agg(w.phone order by w.paid_at desc) filter (where w.phone is not null))[1] as phone
        from w
        join firsts f on f.who = w.who
       group by w.is_now, w.who, f.first_paid_at
    ),
    k as (
      select count(*) filter (where per.is_now) as customers_now,
             count(*) filter (where not per.is_now) as customers_before,
             count(*) filter (where per.is_now and per.is_new) as new_now,
             count(*) filter (where not per.is_now and per.is_new) as new_before,
             count(*) filter (where per.is_now and per.payments >= 2) as repeat_now,
             count(*) filter (where not per.is_now and per.payments >= 2) as repeat_before,
             coalesce(sum(per.spend_cents) filter (where per.is_now), 0) as spend_now,
             coalesce(sum(per.spend_cents) filter (where not per.is_now), 0) as spend_before
        from per
    ),
    tot as (
      select coalesce(sum(w.amount_cents) filter (where w.is_now), 0)::bigint as paid_now,
             coalesce(sum(w.amount_cents) filter (where not w.is_now), 0)::bigint as paid_before,
             count(*) filter (where w.is_now and w.who is null) as unidentified_now,
             count(*) filter (where not w.is_now and w.who is null) as unidentified_before
        from w
    )
    select jsonb_build_object(
      'kpis', jsonb_build_object(
        'customers', jsonb_build_object('now', k.customers_now, 'before', k.customers_before),
        'new_customers', jsonb_build_object('now', k.new_now, 'before', k.new_before),
        'returning_customers', jsonb_build_object(
          'now', k.customers_now - k.new_now,
          'before', k.customers_before - k.new_before),
        'repeat_rate_pct', jsonb_build_object(
          'now', case when k.customers_now > 0
                      then round(k.repeat_now * 100.0 / k.customers_now, 1) end,
          'before', case when k.customers_before > 0
                         then round(k.repeat_before * 100.0 / k.customers_before, 1) end),
        'avg_spend_cents', jsonb_build_object(
          'now', case when k.customers_now > 0
                      then round(k.spend_now / k.customers_now)::bigint end,
          'before', case when k.customers_before > 0
                         then round(k.spend_before / k.customers_before)::bigint end),
        'total_paid_cents', jsonb_build_object('now', tot.paid_now, 'before', tot.paid_before),
        'unidentified_payments', jsonb_build_object(
          'now', tot.unidentified_now,
          'before', tot.unidentified_before)),
      'series', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'day', d.day::text,
                 'new', coalesce(s.n_new, 0),
                 'returning', coalesce(s.n_returning, 0)) order by d.day), '[]'::jsonb)
          from (select p_from + n as day from generate_series(0, p_to - p_from) n) d
          left join (
            select y.day,
                   count(*) filter (where y.first_day = y.day) as n_new,
                   count(*) filter (where y.first_day < y.day) as n_returning
              from (
                select distinct w.day, w.who,
                       (f.first_paid_at at time zone 'Africa/Nairobi')::date as first_day
                  from w
                  join firsts f on f.who = w.who
                 where w.is_now
              ) y
             group by y.day
          ) s on s.day = d.day),
      'top', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'label', c.label,
                 'payments', c.payments,
                 'spend_cents', c.spend_cents,
                 'first_paid_at', c.first_paid_at)
               order by c.spend_cents desc, c.payments desc, c.first_paid_at), '[]'::jsonb)
          from (
            select 'Customer'
                     || coalesce(' ···' || nullif(right(regexp_replace(per.phone, '\D', '', 'g'), 3), ''), '')
                     as label,
                   per.payments,
                   per.spend_cents,
                   per.first_paid_at
              from per
             where per.is_now
             order by per.spend_cents desc, per.payments desc, per.first_paid_at
             limit 50
          ) c),
      'by_intent', (
        select jsonb_agg(jsonb_build_object(
                 'intent', b.intent,
                 'payments', b.payments,
                 'spend_cents', b.spend_cents) order by b.sort)
          from (
            select i.intent, i.sort,
                   count(w.intent) as payments,
                   coalesce(sum(w.amount_cents), 0)::bigint as spend_cents
              from (values ('order', 1), ('stay', 2)) i (intent, sort)
              left join w on w.intent = i.intent and w.is_now
             group by i.intent, i.sort
          ) b))
      from k
      cross join tot
  );
end;
$$;

comment on function public.rpc_finance_report_customers(date, date) is
  'Finance → Reports → Customers: guests who paid for orders and stays in a Nairobi-day period and the one before it (new, returning, repeat rate, spend), per day, the top 50 by spend with masked labels, and spend by what was paid for. No name, phone or guest id is returned. Reads only.';

-- ═════════════════════════════════════════════════════════════ access

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'rpc\_finance\_report\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
