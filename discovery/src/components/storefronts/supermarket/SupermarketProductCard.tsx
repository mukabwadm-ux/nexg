import { useRef } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { CatalogItem } from '../../../providers/DiscoveryProvider';
import { MAX_LIST_QUANTITY } from '../../../data/supermarketPresentation';
import { cardLine, offeringPrice } from '../../cards/OfferingCard';
import { ImageWithFallback } from '../../ImageWithFallback';

/**
 * A grocery product in the card family's small state (cards.css): framed photo, name, the shop's own short
 * line when it wrote one, the price and a round +. The + puts the product straight on the shopper's list,
 * as on Wolt, then grows into a − n + stepper. A tap anywhere else on the card opens the product sheet.
 * There is no save heart: on a grocery shelf, the list is how a shopper keeps things.
 */
export function SupermarketProductCard({ item, quantity, onOpen, onQuantity }: {
  item: CatalogItem;
  /** How many are on the shopper's list; 0 when none. */
  quantity: number;
  onOpen: (item: CatalogItem) => void;
  onQuantity: (item: CatalogItem, quantity: number) => void;
}) {
  const title = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const unavailable = item.isAvailable === false;
  const listed = quantity > 0;
  const line = cardLine(item);
  const fewer = () => {
    // The − goes with the last one, so focus moves to the + first (or the name, when the + is disabled).
    if (quantity === 1) (more.current && !more.current.disabled ? more.current : title.current)?.focus();
    onQuantity(item, quantity - 1);
  };
  return <article className={`offering-card offering-card--product supermarket-product${listed ? ' is-listed' : ''}${unavailable ? ' is-unavailable' : ''}`}
    data-discovery-item={item.id} data-merchant-id={item.merchantId}>
    <div className="offering-card__media">
      <div className="offering-card__image">
        <ImageWithFallback src={item.image} alt="" width={480} height={360} loading="lazy" referrerPolicy="no-referrer" />
      </div>
    </div>
    <div className="offering-card__body">
      {/* The name's button stretches over the whole card (supermarket.css), so the photo opens the product too. */}
      <h3 className="offering-card__title"><button ref={title} type="button" onClick={() => onOpen(item)}>{item.name}</button></h3>
      {line && <p className="offering-card__description">{line}</p>}
      <div className="offering-card__footer">
        <span className={`offering-card__price${unavailable ? ' is-unavailable' : ''}`}>{offeringPrice(item, 'product')}</span>
        <div className={`supermarket-add${listed ? ' is-open' : ''}`}>
          {listed && <>
            <button type="button" className="supermarket-add__less" aria-label={quantity === 1 ? `Take ${item.name} off your list` : `One fewer ${item.name}`} onClick={fewer}>
              {quantity === 1 ? <Trash2 size={15} strokeWidth={2} aria-hidden="true" /> : <Minus size={16} strokeWidth={2} aria-hidden="true" />}
            </button>
            <span className="supermarket-add__count">{quantity}<span className="sr-only"> on your list</span></span>
          </>}
          <button ref={more} type="button" className="offering-card__add supermarket-add__more" aria-label={listed ? `One more ${item.name}` : `Add ${item.name} to your list`}
            disabled={unavailable || quantity >= MAX_LIST_QUANTITY} onClick={() => onQuantity(item, quantity + 1)}>
            <Plus size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  </article>;
}
