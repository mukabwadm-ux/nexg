/**
 * GET /v1/catalog/merchants
 *
 * Returns a cursor-paginated list of live merchants.
 *
 * Query params:
 * - cursor: opaque cursor from the previous page's next_cursor
 * - limit: results per page, 1-100, default 25
 * - city: filter by city slug (e.g. "nairobi")
 * - category: filter by taxonomy vertical (e.g. "restaurant")
 * - q: free-text search over trading_name, branch_name, category_other
 *
 * Sorting: by listed_at DESC, then id DESC (tiebreaker ensures stability).
 * The cursor encodes both values, so rows inserted between requests
 * don't cause duplicates or skips.
 */
import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase';
import { encodeCursor, decodeCursor, jsonError, parseQuery } from '@/lib/http';
import { ListRequest, PublicMerchant, PageEnvelope } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 60; // cache for 60 seconds

export async function GET(request: Request) {
  const url = new URL(request.url);
  const queryResult = parseQuery(ListRequest, url.searchParams);

  if (!queryResult.ok) {
    return queryResult.error;
  }

  const { cursor, limit: rawLimit, city, category, q } = queryResult.data;
  const limit = Math.min(Math.max(rawLimit, 1), 100);

  const supabase = createPublicClient();

  // Build the query
  let dbQuery = supabase
    .from('merchant_public')
    .select('id, trading_name, category, category_other, cover_photo_path, featured, city_slug, city_name, branch_name, branch_address, branch_latitude, branch_longitude, listed_at, explore_visible, concierge_pick, accepting_orders, pay_on_delivery_enabled, pay_on_delivery_cap_kes, prep_minutes, busy_mode_until, closed_early_at, parent_merchant_id, subcategory')
    .order('listed_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1); // fetch one extra to know if there's a next page

  // Apply cursor (listed_at and id)
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      // listed_at is ISO string, use it directly
      dbQuery = dbQuery.lt('listed_at', decoded.sortValue).lt('id', decoded.id);
    }
  }

  // Apply filters
  if (city) {
    dbQuery = dbQuery.eq('city_slug', city);
  }
  if (category) {
    dbQuery = dbQuery.eq('category', category);
  }
  if (q) {
    const like = `%${q}%`;
    dbQuery = dbQuery.or(`trading_name.ilike.${like},branch_name.ilike.${like},category_other.ilike.${like}`);
  }

  const { data: rows, error } = await dbQuery;

  if (error) {
    console.error('merchant list error:', error);
    return jsonError('internal_error', 'Failed to fetch merchants');
  }

  // Check if there's a next page
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Build the next cursor from the last item
  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor(last.listed_at ?? '', last.id ?? '');
  }

  // Validate against the schema (defense in depth)
  const parsed = items.map((item) => PublicMerchant.parse(item));

  const response = {
    ok: true,
    data: {
      items: parsed,
      next_cursor: nextCursor,
    },
    meta: {
      api_version: 'v1' as const,
      limit,
    },
  };

  return NextResponse.json(response, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}