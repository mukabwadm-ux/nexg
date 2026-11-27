import { NextResponse } from 'next/server';

/**
 * "A person is still working here." The idle timer calls this, at most once
 * a minute, only after real activity on the page: typing, clicking,
 * scrolling. The handler does nothing; the middleware in front of it
 * refreshes the staff last-seen stamp, as it does for every request.
 *
 * Without it, filling in a long form sent no request to the server, so
 * five minutes of typing read as five idle minutes, and the save that
 * followed was turned away at the sign-in page and lost. An unattended
 * tab still makes no calls, so it still signs out on time.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
