import { cn } from '@nexg/ui';

/**
 * The NexG mark: a gold pin over the wordmark, with "CONCIERGE" beneath.
 * Drawn inline so it stays crisp and costs no request on a 3G connection.
 */
export function Logo({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg viewBox="0 0 32 36" className="h-8 w-7 shrink-0" aria-hidden="true">
        <path
          d="M16 1c-6.6 0-12 5.2-12 11.7 0 8.2 10.2 19.1 11.2 20.2a1.1 1.1 0 0 0 1.6 0C17.8 31.8 28 20.9 28 12.7 28 6.2 22.6 1 16 1Z"
          className="fill-gold"
        />
        <circle cx="16" cy="12" r="4.4" className={onDark ? 'fill-ink' : 'fill-ink'} />
        <path d="M2 24h9M2 28h6" className="stroke-gold" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'text-xl font-extrabold tracking-tight',
            onDark ? 'text-white' : 'text-ink',
          )}
        >
          NE<span className="text-gold">X</span>G
        </span>
        <span
          className={cn(
            'text-[0.5rem] font-bold uppercase tracking-[0.3em]',
            onDark ? 'text-white/50' : 'text-muted-light',
          )}
        >
          Concierge
        </span>
      </span>
    </span>
  );
}
