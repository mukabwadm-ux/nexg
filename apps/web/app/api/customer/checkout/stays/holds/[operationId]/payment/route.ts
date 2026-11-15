import { stayPayment } from '@/lib/booking/native-stay-checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request, { params }: { params: { operationId: string } }) {
  return stayPayment(request, params.operationId);
}
