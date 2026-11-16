import {
  Archive,
  CalendarClock,
  CircleCheck,
  Hand,
  Laptop,
  LayoutGrid,
  ListChecks,
  Wallet,
  Wrench,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
import { AssetsTable, RegisterAsset, type AssetRow } from '@/components/company/assets';
import { RangeControl } from '@/components/portal/client-kit';
import { ActivityFeed, type ActivityRow } from '@/components/company/feeds';
import type { CategoryRow, Option } from '@/components/company/inventory';
import {
  PageHeader,
  ViewTabs,
  PanelHead,
  Person,
  Pill,
  Sheet,
  Stat,
  StatGrid,
} from '@/components/portal/kit';
import { ConsoleShell } from '@/components/console-shell';
import {
  companyAccess,
  day,
  daysUntil,
  hrefWith,
  kes,
  periodBounds,
  periodFrom,
  periodQuery,
} from '@/lib/company';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Assets & equipment' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid },
  { key: 'all', label: 'All equipment', icon: ListChecks },
  { key: 'in_use', label: 'Assigned', icon: Hand },
  { key: 'available', label: 'Available', icon: CircleCheck },
  { key: 'maintenance', label: 'Maintenance', icon: Wrench },
  { key: 'retired', label: 'Retired & lost', icon: Archive },
] as const;

type Tab = (typeof TABS)[number]['key'];

const ASSET_COLUMNS =
  '*, category:company_category(name, icon), location:company_location(name), holder:staff_user!company_asset_assigned_to_fkey(display_name, email), vendor:company_vendor(name)';

/**
 * Company → Assets & equipment: NexG's serial-numbered equipment, who holds
 * each piece, its condition and its servicing. Counts come from
 * company_asset; the history from company_asset_event.
 */
export default async function CompanyAssetsPage({
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

  const [assetsRes, categoriesRes, locationsRes, vendorsRes, peopleRes, activityRes] =
    await Promise.all([
      supabase.from('company_asset').select(ASSET_COLUMNS).order('name').limit(2000),
      supabase.from('company_category').select('id, name, icon').order('name'),
      supabase.from('company_location').select('id, name').eq('active', true).order('name'),
      supabase.from('company_vendor').select('id, name').neq('status', 'archived').order('name'),
      supabase.rpc('rpc_company_people'),
      supabase
        .from('company_activity_v')
        .select('*')
        .eq('source', 'asset')
        .gte('at', start)
        .lt('at', end)
        .order('at', { ascending: false })
        .limit(8),
    ]);

  const assets = (assetsRes.data ?? []) as unknown as AssetRow[];
  const failed = assetsRes.error || activityRes.error;
  const live = assets.filter((a) => a.status !== 'retired' && a.status !== 'lost');
  const count = (s: string) => assets.filter((a) => a.status === s).length;
  const dueSoon = live
    .filter((a) => a.next_service_on && daysUntil(a.next_service_on) <= 30)
    .sort((a, b) => (a.next_service_on! < b.next_service_on! ? -1 : 1));
  const value = live.reduce((s, a) => s + (a.purchase_cost_cents ?? 0), 0);

  const paths = [...new Set(assets.map((a) => a.photo_path).filter(Boolean) as string[])];
  const signed = paths.length
    ? ((await supabase.storage.from('company-photos').createSignedUrls(paths, 3600)).data ?? [])
    : [];
  const byPath = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const photos: Record<string, string> = {};
  for (const a of assets) {
    const url = a.photo_path ? byPath.get(a.photo_path) : null;
    if (url) photos[a.id] = url;
  }

  const people = ((peopleRes.data ?? []) as { id: string; display_name: string }[]).map((p) => ({
    id: p.id,
    name: p.display_name,
  }));
  const categories = (categoriesRes.data ?? []) as CategoryRow[];
  const locations = (locationsRes.data ?? []) as Option[];
  const vendors = (vendorsRes.data ?? []) as Option[];
  const href = (t: string) =>
    hrefWith('/company/assets', {
      tab: t === 'overview' ? null : t,
      ...(pq ? { from: period.from, to: period.to } : {}),
    });

  const rowsFor: Record<Tab, AssetRow[]> = {
    overview: live,
    all: live,
    in_use: assets.filter((a) => a.status === 'in_use'),
    available: assets.filter((a) => a.status === 'available'),
    maintenance: assets.filter((a) => a.status === 'maintenance'),
    retired: assets.filter((a) => a.status === 'retired' || a.status === 'lost'),
  };

  const table = (rows: AssetRow[], title: string, compact = false) => (
    <AssetsTable
      key={tab}
      rows={rows}
      photos={photos}
      people={people}
      categories={categories}
      locations={locations}
      vendors={vendors}
      canWrite={canWrite}
      title={title}
      compact={compact}
    />
  );

  return (
    <ConsoleShell staff={staff}>
      <PageHeader
        icon={Laptop}
        title="Assets & equipment"
        subtitle="Who holds each laptop, phone, motorbike and machine, what condition it is in, and when it is serviced."
        actions={
          <>
            <RangeControl from={period.from} to={period.to} />
            {canWrite && (
              <RegisterAsset categories={categories} locations={locations} vendors={vendors} />
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
            href: href(t.key),
            count: t.key === 'overview' ? null : rowsFor[t.key].length,
          }))}
        />

        {failed && (
          <p
            role="alert"
            className="bg-danger-bg text-danger rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Some equipment could not be loaded: {failed.message}
          </p>
        )}

        {tab === 'overview' ? (
          <>
            <StatGrid>
              <Stat
                icon={Laptop}
                value={live.length.toLocaleString('en-KE')}
                label="Equipment in service"
                href={href('all')}
              />
              <Stat
                icon={Hand}
                tone="blue"
                value={count('in_use').toLocaleString('en-KE')}
                label="Assigned"
                href={href('in_use')}
              />
              <Stat
                icon={CircleCheck}
                tone="green"
                value={count('available').toLocaleString('en-KE')}
                label="Available"
                href={href('available')}
              />
              <Stat
                icon={Wrench}
                tone="amber"
                value={count('maintenance').toLocaleString('en-KE')}
                label="Under maintenance"
                href={href('maintenance')}
              />
              <Stat
                icon={CalendarClock}
                tone="red"
                value={dueSoon.length.toLocaleString('en-KE')}
                label="Service due in 30 days"
                note={
                  dueSoon.some((a) => daysUntil(a.next_service_on!) < 0)
                    ? 'Some overdue'
                    : undefined
                }
                noteTone="bad"
              />
              <Stat
                icon={Wallet}
                value={kes(value)}
                label="Bought for"
                note="Equipment in service"
              />
            </StatGrid>

            <div className="grid gap-5 xl:grid-cols-3">
              <Sheet>
                <PanelHead title="Where the equipment is" />
                <div className="mt-4">
                  {live.length ? (
                    <ShareDonut
                      stacked
                      centre={live.length.toLocaleString('en-KE')}
                      caption="In service"
                      data={[
                        {
                          key: 'in_use',
                          label: 'Assigned',
                          value: count('in_use'),
                          color: '#141414',
                        },
                        {
                          key: 'available',
                          label: 'Available',
                          value: count('available'),
                          color: '#1F9D55',
                        },
                        {
                          key: 'maintenance',
                          label: 'Under maintenance',
                          value: count('maintenance'),
                          color: '#F5B800',
                        },
                      ]}
                    />
                  ) : (
                    <p className="text-muted-light py-6 text-center text-sm">
                      No equipment registered yet.
                    </p>
                  )}
                </div>
              </Sheet>
              <Sheet>
                <PanelHead title="Service due" aside="next 30 days" />
                {dueSoon.length === 0 ? (
                  <p className="text-muted-light py-6 text-center text-sm">
                    Nothing due for service in the next 30 days.
                  </p>
                ) : (
                  <ul className="divide-border mt-3 divide-y">
                    {dueSoon.slice(0, 6).map((a) => {
                      const d = daysUntil(a.next_service_on!);
                      return (
                        <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-bold">{a.name}</span>
                            <span className="text-muted-light block text-xs">
                              {a.tag} · {day(a.next_service_on)}
                            </span>
                          </span>
                          <Pill tone={d < 0 ? 'red' : d <= 7 ? 'amber' : 'grey'}>
                            {d < 0 ? `${-d}d overdue` : d === 0 ? 'Today' : `In ${d}d`}
                          </Pill>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Sheet>
              <Sheet>
                <PanelHead title="Recent equipment activity" />
                <div className="mt-4">
                  <ActivityFeed
                    rows={(activityRes.data ?? []) as ActivityRow[]}
                    empty="No equipment activity in this period."
                  />
                </div>
              </Sheet>
            </div>

            <Sheet>{table(live, 'Equipment in service', true)}</Sheet>

            {count('in_use') > 0 && (
              <Sheet>
                <PanelHead title="Who holds what" />
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {Object.entries(
                    rowsFor.in_use.reduce<Record<string, AssetRow[]>>((m, a) => {
                      const k = a.holder?.display_name ?? a.holder?.email ?? a.assignee_name ?? '—';
                      (m[k] ??= []).push(a);
                      return m;
                    }, {}),
                  )
                    .sort((a, b) => b[1].length - a[1].length)
                    .slice(0, 8)
                    .map(([holder, list]) => (
                      <li key={holder} className="border-border rounded-2xl border p-3.5">
                        <Person
                          name={holder}
                          sub={`${list.length} ${list.length === 1 ? 'item' : 'items'}`}
                          size="md"
                        />
                        <p className="text-muted mt-2 truncate text-xs">
                          {list.map((a) => a.name).join(', ')}
                        </p>
                      </li>
                    ))}
                </ul>
              </Sheet>
            )}
          </>
        ) : (
          <Sheet>
            {table(
              rowsFor[tab],
              tab === 'all'
                ? 'All equipment in service'
                : (TABS.find((t) => t.key === tab)?.label ?? ''),
            )}
          </Sheet>
        )}
      </main>
    </ConsoleShell>
  );
}
