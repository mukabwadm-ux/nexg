'use client';

import { cn } from '@nexg/ui';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

type DeliveryZone = {
  id: string;
  city_id: string;
  name: string;
  citySlug: string;
};

const PER_PAGE = 5;

const PLACEHOLDER_BACKGROUNDS = [
  'linear-gradient(150deg, #C79A3A, #4A3A17)',
  'linear-gradient(150deg, #8C7A55, #2A241A)',
  'linear-gradient(150deg, #B98C4A, #3B2F1C)',
  'linear-gradient(150deg, #6F6A5C, #23211C)',
  'linear-gradient(150deg, #D4A72C, #5A4212)',
] as const;

function ZoneCard({
  zone,
  position,
  className,
}: {
  zone: DeliveryZone;
  position: number;
  className: string;
}) {
  return (
    <li className={className}>
      <Link
        href={`/explore?city=${encodeURIComponent(zone.citySlug)}&zone=${encodeURIComponent(zone.id)}`}
        aria-label={`Explore merchants in ${zone.name}`}
        className="focus-visible:ring-gold group flex flex-col items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4"
      >
        <span
          aria-hidden="true"
          className="ring-gold/70 relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full ring-4 sm:h-36 sm:w-36 lg:h-[10.5rem] lg:w-[10.5rem]"
          style={{
            background: PLACEHOLDER_BACKGROUNDS[position % PLACEHOLDER_BACKGROUNDS.length],
          }}
        >
          <span className="absolute inset-2 rounded-full border border-white/15" />
          <span className="text-2xl font-black tracking-[0.18em] text-white/55 sm:text-3xl">
            {zone.name.slice(0, 3).toUpperCase()}
          </span>
          <ArrowUpRight
            aria-hidden="true"
            className="absolute right-4 top-4 h-4 w-4 text-white/65 opacity-0 transition-opacity group-hover:opacity-100"
          />
        </span>

        <span className="border-border bg-surface shadow-card group-hover:border-gold relative z-10 -mt-4 flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-bold transition-colors">
          {zone.name}
          <ArrowUpRight aria-hidden="true" className="text-gold h-3.5 w-3.5" />
        </span>
      </Link>
      <span className="text-muted-light mt-1.5 text-[0.625rem] font-semibold uppercase tracking-wide">
        Temporary image
      </span>
    </li>
  );
}

export function DeliveryZones({ zones }: { zones: DeliveryZone[] }) {
  const [page, setPage] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(zones.length / PER_PAGE));
  const start = page * PER_PAGE;
  const shown = zones.slice(start, start + PER_PAGE);
  const go = (next: number) => setPage((next + pageCount) % pageCount);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.375rem]">
            Find merchants near you
          </h2>
          <p className="text-muted mt-2 max-w-md text-[0.9375rem] font-semibold leading-[1.7]">
            Explore the neighbourhoods we deliver to. Choose a zone to see local merchants.
          </p>
        </div>

        <div className="hidden items-center gap-3 sm:flex">
          <p className="text-muted-light text-sm font-semibold">
            {zones.length === 0 ? 0 : start + 1}–{start + shown.length} of {zones.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(page - 1)}
              aria-label="Previous delivery zones"
              disabled={pageCount === 1}
              className="border-border-strong bg-surface text-ink hover:bg-bg focus-visible:ring-gold flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(page + 1)}
              aria-label="More delivery zones"
              disabled={pageCount === 1}
              className="bg-ink hover:bg-ink/90 focus-visible:ring-gold flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* A swipeable row on a phone, like Best sellers; paged from tablet up. */}
      <ul className="-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-3 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
        {zones.map((zone, index) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            position={index}
            className="flex w-40 shrink-0 snap-start flex-col items-center"
          />
        ))}
      </ul>

      <ul className="mt-8 hidden grid-cols-3 gap-x-4 gap-y-6 sm:grid lg:grid-cols-5">
        {shown.map((zone, index) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            position={start + index}
            className="flex flex-col items-center"
          />
        ))}
      </ul>

      {pageCount > 1 && (
        <div className="mt-8 hidden justify-center gap-1.5 sm:flex">
          {Array.from({ length: pageCount }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setPage(index)}
              aria-label={`Show delivery zones ${index * PER_PAGE + 1} onwards`}
              aria-current={index === page}
              className={cn(
                'focus-visible:ring-gold h-1.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2',
                index === page ? 'bg-gold w-6' : 'bg-border-strong hover:bg-muted-light w-1.5',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
