import { cn } from '../lib/cn';

/** Placeholder block shown while content loads. Decorative: hidden from AT. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-border/70 relative overflow-hidden rounded-md',
        'after:animate-shimmer after:absolute after:inset-0 after:-translate-x-full',
        'after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent',
        className,
      )}
      {...props}
    />
  );
}
