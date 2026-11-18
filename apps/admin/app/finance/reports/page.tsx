import { Button, formatRange } from '@nexg/ui';
import {
  ArrowLeftRight,
  BarChart3,
  ChevronRight,
  Coins,
  Download,
  FileDown,
  FileText,
  Handshake,
  LayoutGrid,
  Percent,
  Receipt,
  Scale,
  Send,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut, TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { Exports, type ExportLogRow } from '@/components/finance/exports';
import { Fees, type FeeLineRow, type TakeRow } from '@/components/finance/fees';
import {
  Overview,
  type CalendarRow,
  type DecisionRow,
  type FlowRow,
  type OverviewRow,
  type OwedRow,
  type RevenueRow,
} from '@/components/finance/overview';
import { Freshness } from '@/components/finance/shared';
import { Tax, type TaxDocRow, type TaxRow, type VatMonthRow } from '@/components/finance/tax';
import { RangeControl } from '@/components/portal/client-kit';
import { PageHeader, PanelHead, Sheet, Stat, StatGrid, ViewTabs } from '@/components/portal/kit';
import { humanize, series, statusTotals, totalsBy } from '@/lib/finance';
import { invoiceList, movementSummary } from '@/lib/finance-server';
import { previousPeriod, vsLabel } from '@/lib/office-finance';
import {
  change,
  dateTime,
  day,
  hrefWith,
  kes,
  kesShort,
  periodFrom,
  periodQuery,
  todayInNairobi,
} from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Finance Reports' };
export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'financial' | 'fees' | 'tax' | 'exports';

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'financial', label: 'Financial', icon: Wallet },
  { key: 'fees', label: 'Fees & Commissions', icon: Percent },
  { key: 'tax', label: 'Tax', icon: Receipt },
  { key: 'exports', label: 'Custom Reports', icon: FileDown },
];

const CATEGORY_COLORS = [
  '#F5B800',
  '#141414',
  '#F9DC7A',
  '#8C8678',
  '#D8D2C4',
  '#2F6FDB',
  '#E8730C',
];

const EXPORT_NAMES: Record<string, string> = {
  ledger: 'Ledger',
  settlement: 'Settlements',
  revenue: 'Revenue',
  invoices: 'Invoices',
};

/**
 * Finance → Reports: the headline figures for the period from the same
 * readers the other Finance screens use, the month's financial summary
 * (the fin_* projections, rebuilt from the ledger), fees, tax, and the
 * audited exports.
 */
export default async function FinanceReportsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : 'overview';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const before = previousPeriod(period.from, period.to);
  const today = todayInNairobi();
  const monthStart = `${today.slice(0, 7)}-01`;
  const supabase = createClient();

  const { data: fresh } = await supabase.from('fin_freshness_v').select('*').maybeSingle();
  const freshness = fresh as {
    newest: string | null;
    stale_count: number;
    failing_count: number;
    through_entry: number | null;
  } | null;

  const href = (key: Tab) =>
    hrefWith('/finance/reports', {
      tab: key === 'overview' ? null : key,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  let body: React.ReactNode = null;
  let failed: string | null = null;

  if (tab === 'overview') {
    const [summary, invoices, reconRes, categoriesRes, logRes] = await Promise.all([
      movementSummary(supabase, before.from, period.to),
      invoiceList(supabase, before.from, period.to),
      supabase
        .from('fin_provider_recon_v')
        .select('day, provider_cents, ledger_cents')
        .gte('day', before.from)
        .lte('day', period.to)
        .limit(1000),
      supabase.from('category_config').select('category, label'),
      supabase
        .from('fin_export_log_v')
        .select('id, kind, from_date, to_date, row_count, taken_at, taken_by_email')
        .order('taken_at', { ascending: false })
        .limit(6),
    ]);
    failed = summary.error ?? invoices.error ?? reconRes.error?.message ?? null;

    const inNow = (d: string) => d >= period.from && d <= period.to;
    const inBefore = (d: string) => d >= before.from && d <= before.to;
    const now = summary.rows.filter((r) => inNow(r.day));
    const prev = summary.rows.filter((r) => inBefore(r.day));

    const value = statusTotals(now).total;
    const valueBefore = statusTotals(prev).total;
    const payouts = statusTotals(now.filter((r) => r.source === 'payout')).total;
    const payoutsBefore = statusTotals(prev.filter((r) => r.source === 'payout')).total;
    const office = statusTotals(now.filter((r) => r.source === 'expense')).total;
    const officeBefore = statusTotals(prev.filter((r) => r.source === 'expense')).total;

    const issuedDay = (iso: string) =>
      new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const invoiced = (test: (d: string) => boolean) =>
      invoices.rows
        .filter((r) => r.status !== 'draft' && test(issuedDay(r.issued_at)))
        .reduce((s, r) => s + r.total_cents, 0);
    const inv = invoiced(inNow);
    const invBefore = invoiced(inBefore);

    /* The ledger repeats per provider on a day; one figure per day. */
    const gaps = (test: (d: string) => boolean) => {
      const byDay = new Map<string, { p: number; l: number }>();
      for (const r of (reconRes.data ?? []) as {
        day: string;
        provider_cents: number;
        ledger_cents: number;
      }[]) {
        if (!test(r.day)) continue;
        const d = byDay.get(r.day) ?? { p: 0, l: 0 };
        d.p += Number(r.provider_cents);
        d.l = Math.max(d.l, Number(r.ledger_cents));
        byDay.set(r.day, d);
      }
      return [...byDay.values()].reduce((s, d) => s + Math.abs(d.p - d.l), 0);
    };
    const variance = gaps(inNow);
    const varianceBefore = gaps(inBefore);
    const deltaOf = (a: number, b: number, upIsBad = false) => {
      const c = change(a, b);
      return c == null ? null : { value: c, upIsBad };
    };

    const trend = series(now, period.from, period.to, {
      value: () => true,
      payouts: (r) => r.source === 'payout',
    });
    const labels = new Map(
      ((categoriesRes.data ?? []) as { category: string; label: string }[]).map((c) => [
        c.category,
        c.label,
      ]),
    );
    const categories = totalsBy(now, (r) =>
      r.source === 'payment' && r.kind === 'customer' && r.status === 'successful'
        ? r.category
        : null,
    );
    const shownCats = categories.slice(0, 5);
    const rest = categories.slice(5).reduce((s, c) => s + c.cents, 0);
    const slices = [
      ...shownCats.map((c, i) => ({
        key: c.key,
        label: c.key === 'stays' ? 'Stays (Bookings)' : (labels.get(c.key) ?? humanize(c.key)),
        value: Math.round(c.cents / 100),
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
      })),
      ...(rest > 0
        ? [
            {
              key: 'other',
              label: 'Other Services',
              value: Math.round(rest / 100),
              color: '#E8E4DA',
            },
          ]
        : []),
    ];
    const paidTotal = categories.reduce((s, c) => s + c.cents, 0);
    const recent = (logRes.data ?? []) as ExportLogRow[];

    const reports: { icon: LucideIcon; title: string; text: string; href: string }[] = [
      {
        icon: Coins,
        title: 'Financial Report',
        text: 'Revenue, money flow and what is owed',
        href: href('financial'),
      },
      {
        icon: ArrowLeftRight,
        title: 'Transactions Report',
        text: 'Every payment, refund and payout',
        href: hrefWith('/finance/transactions', pq ? { from: period.from, to: period.to } : {}),
      },
      {
        icon: Handshake,
        title: 'Settlements Report',
        text: 'Merchant, host and rider runs',
        href: hrefWith('/finance/settlements', {
          tab: 'batches',
          ...(pq ? { from: period.from, to: period.to } : {}),
        }),
      },
      {
        icon: Scale,
        title: 'Reconciliation Report',
        text: 'Providers against the ledger',
        href: hrefWith('/finance/reconciliation', pq ? { from: period.from, to: period.to } : {}),
      },
      {
        icon: FileText,
        title: 'Invoice Report',
        text: 'Invoices, payments and balances',
        href: hrefWith('/finance/invoices', {
          tab: 'all',
          ...(pq ? { from: period.from, to: period.to } : {}),
        }),
      },
      {
        icon: Wallet,
        title: 'Office Expense Report',
        text: 'Spend by category and month',
        href: '/finance/office?tab=reports',
      },
      {
        icon: Percent,
        title: 'Fees & Commissions',
        text: 'What NexG earned, by line and merchant',
        href: href('fees'),
      },
      {
        icon: Receipt,
        title: 'Tax Report',
        text: 'VAT, withholding and KRA invoices',
        href: href('tax'),
      },
      {
        icon: Send,
        title: 'Ledger Exports',
        text: 'Audited CSVs for the accountants',
        href: href('exports'),
      },
    ];

    body = (
      <>
        <StatGrid dense>
          <Stat
            icon={Coins}
            value={kes(value)}
            label="Total Transaction Value"
            delta={deltaOf(value, valueBefore)}
            deltaNote={vsLabel(before)}
            href={hrefWith('/finance/transactions', pq ? { from: period.from, to: period.to } : {})}
          />
          <Stat
            icon={FileText}
            value={kes(inv)}
            label="Total Invoices"
            delta={deltaOf(inv, invBefore)}
            deltaNote={vsLabel(before)}
            href={hrefWith('/finance/invoices', pq ? { from: period.from, to: period.to } : {})}
          />
          <Stat
            icon={Send}
            value={kes(payouts)}
            label="Total Payouts"
            delta={deltaOf(payouts, payoutsBefore)}
            deltaNote={vsLabel(before)}
            href={hrefWith('/finance/settlements', pq ? { from: period.from, to: period.to } : {})}
          />
          <Stat
            icon={Wallet}
            value={kes(office)}
            label="Office Expenses"
            delta={deltaOf(office, officeBefore, true)}
            deltaNote={vsLabel(before)}
            href="/finance/office"
          />
          <Stat
            icon={BarChart3}
            tone={variance ? 'red' : 'gold'}
            value={kes(variance)}
            label="Reconciliation Variance"
            delta={deltaOf(variance, varianceBefore, true)}
            deltaNote={vsLabel(before)}
            href={hrefWith(
              '/finance/reconciliation',
              pq ? { from: period.from, to: period.to } : {},
            )}
          />
        </StatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Sheet>
            <PanelHead title="Transaction & Payout Trend" aside={formatRange(period)} />
            <div className="mt-4">
              {trend.points.some((p) => Number(p.value) > 0) ? (
                <TrendArea
                  data={trend.points as ({ day: string } & Record<string, number | string>)[]}
                  unit="kes"
                  step={trend.step}
                  series={[
                    { key: 'value', label: 'Transaction Value', color: '#F5B800', fill: true },
                    { key: 'payouts', label: 'Payouts', color: '#141414' },
                  ]}
                />
              ) : (
                <p className="text-muted-light py-12 text-center text-sm">
                  No money moved in this period.
                </p>
              )}
            </div>
          </Sheet>
          <Sheet>
            <PanelHead title="Customer Payments by Category" aside={formatRange(period)} />
            <div className="mt-4">
              {slices.length ? (
                <ShareDonut unit="kes" centre={kesShort(paidTotal)} caption="Paid" data={slices} />
              ) : (
                <p className="text-muted-light py-12 text-center text-sm">
                  No paid customer payments in this period.
                </p>
              )}
            </div>
          </Sheet>
        </div>

        <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Sheet>
            <PanelHead title="Available Reports" />
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {reports.map((r) => (
                <li key={r.title}>
                  <Link
                    href={r.href}
                    className="border-border hover:border-gold focus-visible:ring-gold group flex h-full items-center gap-3 rounded-2xl border bg-white p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2"
                  >
                    <span className="bg-gold-soft text-gold-text flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                      <r.icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-extrabold">{r.title}</span>
                      <span className="text-muted block text-xs leading-snug">{r.text}</span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="text-muted-light group-hover:text-ink h-4 w-4 shrink-0"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </Sheet>
          <Sheet>
            <PanelHead title="Recent Reports">
              <Link
                href={href('exports')}
                className="text-ink text-sm font-bold underline underline-offset-4"
              >
                View All →
              </Link>
            </PanelHead>
            {recent.length === 0 ? (
              <p className="text-muted-light py-10 text-center text-sm">
                No exports taken yet. Exports are logged before their rows are written.
              </p>
            ) : (
              <ul className="divide-border mt-3 divide-y">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2.5">
                    <FileText aria-hidden="true" className="text-gold-text h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {EXPORT_NAMES[r.kind] ?? humanize(r.kind)} ·{' '}
                        {Number(r.row_count).toLocaleString('en-KE')} rows
                      </span>
                      <span className="text-muted-light block truncate text-xs">
                        {day(r.from_date)} – {day(r.to_date)} · {dateTime(r.taken_at)}
                        {r.taken_by_email ? ` · ${r.taken_by_email}` : ''}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Sheet>
        </div>
      </>
    );
  }

  if (tab === 'financial') {
    const [overview, flow, revenue, decisions, calendar, owed] = await Promise.all([
      supabase.from('fin_overview_v').select('*'),
      supabase.from('fin_money_flow').select('*').eq('period_start', monthStart).order('sort'),
      supabase
        .from('fin_revenue_line')
        .select('*')
        .eq('period_start', monthStart)
        .order('amount_cents', { ascending: false }),
      supabase.from('fin_decision').select('*').order('sort'),
      supabase
        .from('fin_calendar_entry')
        .select('*')
        .gte('due_on', new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))
        .lte('due_on', new Date(Date.now() + 42 * 86400000).toISOString().slice(0, 10))
        .order('due_on'),
      supabase
        .from('fin_party_owed')
        .select('*')
        .order('owed_cents', { ascending: false })
        .limit(10),
    ]);

    /*
     * The builders write a fresh set of rows for (start of month, today) on
     * every run and keep the earlier days' sets, so read only the newest
     * build of this month. Summing them all counted each line once a day.
     */
    const newest = <T extends { period_end: string }>(rows: T[] | null): T[] => {
      const list = rows ?? [];
      const end = list.reduce((max, r) => (r.period_end > max ? r.period_end : max), '');
      return list.filter((r) => r.period_end === end);
    };
    const cityRows = (overview.data as OverviewRow[] | null) ?? [];

    /*
     * Headline totals are summed from the per-city rows rather than read
     * from an "all cities" row: one derivation, so the tiles and the city
     * table can only disagree if arithmetic is broken.
     */
    const totals: OverviewRow | null = cityRows.length
      ? cityRows.reduce(
          (a, c) => ({
            ...a,
            orders: a.orders + Number(c.orders),
            gross_cents: a.gross_cents + Number(c.gross_cents),
            revenue_cents: a.revenue_cents + Number(c.revenue_cents),
            rider_cost_cents: a.rider_cost_cents + Number(c.rider_cost_cents),
            leakage_cents: a.leakage_cents + Number(c.leakage_cents),
            refund_cents: a.refund_cents + Number(c.refund_cents),
            net_cents: a.net_cents + Number(c.net_cents),
            cash_collected_cents: a.cash_collected_cents + Number(c.cash_collected_cents),
            prior_gross_cents: a.prior_gross_cents + Number(c.prior_gross_cents),
            prior_revenue_cents: a.prior_revenue_cents + Number(c.prior_revenue_cents),
            prior_net_cents: a.prior_net_cents + Number(c.prior_net_cents),
          }),
          {
            city_id: null,
            city_name: null,
            orders: 0,
            gross_cents: 0,
            revenue_cents: 0,
            rider_cost_cents: 0,
            leakage_cents: 0,
            refund_cents: 0,
            net_cents: 0,
            cash_collected_cents: 0,
            prior_gross_cents: 0,
            prior_revenue_cents: 0,
            prior_net_cents: 0,
            take_rate_bps: null,
          } as OverviewRow,
        )
      : null;
    if (totals) {
      totals.take_rate_bps =
        totals.gross_cents > 0
          ? Math.round((totals.revenue_cents * 10000) / totals.gross_cents)
          : null;
    }

    body = (
      <Sheet>
        <PanelHead
          title="Financial Summary"
          aside={`this month so far: ${formatRange({ from: monthStart, to: today })}`}
        />
        <div className="mt-5">
          <Overview
            totals={totals}
            cities={cityRows}
            flow={newest(flow.data as (FlowRow & { period_end: string })[] | null)}
            revenue={newest(revenue.data as (RevenueRow & { period_end: string })[] | null)}
            decisions={(decisions.data as DecisionRow[] | null) ?? []}
            calendar={(calendar.data as CalendarRow[] | null) ?? []}
            owed={(owed.data as OwedRow[] | null) ?? []}
            from={monthStart}
            to={today}
          />
        </div>
      </Sheet>
    );
  }

  if (tab === 'fees') {
    const [lines, take] = await Promise.all([
      supabase.from('fin_fee_line_v').select('*').gte('day', period.from).lte('day', period.to),
      supabase.from('fin_merchant_take_v').select('*').limit(100),
    ]);
    body = (
      <Sheet>
        <Fees
          lines={(lines.data as FeeLineRow[] | null) ?? []}
          take={(take.data as TakeRow[] | null) ?? []}
          from={period.from}
          to={period.to}
        />
      </Sheet>
    );
  }

  if (tab === 'tax') {
    const [position, docs, months] = await Promise.all([
      supabase.from('fin_tax_position_v').select('*').order('sort'),
      supabase
        .from('tax_invoice')
        .select(
          'id, number, kind, purpose, party_name, party_pin, issued_at, net_cents, vat_cents, gross_cents, kra_status, kra_reference',
        )
        .order('issued_at', { ascending: false })
        .limit(100),
      supabase.from('tax_vat_summary_v').select('*').order('month', { ascending: false }).limit(24),
    ]);
    body = (
      <Sheet>
        <Tax
          rows={(position.data as TaxRow[] | null) ?? []}
          docs={(docs.data as unknown as TaxDocRow[] | null) ?? []}
          months={(months.data as unknown as VatMonthRow[] | null) ?? []}
        />
      </Sheet>
    );
  }

  if (tab === 'exports') {
    const { data } = await supabase
      .from('fin_export_log_v')
      .select('id, kind, from_date, to_date, row_count, taken_at, taken_by_email')
      .order('taken_at', { ascending: false })
      .limit(50);
    body = (
      <Sheet>
        <Exports
          log={(data as ExportLogRow[] | null) ?? []}
          defaultFrom={period.from}
          defaultTo={period.to}
        />
      </Sheet>
    );
  }

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={BarChart3}
        title="Reports"
        subtitle="Financial reports across the platform: summaries, fees, tax and audited exports."
        actions={
          <>
            {(tab === 'financial' || tab === 'fees' || tab === 'tax') && (
              <Freshness
                asOf={freshness?.newest ?? null}
                stale={freshness?.stale_count ?? 0}
                failing={freshness?.failing_count ?? 0}
                throughEntry={freshness?.through_entry ?? null}
              />
            )}
            <RangeControl from={period.from} to={period.to} />
            <Button asChild variant="gold" size="md">
              <Link href={href('exports')}>
                <Download aria-hidden="true" className="h-4 w-4" />
                Download Report
              </Link>
            </Button>
          </>
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <ViewTabs
          active={tab}
          tabs={TABS.map((x) => ({ key: x.key, label: x.label, icon: x.icon, href: href(x.key) }))}
        />
        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Reports could not be loaded in full: {failed}
          </p>
        )}
        {body}
      </main>
    </ConsoleShell>
  );
}
