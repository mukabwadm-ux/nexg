import type { CatalogItem, CatalogModifierGroup, CatalogModifierOption } from '../providers/DiscoveryProvider';
import { formatPrice } from '../lib/formatPrice';
import type { CatalogNaming } from './catalogSections';

/*
 * Restaurant storefront rules (owner, 8–9 Nov 2026). Plain TypeScript with no browser code, so the Expo app can
 * reuse it. Dishes go in Derrick NexG's web cart (src/cart/nexgCart.ts): one restaurant per cart, whole
 * shillings, at most 50 of a line, and no options yet. Options come only from the dish's own
 * CatalogItem.modifierGroups: nothing here invents an add-on, a price or a delivery fact.
 */

/** The most of one dish a cart line holds: the NexG web cart's own cap. */
export const MAX_DISH_QUANTITY = 50;

const groupsOf = (item: Pick<CatalogItem, 'modifierGroups'>) => item.modifierGroups ?? [];

/** How many options a group needs. */
export const leastChoices = (group: CatalogModifierGroup) => Math.max(group.required ? 1 : 0, group.minSelections, 0);
/** How many options a group allows. A missing limit allows every option. */
export const mostChoices = (group: CatalogModifierGroup) =>
  Math.max(group.maxSelections >= 1 ? group.maxSelections : group.options.length, leastChoices(group), 1);

/** "Required · choose 1", "Optional · up to 3": what a group asks for, in a few words. */
export function choiceRule(group: CatalogModifierGroup): string {
  const least = leastChoices(group);
  const most = mostChoices(group);
  if (!least) return most === 1 ? 'Optional · choose 1' : most >= group.options.length ? 'Optional' : `Optional · up to ${most}`;
  return least === most ? `Required · choose ${least}` : `Required · choose ${least} to ${most}`;
}

/** An option's price change, e.g. "+ KES 150"; undefined when it costs nothing extra. */
export function optionPrice(option: CatalogModifierOption): string | undefined {
  if (!option.priceDelta || !Number.isFinite(option.priceDelta)) return undefined;
  const price = formatPrice({ price: Math.abs(option.priceDelta), currency: option.currency }, 'code');
  return price && `${option.priceDelta > 0 ? '+' : '−'} ${price}`;
}

/** Why a dish can't go in the cart: unavailable, no menu price, not in shillings, or a choice the cart can't hold yet. */
export type CartBlock = 'unavailable' | 'unpriced' | 'currency' | 'choices';
export function cartBlock(item: Pick<CatalogItem, 'isAvailable' | 'price' | 'currency' | 'modifierGroups'>): CartBlock | undefined {
  if (item.isAvailable === false) return 'unavailable';
  if (item.price === undefined || !Number.isFinite(item.price) || item.price <= 0) return 'unpriced';
  if (item.currency !== 'KES') return 'currency';
  if (groupsOf(item).some((group) => leastChoices(group) > 0)) return 'choices';
  return undefined;
}

/** One plain line for a dish that can't go in the cart, so the shopper knows why. */
export function cartBlockNote(block: CartBlock, naming: Pick<CatalogNaming, 'item'>): string {
  switch (block) {
    case 'unavailable': return `This ${naming.item} is currently unavailable.`;
    case 'unpriced': return `This ${naming.item} has no menu price yet, so it can’t go in the cart.`;
    case 'currency': return `This ${naming.item} isn’t priced in shillings, so it can’t go in the cart.`;
    case 'choices': return `This ${naming.item} needs a choice, and the cart can’t hold choices yet.`;
  }
}

/** For a dish whose groups are all optional: it goes in the cart, without them. */
export const optionsNote = (naming: Pick<CatalogNaming, 'item'>) => `The cart can’t hold extras yet, so the ${naming.item} goes in on its own.`;

/** Whole shillings, as the cart and the menu show them: "KES 1,450". */
export const kes = (amount: number) => formatPrice({ price: amount, currency: 'KES' }, 'code') ?? `KES ${Math.round(amount)}`;

/** The basket's second line: where the cart lives, or what confirms the price. */
export const cartPillNote = (checkout: boolean) => (checkout ? 'Final price at checkout' : 'Kept on this device');
/** The cart's one footer line. Without the website's checkout, the cart stays in this browser. */
export const cartNote = (checkout: boolean) => (checkout ? 'Prices are confirmed at checkout.' : 'Your cart stays on this device. Checkout isn’t on this site yet.');
/** Asked before a dish from this restaurant replaces another restaurant's cart (one restaurant per cart). */
export const cartSwitchNote = (current: string) => `Your cart has items from ${current}${current.endsWith('.') ? '' : '.'} A new cart replaces them.`;
