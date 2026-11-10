import type { Merchant } from '../providers/DiscoveryProvider';
import { categories, type DiscoveryCategory, type DiscoverySubcategory } from './taxonomy';

/**
 * One item card family (owner decision, 8 Nov 2026). Each subcategory's default journey picks the kind,
 * so a gym session, a safari and a laptop share one card anatomy with kind-specific content.
 */
export type OfferingKind = 'product' | 'dish' | 'service' | 'activity' | 'task' | 'vehicle';

const kindByJourney: Record<string, OfferingKind> = {
  PURCHASE: 'product', RESTRICTED_PURCHASE: 'product',
  APPOINTMENT: 'service', CARE: 'service',
  TICKET: 'activity', TOUR: 'activity',
  SERVICE: 'task', REQUEST: 'task',
  RENTAL: 'vehicle', TRANSFER: 'vehicle',
};

/** The Discovery subcategory a merchant belongs to, from its source group or Discovery ID. */
export function subcategoryOf(merchant: Pick<Merchant, 'subcategoryId'>): { category: DiscoveryCategory; subcategory: DiscoverySubcategory } | undefined {
  const id = merchant.subcategoryId;
  if (!id) return undefined;
  for (const category of categories) {
    const subcategory = category.subcategories.find((entry) => entry.id === id || entry.sourceIds.includes(id));
    if (subcategory) return { category, subcategory };
  }
  return undefined;
}

export function offeringKind(merchant: Pick<Merchant, 'subcategoryId'>): OfferingKind {
  const match = subcategoryOf(merchant);
  const kind = match?.subcategory.journey ? kindByJourney[match.subcategory.journey] : undefined;
  if (kind === 'product' && match?.category.id === 'restaurants-food') return 'dish';
  return kind ?? 'product';
}

/**
 * Vehicles come two ways: hire (out and back on dates you choose) or a transfer (one ride with a driver,
 * such as an airport pickup). Each asks its own questions; anything else is undefined.
 */
export type VehicleJourney = 'rental' | 'transfer';
export function vehicleJourney(merchant: Pick<Merchant, 'subcategoryId'>): VehicleJourney | undefined {
  const journey = subcategoryOf(merchant)?.subcategory.journey;
  return journey === 'RENTAL' ? 'rental' : journey === 'TRANSFER' ? 'transfer' : undefined;
}

/** Bike hire asks the car hire questions without the driver option. */
export const isBikeHire = (merchant: Pick<Merchant, 'subcategoryId'>) => subcategoryOf(merchant)?.subcategory.id === 'vehicle-rentals:bike-rental';

/** Which way an airport transfer runs, so the examples point the right way. */
export type TransferDirection = 'pickup' | 'dropoff';
export function transferDirection(merchant: Pick<Merchant, 'subcategoryId'>): TransferDirection | undefined {
  const id = subcategoryOf(merchant)?.subcategory.id;
  return id === 'airport-transfers:airport-pickup' ? 'pickup' : id === 'airport-transfers:airport-drop-off' ? 'dropoff' : undefined;
}
const examples: Record<TransferDirection | 'any', { pickup: string; dropoff: string }> = {
  pickup: { pickup: 'e.g. JKIA Terminal 1A', dropoff: 'e.g. your hotel or home address' },
  dropoff: { pickup: 'e.g. your hotel or home address', dropoff: 'e.g. JKIA Terminal 1A' },
  any: { pickup: 'e.g. JKIA, Wilson Airport or an address', dropoff: 'e.g. Westlands or your hotel' },
};
/** Placeholder examples for a transfer's pickup and drop-off. Examples only, never a claim about the route. */
export const transferExamples = (direction?: TransferDirection) => examples[direction ?? 'any'];

/**
 * Wording for each kind. Products and dishes go in the NexG web cart and check out on the NexG website.
 * The website can't book or send requests yet, so every other kind is a request kept on the shopper's
 * device, and the expanded card says so in one short line. Nothing here claims a fact the catalogue doesn't hold.
 */
export interface KindPresentation {
  /** A plain name for the list when a store has no words of its own (see catalogNaming). */
  section: string;
  intro: string;
  /** The card's action when it opens the expanded card. */
  cardAction: string;
  pricePrefix: string;
  noPrice: string;
  /** The expanded card's main button. */
  sheetAction: string;
  /** Shown once the choice is in the cart or kept on the device. */
  saved: string;
  /** Shown beside the main button before anything is chosen: where the choice goes. One short line. */
  pending: string;
}

const kept = 'Saved on this device. Nothing has been sent yet.';
const added = 'Added to your cart.';
/** The cart pieces' line while the website's checkout isn't reachable from here (checkoutNote in cart/useStoreCart.ts). */
const checkoutElsewhere = 'Checkout happens on the NexG website.';
const requestOnDevice = 'Requests stay on this device. Sending them isn’t on the website yet.';
export const kindPresentation: Record<OfferingKind, KindPresentation> = {
  product: { section: 'Products', intro: 'Add what you need to your cart.', cardAction: 'View product', pricePrefix: '', noPrice: 'Price on request',
    sheetAction: 'Add to cart', saved: added, pending: checkoutElsewhere },
  dish: { section: 'Menu', intro: 'Add dishes to your cart.', cardAction: 'View dish', pricePrefix: '', noPrice: 'Price on request',
    sheetAction: 'Add to cart', saved: added, pending: checkoutElsewhere },
  service: { section: 'Services', intro: 'Choose a service, then the day and time that suit you.', cardAction: 'View service', pricePrefix: '', noPrice: 'Price on request',
    sheetAction: 'Save request', saved: kept, pending: requestOnDevice },
  activity: { section: 'Experiences', intro: 'Choose an experience, then a date and your group.', cardAction: 'Choose a date', pricePrefix: 'From ', noPrice: 'Price on request',
    sheetAction: 'Save request', saved: kept, pending: requestOnDevice },
  task: { section: 'Services', intro: 'Choose a service and describe what you need.', cardAction: 'Start a request', pricePrefix: 'From ', noPrice: 'Quoted after review',
    sheetAction: 'Save request', saved: kept, pending: requestOnDevice },
  vehicle: { section: 'Vehicles', intro: 'Choose a vehicle, then your dates and place.', cardAction: 'Check dates', pricePrefix: 'From ', noPrice: 'Price on request',
    sheetAction: 'Save request', saved: kept, pending: requestOnDevice },
};

/** Products and dishes go in the NexG cart; every other kind is a request. (The name is kept for existing imports.) */
export const isListKind = (kind: OfferingKind) => kind === 'product' || kind === 'dish';

/**
 * A transfer card opens a ride, not dates, and a hire card whose trip is already planned has nothing left
 * to check: both simply select the vehicle (the owner's transfer design, 8 Nov 2026).
 */
export const transferCardAction = 'Select';
