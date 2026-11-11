'use client';

import { Button } from '@nexg/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { bookingRequest } from '@/components/merchant/booking/api';

export function PublishedBookingLink({ merchantId }: { merchantId: string }) {
  const [publishedMerchant, setPublishedMerchant] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/public/booking/${encodeURIComponent(merchantId)}`;
    void bookingRequest<{ business?: { id?: string }; offerings?: unknown[] }>(
      '/catalog',
      { signal: controller.signal },
      base,
    )
      .then((catalog) => {
        if (
          !controller.signal.aborted &&
          catalog?.business?.id === merchantId &&
          Array.isArray(catalog.offerings) &&
          catalog.offerings.length > 0
        )
          setPublishedMerchant(merchantId);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [merchantId]);

  if (publishedMerchant !== merchantId) return null;
  return (
    <Button asChild>
      <Link href={`/book/${encodeURIComponent(merchantId)}`}>View booking options</Link>
    </Button>
  );
}
