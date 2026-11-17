import { formatRange } from '@nexg/ui';
import {
  ArrowLeftRight,
  Bike,
  CheckCircle2,
  Clock3,
  Coins,
  Layers,
  Receipt,
  RotateCcw,
  Store,
  UserRound,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut, TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { MovementsTable } from '@/components/finance/movements';
import { RangeControl } from '@/components/portal/client-kit';
import { PageHeader, PanelHead, Sheet, Stat, StatGrid, ViewTabs } from '@/components/portal/kit';
import {
  channelLabel,
  KINDS,
  series,
  share,
  statusTotals,
  totalsBy,
  type Kind,
  type MovementSum,
} from '@/lib/finance';
import { movementList, movementSummary } from '@/lib/finance-server';
import { previousPeriod } from '@/lib/office-finance';
import { change, hrefWith, kes, kesShort, periodFrom, periodQuery } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Transactions' };
export const dynamic = 'force-dynamic';

type Tab = 'all' | Kind;

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'all', label: 'All transactions', icon: Layers },
  { key: 'customer', label: 'Customer payments', icon: UserRound },
  { key: 'merchant', label: 'Merchant payments', icon: Store },
  { key: 'rider', label: 'Rider payouts', icon: Bike },
  { key: 'expense', label: 'Office expenses', icon: Receipt },
  { key: 'refund', label: 'Refunds & chargebacks', icon: RotateCcw },
];

const CHANNEL_COLORS = ['#F5B800', '#141414', '#F9DC7A', '#8C8678', '#D8D2C4', '#2F6FDB'];

/**
 * Finance → Transactions: every payment, refund, payout and paid office
 * expense in the period. Figures are summed in the database by
 * rpc_finance_transaction_summary; the list is rpc_finance_transactions.
 * Totals count money in and money out alike, as the designs do.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : 'all';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const before = previousPeriod(period.from, period.to);
  const supabase = createClient();

  const [summary, list] = await Promise.all([
    movementSummary(supabase, before.from, period.to),
    movementList(supabase, period.from, period.to, tab === 'all' ? null : tab),
  ]);
  const failed = summary.error ?? list.error;

  const inTab = (r: MovementSum) => tab === 'all' || r.kind === tab;
  const now = summary.rows.filter((r) => r.day >= period.from && r.day <= period.to && inTab(r));
  const prev = summary.rows.filter((r) => r.day >= before.from && r.day <= before.to && inTab(r));
  const t = statusTotals(now);
  const tp = statusTotals(prev);
  const delta = change(t.total, tp.total);

  const trend = series(now, period.from, period.to, {
    in: (r) => r.direction === 'in',
    out: (r) => r.direction === 'out',
  });
  const hasIn = trend.points.some((p) => Number(p.in) > 0);
  const hasOut = trend.points.some((p) => Number(p.out) > 0);

  const slices =
    tab === 'all'
      ? totalsBy(now, (r) => r.kind).map((k) => ({
          key: k.key,
          label: KINDS[k.key].plural,
          value: Math.round(k.cents / 100),
          color: KINDS[k.key].color,
        }))
      : totalsBy(now, (r) => r.channel).map((k, i) => ({
          key: k.key,
          label: channelLabel(k.key),
          value: Math.round(k.cents / 100),
          color: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
        }));

  const href = (key: Tab) =>
    hrefWith('/finance/transactions', {
      tab: key === 'all' ? null : key,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });
  const tabLabel = TABS.find((x) => x.key === tab)!.label;
  const pct = (part: number) => {
    const s = share(part, t.total);
    return s == null
      ? undefined
      : `${s.toLocaleString('en-KE', { maximumFractionDigits: 1 })}% of the total`;
  };

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={ArrowLeftRight}
        title="Transactions"
        subtitle="View all platform transactions across customers, merchants, riders, and office expenses."
        actions={<RangeControl from={period.from} to={period.to} />}
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
            Transactions could not be loaded in full: {failed}
          </p>
        )}

        <StatGrid dense>
          <Stat
            icon={Coins}
            value={kes(t.total)}
            label={tab === 'all' ? 'Total transaction value' : `${tabLabel}: total value`}
            delta={delta == null ? null : { value: delta }}
            note={delta == null ? `${t.count.toLocaleString('en-KE')} transactions` : undefined}
          />
          <Stat
            icon={CheckCircle2}
            tone="green"
            value={kes(t.successful)}
            label="Successful"
            note={pct(t.successful)}
            noteTone="good"
          />
          <Stat
            icon={Clock3}
            tone="amber"
            value={kes(t.pending)}
            label="Pending"
            note={pct(t.pending)}
            noteTone="muted"
          />
          <Stat
            icon={XCircle}
            tone="red"
            value={kes(t.failed)}
            label="Failed"
            note={pct(t.failed)}
            noteTone={t.failed > 0 ? 'bad' : 'muted'}
          />
          <Stat
            icon={RotateCcw}
            tone="blue"
            value={kes(t.refunded)}
            label="Refunded"
            note={pct(t.refunded)}
            noteTone="muted"
          />
        </StatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Sheet>
            <PanelHead title="Transaction volume" aside={formatRange(period)} />
            <div className="mt-4">
              {hasIn || hasOut ? (
                <TrendArea
                  data={trend.points as ({ day: string } & Record<string, number | string>)[]}
                  unit="kes"
                  step={trend.step}
                  series={[
                    ...(hasIn
                      ? [{ key: 'in', label: 'Money in', color: '#F5B800', fill: true }]
                      : []),
                    ...(hasOut
                      ? [{ key: 'out', label: 'Money out', color: '#141414', fill: !hasIn }]
                      : []),
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
            <PanelHead
              title={tab === 'all' ? 'Transactions by type' : 'Transactions by channel'}
              aside={formatRange(period)}
            />
            <div className="mt-4">
              {slices.length ? (
                <ShareDonut unit="kes" centre={kesShort(t.total)} caption="Total" data={slices} />
              ) : (
                <p className="text-muted-light py-12 text-center text-sm">
                  Nothing to break down yet.
                </p>
              )}
            </div>
          </Sheet>
        </div>

        <Sheet>
          <MovementsTable
            rows={list.rows}
            truncated={list.truncated}
            title={tab === 'all' ? 'Transaction list' : tabLabel}
            filename={`nexg-transactions-${tab}-${period.from}-to-${period.to}.csv`}
            showType={tab === 'all' || tab === 'merchant' || tab === 'rider' || tab === 'refund'}
          />
        </Sheet>
      </main>
    </ConsoleShell>
  );
}
