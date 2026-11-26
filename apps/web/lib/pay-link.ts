import 'server-only';

import crypto from 'node:crypto';

import {
  checkWithPaystack,
  problem,
  refused,
  rpc,
  startPayment,
  unavailable,
  type Client,
  type PaymentState,
  type PaymentTarget,
  type Session,
} from '@/lib/order-payment';
import { paystackMode } from '@/lib/paystack';
import { createPublicClient } from '@/lib/supabase/public';

/*
 * Pay links (supabase/migrations/20270332000500_concierge_pay_link.sql).
 * NexG Concierge orders something for a staying guest and the guest is sent
 * https://nexgapp.com/pay/link/<token>. Anybody holding the token may pay that
 * one order, without an account:
 *
 *   - the page reads the order through rpc_pay_link_view (anon, by token);
 *   - paying runs the website's own payment code (lib/order-payment.ts) from a
 *     temporary session the page starts, with rpc_pay_link_begin opening the
 *     order's payment for that session. Every later step (the Paystack try,
 *     the M-Pesa prompt, the webhook) is the one every web order uses.
 */

export const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface PayLinkView {
  ok: boolean;
  state: 'open' | 'paid' | 'cancelled' | 'expired' | 'replaced' | 'not_found';
  reference?: string;
  merchant?: string | null;
  guest_name?: string | null;
  deliver_to?: string | null;
  items?: { name: string; quantity: number; line_total_cents: number }[];
  subtotal_cents?: number;
  fees_cents?: number;
  total_cents?: number;
  expires_at?: string;
  payment?: PaymentState;
}

/** A hash of the caller's address: the database counts wrong tokens per caller without keeping the address. */
export function clientKey(headers: Headers): string | null {
  const ip =
    headers.get('x-real-ip')?.trim() || headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return ip ? crypto.createHash('sha256').update(`pay-link:${ip}`).digest('hex') : null;
}

/** The order behind a token, as the guest may see it. Null when the database cannot be reached. */
export async function readPayLink(
  token: string,
  client: string | null,
  supabase: Client = createPublicClient() as unknown as Client,
): Promise<PayLinkView | { tooMany: true } | null> {
  if (!TOKEN.test(token)) return { ok: false, state: 'not_found' };
  const { data, error } = await rpc(supabase, 'rpc_pay_link_view', {
    p_token: token,
    p_client: client,
  });
  if (error) {
    return /too many/i.test(error.message) ? { tooMany: true } : null;
  }
  return data as PayLinkView;
}

/**
 * A card try that is taking long is asked about at Paystack (the webhook
 * usually wins; this covers a late one). The database decides.
 */
export async function checkPendingCard(view: PayLinkView): Promise<boolean> {
  const p = view.payment;
  if (
    !p ||
    p.status !== 'pending' ||
    !p.attempt_reference ||
    (p.opened_seconds_ago ?? 0) < 10 ||
    (p.checked_seconds_ago != null && p.checked_seconds_ago < 10)
  ) {
    return false;
  }
  if (!paystackMode()) return false;
  await checkWithPaystack(
    createPublicClient() as unknown as Client,
    p.attempt_reference,
    p.is_test ? 'test' : 'live',
  );
  return true;
}

function linkTarget(token: string) {
  return async ({ supabase }: Session): Promise<PaymentTarget | Response> => {
    const begin = async () => {
      const begun = await rpc(supabase, 'rpc_pay_link_begin', { p_token: token });
      if (begun.error) return refused(begun.error);
      return begun.data as { reference: string; amount_cents: number };
    };
    const current = await readPayLink(token, null, supabase);
    if (!current) return unavailable();
    if ('tooMany' in current) {
      return problem(409, 'PAYMENT_REFUSED', 'Too many tries. Wait a few minutes and try again.');
    }
    if (current.state === 'paid') {
      return Response.json(
        { status: 'paid', reference: current.reference },
        { headers: { 'Cache-Control': 'private, no-store' } },
      );
    }
    if (current.state !== 'open') {
      return problem(
        409,
        'PAYMENT_REFUSED',
        current.state === 'not_found'
          ? 'This pay link is not valid. Open the link from your message again.'
          : current.state === 'replaced'
            ? 'A newer pay link was sent for this order. Use the latest message.'
            : current.state === 'expired'
              ? 'This pay link has expired. Nothing is owed.'
              : 'This order was cancelled. Nothing is owed.',
      );
    }
    return {
      readState: async () => {
        const again = await readPayLink(token, null, supabase);
        if (!again || 'tooMany' in again) return unavailable();
        return again.payment ?? { status: 'unpaid' };
      },
      begin,
      metadata: { pay_link: true, order_reference: current.reference },
      daraja: {
        begin,
        accountReference: async () =>
          current.reference
            ?.replace(/[^A-Za-z0-9]/g, '')
            .toUpperCase()
            .slice(0, 12),
        description: 'NexG order',
        notReady: 'M-Pesa is not connected yet. Pay by card, or try again later.',
      },
      callbackUrl: (site) => `${site}/pay/link/${token}`,
    };
  };
}

/** POST /api/customer/checkout/pay-links/{token}/payment: {method, phone?}. */
export function startPayLinkPayment(request: Request, token: string) {
  if (!TOKEN.test(token)) {
    return Promise.resolve(problem(404, 'NOT_FOUND', 'This pay link is not valid.'));
  }
  return startPayment(request, linkTarget(token));
}
