'use client';

import { Button, Spinner } from '@nexg/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';
import { ensureApplicantSession } from '@/lib/uploads';

import { riderPathForStep } from './types';

/**
 * Opening a rider resume link.
 *
 * The token is the credential: whoever holds it becomes the rider, which is
 * the same bargain any magic link makes. It works once, and the server
 * clears it whether or not this browser ends up needing it — a link that
 * could be replayed after a failure would be no better than a permanent one.
 *
 * This is also what "snap it on your phone" uses: the documents step hands
 * out one of these so the same application opens on a phone, where the file
 * inputs open the camera.
 */
export function RiderResumeClaim({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const session = await ensureApplicantSession();
      if (cancelled) return;
      if (!session) {
        setError('We could not start a session in this browser. Try another one.');
        return;
      }

      const supabase = createClient();
      const { data, error: claimError } = await supabase.rpc('rpc_rider_resume_claim', {
        p_token: token,
      });
      if (cancelled) return;

      if (claimError || !data) {
        setError(claimError?.message ?? 'That link is no longer valid.');
        return;
      }

      const result = data as unknown as { rider_id: string; step: number };
      router.replace(result.step >= 6 ? '/riders/status' : riderPathForStep(result.step));
    })();

    return () => {
      cancelled = true;
    };
  }, [router, token]);

  if (error) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight">That link has expired</h1>
        <p className="text-muted mt-3 text-[0.9375rem] leading-[1.8]">{error}</p>
        <p className="text-muted mt-2 text-[0.9375rem] leading-[1.8]">
          Resume links work once and last seven days. Open your application on the phone you started
          it on, or start again — nothing you saved is lost.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/riders/apply">Open my application</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/help">Talk to the rider team</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Spinner aria-label="Opening your application" />
      <p className="text-muted text-sm font-semibold">Picking up where you left off…</p>
    </main>
  );
}
