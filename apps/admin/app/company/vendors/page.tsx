import { formatRange } from '@nexg/ui';
import {
  Archive,
  CirclePause,
  FileCheck2,
  Layers,
  LayoutGrid,
  ListChecks,
  Truck,
  Wallet,
} from 'lucide-react';
import type { Metadata } from 'next';

import { RangeControl } from '@/components/portal/client-kit';
import type { Option } from '@/components/company/inventory';
import { PageHeader, ViewTabs, PanelHead, Sheet, Stat, StatGrid } from '@/components/portal/kit';
import {
  AddVendor,
  VendorsTable,
  type VendorOrder,
  type VendorRow,
} from '@/components/company/vendors';
import { ConsoleShell } from '@/components/console-shell';
import {
  companyAccess,
  hrefWith,
  kes,
  periodBounds,
  periodFrom,
  periodQuery,
  VENDOR_CATEGORIES,
} from '@/lib/company';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Vendors & Suppliers' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'active', label: 'Active', icon: ListChecks },
  { key: 'on_hold', label: 'On Hold', icon: CirclePause },
  { key: 'archived', label: 'Archived', icon: Archive },
] as const;

type Tab = (typeof TABS)[number]['key'];

/**
 * Company → Vendors & suppliers: the businesses NexG buys from for itself,
 * who to call there, what they supply, and what has been ordered from them.
 */
export default async function VendorsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string };
}) {
  const staff = await requireStaff();
  const mod = requireModule(staff, 'company');
  const { canWrite } = companyAccess(mod.level, staff.isSuperAdmin);
  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : 'overview';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const { start, end } = periodBounds(period);
  const supabase = createClient();

  const [vendorsRes, ordersRes, citiesRes] = await Promise.all([
    supabase.from('company_vendor').select('*, city:city(name)').order('name').limit(2000),
    supabase
      .from('company_purchase_order')
      .select('id, number, vendor_id, status, total_cents, issued_at, received_at')
      .order('issued_at', { ascending: false })
      .limit(5000),
    supabase.from('city').select('id, name').order('name'),
  ]);

  const vendors = (vendorsRes.data ?? []) as unknown as VendorRow[];
  const orders = (ordersRes.data ?? []) as VendorOrder[];
  const cities = (citiesRes.data ?? []) as Option[];
  const failed = vendorsRes.error || ordersRes.error;
  const active = vendors.filter((v) => v.status === 'active');
  const onHold = vendors.filter((v) => v.status === 'on_hold');
  const covered = new Set(active.flatMap((v) => v.categories));
  const open = orders.filter((o) => o.status === 'issued' || o.status === 'partially_received');
  const [from, to] = [Date.parse(start), Date.parse(end)];
  const inPeriod = orders.filter((o) => {
    const t = Date.parse(o.issued_at);
    return o.status !== 'cancelled' && t >= from && t < to;
  });
  const sum = (list: { total_cents: number }[]) => list.reduce((s, o) => s + o.total_cents, 0);
  const top = Object.entries(
    inPeriod.reduce<Record<string, number>>((m, o) => {
      m[o.vendor_id] = (m[o.vendor_id] ?? 0) + o.total_cents;
      return m;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const topMax = top[0]?.[1] ?? 0;
  const nameOf = (id: string) => vendors.find((v) => v.id === id)?.name ?? 'Unknown vendor';
  const missing = Object.keys(VENDOR_CATEGORIES).filter((c) => c !== 'other' && !covered.has(c));
  const href = (t: string) =>
    hrefWith('/company/vendors', {
      tab: t === 'overview' ? null : t,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  const table = (rows: VendorRow[], title: string, compact = false) => (
    <VendorsTable
      key={tab}
      rows={rows}
      orders={orders}
      cities={cities}
      canWrite={canWrite}
      title={title}
      compact={compact}
    />
  );

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={Truck}
        title="Vendors & Suppliers"
        subtitle="The businesses NexG buys from: who to call, what they supply, their terms and what has been ordered."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} />
            {canWrite && <AddVendor cities={cities} />}
          </>
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <ViewTabs
          active={tab}
          tabs={TABS.map((t) => ({
            key: t.key,
            label: t.label,
            icon: t.icon,
            href: href(t.key),
            count: t.key === 'overview' ? null : vendors.filter((v) => v.status === t.key).length,
          }))}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Vendors could not be loaded in full: {failed.message}
          </p>
        )}

        {tab === 'overview' ? (
          <>
            <StatGrid>
              <Stat
                icon={Truck}
                value={active.length.toLocaleString('en-KE')}
                label="Active Vendors"
                href={href('active')}
              />
              <Stat
                icon={CirclePause}
                tone="amber"
                value={onHold.length.toLocaleString('en-KE')}
                label="On Hold"
                href={href('on_hold')}
              />
              <Stat
                icon={Layers}
                value={covered.size.toLocaleString('en-KE')}
                label="Categories Covered"
                note={`of ${Object.keys(VENDOR_CATEGORIES).length} kinds of supply`}
              />
              <Stat
                icon={FileCheck2}
                tone="purple"
                value={open.length.toLocaleString('en-KE')}
                label="Open Orders"
                note={kes(sum(open))}
                href="/company/procurement?tab=orders"
              />
              <Stat
                icon={Wallet}
                value={kes(sum(inPeriod))}
                label="Ordered This Period"
                note={`${inPeriod.length} ${inPeriod.length === 1 ? 'order' : 'orders'}`}
              />
            </StatGrid>

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_24rem]">
              <Sheet>
                {table(
                  vendors.filter((v) => v.status !== 'archived'),
                  'Vendors',
                  true,
                )}
              </Sheet>
              <div className="grid min-w-0 content-start gap-5 lg:grid-cols-2 2xl:grid-cols-1">
                <Sheet>
                  <PanelHead title="Most Ordered From" aside={formatRange(period)} />
                  {top.length === 0 ? (
                    <p className="text-muted-light py-6 text-center text-sm">
                      No orders in this period.
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-3.5">
                      {top.map(([id, cents]) => (
                        <li key={id}>
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="truncate font-bold">{nameOf(id)}</span>
                            <span className="font-extrabold tabular-nums">{kes(cents)}</span>
                          </div>
                          <div className="bg-border/70 mt-1.5 h-2 overflow-hidden rounded-full">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#F0B90B] to-[#FDD128]"
                              style={{ width: `${topMax ? (cents / topMax) * 100 : 0}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Sheet>
                <Sheet>
                  <PanelHead title="Supply Gaps" />
                  {missing.length === 0 ? (
                    <p className="text-muted-light py-4 text-sm">
                      Every kind of supply has an active vendor.
                    </p>
                  ) : (
                    <>
                      <p className="text-muted mt-2 text-sm">
                        No active vendor supplies these yet:
                      </p>
                      <ul className="mt-3 flex flex-wrap gap-1.5">
                        {missing.map((c) => (
                          <li
                            key={c}
                            className="bg-bg text-muted rounded-full px-2.5 py-1 text-xs font-bold"
                          >
                            {VENDOR_CATEGORIES[c]}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </Sheet>
              </div>
            </div>
          </>
        ) : (
          <Sheet>
            {table(
              vendors.filter((v) => v.status === tab),
              TABS.find((t) => t.key === tab)!.label === 'Active'
                ? 'Active Vendors'
                : `${TABS.find((t) => t.key === tab)!.label} Vendors`,
            )}
          </Sheet>
        )}
      </main>
    </ConsoleShell>
  );
}
