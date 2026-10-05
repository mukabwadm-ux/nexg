import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { MapArea, type RiderPin } from '@/components/live/map-area';
import { Chip, DASH, num } from '@/components/live/shared';
import { Workbench, type CascadeRow, type Candidate, type LiveOrder, type Rules } from '@/components/live/workbench';
import { Zones, type ZoneRow } from '@/components/live/zones';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Live operations' };
export const dynamic = 'force-dynamic';

const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'needs', label: 'Needs attention' },
  { key: 'unassigned', label: 'Finding a rider' },
  { key: 'late', label: 'Late' },
] as const;

/**
 * Operate → Live operations.
 *
 * The screen's job is to explain why the cascade could not place an
 * order and what to do now. Everything on it is a row somebody can
 * read — who was asked, how far away, what they said, and why
 * anyone eligible was skipped. None of it is inferred in the
 * browser, because then the explanation and the decision could
 * disagree.
 *
 * It selects the oldest order needing a person by default, which is
 * almost always the one to work on, and leaves the choice visible
 * rather than hiding the rest.
 */
export default async function LivePage({
  searchParams,
}: {
  searchParams?: { city?: string; chip?: string; selected?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'live_ops');
  const supabase = createClient();

  const chip = CHIPS.some((c) => c.key === searchParams?.chip) ? searchParams!.chip! : 'needs';

  const { data: cities } = await supabase
    .from('city')
    .select('id, name, slug, status')
    .order('sort');
  const cityRows = (cities as { id: string; name: string; slug: string; status: string }[] | null) ?? [];
  const live = cityRows.filter((c) => c.status === 'live');
  const city = live.find((c) => c.slug === searchParams?.city) ?? live[0];

  if (!city) {
    return (
      <ConsoleShell staff={staff} current="/live">
        <ConsoleHeader title="Live operations" breadcrumb="Dispatch, the cascade, and the city now" />
        <main className="px-4 py-6 sm:px-8">
          <Card className="p-6">
            <p className="text-[0.9375rem] font-extrabold">No city is live yet.</p>
            <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
              There is nothing to dispatch until a city opens.
            </p>
          </Card>
        </main>
      </ConsoleShell>
    );
  }

  /*
   * Every read is checked. An empty result from PostgREST is
   * indistinguishable from a quiet night, and this screen is the
   * one where that lie costs the most — three separate bugs in this
   * project have had exactly that shape.
   */
  const [ordersQ, zonesQ, rulesQ, ridersQ] = await Promise.all([
    supabase
      .from('console_live_orders_needs_v')
      .select('*')
      .eq('city_id', city.id)
      .order('placed_at'),
    supabase.from('console_zone_health_v').select('*').eq('city_id', city.id).order('zone'),
    supabase.from('dispatch_rules_v').select('*').eq('city_id', city.id).maybeSingle(),
    supabase.rpc('rpc_riders_live', { p_city_id: city.id }),
  ]);

  const problems = [ordersQ, zonesQ, rulesQ, ridersQ]
    .map((q) => q.error?.message)
    .filter(Boolean) as string[];

  const all = (ordersQ.data as LiveOrder[] | null) ?? [];
  const openOrders = all.filter(
    (o) => !['delivered', 'cancelled', 'refunded'].includes(o.stage),
  );
  const zones = (zonesQ.data as ZoneRow[] | null) ?? [];
  const rules = (rulesQ.data as Rules | null) ?? null;
  const riders = (ridersQ.data as RiderPin[] | null) ?? [];

  const counts = {
    all: openOrders.length,
    needs: openOrders.filter((o) => o.needs_action_reasons?.length).length,
    unassigned: openOrders.filter((o) => o.urgency === 'finding_a_rider').length,
    late: openOrders.filter((o) => o.urgency === 'late' || o.urgency === 'needs_a_person').length,
  };

  const shown =
    chip === 'needs'
      ? openOrders.filter((o) => o.needs_action_reasons?.length)
      : chip === 'unassigned'
        ? openOrders.filter((o) => o.urgency === 'finding_a_rider')
        : chip === 'late'
          ? openOrders.filter((o) => o.urgency === 'late' || o.urgency === 'needs_a_person')
          : openOrders;

  /* The oldest thing needing a person, which is nearly always the
     one to work on. */
  const selected =
    shown.find((o) => o.id === searchParams?.selected) ??
    shown.find((o) => o.urgency === 'needs_a_person') ??
    shown[0] ??
    null;

  let cascade: CascadeRow[] = [];
  let candidates: Candidate[] = [];
  if (selected?.job_id) {
    const [c, n] = await Promise.all([
      supabase
        .from('console_cascade_v')
        .select('*')
        .eq('job_id', selected.job_id)
        .order('round')
        .order('rank'),
      supabase.rpc('rpc_dispatch_candidates', {
        p_job_id: selected.job_id,
        p_include_ineligible: true,
      }),
    ]);
    cascade = (c.data as CascadeRow[] | null) ?? [];
    candidates = (n.data as Candidate[] | null) ?? [];
    if (c.error) problems.push(c.error.message);
    if (n.error) problems.push(n.error.message);
  }

  /* The same three the RPC checks, so the button is not offered to
     somebody the database will then refuse. */
  const canPause =
    staff.isSuperAdmin ||
    staff.roles.includes('ops_manager') ||
    staff.roles.includes('city_lead');
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;

  return (
    <ConsoleShell staff={staff} current="/live">
      <ConsoleHeader
        title="Live operations"
        breadcrumb={`${city.name} · dispatch rules: nearest ETA first · ${rules?.reads_as ?? DASH}`}
        action={
          <Link
            href="/settings?tab=fees"
            className="border-border-strong hover:border-ink rounded-lg border px-3 py-2 text-[0.75rem] font-extrabold"
          >
            Dispatch rules →
          </Link>
        }
      />

      <main className="px-4 py-6 sm:px-8">
        {problems.length > 0 && (
          <Card className="border-danger mb-4 border p-4">
            <p className="text-danger text-[0.8125rem] font-extrabold">
              Part of this screen could not be read, so what is below is incomplete.
            </p>
            <ul className="text-muted mt-1.5 space-y-0.5 text-[0.75rem] font-semibold">
              {problems.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {cityRows
            .filter((c) => c.status === 'live')
            .map((c) => (
              <Chip key={c.id} on={city.id === c.id} href={`/live?city=${c.slug}&chip=${chip}`}>
                {c.name}
              </Chip>
            ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {CHIPS.map((c) => (
            <Chip
              key={c.key}
              on={chip === c.key}
              href={`/live?city=${city.slug}&chip=${c.key}`}
              count={counts[c.key]}
              tone={c.key === 'needs' || c.key === 'late' ? 'danger' : undefined}
            >
              {c.label}
            </Chip>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_400px]">
          <div className="space-y-4">
            <MapArea
              orders={shown}
              riders={riders}
              selected={selected?.id ?? null}
              city={city.slug}
              chip={chip}
              mapsKey={mapsKey}
            />
            <Zones zones={zones} canPause={canPause} />
          </div>

          <div>
            {selected ? (
              <Workbench
                order={selected}
                cascade={cascade}
                candidates={candidates}
                rules={rules}
                canPause={canPause}
              />
            ) : (
              <Card className="p-6">
                <p className="text-[0.9375rem] font-extrabold">Nothing needs a person.</p>
                <p className="text-muted mt-2 text-[0.8125rem] font-semibold">
                  {counts.all === 0
                    ? `No orders are live in ${city.name}.`
                    : `${num(counts.all)} running, all with a rider. Zone pressure is below.`}
                </p>
              </Card>
            )}
          </div>
        </div>

        <p className="text-muted-light mt-5 text-[0.6875rem] font-semibold">
          Keyboard: B boost · A assign · W widen · T tell guest · Esc close. The cascade is
          written by the dispatch service; nothing on this screen edits an offer.
        </p>
      </main>
    </ConsoleShell>
  );
}
