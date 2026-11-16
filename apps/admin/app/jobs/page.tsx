import { Briefcase, Building2, CircleAlert, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ConsoleHeader } from '@/components/console-header';
import { Kpi, KpiGrid, Panel, PillTabs } from '@/components/console-kit';
import { ConsoleShell } from '@/components/console-shell';
import { TakedownForm } from '@/components/jobs/takedown-form';
import { requireModule, requireStaff } from '@/lib/staff';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Job board' };
export const dynamic = 'force-dynamic';

interface JobRow {
  id: string;
  title: string;
  category: string;
  job_type: string;
  status: 'draft' | 'open' | 'closed';
  city_name: string;
  currency: string;
  area: string | null;
  openings: number;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: string | null;
  description: string;
  requirements: string | null;
  posted_at: string | null;
  closes_on: string | null;
  closed_at: string | null;
  created_at: string;
  taken_down_at: string | null;
  taken_down_reason: string | null;
  employer_kind: 'merchant' | 'host' | 'hotel';
  employer_id: string;
  employer_name: string;
  employer_status: string;
  on_board: boolean;
  applicants: number;
  applicants_new: number;
  hired: number;
}

const TABS = [
  { key: 'board', label: 'On the board' },
  { key: 'taken', label: 'Taken down' },
  { key: 'closed', label: 'Closed' },
  { key: 'drafts', label: 'Drafts' },
  { key: 'employers', label: 'Employers' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const KIND: Record<JobRow['employer_kind'], string> = {
  merchant: 'Merchant',
  host: 'Host',
  hotel: 'Hotel',
};

const JOB_TYPE: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  temporary: 'Temporary',
  gig: 'Gig',
  internship: 'Internship',
};

/* A live merchant or host, or a partner hotel, may publish. */
const verified = (row: Pick<JobRow, 'employer_kind' | 'employer_status'>) =>
  row.employer_kind === 'hotel'
    ? row.employer_status === 'partner'
    : row.employer_status === 'live';

const day = (iso: string | null) =>
  iso
    ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('en-KE', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';

function pay(row: JobRow): string | null {
  if (row.salary_min == null && row.salary_max == null) return null;
  const n = (v: number) => v.toLocaleString('en-KE');
  const range =
    row.salary_min != null && row.salary_max != null
      ? `${n(row.salary_min)} – ${n(row.salary_max)}`
      : row.salary_min != null
        ? `from ${n(row.salary_min)}`
        : `up to ${n(row.salary_max!)}`;
  return `${row.currency} ${range}${row.salary_period ? ` / ${row.salary_period}` : ''}`;
}

function inTab(row: JobRow, tab: Tab): boolean {
  if (tab === 'board') return row.on_board;
  if (tab === 'taken') return row.taken_down_at !== null;
  if (tab === 'closed') return row.status === 'closed' && row.taken_down_at === null;
  if (tab === 'drafts') return row.status === 'draft';
  return true;
}

function state(row: JobRow): { label: string; tone: string } {
  if (row.taken_down_at) return { label: 'Taken down', tone: 'bg-danger-bg text-danger' };
  if (row.on_board) return { label: 'On the board', tone: 'bg-success-bg text-success' };
  if (row.status === 'open')
    return { label: 'Open, not shown', tone: 'bg-warning-bg text-warning' };
  if (row.status === 'draft') return { label: 'Draft', tone: 'bg-bg text-muted' };
  return { label: 'Closed', tone: 'bg-bg text-muted-light' };
}

const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://nexgapp.com');

/**
 * Growth → Job board: the jobs businesses on NexG post on /careers.
 *
 * Staff see every job in the cities they look after, with its business and
 * how many people applied, and take a job down with a reason the business
 * reads. A take-down sticks until it is lifted here. Applicants' names,
 * contact details and CVs are not on this page: they are for the business
 * they applied to, and console_vacancy_v carries counts only.
 */
export default async function JobBoardPage({
  searchParams,
}: {
  searchParams?: { tab?: string; q?: string; selected?: string };
}) {
  const staff = await requireStaff();
  requireModule(staff, 'job_board');

  const tab: Tab = TABS.some((t) => t.key === searchParams?.tab)
    ? (searchParams!.tab as Tab)
    : 'board';
  const q = (searchParams?.q ?? '').trim().toLowerCase();

  const { data, error } = await createClient()
    .from('console_vacancy_v')
    .select(
      'id, title, category, job_type, status, city_name, currency, area, openings, salary_min, salary_max, salary_period, description, requirements, posted_at, closes_on, closed_at, created_at, taken_down_at, taken_down_reason, employer_kind, employer_id, employer_name, employer_status, on_board, applicants, applicants_new, hired',
    )
    .order('created_at', { ascending: false })
    .limit(1000);

  const rows = (data as JobRow[] | null) ?? [];
  const matching = rows.filter(
    (r) => !q || `${r.title} ${r.employer_name} ${r.city_name}`.toLowerCase().includes(q),
  );
  const listed = matching.filter((r) => inTab(r, tab));
  const selected = rows.find((r) => r.id === searchParams?.selected) ?? null;

  const counts = Object.fromEntries(
    TABS.map((t) => [
      t.key,
      t.key === 'employers' ? null : rows.filter((r) => inTab(r, t.key)).length,
    ]),
  ) as Record<Tab, number | null>;

  /* One row per business with jobs. */
  const employers = [
    ...matching
      .reduce((map, r) => {
        const key = `${r.employer_kind}:${r.employer_id}`;
        const e = map.get(key) ?? {
          key,
          name: r.employer_name,
          kind: r.employer_kind,
          status: r.employer_status,
          verified: verified(r),
          onBoard: 0,
          jobs: 0,
          applicants: 0,
          takenDown: 0,
        };
        e.jobs += 1;
        e.onBoard += r.on_board ? 1 : 0;
        e.applicants += r.applicants;
        e.takenDown += r.taken_down_at ? 1 : 0;
        return map.set(key, e);
      }, new Map<string, { key: string; name: string; kind: JobRow['employer_kind']; status: string; verified: boolean; onBoard: number; jobs: number; applicants: number; takenDown: number }>())
      .values(),
  ].sort((a, b) => b.onBoard - a.onBoard || b.jobs - a.jobs);

  const href = (params: { tab?: Tab; selected?: string | null }) => {
    const query = new URLSearchParams();
    query.set('tab', params.tab ?? tab);
    if (q) query.set('q', q);
    if (params.selected) query.set('selected', params.selected);
    return `/jobs?${query.toString()}`;
  };

  return (
    <ConsoleShell staff={staff} current="/jobs">
      <ConsoleHeader
        title="Job board"
        breadcrumb="Jobs businesses on NexG post on the public Careers page · take one down with a reason the business reads"
      />

      <main className="space-y-5 px-4 py-6 sm:px-8">
        {error ? (
          <Panel title="Not switched on yet">
            <p className="text-muted text-sm font-semibold">
              The job board&rsquo;s database changes have not been applied to this environment yet.
            </p>
          </Panel>
        ) : (
          <>
            <KpiGrid>
              <Kpi
                icon={Briefcase}
                label="On the board"
                value={String(counts.board ?? 0)}
                featured
                href={href({ tab: 'board' })}
              />
              <Kpi
                icon={Users}
                label="Applications in progress"
                value={String(rows.reduce((sum, r) => sum + r.applicants, 0))}
              />
              <Kpi
                icon={Building2}
                label="Businesses hiring"
                value={String(
                  new Set(rows.filter((r) => r.on_board).map((r) => r.employer_id)).size,
                )}
                href={href({ tab: 'employers' })}
              />
              <Kpi
                icon={CircleAlert}
                label="Taken down"
                value={String(counts.taken ?? 0)}
                href={href({ tab: 'taken' })}
              />
            </KpiGrid>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <PillTabs
                tabs={TABS.map((t) => ({
                  href: href({ tab: t.key }),
                  label: t.label,
                  count: counts[t.key],
                  active: tab === t.key,
                }))}
              />
              <form action="/jobs" method="get" role="search" className="flex gap-2">
                <input type="hidden" name="tab" value={tab} />
                <label className="sr-only" htmlFor="job-search">
                  Search jobs and businesses
                </label>
                <input
                  id="job-search"
                  name="q"
                  type="search"
                  defaultValue={searchParams?.q ?? ''}
                  placeholder="Job, business or city"
                  className="border-border-strong bg-surface h-10 w-56 rounded-lg border px-3 text-sm font-semibold"
                />
                <button
                  type="submit"
                  className="bg-ink h-10 rounded-lg px-4 text-sm font-bold text-white"
                >
                  Search
                </button>
              </form>
            </div>

            <div
              className={`grid gap-5 ${selected && tab !== 'employers' ? 'xl:grid-cols-[minmax(0,1fr)_26rem]' : ''}`}
            >
              {tab === 'employers' ? (
                <Panel title="Businesses with jobs" aside={`${employers.length}`}>
                  {employers.length === 0 ? (
                    <p className="text-muted-light py-6 text-center text-sm font-semibold">
                      No business has posted a job yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[0.8125rem]">
                        <thead className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                          <tr className="border-border border-b">
                            <th className="py-2 pr-4">Business</th>
                            <th className="py-2 pr-4">Kind</th>
                            <th className="py-2 pr-4">Verified</th>
                            <th className="py-2 pr-4 text-right">On the board</th>
                            <th className="py-2 pr-4 text-right">All jobs</th>
                            <th className="py-2 pr-4 text-right">Applicants</th>
                            <th className="py-2 text-right">Taken down</th>
                          </tr>
                        </thead>
                        <tbody>
                          {employers.map((e) => (
                            <tr
                              key={e.key}
                              className="border-border border-b font-semibold last:border-0"
                            >
                              <td className="py-2.5 pr-4 font-bold">{e.name}</td>
                              <td className="py-2.5 pr-4">{KIND[e.kind]}</td>
                              <td className="py-2.5 pr-4">
                                {e.verified ? (
                                  <span className="text-success">Verified</span>
                                ) : (
                                  <span className="text-warning">Not yet ({e.status})</span>
                                )}
                              </td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">{e.onBoard}</td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">{e.jobs}</td>
                              <td className="py-2.5 pr-4 text-right tabular-nums">
                                {e.applicants}
                              </td>
                              <td className="py-2.5 text-right tabular-nums">
                                {e.takenDown || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              ) : (
                <Panel title={TABS.find((t) => t.key === tab)!.label} aside={`${listed.length}`}>
                  {listed.length === 0 ? (
                    <p className="text-muted-light py-6 text-center text-sm font-semibold">
                      {q ? 'No job matches that search.' : 'Nothing here.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[0.8125rem]">
                        <thead className="text-muted-light text-[0.6875rem] font-extrabold uppercase tracking-wide">
                          <tr className="border-border border-b">
                            <th className="py-2 pr-4">Job</th>
                            <th className="py-2 pr-4">Business</th>
                            <th className="py-2 pr-4">City</th>
                            <th className="py-2 pr-4 text-right">Applicants</th>
                            <th className="py-2 pr-4">Posted</th>
                            <th className="py-2">State</th>
                          </tr>
                        </thead>
                        <tbody>
                          {listed.map((r) => {
                            const s = state(r);
                            return (
                              <tr
                                key={r.id}
                                className={`border-border border-b font-semibold last:border-0 ${
                                  selected?.id === r.id ? 'bg-gold-soft' : ''
                                }`}
                              >
                                <td className="py-2.5 pr-4">
                                  <Link
                                    href={href({ selected: r.id })}
                                    className="font-bold underline-offset-2 hover:underline"
                                  >
                                    {r.title}
                                  </Link>
                                  <span className="text-muted-light block text-[0.6875rem]">
                                    {JOB_TYPE[r.job_type] ?? r.job_type}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4">
                                  {r.employer_name}
                                  <span className="text-muted-light block text-[0.6875rem]">
                                    {KIND[r.employer_kind]}
                                    {verified(r) ? '' : ` · not verified (${r.employer_status})`}
                                  </span>
                                </td>
                                <td className="py-2.5 pr-4">{r.city_name}</td>
                                <td className="py-2.5 pr-4 text-right tabular-nums">
                                  {r.applicants}
                                  {r.applicants_new > 0 ? (
                                    <span className="text-muted-light block text-[0.6875rem]">
                                      {r.applicants_new} new
                                    </span>
                                  ) : null}
                                </td>
                                <td className="whitespace-nowrap py-2.5 pr-4">
                                  {day(r.posted_at)}
                                </td>
                                <td className="py-2.5">
                                  <span
                                    className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.6875rem] font-extrabold ${s.tone}`}
                                  >
                                    {s.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              )}

              {selected && tab !== 'employers' ? (
                <Panel title={selected.title} aside={state(selected).label}>
                  <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-[0.8125rem]">
                    <dt className="text-muted-light font-semibold">Business</dt>
                    <dd className="font-bold">
                      {selected.employer_name} · {KIND[selected.employer_kind]}
                      {verified(selected) ? '' : ` (not verified)`}
                    </dd>
                    <dt className="text-muted-light font-semibold">Where</dt>
                    <dd className="font-semibold">
                      {[selected.area, selected.city_name].filter(Boolean).join(', ')}
                    </dd>
                    <dt className="text-muted-light font-semibold">Type</dt>
                    <dd className="font-semibold">
                      {JOB_TYPE[selected.job_type] ?? selected.job_type} · {selected.openings}{' '}
                      {selected.openings === 1 ? 'opening' : 'openings'}
                    </dd>
                    <dt className="text-muted-light font-semibold">Pay</dt>
                    <dd className="font-semibold">{pay(selected) ?? 'Not said'}</dd>
                    <dt className="text-muted-light font-semibold">Posted</dt>
                    <dd className="font-semibold">
                      {day(selected.posted_at)}
                      {selected.closes_on ? ` · closes ${day(selected.closes_on)}` : ''}
                    </dd>
                    <dt className="text-muted-light font-semibold">Applicants</dt>
                    <dd className="font-semibold">
                      {selected.applicants} in progress · {selected.applicants_new} new ·{' '}
                      {selected.hired} hired
                    </dd>
                  </dl>

                  <div className="border-border mt-4 border-t pt-4">
                    <h3 className="text-[0.8125rem] font-extrabold">What the job says</h3>
                    <p className="text-muted mt-1.5 max-h-60 overflow-y-auto whitespace-pre-line text-[0.8125rem] font-semibold leading-[1.6]">
                      {selected.description}
                      {selected.requirements ? `\n\n${selected.requirements}` : ''}
                    </p>
                    {selected.on_board ? (
                      <a
                        href={`${SITE}/careers/jobs/${selected.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold-text mt-2 inline-block text-[0.8125rem] font-bold hover:underline"
                      >
                        Open it on the public site
                      </a>
                    ) : null}
                  </div>

                  <div className="border-border mt-4 border-t pt-4">
                    {selected.taken_down_at ? (
                      <>
                        <p className="bg-danger-bg text-danger rounded-lg px-3 py-2 text-[0.8125rem] font-bold">
                          Taken down {day(selected.taken_down_at)}. The business was told &ldquo;
                          {selected.taken_down_reason}&rdquo;.
                        </p>
                        <div className="mt-3">
                          <TakedownForm vacancyId={selected.id} mode="lift" />
                        </div>
                      </>
                    ) : selected.status === 'draft' ? (
                      <p className="text-muted text-[0.8125rem] font-semibold">
                        A draft. Only its business can see it.
                      </p>
                    ) : (
                      <TakedownForm vacancyId={selected.id} mode="take-down" />
                    )}
                  </div>
                </Panel>
              ) : null}
            </div>
          </>
        )}
      </main>
    </ConsoleShell>
  );
}
