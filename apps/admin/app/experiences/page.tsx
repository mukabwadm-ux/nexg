import { Card } from '@nexg/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AllExperiences } from '@/components/experiences/all-experiences';
import { Queue } from '@/components/experiences/queue';
import type { GuestRow, QueueRow, ReviewRow, Stats } from '@/components/experiences/shared';
import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Experiences' };
export const dynamic = 'force-dynamic';

/**
 * Grow → Experiences.
 *
 * Seven tabs in the build prompt; four are built and read real data, and
 * the other three are shown as what they are rather than hidden. A tab
 * that is missing makes the console look smaller than the plan; a tab
 * that pretends to work is worse.
 */
const TABS = [
  { key: 'all', label: 'All experiences', built: true },
  { key: 'queue', label: 'Queue', built: true },
  { key: 'curated', label: 'Curated days', built: true },
  { key: 'components', label: 'Components', built: true },
  { key: 'events', label: 'Events', built: false },
  { key: 'partners', label: 'Partners', built: false },
  { key: 'reports', label: 'Reports', built: false },
];

export default async function ExperiencesPage({
  searchParams,
}: {
  searchParams?: { tab?: string; filter?: string; guest?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'experiences');
  const supabase = createClient();

  const tab = TABS.some((t) => t.key === searchParams?.tab) ? searchParams!.tab! : 'all';
  const filter = searchParams?.filter ?? (tab === 'queue' ? 'needs_me' : 'all');

  const [{ data: stats }, { data: guests }, { data: queue }, { data: reviews }] = await Promise.all(
    [
      supabase.rpc('rpc_experience_stats', {}),
      tab === 'all'
        ? supabase.rpc('rpc_experience_guests', { p_filter: filter })
        : Promise.resolve({ data: [] }),
      tab === 'queue' ? supabase.rpc('rpc_experience_queue', {}) : Promise.resolve({ data: [] }),
      supabase
        .from('review')
        .select(
          'id, plan_id, rating, body, word_count, received_at, channel, consent_publish, consent_display, status, checks, decision_reason, reply_body',
        ),
    ],
  );

  const reviewsById = Object.fromEntries(((reviews ?? []) as ReviewRow[]).map((r) => [r.id, r]));

  const s = (stats as Stats | null) ?? ({} as Stats);

  /* Growth approves reviews; the desk works plans. Both reach the module,
     and the matrix is what says which is which. */
  const canDecide =
    staff.isSuperAdmin || staff.roles.includes('growth') || staff.roles.includes('ops_manager');

  return (
    <ConsoleShell staff={staff} current="/experiences">
      <ConsoleHeader
        title="Experiences · all guests"
        breadcrumb="Everyone who built or requested a day · their history · reviews approved by a person before they appear on the front end"
        action={
          s.reviews_to_approve > 0 ? (
            <Link
              href="/experiences?tab=all&filter=needs_review"
              className="border-border-strong bg-surface hover:border-ink rounded-full border px-4 py-2 text-[0.8125rem] font-extrabold"
            >
              {s.reviews_to_approve} review{s.reviews_to_approve === 1 ? '' : 's'} to approve
            </Link>
          ) : null
        }
      />

      <main className="px-4 py-6 sm:px-8">
        <nav
          className="border-border flex flex-wrap gap-6 border-b"
          aria-label="Experiences sections"
        >
          {TABS.map((t) =>
            t.built ? (
              <Link
                key={t.key}
                href={`/experiences?tab=${t.key}`}
                className={`-mb-px border-b-2 pb-3 text-sm font-bold transition-colors ${
                  tab === t.key
                    ? 'border-gold text-ink'
                    : 'text-muted hover:text-ink border-transparent'
                }`}
              >
                {t.label}
              </Link>
            ) : (
              <span
                key={t.key}
                title="Designed, not built yet"
                className="text-muted-light -mb-px cursor-default border-b-2 border-transparent pb-3 text-sm font-bold opacity-50"
              >
                {t.label}
              </span>
            ),
          )}
        </nav>

        {tab === 'all' && (
          <AllExperiences
            rows={(guests as GuestRow[] | null) ?? []}
            stats={s}
            reviews={reviewsById}
            filter={filter}
            selected={searchParams?.guest ?? null}
            canDecide={canDecide}
          />
        )}

        {tab === 'queue' && (
          <Queue
            rows={(queue as QueueRow[] | null) ?? []}
            stats={s}
            myStaffId={staff.staffId}
            filter={filter}
          />
        )}

        {(tab === 'curated' || tab === 'components') && (
          <CatalogueTab kind={tab} supabase={supabase} />
        )}
      </main>
    </ConsoleShell>
  );
}

/**
 * Curated days and components, read-only for now.
 *
 * The editors are the larger half of the build prompt's catalogue tabs
 * and are not built. Showing the rows that exist, with the allocator
 * health beside them, is worth more than an empty tab: it is how somebody
 * sees that a mood has one live component and therefore no swap.
 */
async function CatalogueTab({
  kind,
  supabase,
}: {
  kind: 'curated' | 'components';
  supabase: ReturnType<typeof createClient>;
}) {
  if (kind === 'curated') {
    const { data } = await supabase
      .from('curated_day')
      .select('id, title, tagline, badge, duration, price_per_person_kes, status, featured')
      .order('sort');

    return (
      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[40rem] text-left">
          <thead>
            <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-3">Day</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Per person</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((d) => (
              <tr key={d.id} className="border-border border-b last:border-b-0">
                <td className="px-4 py-3">
                  <p className="text-[0.8125rem] font-extrabold">
                    {d.title}
                    {d.badge && (
                      <span className="bg-gold-soft text-gold-text ml-2 rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold">
                        {d.badge}
                      </span>
                    )}
                  </p>
                  <p className="text-muted-light text-[0.6875rem] font-semibold">{d.tagline}</p>
                </td>
                <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">{d.duration}</td>
                <td className="px-4 py-3 text-[0.8125rem] font-bold">
                  {d.price_per_person_kes === null
                    ? 'KES [—]'
                    : `KES ${d.price_per_person_kes.toLocaleString('en-KE')}`}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
                      d.status === 'live' ? 'bg-success-bg text-success' : 'bg-bg text-muted'
                    }`}
                  >
                    {d.status}
                  </span>
                </td>
              </tr>
            ))}
            {(data ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="text-muted px-4 py-10 text-center text-sm font-semibold">
                  No curated days yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold">
          Read-only. The block editor is designed and not built — a day is published through
          rpc_publish_curated_day, which refuses unless every block is live and priced.
        </p>
      </Card>
    );
  }

  const [{ data: components }, { data: health }] = await Promise.all([
    supabase
      .from('experience_component')
      .select('id, title, subtitle, mood, swap_group, tier, price_kes, status')
      .order('mood')
      .order('swap_group')
      .order('tier'),
    supabase.from('catalogue_health').select('*'),
  ]);

  const thin = (health ?? []).filter((h) => (h.live_components ?? 0) > 0 && (h.tiers ?? 0) < 3);

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[42rem] text-left">
          <thead>
            <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
              <th className="px-4 py-3">Component</th>
              <th className="px-4 py-3">Mood</th>
              <th className="px-4 py-3">Swap group</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(components ?? []).map((c) => (
              <tr key={c.id} className="border-border border-b last:border-b-0">
                <td className="px-4 py-3">
                  <p className="text-[0.8125rem] font-extrabold">{c.title}</p>
                  <p className="text-muted-light text-[0.6875rem] font-semibold">{c.subtitle}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="bg-bg text-ink rounded px-2 py-0.5 text-[0.625rem] font-extrabold uppercase">
                    {c.mood}
                  </span>
                </td>
                <td className="text-muted px-4 py-3 text-[0.6875rem] font-semibold">
                  {c.swap_group}
                </td>
                <td className="px-4 py-3">
                  <span
                    aria-label={`tier ${c.tier} of 5`}
                    className="text-[0.625rem] tracking-wider"
                  >
                    {'●'.repeat(c.tier ?? 0)}
                    <span className="text-border-strong">{'○'.repeat(5 - (c.tier ?? 0))}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-[0.8125rem] font-bold">
                  {c.price_kes === null
                    ? 'KES [—]'
                    : `KES ${Number(c.price_kes).toLocaleString('en-KE')}`}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
                      c.status === 'live' ? 'bg-success-bg text-success' : 'bg-bg text-muted'
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-extrabold uppercase tracking-wide">Allocator health</h3>
        <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
          A part of the day with fewer than three tiers cannot be fitted to a budget and cannot be
          swapped. The feature quietly stops working there.
        </p>
        <ul className="mt-3 space-y-2">
          {thin.length === 0 ? (
            <li className="text-success text-[0.75rem] font-bold">
              Every live group has three or more tiers.
            </li>
          ) : (
            thin.map((h, i) => (
              <li key={i} className="text-[0.6875rem] font-semibold leading-[1.6]">
                <span className="text-warning font-extrabold">{h.swap_group}</span> · {h.tiers} tier
                {h.tiers === 1 ? '' : 's'} live — recruit one cheaper and one dearer supplier here.
              </li>
            ))
          )}
        </ul>
      </Card>
    </div>
  );
}
