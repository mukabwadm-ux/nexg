import { holdDelete, holdGet } from '@/lib/cinema/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request, { params }: { params: { holdId: string } }) {
  return holdGet(request, params.holdId);
}

export function DELETE(request: Request, { params }: { params: { holdId: string } }) {
  return holdDelete(request, params.holdId);
}
