'use client';

import { useLocation } from '@nexg/location';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

/**
 * Popular categories: photo tiles that open Explore for one category,
 * narrowed to the merchants that deliver to where the visitor is.
 *
 * "Near you" is the visitor's pinned spot when there is one (passed as
 * `near=lat,lng`, which Explore turns into a delivery-distance filter);
 * otherwise their city, so a tile never opens the wrong city's listing.
 * A guess from the connection is not a spot, so it only sets the city.
 */

export interface PopularCategory {
  key: string;
  label: string;
  image: string;
  imageUrl?: string | null;
  /** A merchant category for Explore, or a fixed destination. */
  category?: string;
  href?: string;
}

export function PopularCategories({
  heading,
  sub,
  allLabel,
  items,
  layout = 'row',
}: {
  heading: string;
  sub: string;
  /** The "All categories" link; left out on the all-categories page itself. */
  allLabel?: string;
  items: PopularCategory[];
  /** One scrolling row (homepage) or a wrapping grid (/categories). */
  layout?: 'row' | 'grid';
}) {
  const { place, chip } = useLocation();
  const exact = chip === 'set' || chip === 'qr' || chip === 'room';
  const city = place?.city_slug ?? null;

  const hrefFor = (item: PopularCategory) => {
    if (item.href) return item.href;
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (item.category) params.set('category', item.category);
    if (exact && place) params.set('near', `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`);
    return `/explore?${params.toString()}`;
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
            {heading}
          </h2>
          <p className="text-muted mt-2 text-sm font-semibold">{sub}</p>
        </div>
        {allLabel && (
          <Link
            href="/categories"
            className="hover:text-gold-text inline-flex items-center gap-1.5 text-sm font-bold underline underline-offset-4 transition-colors"
          >
            {allLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>

      {/* Row: scrolls sideways on a phone, nine across on desktop. Grid: wraps. */}
      <ul
        className={
          layout === 'row'
            ? '-mx-4 mt-8 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:-mx-8 sm:gap-4 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-9 lg:overflow-visible lg:px-0 [&::-webkit-scrollbar]:hidden'
            : 'mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-6'
        }
      >
        {items.map((item) => (
          <li
            key={item.key}
            className={layout === 'row' ? 'w-[6.75rem] shrink-0 sm:w-32 lg:w-auto' : undefined}
          >
            <Link
              href={hrefFor(item)}
              className="focus-visible:ring-gold group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <span className="shadow-card bg-surface relative block aspect-square overflow-hidden rounded-2xl">
                <Image
                  src={item.imageUrl || `/images/categories/${item.image}.jpg`}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 10vw, 8rem"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  unoptimized={!!item.imageUrl}
                />
              </span>
              <span className="mt-2.5 block text-center text-[0.8125rem] font-bold leading-tight">
                {item.label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
