import { addDays, formatRange } from '@nexg/ui';
import {
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Hourglass,
  LayoutGrid,
  PackageCheck,
  ShoppingCart,
  Truck,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut, TrendArea } from '@/components/charts';
import { RangeControl } from '@/components/company/client-kit';
import type { Option } from '@/components/company/inventory';
import {
  CompanyHeader,
  CompanyTabs,
  PanelHead,
  Sheet,
  Stat,
  StatGrid,
} from '@/components/company/kit';
import {
  NewPurchase,
  OrdersTable,
  RequestsTable,
  type ItemOption,
  type OrderRow,
  type RequestRow,
} from '@/components/company/procurement';
import { ConsoleShell } from '@/components/console-shell';
import {
  companyAccess,
  DEPARTMENTS,
  hrefWith,
  kes,
  kesShort,
  periodBounds,
  periodFrom,
  periodQuery,
} from '@/lib/company';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Procurement' };
export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'requests' | 'approvals' | 'orders';

const REQUEST_COLUMNS =
  '*, vendor:company_vendor(name), location:company_location(name), requester:staff_user!company_purchase_request_requested_by_fkey(display_name, email), decider:staff_user!company_purchase_request_decided_by_fkey(display_name), lines:company_purchase_line(id, item_id, description, quantity, unit_cost_cents, received_quantity, sort), orders:company_purchase_order(id, number, status, total_cents, expected_on, issued_at, received_at, cancel_reason)';

const ORDER_COLUMNS =
  '*, vendor:company_vendor(name), location:company_location(name), request:company_purchase_request(number, title, department)';

/**
 * Company → Procurement: asking for something to be bought, a second
 * person approving it, the purchase order to the vendor, and the delivery
 * coming into stock. The two-person rule is the database's, not this page's.
 */
export default async function ProcurementPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string };
}) {
  const staff = await requireStaff();
  const mod = requireModule(staff, 'company');
  const { canWrite, canApprove } = companyAccess(mod.level, staff.isSuperAdmin);
  const tab: Tab = (['overview', 'requests', 'approvals', 'orders'] as const).includes(
    searchParams?.tab as Tab,
  )
    ? (searchParams!.tab as Tab)
    : 'overview';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const { start, end } = periodBounds(period);
  const supabase = createClient();

  const [requestsRes, ordersRes, itemsRes, vendorsRes, locationsRes] = await Promise.all([
    supabase
      .from('company_purchase_request')
      .select(REQUEST_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('company_purchase_order')
      .select(ORDER_COLUMNS)
      .order('issued_at', { ascending: false })
      .limit(1000),
    supabase
      .from('company_item')
      .select('id, name, unit, unit_cost_cents')
      .is('archived_at', null)
      .order('name'),
    supabase.from('company_vendor').select('id, name').eq('status', 'active').order('name'),
    supabase.from('company_location').select('id, name').eq('active', true).order('name'),
  ]);

  const requests = (requestsRes.data ?? []) as unknown as RequestRow[];
  const orders = (ordersRes.data ?? []) as unknown as OrderRow[];
  const items = (itemsRes.data ?? []) as ItemOption[];
  const vendors = (vendorsRes.data ?? []) as Option[];
  const locations = (locationsRes.data ?? []) as Option[];
  const failed = requestsRes.error || ordersRes.error;

  const sum = (list: { total_cents: number }[]) => list.reduce((s, r) => s + r.total_cents, 0);
  const waiting = requests.filter((r) => r.status === 'submitted');
  const forMe = waiting.filter(
    (r) => canApprove && (r.requested_by !== staff.staffId || staff.isSuperAdmin),
  );
  const approved = requests.filter((r) => r.status === 'approved');
  const open = orders.filter((o) => o.status === 'issued' || o.status === 'partially_received');
  const [from, to] = [Date.parse(start), Date.parse(end)];
  const inPeriod = (iso: string | null) => {
    const t = iso == null ? NaN : Date.parse(iso);
    return t >= from && t < to;
  };
  const ordered = orders.filter((o) => o.status !== 'cancelled' && inPeriod(o.issued_at));
  const received = orders.filter((o) => o.status === 'received' && inPeriod(o.received_at));

  /* Day by day across the period: what was ordered and what arrived. */
  const days: string[] = [];
  for (let d = period.from; d <= period.to && days.length < 400; d = addDays(d, 1)) days.push(d);
  const dayOf = (iso: string) =>
    new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const trend = days.map((d) => ({
    day: d,
    ordered: Math.round(sum(ordered.filter((o) => dayOf(o.issued_at) === d)) / 100),
    received: Math.round(
      sum(received.filter((o) => o.received_at && dayOf(o.received_at) === d)) / 100,
    ),
  }));
  const byDept = Object.entries(
    ordered.reduce<Record<string, number>>((m, o) => {
      const k = o.request?.department ?? 'other';
      m[k] = (m[k] ?? 0) + o.total_cents;
      return m;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ key: k, label: DEPARTMENTS[k] ?? k, value: Math.round(v / 100) }));

  const href = (t: string) =>
    hrefWith('/company/procurement', {
      tab: t === 'overview' ? null : t,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  const requestTable = (
    rows: RequestRow[],
    title: string,
    compact = false,
    statusFilter = true,
  ) => (
    <RequestsTable
      key={`${tab}-${title}`}
      rows={rows}
      orders={orders}
      me={staff.staffId}
      canWrite={canWrite}
      canApprove={canApprove}
      isSuperAdmin={staff.isSuperAdmin}
      items={items}
      vendors={vendors}
      locations={locations}
      title={title}
      compact={compact}
      showStatusFilter={statusFilter}
    />
  );

  return (
    <ConsoleShell staff={staff}>
      <CompanyHeader
        icon={ShoppingCart}
        title="Procurement"
        subtitle="Purchase requests, approvals and purchase orders for everything NexG buys for itself."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} />
            {canWrite && <NewPurchase items={items} vendors={vendors} locations={locations} />}
          </>
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <CompanyTabs
          active={tab}
          tabs={[
            { key: 'overview', label: 'Overview', icon: LayoutGrid, href: href('overview') },
            {
              key: 'requests',
              label: 'Requests',
              icon: ClipboardList,
              href: href('requests'),
              count: requests.length,
            },
            {
              key: 'approvals',
              label: 'Approvals',
              icon: ClipboardCheck,
              href: href('approvals'),
              alert: forMe.length,
            },
            {
              key: 'orders',
              label: 'Purchase orders',
              icon: FileCheck2,
              href: href('orders'),
              count: open.length || null,
            },
            { key: 'vendors', label: 'Vendors', icon: Truck, href: '/company/vendors' },
          ]}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Procurement could not be loaded in full: {failed.message}
          </p>
        )}

        {tab === 'overview' && (
          <>
            <StatGrid>
              <Stat
                icon={Hourglass}
                tone="amber"
                value={waiting.length.toLocaleString('en-KE')}
                label="Awaiting approval"
                note={kes(sum(waiting))}
                href={href('approvals')}
              />
              <Stat
                icon={ClipboardCheck}
                tone="blue"
                value={approved.length.toLocaleString('en-KE')}
                label="Approved, not ordered"
                note={kes(sum(approved))}
                href={href('requests')}
              />
              <Stat
                icon={FileCheck2}
                tone="purple"
                value={open.length.toLocaleString('en-KE')}
                label="Open purchase orders"
                note={kes(sum(open))}
                href={href('orders')}
              />
              <Stat
                icon={Wallet}
                value={kes(sum(ordered))}
                label="Ordered this period"
                note={`${ordered.length} ${ordered.length === 1 ? 'order' : 'orders'}`}
              />
              <Stat
                icon={PackageCheck}
                tone="green"
                value={kes(sum(received))}
                label="Received this period"
                note={`${received.length} ${received.length === 1 ? 'order' : 'orders'} complete`}
              />
            </StatGrid>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Sheet>
                <PanelHead title="Ordered and received" aside={formatRange(period)} />
                <div className="mt-4">
                  {ordered.length + received.length > 0 ? (
                    <TrendArea
                      data={trend}
                      unit="kes"
                      series={[
                        { key: 'ordered', label: 'Ordered', color: '#F5B800', fill: true },
                        { key: 'received', label: 'Received', color: '#141414' },
                      ]}
                    />
                  ) : (
                    <p className="text-muted-light py-16 text-center text-sm">
                      No purchase orders were raised or received in this period.
                    </p>
                  )}
                </div>
              </Sheet>
              <Sheet>
                <PanelHead title="Ordered by department" aside={formatRange(period)} />
                <div className="mt-4">
                  {byDept.length ? (
                    <ShareDonut
                      data={byDept}
                      unit="kes"
                      centre={kesShort(sum(ordered))}
                      caption="Ordered"
                      stacked
                    />
                  ) : (
                    <p className="text-muted-light py-16 text-center text-sm">
                      Nothing ordered in this period.
                    </p>
                  )}
                </div>
              </Sheet>
            </div>

            {canApprove && forMe.length > 0 && (
              <Sheet>{requestTable(forMe, 'Waiting for your decision', true, false)}</Sheet>
            )}
            <Sheet>{requestTable(requests, 'Recent requests', true)}</Sheet>
          </>
        )}

        {tab === 'requests' && <Sheet>{requestTable(requests, 'Purchase requests')}</Sheet>}
        {tab === 'approvals' && (
          <Sheet>
            {requestTable(
              waiting,
              canApprove
                ? 'Awaiting approval'
                : 'Awaiting approval (someone with full Company access decides)',
              false,
              false,
            )}
          </Sheet>
        )}
        {tab === 'orders' && (
          <Sheet>
            <OrdersTable
              rows={orders}
              requests={requests}
              canWrite={canWrite}
              canApprove={canApprove}
              title="Purchase orders"
            />
          </Sheet>
        )}
      </main>
    </ConsoleShell>
  );
}
