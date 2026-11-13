'use client';

import * as React from 'react';

export type RevealVariant = 'rise' | 'iris' | 'wipe' | 'focus' | 'path' | 'phone';

/**
 * Plays a section's entrance the first time it scrolls into view.
 *
 * It only marks the wrapper: `data-state="in"` once the section is about a
 * sixth on screen. The entrance itself is CSS in packages/ui globals.css,
 * keyed on the variant and played by the `data-reveal-item` children.
 * Items are visible by default and only held back while this can bring
 * them in, so nothing stays hidden if the script never runs.
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
  /*
   * 'static' until this has mounted, so the server's HTML shows everything
   * and a page whose scripts are slow or fail never hides a section.
   * 'waiting' (held back) only once the observer is watching, and only if
   * the section is not already on screen; 'in' plays the entrance.
   */
  const [state, setState] = React.useState<'static' | 'waiting' | 'in'>('static');

  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    const box = element.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;
    setState('waiting');
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setState('in');
        observer.disconnect();
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal={variant} data-state={state} className={className}>
      {children}
    </div>
  );
}
