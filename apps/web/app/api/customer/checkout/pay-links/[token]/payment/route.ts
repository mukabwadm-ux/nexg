import { startPayLinkPayment } from '@/lib/pay-link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Pays a concierge order from its pay link: {"method":"mpesa_stk","phone"} or {"method":"card"}. */
export function POST(request: Request, { params }: { params: { token: string } }) {
  return startPayLinkPayment(request, params.token);
}
