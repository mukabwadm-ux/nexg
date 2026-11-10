import { useId, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface TripDates { start?: string; end?: string }
const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const dateLabel = (key?: string) => key ? new Date(`${key}T12:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Choose a date';

/** Preferred travel dates only. The calendar does not imply departure availability. */
export function TripCalendar({ value, onChange }: { value: TripDates; onChange: (dates: TripDates) => void }) {
  const today = keyOf(new Date());
  const [month, setMonth] = useState(() => {
    const initial = value.start ? new Date(`${value.start}T12:00:00`) : new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });
  const headingId = useId();
  const first = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const count = Math.ceil((first + days) / 7) * 7;
  const pick = (key: string) => onChange(!value.start || value.end || key < value.start ? { start: key } : { start: value.start, end: key });
  return <div className="trip-calendar">
    <div className="trip-calendar__month"><button type="button" aria-label="Previous month" disabled={month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth()} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={18} aria-hidden="true" /></button><h3 id={headingId} aria-live="polite">{month.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}</h3><button type="button" aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={18} aria-hidden="true" /></button></div>
    <div className="trip-calendar__week" aria-hidden="true">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="trip-calendar__days" role="group" aria-labelledby={headingId}>{Array.from({ length: count }, (_, index) => {
      const day = index - first + 1;
      if (day < 1 || day > days) return <span key={index} />;
      const key = keyOf(new Date(month.getFullYear(), month.getMonth(), day));
      const selected = key === value.start || key === value.end;
      const within = value.start && value.end && key > value.start && key < value.end;
      return <button type="button" key={key} aria-label={dateLabel(key)} aria-pressed={selected} aria-current={key === today ? 'date' : undefined} disabled={key < today} className={within ? 'trip-calendar__range' : undefined} onClick={() => pick(key)}>{day}</button>;
    })}</div>
    <p className="trip-calendar__hint">Select a start date, then an end date. Availability is unconfirmed.</p>
  </div>;
}
