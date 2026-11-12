import { discoverMerchantHref } from '@/lib/discover-links';

/**
 * Best sellers: individual products from different merchants.
 *
 * The row shows real products, ranked by rpc_best_sellers
 * (supabase/migrations/20261126000100_best_sellers.sql): paid Best seller
 * slots first (labelled Sponsored), then the most sold products of the last
 * 30 days, then the ones merchants mark as popular. Each opens its own
 * product page, where it can be added to the cart and taken to checkout.
 *
 * BEST_SELLERS below is SAMPLE DATA, one per category, shown only while no
 * live merchant has a popular product. Those cards open Discovery for their
 * category, because there is no product behind them.
 *
 * Sample photos are CC0; provenance in public/images/best-sellers/CREDITS.md.
 */
export interface BestSeller {
  id: string;
  name: string;
  merchant: string;
  /** Merchant category, for "see more like this" in Discovery. */
  category: string;
  /** A sample photo in public/images/best-sellers/, without the extension. */
  image: string | null;
  /** The merchant's own photo of a real product. */
  photoUrl?: string | null;
  /** The product page of a real product. Samples have none. */
  href?: string;
  priceKes: number;
  /** Unknown for real products until checkout prices delivery. */
  deliveryKes: number | null;
  etaMin: number | null;
  etaMax: number | null;
  rating: number | null;
  /** Only a paid placement carries the Sponsored label. */
  sponsored: boolean;
}

/** A merchant's popular product, as the home page reads it. */
export interface CatalogueBestSeller {
  id: string;
  name: string;
  price_kes: number;
  photo_url: string | null;
  merchant_id: string;
  trading_name: string;
  category: string | null;
  branch_name: string | null;
  /** A paid Best seller slot, live this week. */
  sponsored: boolean;
}

export function bestSellerFromCatalogue(item: CatalogueBestSeller): BestSeller {
  return {
    id: item.id,
    name: item.name,
    merchant: [item.trading_name, item.branch_name].filter(Boolean).join(' · '),
    category: item.category ?? 'other',
    image: null,
    photoUrl: item.photo_url,
    href: productHref(item.merchant_id, item.id),
    priceKes: item.price_kes,
    deliveryKes: null,
    etaMin: null,
    etaMax: null,
    rating: null,
    sponsored: item.sponsored,
  };
}

/** Where one product of one merchant opens. */
export function productHref(merchantId: string, itemId: string): string {
  return discoverMerchantHref(merchantId, itemId);
}

export const BEST_SELLERS: BestSeller[] = [
  {
    id: 'pizza',
    name: 'Large veggie supreme pizza',
    merchant: 'Pizzeria · Westlands',
    category: 'restaurant',
    image: 'restaurant',
    priceKes: 1450,
    deliveryKes: 150,
    etaMin: 25,
    etaMax: 35,
    rating: 4.8,
    sponsored: true,
  },
  {
    id: 'avocados',
    name: 'Hass avocados, 4 pack',
    merchant: 'Green grocer · Kilimani',
    category: 'supermarket',
    image: 'groceries',
    priceKes: 320,
    deliveryKes: 120,
    etaMin: 30,
    etaMax: 45,
    rating: 4.7,
    sponsored: true,
  },
  {
    id: 'vitamin-c',
    name: 'Vitamin C 1000mg, 30 tablets',
    merchant: 'Pharmacy · CBD',
    category: 'pharmacy',
    image: 'pharmacy',
    priceKes: 850,
    deliveryKes: 100,
    etaMin: 20,
    etaMax: 30,
    rating: 4.9,
    sponsored: true,
  },
  {
    id: 'lipstick',
    name: 'Satin lipstick, Ruby red',
    merchant: 'Beauty store · Lavington',
    category: 'beauty_fashion',
    image: 'beauty',
    priceKes: 1900,
    deliveryKes: 150,
    etaMin: 35,
    etaMax: 50,
    rating: 4.6,
    sponsored: true,
  },
  {
    id: 'mojito',
    name: 'Fresh lemon mojito',
    merchant: 'Cocktail bar · Westlands',
    category: 'bar_liquor',
    image: 'drinks',
    priceKes: 750,
    deliveryKes: 150,
    etaMin: 25,
    etaMax: 40,
    rating: 4.7,
    sponsored: true,
  },
  {
    id: 'roses',
    name: 'Pink roses, dozen',
    merchant: 'Florist · Karen',
    category: 'florist',
    image: 'flowers',
    priceKes: 3200,
    deliveryKes: 200,
    etaMin: 45,
    etaMax: 60,
    rating: 4.9,
    sponsored: true,
  },
  {
    id: 'shirts',
    name: 'Shirts washed & pressed, 5',
    merchant: 'Laundry · Kilimani',
    category: 'laundry',
    image: 'laundry',
    priceKes: 1000,
    deliveryKes: 0,
    etaMin: 24 * 60,
    etaMax: 24 * 60,
    rating: 4.8,
    sponsored: true,
  },
  {
    id: 'gift-box',
    name: 'Birthday gift box',
    merchant: 'Gift shop · Sarit',
    category: 'gift_shop',
    image: 'gifts',
    priceKes: 4500,
    deliveryKes: 200,
    etaMin: 60,
    etaMax: 90,
    rating: 4.7,
    sponsored: true,
  },
  {
    id: 'jkia-transfer',
    name: 'JKIA airport transfer',
    merchant: 'Arranged by NexG Concierge',
    category: 'airport',
    image: 'airport',
    priceKes: 3500,
    deliveryKes: 0,
    etaMin: 0,
    etaMax: 0,
    rating: 4.9,
    sponsored: true,
  },
];
