import { callbackOrigin, normalisePhone } from '@/lib/daraja';
import { mpesaDispatchIsReady, reconcileMpesaPrompts, sendMpesaPrompt } from '@/lib/mpesa-prompt';
import { customerApiClient } from '@/lib/supabase/customer-api';
import { z } from 'zod';

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
  reference: z.string().min(1).max(128).optional(),
  providerPending: z.boolean().optional(),
});
type HoldView = z.infer<typeof holdView>;

const paymentInput = z
  .object({
    method: z.literal('mpesa_stk'),
    phone: z.string().min(1).max(40),
  })
  .strict();
const paymentView = z.object({
  checkout: holdView,
  dispatch: z.boolean().optional(),
  reference: z.string().min(1).max(128).optional(),
  amountMinor: minor.optional(),
});

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

function problem(status: number, code: Code, title: string) {
  return Response.json(
    { type: 'about:blank', title, status, code },
    { status, headers: { ...headers, 'Content-Type': 'application/problem+json' } },
  );
}

const signIn = () => problem(401, 'AUTH_REQUIRED', 'Sign in with your email address to book.');
const unavailable = () =>
  problem(503, 'SERVICE_UNAVAILABLE', 'Stay checkout is unavailable. Try again shortly.');
const invalid = (title: string) => problem(422, 'INVALID_REQUEST', title);
const paymentUnavailable = () =>
  problem(503, 'PAYMENT_UNAVAILABLE', 'M-Pesa is unavailable. Try again shortly.');

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
  if (!user?.email || user.is_anonymous) return signIn();
  return supabase;
}

function response({ providerPending: _providerPending, ...view }: HoldView) {
  return Response.json(view, { headers });
}

async function readStatus(
  supabase: Client,
  operationId: string,
  reconcile: boolean,
): Promise<HoldView | Response> {
  const result = await supabase.rpc('rpc_native_stay_status', { p_operation_id: operationId });
  if (result.error) return rpcError(result.error, 'status');
  const parsed = holdView.safeParse(result.data);
  if (!parsed.success || parsed.data.operationId !== operationId) return unavailable();
  const view = parsed.data;
  if (reconcile && view.providerPending && view.reference) {
    const changed = await reconcileMpesaPrompts(supabase, view.reference).catch(() => false);
    if (changed) return readStatus(supabase, operationId, false);
  }
  return view;
}

export async function stayQuote(request: Request) {
  try {
    const supabase = await signedIn(request);
    if (supabase instanceof Response) return supabase;
    const body = quoteInput.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalid('Choose one room, two dates and the guests who will stay.');
    if (!(await mpesaDispatchIsReady(supabase))) return paymentUnavailable();

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
      quote.nightlyMinor * quote.nights !== quote.totalMinor ||
      quote.roomSubtotalMinor !== quote.totalMinor
    )
      return unavailable();

    return Response.json(
      {
        ...quote,
        paymentMethods: ['mpesa_stk'],
        termsText:
          'You get an initial 15-minute hold while you pay. Your stay is confirmed after NexG verifies payment and secures the room.',
        cancellationText:
          'Unpaid holds expire automatically. Contact NexG about changing or cancelling a confirmed stay and any refund that applies.',
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
    const view = await readStatus(supabase, id.data, true);
    return view instanceof Response ? view : response(view);
  } catch {
    return unavailable();
  }
}

export async function stayPayment(request: Request, operationId: string) {
  try {
    const supabase = await signedIn(request);
    if (supabase instanceof Response) return supabase;
    const id = uuid.safeParse(operationId);
    const payload = paymentInput.safeParse(await request.json().catch(() => null));
    const phone = payload.success ? normalisePhone(payload.data.phone) : null;
    if (!id.success || !phone) return invalid('Choose M-Pesa and enter a Kenyan mobile number.');

    const current = await readStatus(supabase, id.data, false);
    if (current instanceof Response) return current;
    if (current.refundDue || ['pending', 'paid'].includes(current.paymentStatus))
      return response(current);
    if (current.status !== 'held') {
      return problem(409, 'PAYMENT_UNAVAILABLE', 'This stay cannot be paid now. Check its status.');
    }
    if (!(await mpesaDispatchIsReady(supabase))) return paymentUnavailable();

    const begun = await supabase.rpc('rpc_native_stay_payment_begin', { p_operation_id: id.data });
    if (begun.error) return rpcError(begun.error, 'payment');
    const parsed = paymentView.safeParse(begun.data);
    if (!parsed.success || parsed.data.checkout.operationId !== id.data) return unavailable();
    const { checkout, dispatch, reference, amountMinor } = parsed.data;
    if (!dispatch) return response(checkout);
    if (
      !reference ||
      !amountMinor ||
      reference !== checkout.reference ||
      amountMinor !== checkout.totalMinor
    ) {
      return unavailable();
    }

    await sendMpesaPrompt({
      supabase,
      reference,
      amountCents: amountMinor,
      phone,
      origin: callbackOrigin(request),
      description: 'NexG stay',
      notReadyMessage: 'M-Pesa is unavailable. Check the stay status.',
    }).catch(() => undefined);
    // The dispatch boundary may have accepted a request even if its response was lost.
    const latest = await readStatus(supabase, id.data, false).catch(() => null);
    return response(latest && !(latest instanceof Response) ? latest : checkout);
  } catch {
    return unavailable();
  }
}
