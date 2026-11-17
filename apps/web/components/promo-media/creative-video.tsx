'use client';

import { cn } from '@nexg/ui';
import { Pause, Play } from 'lucide-react';
import * as React from 'react';

/**
 * A merchant's video on a customer page (a featured card, a promotion
 * banner, or the merchant's preview of either).
 *
 * - Always muted, inline and looping, with the still frame as its poster:
 *   it never starts with sound and never opens full screen on a phone.
 * - It plays only while it is on screen, so a card scrolled past stops
 *   using data and battery.
 * - Visitors who ask for reduced motion see the still; the button plays it
 *   if they want to.
 * - The button pauses and resumes it (WCAG 2.2.2: moving content that runs
 *   longer than five seconds can be paused). It sits beside the card's
 *   link, never inside it, so the page has no button-in-a-link.
 *
 * The parent positions it: it fills the nearest positioned ancestor.
 */
export function CreativeVideo({
  src,
  poster,
  className,
  buttonClassName,
  label = 'video',
}: {
  src: string;
  poster?: string | null;
  className?: string;
  buttonClassName?: string;
  /** What the button names, as in "Pause video". */
  label?: string;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  /* null until the visitor presses the button: until then motion settings
     decide, and after that their choice does. */
  const [chosen, setChosen] = React.useState<boolean | null>(null);
  const [reduced, setReduced] = React.useState(true);
  const [visible, setVisible] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.25 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const wanted = chosen ?? !reduced;

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;
    /* Muted is set on the element as well as the attribute: React does not
       reflect `muted`, and some browsers refuse to autoplay without it. */
    video.muted = true;
    if (wanted && visible) {
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [wanted, visible, src]);

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted
        loop
        playsInline
        preload={wanted ? 'metadata' : 'none'}
        disablePictureInPicture
        aria-hidden="true"
        tabIndex={-1}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className={cn('absolute inset-0 h-full w-full object-cover', className)}
      />
      <button
        type="button"
        onClick={() => setChosen(!playing)}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        className={cn(
          'focus-visible:ring-gold absolute bottom-3 right-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2',
          buttonClassName,
        )}
      >
        {playing ? (
          <Pause className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </>
  );
}
