import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Purge the public cache when something behind it actually changes.
 *
 * The public pages are cached for an hour rather than a minute, because a
 * short window on a low-traffic site is the worst of both: almost every
 * visitor arrives just after it expired and waits for the page to be rebuilt.
 * A long window plus this endpoint gives instant pages and instant freshness.
 *
 * Call it when a merchant goes live, is featured, or is suspended:
 *
 *   curl -X POST "$SITE/api/revalidate?secret=…&tag=merchants"
 *
 * Without REVALIDATE_SECRET set the route refuses everything — an open cache
 * purge is a free way to make a site slow.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'REVALIDATE_SECRET is not configured.' },
      { status: 503 },
    );
  }

  if (request.nextUrl.searchParams.get('secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'Bad secret.' }, { status: 401 });
  }

  const tag = request.nextUrl.searchParams.get('tag');
  const path = request.nextUrl.searchParams.get('path');

  if (tag) revalidateTag(tag);
  if (path) revalidatePath(path);

  if (!tag && !path) {
    // The public surfaces that read merchant data.
    revalidateTag('merchants');
    for (const p of ['/', '/explore', '/merchants', '/riders']) revalidatePath(p);
  }

  return NextResponse.json({ ok: true, tag, path, at: new Date().toISOString() });
}
