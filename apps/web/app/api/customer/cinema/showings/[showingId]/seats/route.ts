import { seatsGet } from '@/lib/cinema/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: { params: { showingId: string } }) {
  return seatsGet(request, params.showingId);
}
