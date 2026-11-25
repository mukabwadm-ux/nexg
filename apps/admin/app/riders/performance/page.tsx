import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Clock,
  Coins,
  GraduationCap,
  LineChart,
  Star,
  Target,
  ThumbsUp,
  TrendingUp,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import {
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  HeaderButton,
  Pagination,
} from '@/components/portal/dash';
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import {
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  MeterRows,
  RiderCell,
  ScreenHeader,
  Stars,
  WaitingForDatabase,
  ZoneChip,
} from '@/components/riders/module';
import { RiderRowMenu } from '@/components/riders/module-client';
import { periodFrom } from '@/lib/portal';
import {
  asMaybe,
  asNumber,
  asObject,
  delta,
  isMissingFunction,
  minutes,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  paged,
  pct,
  plainDelta,
  ppDelta,
  riderRef,
  screenHref,
  type RiderFact,
} from '@/lib/riders-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Rider Performance' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'top', label: 'Top Performers', icon: Award },
  { key: 'needs_improvement', label: 'Needs Improvement', icon: TrendingUp },
  { key: 'all', label: 'All Riders', icon: Users },
] as const;
type Tab = (typeof TABS)[number]['key'];

/**
 * Riders → Performance: on time, completion, acceptance, rating and the
 * score made of them (rpc_console_riders_performance; per rider from
 * rpc_console_riders_list). The score: on time 40%, completion 30%,
 * acceptance 20%, rating 10%, over the parts that have a figure.
 */
export default async function RiderPerformancePage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    tab?: string;
    q?: string;
    zone?: string;
    page?: string;
  };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const supabase = createClient();

  const period = periodFrom(searchParams);
  const tab: Tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'top',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const zone = searchParams?.zone && searchParams.zone !== 'all' ? searchParams.zone : null;
  const page = pageOf(searchParams?.page);

  const [readQ, listQ] = await Promise.all([
    supabase.rpc('rpc_console_riders_performance', { p_from: period.from, p_to: period.to }),
    supabase.rpc('rpc_console_riders_list', {
      p_from: period.from,
      p_to: period.to,
      p_tab: tab,
      p_q: q || undefined,
      p_zone: zone ?? undefined,
      p_sort: 'score',
      p_page: page,
      p_size: PAGE_SIZE,
    }),
  ]);
  const waiting = isMissingFunction(readQ.error) || isMissingFunction(listQ.error);
  const failed = !waiting && (readQ.error ?? listQ.error);

  const o = asObject(readQ.data);
  const k = asObject(o.kpis);
  const daily = (Array.isArray(o.daily) ? o.daily : []) as {
    day: string;
    on_time_pct: number | null;
    trips: number;
  }[];
  const byZone = (Array.isArray(o.by_zone) ? o.by_zone : []) as {
    zone: string;
    score: number | null;
    riders: number;
  }[];
  const list = paged<RiderFact>(listQ.data);

  const onTime = asMaybe(k.on_time_pct);
  const onTimePrev = asMaybe(k.on_time_pct_prev);
  const completion = asMaybe(k.completion_pct);
  const completionPrev = asMaybe(k.completion_pct_prev);
  const deliveryMin = asMaybe(k.delivery_min);
  const deliveryPrev = asMaybe(k.delivery_min_prev);
  const rating = asMaybe(k.rating);
  const below = asNumber(k.below_85);

  /* What changed, said plainly, only where there is a before to compare. */
  const insights: { good: boolean; text: string }[] = [];
  const said = (
    now: number | null,
    before: number | null,
    what: string,
    unit: 'pp' | '%',
    lowerIsBetter = false,
  ) => {
    if (now == null || before == null || now === before) return;
    const up = now > before;
    const good = lowerIsBetter ? !up : up;
    const size =
      unit === 'pp'
        ? `${Math.abs(now - before).toFixed(1)} pp`
        : `${Math.abs(delta(now, before) ?? 0).toFixed(1)}%`;
    insights.push({ good, text: `${what} ${up ? 'rose' : 'fell'} by ${size}.` });
  };
  said(onTime, onTimePrev, 'On-time delivery', 'pp');
  said(completion, completionPrev, 'Completion rate', 'pp');
  said(deliveryMin, deliveryPrev, 'Average delivery time', '%', true);
  if (below > 0)
    insights.push({ good: false, text: `${n(below)} riders are below an 85 performance score.` });

  const keep = { q: q || null, zone };
  const href = (params: Record<string, string | null | undefined>) =>
    screenHref('/riders/performance', period, {
      tab: tab === 'top' ? null : tab,
      ...keep,
      ...params,
    });

  return (
    <ConsoleShell staff={staff}>
      <ScreenHeader
        title="Riders – Performance"
        subtitle="Track rider productivity, service quality, efficiency and reliability."
        period={period}
        exportHref={screenHref('/riders/export', period, { view: 'performance', tab, ...keep })}
        action={
          <HeaderButton
            icon={LineChart}
            gold
            href={screenHref('/riders/export', period, { view: 'performance', tab: 'all' })}
          >
            Performance Report
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
                icon={Award}
                label="Overall Performance"
                value={pct(asMaybe(k.score))}
                deltaText={ppDelta(asMaybe(k.score), asMaybe(k.score_prev))}
                explain="The average rider score: on time 40%, completion 30%, acceptance 20%, rating 10%."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="On-time Delivery"
                value={pct(onTime)}
                deltaText={ppDelta(onTime, onTimePrev)}
                explain="Delivered at or before the promised time."
              />
              <DashKpi
                icon={Target}
                label="Completion Rate"
                value={pct(completion)}
                deltaText={ppDelta(completion, completionPrev)}
                explain="Deliveries ÷ offers accepted."
              />
              <DashKpi
                icon={Zap}
                label="Avg. Delivery Time"
                value={minutes(deliveryMin)}
                delta={delta(deliveryMin, deliveryPrev)}
                upIsBad
                explain="Picked up to delivered."
              />
              <DashKpi
                icon={Coins}
                label="Orders per Rider"
                value={
                  asMaybe(k.per_rider_day) == null ? null : `${asMaybe(k.per_rider_day)} / day`
                }
                delta={delta(asMaybe(k.per_rider_day), asMaybe(k.per_rider_day_prev))}
                explain="Deliveries per rider who delivered at least once, per day of the period."
              />
              <DashKpi
                icon={Star}
                label="Customer Rating"
                value={rating == null ? null : `${rating.toFixed(1)} / 5`}
                deltaText={plainDelta(rating, asMaybe(k.rating_prev))}
                explain="Customers' ratings of their rider given in the period."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <DashCard title="Performance Trend">
                {daily.some((d) => d.on_time_pct != null) ? (
                  <TrendArea
                    height={220}
                    data={daily
                      .filter((d) => d.on_time_pct != null)
                      .map((d) => ({
                        day: d.day.slice(0, 10),
                        on_time: asNumber(d.on_time_pct),
                      }))}
                    series={[{ key: 'on_time', label: 'On time (%)', color: '#F5B400' }]}
                  />
                ) : (
                  <p className="text-muted py-12 text-center text-sm font-semibold">
                    No timed deliveries in this period.
                  </p>
                )}
                <Footnote>
                  On-time share of each day&apos;s deliveries; days with none are left out.
                </Footnote>
              </DashCard>
              <DashCard title="Key Performance Metrics">
                <MeterRows
                  empty="No figures yet."
                  rows={[
                    { label: 'On-time Delivery', value: onTime, text: pct(onTime), icon: Clock },
                    {
                      label: 'Order Completion',
                      value: completion,
                      text: pct(completion),
                      icon: CheckCircle2,
                    },
                    {
                      label: 'Acceptance Rate',
                      value: asMaybe(k.acceptance_pct),
                      text: pct(asMaybe(k.acceptance_pct)),
                      icon: ThumbsUp,
                    },
                    {
                      label: 'Customer Rating',
                      value: rating == null ? null : rating * 20,
                      text: rating == null ? '—' : `${rating.toFixed(1)} / 5`,
                      icon: Star,
                    },
                    {
                      label: 'Cancellation Rate',
                      value: asMaybe(k.cancellation_pct),
                      text: pct(asMaybe(k.cancellation_pct)),
                      tone: 'red',
                      icon: XCircle,
                    },
                  ]}
                />
              </DashCard>
              <DashCard title="Performance by Zone">
                <MeterRows
                  empty="No rider has a score in a zone yet."
                  rows={byZone
                    .slice(0, 6)
                    .map((z) => ({ label: z.zone, value: z.score, text: pct(z.score) }))}
                />
                <Footnote>Average score of riders whose last fix is in the zone.</Footnote>
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Riders by performance"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    icon: t.icon,
                    count: t.key === 'top' ? undefined : (list.counts[t.key] ?? 0),
                    href: screenHref('/riders/performance', period, {
                      tab: t.key === 'top' ? null : t.key,
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
                  <DashSelect
                    label="Zone"
                    param="zone"
                    value={zone ?? 'all'}
                    options={(list.zones ?? []).map((z) => ({ value: z.id, label: z.name }))}
                  />
                  <DashClear params={['q', 'zone', 'tab']} />
                </FilterRow>
                <DataTable
                  caption="Rider performance"
                  isEmpty={list.rows.length === 0}
                  empty={
                    tab === 'needs_improvement'
                      ? 'Nobody is below 85. Good.'
                      : 'No rider has a score in this period yet.'
                  }
                  head={[
                    '#',
                    'Rider',
                    'Rider ID',
                    'Zone',
                    'Orders',
                    'On-time',
                    'Completion',
                    'Acceptance',
                    'Rating',
                    'Perf. Score',
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
                      <td>
                        <ZoneChip name={r.zone_name} />
                      </td>
                      <td className="text-center tabular-nums">{n(r.trips)}</td>
                      <td className="tabular-nums">{pct(r.on_time_pct)}</td>
                      <td className="tabular-nums">{pct(r.completion_pct)}</td>
                      <td className="tabular-nums">{pct(r.acceptance_pct)}</td>
                      <td>
                        <Stars value={r.rating_avg} />
                      </td>
                      <td>
                        {r.score == null ? (
                          '—'
                        ) : (
                          <span
                            className={`rounded-md px-2.5 py-1 font-extrabold tabular-nums ${
                              r.score >= 85
                                ? 'bg-[#E3F5E6] text-[#1E7B34]'
                                : 'bg-[#FDE7E5] text-[#C62D22]'
                            }`}
                          >
                            {pct(r.score)}
                          </span>
                        )}
                      </td>
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
              </DashCard>

              <div className="grid content-start gap-4">
                <DashCard title="Performance Insights">
                  {insights.length === 0 ? (
                    <p className="text-muted py-4 text-sm font-semibold">
                      Nothing to compare yet: the period before had no figures.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {insights.map((i) => (
                        <li
                          key={i.text}
                          className="flex items-start gap-2.5 text-[0.9375rem] font-semibold"
                        >
                          {i.good ? (
                            <CheckCircle2
                              aria-hidden="true"
                              className="mt-0.5 h-5 w-5 shrink-0 text-[#1E9E45]"
                            />
                          ) : (
                            <AlertTriangle
                              aria-hidden="true"
                              className="mt-0.5 h-5 w-5 shrink-0 text-[#E5A800]"
                            />
                          )}
                          {i.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </DashCard>
                <DashCard title="Improvement Actions">
                  <ul className="space-y-2.5">
                    <li>
                      <Link
                        href={href({ tab: 'needs_improvement', page: null })}
                        className="border-border hover:bg-bg flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 font-semibold"
                      >
                        <span className="flex items-center gap-2.5">
                          <GraduationCap aria-hidden="true" className="h-5 w-5 text-[#E5A800]" />
                          Coach the {n(below)} riders below 85
                        </span>
                        <span aria-hidden="true">›</span>
                      </Link>
                    </li>
                    <li>
                      <Link
                        href={screenHref('/riders/availability', period, {})}
                        className="border-border hover:bg-bg flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 font-semibold"
                      >
                        <span className="flex items-center gap-2.5">
                          <LineChart aria-hidden="true" className="h-5 w-5 text-[#E5A800]" />
                          Review low-performing zones
                        </span>
                        <span aria-hidden="true">›</span>
                      </Link>
                    </li>
                  </ul>
                  <Footnote>
                    Training is recorded on each rider&apos;s record (Application tab); messages go
                    from the row menu.
                  </Footnote>
                </DashCard>
              </div>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
