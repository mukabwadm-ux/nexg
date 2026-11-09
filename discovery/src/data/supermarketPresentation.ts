import type { CatalogItem, Merchant } from '../providers/DiscoveryProvider';
import { offeringKind, subcategoryOf } from './offeringKinds';
import { findCategory, findSubcategory } from './taxonomy';

// Each check accepts a Discovery subcategory ID (engine mode) or one of its source groups (Supabase and platform modes).
export const isSupermarket = (merchant: Merchant) => Boolean(merchant.subcategoryId && (merchant.subcategoryId === 'groceries-essentials:supermarket'
  || findSubcategory('groceries-essentials', 'groceries-essentials:supermarket')?.sourceIds.includes(merchant.subcategoryId)));

/**
 * Every Groceries And Essentials shop (supermarket, butchery, fresh produce…). In the retail storefront a grocer calls
 * its list "Aisles" and counts its products with a basket.
 */
export const isGroceryStore = (merchant: Merchant) => Boolean(merchant.subcategoryId
  && findCategory('groceries-essentials')?.subcategories.some((entry) => entry.id === merchant.subcategoryId || entry.sourceIds.includes(merchant.subcategoryId!)));

/**
 * Every product store uses the retail storefront (owner, 9 Nov 2026): groceries, electronics, pharmacy, fashion, beauty
 * products, drinks, flowers and gifts, marketplace and adults. It needs a subcategory Discovery knows whose journey is a
 * purchase. Restaurants (dishes), services, requests, vehicles and activities keep their own storefronts, and a store
 * whose subcategory Discovery doesn't know keeps the generic one.
 */
export const isRetailStore = (merchant: Pick<Merchant, 'subcategoryId'>) => Boolean(subcategoryOf(merchant)) && offeringKind(merchant) === 'product';

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
