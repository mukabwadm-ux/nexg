/**
 * GET /v1/experiences
 *
 * Returns upcoming events (experiences) in the system.
 *
 * The view filters to published events with future starts_at, so
 * no need to filter by date in the API. Sorted by starts_at ascending.
 */
import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase';
import { encodeCursor, decodeCursor, jsonError, parseQuery } from '@/lib/http';
import { PublicEvent, ListRequest, PageEnvelope } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const queryResult = parseQuery(ListRequest, url.searchParams);

  if (!queryResult.ok) {
    return queryResult.error;
  }

  const { cursor, limit: rawLimit, city, q } = queryResult.data;
  const limit = Math.min(Math.max(rawLimit, 1), 100);

  const supabase = createPublicClient();

  // Build the query — events are sorted by starts_at, then id
  let dbQuery = supabase
    .from('event_public')
    .select('id, city_id, name, category, venue_name, venue_address, starts_at, ends_at, doors_at, cover_path, featured, anchor_slot, organiser_name, organiser_url, ticket_url, ticket_bands, nexg_can_hold_tickets, practical_note, suggested_blocks')
    .order('starts_at', { ascending: true })
    .order('id', { ascending: false })
    .limit(limit + 1);

  // Apply cursor
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      dbQuery = dbQuery.gt('starts_at', decoded.sortValue).lt('id', decoded.id);
    }
  }

  // Apply filters
  if (city) {
    // Need city_id from city slug — join through city table
    const { data: cityRow } = await supabase
      .from('city')
      .select('id')
      .eq('slug', city)
      .maybeSingle();
    if (cityRow) {
      dbQuery = dbQuery.eq('city_id', cityRow.id);
    }
  }
  if (q) {
    const like = `%${q}%`;
    dbQuery = dbQuery.or(`name.ilike.${like},venue_name.ilike.${like}`);
  }

  const { data: rows, error } = await dbQuery;

  if (error) {
    console.error('experiences error:', error);
    return jsonError('internal_error', 'Failed to fetch experiences');
  }

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor(last.starts_at ?? '', last.id ?? '');
  }

  const response = {
    ok: true,
    data: {
      items: (items as any[]).map((item) => PublicEvent.parse(item)),
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