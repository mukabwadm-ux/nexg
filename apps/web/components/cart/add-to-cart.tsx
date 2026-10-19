'use client';

import { Minus, Plus, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { kes, useCart } from './cart-provider';

/** The "Add to cart" button on a menu item, which becomes a quantity stepper once it is in the basket. */
export function AddToCart({
  merchant,
  item,
}: {
  merchant: { id: string; name: string };
  item: { id: string; name: string; price_kes: number | null };
}) {
  const cart = useCart();
  const quantity = cart.quantityOf(item.id);

  if (item.price_kes === null) {
    return (
      <Link
        href={`/?need=${encodeURIComponent(`${item.name} from ${merchant.name}`)}`}
        className="border-border text-muted hover:border-ink rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors"
      >
        Ask the desk
      </Link>
    );
  }

  const price = item.price_kes;

  if (quantity > 0) {
    return (
      <div className="border-border bg-bg flex items-center rounded-full border">
        <button
          type="button"
          aria-label={`Remove one ${item.name}`}
          onClick={() => cart.setQuantity(item.id, quantity - 1)}
          className="hover:bg-surface flex h-8 w-8 items-center justify-center rounded-full"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="min-w-6 text-center text-sm font-extrabold" aria-live="polite">
          {quantity}
        </span>
        <button
          type="button"
          aria-label={`Add one more ${item.name}`}
          onClick={() => cart.setQuantity(item.id, quantity + 1)}
          className="bg-gold text-ink flex h-8 w-8 items-center justify-center rounded-full"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        const outcome = cart.add(merchant, { id: item.id, name: item.name, price_kes: price });
        if (outcome === 'switched') {
          window.alert(`Your basket now only has items from ${merchant.name}.`);
        }
      }}
      className="bg-gold text-ink hover:bg-gold/90 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition-colors"
    >
      <Plus aria-hidden="true" className="h-3.5 w-3.5" />
      Add to cart
    </button>
  );
}

/** A bar at the bottom of the screen while the basket has something in it. */
export function CartBar() {
  const cart = useCart();
  const pathname = usePathname();

  if (!cart.ready || cart.count === 0) return null;
  if (
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/pay') ||
    pathname.startsWith('/orders')
  )
    return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <Link
        href="/checkout"
        className="bg-ink text-gold pointer-events-auto flex w-full max-w-md items-center justify-between gap-4 rounded-full px-5 py-3.5 shadow-lg"
      >
        <span className="flex items-center gap-2.5 text-sm font-extrabold">
          <span className="bg-gold text-ink relative flex h-8 w-8 items-center justify-center rounded-full">
            <ShoppingBag aria-hidden="true" className="h-4 w-4" />
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[0.625rem] text-white">
              {cart.count}
            </span>
          </span>
          View cart
        </span>
        <span className="text-sm font-extrabold text-white">{kes(cart.subtotalKes)}</span>
      </Link>
    </div>
  );
}
