import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import {
  Chip,
  mondayOf,
  type Badges,
  type InventoryRow,
  type PerformanceRow,
  type RequestRow,
  type ScheduleRow,
} from '@/components/featured/shared';
import {
  InventoryTab,
  PerformanceTab,
  RequestsTab,
  RulesTab,
  ScheduleTab,
  type RateCardRow,
  type RuleRow,
} from '@/components/featured/tabs';
import { type OpenSlot } from '@/components/featured/place-merchant';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Featured slots' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'inventory', label: 'Inventory' },
  { key: 'requests', label: 'Requests & waitlist' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'performance', label: 'Performance & billing' },
  { key: 'rules', label: 'Rules' },
] as const;

/**
 * Grow → Featured slots.
 *
 * NexG's only paid placement. Everything on this screen exists to keep
 * two promises: a guest can always tell a paid card from an earned
 * one, and a merchant cannot buy their way past the quality checks.
 *
 * The city switcher is real rather than decorative — inventory, rate
 * cards and the schedule are all per city, and a city with no rate
 * card cannot be sold at all.
 */
export default async function FeaturedPage({
  searchParams,
}: {
  searchParams?: {
    tab?: string;
    filter?: string;
    selected?: string;
    city?: string;
    week?: string;
  };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'featured');
  const supabase = createClient();

  const tab = TABS.some((t) => t.key === searchParams?.tab) ? searchParams!.tab! : 'inventory';
  const filter = searchParams?.filter ?? (tab === 'requests' ? 'action' : 'all');
  const selected = searchParams?.selected ?? null;
  const week = searchParams?.week ?? mondayOf(new Date());

  const [{ data: cities }, { data: badgesRaw }] = await Promise.all([
    supabase.from('city').select('id, name, slug, status').order('sort'),
    supabase.rpc('rpc_featured_counts', {}),
  ]);

  const cityRows = (cities as { id: string; name: string; slug: string; status: string }[] | null) ?? [];
  const live = cityRows.filter((c) => c.status === 'live');
  const city = live.find((c) => c.slug === searchParams?.city) ?? live[0];
  const badges = (badgesRaw as Badges | null) ?? ({} as Badges);

  /* Requests feed three tabs, so they are loaded once. */
  const { data: requests } = await supabase
    .from('console_featured_requests_v')
    .select('*')
    .order('requested_at', { ascending: false });

  const allRequests = (requests as RequestRow[] | null) ?? [];

  return (
    <ConsoleShell staff={staff} current="/featured">
      <ConsoleHeader
        title="Featured slots"
        breadcrumb="Paid placement on the homepage, category top and Popular Requests · always labelled Sponsored · billed weekly"
      />

      <main className="px-4 py-6 sm:px-8">
        <nav
          className="border-border -mx-4 flex gap-6 overflow-x-auto border-b px-4 sm:-mx-8 sm:px-8"
          aria-label="Featured slots sections"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/featured?tab=${t.key}${city ? `&city=${city.slug}` : ''}`}
              className={`-mb-px shrink-0 border-b-2 pb-3 text-sm font-bold transition-colors ${
                tab === t.key
                  ? 'border-gold text-ink'
                  : 'text-muted hover:text-ink border-transparent'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/*
         * Cities that are not live are shown and disabled rather than
         * hidden — "Kampala · not open" is a fact somebody needs,
         * and an absent chip looks like an oversight.
         */}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {cityRows.map((c) => (
            <Chip
              key={c.id}
              on={city?.id === c.id}
              href={`/featured?tab=${tab}&city=${c.slug}`}
              disabled={c.status !== 'live'}
            >
              {c.name}
              {c.status !== 'live' && ' · not open'}
            </Chip>
          ))}
        </div>

        {!city ? (
          <Card className="mt-6 p-6">
            <p className="text-[0.9375rem] font-extrabold">No city is live yet.</p>
            <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
              Featured slots exist per city. A slot in a city NexG does not deliver to is
              something a merchant could be sold.
            </p>
          </Card>
        ) : (
          <>
            {tab === 'inventory' &&
              (await loadInventory(supabase, city, week, selected, badges, allRequests))}
            {tab === 'requests' && (
              <RequestsTab
                requests={allRequests.filter((r) => r.city_id === city.id)}
                badges={badges}
                filter={filter}
                selected={selected}
              />
            )}
            {tab === 'schedule' && (await loadSchedule(supabase, city))}
            {tab === 'performance' && (await loadPerformance(supabase, city, badges))}
            {tab === 'rules' && (await loadRules(supabase))}
          </>
        )}
      </main>
    </ConsoleShell>
  );
}

type Supabase = ReturnType<typeof createClient>;
type City = { id: string; name: string; slug: string };

async function loadInventory(
  supabase: Supabase,
  city: City,
  week: string,
  selected: string | null,
  badges: Badges,
  requests: RequestRow[],
) {
  const [{ data }, { data: slots }, { data: merchants }] = await Promise.all([
    supabase
      .from('console_featured_inventory_v')
      .select('*')
      .eq('city_id', city.id)
      .eq('week_start', week)
      .order('kind')
      .order('position'),
    /* Eight weeks ahead, so a slot can be sold forward on the call
       rather than only for the week somebody happens to be looking
       at. */
    supabase
      .from('featured_open_slot_v')
      .select('*')
      .eq('city_id', city.id)
      .order('week_start')
      .order('kind')
      .order('position'),
    supabase
      .from('merchant')
      .select('id, trading_name, legal_name, category, featured, city_id')
      .eq('status', 'live')
      .eq('city_id', city.id)
      .order('trading_name')
      .limit(300),
  ]);

  const merchantOptions = (
    (merchants as
      | {
          id: string;
          trading_name: string | null;
          legal_name: string | null;
          category: string | null;
          featured: boolean;
        }[]
      | null) ?? []
  ).map((m) => ({
    id: m.id,
    name: m.trading_name ?? m.legal_name ?? '[—]',
    category: m.category,
    city_name: city.name,
    featured_now: m.featured,
  }));

  return (
    <InventoryTab
      rows={(data as InventoryRow[] | null) ?? []}
      openSlots={(slots as OpenSlot[] | null) ?? []}
      merchants={merchantOptions}
      badges={badges}
      week={week}
      selected={selected}
      cityName={city.name}
      requests={requests.filter((r) => r.city_id === city.id)}
    />
  );
}

async function loadSchedule(supabase: Supabase, city: City) {
  /* Six weeks, starting two back, so "now" has context either side. */
  const start = new Date();
  start.setDate(start.getDate() - 14);
  const first = mondayOf(start);

  const weeks: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const d = new Date(first);
    d.setDate(d.getDate() + i * 7);
    weeks.push(mondayOf(d));
  }

  const { data } = await supabase
    .from('console_featured_schedule_v')
    .select('*')
    .eq('city_id', city.id)
    .gte('week_start', weeks[0]!)
    .lte('week_start', weeks[weeks.length - 1]!);

  return <ScheduleTab rows={(data as ScheduleRow[] | null) ?? []} weeks={weeks} />;
}

async function loadPerformance(supabase: Supabase, city: City, badges: Badges) {
  const { data } = await supabase
    .from('console_featured_performance_v')
    .select('*')
    .eq('city_id', city.id)
    .order('week_start', { ascending: false, nullsFirst: false });

  return <PerformanceTab rows={(data as PerformanceRow[] | null) ?? []} badges={badges} />;
}

async function loadRules(supabase: Supabase) {
  const [{ data: rules }, { data: cards }, { data: placements }] = await Promise.all([
    supabase.from('featured_rule').select('key, value, label, updated_at').order('key'),
    supabase
      .from('featured_rate_card')
      .select('*, city:city_id(name)')
      .order('effective_from', { ascending: false }),
    supabase.from('featured_placement').select('kind, city:city_id(name)'),
  ]);

  const cardRows = (
    (cards as (RateCardRow & { city: { name: string } | null })[] | null) ?? []
  ).map((c) => ({ ...c, city_name: c.city?.name ?? null }));

  /* Counted here rather than in SQL: it is three numbers per city and
     the alternative is another view for a table nobody filters. */
  const counts = new Map<string, { city_name: string | null; kind: string; n: number }>();
  for (const p of (placements as { kind: string; city: { name: string } | null }[] | null) ?? []) {
    const key = `${p.city?.name}-${p.kind}`;
    const seen = counts.get(key);
    if (seen) seen.n += 1;
    else counts.set(key, { city_name: p.city?.name ?? null, kind: p.kind, n: 1 });
  }

  return (
    <RulesTab
      rules={(rules as RuleRow[] | null) ?? []}
      cards={cardRows}
      placementCounts={[...counts.values()].sort(
        (a, b) =>
          (a.city_name ?? '').localeCompare(b.city_name ?? '') || a.kind.localeCompare(b.kind),
      )}
    />
  );
}
