import { cn } from '@nexg/ui';

import type { HttpMethod } from '@/lib/reference/types';

const METHOD_TONE: Record<HttpMethod, string> = {
  GET: 'bg-info-bg text-info',
  POST: 'bg-success-bg text-success',
  PATCH: 'bg-warning-bg text-warning',
};

/**
 * GET, POST or PATCH, in one fixed width so lists of paths line up. Its own
 * file because the sidebar (a client component) renders it, while the rest
 * of badges.tsx is only used by server components.
 */
export function MethodBadge({
  method,
  size = 'md',
  className,
}: {
  method: HttpMethod;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded font-mono font-bold tracking-wide',
        size === 'sm' ? 'h-[1.125rem] w-11 text-[0.625rem]' : 'h-6 w-14 text-xs',
        METHOD_TONE[method],
        className,
      )}
    >
      {method}
    </span>
  );
}
