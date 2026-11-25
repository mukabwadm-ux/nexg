import { Bike, CheckCircle2, PauseCircle, Star, Users, WifiOff } from 'lucide-react';
import type { Metadata } from 'next';

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
import {
  AddRiderButton,
  BucketChip,
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  KycMark,
  RiderCell,
  ScreenHeader,
  Stars,
  WaitingForDatabase,
  ZoneChip,
} from '@/components/riders/module';
import { RiderRowMenu } from '@/components/riders/module-client';
import { periodFrom } from '@/lib/portal';
import {
  BUCKET_LABEL,
  isMissingFunction,
  KYC_LABEL,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  paged,
  pct,
  riderRef,
  screenHref,
  shareOf,
  VEHICLE_LABEL,
  when,
  type RiderFact,
} from '@/lib/riders-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'All Riders' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Riders' },
  { key: 'online', label: 'Active' },
  { key: 'on_trip', label: 'On Trip' },
  { key: 'offline', label: 'Offline' },
  { key: 'suspended', label: 'Suspended' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const option = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

/**
 * Riders → All Riders: every rider who has been activated, with their
 * state now, KYC, rating, lifetime orders and what they earned in the
 * period. Filters and pages are read on the server
 * (rpc_console_riders_list); Export takes every matching row.
 */
export default async function AllRidersPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    tab?: string;
    q?: string;
    zone?: string;
    vehicle?: string;
    status?: string;
    kyc?: string;
    sort?: string;
    page?: string;
  };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const supabase = createClient();

  const period = periodFrom(searchParams);
  /* Status is the same choice as the tabs, offered as a filter too, as drawn. */
  const tab: Tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.status && searchParams.status !== 'all' ? searchParams.status : searchParams?.tab,
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const pick = (v: string | undefined) => (v && v !== 'all' ? v : null);
  const zone = pick(searchParams?.zone);
  const vehicle = pick(searchParams?.vehicle);
  const kyc = pick(searchParams?.kyc);
  const sort = oneOf(
    ['trips', 'earned', 'rating', 'last_active', 'name'] as const,
    searchParams?.sort,
    'trips',
  );
  const page = pageOf(searchParams?.page);

  const { data, error } = await supabase.rpc('rpc_console_riders_list', {
    p_from: period.from,
    p_to: period.to,
    p_tab: tab,
    p_q: q || undefined,
    p_zone: zone ?? undefined,
    p_vehicle: vehicle ?? undefined,
    p_kyc: kyc ?? undefined,
    p_sort: sort,
    p_page: page,
    p_size: PAGE_SIZE,
  });
  const waiting = isMissingFunction(error);
  const list = paged<RiderFact>(data);
  const c = list.counts;
  const total = c.all ?? 0;

  const keep = { q: q || null, zone, vehicle, kyc, sort: sort === 'trips' ? null : sort };
  const href = (params: Record<string, string | null | undefined>) =>
    screenHref('/riders/all', period, { tab: tab === 'all' ? null : tab, ...keep, ...params });

  return (
    <ConsoleShell staff={staff}>
      <ScreenHeader
        title="All Riders"
        subtitle="View, manage and take action on all registered riders."
        period={period}
        exportHref={screenHref('/riders/export', period, { view: 'riders', tab, ...keep })}
        action={<AddRiderButton />}
      />
      <DashCanvas>
        {waiting ? (
          <WaitingForDatabase />
        ) : error ? (
          <ErrorNote message={error.message} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Users}
                label="Total Riders"
                value={n(total)}
                explain="Riders who have been activated: active, on a trip, offline or suspended. Filters above the table narrow this too."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Active"
                value={n(c.online)}
                explain="Online now and free for offers."
              >
                <RatioLine value={shareOf(c.online ?? 0, total)} />
              </DashKpi>
              <DashKpi
                icon={Bike}
                label="On Trip"
                value={n(c.on_trip)}
                explain="Carrying an order now."
              >
                <RatioLine value={shareOf(c.on_trip ?? 0, total)} />
              </DashKpi>
              <DashKpi
                icon={WifiOff}
                label="Offline"
                value={n(c.offline)}
                explain="Active account, not online now."
              >
                <RatioLine value={shareOf(c.offline ?? 0, total)} />
              </DashKpi>
              <DashKpi
                icon={PauseCircle}
                label="Suspended"
                value={n(c.suspended)}
                explain="Suspended accounts."
              >
                <RatioLine value={shareOf(c.suspended ?? 0, total)} />
              </DashKpi>
              <DashKpi
                icon={Star}
                label="Avg. Rating"
                value={c.rating_avg ? `${c.rating_avg.toFixed(1)} / 5` : null}
                explain="The average of the matching riders' customer ratings, each rider's average over all their ratings."
              >
                {!c.rating_avg && (
                  <span className="text-muted mt-1 block text-sm font-semibold">
                    No ratings yet
                  </span>
                )}
              </DashKpi>
            </DashKpiGrid>

            <DashCard>
              <GoldTabs
                label="Rider status"
                active={tab}
                className="mb-4"
                tabs={TABS.map((t) => ({
                  key: t.key,
                  label: t.label,
                  icon: t.key === 'all' ? Bike : undefined,
                  count: c[t.key] ?? 0,
                  href: screenHref('/riders/all', period, {
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
                  options={option(VEHICLE_LABEL)}
                />
                <DashSelect
                  label="Status"
                  param="status"
                  value={tab}
                  options={option({
                    online: BUCKET_LABEL.online!,
                    on_trip: BUCKET_LABEL.on_trip!,
                    offline: BUCKET_LABEL.offline!,
                    suspended: BUCKET_LABEL.suspended!,
                  })}
                />
                <DashSelect
                  label="KYC"
                  param="kyc"
                  value={kyc ?? 'all'}
                  options={option(KYC_LABEL)}
                />
                <DashSelect
                  label="Sort"
                  param="sort"
                  value={sort}
                  options={[
                    { value: 'trips', label: 'Most orders' },
                    { value: 'earned', label: 'Highest earnings' },
                    { value: 'rating', label: 'Best rating' },
                    { value: 'last_active', label: 'Last active' },
                    { value: 'name', label: 'Name A–Z' },
                  ]}
                />
                <DashClear params={['q', 'zone', 'vehicle', 'status', 'kyc', 'sort', 'tab']} />
              </FilterRow>
              <DataTable
                caption="All riders"
                isEmpty={list.rows.length === 0}
                empty="No riders match. Clear the filters to see everyone."
                head={[
                  '#',
                  'Rider',
                  'Rider ID',
                  'Phone',
                  'Vehicle',
                  'Zone',
                  'Status',
                  'KYC',
                  'Rating',
                  'Total Orders',
                  'Earnings (KES)',
                  'Last Active',
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
                    <td className="whitespace-nowrap">{r.phone}</td>
                    <td>{VEHICLE_LABEL[r.vehicle] ?? r.vehicle}</td>
                    <td>
                      <ZoneChip name={r.zone_name} />
                    </td>
                    <td>
                      <BucketChip bucket={r.bucket} />
                    </td>
                    <td>
                      <KycMark kyc={r.kyc} />
                    </td>
                    <td>
                      <Stars value={r.rating_avg} />
                    </td>
                    <td className="text-center font-bold tabular-nums">{n(r.trips_all)}</td>
                    <td className="font-bold tabular-nums">{n(r.earned_kes)}</td>
                    <td className="whitespace-nowrap">{when(r.last_active)}</td>
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
                Total Orders counts every delivery the rider has made; Earnings is what they earned
                in the period. KYC is Verified when every required document for their vehicle is
                verified.
              </Footnote>
            </DashCard>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

/** The "86.0%" line under a status card; nothing when there is no share. */
function RatioLine({ value }: { value: number | null }) {
  if (value == null) return null;
  return (
    <span className="text-ink mt-2 block text-[0.9375rem] font-extrabold tabular-nums">
      {pct(value)}
    </span>
  );
}
