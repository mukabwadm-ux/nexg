'use client';

import { Loader2, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

/**
 * Pay an order again, or send the M-Pesa prompt again, from /pay.
 *
 * Retrying never charges twice by accident: the server reuses the open
 * payment, refuses a new prompt within a minute of the last one, and keeps
 * every prompt, so whichever one the guest answers is the one that counts.
 */
export function RetryPayment({
  orderId,
  mode,
  defaultPhone,
}: {
  orderId: string;
  /** "failed" offers to pay again; "waiting" offers to resend the prompt. */
  mode: 'failed' | 'waiting';
  defaultPhone?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(mode === 'failed');
  const [phone, setPhone] = React.useState(defaultPhone ?? '');
  const [busy, setBusy] = React.useState<'mpesa' | 'card' | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  async function mpesa(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    if (phone.replace(/\D/g, '').length < 9) {
      setMessage('Enter your M-Pesa number, like 0712 345 678.');
      return;
    }
    setBusy('mpesa');
    try {
      const res = await fetch('/api/payments/mpesa/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId, phone }),
      });
      const body = (await res.json()) as { ok: boolean; message?: string; reference?: string };
      if (!body.ok) {
        setMessage(body.message ?? 'The prompt could not be sent. Try again in a moment.');
        if (body.reference) router.refresh();
        return;
      }
      router.push(`/pay/${body.reference}`);
      router.refresh();
    } catch {
      setMessage('No connection. Check your internet and try again; nothing was charged.');
    } finally {
      setBusy(null);
    }
  }

  async function card() {
    setMessage(null);
    setBusy('card');
    try {
      const res = await fetch('/api/payments/paystack/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
        authorization_url?: string;
      };
      if (!body.ok || !body.authorization_url) {
        setMessage(body.message ?? 'Card payment could not start. Try M-Pesa instead.');
        return;
      }
      window.location.href = body.authorization_url;
    } catch {
      setMessage('No connection. Check your internet and try again; nothing was charged.');
    } finally {
      setBusy(null);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted hover:text-ink mt-4 text-[0.8125rem] font-bold underline"
      >
        No prompt on your phone? Send it again
      </button>
    );
  }

  return (
    <div className="border-border mt-5 rounded-xl border p-4">
      <p className="text-ink flex items-center gap-2 text-[0.9375rem] font-extrabold">
        <Smartphone aria-hidden="true" className="h-4 w-4" />
        {mode === 'failed' ? 'Pay again with M-Pesa' : 'Send the M-Pesa prompt again'}
      </p>
      <form onSubmit={(event) => void mpesa(event)} className="mt-3 flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="retry-phone">
          M-Pesa number
        </label>
        <input
          id="retry-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border-border bg-surface focus:border-gold min-w-0 flex-1 rounded-xl border px-3.5 py-2.5 text-sm font-semibold outline-none"
        />
        <button
          type="submit"
          disabled={busy !== null}
          className="bg-gold text-ink hover:bg-gold/90 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold disabled:opacity-50"
        >
          {busy === 'mpesa' && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          {mode === 'failed' ? 'Pay with M-Pesa' : 'Send prompt'}
        </button>
      </form>
      {mode === 'failed' && (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void card()}
          className="text-ink mt-3 inline-flex items-center gap-2 text-[0.8125rem] font-bold underline disabled:opacity-50"
        >
          {busy === 'card' && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
          Pay by card instead
        </button>
      )}
      {message && (
        <p role="alert" className="text-danger mt-3 text-[0.8125rem] font-semibold">
          {message}
        </p>
      )}
    </div>
  );
}
