'use client';

import {
  ArrowRight,
  Check,
  CupSoda,
  IceCreamCone,
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  UtensilsCrossed,
  Wine,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { kes, useCart } from '@/components/cart/cart-provider';

export interface Pairing {
  id: string;
  name: string;
  price_kes: number;
  /** Which mark to draw, from the item's section: a drink, a dessert, a salad or side. */
  mark: 'drink' | 'wine' | 'dessert' | 'side' | 'item';
}

const MARK: Record<Pairing['mark'], LucideIcon> = {
  drink: CupSoda,
  wine: Wine,
  dessert: IceCreamCone,
  side: Leaf,
  item: UtensilsCrossed,
};

/**
 * Buying from the product page: how many, then "Add to cart". Anything ticked
 * under "Goes well with" goes into the same basket in the same tap. Once the
 * basket holds something from this merchant, a checkout link appears.
 */
export function ProductPurchase({
  merchant,
  item,
  pairings,
}: {
  merchant: { id: string; name: string };
  item: { id: string; name: string; price_kes: number };
  pairings: Pairing[];
}) {
  const cart = useCart();
  const [quantity, setQuantity] = React.useState(1);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [added, setAdded] = React.useState(false);

  const extras = pairings.filter((p) => picked.has(p.id));
  const total = item.price_kes * quantity + extras.reduce((n, p) => n + p.price_kes, 0);
  const inBasket = cart.ready && cart.count > 0 && cart.merchantId === merchant.id;

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const add = () => {
    const outcome = cart.addLines(merchant, [
      { id: item.id, name: item.name, price_kes: item.price_kes, quantity },
      ...extras.map((p) => ({ id: p.id, name: p.name, price_kes: p.price_kes, quantity: 1 })),
    ]);
    if (outcome === 'switched') {
      window.alert(`Your basket now only has items from ${merchant.name}.`);
    }
    setAdded(true);
    setQuantity(1);
    setPicked(new Set());
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        {/* How many */}
        <div className="flex items-center gap-1 rounded-full bg-white p-1.5 ring-1 ring-[#E2D9C6]">
          <button
            type="button"
            aria-label="One fewer"
            disabled={quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="focus-visible:ring-gold flex h-12 w-12 items-center justify-center rounded-full bg-[#F3EEE3] transition-colors hover:bg-[#E9E1CF] focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="w-10 text-center text-lg font-extrabold" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            aria-label="One more"
            disabled={quantity >= 50}
            onClick={() => setQuantity((q) => Math.min(50, q + 1))}
            className="focus-visible:ring-gold flex h-12 w-12 items-center justify-center rounded-full bg-[#F3EEE3] transition-colors hover:bg-[#E9E1CF] focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={add}
          className="focus-visible:ring-gold text-ink focus-visible:ring-offset-bg inline-flex h-[3.75rem] min-w-[14rem] flex-1 items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#FFD35F] to-[#E5B32A] px-8 text-lg font-extrabold shadow-[0_10px_40px_-10px_rgba(229,179,42,0.6)] transition-transform hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
          Add to cart
          {(quantity > 1 || extras.length > 0) && (
            <span className="font-bold opacity-80">· {kes(total)}</span>
          )}
        </button>
      </div>

      {(added || inBasket) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {added && (
            <span className="text-gold-text inline-flex items-center gap-1.5 font-bold">
              <Check className="h-4 w-4" aria-hidden="true" />
              Added to your basket
            </span>
          )}
          {inBasket && (
            <Link
              href="/checkout"
              className="bg-ink hover:bg-ink/90 inline-flex items-center gap-2 rounded-full px-4 py-2 font-bold text-white transition-colors"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              Go to checkout · {kes(cart.subtotalKes)}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {pairings.length > 0 && (
        <section className="mt-12" aria-labelledby="goes-well-with">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="goes-well-with" className="text-2xl font-extrabold tracking-tight">
              Goes well with
            </h2>
            <p className="text-muted text-sm">Optional · adds to the same order</p>
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {pairings.map((p) => {
              const on = picked.has(p.id);
              const Icon = MARK[p.mark];
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                    className={`focus-visible:ring-gold relative flex h-full w-full flex-col items-start rounded-3xl p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                      on
                        ? 'bg-[#FFF6DC] ring-2 ring-[#E5B32A]'
                        : 'bg-white ring-1 ring-[#E2D9C6] hover:ring-[#CDBF9F]'
                    }`}
                  >
                    <span className="text-gold-text flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3EEE3]">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span
                      aria-hidden="true"
                      className={`absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full ${
                        on ? 'bg-gold text-ink' : 'text-ink bg-[#F3EEE3]'
                      }`}
                    >
                      {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </span>
                    <span className="mt-5 text-lg font-extrabold leading-snug">{p.name}</span>
                    <span className="text-muted mt-1.5">{kes(p.price_kes)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
