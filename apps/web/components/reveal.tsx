'use client';

import type * as Anime from 'animejs';
import * as React from 'react';

export type RevealVariant = 'rise' | 'iris' | 'wipe' | 'focus' | 'path' | 'phone';

type State = 'static' | 'waiting' | 'playing' | 'done';

/* Everything an entrance may write inline, cleared once it has played so
   the section is back to its own styles (and its hover effects). */
const ANIMATED = ['opacity', 'transform', 'clip-path', 'filter'] as const;

/**
 * Plays a section's entrance the first time it scrolls into view, as an
 * anime.js timeline (loaded only when the first section needs it).
 *
 * The section is `static` as the server sends it, so everything shows if
 * scripts are slow or fail. Once mounted below the fold it is `waiting`
 * (its items held back by CSS), `playing` while the timeline runs and
 * `done` after. A visitor who asked for reduced motion gets no entrance and
 * nothing held back; if anime.js cannot load, the section simply shows.
 */
export function Reveal({
  variant = 'rise',
  className,
  children,
}: {
  variant?: RevealVariant;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<State>('static');

  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = element.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;

    let cancelled = false;
    setState('waiting');
    /* Fetched now, while the section is still below the fold, so its
       entrance starts the moment it is seen rather than after a download. */
    void import('animejs').catch(() => {});
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void play(element, variant, (next) => {
          if (!cancelled) setState(next);
        });
      },
      /* A quarter of the section in view, above the bottom fifth of the
         screen: it plays where the eye already is, not at the very edge. */
      { threshold: 0.25, rootMargin: '0px 0px -20% 0px' },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [variant]);

  return (
    <div ref={ref} data-reveal={variant} data-state={state} className={className}>
      {children}
    </div>
  );
}

async function play(element: HTMLElement, variant: RevealVariant, setState: (s: State) => void) {
  const items = [...element.querySelectorAll<HTMLElement>('[data-reveal-item]')].filter(
    /* Only what is drawn: the phone section is hidden on small screens. */
    (item) => item.offsetParent !== null || getComputedStyle(item).position === 'fixed',
  );
  const line = element.querySelector<HTMLElement>('[data-reveal-line]');
  const targets = line ? [...items, line] : items;
  if (targets.length === 0) {
    setState('done');
    return;
  }

  let anime: typeof Anime;
  try {
    anime = await import('animejs');
  } catch {
    setState('done');
    return;
  }

  const finish = () => {
    for (const target of targets) for (const prop of ANIMATED) target.style.removeProperty(prop);
    setState('done');
  };

  const timeline = anime.createTimeline({ onComplete: finish });
  ENTRANCES[variant]({ anime, timeline, items, line });
  /* The first frame holds every item at its start, inline; only then is the
     CSS hold lifted, so nothing flashes in between. */
  timeline.seek(0);
  setState('playing');
}

type Entrance = (input: {
  anime: typeof Anime;
  timeline: ReturnType<(typeof Anime)['createTimeline']>;
  items: HTMLElement[];
  line: HTMLElement | null;
}) => void;

/* Slow on purpose: about two seconds an item, unhurried staggers. */
const ENTRANCES: Record<RevealVariant, Entrance> = {
  /* Category circles open from their centre, one after another. */
  iris: ({ anime, timeline, items }) => {
    timeline.add(items, {
      opacity: [0, 1],
      clipPath: ['circle(0% at 50% 38%)', 'circle(75% at 50% 38%)'],
      scale: [0.82, 1],
      duration: 1900,
      ease: 'outQuart',
      delay: anime.stagger(170),
    });
  },
  /* Sponsored cards wipe up from the bottom. */
  wipe: ({ anime, timeline, items }) => {
    timeline.add(items, {
      opacity: [0, 1],
      clipPath: ['inset(100% 0% 0% 0% round 24px)', 'inset(0% 0% 0% 0% round 24px)'],
      translateY: [70, 0],
      duration: 2200,
      ease: 'outExpo',
      delay: anime.stagger(240),
    });
  },
  /* Best sellers rise into place. */
  rise: ({ anime, timeline, items }) => {
    timeline.add(items, {
      opacity: [0, 1],
      translateY: [90, 0],
      duration: 2000,
      ease: 'outQuart',
      delay: anime.stagger(170),
    });
  },
  /* Stores come into focus. */
  focus: ({ anime, timeline, items }) => {
    timeline.add(items, {
      opacity: [0, 1],
      filter: ['blur(18px)', 'blur(0px)'],
      translateY: [44, 0],
      scale: [0.93, 1],
      duration: 2200,
      ease: 'outQuart',
      delay: anime.stagger(170),
    });
  },
  /* Join: the dotted line draws across, and each circle pops as the line
     reaches it. */
  path: ({ timeline, items, line }) => {
    if (line)
      timeline.add(
        line,
        {
          opacity: [0, 1],
          clipPath: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'],
          duration: 2800,
          ease: 'inOutSine',
        },
        0,
      );
    items.forEach((item, index) => {
      timeline.add(
        item,
        {
          opacity: [0, 1],
          scale: [0.5, 1],
          translateY: [40, 0],
          duration: 1300,
          ease: 'outBack(1.5)',
        },
        250 + index * 650,
      );
    });
  },
  /* The app: the phone rises, then the live update slides in from the left
     and the M-Pesa card from the right. */
  phone: ({ timeline, items }) => {
    const phone = items.find((item) => item.dataset.revealItem === '');
    const left = items.find((item) => item.dataset.revealItem === 'left');
    const right = items.find((item) => item.dataset.revealItem === 'right');
    if (phone)
      timeline.add(
        phone,
        { opacity: [0, 1], translateY: [170, 0], duration: 2400, ease: 'outExpo' },
        0,
      );
    if (left)
      timeline.add(
        left,
        { opacity: [0, 1], translateX: [-130, 0], duration: 1800, ease: 'outQuart' },
        900,
      );
    if (right)
      timeline.add(
        right,
        { opacity: [0, 1], translateX: [130, 0], duration: 1800, ease: 'outQuart' },
        1350,
      );
  },
};
