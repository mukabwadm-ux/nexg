/*
 * The website's pages pay through the same route as the apps:
 * POST /api/customer/checkout/orders/{orderId}/payment (lib/order-payment.ts),
 * signed in with the website's own session cookie.
 */

export type PayChoice = { method: 'mpesa_stk'; phone: string } | { method: 'bank_transfer' };

export interface PayOutcome {
  ok: boolean;
  status?: 'unpaid' | 'pending' | 'failed' | 'paid';
  reference?: string;
  /** A page to open: the bank's, or Paystack's for a card. */
  url?: string;
  retryAfterSeconds?: number;
  message?: string;
}

export async function payOrder(orderId: string, choice: PayChoice): Promise<PayOutcome> {
  const res = await fetch(`/api/customer/checkout/orders/${encodeURIComponent(orderId)}/payment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(choice),
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: PayOutcome['status'];
    reference?: string;
    url?: string;
    retryAfterSeconds?: number;
    title?: string;
  };
  if (!res.ok) {
    return {
      ok: false,
      reference: body.reference,
      retryAfterSeconds: body.retryAfterSeconds,
      message: body.title,
    };
  }
  return {
    ok: true,
    status: body.status,
    reference: body.reference,
    url: body.url,
    retryAfterSeconds: body.retryAfterSeconds,
  };
}
