import type { Metadata } from 'next';
import Link from 'next/link';

import { AllExperiences } from '@/components/experiences/all-experiences';
import { ExperienceCatalogue } from '@/components/experiences/catalogue-manager';
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
 * Six tabs are live. Reports remains unavailable until it has real data
 * and a defined source of truth.
 */
const TABS = [
  { key: 'all', label: 'All experiences', built: true },
  { key: 'queue', label: 'Queue', built: true },
  { key: 'curated', label: 'Curated days', built: true },
  { key: 'components', label: 'Components', built: true },
  { key: 'events', label: 'Events', built: true },
  { key: 'partners', label: 'Partners', built: true },
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

        {(tab === 'curated' || tab === 'components' || tab === 'events' || tab === 'partners') && (
          <CatalogueTab
            kind={tab}
            supabase={supabase}
            canEdit={staff.isSuperAdmin || staff.roles.includes('growth')}
            canManagePartners={
              staff.isSuperAdmin ||
              staff.roles.includes('growth') ||
              staff.roles.includes('ops_manager')
            }
            canActivatePartners={staff.isSuperAdmin || staff.roles.includes('ops_manager')}
          />
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
  canEdit,
  canManagePartners,
  canActivatePartners,
}: {
  kind: 'curated' | 'components' | 'events' | 'partners';
  supabase: ReturnType<typeof createClient>;
  canEdit: boolean;
  canManagePartners: boolean;
  canActivatePartners: boolean;
}) {
  const { data: cities } = await supabase.from('city').select('id, name, slug').order('sort');

  if (kind === 'partners') {
    const { data } = await supabase
      .from('experience_partner')
      .select(
        'id, name, kind, city_id, contact_name, contact_phone, contact_email, preferred_channel, can_answer_holds, terms, status, went_live_at',
      )
      .order('name');
    return (
      <ExperienceCatalogue
        kind={kind}
        cities={cities ?? []}
        partners={data ?? []}
        canEdit={canManagePartners}
        canManagePartners={canManagePartners}
        canActivatePartners={canActivatePartners}
      />
    );
  }

  if (kind === 'events') {
    const [{ data }, { data: partners }] = await Promise.all([
      supabase
        .from('event')
        .select(
          'id, city_id, name, category, venue_name, venue_address, starts_at, ends_at, doors_at, organiser_name, organiser_url, ticket_url, ticket_partner_id, ticket_bands, nexg_can_hold_tickets, practical_note, cover_path, status, featured, anchor_slot, suggested_blocks, source, submitted_by_partner_id, submission_note, rejected_reason',
        )
        .order('starts_at', { ascending: false }),
      supabase.from('experience_partner').select('id, name, city_id, status, kind').order('name'),
    ]);
    return (
      <ExperienceCatalogue
        kind={kind}
        cities={cities ?? []}
        events={data ?? []}
        partners={partners ?? []}
        canEdit={canEdit}
        canManagePartners={canManagePartners}
        canActivatePartners={canActivatePartners}
      />
    );
  }

  const [{ data: partners }, { data: components }, healthResult] = await Promise.all([
    supabase.from('experience_partner').select('id, name, city_id, status, kind').order('name'),
    supabase
      .from('experience_component')
      .select(
        'id, partner_id, city_id, kind, mood, title, subtitle, description, duration_min, default_slot, earliest_start, latest_start, price_kes, price_basis, min_party, max_party, party_types, includes, tags, tier, swap_group, status, booking_lead_hours, capacity_per_day, sort, cover_path',
      )
      .order('mood')
      .order('swap_group')
      .order('tier'),
    kind === 'components'
      ? supabase.from('catalogue_health').select('*')
      : Promise.resolve({ data: null }),
  ]);

  if (kind === 'components') {
    const thinGroups = (healthResult.data ?? []).flatMap((h) =>
      h.swap_group && (h.live_components ?? 0) > 0 && (h.tiers ?? 0) < 3
        ? [{ swap_group: h.swap_group, tiers: h.tiers ?? 0 }]
        : [],
    );
    return (
      <ExperienceCatalogue
        kind={kind}
        cities={cities ?? []}
        partners={partners ?? []}
        components={components ?? []}
        thinGroups={thinGroups}
        canEdit={canEdit}
        canManagePartners={canManagePartners}
        canActivatePartners={canActivatePartners}
      />
    );
  }

  const [{ data: days }, { data: blocks }] = await Promise.all([
    supabase
      .from('curated_day')
      .select(
        'id, city_id, slug, title, tagline, cover_path, badge, party_types, duration, price_per_person_kes, status, sort, featured',
      )
      .order('sort'),
    supabase
      .from('curated_day_block')
      .select('id, curated_day_id, component_id, slot, start_time, sort')
      .order('sort'),
  ]);

  return (
    <ExperienceCatalogue
      kind={kind}
      cities={cities ?? []}
      partners={partners ?? []}
      components={components ?? []}
      days={days ?? []}
      dayBlocks={blocks ?? []}
      canEdit={canEdit}
      canManagePartners={canManagePartners}
      canActivatePartners={canActivatePartners}
    />
  );
}
