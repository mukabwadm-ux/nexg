import type { CatalogItem, Merchant } from '../providers/DiscoveryProvider';
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
 * Saved hearts for a shop, kept on this device in the same place and shape GenericStorefront keeps them
 * ("nexg.discovery.shelf.v1:<merchant>" holding { saved, requests }), so a shopper's hearts stay with the
 * store whichever storefront draws it. A grocery shop never keeps requests, but any already there are kept.
 */
const shelfKey = (merchantId: string) => `nexg.discovery.shelf.v1:${merchantId}`;

function readShelfRecord(merchantId: string): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(shelfKey(merchantId));
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** The products this browser has saved at a shop, each once, leaving out any the shop no longer lists. */
export function readSavedProducts(merchant: Pick<Merchant, 'id' | 'items'>): string[] {
  const { saved } = readShelfRecord(merchant.id);
  if (!Array.isArray(saved)) return [];
  const listed = new Set(merchant.items.filter((item) => item.merchantId === merchant.id).map((item) => item.id));
  return [...new Set(saved.filter((id): id is string => typeof id === 'string' && listed.has(id)))];
}

export function writeSavedProducts(merchantId: string, saved: readonly string[]): void {
  try {
    const { requests } = readShelfRecord(merchantId);
    const kept = requests && typeof requests === 'object' && !Array.isArray(requests) ? requests : {};
    if (saved.length || Object.keys(kept).length) window.localStorage.setItem(shelfKey(merchantId), JSON.stringify({ saved: [...new Set(saved)], requests: kept }));
    else window.localStorage.removeItem(shelfKey(merchantId));
  } catch {
    // Private windows and blocked storage keep the hearts for this visit only.
  }
}
