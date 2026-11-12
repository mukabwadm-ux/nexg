import { Card, cn } from '@nexg/ui';
import {
  ChevronRight,
  ClipboardList,
  FileClock,
  Scale,
  Search,
  Store,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';

import { CATEGORY_LABEL, daysSince, StatusPill, type Counts, type DirectoryRow } from './shared';

/**
 * Directory (A5) — the default tab.
 *
 * Four figures across the top, each a way into its own list. Applications
 * waiting on a person sit below them, oldest first, because an application
 * nobody opens is the one thing on this screen with a clock running against
 * it. Then every merchant, filtered and searched through the URL so a link
 * pasted to somebody opens the same list.
 *
 * A figure nobody has measured shows a quiet dash, not 0: zero would read as
 * "sold nothing" instead of "not measured".
 */

/* Counted from the list itself, so a chip always matches the rows it shows. */
const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'live', label: 'Live', match: (r: DirectoryRow) => r.status === 'live' },
  { key: 'paused', label: 'Paused', match: (r: DirectoryRow) => r.status === 'paused' },
  {
    key: 'under_review',
    label: 'Under review',
    match: (r: DirectoryRow) => r.status === 'under_review',
  },
  { key: 'suspended', label: 'Suspended', match: (r: DirectoryRow) => r.status === 'suspended' },
  { key: 'featured', label: 'Featured', match: (r: DirectoryRow) => !!r.featured },
] as const;

export interface Application {
  id: string;
  trading_name: string | null;
  category: string | null;
  city_name: string | null;
  branch_name: string | null;
  submitted_at: string | null;
  created_at: string | null;
  docs: { kind: string; label: string; status: string | null; essential: boolean }[];
  reviewer: string | null;
  review_started_at: string | null;
}

/* Soft tints for the initials, picked from the name so a merchant keeps its colour. */
const AVATAR_TONES = [
  'bg-[#FFF4CC] text-[#7A5C00]',
  'bg-[#E6F2EA] text-[#1F6B3A]',
  'bg-[#E8EEF7] text-[#1F4E79]',
  'bg-[#F7E9E4] text-[#8A3B1F]',
  'bg-[#EFE9F7] text-[#5B3A8A]',
  'bg-[#E6F3F3] text-[#1D6464]',
];

function initials(name: string | null) {
  const words = (name ?? '?').replace(/[[\]]/g, '').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '?') + (words[1]?.[0] ?? '')).toUpperCase();
}

function Avatar({ name }: { name: string | null }) {
  const key = [...(name ?? '')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[0.8125rem] font-extrabold',
        AVATAR_TONES[key % AVATAR_TONES.length],
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Not measured: a dash, with the reason for screen readers and on hover. */
function Missing() {
  return (
    <span className="text-muted-light" title="Not measured yet">
      —<span className="sr-only">not measured yet</span>
    </span>
  );
}

const count = (value: number | null | undefined) =>
  value === null || value === undefined ? <Missing /> : value.toLocaleString('en-KE');

const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? <Missing /> : `${Math.round(Number(value))}%`;

const money = (value: number | null | undefined) =>
  value === null || value === undefined ? (
    <Missing />
  ) : (
    <>
      <span className="text-muted-light mr-1 text-[0.6875rem] font-bold">KES</span>
      {value.toLocaleString('en-KE')}
    </>
  );

function Health({ band, score }: { band: string | null; score: number | null }) {
  if (!band && score === null) return <Missing />;
  const tone =
    band === 'green'
      ? 'bg-success-bg text-success'
      : band === 'amber'
        ? 'bg-warning-bg text-warning'
        : 'bg-danger-bg text-danger';
  const dot = band === 'green' ? 'bg-success' : band === 'amber' ? 'bg-warning' : 'bg-danger';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums',
        tone,
      )}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {score ?? '—'}
    </span>
  );
}

function Stat({
  icon: Icon,
  tone,
  label,
  value,
  note,
  href,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: number | null | undefined;
  note: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="border-border bg-surface hover:border-border-strong focus-visible:ring-gold group flex items-start gap-4 rounded-2xl border p-5 shadow-[0_1px_2px_rgb(20_20_20/0.04)] transition-[border-color,box-shadow] hover:shadow-[0_10px_30px_-18px_rgb(20_20_20/0.35)] focus-visible:outline-none focus-visible:ring-2"
    >
      <span
        aria-hidden="true"
        className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', tone)}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-muted block text-[0.8125rem] font-bold">{label}</span>
        <span className="mt-1 block text-[1.75rem] font-extrabold tabular-nums leading-none tracking-tight">
          {value === null || value === undefined ? '—' : value.toLocaleString('en-KE')}
        </span>
        <span className="text-muted-light mt-2 block text-xs font-semibold">{note}</span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="text-muted-light group-hover:text-ink mt-1 h-4 w-4 shrink-0 transition-colors"
      />
    </Link>
  );
}

const DOC_TONE: Record<string, string> = {
  verified: 'bg-success-bg text-success',
  rejected: 'bg-danger-bg text-danger',
  uploaded: 'bg-warning-bg text-warning',
};

const DOC_WORD: Record<string, string> = {
  verified: 'verified',
  rejected: 'rejected',
  uploaded: 'to check',
};

export function Directory({
  rows,
  applications,
  counts,
  filter,
  query,
}: {
  rows: DirectoryRow[];
  applications: Application[];
  counts: Counts;
  filter: string;
  query: string;
}) {
  const needle = query.trim().toLowerCase();
  const searched = rows.filter(
    (r) =>
      !needle ||
      [r.trading_name, r.branch_name, r.city_name, CATEGORY_LABEL[r.category ?? 'other']]
        .filter(Boolean)
        .some((text) => text!.toLowerCase().includes(needle)),
  );
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const visible = searched.filter(active.match);

  const href = (next: { filter?: string }) => {
    const params = new URLSearchParams({ tab: 'directory' });
    const f = next.filter ?? filter;
    if (f !== 'all') params.set('filter', f);
    if (needle) params.set('q', query.trim());
    return `/merchants?${params.toString()}`;
  };

  const oldest = applications.length
    ? Math.max(...applications.map((a) => daysSince(a.submitted_at ?? a.created_at) ?? 0))
    : 0;

  return (
    <>
      {/* ──────────────────────────────────────────── the four figures */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Store}
          tone="bg-success-bg text-success"
          label="Live merchants"
          value={counts.live}
          note={`of ${counts.total?.toLocaleString('en-KE') ?? '—'} on NexG`}
          href="/merchants?tab=directory&filter=live"
        />
        <Stat
          icon={ClipboardList}
          tone="bg-[#FFF4CC] text-[#7A5C00]"
          label="Applications"
          value={counts.applications}
          note="Waiting somewhere in onboarding"
          href="/merchants/applications"
        />
        <Stat
          icon={Scale}
          tone={counts.open_disputes > 0 ? 'bg-danger-bg text-danger' : 'bg-bg text-muted'}
          label="Open disputes"
          value={counts.open_disputes}
          note="Across every merchant"
          href="/merchants?tab=disputes"
        />
        <Stat
          icon={FileClock}
          tone={counts.expiring_docs > 0 ? 'bg-warning-bg text-warning' : 'bg-info-bg text-info'}
          label="Documents expiring"
          value={counts.expiring_docs}
          note="Within the next 30 days"
          href="/merchants?tab=documents"
        />
      </div>

      {/* ───────────────────────────────── applications waiting on us */}
      {applications.length > 0 && (
        <Card className="mt-6 overflow-hidden rounded-2xl p-0">
          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-[0.9375rem] font-extrabold">Applications to review</h2>
              <span className="bg-ink rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold tabular-nums text-white">
                {applications.length}
              </span>
              <span className="text-warning bg-warning-bg rounded-full px-2 py-0.5 text-[0.6875rem] font-bold">
                Oldest {oldest} {oldest === 1 ? 'day' : 'days'}
              </span>
            </div>
            <Link
              href="/merchants/applications"
              className="text-muted hover:text-ink inline-flex items-center gap-1 text-xs font-bold transition-colors"
            >
              All applications
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </Link>
          </div>
          <ul className="divide-border divide-y">
            {applications.map((app) => {
              const age = daysSince(app.submitted_at ?? app.created_at);
              return (
                <li
                  key={app.id}
                  className="hover:bg-bg/60 flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors"
                >
                  <Avatar name={app.trading_name} />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/merchants/${app.id}`}
                      className="block truncate text-[0.875rem] font-extrabold hover:underline"
                    >
                      {app.trading_name ?? '[Trading name]'}
                    </Link>
                    <p className="text-muted-light mt-0.5 text-xs font-semibold">
                      {CATEGORY_LABEL[app.category ?? 'other'] ?? 'Other'} ·{' '}
                      {app.branch_name ?? app.city_name ?? '—'}
                    </p>
                    {app.docs.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {app.docs.map((d) => (
                          <li
                            key={d.kind}
                            className={cn(
                              'rounded-md px-2 py-0.5 text-[0.6875rem] font-bold',
                              DOC_TONE[d.status ?? ''] ?? 'bg-bg text-muted',
                            )}
                          >
                            {d.label} · {DOC_WORD[d.status ?? ''] ?? 'not uploaded'}
                          </li>
                        ))}
                      </ul>
                    )}
                    {/*
                     * The review lock. Two people verifying the same
                     * documents and both pressing Go live is how a
                     * merchant gets approved twice and told twice.
                     */}
                    {app.reviewer && (
                      <p className="text-warning mt-1.5 text-[0.6875rem] font-bold">
                        Being reviewed by {app.reviewer}
                        {app.review_started_at
                          ? ` since ${new Date(app.review_started_at).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : ''}
                      </p>
                    )}
                  </div>
                  <span className="text-muted-light text-xs font-semibold tabular-nums">
                    {age === null ? 'Applied' : age === 0 ? 'Applied today' : `${age} d waiting`}
                  </span>
                  <Link
                    href={`/merchants/${app.id}`}
                    className="bg-ink hover:bg-ink/90 focus-visible:ring-gold inline-flex h-10 shrink-0 items-center rounded-xl px-4 text-[0.8125rem] font-bold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                  >
                    Review
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ─────────────────────────────────────────────── every merchant */}
      <Card className="mt-6 overflow-hidden rounded-2xl p-0">
        <div className="border-border flex flex-col gap-4 border-b px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[0.9375rem] font-extrabold">All merchants</h2>
            <span className="text-muted-light text-xs font-semibold tabular-nums">
              {visible.length} shown
            </span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <nav
              aria-label="Filter merchants"
              className="bg-bg flex max-w-full gap-1 overflow-x-auto rounded-xl p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {FILTERS.map((f) => {
                const on = filter === f.key;
                const n = searched.filter(f.match).length;
                return (
                  <Link
                    key={f.key}
                    href={href({ filter: f.key })}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                      on
                        ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(20_20_20/0.12)]'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    {f.label}
                    {
                      <span
                        className={cn(
                          'rounded-md px-1.5 text-[0.625rem] font-extrabold tabular-nums',
                          on ? 'bg-ink text-white' : 'bg-border/70 text-muted',
                        )}
                      >
                        {n}
                      </span>
                    }
                  </Link>
                );
              })}
            </nav>

            {/* A plain GET form: the search lives in the URL like the filters. */}
            <form action="/merchants" className="relative sm:w-60">
              <input type="hidden" name="tab" value="directory" />
              {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
              <Search
                aria-hidden="true"
                className="text-muted-light pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Search name or area"
                aria-label="Search merchants"
                className="border-border bg-surface placeholder:text-muted-light focus:border-ink h-10 w-full rounded-xl border pl-9 pr-3 text-sm font-semibold outline-none transition-colors"
              />
            </form>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left">
            <thead>
              <tr className="bg-bg/60 text-muted-light text-[0.6875rem] font-bold">
                <th className="px-5 py-3 font-bold">Merchant</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 text-right font-bold">Orders 30d</th>
                <th className="px-3 py-3 text-right font-bold">On-time</th>
                <th className="px-3 py-3 text-right font-bold">Sales 30d</th>
                <th className="px-3 py-3 font-bold">Health</th>
                <th className="w-10 px-3 py-3">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {visible.map((m) => (
                <tr
                  key={m.id}
                  className="hover:bg-bg/60 group relative text-[0.8125rem] transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.trading_name} />
                      <div className="min-w-0">
                        {/* The link covers the whole row, so a click anywhere opens the merchant. */}
                        <Link
                          href={`/merchants/${m.id}`}
                          className="focus-visible:ring-gold font-extrabold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2"
                        >
                          {m.trading_name ?? '[Trading name]'}
                        </Link>
                        <p className="text-muted-light mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                          {CATEGORY_LABEL[m.category ?? 'other'] ?? 'Other'} ·{' '}
                          {m.branch_name ?? m.city_name ?? '—'}
                          {m.featured && (
                            <span className="rounded bg-[#FFF4CC] px-1.5 py-px text-[0.5625rem] font-extrabold text-[#7A5C00]">
                              FEATURED
                            </span>
                          )}
                          {m.parent_merchant_id && (
                            <span className="bg-bg text-muted rounded px-1.5 py-px text-[0.5625rem] font-extrabold">
                              BRANCH
                            </span>
                          )}
                          {m.payout_hold && (
                            <span className="bg-danger-bg text-danger rounded px-1.5 py-px text-[0.5625rem] font-extrabold">
                              PAYOUT HELD
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <StatusPill status={m.status} />
                  </td>
                  <td className="px-3 py-3.5 text-right font-bold tabular-nums">
                    {count(m.orders_30d)}
                  </td>
                  <td className="px-3 py-3.5 text-right font-bold tabular-nums">
                    {percent(m.on_time_ready_pct)}
                  </td>
                  <td className="px-3 py-3.5 text-right font-bold tabular-nums">
                    {money(m.gmv_30d_kes)}
                  </td>
                  <td className="px-3 py-3.5">
                    <Health band={m.health_band} score={m.health_score} />
                  </td>
                  <td className="px-3 py-3.5">
                    <ChevronRight
                      aria-hidden="true"
                      className="text-muted-light group-hover:text-ink h-4 w-4 transition-colors"
                    />
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-14 text-center">
                    <p className="text-sm font-extrabold">No merchants match</p>
                    <p className="text-muted mt-1 text-xs font-semibold">
                      {needle ? `Nothing for “${query.trim()}” here. ` : ''}
                      <Link href="/merchants?tab=directory" className="text-ink underline">
                        Clear the filters
                      </Link>
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
