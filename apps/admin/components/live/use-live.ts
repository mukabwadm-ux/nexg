'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Keeping a live screen live.
 *
 * Postgres tells the browser; the browser tells Next to re-render
 * the server component. That round trip sounds slower than keeping
 * state in the client, and is the right trade: the page keeps one
 * source of truth — the same queries, with the same row policies —
 * and gains nothing it has to keep in sync by hand.
 *
 * Changes are coalesced. A cascade round writes eight offer rows in
 * one transaction and eight refreshes for one event would be eight
 * times the work for the same screen.
 *
 * Row security still applies: Realtime evaluates the same policies
 * per subscriber that a query would, so a dispatcher is not sent
 * another city's traffic.
 */
export function useLive(
  channels: { schema: string; table: string; filter?: string }[],
  { enabled = true, settleMs = 250 }: { enabled?: boolean; settleMs?: number } = {},
): { connected: boolean; lastAt: number | null } {
  const router = useRouter();
  const [connected, setConnected] = React.useState(false);
  const [lastAt, setLastAt] = React.useState<number | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /* The list is rebuilt every render by its caller, so compare by
     value — otherwise this resubscribes on every keystroke. */
  const key = JSON.stringify(channels);

  React.useEffect(() => {
    const list: { schema: string; table: string; filter?: string }[] = JSON.parse(key);
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let alive = true;

    /*
     * The token goes to Realtime *before* anything subscribes.
     *
     * `createBrowserClient` loads the session from cookies
     * asynchronously, and a channel opened in the meantime
     * connects with the anon key. Realtime then validates filters
     * with `has_column_privilege('anon', ...)` — and since `anon`
     * has no grant on these tables, every column reads as invalid
     * and the whole channel is refused with "invalid column for
     * filter". Nothing throws; the screen just stops updating.
     *
     * It is a race, so one app can win it and another lose it on
     * the same code. Waiting is the only version that is not luck.
     */
    if (!enabled) return;

    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);

      channel = supabase.channel(`live:${key}`);
      for (const w of list) {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: w.schema,
            table: w.table,
            ...(w.filter ? { filter: w.filter } : {}),
          },
          () => {
            setLastAt(Date.now());
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => router.refresh(), settleMs);
          },
        );
      }
      channel.subscribe((status) => alive && setConnected(status === 'SUBSCRIBED'));
    });

    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [key, enabled, settleMs, router]);

  return { connected, lastAt };
}

/**
 * A second hand that does not need the server.
 *
 * The cascade shows a countdown. Asking the database what time it
 * is sixty times a minute would be absurd, and leaving the number
 * still until the next refresh makes a live screen look frozen at
 * the one moment somebody is staring at it. So the server sends
 * how many seconds were left when it rendered, and this counts
 * down from there.
 */
export function useTick(everyMs = 1000): number {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setN((v) => v + 1), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return n;
}

/** Seconds left, counted down locally from what the server said. */
export function countdown(fromServer: number | null, ticks: number): number | null {
  if (fromServer === null || fromServer === undefined) return null;
  return Math.max(0, fromServer - ticks);
}
