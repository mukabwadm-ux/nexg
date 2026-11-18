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
 */
import { NextResponse } from 'next/server';

import { jsonError, withErrorEnvelope } from '@/lib/http';
import { authenticate, enforceRateLimit, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { privateHeaders } from '@/lib/cache';
import { CATALOGUE_FUNCTIONS, catalogueClient } from '@/lib/catalogue';

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
