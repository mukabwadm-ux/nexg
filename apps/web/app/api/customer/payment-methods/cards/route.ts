import { listCards } from '@/lib/customer-cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return listCards(request);
}
