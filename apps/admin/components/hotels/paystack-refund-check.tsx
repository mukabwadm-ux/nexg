'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { recordPaystackRefundCheck } from '@/app/hotels/cancel-refund-actions';

/**
 * Staff say what the Paystack dashboard shows for a stay's refund when its row
 * did not update. It sends no money.
 */
export function PaystackRefundCheck({
  stayId,
  amount,
  canFail,
  shownReference,
}: {
  stayId: string;
  amount: string;
  /** A refund is open here, so it can be marked failed. */
  canFail: boolean;
  /** NexG's reference of the refund this row shows, so an old page cannot settle a newer one. */
  shownReference: string | null;
}) {
  const router = useRouter();
  const [chosen, setChosen] = React.useState<'processed' | 'failed'>('processed');
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const outcome = canFail ? chosen : 'processed';

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await recordPaystackRefundCheck({
      stayId,
      outcome,
      reference,
      note,
      shownReference,
    });
    setBusy(false);
    setMessage({ ok: result.ok, text: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      <fieldset className="space-y-1 text-[0.6875rem] font-semibold">
        <legend className="font-extrabold">The Paystack dashboard shows</legend>
        <label className="flex gap-1.5">
          <input
            type="radio"
            name={`paystack-${stayId}`}
            checked={outcome === 'processed'}
            onChange={() => setChosen('processed')}
          />
          {amount} refunded (processed)
        </label>
        {canFail && (
          <label className="flex gap-1.5">
            <input
              type="radio"
              name={`paystack-${stayId}`}
              checked={outcome === 'failed'}
              onChange={() => setChosen('failed')}
            />
            The refund failed
          </label>
        )}
      </fieldset>
      <p className="text-danger text-[0.6875rem] font-semibold">
        {outcome === 'processed'
          ? `Never send the money again. Choose this only if the dashboard shows ${amount} processed.`
          : 'Nothing is marked refunded, and the refund can be sent again.'}
      </p>
      <label className="block text-[0.6875rem] font-extrabold">
        Paystack refund reference
        <input
          required={outcome === 'processed'}
          maxLength={64}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder={outcome === 'processed' ? 'From the Paystack dashboard' : 'Optional'}
          className="border-border-strong mt-1 block w-full rounded-lg border px-2.5 py-1.5 text-[0.75rem] font-semibold"
        />
      </label>
      <label className="block text-[0.6875rem] font-extrabold">
        Note
        <input
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Optional"
          className="border-border-strong mt-1 block w-full rounded-lg border px-2.5 py-1.5 text-[0.75rem] font-semibold"
        />
      </label>
      {message && (
        <p
          role="status"
          className={`text-[0.6875rem] font-semibold ${message.ok ? 'text-success' : 'text-danger'}`}
        >
          {message.text}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : outcome === 'processed' ? `Mark ${amount} refunded` : 'Mark it failed'}
      </button>
    </form>
  );
}
