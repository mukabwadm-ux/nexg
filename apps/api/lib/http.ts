/**
 * HTTP response helpers for the API.
 *
 * Consistent response shapes: `jsonOk` for success, `jsonError` for failures.
 */
import { NextResponse } from 'next/server';
import type { ApiError } from '@nexg/contracts/api';
import { ERROR_CODES } from '@nexg/contracts/api';

/**
 * A successful response with a JSON body.
 */
export function jsonOk<T>(
  data: T,
  options?: {
    status?: number;
    cache?: string; // Cache-Control header
    cursor?: string | null;
    limit?: number;
  },
) {
  const { status = 200, cache, cursor, limit } = options ?? {};

  const headers: Record<string, string> = {};
  if (cache) headers['Cache-Control'] = cache;

  return NextResponse.json({ ok: true, data, meta: { cursor, limit } } as any, {
    status,
    headers,
  });
}

/**
 * An error response.
 *
 * Uses the closed set of error codes from `@nexg/contracts/api`.
 * The `code` is what a client branches on; `message` is what a person reads.
 */
export function jsonError(
  code: keyof typeof ERROR_CODES,
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
export function parseQuery<T>(
  schema: { parse: (x: unknown) => T },
  params: Record<string, string | string[] | undefined>,
): { ok: true; data: T } | { ok: false; error: ReturnType<typeof jsonError> } {
  // Flatten multi-value params to strings or undefined
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) flat[key] = value[0];
    else if (typeof value === 'string') flat[key] = value;
    else flat[key] = undefined;
  }

  try {
    const data = schema.parse(flat);
    return { ok: true, data };
  } catch (e: any) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues ?? []) {
      const path = issue.path.join('.') || '_';
      if (!(path in fields)) fields[path] = issue.message;
    }
    return {
      ok: false,
      error: jsonError('invalid_request', e.message ?? ERROR_CODES.invalid_request, {
        fields,
      }),
    };
  }
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
    const parts = decoded.split('|');
    if (parts.length !== 2) return null;
    return { sortValue: parts[0], id: parts[1] };
  } catch {
    return null;
  }
}