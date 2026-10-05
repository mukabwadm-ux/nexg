import crypto from 'node:crypto';

/**
 * Paystack, admin side.
 *
 * The console only ever sends money *back* — a refund — so this is
 * the narrow half of the web app's client. Nothing here can take a
 * payment, which means a mistake in the console cannot charge
 * anybody.
 */

const BASE = 'https://api.paystack.co';

function secret(): string | null {
  const k = process.env.PAYSTACK_SECRET_KEY?.trim();
  return k && k.length > 0 ? k : null;
}

export function paystackConfigured(): boolean {
  return secret() !== null;
}

export interface RefundResult {
  ok: boolean;
  providerRef?: string;
  message: string;
}

export async function refund(input: {
  transactionRef: string;
  amountCents: number;
  reason: string;
}): Promise<RefundResult> {
  const key = secret();
  if (!key) {
    return {
      ok: false,
      message:
        'No payment provider is connected, so this refund stays recorded rather than sent. Set PAYSTACK_SECRET_KEY and the same button moves it.',
    };
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction: input.transactionRef,
        amount: input.amountCents,
        merchant_note: input.reason.slice(0, 200),
      }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return {
      ok: false,
      message: 'We could not reach the payment provider. The refund is still approved and unsent.',
    };
  }

  let body: { status?: boolean; message?: string; data?: { id?: number | string } };
  try {
    body = (await response.json()) as typeof body;
  } catch {
    return { ok: false, message: 'The provider sent something we could not read.' };
  }

  if (!response.ok || body.status === false) {
    return { ok: false, message: body.message ?? `The provider refused (${response.status}).` };
  }

  return {
    ok: true,
    providerRef: body.data?.id ? String(body.data.id) : undefined,
    message: 'Sent. It reaches them on the provider’s own schedule, usually a few days.',
  };
}

/** Same constant-time check as the web app, for any callback here. */
export function signatureValid(rawBody: string, signature: string | null): boolean {
  const key = secret();
  if (!key || !signature) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
