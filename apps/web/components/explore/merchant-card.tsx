import { Button } from '@nexg/ui';
import { categoryName, currentCategoryId } from '@nexg/contracts';
import {
  Activity,
  BellRing,
  Car,
  Compass,
  Crown,
  Flower2,
  Laptop,
  Package,
  PartyPopper,
  PawPrint,
  Pill,
  Plane,
  ShieldAlert,
  Shirt,
  ShoppingCart,
  Sparkles,
  Store,
  Trophy,
  Truck,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { DeliveryRate } from '@/lib/delivery-fee';

import { DeliveryFee } from './delivery-fee';
import { discoverMerchantHref } from '@/lib/discover-links';

/** A category key as merchant rows carry it (current, legacy or retired), shown by its current name. */
export function categoryLabel(key: string | null | undefined): string | undefined {
  /* 'other' also stands in for a missing category, so it reads as itself. */
  return key === 'other' ? 'Other' : categoryName(key);
}

/** Icons for NexG's 22 categories, by current category id. */
const ICON_BY_CATEGORY: Record<string, typeof Store> = {
  restaurants_food: UtensilsCrossed,
  alcohol_beverages: Wine,
  pharmacy: Pill,
  laundry_cleaning: Shirt,
  airport_transfers: Plane,
  travel_tours: Compass,
  experiences: PartyPopper,
  adults_only: ShieldAlert,
  games_sports: Trophy,
  beauty: Sparkles,
  wellness: Activity,
  concierge_services: BellRing,
  movers_relocation: Truck,
  premium_services: Crown,
  vehicle_rentals: Car,
  fashion_apparel: Shirt,
  groceries_essentials: ShoppingCart,
  marketplace: Store,
  pets: PawPrint,
  tech_electronics: Laptop,
  flowers_gifts: Flower2,
  logistics_shipping: Package,
};

/** The icon for a category key (current, legacy or retired). */
export function categoryIcon(key: string | null | undefined): typeof Store | undefined {
  const id = currentCategoryId(key);
  return id ? ICON_BY_CATEGORY[id] : undefined;
}

export const CATEGORY_ICON_BY_NAME: Record<string, typeof Store> = {
  Activity,
  BellRing,
  Car,
  Compass,
  Crown,
  Flower2,
  Laptop,
  Package,
  PartyPopper,
  PawPrint,
  Pill,
  Plane,
  ShieldAlert,
  Shirt,
  ShoppingCart,
  Sparkles,
  Store,
  Trophy,
  Truck,
  UtensilsCrossed,
  Wine,
};

/** What the button says depends on what the business actually does (by current category id). */
const CTA: Record<string, string> = {
  restaurants_food: 'View menu',
  alcohol_beverages: 'Shop drinks',
  pharmacy: 'Shop pharmacy',
  laundry_cleaning: 'Book laundry',
  airport_transfers: 'Book transfer',
  travel_tours: 'Explore tours',
  experiences: 'Explore events',
  adults_only: 'Browse',
  games_sports: 'Play & book',
  beauty: 'View treatments',
  wellness: 'Book session',
  concierge_services: 'Request concierge',
  movers_relocation: 'Get a moving quote',
  premium_services: 'Reserve',
  vehicle_rentals: 'Reserve vehicle',
  fashion_apparel: 'Shop collection',
  groceries_essentials: 'Shop groceries',
  marketplace: 'Shop store',
  pets: 'Shop pets',
  tech_electronics: 'Shop tech',
  flowers_gifts: 'Order gifts',
  logistics_shipping: 'Send a parcel',
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
    categoryIcon(category) ?? CATEGORY_ICON_BY_NAME[merchant.category_icon_name ?? ''] ?? Store;
  const open = merchant.accepting_orders !== false;
  const placeholder = merchant.placeholder === true;
  const Wrapper = placeholder ? 'div' : Link;
  const wrapperProps = placeholder ? {} : { href: discoverMerchantHref(merchant.id) };
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
              categoryLabel(category) ??
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
            <Link href={discoverMerchantHref(merchant.id)}>
              {CTA[currentCategoryId(category) ?? ''] ?? 'View'}
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}
