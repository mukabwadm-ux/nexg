import { cn, Tag } from '@nexg/ui';
import { currentCategoryId } from '@nexg/contracts';
import { ArrowRight, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { Translate } from '@/lib/i18n/dictionaries';

import { CardRail, RAIL_CARD } from './card-rail';
import { categoryIcon, categoryLabel } from '@/components/explore/merchant-card';
import { CreativeVideo } from '@/components/promo-media/creative-video';
import { discoverCategoryHref, discoverMerchantHref } from '@/lib/discover-links';

/**
 * The featured merchant cards on the homepage.
 *
 * These read `public.featured_live_v` — a sold, paid slot that is live
 * this week, for a merchant still visible in `merchant_public`. The view
 * decides all of that; this component only draws it. A card with an
 * approved creative shows the merchant's own image or video and line; one
 * without shows their cover photo.
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
  /** The approved creative's own image or video, signed for showing. */
  media?: CardMedia | null;
}

/** A merchant's own image or video on the card, ready to show. */
export interface CardMedia {
  kind: 'image' | 'video';
  src: string;
  /** A video's still frame. */
  poster?: string | null;
}

/** Matches Explore's own cards, so the same shop reads the same everywhere. */
const CATEGORY_CTA: Record<string, string> = {
  restaurants_food: 'merchant.cta.menu',
  alcohol_beverages: 'merchant.cta.shop',
  laundry_cleaning: 'merchant.cta.services',
  flowers_gifts: 'merchant.cta.shop',
};

/** The words on a real merchant's card, worked out once for the band and the preview. */
export function featuredCardWords(
  merchant: Pick<FeaturedMerchant, 'merchant_category' | 'branch_name' | 'blurb'>,
  t: Translate,
) {
  const category = merchant.merchant_category ?? 'other';
  const where = [categoryLabel(category) ?? 'Merchant', merchant.branch_name]
    .filter(Boolean)
    .join(' · ');
  return {
    category,
    /* The merchant's approved blurb, when there is one: it is what they
       paid to say. */
    meta: merchant.blurb ?? where,
    cta: t(CATEGORY_CTA[currentCategoryId(category) ?? ''] ?? 'merchant.cta.view'),
  };
}

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
    category: 'restaurants_food',
    image: 'restaurants',
  },
  {
    name: 'Wine & spirits shop',
    meta: 'Wines & spirits · Parklands',
    cta: 'merchant.cta.shop',
    category: 'alcohol_beverages',
    image: 'drinks',
  },
  {
    name: 'Florist',
    meta: 'Flowers & gifts · Kilimani',
    cta: 'merchant.cta.shop',
    category: 'flowers_gifts',
    image: 'flowers',
  },
  {
    name: 'Laundry & dry cleaning',
    meta: 'Wash, iron, press · Kilimani',
    cta: 'merchant.cta.services',
    category: 'laundry_cleaning',
    image: 'laundry',
  },
] as const;

/*
 * One tall card: the photo, image or video fills it, a dark fade at the foot
 * carries the words, and a glass button sits at the bottom.
 *
 * The whole card is one link (ground rule 7: on a phone that is the
 * difference between a comfortable target and a thin strip): the link holds
 * the words and stretches over the card. A video's pause button sits beside
 * it, above the stretch, so the page never puts a button inside a link.
 *
 * `variant` pins the layout to the phone or desktop size, for the merchant's
 * preview, which draws both at once whatever the screen it is on. Left out,
 * the card follows the screen as usual.
 */
export function FeaturedCard({
  href,
  photo,
  media,
  icon: Icon,
  sponsored,
  minutes,
  minUnit,
  meta,
  name,
  cta,
  variant,
  reveal = true,
}: {
  /** Null draws the card without a link, as in the merchant's preview. */
  href: string | null;
  photo: string | null;
  media?: CardMedia | null;
  icon: typeof Sparkles;
  sponsored: string;
  minutes: number | null;
  minUnit: string;
  meta: string;
  name: string;
  cta: string;
  variant?: 'phone' | 'desktop';
  /** Part of the homepage's entrance animation. */
  reveal?: boolean;
}) {
  /* The merchant's own preparation time, when they have set one. With none
     recorded the chip is left out rather than a guess a guest might plan
     around (ground rule 3). */
  const eta =
    minutes != null && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null;
  const picture = media ? (media.kind === 'image' ? media.src : null) : photo;
  const video = media?.kind === 'video' ? media : null;

  const words = (
    <span
      className={cn(
        'relative block',
        variant === 'phone' ? 'p-5' : variant === 'desktop' ? 'p-6' : 'p-5 sm:p-6',
      )}
    >
      <span className="text-gold block truncate text-[0.8125rem] font-semibold">{meta}</span>
      <span className="mt-1.5 line-clamp-2 block text-2xl font-extrabold leading-tight tracking-tight">
        {name}
      </span>
      <span
        className={cn(
          'mt-5 flex h-12 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 text-[0.9375rem] font-bold backdrop-blur transition-colors group-hover:bg-white/20',
          /* Room for the video's pause button beside it. */
          video && 'mr-14',
        )}
      >
        {cta}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </span>
  );

  return (
    <li
      data-reveal-item={reveal ? '' : undefined}
      className={
        variant === 'phone'
          ? 'w-[68%] shrink-0 snap-start'
          : variant === 'desktop'
            ? 'w-[calc((100%-3rem)/4)] shrink-0 snap-start'
            : RAIL_CARD
      }
    >
      <div
        className={cn(
          'has-[a:focus-visible]:ring-gold group relative flex aspect-[15/14] flex-col justify-end overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#3B2E1B] via-[#241D13] to-[#14120E] text-white ring-1 ring-white/[0.07] transition-shadow hover:ring-white/20 has-[a:focus-visible]:ring-2',
          variant === 'phone'
            ? 'max-h-[21rem]'
            : variant === 'desktop'
              ? 'max-h-[25rem]'
              : 'max-h-[21rem] sm:max-h-[25rem]',
        )}
      >
        {video ? (
          <CreativeVideo
            src={video.src}
            poster={video.poster}
            className="transition-transform duration-500 group-hover:scale-105"
            /* Beside the card's button, in its glass style, clear of the chips
               at the top, which on a phone have no room for a third. */
            buttonClassName={cn(
              'h-12 w-12 border border-white/25 bg-white/10 hover:bg-white/20',
              variant === 'phone'
                ? 'bottom-5 right-5'
                : variant === 'desktop'
                  ? 'bottom-6 right-6'
                  : 'bottom-5 right-5 sm:bottom-6 sm:right-6',
            )}
            label={`${name} video`}
          />
        ) : picture ? (
          <Image
            src={picture}
            alt=""
            fill
            /* A merchant's own upload arrives as a signed link (or, in the
               preview, from memory), which the image optimiser cannot fetch
               or cache; it is already sized for the card. */
            unoptimized={Boolean(media)}
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
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0b0907] via-[#0b0907]/80 via-45% to-transparent to-85%"
        />

        <span className="text-ink absolute left-4 top-4 rounded-full bg-white px-3 py-1.5 text-[0.625rem] font-extrabold uppercase tracking-[0.16em]">
          {sponsored}
        </span>
        {eta && (
          <span className="bg-gold text-ink absolute right-4 top-4 rounded-full px-3 py-1.5 text-[0.6875rem] font-bold">
            {eta} {minUnit}
          </span>
        )}

        {href ? (
          <Link
            href={href}
            className="block after:absolute after:inset-0 after:rounded-[1.75rem] focus-visible:outline-none"
          >
            {words}
          </Link>
        ) : (
          words
        )}
      </div>
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
          href="/discover"
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
            <FeaturedCard
              key={merchant.name}
              href={discoverCategoryHref(merchant.category)}
              photo={`/images/categories/${merchant.image}.jpg`}
              icon={categoryIcon(merchant.category) ?? Sparkles}
              sponsored={t('merchant.sponsored')}
              minutes={null}
              minUnit={t('merchant.min')}
              meta={merchant.meta}
              name={merchant.name}
              cta={t(merchant.cta)}
            />
          ))
        : rows.map((merchant) => {
            const words = featuredCardWords(merchant, t);
            return (
              <FeaturedCard
                key={merchant.booking_id ?? merchant.merchant_id}
                /* The booking id travels so a tap can be attributed to the
                   slot that earned it, rather than guessed at later. */
                href={discoverMerchantHref(merchant.merchant_id)}
                photo={merchant.cover_photo_path}
                media={merchant.media}
                icon={categoryIcon(words.category) ?? Sparkles}
                sponsored={t('merchant.sponsored')}
                minutes={merchant.prep_minutes}
                minUnit={t('merchant.min')}
                meta={words.meta}
                name={merchant.trading_name}
                cta={words.cta}
              />
            );
          })}
    </CardRail>
  );
}
