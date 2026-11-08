import type { CatalogItem, Merchant } from '../providers/DiscoveryProvider';
import { findCategory } from './taxonomy';

/** Source identity selects the presentation; a category query cannot turn another merchant into a massage provider. */
export function isMassageProvider(merchant: Merchant) {
  return merchant.subcategoryId === 'wellness_massage' || merchant.subcategoryId === 'beauty-wellness:massage';
}

/** Today (or `date`) as a local "YYYY-MM-DD" key. Date pickers across the site use it as their minimum. */
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * The questions the appointment storefront asks for each booking type (massage, spa, gym, personal training,
 * salon & barber, nails & beauty). Labels and examples only: nothing here claims a duration, a place, a staff
 * member or a free slot, because the catalogue supplies none of them. What a store calls its list ("Treatments",
 * "Memberships & classes", "Services") comes from catalogNaming in catalogSections.ts.
 */
export interface ServiceProfile {
  /** Label of the date question. */
  dateLabel: string;
  /** Whether a preferred time of day makes sense (a gym membership starts on a day, not at a time). */
  askTime: boolean;
  /** Label of the people stepper. */
  peopleLabel: string;
  /** An example of what to tell the provider; never a promise of what they offer. */
  notesPlaceholder: string;
}

const profiles: Record<string, ServiceProfile> = {
  'beauty-wellness:massage': { dateLabel: 'Preferred date', askTime: true, peopleLabel: 'Guests', notesPlaceholder: 'e.g. the pressure you like, or areas to focus on' },
  'beauty-wellness:spa': { dateLabel: 'Preferred date', askTime: true, peopleLabel: 'Guests', notesPlaceholder: 'e.g. skin sensitivities, or anything you’d rather avoid' },
  'beauty-wellness:gym': { dateLabel: 'Preferred start date', askTime: false, peopleLabel: 'People', notesPlaceholder: 'e.g. your goals, or the classes you’re interested in' },
  'beauty-wellness:personal-training': { dateLabel: 'Preferred first session', askTime: true, peopleLabel: 'People', notesPlaceholder: 'e.g. your goals, or injuries to work around' },
  'beauty-wellness:salon-barber': { dateLabel: 'Preferred date', askTime: true, peopleLabel: 'People', notesPlaceholder: 'e.g. the cut or style you want' },
  'beauty-wellness:nails-beauty-services': { dateLabel: 'Preferred date', askTime: true, peopleLabel: 'People', notesPlaceholder: 'e.g. the colour, shape or look you want' },
};

function bookingSubcategory(merchant: Merchant) {
  if (!merchant.subcategoryId) return undefined;
  return findCategory('beauty-wellness')?.subcategories.find((entry) => profiles[entry.id]
    && (entry.id === merchant.subcategoryId || entry.sourceIds.includes(merchant.subcategoryId!)));
}

/** Every Beauty And Wellness booking type (spa, massage, gym, training, salon, nails) uses the appointment storefront. */
export const isAppointmentProvider = (merchant: Merchant) => Boolean(bookingSubcategory(merchant));

export function serviceProfile(merchant: Merchant): ServiceProfile {
  const subcategory = bookingSubcategory(merchant);
  return profiles[subcategory?.id ?? 'beauty-wellness:massage']!;
}

const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-KE');

/**
 * The item's description when it says something of its own. A line that only repeats the name and the
 * provider ("Body Scrub from Urban Spa House. …", the shape of generated catalogue copy) is left out, so
 * cards don't repeat it twenty times and the sheet never shows a claim the merchant didn't write.
 */
export function ownDescription(item: Pick<CatalogItem, 'name' | 'description'>, merchant: Pick<Merchant, 'name'>): string | undefined {
  const text = item.description?.trim();
  if (!text) return undefined;
  if (plain(text).startsWith(plain(`${item.name} from ${merchant.name}`))) return undefined;
  return text;
}

/**
 * A booking request kept on this device. Booking isn't connected on the website yet, so nothing is sent:
 * the shopper's preferred day and notes wait here, and the provider confirms the time once booking opens.
 */
export interface AppointmentRequest {
  /** Preferred day, "YYYY-MM-DD". */
  date: string;
  /** Preferred time, "HH:MM", or "" when the shopper left it to the provider. */
  time: string;
  people: number;
  notes: string;
  /** ISO time the request was saved. */
  savedAt: string;
}

/** What one viewer keeps for one store: saved services and booking requests. */
export interface AppointmentShelf {
  saved: string[];
  requests: Record<string, AppointmentRequest>;
}

const SHELF_KEY = 'nexg.discovery.appointments.v1';
const MAX_STORES = 40;
export const MAX_PEOPLE = 10;
export const MAX_NOTES = 300;

export const emptyShelf = (): AppointmentShelf => ({ saved: [], requests: {} });

interface StoredShelf extends AppointmentShelf { updatedAt: string }
type ShelfRoot = Record<string, StoredShelf>;

function deviceStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function readRoot(): ShelfRoot {
  try {
    const raw = deviceStorage()?.getItem(SHELF_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ShelfRoot : {};
  } catch {
    return {};
  }
}

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = (value: unknown): value is string => typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);

function cleanRequest(value: unknown, today: string): AppointmentRequest | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Partial<Record<keyof AppointmentRequest, unknown>>;
  // A preferred day that has passed is no longer a request.
  if (!isDay(entry.date) || entry.date < today) return undefined;
  const people = typeof entry.people === 'number' && Number.isInteger(entry.people) ? Math.min(MAX_PEOPLE, Math.max(1, entry.people)) : 1;
  return {
    date: entry.date,
    time: isTime(entry.time) ? entry.time : '',
    people,
    notes: typeof entry.notes === 'string' ? entry.notes.slice(0, MAX_NOTES) : '',
    savedAt: typeof entry.savedAt === 'string' ? entry.savedAt : '',
  };
}

/** The viewer's saved services and requests for one store, read defensively (storage can be empty, blocked or edited). */
export function readShelf(merchantId: string, today = localDateKey()): AppointmentShelf {
  const stored: unknown = readRoot()[merchantId];
  if (!stored || typeof stored !== 'object') return emptyShelf();
  const { saved, requests } = stored as Partial<Record<keyof AppointmentShelf, unknown>>;
  const shelf = emptyShelf();
  if (Array.isArray(saved)) shelf.saved = [...new Set(saved.filter((id): id is string => typeof id === 'string'))];
  if (requests && typeof requests === 'object') {
    for (const [id, value] of Object.entries(requests)) {
      const request = cleanRequest(value, today);
      if (request) shelf.requests[id] = request;
    }
  }
  return shelf;
}

/** Keeps one store's shelf on this device. Quietly does nothing when storage is unavailable. */
export function writeShelf(merchantId: string, shelf: AppointmentShelf) {
  const storage = deviceStorage();
  if (!storage) return;
  try {
    const root = readRoot();
    if (shelf.saved.length || Object.keys(shelf.requests).length) root[merchantId] = { ...shelf, updatedAt: new Date().toISOString() };
    else delete root[merchantId];
    // Bounded: only the stores this viewer touched most recently are kept.
    const kept = Object.entries(root)
      .sort(([, a], [, b]) => String(b?.updatedAt ?? '').localeCompare(String(a?.updatedAt ?? '')))
      .slice(0, MAX_STORES);
    storage.setItem(SHELF_KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    // Private windows and full storage: the page keeps working for this visit.
  }
}
