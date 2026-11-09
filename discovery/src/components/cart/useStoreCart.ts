import { useMemo, useState } from 'react';
import type { CatalogItem, Merchant } from '../../providers/DiscoveryProvider';
import { addToNexgCart, nexgCheckoutUrl, readNexgCart, setNexgCartQuantity, useNexgCart, type NexgCart, type NexgCartLine } from '../../cart/nexgCart';
import { formatPrice } from '../../lib/formatPrice';

/**
 * One store's view of Derrick NexG's web cart (src/cart/nexgCart.ts, "nexg.cart.v1"), for any storefront:
 * this store's lines, adds that ask before replacing another store's cart (one store per cart), and the
 * words the cart pieces share. The logic is plain functions under a thin hook, so the Expo app can port it.
 */

/** The most of one line the NexG cart holds (nexgCart.ts caps a line at 50). */
export const MAX_CART_QUANTITY = 50;

/** Whether an item can go in the cart: available, with a listed price in whole shillings. */
export const cartable = (item: Pick<CatalogItem, 'price' | 'currency' | 'isAvailable'>) => item.isAvailable !== false
  && typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0 && (item.currency === undefined || item.currency === 'KES');

/** "KES 3,400". */
export const kes = (amount: number) => formatPrice({ price: amount, currency: 'KES' }, 'code') ?? `KES ${Math.round(amount).toLocaleString('en-KE')}`;
/** "1 item", "3 items". */
export const itemCount = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;
/** The cart's one line about checkout. Off the website's own origin the cart can't reach checkout from here. */
export const checkoutNote = (checkoutUrl?: string) => (checkoutUrl ? 'Prices are confirmed at checkout.' : 'Checkout happens on the NexG website.');

/** Where an add went: into the cart, waiting on "Start a new cart?", or refused. */
export type CartOutcome = 'added' | 'waiting' | 'refused';
/** An add waiting on "Start a new cart?". */
export interface PendingAdd { item: CatalogItem; quantity?: number; source: 'card' | 'sheet' }

/** What one store sees of the cart. */
export interface StoreCartView {
  /** This store's lines; empty while the cart holds another store's. */
  lines: NexgCartLine[];
  count: number;
  subtotalKes: number;
  /** The other store's name while the cart holds its lines. */
  otherStore?: string;
}

/** One empty list, so a store whose lines aren't in the cart keeps stable quantities between renders. */
const NO_LINES: NexgCartLine[] = [];
const clamp = (quantity: number) => (Number.isFinite(quantity) ? Math.max(0, Math.min(MAX_CART_QUANTITY, Math.trunc(quantity))) : 0);

export function storeCartView(cart: Pick<NexgCart, 'merchantId' | 'merchantName' | 'lines'>, merchantId: string): StoreCartView {
  const mine = cart.merchantId === merchantId && cart.lines.length > 0;
  const lines = mine ? cart.lines : NO_LINES;
  return {
    lines,
    count: lines.reduce((total, line) => total + line.quantity, 0),
    subtotalKes: lines.reduce((total, line) => total + line.quantity * line.price_kes, 0),
    otherStore: !mine && cart.lines.length > 0 ? cart.merchantName?.trim() || 'another store' : undefined,
  };
}

/**
 * Puts an item in the cart: one more when `quantity` is left out (the card's +), or exactly `quantity`
 * (the product sheet's "Add 3 to cart"). `replace` starts a new cart over another store's lines.
 */
export function putInCart(merchant: Pick<Merchant, 'id' | 'name'>, item: CatalogItem, quantity: number | undefined, replace = false): ReturnType<typeof addToNexgCart> {
  if (item.merchantId !== merchant.id || !cartable(item)) return 'unavailable';
  if (quantity === undefined) return addToNexgCart(merchant, item, { replace });
  const next = clamp(quantity);
  if (next < 1) return 'unavailable';
  // Read the cart as it is now, not as it was when the page last drew.
  const current = readNexgCart();
  if (current.merchantId === merchant.id && current.lines.some((line) => line.id === item.id)) {
    setNexgCartQuantity(item.id, next);
    return 'added';
  }
  const result = addToNexgCart(merchant, item, { replace });
  if ((result === 'added' || result === 'switched') && next > 1) setNexgCartQuantity(item.id, next);
  return result;
}

/** Sets one of this store's lines; 0 takes it out. Another store's cart is left alone. */
export function setStoreCartQuantity(merchantId: string, itemId: string, quantity: number): void {
  if (readNexgCart().merchantId === merchantId) setNexgCartQuantity(itemId, clamp(quantity));
}

export interface StoreCart extends StoreCartView {
  quantities: ReadonlyMap<string, number>;
  checkoutUrl?: string;
  pending?: PendingAdd;
  /** One more from a card, or a set quantity from a product sheet. */
  add: (item: CatalogItem, quantity?: number, source?: PendingAdd['source']) => CartOutcome;
  /** Sets a line's quantity; 0 takes it out. */
  set: (itemId: string, quantity: number) => void;
  /** Replaces the other store's cart with the waiting add. */
  startNewCart: () => CartOutcome;
  keepCurrentCart: () => void;
}

export function useStoreCart(merchant: Pick<Merchant, 'id' | 'name'>): StoreCart {
  const cart = useNexgCart();
  const [pending, setPending] = useState<PendingAdd>();
  const view = useMemo(() => storeCartView(cart, merchant.id), [cart.merchantId, cart.merchantName, cart.lines, merchant.id]);
  const quantities = useMemo(() => new Map(view.lines.map((line) => [line.id, line.quantity])), [view.lines]);
  return {
    ...view,
    quantities,
    checkoutUrl: nexgCheckoutUrl(),
    pending,
    add: (item, quantity, source = 'card') => {
      const result = putInCart(merchant, item, quantity);
      if (result === 'needs-switch') { setPending({ item, quantity, source }); return 'waiting'; }
      return result === 'unavailable' ? 'refused' : 'added';
    },
    set: (itemId, quantity) => setStoreCartQuantity(merchant.id, itemId, quantity),
    startNewCart: () => {
      if (!pending) return 'refused';
      setPending(undefined);
      const result = putInCart(merchant, pending.item, pending.quantity, true);
      return result === 'added' || result === 'switched' ? 'added' : 'refused';
    },
    keepCurrentCart: () => setPending(undefined),
  };
}
