import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Hourglass,
  Percent,
  RefreshCw,
  XCircle,
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
import { CaseControls, LogCaseButton } from '@/components/stays/client';
import {
  Chip,
  DataTable,
  Empty,
  ErrorNote,
  Fact,
  FilterRow,
  Footnote,
  Funnel,
  MeterRows,
  PriorityChip,
  ShareBars,
  SidePanel,
  StaysHeader,
  WaitingForDatabase,
} from '@/components/stays/module';
import {
  asMaybe,
  asNumber,
  asObject,
  CASE_CATEGORY_LABEL,
  kesFull,
  label,
  n,
  oneOf,
  PAGE_SIZE,
  pageOf,
  pct,
  shareOf,
  shortDate,
  staysHref,
  uuidOrNull,
  when,
} from '@/lib/stays-module';
import { staysContext } from '@/lib/stays-server';

export const metadata: Metadata = { title: 'Stays · Incidents & Disputes' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'Overview' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'disputes', label: 'Disputes' },
  { key: 'claims', label: 'Claims & Refunds' },
  { key: 'escalations', label: 'Escalations' },
] as const;

interface CaseRow {
  id: string;
  ref_text: string;
  case_type: string;
  category: string;
  title: string;
  description: string | null;
  stay_ref: string | null;
  stay_id: string | null;
  property_name: string | null;
  unit_label: string | null;
  reported_by: string;
  parties: string | null;
  amount_kes: number | null;
  priority: string;
  status: string;
  assigned_name: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
  created_at: string;
}

const PALETTE = [
  '#F5A623',
  '#F5C842',
  '#C58BF2',
  '#2F80ED',
  '#9EC5F8',
  '#C9C4B8',
  '#1E9E45',
  '#E5484D',
];

/**
 * Stays → Incidents & Disputes: cases staff log about a stay (property
 * problems, conduct, refunds, damage), how fast they are answered and
 * resolved, and the open ones. SLA targets: first response 1 h, resolution
 * 24 h, escalation 4 h.
 */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    city?: string;
    tab?: string;
    q?: string;
    page?: string;
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
  const page = pageOf(searchParams?.page);
  const selected = uuidOrNull(searchParams?.selected);
  const list = await ctx.read('rpc_console_stays_cases', {
    p_from: period.from,
    p_to: period.to,
    p_tab: tab,
    p_q: q || null,
    p_page: page,
    p_size: PAGE_SIZE,
  });
  const o = asObject(list.data);
  const k = asObject(o.kpis);
  const counts = asObject(o.counts);
  const rows = (Array.isArray(o.rows) ? o.rows : []) as CaseRow[];
  const byCategory = (Array.isArray(o.by_category) ? o.by_category : []) as {
    category: string;
    n: number;
  }[];
  const trend = (Array.isArray(o.trend) ? o.trend : []) as {
    month: string;
    total: number;
    resolved: number;
  }[];
  const openIncidents = (Array.isArray(o.open_incidents) ? o.open_incidents : []) as CaseRow[];
  const openDisputes = (Array.isArray(o.open_disputes) ? o.open_disputes : []) as CaseRow[];
  const total = asNumber(k.total);
  const c =
    rows.find((x) => x.id === selected) ??
    [...openIncidents, ...openDisputes].find((x) => x.id === selected) ??
    null;
  const keep = { tab: tab === 'all' ? null : tab, q: q || null };
  const href = (params: Record<string, string | null>) =>
    staysHref('/stays/incidents', period, city, { ...keep, ...params });

  return (
    <ConsoleShell staff={ctx.staff}>
      <StaysHeader
        screen="Incidents & Disputes"
        subtitle="Problems during stays, disputes between guests and hosts, claims, and how fast they are handled."
        period={period}
        cities={ctx.cities}
        city={city}
        exportHref={staysHref('/stays/export', period, city, { report: 'cases' })}
        action={<LogCaseButton />}
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
                icon={AlertTriangle}
                label="Total Cases"
                value={n(total)}
                explain="Cases logged in the period."
              />
              <DashKpi
                icon={RefreshCw}
                label="Open"
                value={n(asNumber(k.open))}
                explain="Not yet picked up."
              />
              <DashKpi
                icon={Hourglass}
                label="In Progress"
                value={n(asNumber(k.in_progress))}
                explain="Being worked, mediation included."
              />
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Resolved"
                value={n(asNumber(k.resolved))}
                explain="Resolved or closed."
              />
              <DashKpi
                icon={XCircle}
                iconTone="red"
                label="Escalated"
                value={n(asNumber(k.escalated))}
                explain="Escalated to management."
              />
              <DashKpi
                icon={Percent}
                label="Dispute Rate"
                value={pct(shareOf(asNumber(k.disputes), asNumber(k.bookings)))}
                explain="Disputes over bookings checking in during the period."
              />
              <DashKpi
                icon={Clock}
                label="Avg. Resolution Time"
                value={
                  asMaybe(k.avg_resolution_h) == null ? '—' : `${asMaybe(k.avg_resolution_h)} hrs`
                }
                explain="Logged to resolved, for cases resolved."
              />
            </DashKpiGrid>

            <DashCard>
              <GoldTabs
                label="Cases"
                active={tab}
                tabs={TABS.map((t) => ({
                  key: t.key,
                  label: t.label,
                  count: asNumber(counts[t.key]),
                  href: staysHref('/stays/incidents', period, city, {
                    tab: t.key === 'all' ? null : t.key,
                  }),
                }))}
              />
            </DashCard>

            {tab === 'all' ? (
              <>
                <div className="grid gap-4 xl:grid-cols-3">
                  <DashCard title="Cases by Type">
                    {total === 0 ? (
                      <Empty>No cases in this period.</Empty>
                    ) : (
                      <ShareDonut
                        centre={n(total)}
                        caption="Total Cases"
                        data={byCategory.map((b, i) => ({
                          key: b.category,
                          label: label(CASE_CATEGORY_LABEL, b.category),
                          value: asNumber(b.n),
                          color: PALETTE[i % PALETTE.length],
                        }))}
                      />
                    )}
                  </DashCard>
                  <DashCard title="Case Trend">
                    {trend.length === 0 ? (
                      <Empty>No cases in the last six months.</Empty>
                    ) : (
                      <BarLineChart
                        data={trend.map((t) => ({
                          month: t.month,
                          bar: asNumber(t.total),
                          line: asNumber(t.resolved),
                        }))}
                        bar={{ label: 'Total Cases' }}
                        line={{ label: 'Resolved' }}
                      />
                    )}
                  </DashCard>
                  <DashCard title="SLA Performance">
                    <MeterRows
                      empty="No cases to measure yet."
                      rows={[
                        {
                          label: 'First Response (≤ 1 hr)',
                          value: asMaybe(k.first_response_pct),
                          text: pct(asMaybe(k.first_response_pct), 0),
                        },
                        {
                          label: 'Resolution (≤ 24 hrs)',
                          value: asMaybe(k.resolution_pct),
                          text: pct(asMaybe(k.resolution_pct), 0),
                        },
                        {
                          label: 'Escalation (≤ 4 hrs)',
                          value: asMaybe(k.escalation_pct),
                          text: pct(asMaybe(k.escalation_pct), 0),
                        },
                      ].filter(() => total > 0)}
                    />
                    <Footnote>
                      Each is the share of cases that met the target, of those that got that far.
                    </Footnote>
                  </DashCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <DashCard title={`Open Incidents (${openIncidents.length})`}>
                    <DataTable
                      caption="Open incidents"
                      isEmpty={openIncidents.length === 0}
                      empty="No open incidents."
                      head={[
                        '#',
                        'Incident',
                        'Property / Unit',
                        'Reported By',
                        'Priority',
                        'Opened',
                        'Status',
                      ]}
                    >
                      {openIncidents.map((x) => (
                        <tr key={x.id}>
                          <td className="whitespace-nowrap font-semibold">
                            <a className="hover:underline" href={href({ selected: x.id })}>
                              {x.ref_text}
                            </a>
                          </td>
                          <td>{x.title}</td>
                          <td>
                            {[x.property_name, x.unit_label].filter(Boolean).join(' – ') || '—'}
                          </td>
                          <td className="capitalize">{x.reported_by}</td>
                          <td>
                            <PriorityChip priority={x.priority} />
                          </td>
                          <td className="whitespace-nowrap">{when(x.created_at)}</td>
                          <td>
                            <Chip status={x.status} />
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  </DashCard>
                  <DashCard title={`Open Disputes (${openDisputes.length})`}>
                    <DataTable
                      caption="Open disputes"
                      isEmpty={openDisputes.length === 0}
                      empty="No open disputes or claims."
                      head={[
                        '#',
                        'Dispute',
                        'Booking Ref',
                        'Parties',
                        'Amount (KES)',
                        'Opened',
                        'Status',
                      ]}
                    >
                      {openDisputes.map((x) => (
                        <tr key={x.id}>
                          <td className="whitespace-nowrap font-semibold">
                            <a className="hover:underline" href={href({ selected: x.id })}>
                              {x.ref_text}
                            </a>
                          </td>
                          <td>{x.title}</td>
                          <td className="whitespace-nowrap">{x.stay_ref ?? '—'}</td>
                          <td>{x.parties ?? '—'}</td>
                          <td className="tabular-nums">
                            {x.amount_kes != null ? n(x.amount_kes) : '—'}
                          </td>
                          <td className="whitespace-nowrap">{when(x.created_at)}</td>
                          <td>
                            <Chip status={x.status} />
                          </td>
                        </tr>
                      ))}
                    </DataTable>
                  </DashCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <DashCard title="Case Resolution Funnel">
                    <Funnel
                      steps={[
                        { label: 'Cases Reported', value: total },
                        { label: 'Valid & Accepted', value: asNumber(k.valid) },
                        { label: 'Resolved', value: asNumber(k.resolved) },
                        { label: 'Closed', value: asNumber(k.closed) },
                      ]}
                    />
                  </DashCard>
                  <DashCard title="Common Root Causes">
                    <ShareBars
                      empty="No cases yet."
                      rows={byCategory.slice(0, 6).map((b) => ({
                        label: label(CASE_CATEGORY_LABEL, b.category),
                        value: asNumber(b.n),
                        text: pct(shareOf(asNumber(b.n), total), 0),
                      }))}
                    />
                  </DashCard>
                  <DashCard title="Quick Actions">
                    <div className="grid grid-cols-2 gap-2">
                      <LogCaseButton variant="tile" label="Log Incident" defaultType="incident" />
                      <LogCaseButton variant="tile" label="Log Dispute" defaultType="dispute" />
                      <LogCaseButton variant="tile" label="Raise Claim" defaultType="claim" />
                    </div>
                    <Footnote>Escalate a case from its panel.</Footnote>
                  </DashCard>
                </div>
              </>
            ) : (
              <DashCard className="min-w-0">
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search cases"
                    placeholder="Search by case, title or property…"
                  />
                  <DashClear params={['q', 'selected']} />
                </FilterRow>
                <DataTable
                  caption="Cases"
                  isEmpty={rows.length === 0}
                  empty="No cases here."
                  head={[
                    '#',
                    'Case',
                    'Category',
                    'Booking Ref',
                    'Property / Unit',
                    'Amount',
                    'Priority',
                    'Opened',
                    'Status',
                  ]}
                >
                  {rows.map((x) => (
                    <tr key={x.id} className={x.id === selected ? 'bg-[#FFFBF0]' : undefined}>
                      <td className="whitespace-nowrap font-semibold">
                        <a
                          className="hover:underline"
                          href={href({ selected: x.id, page: String(page) })}
                        >
                          {x.ref_text}
                        </a>
                      </td>
                      <td>{x.title}</td>
                      <td>{label(CASE_CATEGORY_LABEL, x.category)}</td>
                      <td className="whitespace-nowrap">{x.stay_ref ?? '—'}</td>
                      <td>{[x.property_name, x.unit_label].filter(Boolean).join(' – ') || '—'}</td>
                      <td className="tabular-nums">
                        {x.amount_kes != null ? kesFull(x.amount_kes) : '—'}
                      </td>
                      <td>
                        <PriorityChip priority={x.priority} />
                      </td>
                      <td className="whitespace-nowrap">{when(x.created_at)}</td>
                      <td>
                        <Chip status={x.status} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={asNumber(o.total)}
                  noun="cases"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
              </DashCard>
            )}

            {c && (
              <SidePanel
                title={`${c.ref_text} · ${c.title}`}
                closeHref={href({ selected: null })}
                badge={<Chip status={c.status} />}
              >
                <div className="grid gap-x-6 sm:grid-cols-2">
                  <div>
                    <Fact label="Category">{label(CASE_CATEGORY_LABEL, c.category)}</Fact>
                    <Fact label="Priority">
                      <PriorityChip priority={c.priority} />
                    </Fact>
                    <Fact label="Reported By">{c.reported_by}</Fact>
                    <Fact label="Parties">{c.parties ?? '—'}</Fact>
                  </div>
                  <div>
                    <Fact label="Booking">{c.stay_ref ?? '—'}</Fact>
                    <Fact label="Amount">{c.amount_kes != null ? kesFull(c.amount_kes) : '—'}</Fact>
                    <Fact label="Owner">{c.assigned_name ?? '—'}</Fact>
                    <Fact label="Opened">{shortDate(c.created_at)}</Fact>
                  </div>
                </div>
                {c.description && (
                  <p className="mt-3 text-[0.9375rem] leading-relaxed">{c.description}</p>
                )}
                {c.resolution && (
                  <p className="bg-bg mt-3 rounded-lg p-3 text-[0.875rem]">
                    <span className="font-bold">Resolution:</span> {c.resolution}
                  </p>
                )}
                <div className="mt-4 max-w-md">
                  <CaseControls caseId={c.id} status={c.status} />
                </div>
              </SidePanel>
            )}
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}
