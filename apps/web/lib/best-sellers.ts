/**
 * Best sellers: individual products from different merchants.
 *
 * DUMMY DATA. These products and merchants are placeholders, one per
 * category, so the row can be designed and seen before any merchant has
 * paid to appear in it. Best sellers is a paid placement (like Featured
 * merchants): when it is sold, this list is replaced by a read of the live
 * bookings, and every card keeps the Sponsored label.
 *
 * Photos are CC0; provenance in public/images/best-sellers/CREDITS.md.
 */
export interface BestSeller {
  id: string;
  name: string;
  merchant: string;
  /** Merchant category, for "see more like this" on Explore. */
  category: string;
  image: string;
  priceKes: number;
  deliveryKes: number;
  etaMin: number;
  etaMax: number;
  rating: number;
}

export const BEST_SELLERS: BestSeller[] = [
  {
    id: 'pizza',
    name: 'Large veggie supreme pizza',
    merchant: '[Pizzeria] · Westlands',
    category: 'restaurant',
    image: 'restaurant',
    priceKes: 1450,
    deliveryKes: 150,
    etaMin: 25,
    etaMax: 35,
    rating: 4.8,
  },
  {
    id: 'avocados',
    name: 'Hass avocados, 4 pack',
    merchant: '[Green grocer] · Kilimani',
    category: 'supermarket',
    image: 'groceries',
    priceKes: 320,
    deliveryKes: 120,
    etaMin: 30,
    etaMax: 45,
    rating: 4.7,
  },
  {
    id: 'vitamin-c',
    name: 'Vitamin C 1000mg, 30 tablets',
    merchant: '[Pharmacy] · CBD',
    category: 'pharmacy',
    image: 'pharmacy',
    priceKes: 850,
    deliveryKes: 100,
    etaMin: 20,
    etaMax: 30,
    rating: 4.9,
  },
  {
    id: 'lipstick',
    name: 'Satin lipstick, Ruby red',
    merchant: '[Beauty store] · Lavington',
    category: 'beauty_fashion',
    image: 'beauty',
    priceKes: 1900,
    deliveryKes: 150,
    etaMin: 35,
    etaMax: 50,
    rating: 4.6,
  },
  {
    id: 'mojito',
    name: 'Fresh lemon mojito',
    merchant: '[Cocktail bar] · Westlands',
    category: 'bar_liquor',
    image: 'drinks',
    priceKes: 750,
    deliveryKes: 150,
    etaMin: 25,
    etaMax: 40,
    rating: 4.7,
  },
  {
    id: 'roses',
    name: 'Pink roses, dozen',
    merchant: '[Florist] · Karen',
    category: 'florist',
    image: 'flowers',
    priceKes: 3200,
    deliveryKes: 200,
    etaMin: 45,
    etaMax: 60,
    rating: 4.9,
  },
  {
    id: 'shirts',
    name: 'Shirts washed & pressed, 5',
    merchant: '[Laundry] · Kilimani',
    category: 'laundry',
    image: 'laundry',
    priceKes: 1000,
    deliveryKes: 0,
    etaMin: 24 * 60,
    etaMax: 24 * 60,
    rating: 4.8,
  },
  {
    id: 'gift-box',
    name: 'Birthday gift box',
    merchant: '[Gift shop] · Sarit',
    category: 'gift_shop',
    image: 'gifts',
    priceKes: 4500,
    deliveryKes: 200,
    etaMin: 60,
    etaMax: 90,
    rating: 4.7,
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
  },
];
