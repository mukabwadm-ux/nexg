'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { useLive } from '@/components/live/use-live';

/**
 * Keeps a merchant's page in step with their documents: when the merchant
 * uploads one, the review list and readiness here update without a reload.
 * Live where Realtime carries `document`, and a quiet poll while the tab is
 * open either way. Renders nothing.
 */
export function DocumentsLive({ merchantId }: { merchantId: string }) {
  const router = useRouter();
  useLive([{ schema: 'public', table: 'document', filter: `owner_id=eq.${merchantId}` }]);
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
