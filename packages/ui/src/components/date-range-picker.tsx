'use client';

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/cn';
import { Button } from './button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import {
  addDays,
  addMonths,
  DAY,
  DEFAULT_RANGE_PRESETS,
  formatDay,
  formatRange,
  fromUtc,
  monthStart,
  todayInNairobi,
  toUtc,
  type DateRange,
  type DateRangePreset,
} from '../lib/date-range';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** The days drawn for a month: whole weeks, Monday first. */
function monthGrid(month: string): string[] {
  const first = toUtc(monthStart(month));
  const weekday = (new Date(first).getUTCDay() + 6) % 7;
  const start = first - weekday * DAY;
  const days: string[] = [];
  for (let i = 0; i < 42; i++) days.push(fromUtc(start + i * DAY));
  // Drop a final week that belongs wholly to the next month.
  return days[35]!.slice(0, 7) !== month.slice(0, 7) ? days.slice(0, 35) : days;
}

interface MonthProps {
  month: string;
  draft: { from: string | null; to: string | null };
  hover: string | null;
  focused: string;
  max?: string;
  min?: string;
  onPick: (day: string) => void;
  onHover: (day: string | null) => void;
  onFocusDay: (day: string) => void;
  dayRefs: React.MutableRefObject<Map<string, HTMLButtonElement>>;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

function Month({
  month,
  draft,
  hover,
  focused,
  max,
  min,
  onPick,
  onHover,
  onFocusDay,
  dayRefs,
  onKeyDown,
}: MonthProps) {
  const label = new Date(toUtc(month)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const grid = monthGrid(month);
  const end = draft.to ?? (draft.from && hover ? hover : draft.from);
  const [lo, hi] =
    draft.from && end ? (draft.from <= end ? [draft.from, end] : [end, draft.from]) : [null, null];

  return (
    <div className="w-[16.5rem]">
      <p className="mb-2 text-center text-sm font-extrabold" aria-hidden="true">
        {label}
      </p>
      <table role="grid" aria-label={label} className="w-full border-collapse">
        <thead>
          <tr>
            {WEEKDAYS.map((d) => (
              <th
                key={d}
                scope="col"
                className="text-muted-light pb-1 text-center text-[0.6875rem] font-bold"
              >
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: grid.length / 7 }, (_, w) => (
            <tr key={w}>
              {grid.slice(w * 7, w * 7 + 7).map((day) => {
                const inMonth = day.slice(0, 7) === month.slice(0, 7);
                if (!inMonth) return <td key={day} className="p-0" />;
                const disabled = (max != null && day > max) || (min != null && day < min);
                const isEdge = day === lo || day === hi;
                const inside = lo != null && hi != null && day > lo && day < hi;
                const today = day === max;
                return (
                  <td
                    key={day}
                    role="gridcell"
                    aria-selected={isEdge || inside}
                    className={cn(
                      'p-0 text-center',
                      inside && 'bg-gold-soft',
                      day === lo &&
                        hi !== lo &&
                        'bg-[linear-gradient(90deg,transparent_50%,rgb(var(--gold-soft-rgb))_50%)]',
                      day === hi &&
                        hi !== lo &&
                        'bg-[linear-gradient(90deg,rgb(var(--gold-soft-rgb))_50%,transparent_50%)]',
                    )}
                  >
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) dayRefs.current.set(day, el);
                        else dayRefs.current.delete(day);
                      }}
                      tabIndex={day === focused ? 0 : -1}
                      disabled={disabled}
                      aria-label={formatDay(day)}
                      onKeyDown={onKeyDown}
                      onClick={() => onPick(day)}
                      onMouseEnter={() => onHover(day)}
                      onFocus={() => onFocusDay(day)}
                      className={cn(
                        'relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors',
                        'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
                        'disabled:text-muted-light/40 disabled:cursor-not-allowed',
                        isEdge
                          ? 'bg-ink text-gold font-extrabold'
                          : inside
                            ? 'text-ink hover:bg-gold/30'
                            : 'text-ink hover:bg-bg',
                        today &&
                          !isEdge &&
                          'after:bg-gold-text after:absolute after:bottom-1 after:h-1 after:w-1 after:rounded-full',
                      )}
                    >
                      {Number(day.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface RangeCalendarProps {
  value: { from: string | null; to: string | null };
  onChange: (value: { from: string | null; to: string | null }) => void;
  /** Latest day that can be chosen (usually today). */
  max?: string;
  min?: string;
  /** Months side by side; the picker shows one on a phone. */
  months?: 1 | 2;
  className?: string;
}

/**
 * Pick a start and an end day. The first click starts a range and the
 * second closes it, in either order; arrow keys move a day or a week,
 * Page Up and Page Down a month, Enter picks.
 */
export function RangeCalendar({
  value,
  onChange,
  max,
  min,
  months = 2,
  className,
}: RangeCalendarProps) {
  const anchor = value.to ?? value.from ?? max ?? fromUtc(Date.now());
  const [view, setView] = React.useState(() =>
    monthStart(months === 2 ? addMonths(anchor, -1) : anchor),
  );
  const [hover, setHover] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState(anchor);
  const dayRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const shown = months === 2 ? [view, monthStart(addMonths(view, 1))] : [view];
  const lastShown = shown[shown.length - 1]!;

  const pick = (day: string) => {
    setHover(null);
    if (!value.from || value.to) onChange({ from: day, to: null });
    else onChange(day < value.from ? { from: day, to: value.from } : { from: value.from, to: day });
  };

  const move = (next: string) => {
    if (max && next > max) next = max;
    if (min && next < min) next = min;
    setFocused(next);
    if (next < view) setView(monthStart(next));
    else if (next.slice(0, 7) > lastShown.slice(0, 7))
      setView(monthStart(months === 2 ? addMonths(next, -1) : next));
    requestAnimationFrame(() => dayRefs.current.get(next)?.focus());
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
      Home: () => addDays(focused, -((new Date(toUtc(focused)).getUTCDay() + 6) % 7)),
      End: () => addDays(focused, 6 - ((new Date(toUtc(focused)).getUTCDay() + 6) % 7)),
    };
    const step = keys[event.key];
    if (step) {
      event.preventDefault();
      move(step());
    }
  };

  return (
    <div className={cn('select-none', className)}>
      <div className="relative flex gap-6">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setView(monthStart(addMonths(view, -1)))}
          disabled={min != null && view <= monthStart(min)}
          className="text-muted hover:bg-bg hover:text-ink focus-visible:ring-gold absolute left-0 top-0 flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setView(monthStart(addMonths(view, 1)))}
          disabled={max != null && lastShown >= monthStart(max)}
          className="text-muted hover:bg-bg hover:text-ink focus-visible:ring-gold absolute right-0 top-0 flex h-7 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {shown.map((m) => (
          <Month
            key={m}
            month={m}
            draft={value}
            hover={hover}
            focused={focused}
            max={max}
            min={min}
            onPick={pick}
            onHover={setHover}
            onFocusDay={setFocused}
            dayRefs={dayRefs}
            onKeyDown={onKeyDown}
          />
        ))}
      </div>
    </div>
  );
}

export interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  presets?: DateRangePreset[];
  /** The latest day that can be picked; defaults to today in Nairobi. */
  max?: string;
  min?: string;
  /** `dark` for a trigger sitting on the black page band. */
  tone?: 'light' | 'dark';
  align?: 'start' | 'center' | 'end';
  /** Accessible name for the trigger, e.g. "Period". */
  label?: string;
  className?: string;
}

/**
 * The period control in a page header: a trigger reading "Nov 1 – Nov 13,
 * 2026" that opens presets beside a two-month calendar (one month on a
 * phone). Nothing changes until Apply, so a half-picked range never
 * reloads the page.
 */
export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_RANGE_PRESETS,
  max,
  min,
  tone = 'light',
  align = 'end',
  label = 'Period',
  className,
}: DateRangePickerProps) {
  const today = max ?? todayInNairobi();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<{ from: string | null; to: string | null }>(value);
  const [narrow, setNarrow] = React.useState(false);

  React.useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  const activePreset = presets.find((p) => {
    const r = p.range(today);
    return draft.from === r.from && (draft.to ?? draft.from) === r.to;
  });

  const apply = () => {
    if (!draft.from) return;
    onChange({ from: draft.from, to: draft.to ?? draft.from });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${formatRange(value)}`}
          className={cn(
            'group flex h-11 items-center gap-2.5 rounded-xl border px-4 text-sm font-semibold transition-colors',
            'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
            tone === 'dark'
              ? 'border-white/25 text-white hover:bg-white/[0.06] data-[state=open]:bg-white/[0.08]'
              : 'border-border-strong bg-surface text-ink hover:bg-bg data-[state=open]:border-ink',
            className,
          )}
        >
          <CalendarDays
            className={cn('h-4 w-4 shrink-0', tone === 'dark' ? 'text-white/80' : 'text-muted')}
            aria-hidden="true"
          />
          <span className="whitespace-nowrap tabular-nums">{formatRange(value)}</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180',
              tone === 'dark' ? 'text-white/70' : 'text-muted-light',
            )}
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto max-w-[calc(100vw-1.5rem)] p-0">
        <div className="flex flex-col sm:flex-row">
          <ul
            aria-label="Quick ranges"
            className="border-border flex gap-1 overflow-x-auto border-b p-2 [scrollbar-width:none] sm:w-40 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r"
          >
            {presets.map((p) => {
              const active = activePreset?.key === p.key;
              return (
                <li key={p.key} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDraft(p.range(today))}
                    className={cn(
                      'flex min-h-9 w-full items-center whitespace-nowrap rounded-lg px-3 text-left text-sm font-semibold transition-colors',
                      'focus-visible:ring-gold focus-visible:outline-none focus-visible:ring-2',
                      active ? 'bg-ink text-white' : 'text-muted hover:bg-bg hover:text-ink',
                    )}
                  >
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="p-4">
            <RangeCalendar
              key={open ? 'open' : 'closed'}
              value={draft}
              onChange={setDraft}
              max={today}
              min={min}
              months={narrow ? 1 : 2}
            />
            <div className="border-border mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
              <p className="text-muted text-sm font-semibold tabular-nums" aria-live="polite">
                {draft.from
                  ? draft.to
                    ? formatRange({ from: draft.from, to: draft.to })
                    : `${formatDay(draft.from)} – pick the last day`
                  : 'Pick the first day'}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="black" size="sm" onClick={apply} disabled={!draft.from}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
