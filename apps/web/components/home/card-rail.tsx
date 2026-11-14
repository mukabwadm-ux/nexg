'use client';

import { cn } from '@nexg/ui';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import * as React from 'react';

/**
 * A row of cards that slides sideways, with the heading on the left and
 * previous / next arrows (plus any extra action) on the right. A phone swipes
 * it; the arrows move it about one screen at a time and dim at either end.
 *
 * The cards are passed in as <li> children, so they can be drawn on the
 * server.
 */
export function CardRail({
  heading,
  actions,
  label,
  className,
  listClassName,
  children,
}: {
  heading: React.ReactNode;
  /** Beside the arrows, e.g. "Explore all merchants". */
  actions?: React.ReactNode;
  /** What the row holds, for the arrows' names ("featured merchants"). */
  label: string;
  className?: string;
  listClassName?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLUListElement>(null);
  const [edge, setEdge] = React.useState({ start: true, end: false });

  const update = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  React.useEffect(() => {
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [update]);

  const go = (direction: 1 | -1) =>
    ref.current?.scrollBy({ left: direction * ref.current.clientWidth * 0.9, behavior: 'smooth' });

  const arrow =
    'focus-visible:ring-gold flex h-11 w-11 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-default disabled:opacity-35';

  return (
    <div className={className}>
      <div data-reveal-head className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">{heading}</div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden gap-2 sm:flex">
            <button
              type="button"
              onClick={() => go(-1)}
              disabled={edge.start}
              aria-label={`Previous ${label}`}
              className={cn(arrow, 'border-white/20 text-white hover:enabled:bg-white/10')}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              disabled={edge.end}
              aria-label={`More ${label}`}
              className={cn(
                arrow,
                'bg-gold text-ink hover:enabled:bg-gold/90 border-transparent disabled:border-white/20 disabled:bg-transparent disabled:text-white',
              )}
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          {actions}
        </div>
      </div>

      <ul
        ref={ref}
        onScroll={update}
        className={cn(
          '-mx-4 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden',
          listClassName,
        )}
      >
        {children}
      </ul>
    </div>
  );
}

/** Card widths for the rail: most of a phone, two across on a tablet, four on desktop. */
export const RAIL_CARD =
  'w-[82%] shrink-0 snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-3rem)/4)]';
