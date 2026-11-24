import { stayPaymentById } from '@/lib/booking/native-stay-checkout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The website's stay checkout pays a held stay by its id; the apps use
   /stays/holds/{operationId}/payment. Both run the same payment code. */
export function POST(request: Request, { params }: { params: { stayId: string } }) {
  return stayPaymentById(request, params.stayId);
}
