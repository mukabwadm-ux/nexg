import { maps as mapsCapability } from '@nexg/ui/capabilities';
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Package,
  PlusCircle,
  Star,
  Truck,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { OpsMap, type MapPoint } from '@/components/operations/ops-map';
import {
  CategoryChip,
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
  DeliveryChip,
  ErrorNote,
  FilterRow,
  Footnote,
  Funnel,
  RiderCell,
  ScreenHeader,
  WaitingForDatabase,
  ZoneChip,
} from '@/components/riders/module';
import { periodFrom } from '@/lib/portal';
import {
  asMaybe,
  asNumber,
  asObject,
  clockOnly,
  delta,
  isMissingFunction,
  minutes,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  paged,
  pct,
  ppDelta,
  screenHref,
  shareOf,
  when,
} from '@/lib/riders-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Orders & Deliveries' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Orders', icon: CalendarDays },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
  { key: 'in_transit', label: 'In Transit', icon: Truck },
  { key: 'pending_pickup', label: 'Pending Pickup', icon: Clock },
  { key: 'failed', label: 'Failed / Returned', icon: XCircle },
] as const;
type Tab = (typeof TABS)[number]['key'];

interface DeliveryRow {
  id: string;
  reference: string;
  customer: string | null;
  merchant: string | null;
  category: string | null;
  rider_id: string | null;
  rider: string | null;
  zone: string | null;
  total_cents: number;
  stage: string;
  bucket: string;
  placed_at: string;
  picked_up_at: string | null;
  delivered_at: string | null;
  promised_delivery_at: string | null;
}

interface RecentRow {
  id: string;
  reference: string;
  bucket: string;
  rider: string | null;
  delivered_at: string | null;
  picked_up_at: string | null;
  promised_delivery_at: string | null;
}

const minsBetween = (a: string | null, b: string | null) =>
  a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000) : null;

/**
 * Riders → Orders & Deliveries: every order NexG dispatched (it has a
 * dispatch job) in the period, where it stands and how long it took
 * (rpc_console_riders_deliveries). The order itself opens on Orders.
 */
export default async function RiderDeliveriesPage({
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
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const zone = searchParams?.zone && searchParams.zone !== 'all' ? searchParams.zone : null;
  const page = pageOf(searchParams?.page);
  const maps = mapsCapability();

  const { data: city } = await supabase
    .from('city')
    .select('id, name')
    .eq('slug', 'nairobi')
    .maybeSingle();

  const [readQ, pointsQ] = await Promise.all([
    supabase.rpc('rpc_console_riders_deliveries', {
      p_from: period.from,
      p_to: period.to,
      p_tab: tab,
      p_q: q || undefined,
      p_zone: zone ?? undefined,
      p_page: page,
      p_size: PAGE_SIZE,
    }),
    /* Only when there is a map to draw them on: a drop-off pin is a
       customer's address, and a page without a map has no use for it. */
    maps.live && city
      ? supabase.rpc('rpc_live_order_points', { p_city_id: city.id })
      : Promise.resolve({ data: [] }),
  ]);

  const waiting = isMissingFunction(readQ.error);
  const o = asObject(readQ.data);
  const k = asObject(o.kpis);
  const funnel = asObject(o.funnel);
  const daily = (Array.isArray(o.daily) ? o.daily : []) as { day: string; orders: number }[];
  const recent = (Array.isArray(o.recent) ? o.recent : []) as RecentRow[];
  const list = paged<DeliveryRow>(readQ.data);
  const total = asNumber(k.total);

  const pins: MapPoint[] = (
    (pointsQ.data as
      | {
          reference: string;
          stage: string;
          dropoff_lat: number | null;
          dropoff_lng: number | null;
          pickup_lat: number | null;
          pickup_lng: number | null;
        }[]
      | null) ?? []
  )
    .map((p) => {
      const enRoute = ['picked_up', 'arriving'].includes(p.stage);
      const lat = enRoute ? p.dropoff_lat : p.pickup_lat;
      const lng = enRoute ? p.dropoff_lng : p.pickup_lng;
      return lat != null && lng != null
        ? {
            kind: (enRoute ? 'delivery' : 'food') as MapPoint['kind'],
            lat,
            lng,
            label: `${p.reference} · ${enRoute ? 'on the way' : 'at pickup'}`,
          }
        : null;
    })
    .filter((p): p is MapPoint => p !== null);

  const keep = { q: q || null, zone };
  const href = (params: Record<string, string | null | undefined>) =>
    screenHref('/riders/deliveries', period, {
      tab: tab === 'all' ? null : tab,
      ...keep,
      ...params,
    });

  return (
    <ConsoleShell staff={staff}>
      <ScreenHeader
        title="Riders – Orders & Deliveries"
        subtitle="Track, manage and optimize all orders, assignments and deliveries."
        period={period}
        exportHref={screenHref('/riders/export', period, { view: 'deliveries', tab, ...keep })}
        action={
          <HeaderButton icon={PlusCircle} gold href="/orders">
            Create Order
          </HeaderButton>
        }
      />
      <DashCanvas>
        {waiting ? (
          <WaitingForDatabase />
        ) : readQ.error ? (
          <ErrorNote message={readQ.error.message} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-7">
              <DashKpi
                featured
                icon={CalendarDays}
                label="Total Orders"
                value={n(total)}
                delta={delta(total, asNumber(k.total_prev))}
                explain="Orders placed in the period that NexG dispatched to a rider."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Delivered"
                value={n(asNumber(k.delivered))}
                explain="Delivered."
              >
                <Sub text={pct(shareOf(asNumber(k.delivered), total))} />
              </DashKpi>
              <DashKpi
                icon={Truck}
                label="In Transit"
                value={n(asNumber(k.in_transit))}
                explain="Picked up, on the way."
              >
                <Sub text={pct(shareOf(asNumber(k.in_transit), total))} />
              </DashKpi>
              <DashKpi
                icon={Clock}
                label="Pending Pickup"
                value={n(asNumber(k.pending_pickup))}
                explain="Dispatched, not yet picked up."
              >
                <Sub text={pct(shareOf(asNumber(k.pending_pickup), total))} />
              </DashKpi>
              <DashKpi
                icon={XCircle}
                iconTone="red"
                label="Failed / Returned"
                value={n(asNumber(k.failed))}
                explain="Cancelled, refunded or disputed after dispatch."
              >
                <Sub text={pct(shareOf(asNumber(k.failed), total))} />
              </DashKpi>
              <DashKpi
                icon={Zap}
                label="Avg. Delivery Time"
                value={minutes(asMaybe(k.delivery_min))}
                delta={delta(asMaybe(k.delivery_min), asMaybe(k.delivery_min_prev))}
                upIsBad
                explain="Picked up to delivered."
              />
              <DashKpi
                icon={Star}
                label="On-time Rate"
                value={pct(asMaybe(k.on_time_pct))}
                deltaText={ppDelta(asMaybe(k.on_time_pct), asMaybe(k.on_time_pct_prev))}
                explain="Delivered at or before the promised time."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)]">
              <DashCard title="Orders Trend">
                {daily.some((d) => asNumber(d.orders) > 0) ? (
                  <TrendArea
                    height={220}
                    data={daily.map((d) => ({
                      day: d.day.slice(0, 10),
                      orders: asNumber(d.orders),
                    }))}
                    series={[{ key: 'orders', label: 'Orders', color: '#F5B400' }]}
                  />
                ) : (
                  <p className="text-muted py-12 text-center text-sm font-semibold">
                    No dispatched orders in this period.
                  </p>
                )}
              </DashCard>
              <DashCard title="Live Deliveries">
                <OpsMap maps={maps} centre={null} city={city?.name ?? 'Nairobi'} points={pins} />
              </DashCard>
              <div className="grid content-start gap-4">
                <DashCard title="Delivery Funnel">
                  <Funnel
                    steps={[
                      { label: 'Orders', value: asNumber(funnel.orders) },
                      { label: 'Picked Up', value: asNumber(funnel.picked_up) },
                      { label: 'In Transit', value: asNumber(funnel.in_transit) },
                      { label: 'Delivered', value: asNumber(funnel.delivered) },
                    ]}
                  />
                </DashCard>
                <DashCard title="Delivery SLAs">
                  <ul className="space-y-2.5">
                    <Sla
                      icon={Clock}
                      label="Avg. Pickup Time"
                      value={minutes(asMaybe(k.pickup_min))}
                    />
                    <Sla
                      icon={Truck}
                      label="Avg. Delivery Time"
                      value={minutes(asMaybe(k.delivery_min))}
                    />
                    <Sla icon={Star} label="On-time Rate" value={pct(asMaybe(k.on_time_pct))} />
                  </ul>
                  <Footnote>Pickup: rider assigned to at the shop.</Footnote>
                </DashCard>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Orders"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    icon: t.icon,
                    count: list.counts[t.key] ?? 0,
                    href: screenHref('/riders/deliveries', period, {
                      tab: t.key === 'all' ? null : t.key,
                      ...keep,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search orders"
                    placeholder="Search order ID, customer, rider or merchant…"
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
                  caption="Orders and deliveries"
                  isEmpty={list.rows.length === 0}
                  empty="No orders match."
                  head={[
                    'Order ID',
                    'Customer',
                    'Merchant',
                    'Service',
                    'Rider',
                    'Zone',
                    'Amount (KES)',
                    'Status',
                    'Order Time',
                    'Delivery Time',
                  ]}
                >
                  {list.rows.map((r) => {
                    const took = minsBetween(r.picked_up_at, r.delivered_at);
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap font-bold">
                          <Link
                            href={`/orders?q=${encodeURIComponent(r.reference)}`}
                            className="hover:underline"
                          >
                            {r.reference}
                          </Link>
                        </td>
                        <td>{r.customer || '—'}</td>
                        <td className="max-w-[10rem] truncate">{r.merchant ?? '—'}</td>
                        <td>
                          {r.category ? (
                            <CategoryChip
                              label={r.category
                                .replace(/_/g, ' ')
                                .replace(/^./, (c) => c.toUpperCase())}
                            />
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          {r.rider ? (
                            <RiderCell id={r.rider_id} name={r.rider} />
                          ) : (
                            <span className="text-muted">Not assigned</span>
                          )}
                        </td>
                        <td>
                          <ZoneChip name={r.zone} />
                        </td>
                        <td className="font-bold tabular-nums">{n(r.total_cents / 100)}</td>
                        <td>
                          <DeliveryChip bucket={r.bucket} />
                        </td>
                        <td className="whitespace-nowrap">{when(r.placed_at)}</td>
                        <td className="whitespace-nowrap">
                          {r.delivered_at
                            ? `${clockOnly(r.delivered_at)}${took != null ? ` (${took} min)` : ''}`
                            : r.promised_delivery_at && r.bucket !== 'failed'
                              ? `ETA ${clockOnly(r.promised_delivery_at)}`
                              : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={list.total}
                  noun="orders"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
                <Footnote>Customers are shown by first name only.</Footnote>
              </DashCard>

              <DashCard
                title="Recent Deliveries"
                aside={
                  <Link
                    href={href({ tab: 'delivered' })}
                    className="text-[0.875rem] font-bold text-[#826D18] underline underline-offset-4"
                  >
                    View All →
                  </Link>
                }
              >
                {recent.length === 0 ? (
                  <p className="text-muted py-6 text-center text-sm font-semibold">
                    No deliveries yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {recent.map((r) => (
                      <li key={r.id} className="flex items-center gap-3">
                        {r.bucket === 'delivered' ? (
                          <CheckCircle2
                            aria-hidden="true"
                            className="h-6 w-6 shrink-0 text-[#1E9E45]"
                          />
                        ) : (
                          <Truck aria-hidden="true" className="h-6 w-6 shrink-0 text-[#2F80ED]" />
                        )}
                        <span className="min-w-0 flex-1">
                          <Link
                            href={`/orders?q=${encodeURIComponent(r.reference)}`}
                            className="block font-extrabold hover:underline"
                          >
                            {r.reference}
                          </Link>
                          <span className="text-muted block text-[0.8125rem] font-semibold">
                            {r.bucket === 'delivered'
                              ? `Delivered${minsBetween(r.picked_up_at, r.delivered_at) != null ? ` · ${minsBetween(r.picked_up_at, r.delivered_at)} min` : ''}`
                              : `In transit${r.promised_delivery_at ? ` · ETA ${clockOnly(r.promised_delivery_at)}` : ''}`}
                            {r.rider ? ` · ${r.rider}` : ''}
                          </span>
                        </span>
                        <Package aria-hidden="true" className="h-5 w-5 text-[#E5A800]" />
                      </li>
                    ))}
                  </ul>
                )}
              </DashCard>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

function Sub({ text }: { text: string }) {
  return (
    <span className="text-ink mt-2 block text-[0.9375rem] font-extrabold tabular-nums">
      ({text})
    </span>
  );
}

function Sla({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5 font-semibold">
        <Icon aria-hidden="true" className="h-5 w-5 text-[#E5A800]" />
        {label}
      </span>
      <span className="rounded-lg bg-[#E3F5E6] px-3 py-1 font-extrabold tabular-nums text-[#1E7B34]">
        {value}
      </span>
    </li>
  );
}
