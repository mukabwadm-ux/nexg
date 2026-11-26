import {
  BedDouble,
  Building2,
  CalendarCheck,
  Coins,
  LineChart,
  ShoppingBag,
  Users,
  UserCheck,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut, TrendArea } from '@/components/charts';
import { CardLink, DashCanvas, DashCard, DashKpi, DashKpiGrid } from '@/components/portal/dash';
import { ConsoleShell } from '@/components/console-shell';
import {
  Chip,
  DataTable,
  Empty,
  ErrorNote,
  Footnote,
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
  n,
  ORDER_CATEGORY_LABEL,
  pct,
  ppDelta,
  shortDate,
  staysHref,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Overview' };
export const dynamic = 'force-dynamic';

interface RecentRow {
  stay_id: string;
  ref: string;
  guest_name: string;
  unit_label: string | null;
  property_name: string | null;
  check_in: string;
  check_out: string;
  value_kes: number | null;
  status: string;
}

interface TopRow {
  property_id: string;
  name: string;
  units: number;
  value_kes: number | null;
  occupancy_pct: number | null;
}

const DONUT = ['#E5A800', '#F5C842', '#C9B28A', '#B9B3A7', '#8F8A80', '#D9D4CA'];

/**
 * Stays → Overview: hosts, buildings and units on NexG, how full they are,
 * what guests booked and spent, the latest reservations and the buildings
 * that took the most. Counted by rpc_console_stays_overview.
 */
export default async function StaysOverviewPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; city?: string };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
  const q = await ctx.read('rpc_console_stays_overview', {
    p_from: period.from,
    p_to: period.to,
    p_city: city,
  });
  const o = asObject(q.data);
  const k = asObject(o.kpis);
  const occupancy = (Array.isArray(o.occupancy) ? o.occupancy : []) as {
    day: string;
    pct: number | null;
  }[];
  const spending = asObject(o.spending);
  const orders = (Array.isArray(spending.orders) ? spending.orders : []) as {
    category: string;
    kes: number;
  }[];
  const recent = (Array.isArray(o.recent) ? o.recent : []) as RecentRow[];
  const top = (Array.isArray(o.top) ? o.top : []) as TopRow[];
  const accommodation = asNumber(spending.accommodation);
  const ordersTotal = orders.reduce((s, r) => s + asNumber(r.kes), 0);
  const spendTotal = accommodation + ordersTotal;
  const href = (path: string, params: Record<string, string | null> = {}) =>
    staysHref(path, period, city, params);

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Overview"
        subtitle="Hosts, buildings, units, guests and what they booked and spent, for the period."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={href('/stays/export', { report: 'bookings' })}
      />
      <DashCanvas>
        {q.waiting ? (
          <WaitingForDatabase />
        ) : q.error ? (
          <ErrorNote message={q.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-4">
              <DashKpi
                featured
                icon={Users}
                label="Total Hosts"
                value={n(asNumber(k.hosts))}
                explain="Hosts who are applying, being verified, live or paused (offboarded hosts left out)."
              >
                <span className="text-muted text-[0.8125rem] font-semibold">
                  {n(asNumber(k.hosts_new))} new in the period
                </span>
              </DashKpi>
              <DashKpi
                icon={Building2}
                label="Buildings"
                value={n(asNumber(k.buildings))}
                explain="Properties hosts have added, not archived."
                href={href('/stays/buildings')}
              >
                <span className="text-muted text-[0.8125rem] font-semibold">
                  {n(asNumber(k.buildings_new))} added in the period
                </span>
              </DashKpi>
              <DashKpi
                icon={BedDouble}
                label="Units"
                value={n(asNumber(k.units))}
                explain="Accommodation units, listed or not. Live units are the ones guests can book."
                href={href('/stays/units')}
              >
                <span className="text-muted text-[0.8125rem] font-semibold">
                  {n(asNumber(k.units_live))} live
                </span>
              </DashKpi>
              <DashKpi
                icon={LineChart}
                label="Occupancy Rate"
                value={pct(asMaybe(k.occupancy_pct))}
                deltaText={ppDelta(asMaybe(k.occupancy_pct), asMaybe(k.occupancy_prev_pct))}
                explain="Booked nights in the period over live units × days. The change is against the period of the same length before."
              />
              <DashKpi
                icon={UserCheck}
                label="Current Guests"
                value={n(asNumber(k.current_guests))}
                explain="Guests in stays that are checked in right now (the party size, at least one per stay)."
                href={href('/stays/check-ins', { tab: 'in_house' })}
              />
              <DashKpi
                icon={CalendarCheck}
                label="Booking Value"
                value={kesCompact(asNumber(k.booking_value))}
                delta={delta(asNumber(k.booking_value), asNumber(k.booking_value_prev))}
                explain="What guests paid (or were quoted) for stays checking in during the period."
              />
              <DashKpi
                icon={ShoppingBag}
                label="Guest Concierge Spending"
                value={kesCompact(asNumber(k.guest_spend))}
                explain="Guest orders placed through a unit's QR while a stay was on, paid."
                href={href('/stays/spending')}
              />
              <DashKpi
                icon={Coins}
                label="NexG Commission"
                value={kesCompact(asNumber(k.commission))}
                delta={delta(asNumber(k.commission), asNumber(k.commission_prev))}
                explain="NexG's commission recorded on those stays (VAT-inclusive). Stays a host entered themselves carry none."
                href={href('/stays/finance')}
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <DashCard title="Occupancy Rate Trend">
                {occupancy.some((d) => (d.pct ?? 0) > 0) ? (
                  <TrendArea
                    height={240}
                    data={occupancy.map((d) => ({ day: d.day.slice(0, 10), pct: d.pct ?? 0 }))}
                    series={[{ key: 'pct', label: 'Occupancy %', color: '#F5A623' }]}
                  />
                ) : (
                  <Empty>No booked nights in this period yet.</Empty>
                )}
                <Footnote>Units with a booking that night, of live units, each day.</Footnote>
              </DashCard>
              <DashCard title="Guest Spending Breakdown">
                {spendTotal > 0 ? (
                  <ShareDonut
                    centre={kesCompact(spendTotal)}
                    unit="kes"
                    data={[
                      {
                        key: 'accommodation',
                        label: 'Accommodation',
                        value: accommodation,
                        color: DONUT[0],
                      },
                      ...orders.map((r, i) => ({
                        key: r.category,
                        label: label(ORDER_CATEGORY_LABEL, r.category),
                        value: asNumber(r.kes),
                        color: DONUT[(i + 1) % DONUT.length],
                      })),
                    ]}
                  />
                ) : (
                  <Empty>Nothing booked or ordered in this period yet.</Empty>
                )}
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <DashCard
                title="Recent Reservations"
                aside={<CardLink href={href('/stays/reservations')}>View All</CardLink>}
              >
                <DataTable
                  caption="Recent reservations"
                  isEmpty={recent.length === 0}
                  empty="No reservations in this period."
                  head={[
                    'Reservation',
                    'Guest',
                    'Unit',
                    'Check-in',
                    'Check-out',
                    'Value',
                    'Status',
                  ]}
                >
                  {recent.map((r) => (
                    <tr key={r.stay_id}>
                      <td className="whitespace-nowrap font-semibold">
                        <a
                          className="hover:underline"
                          href={href('/stays/reservations', { selected: r.stay_id })}
                        >
                          {r.ref}
                        </a>
                      </td>
                      <td>{r.guest_name}</td>
                      <td className="whitespace-nowrap">{r.unit_label ?? '—'}</td>
                      <td className="whitespace-nowrap">{shortDate(r.check_in)}</td>
                      <td className="whitespace-nowrap">{shortDate(r.check_out)}</td>
                      <td className="whitespace-nowrap font-bold tabular-nums">
                        {kesFull(r.value_kes)}
                      </td>
                      <td>
                        <Chip status={r.status} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </DashCard>
              <DashCard
                title="Top Buildings by Booking Value"
                aside={<CardLink href={href('/stays/buildings')}>View All</CardLink>}
              >
                <DataTable
                  caption="Top buildings by booking value"
                  isEmpty={top.length === 0}
                  empty="No building has a booking in this period yet."
                  head={['Building', 'Units', 'Occupancy', 'Booking Value']}
                >
                  {top.map((t) => (
                    <tr key={t.property_id}>
                      <td className="font-semibold">{t.name}</td>
                      <td className="tabular-nums">{n(t.units)}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums">{pct(t.occupancy_pct, 0)}</span>
                          <span className="bg-bg h-2 w-24 overflow-hidden rounded-full">
                            <span
                              className="block h-full rounded-full bg-[#F5A623]"
                              style={{ width: `${Math.min(100, t.occupancy_pct ?? 0)}%` }}
                            />
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap font-bold tabular-nums">
                        {kesCompact(t.value_kes)}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </DashCard>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
