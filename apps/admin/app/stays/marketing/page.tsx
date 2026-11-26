import {
  BarChart3,
  Coins,
  Megaphone,
  QrCode,
  ScanLine,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import { CardLink, DashCanvas, DashCard, DashKpi, DashKpiGrid } from '@/components/portal/dash';
import { AddCampaignButton, CampaignStatus } from '@/components/stays/client';
import {
  DataTable,
  Empty,
  ErrorNote,
  Footnote,
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
  PLACEMENT_LABEL,
  shortDate,
  staysHref,
  when,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · QR Codes & Marketing' };
export const dynamic = 'force-dynamic';

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
  'Use the printed tent card or door hanger from each code.',
  'Put codes at reception, lifts and entrances.',
  'Track scans and orders for each placement.',
  'Keep campaigns and offers updated monthly.',
];

/**
 * Stays → QR Codes & Marketing: the QR cards on hosts' units, how often
 * guests scan them and order, and the stays campaigns staff record with
 * their spend. Making a new card stays on the QR tab, which signs it.
 */
export default async function MarketingPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string; city?: string };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
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

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <DashCard
                title="QR Codes for Stays"
                aside={<CardLink href="/hotels?tab=qr">Make a QR card</CardLink>}
              >
                <DataTable
                  caption="QR codes"
                  isEmpty={codes.length === 0}
                  empty="No host QR cards yet. Make one on the QR tab."
                  head={[
                    'Code',
                    'Unit / Building',
                    'Placement',
                    'Scans',
                    'Orders',
                    'Last Scan',
                    'Print',
                  ]}
                >
                  {codes.map((c) => (
                    <tr key={c.id}>
                      <td className="font-mono font-bold">{c.code}</td>
                      <td>
                        {c.unit_label ?? c.label ?? '—'}
                        {c.property_name && (
                          <span className="text-muted block text-[0.8125rem]">
                            {c.property_name}
                          </span>
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
                          Card
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
                <Footnote>
                  The most-scanned cards. All cards, and new ones, are on the QR tab.
                </Footnote>
              </DashCard>
              <DashCard title="QR Performance">
                {scans === 0 ? (
                  <Empty>No scans in this period.</Empty>
                ) : (
                  <ShareDonut
                    centre={n(scans)}
                    caption="Total Scans"
                    data={byPlacement.map((p, i) => ({
                      key: p.placement,
                      label: label(PLACEMENT_LABEL, p.placement),
                      value: asNumber(p.n),
                      color: PALETTE[i % PALETTE.length],
                    }))}
                  />
                )}
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <DashCard title="Marketing Campaigns">
                <DataTable
                  caption="Campaigns"
                  isEmpty={campaigns.length === 0}
                  empty="No campaigns recorded yet. Add one with the gold button."
                  head={[
                    'Campaign',
                    'Objective',
                    'Channel',
                    'Period',
                    'Spend (KES)',
                    'Results',
                    'Status',
                  ]}
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
                <p className="text-muted mt-4 text-[0.8125rem] font-semibold">
                  Printed fliers, tent cards and plaques come from each code&rsquo;s card.{' '}
                  <Link className="underline" href={staysHref('/stays/units', period, city, {})}>
                    Units
                  </Link>{' '}
                  show which have a card placed.
                </p>
              </DashCard>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
