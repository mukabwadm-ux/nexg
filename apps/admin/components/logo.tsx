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
 * The lockup is stacked and close to square (771 × 736), so it needs more
 * height than the old wordmark did to stay legible; size it with a height
 * class and the width follows.
 */
const LOCKUP = { width: 771, height: 736 } as const;

export function Logo({
  className,
  onDark = false,
  title = 'NexG Concierge',
  priority = false,
}: {
  className?: string;
  onDark?: boolean;
  /** Set to null on a mark that sits beside the word "NexG" already. */
  title?: string | null;
  /** In a header, so it is not lazy-loaded. */
  priority?: boolean;
}) {
  return (
    <Image
      src={onDark ? '/brand/nexg-logo-on-dark.png' : '/brand/nexg-logo.png'}
      width={LOCKUP.width}
      height={LOCKUP.height}
      alt={title ?? ''}
      {...(title ? {} : { 'aria-hidden': true })}
      priority={priority}
      className={cn('h-12 w-auto', className)}
    />
  );
}
