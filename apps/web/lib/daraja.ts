/**
 * Safaricom Daraja. Server only.
 *
 * - M-Pesa Express (STK Push) and its status query: taking payment.
 * - B2C: sending a refund to a customer's phone.
 * - C2B URL registration: hearing about Paybill payments made without a prompt.
 *
 * Amounts are whole shillings here, where the database counts cents.
 * The conversion is done here, rounding up, so we never ask for less
 * than is owed and never refund less than was paid.
 */

const HOSTS = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  live: 'https://api.safaricom.co.ke',
} as const;

function env() {
  const e = process.env;
  return {
    mode: e.DARAJA_ENV === 'live' ? ('live' as const) : ('sandbox' as const),
    key: e.DARAJA_CONSUMER_KEY?.trim(),
    secret: e.DARAJA_CONSUMER_SECRET?.trim(),
    shortcode: e.DARAJA_SHORTCODE?.trim(),
    passkey: e.DARAJA_PASSKEY?.trim(),
    callbackSecret: e.DARAJA_CALLBACK_SECRET?.trim(),
    txType: e.DARAJA_TRANSACTION_TYPE?.trim() || 'CustomerPayBillOnline',
    till: e.DARAJA_TILL_NUMBER?.trim(),
    /* B2C may live on its own Daraja app and shortcode; the keys fall back to the main app's. */
    b2cKey: e.DARAJA_B2C_CONSUMER_KEY?.trim() || e.DARAJA_CONSUMER_KEY?.trim(),
    b2cSecret: e.DARAJA_B2C_CONSUMER_SECRET?.trim() || e.DARAJA_CONSUMER_SECRET?.trim(),
    b2cShortcode: e.DARAJA_B2C_SHORTCODE?.trim(),
    b2cInitiator: e.DARAJA_B2C_INITIATOR?.trim(),
    b2cCredential: e.DARAJA_B2C_SECURITY_CREDENTIAL?.trim(),
    b2cCommand: e.DARAJA_B2C_COMMAND?.trim() || 'BusinessPayment',
  };
}

export function darajaConfigured(): boolean {
  const c = env();
  return Boolean(c.key && c.secret && c.shortcode && c.passkey && c.callbackSecret);
}

/** Refunds can go out by M-Pesa only once the B2C keys are set. */
export function b2cConfigured(): boolean {
  const c = env();
  return Boolean(
    c.b2cKey &&
      c.b2cSecret &&
      c.b2cShortcode &&
      c.b2cInitiator &&
      c.b2cCredential &&
      c.callbackSecret,
  );
}

/**
 * A customer paying the shortcode from the M-Pesa menu types an account
 * number only on a Paybill. A Till (Buy Goods) has no account number, so
 * nothing could tell which order such a payment was for.
 */
export function paybillNumber(): string | null {
  const c = env();
  if (!darajaConfigured() || c.till || c.txType !== 'CustomerPayBillOnline') return null;
  return c.shortcode ?? null;
}

/**
 * The public origin Safaricom calls back. Safaricom does not follow
 * redirects, so this must be the address that answers directly: by
 * default the one the request arrived at, which on Vercel is the
 * domain after any apex-to-www redirect. DARAJA_CALLBACK_ORIGIN
 * overrides it when that is not right.
 */
export function callbackOrigin(request: Request): string {
  const explicit = process.env.DARAJA_CALLBACK_ORIGIN?.trim().replace(/\/+$/, '');
  if (explicit) return explicit;
  const own = new URL(request.url);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(own.hostname);
  if (own.protocol === 'https:' && !local) return own.origin;
  return process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '') || own.origin;
}

export function callbackSecretValid(given: string | null): boolean {
  const s = env().callbackSecret;
  if (!s || !given || given.length !== s.length) return false;
  let diff = 0;
  for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/** 0712…, +254712…, 712… → 254712…; null if it is not a Kenyan mobile. */
export function normalisePhone(input: string): string | null {
  const d = input.replace(/\D/g, '');
  let n: string;
  if (d.startsWith('254')) n = d;
  else if (d.startsWith('0')) n = `254${d.slice(1)}`;
  else n = `254${d}`;
  return /^254[17]\d{8}$/.test(n) ? n : null;
}

/* Daraja tokens last an hour. One per app key, reused for 50 minutes, so a
   sweep of several prompts does not ask for a new token each time. */
const tokens = new Map<string, { token: string; until: number }>();

async function token(app?: { key?: string; secret?: string }): Promise<string> {
  const c = env();
  const key = app?.key ?? c.key;
  const secret = app?.secret ?? c.secret;
  const slot = `${c.mode}:${key}`;
  const held = tokens.get(slot);
  if (held && held.until > Date.now()) return held.token;

  const res = await fetch(`${HOSTS[c.mode]}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Daraja auth failed (${res.status}).`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('Daraja returned no access token.');
  tokens.set(slot, { token: body.access_token, until: Date.now() + 50 * 60 * 1000 });
  return body.access_token;
}

/** For tests: forget cached tokens. */
export function forgetDarajaTokens(): void {
  tokens.clear();
}

function timestamp(): string {
  const d = new Date(Date.now() + 3 * 3600 * 1000); // Nairobi, UTC+3
  return d.toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

export interface StkResult {
  ok: boolean;
  message: string;
  checkoutRequestId?: string;
  merchantRequestId?: string;
}

export async function stkPush(input: {
  phone: string;
  amountCents: number;
  reference: string;
  /* What the customer's M-Pesa SMS names (12 characters at most). For an order,
     its number without dashes: the same account number a Paybill payment uses. */
  accountReference?: string;
  callbackUrl: string;
  description: string;
}): Promise<StkResult> {
  const c = env();
  if (!darajaConfigured()) return { ok: false, message: 'M-Pesa is not configured.' };

  try {
    const ts = timestamp();
    const password = Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString('base64');
    const res = await fetch(`${HOSTS[c.mode]}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await token()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: c.shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: c.txType,
        Amount: Math.ceil(input.amountCents / 100),
        PartyA: input.phone,
        PartyB: c.till || c.shortcode,
        PhoneNumber: input.phone,
        CallBackURL: input.callbackUrl,
        AccountReference: (input.accountReference ?? input.reference).slice(0, 12),
        TransactionDesc: input.description.slice(0, 13),
      }),
      cache: 'no-store',
    });
    const body = (await res.json()) as {
      ResponseCode?: string;
      ResponseDescription?: string;
      CustomerMessage?: string;
      CheckoutRequestID?: string;
      MerchantRequestID?: string;
      errorMessage?: string;
    };
    if (!res.ok || body.ResponseCode !== '0' || !body.CheckoutRequestID) {
      return {
        ok: false,
        message: body.errorMessage ?? body.ResponseDescription ?? 'M-Pesa refused the request.',
      };
    }
    return {
      ok: true,
      message: body.CustomerMessage ?? 'Check your phone.',
      checkoutRequestId: body.CheckoutRequestID,
      merchantRequestId: body.MerchantRequestID,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not reach M-Pesa.' };
  }
}

export type StkQueryResult =
  | { status: 'paid' | 'failed'; resultCode: number; resultDesc: string }
  | { status: 'pending' | 'error'; message: string };

/**
 * Asks M-Pesa what became of one prompt (STK Push Query), for when its
 * callback never reached us. "Still being processed" comes back as an error
 * from Safaricom, so it is reported as pending, not as a failure.
 */
export async function stkQuery(checkoutRequestId: string): Promise<StkQueryResult> {
  const c = env();
  if (!darajaConfigured()) return { status: 'error', message: 'M-Pesa is not configured.' };

  try {
    const ts = timestamp();
    const password = Buffer.from(`${c.shortcode}${c.passkey}${ts}`).toString('base64');
    const res = await fetch(`${HOSTS[c.mode]}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await token()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: c.shortcode,
        Password: password,
        Timestamp: ts,
        CheckoutRequestID: checkoutRequestId,
      }),
      cache: 'no-store',
    });
    const body = (await res.json()) as {
      ResponseCode?: string;
      ResultCode?: string | number;
      ResultDesc?: string;
      errorCode?: string;
      errorMessage?: string;
    };
    if (body.ResultCode !== undefined && body.ResultCode !== null && body.ResultCode !== '') {
      const code = Number(body.ResultCode);
      if (!Number.isInteger(code)) return { status: 'error', message: 'Unreadable M-Pesa answer.' };
      return {
        status: code === 0 ? 'paid' : 'failed',
        resultCode: code,
        resultDesc: body.ResultDesc ?? '',
      };
    }
    return {
      status: body.errorCode === '500.001.1001' ? 'pending' : 'error',
      message: body.errorMessage ?? 'M-Pesa did not say.',
    };
  } catch (e) {
    return { status: 'error', message: e instanceof Error ? e.message : 'Could not reach M-Pesa.' };
  }
}

/**
 * What came of asking Daraja to send money.
 * - `accepted`: queued at Safaricom; the result arrives at the result URL.
 * - `refused`: Safaricom answered no, so nothing was sent and it is safe to try again.
 * - `unknown`: no clear answer (a dropped connection, an unreadable reply). Money may or
 *   may not have moved, so nobody should send again without checking the statement.
 */
export type B2cResult =
  | { outcome: 'accepted'; conversationId: string; message: string }
  | { outcome: 'refused'; message: string }
  | { outcome: 'unknown'; message: string };

/** Sends a refund to a customer's phone (B2C payment request, v3). */
export async function b2cPay(input: {
  originatorId: string;
  phone: string;
  amountCents: number;
  remarks: string;
  resultUrl: string;
  timeoutUrl: string;
  occasion?: string;
}): Promise<B2cResult> {
  const c = env();
  if (!b2cConfigured()) return { outcome: 'refused', message: 'M-Pesa refunds are not connected.' };

  let auth: string;
  try {
    auth = await token({ key: c.b2cKey, secret: c.b2cSecret });
  } catch (e) {
    /* No token, so no request went out. */
    return { outcome: 'refused', message: e instanceof Error ? e.message : 'Daraja auth failed.' };
  }

  let res: Response;
  try {
    res = await fetch(`${HOSTS[c.mode]}/mpesa/b2c/v3/paymentrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        OriginatorConversationID: input.originatorId,
        InitiatorName: c.b2cInitiator,
        SecurityCredential: c.b2cCredential,
        CommandID: c.b2cCommand,
        Amount: Math.ceil(input.amountCents / 100),
        PartyA: c.b2cShortcode,
        PartyB: input.phone,
        Remarks: input.remarks.slice(0, 100),
        QueueTimeOutURL: input.timeoutUrl,
        ResultURL: input.resultUrl,
        Occassion: (input.occasion ?? '').slice(0, 100),
      }),
      cache: 'no-store',
    });
  } catch (e) {
    return {
      outcome: 'unknown',
      message: e instanceof Error ? e.message : 'The connection to M-Pesa dropped.',
    };
  }

  let body: {
    ResponseCode?: string;
    ResponseDescription?: string;
    ConversationID?: string;
    errorCode?: string;
    errorMessage?: string;
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return {
      outcome: res.ok ? 'unknown' : 'refused',
      message: `M-Pesa answered ${res.status} without a readable reply.`,
    };
  }
  if (res.ok && body.ResponseCode === '0' && body.ConversationID) {
    return {
      outcome: 'accepted',
      conversationId: body.ConversationID,
      message: body.ResponseDescription ?? 'Accepted.',
    };
  }
  return {
    outcome: 'refused',
    message: body.errorMessage ?? body.ResponseDescription ?? `M-Pesa refused it (${res.status}).`,
  };
}

/**
 * Tells Safaricom where to report Paybill payments made from the M-Pesa
 * menu (C2B register URL). Production shortcodes accept this once; a
 * change afterwards goes through Safaricom.
 */
export async function registerPaybillUrls(input: {
  confirmationUrl: string;
  validationUrl: string;
}): Promise<{ ok: boolean; message: string }> {
  const c = env();
  const shortcode = paybillNumber();
  if (!shortcode) {
    return {
      ok: false,
      message: c.till
        ? 'This is a Till number. Buy Goods payments carry no account number, so they cannot be matched to an order.'
        : 'M-Pesa is not configured.',
    };
  }
  try {
    const res = await fetch(`${HOSTS[c.mode]}/mpesa/c2b/v2/registerurl`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        ShortCode: shortcode,
        ResponseType: 'Completed',
        ConfirmationURL: input.confirmationUrl,
        ValidationURL: input.validationUrl,
      }),
      cache: 'no-store',
    });
    const body = (await res.json().catch(() => ({}))) as {
      ResponseCode?: string;
      ResponseDescription?: string;
      errorMessage?: string;
    };
    if (res.ok && (body.ResponseCode === '0' || body.ResponseCode === '00000000')) {
      return { ok: true, message: body.ResponseDescription ?? 'Registered.' };
    }
    return {
      ok: false,
      message: body.errorMessage ?? body.ResponseDescription ?? `Safaricom answered ${res.status}.`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Could not reach M-Pesa.' };
  }
}
