import { cn, formatRange } from '@nexg/ui';
import {
  Banknote,
  BedDouble,
  Bike,
  CalendarCheck,
  Coins,
  Gauge,
  HandCoins,
  Package,
  Percent,
  Repeat,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  TriangleAlert,
  Truck,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import * as React from 'react';

import { ShareDonut, TrendArea, type Series, type Unit } from '@/components/charts';
import { PanelHead, Sheet, Stat, StatGrid } from '@/components/portal/kit';
import {
  customersCsv,
  deltaOf,
  hasPoints,
  INTENTS,
  merchantsCsv,
  OPS_TYPES,
  opsCsv,
  opsTypeRows,
  parseCustomers,
  parseRiders,
  pointsMove,
  ridersCsv,
  seriesRows,
  sum,
  trendPoints,
  type CsvRows,
  type OpsTypeRow,
  type Trend,
} from '@/lib/finance-reports';
import { vsLabel } from '@/lib/office-finance';
import { parseOverview } from '@/lib/operations';
import { parsePerformance, type PerfMerchant } from '@/lib/performance';
import { day, kes, kesShort, shillings, type Period } from '@/lib/portal';
import { createClient } from '@/lib/supabase/server';

import { ReportExport } from './report-export';

/**
 * Finance → Reports: the Operations, Merchants, Riders and Customers tabs.
 * Each reads its figures for the page's period (and the one of the same
 * length before it) from one reader, and shows KPI cards, a trend, and a
 * table with a CSV export. Read-only; nothing here is estimated, and a
 * figure that could not be read is a dash, never a zero.
 */

interface ReportProps {
  period: Period;
  /** The period of the same length just before it, for the KPI changes. */
  before: Period;
}

/** Tables show this many rows; the export has every row the reader sent. */
const SHOWN = 50;

const count = (v: number | null | undefined) => (v == null ? null : v.toLocaleString('en-KE'));

const filename = (kind: string, period: Period) =>
  `finance-${kind}-${period.from}-to-${period.to}.csv`;

/* ──────────────────────────────────────────────────────────── pieces */

/** Why a report is missing figures, said where they would have been. */
function LoadFailed({ message }: { message: string }) {
  return (
    <p role="alert" className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold">
      This report could not be loaded in full: {message}
    </p>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-light py-12 text-center text-sm">{children}</p>;
}

function Footnote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-light mt-3 text-xs leading-relaxed">{children}</p>;
}

/** A trend panel: the title, the period, and the lines or why there are none. */
function TrendPanel({
  title,
  period,
  trend,
  series,
  unit,
  empty,
}: {
  title: string;
  period: Period;
  trend: Trend;
  series: Series[];
  unit: Unit;
  empty: string;
}) {
  return (
    <Sheet>
      <PanelHead title={title} aside={formatRange(period)} />
      <div className="mt-4">
        {hasPoints(
          trend,
          series.map((s) => s.key),
        ) ? (
          <TrendArea data={trend.points} unit={unit} step={trend.step} series={series} />
        ) : (
          <Quiet>{empty}</Quiet>
        )}
      </div>
    </Sheet>
  );
}

interface Column<T> {
  header: string;
  /** Figures sit right, words left. */
  numeric?: boolean;
  cell: (row: T) => React.ReactNode;
  /** The total row's cell, when the table has one. */
  foot?: React.ReactNode;
}

/** A table panel's table, drawn like the other Finance tables. */
function ReportTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  withFoot = false,
  className,
}: {
  caption: string;
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string;
  withFoot?: boolean;
  /** The table's minimum width, so narrow screens scroll it sideways. */
  className?: string;
}) {
  const align = (c: Column<T>) => (c.numeric ? 'text-right' : 'text-left');
  return (
    <div className="border-border overflow-x-auto rounded-2xl border">
      <table className={cn('w-full text-sm', className)}>
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-bg text-muted text-xs font-bold">
          <tr>
            {columns.map((c) => (
              <th key={c.header} scope="col" className={cn('px-4 py-2.5', align(c))}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border divide-y tabular-nums">
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              {columns.map((c, j) =>
                j === 0 ? (
                  <th
                    key={c.header}
                    scope="row"
                    className={cn('px-4 py-2.5 font-semibold', align(c))}
                  >
                    {c.cell(r)}
                  </th>
                ) : (
                  <td key={c.header} className={cn('whitespace-nowrap px-4 py-2.5', align(c))}>
                    {c.cell(r)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
        {withFoot && (
          <tfoot className="border-border border-t-2 font-extrabold tabular-nums">
            <tr>
              {columns.map((c, j) =>
                j === 0 ? (
                  <th key={c.header} scope="row" className={cn('px-4 py-2.5', align(c))}>
                    {c.foot}
                  </th>
                ) : (
                  <td key={c.header} className={cn('whitespace-nowrap px-4 py-2.5', align(c))}>
                    {c.foot}
                  </td>
                ),
              )}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** A table panel's head: the title, a note beside it, and the CSV export. */
function TableHead({
  title,
  aside,
  csv,
  file,
}: {
  title: string;
  aside?: React.ReactNode;
  csv: CsvRows;
  file: string;
}) {
  return (
    <PanelHead title={title} aside={aside}>
      {csv.length > 1 && <ReportExport filename={file} rows={csv} />}
    </PanelHead>
  );
}

/* ──────────────────────────────────────────────────────── operations */

/**
 * Orders, bookings, deliveries, guests and incidents from the Operations
 * dashboard's reader, and its status counts for each type. The KPIs are
 * the same whichever type is asked for; the counts follow the type.
 */
export async function OperationsReport({ period, before }: ReportProps) {
  const supabase = createClient();
  const results = await Promise.all(
    OPS_TYPES.map((t) =>
      supabase.rpc('rpc_operations_overview', {
        p_from: period.from,
        p_to: period.to,
        p_tab: t.tab,
      }),
    ),
  );
  const failed = results.find((r) => r.error)?.error?.message ?? null;
  const read = results.map((r) => (r.error || r.data == null ? null : parseOverview(r.data)));
  const k = read.find((o) => o != null)?.kpis ?? null;
  const { rows, total } = opsTypeRows(read.map((o) => o?.buckets ?? null));

  const vs = vsLabel(before);
  const moved = (delta: number | null | undefined, upIsBad = false) =>
    delta == null ? null : { value: delta, upIsBad };
  /* Live counts (active deliveries, guests in house, open incidents) are
     now, not the period's: the report shows what happened in it. */
  const added = (kpi: { value: number | null; series: number[] } | undefined) =>
    kpi == null || kpi.value == null ? null : sum(kpi.series);
  const guests =
    k && k.guests.value != null && k.guests.series.length > 0
      ? sum(k.guests.series) / k.guests.series.length
      : null;
  const incidents = added(k?.incidents);
  const trend = trendPoints(
    k
      ? seriesRows(period.from, period.to, {
          orders: k.orders.series,
          bookings: k.bookings.series,
        })
      : [],
    period.from,
    period.to,
    ['orders', 'bookings'],
  );

  const columns: Column<OpsTypeRow>[] = [
    { header: 'Type', cell: (r) => r.label, foot: total.label },
    {
      header: 'Total',
      numeric: true,
      cell: (r) => count(r.total) ?? '—',
      foot: count(total.total) ?? '—',
    },
    {
      header: 'Ongoing',
      numeric: true,
      cell: (r) => count(r.ongoing) ?? '—',
      foot: count(total.ongoing) ?? '—',
    },
    {
      header: 'Pending',
      numeric: true,
      cell: (r) => count(r.pending) ?? '—',
      foot: count(total.pending) ?? '—',
    },
    {
      header: 'Completed',
      numeric: true,
      cell: (r) => count(r.completed) ?? '—',
      foot: count(total.completed) ?? '—',
    },
    {
      header: 'Cancelled',
      numeric: true,
      cell: (r) => count(r.cancelled) ?? '—',
      foot: count(total.cancelled) ?? '—',
    },
  ];

  return (
    <>
      {failed && <LoadFailed message={failed} />}
      <StatGrid>
        <Stat
          icon={ShoppingBag}
          value={count(k?.orders.value)}
          label="Total Orders"
          delta={moved(k?.orders.delta)}
          deltaNote={vs}
        />
        <Stat
          icon={CalendarCheck}
          value={count(k?.bookings.value)}
          label="Bookings & Reservations"
          delta={moved(k?.bookings.delta)}
          deltaNote={vs}
        />
        <Stat
          icon={Truck}
          value={count(added(k?.deliveries))}
          label="Deliveries Completed"
          delta={moved(k?.deliveries.delta)}
          deltaNote={vs}
        />
        <Stat
          icon={BedDouble}
          value={
            guests == null ? null : guests.toLocaleString('en-KE', { maximumFractionDigits: 1 })
          }
          label="Average Guests per Night"
          delta={moved(k?.guests.delta)}
          deltaNote={vs}
        />
        <Stat
          icon={TriangleAlert}
          tone={incidents ? 'red' : 'gold'}
          value={count(incidents)}
          label="Incidents Raised"
          delta={moved(k?.incidents.delta, true)}
          deltaNote={vs}
        />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[1760px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <TrendPanel
          title="Orders & Bookings Trend"
          period={period}
          trend={trend}
          unit="count"
          series={[
            { key: 'orders', label: 'Orders', color: '#F5B800', fill: true },
            { key: 'bookings', label: 'Bookings', color: '#141414' },
          ]}
          empty="No orders or bookings were made in this period."
        />
        <Sheet>
          <TableHead
            title="Operations by Type"
            aside={formatRange(period)}
            csv={opsCsv(rows, total)}
            file={filename('operations-by-type', period)}
          />
          <div className="mt-4">
            <ReportTable
              caption="Orders and bookings by type and status"
              columns={columns}
              rows={rows}
              rowKey={(r) => r.label}
              withFoot
              className="min-w-[32rem]"
            />
          </div>
          <Footnote>
            Ongoing and pending are what is live now; completed and cancelled finished in the
            period. Food &amp; Deliveries is restaurant orders and other merchant deliveries. Total
            Orders counts every order placed in the period, cancelled ones included.
          </Footnote>
        </Sheet>
      </div>
    </>
  );
}

/* ───────────────────────────────────────────────────────── merchants */

/** Sales, commission, orders, live merchants and ratings, from Merchant Performance's reader. */
export async function MerchantsReport({ period, before }: ReportProps) {
  const supabase = createClient();
  const res = await supabase.rpc('rpc_merchant_performance', {
    p_from: period.from,
    p_to: period.to,
  });
  const p = res.error || res.data == null ? null : parsePerformance(res.data);
  const k = p?.kpis ?? null;
  const sold = (p?.merchants ?? []).filter((m) => m.gmv > 0 || m.orders > 0);
  const vs = vsLabel(before);
  const trend = trendPoints(
    p?.series ?? [],
    period.from,
    period.to,
    ['gmv', 'commission'],
    ['gmv', 'commission'],
  );

  const columns: Column<PerfMerchant>[] = [
    { header: 'Merchant', cell: (m) => m.name },
    { header: 'Category', cell: (m) => m.category_label },
    { header: 'GMV (KES)', numeric: true, cell: (m) => shillings(m.gmv) },
    { header: 'Commission (KES)', numeric: true, cell: (m) => shillings(m.commission) },
    { header: 'Orders', numeric: true, cell: (m) => m.orders.toLocaleString('en-KE') },
    {
      header: 'Rating',
      numeric: true,
      cell: (m) =>
        m.rating == null ? <span className="text-muted-light">—</span> : m.rating.toFixed(1),
    },
  ];

  return (
    <>
      {res.error && <LoadFailed message={res.error.message} />}
      <StatGrid dense>
        <Stat
          icon={Coins}
          value={k ? kes(k.gmv.now) : null}
          label="GMV (Total Sales)"
          delta={k ? deltaOf(k.gmv.now, k.gmv.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Percent}
          value={k ? kes(k.commission.now) : null}
          label="NexG Commission"
          delta={k ? deltaOf(k.commission.now, k.commission.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={ShoppingCart}
          value={count(k?.orders.now)}
          label="Total Orders"
          delta={k ? deltaOf(k.orders.now, k.orders.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Store}
          value={count(k?.active.now)}
          label="Active Merchants"
          delta={k ? deltaOf(k.active.now, k.active.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Star}
          value={k?.rating.now == null ? null : `${k.rating.now.toFixed(1)} / 5`}
          label="Average Rating"
          note={
            !k
              ? undefined
              : k.rating.now == null
                ? 'No ratings yet'
                : `${k.rating.count.toLocaleString('en-KE')} ratings`
          }
        />
      </StatGrid>

      <TrendPanel
        title="GMV & Commission Trend"
        period={period}
        trend={trend}
        unit="kes"
        series={[
          { key: 'gmv', label: 'GMV', color: '#F5B800', fill: true },
          { key: 'commission', label: 'Commission', color: '#141414' },
        ]}
        empty="No merchant sold anything in this period."
      />

      <Sheet>
        <TableHead
          title="Merchant Leaderboard"
          aside={
            sold.length > SHOWN
              ? `top ${SHOWN} of ${sold.length.toLocaleString('en-KE')}; the export has all`
              : formatRange(period)
          }
          csv={merchantsCsv(sold)}
          file={filename('merchants', period)}
        />
        <div className="mt-4">
          {sold.length === 0 ? (
            <Quiet>No merchant sold anything in this period.</Quiet>
          ) : (
            <ReportTable
              caption="Merchants by sales in the period"
              columns={columns}
              rows={sold.slice(0, SHOWN)}
              rowKey={(m) => m.id}
              className="min-w-[44rem]"
            />
          )}
        </div>
        <Footnote>
          GMV is the item subtotal, and Total Orders the number, of orders placed in the period that
          were not cancelled, refunded or disputed; commission is without its VAT. Stays are sold by
          hosts, not merchants, and are not counted here.
        </Footnote>
      </Sheet>
    </>
  );
}

/* ──────────────────────────────────────────────────────────── riders */

/** What riders earned, delivered, were tipped and collected in cash. */
export async function RidersReport({ period, before }: ReportProps) {
  const supabase = createClient();
  const res = await supabase.rpc('rpc_finance_report_riders', {
    p_from: period.from,
    p_to: period.to,
  });
  const r = res.error || res.data == null ? null : parseRiders(res.data);
  const k = r?.kpis ?? null;
  const vs = vsLabel(before);
  const trend = trendPoints(
    (r?.series ?? []).map((s) => ({ day: s.day, earnings: s.earnings_cents })),
    period.from,
    period.to,
    ['earnings'],
    ['earnings'],
  );
  const riders = r?.riders ?? [];

  const columns: Column<(typeof riders)[number]>[] = [
    { header: 'Rider', cell: (x) => x.name },
    { header: 'Deliveries', numeric: true, cell: (x) => x.deliveries.toLocaleString('en-KE') },
    { header: 'Earnings (KES)', numeric: true, cell: (x) => shillings(x.earnings_cents) },
    { header: 'Tips (KES)', numeric: true, cell: (x) => shillings(x.tips_cents) },
    { header: 'Bonuses (KES)', numeric: true, cell: (x) => shillings(x.bonus_cents) },
    { header: 'Penalties (KES)', numeric: true, cell: (x) => shillings(x.penalty_cents) },
    {
      header: 'Cash Collected (KES)',
      numeric: true,
      cell: (x) => shillings(x.cash_collected_cents),
    },
  ];

  return (
    <>
      {res.error && <LoadFailed message={res.error.message} />}
      <StatGrid dense>
        <Stat
          icon={Bike}
          value={count(k?.active_riders.now)}
          label="Active Riders"
          delta={k ? deltaOf(k.active_riders.now, k.active_riders.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Package}
          value={count(k?.deliveries.now)}
          label="Deliveries"
          delta={k ? deltaOf(k.deliveries.now, k.deliveries.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Wallet}
          value={k ? kes(k.earnings_cents.now) : null}
          label="Rider Earnings"
          delta={k ? deltaOf(k.earnings_cents.now, k.earnings_cents.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={HandCoins}
          value={k ? kes(k.tips_cents.now) : null}
          label="Tips"
          delta={k ? deltaOf(k.tips_cents.now, k.tips_cents.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Banknote}
          value={k ? kes(k.cash_collected_cents.now) : null}
          label="Cash Collected"
          delta={k ? deltaOf(k.cash_collected_cents.now, k.cash_collected_cents.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Gauge}
          value={k?.avg_per_delivery_cents.now == null ? null : kes(k.avg_per_delivery_cents.now)}
          label="Average per Delivery"
          delta={k ? deltaOf(k.avg_per_delivery_cents.now, k.avg_per_delivery_cents.before) : null}
          deltaNote={vs}
        />
      </StatGrid>

      <TrendPanel
        title="Rider Earnings Trend"
        period={period}
        trend={trend}
        unit="kes"
        series={[{ key: 'earnings', label: 'Rider Earnings', color: '#F5B800', fill: true }]}
        empty="No deliveries were paid in this period."
      />

      <Sheet>
        <TableHead
          title="Earnings by Rider"
          aside={
            riders.length > SHOWN
              ? `top ${SHOWN} of ${riders.length.toLocaleString('en-KE')}; the export has all`
              : formatRange(period)
          }
          csv={ridersCsv(riders)}
          file={filename('riders', period)}
        />
        <div className="mt-4">
          {riders.length === 0 ? (
            <Quiet>No rider made a delivery in this period.</Quiet>
          ) : (
            <ReportTable
              caption="Rider earnings in the period, most earned first"
              columns={columns}
              rows={riders.slice(0, SHOWN)}
              rowKey={(x) => x.id}
              className="min-w-[52rem]"
            />
          )}
        </div>
        <Footnote>
          Earnings are each delivery&rsquo;s total: base, distance, waiting, bonuses and tips, less
          penalties. Bonuses are pickup and peak bonuses. Test deliveries are left out.
        </Footnote>
      </Sheet>
    </>
  );
}

/* ───────────────────────────────────────────────────────── customers */

/**
 * Guests who paid for orders and stays: how many, new or returning, how
 * often and how much. Customers are shown by the last three digits of
 * their phone, never by name.
 */
export async function CustomersReport({ period, before }: ReportProps) {
  const supabase = createClient();
  const res = await supabase.rpc('rpc_finance_report_customers', {
    p_from: period.from,
    p_to: period.to,
  });
  const c = res.error || res.data == null ? null : parseCustomers(res.data);
  const k = c?.kpis ?? null;
  const vs = vsLabel(before);
  const trend = trendPoints(c?.series ?? [], period.from, period.to, ['new', 'returning']);
  const top = c?.top ?? [];
  const repeat = k ? pointsMove(k.repeat_rate_pct.now, k.repeat_rate_pct.before) : null;
  const unidentified = k?.unidentified_payments.now ?? 0;

  const slices = (c?.by_intent ?? [])
    .filter((b) => b.spend_cents > 0)
    .map((b) => ({
      key: b.intent,
      label: INTENTS[b.intent]?.label ?? b.intent,
      value: Math.round(b.spend_cents / 100),
      color: INTENTS[b.intent]?.color,
    }));
  const paid = sum((c?.by_intent ?? []).map((b) => b.spend_cents));

  const columns: Column<(typeof top)[number]>[] = [
    { header: 'Customer', cell: (x) => x.label },
    { header: 'Payments', numeric: true, cell: (x) => x.payments.toLocaleString('en-KE') },
    { header: 'Spend (KES)', numeric: true, cell: (x) => shillings(x.spend_cents) },
    { header: 'First Paid', numeric: true, cell: (x) => day(x.first_paid_at) },
  ];

  return (
    <>
      {res.error && <LoadFailed message={res.error.message} />}
      <StatGrid dense>
        <Stat
          icon={Users}
          value={count(k?.customers.now)}
          label="Customers"
          delta={k ? deltaOf(k.customers.now, k.customers.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={UserPlus}
          value={count(k?.new_customers.now)}
          label="New Customers"
          delta={k ? deltaOf(k.new_customers.now, k.new_customers.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Repeat}
          value={count(k?.returning_customers.now)}
          label="Returning Customers"
          delta={k ? deltaOf(k.returning_customers.now, k.returning_customers.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Percent}
          value={
            k?.repeat_rate_pct.now == null
              ? null
              : `${k.repeat_rate_pct.now.toLocaleString('en-KE', { maximumFractionDigits: 1 })}%`
          }
          label="Repeat Rate"
          note={repeat ? `${repeat.text} ${vs}` : undefined}
          noteTone={repeat ? (repeat.up ? 'good' : 'bad') : undefined}
        />
        <Stat
          icon={ShoppingCart}
          value={k?.avg_spend_cents.now == null ? null : kes(k.avg_spend_cents.now)}
          label="Average Spend"
          delta={k ? deltaOf(k.avg_spend_cents.now, k.avg_spend_cents.before) : null}
          deltaNote={vs}
        />
        <Stat
          icon={Coins}
          value={k ? kes(k.total_paid_cents.now) : null}
          label="Total Paid"
          delta={k ? deltaOf(k.total_paid_cents.now, k.total_paid_cents.before) : null}
          deltaNote={vs}
        />
      </StatGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <TrendPanel
          title="New & Returning Customers"
          period={period}
          trend={trend}
          unit="count"
          series={[
            { key: 'new', label: 'New Customers', color: '#F5B800', fill: true },
            { key: 'returning', label: 'Returning Customers', color: '#141414' },
          ]}
          empty="No customer paid in this period."
        />
        <Sheet>
          <PanelHead title="Customer Spend by Type" aside={formatRange(period)} />
          <div className="mt-4">
            {slices.length > 0 ? (
              <ShareDonut unit="kes" centre={kesShort(paid)} caption="Paid" data={slices} />
            ) : (
              <Quiet>No paid orders or stays in this period.</Quiet>
            )}
          </div>
        </Sheet>
      </div>

      <Sheet>
        <TableHead
          title="Top Customers"
          aside={top.length >= SHOWN ? `top ${SHOWN} by spend` : formatRange(period)}
          csv={customersCsv(top)}
          file={filename('customers', period)}
        />
        <div className="mt-4">
          {top.length === 0 ? (
            <Quiet>No customer paid for an order or a stay in this period.</Quiet>
          ) : (
            <ReportTable
              caption="Customers who spent most in the period"
              columns={columns}
              rows={top}
              rowKey={(x, i) => `${i}-${x.label}`}
              className="min-w-[32rem]"
            />
          )}
        </div>
        <Footnote>
          Customers are guests who paid for an order or a stay, shown by the last three digits of
          their phone. First Paid is their first payment ever.
          {unidentified > 0 &&
            ` ${unidentified.toLocaleString('en-KE')} paid ${
              unidentified === 1 ? 'payment carries' : 'payments carry'
            } no guest or phone: in Total Paid, not counted as customers.`}
        </Footnote>
      </Sheet>
    </>
  );
}
