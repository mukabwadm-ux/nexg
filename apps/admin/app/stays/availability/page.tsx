import { BedDouble, CalendarCheck, Coins, Layers, Moon } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashCard, DashKpi, DashKpiGrid, Pagination } from '@/components/portal/dash';
import { DashClear, DashSearch } from '@/components/portal/dash-filters';
import { UnitControls, UpdateAvailabilityButton } from '@/components/stays/client';
import {
  DataTable,
  ErrorNote,
  Fact,
  FilterRow,
  Footnote,
  PanelHint,
  photoUrl,
  PlaceCell,
  SidePanel,
  StaysHeader,
  WaitingForDatabase,
  WithPanel,
} from '@/components/stays/module';
import { todayInNairobi } from '@/lib/portal';
import {
  asMaybe,
  asNumber,
  asObject,
  kesCompact,
  kesFull,
  n,
  PAGE_SIZE,
  pageOf,
  staysHref,
  uuidOrNull,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Availability & Rates' };
export const dynamic = 'force-dynamic';

interface CalendarRow {
  unit_id: string;
  label: string;
  bedrooms: number | null;
  rate_kes: number | null;
  property_name: string | null;
  photo: unknown;
  days: {
    day: string;
    state: 'available' | 'booked' | 'hold' | 'blocked';
    rate_kes: number | null;
  }[];
}

const CELL: Record<string, string> = {
  available: 'bg-[#EAF7EE] text-[#1E7B34]',
  booked: 'bg-[#FDE7E5] text-[#C62D22]',
  hold: 'bg-[#FFF1C7] text-[#9A6700]',
  blocked: 'bg-[#EFEDE8] text-[#5E5A52]',
};
const CELL_LABEL: Record<string, string> = {
  available: 'Avail',
  booked: 'Booked',
  hold: 'Hold',
  blocked: 'Blocked',
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const shift = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const dayHead = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    date: d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
  };
};

/**
 * Stays → Availability & Rates: a week of each live unit, booked, held,
 * blocked or free, at its nightly rate. Blocking dates and changing a rate
 * are on the unit's panel and in Update Availability.
 */
export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    start?: string;
    q?: string;
    page?: string;
    selected?: string;
  };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
  const start =
    searchParams?.start && DAY.test(searchParams.start) ? searchParams.start : todayInNairobi();
  const q = (searchParams?.q ?? '').slice(0, 120);
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);

  const [cal, all] = await Promise.all([
    ctx.read('rpc_console_stays_calendar', {
      p_start: start,
      p_city: city,
      p_q: q || null,
      p_page: page,
      p_size: PAGE_SIZE,
    }),
    ctx.read('rpc_console_stays_calendar', {
      p_start: start,
      p_city: city,
      p_q: null,
      p_page: 1,
      p_size: 100,
    }),
  ]);
  const o = asObject(cal.data);
  const k = asObject(o.kpis);
  const days = (Array.isArray(o.days) ? o.days : []) as string[];
  const rows = (Array.isArray(o.rows) ? o.rows : []) as CalendarRow[];
  const allRows = (
    Array.isArray(asObject(all.data).rows) ? asObject(all.data).rows : []
  ) as CalendarRow[];
  const unit =
    rows.find((r) => r.unit_id === selected) ?? allRows.find((r) => r.unit_id === selected) ?? null;
  const keep = { start: searchParams?.start ?? null, q: q || null };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/availability', period, city, { ...keep, ...params });

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Availability & Rates"
        subtitle="A week of every live unit: booked, held, blocked or free, at its nightly rate."
        period={period}
        cities={ctx.cities}
        city={city}
        noPeriod
        action={
          <UpdateAvailabilityButton
            units={allRows.map((r) => ({
              id: r.unit_id,
              label: `${r.label}${r.property_name ? ` · ${r.property_name}` : ''}`,
            }))}
          />
        }
      />
      <DashCanvas>
        {cal.waiting ? (
          <WaitingForDatabase />
        ) : cal.error ? (
          <ErrorNote message={cal.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-5">
              <DashKpi
                featured
                icon={BedDouble}
                label="Total Units"
                value={n(asNumber(k.units))}
                explain="Live units."
              />
              <DashKpi
                icon={CalendarCheck}
                label="Available Today"
                value={n(asNumber(k.available_today))}
                explain="No booking, hold or block tonight."
              />
              <DashKpi
                icon={Moon}
                label="Occupied"
                value={n(asNumber(k.occupied_today))}
                explain="Booked or checked in tonight."
              />
              <DashKpi
                icon={Coins}
                label="Avg. Nightly Rate"
                value={asMaybe(k.avg_rate_kes) == null ? '—' : kesFull(asNumber(k.avg_rate_kes))}
                explain="The units' standard nightly rates, averaged."
              />
              <DashKpi
                icon={Layers}
                label="Booked Ahead"
                value={kesCompact(asNumber(k.booked_ahead_kes))}
                explain="What confirmed future stays come to."
              />
            </DashKpiGrid>

            <WithPanel
              panel={
                unit ? (
                  <SidePanel title={`Unit ${unit.label}`} closeHref={href({ selected: null })}>
                    {photoUrl(unit.photo) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl(unit.photo)!}
                        alt=""
                        className="mb-3 h-36 w-full rounded-xl object-cover"
                      />
                    )}
                    <Fact label="Building">{unit.property_name ?? '—'}</Fact>
                    <Fact label="Bedrooms">{unit.bedrooms ?? '—'}</Fact>
                    <h3 className="mt-3 text-[0.9375rem] font-extrabold">Rates & Plans</h3>
                    <Fact label="Standard Rate">{kesFull(unit.rate_kes)} / night</Fact>
                    <p className="text-muted mb-3 mt-1 text-[0.8125rem] font-semibold">
                      Weekend, long-stay and seasonal rates are not set per unit yet: every night is
                      quoted at the standard rate.
                    </p>
                    <UnitControls unitId={unit.unit_id} rate={unit.rate_kes} />
                    <div className="mt-3 text-[0.875rem] font-bold">
                      <Link
                        className="underline"
                        href={staysHref('/stays/units', period, city, { selected: unit.unit_id })}
                      >
                        View unit
                      </Link>
                    </div>
                  </SidePanel>
                ) : (
                  <PanelHint>Choose a unit to block dates or change its rate.</PanelHint>
                )
              }
            >
              <DashCard className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <FilterRow>
                    <DashSearch
                      value={q}
                      label="Search units"
                      placeholder="Search unit or building…"
                    />
                    <DashClear params={['q', 'selected', 'start']} />
                  </FilterRow>
                  <div className="flex gap-2 text-[0.875rem] font-bold">
                    <Link
                      className="border-border rounded-lg border px-3 py-2"
                      href={href({ start: shift(start, -7), page: null })}
                    >
                      ‹ Week before
                    </Link>
                    <Link
                      className="border-border rounded-lg border px-3 py-2"
                      href={href({ start: null, page: null })}
                    >
                      Today
                    </Link>
                    <Link
                      className="border-border rounded-lg border px-3 py-2"
                      href={href({ start: shift(start, 7), page: null })}
                    >
                      Week after ›
                    </Link>
                  </div>
                </div>
                <DataTable
                  caption="Unit availability by night"
                  isEmpty={rows.length === 0}
                  empty="No live units match."
                  head={[
                    'Unit',
                    'Base Rate',
                    ...days.map((d) => {
                      const h = dayHead(d);
                      return (
                        <span key={d} className="block text-center leading-tight">
                          {h.weekday}
                          <br />
                          {h.date}
                        </span>
                      );
                    }),
                  ]}
                >
                  {rows.map((r) => (
                    <tr
                      key={r.unit_id}
                      className={r.unit_id === selected ? 'bg-[#FFFBF0]' : undefined}
                    >
                      <td>
                        <PlaceCell
                          title={r.label}
                          sub={r.property_name ?? undefined}
                          photo={photoUrl(r.photo)}
                          href={href({ selected: r.unit_id, page: String(page) })}
                        />
                      </td>
                      <td className="whitespace-nowrap font-bold tabular-nums">
                        {kesFull(r.rate_kes)}
                      </td>
                      {r.days.map((d) => (
                        <td key={d.day} className="px-1">
                          <span
                            className={`block rounded-md px-1.5 py-1 text-center text-[0.75rem] font-bold ${CELL[d.state]}`}
                          >
                            {d.rate_kes != null ? n(d.rate_kes) : '—'}
                            <span className="block font-semibold">{CELL_LABEL[d.state]}</span>
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </DataTable>
                <div className="mt-3 flex flex-wrap gap-4 text-[0.8125rem] font-semibold">
                  {Object.entries(CELL_LABEL).map(([key, text]) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <span aria-hidden="true" className={`h-3 w-3 rounded-full ${CELL[key]}`} />
                      {text === 'Avail'
                        ? 'Available'
                        : text === 'Hold'
                          ? 'Hold (pending payment)'
                          : text}
                    </span>
                  ))}
                </div>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={asNumber(o.total)}
                  noun="units"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
                <Footnote>
                  Each night starts at check-in time; a hold is a guest paying now.
                </Footnote>
              </DashCard>
            </WithPanel>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
