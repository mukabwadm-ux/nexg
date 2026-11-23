import { readBookingPayment, startBookingPayment } from '@/lib/booking-payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: { params: { bookingId: string } }) {
  return readBookingPayment(request, params.bookingId);
}

export function POST(request: Request, { params }: { params: { bookingId: string } }) {
  return startBookingPayment(request, params.bookingId);
}
