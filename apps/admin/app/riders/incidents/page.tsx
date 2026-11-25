import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gavel,
  Layers,
  RefreshCcw,
  Timer,
  Trophy,
  UserCheck,
  Zap,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ShareDonut, TrendArea } from '@/components/charts';
import { ConsoleShell } from '@/components/console-shell';
import {
  DashCanvas,
  DashCard,
  DashKpi,
  DashKpiGrid,
  GoldTabs,
  Pagination,
} from '@/components/portal/dash';
import { DashClear, DashSearch, DashSelect } from '@/components/portal/dash-filters';
import {
  CaseChip,
  DataTable,
  ErrorNote,
  FilterRow,
  Footnote,
  MeterRows,
  PriorityChip,
  RiderCell,
  ScreenHeader,
  WaitingForDatabase,
  ZoneChip,
} from '@/components/riders/module';
import { CaseRowMenu, CreateCase } from '@/components/riders/module-client';
import { periodFrom } from '@/lib/portal';
import {
  asMaybe,
  asNumber,
  asObject,
  CASE_REASON_LABEL,
  CASE_TYPE_LABEL,
  caseRef,
  delta,
  hours,
  isMissingFunction,
  n,
  oneOf,
  OUTCOME_LABEL,
  PAGE_SIZE,
  pageOf,
  paged,
  pct,
  ppDelta,
  PRIORITY_LABEL,
  REPORTER_LABEL,
  screenHref,
  shareOf,
  slaLeft,
  when,
  type RiderFact,
} from '@/lib/riders-module';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Incidents & Disputes' };
export const dynamic = 'force-dynamic';

const TABS = [
  { key: 'all', label: 'All Cases', icon: Layers },
  { key: 'open', label: 'Open', icon: Clock },
  { key: 'in_progress', label: 'In Progress', icon: RefreshCcw },
  { key: 'resolved', label: 'Resolved', icon: CheckCircle2 },
  { key: 'escalated', label: 'Escalated', icon: AlertTriangle },
] as const;
type Tab = (typeof TABS)[number]['key'];

const TYPE_COLOUR: Record<string, string> = {
  delivery_dispute: '#F5B400',
  payment_earnings: '#2F80ED',
  customer_conduct: '#1E9E45',
  rider_conduct: '#7C3AED',
  order_item: '#E5484D',
  safety: '#E8730C',
  other: '#C9C4B8',
};
const OUTCOME_COLOUR: Record<string, string> = {
  resolved: '#1E9E45',
  no_issue: '#2F80ED',
  compensated: '#F5B400',
  penalized: '#E5484D',
  unresolved: '#C9C4B8',
};

const option = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));

interface CaseRow {
  id: string;
  order_reference: string | null;
  case_type: string;
  reason: string | null;
  reported_by: string;
  rider_id: string | null;
  rider: string | null;
  zone: string | null;
  status: string;
  bucket: string;
  priority: string;
  created_at: string;
  sla_due_at: string;
  resolved_at: string | null;
  outcome: string | null;
  assignee_id: string | null;
  assignee: string | null;
  description: string | null;
}

/**
 * Riders → Incidents & Disputes: every incident and dispute about a rider
 * or a delivery (public.incident, with the case fields of 20270324000200),
 * read by rpc_console_riders_cases. Create, assign, start, escalate and
 * resolve go through audited RPCs; the case page keeps the notes.
 */
export default async function RiderIncidentsPage({
  searchParams,
}: {
  searchParams?: {
    from?: string;
    to?: string;
    tab?: string;
    q?: string;
    type?: string;
    priority?: string;
    page?: string;
  };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'riders');
  const supabase = createClient();

  const period = periodFrom(searchParams);
  const tab: Tab = oneOf(
    TABS.map((t) => t.key),
    searchParams?.tab,
    'all',
  );
  const q = (searchParams?.q ?? '').slice(0, 120);
  const pick = (v: string | undefined) => (v && v !== 'all' ? v : null);
  const type = pick(searchParams?.type);
  const priority = pick(searchParams?.priority);
  const page = pageOf(searchParams?.page);

  const [readQ, ridersQ] = await Promise.all([
    supabase.rpc('rpc_console_riders_cases', {
      p_from: period.from,
      p_to: period.to,
      p_tab: tab,
      p_q: q || undefined,
      p_type: type ?? undefined,
      p_priority: priority ?? undefined,
      p_page: page,
      p_size: PAGE_SIZE,
    }),
    supabase.rpc('rpc_console_riders_list', {
      p_from: period.from,
      p_to: period.to,
      p_sort: 'name',
      p_size: 1000,
    }),
  ]);
  const waiting = isMissingFunction(readQ.error);
  const o = asObject(readQ.data);
  const k = asObject(o.kpis);
  const daily = (Array.isArray(o.daily) ? o.daily : []) as { day: string; cases: number }[];
  const byType = asObject(o.by_type);
  const outcomes = asObject(o.outcomes);
  const reasons = (Array.isArray(o.reasons) ? o.reasons : []) as { reason: string; n: number }[];
  const list = paged<CaseRow>(readQ.data);
  const riders = paged<RiderFact>(ridersQ.data).rows.map((r) => ({ id: r.rider_id, name: r.name }));

  const total = asNumber(k.total);
  const outcomeTotal = Object.values(outcomes).reduce<number>((s, v) => s + asNumber(v), 0);
  const reasonTotal = reasons.reduce((s, r) => s + asNumber(r.n), 0);
  const keep = { q: q || null, type, priority };
  const href = (params: Record<string, string | null | undefined>) =>
    screenHref('/riders/incidents', period, {
      tab: tab === 'all' ? null : tab,
      ...keep,
      ...params,
    });

  return (
    <ConsoleShell staff={staff}>
      <ScreenHeader
        title="Riders – Incidents & Disputes"
        subtitle="Manage rider-related incidents, delivery disputes, and resolution workflows."
        period={period}
        exportHref={screenHref('/riders/export', period, { view: 'cases', tab, ...keep })}
        action={<CreateCase riders={riders} />}
      />
      <DashCanvas>
        {waiting ? (
          <WaitingForDatabase />
        ) : readQ.error ? (
          <ErrorNote message={readQ.error.message} />
        ) : (
          <>
            <DashKpiGrid className="xl:grid-cols-7">
              <DashKpi
                featured
                icon={Layers}
                label="Total Cases"
                value={n(total)}
                delta={delta(total, asNumber(k.total_prev))}
                explain="Cases opened in the period."
              />
              <DashKpi
                icon={Clock}
                label="Open"
                value={n(asNumber(k.open))}
                explain="Not started yet."
              >
                <Sub text={pct(shareOf(asNumber(k.open), total))} />
              </DashKpi>
              <DashKpi
                icon={RefreshCcw}
                label="In Progress"
                value={n(asNumber(k.in_progress))}
                explain="Somebody is working on it."
              >
                <Sub text={pct(shareOf(asNumber(k.in_progress), total))} />
              </DashKpi>
              <DashKpi
                icon={CheckCircle2}
                iconTone="green"
                label="Resolved"
                value={n(asNumber(k.resolved))}
                explain="Resolved or closed."
              >
                <Sub text={pct(shareOf(asNumber(k.resolved), total))} />
              </DashKpi>
              <DashKpi
                icon={AlertTriangle}
                iconTone="red"
                label="Escalated"
                value={n(asNumber(k.escalated))}
                explain="Escalated and not resolved yet."
              >
                <Sub text={pct(shareOf(asNumber(k.escalated), total))} />
              </DashKpi>
              <DashKpi
                icon={Timer}
                label="Avg. Resolution Time"
                value={hours(asMaybe(k.resolution_hours))}
                delta={delta(asMaybe(k.resolution_hours), asMaybe(k.resolution_hours_prev))}
                upIsBad
                explain="Opened to resolved, for cases resolved."
              />
              <DashKpi
                icon={Trophy}
                label="Resolution Rate"
                value={pct(asMaybe(k.resolution_pct))}
                deltaText={ppDelta(asMaybe(k.resolution_pct), asMaybe(k.resolution_pct_prev))}
                explain="Cases opened in the period that are resolved."
              />
            </DashKpiGrid>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <DashCard title="Cases Trend">
                {daily.some((d) => asNumber(d.cases) > 0) ? (
                  <TrendArea
                    height={220}
                    data={daily.map((d) => ({ day: d.day.slice(0, 10), cases: asNumber(d.cases) }))}
                    series={[{ key: 'cases', label: 'Cases', color: '#F5B400' }]}
                  />
                ) : (
                  <p className="text-muted py-12 text-center text-sm font-semibold">
                    No cases in this period.
                  </p>
                )}
              </DashCard>
              <DashCard title="Cases by Type">
                {total === 0 ? (
                  <p className="text-muted py-12 text-center text-sm font-semibold">
                    No cases in this period.
                  </p>
                ) : (
                  <ShareDonut
                    stacked
                    centre={n(total)}
                    caption="Cases"
                    data={Object.keys(CASE_TYPE_LABEL)
                      .filter((t) => asNumber(byType[t]) > 0)
                      .map((t) => ({
                        key: t,
                        label: `${CASE_TYPE_LABEL[t]} · ${pct(shareOf(asNumber(byType[t]), total))}`,
                        value: asNumber(byType[t]),
                        color: TYPE_COLOUR[t],
                      }))}
                  />
                )}
              </DashCard>
              <DashCard title="Case Outcomes">
                {outcomeTotal === 0 ? (
                  <p className="text-muted py-12 text-center text-sm font-semibold">
                    Nothing resolved in this period yet.
                  </p>
                ) : (
                  <ShareDonut
                    stacked
                    centre={pct(asMaybe(k.resolution_pct))}
                    caption="Resolution"
                    data={Object.keys(OUTCOME_LABEL)
                      .filter((t) => asNumber(outcomes[t]) > 0)
                      .map((t) => ({
                        key: t,
                        label: `${OUTCOME_LABEL[t]} · ${pct(shareOf(asNumber(outcomes[t]), outcomeTotal))}`,
                        value: asNumber(outcomes[t]),
                        color: OUTCOME_COLOUR[t],
                      }))}
                  />
                )}
              </DashCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
              <DashCard className="min-w-0">
                <GoldTabs
                  label="Cases"
                  active={tab}
                  className="mb-4"
                  tabs={TABS.map((t) => ({
                    key: t.key,
                    label: t.label,
                    icon: t.icon,
                    count: list.counts[t.key] ?? 0,
                    href: screenHref('/riders/incidents', period, {
                      tab: t.key === 'all' ? null : t.key,
                      ...keep,
                    }),
                  }))}
                />
                <FilterRow>
                  <DashSearch
                    value={q}
                    label="Search cases"
                    placeholder="Search order ID, rider, case ID or what happened…"
                  />
                  <DashSelect
                    label="Type"
                    param="type"
                    value={type ?? 'all'}
                    options={option(CASE_TYPE_LABEL)}
                  />
                  <DashSelect
                    label="Priority"
                    param="priority"
                    value={priority ?? 'all'}
                    options={option(PRIORITY_LABEL)}
                  />
                  <DashClear params={['q', 'type', 'priority', 'tab']} />
                </FilterRow>
                <DataTable
                  caption="Cases"
                  isEmpty={list.rows.length === 0}
                  empty="No cases match."
                  head={[
                    'Case ID',
                    'Order ID',
                    'Type',
                    'Reported By',
                    'Rider',
                    'Zone',
                    'Status',
                    'Priority',
                    'Created',
                    'SLA',
                    <span key="a" className="sr-only">
                      Actions
                    </span>,
                  ]}
                >
                  {list.rows.map((c) => {
                    const sla = slaLeft(c.sla_due_at);
                    return (
                      <tr key={c.id}>
                        <td className="whitespace-nowrap font-bold">
                          <Link href={`/riders/incidents/${c.id}`} className="hover:underline">
                            {caseRef(c.id)}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap">{c.order_reference ?? '—'}</td>
                        <td className="whitespace-nowrap">
                          {CASE_TYPE_LABEL[c.case_type] ?? c.case_type}
                        </td>
                        <td>{REPORTER_LABEL[c.reported_by] ?? c.reported_by}</td>
                        <td>
                          {c.rider ? (
                            <RiderCell id={c.rider_id} name={c.rider} />
                          ) : (
                            <span className="text-muted">No rider</span>
                          )}
                        </td>
                        <td>
                          <ZoneChip name={c.zone} />
                        </td>
                        <td>
                          <CaseChip bucket={c.bucket} />
                        </td>
                        <td>
                          <PriorityChip priority={c.priority} />
                        </td>
                        <td className="whitespace-nowrap">{when(c.created_at)}</td>
                        <td className="whitespace-nowrap">
                          {c.bucket === 'resolved' ? (
                            <span className="text-muted">
                              {c.outcome ? OUTCOME_LABEL[c.outcome] : 'Done'}
                            </span>
                          ) : (
                            <span
                              className={`rounded-md px-2 py-1 text-[0.8125rem] font-bold ${
                                sla.late
                                  ? 'bg-[#FDE7E5] text-[#C62D22]'
                                  : 'bg-[#FFF1C7] text-[#9A6700]'
                              }`}
                            >
                              {sla.text}
                            </span>
                          )}
                        </td>
                        <td>
                          <CaseRowMenu
                            caseId={c.id}
                            label={caseRef(c.id)}
                            bucket={c.bucket}
                            assigned={!!c.assignee_id}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
                <Pagination
                  page={page}
                  size={PAGE_SIZE}
                  total={list.total}
                  noun="cases"
                  href={(p) => href({ page: p > 1 ? String(p) : null })}
                />
                <Footnote>
                  SLA: time left to resolve, set by priority (urgent 1 h, high 4 h, medium 24 h, low
                  72 h).
                </Footnote>
              </DashCard>

              <div className="grid content-start gap-4">
                <DashCard title="Top Incident Reasons">
                  <MeterRows
                    empty="No reasons recorded in this period."
                    rows={reasons.map((r) => {
                      const v = shareOf(asNumber(r.n), reasonTotal);
                      return {
                        label: CASE_REASON_LABEL[r.reason] ?? r.reason,
                        value: v,
                        text: pct(v),
                        tone: 'gold' as const,
                      };
                    })}
                  />
                </DashCard>
                <DashCard title="Quick Actions">
                  <ul className="space-y-2.5">
                    <QuickLink
                      icon={UserCheck}
                      href={href({ tab: 'open', page: null })}
                      text={`Assign cases (${n(asNumber(k.unassigned))} unassigned)`}
                    />
                    <QuickLink
                      icon={Gavel}
                      href={href({ tab: 'in_progress', page: null })}
                      text="Apply a resolution"
                    />
                    <QuickLink
                      icon={Zap}
                      href={href({ tab: 'all', page: null })}
                      text={`Past SLA: ${n(asNumber(k.overdue))}`}
                    />
                  </ul>
                  <Footnote>
                    Assign, start, escalate and resolve from each row&apos;s menu.
                  </Footnote>
                </DashCard>
              </div>
            </div>
          </>
        )}
      </DashCanvas>
    </ConsoleShell>
  );
}

function Sub({ text }: { text: string }) {
  return (
    <span className="text-ink mt-2 block text-[0.9375rem] font-extrabold tabular-nums">
      ({text})
    </span>
  );
}

function QuickLink({ icon: Icon, href, text }: { icon: typeof Zap; href: string; text: string }) {
  return (
    <li>
      <Link
        href={href}
        className="border-border hover:bg-bg flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 font-semibold"
      >
        <span className="flex items-center gap-2.5">
          <Icon aria-hidden="true" className="h-5 w-5 text-[#E5A800]" />
          {text}
        </span>
        <span aria-hidden="true">›</span>
      </Link>
    </li>
  );
}
