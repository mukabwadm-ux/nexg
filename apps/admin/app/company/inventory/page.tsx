import { formatRange } from '@nexg/ui';
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  Boxes,
  CircleAlert,
  CircleCheck,
  Layers,
  LayoutGrid,
  Laptop,
  Package,
  Truck,
  Warehouse,
  Wrench,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
import { RangeControl } from '@/components/portal/client-kit';
import { ActivityFeed, type ActivityRow } from '@/components/company/feeds';
import {
  AddItem,
  InventoryTable,
  type CategoryRow,
  type Option,
  type StockRow,
} from '@/components/company/inventory';
import { InventoryReports, MovementsTable } from '@/components/company/inventory-views';
import { PageHeader, ViewTabs, PanelHead, Sheet, Stat, StatGrid } from '@/components/portal/kit';
import { ConsoleShell } from '@/components/console-shell';
import {
  change,
  companyAccess,
  hrefWith,
  kes,
  periodBounds,
  periodFrom,
  periodQuery,
} from '@/lib/company';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Company Inventory' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'items', label: 'Inventory', icon: Package },
  { key: 'assets', label: 'Assets & Equipment', icon: Laptop, href: '/company/assets' },
  { key: 'movements', label: 'Stock Movements', icon: ArrowLeftRight },
  { key: 'reorder', label: 'Reorder & Alerts', icon: Bell },
  { key: 'suppliers', label: 'Suppliers', icon: Truck, href: '/company/vendors' },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
] as const;

type Tab = 'overview' | 'items' | 'movements' | 'reorder' | 'reports';

interface Summary {
  stock_lines: number;
  in_stock: number;
  low_stock: number;
  out_of_stock: number;
  stock_value_cents: number;
  assets: number;
  maintenance: number;
  active_assets: number;
  asset_value_cents: number;
  locations: number;
  categories: number;
  total_before: number;
  movements: number;
}

/**
 * Company → Company inventory: what NexG keeps on its own shelves.
 *
 * A row is a stock line, an item at a location. The KPIs and the stock
 * status ring add equipment that is in service, so "Total items" is
 * everything NexG holds; every count comes from rpc_company_inventory_summary.
 */
export default async function CompanyInventoryPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string; status?: string };
}) {
  const staff = await requireStaff();
  const mod = requireModule(staff, 'company');
  const { canWrite } = companyAccess(mod.level, staff.isSuperAdmin);
  const tab: Tab = (['overview', 'items', 'movements', 'reorder', 'reports'] as const).includes(
    searchParams?.tab as Tab,
  )
    ? (searchParams!.tab as Tab)
    : 'overview';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const { start, end } = periodBounds(period);
  const supabase = createClient();

  const activity = supabase
    .from('company_activity_v')
    .select('*')
    .order('at', { ascending: false });

  const [summaryRes, stockRes, categoriesRes, locationsRes, vendorsRes, activityRes] =
    await Promise.all([
      supabase.rpc('rpc_company_inventory_summary', { p_from: period.from }),
      supabase.from('company_stock_v').select('*').order('name').limit(2000),
      supabase.from('company_category').select('id, name, icon').order('name'),
      supabase.from('company_location').select('id, name').eq('active', true).order('name'),
      supabase.from('company_vendor').select('id, name').eq('status', 'active').order('name'),
      tab === 'overview'
        ? activity.limit(6)
        : tab === 'movements'
          ? activity.gte('at', start).lt('at', end).limit(500)
          : Promise.resolve({ data: [] as ActivityRow[], error: null }),
    ]);

  const summary = (summaryRes.data as Summary | null) ?? null;
  const stock = ((stockRes.data ?? []) as StockRow[]).map((r) => ({
    ...r,
    quantity: Number(r.quantity),
    reorder_level: Number(r.reorder_level),
    value_cents: Number(r.value_cents),
  }));
  const categories = (categoriesRes.data ?? []) as CategoryRow[];
  const locations = (locationsRes.data ?? []) as Option[];
  const vendors = (vendorsRes.data ?? []) as Option[];
  const failed = summaryRes.error || stockRes.error || activityRes.error;

  const paths = [...new Set(stock.map((r) => r.photo_path).filter(Boolean) as string[])];
  const signed = paths.length
    ? ((await supabase.storage.from('company-photos').createSignedUrls(paths, 3600)).data ?? [])
    : [];
  const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const photos: Record<string, string> = {};
  for (const r of stock) {
    const url = r.photo_path ? byPath.get(r.photo_path) : null;
    if (url) photos[r.item_id] = url;
  }

  const total = summary ? summary.stock_lines + summary.assets : null;
  const grew = summary && total != null ? change(total, summary.total_before) : null;
  const attention = summary ? summary.low_stock + summary.out_of_stock : 0;
  const href = (t: string, extra: Record<string, string> = {}) =>
    hrefWith('/company/inventory', {
      tab: t === 'overview' ? null : t,
      ...extra,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  const ring = summary
    ? [
        { key: 'in', label: 'In Stock', value: summary.in_stock, color: '#1F9D55' },
        { key: 'low', label: 'Low Stock', value: summary.low_stock, color: '#F5B800' },
        { key: 'out', label: 'Out of Stock', value: summary.out_of_stock, color: '#D4372C' },
        { key: 'maint', label: 'Under Maintenance', value: summary.maintenance, color: '#9A958B' },
        {
          key: 'active',
          label: 'Equipment in Service',
          value: summary.active_assets,
          color: '#141414',
        },
      ]
    : [];

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={Boxes}
        title="Company Inventory"
        subtitle="Track assets, equipment, supplies and company resources across all locations."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} />
            {canWrite && (
              <AddItem categories={categories} locations={locations} vendors={vendors} />
            )}
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
            href: 'href' in t ? t.href : href(t.key),
            alert: t.key === 'reorder' ? attention : null,
          }))}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Some of the inventory could not be loaded: {failed.message}
          </p>
        )}

        {tab === 'overview' && (
          <>
            <StatGrid>
              <Stat
                icon={Package}
                value={total == null ? null : total.toLocaleString('en-KE')}
                label="Total Items"
                delta={grew ? { value: grew } : null}
                note={
                  !summary
                    ? undefined
                    : grew === 0
                      ? 'No change this period'
                      : 'Stock lines and equipment'
                }
                href={href('items')}
              />
              <Stat
                icon={Warehouse}
                value={summary ? summary.locations.toLocaleString('en-KE') : null}
                label="Locations"
                href="/company/warehouses"
              />
              <Stat
                icon={Layers}
                value={summary ? summary.categories.toLocaleString('en-KE') : null}
                label="Categories"
                note="With something in them"
              />
              <Stat
                icon={CircleCheck}
                tone="green"
                value={summary ? summary.in_stock.toLocaleString('en-KE') : null}
                label="In Stock"
                href={href('items', { status: 'in_stock' })}
              />
              <Stat
                icon={CircleAlert}
                tone="red"
                value={summary ? summary.low_stock.toLocaleString('en-KE') : null}
                label="Low Stock"
                note={summary?.out_of_stock ? `${summary.out_of_stock} out of stock` : undefined}
                noteTone="bad"
                href={href('reorder')}
              />
              <Stat
                icon={Wrench}
                tone="amber"
                value={summary ? summary.maintenance.toLocaleString('en-KE') : null}
                label="Under Maintenance"
                href="/company/assets?tab=maintenance"
              />
            </StatGrid>

            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_16rem]">
              <Sheet>
                <InventoryTable
                  rows={stock}
                  photos={photos}
                  categories={categories}
                  locations={locations}
                  vendors={vendors}
                  canWrite={canWrite}
                  title="Inventory Items"
                  compact
                />
              </Sheet>
              <div className="grid min-w-0 content-start gap-5 lg:grid-cols-2 2xl:grid-cols-1">
                <Sheet>
                  <PanelHead title="Stock Status" />
                  <div className="mt-4">
                    {total ? (
                      <ShareDonut
                        data={ring}
                        centre={total.toLocaleString('en-KE')}
                        caption="Total Items"
                        stacked
                      />
                    ) : (
                      <p className="text-muted-light py-6 text-center text-sm">
                        Nothing recorded yet. Add items and register equipment to see their status
                        here.
                      </p>
                    )}
                  </div>
                </Sheet>
                <Sheet>
                  <PanelHead title="Recent Stock Movements">
                    <a
                      href={href('movements')}
                      className="text-gold-text text-[0.8125rem] font-bold underline-offset-4 hover:underline"
                    >
                      View All →
                    </a>
                  </PanelHead>
                  <div className="mt-4">
                    <ActivityFeed
                      rows={(activityRes.data ?? []) as ActivityRow[]}
                      empty="No stock has moved yet."
                    />
                  </div>
                </Sheet>
              </div>
            </div>
          </>
        )}

        {tab === 'items' && (
          <Sheet>
            <InventoryTable
              rows={stock}
              photos={photos}
              categories={categories}
              locations={locations}
              vendors={vendors}
              canWrite={canWrite}
              title="Inventory"
              initialStatus={searchParams?.status ?? 'all'}
            />
          </Sheet>
        )}

        {tab === 'movements' && (
          <Sheet>
            <MovementsTable
              rows={(activityRes.data ?? []) as ActivityRow[]}
              period={formatRange(period)}
            />
          </Sheet>
        )}

        {tab === 'reorder' && (
          <Sheet>
            <InventoryTable
              rows={stock.filter((r) => r.status !== 'in_stock')}
              photos={photos}
              categories={categories}
              locations={locations}
              vendors={vendors}
              canWrite={canWrite}
              title="Needs Reordering"
              reorder
            />
          </Sheet>
        )}

        {tab === 'reports' && (
          <InventoryReports
            stock={stock}
            stockValue={summary ? kes(summary.stock_value_cents) : '—'}
            assetValue={summary ? kes(summary.asset_value_cents) : '—'}
          />
        )}
      </main>
    </ConsoleShell>
  );
}
