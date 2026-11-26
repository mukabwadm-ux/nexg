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
  type Split,
} from '@/lib/paystack';
import { startBankPayment } from '@/lib/bank/payments';
import { callbackOrigin, normalisePhone } from '@/lib/daraja';
import { sendMpesaPrompt } from '@/lib/mpesa-prompt';
import { mpesaProvider, paymentSetup } from '@/lib/payment-methods';
import { loadPaystackKeys } from '@/lib/paystack-keys';
import { customerApiClient } from '@/lib/supabase/customer-api';
import { createClient as cookieClient } from '@/lib/supabase/server';

/**
 * The one way to pay, for the website and every app (shared services,
 * payments). The caller signs in with a Supabase bearer token (the apps, guest
 * sessions included) or the website's own session cookie:
 *
 *   GET  /api/customer/checkout/orders/{orderId}/payment
 *   POST /api/customer/checkout/orders/{orderId}/payment
 *        {"method":"mpesa_stk"|"airtel_money", "phone":"0712 345 678"}
 *        {"method":"card", "saveCard"?: true} | {"method":"saved_card", "cardId"}
 *        {"method":"bank_transfer"}
 *
 * Bookings and stays use the same start and read (lib/booking-payment.ts,
 * lib/booking/native-stay-checkout.ts), through Paystack only. Both answer
 * {status: unpaid|pending|failed|paid, reference?, retryAfterSeconds?, url?,
 * test?}. `url` is a page to open: Paystack's checkout for a card, or the
 * bank's page for a bank transfer. Coming back from it never counts as paid:
 * only the provider's signed callback, or an answer this server fetched, marks
 * it paid. Which methods are on offer: lib/payment-methods.ts, served at
 * GET /api/customer/checkout/payment-methods.
 */

const headers = { 'Cache-Control': 'private, no-store' };
const orderId = z.string().uuid();
/* payInFull: bookings only, to pay the whole amount instead of the deposit. */
const extra = { payInFull: z.boolean().optional() };
const startInput = z.discriminatedUnion('method', [
  /* saveCard: keep the card for next time (accounts only; ignored for a guest). */
  z.object({ method: z.literal('card'), saveCard: z.boolean().optional(), ...extra }).strict(),
  z.object({ method: z.literal('saved_card'), cardId: z.string().uuid(), ...extra }).strict(),
  z
    .object({
      method: z.enum(['mpesa_stk', 'airtel_money']),
      /* +254712345678, 254712345678 or 0712 345 678: normalised below. */
      phone: z
        .string()
        .max(20)
        .transform((v) => normalisePhone(v))
        .refine((v): v is string => v !== null),
      ...extra,
    })
    .strict(),
  /* Orders only. */
  z.object({ method: z.literal('bank_transfer') }).strict(),
]);
export type StartInput = z.infer<typeof startInput>;

export type Client = ReturnType<typeof customerApiClient>;
type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;

export function rpc(client: Client, fn: string, args: Record<string, unknown> = {}) {
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

export interface PaymentState {
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
  | 'NOTHING_TO_PAY'
  | 'SERVICE_UNAVAILABLE';

export function problem(
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
export const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Payment is unavailable right now. Try again shortly.');
const paymentUnavailable = () =>
  problem(503, 'PAYMENT_UNAVAILABLE', 'Paying in the app is not switched on yet.');

/** A database refusal, in the customer's words where the database gave some. */
export function refused(error: { code?: string; message: string }) {
  if (error.code === '42501') return signIn();
  if (error.code === 'P0001' && /No such order/i.test(error.message)) {
    return problem(404, 'NOT_FOUND', 'No such order.');
  }
  if (error.code === 'P0001' || error.code === '22023') {
    return problem(409, 'PAYMENT_REFUSED', error.message.replace(/^.*?:\s*/, '').slice(0, 200));
  }
  return unavailable();
}

async function signedIn(request: Request): Promise<Session | Response> {
  const header = request.headers.get('authorization');
  const token = /^Bearer ([\w.-]{1,4096})$/i.exec(header ?? '')?.[1];
  /* An app sends its session as a bearer token; the website's own pages send
     their session cookie. */
  if (header && !token) return signIn();
  const supabase = token ? customerApiClient(token) : (cookieClient() as unknown as Client);
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

export function view(state: PaymentState): OrderPaymentView {
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

export function stateFrom(result: RpcResult): PaymentState | Response {
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
  await loadPaystackKeys();
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
  await loadPaystackKeys();
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

/**
 * The mode this customer pays in. A review account (payment_reviewer, such as
 * Apple's) pays with the test keys even once NexG is live, so no real money
 * moves; it can then only pay at the test shops and property.
 */
export async function customerMode(supabase: Client): Promise<PaystackMode | null> {
  await loadPaystackKeys();
  const mode = paystackMode();
  if (mode !== 'live' || !paystackProof('test')) return mode;
  const reviewer = await rpc(supabase, 'rpc_payment_i_review');
  return reviewer.data === true ? 'test' : mode;
}

/**
 * What is being paid for. `readState` is the customer's view of its latest
 * payment; `begin` opens or reuses the live payment and says its reference and
 * amount (or answers with a refusal).
 */
export interface PaymentTarget {
  readState: () => Promise<PaymentState | Response>;
  begin: (
    input: StartInput,
    proof: string,
  ) => Promise<{ reference: string; amount_cents: number } | Response>;
  metadata: Record<string, unknown>;
  /** Runs after any check that may have marked it paid (bookings settle in the engine). */
  afterPaid?: () => Promise<void>;
  /** Extra fields for the read answer (a booking says what is due now). */
  describe?: (state: PaymentState) => Promise<Record<string, unknown>>;
  /** M-Pesa straight to Safaricom while Paystack is not live (lib/payment-methods). */
  daraja?: DarajaTarget;
}

export interface DarajaTarget {
  begin: () => Promise<{ reference: string; amount_cents: number; expires_at?: string } | Response>;
  /** What the customer's M-Pesa SMS names; the payment reference when absent. */
  accountReference?: () => Promise<string | undefined>;
  description: string;
  notReady: string;
}
export type Session = { supabase: Client; email: string | null; name?: string | null };

/** GET: the state, after asking Paystack about a try that is taking long. */
export async function readPayment(
  request: Request,
  target: (s: Session) => Promise<PaymentTarget | Response>,
) {
  try {
    const session = await signedIn(request);
    if (session instanceof Response) return session;
    const found = await target(session);
    if (found instanceof Response) return found;

    let state = await found.readState();
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
      const again = await found.readState();
      if (!(again instanceof Response)) state = again;
    }
    if (state.status === 'paid') await found.afterPaid?.();
    const more = found.describe ? await found.describe(state) : {};
    return Response.json({ ...view(state), ...more }, { headers });
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
  /* An order from a merchant Paystack pays directly: its share and NexG's. */
  split?: Split;
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

/** POST: start paying, by a prompt, Paystack's card page or a saved card. */
export async function startPayment(
  request: Request,
  target: (s: Session) => Promise<PaymentTarget | Response>,
  /** An order: also bank transfer, and M-Pesa through Safaricom until Paystack is live. */
  order?: { id: string },
) {
  try {
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
    const { supabase } = session;
    if (choice.method === 'bank_transfer') {
      if (!order) return problem(422, 'INVALID_REQUEST', 'Choose card, M-Pesa or Airtel Money.');
      return startBank(request, session, order.id);
    }
    await loadPaystackKeys();
    if (choice.method === 'mpesa_stk' && mpesaProvider(paymentSetup()) === 'daraja') {
      if (order) return startDaraja(request, supabase, order.id, choice.phone);
      const found = await target(session);
      if (found instanceof Response) return found;
      if (found.daraja) return sendDaraja(request, supabase, found.daraja, choice.phone);
    }

    const mode = await customerMode(supabase);
    const proof = mode ? paystackProof(mode) : null;
    if (!mode || !proof) return paymentUnavailable();
    /* The target answers for itself when there is nothing to start (an order already paid). */
    const found = await target(session);
    if (found instanceof Response) return found;

    const payment = await found.begin(choice, proof);
    if (payment instanceof Response) return payment;

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
    const metadata = { ...found.metadata, payment_reference: payment.reference };
    const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin).replace(
      /\/+$/,
      '',
    );
    if (channel === 'saved_card') {
      return chargeSaved(supabase, found, metadata, attempt, mode, proof);
    }

    const answer =
      channel === 'card'
        ? await openCheckout(mode, {
            reference: attempt.attempt_reference,
            amountCents: attempt.amount_cents,
            email,
            callbackUrl: `${site}/pay/${encodeURIComponent(payment.reference)}`,
            metadata,
            ...(attempt.split ? { split: attempt.split } : {}),
          })
        : await sendPrompt(mode, {
            reference: attempt.attempt_reference,
            amountCents: attempt.amount_cents,
            email,
            phone: phone!,
            provider: channel === 'mpesa' ? 'mpesa' : 'atl',
            metadata,
            ...(attempt.split ? { split: attempt.split } : {}),
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
 * A saved card: charged from here, with no page. Paystack's answer is then
 * checked through verify and the database decides, so the customer usually
 * sees "paid" straight away. If the bank wants the customer (a code), the
 * answer carries Paystack's page for that step.
 */
async function chargeSaved(
  supabase: Client,
  target: PaymentTarget,
  metadata: Record<string, unknown>,
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
    metadata,
    ...(attempt.split ? { split: attempt.split } : {}),
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
  const state = await target.readState();
  if (state instanceof Response) return state;
  if (state.status === 'paid') await target.afterPaid?.();
  const page =
    state.status === 'pending' ? checkoutPage(answer.data?.authorization_url) : undefined;
  return Response.json(
    { ...view(state), ...(page ? { url: page } : {}) } satisfies OrderPaymentView,
    { headers },
  );
}

// ───────────────────────────────────────────────────────────────── orders

function orderTarget(rawOrderId: string) {
  return async ({ supabase }: Session): Promise<PaymentTarget | Response> => {
    const parsed = orderId.safeParse(rawOrderId);
    if (!parsed.success) return problem(404, 'NOT_FOUND', 'No such order.');
    const id = parsed.data;
    return {
      readState: async () =>
        stateFrom(await rpc(supabase, 'rpc_order_payment_state', { p_order_id: id })),
      begin: async () => {
        const begun = await rpc(supabase, 'rpc_payment_begin_order', { p_order_id: id });
        if (begun.error) return refused(begun.error);
        return begun.data as { reference: string; amount_cents: number };
      },
      metadata: { order_id: id },
    };
  };
}

export function readOrderPayment(request: Request, rawOrderId: string) {
  if (!orderId.safeParse(rawOrderId).success)
    return Promise.resolve(problem(404, 'NOT_FOUND', 'No such order.'));
  return readPayment(request, orderTarget(rawOrderId));
}

export async function startOrderPayment(request: Request, rawOrderId: string) {
  if (!orderId.safeParse(rawOrderId).success) return problem(404, 'NOT_FOUND', 'No such order.');
  /* An order already paid answers paid without starting anything. */
  return startPayment(
    request,
    async (session) => {
      const target = await orderTarget(rawOrderId)(session);
      if (target instanceof Response) return target;
      const current = await target.readState();
      if (!(current instanceof Response) && current.status === 'paid')
        return Response.json(view(current), { headers });
      return target;
    },
    { id: rawOrderId },
  );
}

// ─────────────────────────────────────────── M-Pesa by Safaricom, and the bank

/**
 * M-Pesa straight to Safaricom (Daraja), while Paystack is not live. The same
 * steps the website's own prompt route took: the amount comes from the
 * database, a second prompt waits a minute, and every prompt is recorded, so
 * whichever one the customer answers is the one that counts. Safaricom's
 * callback marks the order paid.
 */
async function startDaraja(request: Request, supabase: Client, id: string, phone: string) {
  return sendDaraja(
    request,
    supabase,
    {
      begin: async () => {
        const begun = await rpc(supabase, 'rpc_payment_begin_order', { p_order_id: id });
        if (begun.error) return refused(begun.error);
        return begun.data as { reference: string; amount_cents: number };
      },
      /* The order number, without dashes, names the payment in the customer's
         M-Pesa SMS. It is also the Paybill account number for this order, so a
         Paybill report of the same money finds the order. */
      accountReference: async () => {
        const { data: placed } = await supabase
          .from('order')
          .select('reference')
          .eq('id', id)
          .maybeSingle();
        return placed?.reference
          ? placed.reference
              .replace(/[^A-Za-z0-9]/g, '')
              .toUpperCase()
              .slice(0, 12)
          : undefined;
      },
      description: 'NexG order',
      notReady: 'M-Pesa is not connected yet. Your order is saved and the amount owed is recorded.',
    },
    phone,
  );
}

/** Sends the Safaricom prompt for whatever the target begins: an order or a held stay. */
async function sendDaraja(request: Request, supabase: Client, target: DarajaTarget, phone: string) {
  const payment = await target.begin();
  if (payment instanceof Response) return payment;

  const sent = await sendMpesaPrompt({
    supabase,
    reference: payment.reference,
    accountReference: target.accountReference ? await target.accountReference() : undefined,
    amountCents: payment.amount_cents,
    phone,
    origin: callbackOrigin(request),
    description: target.description,
    notReadyMessage: target.notReady,
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
      /* A held stay: when the hold runs out, so the page can count down. */
      ...(payment.expires_at ? { expiresAt: payment.expires_at } : {}),
    },
    { headers },
  );
}

/** A bank transfer: the bank's page, where the customer approves it. The bank's signed event marks it paid. */
async function startBank(request: Request, session: Session, id: string) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ?? new URL(request.url).origin;
  const result = await startBankPayment(session.supabase, {
    orderId: id,
    origin,
    email: session.email,
    name: session.name ?? null,
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
