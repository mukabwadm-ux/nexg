import { useEffect, useId, useState } from 'react';
import { Check, Store, X } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import { groceryListNote, linePrice, MAX_LIST_QUANTITY, productDescription } from '../../../data/supermarketPresentation';
import { offeringPrice } from '../../cards/OfferingCard';
import { Stepper } from '../../cards/OfferingSheet';
import { ImageWithFallback } from '../../ImageWithFallback';

/**
 * A grocery product opened up, in the card family's expanded state (cards.css: two columns on desktop, a
 * bottom sheet on phones). Choose how many, then one action adds them to the list, updates the list or,
 * at zero, takes the product off it. Only what the catalogue supplies is shown, and the description only
 * when the shop wrote one of its own.
 */
export function SupermarketItemDialog({ merchant, item, aisle, listed, onQuantity, onClose }: {
  merchant: Merchant;
  item: CatalogItem;
  /** The aisle the product sits in, such as "Dairy & eggs". */
  aisle?: string;
  /** How many are already on the shopper's list. */
  listed: number;
  onQuantity: (item: CatalogItem, quantity: number) => void;
  onClose: () => void;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleId = useId();
  const unavailable = item.isAvailable === false;
  // An unavailable product can only come off the list, so it opens at zero with no stepper.
  const [quantity, setQuantity] = useState(unavailable ? 0 : Math.max(1, listed));
  const description = productDescription(item, merchant);

  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    return () => { document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [dialog]);
  const close = () => { if (dialog?.open) dialog.close(); else onClose(); };

  // Opened again without a change, the button just says it's there (as the card family does) and closes.
  const unchanged = listed > 0 && quantity === listed;
  const action = quantity === 0 && listed ? 'Take off list' : unchanged ? <>On your list<Check size={18} strokeWidth={2} aria-hidden="true" /></> : listed ? 'Update list' : 'Add to list';
  const total = quantity > 0 && !unchanged ? linePrice({ item, quantity }) : undefined;
  const choose = () => { if (!unchanged) onQuantity(item, quantity); close(); };
  const note = unavailable && !listed ? `${merchant.name} lists this product as unavailable right now.` : groceryListNote;

  return <dialog ref={setDialog} className="offering-sheet offering-sheet--product supermarket-sheet" aria-labelledby={titleId} onClose={onClose}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div className="offering-sheet__layout">
      <div className="offering-sheet__media">
        <ImageWithFallback src={item.image} alt={item.name} width={760} height={570} referrerPolicy="no-referrer" />
        <button type="button" className="offering-sheet__close" aria-label="Close" onClick={close} autoFocus><X size={20} strokeWidth={2} aria-hidden="true" /></button>
      </div>
      <form className="offering-sheet__content" noValidate onSubmit={(event) => { event.preventDefault(); choose(); }}>
        <p className="offering-sheet__merchant"><Store size={15} strokeWidth={1.75} aria-hidden="true" />{merchant.name}{aisle ? ` · ${aisle}` : ''}</p>
        <div className="offering-sheet__title"><h2 id={titleId}>{item.name}</h2></div>
        <p className={`offering-sheet__price${unavailable ? ' is-unavailable' : ''}`}>{offeringPrice(item, 'product')}</p>
        {listed > 0 && <p className="supermarket-sheet__listed"><Check size={15} strokeWidth={2} aria-hidden="true" />{listed} on your list</p>}
        {description && <p className="offering-sheet__description">{description}</p>}
        {!unavailable && <div className="offering-sheet__questions">
          <Stepper label="Quantity" value={quantity} min={listed ? 0 : 1} max={MAX_LIST_QUANTITY} onChange={setQuantity} />
        </div>}
        <footer className="offering-sheet__footer">
          <p>{note}</p>
          <button type="submit" className="offering-sheet__primary" disabled={unavailable && !listed}>
            {action}{total && <><span className="supermarket-sheet__dot" aria-hidden="true">·</span><span>{total}</span></>}
          </button>
        </footer>
      </form>
    </div>
  </dialog>;
}
