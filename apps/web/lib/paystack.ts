import crypto from 'node:crypto';

/**
 * Paystack, as thin a wrapper as the job allows.
 *
 * Server only. The secret key must never reach a browser, so every
 * function here reads it at call time and refuses rather than
 * falling back to anything.
 *
 * Two things this is careful about:
 *
 *   * Amounts. Paystack counts in the smallest unit of the
 *     currency, which for KES is cents — the same unit the order
 *     tables use. No conversion happens anywhere, deliberately,
 *     because a conversion in one direction is a conversion
 *     somebody eventually forgets in the other.
 *   * Signatures. A webhook body is attacker-controlled until the
 *     HMAC verifies. It is compared in constant time, because a
 *     byte-by-byte comparison leaks the signature one byte at a
 *     time to anybody patient.
 */

const BASE = 'https://api.paystack.co';

export interface PaystackResult<T> {
  ok: boolean;
  data?: T;
  message: string;
}

function secret(): string | null {
  const k = process.env.PAYSTACK_SECRET_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

export function paystackConfigured(): boolean {
  return secret() !== null;
}

/** Live keys start `sk_live_`; everything else is a sandbox. */
export function paystackMode(): 'live' | 'test' | 'off' {
  const k = secret();
  if (!k) return 'off';
  return k.startsWith('sk_live_') ? 'live' : 'test';
}

async function call<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<PaystackResult<T>> {
  const key = secret();
  if (!key) {
    return {
      ok: false,
      message:
        'No payment provider is connected. Set PAYSTACK_SECRET_KEY and nothing else has to change.',
    };
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      /* A checkout that hangs is worse than one that fails: the
         guest sits on a spinner and nobody learns anything. */
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'The payment provider did not answer in time. Nothing was charged.'
          : 'We could not reach the payment provider. Nothing was charged.',
    };
  }

  let body: { status?: boolean; message?: string; data?: T };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { ok: false, message: 'The payment provider sent something we could not read.' };
  }

  if (!response.ok || body.status === false) {
    return { ok: false, message: body.message ?? `The provider refused (${response.status}).` };
  }
  return { ok: true, data: body.data, message: body.message ?? 'Done.' };
}

export interface InitialiseInput {
  reference: string;
  amountCents: number;
  email: string;
  currency?: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  /** Restrict what the guest may pay with. Empty means all of them. */
  channels?: ('card' | 'mobile_money' | 'bank_transfer' | 'ussd')[];
}

/**
 * Open a checkout.
 *
 * `reference` is ours, generated before this is called, so the row
 * exists before Paystack has heard of it. A provider reference we
 * learned about afterwards would leave a window in which money
 * moved against nothing.
 */
export async function initialise(
  input: InitialiseInput,
): Promise<PaystackResult<{ authorization_url: string; access_code: string; reference: string }>> {
  return call('/transaction/initialize', {
    method: 'POST',
    body: {
      reference: input.reference,
      /* Already the smallest unit. */
      amount: input.amountCents,
      email: input.email,
      currency: input.currency ?? 'KES',
      callback_url: input.callbackUrl,
      metadata: input.metadata ?? {},
      ...(input.channels?.length ? { channels: input.channels } : {}),
    },
  });
}

export interface Verified {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel: string | null;
  id: number;
  gateway_response: string | null;
}

/**
 * Ask the provider what really happened.
 *
 * Used on the return leg, where the browser's claim is worth
 * nothing — anybody can reach the success URL. The webhook is
 * still the thing that moves the order; this only lets the page
 * tell the guest the truth a second earlier than the webhook
 * might.
 */
export async function verify(reference: string): Promise<PaystackResult<Verified>> {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' });
}

/**
 * Send money back.
 *
 * Paystack refunds against the original transaction, so the
 * provider reference of the payment is required — which is why
 * `refunds_to_issue_v` carries it.
 */
export async function refund(input: {
  transactionRef: string;
  amountCents?: number;
  reason: string;
}): Promise<PaystackResult<{ id: number; status: string }>> {
  return call('/refund', {
    method: 'POST',
    body: {
      transaction: input.transactionRef,
      ...(input.amountCents ? { amount: input.amountCents } : {}),
      merchant_note: input.reason.slice(0, 200),
    },
  });
}

/**
 * Whether a webhook body really came from Paystack.
 *
 * HMAC-SHA512 of the raw body with the secret key. The *raw* body
 * matters: parsing and re-serialising JSON changes key order and
 * whitespace, and the signature is over bytes.
 */
export function signatureValid(rawBody: string, signature: string | null): boolean {
  const key = secret();
  if (!key || !signature) return false;

  const expected = crypto.createHmac('sha512', key).update(rawBody, 'utf8').digest('hex');

  /* Constant time. A plain `===` returns early on the first byte
     that differs, which tells a patient attacker how much of a
     guess was right. */
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * A stable name for one delivery of one event.
 *
 * Paystack sends no event id and retries on any non-200, so
 * without this a retry would be processed as a second payment.
 * The digest covers the whole body, so a genuine second event —
 * a refund after a charge, say — hashes differently.
 */
export function dedupeKey(rawBody: string): string {
  return crypto.createHash('sha256').update(rawBody, 'utf8').digest('hex');
}
