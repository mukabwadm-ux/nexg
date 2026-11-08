import { useRef } from 'react';
import { ArrowRight, Heart, Minus, Plus } from 'lucide-react';
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

/**
 * The small state of the one item card. Every kind shares one anatomy: a framed photo with a save heart,
 * title, a short line, the price and one action. Listings across merchants add a tag and a byline.
 * Products and dishes can be added straight from the card when the page passes `onAdd`; with `onRemove`
 * and a `quantity`, the add button grows into a stepper so the shopper sees what is already on the list.
 * Styles live in cards.css.
 */
export function OfferingCard({ item, kind, saved, onSave, onOpen, tag, byline, actionLabel, describe = true, quantity = 0, onAdd, onRemove }: {
  item: CatalogItem; kind: OfferingKind; saved: boolean; onSave: (id: string) => void; onOpen: (item: CatalogItem) => void;
  /** A short label on the photo, such as the subcategory. */
  tag?: string;
  /** Who offers it, shown when cards from many merchants sit together. */
  byline?: string;
  /** Replaces the kind's action, e.g. "View trip" when the card opens a page instead of a sheet. */
  actionLabel?: string;
  describe?: boolean;
  /** How many are already on the shopper's list (products and dishes). */
  quantity?: number;
  /** Adds one straight from the card. Without it, the add button opens the expanded card. */
  onAdd?: (item: CatalogItem) => void;
  /** Takes one off the list; shown as a stepper once `quantity` is above zero. */
  onRemove?: (item: CatalogItem) => void;
}) {
  const copy = kindPresentation[kind];
  const unavailable = item.isAvailable === false;
  const quickAdd = !actionLabel && isListKind(kind);
  const chosen = quickAdd && quantity > 0;
  const stepper = chosen && Boolean(onAdd && onRemove);
  const line = describe ? cardLine(item) : undefined;
  const add = useRef<HTMLButtonElement>(null);
  const removeOne = () => {
    // The minus button leaves with the last one, so keep keyboard focus on the add button.
    if (quantity <= 1) add.current?.focus();
    onRemove?.(item);
  };

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
        {quickAdd
          ? <div className={`offering-card__quantity${stepper ? ' is-open' : ''}`}>
            {stepper && <button type="button" className="offering-card__less" aria-label={`Remove one ${item.name}`} onClick={removeOne}><Minus size={16} strokeWidth={2} aria-hidden="true" /></button>}
            {stepper && <output className="offering-card__count" aria-live="polite">{quantity}<span className="sr-only"> on your list</span></output>}
            {chosen && !stepper && <span className="offering-card__badge" aria-hidden="true">{quantity}</span>}
            <button ref={add} type="button" className="offering-card__add" disabled={unavailable}
              aria-label={onAdd ? (chosen ? `Add another ${item.name}, ${quantity} on your list` : `Add ${item.name} to your list`) : `Choose ${item.name}`}
              onClick={() => (onAdd ? onAdd(item) : onOpen(item))}><Plus size={18} strokeWidth={2} aria-hidden="true" /></button>
          </div>
          : <button type="button" className="offering-card__action" disabled={unavailable} onClick={() => onOpen(item)}>{actionLabel ?? copy.cardAction}<ArrowRight size={15} strokeWidth={2} aria-hidden="true" /></button>}
      </div>
    </div>
  </article>;
}
