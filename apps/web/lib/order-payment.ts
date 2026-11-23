import 'server-only';

import { z } from 'zod';

import {
  chargeSavedCard,
  openCheckout,
  payerEmail,
  paystackMode,
  paystackProof,
  sendPrompt,
  verify,
  type PaystackMode,
} from '@/lib/paystack';
import { startBankPayment } from '@/lib/bank/payments';
import { callbackOrigin, normalisePhone } from '@/lib/daraja';
import { sendMpesaPrompt } from '@/lib/mpesa-prompt';
import { mpesaProvider, paymentSetup } from '@/lib/payment-methods';
import { customerApiClient } from '@/lib/supabase/customer-api';
import { createClient as cookieClient } from '@/lib/supabase/server';

/**
 * The one way to pay for an order, for the website and every app (shared
 * services, payments). The caller signs in with a Supabase bearer token (the
 * apps, guest sessions included) or the website's own session cookie:
 *
 *   GET  /api/customer/checkout/orders/{orderId}/payment
 *   POST /api/customer/checkout/orders/{orderId}/payment
 *        {"method":"mpesa_stk"|"airtel_money", "phone":"0712 345 678"}
 *        {"method":"card", "saveCard"?: true} | {"method":"saved_card", "cardId"}
 *        {"method":"bank_transfer"}
 *
 * Both answer {status: unpaid|pending|failed|paid, reference?, retryAfterSeconds?,
 * url?, test?}. `url` is a page to open: Paystack's checkout for a card, or the
 * bank's page for a bank transfer. Coming back from it never counts as paid:
 * only the provider's signed callback, or an answer this server fetched, marks
 * the order paid. Which methods are on offer: lib/payment-methods.ts, served at
 * GET /api/customer/checkout/payment-methods.
 */

const headers = { 'Cache-Control': 'private, no-store' };
const orderId = z.string().uuid();
const startInput = z.discriminatedUnion('method', [
  /* saveCard: keep the card for next time (accounts only; ignored for a guest). */
  z.object({ method: z.literal('card'), saveCard: z.boolean().optional() }).strict(),
  z.object({ method: z.literal('saved_card'), cardId: z.string().uuid() }).strict(),
  z
    .object({
      method: z.enum(['mpesa_stk', 'airtel_money']),
      /* +254712345678, 254712345678 or 0712 345 678: normalised below. */
      phone: z
        .string()
        .max(20)
        .transform((v) => normalisePhone(v))
        .refine((v): v is string => v !== null),
    })
    .strict(),
  z.object({ method: z.literal('bank_transfer') }).strict(),
]);

type Client = ReturnType<typeof customerApiClient>;
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

function rpc(client: Client, fn: string, args: Record<string, unknown>) {
  /* Called through the client so `this` stays bound. These functions are newer
     than the generated types. */
  return (client as unknown as { rpc: Rpc }).rpc(fn, args);
}

export interface OrderPaymentView {
  status: 'unpaid' | 'pending' | 'failed' | 'paid';
  reference?: string;
  retryAfterSeconds?: number;
  url?: string;
  test?: boolean;
}

interface PaymentState {
  status: OrderPaymentView['status'];
  reference?: string;
  attempt_reference?: string;
  channel?: string;
  is_test?: boolean;
  opened_seconds_ago?: number;
  checked_seconds_ago?: number | null;
  retry_after_seconds?: number | null;
  authorization_url?: string | null;
}

type Code =
  | 'AUTH_REQUIRED'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'PAYMENT_UNAVAILABLE'
  | 'PAYMENT_REFUSED'
  | 'SERVICE_UNAVAILABLE';

function problem(
  status: number,
  code: Code,
  title: string,
  extra: { reference?: string; retryAfterSeconds?: number } = {},
) {
  return Response.json(
    { type: 'about:blank', title, status, code, ...extra },
    { status, headers: { ...headers, 'Content-Type': 'application/problem+json' } },
  );
}

const signIn = () => problem(401, 'AUTH_REQUIRED', 'Sign in, or continue as a guest, to pay.');
const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Payment is unavailable right now. Try again shortly.');
const paymentUnavailable = () =>
  problem(503, 'PAYMENT_UNAVAILABLE', 'Paying in the app is not switched on yet.');

/** A database refusal, in the customer's words where the database gave some. */
function refused(error: { code?: string; message: string }) {
  if (error.code === '42501') return signIn();
  if (error.code === 'P0001' && /No such order/i.test(error.message)) {
    return problem(404, 'NOT_FOUND', 'No such order.');
  }
  if (error.code === 'P0001' || error.code === '22023') {
    return problem(409, 'PAYMENT_REFUSED', error.message.replace(/^.*?:\s*/, '').slice(0, 200));
  }
  return unavailable();
}

async function signedIn(request: Request) {
  const header = request.headers.get('authorization');
  const token = /^Bearer ([\w.-]{1,4096})$/i.exec(header ?? '')?.[1];
  /* An app sends its session as a bearer token; the website's own pages send
     their session cookie. */
  if (header && !token) return signIn();
  const supabase = token ? customerApiClient(token) : cookieClient();
  const {
    data: { user },
    error,
  } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  if (error) {
    if (!token && error.name === 'AuthSessionMissingError') return signIn();
    return [400, 401, 403].includes(error.status ?? 0) ? signIn() : unavailable();
  }
  if (!user) return signIn();
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    supabase,
    email: user.email ?? null,
    name: typeof meta.full_name === 'string' ? meta.full_name : null,
  };
}

function view(state: PaymentState): OrderPaymentView {
  return {
    status: state.status,
    ...(state.reference ? { reference: state.reference } : {}),
    ...(typeof state.retry_after_seconds === 'number' && state.retry_after_seconds > 0
      ? { retryAfterSeconds: Math.min(3600, state.retry_after_seconds) }
      : {}),
    ...(state.status === 'pending' && state.authorization_url
      ? { url: state.authorization_url }
      : {}),
    ...(state.is_test ? { test: true } : {}),
  };
}

async function readState(supabase: Client, id: string): Promise<PaymentState | Response> {
  const result = await rpc(supabase, 'rpc_order_payment_state', { p_order_id: id });
  if (result.error) return refused(result.error);
  const state = result.data as PaymentState | null;
  if (!state || !['unpaid', 'pending', 'failed', 'paid'].includes(state.status)) {
    return unavailable();
  }
  return state;
}

/**
 * Asks Paystack about a pending attempt and hands the answer to the database,
 * which alone decides. At most every 10 seconds per attempt, so a polling
 * screen cannot hammer Paystack.
 */
export async function checkWithPaystack(
  supabase: Client,
  attemptReference: string,
  mode: PaystackMode,
): Promise<void> {
  const proof = paystackProof(mode);
  if (!proof) return;
  const answer = await verify(mode, attemptReference);
  if (!answer.raw) return;
  await rpc(supabase, 'rpc_payment_paystack_verified', {
    p_attempt_reference: attemptReference,
    p_verify_body: answer.raw,
    p_proof: proof,
  });
}

/**
 * The payments worker's Paystack sweep: asks Paystack about attempts whose
 * webhook is late (the customer closed the app, or Paystack's call failed).
 */
export async function sweepPaystack(
  client: Client,
): Promise<{ checked: number; skipped?: string }> {
  const mode = paystackMode();
  const proof = mode ? paystackProof(mode) : null;
  if (!proof) return { checked: 0, skipped: 'no Paystack key' };
  const due = await rpc(client, 'rpc_payment_paystack_due', { p_proof: proof });
  if (due.error) return { checked: 0, skipped: due.error.message.slice(0, 200) };
  const rows = (due.data as { attempt_reference: string; is_test: boolean }[] | null) ?? [];
  let checked = 0;
  for (const row of rows) {
    await checkWithPaystack(client, row.attempt_reference, row.is_test ? 'test' : 'live');
    checked += 1;
  }
  return { checked };
}

export async function readOrderPayment(request: Request, rawOrderId: string) {
  try {
    const parsedId = orderId.safeParse(rawOrderId);
    if (!parsedId.success) return problem(404, 'NOT_FOUND', 'No such order.');
    const session = await signedIn(request);
    if (session instanceof Response) return session;

    let state = await readState(session.supabase, parsedId.data);
    if (state instanceof Response) return state;

    if (
      state.status === 'pending' &&
      state.attempt_reference &&
      (state.opened_seconds_ago ?? 0) >= 10 &&
      (state.checked_seconds_ago == null || state.checked_seconds_ago >= 10)
    ) {
      await checkWithPaystack(
        session.supabase,
        state.attempt_reference,
        state.is_test ? 'test' : 'live',
      );
      const again = await readState(session.supabase, parsedId.data);
      if (!(again instanceof Response)) state = again;
    }
    return Response.json(view(state), { headers });
  } catch {
    return unavailable();
  }
}

interface Attempt {
  attempt_reference: string;
  channel: 'card' | 'mpesa' | 'airtel' | 'saved_card';
  amount_cents: number;
  is_test: boolean;
  reused: boolean;
  authorization_url?: string;
  retry_after_seconds?: number;
  /* Saved card only: what the server charges. Never sent on to the phone. */
  authorization_code?: string;
  email?: string;
}

/** Paystack's own checkout pages only. */
function checkoutPage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.paystack.com'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export async function startOrderPayment(request: Request, rawOrderId: string) {
  try {
    const parsedId = orderId.safeParse(rawOrderId);
    if (!parsedId.success) return problem(404, 'NOT_FOUND', 'No such order.');
    const session = await signedIn(request);
    if (session instanceof Response) return session;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return problem(422, 'INVALID_REQUEST', 'Choose card, M-Pesa or Airtel Money.');
    }
    const input = startInput.safeParse(body);
    if (!input.success) {
      return problem(
        422,
        'INVALID_REQUEST',
        'Choose card, or enter a Kenyan mobile number like 0712 345 678.',
      );
    }

    const choice = input.data;
    if (choice.method === 'bank_transfer') {
      return startBank(request, session, parsedId.data);
    }
    if (choice.method === 'mpesa_stk' && mpesaProvider(paymentSetup()) === 'daraja') {
      return startDaraja(request, session.supabase, parsedId.data, choice.phone);
    }

    const mode = paystackMode();
    const proof = mode ? paystackProof(mode) : null;
    if (!mode || !proof) return paymentUnavailable();
    const { supabase } = session;

    const current = await readState(supabase, parsedId.data);
    if (current instanceof Response) return current;
    if (current.status === 'paid') return Response.json(view(current), { headers });

    const begun = await rpc(supabase, 'rpc_payment_begin_order', { p_order_id: parsedId.data });
    if (begun.error) return refused(begun.error);
    const payment = begun.data as { reference: string; amount_cents: number };

    const channel =
      choice.method === 'card'
        ? 'card'
        : choice.method === 'saved_card'
          ? 'saved_card'
          : choice.method === 'mpesa_stk'
            ? 'mpesa'
            : 'airtel';
    /* Paystack takes the number as +254…. */
    const phone =
      choice.method === 'mpesa_stk' || choice.method === 'airtel_money' ? `+${choice.phone}` : null;
    const tried = await rpc(supabase, 'rpc_payment_paystack_attempt', {
      p_payment_reference: payment.reference,
      p_channel: channel,
      p_phone: phone,
      p_proof: proof,
      p_save_card: choice.method === 'card' ? choice.saveCard === true : false,
      p_card_id: choice.method === 'saved_card' ? choice.cardId : null,
    });
    if (tried.error) return refused(tried.error);
    const attempt = tried.data as Attempt;

    if (attempt.reused) {
      return Response.json(
        {
          status: 'pending',
          reference: payment.reference,
          ...(attempt.authorization_url ? { url: attempt.authorization_url } : {}),
          ...(attempt.retry_after_seconds
            ? { retryAfterSeconds: attempt.retry_after_seconds }
            : {}),
          ...(attempt.is_test ? { test: true } : {}),
        } satisfies OrderPaymentView,
        { headers },
      );
    }

    const email = payerEmail(session.email, payment.reference);
    const metadata = { order_id: parsedId.data, payment_reference: payment.reference };
    const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin).replace(
      /\/+$/,
      '',
    );
    if (channel === 'saved_card') {
      return chargeSaved(supabase, parsedId.data, payment.reference, attempt, mode, proof);
    }

    const answer =
      channel === 'card'
        ? await openCheckout(mode, {
            reference: attempt.attempt_reference,
            amountCents: attempt.amount_cents,
            email,
            callbackUrl: `${site}/pay/${encodeURIComponent(payment.reference)}`,
            metadata,
          })
        : await sendPrompt(mode, {
            reference: attempt.attempt_reference,
            amountCents: attempt.amount_cents,
            email,
            phone: phone!,
            provider: channel === 'mpesa' ? 'mpesa' : 'atl',
            metadata,
          });

    const url =
      channel === 'card' && answer.ok
        ? (answer.data as { authorization_url?: string } | undefined)?.authorization_url
        : undefined;

    if (answer.refused || (answer.ok && channel === 'card' && !url)) {
      await rpc(supabase, 'rpc_payment_paystack_opened', {
        p_attempt_reference: attempt.attempt_reference,
        p_access_code: null,
        p_authorization_url: null,
        p_failure: answer.message || 'Paystack refused the payment.',
        p_proof: proof,
      });
      return problem(409, 'PAYMENT_REFUSED', answer.message || 'Paystack refused the payment.');
    }
    if (!answer.ok && channel === 'card') {
      /* No page, so nothing to pay on; the next tap opens a fresh attempt. */
      return unavailable();
    }

    /* A prompt Paystack may have sent even if it did not answer in time is
       recorded as sent, so the sweep asks Paystack about it later. */
    const opened = await rpc(supabase, 'rpc_payment_paystack_opened', {
      p_attempt_reference: attempt.attempt_reference,
      p_access_code: (answer.data as { access_code?: string } | undefined)?.access_code ?? null,
      p_authorization_url: url ?? null,
      p_failure: null,
      p_proof: proof,
    });
    if (opened.error) return refused(opened.error);

    return Response.json(
      {
        status: 'pending',
        reference: payment.reference,
        ...(url ? { url } : { retryAfterSeconds: 180 }),
        ...(attempt.is_test ? { test: true } : {}),
      } satisfies OrderPaymentView,
      { headers },
    );
  } catch {
    return unavailable();
  }
}

/**
 * M-Pesa straight to Safaricom (Daraja), while Paystack is not live. The same
 * steps the website's own prompt route took: the amount comes from the
 * database, a second prompt waits a minute, and every prompt is recorded, so
 * whichever one the customer answers is the one that counts. Safaricom's
 * callback marks the order paid.
 */
async function startDaraja(request: Request, supabase: Client, id: string, phone: string) {
  const begun = await rpc(supabase, 'rpc_payment_begin_order', { p_order_id: id });
  if (begun.error) return refused(begun.error);
  const payment = begun.data as { reference: string; amount_cents: number };

  /* The order number, without dashes, names the payment in the customer's
     M-Pesa SMS. It is also the Paybill account number for this order, so a
     Paybill report of the same money finds the order. */
  const { data: placed } = await supabase
    .from('order')
    .select('reference')
    .eq('id', id)
    .maybeSingle();
  const accountReference = placed?.reference
    ? placed.reference
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 12)
    : undefined;

  const sent = await sendMpesaPrompt({
    supabase,
    reference: payment.reference,
    accountReference,
    amountCents: payment.amount_cents,
    phone,
    origin: callbackOrigin(request),
    description: 'NexG order',
    notReadyMessage:
      'M-Pesa is not connected yet. Your order is saved and the amount owed is recorded.',
  });
  if (!sent.ok) {
    const extra = {
      reference: payment.reference,
      ...(sent.waitSeconds ? { retryAfterSeconds: sent.waitSeconds } : {}),
    };
    if (sent.status === 503) {
      return problem(503, 'PAYMENT_UNAVAILABLE', sent.message, extra);
    }
    if (sent.status === 429) return problem(429, 'PAYMENT_REFUSED', sent.message, extra);
    return problem(sent.status >= 500 ? 502 : 409, 'PAYMENT_REFUSED', sent.message, extra);
  }
  return Response.json(
    {
      status: 'pending',
      reference: payment.reference,
      retryAfterSeconds: 60,
    } satisfies OrderPaymentView,
    { headers },
  );
}

/** A bank transfer: the bank's page, where the customer approves it. The bank's signed event marks it paid. */
async function startBank(
  request: Request,
  session: { supabase: Client; email: string | null; name: string | null },
  id: string,
) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? new URL(request.url).origin;
  const result = await startBankPayment(session.supabase, {
    orderId: id,
    origin,
    email: session.email,
    name: session.name,
  });
  if (!result.ok) {
    const extra = result.reference ? { reference: result.reference } : {};
    if (result.status === 503) return problem(503, 'PAYMENT_UNAVAILABLE', result.message, extra);
    return problem(result.status >= 500 ? 502 : 409, 'PAYMENT_REFUSED', result.message, extra);
  }
  if ('paid' in result && result.paid) {
    return Response.json(
      { status: 'paid', reference: result.reference } satisfies OrderPaymentView,
      {
        headers,
      },
    );
  }
  return Response.json(
    {
      status: 'pending',
      reference: result.reference,
      ...('authorization_url' in result && result.authorization_url
        ? { url: result.authorization_url }
        : {}),
    } satisfies OrderPaymentView,
    { headers },
  );
}

/**
 * A saved card: charged from here, with no page. Paystack's answer is then
 * checked through verify and the database decides, so the customer usually
 * sees "paid" straight away. If the bank wants the customer (a code), the
 * answer carries Paystack's page for that step.
 */
async function chargeSaved(
  supabase: Client,
  id: string,
  reference: string,
  attempt: Attempt,
  mode: PaystackMode,
  proof: string,
) {
  if (!attempt.authorization_code || !attempt.email) return unavailable();
  const answer = await chargeSavedCard(mode, {
    reference: attempt.attempt_reference,
    amountCents: attempt.amount_cents,
    email: attempt.email,
    authorizationCode: attempt.authorization_code,
    metadata: { order_id: id, payment_reference: reference },
  });
  if (answer.refused || (answer.ok && answer.data?.status === 'failed')) {
    await rpc(supabase, 'rpc_payment_paystack_opened', {
      p_attempt_reference: attempt.attempt_reference,
      p_access_code: null,
      p_authorization_url: null,
      p_failure: answer.message || 'The card was declined.',
      p_proof: proof,
    });
    return problem(409, 'PAYMENT_REFUSED', 'The card was declined. Try another way to pay.');
  }

  /* Recorded as tried even when Paystack did not answer in time, so the sweep asks later. */
  const opened = await rpc(supabase, 'rpc_payment_paystack_opened', {
    p_attempt_reference: attempt.attempt_reference,
    p_access_code: null,
    p_authorization_url: null,
    p_failure: null,
    p_proof: proof,
  });
  if (opened.error) return refused(opened.error);

  if (answer.ok) await checkWithPaystack(supabase, attempt.attempt_reference, mode);
  const state = await readState(supabase, id);
  if (state instanceof Response) return state;
  const page =
    state.status === 'pending' ? checkoutPage(answer.data?.authorization_url) : undefined;
  return Response.json(
    { ...view(state), ...(page ? { url: page } : {}) } satisfies OrderPaymentView,
    { headers },
  );
}
