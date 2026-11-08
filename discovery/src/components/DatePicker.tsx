import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, addMonths, describeRange, fromKey, longDate, monthGrid, monthTitle, selectDay, shiftMonth, toKey, type DateRange, type PickerMode } from '../lib/calendar';

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * One date or a date range, chosen on an inline calendar (no extra packages). It opens in the page flow,
 * so it never gets clipped inside a sheet. Days before `min` or after `max` can't be chosen.
 * Styles live in cards.css.
 */
export function DatePicker({ label, mode, value, onChange, min, max, placeholder = mode === 'range' ? 'Choose dates' : 'Choose a date' }: {
  label: string; mode: PickerMode; value: DateRange; onChange: (value: DateRange) => void; min?: string; max?: string; placeholder?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const anchor = value.from ?? min ?? toKey(new Date());
  const [view, setView] = useState(() => ({ year: fromKey(anchor).getFullYear(), month: fromKey(anchor).getMonth() }));
  const [focus, setFocus] = useState(anchor);
  const grid = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [moveFocus, setMoveFocus] = useState(false);
  const allowed = (key: string) => (!min || key >= min) && (!max || key <= max);
  const summary = describeRange(value, mode);
  const weeks = monthGrid(view.year, view.month);
  const firstOfView = toKey(new Date(view.year, view.month, 1));
  const lastOfView = toKey(new Date(view.year, view.month + 1, 0));
  const inView = (key: string) => key >= firstOfView && key <= lastOfView;
  // One day in the visible month is always reachable with Tab, even after paging months with the header buttons.
  const tabStop = inView(focus) && allowed(focus) ? focus : weeks.flat().find((key) => inView(key) && allowed(key));

  useEffect(() => {
    if (!moveFocus) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
    setMoveFocus(false);
  }, [moveFocus, focus]);

  // A calendar opened near the bottom of the screen (or of a sheet) scrolls up into view.
  useEffect(() => {
    if (!open) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [open]);

  const goTo = (key: string) => {
    if (!allowed(key)) return;
    const date = fromKey(key);
    setView({ year: date.getFullYear(), month: date.getMonth() });
    setFocus(key); setMoveFocus(true);
  };
  const choose = (key: string) => {
    if (!allowed(key)) return;
    const next = selectDay(value, key, mode);
    onChange(next); setFocus(key);
    if (mode === 'single' || next.to) { setOpen(false); trigger.current?.focus(); }
  };
  const onDayKey = (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(key, -1), ArrowRight: () => addDays(key, 1), ArrowUp: () => addDays(key, -7), ArrowDown: () => addDays(key, 7),
      PageUp: () => shiftMonth(key, -1), PageDown: () => shiftMonth(key, 1),
      Home: () => addDays(key, -((fromKey(key).getDay() + 6) % 7)), End: () => addDays(key, 6 - ((fromKey(key).getDay() + 6) % 7)),
    };
    const move = moves[event.key];
    if (move) { event.preventDefault(); goTo(move()); }
  };
  const closePanel = () => { setOpen(false); trigger.current?.focus(); };

  return <div className={`date-picker${open ? ' is-open' : ''}`}>
    <span className="date-picker__label" id={`${id}-label`}>{label}</span>
    <button ref={trigger} type="button" className="date-picker__trigger" aria-expanded={open} aria-controls={`${id}-panel`} aria-labelledby={`${id}-label ${id}-value`} onClick={() => setOpen((current) => !current)}>
      <CalendarDays size={17} strokeWidth={1.75} aria-hidden="true" /><span id={`${id}-value`} className={summary ? undefined : 'is-placeholder'}>{summary || placeholder}</span>
    </button>
    {open && <div ref={panel} className="date-picker__panel" id={`${id}-panel`} role="group" aria-label={`${label}: calendar`} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePanel(); } }}>
      <div className="date-picker__header">
        <button type="button" aria-label="Previous month" disabled={Boolean(min && firstOfView <= min)} onClick={() => setView((current) => addMonths(current, -1))}><ChevronLeft size={18} aria-hidden="true" /></button>
        <strong aria-live="polite">{monthTitle(view)}</strong>
        <button type="button" aria-label="Next month" disabled={Boolean(max && lastOfView >= max)} onClick={() => setView((current) => addMonths(current, 1))}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="date-picker__grid" ref={grid} role="grid" aria-labelledby={`${id}-label`}>
        <div className="date-picker__row" role="row">{weekdays.map((day) => <span key={day} role="columnheader" className="date-picker__weekday">{day}</span>)}</div>
        {weeks.map((week) => <div key={week[0]} className="date-picker__row" role="row">{week.map((key) => {
          const outside = key < firstOfView || key > lastOfView;
          const start = key === value.from; const end = key === value.to;
          const between = Boolean(value.from && value.to && key > value.from && key < value.to);
          const classes = ['date-picker__day', outside && 'is-outside', key === toKey(new Date()) && 'is-today', start && 'is-start', end && 'is-end', between && 'is-between', (start || end) && 'is-selected'].filter(Boolean).join(' ');
          return <span key={key} role="gridcell" aria-selected={start || end || between}>
            <button type="button" className={classes} data-day={key} tabIndex={key === tabStop ? 0 : -1} disabled={!allowed(key)}
              aria-label={longDate(key)} onClick={() => choose(key)} onKeyDown={(event) => onDayKey(event, key)}>{fromKey(key).getDate()}</button>
          </span>;
        })}</div>)}
      </div>
      <div className="date-picker__footer">
        <span role="status">{summary || (mode === 'range' && value.from ? 'Now choose the end date' : placeholder)}</span>
        <button type="button" className="date-picker__clear" disabled={!value.from} onClick={() => onChange({})}>Clear</button>
        <button type="button" className="date-picker__done" onClick={closePanel}>Done</button>
      </div>
    </div>}
  </div>;
}
