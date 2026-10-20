/**
 * Safaricom Daraja (M-Pesa Express / STK Push). Server only.
 *
 * Amounts are whole shillings here, where the database counts cents.
 * The conversion is done once, in `stkPush`, rounding up so we never
 * ask for less than is owed.
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
  };
}

export function darajaConfigured(): boolean {
  const c = env();
  return Boolean(c.key && c.secret && c.shortcode && c.passkey && c.callbackSecret);
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

async function token(): Promise<string> {
  const c = env();
  const res = await fetch(`${HOSTS[c.mode]}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${Buffer.from(`${c.key}:${c.secret}`).toString('base64')}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Daraja auth failed (${res.status}).`);
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('Daraja returned no access token.');
  return body.access_token;
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
        AccountReference: input.reference.slice(0, 12),
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
