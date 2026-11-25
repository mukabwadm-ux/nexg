import { maps as mapsCapability } from '@nexg/ui/capabilities';
import { AlertTriangle, Bike, CheckCircle2, Clock, Coins, Package, Users, Zap } from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut, TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { OpsMap, type MapPoint } from '@/components/operations/ops-map';
import {
  CardLink,
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  Pagination,
} from '@/components/portal/dash';
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import {
  AddRiderButton,
  BucketChip,
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  PanelLine,
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
  kesCompact,
  minutes,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  paged,
  pct,
  ppDelta,
  riderRef,
  screenHref,
  shareOf,
  VEHICLE_LABEL,
  type RiderFact,
} from '@/lib/riders-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Riders' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Riders' },
  { key: 'online', label: 'Active' },
  { key: 'on_trip', label: 'On Trip' },
  { key: 'offline', label: 'Offline' },
  { key: 'suspended', label: 'Suspended' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const VEHICLES = Object.entries(VEHICLE_LABEL).map(([value, label]) => ({ value, label }));

/**
 * Riders → Overview: who is riding, what they delivered in the period,
 * where they are now and who did best. Every figure is counted from the
 * riders, orders and payouts (rpc_console_riders_overview and
 * rpc_console_riders_list); the map shows only riders who sent a fix.
 */
export default async function RidersOverviewPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    tab?: string;
    q?: string;
    zone?: string;
    vehicle?: string;
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
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const zone = searchParams?.zone && searchParams.zone !== 'all' ? searchParams.zone : null;
  const vehicle =
    searchParams?.vehicle && searchParams.vehicle !== 'all' ? searchParams.vehicle : null;
  const page = pageOf(searchParams?.page);

  const { data: city } = await supabase
    .from('city')
    .select('id, name')
    .eq('slug', 'nairobi')
    .maybeSingle();

  const [overviewQ, listQ, liveQ] = await Promise.all([
    supabase.rpc('rpc_console_riders_overview', { p_from: period.from, p_to: period.to }),
    supabase.rpc('rpc_console_riders_list', {
      p_from: period.from,
      p_to: period.to,
      p_tab: tab,
      p_q: q || undefined,
      p_zone: zone ?? undefined,
      p_vehicle: vehicle ?? undefined,
      p_page: page,
      p_size: PAGE_SIZE,
    }),
    city ? supabase.rpc('rpc_riders_live', { p_city_id: city.id }) : Promise.resolve({ data: [] }),
  ]);

  const waiting = isMissingFunction(overviewQ.error) || isMissingFunction(listQ.error);
  const failed = !waiting && (overviewQ.error ?? listQ.error);

  const o = asObject(overviewQ.data);
  const k = asObject(o.kpis);
  const status = asObject(o.status);
  const today = asObject(o.today);
  const daily = (Array.isArray(o.daily) ? o.daily : []) as { day: string; trips: number }[];
  const top = (Array.isArray(o.top) ? o.top : []) as RiderFact[];
  const list = paged<RiderFact>(listQ.data);

  const online = asNumber(status.online);
  const onTrip = asNumber(status.on_trip);
  const offline = asNumber(status.offline);
  const suspended = asNumber(status.suspended);
  const ridersTotal = online + onTrip + offline + suspended;

  const pins: MapPoint[] = (
    (liveQ.data as
      | { name: string | null; lat: number | null; lng: number | null; presence: string }[]
      | null) ?? []
  )
    .filter((r) => r.lat != null && r.lng != null && r.presence !== 'offline')
    .map((r) => ({
      kind: 'delivery' as const,
      lat: r.lat!,
      lng: r.lng!,
      label: `${r.name ?? 'Rider'} · ${r.presence === 'on_trip' ? 'on a trip' : 'online'}`,
    }));

  const keep = { q: q || null, zone, vehicle };
  const href = (params: Record<string, string | null | undefined>) =>
    screenHref('/riders', period, { tab: tab === 'all' ? null : tab, ...keep, ...params });

  return (
    <ConsoleShell staff={staff}>
      <ScreenHeader
        title="Riders"
        subtitle="Manage rider onboarding, availability, orders, earnings and performance."
        period={period}
        exportHref={screenHref('/riders/export', period, { view: 'riders', tab, ...keep })}
        action={<AddRiderButton />}
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
                icon={Bike}
                label="Active Riders"
                value={n(asNumber(k.active))}
                delta={delta(asNumber(k.active), asNumber(k.active_prev))}
                explain="Riders whose account is active, online or not. The change is against riders already active when the period began."
              />
              <DashKpi
                icon={Users}
                label="Total Riders"
                value={n(asNumber(k.total))}
                delta={delta(asNumber(k.total), asNumber(k.total_prev))}
                explain="Active and suspended riders. Applicants still onboarding are on Onboarding & KYC."
              />
              <DashKpi
                icon={Package}
                label="Completed Orders"
                value={n(asNumber(k.completed))}
                delta={delta(asNumber(k.completed), asNumber(k.completed_prev))}
                explain="Orders a NexG rider delivered in the period, against the period of the same length before."
              />
              <DashKpi
                icon={Clock}
                label="On-time Delivery"
                value={pct(asMaybe(k.on_time_pct))}
                deltaText={ppDelta(asMaybe(k.on_time_pct), asMaybe(k.on_time_pct_prev))}
                explain="Delivered at or before the promised time, of deliveries that had a promised time."
              />
              <DashKpi
                icon={Zap}
                label="Avg. Delivery Time"
                value={minutes(asMaybe(k.delivery_min))}
                delta={delta(asMaybe(k.delivery_min), asMaybe(k.delivery_min_prev))}
                upIsBad
                explain="Picked up to delivered, averaged over the period's deliveries."
              />
              <DashKpi
                icon={Coins}
                label="Total Payouts"
                value={kesCompact(asNumber(k.payouts_cents) / 100)}
                delta={delta(asNumber(k.payouts_cents), asNumber(k.payouts_cents_prev))}
                explain="Rider payouts paid in the period (test payouts left out)."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
              <DashCard title="Rider Status">
                <ShareDonut
                  centre={n(ridersTotal)}
                  caption="Riders"
                  data={[
                    {
                      key: 'online',
                      label: `Active (${n(online)})`,
                      value: online,
                      color: '#1E9E45',
                    },
                    {
                      key: 'on_trip',
                      label: `On Trip (${n(onTrip)})`,
                      value: onTrip,
                      color: '#F5B400',
                    },
                    {
                      key: 'offline',
                      label: `Offline (${n(offline)})`,
                      value: offline,
                      color: '#2F80ED',
                    },
                    {
                      key: 'suspended',
                      label: `Suspended (${n(suspended)})`,
                      value: suspended,
                      color: '#C9C4B8',
                    },
                  ]}
                />
                <Footnote>Right now: Active means online and free for offers.</Footnote>
              </DashCard>

              <DashCard
                title="Live Rider Map"
                aside={<CardLink href="/riders/availability">Availability</CardLink>}
              >
                <OpsMap
                  maps={mapsCapability()}
                  centre={null}
                  city={city?.name ?? 'Nairobi'}
                  points={pins}
                />
              </DashCard>

              <DashCard title="Today's Operations">
                <ul>
                  <PanelLine
                    icon={Package}
                    label="Orders in Progress"
                    value={n(asNumber(today.in_progress))}
                    href="/riders/deliveries?tab=in_transit"
                  />
                  <PanelLine
                    icon={CheckCircle2}
                    label="Completed Orders"
                    value={n(asNumber(today.completed))}
                    href="/riders/deliveries?tab=delivered"
                  />
                  <PanelLine
                    icon={AlertTriangle}
                    label="Incidents / Disputes"
                    value={n(asNumber(today.open_cases))}
                    href="/riders/incidents?tab=open"
                  />
                </ul>
                <Footnote>
                  Orders a rider is carrying or has been given, and cases still open.
                </Footnote>
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Rider status"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    icon: t.key === 'all' ? Bike : undefined,
                    count: list.counts[t.key] ?? 0,
                    href: screenHref('/riders', period, {
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
                  <DashSelect
                    label="Zone"
                    param="zone"
                    value={zone ?? 'all'}
                    options={(list.zones ?? []).map((z) => ({ value: z.id, label: z.name }))}
                  />
                  <DashSelect
                    label="Vehicle"
                    param="vehicle"
                    value={vehicle ?? 'all'}
                    options={VEHICLES}
                  />
                  <DashClear params={['q', 'zone', 'vehicle', 'tab']} />
                </FilterRow>
                <DataTable
                  caption="Riders"
                  isEmpty={list.rows.length === 0}
                  empty="No riders match. Clear the filters to see everyone."
                  head={[
                    'Rider',
                    'Rider ID',
                    'Phone',
                    'Vehicle',
                    'Zone',
                    'Status',
                    "Today's Orders",
                    'Earnings (KES)',
                    'Rating',
                    <span key="a" className="sr-only">
                      Actions
                    </span>,
                  ]}
                >
                  {list.rows.map((r) => (
                    <tr key={r.rider_id}>
                      <td>
                        <RiderCell id={r.rider_id} name={r.name} />
                      </td>
                      <td className="whitespace-nowrap font-semibold">{riderRef(r.rider_id)}</td>
                      <td className="whitespace-nowrap">{r.phone}</td>
                      <td>{VEHICLE_LABEL[r.vehicle] ?? r.vehicle}</td>
                      <td>
                        <ZoneChip name={r.zone_name} />
                      </td>
                      <td>
                        <BucketChip bucket={r.bucket} />
                      </td>
                      <td className="text-center font-bold tabular-nums">{n(r.trips_today)}</td>
                      <td className="font-bold tabular-nums">{n(r.earned_kes)}</td>
                      <td>
                        <Stars value={r.rating_avg} />
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
                <Footnote>
                  Earnings are what each rider earned in the period, in shillings.
                </Footnote>
              </DashCard>

              <div className="grid content-start gap-4">
                <DashCard
                  title="Rider Performance"
                  aside={
                    <CardLink href={screenHref('/riders/performance', period, {})}>
                      View All
                    </CardLink>
                  }
                >
                  {daily.some((d) => d.trips > 0) ? (
                    <TrendArea
                      height={200}
                      data={daily.map((d) => ({
                        day: d.day.slice(0, 10),
                        trips: asNumber(d.trips),
                      }))}
                      series={[{ key: 'trips', label: 'Deliveries', color: '#F5B400' }]}
                    />
                  ) : (
                    <p className="text-muted py-10 text-center text-sm font-semibold">
                      No deliveries in this period yet.
                    </p>
                  )}
                </DashCard>
                <DashCard
                  title="Top Riders (This Period)"
                  aside={
                    <CardLink href={screenHref('/riders/performance', period, { tab: 'top' })}>
                      View All
                    </CardLink>
                  }
                >
                  {top.length === 0 ? (
                    <p className="text-muted py-6 text-center text-sm font-semibold">
                      Nobody has delivered in this period yet.
                    </p>
                  ) : (
                    <ol className="space-y-3">
                      {top.map((r, i) => (
                        <li key={r.rider_id} className="flex items-center gap-3">
                          <span
                            aria-label={`Number ${i + 1}`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FFF4D6] text-[0.8125rem] font-black text-[#826D18]"
                          >
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <RiderCell
                              id={r.rider_id}
                              name={r.name}
                              sub={`${n(r.trips)} orders · ${pct(r.on_time_pct)} on-time`}
                            />
                          </span>
                          <span className="whitespace-nowrap rounded-lg bg-[#FFF4D6] px-2.5 py-1 text-[0.8125rem] font-extrabold text-[#826D18]">
                            KES {n(r.earned_kes)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </DashCard>
              </div>
            </div>
            {ridersTotal > 0 && (
              <p className="sr-only">
                {pct(shareOf(online, ridersTotal))} of riders are online and free for offers.
              </p>
            )}
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
