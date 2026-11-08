import type { CatalogItem, Merchant } from '../providers/DiscoveryProvider';
import { formatPrice } from '../lib/formatPrice';
import { kindPresentation } from './offeringKinds';
import { findCategory, findSubcategory } from './taxonomy';

export const isSupermarket = (merchant: Merchant) => Boolean(merchant.subcategoryId && findSubcategory('groceries-essentials', 'groceries-essentials:supermarket')?.sourceIds.includes(merchant.subcategoryId));

/** Every Groceries And Essentials shop (supermarket, butchery, fresh produce…) uses the grocery storefront. */
export const isGroceryStore = (merchant: Merchant) => Boolean(merchant.subcategoryId
  && findCategory('groceries-essentials')?.subcategories.some((entry) => entry.sourceIds.includes(merchant.subcategoryId!)));

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-KE');

/**
 * The product's description when it says something of its own. Generated catalogue copy that only repeats
 * the name and the shop ("Milk from Urban Supermarket House. …") is left out, so the product sheet never
 * shows a line, or a delivery claim, that the shop didn't write.
 */
export function productDescription(item: Pick<CatalogItem, 'name' | 'description'>, merchant: Pick<Merchant, 'name'>): string | undefined {
  const text = item.description?.trim();
  if (!text) return undefined;
  const folded = plain(text);
  if (folded.replace(/[.!?]+$/, '') === plain(item.name) || folded.startsWith(plain(`${item.name} from ${merchant.name}`))) return undefined;
  return text;
}

/*
 * The shopper's grocery list (owner, 8 Nov 2026). The aisles themselves come from catalogSections.ts. The
 * website can't place orders yet, so the list stays in this browser, one list per shop, and the page says
 * so in one short line. It never touches the NexG web cart ("nexg.cart.v1").
 */

/** One product on the list and how many of it. */
export interface SupermarketListLine { itemId: string; quantity: number }
export interface SupermarketListEntry { item: CatalogItem; quantity: number }

/** The most of one product a list holds. */
export const MAX_LIST_QUANTITY = 99;

/** The one line that says where the list lives, in the card family's words. */
export const groceryListNote = kindPresentation.product.pending;

const storageKey = (merchantId: string) => `nexg.discovery.list.v1:${merchantId}`;
const clampQuantity = (quantity: number) => Number.isFinite(quantity) ? Math.max(0, Math.min(MAX_LIST_QUANTITY, Math.trunc(quantity))) : 0;

/** Sets one product's quantity: zero takes it off the list, and a new product joins the end. */
export function setListQuantity(lines: readonly SupermarketListLine[], itemId: string, quantity: number): SupermarketListLine[] {
  const next = clampQuantity(quantity);
  if (!next) return lines.filter((line) => line.itemId !== itemId);
  return lines.some((line) => line.itemId === itemId)
    ? lines.map((line) => line.itemId === itemId ? { itemId, quantity: next } : line)
    : [...lines, { itemId, quantity: next }];
}

/** Keeps well-formed lines for products the shop still lists, each product once. */
export function cleanList(value: unknown, items: readonly Pick<CatalogItem, 'id'>[]): SupermarketListLine[] {
  if (!Array.isArray(value)) return [];
  const listed = new Set(items.map((item) => item.id));
  const seen = new Set<string>();
  const lines: SupermarketListLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const { itemId, quantity } = entry as Record<string, unknown>;
    if (typeof itemId !== 'string' || !listed.has(itemId) || seen.has(itemId) || typeof quantity !== 'number') continue;
    const next = clampQuantity(quantity);
    if (!next) continue;
    seen.add(itemId);
    lines.push({ itemId, quantity: next });
  }
  return lines;
}

/** The list this browser holds for a shop; empty when storage is blocked or holds something unexpected. */
export function readGroceryList(merchant: Pick<Merchant, 'id' | 'items'>): SupermarketListLine[] {
  try {
    const raw = window.localStorage.getItem(storageKey(merchant.id));
    return raw ? cleanList(JSON.parse(raw), merchant.items.filter((item) => item.merchantId === merchant.id)) : [];
  } catch {
    return [];
  }
}

export function writeGroceryList(merchantId: string, lines: readonly SupermarketListLine[]): void {
  try {
    if (lines.length) window.localStorage.setItem(storageKey(merchantId), JSON.stringify(lines));
    else window.localStorage.removeItem(storageKey(merchantId));
  } catch {
    // Private windows and blocked storage keep the list for this visit only.
  }
}

/** The list's products in list order, leaving out any the shop no longer lists. */
export function listEntries(items: readonly CatalogItem[], lines: readonly SupermarketListLine[]): SupermarketListEntry[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return lines.flatMap((line) => {
    const item = byId.get(line.itemId);
    return item ? [{ item, quantity: line.quantity }] : [];
  });
}

/** A line at the product's listed price, when it has one. */
export const linePrice = ({ item, quantity }: SupermarketListEntry): string | undefined =>
  item.price === undefined ? undefined : formatPrice({ price: item.price * quantity, currency: item.currency }, 'code');

/** Why a list has no total: an unavailable product, a product without a listed price, or mixed currencies. */
export type ListTotalGap = 'unavailable' | 'unpriced' | 'currencies';

/** One plain line for a list without a total, so the shopper knows why. */
export const listTotalNote: Record<ListTotalGap, string> = {
  unavailable: 'No total while an unavailable product is on your list.',
  unpriced: 'No total yet: not every product has a listed price.',
  currencies: 'No total: these products are priced in different currencies.',
};

/**
 * How many products the list holds and, only when every one is available with a listed price in one
 * currency, their total at those prices. Otherwise `gap` says why there's no total. The shop confirms the
 * final total.
 */
export function listSummary(entries: readonly SupermarketListEntry[]): { quantity: number; total?: string; gap?: ListTotalGap } {
  const quantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  if (!entries.length) return { quantity };
  if (entries.some(({ item }) => item.isAvailable === false)) return { quantity, gap: 'unavailable' };
  if (entries.some(({ item }) => item.price === undefined || !Number.isFinite(item.price) || !item.currency)) return { quantity, gap: 'unpriced' };
  if (new Set(entries.map(({ item }) => item.currency)).size > 1) return { quantity, gap: 'currencies' };
  const sum = entries.reduce((total, { item, quantity: count }) => total + (item.price ?? 0) * count, 0);
  const total = formatPrice({ price: sum, currency: entries[0]!.item.currency }, 'code');
  return total ? { quantity, total } : { quantity, gap: 'unpriced' };
}
