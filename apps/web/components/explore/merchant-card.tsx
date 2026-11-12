import { Button } from '@nexg/ui';
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

import type { DeliveryRate } from '@/lib/delivery-fee';

import { DeliveryFee } from './delivery-fee';

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

export const CATEGORY_ICON_BY_NAME: Record<string, typeof Store> = {
  Activity,
  BellRing,
  Car,
  Compass,
  DollarSign,
  Flower2,
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
  category_key?: string | null;
  category_label?: string;
  category_icon_name?: string;
  category_other: string | null;
  cover_photo_path: string | null;
  branch_name: string | null;
  branch_address: string | null;
  city_name: string | null;
  concierge_pick: boolean | null;
  featured: boolean | null;
  accepting_orders: boolean | null;
  /** The branch's pin, to price delivery from the visitor's spot. */
  branch_latitude?: number | null;
  branch_longitude?: number | null;
  /** Minutes the merchant takes to prepare an order, when they have set it. */
  prep_minutes?: number | null;
  /** A stand-in shown until real merchants go live; not linkable. */
  placeholder?: boolean;
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

/** "[Westlands Kitchen]" -> "Westlands Kitchen": some names were entered in brackets. */
const unbracket = (text: string) => text.replace(/[[\]]/g, '').trim() || text;

export function MerchantCard({
  merchant,
  deliveryRate = null,
}: {
  merchant: ExploreMerchant;
  /** The city's delivery rate card (rpc_delivery_rate); null hides the price. */
  deliveryRate?: DeliveryRate | null;
}) {
  const category = merchant.category_key ?? merchant.category ?? 'other';
  const Icon =
    CATEGORY_ICON[category] ?? CATEGORY_ICON_BY_NAME[merchant.category_icon_name ?? ''] ?? Store;
  const open = merchant.accepting_orders !== false;
  const placeholder = merchant.placeholder === true;
  const Wrapper = placeholder ? 'div' : Link;
  const wrapperProps = placeholder ? {} : { href: `/explore/${merchant.id}` };
  const prepMinutes =
    merchant.prep_minutes != null && merchant.prep_minutes > 0
      ? Math.round(merchant.prep_minutes)
      : null;

  return (
    <li className="text-ink bg-surface group flex flex-col overflow-hidden rounded-3xl shadow-[0_20px_40px_-24px_rgba(0,0,0,0.6)] transition-all duration-200 hover:-translate-y-0.5">
      <Wrapper {...(wrapperProps as { href: string })} className="block">
        <div className="bg-[radial-gradient(circle_at_50%_50%,rgba(253, 209, 40,0.32),transparent_55%)] relative flex h-52 items-center justify-center overflow-hidden bg-[#F1ECE1]">
          <span
            className={`absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow-sm ${
              open ? 'text-success' : 'text-danger'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${open ? 'bg-success' : 'bg-danger'}`}
            />
            {placeholder ? 'Coming soon' : open ? 'Open' : 'Closed'}
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
            <Icon aria-hidden="true" className="text-gold-text h-14 w-14" strokeWidth={1.75} />
          )}

          {/*
           * The merchant's own preparation time. Not every merchant sets one
           * (services and businesses that do not prepare orders), and then
           * there is no badge rather than a guess (ground rule 3).
           */}
          {prepMinutes && (
            <span
              className="bg-ink absolute bottom-4 right-4 z-10 rounded-full px-3.5 py-1.5 text-xs font-bold text-white"
              title="Preparation time set by the merchant"
            >
              {prepMinutes} min
            </span>
          )}
        </div>

        <div className="px-6 pb-2 pt-6">
          <p className="truncate text-xl font-extrabold tracking-tight">
            {unbracket(merchant.trading_name)}
          </p>
          <p className="text-muted mt-1.5 truncate text-sm">
            {merchant.category_other ??
              merchant.category_label ??
              CATEGORY_LABEL[category] ??
              category}
            {merchant.branch_name && ` · ${unbracket(merchant.branch_name)}`}
          </p>
        </div>
      </Wrapper>

      <div className="mt-auto flex items-center justify-between gap-3 px-6 pb-6 pt-4">
        {placeholder ? (
          <span />
        ) : (
          <DeliveryFee
            rate={deliveryRate}
            lat={merchant.branch_latitude ?? null}
            lng={merchant.branch_longitude ?? null}
          />
        )}
        {placeholder ? (
          <Button
            variant="gold"
            disabled
            className="h-11 rounded-full px-5 text-[0.9375rem] font-bold"
          >
            Coming soon
          </Button>
        ) : (
          <Button
            variant="gold"
            asChild
            className="h-11 shrink-0 rounded-full px-5 text-[0.9375rem] font-bold"
          >
            <Link href={`/explore/${merchant.id}`}>{CTA[category] ?? 'View'}</Link>
          </Button>
        )}
      </div>
    </li>
  );
}
