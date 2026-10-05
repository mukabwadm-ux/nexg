import { NextResponse } from 'next/server';

import { normaliseCode, qrPng, qrSvg } from '@/lib/qr';

/**
 * The card image.
 *
 *   /api/qr/NXG-4B7K2Q        → SVG, which is what the card layout uses
 *   /api/qr/NXG-4B7K2Q?png    → PNG at 1200 px, for anything that cannot
 *
 * Deliberately does not check that the code exists. The image is a
 * rendering of a string, not an assertion that the string belongs to
 * anybody — and making this route hit the database would turn every
 * card in a 180-room print run into a query. Whether a code resolves
 * is `/q/[code]`'s question.
 */
export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: { code: string } }) {
  const code = normaliseCode(params.code);

  if (!code) {
    return NextResponse.json({ error: 'Not a NexG code.' }, { status: 400 });
  }

  const url = new URL(request.url);
  const wantsPng = url.searchParams.has('png');
  /* Clamp only what was actually asked for. Clamping an absent
     parameter up to the minimum made 128 the default, which is too
     small to scan from across a room — the bug this comment exists
     to stop coming back. */
  const asked = Number(url.searchParams.get('size'));
  const size = Number.isFinite(asked) && asked > 0 ? Math.min(Math.max(asked, 128), 2048) : null;

  /* Immutable: a given code always draws the same square, so this can
     sit in a CDN until the heat death of the print run. */
  const cache = 'public, max-age=31536000, immutable';

  if (wantsPng) {
    const png = await qrPng(code, size ?? 1200);
    return new NextResponse(new Uint8Array(png), {
      headers: { 'content-type': 'image/png', 'cache-control': cache },
    });
  }

  const svg = await qrSvg(code, { size: size ?? 512 });
  return new NextResponse(svg, {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': cache },
  });
}
