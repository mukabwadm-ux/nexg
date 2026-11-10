import { useEffect, useId, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type SyntheticEvent } from 'react';
import { ArrowRight, Check, ChevronRight, Heart, Minus, Plus, Trash2, X } from 'lucide-react';
import type { CatalogItem, CatalogModifierGroup, Merchant } from '../../providers/DiscoveryProvider';
import { nexgCheckoutUrl } from '../../cart/nexgCart';
import { catalogNaming } from '../../data/catalogSections';
import {
  cartAction, cartSheetNote, detailAction, itemSheetBlock, readItemRequest,
  requestAnswers, requestDraft, requestIntro, requestProblem, storeLabel, storeMeta, writeItemRequest,
  type ItemSheetContext, type KeptRequest, type OfferingAnswers, type RequestDraft,
} from '../../data/itemSheet';
import { checkoutNote, MAX_CART_QUANTITY, type CartOutcome } from '../cart/useStoreCart';
import { kindPresentation, transferExamples, type OfferingKind } from '../../data/offeringKinds';
import { localDateKey, MAX_PEOPLE } from '../../data/massagePresentation';
import { cartBlock, choiceRule, optionPrice } from '../../data/restaurantPresentation';
import { productDescription } from '../../data/supermarketPresentation';
import { ImageWithFallback } from '../ImageWithFallback';
import { MerchantLogo } from '../MerchantCard';
import { DatePicker } from '../DatePicker';
import { offeringPrice, sheetDescription } from './OfferingCard';
import type { RentalTrip, TransferTrip } from './RentalTripPanel';
import './item-sheet.css';

export type { KeptRequest, OfferingAnswers } from '../../data/itemSheet';

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const id = useId();
  const name = label.toLocaleLowerCase('en-KE');
  return <div className="offering-stepper" role="group" aria-labelledby={id}>
    <span id={id}>{label}</span>
    <div><button type="button" aria-label={`Decrease ${name}`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={16} strokeWidth={1.75} aria-hidden="true" /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`Increase ${name}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={16} strokeWidth={1.75} aria-hidden="true" /></button></div>
  </div>;
}

function Chips({ name, label, options, value, onChange }: { name: string; label: string; options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return <fieldset className="offering-chips"><legend>{label}</legend><div>{options.map((option) => <label key={option.value} className="offering-chip">
    <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} /><span>{option.label}</span>
  </label>)}</div></fieldset>;
}

const Field = ({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) =>
  <label className={`offering-field${wide ? ' offering-field--wide' : ''}`}><span>{label}</span>{children}</label>;

/** Below this width the item sheet is a bottom sheet (item-sheet.css uses the same breakpoint). */
const PHONE_QUERY = '(max-width: 767.98px)';
/** A flick this fast (px per ms) closes the sheet whatever the distance; a slower drag closes past a quarter of its height. */
const DISMISS_VELOCITY = 0.4;
const DISMISS_SHARE = 0.25;
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The modal plumbing every sheet here shares: a native modal <dialog> (focus stays inside it and goes back to whatever
 * opened it), the page scroll locked behind it (item-sheet.css, while the dialog is open, so it never fights another
 * sheet's lock), and Escape or a press on the backdrop to close. Closing
 * plays the exit (item-sheet.css) before the dialog closes, and on phones the sheet can be dragged down to dismiss.
 */
function useSheet(onClose: () => void) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  // Read once while rendering: effects run twice in development, and by then the sheet holds the focus.
  const [opener] = useState(() => typeof document !== 'undefined' && document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
  const leaving = useRef(false);
  const backdropPress = useRef(false);
  const dragged = useRef(false);

  useEffect(() => {
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [dialog, opener]);

  const close = () => {
    if (!dialog?.open) { onClose(); return; }
    if (leaving.current) return;
    leaving.current = true;
    dialog.removeAttribute('data-dragging');
    // A dragged sheet carries on down from where it was let go; with reduced motion it fades out where it is.
    if (!reducedMotion()) dialog.style.removeProperty('translate');
    dialog.setAttribute('data-state', 'closing');
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      dialog.removeEventListener('transitionend', onEnd);
      if (dialog.open) dialog.close();
    };
    const onEnd = (event: TransitionEvent) => { if (event.target === dialog) finish(); };
    dialog.addEventListener('transitionend', onEnd);
    // The exit is at most 200ms; this catches a browser that skips the transition.
    window.setTimeout(finish, 320);
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  // Drag down to dismiss (phones). Only from the top of the sheet's scroll, so scrolling the content never moves it;
  // a quick flick is enough, a slow drag must pass a quarter of the height, and anything less springs back.
  useEffect(() => {
    if (!dialog) return;
    const phone = window.matchMedia(PHONE_QUERY);
    const scroller = () => dialog.querySelector<HTMLElement>('.item-sheet__scroll');
    let start: { x: number; y: number; top: number } | undefined;
    let dragging = false;
    let offset = 0;
    let last = { y: 0, time: 0 };
    let velocity = 0;
    const onStart = (event: TouchEvent) => {
      start = undefined; dragging = false;
      if (!phone.matches || leaving.current || event.touches.length !== 1) return;
      // Text areas and an open calendar keep their own gestures.
      if (event.target instanceof Element && event.target.closest('textarea, select, .date-picker__panel')) return;
      const touch = event.touches[0]!;
      start = { x: touch.clientX, y: touch.clientY, top: scroller()?.scrollTop ?? 0 };
      last = { y: touch.clientY, time: event.timeStamp };
      velocity = 0;
    };
    const onMove = (event: TouchEvent) => {
      // A second finger mid-drag is ignored, so the sheet never jumps to it.
      if (!start || event.touches.length !== 1) return;
      const touch = event.touches[0]!;
      const dy = touch.clientY - start.y;
      const dx = touch.clientX - start.x;
      if (!dragging) {
        const atTop = start.top <= 0 && (scroller()?.scrollTop ?? 0) <= 0;
        if (!atTop || dy <= 0 || Math.abs(dx) > Math.abs(dy)) {
          // A scroll or a sideways swipe: not a drag, for the rest of this touch.
          if (Math.abs(dy) > 6 || Math.abs(dx) > 6) start = undefined;
          return;
        }
        // Pulling down at the top would only bounce the content, so the sheet takes the touch.
        if (event.cancelable) event.preventDefault();
        if (dy < 6) return;
        dragging = true;
        dragged.current = true;
        dialog.setAttribute('data-dragging', '');
      }
      if (event.cancelable) event.preventDefault();
      offset = Math.max(0, dy);
      dialog.style.translate = `0 ${offset}px`;
      const elapsed = event.timeStamp - last.time;
      if (elapsed > 0) velocity = (touch.clientY - last.y) / elapsed;
      last = { y: touch.clientY, time: event.timeStamp };
    };
    const onEnd = () => {
      start = undefined;
      if (!dragging) return;
      dragging = false;
      const height = dialog.getBoundingClientRect().height || 1;
      if (offset > height * DISMISS_SHARE || (velocity > DISMISS_VELOCITY && offset > 16)) closeRef.current();
      else { dialog.removeAttribute('data-dragging'); dialog.style.removeProperty('translate'); }
      offset = 0;
      // A drag that ends over the backdrop is not a press on it.
      window.setTimeout(() => { dragged.current = false; }, 0);
    };
    dialog.addEventListener('touchstart', onStart, { passive: true });
    dialog.addEventListener('touchmove', onMove, { passive: false });
    dialog.addEventListener('touchend', onEnd);
    dialog.addEventListener('touchcancel', onEnd);
    return () => {
      dialog.removeEventListener('touchstart', onStart);
      dialog.removeEventListener('touchmove', onMove);
      dialog.removeEventListener('touchend', onEnd);
      dialog.removeEventListener('touchcancel', onEnd);
    };
  }, [dialog]);

  return {
    close,
    props: {
      ref: setDialog,
      onClose,
      onCancel: (event: SyntheticEvent<HTMLDialogElement>) => { event.preventDefault(); close(); },
      // Only a press that starts and ends on the backdrop closes: selecting text and letting go outside doesn't.
      onPointerDown: (event: PointerEvent<HTMLDialogElement>) => { backdropPress.current = event.target === event.currentTarget; },
      onClick: (event: MouseEvent<HTMLDialogElement>) => {
        if (event.target === event.currentTarget && backdropPress.current && !dragged.current) close();
        backdropPress.current = false;
      },
    },
  };
}

function deviceStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** The trip or ride the shopper planned on the page fills the vehicle's questions. */
function plannedAnswers(trip?: RentalTrip, ride?: TransferTrip): OfferingAnswers {
  if (trip) return { place: trip.pickupPlace, date: trip.dates.from, endDate: trip.dates.to, time: trip.pickupTime, endTime: trip.returnTime,
    returnPlace: trip.sameReturn ? '' : trip.returnPlace, driver: trip.driver };
  if (ride) return { place: ride.pickup, dropoff: ride.dropoff, date: ride.date, time: ride.time, travellers: ride.travellers, bags: ride.bags, meetGreet: ride.meetGreet };
  return {};
}

/** The item's own option groups, shown as its catalogue lists them. The cart can't hold choices yet, so nothing here is chosen. */
function OptionGroups({ groups }: { groups: readonly CatalogModifierGroup[] }) {
  return <>{groups.map((group) => <section key={group.id} className="item-sheet__group" aria-label={group.name}>
    <h3 className="item-sheet__group-title">{group.name}<span>{choiceRule(group)}</span></h3>
    <ul>{group.options.map((option) => {
      const unavailable = option.isAvailable === false;
      const extra = optionPrice(option);
      return <li key={option.id} className={`item-sheet__option${unavailable ? ' is-unavailable' : ''}`}>
        <span><span>{option.name}</span>{unavailable ? <small>Currently unavailable</small> : option.description && <small>{option.description}</small>}</span>
        {extra && <span className="item-sheet__option-price">{extra}</span>}
      </li>;
    })}</ul>
  </section>)}</>;
}

export interface OfferingSheetProps {
  merchant: Merchant; item: CatalogItem; kind: OfferingKind; saved: boolean; onSave: (id: string) => void; onClose: () => void;
  /** Car or bike hire planned on the page; it fills the vehicle's questions. */
  trip?: RentalTrip;
  /** A transfer planned on the page; it fills the ride's questions. */
  ride?: TransferTrip;
  /** How many of this product or dish the store's cart holds (with `onList`). */
  listed?: number;
  /**
   * Puts this many in the store's NexG cart (0 takes it out), usually through useStoreCart. 'waiting' keeps the sheet
   * open under the store's "Start a new cart?"; 'refused' says it couldn't go in. Without it a product can't be added.
   */
  onList?: (item: CatalogItem, quantity: number) => void | CartOutcome;
  /** The request kept on this device for this item, if any. */
  request?: KeptRequest;
  /** Keeps the request on this device. Without it (and without a context) a request can't be saved. */
  onKeep?: (item: CatalogItem, answers: OfferingAnswers) => void;
  onForget?: (item: CatalogItem) => void;
  /**
   * Where the sheet opened: in the store, or on a discovery page, which adds the "Order from" store card. With a
   * context, a request without `onKeep` is kept on this device where the store's own page reads it.
   */
  context?: ItemSheetContext;
  /** Opens the item's store: from the store card, or "View in store" for an item needing a choice the cart can't hold. */
  onOpenStore?: (itemId?: string) => void;
  /** Opens the item's own page (an event, class, activity or trip). Activities then link there instead of asking questions. */
  onOpenDetail?: () => void;
  /** A short line over the title, such as the aisle. */
  eyebrow?: string;
}

/**
 * The one item sheet (owner, 9 Nov 2026): whatever a shopper taps, in any store or on any discovery page, opens it.
 * A bottom sheet on phones, a centred panel with a photo column on wider screens. The frame never changes: photo,
 * title, price, description, the kind's own block (itemSheet.ts decides it), the store it comes from when opened
 * outside the store, and one main button. Products and dishes go in the NexG cart; services, tasks and vehicles are
 * requests kept on this device, and the footer says so; events and trips link to their own page.
 */
export function OfferingSheet({ merchant, item, kind, saved, onSave, onClose, trip, ride, listed = 0, onList, request, onKeep, onForget, context, onOpenStore, onOpenDetail, eyebrow }: OfferingSheetProps) {
  const today = localDateKey();
  const block = itemSheetBlock(merchant, item, kind, { context, detail: Boolean(onOpenDetail), today });
  const copy = kindPresentation[kind];
  const naming = catalogNaming(merchant);
  const sheet = useSheet(onClose);
  const titleId = useId();
  const blockId = useId();
  const storeId = useId();
  const name = useId();
  const primary = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const unavailable = item.isAvailable === false;
  // Only words the store wrote: generated copy that repeats the name and the store is left out.
  const description = productDescription(item, merchant) ? sheetDescription(item) : undefined;

  // Products and dishes: the store's NexG cart (one store per cart), written through onList.
  const inCart = onList ? listed : 0;
  const reason = block.type === 'cart' ? cartBlock(item) : undefined;
  const checkoutUrl = nexgCheckoutUrl();
  const [quantity, setQuantity] = useState(() => Math.max(1, Math.min(MAX_CART_QUANTITY, inCart || 1)));

  // Requests: the store keeps them (onKeep), or with a context this device keeps them where the store's page reads them.
  const asking = block.type === 'request' || block.type === 'vehicle';
  const keepsOwn = asking && Boolean(context) && !onKeep;
  const [own, setOwn] = useState<KeptRequest | undefined>(() => (keepsOwn ? readItemRequest(deviceStorage(), merchant, item.id, today) : undefined));
  const kept = keepsOwn ? own : request;
  const [draft, setDraft] = useState(() => requestDraft(kept?.answers ?? plannedAnswers(trip, ride)));
  const [status, setStatus] = useState(kept ? copy.saved : '');
  const [error, setError] = useState('');

  // Any change after saving turns the button back into its action.
  const touched = () => { setStatus(''); setError(''); };
  const set = <K extends keyof RequestDraft>(key: K) => (value: RequestDraft[K]) => { setDraft((current) => ({ ...current, [key]: value })); touched(); };
  const changeQuantity = (value: number) => { setQuantity(value); touched(); };

  const order = () => {
    if (reason) {
      if (reason === 'choices' && context === 'discovery') onOpenStore?.(item.id);
      return;
    }
    if (!onList) return;
    const outcome = onList(item, quantity);
    // "Start a new cart?" opens over the sheet; the store closes the sheet once a new cart starts.
    if (outcome === 'waiting') return;
    if (outcome === 'refused') { setError(`This ${naming.item} couldn’t go in your cart. Please try again.`); return; }
    sheet.close();
  };

  const submit = () => {
    if (block.type === 'detail') { onOpenDetail?.(); return; }
    if (block.type === 'cart') { order(); return; }
    const issue = requestProblem(block, draft);
    if (issue) { setError(issue); return; }
    setError('');
    const answers = requestAnswers(block, draft);
    if (keepsOwn) {
      const next: KeptRequest = { answers, savedAt: new Date().toISOString() };
      if (!writeItemRequest(deviceStorage(), merchant, item.id, next)) { setError('This device couldn’t keep the request. Please try again.'); return; }
      setOwn(next);
    } else onKeep?.(item, answers);
    setStatus(copy.saved);
  };
  const forget = () => {
    if (block.type === 'cart') { onList?.(item, 0); sheet.close(); return; }
    // Remove leaves with the request, so keyboard focus moves to the main action (or Close) first.
    const button = primary.current;
    (button && !button.disabled ? button : closeButton.current)?.focus();
    if (keepsOwn) { writeItemRequest(deviceStorage(), merchant, item.id); setOwn(undefined); } else onForget?.(item);
    setStatus('Removed from this device.');
  };

  // The main button and the one line above it, by block.
  let action: ReactNode;
  let disabled = false;
  let note: string | undefined;
  let removable = false;
  let stepper: ReactNode;
  let chip: string | undefined;
  if (block.type === 'cart') {
    const next = cartAction({ item, reason, quantity, inCart, context, canOpenStore: Boolean(onOpenStore) });
    action = <><span className="item-sheet__label">{next.label}</span>{next.type === 'in-cart' && <Check size={18} strokeWidth={1.75} aria-hidden="true" />}
      {next.total && <><span className="item-sheet__dot" aria-hidden="true">·</span><span className="item-sheet__total">{next.total}</span></>}</>;
    // Without a cart to write to, the sheet can't claim to add.
    disabled = next.disabled || (!onList && next.type !== 'store');
    note = error || cartSheetNote(merchant, item, reason, checkoutUrl ? checkoutNote(checkoutUrl) : copy.pending);
    removable = inCart > 0 && Boolean(onList);
    if (!reason) stepper = <Stepper label="Quantity" value={quantity} min={1} max={MAX_CART_QUANTITY} onChange={changeQuantity} />;
    if (inCart > 0) chip = `${inCart} in your cart`;
  } else if (block.type === 'detail') {
    action = <><span className="item-sheet__label">{detailAction[block.page]}</span><ArrowRight size={18} strokeWidth={1.75} aria-hidden="true" /></>;
  } else {
    action = status === copy.saved
      ? <><span className="item-sheet__label">Saved</span><Check size={18} strokeWidth={1.75} aria-hidden="true" /></>
      : <span className="item-sheet__label">{kept ? 'Update request' : copy.sheetAction}</span>;
    disabled = unavailable || !(keepsOwn || onKeep);
    note = error || status || (unavailable ? `This ${naming.item} is currently unavailable.` : copy.pending);
    removable = Boolean(kept && (keepsOwn || onForget));
  }
  const tone = error ? 'is-error' : status ? 'is-saved' : undefined;

  const profile = block.type === 'request' ? block.profile : undefined;
  const examples = transferExamples(block.type === 'vehicle' ? block.direction : undefined);
  const questions = block.type === 'request' ? (block.form === 'service' ? <>
    <DatePicker label={profile?.dateLabel ?? 'Preferred date'} mode="single" min={today} value={{ from: draft.date || undefined }} onChange={(range) => set('date')(range.from ?? '')} />
    {profile?.askTime !== false && <Field label="Preferred time (optional)"><input type="time" value={draft.time} onChange={(event) => set('time')(event.target.value)} /></Field>}
    <Stepper label={profile?.peopleLabel ?? 'People'} value={draft.adults} min={1} max={MAX_PEOPLE} onChange={set('adults')} />
  </> : block.form === 'activity' ? <>
    <DatePicker label="Date" mode="single" min={today} value={{ from: draft.date || undefined }} onChange={(range) => set('date')(range.from ?? '')} />
    <Chips name={`${name}-part`} label="Time of day" value={draft.part} onChange={set('part')} options={[{ value: 'morning', label: 'Morning' }, { value: 'afternoon', label: 'Afternoon' }, { value: 'evening', label: 'Evening' }]} />
    <Stepper label="Adults" value={draft.adults} min={1} max={20} onChange={set('adults')} />
    <Stepper label="Children" value={draft.children} min={0} max={20} onChange={set('children')} />
  </> : <>
    <Field label="Describe what you need" wide><textarea required value={draft.brief} maxLength={600} placeholder="What, for whom, and anything the provider should know" onChange={(event) => set('brief')(event.target.value)} /></Field>
    <DatePicker label="Needed by (optional)" mode="single" min={today} value={{ from: draft.date || undefined }} onChange={(range) => set('date')(range.from ?? '')} />
    <Field label="Location (optional)"><input type="text" value={draft.place} maxLength={120} placeholder="Area or address" onChange={(event) => set('place')(event.target.value)} /></Field>
    <Field label="Budget (optional, KES)"><input type="number" inputMode="numeric" min={0} value={draft.budget} onChange={(event) => set('budget')(event.target.value)} /></Field>
    <Chips name={`${name}-contact`} label="How should they reach you?" value={draft.contact} onChange={set('contact')} options={[{ value: 'call', label: 'Call' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }]} />
  </>) : block.type === 'vehicle' ? (block.journey === 'rental' ? <>
    <Field label="Pick-up place" wide><input type="text" value={draft.place} maxLength={120} placeholder="e.g. JKIA Terminal 1, or your address" onChange={(event) => set('place')(event.target.value)} /></Field>
    <DatePicker label="Pick-up and return dates" mode="range" min={today} value={{ from: draft.date || undefined, to: draft.endDate || undefined }}
      onChange={(range) => { setDraft((current) => ({ ...current, date: range.from ?? '', endDate: range.to ?? '' })); touched(); }} />
    <Field label="Pick-up time"><input type="time" value={draft.time} onChange={(event) => set('time')(event.target.value)} /></Field>
    <Field label="Return time"><input type="time" value={draft.endTime} onChange={(event) => set('endTime')(event.target.value)} /></Field>
    <label className="offering-check"><input type="checkbox" checked={draft.otherReturn} onChange={(event) => set('otherReturn')(event.target.checked)} /><span>Return somewhere else</span></label>
    {draft.otherReturn && <Field label="Return place" wide><input type="text" value={draft.returnPlace} maxLength={120} placeholder="Where you’ll drop it off" onChange={(event) => set('returnPlace')(event.target.value)} /></Field>}
    {!block.bike && <label className="offering-check"><input type="checkbox" checked={draft.driver} onChange={(event) => set('driver')(event.target.checked)} /><span>With a driver</span></label>}
  </> : <>
    <Field label="Pickup" wide><input type="text" value={draft.place} maxLength={120} placeholder={examples.pickup} onChange={(event) => set('place')(event.target.value)} /></Field>
    <Field label="Drop-off" wide><input type="text" value={draft.dropoff} maxLength={120} placeholder={examples.dropoff} onChange={(event) => set('dropoff')(event.target.value)} /></Field>
    <DatePicker label="Date" mode="single" min={today} value={{ from: draft.date || undefined }} onChange={(range) => set('date')(range.from ?? '')} />
    <Field label="Pickup time"><input type="time" value={draft.time} onChange={(event) => set('time')(event.target.value)} /></Field>
    <label className="offering-check offering-check--inline"><input type="checkbox" checked={draft.meetGreet} onChange={(event) => set('meetGreet')(event.target.checked)} /><span>Meet & greet</span></label>
    <Stepper label="Travellers" value={draft.travellers} min={1} max={20} onChange={set('travellers')} />
    <Stepper label="Bags" value={draft.bags} min={0} max={20} onChange={set('bags')} />
  </>) : null;
  const notes = block.type === 'vehicle' || (block.type === 'request' && block.form !== 'task')
    ? <Field label="Anything they should know? (optional)" wide><textarea value={draft.notes} maxLength={300} placeholder={profile?.notesPlaceholder} onChange={(event) => set('notes')(event.target.value)} /></Field>
    : null;

  const options = block.type === 'cart' ? block.options : [];
  const meta = storeMeta(merchant);
  const store = <>
    <MerchantLogo merchant={merchant} className="item-sheet__store-logo" />
    <span className="item-sheet__store-text"><strong>{merchant.name}</strong>{meta && <span>{meta}</span>}</span>
  </>;

  return <dialog {...sheet.props} className={`item-sheet item-sheet--${kind} item-sheet--${block.type}${context === 'discovery' ? ' item-sheet--discovery' : ''}`} aria-labelledby={titleId}>
    <form className="item-sheet__frame" noValidate onSubmit={(event) => { event.preventDefault(); submit(); }}>
      <button ref={closeButton} type="button" className="item-sheet__close" aria-label="Close" onClick={sheet.close} autoFocus><X size={20} strokeWidth={1.75} aria-hidden="true" /></button>
      <div className="item-sheet__scroll">
        <div className="item-sheet__media">
          <ImageWithFallback src={item.image} alt="" width={760} height={570} referrerPolicy="no-referrer" />
          <span className="item-sheet__handle" aria-hidden="true" />
          <button type="button" className="item-sheet__save" aria-pressed={saved} aria-label={`${saved ? 'Unsave' : 'Save'} ${item.name}`} onClick={() => onSave(item.id)}>
            <Heart size={19} strokeWidth={1.75} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        </div>
        <div className="item-sheet__content">
          <div className="item-sheet__heading">
            {eyebrow && <p className="item-sheet__eyebrow">{eyebrow}</p>}
            <h2 id={titleId} className="item-sheet__title">{item.name}</h2>
          </div>
          <div className="item-sheet__price-row">
            <p className={`item-sheet__price${unavailable ? ' is-unavailable' : ''}`}>{offeringPrice(item, kind)}</p>
            {chip && <p className="item-sheet__chip"><Check size={14} strokeWidth={1.75} aria-hidden="true" />{chip}</p>}
          </div>
          {description && <p className="item-sheet__description">{description}</p>}

          {options.length > 0 && <div className="item-sheet__block item-sheet__options"><OptionGroups groups={options} /></div>}
          {(block.type === 'request' || block.type === 'vehicle') && <section className="item-sheet__block" aria-labelledby={blockId}>
            <h3 id={blockId} className="item-sheet__block-title">{block.type === 'vehicle' ? (block.journey === 'transfer' ? 'Your ride' : 'Your trip') : 'Your request'}</h3>
            <p className="item-sheet__block-lead">{requestIntro(merchant, item, block)}</p>
            <div className="item-sheet__questions">{questions}{notes}</div>
          </section>}
          {block.type === 'detail' && block.facts.length > 0 && <dl className="item-sheet__block item-sheet__facts" aria-label="Details">
            {block.facts.map((fact) => <div key={fact.key} className="item-sheet__fact"><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
          </dl>}

          {context === 'discovery' && <section className="item-sheet__store" aria-labelledby={storeId}>
            <h3 id={storeId} className="item-sheet__store-label">{storeLabel(kind)}</h3>
            {onOpenStore
              ? <button type="button" className="item-sheet__store-card" onClick={() => onOpenStore()}>{store}<ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" /></button>
              : <div className="item-sheet__store-card">{store}</div>}
          </section>}
        </div>
      </div>

      <footer className="item-sheet__footer">
        {(note || removable) && <div className="item-sheet__status">
          {note && <p role="status" className={`item-sheet__note${tone ? ` ${tone}` : ''}`}>{note}</p>}
          {removable && <button type="button" className="item-sheet__remove" onClick={forget}><Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />Remove</button>}
        </div>}
        <div className="item-sheet__actions">
          {stepper}
          <button ref={primary} type="submit" className="offering-sheet__primary" disabled={disabled}>{action}</button>
        </div>
      </footer>
    </form>
  </dialog>;
}
