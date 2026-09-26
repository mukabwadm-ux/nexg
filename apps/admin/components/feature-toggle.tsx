'use client';

import { Button, Card, useToast } from '@nexg/ui';
import { useRouter } from 'next/navigation';
import * as React from 'react';

/**
 * Homepage placement for a live merchant.
 *
 * Deliberately not offered before the merchant is live: the band is public,
 * and the RPC refuses anyway. Showing the control greyed out with the reason
 * beats hiding it, because "why can't I feature this one?" is the question a
 * reviewer actually has.
 */
export function FeatureToggle({
  featured,
  live,
  onToggle,
}: {
  featured: boolean;
  live: boolean;
  onToggle: (next: boolean) => Promise<{ ok: boolean; message: string }>;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    const result = await onToggle(!featured);
    setPending(false);
    toast({
      title: result.ok ? 'Done' : 'Not allowed',
      description: result.message,
      tone: result.ok ? 'success' : 'danger',
    });
    if (result.ok) router.refresh();
  };

  return (
    <Card className="p-5">
      <h2 className="text-sm font-extrabold uppercase tracking-wide">Homepage placement</h2>
      <p className="text-muted mt-2 text-sm font-semibold leading-[1.7]">
        {!live
          ? 'Only a live business can be featured.'
          : featured
            ? 'Showing in the Featured Merchants band, labelled Sponsored.'
            : 'Not in the homepage band.'}
      </p>

      <Button
        block
        variant={featured ? 'outline' : 'black'}
        className="mt-4"
        disabled={!live}
        loading={pending}
        loadingText="Working…"
        onClick={run}
      >
        {featured ? 'Remove from homepage' : 'Feature on homepage'}
      </Button>
    </Card>
  );
}
