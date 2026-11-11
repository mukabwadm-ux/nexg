/**
 * HTTP response helpers for the API.
 *
 * Consistent response shapes: `jsonOk` for success, `jsonError` for failures.
 */
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { parse } from '@nexg/contracts';
import type { ApiError } from '@nexg/contracts/api';
import type { ErrorCode } from '@nexg/contracts/api';

/**
 * A successful response with a JSON body.
 */
export function jsonOk<T>(
  data: T,
  options?: {
    status?: number;
    cache?: string;
    cursor?: string | null;
    limit?: number;
  },
) {
  const { status = 200, cache, cursor, limit } = options ?? {};

  const headers: Record<string, string> = {};
  if (cache) headers['Cache-Control'] = cache;

  return NextResponse.json(
    {
      ok: true as const,
      data,
      meta: { api_version: 'v1' as const, cursor: cursor ?? null, limit: limit ?? null },
    },
    { status, headers },
  );
}

/**
 * The HTTP status each error code answers with when the caller does not
 * choose one. It used to be 400 for everything, which sent an unknown
 * merchant back as 400 rather than 404 and database failures as 400
 * rather than 500. Credential failures still pass 401 or 403 explicitly.
 */
const DEFAULT_STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  not_found: 404,
  method_not_allowed: 405,
  rate_limited: 429,
  internal_error: 500,
};

/**
 * An error response.
 *
 * Uses the closed set of error codes from `@nexg/contracts/api`.
 * The `code` is what a client branches on; `message` is what a person reads.
 *
 * Every error carries an `X-Request-Id`. For server errors (5xx) the id is
 * also written to the log with the message, so an id a developer quotes
 * can be found again.
 */
export function jsonError(
  code: ErrorCode,
  message: string,
  options?: {
    status?: number;
    fields?: Record<string, string>;
    retryAfter?: number;
    /** Use this id instead of a new one (when it has already been logged). */
    requestId?: string;
    /** Set false when the caller has already logged this failure. */
    log?: boolean;
    /** What went wrong underneath (a database error, say): logged, never sent. */
    detail?: unknown;
  },
) {
  const {
    status = DEFAULT_STATUS[code],
    fields,
    retryAfter,
    requestId = randomUUID(),
    log = true,
    detail,
  } = options ?? {};

  if (status >= 500 && log) {
    console.error(`[api] ${requestId} ${status} ${code}: ${message}`, ...(detail ? [detail] : []));
  }

  const error: ApiError = {
    ok: false,
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
    },
    meta: { api_version: 'v1' },
  };

  return NextResponse.json(error, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Request-Id': requestId,
      ...(retryAfter !== undefined
        ? { 'Retry-After': String(Math.max(1, Math.ceil(retryAfter))) }
        : {}),
    },
  });
}

/**
 * Wrap a route handler so that anything it throws still answers with the
 * JSON error envelope. Without it, a throw (a response that failed its
 * schema check, say) reached Next.js, which answers a bare 500 with no
 * body a client can read and no id anyone can trace.
 */
export function withErrorEnvelope<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (thrown) {
      const requestId = randomUUID();
      console.error(`[api] ${requestId} 500 internal_error: unhandled`, thrown);
      return jsonError('internal_error', 'Something went wrong on our side.', {
        status: 500,
        requestId,
        log: false,
      });
    }
  };
}

/** The answer to a query string that names a cursor this API did not issue. */
export function invalidCursor() {
  return jsonError('invalid_request', 'That cursor was not issued by this endpoint.', {
    fields: { cursor: 'Pass back the next_cursor from the previous page, unchanged.' },
  });
}

/**
 * A value for a PostgREST logic tree (`or=(…)`), in double quotes so that
 * commas, dots and parentheses inside it are read as text rather than as
 * the filter's own punctuation. Quotes and backslashes cannot be escaped
 * reliably there, so they are taken out.
 */
export function filterValue(value: string): string {
  return `"${value.replace(/["\\]/g, ' ')}"`;
}

/**
 * Parse and validate query parameters against a Zod schema.
 *
 * Returns the parsed data or a NextResponse with a 400 error.
 */
/**
 * Parse and validate query parameters against a Zod schema.
 *
 * Takes `URLSearchParams` directly rather than a plain object, because
 * that is what a request actually has, and turning it into an object
 * first loses the difference between a parameter that was absent and one
 * that was present and empty. A schema that wants to tell those apart
 * cannot, once the object is built.
 */
export function parseQuery<S extends z.ZodTypeAny>(
  schema: S,
  params: URLSearchParams,
): { ok: true; data: z.output<S> } | { ok: false; error: ReturnType<typeof jsonError> } {
  const flat: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    /*
     * A repeated parameter is a list, and a schema that wants a list
     * says so with an array. Until it does, the first one wins: a
     * client sending `?city=nairobi&city=mombasa` gets one answer
     * rather than a silent join of two.
     */
    if (!(key in flat)) flat[key] = value;
  }

  const result = parse(schema, flat);

  if (result.ok) return { ok: true, data: result.data };

  return {
    ok: false,
    error: jsonError('invalid_request', result.failure.message, {
      fields: result.failure.fields,
    }),
  };
}
/**
 * Encode a cursor from a sort value and ID.
 *
 * Cursor is base64url of `${sortValue}|${id}` — opaque to clients,
 * stable across requests (as long as the sort column doesn't change).
 */
export function encodeCursor(sortValue: string | number, id: string): string {
  return Buffer.from(`${sortValue}|${id}`).toString('base64url');
}

/**
 * Decode a cursor to its components.
 *
 * Returns null if the cursor is invalid (wrong format, not base64url).
 */
export function decodeCursor(cursor: string): { sortValue: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    /*
     * A cursor that has no separator is not a cursor we issued. It is
     * refused rather than guessed at, because a guess here would put
     * the page boundary somewhere arbitrary and quietly skip rows.
     */
    if (separator <= 0) return null;
    const id = decoded.slice(separator + 1);
    if (!id) return null;
    return { sortValue: decoded.slice(0, separator), id };
  } catch {
    return null;
  }
}

/** A timestamp as PostgREST writes one: `2026-10-21T08:15:00.123456+00:00`. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A keyset cursor (a row's time and its id) this API issued, or null.
 *
 * Both halves are checked before they go anywhere near a query: they are
 * written into a PostgREST filter, so only a timestamp and a UUID, which
 * cannot contain the filter's punctuation, are let through.
 */
export function decodeKeysetCursor(cursor: string): { at: string; id: string } | null {
  const decoded = decodeCursor(cursor);
  if (!decoded || !TIMESTAMP.test(decoded.sortValue) || !UUID.test(decoded.id)) return null;
  return { at: decoded.sortValue, id: decoded.id };
}

/**
 * The PostgREST `or` filter for "rows after this one" in a list sorted by a
 * time column and then by id descending.
 *
 * Both columns are compared together: (time, id) past the cursor's row.
 * Comparing them separately (`time < t AND id < i`) drops every row with
 * an earlier time but a larger id, which with random UUIDs is about half of
 * them on every page.
 */
export function keysetAfter(
  column: string,
  direction: 'asc' | 'desc',
  cursor: { at: string; id: string },
): string {
  const past = direction === 'desc' ? 'lt' : 'gt';
  return `${column}.${past}.${cursor.at},and(${column}.eq.${cursor.at},id.lt.${cursor.id})`;
}
