import { startOrderPayment, type Client } from '@/lib/order-payment';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The website's pay page: start paying an order through Paystack with the
 * browser's own sign-in (its cookie session, guests included). The body and
 * the answer are the apps' order route's
 * (/api/customer/checkout/orders/{orderId}/payment): a card answers with
 * Paystack's page to go to, M-Pesa with a prompt on the phone.
 */
async function cookieSession(request: Request) {
  /* Only from NexG's own pages. */
  if (!fromOurPages(request))
    return Response.json({ code: 'FORBIDDEN', title: 'Open this from NexG.' }, { status: 403 });
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { code: 'AUTH_REQUIRED', title: 'Your session ended. Open your order again.' },
      { status: 401 },
    );
  return { supabase: supabase as unknown as Client, email: user.email ?? null };
}

/* The browser's Origin must name the host it asked (Next's own URL can be an
   internal localhost behind the proxy, so the Host header decides). */
function fromOurPages(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const host =
      request.headers.get('x-forwarded-host') ??
      request.headers.get('host') ??
      new URL(request.url).host;
    return new URL(origin).host === host.split(',')[0]!.trim().toLowerCase();
  } catch {
    return false;
  }
}

export function POST(request: Request, { params }: { params: { orderId: string } }) {
  return startOrderPayment(request, params.orderId, cookieSession);
}
