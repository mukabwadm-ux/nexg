'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { AddToCart } from '@/components/cart/add-to-cart';
import { kes, useCart } from '@/components/cart/cart-provider';

/**
 * Add the product to the basket, then go straight to checkout. The checkout
 * button appears once this merchant's basket has something in it.
 */
export function ProductActions({
  merchant,
  item,
}: {
  merchant: { id: string; name: string };
  item: { id: string; name: string; price_kes: number | null };
}) {
  const cart = useCart();
  const ready = cart.ready && cart.count > 0 && cart.merchantId === merchant.id;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <AddToCart merchant={merchant} item={item} />
      {ready && (
        <Link
          href="/checkout"
          className="bg-ink text-gold focus-visible:ring-gold inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2"
        >
          Go to checkout · {kes(cart.subtotalKes)}
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
