'use client';

import * as React from 'react';

import { useLive } from './use-live';

/**
 * A small, quiet "this is live" marker.
 *
 * Worth showing because the alternative — a screen that silently
 * stopped updating — looks identical to a quiet evening, and a
 * merchant who cannot tell which they are looking at will refresh
 * the page every thirty seconds.
 */
function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className="text-muted-light inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold">
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-success' : 'bg-muted-light'}`}
      />
      {connected ? 'live' : 'reconnecting'}
    </span>
  );
}

/**
 * Watches this merchant's orders and nothing else.
 *
 * Mounted beside the list rather than wrapping it: the list stays
 * a server component, so there is one query, one set of row
 * policies, and no second copy of the data in the browser to go
 * stale.
 */
export function LiveOrders({ merchantId }: { merchantId: string }) {
  const { connected } = useLive([
    { schema: 'public', table: 'order', filter: `merchant_id=eq.${merchantId}` },
  ]);
  return <LiveDot connected={connected} />;
}

/** The same, for a rider watching the job they are carrying. */
export function LiveTrips({ riderId }: { riderId: string }) {
  const { connected } = useLive([
    { schema: 'public', table: 'order', filter: `rider_id=eq.${riderId}` },
  ]);
  return <LiveDot connected={connected} />;
}
