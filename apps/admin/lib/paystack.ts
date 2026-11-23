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
 * The mode payouts go out in: live once NexG is live on Paystack
 * (NEXG_PAYSTACK_LIVE=1 and the live key set), test until then. Test transfers
 * move no money, and the database lets them go only to test payees.
 */
export function payoutMode(): PaystackMode | null {
  if (process.env.NEXG_PAYSTACK_LIVE === '1' && key('live')) return 'live';
  return key('test') ? 'test' : null;
}

/** "0712345678" for Paystack, from "+254712345678". */
function localNumber(e164: string): string {
  return e164.replace(/^\+254/, '0');
}

/** Paystack's recipient for an M-Pesa number, created once and reused. */
export function createMpesaRecipient(mode: PaystackMode, input: { name: string; phone: string }) {
  return call(mode, '/transferrecipient', {
    method: 'POST',
    body: {
      type: 'mobile_money',
      name: input.name.slice(0, 100),
      account_number: localNumber(input.phone),
      bank_code: 'MPESA',
      currency: 'KES',
    },
  });
}

/**
 * Sends `amountCents` from NexG's Paystack balance to a recipient, under our
 * own reference: asking again with the same reference never pays twice.
 */
export function transfer(
  mode: PaystackMode,
  input: { recipient: string; amountCents: number; reference: string; reason: string },
) {
  return call(mode, '/transfer', {
    method: 'POST',
    body: {
      source: 'balance',
      amount: input.amountCents,
      recipient: input.recipient,
      reference: input.reference,
      reason: input.reason.slice(0, 100),
      currency: 'KES',
    },
  });
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
