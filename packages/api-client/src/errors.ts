/**
 * What the client throws.
 *
 * NexgApiError: NexG answered, and the answer was an error. `code` is what a
 * program branches on (the API's closed set, such as `invalid_request` or
 * `rate_limited`); `message` is what a person reads; `fields` names each
 * field that was refused, as `items.3.price_kes`.
 *
 * NexgConnectionError: no answer at all (a network failure or the timeout),
 * after the retries the client was allowed.
 */

export class NexgApiError extends Error {
  override readonly name = 'NexgApiError';

  constructor(
    message: string,
    /** The HTTP status. */
    readonly status: number,
    /** The API's error code, such as `invalid_request`, `not_found` or `rate_limited`. */
    readonly code: string,
    /** Each refused field, by its path in the request, with what was wrong with it. */
    readonly fields: Record<string, string> | undefined,
    /** The X-Request-Id NexG gave the answer. Quote it when you report a problem. */
    readonly requestId: string | null,
    /** Seconds to wait before trying again, from Retry-After, when NexG sent one. */
    readonly retryAfter: number | null,
  ) {
    super(message);
  }
}

export class NexgConnectionError extends Error {
  override readonly name = 'NexgConnectionError';

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

/** Why an order event was refused. */
export type WebhookFailure =
  | 'missing_signature'
  | 'malformed_signature'
  | 'expired'
  | 'mismatch'
  | 'not_json';

export class NexgWebhookError extends Error {
  override readonly name = 'NexgWebhookError';

  constructor(
    message: string,
    readonly reason: WebhookFailure,
  ) {
    super(message);
  }
}
