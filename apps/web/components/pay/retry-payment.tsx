'use client';

import { CreditCard, Landmark, Loader2, RotateCw, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

/**
 * Pay an order again, or send the M-Pesa prompt again, from /pay.
 *
 * Retrying never charges twice by accident: the server reuses the open
 * payment, refuses a new prompt within a minute of the last one, and keeps
 * every prompt, so whichever one the guest answers is the one that counts.
 *
 * Modes:
 *   waiting  a prompt is out; offer to send it again (quietly).
 *   expired  a prompt went unanswered long enough that Safaricom has dropped
 *            it (cancelled, timed out, or never arrived); offer a new prompt
 *            up front, and the bank when one is connected.
 *   failed   the attempt failed or was cancelled; every way to pay again.
 *   start    nothing has been sent to a provider yet; every way to pay.
 *
 * Card is offered only after a failed attempt and only when Paystack is
 * connected: starting a card payment while an M-Pesa prompt is still open
 * would reuse that open payment.
 */
export function RetryPayment({
  orderId,
  mode,
  defaultPhone,
  bankEnabled = false,
  cardReady = false,
}: {
  orderId: string;
  mode: 'waiting' | 'expired' | 'failed' | 'start';
  defaultPhone?: string | null;
  /** Offer paying from a bank account (when a bank is connected). */
  bankEnabled?: boolean;
  /** Offer card (when Paystack is connected). */
  cardReady?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(mode !== 'waiting');
  const [phone, setPhone] = React.useState(defaultPhone ?? '');
  const [busy, setBusy] = React.useState<'mpesa' | 'card' | 'bank' | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  const offerCard = (mode === 'failed' || mode === 'start') && cardReady;
  const offerBank = mode !== 'waiting' && bankEnabled;

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

  async function redirectTo(kind: 'card' | 'bank') {
    setMessage(null);
    setBusy(kind);
    try {
      const res = await fetch(
        kind === 'card' ? '/api/payments/paystack/start' : '/api/payments/bank/start',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ orderId }),
        },
      );
      const body = (await res.json()) as {
        ok: boolean;
        message?: string;
        reference?: string;
        authorization_url?: string;
      };
      if (body.ok && body.authorization_url) {
        window.location.href = body.authorization_url;
        return;
      }
      if (body.ok && body.reference) {
        router.push(`/pay/${body.reference}`);
        router.refresh();
        return;
      }
      setMessage(
        body.message ??
          (kind === 'card'
            ? 'Card payment could not start. Try M-Pesa instead.'
            : 'Paying by bank could not start. Try M-Pesa instead.'),
      );
    } catch {
      setMessage('No connection. Check your internet and try again; nothing was charged.');
    } finally {
      setBusy(null);
    }
  }

  const outline =
    'border-border text-ink enabled:hover:border-ink focus-visible:ring-gold inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[0.8125rem] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50';

  if (!open) {
    return (
      <div className="mt-6">
        <button type="button" onClick={() => setOpen(true)} className={outline}>
          <RotateCw aria-hidden="true" className="h-4 w-4" />
          No prompt on your phone? Send it again
        </button>
      </div>
    );
  }

  return (
    <div className="border-border mt-7 border-t pt-6">
      <h2 className="text-base font-extrabold">
        {mode === 'waiting'
          ? 'Send the prompt again'
          : mode === 'start'
            ? 'Pay with M-Pesa'
            : 'Try again with M-Pesa'}
      </h2>
      <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
        We send a new prompt to this number. Check it is right, then enter your PIN on your phone.
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
          className="border-border bg-surface focus:border-gold min-w-0 flex-1 basis-48 rounded-full border px-4 py-2.5 text-sm font-semibold outline-none"
        />
        <button
          type="submit"
          disabled={busy !== null}
          className="bg-gold text-ink hover:bg-gold/90 focus-visible:ring-gold inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 sm:w-auto"
        >
          {busy === 'mpesa' ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Smartphone aria-hidden="true" className="h-4 w-4" />
          )}
          Send new prompt
        </button>
      </form>

      {(offerCard || offerBank) && (
        <div className="mt-5">
          <p className="text-[0.8125rem] font-extrabold">Or pay another way</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {offerCard && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void redirectTo('card')}
                className={outline}
              >
                {busy === 'card' ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard aria-hidden="true" className="h-4 w-4" />
                )}
                Pay by card
              </button>
            )}
            {offerBank && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void redirectTo('bank')}
                className={outline}
              >
                {busy === 'bank' ? (
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                ) : (
                  <Landmark aria-hidden="true" className="h-4 w-4" />
                )}
                Pay from your bank
              </button>
            )}
          </div>
        </div>
      )}

      {message && (
        <p role="alert" className="text-danger mt-3 text-[0.8125rem] font-bold">
          {message}
        </p>
      )}
    </div>
  );
}
