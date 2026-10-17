'use client';

import { useLocation } from '@nexg/location';
import { ArrowLeft, ArrowRight, Bike, Clock, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import * as React from 'react';

import type { BestSeller } from '@/lib/best-sellers';

/**
 * Best sellers: a row of products from different merchants, scrolled with
 * the arrows (or a swipe).
 *
 * A paid placement, so every card carries Sponsored. A card opens Explore
 * for its category near the visitor — the products are placeholders today
 * and have no page of their own yet.
 */
export function BestSellers({
  heading,
  seeAll,
  sponsored,
  items,
}: {
  heading: string;
  seeAll: string;
  sponsored: string;
  items: BestSeller[];
}) {
  const { place, chip } = useLocation();
  const exact = chip === 'set' || chip === 'qr' || chip === 'room';
  const row = React.useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(false);

  const hrefFor = (item: BestSeller) => {
    if (item.category === 'airport') return '/ask?need=Airport%20Transfer';
    const params = new URLSearchParams();
    if (place?.city_slug) params.set('city', place.city_slug);
    params.set('category', item.category);
    if (exact && place) params.set('near', `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`);
    return `/explore?${params.toString()}`;
  };

  /* Which arrows still have somewhere to go. */
  const update = React.useCallback(() => {
    const el = row.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);
  React.useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  /* One screenful at a time, less a card so there is overlap to read across. */
  const scrollBy = (direction: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    const card = el.querySelector('li')?.getBoundingClientRect().width ?? 300;
    el.scrollBy({ left: direction * Math.max(card, el.clientWidth - card), behavior: 'smooth' });
  };

  const arrow =
    'focus-visible:ring-gold flex h-10 w-10 items-center justify-center rounded-full border border-border-strong bg-surface text-ink transition-colors hover:border-ink disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2';

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
          {heading}
        </h2>
        <div className="flex items-center gap-3">
          <Link href="/explore" className="text-sm font-bold underline underline-offset-4">
            {seeAll}
          </Link>
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={atStart}
            aria-label="Previous products"
            className={arrow}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={atEnd}
            aria-label="Next products"
            className={arrow}
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <ul
        ref={row}
        onScroll={update}
        className="-mx-4 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-3 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <li
            key={item.id}
            className="w-[16.5rem] shrink-0 snap-start sm:w-[18rem] lg:w-[calc((100%-3rem)/4)]"
          >
            <Link
              href={hrefFor(item)}
              className="focus-visible:ring-gold border-border bg-surface shadow-card group flex h-full flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2"
            >
              <span className="relative block aspect-[4/3] overflow-hidden">
                <Image
                  src={`/images/best-sellers/${item.image}.jpg`}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 24vw, 18rem"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span className="bg-ink/80 absolute left-3 top-3 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-white backdrop-blur">
                  {sponsored}
                </span>
              </span>

              <span className="flex flex-1 items-start justify-between gap-3 p-4 pb-3">
                <span className="min-w-0">
                  <span className="block truncate text-[0.9375rem] font-extrabold">
                    {item.name}
                  </span>
                  <span className="text-muted mt-0.5 block truncate text-xs font-semibold">
                    {item.merchant}
                  </span>
                </span>
                <Eta item={item} />
              </span>

              <span className="border-border text-muted flex items-center gap-2 border-t border-dashed px-4 py-2.5 text-xs font-semibold">
                <Bike className="h-3.5 w-3.5" aria-hidden="true" />
                {item.deliveryKes === 0 ? 'Free delivery' : `KES ${item.deliveryKes}`}
                <span aria-hidden="true">·</span>
                <span className="text-ink font-extrabold">
                  KES {item.priceKes.toLocaleString('en-KE')}
                </span>
                <span aria-hidden="true">·</span>
                <Star className="text-gold h-3.5 w-3.5" fill="currentColor" aria-hidden="true" />
                {item.rating.toFixed(1)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Eta({ item }: { item: BestSeller }) {
  const text =
    item.etaMax === 0
      ? 'On booking'
      : item.etaMin >= 60 * 24
        ? 'Next day'
        : item.etaMin >= 60
          ? `${Math.round(item.etaMin / 60)}–${Math.round(item.etaMax / 60)} h`
          : `${item.etaMin}–${item.etaMax}`;
  const unit = item.etaMax > 0 && item.etaMin < 60 ? 'min' : null;
  return (
    <span className="bg-gold-soft text-gold-text flex shrink-0 flex-col items-center rounded-xl px-2.5 py-1.5 text-center leading-tight">
      {unit ? (
        <>
          <span className="text-[0.8125rem] font-extrabold">{text}</span>
          <span className="text-[0.625rem] font-bold">{unit}</span>
        </>
      ) : (
        <span className="flex items-center gap-1 text-[0.6875rem] font-extrabold">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {text}
        </span>
      )}
    </span>
  );
}
