import { useId, useMemo, useRef, useState } from 'react';
import { ShoppingBag, Trash2, Undo2, X } from 'lucide-react';
import type { CatalogItem, Merchant } from '../../providers/DiscoveryProvider';
import { addToNexgCart, clearNexgCart, setNexgCartQuantity, type NexgCartLine } from '../../cart/nexgCart';
import { ImageWithFallback } from '../ImageWithFallback';
import { Stepper } from '../cards/OfferingSheet';
import { useModalDialog } from './useModalDialog';
import { checkoutNote, itemCount, kes, MAX_CART_QUANTITY, type StoreCart } from './useStoreCart';
import './cart.css';

const sentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * "Your cart" for one store, opened from the "View cart" pill: a drawer on the right on desktop, a bottom
 * sheet on phones. Each line has its photo from the store's own items, its price and the shared stepper;
 * then the subtotal, "Clear cart" (with Undo) and, only where the website's checkout is reachable, "Go to
 * checkout". Anywhere else one plain line says checkout happens on the NexG website.
 */
export function CartSheet({ merchant, cart, items, onClose }: {
  merchant: Pick<Merchant, 'id' | 'name'>;
  cart: Pick<StoreCart, 'lines' | 'count' | 'subtotalKes' | 'checkoutUrl'>;
  /** The store's items, for the lines' photos. */
  items: readonly CatalogItem[];
  onClose: () => void;
}) {
  const modal = useModalDialog(onClose);
  const titleId = useId();
  const list = useRef<HTMLUListElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [cleared, setCleared] = useState<NexgCartLine[]>();
  const photos = useMemo(() => new Map(items.map((item) => [item.id, item.image])), [items]);
  const { lines, count, subtotalKes, checkoutUrl } = cart;

  const change = (line: NexgCartLine, quantity: number) => {
    // A line that leaves takes its buttons with it, so focus moves to the next line (or the close button) first.
    if (quantity <= 0) {
      const row = [...(list.current?.children ?? [])].find((child) => child instanceof HTMLElement && child.dataset.line === line.id);
      const neighbour = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLButtonElement>('button:not(:disabled)');
      (neighbour ?? closeButton.current)?.focus();
    }
    setNexgCartQuantity(line.id, quantity);
  };
  const clear = () => { closeButton.current?.focus(); setCleared(lines); clearNexgCart(); };
  const undo = () => {
    closeButton.current?.focus();
    for (const line of cleared ?? []) {
      const result = addToNexgCart(merchant, { id: line.id, name: line.name, price: line.price_kes });
      if (result === 'added' && line.quantity > 1) setNexgCartQuantity(line.id, line.quantity);
    }
    setCleared(undefined);
  };

  return <dialog {...modal.props} className="cart-sheet" aria-labelledby={titleId}>
    <header className="cart-sheet__header">
      <div>
        <h2 id={titleId}>Your cart</h2>
        <p>{count > 0 ? `${merchant.name} · ${itemCount(count)}` : merchant.name}</p>
      </div>
      <button ref={closeButton} type="button" className="cart-sheet__close" aria-label="Close your cart" onClick={modal.close} autoFocus><X size={20} strokeWidth={2} aria-hidden="true" /></button>
    </header>
    {lines.length > 0
      ? <ul ref={list} className="cart-sheet__lines">
        {lines.map((line) => <li key={line.id} className="cart-line" data-line={line.id}>
          <ImageWithFallback className="cart-line__photo" src={photos.get(line.id)} alt="" width={112} height={112} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
          <div className="cart-line__copy">
            <strong>{line.name}</strong>
            <span>{line.quantity > 1 ? `${kes(line.price_kes * line.quantity)} · ${kes(line.price_kes)} each` : kes(line.price_kes)}</span>
          </div>
          <Stepper label={`${line.name} quantity`} value={line.quantity} min={0} max={MAX_CART_QUANTITY} onChange={(quantity) => change(line, quantity)} />
        </li>)}
      </ul>
      : <div className="cart-sheet__empty" role="status">
        <ShoppingBag size={30} strokeWidth={1.5} aria-hidden="true" />
        <h3>{cleared ? 'Cart cleared' : 'Your cart is empty'}</h3>
        <p>{cleared ? 'Changed your mind? Put everything back.' : 'Tap + on a product to add it here.'}</p>
        {cleared && <button type="button" className="cart-sheet__undo" onClick={undo}><Undo2 size={16} strokeWidth={2} aria-hidden="true" />Undo</button>}
      </div>}
    <footer className="cart-sheet__footer">
      {lines.length > 0 && <p className="cart-sheet__subtotal"><span>Subtotal</span><strong>{kes(subtotalKes)}</strong></p>}
      <p className="cart-sheet__note">{checkoutNote(checkoutUrl)}</p>
      <div className="cart-sheet__actions">
        {lines.length > 0 && <button type="button" className="cart-sheet__clear" onClick={clear}><Trash2 size={16} strokeWidth={2} aria-hidden="true" />Clear cart</button>}
        {checkoutUrl && lines.length > 0
          ? <a className="cart-sheet__primary" href={checkoutUrl}>Go to checkout</a>
          : <button type="button" className="cart-sheet__primary" onClick={modal.close}>Keep shopping</button>}
      </div>
    </footer>
  </dialog>;
}

/**
 * Asked before an add replaces another store's cart: the NexG cart holds one store at a time. Escape and a
 * backdrop click keep the current cart.
 */
export function CartSwitchDialog({ current, onKeep, onStart }: { current: string; onKeep: () => void; onStart: () => void }) {
  const modal = useModalDialog(onKeep);
  const titleId = useId();
  const textId = useId();
  return <dialog {...modal.props} className="cart-switch" aria-labelledby={titleId} aria-describedby={textId}>
    <h2 id={titleId}>Start a new cart?</h2>
    <p id={textId}>{`Your cart has items from ${sentence(current)} Starting a new cart removes them.`}</p>
    <div className="cart-switch__actions">
      <button type="button" className="cart-switch__keep" onClick={modal.close} autoFocus>Keep current cart</button>
      <button type="button" className="cart-switch__start" onClick={onStart}>Start new cart</button>
    </div>
  </dialog>;
}
