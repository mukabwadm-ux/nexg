'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { useLive } from '@/components/partner/use-live';

/**
 * Keeps the merchant's setup checklist current: an upload, or a reviewer
 * checking a document, moves the pending list without a reload. Live where
 * Realtime carries `document`, and a quiet poll while the tab is open either
 * way. Renders nothing.
 */
export function DocumentsLive({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  useLive([{ schema: 'public', table: 'document', filter: `owner_id=eq.${ownerId}` }]);
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') router.refresh();
    };
    const timer = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [router]);
  return null;
}
