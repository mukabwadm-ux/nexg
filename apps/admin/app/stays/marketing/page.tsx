import {
  BarChart3,
  BedDouble,
  Bell,
  Building2,
  Coins,
  Copy,
  Download,
  Megaphone,
  Printer,
  QrCode,
  ScanLine,
  ShoppingBag,
  Smartphone,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import {
  CardLink,
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
} from '@/components/portal/dash';
import { AddCampaignButton, CampaignStatus } from '@/components/stays/client';
import { NotYet, PanelLinks } from '@/components/stays/extras';
import {
  DataTable,
  Empty,
  ErrorNote,
  Footnote,
  ShareBars,
  StaysHeader,
  TypeTag,
  WaitingForDatabase,
} from '@/components/stays/module';
import {
  asNumber,
  asObject,
  CAMPAIGN_CHANNEL_LABEL,
  CAMPAIGN_OBJECTIVE_LABEL,
  delta,
  kesCompact,
  label,
  n,
  oneOf,
  pct,
  PLACEMENT_LABEL,
  shareOf,
  shortDate,
  staysHref,
  when,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · QR Codes & Marketing' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'codes', label: 'QR Codes' },
  { key: 'campaigns', label: 'Marketing Campaigns' },
  { key: 'assets', label: 'Assets & Materials' },
  { key: 'placements', label: 'Placements' },
  { key: 'performance', label: 'Performance' },
  { key: 'settings', label: 'Settings' },
] as const;

interface CampaignRow {
  id: string;
  name: string;
  objective: string;
  channel: string;
  starts_on: string;
  ends_on: string | null;
  spend_kes: number;
  results: number | null;
  result_unit: string | null;
  status: string;
}

interface CodeRow {
  id: string;
  code: string;
  label: string | null;
  placement: string;
  state: string;
  scans: number;
  orders: number;
  last_scanned_at: string | null;
  unit_label: string | null;
  property_name: string | null;
}

const PALETTE = ['#F5A623', '#F5C842', '#C58BF2', '#2F80ED', '#9EC5F8', '#1E9E45', '#C9C4B8'];

const PRACTICES = [
  'Place a QR card in every guest room.',
  'Use the printed card from each code for tents and door hangers.',
  'Put codes at reception, lifts and entrances.',
  'Track scans and orders for each placement.',
  'Keep campaigns and offers updated monthly.',
];

/**
 * Stays → QR Codes & Marketing: the QR cards on hosts' units, how often
 * guests scan them and order, the printable materials each code makes, and
 * the stays campaigns staff record with their spend. Making a new card stays
 * on the QR tab, which signs it.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; city?: string; tab?: string };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
  const tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'codes',
  );
  const data = await ctx.read('rpc_console_stays_marketing', {
    p_from: period.from,
    p_to: period.to,
    p_city: city,
  });
  const o = asObject(data.data);
  const k = asObject(o.kpis);
  const campaigns = (Array.isArray(o.campaigns) ? o.campaigns : []) as CampaignRow[];
  const codes = (Array.isArray(o.codes) ? o.codes : []) as CodeRow[];
  const byPlacement = (Array.isArray(o.by_placement) ? o.by_placement : []) as {
    placement: string;
    n: number;
  }[];
  const scans = asNumber(k.scans);
  const spend = asNumber(k.spend_kes);
  const value = asNumber(k.bookings_value_kes);
  const web = (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'https://nexgapp.com').replace(/\/$/, '');
  const hero = codes[0] ?? null;
  const tabHref = (key: string) =>
    staysHref('/stays/marketing', period, city, { tab: key === 'codes' ? null : key });

  const codesTable = (
    <DataTable
      caption="QR codes"
      isEmpty={codes.length === 0}
      empty="No host QR cards yet. Make one on the QR tab."
      head={['Code', 'Unit / Building', 'Placement', 'Scans', 'Orders', 'Last Scan', 'Materials']}
    >
      {codes.map((c) => (
        <tr key={c.id}>
          <td className="font-mono font-bold">{c.code}</td>
          <td>
            {c.unit_label ?? c.label ?? '—'}
            {c.property_name && (
              <span className="text-muted block text-[0.8125rem]">{c.property_name}</span>
            )}
          </td>
          <td>{label(PLACEMENT_LABEL, c.placement)}</td>
          <td className="tabular-nums">{n(c.scans)}</td>
          <td className="tabular-nums">{n(c.orders)}</td>
          <td className="whitespace-nowrap">{when(c.last_scanned_at)}</td>
          <td className="whitespace-nowrap text-[0.8125rem] font-bold">
            <a
              className="underline"
              href={`${web}/q/${c.code}/card`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Print card
            </a>{' '}
            ·{' '}
            <a
              className="underline"
              href={`${web}/api/qr/${c.code}?png&size=1200`}
              target="_blank"
              rel="noopener noreferrer"
            >
              PNG
            </a>
          </td>
        </tr>
      ))}
    </DataTable>
  );

  const campaignsTable = (
    <DataTable
      caption="Campaigns"
      isEmpty={campaigns.length === 0}
      empty="No campaigns recorded yet. Add one with the gold button."
      head={['Campaign', 'Objective', 'Channel', 'Period', 'Spend (KES)', 'Results', 'Status']}
    >
      {campaigns.map((c) => (
        <tr key={c.id}>
          <td className="font-semibold">{c.name}</td>
          <td>{label(CAMPAIGN_OBJECTIVE_LABEL, c.objective)}</td>
          <td>
            <TypeTag tone="gold">{label(CAMPAIGN_CHANNEL_LABEL, c.channel)}</TypeTag>
          </td>
          <td className="whitespace-nowrap">
            {shortDate(c.starts_on)} – {c.ends_on ? shortDate(c.ends_on) : 'ongoing'}
          </td>
          <td className="tabular-nums">{n(c.spend_kes)}</td>
          <td className="whitespace-nowrap">
            {c.results != null ? `${n(c.results)} ${c.result_unit ?? ''}` : '—'}
          </td>
          <td>
            <CampaignStatus id={c.id} status={c.status} />
          </td>
        </tr>
      ))}
    </DataTable>
  );

  const performanceDonut =
    scans === 0 ? (
      <Empty>No scans in this period.</Empty>
    ) : (
      <ShareDonut
        centre={n(scans)}
        caption="Total Scans"
        data={byPlacement.map((p, i) => ({
          key: p.placement,
          label: `${label(PLACEMENT_LABEL, p.placement)} ${pct(shareOf(asNumber(p.n), scans), 0)}`,
          value: asNumber(p.n),
          color: PALETTE[i % PALETTE.length],
        }))}
      />
    );

  let body: React.ReactNode;
  if (tab === 'campaigns') {
    body = <DashCard title="Marketing Campaigns">{campaignsTable}</DashCard>;
  } else if (tab === 'assets') {
    body = (
      <DashCard title="Assets & Materials">
        <p className="text-muted mb-3 text-[0.875rem] font-semibold">
          Every code prints as a branded card (A6, for a room, reception or a tent card) and
          downloads as a PNG for fliers, posters and digital banners.
        </p>
        {codesTable}
      </DashCard>
    );
  } else if (tab === 'placements') {
    body = (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <DashCard title="Scans by Placement">
          <ShareBars
            empty="No scans in this period."
            rows={byPlacement.map((p) => ({
              label: label(PLACEMENT_LABEL, p.placement),
              value: asNumber(p.n),
              text: `${n(asNumber(p.n))} (${pct(shareOf(asNumber(p.n), scans), 0)})`,
            }))}
          />
        </DashCard>
        <DashCard title="Best Practices">
          <ul className="space-y-2 text-[0.9375rem] font-semibold">
            {PRACTICES.map((p) => (
              <li key={p} className="flex gap-2">
                <span aria-hidden="true" className="text-[#1E9E45]">
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
        </DashCard>
      </div>
    );
  } else if (tab === 'performance') {
    body = (
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <DashCard title="QR Performance">{performanceDonut}</DashCard>
        <DashCard title="Most-scanned Codes">{codesTable}</DashCard>
      </div>
    );
  } else if (tab === 'settings') {
    body = (
      <DashCard>
        <NotYet
          title="QR cards are made and managed on the QR tab"
          action={
            <Link
              className="font-bold text-[#826D18] underline underline-offset-4"
              href="/hotels?tab=qr"
            >
              Open the QR tab
            </Link>
          }
        >
          New cards, replacing a lost card, voiding one and the card&rsquo;s placement live there,
          where each card is signed so a copied code cannot be passed off as NexG&rsquo;s.
        </NotYet>
      </DashCard>
    );
  } else {
    body = (
      <>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <DashCard
            title="QR Codes for Stays"
            aside={<CardLink href="/hotels?tab=qr">Make a QR card</CardLink>}
          >
            <p className="text-muted mb-3 text-[0.875rem] font-semibold">
              Guests scan to order, ask for help and get the app. The card shown is the most-scanned
              this period.
            </p>
            {hero ? (
              <div className="grid items-center gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${web}/api/qr/${hero.code}?png&size=400`}
                  alt={`QR code ${hero.code}`}
                  className="h-40 w-40 rounded-xl border border-[#F5E2B0] bg-white p-2"
                />
                <div>
                  <p className="font-extrabold">{hero.unit_label ?? hero.label ?? hero.code}</p>
                  <p className="text-muted mb-3 text-[0.8125rem] font-semibold">
                    {hero.property_name ?? ''} · {n(hero.scans)} scans · {n(hero.orders)} orders
                  </p>
                  <PanelLinks
                    links={[
                      {
                        label: 'Download QR (PNG)',
                        icon: Download,
                        href: `${web}/api/qr/${hero.code}?png&size=1200`,
                      },
                      { label: 'Print (card)', icon: Printer, href: `${web}/q/${hero.code}/card` },
                      { label: 'Open Link', icon: Copy, href: `${web}/q/${hero.code}` },
                    ]}
                  />
                </div>
              </div>
            ) : (
              <Empty>No host QR card yet.</Empty>
            )}
          </DashCard>
          <DashCard title="QR Code Types">
            <ul>
              {[
                {
                  icon: BedDouble,
                  title: 'Unit QR',
                  sub: 'In a unit or room',
                  live: `${n(asNumber(k.codes))} cards`,
                },
                {
                  icon: Building2,
                  title: 'Apartment / Building QR',
                  sub: 'Lobbies, lifts',
                  live: 'Use a unit card at reception',
                },
                {
                  icon: UserPlus,
                  title: 'Host Onboarding QR',
                  sub: 'New host sign-ups',
                  live: 'Not set up',
                },
                {
                  icon: Bell,
                  title: 'Guest Services QR',
                  sub: 'Order food, transfers…',
                  live: 'Same as the unit QR',
                },
                {
                  icon: Smartphone,
                  title: 'App Download QR',
                  sub: 'Get the NexG app',
                  live: 'Not set up',
                },
              ].map((t) => (
                <li
                  key={t.title}
                  className="border-border flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
                >
                  <span className="flex items-center gap-3">
                    <t.icon aria-hidden="true" className="h-5 w-5 text-[#E5A800]" />
                    <span>
                      <span className="block text-[0.9375rem] font-bold">{t.title}</span>
                      <span className="text-muted block text-[0.8125rem] font-semibold">
                        {t.sub}
                      </span>
                    </span>
                  </span>
                  <span className="text-muted text-right text-[0.8125rem] font-semibold">
                    {t.live}
                  </span>
                </li>
              ))}
            </ul>
          </DashCard>
          <DashCard
            title="Marketing Assets"
            aside={<CardLink href={tabHref('assets')}>All</CardLink>}
          >
            {codes.length === 0 ? (
              <Empty>No cards to print yet.</Empty>
            ) : (
              <ul className="grid grid-cols-2 gap-2">
                {codes.slice(0, 4).map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-[#F5E2B0] bg-[#FFFBF0] p-2 text-center"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${web}/api/qr/${c.code}?png&size=200`}
                      alt=""
                      className="mx-auto h-16 w-16"
                    />
                    <p className="mt-1 truncate text-[0.8125rem] font-bold">
                      {c.unit_label ?? c.code}
                    </p>
                    <a
                      className="text-[0.75rem] font-bold text-[#8A5C00] underline"
                      href={`${web}/q/${c.code}/card`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Print card
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </DashCard>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <DashCard
            title="Marketing Campaigns"
            aside={<CardLink href={tabHref('campaigns')}>View All</CardLink>}
          >
            {campaignsTable}
          </DashCard>
          <DashCard title="QR Performance">{performanceDonut}</DashCard>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <DashCard title="QR Codes" aside={<CardLink href="/hotels?tab=qr">All cards</CardLink>}>
            {codesTable}
          </DashCard>
          <DashCard title="Best Practices">
            <ul className="space-y-2 text-[0.9375rem] font-semibold">
              {PRACTICES.map((p) => (
                <li key={p} className="flex gap-2">
                  <span aria-hidden="true" className="text-[#1E9E45]">
                    ✓
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <Footnote>
              Placement photos are not stored yet; each card records where it was placed.
            </Footnote>
          </DashCard>
        </div>
      </>
    );
  }

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="QR Codes & Marketing"
        subtitle="QR cards on units, what guests do with them, and stays campaigns and their cost."
        period={period}
        cities={ctx.cities}
        city={city}
        action={<AddCampaignButton />}
      />
      <DashCanvas>
        {data.waiting ? (
          <WaitingForDatabase />
        ) : data.error ? (
          <ErrorNote message={data.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-7">
              <DashKpi
                featured
                icon={QrCode}
                label="QR Codes Active"
                value={n(asNumber(k.active_codes))}
                explain="Host QR cards sent, placed or scanned."
              />
              <DashKpi
                icon={ScanLine}
                label="QR Scans"
                value={n(scans)}
                delta={delta(scans, asNumber(k.scans_prev))}
                explain="Scans in the period, bots and tests left out."
              />
              <DashKpi
                icon={ShoppingBag}
                label="Orders from QR"
                value={n(asNumber(k.orders_from_qr))}
                explain="Scans that led to an order."
              />
              <DashKpi
                icon={Megaphone}
                label="Campaigns Running"
                value={n(asNumber(k.campaigns_running))}
                explain="Active campaigns overlapping the period."
              />
              <DashKpi
                icon={Coins}
                label="Marketing Spend"
                value={kesCompact(spend)}
                explain="Spend recorded on campaigns overlapping the period."
              />
              <DashKpi
                icon={TrendingUp}
                label="NexG Bookings"
                value={kesCompact(value)}
                explain="Value of stays guests booked through NexG in the period."
              />
              <DashKpi
                icon={BarChart3}
                label="ROAS"
                value={spend > 0 ? `${(value / spend).toFixed(1)}x` : '—'}
                explain="NexG booking value over campaign spend. A dash until spend is recorded."
              />
            </DashKpiGrid>
            <DashCard>
              <GoldTabs
                label="QR and marketing"
                active={tab}
                tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: tabHref(t.key) }))}
              />
            </DashCard>
            {body}
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
