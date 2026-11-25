import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Coins,
  Download,
  FileText,
  Layers,
  RefreshCcw,
  Users,
  Wallet,
  XCircle,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut, TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import {
  CardLink,
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  HeaderButton,
  Pagination,
} from '@/components/portal/dash';
import { DashClear, DashSearch } from '@/components/portal/dash-filters';
import {
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  PanelLine,
  PayoutChip,
  RiderCell,
  ScreenHeader,
  WaitingForDatabase,
} from '@/components/riders/module';
import { RiderRowMenu } from '@/components/riders/module-client';
import { periodFrom } from '@/lib/portal';
import {
  asNumber,
  asObject,
  dayOnly,
  delta,
  isMissingFunction,
  kesCompact,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  paged,
  pct,
  riderRef,
  screenHref,
  shareOf,
  type RiderFact,
} from '@/lib/riders-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Earnings & Payouts' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Riders', icon: Users },
  { key: 'paid', label: 'Paid', icon: CheckCircle2 },
  { key: 'pending', label: 'Pending', icon: Clock },
  { key: 'failed', label: 'Failed', icon: XCircle },
] as const;
type Tab = (typeof TABS)[number]['key'];

const FREQUENCY: Record<string, string> = {
  immediate: 'Immediate',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/**
 * Riders → Earnings & Payouts: delivery fees, what riders earned and what
 * was paid out (rpc_console_riders_earnings), per rider from
 * rpc_console_riders_list. Payout runs themselves are decided on Finance →
 * Settlements & Payouts (#200, #202); this screen links there.
 */
export default async function RiderEarningsPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; tab?: string; q?: string; page?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const supabase = createClient();

  const period = periodFrom(searchParams);
  const tab: Tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const page = pageOf(searchParams?.page);

  const [readQ, listQ] = await Promise.all([
    supabase.rpc('rpc_console_riders_earnings', { p_from: period.from, p_to: period.to }),
    supabase.rpc('rpc_console_riders_list', {
      p_from: period.from,
      p_to: period.to,
      p_tab: tab,
      p_q: q || undefined,
      p_sort: 'earned',
      p_page: page,
      p_size: PAGE_SIZE,
    }),
  ]);
  const waiting = isMissingFunction(readQ.error) || isMissingFunction(listQ.error);
  const failed = !waiting && (readQ.error ?? listQ.error);

  const o = asObject(readQ.data);
  const k = asObject(o.kpis);
  const b = asObject(o.breakdown);
  const daily = (Array.isArray(o.daily) ? o.daily : []) as { day: string; kes: number }[];
  const runs = (Array.isArray(o.recent_runs) ? o.recent_runs : []) as {
    day: string;
    cents: number;
    riders: number;
  }[];
  const list = paged<RiderFact>(listQ.data);

  const fees = asNumber(k.fees_cents) / 100;
  const riderKes = asNumber(k.rider_kes);
  const tips = asNumber(b.tips_kes);
  /* NexG keeps the fees the riders were not paid; tips are the customer's
     money passed through, so they are not taken from the fees. */
  const nexgShare = fees - (riderKes - tips);
  const paid = asNumber(k.paid_cents) / 100;
  const pending = asNumber(k.pending_cents) / 100;
  const nextRun = typeof k.next_run === 'string' ? k.next_run : null;
  const frequency =
    typeof o.frequency === 'string' ? (FREQUENCY[o.frequency] ?? o.frequency) : null;

  const keep = { q: q || null };
  const href = (params: Record<string, string | null | undefined>) =>
    screenHref('/riders/earnings', period, { tab: tab === 'all' ? null : tab, ...keep, ...params });
  const statement = screenHref('/riders/export', period, { view: 'statement' });

  return (
    <ConsoleShell staff={staff}>
      <ScreenHeader
        title="Riders – Earnings & Payouts"
        subtitle="Track rider earnings, commissions, deductions and payouts."
        period={period}
        exportHref={screenHref('/riders/export', period, { view: 'earnings', tab, ...keep })}
        action={
          <HeaderButton icon={Layers} gold href="/finance/settlements">
            Process Payouts
          </HeaderButton>
        }
      />
      <DashCanvas>
        {waiting ? (
          <WaitingForDatabase />
        ) : failed ? (
          <ErrorNote message={failed.message} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Coins}
                label="Delivery Fees"
                value={kesCompact(fees)}
                delta={delta(asNumber(k.fees_cents), asNumber(k.fees_cents_prev))}
                explain="Delivery fees on orders NexG riders delivered in the period."
              />
              <DashKpi
                icon={FileText}
                label="Rider Earnings"
                value={kesCompact(riderKes)}
                delta={delta(riderKes, asNumber(k.rider_kes_prev))}
                explain="Everything riders earned in the period: trip pay, bonuses and tips."
              />
              <DashKpi
                icon={Layers}
                label="NexG Share"
                value={kesCompact(nexgShare)}
                explain="Delivery fees less what riders were paid for the trips (tips are not counted against the fees)."
              >
                <Sub text={fees > 0 ? `(${pct(shareOf(nexgShare, fees))} of fees)` : '—'} />
              </DashKpi>
              <DashKpi
                icon={Wallet}
                label="Total Payouts"
                value={kesCompact(paid)}
                delta={delta(asNumber(k.paid_cents), asNumber(k.paid_cents_prev))}
                explain="Rider payouts paid in the period, after fees (test payouts left out)."
              />
              <DashKpi
                icon={Clock}
                label="Pending Payouts"
                value={kesCompact(pending)}
                explain="Payouts held or sending now, before fees."
              >
                <Sub
                  text={`${n(asNumber(k.pending_riders))} ${asNumber(k.pending_riders) === 1 ? 'rider' : 'riders'}`}
                />
              </DashKpi>
              <DashKpi
                icon={CalendarClock}
                label="Next Payout Run"
                value={nextRun ? shortDay(nextRun) : null}
                explain="The earliest slot a held payout is waiting for."
              >
                {!nextRun && (
                  <span className="text-muted mt-1 block text-sm font-semibold">
                    Nothing waiting
                  </span>
                )}
              </DashKpi>
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <DashCard title="Earnings Trend (KES)">
                {daily.some((d) => asNumber(d.kes) > 0) ? (
                  <TrendArea
                    unit="kes"
                    height={220}
                    data={daily.map((d) => ({ day: d.day.slice(0, 10), kes: asNumber(d.kes) }))}
                    series={[{ key: 'kes', label: 'Rider earnings', color: '#F5B400' }]}
                  />
                ) : (
                  <p className="text-muted py-12 text-center text-sm font-semibold">
                    No rider earnings in this period.
                  </p>
                )}
              </DashCard>
              <DashCard title="Earnings Breakdown">
                <ShareDonut
                  stacked
                  unit="kes"
                  centre={kesCompact(riderKes + Math.max(0, nexgShare)).replace('KES ', '')}
                  caption="Total"
                  data={[
                    {
                      key: 'trip',
                      label: 'Rider trip pay',
                      value: Math.max(0, asNumber(b.trip_pay_kes)),
                      color: '#1E9E45',
                    },
                    {
                      key: 'nexg',
                      label: 'NexG share',
                      value: Math.max(0, nexgShare),
                      color: '#F5B400',
                    },
                    {
                      key: 'bonus',
                      label: 'Incentives & bonuses',
                      value: Math.max(0, asNumber(b.bonuses_kes)),
                      color: '#2F80ED',
                    },
                    { key: 'tips', label: 'Tips', value: Math.max(0, tips), color: '#7C3AED' },
                    {
                      key: 'adj',
                      label: 'Adjustments',
                      value: Math.abs(asNumber(b.adjustments_kes)),
                      color: '#C9C4B8',
                    },
                  ]}
                />
              </DashCard>
              <DashCard title="Payout Summary">
                <ul>
                  <PanelLine
                    icon={CheckCircle2}
                    label="Paid This Period"
                    value={kesCompact(paid)}
                  />
                  <PanelLine
                    icon={Clock}
                    label="Pending"
                    value={kesCompact(pending)}
                    href={href({ tab: 'pending' })}
                  />
                  <PanelLine
                    icon={CalendarClock}
                    label="Next Payout Run"
                    value={nextRun ? dayOnly(nextRun) : 'Nothing waiting'}
                  />
                  <PanelLine
                    icon={RefreshCcw}
                    label="Payout Frequency"
                    value={frequency ?? 'Not set'}
                    href="/finance/payout-rules"
                  />
                </ul>
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Payout status"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    icon: t.icon,
                    count: list.counts[t.key] ?? 0,
                    href: screenHref('/riders/earnings', period, {
                      tab: t.key === 'all' ? null : t.key,
                      ...keep,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search riders"
                    placeholder="Search by name, phone, rider ID…"
                  />
                  <DashClear params={['q', 'tab']} />
                </FilterRow>
                <DataTable
                  caption="Rider earnings and payouts"
                  isEmpty={list.rows.length === 0}
                  empty="No riders match."
                  head={[
                    '#',
                    'Rider',
                    'Rider ID',
                    'Orders',
                    'Earnings (KES)',
                    'Adjustments',
                    'Net (KES)',
                    'Payout Status',
                    'Payout Method',
                    'Last Payout',
                    <span key="a" className="sr-only">
                      Actions
                    </span>,
                  ]}
                >
                  {list.rows.map((r) => (
                    <tr key={r.rider_id}>
                      <td className="text-muted font-semibold tabular-nums">{r.rn}</td>
                      <td>
                        <RiderCell id={r.rider_id} name={r.name} />
                      </td>
                      <td className="whitespace-nowrap font-semibold">{riderRef(r.rider_id)}</td>
                      <td className="text-center tabular-nums">{n(r.trips)}</td>
                      <td className="font-bold tabular-nums">{n(r.earned_kes)}</td>
                      <td className={`tabular-nums ${r.adjustments_kes < 0 ? 'text-danger' : ''}`}>
                        {n(r.adjustments_kes)}
                      </td>
                      <td className="font-bold tabular-nums">
                        {n(r.earned_kes + r.adjustments_kes)}
                      </td>
                      <td>
                        <PayoutChip state={r.payout_state} />
                      </td>
                      <td>{r.payout_method ?? '—'}</td>
                      <td className="whitespace-nowrap">{dayOnly(r.payout_paid_at)}</td>
                      <td>
                        <RiderRowMenu riderId={r.rider_id} name={r.name} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={list.total}
                  noun="riders"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
                <Footnote>
                  Payout Status is each rider&apos;s latest payout. Riders are sorted by earnings.
                </Footnote>
              </DashCard>

              <div className="grid content-start gap-4">
                <DashCard
                  title="Recent Payouts"
                  aside={<CardLink href="/finance/settlements">View All</CardLink>}
                >
                  {runs.length === 0 ? (
                    <p className="text-muted py-6 text-center text-sm font-semibold">
                      No payouts paid yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {runs.map((r) => (
                        <li key={r.day} className="flex items-center gap-3">
                          <CheckCircle2
                            aria-hidden="true"
                            className="h-5 w-5 shrink-0 text-[#1E9E45]"
                          />
                          <span className="flex-1 font-extrabold tabular-nums">
                            {kesCompact(asNumber(r.cents) / 100)}
                          </span>
                          <span className="text-muted text-[0.8125rem] font-semibold">
                            {n(asNumber(r.riders))} riders
                          </span>
                          <span className="text-[0.8125rem] font-semibold">
                            {dayOnly(`${r.day}T12:00:00+03:00`)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </DashCard>
                <DashCard title="Earnings Statement">
                  <p className="text-muted text-sm font-semibold">
                    Every rider&apos;s earnings for {dayOnly(`${period.from}T12:00:00+03:00`)} –{' '}
                    {dayOnly(`${period.to}T12:00:00+03:00`)}: trips, trip pay, bonuses, tips,
                    adjustments and payouts, as a spreadsheet (CSV).
                  </p>
                  <a
                    href={statement}
                    className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] font-bold text-[#1A1A1A] hover:brightness-105"
                  >
                    <Download aria-hidden="true" className="h-4 w-4" />
                    Download Statement (CSV)
                  </a>
                  <Footnote>Change the period with the date picker at the top.</Footnote>
                </DashCard>
              </div>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

/** "Nov 26": the KPI card has no room for the year. */
function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'Africa/Nairobi',
    month: 'short',
    day: 'numeric',
  });
}

function Sub({ text }: { text: string }) {
  return (
    <span className="text-ink mt-2 block text-[0.9375rem] font-extrabold tabular-nums">{text}</span>
  );
}
