import {
  BedDouble,
  Building2,
  Coins,
  Gift,
  Share2,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ShareDonut } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import {
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  Pagination,
} from '@/components/portal/dash';
import { DashClear, DashSearch } from '@/components/portal/dash-filters';
import { BarLineChart } from '@/components/stays/charts';
import { AddLeadButton, LeadStatusSelect } from '@/components/stays/client';
import {
  DataTable,
  Empty,
  ErrorNote,
  FilterRow,
  Footnote,
  Funnel,
  PersonCell,
  StaysHeader,
  TypeTag,
  WaitingForDatabase,
} from '@/components/stays/module';
import {
  asNumber,
  asObject,
  delta,
  kesCompact,
  label,
  LEAD_KIND_LABEL,
  LEAD_SOURCE_LABEL,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  pct,
  shareOf,
  staysHref,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Acquisition & Referrals' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'Overview' },
  { key: 'host', label: 'Host Acquisition' },
  { key: 'property_manager', label: 'Property Managers' },
  { key: 'partner', label: 'Partners & Channels' },
  { key: 'referrals', label: 'Referrals' },
] as const;

interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  kind: string;
  source: string;
  property_name: string | null;
  area: string | null;
  units: number | null;
  status: string;
  assigned_name: string | null;
  next_action: string | null;
  created_at: string;
}

const PALETTE = ['#F5A623', '#F5C842', '#C58BF2', '#2F80ED', '#9EC5F8', '#C9C4B8'];

/**
 * Stays → Acquisition & Referrals: hosts, units and buildings that joined in
 * the period, the lead pipeline staff work, where leads came from, and the
 * host referral programme (host_referral).
 */
export default async function AcquisitionPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    q?: string;
    page?: string;
  };
}) {
  const ctx = await staysContext(searchParams);
  const { period, city } = ctx;
  const tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const page = pageOf(searchParams?.page);
  const [list, partners] = await Promise.all([
    ctx.read('rpc_console_stays_acquisition', {
      p_from: period.from,
      p_to: period.to,
      p_city: city,
      p_tab: tab,
      p_q: q || null,
      p_page: page,
      p_size: PAGE_SIZE,
    }),
    ctx.read('rpc_console_stays_partners', { p_tab: 'all', p_q: null }),
  ]);
  const o = asObject(list.data);
  const k = asObject(o.kpis);
  const counts = asObject(o.counts);
  const funnel = asObject(o.funnel);
  const rows = (Array.isArray(o.rows) ? o.rows : []) as LeadRow[];
  const channels = (Array.isArray(o.channels) ? o.channels : []) as { source: string; n: number }[];
  const trend = (Array.isArray(o.unit_trend) ? o.unit_trend : []) as {
    month: string;
    new_units: number;
    cumulative: number;
  }[];
  const referrers = (Array.isArray(o.top_referrers) ? o.top_referrers : []) as {
    id: string;
    name: string;
    kind: string;
    referrals: number;
    conversions: number;
    rewards_kes: number;
  }[];
  const managers = (
    (asObject(partners.data).rows as { id: string; name: string }[] | undefined) ?? []
  ).map((m) => ({ id: m.id, name: m.name }));
  const newHosts = asNumber(k.new_hosts);
  const channelTotal = channels.reduce((s, c) => s + asNumber(c.n), 0);
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/acquisition', period, city, {
      tab: tab === 'all' ? null : tab,
      q: q || null,
      ...params,
    });

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Acquisition & Referrals"
        subtitle="New hosts, units and buildings, the lead pipeline and the referral programme."
        period={period}
        cities={ctx.cities}
        city={city}
        action={<AddLeadButton managers={managers} />}
      />
      <DashCanvas>
        {list.waiting ? (
          <WaitingForDatabase />
        ) : list.error ? (
          <ErrorNote message={list.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-7">
              <DashKpi
                featured
                icon={Users}
                label="New Hosts"
                value={n(newHosts)}
                delta={delta(newHosts, asNumber(k.new_hosts_prev))}
                explain="Host accounts created in the period."
              />
              <DashKpi
                icon={BedDouble}
                label="New Units"
                value={n(asNumber(k.new_units))}
                delta={delta(asNumber(k.new_units), asNumber(k.new_units_prev))}
                explain="Units added in the period."
              />
              <DashKpi
                icon={Building2}
                label="New Properties"
                value={n(asNumber(k.new_properties))}
                explain="Buildings and homes added in the period."
              />
              <DashKpi
                icon={Share2}
                label="Referral Sign-ups"
                value={n(asNumber(k.referral_signups))}
                explain="Referred hosts who signed up."
              />
              <DashKpi
                icon={UserCheck}
                label="Referral Conversions"
                value={n(asNumber(k.referral_conversions))}
                explain="Referred hosts who went live."
              />
              <DashKpi
                icon={Coins}
                label="Acquisition Cost"
                value={
                  newHosts > 0 && asNumber(k.campaign_spend_kes) > 0
                    ? kesCompact(asNumber(k.campaign_spend_kes) / newHosts)
                    : '—'
                }
                explain="Host-acquisition campaign spend in the period over new hosts. A dash until a campaign records spend."
              />
              <DashKpi
                icon={TrendingUp}
                label="Unit Growth"
                value={pct(delta(asNumber(k.new_units), asNumber(k.new_units_prev)))}
                explain="New units against the period of the same length before."
              />
            </DashKpiGrid>

            <DashCard>
              <GoldTabs
                label="Acquisition"
                active={tab}
                tabs={TABS.map((t) => ({
                  key: t.key,
                  label: t.label,
                  count: t.key === 'all' ? null : asNumber(counts[t.key]),
                  href: staysHref('/stays/acquisition', period, city, {
                    tab: t.key === 'all' ? null : t.key,
                  }),
                }))}
              />
            </DashCard>

            <div className="grid gap-4 xl:grid-cols-3">
              <DashCard title="Acquisition Funnel (Leads)">
                {asNumber(funnel.captured) === 0 ? (
                  <Empty>No leads recorded in this period. Add one with Add Lead / Referral.</Empty>
                ) : (
                  <Funnel
                    steps={[
                      { label: 'Leads Captured', value: asNumber(funnel.captured) },
                      { label: 'Qualified Leads', value: asNumber(funnel.qualified) },
                      { label: 'Onboarded', value: asNumber(funnel.onboarded) },
                      { label: 'Activated', value: asNumber(funnel.activated) },
                    ]}
                  />
                )}
              </DashCard>
              <DashCard title="Unit Acquisition Trend">
                {trend.every((t) => asNumber(t.cumulative) === 0) ? (
                  <Empty>No units yet.</Empty>
                ) : (
                  <BarLineChart
                    data={trend.map((t) => ({
                      month: t.month,
                      bar: asNumber(t.new_units),
                      line: asNumber(t.cumulative),
                    }))}
                    bar={{ label: 'New Units' }}
                    line={{ label: 'Cumulative Units' }}
                  />
                )}
              </DashCard>
              <DashCard title="Top Acquisition Channels">
                {channelTotal === 0 ? (
                  <Empty>No leads with a source yet.</Empty>
                ) : (
                  <ShareDonut
                    centre={n(channelTotal)}
                    caption="Leads"
                    data={channels.map((c, i) => ({
                      key: c.source,
                      label: `${label(LEAD_SOURCE_LABEL, c.source)} (${pct(shareOf(asNumber(c.n), channelTotal), 0)})`,
                      value: asNumber(c.n),
                      color: PALETTE[i % PALETTE.length],
                    }))}
                  />
                )}
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
              <DashCard title="Recent Acquisition & Referral Leads" className="min-w-0">
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search leads"
                    placeholder="Search by name, property or phone…"
                  />
                  <DashClear params={['q']} />
                </FilterRow>
                <DataTable
                  caption="Leads"
                  isEmpty={rows.length === 0}
                  empty="No leads in this period."
                  head={[
                    'Name / Company',
                    'Type',
                    'Source / Channel',
                    'Property / Building',
                    'Units',
                    'Status',
                    'Assigned To',
                    'Next Action',
                  ]}
                >
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <PersonCell name={r.name} sub={r.phone ?? undefined} />
                      </td>
                      <td>
                        <TypeTag tone={r.kind === 'partner' ? 'blue' : 'gold'}>
                          {label(LEAD_KIND_LABEL, r.kind)}
                        </TypeTag>
                      </td>
                      <td>{label(LEAD_SOURCE_LABEL, r.source)}</td>
                      <td>
                        {r.property_name ?? '—'}
                        {r.area && (
                          <span className="text-muted block text-[0.8125rem]">{r.area}</span>
                        )}
                      </td>
                      <td className="text-center tabular-nums">{r.units ?? '—'}</td>
                      <td>
                        <LeadStatusSelect leadId={r.id} status={r.status} />
                      </td>
                      <td>{r.assigned_name ?? '—'}</td>
                      <td>{r.next_action ?? '—'}</td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={asNumber(o.total)}
                  noun="leads"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
              </DashCard>

              <div className="grid content-start gap-4">
                <DashCard title="Referral Program">
                  <p className="text-muted mb-3 text-[0.875rem] font-semibold">
                    Hosts share their referral code; NexG rewards them when the host they referred
                    goes live.
                  </p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      [Gift, 'Referrals', n(asNumber(k.referrals))],
                      [
                        UserCheck,
                        `Converted (${pct(shareOf(asNumber(k.referral_conversions), asNumber(k.referrals)), 0)})`,
                        n(asNumber(k.referral_conversions)),
                      ],
                      [Coins, 'Referral Rewards', kesCompact(asNumber(k.referral_rewards_kes))],
                    ].map(([Icon, t, v]) => {
                      const I = Icon as typeof Gift;
                      return (
                        <div key={String(t)} className="rounded-xl bg-[#FFFBF0] p-2">
                          <I aria-hidden="true" className="mx-auto h-5 w-5 text-[#E5A800]" />
                          <p className="text-[1.0625rem] font-extrabold">{String(v)}</p>
                          <p className="text-muted text-[0.75rem] font-semibold">{String(t)}</p>
                        </div>
                      );
                    })}
                  </div>
                </DashCard>
                <DashCard title="Top Referrers">
                  {referrers.length === 0 ? (
                    <Empty>No host has referred anyone yet.</Empty>
                  ) : (
                    <DataTable
                      caption="Top referrers"
                      isEmpty={false}
                      empty=""
                      head={['Referrer', 'Referrals', 'Conversions', 'Rewards (KES)']}
                    >
                      {referrers.map((r, i) => (
                        <tr key={r.id}>
                          <td>
                            <span className="mr-2 font-black text-[#B57A00]">{i + 1}</span>
                            {r.name}
                          </td>
                          <td className="text-center tabular-nums">{n(r.referrals)}</td>
                          <td className="text-center tabular-nums">{n(r.conversions)}</td>
                          <td className="tabular-nums">{n(r.rewards_kes)}</td>
                        </tr>
                      ))}
                    </DataTable>
                  )}
                  <Footnote>All time, from the host referral programme.</Footnote>
                </DashCard>
              </div>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
