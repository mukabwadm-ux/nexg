'use client';

import { Button, Spinner } from '@nexg/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';
import { ensureApplicantSession } from '@/lib/uploads';

import { pathForStep } from './types';

/**
 * Opening a resume link.
 *
 * The token is the credential: whoever holds it becomes an owner of the
 * draft, which is the same bargain any magic link makes. It works once, and
 * the server clears it whether or not this browser turns out to need a new
 * ownership row — a link that could be replayed after a failure would be no
 * better than a permanent one.
 *
 * A session has to exist first, because the claim attaches the draft to a
 * user and an anonymous visitor has no user yet.
 */
export function ResumeClaim({ token }: { token: string }) {
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
      const { data, error: claimError } = await supabase.rpc('rpc_merchant_resume_claim', {
        p_token: token,
      });
      if (cancelled) return;

      if (claimError || !data) {
        setError(claimError?.message ?? 'That link is no longer valid.');
        return;
      }

      const result = data as { merchant_id: string; step: number };
      router.replace(result.step >= 7 ? '/merchants/status' : pathForStep(result.step));
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
          Resume links work once and last seven days. Open your registration on the device you
          started it on, or start again — nothing you saved is lost.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/merchants/apply">Open my registration</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/help">Talk to the merchant team</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <Spinner aria-label="Opening your registration" />
      <p className="text-muted text-sm font-semibold">Picking up where you left off…</p>
    </main>
  );
}
