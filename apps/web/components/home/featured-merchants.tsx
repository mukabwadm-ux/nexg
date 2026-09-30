import { Tag, VALUE_PLACEHOLDER } from '@nexg/ui';
import { Flower2, Pill, Shirt, ShoppingCart, Sparkles, UtensilsCrossed, Wine } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { Translate } from '@/lib/i18n/dictionaries';

/**
 * The featured merchant cards on the homepage (spec section 4.1).
 *
 * These read `public.merchant_public`, which is the only merchant data anon
 * can see and which cannot return a merchant that is not live (ground rule 5).
 * When nothing is featured — as in production until real slots are sold — the
 * designed placeholder cards render instead, bracketed as the artboard draws
 * them.
 *
 * A real card is a link to that merchant's page; a placeholder is not,
 * because there is no page behind `[Italian restaurant]` and a card that
 * looks pressable and 404s is worse than one that plainly is not.
 */

/**
 * Every column of a view is nullable in the generated types — Postgres cannot
 * prove otherwise through a view — so the shape mirrors that and rows missing
 * the essentials are dropped rather than rendered half-empty.
 */
export interface FeaturedMerchant {
  id: string | null;
  trading_name: string | null;
  category: string | null;
  city_name: string | null;
  branch_name: string | null;
  cover_photo_path: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  restaurant: 'Restaurant',
  bar_liquor: 'Drinks',
  laundry: 'Laundry',
  florist: 'Flowers & gifts',
  beauty_fashion: 'Beauty & fashion',
  pharmacy: 'Pharmacy',
  supermarket: 'Supermarket',
  gift_shop: 'Gift shop',
  other: 'Other',
};

const CATEGORY_ICON: Record<string, typeof UtensilsCrossed> = {
  restaurant: UtensilsCrossed,
  bar_liquor: Wine,
  laundry: Shirt,
  florist: Flower2,
  beauty_fashion: Sparkles,
  pharmacy: Pill,
  supermarket: ShoppingCart,
  gift_shop: Sparkles,
  other: Sparkles,
};

/** Matches Explore's own cards, so the same shop reads the same everywhere. */
const CATEGORY_CTA: Record<string, string> = {
  restaurant: 'merchant.cta.menu',
  bar_liquor: 'merchant.cta.shop',
  laundry: 'merchant.cta.services',
  florist: 'merchant.cta.shop',
};

/** The cards the artboard draws for an empty homepage. */
const PLACEHOLDERS = [
  { name: '[Italian restaurant]', meta: 'Fine dining · Westlands', cta: 'merchant.cta.menu' },
  { name: '[Wine & spirits shop]', meta: 'Drinks · Parklands', cta: 'merchant.cta.shop' },
  { name: '[Florist]', meta: 'Flowers & gifts · Kilimani', cta: 'merchant.cta.shop' },
  {
    name: '[Laundry & dry cleaning]',
    meta: 'Wash, iron, press · Kilimani',
    cta: 'merchant.cta.services',
  },
] as const;

const COVER_FALLBACK = 'bg-gradient-to-br from-[#3B2E1B] via-[#241D13] to-[#14120E]';

function Cover({ children }: { children: React.ReactNode }) {
  return (
    <div className={`relative flex h-36 items-center justify-center ${COVER_FALLBACK}`}>
      {children}
    </div>
  );
}

function Sponsored({ label }: { label: string }) {
  return (
    <span className="absolute left-2 top-2 z-10">
      <Tag tone="sponsored" size="sm" className="uppercase tracking-wide">
        {label}
      </Tag>
    </span>
  );
}

/*
 * Delivery time is a business number and none is recorded — there is no prep
 * or delivery data in the schema yet — so it renders as [—] rather than an
 * estimate a guest might plan around (ground rule 3).
 */
function Eta({ unit }: { unit: string }) {
  return (
    <span className="bg-gold text-ink absolute bottom-2 right-2 z-10 rounded-full px-2 py-0.5 text-[0.625rem] font-bold">
      {VALUE_PLACEHOLDER} {unit}
    </span>
  );
}

export function FeaturedMerchants({
  merchants,
  t,
}: {
  merchants: FeaturedMerchant[];
  t: Translate;
}) {
  const rows = merchants.filter(
    (m): m is FeaturedMerchant & { id: string; trading_name: string } =>
      Boolean(m.id) && Boolean(m.trading_name),
  );

  if (rows.length === 0) {
    return (
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PLACEHOLDERS.map((merchant) => (
          <li
            key={merchant.name}
            className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#17140F]"
          >
            <Cover>
              <Sponsored label={t('merchant.sponsored')} />
              <span className="text-[0.625rem] uppercase tracking-widest text-white/35">
                [Cover photo]
              </span>
              <Eta unit={t('merchant.min')} />
            </Cover>
            <div className="p-3">
              <p className="truncate text-sm font-bold">{merchant.name}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-white/50">{merchant.meta}</p>
              {/*
               * Not a link and not a button. There is no shop behind a
               * bracketed name, so this is the shape of a call to action
               * and not one — hidden from assistive technology, which
               * would otherwise announce a control that does nothing.
               */}
              <span
                aria-hidden="true"
                className="bg-gold/60 text-ink/70 mt-3 block rounded-md py-1.5 text-center text-xs font-bold"
              >
                {t(merchant.cta)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((merchant) => {
        const category = merchant.category ?? 'other';
        const Icon = CATEGORY_ICON[category] ?? Sparkles;
        const label = CATEGORY_LABEL[category] ?? 'Merchant';
        const where = [label, merchant.branch_name ?? merchant.city_name]
          .filter(Boolean)
          .join(' · ');

        return (
          <li
            key={merchant.id}
            className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#17140F] transition-colors hover:border-white/20"
          >
            {/*
             * The whole card, not just the button at the bottom. On a
             * phone that is the difference between a comfortable target
             * and a 30-pixel strip (ground rule 7), and one link per card
             * is also one thing for a screen reader to announce rather
             * than three that all go to the same place.
             */}
            <Link
              href={`/explore/${merchant.id}`}
              className="focus-visible:ring-gold block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset"
            >
              <Cover>
                <Sponsored label={t('merchant.sponsored')} />
                {merchant.cover_photo_path ? (
                  <Image
                    src={merchant.cover_photo_path}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                ) : (
                  /* No cover photograph yet: the category mark stands in rather
                     than a broken image or a stock photo of someone else's shop. */
                  <span aria-hidden="true" className="text-gold/45">
                    <Icon className="h-10 w-10" />
                  </span>
                )}
                <Eta unit={t('merchant.min')} />
              </Cover>
              <div className="p-3">
                <p className="truncate text-sm font-bold">{merchant.trading_name}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-white/50">{where}</p>
                <span className="bg-gold text-ink mt-3 block rounded-md py-1.5 text-center text-xs font-bold">
                  {t(CATEGORY_CTA[category] ?? 'merchant.cta.view')}
                </span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
