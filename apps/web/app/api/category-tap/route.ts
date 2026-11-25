import { NextResponse } from 'next/server';

import { countedCategory } from '@/lib/categories';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * One visit to a category, or one search that led to it, so Popular
 * categories can follow what people want (lib/category-signal).
 *
 * Only a known category is counted, under its current id. Visits go to the
 * daily per-key tap counter (rpc_category_tile_click) and searches to the
 * daily per-topic search counter (rpc_popular_search_hit); neither stores
 * anything about the visitor. Always answers 204, so a failure here never
 * surfaces to the visitor.
 */
export async function POST(request: Request) {
  let body: { category?: unknown; kind?: unknown; tile?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  /* `tile` is what a page cached before 2026-11-25 still sends. */
  const key = typeof body.category === 'string' ? body.category : body.tile;
  const category = typeof key === 'string' ? countedCategory(key) : undefined;
  if (category) {
    const supabase = createPublicClient();
    const { error } =
      body.kind === 'search'
        ? await supabase.rpc('rpc_popular_search_hit', { p_topic: category })
        : await supabase.rpc('rpc_category_tile_click', { p_tile: category });
    if (error) console.warn('[category-tap] not counted', error.message);
  }
  return new NextResponse(null, { status: 204 });
}
