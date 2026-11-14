'use client';

import type * as Anime from 'animejs';
import * as React from 'react';

import { REVEAL_CLASS, REVEAL_LOADED, REVEAL_READY } from './reveal-script';

/* Tells the head script the page's scripts are running (see reveal-script.ts). */
if (typeof window !== 'undefined')
  (window as unknown as Record<string, boolean>)[REVEAL_LOADED] = true;

export type RevealVariant =
  | 'rise'
  | 'iris'
  | 'wipe'
  | 'focus'
  | 'path'
  | 'phone'
  | 'arches'
  | 'gallery'
  | 'steps'
  | 'pricing'
  | 'featured'
  | 'cta';

type State = 'static' | 'waiting' | 'playing' | 'done';

/* Everything an entrance may write inline, cleared once it has played so
   the section is back to its own styles (and its hover effects). */
const ANIMATED = ['opacity', 'transform', 'clip-path', 'filter', 'will-change'] as const;

/**
 * Plays a section's entrance the first time it scrolls into view, as an
 * anime.js timeline (loaded only when the first section needs it).
 *
 * The section is `static` as the server sends it. A script in <head> marks
 * <html> before the first paint (see reveal-script.ts), and while it is
 * marked CSS holds a static section's items back, so nothing shows before
 * its entrance. Once mounted the section plays at once if already in view,
 * else is `waiting` until it scrolls into view; then `playing` while the
 * timeline runs and `done` after. Without the mark (no JS, reduced motion,
 * or scripts too slow) the section simply shows; so it does if anime.js
 * fails to load.
 */
export function Reveal({
  variant = 'rise',
  speed = 1,
  className,
  children,
}: {
  variant?: RevealVariant;
  /** Plays the entrance faster (above 1) or slower (below 1). */
  speed?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<State>('static');

  React.useEffect(() => {
    const element = ref.current;
    (window as unknown as Record<string, boolean>)[REVEAL_READY] = true;
    const held = document.documentElement.classList.contains(REVEAL_CLASS);
    if (
      !element ||
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      if (held) setState('done');
      return;
    }

    let cancelled = false;
    const update = (next: State) => {
      if (!cancelled) setState(next);
    };
    const box = element.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) {
      /* Already on screen: play now if it is still held back; if the mark
         came off (slow scripts) it is already showing, so leave it. */
      if (held) void play(element, variant, speed, update);
      return () => {
        cancelled = true;
      };
    }

    setState('waiting');
    /* Fetched now, while the section is still below the fold, so its
       entrance starts the moment it is seen rather than after a download. */
    void import('animejs').catch(() => {});
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void play(element, variant, speed, (next) => {
          if (!cancelled) setState(next);
        });
      },
      /* A quarter of the section in view, above the bottom fifth of the
         screen: it plays where the eye already is, not at the very edge. */
      { threshold: 0.25, rootMargin: '0px 0px -20% 0px' },
    );
    observer.observe(element);
    /* About a screen and a half away, the section's lazy photos start
       downloading, so they are there when its cards arrive. */
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        near.disconnect();
        for (const img of element.querySelectorAll('img')) img.loading = 'eager';
      },
      { rootMargin: '0px 0px 150% 0px' },
    );
    near.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
      near.disconnect();
    };
  }, [variant, speed]);

  return (
    <div ref={ref} data-reveal={variant} data-state={state} className={className}>
      {children}
    </div>
  );
}

async function play(
  element: HTMLElement,
  variant: RevealVariant,
  speed: number,
  setState: (s: State) => void,
) {
  const items = [...element.querySelectorAll<HTMLElement>('[data-reveal-item]')].filter(
    /* Only what is drawn: the phone section is hidden on small screens. */
    (item) => item.offsetParent !== null || getComputedStyle(item).position === 'fixed',
  );
  const line = element.querySelector<HTMLElement>('[data-reveal-line]');
  const drawn = (selector: string) =>
    [...element.querySelectorAll<HTMLElement>(selector)].filter((el) => el.offsetParent !== null);
  /* The heading block, a closing line under the cards, and a soft glow:
     held back with the items, so nothing in the section shows first. */
  const heads = drawn('[data-reveal-head]');
  const tails = drawn('[data-reveal-tail]');
  const glows = [...element.querySelectorAll<HTMLElement>('[data-reveal-glow]')];
  /* Small marks inside an item (a badge, a checkmark) that pop after it. */
  const pops = drawn('[data-reveal-pop]');
  const targets = [...heads, ...items, ...(line ? [line] : []), ...tails, ...glows, ...pops];
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

  /* Cards wait (briefly) for their photos, so an image never pops in after
     its card has already arrived. */
  await imagesReady(items, 1500);

  const finish = () => {
    for (const target of targets) for (const prop of ANIMATED) target.style.removeProperty(prop);
    setState('done');
  };

  for (const target of targets) {
    /* Each item on its own layer for the entrance only, so it stays smooth. */
    target.style.willChange = 'transform, opacity, clip-path, filter';
    /* Hidden inline until its own tween begins: anime.js only writes a
       tween's starting values once it starts, so an item further down a
       stagger would otherwise show in full when the CSS hold lifts. The
       sponsored cards are hidden by their curtain, every other entrance
       starts from transparent. */
    if (variant === 'wipe' && items.includes(target)) target.style.clipPath = CURTAIN_CLOSED;
    else target.style.opacity = '0';
  }
  const timeline = anime.createTimeline({ onComplete: finish, playbackRate: speed });
  const smooth = anime.cubicBezier(...SMOOTH);
  if (glows.length) timeline.add(glows, { opacity: [0, 1], duration: 1800, ease: smooth }, 0);
  if (heads.length)
    timeline.add(
      heads,
      {
        opacity: [0, 1],
        translateY: [12, 0],
        duration: 1100,
        ease: smooth,
        delay: anime.stagger(120),
      },
      0,
    );
  /* The items follow the heading a beat later. */
  const at = heads.length ? 250 : 0;
  /* An entrance may say when the closing line should follow its items. */
  const tailAt =
    (items.length || line ? ENTRANCES[variant]({ anime, timeline, items, line, at }) : undefined) ??
    at + 700;
  if (tails.length)
    timeline.add(
      tails,
      { opacity: [0, 1], translateY: [8, 0], duration: 1100, ease: smooth },
      tailAt,
    );
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
  /** When the items start, in ms from the start of the timeline. */
  at: number;
}) => number | void;

/** Resolves once every photo inside the items has decoded, or after `cap` ms. */
function imagesReady(items: HTMLElement[], cap: number) {
  const images = items.flatMap((item) => [...item.querySelectorAll('img')]);
  const pending = images
    .filter((img) => !img.complete || img.naturalWidth === 0)
    .map((img) => img.decode().catch(() => {}));
  if (pending.length === 0) return Promise.resolve();
  return Promise.race([
    Promise.all(pending),
    new Promise<void>((resolve) => setTimeout(resolve, cap)),
  ]);
}

/* Unhurried and smooth: about 1.3s an item, gaps of 150-220ms so each row
   reads as a wave from left to right, short travel, and a gentle ease-out
   (no expo snap at the start). */
const SMOOTH = [0.22, 1, 0.36, 1] as const;

/** A sponsored card before its curtain lifts. */
const CURTAIN_CLOSED = 'inset(100% 0% 0% 0% round 24px)';

const ENTRANCES: Record<RevealVariant, Entrance> = {
  /* Categories: a spring settle, a touch past full size and back. */
  iris: ({ anime, timeline, items, at }) => {
    timeline.add(
      items,
      {
        keyframes: {
          '0%': { opacity: 0, scale: 0.9 },
          '60%': { opacity: 1, scale: 1.02 },
          '82%': { scale: 0.995 },
          '100%': { scale: 1 },
        },
        duration: 1300,
        ease: 'outQuad',
        delay: anime.stagger(150, { start: at }),
      },
      0,
    );
  },
  /* Sponsored: a curtain lifts off each card, bottom edge first. */
  wipe: ({ anime, timeline, items, at }) => {
    timeline.add(
      items,
      {
        clipPath: [CURTAIN_CLOSED, 'inset(0% 0% 0% 0% round 24px)'],
        duration: 1300,
        ease: anime.cubicBezier(0.65, 0, 0.35, 1),
        delay: anime.stagger(200, { start: at }),
      },
      0,
    );
  },
  /* Best sellers: a soft rise. */
  rise: ({ anime, timeline, items, at }) => {
    timeline.add(
      items,
      {
        opacity: [0, 1],
        translateY: [16, 0],
        duration: 1300,
        ease: anime.cubicBezier(...SMOOTH),
        delay: anime.stagger(160, { start: at }),
      },
      0,
    );
  },
  /* Stores: a focus pull. */
  focus: ({ anime, timeline, items, at }) => {
    timeline.add(
      items,
      {
        opacity: [0, 1],
        filter: ['blur(6px)', 'blur(0px)'],
        scale: [1.03, 1],
        duration: 1300,
        ease: anime.cubicBezier(...SMOOTH),
        delay: anime.stagger(180, { start: at }),
      },
      0,
    );
  },
  /* Join: the steps slide in left to right as the dotted line draws. */
  path: ({ anime, timeline, items, line, at }) => {
    if (line)
      timeline.add(
        line,
        {
          opacity: [0, 1],
          clipPath: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'],
          duration: 1400 + 220 * Math.max(items.length - 1, 0),
          ease: anime.cubicBezier(...SMOOTH),
          delay: at,
        },
        0,
      );
    timeline.add(
      items,
      {
        opacity: [0, 1],
        translateX: [-22, 0],
        duration: 1400,
        ease: anime.cubicBezier(...SMOOTH),
        delay: anime.stagger(220, { start: at }),
      },
      0,
    );
  },
  /* The app: a depth tilt (the perspective is set on the parent), phone
     first, then the cards beside it. */
  phone: ({ anime, timeline, items, at }) => {
    const ordered = ['', 'left', 'right']
      .map((key) => items.find((item) => item.dataset.revealItem === key))
      .filter((item): item is HTMLElement => Boolean(item));
    timeline.add(
      ordered,
      {
        opacity: [0, 1],
        rotateX: [28, 0],
        translateY: [20, 0],
        duration: 1300,
        ease: anime.cubicBezier(...SMOOTH),
        delay: anime.stagger(160, { start: at }),
      },
      0,
    );
  },
  /* Merchants hero: the tall arch rises, then the short one; the gold dot
     pops and the two notes slide in from either side. */
  arches: ({ anime, timeline, items, at }) => {
    const smooth = anime.cubicBezier(...SMOOTH);
    const step = (key: string, params: Anime.AnimationParams, when: number) => {
      const part = items.filter((item) => item.dataset.revealItem === key);
      if (part.length) timeline.add(part, params, when);
    };
    step(
      'tall',
      { opacity: [0, 1], translateY: [24, 0], scale: [1.03, 1], duration: 1400, ease: smooth },
      at,
    );
    step('short', { opacity: [0, 1], translateY: [24, 0], duration: 1300, ease: smooth }, at + 220);
    step(
      'dot',
      { opacity: [0, 1], scale: [0.4, 1], duration: 900, ease: 'outBack(1.6)' },
      at + 600,
    );
    step(
      'note-right',
      { opacity: [0, 1], translateX: [22, 0], duration: 1200, ease: smooth },
      at + 800,
    );
    step(
      'note-left',
      { opacity: [0, 1], translateX: [-22, 0], duration: 1200, ease: smooth },
      at + 1000,
    );
  },
  /* Photo cards open from the bottom one after another, left to right; the
     numbered badge on each pops as its card lands. */
  gallery: ({ anime, timeline, items, at }) => {
    timeline.add(
      items,
      {
        opacity: [0, 1],
        clipPath: ['inset(100% 0% 0% 0% round 24px)', 'inset(0% 0% 0% 0% round 24px)'],
        translateY: [16, 0],
        duration: 1300,
        ease: anime.cubicBezier(...SMOOTH),
        delay: anime.stagger(180, { start: at }),
      },
      0,
    );
    const pops = items.flatMap((item) => [
      ...item.querySelectorAll<HTMLElement>('[data-reveal-pop]'),
    ]);
    if (pops.length)
      timeline.add(
        pops,
        {
          opacity: [0, 1],
          scale: [0.4, 1],
          duration: 800,
          ease: 'outBack(1.8)',
          delay: anime.stagger(180, { start: at + 700 }),
        },
        0,
      );
    /* The chips under the cards follow the last card. */
    return at + 180 * Math.max(items.length - 1, 0) + 700;
  },
  /* Steps: the rule above each draws across, then its number and text. */
  steps: ({ anime, timeline, items, at }) => {
    const smooth = anime.cubicBezier(...SMOOTH);
    const rules = items.filter((item) => item.dataset.revealItem === 'rule');
    const rows = items.filter((item) => item.dataset.revealItem === 'row');
    if (rules.length)
      timeline.add(
        rules,
        {
          opacity: [0, 1],
          scaleX: [0, 1],
          duration: 1100,
          ease: smooth,
          delay: anime.stagger(300, { start: at }),
        },
        0,
      );
    if (rows.length)
      timeline.add(
        rows,
        {
          opacity: [0, 1],
          translateY: [12, 0],
          duration: 1200,
          ease: smooth,
          delay: anime.stagger(300, { start: at + 250 }),
        },
        0,
      );
  },
  /* Pricing: the card rises a beat after the steps beside it, then its
     checkmarks tick in one by one. */
  pricing: ({ anime, timeline, items, at }) => {
    timeline.add(
      items,
      {
        opacity: [0, 1],
        translateY: [20, 0],
        duration: 1300,
        ease: anime.cubicBezier(...SMOOTH),
      },
      at + 400,
    );
    const pops = items.flatMap((item) => [
      ...item.querySelectorAll<HTMLElement>('[data-reveal-pop]'),
    ]);
    if (pops.length)
      timeline.add(
        pops,
        {
          opacity: [0, 1],
          scale: [0.4, 1],
          duration: 800,
          ease: 'outBack(1.8)',
          delay: anime.stagger(140, { start: at + 1000 }),
        },
        0,
      );
  },
  /* Get featured: the preview card arrives with a slight tilt (perspective
     on its parent) and its gold slot glows once; then the three slots come
     in left to right, the highlighted one settling as it lands. */
  featured: ({ anime, timeline, items, at }) => {
    const smooth = anime.cubicBezier(...SMOOTH);
    const preview = items.filter((item) => item.dataset.revealItem === 'preview');
    const slots = items.filter((item) => item.dataset.revealItem === 'slot');
    if (preview.length)
      timeline.add(
        preview,
        { opacity: [0, 1], rotateX: [20, 0], translateY: [20, 0], duration: 1300, ease: smooth },
        at,
      );
    const ring = preview[0]?.querySelector<HTMLElement>('[data-reveal-ring]');
    if (ring)
      timeline.add(
        ring,
        {
          boxShadow: ['0 0 0 0px rgba(253, 209, 40, 0.7)', '0 0 0 14px rgba(253, 209, 40, 0)'],
          duration: 1400,
          ease: 'outQuad',
          onComplete: () => ring.style.removeProperty('box-shadow'),
        },
        at + 900,
      );
    if (slots.length)
      timeline.add(
        slots,
        {
          opacity: [0, 1],
          translateY: [16, 0],
          duration: 1300,
          ease: smooth,
          delay: anime.stagger(180, { start: at + 400 }),
        },
        0,
      );
    slots.forEach((slot, index) => {
      if (slot.dataset.revealSettle === undefined) return;
      timeline.add(
        slot,
        {
          keyframes: { '0%': { scale: 1 }, '45%': { scale: 1.025 }, '100%': { scale: 1 } },
          duration: 900,
          ease: 'inOutSine',
        },
        at + 400 + index * 180 + 900,
      );
    });
    /* The button under the slots follows the last one. */
    return at + 400 + 180 * Math.max(slots.length - 1, 0) + 700;
  },
  /* Closing call to action: the panel rises, the photo opens from its
     rounded edge, the words follow and the button comes last. */
  cta: ({ anime, timeline, items, at }) => {
    const smooth = anime.cubicBezier(...SMOOTH);
    const part = (key: string) => items.filter((item) => item.dataset.revealItem === key);
    const add = (targets: HTMLElement[], params: Anime.AnimationParams, when: number) => {
      if (targets.length) timeline.add(targets, params, when);
    };
    add(part('panel'), { opacity: [0, 1], translateY: [20, 0], duration: 1300, ease: smooth }, at);
    add(
      part('photo'),
      {
        opacity: [0, 1],
        clipPath: ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)'],
        duration: 1400,
        ease: smooth,
      },
      at + 300,
    );
    const lines = part('line');
    if (lines.length)
      timeline.add(
        lines,
        {
          opacity: [0, 1],
          translateY: [12, 0],
          duration: 1200,
          ease: smooth,
          delay: anime.stagger(150, { start: at + 350 }),
        },
        0,
      );
    add(
      part('button'),
      { opacity: [0, 1], translateY: [10, 0], duration: 1100, ease: smooth },
      at + 900,
    );
  },
};
