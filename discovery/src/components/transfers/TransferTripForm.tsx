import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Check, ChevronDown, Clock3, Luggage, PlaneLanding, PlaneTakeoff, Users } from 'lucide-react';
import { DatePicker } from '../DatePicker';
import { Stepper } from '../cards/OfferingSheet';
import {
  AIRPORTS, MAX_BAGS, MAX_TRAVELLERS, OTHER_AIRPORT_LABEL, airportChoice, airportLabel, partySummary, placeLabel, transferFieldOrder,
  type TransferErrors, type TransferField, type TransferForm,
} from '../../data/transferPresentation';
import { PlaceField } from './PlaceField';

/** From this width the date and the travellers open as popovers over the page (transfers.css uses the same breakpoint). */
const POPOVER_QUERY = '(min-width: 768px)';

/**
 * Travellers and bags. On phones the two steppers sit in the form; from 768px they fold into one field ("2 travellers ·
 * 1 bag") that opens a small popover, as in the owner's design, so the trip fits one row on a laptop.
 */
function PartyField({ travellers, bags, onChange }: { travellers: number; bags: number; onChange: (party: { travellers: number; bags: number }) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const cell = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => { if (!cell.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return <div ref={cell} className={`transfer-field transfer-party${open ? ' is-open' : ''}`}
    onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <span className="transfer-field__label" id={`${id}-label`}>Travellers & bags</span>
    <button ref={toggle} type="button" className="transfer-control transfer-party__toggle" aria-expanded={open} aria-controls={`${id}-panel`}
      aria-labelledby={`${id}-label ${id}-value`} onClick={() => setOpen((current) => !current)}>
      <Users className="transfer-control__icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      <span id={`${id}-value`} className="transfer-control__value transfer-party__words">{partySummary(travellers, bags)}</span>
      {/* Where the field is narrow (tablets), the same counts as icons and numbers; the words stay its accessible name. */}
      <span className="transfer-party__counts" aria-hidden="true">{travellers}<Luggage className="transfer-control__icon" size={18} strokeWidth={1.75} />{bags}</span>
      <ChevronDown className="transfer-control__chevron" size={18} strokeWidth={1.75} aria-hidden="true" />
    </button>
    <div id={`${id}-panel`} className="transfer-party__panel" role="group" aria-labelledby={`${id}-label`}>
      <Stepper label="Travellers" value={travellers} min={1} max={MAX_TRAVELLERS} onChange={(value) => onChange({ travellers: value, bags })} />
      <Stepper label="Bags" value={bags} min={0} max={MAX_BAGS} onChange={(value) => onChange({ travellers, bags: value })} />
      <button type="button" className="transfer-party__done" onClick={() => { setOpen(false); toggle.current?.focus(); }}>Done</button>
    </div>
  </div>;
}

/**
 * The ride first (owner, 8 Nov 2026): airport pickup or drop-off, the airport, the other end, the date and time,
 * travellers and bags, and meet & greet as a tick box on pickups. Phones stack it in one column with big targets; a
 * laptop fits it on one row. The page decides what the errors are; the form shows them by their fields once a search
 * has been tried, and moves the focus to the first one. Styles live in transfers.css.
 */
export function TransferTripForm({ form, onChange, errors, showErrors, areas, today, onSubmit, onInvalid, focusSignal = 0 }: {
  form: TransferForm; onChange: (form: TransferForm) => void;
  /** Every current error; shown by the fields only with `showErrors`. */
  errors: TransferErrors; showErrors: boolean;
  /** The catalogue's areas, offered in the place field. */
  areas: readonly string[];
  today: string;
  onSubmit: () => void;
  onInvalid: () => void;
  /** Changing it moves the focus to the first field that needs attention (or the first field). */
  focusSignal?: number;
}) {
  const id = useId();
  const airportRef = useRef<HTMLSelectElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);
  const placeRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);
  const dateCell = useRef<HTMLDivElement>(null);
  // A popover calendar closes when the traveller moves on: a new key remounts the picker, closed.
  const [dateKey, setDateKey] = useState(0);
  const set = (change: Partial<TransferForm>) => onChange({ ...form, ...change });
  const shown: TransferErrors = showErrors ? errors : {};
  const pickup = form.direction === 'pickup';
  const AirportIcon = pickup ? PlaneLanding : PlaneTakeoff;
  const airportName = AIRPORTS.find((airport) => airport.id === form.airport)?.label ?? OTHER_AIRPORT_LABEL;
  const errorId = (field: TransferField) => `${id}-${field}-error`;

  const focusField = (field?: TransferField) => {
    const target = field === 'airport' ? (form.airport === 'other' ? otherRef.current : airportRef.current)
      : field === 'place' ? placeRef.current
      : field === 'date' ? dateCell.current?.querySelector<HTMLElement>('.date-picker__trigger')
      : field === 'time' ? timeRef.current
      : (pickup ? airportRef.current : placeRef.current);
    target?.focus();
  };
  const focusFirst = () => focusField(transferFieldOrder.find((field) => errors[field]));
  const focusRef = useRef(focusFirst);
  focusRef.current = focusFirst;
  useEffect(() => { if (focusSignal) focusRef.current(); }, [focusSignal]);

  useEffect(() => {
    const popovers = window.matchMedia(POPOVER_QUERY);
    const onPointer = (event: PointerEvent) => {
      const cell = dateCell.current;
      if (popovers.matches && cell?.querySelector('.date-picker.is-open') && !cell.contains(event.target as Node)) setDateKey((key) => key + 1);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (transferFieldOrder.some((field) => errors[field])) { onInvalid(); focusFirst(); return; }
    onSubmit();
  };

  const airportField = <div key="airport" className={`transfer-field transfer-field--airport${shown.airport ? ' is-invalid' : ''}`}>
    <label className="transfer-field__label" htmlFor={`${id}-airport`}>{airportLabel(form.direction)}</label>
    <div className="transfer-control transfer-control--select">
      <AirportIcon className="transfer-control__icon" size={18} strokeWidth={1.75} aria-hidden="true" />
      <span className="transfer-control__value" aria-hidden="true">{airportName}</span>
      <ChevronDown className="transfer-control__chevron" size={18} strokeWidth={1.75} aria-hidden="true" />
      <select ref={airportRef} id={`${id}-airport`} value={form.airport} aria-describedby={shown.airport && form.airport !== 'other' ? errorId('airport') : undefined}
        onChange={(event) => set({ airport: airportChoice(event.target.value) })}>
        {AIRPORTS.map((airport) => <option key={airport.id} value={airport.id}>{airport.name}</option>)}
        <option value="other">{OTHER_AIRPORT_LABEL}</option>
      </select>
    </div>
    {form.airport === 'other' && <div className="transfer-control transfer-control--plain">
      <input ref={otherRef} type="text" value={form.otherAirport} maxLength={120} aria-label="Airport name" placeholder="Airport name"
        autoCapitalize="words" aria-invalid={shown.airport ? true : undefined} aria-describedby={shown.airport ? errorId('airport') : undefined}
        onChange={(event) => set({ otherAirport: event.target.value })} />
    </div>}
    {shown.airport && <p id={errorId('airport')} className="transfer-field__error">{shown.airport}</p>}
  </div>;

  const placeField = <PlaceField key="place" id={`${id}-place`} inputRef={placeRef} label={placeLabel(form.direction)} value={form.place} areas={areas}
    placeholder="Area, hotel or address"
    error={shown.place} errorId={errorId('place')} onChange={(place) => set({ place })} />;

  return <form className={`transfer-form transfer-form--${form.direction}`} noValidate aria-label="Plan your transfer" onSubmit={submit}>
    <fieldset className="transfer-tabs" data-direction={form.direction}>
      <legend className="sr-only">Transfer type</legend>
      <label className="transfer-tabs__tab">
        <input type="radio" name={`${id}-direction`} value="pickup" checked={pickup} onChange={() => set({ direction: 'pickup' })} />
        <PlaneLanding size={18} strokeWidth={1.75} aria-hidden="true" /><span>Airport pickup</span>
      </label>
      <label className="transfer-tabs__tab">
        <input type="radio" name={`${id}-direction`} value="dropoff" checked={!pickup} onChange={() => set({ direction: 'dropoff' })} />
        <PlaneTakeoff size={18} strokeWidth={1.75} aria-hidden="true" /><span>Airport drop-off</span>
      </label>
    </fieldset>

    <div className="transfer-form__fields">
      {pickup ? [airportField, placeField] : [placeField, airportField]}
      <div ref={dateCell} className={`transfer-field transfer-field--date${shown.date ? ' is-invalid' : ''}`}
        onBlur={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && event.currentTarget.querySelector('.date-picker.is-open') && window.matchMedia(POPOVER_QUERY).matches) setDateKey((key) => key + 1); }}>
        <DatePicker key={dateKey} label="Pickup date" mode="single" min={today} placeholder="Add date" value={{ from: form.date }}
          onChange={(range) => set({ date: range.from })} />
        {shown.date && <p id={errorId('date')} className="transfer-field__error">{shown.date}</p>}
      </div>
      <div className={`transfer-field transfer-field--time${shown.time ? ' is-invalid' : ''}`}>
        <label className="transfer-field__label" htmlFor={`${id}-time`}>Pickup time</label>
        <div className={`transfer-control transfer-control--time${form.time ? '' : ' is-empty'}`}>
          <Clock3 className="transfer-control__icon" size={18} strokeWidth={1.75} aria-hidden="true" />
          <input ref={timeRef} id={`${id}-time`} type="time" value={form.time} aria-invalid={shown.time ? true : undefined}
            aria-describedby={shown.time ? errorId('time') : undefined} onChange={(event) => set({ time: event.target.value })}
            // A click anywhere on the field opens the browser's own time picker where it has one.
            onClick={(event) => { try { event.currentTarget.showPicker?.(); } catch { /* not allowed here; typing still works */ } }} />
          <span className="transfer-control__placeholder" aria-hidden="true">Add time</span>
        </div>
        {shown.time && <p id={errorId('time')} className="transfer-field__error">{shown.time}</p>}
      </div>
      <PartyField travellers={form.travellers} bags={form.bags} onChange={(party) => set(party)} />
    </div>

    {pickup && <label className="transfer-check">
      <input type="checkbox" checked={form.meetGreet} onChange={(event) => set({ meetGreet: event.target.checked })} />
      <span className="transfer-check__box" aria-hidden="true"><Check size={14} strokeWidth={1.75} /></span>
      <span className="transfer-check__text">Meet & greet at arrivals</span>
    </label>}

    <button type="submit" className="transfer-form__submit">Find transfers</button>
  </form>;
}
