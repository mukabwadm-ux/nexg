'use client';

import { cn } from '@nexg/ui';
import * as React from 'react';

/**
 * The animated category word in the hero (spec section 4.1).
 *
 * Three things this has to get right beyond the animation itself:
 *
 *   No layout shift (ground rule 7). Every word is stacked in the same grid
 *   cell, so the box is always as wide and tall as the longest one and the
 *   line below never moves.
 *
 *   One accessible name. The <h1> is labelled "Everything at your Doorstep"
 *   and the rotating words are hidden from assistive technology — a heading
 *   whose text changes every two seconds is unusable with a screen reader,
 *   and a live region here would announce the same sentence endlessly.
 *
 *   Motion is optional. prefers-reduced-motion stops the rotation and leaves
 *   the first word, rather than merely speeding the transition up.
 */

export const ROTATING_WORDS = [
  'Everything',
  'Flowers',
  'Laundry',
  'Food and drinks',
  'Pharmaceutical Products',
] as const;

const INTERVAL_MS = 2200;

/**
 * Long phrases step down a size so they stay on one line. "Pharmaceutical
 * Products" is more than twice the width of "Everything"; at the hero size it
 * would wrap and make the whole heading a line taller.
 */
function sizeFor(word: string): string {
  if (word.length > 16) return 'text-3xl sm:text-4xl lg:text-5xl';
  if (word.length > 10) return 'text-4xl sm:text-5xl lg:text-6xl';
  return 'text-5xl sm:text-6xl lg:text-7xl';
}

export function RotatingWord({ words = ROTATING_WORDS }: { words?: readonly string[] }) {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % words.length);
    }, INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [words.length]);

  return (
    <span aria-hidden="true" className="grid">
      {words.map((word, position) => (
        <span
          key={word}
          className={cn(
            // Same cell for every word: the box never resizes.
            'text-gold col-start-1 row-start-1 flex items-end whitespace-nowrap transition-opacity duration-500',
            sizeFor(word),
            position === index ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
