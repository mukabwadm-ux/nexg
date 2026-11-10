import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Pay by bank. Server only.
 *
 * NexG talks to a bank through a provider adapter. The flow is the same for
 * every bank:
 *
 *   1. NexG opens a collection at the bank for a NexG payment reference and
 *      gets back a page where the customer approves it.
 *   2. The customer approves (or declines) at the bank.
 *   3. The bank sends a signed event to /api/payments/bank/webhook. Only that
 *      signed event, verified again in the database, marks the order paid.
 *      NexG can also fetch the latest signed event from the bank when a
 *      webhook is late.
 *
 * Signatures: `X-Bank-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of
 * "<t>.<raw body>">` with BANK_WEBHOOK_SECRET, refused when more than five
 * minutes off. Amounts are in cents, the unit the payment tables use.
 *
 * The only provider today is the NexG Sandbox Bank (apps/bank-sandbox). It is
 * refused on the production deployment, so a sandbox approval can never be
 * taken for real money.
 */

export const BANK_SIGNATURE_HEADER = 'x-bank-signature';
const TOLERANCE_SECONDS = 300;

export type Env = Record<string, string | undefined>;

export interface BankResult<T> {
  ok: boolean;
  data?: T;
  message: string;
}

export interface OpenCollection {
  reference: string;
  amountCents: number;
  currency: string;
  description: string;
  customer: { name?: string | null; email?: string | null; phone?: string | null };
  callbackUrl: string;
  returnUrl: string;
}

export interface BankCollection {
  id: string;
  status: string;
  checkoutUrl: string;
}

export interface SignedEvent {
  body: string;
  signature: string;
  status: string | null;
}

export interface BankProvider {
  /** Stored as payment.provider. Always starts "bank_". */
  readonly id: `bank_${string}`;
  readonly name: string;
  readonly livemode: boolean;
  openCollection(input: OpenCollection): Promise<BankResult<BankCollection>>;
  latestEvent(collectionId: string): Promise<BankResult<SignedEvent>>;
  cancelCollection(collectionId: string): Promise<BankResult<null>>;
}

interface BankConfig {
  provider: 'sandbox';
  apiUrl: string;
  apiKey: string;
  webhookSecret: string;
}

/** The bank settings, or why there are none. */
export function bankConfig(env: Env = process.env): BankConfig | { error: string } {
  const provider = env.BANK_PROVIDER?.trim();
  if (!provider) return { error: 'No bank is connected (BANK_PROVIDER is not set).' };
  if (provider !== 'sandbox') return { error: `Unknown BANK_PROVIDER "${provider}".` };
  if (env.VERCEL_ENV === 'production') {
    return { error: 'The sandbox bank is not available on the production site.' };
  }
  const apiUrl = env.BANK_API_URL?.trim().replace(/\/+$/, '') ?? '';
  const apiKey = env.BANK_API_KEY?.trim() ?? '';
  const webhookSecret = env.BANK_WEBHOOK_SECRET?.trim() ?? '';
  if (!/^https?:\/\//.test(apiUrl)) return { error: 'Set BANK_API_URL to the bank API address.' };
  if (apiKey.length < 24) return { error: 'Set BANK_API_KEY (24 or more characters).' };
  if (webhookSecret.length < 32)
    return { error: 'Set BANK_WEBHOOK_SECRET (32 or more characters).' };
  return { provider, apiUrl, apiKey, webhookSecret };
}

export function bankCheckoutEnabled(env: Env = process.env) {
  return !('error' in bankConfig(env));
}

export function bankWebhookSecret(env: Env = process.env) {
  const config = bankConfig(env);
  return 'error' in config ? null : config.webhookSecret;
}

export function bankProvider(
  env: Env = process.env,
  fetchImpl: typeof fetch = fetch,
): BankProvider | null {
  const config = bankConfig(env);
  if ('error' in config) return null;
  return sandboxProvider(config, fetchImpl);
}

export function signBankPayload(body: string, secret: string, now = Date.now()) {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}

export function verifyBankSignature(
  body: string,
  header: string | null | undefined,
  secret: string,
  now = Date.now(),
) {
  const match = /^t=(\d{9,12}),v1=([0-9a-f]{64})$/.exec(header ?? '');
  if (!match) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(match[1])) > TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${match[1]}.${body}`).digest();
  const given = Buffer.from(match[2]!, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ───────────────────────────────────────────── NexG Sandbox Bank adapter

function sandboxProvider(config: BankConfig, fetchImpl: typeof fetch): BankProvider {
  async function call(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
    try {
      const res = await fetchImpl(`${config.apiUrl}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          'content-type': 'application/json',
          ...(init.idempotencyKey ? { 'idempotency-key': init.idempotencyKey } : {}),
        },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      });
      return { res, text: await res.text() };
    } catch {
      return null;
    }
  }
  const unreachable = {
    ok: false,
    message: 'The bank could not be reached. Try again in a moment.',
  };
  const refused = (text: string) => {
    try {
      const e = (JSON.parse(text) as { error?: { message?: string } }).error;
      return { ok: false, message: e?.message ?? 'The bank refused the request.' };
    } catch {
      return { ok: false, message: 'The bank refused the request.' };
    }
  };

  return {
    id: 'bank_sandbox',
    name: 'NexG Sandbox Bank',
    livemode: false,

    async openCollection(input) {
      const r = await call('/v1/collections', {
        method: 'POST',
        // One collection per NexG payment reference.
        idempotencyKey: input.reference,
        body: JSON.stringify({
          merchant_reference: input.reference,
          amount: input.amountCents,
          currency: input.currency,
          description: input.description,
          customer: input.customer,
          callback_url: input.callbackUrl,
          return_url: input.returnUrl,
        }),
      });
      if (!r) return unreachable;
      if (!r.res.ok) return refused(r.text);
      const c = JSON.parse(r.text) as { id: string; status: string; checkout_url: string };
      return {
        ok: true,
        message: 'opened',
        data: { id: c.id, status: c.status, checkoutUrl: c.checkout_url },
      };
    },

    async latestEvent(collectionId) {
      const r = await call(`/v1/collections/${encodeURIComponent(collectionId)}/event`);
      if (!r) return unreachable;
      if (!r.res.ok) return refused(r.text);
      const signature = r.res.headers.get(BANK_SIGNATURE_HEADER) ?? '';
      if (!verifyBankSignature(r.text, signature, config.webhookSecret)) {
        return { ok: false, message: 'The bank answer was not signed correctly.' };
      }
      let status: string | null = null;
      try {
        status = (JSON.parse(r.text) as { data?: { status?: string } }).data?.status ?? null;
      } catch {
        /* the database will say it is unreadable */
      }
      return { ok: true, message: 'fetched', data: { body: r.text, signature, status } };
    },

    async cancelCollection(collectionId) {
      const r = await call(`/v1/collections/${encodeURIComponent(collectionId)}/cancel`, {
        method: 'POST',
      });
      if (!r) return unreachable;
      return r.res.ok ? { ok: true, message: 'cancelled', data: null } : refused(r.text);
    },
  };
}
