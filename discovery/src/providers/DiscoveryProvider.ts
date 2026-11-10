/** Screen-facing contract. Platform and future recommendation adapters keep this shape. */
import type { components } from './engineContract/wire.generated';
export type EngineSchemas = components['schemas'];
export interface CatalogModifierOption {
  id: string;
  name: string;
  description?: string;
  image?: string;
  priceDelta: number;
  currency: string;
  isAvailable?: boolean;
}

export interface CatalogModifierGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: CatalogModifierOption[];
}

/** Facts a tour operator supplies about one trip. The demo catalogue has none yet, so pages show only what is here. */
export interface TripDetails {
  /** e.g. "3 days / 2 nights". */
  duration?: string;
  /** Where the trip goes, e.g. "Maasai Mara, Narok". Never the operator's office. */
  location?: string;
  travelStyle?: string[];
  bestTime?: string;
  highlights?: string[];
  /** One entry per day, in order. */
  itinerary?: { title: string; description?: string }[];
  included?: string[];
  excluded?: string[];
  addOns?: string[];
  /** Listed departures as yyyy-mm-dd dates. */
  departures?: { start: string; end?: string }[];
  /** Photos after `image`. */
  photos?: string[];
}

export interface CatalogItem {
  id: string;
  merchantId: string;
  merchantName?: string;
  name: string;
  description?: string;
  price?: number;
  currency?: string;
  image?: string;
  commerceMode?: string;
  isAvailable?: boolean;
  /** Optional source-provided choices; absent from the current platform catalog projection. */
  modifierGroups?: CatalogModifierGroup[];
  /** The merchant's own menu section, when the catalogue sends one. It wins over every other grouping. */
  section?: string;
  /** A section ID from CATALOG_SECTIONS_V1.json that the engine assigned. Used when `section` is absent. */
  sectionId?: string;
  /** Trip facts for tours; absent from the demo catalogue. */
  trip?: TripDetails;
  /**
   * Real orders or bookings in a recent window, from Supabase order history or the engine. It drives the
   * "Frequently ordered" / "Most booked" section. Absent until real history exists; never estimated.
   */
  orders?: number;
  /** The catalogue marks the item as recently added. Drives the "New" section. */
  isNew?: boolean;
}

export interface Merchant {
  id: string;
  name: string;
  slug?: string;
  category?: string;
  categoryId?: string;
  subcategory?: string;
  subcategoryId?: string;
  area?: string;
  address?: string;
  workflow?: string;
  /** Source facts used by the platform's supported ranking modes. */
  isFeatured?: boolean;
  rating?: number;
  ratingCount?: number;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
  priceLevel?: number;
  isOpen?: boolean;
  /** Optional platform coordinates; the current read API omits these fields. */
  latitude?: number;
  longitude?: number;
  heroImage?: string;
  logoUrl?: string;
  /** Confirmed display facts; legacy API defaults remain ranking-only fields above. */
  displayFacts?: {
    deliveryFee?: { price: number; currency: string };
    deliveryTime?: string;
    rating?: { value: number; count?: number };
    promotion?: string;
  };
  items: CatalogItem[];
  itemsCount?: EngineSchemas['Count'];
  itemsCompletion?: EngineSchemas['PublicMerchant']['itemsCompletion'];
}

export interface DiscoveryQuery {
  categoryId?: string;
  subcategoryId?: string;
  optionId?: string;
  search?: string;
  area?: string;
  openNow?: boolean;
  sort?: DiscoverySort;
  offset?: number;
  limit?: number;
  cursor?: string;
  /** Exact released collection destination, carried through history without widening. */
  engineRequest?: EngineSchemas['EngineRequest'];
  /** A copied collection URL must not discard predicates held in browser history. */
  contextRequired?: boolean;
}

/** Sort keys implemented by the existing platform API. */
export type DiscoverySort = 'recommended' | 'rating' | 'delivery' | 'price_low' | 'price_high';

interface ExactPage {
  semantics?: 'exact/v1';
  total: number;
  offset: number;
  hasMore: boolean;
  mapping: 'mapped' | 'unmapped';
}
export interface BoundedPage {
  semantics: 'bounded/v2';
  total?: never;
  hasMore?: never;
  offset: number;
  mapping: 'mapped' | 'unmapped';
  count: EngineSchemas['Count'];
  retrieval: EngineSchemas['RetrievalWindow'];
  versions: EngineSchemas['Versions'];
  applied: EngineSchemas['EnginePage']['applied'];
  status: EngineSchemas['EnginePage']['status'];
  pageCursor?: string;
  nextCursor?: string;
  previousCursor?: string;
  observations?: ResultObservation[];
}
export interface ResultObservation { token: string; ref: EngineSchemas['EngineRef']; position: number }
export interface ObservationBinding { delivery: ResultObservation; send(event: EngineSchemas['ClientEvent']): Promise<EngineSchemas['EventReceipt']> }
export type PageResult = ExactPage | BoundedPage;
export type MerchantResult = PageResult & {
  merchants: Merchant[];
};

export interface ExperienceOffering {
  merchant: Merchant;
  item: CatalogItem;
}

export type OfferingResult = PageResult & {
  offerings: ExperienceOffering[];
};

export interface DiscoveryCollection {
  id: string;
  title: string;
  /** The type the rail shows. A category's last rail ("More stores") has none; its viewAllQuery opens the category. */
  subcategoryId?: string;
  merchants: Merchant[];
  viewAllQuery?: DiscoveryQuery;
  observations?: ResultObservation[];
}

export interface CollectionResult {
  collections: DiscoveryCollection[];
  partial: boolean;
  reasonCodes?: string[];
}

export interface DiscoveryProvider {
  readonly version: string;
  readonly capabilities: {
    availabilityFilter: boolean;
    nearestSort: boolean;
    priceRangeFilter: boolean;
    transactions: boolean;
    resultSemantics?: 'exact/v1' | 'bounded/v2';
    supportedSorts?: readonly DiscoverySort[];
  };
  restart?(query: DiscoveryQuery): void;
  observe?(event: EngineSchemas['ClientEvent']): Promise<EngineSchemas['EventReceipt']>;
  getMerchants(query: DiscoveryQuery, signal?: AbortSignal): Promise<MerchantResult>;
  getExperienceOfferings(query: DiscoveryQuery, signal?: AbortSignal): Promise<OfferingResult>;
  getTourOfferings(query: DiscoveryQuery, signal?: AbortSignal): Promise<OfferingResult>;
  getCollections(categoryId: string, query?: Pick<DiscoveryQuery, 'area' | 'search' | 'sort' | 'openNow'>, signal?: AbortSignal): Promise<CollectionResult>;
  getMerchant(id: string, signal?: AbortSignal): Promise<Merchant>;
  getAreas(signal?: AbortSignal): Promise<string[]>;
}
