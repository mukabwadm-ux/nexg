import { maps as mapsCapability } from '@nexg/ui/capabilities';
import {
  AlertTriangle,
  Armchair,
  BedDouble,
  Bike,
  Car,
  Eye,
  Gavel,
  Headphones,
  Layers,
  LayoutGrid,
  MessageSquareText,
  ShoppingCart,
  Ticket,
  Users,
  Utensils,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleShell } from '@/components/console-shell';
import { AutoRefresh } from '@/components/operations/auto-refresh';
import { OpsMap } from '@/components/operations/ops-map';
import { QuickActions } from '@/components/operations/quick-actions';
import {
  CardLink,
  DashCanvas,
  DashCard,
  DashHeader,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  Pagination,
  SegmentTabs,
  StatusChip,
} from '@/components/portal/dash';
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import { RangeControl } from '@/components/portal/client-kit';
import {
  BUCKETS,
  etaLabel,
  isBucket,
  isTab,
  KINDS,
  ksh,
  parseOverview,
  parseRows,
  TAB_KINDS,
  TABS,
  type OpsBucket,
  type OpsKind,
  type OpsTab,
} from '@/lib/operations';
import { hrefWith, periodLast30 } from '@/lib/portal';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Operations' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 5;

const TAB_ICON = {
  all: Layers,
  food: Utensils,
  stays: BedDouble,
  experiences: Ticket,
  transfers: Car,
  services: LayoutGrid,
} as const;

const KIND_ICON: Record<OpsKind, typeof Utensils> = {
  food: Utensils,
  delivery: Bike,
  stay: BedDouble,
  experience: Ticket,
  transfer: Car,
  service: Armchair,
  incident: AlertTriangle,
  dispute: Gavel,
};

/**
 * Operations → Operations Dashboard: every live order, stay, experience
 * day, delivery and service booking in one place. Figures and rows come
 * from rpc_operations_overview and rpc_operations_list, which read the
 * same tables the Orders, Stays and Experiences screens do, and only the
 * parts the signed-in person may see.
 */
export default async function OperationsPage({
  searchParams,
}: {
  searchParams?: {
    tab?: string;
    status?: string;
    from?: string;
    to?: string;
    q?: string;
    category?: string;
    state?: string;
    area?: string;
    page?: string;
  };
}) {
  const staff = await requireStaff();
  if (!staff.modules.some((m) => m.key === 'orders' || m.key === 'live_ops')) {
    requireModule(staff, 'orders');
  }
  const reach = (key: string) => staff.modules.some((m) => m.key === key);

  const tab: OpsTab = isTab(searchParams?.tab) ? searchParams!.tab : 'all';
  const bucket: OpsBucket = isBucket(searchParams?.status) ? searchParams!.status : 'ongoing';
  const period = periodLast30(searchParams);
  const explicitPeriod = Boolean(searchParams?.from && searchParams?.to);
  const q = (searchParams?.q ?? '').trim().slice(0, 80);
  const category = (searchParams?.category ?? 'all') as OpsKind | 'all';
  const state = searchParams?.state ?? 'all';
  const area = searchParams?.area ?? 'all';
  const page = Math.max(1, Math.min(10_000, Number(searchParams?.page) || 1));

  const supabase = createClient();
  const [overviewRes, listRes, merchantsRes] = await Promise.all([
    supabase.rpc('rpc_operations_overview', {
      p_from: period.from,
      p_to: period.to,
      p_tab: tab,
    }),
    supabase.rpc('rpc_operations_list', {
      p_from: period.from,
      p_to: period.to,
      p_tab: tab,
      p_bucket: bucket,
      p_kind: category === 'all' ? undefined : category,
      p_status: state === 'all' ? undefined : state,
      p_area: area === 'all' ? undefined : area,
      p_q: q || undefined,
      p_limit: PAGE_SIZE,
      p_offset: (page - 1) * PAGE_SIZE,
    }),
    reach('orders')
      ? supabase
          .from('merchant')
          .select('id, trading_name, legal_name')
          .eq('status', 'live')
          .order('trading_name')
          .limit(500)
      : Promise.resolve({ data: null }),
  ]);

  const overview = parseOverview(overviewRes.data);
  const { total, rows } = parseRows(listRes.data);
  const failed = overviewRes.error ?? listRes.error;
  const k = overview.kpis;
  const now = Date.now();

  const keep = {
    from: explicitPeriod ? period.from : null,
    to: explicitPeriod ? period.to : null,
  };
  const tabHref = (t: OpsTab) => hrefWith('/operations', { tab: t === 'all' ? null : t, ...keep });
  const bucketHref = (b: OpsBucket) =>
    hrefWith('/operations', {
      tab: tab === 'all' ? null : tab,
      status: b === 'ongoing' ? null : b,
      q: q || null,
      category: category === 'all' ? null : category,
      state: state === 'all' ? null : state,
      area: area === 'all' ? null : area,
      ...keep,
    });
  const pageHref = (p: number) =>
    hrefWith('/operations', {
      tab: tab === 'all' ? null : tab,
      status: bucket === 'ongoing' ? null : bucket,
      q: q || null,
      category: category === 'all' ? null : category,
      state: state === 'all' ? null : state,
      area: area === 'all' ? null : area,
      page: p === 1 ? null : String(p),
      ...keep,
    });

  const kindOptions = TAB_KINDS[tab].map((key) => ({
    value: key,
    label: KINDS[key].label,
  }));

  return (
    <ConsoleShell staff={staff}>
      <DashHeader
        title="Operations"
        subtitle="Manage and monitor all live operations across orders, bookings, deliveries and services."
        actions={<RangeControl from={period.from} to={period.to} showPreset />}
      />

      <DashCanvas>
        <GoldTabs
          label="Operation types"
          active={tab}
          tabs={TABS.map((t) => ({
            key: t.key,
            label: t.label,
            icon: TAB_ICON[t.key],
            href: tabHref(t.key),
          }))}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Operations could not be loaded in full: {failed.message}
          </p>
        )}

        <DashKpiGrid>
          <DashKpi
            featured
            icon={ShoppingCart}
            label="Total Orders"
            value={k.orders.value?.toLocaleString('en-KE') ?? null}
            delta={k.orders.delta}
            series={k.orders.series}
            explain="Orders placed in the period, against the same number of days before it. The line is orders per day."
          />
          <DashKpi
            icon={BedDouble}
            label="Bookings & Reservations"
            value={k.bookings.value?.toLocaleString('en-KE') ?? null}
            delta={k.bookings.delta}
            series={k.bookings.series}
            explain="Stays, experience days and service bookings made in the period, against the period before. The line is bookings per day."
          />
          <DashKpi
            icon={Bike}
            label="Active Deliveries"
            value={k.deliveries.value?.toLocaleString('en-KE') ?? null}
            delta={k.deliveries.delta}
            series={k.deliveries.series}
            explain="Orders out for delivery right now. The change and the line count deliveries per day in the period against the period before."
          />
          <DashKpi
            icon={Users}
            label="In-house Guests"
            value={k.guests.value?.toLocaleString('en-KE') ?? null}
            delta={k.guests.delta}
            series={k.guests.series}
            explain="Guests checked in to stays right now. The line is guests in house each night; the change compares the average night with the period before."
          />
          <DashKpi
            icon={Headphones}
            label="Open Incidents"
            value={k.incidents.value?.toLocaleString('en-KE') ?? null}
            delta={k.incidents.delta}
            upIsBad
            series={k.incidents.series}
            explain="Incidents and disputed orders not yet resolved. The change and the line count new ones per day against the period before."
          />
        </DashKpiGrid>

        <div className="grid gap-4 min-[1440px]:grid-cols-[minmax(0,1fr)_20rem] min-[1440px]:items-start min-[1600px]:grid-cols-[minmax(0,1fr)_23rem]">
          <DashCard
            title="Live Operations"
            aside={<AutoRefresh />}
            className="min-[1440px]:min-h-full"
          >
            <SegmentTabs
              label="Operation status"
              active={bucket}
              tabs={BUCKETS.map((b) => ({
                key: b.key,
                label: b.label,
                count: b.key === 'ongoing' || b.key === 'pending' ? overview.buckets[b.key] : null,
                href: bucketHref(b.key),
              }))}
            />

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] xl:grid-cols-[minmax(10rem,1.6fr)_repeat(3,minmax(8.5rem,1fr))_auto]">
              <DashSearch
                value={q}
                label="Search operations"
                placeholder="Search by order ID, customer, merchant…"
                className="col-span-2 sm:col-span-4 xl:col-span-1"
              />
              <DashSelect
                label="Category"
                param="category"
                value={category}
                options={kindOptions}
                className="min-w-0"
              />
              <DashSelect
                label="Status"
                param="state"
                value={state}
                options={overview.statuses.map((s) => ({ value: s.key, label: s.label }))}
                className="min-w-0"
              />
              <DashSelect
                label="Area"
                param="area"
                value={area}
                options={overview.areas.map((a) => ({ value: a.id, label: a.name }))}
                className="min-w-0"
              />
              <DashClear params={['q', 'category', 'state', 'area']} />
            </div>

            <div className="relative mt-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-[0.8125rem] min-[1600px]:text-[0.875rem] min-[1920px]:text-[0.9375rem]">
                <caption className="sr-only">
                  {BUCKETS.find((b) => b.key === bucket)?.label} operations
                </caption>
                <thead>
                  <tr className="text-ink text-[0.8125rem] font-bold min-[1600px]:text-[0.875rem]">
                    {[
                      'Ref / ID',
                      'Type',
                      'Customer',
                      'Merchant / Property',
                      'Amount',
                      'Status',
                      'ETA / Check-in',
                    ].map((h, i) => (
                      <th
                        key={h}
                        scope="col"
                        className={`bg-bg px-2 py-3 font-bold min-[1600px]:px-2.5 ${i === 0 ? 'rounded-l-lg' : ''}`}
                      >
                        {h}
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="bg-bg rounded-r-lg px-2 py-3 text-center font-bold min-[1600px]:px-2.5"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-muted px-2.5 py-10 text-center font-semibold">
                        {q || category !== 'all' || state !== 'all' || area !== 'all'
                          ? 'Nothing matches these filters.'
                          : `No ${BUCKETS.find((b) => b.key === bucket)?.noun} in this period.`}
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const Icon = KIND_ICON[r.kind];
                      return (
                        <tr key={`${r.kind}-${r.id}`} className="border-border">
                          <td className="border-border whitespace-nowrap border-b px-2 py-3 font-extrabold min-[1600px]:px-2.5">
                            #{r.ref}
                          </td>
                          <td className="border-border border-b px-2 py-3 min-[1600px]:px-2.5">
                            <span
                              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[0.8125rem] font-semibold min-[1600px]:gap-1.5 min-[1600px]:px-2.5 ${
                                KINDS[r.kind].tone === 'green'
                                  ? 'bg-[#E3F5E6] text-[#1E7B34]'
                                  : KINDS[r.kind].tone === 'red'
                                    ? 'bg-[#FDE7E5] text-[#C62D22]'
                                    : 'bg-[#FFF1D6] text-[#B36B00]'
                              }`}
                            >
                              <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.9} />
                              {KINDS[r.kind].label}
                            </span>
                          </td>
                          <td className="border-border border-b px-2 py-3 min-[1600px]:px-2.5">
                            {r.customer ?? '—'}
                          </td>
                          <td className="border-border border-b px-2 py-3 min-[1600px]:px-2.5">
                            <span
                              className="line-clamp-2 max-w-[11rem]"
                              title={r.party ?? undefined}
                            >
                              {r.party ?? '—'}
                            </span>
                          </td>
                          <td className="border-border whitespace-nowrap border-b px-2 py-3 font-bold tabular-nums min-[1600px]:px-2.5">
                            {ksh(r.amount_cents)}
                          </td>
                          <td className="border-border border-b px-2 py-3 min-[1600px]:px-2.5">
                            <StatusChip tone={r.tone} className="px-2 min-[1600px]:px-2.5">
                              {r.status_label}
                            </StatusChip>
                          </td>
                          <td className="border-border border-b px-2 py-3 tabular-nums min-[1600px]:whitespace-nowrap min-[1600px]:px-2.5">
                            {etaLabel(r, now)}
                          </td>
                          <td className="border-border border-b px-2 py-3 min-[1600px]:px-2.5">
                            <span className="flex items-center justify-center gap-2.5">
                              {r.href ? (
                                <>
                                  <Link
                                    href={r.href}
                                    aria-label={`Contact about ${r.ref}`}
                                    title="Contact"
                                    className="text-ink hover:text-[#B57A00]"
                                  >
                                    <MessageSquareText aria-hidden="true" className="h-5 w-5" />
                                  </Link>
                                  <Link
                                    href={r.href}
                                    aria-label={`Open ${r.ref}`}
                                    title="Open"
                                    className="text-ink hover:text-[#B57A00]"
                                  >
                                    <Eye aria-hidden="true" className="h-5 w-5" />
                                  </Link>
                                </>
                              ) : (
                                <span className="text-muted-light">—</span>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              size={PAGE_SIZE}
              total={total}
              noun={BUCKETS.find((b) => b.key === bucket)?.noun ?? 'operations'}
              href={pageHref}
            />
          </DashCard>

          <div className="grid gap-4 md:grid-cols-2 min-[1440px]:grid-cols-1">
            <DashCard
              title="Live Operations Map"
              aside={
                reach('live_ops') ? <CardLink href="/live">View Full Map</CardLink> : undefined
              }
            >
              <OpsMap
                maps={mapsCapability()}
                centre={
                  overview.city && overview.city.lat != null && overview.city.lng != null
                    ? { lat: overview.city.lat, lng: overview.city.lng }
                    : null
                }
                city={overview.city?.name ?? 'Nairobi'}
                points={overview.points}
              />
            </DashCard>

            <DashCard title="Quick Actions">
              <QuickActions
                order={
                  reach('orders') && overview.city
                    ? {
                        cityId: overview.city.id,
                        merchants:
                          ((merchantsRes as { data: unknown }).data as
                            | { id: string; trading_name: string | null; legal_name: string }[]
                            | null) ?? [],
                      }
                    : null
                }
                bookingHref={reach('hotels') ? '/hotels?tab=listings' : null}
                assignHref={reach('live_ops') ? '/live?chip=unassigned' : null}
                canIncident={reach('live_ops') || reach('riders') || reach('orders')}
              />
            </DashCard>
          </div>
        </div>
      </DashCanvas>
    </ConsoleShell>
  );
}
