import 'server-only';

/**
 * Paystack, admin side: refunds only (Paystack slice 6, owner 22 Nov 2026).
 * Nothing here can take a payment, so a mistake in the console cannot charge
 * anybody. The same keys as the website, set by the owner on this app too:
 *   PAYSTACK_TEST_SECRET_KEY, and PAYSTACK_LIVE_SECRET_KEY for live payments.
 * A refund always goes out in the mode the payment came in on.
 */

const BASE = 'https://api.paystack.co';

export type PaystackMode = 'test' | 'live';

function key(mode: PaystackMode): string | null {
  const value = (
    mode === 'live' ? process.env.PAYSTACK_LIVE_SECRET_KEY : process.env.PAYSTACK_TEST_SECRET_KEY
  )?.trim();
  if (!value) return null;
  if (mode === 'live' ? !value.startsWith('sk_live_') : !value.startsWith('sk_test_')) return null;
  return value;
}

/** The key as the database's proof that this server holds it. */
export function paystackProof(mode: PaystackMode): string | null {
  return key(mode);
}

export interface PaystackAnswer {
  /** Paystack answered (any status); its raw answer goes to the database. */
  answered: boolean;
  raw?: string;
  message: string;
}

async function call(
  mode: PaystackMode,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<PaystackAnswer> {
  const secret = key(mode);
  if (!secret) return { answered: false, message: 'Paystack is not connected on the console.' };
  try {
    const response = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    const raw = await response.text();
    let message = `Paystack answered ${response.status}.`;
    try {
      message = (JSON.parse(raw) as { message?: string }).message?.slice(0, 300) ?? message;
    } catch {
      return { answered: false, message: 'Paystack sent something we could not read.' };
    }
    return { answered: true, raw, message };
  } catch {
    return { answered: false, message: 'We could not reach Paystack. The refund is not sent yet.' };
  }
}

/**
 * Refunds a Paystack transaction (its id) by `amountCents`, under our own
 * reference: asking again with the same reference never refunds twice.
 */
export function refund(
  mode: PaystackMode,
  input: { transaction: string; amountCents: number; reference: string; note: string },
) {
  return call(mode, '/refund', {
    method: 'POST',
    body: {
      transaction: input.transaction,
      amount: input.amountCents,
      reference: input.reference,
      merchant_note: input.note.slice(0, 200),
    },
  });
}
