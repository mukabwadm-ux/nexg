import { stayStatus } from '@/lib/booking/native-stay-checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: { params: { operationId: string } }) {
  return stayStatus(request, params.operationId);
}
