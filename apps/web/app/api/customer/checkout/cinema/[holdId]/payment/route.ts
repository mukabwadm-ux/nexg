import { readCinemaPayment, startCinemaPayment } from '@/lib/cinema/payment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: { params: { holdId: string } }) {
  return readCinemaPayment(request, params.holdId);
}

export function POST(request: Request, { params }: { params: { holdId: string } }) {
  return startCinemaPayment(request, params.holdId);
}
