import {
  BedDouble,
  Building2,
  CalendarCheck,
  Coins,
  Key,
  LineChart,
  Moon,
  Percent,
  Repeat,
  Smile,
  Star,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashCard, DashKpi, DashKpiGrid, GoldTabs } from '@/components/portal/dash';
import { BarLineChart } from '@/components/stays/charts';
import {
  DataTable,
  Empty,
  ErrorNote,
  Footnote,
  MeterRows,
  ShareBars,
  StaysHeader,
  WaitingForDatabase,
} from '@/components/stays/module';
import {
  asMaybe,
  asNumber,
  asObject,
  delta,
  kesCompact,
  kesFull,
  label,
  monthShort,
  n,
  oneOf,
  pct,
  plainDelta,
  ppDelta,
  shareOf,
  SOURCE_LABEL,
  staysHref,
} from '@/lib/stays-module';
import { PERFORMANCE_TABS, PerformanceView } from '@/components/stays/tab-views';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Performance & Analytics' };
export const dynamic = 'force-dynamic';

const PALETTE = ['#F5A623', '#F5C842', '#C58BF2', '#2F80ED', '#9EC5F8'];

function KpiLine({
  icon: Icon,
  label: text,
  value,
  change,
}: {
  icon: typeof Star;
  label: string;
  value: string;
  change?: string;
}) {
  const bad = change?.startsWith('-');
  return (
    <li className="border-border flex items-center justify-between gap-3 border-b py-2 text-[0.875rem] last:border-b-0">
      <span className="flex items-center gap-2 font-semibold">
        <Icon aria-hidden="true" className="h-4 w-4 text-[#E5A800]" />
        {text}
      </span>
      <span className="flex items-center gap-3">
        <span className="font-extrabold tabular-nums">{value}</span>
        {change && (
          <span
            className={`w-16 text-right text-[0.8125rem] font-bold ${bad ? 'text-[#C62D22]' : 'text-[#1E7B34]'}`}
          >
            {change}
          </span>
        )}
      </span>
    </li>
  );
}

const pctChange = (now: number | null, before: number | null) => {
  const d = delta(now, before);
  return d == null ? undefined : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
};

/**
 * Stays → Performance & Analytics: the period against the one before
 * (bookings, value, commission, occupancy, ADR, RevPAR, cancellations,
 * ratings), six months of bookings, areas, top properties, channels, guest
 * segments, and the months ahead as booked so far (not a forecast).
 */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; city?: string; view?: string };
}) {
  const ctx = await staysContext(searchParams);
  const view = oneOf(
    PERFORMANCE_TABS.map((t) => t.key),
    searchParams?.view,
    'overview',
  );
  const { period, city } = ctx;
  const data = await ctx.read('rpc_console_stays_performance', {
    p_from: period.from,
    p_to: period.to,
    p_city: city,
  });
  const o = asObject(data.data);
  const k = asObject(o.kpis);
  const trend = (Array.isArray(o.trend) ? o.trend : []) as {
    month: string;
    bookings: number;
    value_kes: number;
  }[];
  const stars = (Array.isArray(o.stars) ? o.stars : []) as { stars: number; n: number }[];
  const areas = (Array.isArray(o.areas) ? o.areas : []) as {
    area: string;
    bookings: number;
    value_kes: number;
    commission_kes: number;
    occupancy_pct: number | null;
  }[];
  const top = (Array.isArray(o.top_properties) ? o.top_properties : []) as {
    property_id: string;
    name: string;
    area: string | null;
    units: number;
    value_kes: number;
    adr: number | null;
    occupancy_pct: number | null;
  }[];
  const channels = (Array.isArray(o.channels) ? o.channels : []) as { source: string; n: number }[];
  const seg = asObject(o.segments);
  const ahead = (Array.isArray(o.ahead) ? o.ahead : []) as {
    month: string;
    bookings: number;
    value_kes: number;
    commission_kes: number;
  }[];
  const bookings = asNumber(k.bookings);
  const ratings = asNumber(k.ratings);
  const channelTotal = channels.reduce((s, c) => s + asNumber(c.n), 0);
  const segments = [
    { key: 'long', label: 'Long Stays (7+ nights)', value: asNumber(seg.long) },
    { key: 'couples', label: 'Couples', value: asNumber(seg.couples) },
    { key: 'groups', label: 'Groups & Families', value: asNumber(seg.groups) },
    { key: 'solo', label: 'Solo / unknown party', value: asNumber(seg.solo) },
  ];

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Performance & Analytics"
        subtitle="How stays performed in the period against the period before."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={staysHref('/stays/export', period, city, { report: 'occupancy' })}
      />
      <DashCanvas>
        {data.waiting ? (
          <WaitingForDatabase />
        ) : data.error ? (
          <ErrorNote message={data.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-4 2xl:grid-cols-7">
              <DashKpi
                featured
                icon={CalendarCheck}
                label="Bookings"
                value={n(bookings)}
                delta={delta(bookings, asNumber(k.bookings_prev))}
                explain="Stays checking in during the period."
              />
              <DashKpi
                icon={LineChart}
                label="Occupancy Rate"
                value={pct(asMaybe(k.occupancy_pct))}
                deltaText={ppDelta(asMaybe(k.occupancy_pct), asMaybe(k.occupancy_prev_pct))}
                explain="Booked nights over live units × days."
              />
              <DashKpi
                icon={Coins}
                label="Booking Value (GBV)"
                value={kesCompact(asNumber(k.gbv))}
                delta={delta(asNumber(k.gbv), asNumber(k.gbv_prev))}
                explain="What those stays came to."
              />
              <DashKpi
                icon={Percent}
                label="NexG Commission"
                value={kesCompact(asNumber(k.commission))}
                delta={delta(asNumber(k.commission), asNumber(k.commission_prev))}
                explain="Commission recorded on them."
              />
              <DashKpi
                icon={Building2}
                label="Active Properties"
                value={n(asNumber(k.active_properties))}
                explain="Approved and listed."
              />
              <DashKpi
                icon={Key}
                label="Active Units"
                value={n(asNumber(k.active_units))}
                explain="Live units."
              />
              <DashKpi
                icon={Star}
                label="Avg. Rating"
                value={asMaybe(k.rating) == null ? '—' : `${asMaybe(k.rating)!.toFixed(1)}/5`}
                deltaText={plainDelta(asMaybe(k.rating), asMaybe(k.rating_prev))}
                explain="Stars on the period's stays."
              />
            </DashKpiGrid>
            <DashCard>
              <GoldTabs
                label="Performance"
                active={view}
                tabs={PERFORMANCE_TABS.map((t) => ({
                  key: t.key,
                  label: t.label,
                  href: staysHref('/stays/performance', period, city, {
                    view: t.key === 'overview' ? null : t.key,
                  }),
                }))}
              />
            </DashCard>
            {view === 'overview' ? (
              <>
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)]">
                  <DashCard title="Bookings & Revenue Trend">
                    {trend.every((t) => asNumber(t.bookings) === 0) ? (
                      <Empty>No bookings in the last six months.</Empty>
                    ) : (
                      <BarLineChart
                        data={trend.map((t) => ({
                          month: t.month,
                          bar: asNumber(t.bookings),
                          line: asNumber(t.value_kes),
                        }))}
                        bar={{ label: 'Bookings' }}
                        line={{ label: 'Booking Value', kes: true }}
                      />
                    )}
                  </DashCard>
                  <DashCard title="Key Performance Indicators">
                    <ul>
                      <KpiLine
                        icon={TrendingUp}
                        label="RevPAR (per available unit)"
                        value={kesFull(asMaybe(k.revpar))}
                        change={pctChange(asMaybe(k.revpar), asMaybe(k.revpar_prev))}
                      />
                      <KpiLine
                        icon={Coins}
                        label="ADR (Average Daily Rate)"
                        value={kesFull(asMaybe(k.adr))}
                        change={pctChange(asMaybe(k.adr), asMaybe(k.adr_prev))}
                      />
                      <KpiLine
                        icon={Moon}
                        label="Avg. Length of Stay"
                        value={
                          asMaybe(k.avg_nights) == null ? '—' : `${asMaybe(k.avg_nights)} nights`
                        }
                        change={pctChange(asMaybe(k.avg_nights), asMaybe(k.avg_nights_prev))}
                      />
                      <KpiLine
                        icon={XCircle}
                        label="Cancellation Rate"
                        value={pct(asMaybe(k.cancel_pct))}
                        change={ppDelta(asMaybe(k.cancel_pct), asMaybe(k.cancel_prev_pct))}
                      />
                      <KpiLine
                        icon={Repeat}
                        label="Repeat Guest Rate"
                        value={pct(asMaybe(k.repeat_pct))}
                      />
                      <KpiLine
                        icon={Smile}
                        label="Guest Satisfaction (4–5★)"
                        value={pct(asMaybe(k.satisfaction_pct))}
                      />
                    </ul>
                    <Footnote>
                      Repeat guests are matched by the name on the booking, so this is approximate.
                    </Footnote>
                  </DashCard>
                  <DashCard title="Occupancy Rate">
                    <ShareDonut
                      stacked
                      centre={pct(asMaybe(k.occupancy_pct))}
                      data={[
                        {
                          key: 'occ',
                          label: 'Booked nights',
                          value: asMaybe(k.occupancy_pct) ?? 0,
                          color: '#F5A623',
                        },
                        {
                          key: 'free',
                          label: 'Free nights',
                          value: Math.max(0, 100 - (asMaybe(k.occupancy_pct) ?? 0)),
                          color: '#EFEDE8',
                        },
                      ]}
                    />
                  </DashCard>
                  <DashCard title="Guest Ratings Overview">
                    <p className="mb-3 text-[1.5rem] font-extrabold">
                      <span className="text-[#F5B400]">★</span>{' '}
                      {asMaybe(k.rating) == null ? '—' : asMaybe(k.rating)!.toFixed(1)} / 5
                      <span className="text-muted ml-2 text-[0.875rem] font-semibold">
                        ({n(ratings)} reviews)
                      </span>
                    </p>
                    <MeterRows
                      empty="No ratings yet."
                      rows={
                        ratings === 0
                          ? []
                          : stars.map((s) => ({
                              label: `${s.stars} ★`,
                              value: shareOf(
                                asNumber(s.n),
                                Math.max(
                                  1,
                                  stars.reduce((a, b) => a + asNumber(b.n), 0),
                                ),
                              ),
                              text: pct(
                                shareOf(
                                  asNumber(s.n),
                                  Math.max(
                                    1,
                                    stars.reduce((a, b) => a + asNumber(b.n), 0),
                                  ),
                                ),
                                0,
                              ),
                              tone: 'gold' as const,
                            }))
                      }
                    />
                  </DashCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)]">
                  <DashCard title="Performance by Area (Top 5)">
                    <DataTable
                      caption="Performance by area"
                      isEmpty={areas.length === 0}
                      empty="No bookings in this period."
                      head={['Area', 'Bookings', 'Occupancy', 'Booking Value', 'Commission']}
                    >
                      {areas.map((a) => (
                        <tr key={a.area}>
                          <td className="font-semibold">{a.area}</td>
                          <td className="tabular-nums">{n(a.bookings)}</td>
                          <td className="tabular-nums">{pct(a.occupancy_pct)}</td>
                          <td className="tabular-nums">{kesCompact(a.value_kes)}</td>
                          <td className="tabular-nums">{kesCompact(a.commission_kes)}</td>
                        </tr>
                      ))}
                    </DataTable>
                  </DashCard>
                  <DashCard title="Top Performing Properties">
                    <DataTable
                      caption="Top performing properties"
                      isEmpty={top.length === 0}
                      empty="No bookings in this period."
                      head={['Property', 'Occ.', 'ADR', 'Revenue']}
                    >
                      {top.map((t) => (
                        <tr key={t.property_id}>
                          <td>
                            <span className="block font-bold">{t.name}</span>
                            <span className="text-muted text-[0.8125rem]">
                              {n(t.units)} units{t.area ? ` · ${t.area}` : ''}
                            </span>
                          </td>
                          <td className="tabular-nums">{pct(t.occupancy_pct, 0)}</td>
                          <td className="whitespace-nowrap tabular-nums">{kesFull(t.adr)}</td>
                          <td className="whitespace-nowrap tabular-nums">
                            {kesCompact(t.value_kes)}
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  </DashCard>
                  <DashCard title="Guest Segments">
                    {bookings === 0 ? (
                      <Empty>No bookings in this period.</Empty>
                    ) : (
                      <ShareDonut
                        centre={n(bookings)}
                        caption="Bookings"
                        data={segments.map((s, i) => ({
                          key: s.key,
                          label: `${s.label} ${pct(shareOf(s.value, bookings), 0)}`,
                          value: s.value,
                          color: PALETTE[i],
                        }))}
                      />
                    )}
                  </DashCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <DashCard title="Channel Performance">
                    <ShareBars
                      empty="No bookings in this period."
                      rows={channels.map((c) => ({
                        label: label(SOURCE_LABEL, c.source),
                        value: asNumber(c.n),
                        text: pct(shareOf(asNumber(c.n), channelTotal), 0),
                      }))}
                    />
                  </DashCard>
                  <DashCard title="Host & Property Performance">
                    <div className="grid grid-cols-2 gap-2 text-center">
                      {[
                        [Users, 'Active Hosts', n(asNumber(k.active_hosts))],
                        [Building2, 'Property Managers', n(asNumber(k.managers))],
                        [
                          Star,
                          'Avg. Host Rating',
                          asMaybe(k.host_rating) == null
                            ? '—'
                            : `${asMaybe(k.host_rating)!.toFixed(1)} / 5`,
                        ],
                        [BedDouble, 'Active Units', n(asNumber(k.active_units))],
                      ].map(([Icon, t, v]) => {
                        const I = Icon as typeof Users;
                        return (
                          <div key={String(t)} className="rounded-xl bg-[#FFFBF0] p-3">
                            <I aria-hidden="true" className="mx-auto h-5 w-5 text-[#E5A800]" />
                            <p className="text-[1.0625rem] font-extrabold">{String(v)}</p>
                            <p className="text-muted text-[0.75rem] font-semibold">{String(t)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </DashCard>
                  <DashCard title="Booked Ahead (Next 3 Months)">
                    <DataTable
                      caption="Booked ahead"
                      isEmpty={false}
                      empty=""
                      head={['Metric', ...ahead.map((a) => monthShort(a.month))]}
                    >
                      <tr>
                        <td className="font-semibold">Bookings</td>
                        {ahead.map((a) => (
                          <td key={a.month} className="tabular-nums">
                            {n(a.bookings)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="font-semibold">Booking Value</td>
                        {ahead.map((a) => (
                          <td key={a.month} className="tabular-nums">
                            {kesCompact(a.value_kes)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="font-semibold">NexG Commission</td>
                        {ahead.map((a) => (
                          <td key={a.month} className="tabular-nums">
                            {kesCompact(a.commission_kes)}
                          </td>
                        ))}
                      </tr>
                    </DataTable>
                    <Footnote>
                      Confirmed stays already booked for those months, not a forecast.
                    </Footnote>
                  </DashCard>
                </div>
              </>
            ) : (
              <PerformanceView view={view} data={data.data} />
            )}
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
