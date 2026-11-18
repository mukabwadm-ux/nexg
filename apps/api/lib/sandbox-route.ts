import { jsonError } from './http';
import {
  authenticate,
  enforceRateLimit,
  requireScope,
  API_SCOPES,
  ApiAuthError,
  type ApiCredential,
  type RateLimitResult,
} from './auth';
import { Uuid } from '@nexg/contracts/api';

/**
 * The checks every sandbox route makes before the database is asked: a key
 * with merchant_write, a test key, bound to a merchant, and an order id that
 * is a UUID. The database checks the key again and decides the merchant.
 */
export async function sandboxCaller(
  request: Request,
  orderId: string,
): Promise<
  { ok: true; credential: ApiCredential; rate: RateLimitResult } | { ok: false; response: Response }
> {
  let credential: ApiCredential;
  let rate: RateLimitResult;
  try {
    credential = await authenticate(request);
    requireScope(credential, API_SCOPES.merchant_write);
    rate = await enforceRateLimit(credential, request, 'merchant_write');
  } catch (e) {
    if (e instanceof ApiAuthError) {
      return {
        ok: false,
        response: jsonError(e.code, e.message, { status: e.status, retryAfter: e.retryAfter }),
      };
    }
    return {
      ok: false,
      response: jsonError('internal_error', 'Something went wrong on our side.', { status: 500 }),
    };
  }

  if (credential.environment !== 'test') {
    return {
      ok: false,
      response: jsonError(
        'not_found',
        'Only a test key (nexg_test_…) moves bookings. Real bookings move as the merchant and NexG work on them.',
        { status: 403 },
      ),
    };
  }

  if (credential.merchantId === null) {
    return {
      ok: false,
      response: jsonError(
        'not_found',
        'This key is not bound to a merchant, so it has no test bookings to move.',
        { status: 403 },
      ),
    };
  }

  if (!Uuid.safeParse(orderId).success) {
    return {
      ok: false,
      response: jsonError('invalid_request', 'Invalid order ID', {
        fields: { id: 'An order id is a UUID: the order_id of a test booking.' },
      }),
    };
  }

  return { ok: true, credential, rate };
}

/** The database refusals a caller can act on, and everything else as a 500. */
export function sandboxError(error: { message: string; code?: string }, failure: string) {
  // P0002: no test booking with that id for this key's merchant.
  if (error.code === 'P0002') return jsonError('not_found', 'Order not found');
  // 22023: the booking cannot do that; the message says why.
  if (error.code === '22023') return jsonError('invalid_request', error.message);
  // 42501: refused (the key, its kind or its scope).
  if (error.code === '42501') {
    const keyRefused = error.message.startsWith('That API key is not valid');
    return jsonError('not_found', error.message, { status: keyRefused ? 401 : 403 });
  }
  return jsonError('internal_error', failure, { detail: error });
}
