import * as React from 'react';

import { DASH } from '@/components/live/shared';

/**
 * Insights.
 *
 * Three questions: is the desk getting faster, what are people
 * writing in about, and when do they write.
 *
 * The last is the only one that changes anything by itself — it
 * is the chart that sets a rota. The other two describe
 * performance, and performance charts are read far more often
 * than they are acted on, so they are kept small and honest
 * rather than large and impressive.
 *
 * Nothing is reported from fewer than five conversations. A
 * median over three is one of the three, and a figure on a
 * dashboard gets repeated in a meeting whether or not it means
 * anything.
 */

const ENOUGH_TO_MEASURE = 5;

export interface DailyRow {
  day: string;
  opened: number;
  resolved: number;
  resolved_first_touch: number;
  reopened: number;
  median_first_response_s: number | null;
  answered: number;
  avg_rating: number | null;
  rated: number;
}

export interface TopicRow {
  topic: string;
  total: number;
  still_open: number;
  resolved_first_touch: number;
  median_resolution_min: number | null;
  avg_rating: number | null;
  rated: number;
}

export interface HourRow {
  hour: number;
  opened: number;
  opened_28d: number;
  median_first_response_s: number | null;
}

function duration(seconds: number | null, sample: number): string {
  if (sample < ENOUGH_TO_MEASURE) return 'too few';
  if (seconds === null) return DASH;
  const s = Number(seconds);
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

export function Insights({
  daily,
  topics,
  hours,
}: {
  daily: DailyRow[];
  topics: TopicRow[];
  hours: HourRow[];
}) {
  const totalRated = daily.reduce((a, d) => a + Number(d.rated), 0);
  const totalOpened = daily.reduce((a, d) => a + Number(d.opened), 0);
  const peak = hours.reduce((m, h) => Math.max(m, Number(h.opened)), 0);

  return (
    <div className="space-y-8">
      {totalOpened < ENOUGH_TO_MEASURE ? (
        <p className="border-border bg-bg text-muted rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold">
          {totalOpened} conversation{totalOpened === 1 ? '' : 's'} so far. Most figures on this tab
          stay blank until there are at least {ENOUGH_TO_MEASURE} — not because the screen is
          broken, but because a median over three conversations is one of the three.
        </p>
      ) : null}

      {/* ───────────────────────────────── when they write */}
      <section>
        <h2 className="mb-1 text-[0.9375rem] font-extrabold tracking-tight">
          When people write in
        </h2>
        <p className="text-muted-light mb-3 text-xs font-semibold">
          Hour of the Nairobi day, all time. This is the one here that sets a rota rather than
          describing one.
        </p>

        <div className="border-border bg-surface rounded-xl border p-4">
          {peak === 0 ? (
            <p className="text-muted-light py-6 text-center text-[0.8125rem] font-semibold">
              Nothing to plot yet.
            </p>
          ) : (
            <div className="flex items-end gap-[2px]" style={{ height: '7rem' }}>
              {Array.from({ length: 24 }, (_, h) => {
                const row = hours.find((x) => Number(x.hour) === h);
                const n = Number(row?.opened ?? 0);
                return (
                  <div key={h} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t ${n > 0 ? 'bg-ink' : 'bg-border'}`}
                      style={{ height: `${Math.max(2, (n / peak) * 100)}%` }}
                      title={`${String(h).padStart(2, '0')}:00 — ${n} conversation${n === 1 ? '' : 's'}`}
                    />
                    {h % 3 === 0 ? (
                      <span className="text-muted-light text-[0.5625rem] font-extrabold">{h}</span>
                    ) : (
                      <span className="text-[0.5625rem]">&nbsp;</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ──────────────────────────────── what they write about */}
      <section>
        <h2 className="mb-1 text-[0.9375rem] font-extrabold tracking-tight">What about</h2>
        <p className="text-muted-light mb-3 text-xs font-semibold">
          Busiest first. &ldquo;Not tagged&rdquo; near the top means the routing rules are missing
          something, not that people have nothing in common.
        </p>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Topic</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Still open</th>
                <th className="px-4 py-2 text-right">Done first touch</th>
                <th className="px-4 py-2 text-right">To resolve</th>
                <th className="px-4 py-2 text-right">Rating</th>
              </tr>
            </thead>
            <tbody>
              {topics.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                      Nothing yet.
                    </p>
                  </td>
                </tr>
              ) : (
                topics.map((t) => (
                  <tr
                    key={t.topic}
                    className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                  >
                    <td className="px-4 py-2.5 font-extrabold">{t.topic.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{t.total}</td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        t.still_open > 0 ? 'text-warn font-extrabold' : 'text-muted'
                      }`}
                    >
                      {t.still_open}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {Number(t.total) >= ENOUGH_TO_MEASURE
                        ? `${Math.round((Number(t.resolved_first_touch) / Number(t.total)) * 100)}%`
                        : 'too few'}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {t.median_resolution_min === null
                        ? DASH
                        : `${Math.round(Number(t.median_resolution_min))}m`}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {Number(t.rated) >= ENOUGH_TO_MEASURE && t.avg_rating !== null ? (
                        <>
                          {Number(t.avg_rating).toFixed(2)}
                          <span className="text-muted-light block text-[0.625rem]">
                            {t.rated} rated
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-light">
                          {Number(t.rated) === 0 ? 'none rated' : `${t.rated} rated`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─────────────────────────────────── day by day */}
      <section>
        <h2 className="mb-1 text-[0.9375rem] font-extrabold tracking-tight">Day by day</h2>
        <p className="text-muted-light mb-3 text-xs font-semibold">
          Newest first. Reopened is the honest counterweight to resolved — a conversation closed
          and reopened was not resolved, it was ended.
        </p>

        <div className="border-border bg-surface overflow-x-auto rounded-xl border">
          <table className="w-full text-left">
            <thead className="border-border bg-bg border-b">
              <tr className="text-muted-light text-[0.625rem] font-extrabold tracking-wide uppercase">
                <th className="px-4 py-2">Day</th>
                <th className="px-4 py-2 text-right">Opened</th>
                <th className="px-4 py-2 text-right">Resolved</th>
                <th className="px-4 py-2 text-right">First touch</th>
                <th className="px-4 py-2 text-right">Reopened</th>
                <th className="px-4 py-2 text-right">First reply</th>
                <th className="px-4 py-2 text-right">Rating</th>
              </tr>
            </thead>
            <tbody>
              {daily.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <p className="text-muted-light px-4 py-8 text-center text-[0.8125rem] font-semibold">
                      No conversations yet.
                    </p>
                  </td>
                </tr>
              ) : (
                daily.slice(0, 30).map((d) => (
                  <tr
                    key={d.day}
                    className="border-border border-b text-[0.8125rem] font-semibold last:border-0"
                  >
                    <td className="px-4 py-2.5 font-extrabold">{dayLabel(d.day)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{d.opened}</td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {d.resolved}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {d.resolved_first_touch}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums ${
                        d.reopened > 0 ? 'text-warn font-extrabold' : 'text-muted-light'
                      }`}
                    >
                      {d.reopened}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {duration(d.median_first_response_s, Number(d.answered))}
                    </td>
                    <td className="text-muted px-4 py-2.5 text-right tabular-nums">
                      {Number(d.rated) >= ENOUGH_TO_MEASURE && d.avg_rating !== null
                        ? Number(d.avg_rating).toFixed(2)
                        : DASH}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalRated > 0 && totalRated < ENOUGH_TO_MEASURE ? (
          <p className="text-muted-light mt-2 text-[0.6875rem] font-semibold">
            {totalRated} rating{totalRated === 1 ? '' : 's'} so far — not enough to average without
            misleading somebody.
          </p>
        ) : null}
      </section>
    </div>
  );
}
