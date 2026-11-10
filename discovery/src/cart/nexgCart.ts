import { useSyncExternalStore } from 'react';

/**
 * Derrick NexG's web cart, shared through localStorage (apps/web/components/cart/cart-provider.tsx).
 * Same key, shape and rules: one merchant per cart, at most 50 of a line, quantity 0 removes the line.
 * The cart is shared only when Discovery is served on the website's own origin; checkout re-prices on the server.
 */
export interface NexgCartLine {
  id: string;
  name: string;
  /** Whole shillings, as shown on the menu. */
  price_kes: number;
  quantity: number;
}
export interface NexgCart {
  merchantId: string | null;
  merchantName: string | null;
  lines: NexgCartLine[];
}

export const NEXG_CART_KEY = 'nexg.cart.v1';
const EMPTY: NexgCart = Object.freeze({ merchantId: null, merchantName: null, lines: [] }) as NexgCart;
const MAX_QUANTITY = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listeners = new Set<() => void>();
let cached: { raw: string | null; cart: NexgCart } = { raw: null, cart: EMPTY };

function storage(): Storage | undefined {
  try { return globalThis.localStorage ?? undefined; } catch { return undefined; }
}

/** The stored cart; the empty cart when storage is missing, blocked or holds something else. */
export function readNexgCart(): NexgCart {
  let raw: string | null = null;
  try { raw = storage()?.getItem(NEXG_CART_KEY) ?? null; } catch { raw = null; }
  if (raw === cached.raw) return cached.cart;
  let cart = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) as Partial<NexgCart> : undefined;
    if (parsed && Array.isArray(parsed.lines)) {
      cart = { merchantId: typeof parsed.merchantId === 'string' ? parsed.merchantId : null, merchantName: typeof parsed.merchantName === 'string' ? parsed.merchantName : null,
        lines: parsed.lines.filter((line): line is NexgCartLine => !!line && typeof line.id === 'string' && typeof line.name === 'string'
          && typeof line.price_kes === 'number' && Number.isFinite(line.price_kes) && Number.isInteger(line.quantity) && line.quantity > 0) };
    }
  } catch { cart = EMPTY; }
  cached = { raw, cart };
  return cart;
}

function commit(next: NexgCart): boolean {
  let written = false;
  try { storage()?.setItem(NEXG_CART_KEY, JSON.stringify(next)); written = storage() !== undefined; } catch { written = false; }
  for (const listener of listeners) listener();
  return written;
}

/**
 * Adds one of the item. 'needs-switch': the cart holds another merchant's lines (call again with replace to start a new cart).
 * 'unavailable': no price, an ID that isn't a Supabase UUID, or storage refused the write.
 */
export function addToNexgCart(merchant: { id: string; name: string }, item: { id: string; name: string; price?: number }, options: { replace?: boolean } = {}): 'added' | 'needs-switch' | 'switched' | 'unavailable' {
  const price = item.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || !UUID.test(merchant.id) || !UUID.test(item.id)) return 'unavailable';
  const cart = readNexgCart();
  const line = { id: item.id, name: item.name, price_kes: price };
  if (cart.merchantId && cart.merchantId !== merchant.id && cart.lines.length > 0) {
    if (!options.replace) return 'needs-switch';
    return commit({ merchantId: merchant.id, merchantName: merchant.name, lines: [{ ...line, quantity: 1 }] }) ? 'switched' : 'unavailable';
  }
  const existing = cart.lines.find((entry) => entry.id === item.id);
  const lines = existing
    ? cart.lines.map((entry) => (entry.id === item.id ? { ...entry, quantity: Math.min(entry.quantity + 1, MAX_QUANTITY) } : entry))
    : [...cart.lines, { ...line, quantity: 1 }];
  return commit({ merchantId: merchant.id, merchantName: merchant.name, lines }) ? 'added' : 'unavailable';
}

export function setNexgCartQuantity(itemId: string, quantity: number): void {
  const cart = readNexgCart();
  const lines = quantity <= 0
    ? cart.lines.filter((entry) => entry.id !== itemId)
    : cart.lines.map((entry) => (entry.id === itemId ? { ...entry, quantity: Math.min(Math.floor(quantity), MAX_QUANTITY) } : entry));
  commit(lines.length > 0 ? { ...cart, lines } : EMPTY);
}

export function clearNexgCart(): void { commit(EMPTY); }

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => { if (event.key === NEXG_CART_KEY || event.key === null) listener(); };
  globalThis.addEventListener?.('storage', onStorage);
  return () => { listeners.delete(listener); globalThis.removeEventListener?.('storage', onStorage); };
}

const totals = new WeakMap<NexgCart, { count: number; subtotalKes: number }>();
/** The cart, kept in step with other tabs and with adds from any storefront. */
export function useNexgCart(): NexgCart & { count: number; subtotalKes: number; quantityOf(itemId: string): number } {
  const cart = useSyncExternalStore(subscribe, readNexgCart, () => EMPTY);
  let sums = totals.get(cart);
  if (!sums) {
    sums = { count: cart.lines.reduce((n, line) => n + line.quantity, 0), subtotalKes: cart.lines.reduce((n, line) => n + line.quantity * line.price_kes, 0) };
    totals.set(cart, sums);
  }
  return { ...cart, ...sums, quantityOf: (itemId) => cart.lines.find((line) => line.id === itemId)?.quantity ?? 0 };
}

/** The website's checkout, when Discovery is served on its origin; undefined in local dev, where the cart isn't shared. */
export function nexgCheckoutUrl(): string | undefined {
  const value = (import.meta.env?.VITE_NEXG_CHECKOUT_URL as string | undefined)?.trim();
  return value ? value : undefined;
}
