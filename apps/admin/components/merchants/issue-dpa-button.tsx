'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { issueMerchantDpa } from '@/app/merchants/agreement-actions';

/** Signs and issues the merchant's data processing agreement now, and says what happened. */
export function IssueDpaButton({ merchantId }: { merchantId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setResult(await issueMerchantDpa(merchantId));
            router.refresh();
          })
        }
        className="bg-ink text-bg inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-bold disabled:opacity-50"
      >
        {pending ? 'Signing…' : 'Issue signed DPA'}
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
