import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import {
  Overview,
  type CalendarRow,
  type DecisionRow,
  type FlowRow,
  type OverviewRow,
  type OwedRow,
  type RevenueRow,
} from '@/components/finance/overview';
import { Settlement, type LineRow, type RunRow } from '@/components/finance/settlement';
import { Freshness } from '@/components/finance/shared';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Finance' };
export const dynamic = 'force-dynamic';

/*
 * The seven tabs the module is specified with. Four of them are
 * not built, and they are shown greyed rather than linked or
 * hidden.
 *
 * Hiding them would make the module look finished. Linking them
 * would 404 — which this console has already done once, when a
 * migration naming a route was pushed before the route existed.
 */
const TABS = [
  { key: 'overview', label: 'Overview', built: true },
  { key: 'settlement', label: 'Weekly settlement', built: true },
  { key: 'reconciliation', label: 'Reconciliation', built: false },
  { key: 'fees', label: 'Fees & commissions', built: false },
  { key: 'invoices', label: 'Invoices', built: false },
  { key: 'tax', label: 'Tax', built: false },
  { key: 'exports', label: 'Exports', built: false },
] as const;

/**
 * Money → Finance.
 *
 * Every figure on this page is read from a `fin_*` projection.
 * Nothing here sums ledger entries, with one deliberate
 * exception: the Verify button, which re-derives a figure on
 * demand so that "is this screen still true?" has an answer
 * somebody can get for themselves.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams?: { tab?: string; run?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'finance');
  const supabase = createClient();

  const requested = searchParams?.tab;
  const tab = TABS.find((t) => t.key === requested && t.built)?.key ?? 'overview';

  /* How old everything on the page is. Read first and shown in
     the header on every tab, including when it is healthy. */
  const { data: fresh } = await supabase.from('fin_freshness_v').select('*').maybeSingle();
  const freshness = fresh as {
    newest: string | null;
    stale_count: number;
    failing_count: number;
    through_entry: number | null;
  } | null;

/*
   * The same window the projections roll the tiles up over:
   * the first of this month to today, in Nairobi time. Verify
   * is handed exactly this, so it checks what is on screen
   * rather than something adjacent to it.
   */
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const monthStart = today.slice(0, 8) + '01';

  let body: React.ReactNode = null;

  if (tab === 'overview') {
    const [overview, flow, revenue, decisions, calendar, owed] = await Promise.all([
      supabase.from('fin_overview_v').select('*'),
      supabase.from('fin_money_flow').select('*').order('sort'),
      supabase.from('fin_revenue_line').select('*').order('amount_cents', { ascending: false }),
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

    const cityRows = (overview.data as OverviewRow[] | null) ?? [];

    /*
     * The headline totals are summed from the per-city rows
     * rather than read from a seventh "all cities" row. One
     * derivation, so the tiles and the city table can only
     * disagree if arithmetic itself is broken.
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
      <Overview
        totals={totals}
        cities={cityRows}
        flow={(flow.data as FlowRow[] | null) ?? []}
        revenue={(revenue.data as RevenueRow[] | null) ?? []}
        decisions={(decisions.data as DecisionRow[] | null) ?? []}
        calendar={(calendar.data as CalendarRow[] | null) ?? []}
        owed={(owed.data as OwedRow[] | null) ?? []}
        from={monthStart}
        to={today}
      />
    );
  }

  if (tab === 'settlement') {
    const { data: runList } = await supabase
      .from('fin_run_v')
      .select('id, reference, state, period_end')
      .order('period_end', { ascending: false })
      .limit(8);

    const runs =
      (runList as { id: string; reference: string; state: string; period_end: string }[] | null) ??
      [];
    const selected = runs.find((r) => r.id === searchParams?.run) ?? runs[0];

    let run: RunRow | null = null;
    let lines: LineRow[] = [];

    if (selected) {
      const [runRes, lineRes] = await Promise.all([
        supabase.from('fin_run_v').select('*').eq('id', selected.id).maybeSingle(),
        supabase
          .from('fin_run_line_v')
          .select('*')
          .eq('run_id', selected.id)
          .order('net_cents', { ascending: false }),
      ]);
      run = (runRes.data as RunRow | null) ?? null;
      lines = (lineRes.data as LineRow[] | null) ?? [];
    }

    body = <Settlement runs={runs} run={run} lines={lines} />;
  }

  return (
    <ConsoleShell staff={staff} current="finance">
      <ConsoleHeader
        title="Finance"
        breadcrumb="Money · Finance"
        action={
          <Freshness
            asOf={freshness?.newest ?? null}
            stale={freshness?.stale_count ?? 0}
            failing={freshness?.failing_count ?? 0}
            throughEntry={freshness?.through_entry ?? null}
          />
        }
      />

      <div className="border-border bg-surface flex flex-wrap gap-2 border-b px-4 py-3 sm:px-8">
        {TABS.map((t) =>
          t.built ? (
            <Link
              key={t.key}
              href={`/finance?tab=${t.key}`}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-[0.8125rem] font-extrabold transition-colors ${
                t.key === tab
                  ? 'bg-ink text-white'
                  : 'border-border-strong bg-surface text-ink hover:border-ink border'
              }`}
            >
              {t.label}
            </Link>
          ) : (
            <span
              key={t.key}
              title="Designed, not built yet"
              className="border-border text-muted-light cursor-not-allowed rounded-full border border-dashed px-4 py-2 text-[0.8125rem] font-extrabold"
            >
              {t.label}
            </span>
          ),
        )}
      </div>

      <div className="px-4 py-6 sm:px-8">{body}</div>
    </ConsoleShell>
  );
}
