/**
 * HTTP response helpers for the API.
 *
 * Consistent response shapes: `jsonOk` for success, `jsonError` for failures.
 */
import { NextResponse } from 'next/server';
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
 * An error response.
 *
 * Uses the closed set of error codes from `@nexg/contracts/api`.
 * The `code` is what a client branches on; `message` is what a person reads.
 */
export function jsonError(
  code: ErrorCode,
  message: string,
  options?: {
    status?: number;
    fields?: Record<string, string>;
  },
) {
  const { status = 400, fields } = options ?? {};

  const error: ApiError = {
    ok: false,
    error: {
      code,
      message,
      ...(fields ? { fields } : {}),
    },
    meta: { api_version: 'v1' },
  };

  return NextResponse.json(error, { status });
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
export function parseQuery<T>(
  schema: z.ZodType<T>,
  params: URLSearchParams,
): { ok: true; data: T } | { ok: false; error: ReturnType<typeof jsonError> } {
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