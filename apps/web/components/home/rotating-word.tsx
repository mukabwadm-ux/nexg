'use client';

import * as React from 'react';

/**
 * The animated category word in the hero (spec section 4.1).
 *
 * It types a word out, holds it, deletes it, and moves on. Four constraints
 * shape the implementation:
 *
 *   No layout shift (ground rule 7). Every word is rendered invisibly in the
 *   same grid cell, so the box is always sized to the longest one and the
 *   line below never moves — including mid-keystroke, when the visible text
 *   is only part of a word.
 *
 *   One accessible name. The <h1> is labelled "Everything at your Doorstep"
 *   and this is hidden from assistive technology. A heading that retypes
 *   itself is unusable with a screen reader.
 *
 *   Motion is optional. prefers-reduced-motion shows the first word, typed
 *   in full, and stops.
 *
 *   One size for every word. At the artboard's 1440 the hero column is 752px
 *   and "Pharmaceutical Products" measures 858px at 72px type — so the hero
 *   sits at 60px, where the longest phrase fits on one line. Below that the
 *   column narrows and the longest phrase wraps; the reserved box absorbs it.
 */

export const ROTATING_WORDS = [
  'Everything',
  'Flowers',
  'Laundry',
  'Food and drinks',
  'Pharmaceutical Products',
] as const;

/** Milliseconds. Slower than a plain fade, because the typing carries the eye. */
const TYPE_MS = 70;
const DELETE_MS = 38;
const HOLD_MS = 2400;
const PAUSE_BEFORE_NEXT_MS = 420;

type Phase = 'typing' | 'holding' | 'deleting';

export function RotatingWord({ words = ROTATING_WORDS }: { words?: readonly string[] }) {
  const [index, setIndex] = React.useState(0);
  const [count, setCount] = React.useState(words[0]?.length ?? 0);
  const [phase, setPhase] = React.useState<Phase>('holding');
  const [animate, setAnimate] = React.useState(false);

  // Server and first client render agree on the full first word, so the hero
  // never flashes empty before hydration.
  React.useEffect(() => {
    setAnimate(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  /*
   * The phase is explicit rather than inferred from the text. Deriving it —
   * "does the word still start with what is typed?" — is true again the
   * moment one character is deleted, so the effect immediately retypes it and
   * the animation oscillates between two strings forever.
   */
  React.useEffect(() => {
    if (!animate) return;

    const word = words[index] ?? '';
    let timer: number;

    if (phase === 'typing') {
      timer = window.setTimeout(
        () => (count >= word.length ? setPhase('holding') : setCount(count + 1)),
        TYPE_MS,
      );
    } else if (phase === 'holding') {
      timer = window.setTimeout(() => setPhase('deleting'), HOLD_MS);
    } else if (count > 0) {
      timer = window.setTimeout(() => setCount(count - 1), DELETE_MS);
    } else {
      timer = window.setTimeout(() => {
        setIndex((current) => (current + 1) % words.length);
        setPhase('typing');
      }, PAUSE_BEFORE_NEXT_MS);
    }

    return () => window.clearTimeout(timer);
  }, [count, phase, index, animate, words]);

  const typed = (words[index] ?? '').slice(0, count);

  return (
    <span aria-hidden="true" className="grid">
      {/*
        Invisible, but they still take up space: the cell is as wide and tall
        as the longest word, so typing never resizes the heading.
      */}
      {words.map((word) => (
        <span key={word} className="invisible col-start-1 row-start-1">
          {word}
        </span>
      ))}

      <span className="text-gold col-start-1 row-start-1">
        {typed}
        {animate && (
          <span className="bg-gold ml-1 inline-block h-[0.8em] w-[0.06em] animate-pulse align-baseline" />
        )}
      </span>
    </span>
  );
}
