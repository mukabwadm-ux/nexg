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
  useEffect(() => {
    let active = true;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
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
        stopProtectedBrowserRequests();
        setEnded(true);
        window.location.replace('/sign-in');
      }
    };
    const armExpiry = (value: string) => {
      if (expiryTimer) clearTimeout(expiryTimer);
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
    const activity = (event: Event) => {
      if (!active || !expiresAt || !event.isTrusted || Date.now() - lastActivity < 300_000) return;
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
    const refresh = () => {
      if (active && document.visibilityState === 'visible') {
        void watcher?.check();
        router.refresh();
      }
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    if (!isAnonymous) {
      window.addEventListener('pointerdown', activity, { passive: true });
      window.addEventListener('keydown', activity);
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
      }
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, [router, merchantId, actorId, expiresAt, access, isAnonymous]);
  return ended ? <p role="status">Your session has ended. Returning to sign in.</p> : children;
}
