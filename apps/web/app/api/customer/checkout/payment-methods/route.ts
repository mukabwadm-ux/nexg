import { paymentMethods } from '@/lib/payment-methods';
import { loadPaystackKeys } from '@/lib/paystack-keys';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/checkout/payment-methods
 *
 * The ways an order can be paid right now, for the website and every app:
 * {"methods":[{"method":"mpesa_stk","provider":"daraja","label":"M-Pesa"}, …]}.
 * Pay with POST /api/customer/checkout/orders/{orderId}/payment and one of
 * these methods. No sign-in needed: it says only what is switched on.
 */
export async function GET() {
  await loadPaystackKeys();
  return Response.json(
    { methods: paymentMethods() },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
