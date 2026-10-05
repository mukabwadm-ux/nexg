'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { updateProfile, type Outcome } from '@/app/rider/actions';

import { Panel } from './bits';

const SHIFTS: { value: string; label: string }[] = [
  { value: 'mornings', label: 'Mornings' },
  { value: 'afternoons', label: 'Afternoons' },
  { value: 'evenings', label: 'Evenings' },
  { value: 'late_night', label: 'Late night · 22:00+' },
  { value: 'weekends', label: 'Weekends' },
];

const MAX_AREAS = 5;

/**
 * Areas, shifts and distance.
 *
 * The areas list does not decide which jobs a rider gets — the
 * cascade matches on distance from the merchant — and the hint
 * says so, because a rider who thinks otherwise will keep adding
 * areas waiting for work that was never going to come that way.
 * What it buys them is an easier first week in streets they know.
 *
 * The distance is different: that one really does gate offers.
 */
export function RiderProfile({
  riderId,
  areas,
  shifts,
  maxKm,
  areaOptions,
}: {
  riderId: string;
  areas: string[];
  shifts: string[];
  maxKm: number | null;
  areaOptions: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [said, setSaid] = React.useState<Outcome | null>(null);
  const [pickedAreas, setAreas] = React.useState<string[]>(areas);
  const [pickedShifts, setShifts] = React.useState<string[]>(shifts);
  const [km, setKm] = React.useState<number>(maxKm ?? 10);

  const dirty =
    JSON.stringify([...pickedAreas].sort()) !== JSON.stringify([...areas].sort()) ||
    JSON.stringify([...pickedShifts].sort()) !== JSON.stringify([...shifts].sort()) ||
    km !== (maxKm ?? 10);

  const save = async () => {
    setBusy(true);
    setSaid(null);
    const r = await updateProfile({
      riderId,
      areas: pickedAreas,
      shifts: pickedShifts,
      maxKm: km,
    });
    setSaid(r);
    setBusy(false);
    if (r.ok) router.refresh();
  };

  const toggle = (list: string[], set: (v: string[]) => void, value: string, cap?: number) => {
    if (list.includes(value)) set(list.filter((v) => v !== value));
    else if (!cap || list.length < cap) set([...list, value]);
  };

  return (
    <Panel title="Where and when you ride">
      {said && (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-[0.8125rem] font-bold ${
            said.ok ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
          }`}
        >
          {said.message}
        </p>
      )}

      <fieldset>
        <legend className="text-[0.8125rem] font-extrabold">
          Areas you know{' '}
          <span className="text-muted-light font-semibold">
            · up to {MAX_AREAS}, {pickedAreas.length} picked
          </span>
        </legend>
        <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">
          Jobs are matched by how far you are from the merchant, not by this list. What it buys you
          is an easier first week, in streets you already know.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {areaOptions.map((a) => {
            const on = pickedAreas.includes(a);
            const full = !on && pickedAreas.length >= MAX_AREAS;
            return (
              <button
                key={a}
                type="button"
                disabled={full}
                aria-pressed={on}
                onClick={() => toggle(pickedAreas, setAreas, a, MAX_AREAS)}
                className={`rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors disabled:opacity-30 ${
                  on ? 'bg-ink text-white' : 'border-border-strong bg-surface border'
                }`}
              >
                {a}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-[0.8125rem] font-extrabold">When you ride</legend>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SHIFTS.map((s) => {
            const on = pickedShifts.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(pickedShifts, setShifts, s.value)}
                className={`rounded-full px-3 py-1.5 text-[0.75rem] font-extrabold transition-colors ${
                  on ? 'bg-ink text-white' : 'border-border-strong bg-surface border'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-[0.8125rem] font-extrabold">The furthest you will ride</legend>
        <p className="text-muted mt-0.5 text-[0.75rem] font-semibold">
          This one really does decide what you are offered — pickup and drop-off added together. Set
          it short and you get fewer, closer jobs; set it long and you get runs that take the
          evening.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={25}
            value={km}
            onChange={(e) => setKm(Number(e.target.value))}
            className="max-w-xs flex-1"
          />
          <span className="text-[1rem] font-extrabold tabular-nums">{km} km</span>
        </div>
      </fieldset>

      <button
        type="button"
        disabled={busy || !dirty || pickedAreas.length === 0 || pickedShifts.length === 0}
        onClick={save}
        className="bg-ink mt-5 rounded-lg px-4 py-2.5 text-[0.8125rem] font-extrabold text-white disabled:opacity-40"
      >
        {busy ? 'Saving…' : dirty ? 'Save' : 'Nothing to save'}
      </button>
      {(pickedAreas.length === 0 || pickedShifts.length === 0) && (
        <p className="text-muted-light mt-1 text-[0.75rem] font-semibold">
          Pick at least one area and one shift.
        </p>
      )}
    </Panel>
  );
}
