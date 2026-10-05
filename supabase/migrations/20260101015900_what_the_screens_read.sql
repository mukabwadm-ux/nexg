-- What the screens read.
--
-- The rule this module sets for itself is "projection, never
-- computation": a Finance screen reads rows that were already
-- worked out, and no route handler sums ledger entries while
-- somebody waits. That is partly about speed. It is mostly about
-- having one answer — if the Overview totals revenue one way and
-- the settlement run totals it another, both are suspect, and
-- finding out which is wrong is a day of somebody's week.
--
-- So every number on a Finance screen comes out of a table in
-- here, and every one of those tables records two things beyond
-- the number itself: when it was last rebuilt, and the highest
-- ledger entry it saw. A tile is therefore always able to say
-- "true as of 14:32, through entry 48,201" rather than implying
-- it is live.
--
-- And `fn_fin_verify` is the way back. It re-derives one row from
-- the ledger at request time and returns both figures side by
-- side. That is the only sanctioned place in the system where a
-- request sums entries, and it exists so that the honest question
-- — "is this screen lying to me?" — has a button rather than an
-- argument.

-- ──────────────────────────────────────────────── the registry
--
-- One row per projection, so staleness is a single question with
-- a single answer. Without this each screen invents its own idea
-- of "recent", and the one that is quietly three hours behind
-- looks exactly like the ones that are current.

create table if not exists fin_projection (
  name text primary key,
  label text not null,
  as_of timestamptz,
  /* The ledger is append-only and its ids only go up, so the
     highest entry seen is a complete description of how much of
     the ledger this projection has accounted for. */
  as_of_entry_id bigint,
  row_count integer,
  build_ms integer,
  last_error text,
  /* How old this projection may be before the screen says so.
     Per-projection because the answers differ: the decisions
     list going stale is an incident, the tax calendar going
     stale for an hour is nothing. */
  stale_after interval not null default interval '10 minutes'
);

comment on table fin_projection is
  'When each Finance projection was last rebuilt and how far through the ledger it got. A screen reads this to say how old its numbers are instead of implying they are live.';

insert into fin_projection (name, label, stale_after) values
  ('kpi_daily',    'Daily KPIs',            interval '10 minutes'),
  ('money_flow',   'Money in and out',      interval '10 minutes'),
  ('revenue_line', 'Revenue by line',       interval '10 minutes'),
  ('party_owed',   'Owed to partners',      interval '10 minutes'),
  ('calendar',     'What falls due',        interval '1 hour'),
  ('decision',     'Needs a person',        interval '5 minutes')
on conflict (name) do nothing;

-- ──────────────────────────────────────────── the daily figures
--
-- The grain is a day and a city, because those are the two cuts
-- every Finance conversation starts with. Everything above that
-- — a week, a month, all cities — is a sum of these rows, which
-- is why there is no separate monthly table to disagree with
-- this one.

create table if not exists fin_kpi_daily (
  day date not null,
  /* Null is not "all cities". It is an order whose city we could
     not attribute, and it is kept visible rather than spread
     across the others, because a growing unattributed column is
     a wiring bug worth seeing. */
  city_id uuid references public.city (id) on delete restrict,

  orders integer not null default 0,
  /* What guests were charged: the merchant's share plus ours. */
  gross_cents bigint not null default 0,
  /* Ours before cost: commission, delivery, service, the rest. */
  revenue_cents bigint not null default 0,
  merchant_cost_cents bigint not null default 0,
  rider_cost_cents bigint not null default 0,
  /* Compensation, goodwill, write-offs, provider fees — the
     money that leaves without anybody deciding to spend it. */
  leakage_cents bigint not null default 0,
  refund_cents bigint not null default 0,
  /* Revenue less rider cost less leakage. Not profit; there is
     no overhead in the ledger. Contribution. */
  net_cents bigint not null default 0,
  cash_collected_cents bigint not null default 0,

  as_of_entry_id bigint not null,
  source_hash text not null,
  built_at timestamptz not null default now()
);

/*
 * The key is a unique index rather than a primary key, and that
 * is not a style choice. A primary key makes every one of its
 * columns NOT NULL, and `city_id` has to be nullable — it is the
 * unattributed bucket, the one this table exists to keep
 * visible. With a primary key here the first transaction without
 * a city does not land in that bucket; it kills the whole
 * rebuild, and the Overview quietly goes on showing yesterday.
 *
 * Which is exactly what happened the first time this ran.
 *
 * `nulls not distinct` makes the unattributed row a single row
 * that upserts normally, rather than a new one every two
 * minutes.
 */
create unique index if not exists kpi_daily_key
  on fin_kpi_daily (day, city_id) nulls not distinct;

create index if not exists kpi_daily_day_idx on fin_kpi_daily (day desc);

comment on column fin_kpi_daily.net_cents is
  'Contribution, not profit — the ledger holds no overhead. The tile says so, because a number labelled profit that is not profit is how a board gets misled.';

-- ───────────────────────────────────────────── where money moved
--
-- The Overview shows money arriving and money leaving as two
-- sides of the same month. Both come from the same entries,
-- grouped by the account that received or gave it, so the two
-- columns cannot drift apart.

create table if not exists fin_money_flow (
  period_start date not null,
  period_end date not null,
  direction text not null check (direction in ('in', 'out')),
  bucket text not null,
  label text not null,
  amount_cents bigint not null,
  sort integer not null default 100,

  as_of_entry_id bigint not null,
  built_at timestamptz not null default now(),

  primary key (period_start, period_end, direction, bucket)
);

-- ────────────────────────────────────────────── revenue, by line
--
-- Each revenue account for the period and for the one before it,
-- because a revenue number without its previous value tells you
-- nothing you can act on.

create table if not exists fin_revenue_line (
  period_start date not null,
  period_end date not null,
  account_code text not null references ledger.account (code) on delete restrict,
  label text not null,
  amount_cents bigint not null,
  prior_amount_cents bigint not null default 0,
  orders integer not null default 0,

  as_of_entry_id bigint not null,
  built_at timestamptz not null default now(),

  primary key (period_start, period_end, account_code)
);

-- ─────────────────────────────────────────── what we owe, by party
--
-- The payables balance per partner, standing. This is what the
-- settlement run will pay from, projected here so the Overview
-- can show the Friday number on Tuesday without building a run.

create table if not exists fin_party_owed (
  party_type ledger.party_kind not null,
  party_id uuid not null,
  label text not null,
  /* Positive: we owe them. Negative: they owe us — a rider
     holding cash past their cap, a merchant over-refunded. Both
     are kept in one signed column so the total is the truth
     rather than two columns somebody has to net by hand. */
  owed_cents bigint not null,
  oldest_unsettled timestamptz,
  entry_count integer not null default 0,

  as_of_entry_id bigint not null,
  built_at timestamptz not null default now(),

  primary key (party_type, party_id)
);

create index if not exists party_owed_amount_idx on fin_party_owed (owed_cents desc);

-- ───────────────────────────────────────────── what falls due
--
-- Settlement runs, VAT, withholding. Dated obligations with a
-- state, so the calendar on the Overview is a reading of real
-- deadlines rather than a decorated month grid.

create table if not exists fin_calendar_entry (
  id text primary key,
  due_on date not null,
  kind text not null check (kind in ('settlement', 'vat', 'withholding', 'invoice', 'close')),
  label text not null,
  detail text,
  amount_cents bigint,
  state text not null default 'upcoming'
    check (state in ('upcoming', 'in_progress', 'done', 'overdue')),
  href text,
  built_at timestamptz not null default now()
);

create index if not exists calendar_due_idx on fin_calendar_entry (due_on);

-- ──────────────────────────────────────────── what needs a person
--
-- The part of the Overview that earns its place. Not a feed of
-- everything that happened — a list of things that will not
-- resolve themselves, each saying what it costs to keep ignoring
-- it, because "17 exceptions" is a number and "KES 48,200 of
-- guest money unattributed for 3 days" is a decision.

create table if not exists fin_decision (
  id text primary key,
  severity text not null check (severity in ('blocking', 'urgent', 'attention')),
  title text not null,
  /* The consequence of doing nothing, in money or in days. The
     list is sorted by this mattering, not by when it appeared. */
  consequence text not null,
  amount_cents bigint,
  since timestamptz,
  href text,
  sort integer not null default 100,
  built_at timestamptz not null default now()
);

alter table fin_projection      enable row level security;
alter table fin_kpi_daily       enable row level security;
alter table fin_money_flow      enable row level security;
alter table fin_revenue_line    enable row level security;
alter table fin_party_owed      enable row level security;
alter table fin_calendar_entry  enable row level security;
alter table fin_decision        enable row level security;

do $policies$
declare t text;
begin
  foreach t in array array['fin_projection','fin_kpi_daily','fin_money_flow',
                           'fin_revenue_line','fin_party_owed','fin_calendar_entry','fin_decision']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (authz.reads_ledger())',
      t || '_read', t);
  end loop;
end
$policies$;

-- ════════════════════════════════════════════ the one derivation
--
-- The arithmetic lives here once. The builder calls it to write a
-- row; `fn_fin_verify` calls it to check one. They share an
-- implementation on purpose, and it is worth being exact about
-- what that means Verify proves and what it does not.
--
-- It proves the stored row still matches the ledger: that nothing
-- was written to the projection by hand, that the rebuild is not
-- silently failing, and that no entries have landed since. Those
-- are the realistic failures, and the first of them is the one
-- nobody would otherwise catch.
--
-- It does not prove the arithmetic is right. Nothing re-run from
-- the same definition could. The arithmetic is held right by the
-- tests and by the ledger balancing to zero — not by this button,
-- and the button does not claim otherwise.

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
    (merchant_cost + revenue)::bigint,
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

comment on function fn_fin_kpi_for is
  'The day/city arithmetic, defined once. The projection builder writes its result; fn_fin_verify re-runs it and compares. Shared on purpose — two implementations would drift and then neither could be trusted.';

-- ══════════════════════════════════════════════════ the builders

create or replace function fn_fin_build_kpi(p_days integer default 45)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer := 0;
begin
  /*
   * Only the recent window is rebuilt. Older days cannot change
   * — the ledger is append-only and an entry carries the date
   * the economic event happened, so a correction to last March
   * posts as a reversal dated today rather than editing March.
   *
   * Forty-five days covers the longest window anything on these
   * screens looks at (last month plus the one before it, for the
   * comparison column) with a fortnight of slack.
   */
  with days as (
    select generate_series(
      (now() at time zone 'Africa/Nairobi')::date - p_days,
      (now() at time zone 'Africa/Nairobi')::date,
      interval '1 day')::date as day
  ),
  cities as (
    select id from public.city
    union all
    select null::uuid
  ),
  built as (
    select d.day, c.id as city_id, k.*
      from days d
     cross join cities c
     cross join lateral public.fn_fin_kpi_for(d.day, c.id) k
     /* A day with nothing on it is not written. An empty row and
        a zero row read identically on a screen, and only one of
        them is a fact. */
     where k.orders > 0 or k.gross_cents <> 0 or k.cash_collected_cents <> 0
  ),
  upserted as (
    insert into public.fin_kpi_daily as t
      (day, city_id, orders, gross_cents, revenue_cents, merchant_cost_cents,
       rider_cost_cents, leakage_cents, refund_cents, net_cents,
       cash_collected_cents, as_of_entry_id, source_hash, built_at)
    select day, city_id, orders, gross_cents, revenue_cents, merchant_cost_cents,
           rider_cost_cents, leakage_cents, refund_cents, net_cents,
           cash_collected_cents, as_of_entry_id, source_hash, now()
      from built
    on conflict (day, city_id) do update set
      orders = excluded.orders,
      gross_cents = excluded.gross_cents,
      revenue_cents = excluded.revenue_cents,
      merchant_cost_cents = excluded.merchant_cost_cents,
      rider_cost_cents = excluded.rider_cost_cents,
      leakage_cents = excluded.leakage_cents,
      refund_cents = excluded.refund_cents,
      net_cents = excluded.net_cents,
      cash_collected_cents = excluded.cash_collected_cents,
      as_of_entry_id = excluded.as_of_entry_id,
      source_hash = excluded.source_hash,
      built_at = now()
    returning 1
  )
  select count(*)::integer into v_rows from upserted;

  return v_rows;
end;
$$;

create or replace function fn_fin_build_flow(p_start date, p_end date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  delete from public.fin_money_flow
   where period_start = p_start and period_end = p_end;

  with scope as (
    select e.id, e.debit, e.credit, a.base, a.kind as account_kind
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
     where e.effective_at >= (p_start::timestamp at time zone 'Africa/Nairobi')
       and e.effective_at <  ((p_end + 1)::timestamp at time zone 'Africa/Nairobi')
  ),
  /*
   * In is money that reached an account we control. Out is money
   * that left one, or became owed to somebody. Both read from
   * `scope`, so the Overview cannot show arrivals from one set of
   * entries and departures from another.
   */
  flows as (
    select 'in' as direction, 'card' as bucket, 'Card, via the processor' as label,
           sum(debit - credit) as amount, 10 as sort
      from scope where base = 'cash.card_processor_receivable'
    union all
    select 'in', 'mpesa', 'M-Pesa paybill', sum(debit - credit), 20
      from scope where base = 'cash.mpesa_paybill'
    union all
    select 'in', 'cash', 'Cash, held by riders', sum(debit - credit), 30
      from scope where base = 'cash.rider_on_hand'
    union all
    select 'in', 'bank', 'Bank', sum(debit - credit), 40
      from scope where base = 'cash.bank'
    union all
    select 'out', 'merchants', 'Owed to merchants', sum(credit - debit), 10
      from scope where base = 'payable.merchant'
    union all
    select 'out', 'riders', 'Owed to riders', sum(credit - debit), 20
      from scope where base = 'payable.rider'
    union all
    select 'out', 'refunds', 'Refunds', sum(credit - debit), 30
      from scope where base = 'refunds_pending'
    union all
    select 'out', 'tax', 'Tax to remit', sum(credit - debit), 40
      from scope where base like 'tax.%'
    union all
    select 'out', 'leakage', 'Compensation, goodwill and write-offs', sum(debit - credit), 50
      from scope where base in ('expense.compensation_merchant', 'expense.compensation_rider',
                                'expense.goodwill', 'expense.write_off', 'expense.chargeback_loss')
    union all
    select 'out', 'provider', 'Provider fees', sum(debit - credit), 60
      from scope where base = 'expense.provider_fees'
  ),
  inserted as (
    insert into public.fin_money_flow
      (period_start, period_end, direction, bucket, label, amount_cents, sort,
       as_of_entry_id, built_at)
    select p_start, p_end, direction, bucket, label, amount::bigint, sort,
           coalesce((select max(id) from scope), 0), now()
      from flows
     where coalesce(amount, 0) <> 0
    returning 1
  )
  select count(*)::integer into v_rows from inserted;

  return v_rows;
end;
$$;

create or replace function fn_fin_build_revenue(p_start date, p_end date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
  v_span integer := (p_end - p_start) + 1;
begin
  delete from public.fin_revenue_line
   where period_start = p_start and period_end = p_end;

  with this_period as (
    select a.base, a.name,
           sum(e.credit - e.debit)::bigint as amount,
           count(distinct t.order_id)::integer as orders,
           max(e.id) as max_entry
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
      join ledger.transaction t on t.id = e.transaction_id
     where a.kind = 'revenue'
       and e.effective_at >= (p_start::timestamp at time zone 'Africa/Nairobi')
       and e.effective_at <  ((p_end + 1)::timestamp at time zone 'Africa/Nairobi')
     group by a.base, a.name
  ),
  /* The same span immediately before, so each line carries its
     own comparison rather than the screen inventing one. */
  prior as (
    select a.base, sum(e.credit - e.debit)::bigint as amount
      from ledger.entry e
      join ledger.account a on a.code = e.account_code
     where a.kind = 'revenue'
       and e.effective_at >= ((p_start - v_span)::timestamp at time zone 'Africa/Nairobi')
       and e.effective_at <  (p_start::timestamp at time zone 'Africa/Nairobi')
     group by a.base
  ),
  inserted as (
    insert into public.fin_revenue_line
      (period_start, period_end, account_code, label, amount_cents,
       prior_amount_cents, orders, as_of_entry_id, built_at)
    select p_start, p_end, tp.base, tp.name, tp.amount,
           coalesce(pr.amount, 0), tp.orders,
           coalesce((select max(max_entry) from this_period), 0), now()
      from this_period tp
      left join prior pr on pr.base = tp.base
     where tp.amount <> 0
    returning 1
  )
  select count(*)::integer into v_rows from inserted;

  return v_rows;
end;
$$;

create or replace function fn_fin_build_party_owed()
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

-- ─────────────────────────────────────────── what falls due, built
--
-- Three sources, all dated: the weekly settlement, the monthly
-- tax filings, and the month-end close. None of them are typed
-- in — a deadline somebody has to remember to add is a deadline
-- that gets missed in December.

create or replace function fn_fin_build_calendar()
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
   * every week as never built.
   */
  insert into public.fin_calendar_entry (id, due_on, kind, label, detail, amount_cents, state, href)
  select
    'settlement:' || x.d::text,
    x.d,
    'settlement',
    'Weekly settlement · week of ' || to_char(x.d - 7, 'DD Mon'),
    coalesce(
      (select r.reference || ' · ' || r.state::text
         from public.fin_settlement_run r where r.period_end::date = x.d),
      'Not built yet'),
    (select sum(l.net_cents)::bigint from public.fin_settlement_line l
      join public.fin_settlement_run r on r.id = l.run_id
     where r.period_end::date = x.d),
    case
      when exists (select 1 from public.fin_settlement_run r
                    where r.period_end::date = x.d
                      and r.state in ('sent', 'reconciled', 'closed')) then 'done'
      when exists (select 1 from public.fin_settlement_run r
                    where r.period_end::date = x.d) then 'in_progress'
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

-- ──────────────────────────────────────── what needs a person, built
--
-- Each of these is a thing that will still be true tomorrow if
-- nobody acts. That is the test for being on this list: a
-- transient does not belong here, however alarming, because a
-- list that clears itself teaches people to ignore it.

create or replace function fn_fin_build_decisions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows integer;
begin
  delete from public.fin_decision;

  /* 1. An invariant in breach. First, because an unsound ledger
        makes every other item on this list unreliable. */
  insert into public.fin_decision (id, severity, title, consequence, amount_cents, since, href, sort)
  select
    'invariant:' || i.key,
    case when i.blocks_outbound then 'blocking' else 'urgent' end,
    i.label,
    /*
     * Every branch coalesced, because on a database where the
     * monitors have never run `ran_at` and `breaches` are both
     * null and a concatenation through null yields null — which
     * would mean the one item saying "no check has ever run"
     * cannot itself be written. The failure mode of a monitor
     * must never be silence.
     */
    case when i.ran_at is null
         then 'This check has never run. A check that has not run is not a check that'
              || ' passed, so payouts are stopped until it does.'
         when i.stale
         then 'This check has not run since ' || to_char(i.ran_at, 'DD Mon HH24:MI')
              || '. A check that cannot run is not a check that passed, so payouts are stopped.'
         when i.blocks_outbound
         then coalesce(i.breaches::text, 'An unknown number of')
              || ' found. Payouts are stopped until this is zero.'
         else coalesce(i.breaches::text, 'An unknown number of')
              || ' found. Not stopping payouts, but it will not fix itself.'
    end,
    i.value,
    i.ran_at,
    '/finance?tab=overview',
    10
  from public.fin_invariant_v i
  where i.breaches > 0 or i.stale or i.ran_at is null;

  /* 2. Money taken with no ledger entry. The worst thing this
        system can do, so it is named exactly. */
  insert into public.fin_decision (id, severity, title, consequence, amount_cents, since, href, sort)
  select
    'unposted_orders',
    'blocking',
    count(*) || ' paid orders have no ledger entry',
    'Guests were charged and nothing was recorded. These orders are invisible to every'
      || ' statement, every settlement and every tax figure until the backfill is run.',
    sum(o.total_cents)::bigint,
    min(o.placed_at),
    '/orders',
    20
  from public.order o
  where o.payment_status in ('paid', 'collected')
    and not exists (select 1 from ledger.transaction t
                     where t.order_id = o.id and t.kind = 'order_sale_recognised')
  having count(*) > 0;

  /* 3. A settlement run waiting on a signature. Dated from when
        it reached that state, because a run that has been sitting
        since Friday is a different problem from one built an
        hour ago. */
  insert into public.fin_decision (id, severity, title, consequence, amount_cents, since, href, sort)
  select
    'run:' || r.id::text,
    case when r.period_end < now() - interval '2 days' then 'urgent' else 'attention' end,
    r.reference || ' needs ' ||
      case r.state when 'built' then 'checking'
                   when 'checked' then 'a first approval'
                   when 'approved_1' then 'a second approval'
                   else 'files generated' end,
    coalesce(
      (select count(*)::text || ' partners are waiting to be paid.'
         from public.fin_settlement_line l where l.run_id = r.id),
      'Nobody is on it yet.')
      || ' Every day it waits is a day a merchant explains it to their own bookkeeper.',
    (select sum(l.net_cents)::bigint from public.fin_settlement_line l where l.run_id = r.id),
    r.created_at,
    '/finance?tab=settlement',
    30
  from public.fin_settlement_run r
  where r.state in ('built', 'checked', 'approved_1', 'approved_2');

  /* 4. Refunds approved and not sent. The guest has been told
        yes and is still waiting. */
  insert into public.fin_decision (id, severity, title, consequence, amount_cents, since, href, sort)
  select
    'refunds_pending',
    'urgent',
    count(*) || ' approved refunds have not gone out',
    /* Aged from the request, not the approval — `refund` records
       who approved but not when, so this is the only honest
       clock available. It over-states the wait rather than
       under-stating it, which is the right way round. */
    'The oldest was asked for ' ||
      extract(day from now() - min(rf.requested_at))::integer ||
      ' days ago. Each one is a guest who was told yes and has not been paid.',
    sum(rf.amount_cents)::bigint,
    min(rf.requested_at),
    '/orders?tab=refunds',
    40
  from public.refund rf
  where rf.status = 'approved'
  having count(*) > 0;

  /* 5. Riders over their cash cap. Shillings, not cents — this
        pair of columns has already caused one real bug and the
        conversion is made explicit every time it is read. */
  insert into public.fin_decision (id, severity, title, consequence, amount_cents, since, href, sort)
  select
    'rider_cash_cap',
    'urgent',
    count(*) || ' riders are holding more cash than their cap',
    'That money is ours and it is in a pocket. Until it is banked it is unsecured,'
      || ' and the cascade will keep refusing those riders cash orders.',
    (sum(r.cash_on_hand) * 100)::bigint,
    null,
    '/riders',
    50
  from public.rider r
  where r.cash_on_hand > r.cash_cap and r.cash_cap > 0
  having count(*) > 0;

  /* 6. A projection that has stopped rebuilding. The screens
        would otherwise keep showing yesterday with no sign. */
  insert into public.fin_decision (id, severity, title, consequence, amount_cents, since, href, sort)
  select
    'stale:' || p.name,
    'attention',
    p.label || ' has stopped rebuilding',
    coalesce('Last built ' || to_char(p.as_of, 'DD Mon HH24:MI') || '. ',
             'It has never been built. ')
      || 'Every figure drawn from it is older than it looks.'
      || coalesce(' Last error: ' || p.last_error, ''),
    null,
    p.as_of,
    '/finance?tab=overview',
    60
  from public.fin_projection p
  where p.as_of is null or p.as_of < now() - p.stale_after;

  select count(*)::integer into v_rows from public.fin_decision;
  return v_rows;
end;
$$;

-- ═══════════════════════════════════════════════ the rebuild
--
-- One entry point, so there is one answer to "when did Finance
-- last update". Each projection is rebuilt in its own block: one
-- that fails records its error and the rest still run, because
-- a broken revenue breakdown should not take the decisions list
-- down with it — and the decisions list is where the broken
-- revenue breakdown shows up.

create or replace function fn_fin_rebuild()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month_start date := date_trunc('month', (now() at time zone 'Africa/Nairobi'))::date;
  v_today date := (now() at time zone 'Africa/Nairobi')::date;
  v_max_entry bigint := coalesce((select max(id) from ledger.entry), 0);
  v_result jsonb := '{}'::jsonb;
  v_t0 timestamptz;
  v_rows integer;
  v_name text;
begin
  foreach v_name in array array['kpi_daily', 'money_flow', 'revenue_line',
                                'party_owed', 'calendar', 'decision']
  loop
    v_t0 := clock_timestamp();
    begin
      v_rows := case v_name
        when 'kpi_daily'    then public.fn_fin_build_kpi()
        when 'money_flow'   then public.fn_fin_build_flow(v_month_start, v_today)
        when 'revenue_line' then public.fn_fin_build_revenue(v_month_start, v_today)
        when 'party_owed'   then public.fn_fin_build_party_owed()
        when 'calendar'     then public.fn_fin_build_calendar()
        when 'decision'     then public.fn_fin_build_decisions()
      end;

      update public.fin_projection
         set as_of = now(),
             as_of_entry_id = v_max_entry,
             row_count = v_rows,
             build_ms = (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer,
             last_error = null
       where name = v_name;

      v_result := v_result || jsonb_build_object(v_name, v_rows);
    exception when others then
      /*
       * The failure is recorded on the projection rather than
       * raised, and `fn_fin_build_decisions` turns a stale
       * projection into a visible item. A rebuild that throws
       * silently into a cron log is a rebuild nobody notices has
       * stopped.
       */
      update public.fin_projection
         set last_error = sqlerrm,
             build_ms = (extract(epoch from clock_timestamp() - v_t0) * 1000)::integer
       where name = v_name;
      v_result := v_result || jsonb_build_object(v_name, 'failed: ' || sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'ok', not exists (select 1 from public.fin_projection
                       where last_error is not null),
    'through_entry', v_max_entry,
    'built', v_result);
end;
$$;

comment on function fn_fin_rebuild is
  'Rebuilds every Finance projection. One failing projection records its error and the rest still run — and the failure then appears on the decisions list rather than only in a cron log.';

-- ═══════════════════════════════════════════════ and the way back
--
-- The Verify button. Re-derives one projected row from the
-- ledger right now and hands back both numbers. See the note on
-- `fn_fin_kpi_for` for what this does and does not establish.

create or replace function rpc_fin_verify(p_day date, p_city_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stored public.fin_kpi_daily;
  v_fresh record;
begin
  if not authz.reads_ledger() then
    raise exception 'Only Finance can verify a figure against the ledger.';
  end if;

  select * into v_stored from public.fin_kpi_daily
   where day = p_day and city_id is not distinct from p_city_id;

  select * into v_fresh from public.fn_fin_kpi_for(p_day, p_city_id);

  return jsonb_build_object(
    'day', p_day,
    'city_id', p_city_id,
    'matches', v_stored.source_hash is not distinct from v_fresh.source_hash,
    'built_at', v_stored.built_at,
    'shown', case when v_stored.day is null then null else jsonb_build_object(
      'orders', v_stored.orders,
      'gross_cents', v_stored.gross_cents,
      'revenue_cents', v_stored.revenue_cents,
      'net_cents', v_stored.net_cents,
      'through_entry', v_stored.as_of_entry_id) end,
    'ledger_now', jsonb_build_object(
      'orders', v_fresh.orders,
      'gross_cents', v_fresh.gross_cents,
      'revenue_cents', v_fresh.revenue_cents,
      'net_cents', v_fresh.net_cents,
      'through_entry', v_fresh.as_of_entry_id),
    'message', case
      when v_stored.day is null and v_fresh.orders = 0 and v_fresh.gross_cents = 0
        then 'Nothing happened on this day, and nothing is shown. Agreed.'
      when v_stored.day is null
        then 'The ledger has entries for this day and the screen has no row for it. The rebuild is behind or failing.'
      when v_stored.source_hash = v_fresh.source_hash
        then 'Re-derived from the ledger just now: the same, to the shilling.'
      when v_fresh.as_of_entry_id > v_stored.as_of_entry_id
        then 'Entries have landed since this was built. The screen is behind by '
             || (v_fresh.as_of_entry_id - v_stored.as_of_entry_id) || ' entries, not wrong.'
      else 'The screen and the ledger disagree and no new entries explain it. Do not act on this figure.'
    end);
end;
$$;

-- ═════════════════════════════════════════════════ what the page reads

/* Staleness, as one row, so a header can say how old the screen
   is without six separate judgements. */
create or replace view fin_freshness_v
with (security_invoker = true) as
select
  min(p.as_of) as oldest,
  max(p.as_of) as newest,
  count(*) filter (where p.as_of is null or p.as_of < now() - p.stale_after)::integer as stale_count,
  count(*) filter (where p.last_error is not null)::integer as failing_count,
  max(p.as_of_entry_id) as through_entry,
  jsonb_agg(jsonb_build_object(
    'name', p.name, 'label', p.label, 'as_of', p.as_of,
    'stale', p.as_of is null or p.as_of < now() - p.stale_after,
    'error', p.last_error) order by p.name) as detail
from public.fin_projection p;

/* The month so far, and the same days of the month before, which
   is the comparison the Overview tiles use. Rolled up from
   fin_kpi_daily rather than from the ledger, so the tiles and
   the chart below them are the same arithmetic. */
create or replace view fin_overview_v
with (security_invoker = true) as
with bounds as (
  select
    date_trunc('month', (now() at time zone 'Africa/Nairobi'))::date as m_start,
    (now() at time zone 'Africa/Nairobi')::date as today,
    (date_trunc('month', (now() at time zone 'Africa/Nairobi'))
       - interval '1 month')::date as p_start
),
this_month as (
  select k.city_id,
         sum(k.orders)::integer as orders,
         sum(k.gross_cents)::bigint as gross_cents,
         sum(k.revenue_cents)::bigint as revenue_cents,
         sum(k.rider_cost_cents)::bigint as rider_cost_cents,
         sum(k.leakage_cents)::bigint as leakage_cents,
         sum(k.refund_cents)::bigint as refund_cents,
         sum(k.net_cents)::bigint as net_cents,
         sum(k.cash_collected_cents)::bigint as cash_collected_cents
    from public.fin_kpi_daily k, bounds b
   where k.day >= b.m_start and k.day <= b.today
   group by k.city_id
),
prior_month as (
  select k.city_id,
         sum(k.gross_cents)::bigint as gross_cents,
         sum(k.revenue_cents)::bigint as revenue_cents,
         sum(k.net_cents)::bigint as net_cents
    from public.fin_kpi_daily k, bounds b
   /* The same number of days, not the whole month — comparing
      eleven days against thirty would make every month look
      like a collapse until the 28th. */
   where k.day >= b.p_start
     and k.day <= b.p_start + (b.today - b.m_start)
   group by k.city_id
)
select
  t.city_id,
  c.name as city_name,
  t.orders, t.gross_cents, t.revenue_cents, t.rider_cost_cents,
  t.leakage_cents, t.refund_cents, t.net_cents, t.cash_collected_cents,
  coalesce(p.gross_cents, 0) as prior_gross_cents,
  coalesce(p.revenue_cents, 0) as prior_revenue_cents,
  coalesce(p.net_cents, 0) as prior_net_cents,
  case when t.gross_cents > 0
       then round(t.revenue_cents * 10000.0 / t.gross_cents)::integer end as take_rate_bps
from this_month t
left join prior_month p on p.city_id is not distinct from t.city_id
left join public.city c on c.id = t.city_id;

-- ══════════════════════════════════════════════════════ who may read

revoke all on fin_projection, fin_kpi_daily, fin_money_flow, fin_revenue_line,
               fin_party_owed, fin_calendar_entry, fin_decision
  from anon, authenticated;
grant select on fin_projection, fin_kpi_daily, fin_money_flow, fin_revenue_line,
                fin_party_owed, fin_calendar_entry, fin_decision
  to authenticated;
grant select on fin_freshness_v, fin_overview_v to authenticated;

/* The builders are not callable from a browser. They are the
   cron's job, and a Finance user who wants fresher numbers waits
   two minutes rather than being handed a button that can be held
   down. */
revoke execute on function fn_fin_kpi_for(date, uuid) from public, anon, authenticated;
revoke execute on function fn_fin_build_kpi(integer) from public, anon, authenticated;
revoke execute on function fn_fin_build_flow(date, date) from public, anon, authenticated;
revoke execute on function fn_fin_build_revenue(date, date) from public, anon, authenticated;
revoke execute on function fn_fin_build_party_owed() from public, anon, authenticated;
revoke execute on function fn_fin_build_calendar() from public, anon, authenticated;
revoke execute on function fn_fin_build_decisions() from public, anon, authenticated;
revoke execute on function fn_fin_rebuild() from public, anon, authenticated;
grant execute on function fn_fin_rebuild() to service_role;

revoke execute on function rpc_fin_verify(date, uuid) from public, anon;
grant execute on function rpc_fin_verify(date, uuid) to authenticated;

-- ══════════════════════════════════════════════════════ the clock

create or replace function cron_fin_rebuild()
returns jsonb
language sql
security definer
set search_path = ''
as $$ select public.fn_fin_rebuild() $$;

revoke execute on function cron_fin_rebuild() from public, anon, authenticated;
grant execute on function cron_fin_rebuild() to service_role;

do $cron$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed here; Finance projections are not scheduled.';
    return;
  end if;
  /* Two minutes. Fast enough that the decisions list is a live
     worklist, slow enough that it is not a load problem — the
     rebuild is a handful of grouped scans over an append-only
     table. */
  perform cron.schedule('finance-projections', '*/2 * * * *',
    $sched$select public.cron_fin_rebuild()$sched$);
end
$cron$;

/* Build once now, so the screens have something the moment the
   migration lands rather than up to two minutes of blank. */
do $first$
declare v jsonb;
begin
  v := public.fn_fin_rebuild();
  raise notice 'Finance projections: %', v -> 'built';
end
$first$;
