import { callbackOrigin, normalisePhone } from '@/lib/daraja';
import { mpesaDispatchIsReady, reconcileMpesaPrompts, sendMpesaPrompt } from '@/lib/mpesa-prompt';
import { customerApiClient } from '@/lib/supabase/customer-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: { orderId: string } };
type Client = ReturnType<typeof customerApiClient>;
type PaymentView = {
  status: 'unpaid' | 'pending' | 'failed' | 'paid';
  reference?: string;
  retryAfterSeconds?: number;
};

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store' };

function problem(status: number, title: string) {
  return Response.json(
    { type: 'about:blank', title, status },
    { status, headers: { ...headers, 'Content-Type': 'application/problem+json' } },
  );
}

function paymentResponse(view: PaymentView) {
  return Response.json(view, { headers });
}

const unavailable = () => problem(503, 'Payment status is unavailable. Try again shortly.');
const notFound = () => problem(404, 'Order not found.');

async function ownedOrder(request: Request, orderId: string) {
  const token = /^Bearer ([\w.-]{1,4096})$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) return problem(401, 'Sign in to view this payment.');
  if (!uuid.test(orderId)) return notFound();

  const supabase = customerApiClient(token);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);
  if (authError && ![400, 401, 403].includes(authError.status ?? 0)) return unavailable();
  if (!user) return problem(401, 'Sign in to view this payment.');

  const { data: guest, error: guestError } = await supabase
    .from('guest')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (guestError) return unavailable();
  if (!guest) return notFound();

  const { data: order, error } = await supabase
    .from('order')
    .select('id,reference,stage,payment_status,payment_method')
    .eq('id', orderId)
    .eq('guest_id', guest.id)
    .maybeSingle();
  if (error) return unavailable();
  if (!order) return notFound();
  return { supabase, order };
}

type Order = Exclude<Awaited<ReturnType<typeof ownedOrder>>, Response>['order'];

async function readPayment(
  supabase: Client,
  order: Order,
  reconcile: boolean,
): Promise<PaymentView | Response> {
  if (order.payment_status === 'paid' || order.payment_status === 'collected') {
    return { status: 'paid' };
  }

  const { data, error } = await supabase
    .from('payment')
    .select('reference,state,provider,authorised_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return unavailable();
  if (!data) return { status: 'unpaid' };
  const { reference, state, provider, authorised_at: authorisedAt } = data;

  if (state === 'paid') return { status: 'paid', reference };
  if (state === 'failed' || state === 'abandoned' || state === 'reversed') {
    return { status: 'failed', reference };
  }
  if (reconcile && state === 'authorised' && provider === 'mpesa') {
    const changed = await reconcileMpesaPrompts(supabase, reference).catch(() => false);
    if (changed) return readPayment(supabase, order, false);
  }

  const seconds = authorisedAt
    ? Math.ceil((Date.parse(authorisedAt) + 60_000 - Date.now()) / 1000)
    : 0;
  return { status: 'pending', reference, ...(seconds > 0 ? { retryAfterSeconds: seconds } : {}) };
}

export async function GET(request: Request, { params }: Context) {
  const owned = await ownedOrder(request, params.orderId);
  if (owned instanceof Response) return owned;
  const state = await readPayment(owned.supabase, owned.order, true);
  return state instanceof Response ? state : paymentResponse(state);
}

export async function POST(request: Request, { params }: Context) {
  const owned = await ownedOrder(request, params.orderId);
  if (owned instanceof Response) return owned;
  const { supabase, order } = owned;

  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const phone =
    typeof input.phone === 'string' && input.phone.length <= 40
      ? normalisePhone(input.phone)
      : null;
  if (input.method !== 'mpesa_stk' || !phone) {
    return problem(400, 'Choose M-Pesa and enter a Kenyan mobile number.');
  }

  const current = await readPayment(supabase, order, true);
  if (current instanceof Response) return current;
  if (current.status === 'paid' || current.status === 'pending') return paymentResponse(current);
  if (
    order.payment_method !== 'mpesa_stk' ||
    !['placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'arriving', 'delivered'].includes(
      order.stage,
    ) ||
    !['pending', 'failed'].includes(order.payment_status)
  ) {
    return problem(409, 'This order cannot be paid with M-Pesa.');
  }
  if (!(await mpesaDispatchIsReady(supabase)))
    return problem(503, 'M-Pesa is unavailable. Your order is saved.');

  const begun = await supabase.rpc('rpc_payment_begin_order', { p_order_id: order.id });
  if (begun.error) {
    // Another start or settlement can win between the status read and begin.
    const latest = await readPayment(supabase, order, false);
    if (
      !(latest instanceof Response) &&
      (latest.status === 'pending' || latest.status === 'paid')
    ) {
      return paymentResponse(latest);
    }
    return unavailable();
  }
  const payment = begun.data as { reference?: unknown; amount_cents?: unknown } | null;
  if (
    !payment ||
    typeof payment.reference !== 'string' ||
    typeof payment.amount_cents !== 'number' ||
    !Number.isSafeInteger(payment.amount_cents) ||
    payment.amount_cents <= 0
  )
    return unavailable();

  const reference = payment.reference;
  const sent = await sendMpesaPrompt({
    supabase,
    reference,
    accountReference: order.reference
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 12),
    amountCents: payment.amount_cents,
    phone,
    origin: callbackOrigin(request),
    description: 'NexG order',
    notReadyMessage: 'M-Pesa is unavailable. Your order is saved.',
  }).catch(() => null);
  if (sent?.ok) return paymentResponse({ status: 'pending', reference, retryAfterSeconds: 60 });

  const latest = await readPayment(supabase, order, false);
  if (!(latest instanceof Response) && (latest.status === 'paid' || latest.status === 'failed')) {
    return paymentResponse(latest);
  }
  return paymentResponse({
    status: 'pending',
    reference,
    retryAfterSeconds: sent && 'waitSeconds' in sent ? (sent.waitSeconds ?? 60) : 60,
  });
}
