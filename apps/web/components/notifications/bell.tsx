'use client';

import { Check, Loader2 } from 'lucide-react';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * A customer's notifications, as a list on the account page
 * (/account?tab=notifications).
 *
 * This used to be a bell in the site header. The owner swapped
 * the bell for the cart (23 Nov 2026), so the same list now
 * lives in the account, reached from the account menu.
 *
 * It reads `user_notification_v`, which is scoped to the caller
 * by RLS, and subscribes to the same rows over Realtime so a
 * delivery moving stage shows up without a refresh. The socket
 * authenticates first: subscribing before the session is
 * attached joins as `anon` and silently receives nothing, which
 * looks exactly like a quiet account. Opening the list marks
 * everything in it as read, as opening the bell did.
 */

interface Row {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  tone: 'info' | 'good' | 'warning' | 'urgent';
  href: string | null;
  created_at: string;
  unread: boolean;
}

const TONE: Record<Row['tone'], string> = {
  info: 'bg-border-strong',
  good: 'bg-success',
  warning: 'bg-warn',
  urgent: 'bg-danger',
};

const COLUMNS = 'id, kind, title, body, tone, href, created_at, unread';

export function NotificationList() {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  /* ───────────────────────────────── load, mark read, then stay live */
  React.useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const load = async () => {
      const { data } = await supabase.from('user_notification_v').select(COLUMNS).limit(30);
      return (data as Row[] | null) ?? [];
    };

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) {
        if (!cancelled) setRows([]);
        return;
      }

      const first = await load();
      if (cancelled) return;
      setRows(first);
      if (first.some((r) => r.unread)) {
        setBusy(true);
        await supabase.rpc('rpc_notifications_read', {});
        if (cancelled) return;
        setBusy(false);
      }

      /* The socket has to carry the session or it joins as anon
         and receives nothing — the same trap the live-ops map
         fell into. */
      await supabase.realtime.setAuth(session.access_token);

      channel = supabase
        .channel(`notifications:${session.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notification',
            filter: `user_id=eq.${session.user.id}`,
          },
          () => {
            /* Re-read rather than patch from the payload. The
               view adds `unread` and the ordering, and a client
               that recomputes them will eventually disagree
               with the server about what is new. */
            void load().then((next) => {
              if (!cancelled) setRows(next);
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, []);

  return (
    <div className="border-border bg-surface overflow-hidden rounded-xl border">
      <div className="border-border flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-sm font-extrabold tracking-tight">Notifications</h2>
        {busy || rows === null ? (
          <Loader2 className="text-muted-light h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : rows.some((r) => r.unread) ? (
          <span className="text-muted-light text-[0.6875rem] font-semibold">Marked as read</span>
        ) : null}
      </div>

      {rows === null ? null : rows.length === 0 ? (
        <p className="text-muted-light px-4 py-10 text-center text-[0.8125rem] font-semibold">
          Nothing yet. When an order moves, a refund lands or something changes on your account, it
          shows up here.
        </p>
      ) : (
        <ul>
          {rows.map((r) => {
            const inner = (
              <div className="flex gap-3 px-4 py-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.unread ? TONE[r.tone] : 'bg-border'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.8125rem] font-extrabold">
                    {r.title}
                    {r.unread ? <span className="sr-only"> (new)</span> : null}
                  </span>
                  {r.body ? (
                    <span className="text-muted mt-0.5 block text-[0.75rem] font-semibold">
                      {r.body}
                    </span>
                  ) : null}
                  <span className="text-muted-light mt-0.5 block text-[0.625rem] font-semibold">
                    {when(r.created_at)}
                  </span>
                </span>
              </div>
            );
            return (
              <li key={r.id} className="border-border border-b last:border-0">
                {r.href ? (
                  <a href={r.href} className="hover:bg-bg block transition-colors">
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-border border-t px-4 py-2.5">
        <PushToggle />
      </div>
    </div>
  );
}

/**
 * Turning on notifications for this device.
 *
 * Inside the notifications list, not on page load, and only after somebody
 * has opened it — which means they have already shown an
 * interest in being told things. A permission prompt on arrival
 * is the fastest way to a permanent Block, and the browser does
 * not offer a second chance.
 */
function PushToggle() {
  const [state, setState] = React.useState<
    'unknown' | 'unsupported' | 'off' | 'on' | 'blocked' | 'unconfigured'
  >('unknown');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    void (async () => {
      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        setState('unsupported');
        return;
      }
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        setState('unconfigured');
        return;
      }
      if (Notification.permission === 'denied') {
        setState('blocked');
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }

      const reg = await navigator.serviceWorker.register('/sw.js');
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        /*
         * Its own state, not 'off'.
         *
         * Without a VAPID key the browser cannot subscribe at
         * all — but reporting that as 'off' made a deployment
         * problem look identical to somebody declining, and
         * there was no way to tell them apart from outside.
         * This is the one that says which variable is missing,
         * the same way every other capability in this system
         * does.
         */
        setState('unconfigured');
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh: string; auth: string } };
      const supabase = createClient();
      await supabase.rpc('rpc_push_subscribe', {
        p_endpoint: json.endpoint ?? sub.endpoint,
        p_p256dh: json.keys?.p256dh ?? '',
        p_auth: json.keys?.auth ?? '',
        p_surface: /Mobi|Android/i.test(navigator.userAgent) ? 'phone' : 'desktop',
      });
      setState('on');
    } catch {
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'unconfigured') {
    return (
      <p className="text-muted-light text-[0.6875rem] font-semibold">
        On-screen notifications are not switched on for this deployment yet. You will still see
        everything here. <span className="font-mono">NEXT_PUBLIC_VAPID_PUBLIC_KEY</span> turns them
        on — and it is read at build time, so it needs a fresh build rather than a redeploy.
      </p>
    );
  }

  if (state === 'unsupported') {
    return (
      <p className="text-muted-light text-[0.6875rem] font-semibold">
        This browser cannot show notifications. You will still see them here.
      </p>
    );
  }
  if (state === 'blocked') {
    return (
      <p className="text-muted-light text-[0.6875rem] font-semibold">
        Notifications are blocked for this site in your browser. Re-enable them from the padlock in
        the address bar and they will reach your screen.
      </p>
    );
  }
  if (state === 'on') {
    return (
      <p className="text-success flex items-center gap-1.5 text-[0.6875rem] font-extrabold">
        <Check className="h-3 w-3" aria-hidden="true" />
        On for this device — updates reach your screen with NexG closed.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void enable()}
      disabled={busy}
      className="text-gold text-[0.6875rem] font-extrabold hover:underline disabled:opacity-50"
    >
      {busy ? 'Asking your browser…' : 'Also show these on my screen'}
    </button>
  );
}

function when(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    timeZone: 'Africa/Nairobi',
  });
}

/* The VAPID key arrives base64url and the subscribe call wants bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalised);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
