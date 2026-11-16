import { CircleAlert, Laptop, LayoutGrid, Layers, PowerOff, Wallet, Warehouse } from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
import { RangeControl } from '@/components/company/client-kit';
import { ActivityFeed, type ActivityRow } from '@/components/company/feeds';
import type { Option, StockRow } from '@/components/company/inventory';
import {
  CompanyHeader,
  CompanyTabs,
  PanelHead,
  Sheet,
  Stat,
  StatGrid,
} from '@/components/company/kit';
import {
  AddLocation,
  LocationsBoard,
  type LocationAsset,
  type LocationRow,
} from '@/components/company/warehouses';
import { ConsoleShell } from '@/components/console-shell';
import {
  companyAccess,
  hrefWith,
  kes,
  kesShort,
  periodBounds,
  periodFrom,
  periodQuery,
} from '@/lib/company';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Warehouses & stores' };
export const dynamic = 'force-dynamic';

type Tab = 'overview' | 'closed';

/**
 * Company → Warehouses & stores: where NexG keeps its stock and equipment,
 * what each place holds and what it is worth.
 */
export default async function WarehousesPage({
  searchParams,
}: {
  searchParams?: { tab?: string; from?: string; to?: string };
}) {
  const staff = await requireStaff();
  const mod = requireModule(staff, 'company');
  const { canWrite } = companyAccess(mod.level, staff.isSuperAdmin);
  const tab: Tab = searchParams?.tab === 'closed' ? 'closed' : 'overview';
  const period = periodFrom(searchParams);
  const pq = periodQuery(period);
  const { start, end } = periodBounds(period);
  const supabase = createClient();

  const [locationsRes, stockRes, assetsRes, peopleRes, citiesRes, activityRes] = await Promise.all([
    supabase
      .from('company_location')
      .select(
        '*, city:city(name), manager:staff_user!company_location_manager_id_fkey(display_name, email)',
      )
      .order('name'),
    supabase.from('company_stock_v').select('*').limit(5000),
    supabase
      .from('company_asset')
      .select('id, tag, name, status, location_id, category:company_category(name, icon)')
      .limit(5000),
    supabase.rpc('rpc_company_people'),
    supabase.from('city').select('id, name').order('name'),
    supabase
      .from('company_activity_v')
      .select('*')
      .eq('source', 'stock')
      .gte('at', start)
      .lt('at', end)
      .order('at', { ascending: false })
      .limit(8),
  ]);

  const locations = (locationsRes.data ?? []) as unknown as LocationRow[];
  const stock = ((stockRes.data ?? []) as StockRow[]).map((r) => ({
    ...r,
    quantity: Number(r.quantity),
    value_cents: Number(r.value_cents),
  }));
  const assets = (assetsRes.data ?? []) as unknown as LocationAsset[];
  const people = ((peopleRes.data ?? []) as { id: string; display_name: string }[]).map((p) => ({
    id: p.id,
    name: p.display_name,
  }));
  const cities = (citiesRes.data ?? []) as Option[];
  const failed = locationsRes.error || stockRes.error;

  const open = locations.filter((l) => l.active);
  const closed = locations.filter((l) => !l.active);
  const value = stock.reduce((s, r) => s + r.value_cents, 0);
  const attention = stock.filter((r) => r.status !== 'in_stock').length;
  const held = assets.filter(
    (a) => a.location_id && a.status !== 'retired' && a.status !== 'lost',
  ).length;
  const byLocation = open
    .map((l) => ({
      key: l.id,
      label: l.name,
      value: Math.round(
        stock.filter((s) => s.location_id === l.id).reduce((t, s) => t + s.value_cents, 0) / 100,
      ),
    }))
    .filter((l) => l.value > 0)
    .sort((a, b) => b.value - a.value);
  const href = (t: string) =>
    hrefWith('/company/warehouses', {
      tab: t === 'overview' ? null : t,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  return (
    <ConsoleShell staff={staff}>
      <CompanyHeader
        icon={Warehouse}
        title="Warehouses & stores"
        subtitle="Every office, warehouse, store and rider hub where NexG keeps stock and equipment, and what each one holds."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} />
            {canWrite && <AddLocation people={people} cities={cities} />}
          </>
        }
      />

      <main className="space-y-5 px-3 py-5 sm:px-6 sm:py-6">
        <CompanyTabs
          active={tab}
          tabs={[
            {
              key: 'overview',
              label: 'Locations',
              icon: LayoutGrid,
              href: href('overview'),
              count: open.length,
            },
            {
              key: 'stock',
              label: 'Stock by location',
              icon: Layers,
              href: `/company/inventory?tab=items`,
            },
            {
              key: 'closed',
              label: 'Closed',
              icon: PowerOff,
              href: href('closed'),
              count: closed.length,
            },
          ]}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Locations could not be loaded in full: {failed.message}
          </p>
        )}

        {tab === 'overview' ? (
          <>
            <StatGrid>
              <Stat
                icon={Warehouse}
                value={open.length.toLocaleString('en-KE')}
                label="Open locations"
                note={closed.length ? `${closed.length} closed` : undefined}
              />
              <Stat
                icon={Wallet}
                value={kes(value)}
                label="Stock value"
                note="At today's unit costs"
              />
              <Stat
                icon={Layers}
                tone="blue"
                value={stock.length.toLocaleString('en-KE')}
                label="Stock lines"
                href="/company/inventory?tab=items"
              />
              <Stat
                icon={CircleAlert}
                tone="red"
                value={attention.toLocaleString('en-KE')}
                label="Need reordering"
                href="/company/inventory?tab=reorder"
              />
              <Stat
                icon={Laptop}
                tone="purple"
                value={held.toLocaleString('en-KE')}
                label="Equipment held"
                href="/company/assets"
              />
            </StatGrid>

            <Sheet>
              <LocationsBoard
                locations={open}
                stock={stock}
                assets={assets}
                people={people}
                cities={cities}
                canWrite={canWrite}
                title="Open locations"
              />
            </Sheet>

            <div className="grid gap-5 lg:grid-cols-2">
              <Sheet>
                <PanelHead title="Stock value by location" />
                <div className="mt-4">
                  {byLocation.length ? (
                    <ShareDonut
                      data={byLocation}
                      unit="kes"
                      centre={kesShort(value)}
                      caption="Stock value"
                    />
                  ) : (
                    <p className="text-muted-light py-10 text-center text-sm">
                      No stock with a value yet.
                    </p>
                  )}
                </div>
              </Sheet>
              <Sheet>
                <PanelHead title="Stock movements" aside="this period" />
                <div className="mt-4">
                  <ActivityFeed
                    rows={(activityRes.data ?? []) as ActivityRow[]}
                    empty="No stock moved in this period."
                  />
                </div>
              </Sheet>
            </div>
          </>
        ) : (
          <Sheet>
            <LocationsBoard
              locations={closed}
              stock={stock}
              assets={assets}
              people={people}
              cities={cities}
              canWrite={canWrite}
              title="Closed locations"
            />
          </Sheet>
        )}
      </main>
    </ConsoleShell>
  );
}
