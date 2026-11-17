import { Skeleton } from '@nexg/ui';

/**
 * A portal board while it loads.
 *
 * The layout has already drawn the frame (sidebar, header, sign-out), so a
 * click on another board, or landing here after signing in, shows the frame
 * and this outline at once instead of waiting on the board's reads.
 */
export function BoardLoading() {
  return (
    <div role="status" className="space-y-6 px-4 py-6 sm:px-6 lg:px-7">
      <span className="sr-only">Loading…</span>
      <div className="space-y-3">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
