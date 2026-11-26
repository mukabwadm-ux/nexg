import {
  AirVent,
  BedDouble,
  Building2,
  Car,
  CalendarCheck,
  CheckCircle2,
  Coins,
  Dumbbell,
  Home,
  Layers,
  LineChart,
  PauseCircle,
  Ruler,
  Tv,
  Users,
  UtensilsCrossed,
  Waves,
  Wifi,
  type LucideIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

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
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import { UnitControls } from '@/components/stays/client';
import { PanelTabs } from '@/components/stays/extras';
import { UnitRatesFacts } from '@/components/stays/rates';
import {
  Chip,
  DataTable,
  ErrorNote,
  Fact,
  FilterRow,
  Footnote,
  GoldLink,
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
  FILTER_WINDOW,
  filterOf,
  kesCompact,
  kesFull,
  n,
  oneOf,
  optionsFrom,
  PAGE_SIZE,
  pageOf,
  pageSlice,
  paged,
  pct,
  shortDate,
  staysHref,
  uuidOrNull,
  type StayRow,
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

const PANEL_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'availability', label: 'Availability' },
  { key: 'rates', label: 'Rates & Pricing' },
  { key: 'bookings', label: 'Bookings' },
  { key: 'history', label: 'History' },
];

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

/** An amenity's icon in the designs' amenity row. */
function amenityIcon(a: string): LucideIcon {
  if (/wi-?fi|internet/i.test(a)) return Wifi;
  if (/kitchen|cook/i.test(a)) return UtensilsCrossed;
  if (/tv|netflix/i.test(a)) return Tv;
  if (/a\/?c|air/i.test(a)) return AirVent;
  if (/park/i.test(a)) return Car;
  if (/pool|swim/i.test(a)) return Waves;
  if (/gym|fitness/i.test(a)) return Dumbbell;
  return Home;
}

const bedroomsText = (b: number | null) =>
  b == null ? '—' : b === 0 ? 'Studio' : `${b} Bedroom${b === 1 ? '' : 's'}`;

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
    building?: string;
    bedrooms?: string;
    page?: string;
    selected?: string;
    ptab?: string;
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
  const building = filterOf(searchParams?.building);
  const bedrooms = filterOf(searchParams?.bedrooms);
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);
  const ptab = oneOf(
    PANEL_TABS.map((t) => t.key),
    searchParams?.ptab,
    'overview',
  );

  const list = await ctx.read('rpc_console_stays_units', {
    p_from: period.from,
    p_to: period.to,
    p_city: city,
    p_tab: tab,
    p_q: q || null,
    p_property: null,
    p_page: 1,
    p_size: FILTER_WINDOW,
  });
  const all = paged<UnitRow>(list.data);
  const k = asObject(asObject(list.data).kpis);
  const filtered = all.rows.filter(
    (r) =>
      (!building || r.property_name === building) &&
      (!bedrooms || String(r.bedrooms ?? '') === bedrooms),
  );
  const rows = pageSlice(filtered, page, PAGE_SIZE);
  /* The selected unit: from this list, or read on its own when filtered out. */
  let unit = all.rows.find((r) => r.unit_id === selected) ?? null;
  if (selected && !unit) {
    const one = await ctx.read('rpc_console_stays_units', {
      p_from: period.from,
      p_to: period.to,
      p_city: null,
      p_tab: 'all',
      p_q: null,
      p_property: null,
      p_page: 1,
      p_size: FILTER_WINDOW,
    });
    unit = paged<UnitRow>(one.data).rows.find((r) => r.unit_id === selected) ?? null;
  }
  const bookings =
    unit && ptab === 'bookings'
      ? paged<StayRow>(
          (
            await ctx.read('rpc_console_stays_list', {
              p_from: period.from,
              p_to: period.to,
              p_city: null,
              p_view: 'reservations',
              p_tab: 'all',
              p_q: unit.label,
              p_page: 1,
              p_size: 50,
            })
          ).data,
        ).rows.filter((s) => s.unit_id === unit!.unit_id)
      : [];
  const keep = { tab: tab === 'all' ? null : tab, q: q || null, building, bedrooms };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/units', period, city, { ...keep, ...params });
  const web = (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://nexgapp.com').replace(/\/$/, '');

  let panelBody: React.ReactNode = null;
  if (unit) {
    if (ptab === 'availability') {
      panelBody = (
        <>
          <Fact label="Booked nights (period)">{n(unit.nights)}</Fact>
          <Fact label="Blocked nights (period)">{n(unit.blocked_nights)}</Fact>
          <Fact label="Occupancy (period)">{pct(unit.occupancy_pct)}</Fact>
          <Link
            className="mt-2 inline-block font-bold underline"
            href={staysHref('/stays/availability', period, city, {
              selected: unit.unit_id,
              tab: 'calendar',
            })}
          >
            Open the unit calendar
          </Link>
        </>
      );
    } else if (ptab === 'rates') {
      panelBody = <UnitRatesFacts ctx={ctx} unitId={unit.unit_id} label={unit.label} />;
    } else if (ptab === 'bookings') {
      panelBody =
        bookings.length === 0 ? (
          <p className="text-muted text-[0.875rem] font-semibold">No bookings in this period.</p>
        ) : (
          <ul>
            {bookings.map((b) => (
              <li
                key={b.stay_id}
                className="border-border flex justify-between gap-2 border-b py-1.5 text-[0.875rem] last:border-b-0"
              >
                <a
                  className="font-semibold hover:underline"
                  href={staysHref('/stays/reservations', period, city, { selected: b.stay_id })}
                >
                  {b.ref} · {b.guest_name}
                </a>
                <span className="text-muted whitespace-nowrap">
                  {shortDate(b.check_in).slice(0, 6)} – {shortDate(b.check_out).slice(0, 6)}
                </span>
              </li>
            ))}
          </ul>
        );
    } else if (ptab === 'history') {
      panelBody = (
        <p className="text-muted text-[0.875rem] font-semibold">
          Listed {shortDate(unit.created_at)}. Rate changes, blocks and reviews are in the{' '}
          <Link className="underline" href="/audit">
            audit log
          </Link>
          .
        </p>
      );
    } else {
      panelBody = (
        <div className="grid gap-4 2xl:grid-cols-2">
          <div>
            <h3 className="text-[0.9375rem] font-extrabold">Unit Information</h3>
            <Fact icon={Layers} label="Unit ID">
              {unit.unit_no ?? unit.label}
            </Fact>
            <Fact icon={Building2} label="Building">
              {unit.property_name ?? '—'}
            </Fact>
            <Fact icon={BedDouble} label="Bedrooms">
              {bedroomsText(unit.bedrooms)}
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
            <h3 className="text-[0.9375rem] font-extrabold">Occupancy (period)</h3>
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
            <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
              Weekend, seasonal and long-stay prices are on the Rates &amp; Pricing tab.
            </p>
          </div>
        </div>
      );
    }
  }

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
          <GoldLink href={`${web}/hosts`} icon={Home} external>
            Add Unit
          </GoldLink>
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
                value={n(all.counts.all ?? 0)}
                explain="Units not archived."
              />
              <DashKpi
                icon={CheckCircle2}
                label="Active Units"
                value={n(all.counts.listed ?? 0)}
                explain="Live and listed: guests can book them."
              />
              <DashKpi
                icon={PauseCircle}
                label="Inactive Units"
                value={n((all.counts.inactive ?? 0) + (all.counts.setting_up ?? 0))}
                explain="Paused, or still being set up by the host."
              />
              <DashKpi
                icon={CalendarCheck}
                label="Occupied Units"
                value={n(all.counts.occupied ?? 0)}
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
                    <p className="text-muted mb-3 flex items-center justify-between gap-2 text-[0.875rem] font-semibold">
                      <span>
                        {[unit.property_name, unit.area].filter(Boolean).join(', ') ||
                          'No building'}
                      </span>
                      {unit.property_id && (
                        <Link
                          href={`/hotels/properties/${unit.property_id}`}
                          className="rounded-lg border border-[#F5D27A] bg-[#FFFBF0] px-3 py-1.5 text-[0.8125rem] font-bold text-[#8A5C00]"
                        >
                          Edit Unit
                        </Link>
                      )}
                    </p>
                    <PanelTabs
                      tabs={PANEL_TABS}
                      active={ptab}
                      href={(key) =>
                        href({
                          selected: unit!.unit_id,
                          page: String(page),
                          ptab: key === 'overview' ? null : key,
                        })
                      }
                    />
                    {panelBody}
                    <h3 className="mt-4 text-[0.9375rem] font-extrabold">Amenities</h3>
                    {(unit.unit_amenities ?? []).length > 0 ? (
                      <ul className="my-2 flex flex-wrap gap-3">
                        {unit.unit_amenities!.map((a) => {
                          const I = amenityIcon(a);
                          return (
                            <li
                              key={a}
                              className="flex w-14 flex-col items-center gap-1 text-center text-[0.75rem] font-semibold"
                            >
                              <I aria-hidden="true" className="h-5 w-5 text-[#E5A800]" />
                              {a}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="text-muted mb-3 text-[0.875rem] font-semibold">None listed.</p>
                    )}
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
                      Hosts edit photos, amenities and house rules in their workspace; Edit Unit
                      opens the property review page.
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
                    count: all.counts[t.key] ?? 0,
                    href: staysHref('/stays/units', period, city, {
                      ...keep,
                      tab: t.key === 'all' ? null : t.key,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search units"
                    placeholder="Search unit by name, number, building or host…"
                  />
                  <DashSelect
                    label="Building"
                    param="building"
                    value={building ?? 'all'}
                    options={optionsFrom(all.rows, (r) => r.property_name)}
                  />
                  <DashSelect
                    label="Bedrooms"
                    param="bedrooms"
                    value={bedrooms ?? 'all'}
                    options={[
                      ...new Set(
                        all.rows.map((r) => r.bedrooms).filter((b): b is number => b != null),
                      ),
                    ]
                      .sort((a, b) => a - b)
                      .map((b) => ({ value: String(b), label: bedroomsText(b) }))}
                  />
                  <DashClear params={['q', 'tab', 'building', 'bedrooms', 'selected']} />
                </FilterRow>
                <DataTable
                  caption="Accommodation units"
                  isEmpty={rows.length === 0}
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
                  {rows.map((r) => (
                    <tr
                      key={r.unit_id}
                      className={r.unit_id === selected ? 'bg-[#FFFBF0]' : undefined}
                    >
                      <td>
                        <PlaceCell
                          title={r.label}
                          sub={bedroomsText(r.bedrooms)}
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
                      <td className="whitespace-nowrap text-center tabular-nums">
                        <Users aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />
                        {r.max_guests ?? '—'}
                      </td>
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
                  total={filtered.length}
                  noun="units"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
                <Footnote>
                  Revenue this period across these units: {kesCompact(asNumber(k.revenue_kes))}.
                </Footnote>
              </DashCard>
            </WithPanel>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
