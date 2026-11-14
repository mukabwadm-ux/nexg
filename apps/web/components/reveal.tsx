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

/* Real interface timing: under a second an item, short staggers, and the
   ease-out-expo curve unless a section needs its own. */
const EXPO = [0.16, 1, 0.3, 1] as const;

const ENTRANCES: Record<RevealVariant, Entrance> = {
  /* Categories: a spring settle, a touch past full size and back. */
  iris: ({ anime, timeline, items }) => {
    timeline.add(items, {
      keyframes: {
        '0%': { opacity: 0, scale: 0.9 },
        '60%': { opacity: 1, scale: 1.02 },
        '82%': { scale: 0.995 },
        '100%': { scale: 1 },
      },
      duration: 900,
      ease: 'outQuad',
      delay: anime.stagger(60),
    });
  },
  /* Sponsored: a curtain lifts off each card, bottom edge first. */
  wipe: ({ anime, timeline, items }) => {
    timeline.add(items, {
      clipPath: ['inset(100% 0% 0% 0% round 24px)', 'inset(0% 0% 0% 0% round 24px)'],
      duration: 900,
      ease: anime.cubicBezier(0.65, 0, 0.35, 1),
      delay: anime.stagger(110),
    });
  },
  /* Best sellers: a soft rise. */
  rise: ({ anime, timeline, items }) => {
    timeline.add(items, {
      opacity: [0, 1],
      translateY: [16, 0],
      duration: 800,
      ease: anime.cubicBezier(...EXPO),
      delay: anime.stagger(70),
    });
  },
  /* Stores: a focus pull. */
  focus: ({ anime, timeline, items }) => {
    timeline.add(items, {
      opacity: [0, 1],
      filter: ['blur(10px)', 'blur(0px)'],
      scale: [1.03, 1],
      duration: 900,
      ease: anime.cubicBezier(...EXPO),
      delay: anime.stagger(90),
    });
  },
  /* Join: the steps slide in left to right as the dotted line draws. */
  path: ({ anime, timeline, items, line }) => {
    if (line)
      timeline.add(
        line,
        {
          opacity: [0, 1],
          clipPath: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'],
          duration: 750 + 120 * Math.max(items.length - 1, 0),
          ease: anime.cubicBezier(...EXPO),
        },
        0,
      );
    timeline.add(
      items,
      {
        opacity: [0, 1],
        translateX: [-28, 0],
        duration: 750,
        ease: anime.cubicBezier(...EXPO),
        delay: anime.stagger(120),
      },
      0,
    );
  },
  /* The app: a depth tilt (the perspective is set on the parent), phone
     first, then the cards beside it. */
  phone: ({ anime, timeline, items }) => {
    const ordered = ['', 'left', 'right']
      .map((key) => items.find((item) => item.dataset.revealItem === key))
      .filter((item): item is HTMLElement => Boolean(item));
    timeline.add(ordered, {
      opacity: [0, 1],
      rotateX: [28, 0],
      translateY: [24, 0],
      duration: 1000,
      ease: anime.cubicBezier(...EXPO),
      delay: anime.stagger(80),
    });
  },
};
