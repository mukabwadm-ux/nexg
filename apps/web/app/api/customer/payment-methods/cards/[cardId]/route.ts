import { removeCard } from '@/lib/customer-cards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function DELETE(request: Request, { params }: { params: { cardId: string } }) {
  return removeCard(request, params.cardId);
}
