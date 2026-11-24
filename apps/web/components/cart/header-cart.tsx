'use client';

import { ShoppingBag } from 'lucide-react';
import Link from 'next/link';

import { useOptionalCart } from './cart-provider';

/**
 * The cart in the site header, where the notifications bell was
 * (owner, 23 Nov 2026: "replace notifications icon with cart icon").
 * Notifications moved to the account page, under the account menu.
 *
 * Shown to everybody, signed in or not, because a visitor can fill a
 * basket before signing in. The count is the number of items, and the
 * badge hides at zero. Outside <CartProvider> (Discovery) it is the
 * plain link with no count.
 */
export function HeaderCart() {
  const cart = useOptionalCart();
  const count = cart?.ready ? cart.count : 0;
  const label = count === 0 ? 'Cart, empty' : `Cart, ${count} ${count === 1 ? 'item' : 'items'}`;

  return (
    <Link
      href="/checkout"
      aria-label={label}
      className="focus-visible:ring-gold text-gold relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 sm:h-11 sm:w-11"
    >
      <ShoppingBag className="h-4 w-4" aria-hidden="true" />
      {count > 0 ? (
        <span
          className="bg-danger absolute -right-1 -top-1 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full px-1 text-[0.625rem] font-extrabold text-white ring-2 ring-[#0b0907]"
          aria-hidden="true"
        >
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
