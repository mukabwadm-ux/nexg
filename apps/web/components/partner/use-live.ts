'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * A partner's own screen, kept current.
 *
 * The same shape as the console's hook, and deliberately not
 * shared with it: a merchant's browser should subscribe to their
 * own orders and nothing else, and the filter that guarantees
 * that belongs next to the page that knows the merchant id.
 *
 * Row security still applies. Realtime evaluates the same policies
 * per subscriber as a query would, so the filter below is an
 * optimisation rather than the thing keeping other merchants'
 * orders out — that is `order_read`.
 */
export function useLive(
  watching: { schema: string; table: string; filter?: string }[],
  { settleMs = 400 }: { settleMs?: number } = {},
): { connected: boolean } {
  const router = useRouter();
  const [connected, setConnected] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = JSON.stringify(watching);

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
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const token = data.session?.access_token;
      if (token) supabase.realtime.setAuth(token);

      channel = supabase.channel(`partner:${key}`);
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
  }, [key, settleMs, router]);

  return { connected };
}
