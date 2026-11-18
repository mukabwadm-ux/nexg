/**
 * PATCH /v1/catalog/items/[id]
 *
 * Change one of the merchant's catalogue items: its price (`price_kes`),
 * whether it is on sale (`available`), or both. This is how a merchant's
 * own till or ERP keeps NexG in step.
 *
 * The database holds every rule (`rpc_catalogue_item_update_api`): a key
 * with catalogue_write, bound to a merchant; the key decides the merchant,
 * so another merchant's item answers like one that does not exist; whole
 * shillings from 1 to 1,000,000, as the merchant console allows. A live key
 * saves the change, live for the next order, and audits it. A test key
 * saves nothing and answers with the item as the change would leave it.
 */
import { NextResponse } from 'next/server';

import { jsonError, withErrorEnvelope } from '@/lib/http';
import { authenticate, enforceRateLimit, requireScope, API_SCOPES, ApiAuthError } from '@/lib/auth';
import { privateHeaders } from '@/lib/cache';
import { CATALOGUE_FUNCTIONS, CatalogueItemChange, catalogueClient } from '@/lib/catalogue';
import { Uuid } from '@nexg/contracts/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The database refusals a caller can act on, and everything else as a 500. */
function updateError(error: { message: string; code?: string }) {
  // P0002: no item with that id for this key's merchant.
  if (error.code === 'P0002') return jsonError('not_found', 'Item not found');
  // 22023: the change itself is wrong; the message says how.
  if (error.code === '22023') return jsonError('invalid_request', error.message);
  // 42501: refused (the key or its scope).
  if (error.code === '42501') {
    const keyRefused = error.message.startsWith('That API key is not valid');
    return jsonError('not_found', error.message, { status: keyRefused ? 401 : 403 });
  }
  return jsonError('internal_error', 'The item could not be updated.', { detail: error });
}

export const PATCH = withErrorEnvelope(
  async (request: Request, { params }: { params: { id: string } }) => {
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

    if (!Uuid.safeParse(params.id).success) {
      return jsonError('invalid_request', 'Invalid item ID', {
        fields: { id: 'An item id is a UUID: the id from GET /v1/catalog/items.' },
      });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError('invalid_request', 'The body must be a JSON object.', {
        fields: { body: 'Send price_kes, available, or both, as JSON.' },
      });
    }

    const change = CatalogueItemChange.safeParse(body);
    if (!change.success) {
      const fields: Record<string, string> = {};
      for (const issue of change.error.issues) {
        if (issue.code === 'unrecognized_keys') {
          for (const key of issue.keys) {
            fields[key] =
              'Not a field this endpoint takes: only price_kes and available change here.';
          }
        } else {
          fields[issue.path.join('.') || 'body'] = issue.message;
        }
      }
      return jsonError(
        'invalid_request',
        'Send price_kes (whole shillings, 1 to 1,000,000), available (true or false), or both.',
        { fields },
      );
    }

    const { data, error } = await catalogueClient().rpc(CATALOGUE_FUNCTIONS.update, {
      p_api_key: credential.rawKey,
      p_item_id: params.id,
      p_changes: change.data,
    });
    if (error) return updateError(error);

    const result = (Array.isArray(data) ? data[0] : data) as {
      ok?: boolean;
      applied?: unknown;
      item?: unknown;
    } | null;
    if (result?.ok !== true || typeof result.applied !== 'boolean' || !result.item) {
      return jsonError('internal_error', 'The item could not be read back.', { detail: result });
    }

    return NextResponse.json(
      {
        ok: true,
        data: { item: result.item, applied: result.applied },
        meta: { api_version: 'v1' as const },
      },
      { headers: privateHeaders(rate, credential) },
    );
  },
);
