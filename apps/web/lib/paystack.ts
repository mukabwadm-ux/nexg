import 'server-only';

import crypto from 'node:crypto';

import { paystackSecret } from '@/lib/paystack-keys';

/**
 * Paystack, server only (owner, 21 Nov 2026: one company Paystack account;
 * card, M-Pesa and Airtel Money all through it).
 *
 * The secret keys never reach a browser or a phone. Two may be set:
 *   PAYSTACK_TEST_SECRET_KEY  test mode, no money moves
 *   PAYSTACK_LIVE_SECRET_KEY  live mode, used only while NEXG_PAYSTACK_LIVE=1
 * The same values sit in Supabase Vault (paystack_test_secret_key,
 * paystack_live_secret_key): the database accepts the key as proof that a
 * call comes from this server, and checks webhooks with it again.
 *
 * With PAYSTACK_KEYS_TOKEN set, the keys come from Vault alone and the two
 * variables above are ignored (lib/paystack-keys.ts). Whatever reads a key
 * here awaits loadPaystackKeys() first.
 *
 * Amounts are in the currency's smallest unit (KES cents), the unit the
 * order tables use, so nothing is converted here.
 */

const BASE = 'https://api.paystack.co';

export type PaystackMode = 'test' | 'live';

export interface PaystackResult<T> {
  ok: boolean;
  data?: T;
  /** The whole answer as Paystack sent it, for the database to check. */
  raw?: string;
  /** Paystack answered and refused (a 4xx), as opposed to not answering. */
  refused?: boolean;
  /** Paystack's HTTP status when it answered with an error. */
  status?: number;
  message: string;
}

function key(mode: PaystackMode): string | null {
  const value = paystackSecret(mode)?.trim();
  if (!value) return null;
  /* A key in the wrong slot is refused rather than used. */
  if (mode === 'live' ? !value.startsWith('sk_live_') : !value.startsWith('sk_test_')) return null;
  return value;
}

/**
 * The mode new payments start in: live only once the owner has set the live
 * key and switched NEXG_PAYSTACK_LIVE on; test while only the test key is set;
 * null when neither is usable.
 */
export function paystackMode(): PaystackMode | null {
  if (process.env.NEXG_PAYSTACK_LIVE?.trim() === '1' && key('live')) return 'live';
  return key('test') ? 'test' : null;
}

/** Whether any Paystack key is set (a webhook may come from either mode). */
export function paystackConfigured(): boolean {
  return key('test') !== null || key('live') !== null;
}

/** The key as proof for the database, or null when that mode is not set. */
export function paystackProof(mode: PaystackMode): string | null {
  return key(mode);
}

async function call<T>(
  mode: PaystackMode,
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
): Promise<PaystackResult<T>> {
  const secret = key(mode);
  if (!secret) return { ok: false, message: 'Paystack is not connected.' };

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method: init.method,
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Paystack did not answer in time. Nothing was charged.'
          : 'We could not reach Paystack. Nothing was charged.',
    };
  }

  const raw = await response.text();
  let body: { status?: boolean; message?: string; data?: T };
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return { ok: false, message: 'Paystack sent something we could not read.' };
  }
  if (!response.ok || body.status !== true) {
    return {
      ok: false,
      refused: response.status >= 400 && response.status < 500,
      status: response.status,
      raw,
      message: body.message?.slice(0, 300) ?? `Paystack refused (${response.status}).`,
    };
  }
  return { ok: true, data: body.data, raw, message: body.message ?? 'Done.' };
}

/**
 * A split payment: Paystack sends the merchant's share to its sub-account as
 * the customer pays. The database decides it (rpc_payment_paystack_attempt):
 * NexG's part as a flat charge in cents, and NexG bears Paystack's fee.
 */
export interface Split {
  subaccount: string;
  transaction_charge: number;
  bearer: 'account';
}

function splitFields(split: Split | undefined) {
  return split
    ? {
        subaccount: split.subaccount,
        transaction_charge: split.transaction_charge,
        bearer: split.bearer,
      }
    : {};
}

export interface CheckoutInput {
  reference: string;
  amountCents: number;
  email: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  split?: Split;
}

/** Opens Paystack's checkout page for a card payment. */
export function openCheckout(mode: PaystackMode, input: CheckoutInput) {
  return call<{ authorization_url: string; access_code: string; reference: string }>(
    mode,
    '/transaction/initialize',
    {
      method: 'POST',
      body: {
        reference: input.reference,
        amount: input.amountCents,
        email: input.email,
        currency: 'KES',
        channels: ['card'],
        callback_url: input.callbackUrl,
        /* Initialize takes metadata as a string; cancel_action is where
           Paystack's "Cancel payment" goes. */
        metadata: JSON.stringify({ ...input.metadata, cancel_action: input.callbackUrl }),
        ...splitFields(input.split),
      },
    },
  );
}

export interface PromptInput {
  reference: string;
  amountCents: number;
  email: string;
  /** +2547â€¦ or +2541â€¦ */
  phone: string;
  provider: 'mpesa' | 'atl';
  metadata?: Record<string, unknown>;
  split?: Split;
}

/** Sends an M-Pesa or Airtel Money prompt to the customer's phone. */
export function sendPrompt(mode: PaystackMode, input: PromptInput) {
  return call<{ reference: string; status: string; display_text?: string }>(mode, '/charge', {
    method: 'POST',
    body: {
      reference: input.reference,
      amount: input.amountCents,
      email: input.email,
      currency: 'KES',
      mobile_money: { phone: input.phone, provider: input.provider },
      metadata: input.metadata ?? {},
      ...splitFields(input.split),
    },
  });
}

export interface SavedCardInput {
  reference: string;
  amountCents: number;
  /** The email the card was saved under; Paystack ties the authorization to it. */
  email: string;
  authorizationCode: string;
  metadata?: Record<string, unknown>;
  split?: Split;
}

/**
 * Charges a saved card (a reusable authorization) with no page. The bank may
 * still want the customer: then Paystack's answer is not "success", and the
 * webhook, or a later check, decides.
 */
export function chargeSavedCard(mode: PaystackMode, input: SavedCardInput) {
  return call<{ status: string; reference: string; paused?: boolean; authorization_url?: string }>(
    mode,
    '/transaction/charge_authorization',
    {
      method: 'POST',
      body: {
        reference: input.reference,
        amount: input.amountCents,
        email: input.email,
        currency: 'KES',
        authorization_code: input.authorizationCode,
        metadata: input.metadata ?? {},
        ...splitFields(input.split),
      },
    },
  );
}

/** Switches a removed card's authorization off at Paystack. Best effort. */
export function deactivateSavedCard(mode: PaystackMode, authorizationCode: string) {
  return call<unknown>(mode, '/customer/authorization/deactivate', {
    method: 'POST',
    body: { authorization_code: authorizationCode },
  });
}

/** Asks Paystack what happened to an attempt. The raw answer goes to the database. */
export function verify(mode: PaystackMode, reference: string) {
  return call<{ status: string; reference: string }>(
    mode,
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: 'GET' },
  );
}

/**
 * Which mode's secret key signed a webhook body (x-paystack-signature,
 * HMAC-SHA512 of the raw bytes, hex), or null. Compared in constant time.
 */
export function signatureMode(rawBody: string, signature: string | null): PaystackMode | null {
  if (!signature || !/^[0-9a-f]{128}$/.test(signature)) return null;
  const given = Buffer.from(signature, 'hex');
  for (const mode of ['test', 'live'] as const) {
    const secret = key(mode);
    if (!secret) continue;
    const expected = crypto.createHmac('sha512', secret).update(rawBody, 'utf8').digest();
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return mode;
  }
  return null;
}

/**
 * Whether the payments worker call came from the database's Paystack sweep:
 * HMAC-SHA256 of "paystack-sweep:<unix minute>" with a Paystack secret key,
 * for this minute or the one before.
 */
export function sweepSignatureValid(header: string | null, now = Date.now()): boolean {
  if (!header || !/^[0-9a-f]{64}$/.test(header)) return false;
  const given = Buffer.from(header, 'hex');
  const minute = Math.floor(now / 60_000);
  for (const mode of ['test', 'live'] as const) {
    const secret = key(mode);
    if (!secret) continue;
    for (const m of [minute, minute - 1]) {
      const expected = crypto.createHmac('sha256', secret).update(`paystack-sweep:${m}`).digest();
      if (crypto.timingSafeEqual(expected, given)) return true;
    }
  }
  return false;
}

/**
 * Paystack needs an email for every payment. A guest has none, so the
 * payment's own receipt address stands in; NexG sends its own receipt.
 */
export function payerEmail(userEmail: string | null | undefined, reference: string): string {
  const email = userEmail?.trim();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200) return email;
  return `${reference.toLowerCase().replace(/[^a-z0-9-]/g, '')}@receipts.nexgapp.com`;
}

/** "0712345678" for Paystack, from "+254712345678". */
function localNumber(e164: string): string {
  return e164.replace(/^\+254/, '0');
}

/**
 * Paystack's recipient for a rider's M-Pesa number (riders' automatic
 * payouts; the console has its own copy for Finance's presses).
 */
export function createMpesaRecipient(mode: PaystackMode, input: { name: string; phone: string }) {
  return call<{ recipient_code: string }>(mode, '/transferrecipient', {
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
  return call<{ status: string; transfer_code: string; reference: string }>(mode, '/transfer', {
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

/** What Paystack knows of a transfer under our reference (a 404 when it was never sent). */
export function verifyTransfer(mode: PaystackMode, reference: string) {
  return call<{ status: string; transfer_code: string; reference: string }>(
    mode,
    `/transfer/verify/${encodeURIComponent(reference)}`,
    { method: 'GET' },
  );
}

/**
 * Refunds a Paystack transaction (its id) by `amountCents`, under our own
 * reference (the console's copy is apps/admin/lib/paystack.ts). Paystack's
 * answer only says it was asked: the refund is done when its refund.processed
 * webhook says so.
 */
export function refund(
  mode: PaystackMode,
  input: { transaction: string; amountCents: number; reference: string; note: string },
) {
  return call<{ status?: string; id?: number }>(mode, '/refund', {
    method: 'POST',
    body: {
      transaction: input.transaction,
      amount: input.amountCents,
      reference: input.reference,
      merchant_note: input.note.slice(0, 200),
    },
  });
}
