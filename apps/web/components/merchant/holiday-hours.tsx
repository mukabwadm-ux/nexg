'use client';

import * as React from 'react';

import { setHolidayHours } from '@/app/merchant/actions';
import { Said, useAction } from '@/components/partner/form';

import { holidayDate, type HolidayRow } from './hours-vocab';

/**
 * Open or closed on one public holiday, saved the moment it is chosen.
 *
 * The Hours board and the Availability workspace draw it differently and
 * share this. The answer shown is the one the database accepted: it changes
 * only when the save succeeds, so a refusal never leaves a wrong button lit.
 */
export function useHolidayAnswer(holiday: HolidayRow) {
  const [closed, setClosed] = React.useState<boolean | null>(holiday.closed);
  const { pending, outcome, run } = useAction();

  const choose = (next: boolean) => {
    if (pending || next === closed) return;
    run(
      () => setHolidayHours({ holidayId: holiday.holiday_id, closed: next }),
      (o) => {
        if (o.ok) setClosed(next);
      },
    );
  };

  return { closed, choose, pending, failed: outcome && !outcome.ok ? outcome : null };
}

/** The Hours board's list: each holiday in the next twelve months. */
export function HolidayList({ holidays }: { holidays: HolidayRow[] }) {
  if (holidays.length === 0) {
    return (
      <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
        No public holidays on the calendar for your city yet.
      </p>
    );
  }
  return (
    <>
      <p className="text-muted border-border border-b px-4 py-3 text-[0.75rem] font-semibold leading-[1.65]">
        The next twelve months. Your answer covers every branch. Until you answer, guests see your
        usual hours for that day.
      </p>
      <ul>
        {holidays.map((h) => (
          <HolidayItem key={h.holiday_id} holiday={h} />
        ))}
      </ul>
    </>
  );
}

function HolidayItem({ holiday }: { holiday: HolidayRow }) {
  const { closed, choose, pending, failed } = useHolidayAnswer(holiday);
  const day = holidayDate(holiday.date);

  return (
    <li className="border-border border-b px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-extrabold">{holiday.label}</p>
          <p className="text-muted text-[0.75rem] font-semibold">
            {day}
            {holiday.estimated ? ' · date to be confirmed' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {closed === null ? (
            <span className="bg-warning-bg text-warning rounded-full px-2 py-0.5 text-[0.6875rem] font-extrabold">
              Not answered
            </span>
          ) : null}
          <div
            role="group"
            aria-label={`${holiday.label}, ${day}`}
            className="border-border-strong bg-bg flex items-center gap-0.5 rounded-lg border p-0.5"
          >
            {([false, true] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={closed === value}
                disabled={pending}
                onClick={() => choose(value)}
                className={`rounded-md px-3 py-1.5 text-[0.75rem] font-extrabold disabled:opacity-50 ${
                  closed === value ? 'bg-ink text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {value ? 'Closed' : 'Open'}
              </button>
            ))}
          </div>
        </div>
      </div>
      {failed ? (
        <div className="mt-2">
          <Said outcome={failed} />
        </div>
      ) : null}
    </li>
  );
}
