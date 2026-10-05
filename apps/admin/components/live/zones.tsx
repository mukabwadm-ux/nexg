'use client';

import { Card } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { pauseZone, resumeZone, type Outcome } from '@/app/live/actions';

import { DASH, SectionTitle, StateDot, num } from './shared';

export interface ZoneRow {
  zone_id: string;
  zone: string;
  tier: string | null;
  live_orders: number;
  riders_free: number;
  riders_on_trip: number;
  riders_idle: number;
  avg_assign_s: number | null;
  unassigned: number;
  escalated: number;
  state: string;
  paused: boolean;
  paused_reason: string | null;
  paused_until: string | null;
  load_per_free_rider: number | null;
  computed_at: string | null;
}

/**
 * Zone pressure, and the one control that stops a part of the city.
 *
 * `load_per_free_rider` is the column that says "short" before any
 * order is actually late, which is the only version of this table
 * worth having — by the time orders are late the answer is no longer
 * a nudge.
 */
export function Zones({ zones, canPause }: { zones: ZoneRow[]; canPause: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState('');
  const [hours, setHours] = React.useState('2');
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true);
    const r = await fn();
    setSaid(r);
    setBusy(false);
    if (r.ok) {
      setOpen(null);
      setReason('');
      router.refresh();
    }
  }

  const stale =
    zones.length > 0 &&
    zones.every(
      (z) => !z.computed_at || Date.now() - new Date(z.computed_at).getTime() > 10 * 60_000,
    );

  return (
    <Card className="p-4">
      <SectionTitle note={stale ? 'not recomputed in over 10 min' : 'recomputed every minute'}>
        Zones
      </SectionTitle>

      {stale && (
        <p className="bg-gold-soft text-gold-text mt-2 rounded-lg px-3 py-2 text-[0.6875rem] font-bold">
          These numbers are stale. `dispatch-zone-health` has not run — the figures below are the
          last ones computed, not the city now.
        </p>
      )}

      {said && (
        <p
          role="status"
          className={`mt-2 rounded-lg px-3 py-2 text-[0.75rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message}
        </p>
      )}

      <table className="mt-3 w-full text-left">
        <thead>
          <tr className="text-muted-light text-[0.625rem] font-extrabold uppercase tracking-[0.06em]">
            <th className="pb-1.5">Zone</th>
            <th className="pb-1.5 text-right">Live</th>
            <th className="pb-1.5 text-right">Free</th>
            <th className="pb-1.5 text-right">Load</th>
            <th className="pb-1.5 text-right">Assign</th>
            <th className="pb-1.5" />
          </tr>
        </thead>
        <tbody>
          {zones.length === 0 && (
            <tr>
              <td colSpan={6} className="text-muted py-3 text-[0.75rem] font-semibold">
                No zones are drawn for this city yet. They come from Settings → Cities &amp; zones.
              </td>
            </tr>
          )}
          {zones.map((z) => (
            <React.Fragment key={z.zone_id}>
              <tr className="border-border border-t">
                <td className="py-2">
                  <div className="flex items-center gap-2">
                    <StateDot state={z.paused ? 'short' : z.state} />
                    <span className="text-[0.8125rem] font-bold">{z.zone}</span>
                  </div>
                  {z.paused && (
                    <p className="text-danger text-[0.6875rem] font-bold">
                      Paused · {z.paused_reason ?? DASH}
                      {z.paused_until &&
                        ` · until ${new Date(z.paused_until).toLocaleTimeString('en-GB', {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Africa/Nairobi',
                        })}`}
                    </p>
                  )}
                </td>
                <td className="py-2 text-right text-[0.8125rem] font-bold tabular-nums">
                  {z.live_orders}
                  {z.escalated > 0 && (
                    <span className="text-danger ml-1 text-[0.625rem]">{z.escalated} stuck</span>
                  )}
                </td>
                <td className="py-2 text-right text-[0.8125rem] font-bold tabular-nums">
                  {z.riders_free}
                  {z.riders_idle > 0 && (
                    <span className="text-muted-light ml-1 text-[0.625rem]">
                      {z.riders_idle} idle
                    </span>
                  )}
                </td>
                <td className="py-2 text-right text-[0.8125rem] font-bold tabular-nums">
                  {z.load_per_free_rider === null ? DASH : z.load_per_free_rider}
                </td>
                <td className="text-muted py-2 text-right text-[0.75rem] font-semibold tabular-nums">
                  {z.avg_assign_s === null ? DASH : `${z.avg_assign_s} s`}
                </td>
                <td className="py-2 text-right">
                  {canPause && (
                    <button
                      type="button"
                      onClick={() =>
                        z.paused
                          ? run(() => resumeZone(z.zone_id, 'resumed from the live screen'))
                          : setOpen(open === z.zone_id ? null : z.zone_id)
                      }
                      disabled={busy}
                      className="text-[0.6875rem] font-extrabold underline underline-offset-4 disabled:opacity-40"
                    >
                      {z.paused ? 'Resume' : 'Pause'}
                    </button>
                  )}
                </td>
              </tr>
              {open === z.zone_id && (
                <tr>
                  <td colSpan={6} className="pb-3">
                    <div className="bg-bg space-y-2 rounded-lg p-3">
                      <p className="text-[0.75rem] font-bold">
                        Pausing {z.zone} stops NexG taking new orders there.
                        {z.live_orders > 0 &&
                          ` The ${z.live_orders} already running still need finishing.`}
                      </p>
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Why — guests see that deliveries are paused"
                        className="border-border-strong w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold"
                      />
                      <label className="block">
                        <span className="text-[0.6875rem] font-extrabold uppercase tracking-[0.06em]">
                          For how long
                        </span>
                        <select
                          value={hours}
                          onChange={(e) => setHours(e.target.value)}
                          className="border-border-strong mt-1 w-full rounded-lg border px-3 py-2 text-[0.8125rem] font-bold"
                        >
                          <option value="1">1 hour</option>
                          <option value="2">2 hours</option>
                          <option value="4">4 hours</option>
                          <option value="">Until somebody resumes it</option>
                        </select>
                      </label>
                      {hours === '' && (
                        <p className="text-gold-text text-[0.6875rem] font-bold">
                          An open-ended pause is one somebody has to remember. A timed one ends
                          itself.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={busy || !reason.trim()}
                        onClick={() =>
                          run(() =>
                            pauseZone(
                              z.zone_id,
                              reason,
                              hours
                                ? new Date(Date.now() + Number(hours) * 3_600_000).toISOString()
                                : null,
                            ),
                          )
                        }
                        className="bg-danger rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
                      >
                        {busy ? 'Pausing…' : `Pause ${z.zone}`}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {!canPause && zones.length > 0 && (
        <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
          🔒 Pausing a zone is an ops manager or city lead decision.
        </p>
      )}

      <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
        Load is live orders per free rider. {num(zones.filter((z) => z.state === 'short').length)}{' '}
        short, {num(zones.filter((z) => z.state === 'tight').length)} tight.
      </p>
    </Card>
  );
}
