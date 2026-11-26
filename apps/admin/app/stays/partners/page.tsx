import {
  BedDouble,
  Building2,
  Coins,
  Handshake,
  Mail,
  Phone,
  UserCheck,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';

import { ConsoleShell } from '@/components/console-shell';
import { DashCanvas, DashCard, DashKpi, DashKpiGrid, GoldTabs } from '@/components/portal/dash';
import { DashClear, DashSearch } from '@/components/portal/dash-filters';
import { AddPartnerButton, PartnerControls } from '@/components/stays/client';
import {
  Chip,
  DataTable,
  ErrorNote,
  Fact,
  FilterRow,
  Footnote,
  PanelHint,
  PersonCell,
  SidePanel,
  StaysHeader,
  TypeTag,
  WaitingForDatabase,
  WithPanel,
} from '@/components/stays/module';
import {
  asNumber,
  asObject,
  kesCompact,
  kesFull,
  label,
  LEAD_STATUS_LABEL,
  n,
  oneOf,
  shortDate,
  staysHref,
  uuidOrNull,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Property Managers & Partners' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Partners' },
  { key: 'property_manager', label: 'Property Managers' },
  { key: 'building_partner', label: 'Building Partners' },
] as const;

interface PartnerRow {
  id: string;
  name: string;
  legal_name: string | null;
  email: string;
  phone: string | null;
  partner_kind: string;
  status: string;
  joined_at: string;
  last_contact_at: string | null;
  assigned_staff: string | null;
  buildings: number;
  units: number;
  leads: number;
  onboarded: number;
  commission_kes: number;
  commission_mtd_kes: number;
  paid_kes: number;
  share_kes: number;
  buildings_list: { id: string; name: string; area: string | null }[];
  recent_leads: { name: string; status: string; property: string | null }[];
}

/**
 * Stays → Property Managers & Partners: the people who bring buildings and
 * hosts to NexG, what they manage and their share of NexG's commission
 * (the stays.pm_share_pct setting, after VAT).
 */
export default async function PartnersPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    q?: string;
    selected?: string;
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
  const selected = uuidOrNull(searchParams?.selected);
  const list = await ctx.read('rpc_console_stays_partners', { p_tab: tab, p_q: q || null });
  const o = asObject(list.data);
  const k = asObject(o.kpis);
  const counts = asObject(o.counts);
  const rows = (Array.isArray(o.rows) ? o.rows : []) as PartnerRow[];
  const share = asNumber(o.share_pct);
  const vat = asNumber(o.vat_pct);
  const p = rows.find((r) => r.id === selected) ?? null;
  const keep = { tab: tab === 'all' ? null : tab, q: q || null };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/partners', period, city, { ...keep, ...params });

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Property Managers & Partners"
        subtitle="Property managers and building partners, what they manage and what they earn."
        period={period}
        cities={ctx.cities}
        city={city}
        noPeriod
        exportHref={staysHref('/stays/export', period, city, { report: 'managers' })}
        action={<AddPartnerButton />}
      />
      <DashCanvas>
        {list.waiting ? (
          <WaitingForDatabase />
        ) : list.error ? (
          <ErrorNote message={list.error} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-6">
              <DashKpi
                featured
                icon={Handshake}
                label="Total Partners"
                value={n(asNumber(k.partners))}
                explain="Property managers and building partners."
              />
              <DashKpi
                icon={Building2}
                label="Buildings Under Management"
                value={n(asNumber(k.buildings))}
                explain="Buildings linked to a partner."
              />
              <DashKpi
                icon={BedDouble}
                label="Total Units"
                value={n(asNumber(k.units))}
                explain="Units in those buildings."
              />
              <DashKpi
                icon={Users}
                label="Leads to Hosts"
                value={n(asNumber(k.leads))}
                explain="Leads recorded as brought by a partner."
              />
              <DashKpi
                icon={UserCheck}
                label="Onboarded Hosts"
                value={n(asNumber(k.onboarded))}
                explain="Those leads that became active hosts."
              />
              <DashKpi
                icon={Coins}
                label="Partner Commission (MTD)"
                value={kesCompact(asNumber(k.share_mtd_kes))}
                explain={`${share}% of NexG's commission after ${vat}% VAT, on stays in partners' buildings this month.`}
              />
            </DashKpiGrid>

            <WithPanel
              panel={
                p ? (
                  <SidePanel
                    title={p.name}
                    closeHref={href({ selected: null })}
                    badge={<Chip status={p.status} />}
                  >
                    <PersonCell
                      name={p.name}
                      sub={`${p.partner_kind === 'building_partner' ? 'Building Partner' : 'Property Manager'}${p.legal_name ? ` · ${p.legal_name}` : ''}`}
                    />
                    <div className="mt-3">
                      <Fact icon={Phone} label="Phone">
                        {p.phone ?? '—'}
                      </Fact>
                      <Fact icon={Mail} label="Email">
                        {p.email}
                      </Fact>
                      <Fact label="Partner Since">{shortDate(p.joined_at)}</Fact>
                      <Fact label="Assigned Staff">{p.assigned_staff ?? '—'}</Fact>
                      <Fact label="Last Contact">{shortDate(p.last_contact_at)}</Fact>
                    </div>
                    <div className="my-3 grid grid-cols-3 gap-2 text-center">
                      {[
                        ['Buildings', p.buildings],
                        ['Total Units', p.units],
                        ['Hosts (Leads → Onboarded)', `${p.leads} → ${p.onboarded}`],
                      ].map(([t, v]) => (
                        <div key={String(t)} className="bg-bg rounded-xl p-2">
                          <p className="text-[1.125rem] font-extrabold">{v}</p>
                          <p className="text-muted text-[0.75rem] font-semibold">{t}</p>
                        </div>
                      ))}
                    </div>
                    <h3 className="text-[0.9375rem] font-extrabold">Buildings</h3>
                    <p className="text-muted mb-2 text-[0.8125rem] font-semibold">
                      {p.buildings_list.length > 0
                        ? p.buildings_list.map((b) => b.name).join(' · ')
                        : 'None linked yet. Link a building on Buildings & Properties.'}
                    </p>
                    <h3 className="text-[0.9375rem] font-extrabold">Recent Host Leads</h3>
                    {p.recent_leads.length === 0 ? (
                      <p className="text-muted mb-2 text-[0.8125rem] font-semibold">
                        No leads recorded from this partner.
                      </p>
                    ) : (
                      <ul className="mb-2">
                        {p.recent_leads.map((l, i) => (
                          <li key={i} className="flex justify-between gap-2 py-1 text-[0.875rem]">
                            <span className="font-semibold">
                              {l.name}
                              {l.property ? `, ${l.property}` : ''}
                            </span>
                            <Chip status={l.status} text={label(LEAD_STATUS_LABEL, l.status)} />
                          </li>
                        ))}
                      </ul>
                    )}
                    <h3 className="text-[0.9375rem] font-extrabold">Commission Summary</h3>
                    <Fact label="Eligible Commission">{kesFull(p.commission_kes)}</Fact>
                    <Fact label={`Partner Share (${share}%)`}>{kesFull(p.share_kes)}</Fact>
                    <Fact label="Paid to Date">{kesFull(p.paid_kes)}</Fact>
                    <Fact label="Outstanding">
                      {kesFull(Math.max(0, p.share_kes - p.paid_kes))}
                    </Fact>
                    <div className="mt-3">
                      <PartnerControls id={p.id} status={p.status} />
                    </div>
                  </SidePanel>
                ) : (
                  <PanelHint>
                    Choose a partner to see their buildings, leads and commission.
                  </PanelHint>
                )
              }
            >
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Partner type"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    count: asNumber(counts[t.key]),
                    href: staysHref('/stays/partners', period, city, {
                      tab: t.key === 'all' ? null : t.key,
                      q: q || null,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search partners"
                    placeholder="Search by name, company or email…"
                  />
                  <DashClear params={['q', 'tab', 'selected']} />
                </FilterRow>
                <DataTable
                  caption="Partners"
                  isEmpty={rows.length === 0}
                  empty="No partners yet. Add one with Add Partner."
                  head={[
                    'Partner / Manager',
                    'Phone',
                    'Role',
                    'Buildings',
                    'Total Units',
                    'Hosts (Leads → Onboarded)',
                    'Status',
                    'Last Contact',
                  ]}
                >
                  {rows.map((r) => (
                    <tr key={r.id} className={r.id === selected ? 'bg-[#FFFBF0]' : undefined}>
                      <td>
                        <PersonCell
                          name={r.name}
                          sub={r.legal_name ?? undefined}
                          href={href({ selected: r.id })}
                        />
                      </td>
                      <td className="whitespace-nowrap">{r.phone ?? '—'}</td>
                      <td>
                        <TypeTag tone={r.partner_kind === 'building_partner' ? 'blue' : 'gold'}>
                          {r.partner_kind === 'building_partner'
                            ? 'Building Partner'
                            : 'Property Manager'}
                        </TypeTag>
                      </td>
                      <td className="text-center tabular-nums">{n(r.buildings)}</td>
                      <td className="text-center tabular-nums">{n(r.units)}</td>
                      <td className="text-center tabular-nums">
                        {n(r.leads)} → {n(r.onboarded)}
                      </td>
                      <td>
                        <Chip status={r.status} />
                      </td>
                      <td className="whitespace-nowrap">{shortDate(r.last_contact_at)}</td>
                    </tr>
                  ))}
                </DataTable>
                <Footnote>
                  A partner&rsquo;s share is {share}% of NexG&rsquo;s commission after {vat}% VAT,
                  on stays in the buildings they manage. Both are set in Stays Configuration.
                </Footnote>
              </DashCard>
            </WithPanel>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
