'use client';

import { getCaptchaToken } from '@nexg/ui';
import { CreditCard, Loader2, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/**
 * Pay a concierge order from its pay link, with no account. A visitor who is
 * not signed in pays from a temporary session (the way checkout does); the
 * server checks the link's token and pays that one order.
 */
export function PayLinkForm({
  token,
  mpesa,
  card,
  waiting = false,
}: {
  token: string;
  /** M-Pesa is on offer. */
  mpesa: boolean;
  /** Card is on offer. */
  card: boolean;
  /** A prompt is already out: offer to send another. */
  waiting?: boolean;
}) {
  const router = useRouter();
  const [phone, setPhone] = React.useState('');
  const [busy, setBusy] = React.useState<'mpesa' | 'card' | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  async function session(): Promise<boolean> {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) return true;
    const captchaToken = await getCaptchaToken().catch(() => undefined);
    const { error } = await supabase.auth.signInAnonymously({ options: { captchaToken } });
    return !error;
  }

  async function pay(method: 'mpesa' | 'card') {
    setMessage(null);
    if (method === 'mpesa' && phone.replace(/\D/g, '').length < 9) {
      setMessage('Enter your M-Pesa number, like 0712 345 678.');
      return;
    }
    setBusy(method);
    try {
      if (!(await session())) {
        setMessage('We could not start paying. Refresh the page and try again.');
        return;
      }
      const res = await fetch(
        `/api/customer/checkout/pay-links/${encodeURIComponent(token)}/payment`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            method === 'card' ? { method: 'card' } : { method: 'mpesa_stk', phone },
          ),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        url?: string;
        title?: string;
      };
      if (!res.ok) {
        setMessage(body.title ?? 'Paying could not start. Try again in a moment.');
        return;
      }
      if (body.url) {
        window.location.assign(body.url);
        return;
      }
      setSent(true);
      router.refresh();
    } catch {
      setMessage('No connection. Check your internet and try again; nothing was charged.');
    } finally {
      setBusy(null);
    }
  }

  if (!mpesa && !card) {
    return (
      <p className="text-muted mt-6 text-[0.875rem] font-semibold">
        Paying online is not switched on yet. Nothing is owed until it is; NexG Concierge will be in
        touch.
      </p>
    );
  }

  const button =
    'bg-gold text-ink hover:bg-gold/90 focus-visible:ring-gold inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 sm:w-auto';
  const outline =
    'border-border text-ink enabled:hover:border-ink focus-visible:ring-gold inline-flex w-full items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 sm:w-auto';

  return (
    <div className="border-border mt-7 border-t pt-6">
      {mpesa && (
        <>
          <h2 className="text-base font-extrabold">
            {waiting || sent ? 'Send the M-Pesa prompt again' : 'Pay with M-Pesa'}
          </h2>
          <p className="text-muted mt-1 text-[0.8125rem] font-semibold">
            We send a prompt to this number. Enter your PIN on your phone to pay.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pay('mpesa');
            }}
            className="mt-3 flex flex-wrap gap-2"
          >
            <label className="sr-only" htmlFor="pay-link-phone">
              M-Pesa number
            </label>
            <input
              id="pay-link-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border-border bg-surface focus:border-gold min-w-0 flex-1 basis-48 rounded-full border px-4 py-2.5 text-sm font-semibold outline-none"
            />
            <button type="submit" disabled={busy !== null} className={button}>
              {busy === 'mpesa' ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Smartphone aria-hidden="true" className="h-4 w-4" />
              )}
              {waiting || sent ? 'Send new prompt' : 'Send M-Pesa prompt'}
            </button>
          </form>
        </>
      )}
      {card && (
        <div className={mpesa ? 'mt-5' : ''}>
          {mpesa && <p className="text-[0.8125rem] font-extrabold">Or pay by card</p>}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void pay('card')}
            className={`${mpesa ? outline : button} mt-2`}
          >
            {busy === 'card' ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard aria-hidden="true" className="h-4 w-4" />
            )}
            Pay by card
          </button>
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
