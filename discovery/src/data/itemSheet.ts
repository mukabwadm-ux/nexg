import type { CatalogItem, CatalogModifierGroup, Merchant } from '../providers/DiscoveryProvider';
import { departureLabel, tripFacts, upcomingDepartures } from '../components/tours/tripFormat';
import { catalogNaming } from './catalogSections';
import { experienceBooking, experienceFacts, isDirectExperienceMerchant } from './experiencePresentation';
import { isAppointmentProvider, readShelf as readAppointmentShelf, serviceProfile, writeShelf as writeAppointmentShelf, MAX_NOTES, MAX_PEOPLE, type AppointmentRequest, type ServiceProfile } from './massagePresentation';
import { isBikeHire, isListKind, transferDirection, vehicleJourney, type OfferingKind, type TransferDirection, type VehicleJourney } from './offeringKinds';
import { kes, optionsNote, type CartBlock } from './restaurantPresentation';
import { isTourOperator, tourLabel } from './tourPresentation';

/*
 * The one item sheet (owner, 9 Nov 2026): whatever a shopper taps, in any category, subcategory or store, opens the
 * same sheet. These rules decide what goes in its middle and what its main button does. They resolve from the item's
 * kind (offeringKinds), the merchant's category and subcategory, and the catalogue's own data, never from guesses.
 * Plain TypeScript with no browser code beyond device storage, so the Expo app can reuse it.
 */

/** Where the sheet opened: inside the store, or on a discovery page (the sheet then shows the store it comes from). */
export type ItemSheetContext = 'store' | 'discovery';

/** What a shopper filled in on a request, kept on this device with it. Every field is optional. */
export interface OfferingAnswers {
  date?: string; time?: string; endDate?: string; endTime?: string; part?: string;
  adults?: number; children?: number; place?: string; returnPlace?: string; dropoff?: string;
  brief?: string; budget?: string; contact?: string; driver?: boolean;
  travellers?: number; bags?: number; meetGreet?: boolean; notes?: string;
}
/** A request kept on this device. Nothing is sent anywhere. */
export interface KeptRequest { answers: OfferingAnswers; savedAt: string }

/** Which questions a request asks. */
export type RequestForm = 'service' | 'activity' | 'task';
/** The page an activity opens: a trip, or an event, class or activity on the experience page. */
export type DetailPage = 'trip' | 'event' | 'class' | 'activity';
export interface ItemFact { key: string; label: string; value: string }

/** The middle of the sheet. */
export type ItemSheetBlock =
  /** Products and dishes go in the NexG cart; any option groups are the item's own, shown as listed. */
  | { type: 'cart'; options: readonly CatalogModifierGroup[] }
  /** Services and tasks ask for a request; `profile` holds an appointment store's own wording. */
  | { type: 'request'; form: RequestForm; profile?: ServiceProfile }
  /** Car and bike hire ask for the trip; transfers ask for the ride. */
  | { type: 'vehicle'; journey: VehicleJourney; bike: boolean; direction?: TransferDirection }
  /** Events and trips show the facts the listing has and open their own page. */
  | { type: 'detail'; page: DetailPage; facts: ItemFact[] };

export interface ItemSheetOptions {
  context?: ItemSheetContext;
  /** The caller can open the item's own page, so events and trips link there instead of asking questions. */
  detail?: boolean;
  /** Today as "YYYY-MM-DD", for listed dates. */
  today?: string;
}

/** The page an activity merchant's items open, if it has one. */
export function detailPage(merchant: Merchant): DetailPage | undefined {
  if (isTourOperator(merchant)) return 'trip';
  if (!isDirectExperienceMerchant(merchant)) return undefined;
  const fact = experienceBooking(merchant).fact;
  return fact === 'event' ? 'event' : fact === 'class' ? 'class' : 'activity';
}

/** The main button of an event or trip. */
export const detailAction: Record<DetailPage, string> = { trip: 'View trip', event: 'View event', class: 'View class', activity: 'View activity' };

/**
 * The facts an event or trip listing has: the operator's trip facts (or the trip type), the experience type, and the
 * next listed date. The price is already under the title and the store card names the place, so neither repeats.
 */
export function detailFacts(merchant: Merchant, item: CatalogItem, page: DetailPage, today: string): ItemFact[] {
  const listed = page === 'trip' ? tripFacts(item, merchant, tourLabel(merchant)) : experienceFacts(item, merchant);
  const facts: ItemFact[] = listed.filter((fact) => fact.key !== 'price' && fact.key !== 'base').map(({ key, label, value }) => ({ key, label, value }));
  const dates = upcomingDepartures(item.trip, today);
  if (dates[0]) {
    const more = dates.length - 1;
    const label = page === 'trip' ? (more ? 'Next departure' : 'Departure') : (more ? 'Next date' : 'Date');
    facts.push({ key: 'dates', label, value: `${departureLabel(dates[0])}${more ? ` · ${more} more ${more === 1 ? 'date' : 'dates'}` : ''}` });
  }
  return facts;
}

/** What goes in the middle of the sheet for this item. */
export function itemSheetBlock(merchant: Merchant, item: CatalogItem, kind: OfferingKind, options: ItemSheetOptions = {}): ItemSheetBlock {
  if (isListKind(kind)) return { type: 'cart', options: item.modifierGroups ?? [] };
  if (kind === 'vehicle') {
    const journey = vehicleJourney(merchant) ?? 'rental';
    return { type: 'vehicle', journey, bike: journey === 'rental' && isBikeHire(merchant), direction: journey === 'transfer' ? transferDirection(merchant) : undefined };
  }
  if (kind === 'activity' && options.detail) {
    const page = detailPage(merchant);
    if (page) return { type: 'detail', page, facts: detailFacts(merchant, item, page, options.today ?? '') };
  }
  if (kind === 'service') return { type: 'request', form: 'service', profile: isAppointmentProvider(merchant) ? serviceProfile(merchant) : undefined };
  return { type: 'request', form: kind === 'activity' ? 'activity' : 'task' };
}

/** The small heading over the store card, in the kind's own words. */
export function storeLabel(kind: OfferingKind): string {
  if (isListKind(kind)) return 'Order from';
  return kind === 'activity' ? 'Offered by' : 'Request from';
}

/** The store card's second line: where the store is and the facts the catalogue confirms. */
export function storeMeta(merchant: Merchant): string {
  const facts = merchant.displayFacts;
  const rating = facts?.rating && Number.isFinite(facts.rating.value) && facts.rating.value >= 0 && facts.rating.value <= 5 ? `Rated ${facts.rating.value.toFixed(1)}` : undefined;
  return [merchant.area || merchant.address, facts?.deliveryTime, rating].filter((part): part is string => Boolean(part && part.trim())).join(' · ');
}

/* The NexG cart ---------------------------------------------------------------------------------------------- */
// The cart is written through the shared cart pieces (components/cart/useStoreCart.ts), which also ask "Start a new
// cart?". These rules decide what the sheet offers and says; `cartBlock` (restaurantPresentation) says why an item
// can't go in: unavailable, no price, not shillings, or a required choice the cart can't hold yet.

/** The sheet's main button. `total` is the price times the quantity, shown after the label. */
export interface SheetAction { type: 'add' | 'update' | 'in-cart' | 'store' | 'blocked'; label: string; total?: string; disabled: boolean }

/**
 * The main button for a product or dish. An unavailable item says so. An item needing a choice the cart can't hold
 * opens its store from a discovery page; anything else that can't go in stays disabled while the note says why.
 */
export function cartAction({ item, reason, quantity, inCart, context, canOpenStore = false }: {
  item: Pick<CatalogItem, 'price'>; reason?: CartBlock; quantity: number;
  /** How many of this item the cart holds for this store. */
  inCart: number;
  context?: ItemSheetContext; canOpenStore?: boolean;
}): SheetAction {
  if (reason === 'unavailable') return { type: 'blocked', label: 'Unavailable', disabled: true };
  if (reason) {
    return reason === 'choices' && context === 'discovery' && canOpenStore
      ? { type: 'store', label: 'View in store', disabled: false }
      : { type: 'blocked', label: 'Add to cart', disabled: true };
  }
  if (inCart > 0 && quantity === inCart) return { type: 'in-cart', label: 'In your cart', disabled: true };
  const total = item.price === undefined ? undefined : kes(item.price * quantity);
  return inCart > 0 ? { type: 'update', label: 'Update cart', total, disabled: false } : { type: 'add', label: 'Add to cart', total, disabled: false };
}

/**
 * The one line over the main button for a product or dish: why it can't go in, or else `checkout`, the cart pieces'
 * line about checkout.
 */
export function cartSheetNote(merchant: Pick<Merchant, 'subcategoryId'>, item: CatalogItem, reason: CartBlock | undefined, checkout: string): string {
  const naming = catalogNaming(merchant);
  switch (reason) {
    case 'unavailable': return `This ${naming.item} is currently unavailable.`;
    case 'unpriced': return `This ${naming.item} has no listed price yet, so it can’t go in the cart.`;
    case 'currency': return `This ${naming.item} isn’t priced in shillings, so it can’t go in the cart.`;
    case 'choices': return `This ${naming.item} needs a choice, and the cart can’t hold choices yet.`;
    default:
      // Every group is optional here (a required one is a reason): the item goes in on its own.
      return (item.modifierGroups ?? []).length > 0 ? optionsNote(naming) : checkout;
  }
}



/* Requests ---------------------------------------------------------------------------------------------------- */

/** Every question a request can ask, as the form holds it. */
export interface RequestDraft {
  date: string; time: string; endDate: string; endTime: string; part: string;
  adults: number; children: number; place: string; otherReturn: boolean; returnPlace: string; dropoff: string;
  travellers: number; bags: number; meetGreet: boolean; brief: string; budget: string; contact: string; driver: boolean; notes: string;
}

export function requestDraft(start: OfferingAnswers = {}): RequestDraft {
  return {
    date: start.date ?? '', time: start.time ?? '', endDate: start.endDate ?? '', endTime: start.endTime ?? '', part: start.part ?? '',
    adults: start.adults ?? 1, children: start.children ?? 0, place: start.place ?? '', otherReturn: Boolean(start.returnPlace), returnPlace: start.returnPlace ?? '',
    dropoff: start.dropoff ?? '', travellers: start.travellers ?? 1, bags: start.bags ?? 0, meetGreet: start.meetGreet ?? false,
    brief: start.brief ?? '', budget: start.budget ?? '', contact: start.contact ?? 'whatsapp', driver: start.driver ?? false, notes: start.notes ?? '',
  };
}

type RequestBlock = Extract<ItemSheetBlock, { type: 'request' | 'vehicle' }>;

/** What still stops a request from being kept, in one sentence; undefined when it's ready. */
export function requestProblem(block: RequestBlock, draft: RequestDraft): string | undefined {
  if (block.type === 'request') {
    if (block.form === 'service' && !draft.date) return `Choose a ${(block.profile?.dateLabel ?? 'Preferred date').toLocaleLowerCase('en-KE')}.`;
    if (block.form === 'activity' && !draft.date) return 'Choose a date.';
    if (block.form === 'task' && draft.brief.trim().length < 10) return 'Tell the provider a little more about what you need.';
    return undefined;
  }
  if (block.journey === 'transfer') return draft.place.trim() && draft.dropoff.trim() && draft.date && draft.time ? undefined : 'Add the pickup, drop-off, date and time.';
  if (!draft.place.trim() || !draft.date || !draft.endDate) return 'Add the pick-up place and both dates.';
  if (draft.otherReturn && !draft.returnPlace.trim()) return 'Add where you’ll return it.';
  if (`${draft.endDate}T${draft.endTime || '23:59'}` <= `${draft.date}T${draft.time || '00:00'}`) return 'The return must be after the pickup.';
  return undefined;
}

/** The answers a request keeps: only the questions its form asks, without empty text. */
export function requestAnswers(block: RequestBlock, draft: RequestDraft): OfferingAnswers {
  const text = (value: string) => value.trim() || undefined;
  if (block.type === 'request') {
    if (block.form === 'service') return { date: draft.date, time: block.profile?.askTime === false ? undefined : text(draft.time), adults: draft.adults, notes: text(draft.notes) };
    if (block.form === 'activity') return { date: draft.date, part: text(draft.part), adults: draft.adults, children: draft.children, notes: text(draft.notes) };
    return { brief: draft.brief.trim(), date: text(draft.date), place: text(draft.place), budget: text(draft.budget), contact: draft.contact };
  }
  if (block.journey === 'transfer') return { place: draft.place.trim(), dropoff: draft.dropoff.trim(), date: draft.date, time: draft.time, travellers: draft.travellers, bags: draft.bags, meetGreet: draft.meetGreet, notes: text(draft.notes) };
  return { place: draft.place.trim(), date: draft.date, endDate: draft.endDate, time: text(draft.time), endTime: text(draft.endTime),
    returnPlace: draft.otherReturn ? text(draft.returnPlace) : undefined, driver: draft.driver, notes: text(draft.notes) };
}

/** One line over a request's questions: who confirms what. Requests are kept on this device and never sent from here. */
export function requestIntro(merchant: Pick<Merchant, 'name'>, item: Pick<CatalogItem, 'price' | 'currency'>, block: RequestBlock): string {
  const priced = item.price !== undefined && Number.isFinite(item.price) && Boolean(item.currency);
  if (block.type === 'vehicle') return `${merchant.name} confirms availability and the final price.`;
  if (block.form === 'service') return `${merchant.name} confirms the ${block.profile?.askTime === false ? 'start date' : 'time'}${priced ? '' : ' and price'}.`;
  if (block.form === 'activity') return `${merchant.name} confirms the ${priced ? 'date and time' : 'date, time and price'}.`;
  return `${merchant.name} confirms the price and timing.`;
}

/* Requests kept on this device ---------------------------------------------------------------------------------- */

type DeviceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
/** The store shelf the generic storefront and the experience page read ({ saved, requests }). */
const shelfKey = (merchantId: string) => `nexg.discovery.shelf.v1:${merchantId}`;

const day = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
const clock = (value: unknown) => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : undefined;
const words = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
const whole = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) ? Math.min(max, Math.max(min, value)) : undefined;
const flag = (value: unknown) => typeof value === 'boolean' ? value : undefined;
const oneOf = (value: unknown, options: readonly string[]) => typeof value === 'string' && options.includes(value) ? value : undefined;
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;

/** Stored answers, read defensively: storage can be empty, blocked or edited by hand. */
export function cleanAnswers(value: unknown): OfferingAnswers {
  const entry = record(value) ?? {};
  const answers: OfferingAnswers = {
    date: day(entry.date), endDate: day(entry.endDate), time: clock(entry.time), endTime: clock(entry.endTime),
    part: oneOf(entry.part, ['morning', 'afternoon', 'evening']), adults: whole(entry.adults, 1, 20), children: whole(entry.children, 0, 20),
    place: words(entry.place, 120), returnPlace: words(entry.returnPlace, 120), dropoff: words(entry.dropoff, 120), brief: words(entry.brief, 600),
    budget: typeof entry.budget === 'string' && /^\d{1,9}$/.test(entry.budget) ? entry.budget : undefined,
    contact: oneOf(entry.contact, ['call', 'whatsapp', 'email']), driver: flag(entry.driver), meetGreet: flag(entry.meetGreet),
    travellers: whole(entry.travellers, 1, 20), bags: whole(entry.bags, 0, 20), notes: words(entry.notes, 300),
  };
  return Object.fromEntries(Object.entries(answers).filter(([, field]) => field !== undefined)) as OfferingAnswers;
}

function readStoreShelf(storage: DeviceStorage, merchantId: string): Record<string, unknown> | undefined {
  try {
    const raw = storage.getItem(shelfKey(merchantId));
    return raw ? record(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * An appointment store's saved booking request (massagePresentation's shelf, "nexg.discovery.appointments.v1") as the
 * sheet's request: the guests or people travel as `adults`. Requests saved before the one sheet stay readable.
 */
export function keptFromAppointment(request: AppointmentRequest): KeptRequest {
  return { answers: cleanAnswers({ date: request.date, time: request.time, adults: request.people, notes: request.notes }), savedAt: request.savedAt };
}

/** The sheet's request in the appointment shelf's format; undefined without a preferred date, which every booking needs. */
export function appointmentFromKept(kept: KeptRequest): AppointmentRequest | undefined {
  const { date, time, adults, notes } = kept.answers;
  if (!date) return undefined;
  return { date, time: time ?? '', people: Math.min(MAX_PEOPLE, Math.max(1, adults ?? 1)), notes: (notes ?? '').slice(0, MAX_NOTES), savedAt: kept.savedAt };
}

/**
 * The request this device keeps for one item, read where the store's own page reads it: appointment stores keep
 * theirs on the appointment shelf, every other store on its store shelf. A request for a day that has passed is gone.
 */
export function readItemRequest(storage: DeviceStorage | undefined, merchant: Merchant, itemId: string, today: string): KeptRequest | undefined {
  if (isAppointmentProvider(merchant)) {
    const kept = readAppointmentShelf(merchant.id, today).requests[itemId];
    return kept && keptFromAppointment(kept);
  }
  if (!storage) return undefined;
  const entry = record(record(readStoreShelf(storage, merchant.id)?.requests)?.[itemId]);
  if (!entry) return undefined;
  const answers = cleanAnswers(entry.answers);
  if (answers.date && answers.date < today) return undefined;
  return { answers, savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : '' };
}

/**
 * Keeps (or, without a request, forgets) one item's request on this device, beside the store's other hearts and
 * requests. False when storage refuses it.
 */
export function writeItemRequest(storage: DeviceStorage | undefined, merchant: Merchant, itemId: string, request?: KeptRequest): boolean {
  if (isAppointmentProvider(merchant)) {
    if (!storage) return false;
    const shelf = readAppointmentShelf(merchant.id);
    const booking = request && appointmentFromKept(request);
    if (booking) shelf.requests[itemId] = booking;
    else delete shelf.requests[itemId];
    writeAppointmentShelf(merchant.id, shelf);
    return true;
  }
  if (!storage) return false;
  try {
    const shelf = readStoreShelf(storage, merchant.id) ?? {};
    const saved = Array.isArray(shelf.saved) ? shelf.saved.filter((id): id is string => typeof id === 'string') : [];
    const requests: Record<string, unknown> = { ...record(shelf.requests) };
    if (request) requests[itemId] = { answers: request.answers, savedAt: request.savedAt };
    else delete requests[itemId];
    if (saved.length || Object.keys(requests).length) storage.setItem(shelfKey(merchant.id), JSON.stringify({ ...shelf, saved, requests }));
    else storage.removeItem(shelfKey(merchant.id));
    return true;
  } catch {
    return false;
  }
}
