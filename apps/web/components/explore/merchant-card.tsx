import { Button, VALUE_PLACEHOLDER } from '@nexg/ui';
import {
  Flower2,
  Gift,
  Pill,
  Shirt,
  ShoppingCart,
  Sparkles,
  Store,
  UtensilsCrossed,
  Wine,
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

export function MerchantCard({ merchant }: { merchant: ExploreMerchant }) {
  const category = merchant.category ?? 'other';
  const Icon = CATEGORY_ICON[category] ?? Store;
  const open = merchant.accepting_orders !== false;

  return (
    <li className="border-border bg-surface shadow-card hover:shadow-raised overflow-hidden rounded-2xl border transition-shadow">
      <Link href={`/explore/${merchant.id}`} className="block">
        <div className="bg-bg relative flex h-40 items-center justify-center">
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
              className="object-cover"
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
            {merchant.branch_name && ` · ${merchant.branch_name}`}
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
