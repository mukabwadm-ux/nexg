'use client';

import { cn } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { useLive } from '@/components/live/use-live';

const KEY = 'nexg.operations.autoRefresh';
const POLL_MS = 30_000;

/**
 * "Real-time updates" and the Auto refresh switch.
 *
 * Orders and dispatch reach the browser through Realtime (the order
 * table and the city's live_pulse bell) and re-render the page within a
 * second. Stays, experience days, service bookings and incidents are not
 * in the Realtime publication, so the page is also re-read every 30
 * seconds while the switch is on. Off stops both; the figures then stay
 * as they were when the page loaded.
 */
export function AutoRefresh() {
  const router = useRouter();
  const [on, setOn] = React.useState(true);

  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === 'off') setOn(false);
    } catch {
      /* Private mode: the switch simply starts on. */
    }
  }, []);

  const { connected } = useLive(
    [
      { schema: 'public', table: 'order' },
      { schema: 'public', table: 'live_pulse' },
    ],
    { enabled: on, settleMs: 600 },
  );

  React.useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [on, router]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      window.localStorage.setItem(KEY, next ? 'on' : 'off');
    } catch {
      /* Not remembered; still applied for this visit. */
    }
    if (next) router.refresh();
  };

  return (
    <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
      <span className="text-muted flex items-center gap-2 text-[0.8125rem] font-semibold">
        <span
          aria-hidden="true"
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            !on ? 'bg-border-strong' : connected ? 'bg-success' : 'bg-[#E5A800]',
          )}
        />
        {!on ? 'Updates paused' : connected ? 'Real-time updates' : 'Updating every 30 seconds'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={toggle}
        className="text-ink flex items-center gap-2.5 rounded-full text-[0.875rem] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A800]"
      >
        Auto refresh
        <span
          aria-hidden="true"
          className={cn(
            'relative h-6 w-11 rounded-full transition-colors',
            on ? 'bg-[#E5A800]' : 'bg-border-strong',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]',
              on ? 'left-[1.375rem]' : 'left-0.5',
            )}
          />
        </span>
      </button>
    </div>
  );
}
