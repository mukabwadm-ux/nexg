import { ShoppingBag } from 'lucide-react';
import { itemCount, kes } from './useStoreCart';
import './cart.css';

/**
 * The floating "View cart" pill any storefront can use (the shared .store-basket frame from store.css). It
 * shows only while the cart holds this store's lines: how many, the subtotal, and the button that opens the
 * cart. It stays mounted behind the open cart, so closing the cart hands focus back to it.
 */
export function CartPill({ count, subtotalKes, onOpen }: { count: number; subtotalKes: number; onOpen: () => void }) {
  if (count <= 0) return null;
  const items = itemCount(count);
  const subtotal = kes(subtotalKes);
  return <div className="store-basket cart-pill">
    <ShoppingBag size={18} strokeWidth={2} aria-hidden="true" />
    <div className="store-basket__text"><strong>{`${items} · ${subtotal}`}</strong></div>
    <button type="button" aria-haspopup="dialog" aria-label={`View cart: ${items}, ${subtotal}`} onClick={onOpen}>View cart</button>
  </div>;
}
