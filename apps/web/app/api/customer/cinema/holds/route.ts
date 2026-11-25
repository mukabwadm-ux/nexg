import { holdsGet, holdsPost } from '@/lib/cinema/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* The customer's own holds and bookings, newest first (contract v3, step 4b). */
export function GET(request: Request) {
  return holdsGet(request);
}

export const POST = holdsPost;
