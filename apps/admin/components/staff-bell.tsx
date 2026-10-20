'use client';

import { Bell, Loader2 } from 'lucide-react';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * The staff bell: new merchants, riders, hosts, featured requests,
 * refunds, orders and messages that reach this person's modules.
 * Reads `user_notification_v` (scoped to the caller by RLS) and stays
 * live over Realtime.
 */

interface Row {
  id: string;
  title: string;
  body: string | null;
  tone: 'info' | 'good' | 'warning' | 'urgent';
  href: string | null;
  created_at: string;
  unread: boolean;
}

const TONE: Record<Row['tone'], string> = {
  info: 'bg-white/40',
  good: 'bg-emerald-400',
  warning: 'bg-amber-400',
  urgent: 'bg-red-500',
};

const COLUMNS = 'id, title, body, tone, href, created_at, unread';

export function StaffBell() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const wrap = React.useRef<HTMLDivElement>(null);
  const unread = rows.filter((r) => r.unread).length;

  const load = React.useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('user_notification_v' as never)
      .select(COLUMNS)
      .limit(40);
    setRows((data as unknown as Row[] | null) ?? []);
  }, []);

  React.useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      await load();
      /* Without the session on the socket it joins as anon and hears nothing. */
      await supabase.realtime.setAuth(session.access_token);
      channel = supabase
        .channel(`staff-notifications:${session.user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notification',
            filter: `user_id=eq.${session.user.id}`,
          },
          () => void load(),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [load]);

  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function markAllRead() {
    setBusy(true);
    const supabase = createClient();
    await supabase.rpc('rpc_notifications_read' as never, {} as never);
    await load();
    setBusy(false);
  }

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, nothing new'}
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {unread > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-1 -top-1 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-red-500 px-1 text-[0.5625rem] font-extrabold text-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed bottom-16 left-3 z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-black/10 bg-white text-slate-900 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-black/10 px-4 py-3">
            <h2 className="text-sm font-extrabold tracking-tight">Notifications</h2>
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-hidden="true" />
            ) : unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-[0.6875rem] font-bold text-slate-500 underline-offset-2 hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-[0.8125rem] font-semibold text-slate-500">
              Nothing yet. New merchants, riders, hosts, refunds and messages for your modules show
              up here.
            </p>
          ) : (
            <ul className="max-h-[26rem] overflow-y-auto">
              {rows.map((r) => {
                const inner = (
                  <div className="flex gap-3 px-4 py-3">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[r.tone]} ${
                        r.unread ? '' : 'opacity-30'
                      }`}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-[0.8125rem] ${
                          r.unread ? 'font-extrabold' : 'font-semibold'
                        }`}
                      >
                        {r.title}
                      </span>
                      {r.body ? (
                        <span className="mt-0.5 block text-[0.75rem] font-semibold text-slate-500">
                          {r.body}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[0.625rem] font-semibold text-slate-400">
                        {when(r.created_at)}
                      </span>
                    </span>
                  </div>
                );
                return (
                  <li key={r.id} className="border-b border-black/5 last:border-0">
                    {r.href ? (
                      <a href={r.href} className="block transition-colors hover:bg-slate-50">
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
        </div>
      ) : null}
    </div>
  );
}

function when(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });
}
