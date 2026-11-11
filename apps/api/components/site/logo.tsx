import { cn } from '@nexg/ui';
import Image from 'next/image';

/**
 * The NexG lockup for dark grounds, as nexgapp.com's header shows it. The
 * file is a copy of apps/web/public/brand/nexg-logo-on-dark.png; the
 * masters live in packages/ui/brand.
 */
export function Logo({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/nexg-logo-on-dark.png"
      // The size it is shown at (the artwork is 771 × 736), so the browser
      // fetches a 48 px and a 96 px rendition rather than an 828 px one.
      width={42}
      height={40}
      alt="NexG Concierge"
      priority={priority}
      className={cn('h-10 w-auto', className)}
    />
  );
}
