'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  resumeProtectedBrowserRequests,
  stopProtectedBrowserRequests,
} from '@/lib/supabase/protected-request';
import { loadMerchantWorkspaceAccess, type MerchantWorkspaceAccess } from '@/lib/merchant-access';
import { watchMerchantWorkspaceAccess } from '@/lib/merchant-workspace-watch';
import { subscribeProtectedActor } from '@/lib/supabase/protected-actor';

/** Auth events contain no merchant authority. Every refresh checks the server again. */
export function MerchantAuthBoundary({
  children,
  merchantId,
  actorId,
  access,
  isAnonymous = false,
}: {
  children: React.ReactNode;
  merchantId: string;
  actorId: string;
  access: MerchantWorkspaceAccess;
  isAnonymous?: boolean;
}) {
  const expiresAt = access.expires_at;
  const router = useRouter();
  const [ended, setEnded] = useState(false);
  // Shown a minute before an idle sign-out, so nobody loses a half-typed form
  // (agreement details, DPA annex, onboarding details) without warning.
  const [warning, setWarning] = useState(false);
  useEffect(() => {
    let active = true;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    let warningTimer: ReturnType<typeof setTimeout> | undefined;
    let warned = false;
    let watcher: ReturnType<typeof watchMerchantWorkspaceAccess> | undefined = undefined;
    let lastActivity = 0;
    const client = createClient();
    // A refreshed server tree has re-authorized the new children. Old request
    // generations stay fenced even when this new tree permits setup again.
    resumeProtectedBrowserRequests();
    setEnded(false);
    const end = () => {
      if (active) {
        active = false;
        watcher?.stop();
        if (expiryTimer) clearTimeout(expiryTimer);
        if (warningTimer) clearTimeout(warningTimer);
        stopProtectedBrowserRequests();
        setEnded(true);
        window.location.replace('/merchants/sign-in?reason=workspace-session');
      }
    };
    const armExpiry = (value: string) => {
      if (expiryTimer) clearTimeout(expiryTimer);
      if (warningTimer) clearTimeout(warningTimer);
      warned = false;
      setWarning(false);
      warningTimer = setTimeout(
        () => {
          if (!active) return;
          warned = true;
          setWarning(true);
        },
        Math.max(0, Date.parse(value) - Date.now() - 60_000),
      );
      // Another tab may have advanced the shared session's idle deadline.
      // This read never records activity or extends the session by itself.
      expiryTimer = setTimeout(
        () => {
          void loadMerchantWorkspaceAccess(client, merchantId).then((access) => {
            if (!active) return;
            if ((!access.setup && !access.operations) || !access.expires_at) end();
            else armExpiry(access.expires_at);
          }, end);
        },
        Math.max(0, Date.parse(value) - Date.now()),
      );
    };
    if (expiresAt) armExpiry(expiresAt);
    const unsubscribeActor = subscribeProtectedActor(client, actorId, end);
    const invalidate = () => {
      if (!active) return;
      active = false;
      if (expiryTimer) clearTimeout(expiryTimer);
      if (warningTimer) clearTimeout(warningTimer);
      stopProtectedBrowserRequests();
      setEnded(true);
      router.refresh();
    };
    watcher = watchMerchantWorkspaceAccess({
      client,
      merchantId,
      initial: access,
      visible: () => document.visibilityState === 'visible',
      onChange: invalidate,
      onInvalid: invalidate,
    });
    void watcher.check();
    // A refresh/prefetch is not activity. Only actual input advances the existing
    // Auth session's idle deadline, and the database bounds the absolute expiry.
    // Reported at most once a minute: the idle limit is 7 minutes, so a longer
    // gap would sign out someone who had been typing until a moment ago.
    // While the sign-out warning shows, any input is reported at once.
    const activity = (event: Event) => {
      if (!active || !expiresAt || !event.isTrusted) return;
      if (!warned && Date.now() - lastActivity < 60_000) return;
      lastActivity = Date.now();
      void (
        client as unknown as {
          rpc: (
            name: string,
            args: { p_merchant_id: string },
          ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
        }
      )
        .rpc('rpc_merchant_session_activity', { p_merchant_id: merchantId })
        .then(
          (result) => {
            if (!active) return;
            if (result.error?.code === '42501') end();
            else if (result.error) router.refresh();
            else {
              const deadline = (result.data as { expires_at?: unknown } | null)?.expires_at;
              if (typeof deadline === 'string' && Number.isFinite(Date.parse(deadline)))
                armExpiry(deadline);
              else router.refresh();
            }
          },
          () => {
            if (active) router.refresh();
          },
        );
    };
    /*
     * Coming back to the tab always re-checks access (the watcher refreshes
     * the page itself when access changed). Re-rendering the whole page for
     * fresh data happens at most every 30 seconds: one return to the tab
     * fires both focus and visibilitychange, and each used to rebuild the
     * page on the server.
     */
    let lastRefresh = Date.now();
    const refresh = () => {
      if (active && document.visibilityState === 'visible') {
        void watcher?.check();
        if (Date.now() - lastRefresh < 30_000) return;
        lastRefresh = Date.now();
        router.refresh();
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    // Reading counts too: scrolling the long agreement or DPA text (scroll
    // events do not bubble, so listen in the capture phase).
    if (!isAnonymous) {
      window.addEventListener('pointerdown', activity, { passive: true });
      window.addEventListener('keydown', activity);
      window.addEventListener('wheel', activity, { passive: true });
      window.addEventListener('touchmove', activity, { passive: true });
      document.addEventListener('scroll', activity, { passive: true, capture: true });
    }
    return () => {
      active = false;
      unsubscribeActor();
      watcher?.stop();
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      if (!isAnonymous) {
        window.removeEventListener('pointerdown', activity);
        window.removeEventListener('keydown', activity);
        window.removeEventListener('wheel', activity);
        window.removeEventListener('touchmove', activity);
        document.removeEventListener('scroll', activity, { capture: true });
      }
      if (expiryTimer) clearTimeout(expiryTimer);
      if (warningTimer) clearTimeout(warningTimer);
    };
  }, [router, merchantId, actorId, expiresAt, access, isAnonymous]);
  if (ended) return <p role="status">Your session has ended. Returning to sign in.</p>;
  return (
    <>
      {children}
      {warning ? (
        <div
          role="alert"
          className="border-border bg-surface text-ink fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border p-4 shadow-lg"
        >
          <p className="font-bold">You will be signed out in a minute</p>
          <p className="mt-1 text-sm">
            For security, NexG signs you out after a few minutes without activity. Tap anywhere or
            press a key to stay signed in. Save anything you are typing.
          </p>
        </div>
      ) : null}
    </>
  );
}
