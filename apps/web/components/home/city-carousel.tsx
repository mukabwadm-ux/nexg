'use client';

import { cn } from '@nexg/ui';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import * as React from 'react';

export interface City {
  id: string;
  name: string;
  slug: string;
  status: string;
}

const PER_PAGE = 5;

/**
 * "Cities where we deliver" from the `BookingFirst` artboard: circular city
 * portraits with a gold ring, paged five at a time, with the counter, arrows
 * and dots the design shows.
 *
 * The portraits are a brand duotone rather than a photograph. Real city
 * photography is content the founder supplies; a gradient is stable per city
 * and never pretends to be a photo of somewhere it is not.
 */
export function CityCarousel({ cities }: { cities: City[] }) {
  const [page, setPage] = React.useState(0);
  const pageCount = Math.max(1, Math.ceil(cities.length / PER_PAGE));
  const start = page * PER_PAGE;
  const shown = cities.slice(start, start + PER_PAGE);

  const go = (next: number) => setPage((next + pageCount) % pageCount);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Cities where we deliver
          </h2>
          <p className="text-muted mt-2 max-w-md text-sm leading-relaxed">
            {spellOut(cities.length)} cities across East Africa, one concierge. The same account and
            the same standard wherever you land.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-muted-light text-sm">
            {start + 1}–{start + shown.length} of {cities.length}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => go(page - 1)}
              aria-label="Previous cities"
              disabled={pageCount === 1}
              className="border-border-strong bg-surface text-ink hover:bg-bg focus-visible:ring-gold flex h-9 w-9 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(page + 1)}
              aria-label="More cities"
              disabled={pageCount === 1}
              className="bg-ink hover:bg-ink/90 focus-visible:ring-gold flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
        {shown.map((city) => (
          <li key={city.id} className="flex flex-col items-center">
            <span
              aria-hidden="true"
              className="ring-gold/70 relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full ring-4 sm:h-28 sm:w-28"
              style={{ background: portraitFor(city.slug) }}
            >
              <span className="text-[0.5rem] font-bold uppercase tracking-[0.2em] text-white/60">
                {city.name.slice(0, 3)}
              </span>
            </span>

            <span className="border-border bg-surface shadow-card -mt-3.5 rounded-full border px-3.5 py-1.5 text-sm font-bold">
              {city.name}
            </span>

            {city.status !== 'live' && (
              <span
                className={cn(
                  'mt-1.5 text-[0.625rem] font-bold uppercase tracking-wide',
                  city.status === 'soft_launch' ? 'text-warning' : 'text-muted-light',
                )}
              >
                {city.status === 'soft_launch' ? 'Soft launch' : 'Waitlist'}
              </span>
            )}
          </li>
        ))}
      </ul>

      {pageCount > 1 && (
        <div className="mt-8 flex justify-center gap-1.5">
          {Array.from({ length: pageCount }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setPage(index)}
              aria-label={`Show cities ${index * PER_PAGE + 1} onwards`}
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

/**
 * A stable duotone per city, drawn from the brand palette rather than a free
 * hue: an arbitrary hash produced purples and teals that fight the gold and
 * cream everywhere else on the page.
 */
const PORTRAITS = [
  'linear-gradient(150deg, #C79A3A, #4A3A17)',
  'linear-gradient(150deg, #8C7A55, #2A241A)',
  'linear-gradient(150deg, #B98C4A, #3B2F1C)',
  'linear-gradient(150deg, #6F6A5C, #23211C)',
  'linear-gradient(150deg, #D4A72C, #5A4212)',
] as const;

function portraitFor(slug: string): string {
  let hash = 0;
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) % 997;
  return PORTRAITS[hash % PORTRAITS.length]!;
}

function spellOut(count: number): string {
  const words = [
    'No',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
  ];
  return words[count] ?? String(count);
}
