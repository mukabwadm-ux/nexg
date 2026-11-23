'use client';

import { ChevronLeft, ChevronRight, Moon, Sun, Sunrise, Sunset } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { commitShift, releaseShift } from '@/app/(customer)/rider/actions';

import { panel, ring } from './ui';

export interface BookedShift {
  id: string;
  date: string;
  time_window: string;
  status: string;
  zone_name: string | null;
}

const WINDOWS = [
  { key: 'morning', label: 'Morning Shift', hours: '07:00 – 11:00', icon: <Sunrise />, start: 7 },
  { key: 'lunch', label: 'Lunch Shift', hours: '11:00 – 15:00', icon: <Sun />, start: 11 },
  { key: 'dinner', label: 'Dinner Shift', hours: '17:00 – 22:00', icon: <Sunset />, start: 17 },
  { key: 'late', label: 'Late Shift', hours: '22:00 – 01:00', icon: <Moon />, start: 22 },
] as const;

const TZ = 'Africa/Nairobi';
const DAY_MS = 86_400_000;
const keyOf = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/**
 * The week strip and the day's windows, each with Book or, once booked,
 * Release. Booking and releasing are the same rpc_shift_commit /
 * rpc_shift_release the old form used: today to two weeks ahead, and a
 * window that has started cannot be booked.
 */
export function ShiftPlanner({
  zones,
  booked,
  active,
}: {
  zones: { id: string; name: string }[];
  booked: BookedShift[];
  active: boolean;
}) {
  const router = useRouter();
  const days = React.useMemo(
    () => Array.from({ length: 14 }, (_, i) => new Date(Date.now() + i * DAY_MS)),
    [],
  );
  const [page, setPage] = React.useState(0);
  const [picked, setPicked] = React.useState(keyOf(days[0]!));
  const [zone, setZone] = React.useState(zones[0]?.id ?? '');
  const [busy, setBusy] = React.useState<string | null>(null);
  const [said, setSaid] = React.useState<{ ok: boolean; message?: string } | null>(null);

  const week = days.slice(page * 7, page * 7 + 7);
  const today = keyOf(days[0]!);
  const hourNow = Number(
    new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: TZ }),
  );
  const onDay = booked.filter((s) => s.date === picked && s.status !== 'released');

  async function run(key: string, fn: () => Promise<{ ok: boolean; message?: string }>) {
    setBusy(key);
    setSaid(null);
    const result = await fn();
    setBusy(null);
    setSaid(result);
    if (result.ok) router.refresh();
  }

  return (
    <section className={panel} aria-labelledby="planner-title">
      <h2 id="planner-title" className="sr-only">
        Pick a day and a window
      </h2>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPage(0)}
          disabled={page === 0}
          aria-label="This week"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f5fa] disabled:opacity-30 ${ring}`}
        >
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </button>
        <ol className="grid flex-1 grid-cols-7 gap-1">
          {week.map((d) => {
            const key = keyOf(d);
            const on = key === picked;
            const has = booked.some((s) => s.date === key && s.status === 'committed');
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setPicked(key)}
                  aria-pressed={on}
                  className={`flex w-full flex-col items-center rounded-2xl px-1 py-2 ${ring} ${
                    on
                      ? 'bg-[#fdd128] text-[color:var(--rider-ink)] shadow-[0_8px_18px_-10px_rgba(180,130,0,0.9)]'
                      : 'hover:bg-[#f6f7fb]'
                  }`}
                >
                  <span className="text-[12px] font-bold text-slate-600">
                    {d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: TZ })}
                  </span>
                  <span className="text-[19px] font-extrabold leading-tight">
                    {d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: TZ })}
                  </span>
                  <span className="text-[11.5px] font-semibold text-slate-500">
                    {d.toLocaleDateString('en-GB', { month: 'short', timeZone: TZ })}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`mt-1 h-1.5 w-1.5 rounded-full ${has ? 'bg-green-600' : 'bg-transparent'}`}
                  />
                  {has ? <span className="sr-only">, shift booked</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={() => setPage(1)}
          disabled={page === 1}
          aria-label="Next week"
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f3f5fa] disabled:opacity-30 ${ring}`}
        >
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-extrabold">
          {new Date(`${picked}T12:00:00+03:00`).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            timeZone: TZ,
          })}
        </p>
        <label className="flex items-center gap-2 text-[13px] font-bold text-slate-600">
          Zone
          <select
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="rounded-xl border border-[#e3e7f0] bg-white px-3 py-2 text-[13.5px] font-bold text-[color:var(--rider-ink)]"
          >
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {said?.message ? (
        <p
          role={said.ok ? 'status' : 'alert'}
          className={`mt-3 rounded-xl px-3 py-2 text-[13px] font-bold ${
            said.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {said.message}
        </p>
      ) : null}

      <ul className="mt-3 divide-y divide-[#eef0f6]">
        {WINDOWS.map((w) => {
          const mine = onDay.find((s) => s.time_window === w.key);
          const started = picked === today && hourNow >= w.start;
          const id = `${picked}-${w.key}`;
          return (
            <li key={w.key} className="flex flex-wrap items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 [&>svg]:h-5 [&>svg]:w-5"
              >
                {w.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold">{w.label}</p>
                <p className="text-[13px] font-semibold text-slate-600">
                  {w.hours}
                  {mine?.zone_name ? ` · ${mine.zone_name}` : ''}
                </p>
              </div>
              {mine ? (
                mine.status === 'committed' ? (
                  <span className="flex items-center gap-2">
                    <span className="rounded-xl bg-green-100 px-4 py-2 text-[13.5px] font-extrabold text-green-800">
                      Booked
                    </span>
                    {!started ? (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void run(id, () => releaseShift(mine.id))}
                        className={`rounded-xl border border-[#e3e7f0] px-3 py-2 text-[13px] font-extrabold text-slate-700 disabled:opacity-50 ${ring}`}
                      >
                        {busy === id ? 'Releasing…' : 'Release'}
                      </button>
                    ) : null}
                  </span>
                ) : (
                  <span className="rounded-xl bg-slate-100 px-4 py-2 text-[13px] font-extrabold text-slate-600">
                    {mine.status === 'showed' ? 'Worked' : 'Missed'}
                  </span>
                )
              ) : (
                <button
                  type="button"
                  disabled={!active || started || !zone || busy !== null}
                  onClick={() => void run(id, () => commitShift(zone, picked, w.key))}
                  className={`rounded-xl bg-[#f3f5fa] px-5 py-2 text-[13.5px] font-extrabold text-[color:var(--rider-ink)] hover:bg-[#fff6cf] disabled:opacity-40 ${ring}`}
                >
                  {busy === id ? 'Booking…' : started ? 'Started' : 'Book'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[12px] font-semibold text-slate-500">
        {active
          ? 'Give a shift back before it starts and it does not count against you. A quiet no-show does.'
          : 'Booking opens once your account is active.'}
      </p>
    </section>
  );
}
