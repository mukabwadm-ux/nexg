'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { createClient } from '@/lib/supabase/client';

/** Whether Supabase sends phone codes (Auth → Providers → Phone, with an SMS provider). */
async function phoneCodesOn(): Promise<boolean> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return false;
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!response.ok) return false;
    const settings = (await response.json()) as { external?: Record<string, boolean> };
    return settings.external?.phone === true;
  } catch {
    return false;
  }
}

/** +254712345678 from 0712 345 678, 254712345678 or +254712345678; null if not Kenyan mobile. */
export function kenyanMobile(input: string): string | null {
  const d = input.replace(/\D/g, '');
  const n = d.startsWith('254') ? d : d.startsWith('0') ? `254${d.slice(1)}` : `254${d}`;
  return /^254[17]\d{8}$/.test(n) ? `+${n}` : null;
}

/**
 * Confirm the account's phone with a code by SMS (shared services D6). The
 * number goes on the one Supabase sign-in, so the website and every app see
 * it confirmed. Shows nothing until phone codes are switched on in Supabase.
 */
export function PhoneConfirm({
  confirmed,
  suggested,
}: {
  /** The account's phone, when Supabase has it confirmed. */
  confirmed: string | null;
  /** A number to start from: the one given at sign-up, say. */
  suggested?: string | null;
}) {
  const router = useRouter();
  const [on, setOn] = React.useState(false);
  const [phone, setPhone] = React.useState(suggested ?? '');
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let live = true;
    void phoneCodesOn().then((yes) => live && setOn(yes));
    return () => {
      live = false;
    };
  }, []);

  if (!on) return null;

  if (confirmed) {
    return (
      <p className="text-muted mt-1 text-[0.75rem] font-bold">
        Phone {confirmed.startsWith('+') ? confirmed : `+${confirmed}`} · confirmed
      </p>
    );
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const number = kenyanMobile(phone);
    if (!number) {
      setMessage('Enter a Kenyan mobile number, like 0712 345 678.');
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ phone: number });
    setBusy(false);
    if (error) {
      setMessage(
        /already/i.test(error.message)
          ? 'That number is on another account. Sign in with it, or contact support.'
          : 'We could not send a code just now. Try again in a minute.',
      );
      return;
    }
    setSentTo(number);
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!sentTo) return;
    setMessage(null);
    setBusy(true);
    const { error } = await createClient().auth.verifyOtp({
      phone: sentTo,
      token: code.trim(),
      type: 'phone_change',
    });
    setBusy(false);
    if (error) {
      setMessage('That code did not match, or it has expired. Check the SMS, or send a new one.');
      return;
    }
    router.refresh();
  }

  const field =
    'border-border focus-visible:ring-gold rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2';
  const button =
    'bg-gold text-ink hover:bg-gold/90 focus-visible:ring-ink rounded-full px-4 py-2 text-[0.8125rem] font-extrabold focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50';

  return (
    <div className="border-border mt-4 rounded-2xl border p-4">
      <h2 className="text-sm font-extrabold">Confirm your phone</h2>
      <p className="text-muted mt-1 text-[0.8125rem]">
        We send a code by SMS. A confirmed phone lets riders reach you and keeps your orders
        together on every NexG app.
      </p>
      {!sentTo ? (
        <form onSubmit={send} className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="confirm-phone">
            Mobile number
          </label>
          <input
            id="confirm-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={field}
          />
          <button type="submit" disabled={busy} className={button}>
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={verify} className="mt-3 flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="confirm-code">
            Code from the SMS
          </label>
          <input
            id="confirm-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={field}
          />
          <button type="submit" disabled={busy || code.trim().length < 4} className={button}>
            Confirm
          </button>
          <button
            type="button"
            onClick={() => {
              setSentTo(null);
              setCode('');
            }}
            className="text-muted text-[0.8125rem] font-bold underline"
          >
            Change number
          </button>
        </form>
      )}
      {message && (
        <p role="alert" className="text-danger mt-2 text-[0.8125rem] font-semibold">
          {message}
        </p>
      )}
    </div>
  );
}
