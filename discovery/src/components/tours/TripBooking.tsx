import { useId, useState } from 'react';
import { CalendarDays, Check, Minus, Plus } from 'lucide-react';
import type { DateRange } from '../../lib/calendar';
import { DatePicker } from '../DatePicker';
import { departureLabel, type TripDeparture } from './tripFormat';

export interface TripChoice { dates: DateRange; travellers: number }

/**
 * The booking card. It only collects a preferred departure and group size: "Request booking" keeps the
 * choice on this device and says plainly that nothing has been sent. Any change turns the button back.
 */
export function TripBooking({ operator, price, departures, choice, onChange, today, onCustomise, minTravellers = 1, unavailable = false }: {
  operator: string; price: string; departures: TripDeparture[]; choice: TripChoice; onChange: (choice: TripChoice) => void;
  today: string; onCustomise: () => void; minTravellers?: number; unavailable?: boolean;
}) {
  const titleId = useId();
  const groupName = useId();
  const travellersId = useId();
  const [savedChoice, setSavedChoice] = useState<string>();
  const [error, setError] = useState('');
  const key = JSON.stringify(choice);
  const saved = savedChoice === key;
  const update = (next: TripChoice) => { setError(''); onChange(next); };
  const request = () => {
    if (!choice.dates.from) return setError('Choose your preferred departure first.');
    setError(''); setSavedChoice(key);
  };
  const status = unavailable ? 'Currently unavailable' : error || (saved ? `Saved on this device. Nothing has been sent to ${operator} yet.` : '');

  return <section className="trip-booking" aria-labelledby={titleId}>
    <h2 id={titleId} className="trip-booking__price">{price}</h2>
    <p className="trip-booking__lead">{operator} confirms the price and availability for your dates and group.</p>

    {departures.length ? <fieldset className="trip-booking__departures">
      <legend className="trip-booking__label">Preferred departure</legend>
      {departures.map((departure) => {
        const checked = choice.dates.from === departure.start && (choice.dates.to ?? departure.start) === (departure.end ?? departure.start);
        return <label key={`${departure.start}:${departure.end ?? ''}`} className="trip-booking__departure">
          <input type="radio" name={groupName} checked={checked} onChange={() => update({ ...choice, dates: { from: departure.start, to: departure.end } })} />
          <CalendarDays size={20} strokeWidth={1.5} aria-hidden="true" /><span>{departureLabel(departure)}</span>
        </label>;
      })}
    </fieldset> : <div className="trip-booking__dates">
      <DatePicker label="Preferred departure" mode="range" min={today} value={choice.dates} onChange={(dates) => update({ ...choice, dates })} />
    </div>}

    <div className="trip-booking__travellers" role="group" aria-labelledby={travellersId}>
      <span id={travellersId} className="trip-booking__label">Travellers</span>
      <div className="trip-booking__stepper">
        <button type="button" aria-label="Fewer travellers" disabled={choice.travellers <= minTravellers} onClick={() => update({ ...choice, travellers: choice.travellers - 1 })}><Minus size={18} strokeWidth={1.75} aria-hidden="true" /></button>
        <output aria-live="polite">{choice.travellers}</output>
        <button type="button" aria-label="More travellers" disabled={choice.travellers >= 20} onClick={() => update({ ...choice, travellers: choice.travellers + 1 })}><Plus size={18} strokeWidth={1.75} aria-hidden="true" /></button>
      </div>
    </div>

    <div className="trip-booking__actions">
      <button type="button" className="trip-booking__primary" disabled={unavailable} onClick={request}>{saved ? <>Request saved<Check size={18} strokeWidth={2} aria-hidden="true" /></> : 'Request booking'}</button>
      <button type="button" className="trip-booking__secondary" onClick={onCustomise}>Customise this tour</button>
    </div>
    <p role="status" className={`trip-booking__status${error || unavailable ? ' is-error' : saved ? ' is-saved' : ''}`}>{status}</p>
  </section>;
}
