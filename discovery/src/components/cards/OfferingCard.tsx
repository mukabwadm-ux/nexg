import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Heart, Minus, Plus, Trash2 } from 'lucide-react';
import type { CatalogItem } from '../../providers/DiscoveryProvider';
import { formatPrice } from '../../lib/formatPrice';
import { isListKind, kindPresentation, type OfferingKind } from '../../data/offeringKinds';
import { ImageWithFallback } from '../ImageWithFallback';

/** The price line every card kind shares: a listed price, an unknown price, or unavailability. */
export function offeringPrice(item: CatalogItem, kind: OfferingKind): string {
  if (item.isAvailable === false) return 'Currently unavailable';
  const copy = kindPresentation[kind];
  const price = formatPrice(item, 'code');
  return price ? `${copy.pricePrefix}${price}` : copy.noPrice;
}

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-KE');
const tidy = (text?: string) => text?.replace(/\s+/g, ' ').trim() || undefined;
const openingSentence = (text: string) => (/^(.+?[.!?])(?=\s+["“‘'(]?[A-Z]|$)/.exec(text)?.[1] ?? text).trim();

/** "Entry Smartphone from Amani Smartphones Atelier." only repeats what the card already shows. */
function restatesName(name: string, sentence: string): boolean {
  const own = fold(name);
  const opening = fold(sentence).replace(/[.!?]+$/, '');
  return !opening || opening === own || opening.startsWith(`${own} from `) || opening.startsWith(`${own} by `);
}

/**
 * The card's one short line: the description's opening sentence. A sentence that only repeats the item's
 * name ("Entry Smartphone from Amani Smartphones Atelier.") tells the shopper nothing the card doesn't
 * already show, so the card leaves it out. The full description stays in the expanded card.
 */
export function cardLine(item: Pick<CatalogItem, 'name' | 'description'>): string | undefined {
  const text = tidy(item.description);
  if (!text) return undefined;
  const first = openingSentence(text);
  return restatesName(item.name, first) ? undefined : first;
}

/** The expanded card's description, without an opening sentence that only repeats the item's name. */
export function sheetDescription(item: Pick<CatalogItem, 'name' | 'description'>): string | undefined {
  const text = tidy(item.description);
  if (!text) return undefined;
  const first = openingSentence(text);
  return restatesName(item.name, first) ? tidy(text.slice(first.length)) : text;
}

/** How long the open − n + pill waits after the last tap before folding back into one round button. */
export const QUANTITY_PILL_IDLE_MS = 2500;

/** Keyboard focus keeps the pill open; a tap's focus doesn't (mouse and touch focus isn't :focus-visible). */
const keyboardFocus = (element: EventTarget) => {
  try { return element instanceof Element && element.matches(':focus-visible'); } catch { return true; }
};

/**
 * The + every list kind shares (owner, 9 Nov 2026, as on Wolt and Uber Eats). A tap adds one in place: the
 * round + grows into a − n + pill (a bin at one) and never opens the cart, a sheet or the item. After 2.5 s
 * without a tap, while it isn't hovered or keyboard-focused, the pill folds back into one round button: a
 * plain + when none are in the cart, the count in gold when some are. Tapping the count opens the pill again.
 * Without `onRemove` the + only adds and a small badge shows the count; without `onAdd` it opens the item.
 */
function QuantityControl({ item, quantity, unavailable, onAdd, onRemove, onOpen }: {
  item: CatalogItem; quantity: number; unavailable: boolean;
  onAdd?: (item: CatalogItem) => void; onRemove?: (item: CatalogItem) => void; onOpen: (item: CatalogItem) => void;
}) {
  const stepper = Boolean(onAdd && onRemove);
  const [open, setOpen] = useState(false);
  const [taps, setTaps] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [said, setSaid] = useState('');
  const asked = useRef(false);
  const seen = useRef(quantity);
  const add = useRef<HTMLButtonElement>(null);
  const expanded = stepper && open && quantity > 0;
  const folded = stepper && quantity > 0 && !expanded;

  // Fold back after a quiet spell, never under the pointer or keyboard focus.
  useEffect(() => {
    if (!expanded || hovered || focused) return;
    const timer = window.setTimeout(() => setOpen(false), QUANTITY_PILL_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [expanded, hovered, focused, taps]);

  // Say what changed, once, when this card's own buttons changed it; the last one out folds the pill.
  useEffect(() => {
    if (seen.current === quantity) return;
    seen.current = quantity;
    if (quantity === 0) setOpen(false);
    if (!asked.current) return;
    asked.current = false;
    setSaid(quantity > 0 ? `${item.name}: ${quantity} in cart` : `${item.name} removed from cart`);
  }, [quantity, item.name]);

  const tap = () => setTaps((count) => count + 1);
  const press = () => {
    if (!onAdd) return onOpen(item);
    if (folded) { setOpen(true); tap(); return; }
    asked.current = true;
    onAdd(item);
    if (stepper) { setOpen(true); tap(); }
  };
  const less = () => {
    // The bin leaves with the last one, so keyboard focus moves to the + first.
    if (quantity <= 1) add.current?.focus();
    asked.current = true;
    onRemove?.(item);
    tap();
  };

  const label = !onAdd ? `Choose ${item.name}`
    : folded ? `Change quantity of ${item.name}, ${quantity} in cart`
      : quantity > 0 ? `Add one more ${item.name}, ${quantity} in cart` : `Add ${item.name} to cart`;
  return <div className={`offering-card__quantity${expanded ? ' is-open' : ''}${folded ? ' is-folded' : ''}${unavailable && !quantity ? ' is-disabled' : ''}`}
    onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
    onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovered(false); }}
    onFocus={(event) => setFocused(keyboardFocus(event.target))}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
    {stepper && quantity > 0 && <span className="offering-card__stepper" inert={!expanded}>
      <button type="button" className="offering-card__less" aria-label={quantity > 1 ? `Remove one ${item.name} from cart` : `Remove ${item.name} from cart`} onClick={less}>
        {quantity > 1 ? <Minus size={16} strokeWidth={2} aria-hidden="true" /> : <Trash2 size={15} strokeWidth={2} aria-hidden="true" />}
      </button>
      <output className="offering-card__count">{quantity}<span className="sr-only"> in cart</span></output>
    </span>}
    {!stepper && quantity > 0 && <span className="offering-card__badge" aria-hidden="true">{quantity}</span>}
    <button ref={add} type="button" className="offering-card__add" disabled={unavailable && !folded} aria-label={label} onClick={press}>
      {folded ? <span className="offering-card__total" aria-hidden="true">{quantity}</span> : <Plus size={18} strokeWidth={2} aria-hidden="true" />}
    </button>
    <span className="sr-only" aria-live="polite">{said}</span>
  </div>;
}

/**
 * The small state of the one item card. Every kind shares one anatomy: a framed photo with a save heart,
 * title, a short line, the price and one action. Listings across merchants add a tag and a byline.
 * Products and dishes can be added straight from the card when the page passes `onAdd`; with `onRemove`
 * and a `quantity`, the + opens into a − n + pill in place (QuantityControl).
 *
 * The compact variant is the grocery card (owner, 9 Nov 2026, the industry standard): a square photo tile
 * with the + on its corner, then the price and a two-line name. No description, heart, tag or frame; a tap
 * anywhere but the + opens the item. Styles live in cards.css.
 */
export function OfferingCard({ item, kind, saved, onSave, onOpen, tag, byline, actionLabel, describe = true, quantity = 0, onAdd, onRemove, variant = 'standard' }: {
  item: CatalogItem; kind: OfferingKind; saved: boolean; onSave: (id: string) => void; onOpen: (item: CatalogItem) => void;
  /** A short label on the photo, such as the subcategory. */
  tag?: string;
  /** Who offers it, shown when cards from many merchants sit together. */
  byline?: string;
  /** Replaces the kind's action, e.g. "View trip" when the card opens a page instead of a sheet. */
  actionLabel?: string;
  describe?: boolean;
  /** How many are already in the shopper's cart (products and dishes). */
  quantity?: number;
  /** Adds one straight from the card. Without it, the add button opens the expanded card. */
  onAdd?: (item: CatalogItem) => void;
  /** Takes one out; with it the + opens into a − n + pill. */
  onRemove?: (item: CatalogItem) => void;
  /** 'compact': the square-tile product card for large catalogues. */
  variant?: 'standard' | 'compact';
}) {
  const copy = kindPresentation[kind];
  const unavailable = item.isAvailable === false;
  const quickAdd = !actionLabel && isListKind(kind);
  const chosen = quickAdd && quantity > 0;
  const control = quickAdd && <QuantityControl item={item} quantity={quantity} unavailable={unavailable} onAdd={onAdd} onRemove={onRemove} onOpen={onOpen} />;

  if (variant === 'compact') {
    return <article className={`offering-card offering-card--compact offering-card--${kind}${chosen ? ' is-chosen' : ''}${unavailable ? ' is-unavailable' : ''}`} data-discovery-item={item.id} data-merchant-id={item.merchantId}>
      <div className="offering-card__media">
        <button type="button" className="offering-card__image" tabIndex={-1} aria-hidden="true" onClick={() => onOpen(item)}>
          <ImageWithFallback src={item.image} alt="" width={320} height={320} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        </button>
        {control}
      </div>
      <div className="offering-card__body">
        <h3 className="offering-card__title"><button type="button" onClick={() => onOpen(item)}>{item.name}</button></h3>
        <span className={`offering-card__price${unavailable ? ' is-unavailable' : ''}`}>{unavailable ? 'Unavailable' : offeringPrice(item, kind)}</span>
      </div>
    </article>;
  }

  const line = describe ? cardLine(item) : undefined;
  return <article className={`offering-card offering-card--${kind}${chosen ? ' is-chosen' : ''}`} data-discovery-item={item.id} data-merchant-id={item.merchantId}>
    <div className="offering-card__media">
      <button type="button" className="offering-card__image" tabIndex={-1} aria-hidden="true" onClick={() => onOpen(item)}>
        <ImageWithFallback src={item.image} alt="" width={480} height={360} loading="lazy" referrerPolicy="no-referrer" />
      </button>
      {tag && <span className="offering-card__tag">{tag}</span>}
      <button type="button" className="offering-card__save" aria-pressed={saved} aria-label={`${saved ? 'Unsave' : 'Save'} ${item.name}`} onClick={() => onSave(item.id)}>
        <Heart size={17} strokeWidth={1.75} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
    </div>
    <div className="offering-card__body">
      <h3 className="offering-card__title"><button type="button" onClick={() => onOpen(item)}>{item.name}</button></h3>
      {byline && <p className="offering-card__byline">{byline}</p>}
      {line && <p className="offering-card__description">{line}</p>}
      <div className={`offering-card__footer${quickAdd ? '' : ' offering-card__footer--action'}`}>
        <span className={`offering-card__price${unavailable ? ' is-unavailable' : ''}`}>{offeringPrice(item, kind)}</span>
        {control || <button type="button" className="offering-card__action" disabled={unavailable} onClick={() => onOpen(item)}>{actionLabel ?? copy.cardAction}<ArrowRight size={15} strokeWidth={2} aria-hidden="true" /></button>}
      </div>
    </div>
  </article>;
}
