'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { recordStayRefund } from '@/app/hotels/actions';

/** Record the M-Pesa reference of money already sent back to the guest. */
export function RecordRefund({ stayId, amount }: { stayId: string; amount: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [reference, setReference] = React.useState('');
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border-strong hover:border-ink rounded-lg border px-3 py-1.5 text-[0.75rem] font-extrabold"
      >
        Record refund
      </button>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await recordStayRefund({ stayId, reference, note });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="w-56 space-y-2">
      <label className="block text-[0.6875rem] font-extrabold">
        M-Pesa refund reference
        <input
          required
          maxLength={64}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="e.g. SKR9XY12AB"
          className="border-border-strong mt-1 block w-full rounded-lg border px-2.5 py-1.5 text-[0.75rem] font-semibold uppercase"
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
      {error && <p className="text-danger text-[0.6875rem] font-semibold">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="bg-ink rounded-lg px-3 py-1.5 text-[0.75rem] font-extrabold text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : `Mark ${amount} refunded`}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted px-2 text-[0.75rem] font-bold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
