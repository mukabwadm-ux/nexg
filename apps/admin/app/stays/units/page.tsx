import {
  BedDouble,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Coins,
  Layers,
  LineChart,
  PauseCircle,
  Ruler,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import {
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  Pagination,
} from '@/components/portal/dash';
import { DashClear, DashSearch } from '@/components/portal/dash-filters';
import { UnitControls } from '@/components/stays/client';
import {
  Chip,
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
import {
  asMaybe,
  asNumber,
  asObject,
  kesCompact,
  kesFull,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  paged,
  pct,
  shortDate,
  staysHref,
  uuidOrNull,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Accommodation Units' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Units' },
  { key: 'listed', label: 'Listed' },
  { key: 'occupied', label: 'Occupied' },
  { key: 'available', label: 'Available' },
  { key: 'setting_up', label: 'Setting up' },
  { key: 'inactive', label: 'Inactive' },
] as const;

interface UnitRow {
  unit_id: string;
  label: string;
  unit_no: string | null;
  bedrooms: number | null;
  max_guests: number | null;
  nightly_rate_kes: number | null;
  unit_status: string;
  listed: boolean;
  floor: string | null;
  size_sqm: number | null;
  unit_amenities: string[] | null;
  photo: unknown;
  created_at: string;
  paused_reason: string | null;
  property_id: string | null;
  property_name: string | null;
  area: string | null;
  host_id: string;
  host_name: string | null;
  nights: number;
  blocked_nights: number;
  current_stay: { stay_id: string; check_in: string; check_out: string } | null;
  revenue_kes: number;
  bucket: string;
  occupancy_pct: number | null;
}

/** Stays → Accommodation Units: every unit, its rate and how full it was in the period. */
export default async function UnitsPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    q?: string;
    page?: string;
    selected?: string;
  };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
  const tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);

  const list = await ctx.read('rpc_console_stays_units', {
    p_from: period.from,
    p_to: period.to,
    p_city: city,
    p_tab: tab,
    p_q: q || null,
    p_page: page,
    p_size: PAGE_SIZE,
  });
  const rows = paged<UnitRow>(list.data);
  const k = asObject(asObject(list.data).kpis);
  /* The selected unit: from this page, or read on its own when it is on another. */
  let unit = rows.rows.find((r) => r.unit_id === selected) ?? null;
  if (selected && !unit) {
    const one = await ctx.read('rpc_console_stays_units', {
      p_from: period.from,
      p_to: period.to,
      p_city: null,
      p_tab: 'all',
      p_q: null,
      p_page: 1,
      p_size: 500,
    });
    unit = paged<UnitRow>(one.data).rows.find((r) => r.unit_id === selected) ?? null;
  }
  const keep = { tab: tab === 'all' ? null : tab, q: q || null };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/units', period, city, { ...keep, ...params });
  const web = (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://nexgapp.com').replace(/\/$/, '');

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Accommodation Units"
        subtitle="Every unit, its rate, and how full it was in the period."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={staysHref('/stays/export', period, city, { report: 'units' })}
        action={
          <a
            href={`${web}/hosts`}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-visible:ring-gold inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-b from-[#FFD24D] to-[#F5B400] px-4 text-[0.9375rem] font-bold text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2"
          >
            + Add Unit
            <span className="sr-only">
              (hosts add units in their workspace; opens the host page)
            </span>
          </a>
        }
      />
      <DashCanvas>
        {list.waiting ? (
          <WaitingForDatabase />
        ) : list.error ? (
          <ErrorNote message={list.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={BedDouble}
                label="Total Units"
                value={n(rows.counts.all ?? 0)}
                explain="Units not archived."
              />
              <DashKpi
                icon={CheckCircle2}
                label="Active Units"
                value={n(rows.counts.listed ?? 0)}
                explain="Live and listed: guests can book them."
              />
              <DashKpi
                icon={PauseCircle}
                label="Inactive Units"
                value={n((rows.counts.inactive ?? 0) + (rows.counts.setting_up ?? 0))}
                explain="Paused, or still being set up by the host."
              />
              <DashKpi
                icon={CalendarCheck}
                label="Occupied Units"
                value={n(rows.counts.occupied ?? 0)}
                explain="A guest is checked in right now."
              />
              <DashKpi
                icon={LineChart}
                label="Occupancy Rate"
                value={pct(asMaybe(k.occupancy_pct))}
                explain="Booked nights in the period over live units × days."
              />
              <DashKpi
                icon={Coins}
                label="Avg. Daily Rate (ADR)"
                value={asMaybe(k.adr_kes) == null ? '—' : kesFull(asNumber(k.adr_kes))}
                explain="Booking value over booked nights in the period."
              />
            </DashKpiGrid>

            <WithPanel
              panel={
                unit ? (
                  <SidePanel
                    title={`Unit ${unit.label}`}
                    closeHref={href({ selected: null, page: String(page) })}
                    badge={<Chip status={unit.bucket} />}
                  >
                    {photoUrl(unit.photo) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoUrl(unit.photo)!}
                        alt=""
                        className="mb-3 h-40 w-full rounded-xl object-cover"
                      />
                    )}
                    <p className="text-muted mb-3 text-[0.875rem] font-semibold">
                      {[unit.property_name, unit.area].filter(Boolean).join(', ') || 'No building'}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <h3 className="text-[0.9375rem] font-extrabold">Unit Information</h3>
                        <Fact icon={Layers} label="Unit ID">
                          {unit.unit_no ?? unit.label}
                        </Fact>
                        <Fact icon={Building2} label="Building">
                          {unit.property_name ?? '—'}
                        </Fact>
                        <Fact icon={BedDouble} label="Bedrooms">
                          {unit.bedrooms ?? '—'}
                        </Fact>
                        <Fact icon={Users} label="Max Guests">
                          {unit.max_guests ?? '—'}
                        </Fact>
                        <Fact icon={Layers} label="Floor">
                          {unit.floor ?? '—'}
                        </Fact>
                        <Fact icon={Ruler} label="Size">
                          {unit.size_sqm ? `${unit.size_sqm} m²` : '—'}
                        </Fact>
                        <Fact icon={CalendarCheck} label="Listed On">
                          {shortDate(unit.created_at)}
                        </Fact>
                      </div>
                      <div>
                        <h3 className="text-[0.9375rem] font-extrabold">Occupancy</h3>
                        <ShareDonut
                          stacked
                          centre={pct(unit.occupancy_pct, 0)}
                          data={[
                            {
                              key: 'occupied',
                              label: `Occupied (${unit.nights} nights)`,
                              value: unit.nights,
                              color: '#F5A623',
                            },
                            {
                              key: 'blocked',
                              label: `Blocked (${unit.blocked_nights} nights)`,
                              value: unit.blocked_nights,
                              color: '#C9C4B8',
                            },
                          ]}
                        />
                        <Fact label="Nightly Rate">{kesFull(unit.nightly_rate_kes)}</Fact>
                        <Fact label="Revenue (period)">{kesCompact(unit.revenue_kes)}</Fact>
                      </div>
                    </div>
                    <h3 className="mt-3 text-[0.9375rem] font-extrabold">Amenities</h3>
                    <p className="text-muted mb-3 text-[0.875rem] font-semibold">
                      {(unit.unit_amenities ?? []).length > 0
                        ? unit.unit_amenities!.join(' · ')
                        : 'None listed.'}
                    </p>
                    {unit.current_stay && (
                      <p className="mb-3 text-[0.875rem] font-semibold">
                        Occupied {shortDate(unit.current_stay.check_in)} –{' '}
                        {shortDate(unit.current_stay.check_out)}{' '}
                        <a
                          className="font-bold underline"
                          href={staysHref('/stays/reservations', period, city, {
                            selected: unit.current_stay.stay_id,
                          })}
                        >
                          Open the stay
                        </a>
                      </p>
                    )}
                    <UnitControls unitId={unit.unit_id} rate={unit.nightly_rate_kes} />
                    <Footnote>
                      Hosts edit photos, amenities and house rules in their workspace; the property
                      itself is reviewed on{' '}
                      {unit.property_id ? (
                        <a className="underline" href={`/hotels/properties/${unit.property_id}`}>
                          its property page
                        </a>
                      ) : (
                        'its property page'
                      )}
                      .
                    </Footnote>
                  </SidePanel>
                ) : (
                  <PanelHint>Choose a unit to see it, block dates or change its rate.</PanelHint>
                )
              }
            >
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Unit state"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    count: rows.counts[t.key] ?? 0,
                    href: staysHref('/stays/units', period, city, {
                      tab: t.key === 'all' ? null : t.key,
                      q: q || null,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search units"
                    placeholder="Search unit by name, number, building or host…"
                  />
                  <DashClear params={['q', 'tab', 'selected']} />
                </FilterRow>
                <DataTable
                  caption="Accommodation units"
                  isEmpty={rows.rows.length === 0}
                  empty="No units match."
                  head={[
                    'Unit',
                    'Building / Property',
                    'Host',
                    'Bedrooms',
                    'Capacity',
                    'Rate / Night',
                    'Status',
                    'Occupancy',
                  ]}
                >
                  {rows.rows.map((r) => (
                    <tr
                      key={r.unit_id}
                      className={r.unit_id === selected ? 'bg-[#FFFBF0]' : undefined}
                    >
                      <td>
                        <PlaceCell
                          title={r.label}
                          sub={
                            r.bedrooms != null
                              ? r.bedrooms === 0
                                ? 'Studio'
                                : `${r.bedrooms} Bedroom${r.bedrooms === 1 ? '' : 's'}`
                              : undefined
                          }
                          photo={photoUrl(r.photo)}
                          href={href({ selected: r.unit_id, page: String(page) })}
                        />
                      </td>
                      <td>
                        <span className="block font-semibold">{r.property_name ?? '—'}</span>
                        <span className="text-muted block text-[0.8125rem]">{r.area ?? ''}</span>
                      </td>
                      <td>{r.host_name ?? '—'}</td>
                      <td className="text-center tabular-nums">{r.bedrooms ?? '—'}</td>
                      <td className="text-center tabular-nums">{r.max_guests ?? '—'}</td>
                      <td className="whitespace-nowrap font-bold tabular-nums">
                        {kesFull(r.nightly_rate_kes)}
                      </td>
                      <td>
                        <Chip status={r.bucket} />
                      </td>
                      <td className="whitespace-nowrap">
                        {r.current_stay
                          ? `${shortDate(r.current_stay.check_in).slice(0, 6)} – ${shortDate(r.current_stay.check_out).slice(0, 6)}`
                          : pct(r.occupancy_pct, 0)}
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={rows.total}
                  noun="units"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
              </DashCard>
            </WithPanel>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
