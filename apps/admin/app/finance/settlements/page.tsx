import { formatRange } from '@nexg/ui';
import {
  AlertOctagon,
  Bike,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Coins,
  History,
  Home,
  LayoutGrid,
  Layers,
  Store,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { MovementsTable } from '@/components/finance/movements';
import { Settlement, type LineRow, type RunRow } from '@/components/finance/settlement';
import {
  BatchesTable,
  BuildRunButton,
  LinesTable,
  type BatchRow,
  type SettlementLine,
} from '@/components/finance/settlements';
import { RangeControl } from '@/components/portal/client-kit';
import { PageHeader, PanelHead, Sheet, Stat, StatGrid, ViewTabs } from '@/components/portal/kit';
import { lineBucket, PAYEE_GROUPS, payeeGroup, share, type PayeeGroup } from '@/lib/finance';
import { movementList } from '@/lib/finance-server';
import { previousPeriod } from '@/lib/office-finance';
import {
  change,
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

export const metadata: Metadata = { title: 'Settlements & payouts' };
export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'merchants' | 'hosts' | 'riders' | 'batches' | 'history';

const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'merchants', label: 'Merchant settlements', icon: Store },
  { key: 'hosts', label: 'Host payouts', icon: Home },
  { key: 'riders', label: 'Rider payouts', icon: Bike },
  { key: 'batches', label: 'Settlement batches', icon: Layers },
  { key: 'history', label: 'Payout history', icon: History },
];

interface RunListRow {
  id: string;
  reference: string;
  state: string;
  pay_date: string;
  period_start: string;
  period_end: string;
  sent_at: string | null;
  reconciled_at: string | null;
  built_at: string | null;
}

interface OwedRow {
  party_type: string;
  label: string | null;
  owed_cents: number;
  oldest_unsettled: string | null;
}

const LINE_COLUMNS =
  'id, run_id, party_type, party_label, rail, destination_masked, gross_cents, commission_cents, adjustment_cents, net_cents, state, hold_reason, failure_reason, paid_at, provider_ref';

/**
 * Finance → Settlements & payouts: what the weekly runs pay merchants,
 * hosts and riders, where each payout stands, and what is owed but not
 * yet in a run. Runs come from fin_settlement_run and its lines; a run in
 * the period is one whose pay date falls in it. Draft and cancelled runs
 * pay nothing and are left out of the totals.
 */
export default async function SettlementsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string; run?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const canBuild =
    staff.isSuperAdmin || staff.roles.includes('finance') || staff.roles.includes('finance_lead');
  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : searchParams?.run
      ? 'batches'
      : 'overview';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const before = previousPeriod(period.from, period.to);
  const today = todayInNairobi();
  /* A period that ends today also lists the runs built but not yet paid. */
  const upTo = period.to === today ? plusDays(today, 31) : period.to;
  const supabase = createClient();

  const [runsRes, owedRes, calendarRes] = await Promise.all([
    supabase
      .from('fin_run_v')
      .select(
        'id, reference, state, pay_date, period_start, period_end, sent_at, reconciled_at, built_at',
      )
      .gte('pay_date', before.from)
      .lte('pay_date', upTo)
      .order('pay_date', { ascending: false })
      .limit(200),
    supabase
      .from('fin_party_owed')
      .select('party_type, label, owed_cents, oldest_unsettled')
      .order('owed_cents', { ascending: false })
      .limit(1000),
    supabase
      .from('fin_calendar_entry')
      .select('id, due_on, label, detail, amount_cents, state')
      .eq('kind', 'settlement')
      .gte('due_on', today)
      .order('due_on')
      .limit(5),
  ]);

  const allRuns = ((runsRes.data ?? []) as unknown as RunListRow[]).filter((r) => r.pay_date);
  const paying = allRuns.filter((r) => !['draft', 'cancelled'].includes(r.state));
  const runById = new Map(allRuns.map((r) => [r.id, r]));

  /* Every line of every paying run, a thousand at a time. */
  const lines: SettlementLine[] = [];
  let linesError: string | null = null;
  if (paying.length) {
    for (let from = 0; from < 20_000; from += 1000) {
      const { data, error } = await supabase
        .from('fin_settlement_line')
        .select(LINE_COLUMNS)
        .in(
          'run_id',
          paying.map((r) => r.id),
        )
        .order('id')
        .range(from, from + 999);
      if (error) {
        linesError = error.message;
        break;
      }
      for (const l of (data ?? []) as unknown as Omit<
        SettlementLine,
        'run_reference' | 'pay_date'
      >[]) {
        const run = runById.get(l.run_id)!;
        lines.push({
          ...l,
          gross_cents: Number(l.gross_cents),
          commission_cents: Number(l.commission_cents),
          adjustment_cents: Number(l.adjustment_cents),
          net_cents: Number(l.net_cents),
          run_reference: run.reference,
          pay_date: run.pay_date,
        });
      }
      if ((data ?? []).length < 1000) break;
    }
  }
  const failed = runsRes.error?.message ?? linesError;

  const inPeriod = (l: SettlementLine) => l.pay_date >= period.from && l.pay_date <= period.to;
  const moving = (l: SettlementLine) => lineBucket(l.state) != null;
  const now = lines.filter((l) => inPeriod(l) && moving(l));
  const prev = lines.filter(
    (l) => l.pay_date >= before.from && l.pay_date <= before.to && moving(l),
  );
  const sum = (rows: SettlementLine[]) => rows.reduce((s, l) => s + l.net_cents, 0);
  const total = sum(now);
  const totalBefore = sum(prev);
  const delta = change(total, totalBefore);
  const byGroup = (g: PayeeGroup) => sum(now.filter((l) => payeeGroup(l.party_type) === g));
  const groups = (Object.keys(PAYEE_GROUPS) as PayeeGroup[]).map((g) => ({ g, cents: byGroup(g) }));

  const bucket = (b: 'paid' | 'processing' | 'held' | 'failed') => {
    const rows = now.filter((l) => lineBucket(l.state) === b);
    return { n: rows.length, cents: sum(rows) };
  };
  const status = {
    paid: bucket('paid'),
    processing: bucket('processing'),
    held: bucket('held'),
    failed: bucket('failed'),
  };

  const owed = ((owedRes.data ?? []) as unknown as OwedRow[]).map((o) => ({
    ...o,
    owed_cents: Number(o.owed_cents),
  }));
  const owedTotal = owed.reduce((s, o) => s + Math.max(0, o.owed_cents), 0);
  const owedByGroup = (Object.keys(PAYEE_GROUPS) as PayeeGroup[])
    .map((g) => {
      const rows = owed.filter((o) => payeeGroup(o.party_type) === g && o.owed_cents > 0);
      return {
        g,
        n: rows.length,
        cents: rows.reduce((s, o) => s + o.owed_cents, 0),
        oldest:
          rows
            .map((o) => o.oldest_unsettled)
            .filter(Boolean)
            .sort()[0] ?? null,
      };
    })
    .filter((x) => x.cents > 0);
  const calendar = (calendarRes.data ?? []) as unknown as {
    id: string;
    due_on: string;
    label: string;
    detail: string | null;
    amount_cents: number | null;
  }[];

  /* One batch per run and payee type, as the designs list them. */
  const batches: BatchRow[] = [];
  for (const run of allRuns.filter((r) => r.pay_date >= period.from && r.pay_date <= upTo)) {
    const runLines = lines.filter((l) => l.run_id === run.id);
    const seen = new Set(runLines.map((l) => payeeGroup(l.party_type)));
    for (const g of (Object.keys(PAYEE_GROUPS) as PayeeGroup[]).filter((x) => seen.has(x))) {
      const ls = runLines.filter((l) => payeeGroup(l.party_type) === g && moving(l));
      batches.push({
        key: `${run.id}-${g}`,
        runId: run.id,
        reference: run.reference,
        group: g,
        recipients: ls.length,
        cents: sum(ls),
        rails: [...new Set(ls.map((l) => l.rail))],
        runState: run.state,
        payDate: run.pay_date,
        processedAt: run.sent_at ?? run.reconciled_at,
        paid: ls.filter((l) => lineBucket(l.state) === 'paid').length,
        failed: ls.filter((l) => lineBucket(l.state) === 'failed').length,
        held: ls.filter((l) => lineBucket(l.state) === 'held').length,
      });
    }
    if (!seen.size) {
      batches.push({
        key: `${run.id}-none`,
        runId: run.id,
        reference: run.reference,
        group: 'other',
        recipients: 0,
        cents: 0,
        rails: [],
        runState: run.state,
        payDate: run.pay_date,
        processedAt: run.sent_at ?? run.reconciled_at,
        paid: 0,
        failed: 0,
        held: 0,
      });
    }
  }

  const href = (key: Tab, extra: Record<string, string | null> = {}) =>
    hrefWith('/finance/settlements', {
      tab: key === 'overview' ? null : key,
      ...extra,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  /* The run opened from a batch: its checks, signatures and every line. */
  let runDetail: React.ReactNode = null;
  if (tab === 'batches' && searchParams?.run) {
    const [runRes, lineRes] = await Promise.all([
      supabase.from('fin_run_v').select('*').eq('id', searchParams.run).maybeSingle(),
      supabase
        .from('fin_run_line_v')
        .select('*')
        .eq('run_id', searchParams.run)
        .order('net_cents', { ascending: false }),
    ]);
    const run = (runRes.data as RunRow | null) ?? null;
    runDetail = run ? (
      <Sheet>
        <PanelHead title={`Run ${run.reference}`} aside={`pays ${day(run.pay_date)}`}>
          <Link
            href={href('batches')}
            className="text-muted hover:text-ink text-sm font-bold underline underline-offset-4"
          >
            All batches
          </Link>
        </PanelHead>
        <div className="mt-4">
          <Settlement runs={[]} run={run} lines={(lineRes.data as LineRow[] | null) ?? []} />
        </div>
      </Sheet>
    ) : (
      <p
        role="alert"
        className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
      >
        That run could not be found.
      </p>
    );
  }

  /* Payout history: settlement lines and M-Pesa payouts, newest first. */
  let history: React.ReactNode = null;
  if (tab === 'history') {
    const lists = await Promise.all(
      (['merchant', 'rider', 'refund'] as const).map((k) =>
        movementList(supabase, period.from, period.to, k),
      ),
    );
    const rows = lists
      .flatMap((l) => l.rows)
      .filter((m) => m.source === 'payout' || m.source === 'b2c')
      .sort((a, b) => (a.happened_at < b.happened_at ? 1 : -1));
    history = (
      <Sheet>
        <MovementsTable
          rows={rows}
          truncated={lists.some((l) => l.truncated)}
          title="Payout history"
          filename={`nexg-payouts-${period.from}-to-${period.to}.csv`}
          emptyTitle="No payouts in this period"
          emptyText="Settlement payouts to merchants, hosts and riders, and M-Pesa payouts to customers, appear here once a run is built."
        />
      </Sheet>
    );
  }

  const groupLines = (g: PayeeGroup) =>
    lines
      .filter((l) => inPeriod(l) && payeeGroup(l.party_type) === g)
      .sort((a, b) =>
        a.pay_date < b.pay_date ? 1 : a.pay_date > b.pay_date ? -1 : b.net_cents - a.net_cents,
      );

  const pctOf = (cents: number) => {
    const s = share(cents, total);
    return s == null
      ? undefined
      : `${s.toLocaleString('en-KE', { maximumFractionDigits: 1 })}% of total`;
  };

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={Coins}
        title="Settlements & payouts"
        subtitle="Merchant, host and rider settlements, payout runs, and what is still owed."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} />
            {canBuild && <BuildRunButton batchesHref={href('batches')} />}
          </>
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <ViewTabs
          active={tab}
          tabs={TABS.map((x) => ({
            key: x.key,
            label: x.label,
            icon: x.icon,
            href: href(x.key),
            alert: x.key === 'batches' ? status.failed.n + status.held.n || null : null,
          }))}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Settlements could not be loaded in full: {failed}
          </p>
        )}

        {tab === 'overview' && (
          <>
            <StatGrid dense>
              <Stat
                icon={Coins}
                value={kes(total)}
                label="Total payouts"
                delta={delta == null ? null : { value: delta }}
                note={delta == null ? `${now.length.toLocaleString('en-KE')} payouts` : undefined}
              />
              <Stat
                icon={Store}
                value={kes(byGroup('merchant'))}
                label="Merchants"
                note={pctOf(byGroup('merchant'))}
                href={href('merchants')}
              />
              <Stat
                icon={Home}
                value={kes(byGroup('host'))}
                label="Hosts (stays)"
                note={pctOf(byGroup('host'))}
                href={href('hosts')}
              />
              <Stat
                icon={Bike}
                value={kes(byGroup('rider'))}
                label="Riders (delivery)"
                note={pctOf(byGroup('rider'))}
                href={href('riders')}
              />
              <Stat
                icon={Users}
                value={owed.length || owedTotal ? kes(owedTotal) : null}
                label="Owed, not yet in a run"
                note={
                  owedByGroup.length
                    ? `${owedByGroup.reduce((s, x) => s + x.n, 0).toLocaleString('en-KE')} payees waiting`
                    : 'Nothing waiting'
                }
                noteTone="muted"
              />
            </StatGrid>

            <div className="grid gap-5 xl:grid-cols-3">
              <Sheet>
                <PanelHead title="Settlement breakdown" aside={formatRange(period)} />
                <div className="mt-4">
                  {total > 0 ? (
                    <ShareDonut
                      unit="kes"
                      stacked
                      centre={kesShort(total)}
                      caption="Total"
                      data={groups
                        .filter((x) => x.cents > 0)
                        .map((x) => ({
                          key: x.g,
                          label: PAYEE_GROUPS[x.g].label,
                          value: Math.round(x.cents / 100),
                          color: PAYEE_GROUPS[x.g].color,
                        }))}
                    />
                  ) : (
                    <p className="text-muted-light py-12 text-center text-sm">
                      No payouts in this period.
                    </p>
                  )}
                </div>
              </Sheet>

              <Sheet>
                <PanelHead title="Payout status" aside={formatRange(period)} />
                <ul className="mt-4 space-y-2.5">
                  {(
                    [
                      ['Paid', status.paid, CheckCircle2, 'bg-success-bg text-success'],
                      ['Processing', status.processing, Clock3, 'bg-[#FFF6DA] text-[#8A6400]'],
                      ['Held', status.held, AlertOctagon, 'bg-[#FFF1D1] text-[#8A5A00]'],
                      ['Failed', status.failed, XCircle, 'bg-danger-bg text-danger'],
                    ] as const
                  ).map(([label, s, Icon, tone]) => (
                    <li
                      key={label}
                      className={`flex items-center gap-3 rounded-xl px-3.5 py-3 ${tone}`}
                    >
                      <Icon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2} />
                      <span className="min-w-0 flex-1">
                        <span className="text-ink block text-sm font-extrabold">{label}</span>
                        <span className="text-muted block text-xs font-semibold">
                          {s.n.toLocaleString('en-KE')} payout{s.n === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="text-ink whitespace-nowrap text-sm font-extrabold tabular-nums">
                        {kes(s.cents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Sheet>

              <Sheet>
                <PanelHead title="Upcoming settlements" />
                {calendar.length === 0 && owedByGroup.length === 0 ? (
                  <p className="text-muted-light py-10 text-center text-sm">
                    Nothing is owed and no settlement is scheduled.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2.5">
                    {calendar.map((c) => (
                      <li key={c.id} className="flex items-center gap-3">
                        <span className="bg-bg text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                          <CalendarClock aria-hidden="true" className="h-[1.1rem] w-[1.1rem]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">{c.label}</span>
                          <span className="text-muted-light block text-xs">{day(c.due_on)}</span>
                        </span>
                        {c.amount_cents != null && (
                          <span className="whitespace-nowrap rounded-full bg-[#FFF3CC] px-2.5 py-1 text-xs font-extrabold tabular-nums text-[#8A6400]">
                            {kes(Number(c.amount_cents))}
                          </span>
                        )}
                      </li>
                    ))}
                    {owedByGroup.map((o) => (
                      <li key={o.g} className="flex items-center gap-3">
                        <span className="bg-bg text-ink flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                          <CalendarClock aria-hidden="true" className="h-[1.1rem] w-[1.1rem]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold">
                            {PAYEE_GROUPS[o.g].label}: owed to {o.n.toLocaleString('en-KE')}
                          </span>
                          <span className="text-muted-light block text-xs">
                            {o.oldest ? `Oldest since ${day(o.oldest)} · ` : ''}next weekly run
                          </span>
                        </span>
                        <span className="whitespace-nowrap rounded-full bg-[#FFF3CC] px-2.5 py-1 text-xs font-extrabold tabular-nums text-[#8A6400]">
                          {kes(o.cents)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Sheet>
            </div>

            <Sheet>
              <BatchesTable rows={batches} batchesHref={href('batches')} compact />
            </Sheet>
          </>
        )}

        {tab === 'merchants' && (
          <Sheet>
            <LinesTable
              rows={groupLines('merchant')}
              title="Merchant settlements"
              noun="merchant"
              batchesHref={href('batches')}
            />
          </Sheet>
        )}
        {tab === 'hosts' && (
          <Sheet>
            <LinesTable
              rows={groupLines('host')}
              title="Host payouts"
              noun="host"
              batchesHref={href('batches')}
            />
          </Sheet>
        )}
        {tab === 'riders' && (
          <Sheet>
            <LinesTable
              rows={groupLines('rider')}
              title="Rider payouts"
              noun="rider"
              batchesHref={href('batches')}
            />
          </Sheet>
        )}
        {tab === 'batches' && (
          <>
            {runDetail}
            <Sheet>
              <BatchesTable rows={batches} batchesHref={href('batches')} />
            </Sheet>
          </>
        )}
        {tab === 'history' && history}
      </main>
    </ConsoleShell>
  );
}

/** The ISO day `n` days after `day`. */
function plusDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
