'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { resendLiveEmail } from '@/app/merchants/agreement-actions';

/** Sends the owner's "business is live" email again, and says what happened. */
export function ResendLiveEmailButton({ merchantId }: { merchantId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await resendLiveEmail(merchantId));
            router.refresh();
          })
        }
        className="border-border bg-surface text-ink inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-bold disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send again'}
      </button>
      {result ? (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={`mt-2 text-[0.8125rem] font-bold ${result.ok ? 'text-success' : 'text-danger'}`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
