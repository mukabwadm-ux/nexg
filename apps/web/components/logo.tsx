import { cn } from '@nexg/ui';
import Image from 'next/image';

/**
 * The NexG logo: the pin with the cloche, NEXG, and CONCIERGE beneath.
 *
 * The supplied artwork, as two PNGs rather than a redraw: one for light
 * grounds (black pin and lettering) and one for dark (white). The masters
 * are packages/ui/brand/nexg-logo-light-bg.png and -dark-bg.png; each app
 * serves a copy from public/brand. The pin alone (nexg-mark.png) is what
 * scripts/build-brand-assets.py turns into the favicon, the app icons and
 * the QR centre mark — at 16 px the full lockup is a smudge.
 *
 * The light-ground lockup is the 2026 artwork: a deeper gold that holds up on
 * white, plus the "YOUR COMFORT, SIMPLIFIED" tagline. The dark-ground one is
 * still the earlier white version. Both are stacked and close to square, so
 * size them with a height class and the width follows.
 */
const LOCKUP = {
  light: { src: '/brand/nexg-logo-light.png', width: 787, height: 825 },
  dark: { src: '/brand/nexg-logo-on-dark.png', width: 771, height: 736 },
} as const;

export function Logo({
  className,
  onDark = false,
  title = 'NexG Concierge',
  priority = false,
  themed = false,
}: {
  className?: string;
  onDark?: boolean;
  /** Set to null on a mark that sits beside the word "NexG" already. */
  title?: string | null;
  /** In a header, so it is not lazy-loaded. */
  priority?: boolean;
  /**
   * Sits straight on the page background: the light-ground art in the light
   * theme and the dark-ground art in the dark theme. Only one of the two is
   * ever displayed, so only one reaches the accessibility tree.
   */
  themed?: boolean;
}) {
  if (themed && !onDark) {
    return (
      <>
        <Logo className={cn('dark:hidden', className)} title={title} priority={priority} />
        <Logo
          onDark
          className={cn('hidden dark:block', className)}
          title={title}
          priority={priority}
        />
      </>
    );
  }
  const art = onDark ? LOCKUP.dark : LOCKUP.light;
  return (
    <Image
      src={art.src}
      width={art.width}
      height={art.height}
      alt={title ?? ''}
      {...(title ? {} : { 'aria-hidden': true })}
      priority={priority}
      className={cn('h-12 w-auto', className)}
    />
  );
}
