import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from 'react';
import { Check, Heart, Minus, Plus, Store, Trash2, X } from 'lucide-react';
import type { CatalogItem, CatalogModifierGroup, Merchant } from '../../providers/DiscoveryProvider';
import { formatPrice } from '../../lib/formatPrice';
import { isBikeHire, isListKind, kindPresentation, transferExamples, transferDirection, vehicleJourney, type OfferingKind } from '../../data/offeringKinds';
import { localDateKey } from '../../data/massagePresentation';
import { ImageWithFallback } from '../ImageWithFallback';
import { DatePicker } from '../DatePicker';
import { offeringPrice, sheetDescription } from './OfferingCard';
import type { RentalTrip, TransferTrip } from './RentalTripPanel';

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const id = useId();
  const name = label.toLocaleLowerCase('en-KE');
  return <div className="offering-stepper" role="group" aria-labelledby={id}>
    <span id={id}>{label}</span>
    <div><button type="button" aria-label={`Decrease ${name}`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={16} strokeWidth={2} aria-hidden="true" /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`Increase ${name}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={16} strokeWidth={2} aria-hidden="true" /></button></div>
  </div>;
}

function Chips({ name, label, options, value, onChange }: { name: string; label: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return <fieldset className="offering-chips"><legend>{label}</legend><div>{options.map((option) => <label key={option.value} className="offering-chip">
    <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span>
  </label>)}</div></fieldset>;
}

const Field = ({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) =>
  <label className={`offering-field${wide ? ' offering-field--wide' : ''}`}><span>{label}</span>{children}</label>;

/**
 * The modal plumbing both sheets share: open as a modal dialog, lock the page scroll, close on Escape or a
 * backdrop click, and hand focus back to whatever opened it.
 */
function useModal(onClose: () => void) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    return () => { document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [dialog]);
  const close = () => { if (dialog?.open) dialog.close(); else onClose(); };
  return {
    close,
    props: {
      ref: setDialog,
      onClose,
      onCancel: (event: SyntheticEvent<HTMLDialogElement>) => { event.preventDefault(); close(); },
      onClick: (event: MouseEvent<HTMLDialogElement>) => { if (event.target === event.currentTarget) close(); },
    },
  };
}

/** What a shopper filled in on an expanded card, kept on this device with their request. Every field is optional. */
export interface OfferingAnswers {
  date?: string; time?: string; endDate?: string; endTime?: string; part?: string;
  adults?: number; children?: number; place?: string; returnPlace?: string; dropoff?: string;
  brief?: string; budget?: string; contact?: string; driver?: boolean;
  travellers?: number; bags?: number; meetGreet?: boolean; notes?: string;
}
/** A request kept on this device. Nothing is sent anywhere. */
export interface KeptRequest { answers: OfferingAnswers; savedAt: string }

/** The trip or ride the shopper planned on the page fills the vehicle's questions. */
function plannedAnswers(trip?: RentalTrip, ride?: TransferTrip): OfferingAnswers {
  if (trip) return { place: trip.pickupPlace, date: trip.dates.from, endDate: trip.dates.to, time: trip.pickupTime, endTime: trip.returnTime,
    returnPlace: trip.sameReturn ? '' : trip.returnPlace, driver: trip.driver };
  if (ride) return { place: ride.pickup, dropoff: ride.dropoff, date: ride.date, time: ride.time, travellers: ride.travellers, bags: ride.bags, meetGreet: ride.meetGreet };
  return {};
}

const price = (item: CatalogItem, quantity: number) =>
  item.isAvailable === false || item.price === undefined ? undefined : formatPrice({ price: item.price * quantity, currency: item.currency }, 'code');

export interface OfferingSheetProps {
  merchant: Merchant; item: CatalogItem; kind: OfferingKind; saved: boolean; onSave: (id: string) => void; onClose: () => void;
  /** Car or bike hire planned on the page; it fills the vehicle's questions. */
  trip?: RentalTrip;
  /** A transfer planned on the page; it fills the ride's questions. */
  ride?: TransferTrip;
  /** How many of this product are already on the shopper's list. */
  listed?: number;
  /** Sets how many of this product are on the list (0 takes it off). Without it a product can't be added. */
  onList?: (item: CatalogItem, quantity: number) => void;
  /** The request kept on this device for this item, if any. */
  request?: KeptRequest;
  /** Keeps the request on this device. Without it a request can't be saved. */
  onKeep?: (item: CatalogItem, answers: OfferingAnswers) => void;
  onForget?: (item: CatalogItem) => void;
}

/**
 * The expanded state of the one item card. Every kind shares the frame (photo, title, price, description,
 * one primary action); the questions in the middle change by kind. A centred panel on wider screens, a
 * bottom sheet on phones. Products go on the shopper's list; everything else is a request kept on this
 * device, and the footer says so in one line.
 */
export function OfferingSheet({ merchant, item, kind, saved, onSave, onClose, trip, ride, listed = 0, onList, request, onKeep, onForget }: OfferingSheetProps) {
  const copy = kindPresentation[kind];
  const list = isListKind(kind);
  const journey = kind === 'vehicle' ? vehicleJourney(merchant) ?? 'rental' : undefined;
  const examples = transferExamples(transferDirection(merchant));
  const modal = useModal(onClose);
  const titleId = useId();
  const name = useId();
  const start = request?.answers ?? plannedAnswers(trip, ride);
  const [quantity, setQuantity] = useState(listed > 0 ? listed : 1);
  const [date, setDate] = useState(start.date ?? '');
  const [time, setTime] = useState(start.time ?? '');
  const [endDate, setEndDate] = useState(start.endDate ?? '');
  const [endTime, setEndTime] = useState(start.endTime ?? '');
  const [part, setPart] = useState(start.part ?? '');
  const [adults, setAdults] = useState(start.adults ?? 1);
  const [children, setChildren] = useState(start.children ?? 0);
  const [place, setPlace] = useState(start.place ?? '');
  const [otherReturn, setOtherReturn] = useState(Boolean(start.returnPlace));
  const [returnPlace, setReturnPlace] = useState(start.returnPlace ?? '');
  const [dropoff, setDropoff] = useState(start.dropoff ?? '');
  const [travellers, setTravellers] = useState(start.travellers ?? 1);
  const [bags, setBags] = useState(start.bags ?? 0);
  const [meetGreet, setMeetGreet] = useState(start.meetGreet ?? false);
  const [brief, setBrief] = useState(start.brief ?? '');
  const [budget, setBudget] = useState(start.budget ?? '');
  const [contact, setContact] = useState(start.contact ?? 'whatsapp');
  const [driver, setDriver] = useState(start.driver ?? false);
  const [notes, setNotes] = useState(start.notes ?? '');
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [status, setStatus] = useState(request ? copy.saved : '');
  const [error, setError] = useState('');
  const today = localDateKey();
  const unavailable = item.isAvailable === false;
  const description = sheetDescription(item);
  // Any change after saving turns the button back into its action.
  const edit = <T,>(set: (value: T) => void) => (value: T) => { set(value); setStatus(''); setError(''); };

  const toggleChoice = (group: CatalogModifierGroup, optionId: string) => edit(setChoices)({
    ...choices,
    [group.id]: group.maxSelections === 1 ? [optionId]
      : (choices[group.id] ?? []).includes(optionId) ? (choices[group.id] ?? []).filter((id) => id !== optionId) : [...(choices[group.id] ?? []), optionId],
  });

  const problem = (): string | undefined => {
    if (kind === 'service' && !date) return 'Choose a preferred date.';
    if (kind === 'activity' && !date) return 'Choose a date.';
    if (kind === 'task' && brief.trim().length < 10) return 'Tell the provider a little more about what you need.';
    if (journey === 'transfer' && !(place.trim() && dropoff.trim() && date && time)) return 'Add the pickup, drop-off, date and time.';
    if (journey === 'rental') {
      if (!place.trim() || !date || !endDate) return 'Add the pick-up place and both dates.';
      if (otherReturn && !returnPlace.trim()) return 'Add where you’ll return it.';
      if (`${endDate}T${endTime || '23:59'}` <= `${date}T${time || '00:00'}`) return 'The return must be after the pickup.';
    }
    const missing = kind === 'dish' ? item.modifierGroups?.find((group) => group.required && (choices[group.id]?.length ?? 0) < Math.max(1, group.minSelections)) : undefined;
    return missing ? `Choose ${missing.name.toLocaleLowerCase('en-KE')}.` : undefined;
  };
  const answers = (): OfferingAnswers => {
    const text = (value: string) => value.trim() || undefined;
    if (kind === 'service') return { date, time: text(time), adults, notes: text(notes) };
    if (kind === 'activity') return { date, part: text(part), adults, children, notes: text(notes) };
    if (kind === 'task') return { brief: brief.trim(), date: text(date), place: text(place), budget: text(budget), contact };
    if (journey === 'transfer') return { place: place.trim(), dropoff: dropoff.trim(), date, time, travellers, bags, meetGreet, notes: text(notes) };
    if (journey === 'rental') return { place: place.trim(), date, endDate, time: text(time), endTime: text(endTime), returnPlace: otherReturn ? text(returnPlace) : undefined, driver, notes: text(notes) };
    return {};
  };
  const submit = () => {
    const issue = problem();
    if (issue) return setError(issue);
    setError('');
    if (list) {
      onList?.(item, quantity);
      return modal.close();
    }
    onKeep?.(item, answers());
    setStatus(copy.saved);
  };
  const forget = () => {
    if (list) { onList?.(item, 0); return modal.close(); }
    onForget?.(item);
    setStatus('Removed from this device.');
  };

  const unchanged = list && listed > 0 && quantity === listed;
  const ready = list ? Boolean(onList) && !unchanged : Boolean(onKeep);
  const total = list && quantity > 1 ? price(item, quantity) : undefined;
  const action = list
    ? <>{unchanged ? <>On your list<Check size={18} strokeWidth={2} aria-hidden="true" /></> : listed > 0 ? 'Update list' : quantity > 1 ? `Add ${quantity} to list` : copy.sheetAction}{total && !unchanged && <span className="offering-sheet__primary-total">{total}</span>}</>
    : status === copy.saved ? <>Saved<Check size={18} strokeWidth={2} aria-hidden="true" /></> : request ? 'Update request' : copy.sheetAction;

  return <dialog {...modal.props} className={`offering-sheet offering-sheet--${kind}`} aria-labelledby={titleId}>
    <div className="offering-sheet__layout">
      <div className="offering-sheet__media">
        <ImageWithFallback src={item.image} alt={item.name} width={760} height={570} referrerPolicy="no-referrer" />
        <button type="button" className="offering-sheet__close" aria-label="Close" onClick={modal.close} autoFocus><X size={20} strokeWidth={2} aria-hidden="true" /></button>
      </div>
      <form className="offering-sheet__content" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <p className="offering-sheet__merchant"><Store size={15} strokeWidth={1.75} aria-hidden="true" />{merchant.name}{merchant.area ? ` · ${merchant.area}` : ''}</p>
        <div className="offering-sheet__title">
          <h2 id={titleId}>{item.name}</h2>
          <button type="button" className="offering-sheet__save" aria-pressed={saved} aria-label={`${saved ? 'Unsave' : 'Save'} ${item.name}`} onClick={() => onSave(item.id)}><Heart size={20} strokeWidth={1.75} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" /></button>
        </div>
        <p className={`offering-sheet__price${unavailable ? ' is-unavailable' : ''}`}>{offeringPrice(item, kind)}</p>
        {list && listed > 0 && <p className="offering-sheet__listed"><Check size={15} strokeWidth={2} aria-hidden="true" />{listed} on your list</p>}
        {description && <p className="offering-sheet__description">{description}</p>}

        <div className="offering-sheet__questions">
          {kind === 'dish' && item.modifierGroups?.map((group) => {
            const single = group.maxSelections === 1;
            const selected = choices[group.id] ?? [];
            return <fieldset key={group.id} className="offering-options"><legend>{group.name}{group.required ? '' : ' (optional)'}</legend>
              {group.options.map((option) => <label key={option.id} className="offering-option">
                <input type={single ? 'radio' : 'checkbox'} name={`${name}-${group.id}`} checked={selected.includes(option.id)}
                  disabled={option.isAvailable === false || (!single && !selected.includes(option.id) && selected.length >= group.maxSelections)}
                  onChange={() => toggleChoice(group, option.id)} />
                <span>{option.name}</span>{option.priceDelta > 0 && <small>+ {formatPrice({ price: option.priceDelta, currency: option.currency }, 'code')}</small>}
              </label>)}
            </fieldset>;
          })}
          {kind === 'dish' && <Field label="Special request (optional)" wide><textarea value={notes} maxLength={200} placeholder="e.g. no onions" onChange={(event) => edit(setNotes)(event.target.value)} /></Field>}
          {list && !unavailable && <Stepper label="Quantity" value={quantity} min={1} max={99} onChange={edit(setQuantity)} />}

          {kind === 'service' && <>
            <DatePicker label="Preferred date" mode="single" min={today} value={{ from: date || undefined }} onChange={(range) => edit(setDate)(range.from ?? '')} />
            <Field label="Preferred time (optional)"><input type="time" value={time} onChange={(event) => edit(setTime)(event.target.value)} /></Field>
            <Stepper label="People" value={adults} min={1} max={10} onChange={edit(setAdults)} />
          </>}

          {kind === 'activity' && <>
            <DatePicker label="Date" mode="single" min={today} value={{ from: date || undefined }} onChange={(range) => edit(setDate)(range.from ?? '')} />
            <Chips name={`${name}-part`} label="Time of day" value={part} onChange={edit(setPart)} options={[{ value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'evening', label: 'Evening' }]} />
            <Stepper label="Adults" value={adults} min={1} max={20} onChange={edit(setAdults)} />
            <Stepper label="Children" value={children} min={0} max={20} onChange={edit(setChildren)} />
          </>}

          {kind === 'task' && <>
            <Field label="Describe what you need" wide><textarea required value={brief} maxLength={600} placeholder="What, for whom, and anything the provider should know" onChange={(event) => edit(setBrief)(event.target.value)} /></Field>
            <DatePicker label="Needed by (optional)" mode="single" min={today} value={{ from: date || undefined }} onChange={(range) => edit(setDate)(range.from ?? '')} />
            <Field label="Location (optional)"><input type="text" value={place} maxLength={120} placeholder="Area or address" onChange={(event) => edit(setPlace)(event.target.value)} /></Field>
            <Field label="Budget (optional, KES)"><input type="number" inputMode="numeric" min={0} value={budget} onChange={(event) => edit(setBudget)(event.target.value)} /></Field>
            <Chips name={`${name}-contact`} label="How should they reach you?" value={contact} onChange={edit(setContact)} options={[{ value: 'call', label: 'Call' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }]} />
          </>}

          {journey === 'rental' && <>
            <Field label="Pick-up place" wide><input type="text" value={place} maxLength={120} placeholder="e.g. JKIA Terminal 1, or your address" onChange={(event) => edit(setPlace)(event.target.value)} /></Field>
            <DatePicker label="Pick-up and return dates" mode="range" min={today} value={{ from: date || undefined, to: endDate || undefined }}
              onChange={(range) => { edit(setDate)(range.from ?? ''); setEndDate(range.to ?? ''); }} />
            <Field label="Pick-up time"><input type="time" value={time} onChange={(event) => edit(setTime)(event.target.value)} /></Field>
            <Field label="Return time"><input type="time" value={endTime} onChange={(event) => edit(setEndTime)(event.target.value)} /></Field>
            <label className="offering-check"><input type="checkbox" checked={otherReturn} onChange={(event) => edit(setOtherReturn)(event.target.checked)} /><span>Return somewhere else</span></label>
            {otherReturn && <Field label="Return place" wide><input type="text" value={returnPlace} maxLength={120} placeholder="Where you’ll drop it off" onChange={(event) => edit(setReturnPlace)(event.target.value)} /></Field>}
            {!isBikeHire(merchant) && <label className="offering-check"><input type="checkbox" checked={driver} onChange={(event) => edit(setDriver)(event.target.checked)} /><span>With a driver</span></label>}
          </>}

          {journey === 'transfer' && <>
            <Field label="Pickup" wide><input type="text" value={place} maxLength={120} placeholder={examples.pickup} onChange={(event) => edit(setPlace)(event.target.value)} /></Field>
            <Field label="Drop-off" wide><input type="text" value={dropoff} maxLength={120} placeholder={examples.dropoff} onChange={(event) => edit(setDropoff)(event.target.value)} /></Field>
            <DatePicker label="Date" mode="single" min={today} value={{ from: date || undefined }} onChange={(range) => edit(setDate)(range.from ?? '')} />
            <Field label="Pickup time"><input type="time" value={time} onChange={(event) => edit(setTime)(event.target.value)} /></Field>
            <label className="offering-check offering-check--inline"><input type="checkbox" checked={meetGreet} onChange={(event) => edit(setMeetGreet)(event.target.checked)} /><span>Meet & greet</span></label>
            <Stepper label="Travellers" value={travellers} min={1} max={20} onChange={edit(setTravellers)} />
            <Stepper label="Bags" value={bags} min={0} max={20} onChange={edit(setBags)} />
          </>}

          {(kind === 'service' || kind === 'activity' || kind === 'vehicle') && <Field label="Anything they should know? (optional)" wide><textarea value={notes} maxLength={300} onChange={(event) => edit(setNotes)(event.target.value)} /></Field>}
        </div>

        <footer className="offering-sheet__footer">
          <p role="status" className={error ? 'is-error' : status ? 'is-saved' : undefined}>{error || status || copy.pending}</p>
          {(list ? listed > 0 : Boolean(request && onForget)) && <button type="button" className="offering-sheet__remove" onClick={forget}><Trash2 size={16} strokeWidth={2} aria-hidden="true" />Remove</button>}
          <button type="submit" className="offering-sheet__primary" disabled={unavailable || !ready}>{action}</button>
        </footer>
      </form>
    </div>
  </dialog>;
}

export interface ListLine { item: CatalogItem; quantity: number }

/**
 * The shopper's list for one store (products and dishes), opened from the floating basket. It lives on
 * this device: no checkout and no payment, and the footer says so in one line.
 */
export function OfferingListSheet({ merchant, kind, lines, total, max = 99, onQuantity, onClear, onClose }: {
  merchant: Merchant; kind: OfferingKind; lines: ListLine[];
  /** The total at listed prices, only when every line has one in a single currency. */
  total?: string;
  max?: number;
  onQuantity: (item: CatalogItem, quantity: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const modal = useModal(onClose);
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  const copy = kindPresentation[kind];
  const less = (item: CatalogItem, quantity: number) => {
    // The line leaves with its last unit, so keep keyboard focus inside the sheet.
    if (quantity <= 1) requestAnimationFrame(() => closeButton.current?.focus());
    onQuantity(item, quantity - 1);
  };
  return <dialog {...modal.props} className="offering-sheet offering-sheet--list" aria-labelledby={titleId}>
    <div className="offering-list">
      <header className="offering-list__header">
        <div><h2 id={titleId}>Your list</h2><p>{merchant.name}</p></div>
        <button ref={closeButton} type="button" className="offering-list__close" aria-label="Close" onClick={modal.close} autoFocus><X size={20} strokeWidth={2} aria-hidden="true" /></button>
      </header>
      {lines.length > 0
        ? <ul className="offering-list__lines">{lines.map(({ item, quantity }) => {
          const unavailable = item.isAvailable === false;
          return <li key={item.id} className="offering-list__line">
            <ImageWithFallback src={item.image} alt="" width={112} height={112} className="offering-list__photo" referrerPolicy="no-referrer" />
            <div className="offering-list__text">
              <strong>{item.name}</strong>
              <span className={unavailable ? 'is-unavailable' : undefined}>{offeringPrice(item, kind)}</span>
            </div>
            <div className="offering-list__stepper" role="group" aria-label={`${item.name}: quantity`}>
              <button type="button" aria-label={quantity > 1 ? `Remove one ${item.name}` : `Take ${item.name} off your list`} onClick={() => less(item, quantity)}>
                {quantity > 1 ? <Minus size={16} strokeWidth={2} aria-hidden="true" /> : <Trash2 size={16} strokeWidth={2} aria-hidden="true" />}</button>
              <output aria-live="polite">{quantity}</output>
              <button type="button" aria-label={`Add another ${item.name}`} disabled={unavailable || quantity >= max} onClick={() => onQuantity(item, quantity + 1)}><Plus size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
            <span className="offering-list__amount">{price(item, quantity) ?? ''}</span>
          </li>;
        })}</ul>
        : <p className="offering-list__empty">Your list is empty.</p>}
      <footer className="offering-list__footer">
        {total && <p className="offering-list__total"><span>Total at listed prices</span><strong>{total}</strong></p>}
        <p className="offering-list__note">{copy.pending}</p>
        <div className="offering-list__actions">
          {lines.length > 0 && <button type="button" className="offering-sheet__remove" onClick={onClear}><Trash2 size={16} strokeWidth={2} aria-hidden="true" />Clear list</button>}
          <button type="button" className="offering-sheet__primary" onClick={modal.close}>Done</button>
        </div>
      </footer>
    </div>
  </dialog>;
}
