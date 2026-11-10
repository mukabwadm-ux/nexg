import { NextResponse } from 'next/server';

import { TILE_IDS } from '@/lib/categories';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * One tap on a homepage category tile, so the most tapped tiles come first.
 *
 * Only a known tile name is counted, and nothing about the visitor is stored:
 * the database keeps a count per tile per day. Always answers 204, so a
 * failure here never surfaces to the visitor.
 */
export async function POST(request: Request) {
  let tile: unknown;
  try {
    tile = ((await request.json()) as { tile?: unknown }).tile;
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (typeof tile === 'string' && TILE_IDS.includes(tile)) {
    const { error } = await createPublicClient().rpc('rpc_category_tile_click', { p_tile: tile });
    if (error) console.warn('[category-tap] not counted', error.message);
  }
  return new NextResponse(null, { status: 204 });
}
