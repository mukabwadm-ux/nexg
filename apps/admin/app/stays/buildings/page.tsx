import { maps as mapsCapability } from '@nexg/ui/capabilities';
import {
  BedDouble,
  Building2,
  CalendarCheck,
  CheckCircle2,
  Home,
  Layers,
  LineChart,
  MapPin,
  UserCog,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleShell } from '@/components/console-shell';
import { OpsMap, type MapPoint } from '@/components/operations/ops-map';
import { DashCanvas, DashCard, DashKpi, DashKpiGrid, GoldTabs } from '@/components/portal/dash';
import { DashClear, DashSearch } from '@/components/portal/dash-filters';
import { ManagerSelect } from '@/components/stays/client';
import { PanelTabs } from '@/components/stays/extras';
import {
  Chip,
  Empty,
  ErrorNote,
  Fact,
  FilterRow,
  Footnote,
  GoldLink,
  photoUrl,
  ShareBars,
  SidePanel,
  StaysHeader,
  WaitingForDatabase,
} from '@/components/stays/module';
import {
  asMaybe,
  asNumber,
  asObject,
  kesCompact,
  n,
  oneOf,
  pct,
  shareOf,
  shortDate,
  staysHref,
  uuidOrNull,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Buildings & Properties' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Buildings' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'inactive', label: 'Inactive' },
] as const;

interface PropertyRow {
  property_id: string;
  name: string;
  kind: string;
  area: string | null;
  review_status: string;
  listed: boolean;
  photo: unknown;
  created_at: string;
  listed_at: string | null;
  amenities: string[] | null;
  floors: number | null;
  lat: number | null;
  lng: number | null;
  host_id: string;
  host_name: string | null;
  host_status: string;
  manager_id: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  units: number;
  listed_units: number;
  live_units: number;
  nights: number;
  value_kes: number;
  bucket: string;
  occupancy_pct: number | null;
}

/**
 * Stays → Buildings & Properties: the properties hosts added, where they
 * are, how many units each has on NexG and how full they were. Approving a
 * property stays on its own review page.
 */
interface BuildingUnit {
  unit_id: string;
  label: string;
  bedrooms: number | null;
  nightly_rate_kes: number | null;
  bucket: string;
}

/** The Units tab of a building's panel: each unit, its rate and state. */
function BuildingUnits({
  units,
  hrefFor,
}: {
  units: BuildingUnit[];
  hrefFor: (id: string) => string;
}) {
  if (units.length === 0) return <Empty>No units in this building yet.</Empty>;
  return (
    <ul>
      {units.map((u) => (
        <li
          key={u.unit_id}
          className="border-border flex items-center justify-between gap-2 border-b py-1.5 text-[0.875rem] last:border-b-0"
        >
          <Link className="font-semibold hover:underline" href={hrefFor(u.unit_id)}>
            {u.label}
          </Link>
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{u.nightly_rate_kes ? n(u.nightly_rate_kes) : '—'}</span>
            <Chip status={u.bucket} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    q?: string;
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
  const selected = uuidOrNull(searchParams?.selected);

  const [list, partners] = await Promise.all([
    ctx.read('rpc_console_stays_properties', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
      p_tab: tab,
      p_q: q || null,
    }),
    ctx.read('rpc_console_stays_partners', { p_tab: 'all', p_q: null }),
  ]);
  const o = asObject(list.data);
  const k = asObject(o.kpis);
  const counts = asObject(o.counts);
  const rows = (Array.isArray(o.rows) ? o.rows : []) as PropertyRow[];
  const areas = (Array.isArray(o.areas) ? o.areas : []) as { area: string; n: number }[];
  const managers = (
    (Array.isArray(asObject(partners.data).rows) ? asObject(partners.data).rows : []) as {
      id: string;
      name: string;
    }[]
  ).map((m) => ({ id: m.id, name: m.name }));
  const current = rows.find((r) => r.property_id === selected) ?? rows[0] ?? null;
  const ptab = oneOf(
    ['overview', 'units', 'hosts', 'reservations', 'revenue', 'documents'] as const,
    searchParams?.ptab,
    'overview',
  );
  const buildingUnits =
    current && ptab === 'units'
      ? ((asObject(
          (
            await ctx.read('rpc_console_stays_units', {
              p_from: period.from,
              p_to: period.to,
              p_city: null,
              p_tab: 'all',
              p_q: null,
              p_property: current.property_id,
              p_page: 1,
              p_size: 200,
            })
          ).data,
        ).rows as BuildingUnit[] | undefined) ?? [])
      : [];
  const totalAreas = areas.reduce((s, a) => s + asNumber(a.n), 0);
  const pins: MapPoint[] = rows
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({
      kind: 'stay' as const,
      lat: r.lat!,
      lng: r.lng!,
      label: `${r.name} · ${r.units} units`,
    }));
  const keep = { tab: tab === 'all' ? null : tab, q: q || null };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/buildings', period, city, { ...keep, ...params });
  const cityName = ctx.cities.find((c) => c.id === city)?.name ?? 'Nairobi';

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Buildings & Properties"
        subtitle="The buildings and homes hosts list on NexG, where they are and how they perform."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={staysHref('/stays/export', period, city, { report: 'units' })}
        action={
          <GoldLink
            href={`${(process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://nexgapp.com').replace(/\/$/, '')}/hosts`}
            icon={Building2}
            external
          >
            Add Building
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
                icon={Building2}
                label="Total Buildings"
                value={n(asNumber(k.buildings))}
                explain="Apartment blocks, and properties with more than one unit."
              />
              <DashKpi
                icon={Home}
                label="Total Properties"
                value={n(asNumber(k.properties))}
                explain="Every property, not archived."
              />
              <DashKpi
                icon={BedDouble}
                label="Total Units"
                value={n(asNumber(k.units))}
                explain="Units in those properties."
              />
              <DashKpi
                icon={CheckCircle2}
                label="Onboarded Units"
                value={n(asNumber(k.onboarded_units))}
                explain="Units that are live (the host finished setting them up and is verified)."
              />
              <DashKpi
                icon={Layers}
                label="Listed Units"
                value={n(asNumber(k.listed_units))}
                explain="Live units the host listed for guests."
              />
              <DashKpi
                icon={LineChart}
                label="Occupancy Rate"
                value={pct(asMaybe(k.occupancy_pct))}
                explain="Booked nights in the period over live units × days."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,19rem)_minmax(0,1fr)_minmax(0,24rem)]">
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Building state"
                  active={tab}
                  className="mb-3"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    count: asNumber(counts[t.key]),
                    href: staysHref('/stays/buildings', period, city, {
                      tab: t.key === 'all' ? null : t.key,
                      q: q || null,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search buildings"
                    placeholder="Search building by name, location or manager…"
                  />
                  <DashClear params={['q', 'tab', 'selected']} />
                </FilterRow>
                {rows.length === 0 ? (
                  <Empty>No buildings match.</Empty>
                ) : (
                  <ul className="max-h-[38rem] space-y-2 overflow-y-auto pr-1">
                    {rows.map((r) => (
                      <li key={r.property_id}>
                        <Link
                          href={href({ selected: r.property_id })}
                          scroll={false}
                          className={
                            'flex gap-3 rounded-xl border p-2.5 transition-colors ' +
                            (current?.property_id === r.property_id
                              ? 'border-[#F5B400] bg-[#FFFBF0]'
                              : 'border-border hover:bg-bg')
                          }
                        >
                          {photoUrl(r.photo) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photoUrl(r.photo)!}
                              alt=""
                              className="h-16 w-16 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-[#FFF4D6]"
                            >
                              <Building2 className="h-6 w-6 text-[#B57A00]" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="flex items-start justify-between gap-2">
                              <span className="truncate font-bold">{r.name}</span>
                              <Chip status={r.bucket} />
                            </span>
                            <span className="text-muted block truncate text-[0.8125rem] font-semibold">
                              {r.area ?? 'No area'}
                            </span>
                            <span className="mt-1 flex gap-3 text-[0.8125rem] font-semibold">
                              <span>{n(r.units)} Units</span>
                              <span>{n(r.listed_units)} Listed</span>
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </DashCard>

              <div className="grid min-w-0 content-start gap-4">
                <DashCard>
                  <OpsMap maps={mapsCapability()} centre={null} city={cityName} points={pins} />
                  {pins.length < rows.length && (
                    <Footnote>
                      {n(rows.length - pins.length)} of these have no pin yet; hosts set it when
                      they confirm the address.
                    </Footnote>
                  )}
                </DashCard>
                <DashCard title="Buildings by Area">
                  <ShareBars
                    empty="No buildings yet."
                    rows={areas.slice(0, 6).map((a) => ({
                      label: a.area,
                      value: asNumber(a.n),
                      text: `${n(asNumber(a.n))} (${pct(shareOf(asNumber(a.n), totalAreas), 0)})`,
                    }))}
                  />
                </DashCard>
              </div>

              {current ? (
                <SidePanel
                  title={current.name}
                  closeHref={href({ selected: null })}
                  badge={<Chip status={current.bucket} />}
                >
                  {photoUrl(current.photo) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl(current.photo)!}
                      alt=""
                      className="mb-3 h-40 w-full rounded-xl object-cover"
                    />
                  )}
                  <p className="text-muted mb-2 flex items-center justify-between gap-1.5 text-[0.875rem] font-semibold">
                    <span className="flex items-center gap-1.5">
                      <MapPin aria-hidden="true" className="h-4 w-4" /> {current.area ?? 'No area'}
                    </span>
                    <Link
                      href={`/hotels/properties/${current.property_id}`}
                      className="rounded-lg border border-[#F5D27A] bg-[#FFFBF0] px-3 py-1.5 text-[0.8125rem] font-bold text-[#8A5C00]"
                    >
                      Edit Building
                    </Link>
                  </p>
                  <PanelTabs
                    tabs={[
                      { key: 'overview', label: 'Overview' },
                      { key: 'units', label: `Units (${n(current.units)})` },
                      { key: 'hosts', label: 'Hosts' },
                      { key: 'reservations', label: 'Reservations' },
                      { key: 'revenue', label: 'Revenue' },
                      { key: 'documents', label: 'Documents' },
                    ]}
                    active={ptab}
                    href={(key) =>
                      href({ selected: current.property_id, ptab: key === 'overview' ? null : key })
                    }
                  />
                  {ptab === 'units' ? (
                    <BuildingUnits
                      units={buildingUnits}
                      hrefFor={(id) => staysHref('/stays/units', period, city, { selected: id })}
                    />
                  ) : ptab === 'hosts' ? (
                    <>
                      <Fact icon={UserCog} label="Host">
                        <Link
                          className="underline"
                          href={staysHref('/stays/hosts', period, city, {
                            q: current.host_name ?? '',
                          })}
                        >
                          {current.host_name ?? '—'}
                        </Link>
                      </Fact>
                      <Fact label="Host status">
                        <Chip status={current.host_status} />
                      </Fact>
                      <Fact icon={UserCog} label="Property Manager">
                        {current.manager_name ?? 'None'}
                      </Fact>
                    </>
                  ) : ptab === 'reservations' ? (
                    <Link
                      className="font-bold underline"
                      href={staysHref('/stays/reservations', period, city, {
                        building: current.name,
                      })}
                    >
                      Open this building&rsquo;s reservations
                    </Link>
                  ) : ptab === 'revenue' ? (
                    <>
                      <Fact label="Booking Value (period)">{kesCompact(current.value_kes)}</Fact>
                      <Fact label="Booked nights (period)">{n(current.nights)}</Fact>
                      <Fact label="Occupancy Rate">{pct(current.occupancy_pct)}</Fact>
                      <Fact label="Avg. per night">
                        {current.nights > 0 ? kesCompact(current.value_kes / current.nights) : '—'}
                      </Fact>
                    </>
                  ) : ptab === 'documents' ? (
                    <p className="text-muted text-[0.875rem] font-semibold">
                      The host&rsquo;s ID and proof of authority are on{' '}
                      <Link className="underline" href={`/hotels/hosts/${current.host_id}/verify`}>
                        their verification page
                      </Link>
                      ; the property&rsquo;s review is on{' '}
                      <Link
                        className="underline"
                        href={`/hotels/properties/${current.property_id}`}
                      >
                        its page
                      </Link>
                      .
                    </p>
                  ) : (
                    <>
                      <h3 className="text-[0.9375rem] font-extrabold">Building Information</h3>
                      <Fact icon={Building2} label="Property Type">
                        {current.kind.replace(/_/g, ' ')}
                      </Fact>
                      <Fact icon={BedDouble} label="Total Units">
                        {n(current.units)}
                      </Fact>
                      <Fact icon={Layers} label="NexG Listed Units">
                        {n(current.listed_units)}
                      </Fact>
                      <Fact icon={UserCog} label="Host">
                        {current.host_name ?? '—'}
                      </Fact>
                      <Fact icon={UserCog} label="Property Manager">
                        {current.manager_name ?? 'None'}
                      </Fact>
                      <Fact icon={CalendarCheck} label="Onboarded">
                        {shortDate(current.listed_at ?? current.created_at)}
                      </Fact>
                      <h3 className="mt-3 text-[0.9375rem] font-extrabold">Performance (period)</h3>
                      <Fact label="Occupancy Rate">{pct(current.occupancy_pct)}</Fact>
                      <Fact label="Booking Value">{kesCompact(current.value_kes)}</Fact>
                      <h3 className="mt-3 text-[0.9375rem] font-extrabold">
                        Amenities & Facilities
                      </h3>
                      <p className="text-muted mb-3 text-[0.875rem] font-semibold">
                        {(current.amenities ?? []).length > 0
                          ? current.amenities!.join(' · ')
                          : 'None listed.'}
                      </p>
                      {managers.length > 0 ? (
                        <ManagerSelect
                          propertyId={current.property_id}
                          managerId={current.manager_id}
                          managers={managers}
                        />
                      ) : (
                        <p className="text-muted text-[0.8125rem] font-semibold">
                          Add a property manager on Property Managers & Partners to link this
                          building.
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-3 text-[0.875rem] font-bold">
                        <Link
                          className="underline"
                          href={`/hotels/properties/${current.property_id}`}
                        >
                          Review & edit building
                        </Link>
                        <Link
                          className="underline"
                          href={staysHref('/stays/units', period, city, { q: current.name })}
                        >
                          Units ({n(current.units)})
                        </Link>
                      </div>
                    </>
                  )}
                </SidePanel>
              ) : (
                <DashCard>
                  <Empty>No building to show.</Empty>
                </DashCard>
              )}
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
