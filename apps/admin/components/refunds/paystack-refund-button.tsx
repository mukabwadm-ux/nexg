'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { refundThroughPaystack } from '@/app/orders/paystack-refunds';

/**
 * "Refund through Paystack": sends the refund back to the card or M-Pesa number
 * it was paid with. Only for money that came in through Paystack; anything else
 * is still sent by hand and recorded with its reference.
 */
export function PaystackRefundButton({
  kind,
  targetId,
  amount,
}: {
  kind: 'order' | 'stay' | 'booking';
  targetId: string;
  amount: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!window.confirm(`Send ${amount} back through Paystack?`)) return;
    setBusy(true);
    setMessage(null);
    const result = await refundThroughPaystack(kind, targetId);
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <div className="mt-2 space-y-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void send()}
        className="bg-ink rounded-lg px-3 py-2 text-[0.75rem] font-extrabold text-white disabled:opacity-40"
      >
        {busy ? 'Sending…' : `Refund ${amount} through Paystack`}
      </button>
      {message ? (
        <p
          role="status"
          className={`text-[0.6875rem] font-semibold ${message.ok ? 'text-muted' : 'text-danger'}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
