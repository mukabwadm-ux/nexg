import { refused, rpc, startPayment, stateFrom, type PaymentTarget } from '@/lib/order-payment';
import { paystackMode } from '@/lib/paystack';
import { customerApiClient } from '@/lib/supabase/customer-api';
import { z } from 'zod';

/* Paystack takes M-Pesa and Airtel Money up to KES 150,000 a payment. */
const MPESA_LIMIT_MINOR = 15_000_000;

const headers = { 'Cache-Control': 'private, no-store' };
const uuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minor = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const quoteInput = z
  .object({
    propertyId: uuid,
    unitId: uuid,
    checkIn: date,
    checkOut: date,
    adults: z.number().int().min(1).max(20),
    children: z.number().int().min(0).max(20),
  })
  .strict();

const quoteView = quoteInput.extend({
  quoteId: uuid,
  nights: z.number().int().min(1).max(90),
  expiresAt: z.string().datetime({ offset: true }),
  currency: z.literal('KES'),
  nightlyMinor: minor,
  roomSubtotalMinor: minor,
  taxesMinor: z.literal(0),
  totalMinor: minor,
});

const holdInput = z.object({ quoteId: uuid, firstName: z.string().trim().min(1).max(80) }).strict();
const holdView = z.object({
  operationId: uuid,
  stayId: uuid,
  holdExpiresAt: z.string().datetime({ offset: true }),
  currency: z.literal('KES'),
  totalMinor: minor,
  status: z.enum(['held', 'booked', 'expired', 'cancelled', 'in_stay', 'departed']),
  paymentStatus: z.enum(['unpaid', 'pending', 'failed', 'paid']),
  refundDue: z.boolean(),
  /* The money has gone back. Optional: a database before 20270328000100 omits both. */
  refunded: z.boolean().optional(),
  /* NexG cancelled the stay after booking it, as opposed to a lapsed hold or a late payment. */
  cancelledAfterBooking: z.boolean().optional(),
  reference: z.string().min(1).max(128).optional(),
  providerPending: z.boolean().optional(),
});
type HoldView = z.infer<typeof holdView>;

type Client = ReturnType<typeof customerApiClient>;
type DatabaseError = { code: string; message: string };
type Code =
  | 'AUTH_REQUIRED'
  | 'INVALID_REQUEST'
  | 'STAY_UNAVAILABLE'
  | 'QUOTE_EXPIRED'
  | 'PRICE_CHANGED'
  | 'NOT_FOUND'
  | 'OPERATION_CONFLICT'
  | 'PAYMENT_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE';

function nightsBetween(checkIn: string, checkOut: string) {
  return Math.round(
    (Date.parse(checkOut + 'T12:00:00Z') - Date.parse(checkIn + 'T12:00:00Z')) / 86_400_000,
  );
}

function problem(status: number, code: Code, title: string) {
  return Response.json(
    { type: 'about:blank', title, status, code },
    { status, headers: { ...headers, 'Content-Type': 'application/problem+json' } },
  );
}

const signIn = () => problem(401, 'AUTH_REQUIRED', 'Sign in, or continue as a guest, to book.');
const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Stay checkout is unavailable. Try again shortly.');
const invalid = (title: string) => problem(422, 'INVALID_REQUEST', title);
// Paying in the app is being switched on with Paystack; until then a hold waits
// for payment like every other booking.
function rpcError(error: DatabaseError, stage: 'quote' | 'hold' | 'status' | 'payment') {
  switch (error.code) {
    case '42501':
      return signIn();
    case 'NX001':
    case '23P01':
      return problem(409, 'STAY_UNAVAILABLE', 'The room is no longer available for these dates.');
    case 'NX002':
      return problem(410, 'QUOTE_EXPIRED', 'The quote expired. Request a fresh price.');
    case 'NX003':
      return problem(409, 'PRICE_CHANGED', 'The price changed. Request a fresh quote.');
    case 'NX004':
      return problem(404, 'NOT_FOUND', 'No stay checkout operation was found.');
    case 'NX005':
      return problem(409, 'OPERATION_CONFLICT', 'The operation already has a different request.');
    case 'NX006':
      return problem(409, 'PAYMENT_UNAVAILABLE', 'This stay cannot be paid now. Check its status.');
    case '22023':
      if (stage === 'hold') {
        return problem(
          409,
          'STAY_UNAVAILABLE',
          'The room could not be held for these dates and guests.',
        );
      }
      return invalid('Check the property, dates and guests.');
    default:
      return unavailable();
  }
}

async function signedIn(request: Request): Promise<Client | Response> {
  const token = /^Bearer ([\w.-]{1,4096})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return signIn();
  const supabase = customerApiClient(token);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error) return [400, 401, 403].includes(error.status ?? 0) ? signIn() : unavailable();
  // Accounts and temporary (guest) sessions alike; the hold asks for the guest's name.
  if (!user) return signIn();
  return supabase;
}

function response({ providerPending: _providerPending, ...view }: HoldView) {
  return Response.json(view, { headers });
}

async function readStatus(supabase: Client, operationId: string): Promise<HoldView | Response> {
  const result = await supabase.rpc('rpc_native_stay_status', { p_operation_id: operationId });
  if (result.error) return rpcError(result.error, 'status');
  const parsed = holdView.safeParse(result.data);
  if (!parsed.success || parsed.data.operationId !== operationId) return unavailable();
  return parsed.data;
}

export async function stayQuote(request: Request) {
  try {
    const supabase = await signedIn(request);
    if (supabase instanceof Response) return supabase;
    const body = quoteInput.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalid('Choose one room, two dates and the guests who will stay.');
    const input = body.data;
    const result = await supabase.rpc('rpc_native_stay_quote', {
      p_property_id: input.propertyId,
      p_unit_id: input.unitId,
      p_check_in: input.checkIn,
      p_check_out: input.checkOut,
      p_adults: input.adults,
      p_children: input.children,
    });
    if (result.error) return rpcError(result.error, 'quote');
    const parsed = quoteView.safeParse(result.data);
    if (!parsed.success) return unavailable();
    const quote = parsed.data;
    if (
      quote.propertyId !== input.propertyId ||
      quote.unitId !== input.unitId ||
      quote.checkIn !== input.checkIn ||
      quote.checkOut !== input.checkOut ||
      quote.adults !== input.adults ||
      quote.children !== input.children ||
      /* Weekend, seasonal and long-stay rates (20270332000100) make nights
         differ, so the total is checked, not nightly × nights: nightlyMinor
         is the average night. */
      quote.nights !== nightsBetween(quote.checkIn, quote.checkOut) ||
      quote.roomSubtotalMinor !== quote.totalMinor
    )
      return unavailable();

    /* The host's cancellation policy, which the stay is held to once made. */
    const policy = await rpc(supabase, 'rpc_stay_cancellation_policy', { p_unit_id: input.unitId });
    const policyText =
      !policy.error && typeof (policy.data as { text?: unknown } | null)?.text === 'string'
        ? (policy.data as { text: string }).text
        : null;

    return Response.json(
      {
        ...quote,
        // The apps read one method here, M-Pesa; empty while Paystack is off, or
        // above M-Pesa's KES 150,000 a payment. paystackMethods is the full list
        // for apps that take a card too.
        paymentMethods:
          paystackMode() && quote.totalMinor <= MPESA_LIMIT_MINOR ? ['mpesa_stk'] : [],
        paystackMethods: paystackMode()
          ? [
              ...(quote.totalMinor <= MPESA_LIMIT_MINOR ? ['mpesa_stk', 'airtel_money'] : []),
              'card',
            ]
          : [],
        termsText:
          'You get a 15-minute hold while you pay. Your stay is confirmed once NexG has your payment.',
        cancellationText: policyText
          ? `Unpaid holds expire automatically. If a paid stay is cancelled: ${policyText.charAt(0).toLowerCase()}${policyText.slice(1)} NexG handles the cancellation.`
          : 'Unpaid holds expire automatically. Contact NexG about changing or cancelling a confirmed stay and any refund that applies.',
      },
      { headers },
    );
  } catch {
    return unavailable();
  }
}

export async function stayHold(request: Request) {
  try {
    const supabase = await signedIn(request);
    if (supabase instanceof Response) return supabase;
    const body = holdInput.safeParse(await request.json().catch(() => null));
    const key = uuid.safeParse(request.headers.get('idempotency-key'));
    if (!body.success || !key.success || key.data !== body.data.quoteId) {
      return invalid(
        'Supply the quote ID as the idempotency key and enter the guest’s first name.',
      );
    }

    const result = await supabase.rpc('rpc_native_stay_hold', {
      p_quote_id: body.data.quoteId,
      p_first_name: body.data.firstName,
    });
    if (result.error) return rpcError(result.error, 'hold');
    const view = holdView.safeParse(result.data);
    return view.success && view.data.operationId === key.data ? response(view.data) : unavailable();
  } catch {
    return unavailable();
  }
}

export async function stayStatus(request: Request, operationId: string) {
  try {
    const supabase = await signedIn(request);
    if (supabase instanceof Response) return supabase;
    const id = uuid.safeParse(operationId);
    if (!id.success) return invalid('Check the stay checkout ID.');
    const view = await readStatus(supabase, id.data);
    return view instanceof Response ? view : response(view);
  } catch {
    return unavailable();
  }
}

/*
 * Paying for a held stay through Paystack (owner, 22 Nov 2026: stays paid in
 * full at booking). The body and the answer are the order route's:
 * {method:'mpesa_stk'|'airtel_money', phone} | {method:'card', saveCard?} |
 * {method:'saved_card', cardId} → {status, reference?, url?, retryAfterSeconds?,
 * test?}. GET /holds/{operationId} stays the proof that the stay is booked.
 */
export async function stayPayment(request: Request, operationId: string) {
  const id = uuid.safeParse(operationId);
  if (!id.success) return invalid('Check the stay checkout ID.');
  return startPayment(request, async ({ supabase }) => {
    const current = await readStatus(supabase, id.data);
    if (current instanceof Response) return current;
    if (current.paymentStatus === 'paid' && !current.refundDue)
      return Response.json(
        { status: 'paid', ...(current.reference ? { reference: current.reference } : {}) },
        { headers },
      );
    if (current.refundDue || current.status !== 'held')
      return problem(409, 'PAYMENT_UNAVAILABLE', 'This stay cannot be paid now. Check its status.');
    return stayTarget(supabase, current.stayId);
  });
}

/**
 * One held stay, however it was held (the apps' operation or the website's
 * stay): Paystack once it is switched on, and M-Pesa straight to Safaricom
 * until Paystack is live. The amount always comes from the hold.
 */
function stayTarget(supabase: Client, stayId: string): PaymentTarget {
  const begin = async () => {
    const begun = await rpc(supabase, 'rpc_payment_begin_stay', { p_stay_id: stayId });
    if (begun.error) return refused(begun.error);
    return begun.data as { reference: string; amount_cents: number; expires_at?: string };
  };
  return {
    readState: async () =>
      stateFrom(await rpc(supabase, 'rpc_stay_payment_state', { p_stay_id: stayId })),
    begin,
    metadata: { stay_id: stayId },
    daraja: {
      begin,
      description: 'NexG stay',
      notReady:
        'M-Pesa payments are not switched on yet. Your dates are held; send us an enquiry and we will finish the booking with you.',
    },
  };
}

/*
 * The website's stay checkout holds a stay by its own id (rpc_stay_hold) and
 * pays it here: POST /api/customer/checkout/stays/{stayId}/payment, the same
 * body and answer as the apps' route. The database refuses a stay that is not
 * the caller's, or not held.
 */
export async function stayPaymentById(request: Request, rawStayId: string) {
  const id = uuid.safeParse(rawStayId);
  if (!id.success) return invalid('Check the stay ID.');
  return startPayment(request, async ({ supabase }) => stayTarget(supabase, id.data));
}
