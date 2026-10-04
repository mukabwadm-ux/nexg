import type { Metadata } from 'next';

import { ConsoleHeader } from '@/components/console-header';
import { ConsoleShell } from '@/components/console-shell';
import {
  QrTab,
  type QrCardRow,
  type QrHealthRow,
  type QrScanRow,
  type QrSummary,
} from '@/components/hotels/qr-tab';
import { HOTEL_TABS, HotelTabs, TAB_TITLE } from '@/components/hotels/shell';
import {
  num,
  plural,
  type Badges,
  type DataRequestRow,
  type FolioRow,
  type GuestRow,
  type HostRow,
  type HotelRow,
} from '@/components/hotels/shared';
import {
  ListingsTab,
  type MatchRow,
  type PropertyRow,
  type StayRequestRow,
} from '@/components/hotels/listings';
import {
  ChargeTab,
  DataRequestsTab,
  DeskTab,
  GuestsTab,
  HostsTab,
  HotelsTab,
  type UnitRow,
} from '@/components/hotels/tabs';
import { Card } from '@nexg/ui';

import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Hotels & Airbnb' };
export const dynamic = 'force-dynamic';

type Supabase = ReturnType<typeof createClient>;

/**
 * Partners → Hotels & Airbnb.
 *
 * Six tabs over two partner types that share one job: the property
 * sets its rules once and every order follows them.
 *
 * Order counts and spend render [—] throughout. There is no orders
 * domain; a zero would tell a partnerships lead that a hotel sold
 * nothing when the truth is that nothing is being counted.
 */
export default async function HotelsPage({
  searchParams,
}: {
  searchParams?: { tab?: string; filter?: string; selected?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'hotels');
  const supabase = createClient();

  const tab = HOTEL_TABS.some((t) => t.key === searchParams?.tab)
    ? searchParams!.tab!
    : 'hosts';
  const filter =
    searchParams?.filter ?? (tab === 'charge' || tab === 'qr' ? 'live' : 'all');
  const selected = searchParams?.selected ?? null;

  /* Matches authz.handles_guest_data(). */
  const handlesGuestData =
    staff.isSuperAdmin ||
    staff.roles.some((r) => ['dpo', 'concierge_agent', 'concierge_lead'].includes(r));

  const { data: badgesRaw } = await supabase.rpc('rpc_hospitality_counts', {});
  const badges = (badgesRaw as Badges | null) ?? ({} as Badges);
  const copy = TAB_TITLE[tab]!;

  return (
    <ConsoleShell staff={staff} current="/hotels">
      <ConsoleHeader
        title={copy.title}
        breadcrumb={
          tab === 'hotels'
            ? `${num(badges.hotels_partner)} partner hotels · ${num(
                badges.rooms_covered,
              )} rooms · ${plural(badges.hotels_prospect ?? 0, 'prospect')}`
            : copy.subtitle
        }
      />

      <main className="px-4 py-6 sm:px-8">
        <HotelTabs current={tab} />

        {tab === 'hosts' && (await loadHosts(supabase, badges, filter, selected))}
        {tab === 'listings' && (await loadListings(supabase, filter, selected))}
        {tab === 'hotels' && (await loadHotels(supabase, badges, filter, selected))}
        {tab === 'charge' && (await loadCharge(supabase, badges, filter))}
        {tab === 'desk' && (await loadDesk(supabase))}
        {tab === 'qr' && (await loadQr(supabase, filter))}
        {/*
         * Guest records and KDPA requests are the DPO's and support's,
         * and RLS enforces that regardless of what renders here. But a
         * table of zeros reads as "nothing open" to somebody who simply
         * cannot see the rows, so this says which it is.
         */}
        {tab === 'guests' &&
          (handlesGuestData
            ? await loadGuests(supabase, badges, filter, selected)
            : <NoGuestAccess />)}
        {tab === 'data' &&
          (handlesGuestData
            ? await loadDataRequests(supabase, badges, filter)
            : <NoGuestAccess />)}
      </main>
    </ConsoleShell>
  );
}

// ──────────────────────────────────────────────────── loaders

async function loadHosts(
  supabase: Supabase,
  badges: Badges,
  filter: string,
  selected: string | null,
) {
  const [{ data: hosts }, { data: units }] = await Promise.all([
    supabase
      .from('console_host_directory_v')
      .select('*')
      .order('created_at', { ascending: false }),
    /* Only the selected host's units: the panel is the only thing that
       renders them, and a hundred hosts is a lot of rows to fetch for
       a table that shows a count. */
    selected
      ? supabase.from('host_view_v').select('*').eq('host_id', selected)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  return (
    <HostsTab
      hosts={(hosts as HostRow[] | null) ?? []}
      units={(units as UnitRow[] | null) ?? []}
      badges={badges}
      filter={filter}
      selected={selected}
    />
  );
}

async function loadListings(
  supabase: Supabase,
  filter: string,
  selected: string | null,
) {
  const [{ data: properties }, { data: requests }, { data: matches }] = await Promise.all([
    supabase.from('console_property_v').select('*').order('name'),
    supabase
      .from('console_stay_request_v')
      .select('*')
      .order('created_at', { ascending: false }),
    /* Only the selected request's options: the table shows a count. */
    selected
      ? supabase
          .from('stay_request_match')
          .select('*, unit:unit_id(label_public, name)')
          .eq('request_id', selected)
          .order('rank')
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  return (
    <ListingsTab
      properties={(properties as PropertyRow[] | null) ?? []}
      requests={(requests as StayRequestRow[] | null) ?? []}
      matches={(matches as MatchRow[] | null) ?? []}
      filter={filter}
      selected={selected}
    />
  );
}

async function loadHotels(
  supabase: Supabase,
  badges: Badges,
  filter: string,
  selected: string | null,
) {
  const [{ data: hotels }, { data: setting }, { data: rule }, { data: contacts }, { data: activity }] =
    await Promise.all([
      supabase.from('console_hotel_directory_v').select('*').order('name'),
      selected
        ? supabase.from('hotel_program_setting').select('*').eq('hotel_id', selected).maybeSingle()
        : Promise.resolve({ data: null }),
      selected
        ? supabase
            .from('hotel_access_rule')
            .select('version, text, after_hours_handoff')
            .eq('hotel_id', selected)
            .is('superseded_at', null)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      selected
        ? supabase
            .from('hotel_contact')
            .select('id, name, role, phone_last2, email, ext')
            .eq('hotel_id', selected)
        : Promise.resolve({ data: [] as unknown[] }),
      selected
        ? supabase
            .from('hotel_prospect_activity')
            .select('id, kind, at, notes')
            .eq('hotel_id', selected)
            .order('at', { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

  return (
    <HotelsTab
      hotels={(hotels as HotelRow[] | null) ?? []}
      badges={badges}
      filter={filter}
      selected={selected}
      setting={(setting as Record<string, unknown> | null) ?? null}
      accessRule={
        (rule as { version: number; text: string; after_hours_handoff: string | null } | null) ??
        null
      }
      contacts={
        (contacts as {
          id: string;
          name: string;
          role: string | null;
          phone_last2: string | null;
          email: string | null;
          ext: string | null;
        }[] | null) ?? []
      }
      activity={
        (activity as { id: number; kind: string; at: string; notes: string | null }[] | null) ?? []
      }
    />
  );
}

async function loadCharge(supabase: Supabase, badges: Badges, filter: string) {
  const [{ data: folios }, { data: caps }] = await Promise.all([
    supabase
      .from('console_folio_v')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(120),
    supabase
      .from('hotel_program_setting')
      .select('hotel_id, charge_cap_per_stay, folio_sync, hotel:hotel_id(name)')
      .eq('charge_to_room', true),
  ]);

  const capRows = (
    (caps as
      | {
          hotel_id: string;
          charge_cap_per_stay: number | null;
          folio_sync: string | null;
          hotel: { name: string } | null;
        }[]
      | null) ?? []
  ).map((c) => ({
    hotel_id: c.hotel_id,
    name: c.hotel?.name ?? '[Hotel]',
    charge_cap_per_stay: c.charge_cap_per_stay,
    folio_sync: c.folio_sync,
  }));

  return (
    <ChargeTab
      folios={(folios as FolioRow[] | null) ?? []}
      badges={badges}
      filter={filter}
      caps={capRows}
    />
  );
}

async function loadDesk(supabase: Supabase) {
  const [{ data: hotels }, { data: folios }, { data: rules }] = await Promise.all([
    supabase.from('console_hotel_directory_v').select('*').order('name'),
    supabase.from('console_folio_v').select('*').limit(300),
    supabase
      .from('hotel_access_rule')
      .select('hotel_id, version, text, updated_at, hotel:hotel_id(name)')
      .is('superseded_at', null),
  ]);

  const ruleRows = (
    (rules as
      | {
          hotel_id: string;
          version: number;
          text: string;
          updated_at: string;
          hotel: { name: string } | null;
        }[]
      | null) ?? []
  ).map((r) => ({
    hotel_id: r.hotel_id,
    hotel_name: r.hotel?.name ?? '[Hotel]',
    version: r.version,
    text: r.text,
    updated_at: r.updated_at,
  }));

  return (
    <DeskTab
      hotels={(hotels as HotelRow[] | null) ?? []}
      folios={(folios as FolioRow[] | null) ?? []}
      rules={ruleRows}
    />
  );
}

async function loadGuests(
  supabase: Supabase,
  badges: Badges,
  filter: string,
  selected: string | null,
) {
  const [{ data: guests }, { data: requests }, { data: retention }] = await Promise.all([
    supabase
      .from('console_guest_v')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('console_data_request_v')
      .select('*')
      .not('status', 'in', '("fulfilled","refused","withdrawn")')
      .order('due_at'),
    supabase.from('retention_rule').select('key, subject, retain_for, basis'),
  ]);

  return (
    <GuestsTab
      guests={(guests as GuestRow[] | null) ?? []}
      requests={(requests as DataRequestRow[] | null) ?? []}
      badges={badges}
      filter={filter}
      selected={selected}
      retention={
        (retention as
          | { key: string; subject: string; retain_for: string | null; basis: string }[]
          | null) ?? []
      }
    />
  );
}

async function loadDataRequests(supabase: Supabase, badges: Badges, filter: string) {
  const { data: requests } = await supabase
    .from('console_data_request_v')
    .select('*')
    .order('due_at');

  return (
    <DataRequestsTab
      requests={(requests as DataRequestRow[] | null) ?? []}
      badges={badges}
      filter={filter}
    />
  );
}

/**
 * Not a permission check — RLS is. This is so that somebody without
 * the grant reads "you cannot see this" instead of "there is nothing
 * here", which are very different things when the subject is an
 * unanswered erasure request with a statutory clock on it.
 */
function NoGuestAccess() {
  return (
    <Card className="mt-6 p-6">
      <p className="text-[0.9375rem] font-extrabold">This one is not yours to see.</p>
      <p className="text-muted mt-2 max-w-[38rem] text-[0.8125rem] font-semibold leading-[1.8]">
        Guest records and KDPA access and erasure requests are handled by the data protection
        officer and the support desk. Partnerships and finance reach every other tab in this
        module but not these — signing up a hotel is not a reason to read a guest&rsquo;s order
        history.
      </p>
      <p className="text-muted-light mt-3 text-[0.75rem] font-semibold">
        There may well be open requests. You are not being shown zero because there are none.
      </p>
    </Card>
  );
}

/**
 * QR & attribution.
 *
 * Four reads, all scoped by RLS: the cards, the recent scans, the
 * health findings, and the live properties a new card could go on.
 * Nothing here filters by permission itself — `property_qr` and
 * `qr_scan` carry policies, and `property_attribution_v` scopes
 * itself because it reads a materialised view that cannot.
 */
async function loadQr(supabase: Supabase, filter: string) {
  const [{ data: summary }, { data: cards }, { data: scans }, { data: health }, { data: units }] =
    await Promise.all([
      supabase.from('console_qr_summary_v').select('*').maybeSingle(),
      supabase
        .from('property_attribution_v')
        .select('*')
        .order('label')
        .order('placement')
        .limit(200),
      supabase
        .from('console_qr_scan_v')
        .select('*')
        .order('scanned_at', { ascending: false })
        .limit(100),
      supabase.from('qr_health_v').select('*').not('finding', 'is', null).limit(20),
      /* Only live units can take a card: a guest scanning a card on a
         unit that is not live reaches a friendly dead end, and
         offering to make one would be setting that up. */
      supabase
        .from('unit')
        .select('id, label_public, name')
        .eq('status', 'live')
        .is('archived_at', null)
        .order('name')
        .limit(200),
    ]);

  const properties = ((units as { id: string; label_public: string | null; name: string }[] | null) ?? []).map(
    (u) => ({ id: u.id, label: u.label_public ?? u.name, kind: 'unit' as const }),
  );

  return (
    <QrTab
      summary={(summary as QrSummary | null) ?? null}
      cards={(cards as QrCardRow[] | null) ?? []}
      scans={(scans as QrScanRow[] | null) ?? []}
      health={(health as QrHealthRow[] | null) ?? []}
      properties={properties}
      webOrigin={webOrigin()}
      filter={filter}
    />
  );
}

/*
 * Where the "Print the card" and "Download PNG" links point.
 *
 * The console and the guest site are separate deployments, so the
 * admin app has to be told. Set NEXT_PUBLIC_WEB_ORIGIN in Vercel; in
 * development it falls back to the local web server, and if it is
 * missing in production it falls back to the live site rather than
 * to localhost — a print link that silently pointed at a developer's
 * laptop would produce a page that works for one person and 404s for
 * everybody else.
 */
function webOrigin(): string {
  if (process.env.NEXT_PUBLIC_WEB_ORIGIN) return process.env.NEXT_PUBLIC_WEB_ORIGIN;
  return process.env.NODE_ENV === 'development'
    ? 'http://localhost:3006'
    : 'https://nexg-sepia.vercel.app';
}
