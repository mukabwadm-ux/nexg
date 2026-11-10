import { useId } from 'react';
import { ArrowRight } from 'lucide-react';
import { DatePicker } from '../DatePicker';
import { describeRange, type DateRange } from '../../lib/calendar';
import { localDateKey } from '../../data/massagePresentation';
import { transferExamples, type TransferDirection } from '../../data/offeringKinds';
import { Stepper } from './OfferingSheet';

export { transferExamples, type TransferDirection };

/** The trip comes first for vehicle hire (owner, 8 Nov 2026): where and when, then the vehicles. */
export interface RentalTrip { pickupPlace: string; returnPlace: string; sameReturn: boolean; dates: DateRange; pickupTime: string; returnTime: string; driver: boolean }
export const emptyRentalTrip = (): RentalTrip => ({ pickupPlace: '', returnPlace: '', sameReturn: true, dates: {}, pickupTime: '10:00', returnTime: '10:00', driver: false });
export const tripReady = (trip: RentalTrip) => Boolean(trip.pickupPlace.trim() && trip.dates.from && trip.dates.to && (trip.sameReturn || trip.returnPlace.trim()));
export const tripSummary = (trip: RentalTrip) => `${trip.pickupPlace.trim()}${trip.sameReturn ? '' : ` → ${trip.returnPlace.trim()}`} · ${describeRange(trip.dates, 'range')}${trip.driver ? ' · with a driver' : ''}`;

/**
 * Transfers put the ride first too (owner, 8 Nov 2026): pickup, drop-off, date, time, travellers and bags,
 * then the vehicles. Meet & greet is a tick box. Nothing here checks capacity; the company confirms it.
 */
export interface TransferTrip { pickup: string; dropoff: string; date?: string; time: string; travellers: number; bags: number; meetGreet: boolean }
export const emptyTransferTrip = (): TransferTrip => ({ pickup: '', dropoff: '', time: '', travellers: 1, bags: 0, meetGreet: false });
export const transferReady = (trip: TransferTrip) => Boolean(trip.pickup.trim() && trip.dropoff.trim() && trip.date && trip.time);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
export const transferSummary = (trip: TransferTrip) => [
  `${trip.pickup.trim()} → ${trip.dropoff.trim()}`,
  `${trip.date ? describeRange({ from: trip.date }, 'single') : ''}${trip.time ? `, ${trip.time}` : ''}`.replace(/^, /, ''),
  plural(trip.travellers, 'traveller', 'travellers'),
  trip.bags > 0 ? plural(trip.bags, 'bag', 'bags') : '',
  trip.meetGreet ? 'meet & greet' : '',
].filter(Boolean).join(' · ');

/** Styles live in cards.css. Nothing here checks availability; the company confirms it. */
export function RentalTripPanel({ trip, onChange, onShow, vehicle = 'car' }: { trip: RentalTrip; onChange: (trip: RentalTrip) => void; onShow: () => void; vehicle?: 'car' | 'bike' }) {
  const id = useId();
  const set = <K extends keyof RentalTrip>(key: K, value: RentalTrip[K]) => onChange({ ...trip, [key]: value });
  const ready = tripReady(trip);
  return <form className="trip-panel" aria-labelledby={`${id}-title`} onSubmit={(event) => { event.preventDefault(); if (ready) onShow(); }}>
    <div className="trip-panel__heading"><h2 id={`${id}-title`}>Plan your {vehicle} hire</h2><p>Where and when first, then choose your {vehicle}.</p></div>
    <div className="trip-panel__fields">
      <label className="offering-field trip-panel__wide"><span>Pick-up place</span>
        <input type="text" value={trip.pickupPlace} maxLength={120} autoComplete="street-address" placeholder="e.g. JKIA, Westlands or your address" onChange={(event) => set('pickupPlace', event.target.value)} /></label>
      <DatePicker label="Pick-up and return dates" mode="range" value={trip.dates} onChange={(dates) => set('dates', dates)} min={localDateKey()} />
      {!trip.sameReturn && <label className="offering-field trip-panel__wide"><span>Return place</span>
        <input type="text" value={trip.returnPlace} maxLength={120} placeholder="Where you’ll drop it off" onChange={(event) => set('returnPlace', event.target.value)} /></label>}
      <label className="offering-field"><span>Pick-up time</span><input type="time" value={trip.pickupTime} onChange={(event) => set('pickupTime', event.target.value)} /></label>
      <label className="offering-field"><span>Return time</span><input type="time" value={trip.returnTime} onChange={(event) => set('returnTime', event.target.value)} /></label>
      <div className="trip-panel__options">
        <label className="offering-check"><input type="checkbox" checked={!trip.sameReturn} onChange={(event) => set('sameReturn', !event.target.checked)} /><span>Return somewhere else</span></label>
        {vehicle === 'car' && <label className="offering-check"><input type="checkbox" checked={trip.driver} onChange={(event) => set('driver', event.target.checked)} /><span>With a driver</span></label>}
      </div>
    </div>
    <div className="trip-panel__footer">
      <p role="status">{ready ? tripSummary(trip) : `Add a pick-up place and your dates${trip.sameReturn ? '' : ', and where you’ll return it'}.`}</p>
      <button type="submit" className="offering-sheet__primary" disabled={!ready}>Show {vehicle}s<ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></button>
    </div>
  </form>;
}

/** The transfer twin of the hire panel: the ride first, then the operator's vehicles. Styles live in cards.css. */
export function TransferTripPanel({ trip, onChange, onShow, direction }: { trip: TransferTrip; onChange: (trip: TransferTrip) => void; onShow: () => void; direction?: TransferDirection }) {
  const id = useId();
  const set = <K extends keyof TransferTrip>(key: K, value: TransferTrip[K]) => onChange({ ...trip, [key]: value });
  const ready = transferReady(trip);
  const example = transferExamples(direction);
  return <form className="trip-panel trip-panel--transfer" aria-labelledby={`${id}-title`} onSubmit={(event) => { event.preventDefault(); if (ready) onShow(); }}>
    <div className="trip-panel__heading"><h2 id={`${id}-title`}>Plan your transfer</h2><p>Your ride first, then choose a vehicle.</p></div>
    <div className="trip-panel__fields">
      <label className="offering-field trip-panel__wide"><span>Pickup</span>
        <input type="text" value={trip.pickup} maxLength={120} placeholder={example.pickup} onChange={(event) => set('pickup', event.target.value)} /></label>
      <label className="offering-field trip-panel__wide"><span>Drop-off</span>
        <input type="text" value={trip.dropoff} maxLength={120} placeholder={example.dropoff} onChange={(event) => set('dropoff', event.target.value)} /></label>
      <DatePicker label="Date" mode="single" value={{ from: trip.date }} onChange={(range) => set('date', range.from)} min={localDateKey()} />
      <label className="offering-field"><span>Pickup time</span><input type="time" value={trip.time} onChange={(event) => set('time', event.target.value)} /></label>
      <div className="trip-panel__options">
        <label className="offering-check"><input type="checkbox" checked={trip.meetGreet} onChange={(event) => set('meetGreet', event.target.checked)} /><span>Meet & greet</span></label>
      </div>
      <Stepper label="Travellers" value={trip.travellers} min={1} max={20} onChange={(value) => set('travellers', value)} />
      <Stepper label="Bags" value={trip.bags} min={0} max={20} onChange={(value) => set('bags', value)} />
    </div>
    <div className="trip-panel__footer">
      <p role="status">{ready ? transferSummary(trip) : 'Add the pickup, drop-off, date and time.'}</p>
      <button type="submit" className="offering-sheet__primary" disabled={!ready}>Show vehicles<ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></button>
    </div>
  </form>;
}
