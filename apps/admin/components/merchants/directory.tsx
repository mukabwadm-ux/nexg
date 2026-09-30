import { Card } from '@nexg/ui';
import Link from 'next/link';

import {
  CATEGORY_LABEL,
  Chip,
  DASH,
  daysSince,
  EmptyRow,
  HealthDot,
  kes,
  num,
  pct,
  StatusPill,
  Tile,
  type Counts,
  type DirectoryRow,
} from './shared';

/**
 * Directory (A5) — the default tab.
 *
 * Applications waiting on a person sit above the table, oldest first,
 * because an application nobody opens is the one thing on this screen
 * with a clock running against it.
 *
 * GMV renders [—] rather than KES 0: there is no orders domain, and
 * zero would read as "sold nothing" instead of "not measured".
 */

const FILTERS = [
  { key: 'all', label: (c: Counts) => `All ${num(c.total)}` },
  { key: 'live', label: (c: Counts) => `Live ${num(c.live)}` },
  { key: 'paused', label: () => 'Paused' },
  { key: 'under_review', label: (c: Counts) => `Under review ${num(c.under_review)}` },
  { key: 'suspended', label: (c: Counts) => `Suspended ${num(c.suspended)}` },
  { key: 'featured', label: () => 'Featured' },
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

export function Directory({
  rows,
  applications,
  counts,
  filter,
  selected,
}: {
  rows: DirectoryRow[];
  applications: Application[];
  counts: Counts;
  filter: string;
  selected: string | null;
}) {
  const visible = rows.filter((r) => {
    switch (filter) {
      case 'live':
        return r.status === 'live';
      case 'paused':
        return r.status === 'paused';
      case 'under_review':
        return r.status === 'under_review';
      case 'suspended':
        return r.status === 'suspended';
      case 'featured':
        return !!r.featured;
      default:
        return true;
    }
  });

  const href = (next: { filter?: string; selected?: string | null }) => {
    const params = new URLSearchParams({ tab: 'directory' });
    const f = next.filter ?? filter;
    if (f !== 'all') params.set('filter', f);
    const s = next.selected === undefined ? selected : next.selected;
    if (s) params.set('selected', s);
    return `/merchants?${params.toString()}`;
  };

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.key} on={filter === f.key} href={href({ filter: f.key })}>
            {f.label(counts)}
          </Chip>
        ))}
      </div>

      {/* ───────────────────────────────── applications waiting on us */}
      {applications.length > 0 && (
        <Card className="mt-5 p-0">
          <div className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2 className="text-[0.9375rem] font-extrabold">Applications to review</h2>
            <p className="text-gold-text text-[0.6875rem] font-extrabold uppercase tracking-wide">
              {applications.length} · oldest{' '}
              {Math.max(
                ...applications.map(
                  (a) => daysSince(a.submitted_at ?? a.created_at) ?? 0,
                ),
              )}{' '}
              days
            </p>
          </div>
          <ul>
            {applications.map((app) => {
              const age = daysSince(app.submitted_at ?? app.created_at);
              return (
                <li
                  key={app.id}
                  className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="text-[0.875rem] font-extrabold">
                      {app.trading_name ?? '[Trading name]'}
                    </p>
                    <p className="text-muted-light text-[0.6875rem] font-semibold">
                      {CATEGORY_LABEL[app.category ?? 'other'] ?? 'Other'} ·{' '}
                      {app.branch_name ?? app.city_name ?? DASH} ·{' '}
                      {age === null ? 'applied' : `applied ${age} days ago`}
                      {app.docs.length > 0 && ' · '}
                      {app.docs.map((d, i) => (
                        <span key={d.kind}>
                          {i > 0 && ' · '}
                          {d.label}{' '}
                          <span
                            className={
                              d.status === 'verified'
                                ? 'text-success font-extrabold'
                                : d.status === 'rejected'
                                  ? 'text-danger font-extrabold'
                                  : 'text-warning font-extrabold'
                            }
                          >
                            {d.status === 'verified'
                              ? '✓'
                              : d.status === 'rejected'
                                ? '✕'
                                : d.status === 'uploaded'
                                  ? 'to check'
                                  : 'pending'}
                          </span>
                        </span>
                      ))}
                    </p>
                    {/*
                     * The review lock. Two people verifying the same
                     * documents and both pressing Go live is how a
                     * merchant gets approved twice and told twice.
                     */}
                    {app.reviewer && (
                      <p className="text-warning mt-0.5 text-[0.6875rem] font-bold">
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
                  <Link
                    href={`/merchants/${app.id}/review`}
                    className="bg-ink hover:bg-ink/90 shrink-0 rounded-lg px-4 py-2 text-[0.8125rem] font-bold text-white transition-colors"
                  >
                    Review
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ─────────────────────────────────────────────── the table */}
      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[44rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Merchant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">30d</th>
                <th className="px-4 py-3">On-time</th>
                <th className="px-4 py-3">GMV 30d</th>
                <th className="px-4 py-3">Health</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <tr
                  key={m.id}
                  className={`border-border hover:bg-bg border-b last:border-b-0 ${
                    selected === m.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <Link href={href({ selected: m.id })} className="block">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[0.8125rem] font-extrabold">
                          {m.trading_name ?? '[Trading name]'}
                        </span>
                        {m.featured && (
                          <span className="border-gold text-gold-text rounded-full border px-1.5 py-0.5 text-[0.5625rem] font-extrabold">
                            FEATURED
                          </span>
                        )}
                        {m.parent_merchant_id && (
                          <span className="bg-bg text-muted rounded px-1.5 py-0.5 text-[0.5625rem] font-extrabold">
                            BRANCH
                          </span>
                        )}
                      </span>
                      <span className="text-muted-light block text-[0.6875rem] font-semibold">
                        {CATEGORY_LABEL[m.category ?? 'other'] ?? 'Other'} ·{' '}
                        {m.branch_name ?? m.city_name ?? DASH}
                        {m.payout_hold && (
                          <span className="text-danger font-extrabold"> · payout held</span>
                        )}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={m.status} />
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{num(m.orders_30d)}</td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">
                    {pct(m.on_time_ready_pct)}
                  </td>
                  <td className="px-4 py-3 text-[0.8125rem] font-bold">{kes(m.gmv_30d_kes)}</td>
                  <td className="px-4 py-3">
                    <HealthDot band={m.health_band} score={m.health_score} />
                  </td>
                </tr>
              ))}
              {visible.length === 0 && (
                <EmptyRow colSpan={6}>Nobody matches that filter.</EmptyRow>
              )}
            </tbody>
          </table>
          <p className="text-muted-light border-border border-t px-4 py-3 text-[0.6875rem] font-semibold">
            Showing {visible.length} of {num(counts.total)} merchants
          </p>
        </Card>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Tile label="Live" value={num(counts.live)}>
              of {num(counts.total)} merchants
            </Tile>
            <Tile
              label="Open disputes"
              value={num(counts.open_disputes)}
              tone={counts.open_disputes > 0 ? 'danger' : undefined}
            >
              across every merchant
            </Tile>
            <Tile
              label="Applications"
              value={num(counts.applications)}
              tone={counts.applications > 0 ? 'warning' : undefined}
            >
              waiting somewhere in onboarding
            </Tile>
            <Tile
              label="Docs expiring"
              value={num(counts.expiring_docs)}
              tone={counts.expiring_docs > 0 ? 'warning' : undefined}
            >
              within 30 days
            </Tile>
          </div>

          {selected ? (
            <Card className="p-5">
              <p className="text-[0.8125rem] font-extrabold">Open the full record</p>
              <p className="text-muted mt-2 text-[0.75rem] font-semibold leading-[1.7]">
                Controls, compliance, payouts and the status timeline live on the merchant&rsquo;s
                own page, which is deep-linkable so it can be pasted to somebody.
              </p>
              <Link
                href={`/merchants/${selected}`}
                className="bg-ink hover:bg-ink/90 mt-3 inline-block rounded-lg px-4 py-2 text-[0.8125rem] font-bold text-white transition-colors"
              >
                Open merchant
              </Link>
            </Card>
          ) : (
            <Card className="p-5">
              <p className="text-muted text-sm font-semibold">
                Pick a merchant to open their record.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
