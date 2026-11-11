/**
 * GET /v1/experiences
 *
 * Returns upcoming events (experiences) in the system.
 *
 * The view filters to published events with future starts_at, so
 * no need to filter by date in the API. Sorted by starts_at ascending,
 * then id descending; the cursor marks the last (starts_at, id) returned.
 */
import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase';
import {
  decodeKeysetCursor,
  encodeCursor,
  filterValue,
  invalidCursor,
  jsonError,
  keysetAfter,
  parseQuery,
  withErrorEnvelope,
} from '@/lib/http';
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { readHeaders } from '@/lib/cache';
import { PublicEvent, ListRequest } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 60;

const CACHE = 'public, s-maxage=60, stale-while-revalidate=300';

function page(
  items: PublicEvent[],
  nextCursor: string | null,
  limit: number,
  headers: Record<string, string>,
) {
  return NextResponse.json(
    {
      ok: true,
      data: { items, next_cursor: nextCursor },
      meta: { api_version: 'v1' as const, limit },
    },
    { headers },
  );
}

export const GET = withErrorEnvelope(async (request: Request) => {
  // Resolve the credential first: a bad key is refused before any work is done.
  let credential;
  let rate;
  try {
    credential = await authenticate(request);
    requireScope(credential, API_SCOPES.public_read);
    rate = await enforceRateLimit(credential, request);
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return jsonError(e.code, e.message, { status: e.status, retryAfter: e.retryAfter });
    }
    return jsonError('internal_error', 'Something went wrong on our side.', { status: 500 });
  }
  const url = new URL(request.url);
  const queryResult = parseQuery(ListRequest, url.searchParams);

  if (!queryResult.ok) {
    return queryResult.error;
  }

  const { cursor, limit, city, q } = queryResult.data;

  const after = cursor ? decodeKeysetCursor(cursor) : null;
  if (cursor && !after) return invalidCursor();

  const supabase = createPublicClient();

  // Events are sorted by starts_at, then id
  let dbQuery = supabase
    .from('event_public')
    .select(
      'id, city_id, name, category, venue_name, venue_address, starts_at, ends_at, doors_at, cover_path, featured, anchor_slot, organiser_name, organiser_url, ticket_url, ticket_bands, nexg_can_hold_tickets, practical_note, suggested_blocks',
    )
    .order('starts_at', { ascending: true })
    .order('id', { ascending: false })
    .limit(limit + 1);

  // Start strictly after the cursor's (starts_at, id).
  if (after) {
    dbQuery = dbQuery.or(keysetAfter('starts_at', 'asc', after));
  }

  if (city) {
    // The view has the city's id, not its slug.
    const { data: cityRow, error: cityError } = await supabase
      .from('city')
      .select('id')
      .eq('slug', city)
      .maybeSingle();
    if (cityError) {
      return jsonError('internal_error', 'Failed to fetch experiences', { detail: cityError });
    }
    // No such city has no events, rather than every city's events.
    if (!cityRow) return page([], null, limit, readHeaders(credential, CACHE, rate));
    dbQuery = dbQuery.eq('city_id', cityRow.id);
  }
  if (q) {
    // Quoted, so a comma or a parenthesis in the search is text, not filter syntax.
    const like = filterValue(`%${q}%`);
    dbQuery = dbQuery.or(`name.ilike.${like},venue_name.ilike.${like}`);
  }

  const { data: rows, error } = await dbQuery;

  if (error) {
    return jsonError('internal_error', 'Failed to fetch experiences', { detail: error });
  }

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  const last = pageRows[pageRows.length - 1];
  if (hasMore && last) {
    nextCursor = encodeCursor(last.starts_at ?? '', last.id ?? '');
  }

  /*
   * Ticket bands and suggested blocks are entered by hand in the
   * experiences console. One event with a band the schema cannot read is
   * left out and logged, rather than failing the whole list for everyone.
   */
  const items = (pageRows as Array<Record<string, unknown>>).flatMap((row) => {
    const parsed = PublicEvent.safeParse(row);
    if (parsed.success) return [parsed.data];
    console.error(`[api] experiences: event ${String(row.id)} left out`, parsed.error.issues);
    return [];
  });

  return page(items, nextCursor, limit, readHeaders(credential, CACHE, rate));
});
