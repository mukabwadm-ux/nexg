import { Button, VALUE_PLACEHOLDER } from '@nexg/ui';
import {
  Activity,
  BellRing,
  Car,
  Compass,
  DollarSign,
  Flower2,
  Gift,
  Heart,
  Laptop,
  Pill,
  Plane,
  ShieldAlert,
  Shirt,
  ShoppingCart,
  Sparkles,
  Store,
  Truck,
  UtensilsCrossed,
  Wine,
  Wrench,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Food',
  bar_liquor: 'Drinks',
  laundry: 'Laundry',
  florist: 'Flowers',
  beauty_fashion: 'Beauty & Fashion',
  pharmacy: 'Pharmacy',
  supermarket: 'Groceries',
  gift_shop: 'Gifts',
  other: 'Other',
  adults_only: 'Adults Only',
  airport_transfers: 'Airport Transfers',
  alcohol_beverages: 'Alcohol & Drinks',
  fashion_apparel: 'Fashion & Apparel',
  beauty: 'Beauty & Wellness',
  vehicle_rentals: 'Vehicle Rentals',
  experiences: 'Experiences',
  financial_services: 'Financial Services',
  flowers_gifts: 'Flowers & Gifts',
  restaurants_food: 'Restaurants & Food',
  groceries_essentials: 'Groceries & Essentials',
  laundry_cleaning: 'Laundry & Cleaning',
  marketplace: 'Marketplace',
  health: 'Health & Medical',
  tech_electronics: 'Tech & Electronics',
  travel_tours: 'Travel & Tours',
  vehicle_services: 'Vehicle Services',
  wellness: 'Wellness',
  concierge_services: 'App Services',
  logistics_shipping: 'Logistics & Shipping',
};

export const CATEGORY_ICON: Record<string, typeof Store> = {
  restaurant: UtensilsCrossed,
  bar_liquor: Wine,
  laundry: Shirt,
  florist: Flower2,
  beauty_fashion: Sparkles,
  pharmacy: Pill,
  supermarket: ShoppingCart,
  gift_shop: Gift,
  other: Store,
  adults_only: ShieldAlert,
  airport_transfers: Plane,
  alcohol_beverages: Wine,
  fashion_apparel: Shirt,
  beauty: Sparkles,
  vehicle_rentals: Car,
  experiences: Compass,
  financial_services: DollarSign,
  flowers_gifts: Flower2,
  restaurants_food: UtensilsCrossed,
  groceries_essentials: ShoppingCart,
  laundry_cleaning: Shirt,
  marketplace: Store,
  health: Heart,
  tech_electronics: Laptop,
  travel_tours: Compass,
  vehicle_services: Wrench,
  wellness: Activity,
  concierge_services: BellRing,
  logistics_shipping: Truck,
};

/** What the button says depends on what the business actually does. */
const CTA: Record<string, string> = {
  restaurant: 'View menu',
  bar_liquor: 'Shop',
  laundry: 'View services',
  florist: 'Shop',
  pharmacy: 'Shop',
  supermarket: 'Shop',
  beauty_fashion: 'Shop',
  gift_shop: 'Shop',
  adults_only: 'Browse',
  airport_transfers: 'Book transfer',
  alcohol_beverages: 'Shop drinks',
  fashion_apparel: 'Shop collection',
  beauty: 'View treatments',
  vehicle_rentals: 'Reserve vehicle',
  experiences: 'Explore events',
  financial_services: 'View services',
  flowers_gifts: 'Order gifts',
  restaurants_food: 'View menu',
  groceries_essentials: 'Shop groceries',
  laundry_cleaning: 'Book laundry',
  marketplace: 'Shop store',
  health: 'Book consultation',
  tech_electronics: 'Shop tech',
  travel_tours: 'Explore tours',
  vehicle_services: 'Book service',
  wellness: 'Book session',
  concierge_services: 'Request concierge',
  logistics_shipping: 'Get quote',
};

export interface ExploreMerchant {
  id: string;
  trading_name: string;
  category: string | null;
  category_other: string | null;
  cover_photo_path: string | null;
  branch_name: string | null;
  branch_address: string | null;
  city_name: string | null;
  concierge_pick: boolean | null;
  featured: boolean | null;
  accepting_orders: boolean | null;
}

/** The current merchant taxonomy, in the order the Explore category row shows it. */
export const TAXONOMY_CATEGORIES = [
  'restaurants_food',
  'groceries_essentials',
  'alcohol_beverages',
  'flowers_gifts',
  'beauty',
  'wellness',
  'health',
  'fashion_apparel',
  'tech_electronics',
  'laundry_cleaning',
  'marketplace',
  'experiences',
  'travel_tours',
  'airport_transfers',
  'vehicle_rentals',
  'vehicle_services',
  'logistics_shipping',
  'financial_services',
  'concierge_services',
  'adults_only',
] as const;

export function MerchantCard({ merchant }: { merchant: ExploreMerchant }) {
  const category = merchant.category ?? 'other';
  const Icon = CATEGORY_ICON[category] ?? Store;
  const open = merchant.accepting_orders !== false;

  return (
    <li className="border-border bg-surface shadow-card hover:shadow-raised group overflow-hidden rounded-2xl border transition-all duration-200 hover:-translate-y-0.5">
      <Link href={`/explore/${merchant.id}`} className="block">
        <div className="from-bg to-border/40 relative flex h-44 items-center justify-center overflow-hidden bg-gradient-to-br">
          <span
            className={`absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold ${
              open ? 'bg-success-bg text-success' : 'bg-danger-bg text-danger'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-success' : 'bg-danger'}`}
            />
            {open ? 'Open' : 'Closed'}
          </span>

          {merchant.concierge_pick && (
            <span className="bg-gold text-ink absolute right-3 top-3 z-10 rounded-full px-2.5 py-1 text-[0.625rem] font-extrabold uppercase tracking-wide">
              Pick
            </span>
          )}

          {merchant.cover_photo_path ? (
            <Image
              src={merchant.cover_photo_path}
              alt=""
              fill
              sizes="(min-width: 1280px) 25vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            /* No photograph yet: the category mark, not a stock image of
               somebody else's shop. */
            <Icon aria-hidden="true" className="text-muted-light/40 h-10 w-10" />
          )}

          {/*
           * Delivery time is a business number and none is recorded, so it is
           * bracketed rather than estimated (ground rule 3).
           */}
          <span className="bg-ink absolute bottom-3 right-3 z-10 rounded-lg px-2.5 py-1 text-[0.6875rem] font-bold text-white">
            {VALUE_PLACEHOLDER} min
          </span>
        </div>

        <div className="p-4">
          <p className="truncate text-[0.9375rem] font-extrabold">{merchant.trading_name}</p>
          <p className="text-muted-light mt-0.5 truncate text-xs font-semibold">
            {merchant.category_other ?? CATEGORY_LABEL[category] ?? 'Merchant'}
            {merchant.branch_name && ` Â· ${merchant.branch_name}`}
          </p>
        </div>
      </Link>

      <div className="flex items-center justify-between gap-3 px-4 pb-4">
        <span className="text-muted-light text-xs font-semibold">
          Delivery from KES {VALUE_PLACEHOLDER}
        </span>
        <Button variant="gold" size="sm" asChild>
          <Link href={`/explore/${merchant.id}`}>{CTA[category] ?? 'View'}</Link>
        </Button>
      </div>
    </li>
  );
}
