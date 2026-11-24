'use client';

import { cn } from '@nexg/ui';
import * as React from 'react';

/** Played in this order, then round again. The gentleman clip opens (owner, 22 Nov 2026). */
const CLIPS = [
  '/videos/hero/hero-gentleman.mp4',
  '/videos/hero/hero-1.mp4',
  '/videos/hero/hero-2.mp4',
  '/videos/hero/hero-3.mp4',
];

/**
 * The opening clip's own first frame (frame 0 of hero-gentleman.mp4, as
 * WebP). It is the first thing painted, so the hero opens on the video and
 * playback takes over with no visible change. Regenerate it if that clip
 * changes.
 */
const FIRST_FRAME = '/videos/hero/hero-first-frame.webp';

/**
 * The homepage hero's background: four short clips, one after another, on
 * a loop. Each clip has its own <video> stacked on the others, and the next
 * one fades in as the current one ends, so there is no black frame between
 * them. Only the clip on screen plays; the next one is preloaded.
 *
 * Until the first clip plays, or when autoplay is refused (data saver, low
 * power mode), the first frame shows as a still. Visitors who ask for
 * reduced motion see that first frame, still.
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
      if (still) {
        video.pause();
        /* Back to the first frame, which is what the still shows. */
        if (i === 0) video.currentTime = 0;
      } else if (i === active) {
        video.currentTime = 0;
        /* Autoplay can be refused (battery saver); the first frame stays. */
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
  }, [active, still]);

  return (
    <div
      className={cn('bg-night absolute inset-0 bg-cover bg-center', className)}
      style={{ backgroundImage: `url(${FIRST_FRAME})` }}
      aria-hidden="true"
    >
      {/* Fetched before the clips, so the still is there at once. */}
      <link rel="preload" as="image" href={FIRST_FRAME} fetchPriority="high" />
      {CLIPS.map((src, i) => (
        <video
          key={src}
          ref={(el) => {
            refs.current[i] = el;
          }}
          src={src}
          poster={i === 0 ? FIRST_FRAME : undefined}
          autoPlay={i === 0}
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
