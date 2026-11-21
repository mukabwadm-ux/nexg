import { readOrderPayment, startOrderPayment } from '@/lib/order-payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: { params: { orderId: string } }) {
  return readOrderPayment(request, params.orderId);
}

export function POST(request: Request, { params }: { params: { orderId: string } }) {
  return startOrderPayment(request, params.orderId);
}
