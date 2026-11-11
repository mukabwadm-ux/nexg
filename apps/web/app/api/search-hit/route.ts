import { NextResponse } from 'next/server';

import { POPULAR_SEARCH_IDS } from '@/lib/popular-searches';
import { createPublicClient } from '@/lib/supabase/public';

/**
 * One hero search, counted against its topic so the most searched topics
 * become the "Popular searches" buttons.
 *
 * The browser matches the search to a topic and sends only the topic: the
 * words typed never leave it. Only a known topic is counted, and nothing about
 * the visitor is stored. Always answers 204, so a failure here never
 * surfaces to the visitor.
 */
export async function POST(request: Request) {
  let topic: unknown;
  try {
    topic = ((await request.json()) as { topic?: unknown }).topic;
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (typeof topic === 'string' && POPULAR_SEARCH_IDS.includes(topic)) {
    const { error } = await createPublicClient().rpc('rpc_popular_search_hit', { p_topic: topic });
    if (error) console.warn('[search-hit] not counted', error.message);
  }
  return new NextResponse(null, { status: 204 });
}
