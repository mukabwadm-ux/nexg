'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

/**
 * Re-reads the page's server data every few seconds without reloading it,
 * so anything the guest is typing (a phone number to resend to) survives.
 */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(timer);
  }, [router, seconds]);
  return null;
}
