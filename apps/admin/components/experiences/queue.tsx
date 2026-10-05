'use client';

import { Button, Card, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { claimPlan } from '@/app/experiences/actions';

import {
  Chip,
  countdown,
  DASH,
  keslabel,
  num,
  StatusPill,
  Tile,
  when,
  type QueueRow,
  type Stats,
} from './shared';

/**
 * The queue (K1).
 *
 * Ordered by who is closest to a broken promise: unassigned first, then
 * by whichever clock runs out soonest. The SLA arithmetic is done in the
 * database, so a laptop with the wrong time cannot show a concierge a
 * comfortable countdown that is actually overdue.
 */

const FILTERS = [
  { key: 'needs_me', label: 'Needs me' },
  { key: 'new', label: 'New' },
  { key: 'confirming', label: 'Confirming' },
  { key: 'quoted', label: 'Quoted' },
  { key: 'upcoming', label: 'Paid · upcoming' },
  { key: 'today', label: 'In progress today' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

const MOOD_GLYPH: Record<string, string> = {
  wild: '🦒',
  taste: '🍽',
  night: '🎶',
  slow: '🌿',
  stay: '🛏',
  events: '🎫',
};

export function Queue({
  rows,
  stats,
  myStaffId,
  filter,
}: {
  rows: QueueRow[];
  stats: Stats;
  myStaffId: string;
  filter: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selected, setSelected] = React.useState<string | null>(rows[0]?.id ?? null);
  const [busy, setBusy] = React.useState(false);

  /* The countdowns are seconds from the server. Re-rendering every 30 s
     keeps them honest without asking the server again. */
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const go = (next: string) => {
    const params = new URLSearchParams({ tab: 'queue' });
    if (next !== 'needs_me') params.set('filter', next);
    router.push(`/experiences?${params.toString()}`);
  };

  const visible = rows.filter((r) => {
    switch (filter) {
      case 'needs_me':
        return r.concierge_id === myStaffId || r.concierge_id === null;
      case 'new':
        return r.status === 'sent';
      case 'confirming':
        return r.status === 'confirming' || r.status === 'changes_requested';
      case 'quoted':
        return r.status === 'quoted';
      case 'upcoming':
        return r.status === 'paid';
      case 'today':
        return r.status === 'in_progress';
      case 'done':
        return ['completed', 'cancelled', 'expired'].includes(r.status);
      default:
        return true;
    }
  });

  const plan = rows.find((r) => r.id === selected) ?? visible[0] ?? null;

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.key} on={filter === f.key} onClick={() => go(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="In the queue" value={num(stats.in_queue)}>
          {stats.unassigned > 0 ? `${stats.unassigned} with nobody on them` : 'all assigned'}
        </Tile>
        {/* No SLA history is recorded yet, so this is [—] rather than 100%. */}
        <Tile label="First-reply SLA · 7 d" value={DASH}>
          nothing measured yet
        </Tile>
        <Tile label="Days live today" value={num(stats.live_today)}>
          paid and running
        </Tile>
        <Tile
          label="Average day value"
          value={stats.avg_day_value_kes === null ? DASH : keslabel(stats.avg_day_value_kes)}
        >
          across paid days
        </Tile>
      </div>

      <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[46rem] text-left">
            <thead>
              <tr className="border-border text-muted-light border-b text-[0.625rem] font-extrabold uppercase tracking-wide">
                <th className="px-4 py-3">Ref</th>
                <th className="px-4 py-3">Guest · stay</th>
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Budget</th>
                <th className="px-4 py-3">Concierge</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const reply = countdown(r.first_reply_due_in_s);
                const expiry = countdown(r.quote_expires_in_s);
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className={`border-border hover:bg-bg cursor-pointer border-b last:border-b-0 ${
                      plan?.id === r.id ? 'bg-bg ring-gold ring-1 ring-inset' : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-[0.75rem] font-extrabold tabular-nums">
                      {r.reference}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[0.8125rem] font-extrabold">
                        {r.guest_name ?? '[Guest name]'}
                      </p>
                      <p className="text-muted-light text-[0.6875rem] font-semibold">
                        {r.stay_label ?? '[stay]'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[0.75rem] font-bold">
                        {r.moods.map((m) => MOOD_GLYPH[m] ?? '').join(' ')}{' '}
                        <span className="text-muted-light font-semibold">
                          {r.party_type} · {r.party_size}
                        </span>
                      </p>
                      <p className="text-muted-light text-[0.6875rem] font-semibold">
                        {r.date
                          ? new Date(r.date).toLocaleDateString('en-GB', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                            })
                          : 'no date'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[0.8125rem] font-bold">{keslabel(r.budget_kes)}</p>
                      <p className="text-muted-light text-[0.6875rem] font-semibold">
                        est {keslabel(r.quote_total_kes ?? r.estimate_total_kes)}
                      </p>
                    </td>
                    <td className="text-muted px-4 py-3 text-[0.75rem] font-semibold">
                      {r.concierge_name ?? (
                        <span className="text-danger font-extrabold">unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={r.status} />
                      <p className="mt-1 text-[0.625rem] font-bold">
                        {reply && !r.first_reply_at && (
                          <span className={reply.tone}>reply due {reply.text}</span>
                        )}
                        {expiry && <span className={expiry.tone}>expires in {expiry.text}</span>}
                        {r.holds_pending > 0 && (
                          <span className="text-warning ml-1">
                            {r.holds_pending} hold{r.holds_pending === 1 ? '' : 's'} pending
                          </span>
                        )}
                        {!reply && !expiry && r.blocks_total > 0 && (
                          <span className="text-muted-light">
                            block {r.blocks_settled} of {r.blocks_total}
                          </span>
                        )}
                      </p>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-muted px-4 py-10 text-center text-sm font-semibold"
                  >
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {plan ? (
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[1.0625rem] font-extrabold">{plan.reference}</p>
              <StatusPill status={plan.status} />
            </div>
            <p className="text-muted mt-1 text-[0.6875rem] font-semibold">
              sent {when(plan.sent_at)} · {plan.guest_name ?? '[Guest name]'} ·{' '}
              {plan.stay_label ?? '[stay]'}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ['Budget', keslabel(plan.budget_kes)],
                ['Estimate', keslabel(plan.estimate_total_kes)],
                [
                  'Spare',
                  plan.budget_kes && plan.estimate_total_kes
                    ? keslabel(plan.budget_kes - plan.estimate_total_kes)
                    : `KES ${DASH}`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="bg-bg rounded-lg p-2.5 text-center">
                  <p className="text-muted-light text-[0.5625rem] font-extrabold uppercase tracking-wide">
                    {label}
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] font-extrabold">{value}</p>
                </div>
              ))}
            </div>

            {plan.flags.length > 0 && (
              <div className="border-border mt-4 border-t pt-3">
                <p className="text-[0.75rem] font-extrabold">Before you call</p>
                <ul className="mt-2 space-y-1.5">
                  {plan.flags.map((f, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-[0.6875rem] font-semibold leading-[1.6]"
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                          f.severity === 'red'
                            ? 'bg-danger'
                            : f.severity === 'amber'
                              ? 'bg-warning'
                              : 'bg-success'
                        }`}
                      />
                      {f.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-border mt-4 flex flex-wrap gap-2 border-t pt-4">
              <Button
                size="sm"
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await claimPlan(plan.id);
                  setBusy(false);
                  if (!r.ok) {
                    toast({ title: 'Not allowed', description: r.message, tone: 'danger' });
                    return;
                  }
                  router.push(`/experiences/plans/${plan.id}`);
                }}
              >
                Take it · open workbench
              </Button>
            </div>

            <p className="text-muted-light mt-3 text-[0.6875rem] font-semibold leading-[1.7]">
              First reply is promised within {DASH} minutes of a day arriving. The clock is the
              database&rsquo;s, not this browser&rsquo;s.
            </p>
          </Card>
        ) : (
          <Card className="p-6">
            <p className="text-muted text-sm font-semibold">Pick a day.</p>
          </Card>
        )}
      </div>
    </>
  );
}
