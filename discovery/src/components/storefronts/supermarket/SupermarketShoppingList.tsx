import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { Info, Minus, Plus, ShoppingBasket, Trash2, Undo2, X } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../../providers/DiscoveryProvider';
import { formatPrice } from '../../../lib/formatPrice';
import { groceryListNote, linePrice, listEntries, listSummary, listTotalNote, MAX_LIST_QUANTITY, type SupermarketListLine } from '../../../data/supermarketPresentation';
import { offeringPrice } from '../../cards/OfferingCard';
import { ImageWithFallback } from '../../ImageWithFallback';

const itemCount = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;

/**
 * The shopper's list for one shop: a drawer on the right on desktop, a bottom sheet on phones. Each line has
 * its own − n + stepper. The total shows only when every product is available with a listed price, and
 * otherwise one line says why. There is no checkout: the website can't take orders yet, and the sheet says
 * so once.
 */
export function SupermarketShoppingList({ merchant, products, lines, onQuantity, onReplace, onClose }: {
  merchant: Merchant;
  products: CatalogItem[];
  lines: SupermarketListLine[];
  onQuantity: (item: CatalogItem, quantity: number) => void;
  /** Replaces the whole list: [] clears it, and the earlier lines undo that. */
  onReplace: (lines: SupermarketListLine[]) => void;
  onClose: () => void;
}) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [cleared, setCleared] = useState<SupermarketListLine[]>();

  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!dialog.open) dialog.showModal();
    return () => { document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [dialog]);
  const close = () => { if (dialog?.open) dialog.close(); else onClose(); };

  const entries = listEntries(products, lines);
  const { quantity, total, gap } = listSummary(entries);
  // A line that leaves takes its buttons with it, so focus moves to the next line (or the close button) first.
  const takeOff = (event: MouseEvent<HTMLButtonElement>, item: CatalogItem) => {
    const line = event.currentTarget.closest('li');
    const neighbour = (line?.nextElementSibling ?? line?.previousElementSibling)?.querySelector<HTMLButtonElement>('button');
    (neighbour ?? closeButton.current)?.focus();
    onQuantity(item, 0);
  };
  const clear = () => { closeButton.current?.focus(); setCleared(lines); onReplace([]); };
  const undo = () => { closeButton.current?.focus(); if (cleared) onReplace(cleared); setCleared(undefined); };

  return <dialog ref={setDialog} className="supermarket-list" aria-labelledby={titleId} onClose={onClose}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <header className="supermarket-list__header">
      <div>
        <h2 id={titleId}>Your list</h2>
        <p>{merchant.name}{quantity > 0 ? ` · ${itemCount(quantity)}` : ''}</p>
      </div>
      <button ref={closeButton} type="button" className="supermarket-list__close" aria-label="Close your list" onClick={close} autoFocus><X size={20} strokeWidth={2} aria-hidden="true" /></button>
    </header>
    <p className="supermarket-list__note"><Info size={16} strokeWidth={1.75} aria-hidden="true" />{groceryListNote}</p>
    {entries.length > 0
      ? <ul className="supermarket-list__lines">
        {entries.map((entry) => {
          const { item, quantity: count } = entry;
          const unit = formatPrice(item, 'code');
          const unavailable = item.isAvailable === false;
          return <li key={item.id} className={`supermarket-list__line${unavailable ? ' is-unavailable' : ''}`}>
            <ImageWithFallback className="supermarket-list__photo" src={item.image} alt="" width={112} height={112} loading="lazy" referrerPolicy="no-referrer" />
            <div className="supermarket-list__copy">
              <strong>{item.name}</strong>
              <span>{unavailable || !unit ? offeringPrice(item, 'product') : count > 1 ? `${linePrice(entry)} · ${unit} each` : unit}</span>
            </div>
            <div className="supermarket-list__stepper" role="group" aria-label={`${item.name}, ${count} on your list`}>
              {count === 1
                ? <button type="button" aria-label={`Take ${item.name} off your list`} onClick={(event) => takeOff(event, item)}><Trash2 size={15} strokeWidth={2} aria-hidden="true" /></button>
                : <button type="button" aria-label={`One fewer ${item.name}`} onClick={() => onQuantity(item, count - 1)}><Minus size={16} strokeWidth={2} aria-hidden="true" /></button>}
              <span>{count}</span>
              <button type="button" className="supermarket-list__more" aria-label={`One more ${item.name}`} disabled={unavailable || count >= MAX_LIST_QUANTITY} onClick={() => onQuantity(item, count + 1)}><Plus size={16} strokeWidth={2} aria-hidden="true" /></button>
            </div>
          </li>;
        })}
      </ul>
      : <div className="supermarket-list__empty" role="status">
        <ShoppingBasket size={30} strokeWidth={1.5} aria-hidden="true" />
        <h3>{cleared ? 'List cleared' : 'Your list is empty'}</h3>
        <p>{cleared ? 'Changed your mind? Put everything back.' : 'Tap + on a product to add it here.'}</p>
        {cleared && <button type="button" className="supermarket-list__undo" onClick={undo} autoFocus><Undo2 size={16} strokeWidth={2} aria-hidden="true" />Undo</button>}
      </div>}
    <footer className="supermarket-list__footer">
      {total
        ? <p className="supermarket-list__total"><span>Total at listed prices</span><strong>{total}</strong></p>
        : gap && <p className="supermarket-list__gap">{listTotalNote[gap]}</p>}
      <div className="supermarket-list__actions">
        {entries.length > 0 && <button type="button" className="supermarket-list__clear" onClick={clear}>Clear list</button>}
        <button type="button" className="supermarket-list__done" onClick={close}>Keep shopping</button>
      </div>
    </footer>
  </dialog>;
}
