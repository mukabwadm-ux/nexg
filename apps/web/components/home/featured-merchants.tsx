import { Tag } from '@nexg/ui';
import {
  ArrowRight,
  Flower2,
  Pill,
  Shirt,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { Translate } from '@/lib/i18n/dictionaries';

import { CardRail, RAIL_CARD } from './card-rail';

/**
 * The featured merchant cards on the homepage.
 *
 * These read `public.featured_live_v` — a sold, paid slot that is live
 * this week, with an approved creative, for a merchant still visible
 * in `merchant_public`. The view decides all of that; this component
 * only draws it.
 *
 * Every row arrives with `badge = 'SPONSORED'`, which is the point: a
 * paid card cannot reach this list without the label, because the
 * label comes from the same query as the card.
 *
 * When nothing is sold — production, until the first slot goes live —
 * placeholder cards render instead, named by kind of business. A real
 * card links to that merchant; a placeholder opens Explore for its
 * kind, because there is no merchant page behind "Italian restaurant".
 */

/**
 * Every column of a view is nullable in the generated types — Postgres cannot
 * prove otherwise through a view — so the shape mirrors that and rows missing
 * the essentials are dropped rather than rendered half-empty.
 */
export interface FeaturedMerchant {
  booking_id: string | null;
  merchant_id: string | null;
  trading_name: string | null;
  merchant_category: string | null;
  city_slug: string | null;
  branch_name: string | null;
  cover_photo_path: string | null;
  /** The merchant's own line, approved by Growth before it ran. */
  blurb: string | null;
  badge: string | null;
  position: number | null;
  accepting_orders: boolean | null;
  closed_today: boolean | null;
  prep_minutes: number | null;
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
/*
 * Shown until a featured slot is sold. Each opens Explore for its kind of
 * business, so the card leads somewhere real even though the name is
 * not a merchant yet.
 */
const PLACEHOLDERS = [
  {
    name: 'Italian restaurant',
    meta: 'Fine dining · Westlands',
    cta: 'merchant.cta.menu',
    category: 'restaurant',
    image: 'restaurants',
  },
  {
    name: 'Wine & spirits shop',
    meta: 'Drinks · Parklands',
    cta: 'merchant.cta.shop',
    category: 'bar_liquor',
    image: 'drinks',
  },
  {
    name: 'Florist',
    meta: 'Flowers & gifts · Kilimani',
    cta: 'merchant.cta.shop',
    category: 'florist',
    image: 'flowers',
  },
  {
    name: 'Laundry & dry cleaning',
    meta: 'Wash, iron, press · Kilimani',
    cta: 'merchant.cta.services',
    category: 'laundry',
    image: 'laundry',
  },
] as const;

/*
 * One tall photograph card: the photo fills it, a dark fade at the foot
 * carries the words, and a glass button sits at the bottom. The whole card
 * is one link: on a phone that is the difference between a comfortable
 * target and a thin strip (ground rule 7), and one link per card is one
 * thing for a screen reader to announce.
 */
function Card({
  href,
  photo,
  icon: Icon,
  sponsored,
  minutes,
  minUnit,
  meta,
  name,
  cta,
}: {
  href: string;
  photo: string | null;
  icon: typeof UtensilsCrossed;
  sponsored: string;
  minutes: number | null;
  minUnit: string;
  meta: string;
  name: string;
  cta: string;
}) {
  /* The merchant's own preparation time, when they have set one. With none
     recorded the chip is left out rather than a guess a guest might plan
     around (ground rule 3). */
  const eta =
    minutes != null && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
  return (
    <li className={RAIL_CARD}>
      <Link
        href={href}
        className="focus-visible:ring-gold group relative flex aspect-[15/14] max-h-[25rem] flex-col justify-end overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#3B2E1B] via-[#241D13] to-[#14120E] ring-1 ring-white/[0.07] transition-shadow hover:ring-white/20 focus-visible:outline-none focus-visible:ring-2"
      >
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            sizes="(min-width: 1024px) 24vw, (min-width: 640px) 50vw, 82vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          /* No cover photograph yet: the category mark stands in rather than a
             broken image or a stock photo of someone else's shop. */
          <span
            aria-hidden="true"
            className="text-gold/40 absolute inset-0 flex items-center justify-center pb-16"
          >
            <Icon className="h-14 w-14" strokeWidth={1.5} />
          </span>
        )}
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#0b0907] via-[#0b0907]/80 via-45% to-transparent to-85%"
        />

        <span className="text-ink absolute left-4 top-4 rounded-full bg-white px-3 py-1.5 text-[0.625rem] font-extrabold uppercase tracking-[0.16em]">
          {sponsored}
        </span>
        {eta && (
          <span className="bg-gold text-ink absolute right-4 top-4 rounded-full px-3 py-1.5 text-[0.6875rem] font-bold">
            {eta} {minUnit}
          </span>
        )}

        <span className="relative block p-5 sm:p-6">
          <span className="text-gold block truncate text-[0.8125rem] font-semibold">{meta}</span>
          <span className="mt-1.5 line-clamp-2 block text-2xl font-extrabold leading-tight tracking-tight">
            {name}
          </span>
          <span className="mt-5 flex h-12 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 text-[0.9375rem] font-bold backdrop-blur transition-colors group-hover:bg-white/20">
            {cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </span>
        </span>
      </Link>
    </li>
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
    (m): m is FeaturedMerchant & { merchant_id: string; trading_name: string } =>
      Boolean(m.merchant_id) && Boolean(m.trading_name),
  );

  return (
    <CardRail
      label="featured merchants"
      heading={
        <>
          <Tag tone="goldOutline" className="px-4 py-2 uppercase tracking-[0.18em]">
            {t('home.featured.eyebrow')}
          </Tag>
          <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
            {t('home.featured.heading')}
          </h2>
        </>
      }
      actions={
        <Link
          href="/explore"
          className="focus-visible:ring-gold inline-flex h-11 items-center gap-2 rounded-full border border-white/20 px-5 text-sm font-bold transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 sm:h-12 sm:px-6"
        >
          {t('home.featured.exploreAll')}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      }
    >
      {rows.length === 0
        ? /* Nothing sold yet: each card opens Explore for its kind of business. */
          PLACEHOLDERS.map((merchant) => (
            <Card
              key={merchant.name}
              href={`/explore?category=${merchant.category}`}
              photo={`/images/categories/${merchant.image}.jpg`}
              icon={CATEGORY_ICON[merchant.category] ?? Sparkles}
              sponsored={t('merchant.sponsored')}
              minutes={null}
              minUnit={t('merchant.min')}
              meta={merchant.meta}
              name={merchant.name}
              cta={t(merchant.cta)}
            />
          ))
        : rows.map((merchant) => {
            const category = merchant.merchant_category ?? 'other';
            const where = [CATEGORY_LABEL[category] ?? 'Merchant', merchant.branch_name]
              .filter(Boolean)
              .join(' · ');
            return (
              <Card
                key={merchant.booking_id ?? merchant.merchant_id}
                /* The booking id travels so a tap can be attributed to the
                   slot that earned it, rather than guessed at later. */
                href={`/explore/${merchant.merchant_id}?src=featured&b=${merchant.booking_id ?? ''}`}
                photo={merchant.cover_photo_path}
                icon={CATEGORY_ICON[category] ?? Sparkles}
                sponsored={t('merchant.sponsored')}
                minutes={merchant.prep_minutes}
                minUnit={t('merchant.min')}
                /* The merchant's approved blurb, when there is one: it is what
                   they paid to say. */
                meta={merchant.blurb ?? where}
                name={merchant.trading_name}
                cta={t(CATEGORY_CTA[category] ?? 'merchant.cta.view')}
              />
            );
          })}
    </CardRail>
  );
}
