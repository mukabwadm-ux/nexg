'use client';

import { cn } from '@nexg/ui';
import * as React from 'react';

/** Played in this order, then round again. */
const CLIPS = ['/videos/hero/hero-1.mp4', '/videos/hero/hero-2.mp4', '/videos/hero/hero-3.mp4'];
const POSTER = '/videos/hero/hero-poster.jpg';

/**
 * The homepage hero's background: three short clips, one after another, on
 * a loop. Each clip has its own <video> stacked on the others, and the next
 * one fades in as the current one ends, so there is no black frame between
 * them. Only the clip on screen plays; the next one is preloaded.
 *
 * Visitors who ask for reduced motion see the first frame, still.
 */
export function HeroVideo({ className }: { className?: string }) {
  const [active, setActive] = React.useState(0);
  const [still, setStill] = React.useState(false);
  const refs = React.useRef<(HTMLVideoElement | null)[]>([]);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setStill(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    refs.current.forEach((video, i) => {
      if (!video) return;
      if (i === active && !still) {
        video.currentTime = 0;
        /* Autoplay can be refused (battery saver); the poster stays. */
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [active, still]);

  return (
    <div className={cn('bg-night absolute inset-0', className)} aria-hidden="true">
      {CLIPS.map((src, i) => (
        <video
          key={src}
          ref={(el) => {
            refs.current[i] = el;
          }}
          src={src}
          poster={i === 0 ? POSTER : undefined}
          muted
          playsInline
          preload={i === active || i === (active + 1) % CLIPS.length ? 'auto' : 'none'}
          onEnded={() => setActive((a) => (a + 1) % CLIPS.length)}
          className={cn(
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-700',
            i === active ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}
    </div>
  );
}
