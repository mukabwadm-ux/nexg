/**
 * GET /v1/catalog/items
 *
 * Every item of the key's merchant, sold-out ones included, in menu order.
 * The public catalogue (GET /v1/catalog/merchants/{id}) leaves sold-out
 * items out, and a till that switches an item off has to find it again to
 * switch it back on. Each item has the public catalogue's shape, so one
 * parser reads both.
 *
 * The key decides the merchant (`rpc_catalogue_items_api`): no request can
 * name another one. A key with catalogue_write spends one token; a key with
 * only merchant_read spends three, as an order read does.
 *
 * PATCH /v1/catalog/items
 *
 * Up to 100 changes in one call, each naming its item by id: a price, whether
 * it is on sale, or both. All or nothing (`rpc_catalogue_items_update_api`):
 * ids the merchant does not have come back together as a 404 and nothing is
 * saved. Each item goes through the one-item change, so the rules, the
 * test-key behaviour and the audit are the same. One token per call.
 */
import { NextResponse } from 'next/server';

import { jsonError, withErrorEnvelope } from '@/lib/http';
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { privateHeaders } from '@/lib/cache';
import {
  BULK_LIMIT,
  CATALOGUE_FUNCTIONS,
  CatalogueItemsChange,
  catalogueClient,
} from '@/lib/catalogue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withErrorEnvelope(async (request: Request) => {
  let credential;
  let rate;
  try {
    credential = await authenticate(request);
    const writes = credential.scopes.includes(API_SCOPES.catalogue_write);
    if (!writes && !credential.scopes.includes(API_SCOPES.merchant_read)) {
      throw new ApiAuthError('This credential does not have the scope for that.', 'not_found', 403);
    }
    rate = await enforceRateLimit(
      credential,
      request,
      writes ? 'catalogue_write' : 'merchant_read',
    );
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return jsonError(e.code, e.message, { status: e.status, retryAfter: e.retryAfter });
    }
    return jsonError('internal_error', 'Something went wrong on our side.', { status: 500 });
  }

  if (credential.merchantId === null) {
    return jsonError(
      'not_found',
      'This key is not bound to a merchant, so it has no catalogue to read.',
      { status: 403 },
    );
  }

  const { data, error } = await catalogueClient().rpc(CATALOGUE_FUNCTIONS.list, {
    p_api_key: credential.rawKey,
  });

  if (error) {
    if (error.code === '42501') {
      const keyRefused = error.message.startsWith('That API key is not valid');
      return jsonError('not_found', error.message, { status: keyRefused ? 401 : 403 });
    }
    return jsonError('internal_error', 'The catalogue could not be read.', { detail: error });
  }

  const result = (Array.isArray(data) ? data[0] : data) as {
    ok?: boolean;
    items?: unknown;
  } | null;
  if (result?.ok !== true || !Array.isArray(result.items)) {
    return jsonError('internal_error', 'The catalogue could not be read.', { detail: result });
  }

  return NextResponse.json(
    { ok: true, data: { items: result.items }, meta: { api_version: 'v1' as const } },
    { headers: privateHeaders(rate, credential) },
  );
});

const BULK_HELP = `Send items: a list of 1 to ${BULK_LIMIT} changes, each with the item's id and price_kes (whole shillings, 1 to 1,000,000), available (true or false), or both.`;

export const PATCH = withErrorEnvelope(async (request: Request) => {
  let credential;
  let rate;
  try {
    credential = await authenticate(request);
    requireScope(credential, API_SCOPES.catalogue_write);
    rate = await enforceRateLimit(credential, request, 'catalogue_write');
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return jsonError(e.code, e.message, { status: e.status, retryAfter: e.retryAfter });
    }
    return jsonError('internal_error', 'Something went wrong on our side.', { status: 500 });
  }

  if (credential.merchantId === null) {
    return jsonError(
      'not_found',
      'This key is not bound to a merchant, so it has no catalogue to change.',
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('invalid_request', 'The body must be a JSON object.', {
      fields: { body: BULK_HELP },
    });
  }

  const change = CatalogueItemsChange.safeParse(body);
  if (!change.success) {
    const fields: Record<string, string> = {};
    for (const issue of change.error.issues) {
      if (issue.code === 'unrecognized_keys') {
        const at = issue.path.join('.');
        for (const key of issue.keys) {
          fields[at ? `${at}.${key}` : key] = at
            ? 'Not a field an item takes: only id, price_kes and available.'
            : 'Not a field this endpoint takes: only items.';
        }
      } else {
        fields[issue.path.join('.') || 'body'] = issue.message;
      }
    }
    return jsonError('invalid_request', BULK_HELP, { fields });
  }

  const { data, error } = await catalogueClient().rpc(CATALOGUE_FUNCTIONS.bulk, {
    p_api_key: credential.rawKey,
    p_items: change.data.items,
  });

  if (error) {
    // 22023: a change the database refused; the message says which rule.
    if (error.code === '22023') return jsonError('invalid_request', error.message);
    // 42501: refused (the key or its scope).
    if (error.code === '42501') {
      const keyRefused = error.message.startsWith('That API key is not valid');
      return jsonError('not_found', error.message, { status: keyRefused ? 401 : 403 });
    }
    return jsonError('internal_error', 'The items could not be updated.', { detail: error });
  }

  const result = (Array.isArray(data) ? data[0] : data) as {
    ok?: boolean;
    applied?: unknown;
    items?: unknown;
    missing?: { index: number; id: string }[];
  } | null;

  if (result?.ok === false && Array.isArray(result.missing) && result.missing.length > 0) {
    const fields: Record<string, string> = {};
    for (const { index } of result.missing) {
      fields[`items.${index}.id`] = 'Your merchant has no item with this id.';
    }
    const count = result.missing.length;
    return jsonError(
      'not_found',
      `Your merchant has no item with ${count === 1 ? 'one of these ids' : `${count} of these ids`}, so nothing was changed. error.fields names each one.`,
      { fields },
    );
  }

  if (result?.ok !== true || typeof result.applied !== 'boolean' || !Array.isArray(result.items)) {
    return jsonError('internal_error', 'The items could not be read back.', { detail: result });
  }

  return NextResponse.json(
    {
      ok: true,
      data: { items: result.items, applied: result.applied },
      meta: { api_version: 'v1' as const },
    },
    { headers: privateHeaders(rate, credential) },
  );
});
