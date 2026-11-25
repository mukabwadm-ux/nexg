import { holdPay } from '@/lib/cinema/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request, { params }: { params: { holdId: string } }) {
  return holdPay(request, params.holdId);
}
